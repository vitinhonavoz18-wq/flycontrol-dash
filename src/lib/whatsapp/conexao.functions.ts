import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertOwnsTenant } from "@/lib/server/plan-guard";
import {
  configUazapi,
  criarInstancia,
  conectarInstancia,
  statusInstancia,
  desconectarInstancia,
  configurarWebhook,
  traduzirStatusInstancia,
  aparelhoDesconhecido,
} from "./uazapi";

/* As tabelas envolvidas ainda não constam do arquivo de tipos gerado. */
/* eslint-disable @typescript-eslint/no-explicit-any */
const db = (tabela: string): any => (supabaseAdmin as any).from(tabela);

/**
 * Ligar e desligar o WhatsApp da loja — pela tela do próprio lojista.
 *
 * O PROBLEMA QUE ISSO RESOLVE
 *
 * O WhatsApp derruba a conexão sozinho de tempos em tempos: troca de celular,
 * ficar dias sem internet, ou simplesmente porque sim. Antes, quando caía, o
 * restaurante ficava mudo até alguém do suporte ler um QR Code por ele — e
 * isso podia levar horas, num sábado à noite, com cliente esperando resposta.
 *
 * Agora é como o WhatsApp Web: caiu, o dono aponta a câmera e volta. Em
 * trinta segundos, sem telefonema para ninguém.
 *
 * A CONFERÊNCIA DE DONO É A MESMA DE SEMPRE. O `tenantId` que chega do
 * navegador é um pedido, nunca uma verdade.
 */

const PROVEDOR = "uazapi";

export type EstadoConexao = {
  configurado: boolean;
  status: "connected" | "connecting" | "disconnected" | "error";
  telefone: string | null;
  nomePerfil: string | null;
  avisoWebhook: boolean;
  ultimaVerificacao: string | null;
  mensagem: string | null;
};

/** A ficha do aparelho + o token guardado no cofre. */
async function fichaDoAparelho(tenantId: string) {
  const { data: ficha } = await db("marketing_whatsapp_instances")
    .select("external_instance_id, phone_e164, status, instance_name, webhook_configured_at")
    .eq("tenant_id", tenantId)
    .eq("provider", PROVEDOR)
    .maybeSingle();

  const { data: cofre } = await db("whatsapp_instance_secrets")
    .select("instance_token")
    .eq("tenant_id", tenantId)
    .eq("provider", PROVEDOR)
    .maybeSingle();

  return { ficha, token: (cofre?.instance_token as string | undefined) ?? null };
}

async function gravarFicha(tenantId: string, campos: Record<string, unknown>) {
  await db("marketing_whatsapp_instances").upsert(
    { tenant_id: tenantId, provider: PROVEDOR, ...campos, updated_at: new Date().toISOString() },
    { onConflict: "tenant_id,provider" },
  );
}

/** Para onde os avisos de mensagem nova daquela loja devem ir. */
async function enderecoDoFluxo(tenantId: string): Promise<string | null> {
  const { data } = await db("crm_n8n_links")
    .select("inbound_webhook_url")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const url = (data?.inbound_webhook_url as string | undefined)?.trim();
  return url || null;
}

/** O texto que fica anotado na ficha quando a chave velha é jogada fora. */
const MOTIVO_APARELHO_SUMIU =
  "O aparelho não existe mais no servidor do WhatsApp. É preciso ler o QR Code de novo.";

/**
 * JOGA FORA A CHAVE QUE NÃO ABRE MAIS NADA.
 *
 * Acontece quando o servidor da UAZAPI é trocado (ou quando alguém apaga o
 * aparelho por lá): a chave guardada no cofre continua lá, bonitinha, e não
 * abre porta nenhuma.
 *
 * Deixar a chave morta no cofre é pior do que não ter chave: o Chat entrega
 * essa chave ao fluxo do n8n, o n8n tenta enviar, e a mensagem do cliente
 * morre no caminho sem ninguém perceber. É o garçom anotando o pedido num
 * bloco e entregando numa cozinha que foi desativada.
 *
 * O que ISTO apaga: a chave do aparelho e as anotações de conexão. O que ISTO
 * NÃO apaga: nenhuma conversa, nenhuma mensagem, nenhum cliente. O histórico
 * do Chat continua inteiro — só a fechadura é trocada.
 */
async function esquecerAparelho(tenantId: string, motivo: string) {
  await db("whatsapp_instance_secrets").delete().eq("tenant_id", tenantId).eq("provider", PROVEDOR);

  await gravarFicha(tenantId, {
    external_instance_id: null,
    // Zerado de propósito: no servidor novo o aviso de "chegou mensagem" ainda
    // não foi apontado para lugar nenhum, e fingir que foi deixaria a loja
    // conectada e muda.
    webhook_configured_at: null,
    status: "disconnected",
    phone_e164: null,
    disconnected_at: new Date().toISOString(),
    status_message: motivo,
  });
}

