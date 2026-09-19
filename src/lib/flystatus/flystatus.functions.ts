import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertOwnsTenant } from "@/lib/server/plan-guard";
import { buscarImagem, MOTIVO_LEGIVEL, paraBase64 } from "./mediaGuard";
import { montarMensagem, normalizarTelefone, type FlyStatusKind } from "./mensagem";
import { escolherAparelho, type AparelhoDeEnvio } from "./aparelho";

/**
 * Manda a atualização do pedido para o cliente pelo WhatsApp.
 *
 * POR QUE ISTO É UMA FUNÇÃO DE SERVIDOR, E NÃO ALGO FEITO NO NAVEGADOR
 *
 * O navegador só informa DOIS dados: qual pedido e para qual etapa. Todo o
 * resto — telefone do cliente, arte, texto, qual WhatsApp usar — é buscado
 * aqui dentro, a partir do pedido.
 *
 * Se o navegador pudesse mandar o telefone e a imagem, qualquer pessoa com o
 * painel aberto conseguiria disparar mensagem para um número qualquer usando
 * o WhatsApp do restaurante. É a diferença entre o garçom anotar o pedido da
 * mesa 4 e alguém entrar na cozinha gritando um pedido que ninguém fez.
 */

const AGORA_INDISPONIVEL = "whatsapp_nao_configurado" as const;

export type ResultadoAtualizacao =
  | { ok: true; enviado: true }
  /**
   * Não há WhatsApp conectado neste FlyControl. O painel cai para o caminho
   * antigo: abrir a conversa com o texto pronto, para o dono enviar à mão.
   * A arte NÃO vai junto — e é justamente por isso que este caso é dito em
   * voz alta em vez de disfarçado.
   */
  | { ok: false; motivo: typeof AGORA_INDISPONIVEL; texto: string; telefone: string }
  | { ok: false; motivo: "erro"; mensagem: string };

type PedidoRow = {
  id: string;
  tenant_id: string;
  order_number: number | string | null;
  customer_name: string | null;
  customer_phone: string | null;
  status: string | null;
};

type LojaRow = {
  id: string;
  status_art_preparando_url: string | null;
  status_art_saiu_url: string | null;
  status_art_entregue_url: string | null;
  status_text_preparando: string | null;
  status_text_saiu: string | null;
  status_text_entregue: string | null;
};

/**
 * O aparelho de WhatsApp desta loja. Só existe no servidor, nunca no navegador.
 *
 * Procura nas DUAS gavetas: primeiro o aparelho que o próprio lojista ligou
 * pelo QR Code do Chat, depois o aparelho geral do FlyControl. Antes olhava só
 * a segunda — e era por isso que o botão caía sempre no modo manual, com a
 * arte ficando para trás.
 */