/** Cria o aparelho desta loja na UAZAPI e guarda a chave dele no cofre. */
async function criarAparelho(tenantId: string): Promise<string> {
  const { data: loja } = await db("pizzerias")
    .select("name, slug")
    .eq("id", tenantId)
    .maybeSingle();
  const nome = `flycontrol-${(loja?.slug || tenantId).toString().slice(0, 40)}`;

  const criada = await criarInstancia(nome, tenantId);
  if (!criada.ok) throw new Error(criada.erro);

  const novoToken = criada.dados.token ?? criada.dados.instance?.token;
  if (!novoToken) throw new Error("O WhatsApp não devolveu a credencial do aparelho.");

  await db("whatsapp_instance_secrets").upsert(
    {
      tenant_id: tenantId,
      provider: PROVEDOR,
      instance_token: novoToken,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,provider" },
  );

  await gravarFicha(tenantId, {
    external_instance_id: criada.dados.instance?.id ?? null,
    instance_name: nome,
    status: "disconnected",
    status_message: null,
  });

  return novoToken;
}

/**
 * Como está a conexão agora.
 *
 * Pergunta para a UAZAPI, mas NÃO depende dela: se a UAZAPI não responder, a
 * tela mostra o último estado conhecido em vez de ficar em branco. O lojista
 * precisa saber se pode contar com o WhatsApp, e "não sei" é uma resposta
 * pior do que "há dez minutos estava conectado".
 */
export const estadoConexaoWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => d)
  .handler(async ({ data, context }): Promise<EstadoConexao> => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);

    if (!configUazapi()) {
      return {
        configurado: false,
        status: "disconnected",
        telefone: null,
        nomePerfil: null,
        avisoWebhook: false,
        ultimaVerificacao: null,
        mensagem: "A integração com o WhatsApp ainda não foi configurada neste ambiente.",
      };
    }

    const { ficha, token } = await fichaDoAparelho(tenantId);

    if (!token) {
      return {
        configurado: true,
        status: "disconnected",
        telefone: null,
        nomePerfil: null,
        avisoWebhook: false,
        ultimaVerificacao: null,
        mensagem: null,
      };
    }

    const r = await statusInstancia(token);

    // A CHAVE NÃO VALE MAIS NESTE SERVIDOR.
    //
    // Não adianta mostrar "o WhatsApp recusou a autorização" para o dono do
    // restaurante: ele não tem o que fazer com isso. A tela precisa voltar a
    // oferecer o QR Code, que é a única coisa que resolve.
    if (aparelhoDesconhecido(r)) {
      await esquecerAparelho(tenantId, MOTIVO_APARELHO_SUMIU);
      return {
        configurado: true,
        status: "disconnected",
        telefone: null,
        nomePerfil: null,
        avisoWebhook: false,
        ultimaVerificacao: null,
        mensagem:
          "O WhatsApp desta loja precisa ser conectado de novo. Clique em conectar e leia o QR Code.",
      };
    }

    if (!r.ok) {
      return {
        configurado: true,
        status: traduzirStatusInstancia(ficha?.status),
        telefone: (ficha?.phone_e164 as string | undefined) ?? null,
        nomePerfil: null,
        avisoWebhook: !ficha?.webhook_configured_at,
        ultimaVerificacao: null,
        mensagem: r.erro,
      };
    }

    const conectado = Boolean(r.dados.status?.connected && r.dados.status?.loggedIn);
    const status = conectado ? "connected" : traduzirStatusInstancia(r.dados.instance?.status);
    const telefone = extrairTelefone(r.dados.instance?.owner) ?? null;
    const agora = new Date().toISOString();

    await gravarFicha(tenantId, {
      status,
      phone_e164: telefone,
      last_synced_at: agora,
      connected_at: conectado ? (ficha?.status === "connected" ? undefined : agora) : undefined,
      disconnected_at: conectado ? undefined : agora,
      status_message: r.dados.instance?.lastDisconnectReason ?? null,
    });

    // ── O CONSERTO QUE SE FAZ SOZINHO ───────────────────────────────────────
    //
    // O aviso de "chegou mensagem" só era apontado no momento de ler o QR
    // Code. Só que a ordem real das coisas no dia a dia é outra: o lojista
    // conecta primeiro e o suporte cadastra o endereço do fluxo depois.
    //
    // Quando isso acontecia, o aparelho ficava conectado e mudo para sempre —
    // e o único jeito de consertar era desconectar e reconectar, porque o
    // botão de conectar nem aparece para quem já está conectado. Era o
    // telefone instalado e funcionando, sem ninguém ter dito à central para
    // qual ramal transferir; e a única saída era arrancar o telefone da
    // parede e instalar de novo.
    //
    // Agora a conferência de status, que roda a cada minuto com a tela
    // aberta, arruma isso sozinha assim que o endereço aparece. Repetir não
    // faz mal: apontar o aviso duas vezes para o mesmo lugar dá no mesmo.
    let avisoPendente = conectado && !ficha?.webhook_configured_at;

    if (avisoPendente) {
      const url = await enderecoDoFluxo(tenantId);
      if (url) {
        const w = await configurarWebhook(token, url);
        if (w.ok) {
          await gravarFicha(tenantId, { webhook_configured_at: new Date().toISOString() });
          avisoPendente = false;
        }
      }
    }

    return {
      configurado: true,
      status,
      telefone,
      nomePerfil: r.dados.instance?.profileName ?? null,
      // Só sobra o aviso quando NÃO há endereço cadastrado — aí é mesmo coisa
      // do suporte, e não algo que o lojista possa resolver.
      avisoWebhook: avisoPendente,
      ultimaVerificacao: agora,
      mensagem: null,
    };
  });