async function aparelhoDaLoja(tenantId: string): Promise<AparelhoDeEnvio | null> {
  const [cofre, marketing] = await Promise.all([
    supabaseAdmin
      .from("whatsapp_instance_secrets" as never)
      .select("instance_token")
      .eq("tenant_id", tenantId)
      .eq("provider", "uazapi")
      .maybeSingle(),
    supabaseAdmin
      .from("marketing_whatsapp_instances" as never)
      .select("external_instance_id")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  return escolherAparelho({
    baseUrl: process.env.UAZAPI_BASE_URL,
    tokenDaLoja: (cofre.data as { instance_token?: string } | null)?.instance_token,
    tokenGeral: process.env.UAZAPI_TOKEN,
    instanciaGeral: (marketing.data as { external_instance_id?: string } | null)
      ?.external_instance_id,
  });
}

export const enviarAtualizacaoDeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string; kind: FlyStatusKind }) => {
    if (!d?.orderId) throw new Error("Pedido não informado.");
    if (!["preparando", "saiu", "entregue"].includes(d?.kind)) {
      throw new Error("Etapa inválida.");
    }
    return d;
  })
  .handler(async ({ data, context }): Promise<ResultadoAtualizacao> => {
    const inicio = Date.now();

    // ── 1. O pedido existe, e é deste estabelecimento? ────────────────────
    const { data: pedidoRaw, error: erroPedido } = await supabaseAdmin
      .from("orders")
      .select("id, tenant_id, order_number, customer_name, customer_phone, status")
      .eq("id", data.orderId)
      .maybeSingle();

    if (erroPedido || !pedidoRaw) {
      return { ok: false, motivo: "erro", mensagem: "Pedido não encontrado." };
    }
    const pedido = pedidoRaw as unknown as PedidoRow;

    // A checagem que impede um estabelecimento de mandar mensagem usando o
    // pedido (e o WhatsApp) de outro. Lança se o dono não confere.
    await assertOwnsTenant(context.supabase, context.userId, pedido.tenant_id);

    const telefone = normalizarTelefone(pedido.customer_phone);
    if (!telefone) {
      return { ok: false, motivo: "erro", mensagem: "Este pedido não tem um telefone válido." };
    }

    // ── 2. Arte e texto vêm da loja, nunca do navegador ───────────────────
    const { data: lojaRaw } = await supabaseAdmin
      .from("pizzerias")
      .select(
        "id, status_art_preparando_url, status_art_saiu_url, status_art_entregue_url, " +
          "status_text_preparando, status_text_saiu, status_text_entregue",
      )
      .eq("id", pedido.tenant_id)
      .maybeSingle();

    const { url: arteUrl, texto } = montarMensagem(
      lojaRaw as unknown as LojaRow | null,
      data.kind,
      pedido.order_number ?? "",
      pedido.customer_name ?? "",
    );

    const aparelho = await aparelhoDaLoja(pedido.tenant_id);

    // ── 3. Sem aparelho nenhum, diz a verdade ─────────────────────────────
    //
    // O caminho antigo abre a conversa do WhatsApp com o texto pronto. Ele
    // NÃO consegue anexar imagem — o endereço `wa.me` só aceita texto. Era
    // exatamente isso que fazia o cliente receber o link da arte no lugar da
    // arte. Aqui o texto vai sem o link, e a tela avisa o que falta.
    if (!aparelho) {
      return { ok: false, motivo: AGORA_INDISPONIVEL, texto, telefone };
    }

    // ── 4. Busca a arte com o porteiro na frente ──────────────────────────
    let imagem: { bytes: ArrayBuffer; tipo: string; tamanho: number } | null = null;
    if (arteUrl) {
      const busca = await buscarImagem(arteUrl, process.env as Record<string, string | undefined>);
      if (!busca.ok) {
        console.warn(
          `[flystatus] arte recusada pedido=${pedido.id} tenant=${pedido.tenant_id} ` +
            `etapa=${data.kind} motivo=${busca.motivo}`,
        );
        return { ok: false, motivo: "erro", mensagem: MOTIVO_LEGIVEL[busca.motivo] };
      }
      imagem = busca.imagem;
    }

    // ── 5. Envio de verdade ───────────────────────────────────────────────
    const rota = imagem ? "/send/media" : "/send/text";
    const corpo = imagem
      ? {
          number: telefone,
          type: "image",
          // A legenda vai junto com a imagem: uma mensagem só, em vez de
          // duas. Imagem e texto separados chegam fora de ordem quando a
          // rede oscila, e o cliente vê a foto sem saber do que se trata.
          text: texto,
          file: `data:${imagem.tipo};base64,${paraBase64(imagem.bytes)}`,
        }
      : { number: telefone, text: texto };

    try {
      const resposta = await fetch(`${aparelho.baseUrl}${rota}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          token: aparelho.token,
          // Só o aparelho geral precisa dizer por qual número fala. O token da
          // própria loja já aponta para o aparelho dela.
          ...(aparelho.instancia ? { instance: aparelho.instancia } : {}),
        },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(30_000),
      });

      // Log sem nada sigiloso: nem token, nem telefone inteiro, nem a imagem.
      console.log(
        `[flystatus] envio pedido=${pedido.id} tenant=${pedido.tenant_id} etapa=${data.kind} ` +
          `midia=${imagem ? imagem.tipo : "nenhuma"} bytes=${imagem?.tamanho ?? 0} ` +
          `aparelho=${aparelho.origem} provedor=uazapi http=${resposta.status} ms=${Date.now() - inicio}`,
      );

      if (!resposta.ok) {
        return {
          ok: false,
          motivo: "erro",
          mensagem:
            resposta.status >= 500
              ? "O WhatsApp não respondeu agora. Tente de novo em instantes."
              : "O WhatsApp recusou o envio. Verifique se o aparelho está conectado.",
        };
      }

      return { ok: true, enviado: true };
    } catch (e) {
      const nome = e instanceof Error ? e.name : "";
      console.error(
        `[flystatus] falha pedido=${pedido.id} tenant=${pedido.tenant_id} etapa=${data.kind} ` +
          `erro=${nome || "desconhecido"} ms=${Date.now() - inicio}`,
      );
      return {
        ok: false,
        motivo: "erro",
        mensagem:
          nome === "TimeoutError"
            ? "O WhatsApp demorou demais para responder."
            : "Não consegui falar com o WhatsApp agora.",
      };
    }
  });