/**
 * Pedir o QR Code (ou o código de pareamento).
 *
 * Faz quatro coisas numa tacada, na ordem certa:
 *   1. confere se a chave guardada ainda vale no servidor de hoje;
 *   2. cria o aparelho na UAZAPI, se esta loja ainda não tiver um;
 *   3. aponta o aviso de mensagem nova para o fluxo daquela loja;
 *   4. pede o QR Code.
 *
 * O passo 3 vem ANTES do 4 de propósito. Se viesse depois, haveria uma janela
 * em que o aparelho já está conectado e o aviso ainda não foi apontado — e as
 * mensagens que chegassem nesse intervalo sumiriam sem deixar rastro.
 */
export const iniciarConexaoWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; telefone?: string }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);

    if (!configUazapi()) {
      throw new Error("A integração com o WhatsApp ainda não foi configurada neste ambiente.");
    }

    let { token } = await fichaDoAparelho(tenantId);

    // 1. A chave que está no cofre ainda abre alguma porta NESTE servidor?
    //
    // Esta conferência é o que faz a troca de servidor da UAZAPI se resolver
    // sozinha. Sem ela, a loja que já tinha aparelho no servidor antigo ficaria
    // presa para sempre: o botão de conectar tentaria usar a chave velha, o
    // servidor novo responderia "não conheço", e o lojista veria sempre o mesmo
    // erro, sem nenhum jeito de sair dali.
    //
    // Custa uma pergunta a mais ao fornecedor, feita só quando alguém clica em
    // conectar. É o porteiro conferindo se a chave é mesmo desta portaria antes
    // de mandar o morador subir.
    if (token) {
      const conferencia = await statusInstancia(token);
      if (aparelhoDesconhecido(conferencia)) {
        await esquecerAparelho(tenantId, MOTIVO_APARELHO_SUMIU);
        token = null;
      }
    }

    // 2. O aparelho existe?
    if (!token) token = await criarAparelho(tenantId);

    // 3. Para onde vão as mensagens que chegarem.
    const url = await enderecoDoFluxo(tenantId);
    let avisoSemFluxo = false;
    if (url) {
      const w = await configurarWebhook(token, url);
      if (w.ok) {
        await gravarFicha(tenantId, { webhook_configured_at: new Date().toISOString() });
      }
    } else {
      // Sem endereço cadastrado, a conexão ainda vale a pena (o Marketing usa
      // o mesmo aparelho), mas o Chat fica mudo. A tela precisa dizer isso.
      avisoSemFluxo = true;
    }

    // 4. O QR Code.
    const r = await conectarInstancia(token, data.telefone);
    if (!r.ok) throw new Error(r.erro);

    const inst = r.dados.instance;
    const jaConectado = Boolean(r.dados.connected && r.dados.loggedIn);

    if (jaConectado) {
      await gravarFicha(tenantId, { status: "connected", connected_at: new Date().toISOString() });
    } else {
      await gravarFicha(tenantId, { status: "connecting" });
    }

    return {
      jaConectado,
      // Vem da UAZAPI já em base64, pronto para virar imagem na tela.
      qrcode: inst?.qrcode ?? null,
      paircode: inst?.paircode ?? null,
      avisoSemFluxo,
    };
  });

/**
 * Desligar o WhatsApp da loja.
 *
 * NÃO apaga o aparelho nem o histórico: desconecta. O mesmo aparelho volta a
 * funcionar na próxima leitura de QR Code, com o mesmo número, e todas as
 * conversas continuam onde estavam.
 */
export const desconectarWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);

    const { token } = await fichaDoAparelho(tenantId);
    if (!token) return { ok: true };

    const r = await desconectarInstancia(token);

    // Aparelho que o servidor não conhece já está desligado na prática. Jogar
    // a chave morta fora aqui evita que o próximo clique em "conectar" esbarre
    // nela — e não custa nada, porque desligado ele já estava.
    if (aparelhoDesconhecido(r)) {
      await esquecerAparelho(tenantId, MOTIVO_APARELHO_SUMIU);
      return { ok: true };
    }
    // Mesmo que a UAZAPI recuse, anotamos como desconectado: o lojista clicou
    // em desconectar e a tela não pode continuar dizendo "conectado".
    await gravarFicha(tenantId, {
      status: "disconnected",
      disconnected_at: new Date().toISOString(),
    });

    if (!r.ok) throw new Error(r.erro);
    return { ok: true };
  });

/**
 * O telefone vem colado ao identificador do WhatsApp
 * ("5571999999999@s.whatsapp.net"). Guardamos só os dígitos.
 */
function extrairTelefone(owner: string | undefined): string | null {
  if (!owner) return null;
  const digitos = owner.split("@")[0]?.replace(/\D/g, "") ?? "";
  return digitos.length >= 10 ? digitos : null;
}
