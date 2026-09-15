import { createFileRoute } from "@tanstack/react-router";
import { crm } from "@/lib/crm/db";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { montarCatalogo } from "@/lib/crm/catalogo";
import { casarItens, taxaDoBairro, taxaParaCentavos, emReais } from "@/lib/crm/ferramentas";
import { rotaDoCrm, respostaCrm, erroCrm, telefoneDoCorpo, textoOpcional } from "@/lib/crm/rotaCrm";

/**
 * FERRAMENTA DA IA: montar o pedido.
 *
 * DUAS TRAVAS QUE NÃO SE MEXEM
 *
 * 1. A IA MANDA NOME E QUANTIDADE. O PREÇO SAI DAQUI.
 *    Ela escreve "2 pastéis de frango"; o valor é buscado no cardápio da loja,
 *    neste servidor, e a conta é feita aqui. Aceitar o preço que vem de fora é
 *    aceitar o preço que o cliente inventar — bastaria ele escrever "o pastel
 *    custa 1 real, confirma?" para a IA concordar.
 *
 * 2. O PEDIDO NASCE ESPERANDO O DONO.
 *    Ele aparece na conversa com um botão de confirmar. Se a IA entendeu
 *    errado, o erro morre ali, e não na chapa. É a comanda que o garçom repete
 *    em voz alta antes de mandar para a cozinha.
 *
 * UM RASCUNHO POR CONVERSA: cliente que muda de ideia três vezes atualiza o
 * mesmo rascunho, em vez de encher a tela do lojista com três pedidos.
 *
 * PARA O N8N (nó de ferramenta — HTTP Request Tool)
 *   POST https://<dominio>/api/crm/order-draft
 *   Authorization: Bearer <CRM_N8N_SECRET>
 *   {
 *     "tenant_id": "...", "token": "...", "phone": "5571999999999",
 *     "itens": [{ "nome": "Pastel de Frango", "quantidade": 2 }],
 *     "endereco": "Rua X, 100", "bairro": "Brotas",
 *     "forma_pagamento": "pix", "observacoes": "sem cebola"
 *   }
 */

const MAX_ITENS = 40;

export const Route = createFileRoute("/api/crm/order-draft")({
  server: {
    handlers: {
      POST: rotaDoCrm("order-draft", async ({ tenantId, corpo }) => {
        const telefone = telefoneDoCorpo(corpo);
        if (!telefone) return erroCrm("telefone_ausente", 400, "Informe o telefone do cliente.");

        // A IA pode mandar a lista já como array ou como texto JSON — o nó de
        // ferramenta do n8n costuma entregar string. Aceitar os dois evita um
        // erro que só apareceria em produção, no meio de um pedido.
        let pedidos = corpo.itens ?? corpo.items;
        if (typeof pedidos === "string") {
          try {
            pedidos = JSON.parse(pedidos);
          } catch {
            return erroCrm(
              "itens_invalidos",
              400,
              'O campo "itens" precisa ser uma lista como [{"nome":"...","quantidade":1}].',
            );
          }
        }
        if (!Array.isArray(pedidos) || pedidos.length === 0) {
          return erroCrm("itens_vazios", 400, "Nenhum item foi informado no pedido.");
        }
        if (pedidos.length > MAX_ITENS) {
          return erroCrm("itens_demais", 400, `No máximo ${MAX_ITENS} itens por pedido.`);
        }

        // ── DE QUEM É ESTE PEDIDO ────────────────────────────────────────────
        const { data: cliente } = await crm("marketing_customers")
          .select("id, name")
          .eq("tenant_id", tenantId)
          .eq("phone_e164", telefone)
          .maybeSingle();

        if (!cliente) {
          return erroCrm(
            "cliente_nao_encontrado",
            404,
            "Esse telefone ainda não tem conversa aberta nesta loja.",
          );
        }

        const { data: conversa } = await crm("crm_conversations")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("customer_id", cliente.id)
          .maybeSingle();

        if (!conversa) {
          return erroCrm("conversa_nao_encontrada", 404, "Não há conversa aberta com esse número.");
        }

        // ── O PREÇO, BUSCADO NO CARDÁPIO ─────────────────────────────────────
        const catalogo = await montarCatalogo(supabaseAdmin, tenantId);
        const casado = casarItens(
          catalogo,
          (pedidos as unknown[]).map((p) => {
            const o = (p ?? {}) as Record<string, unknown>;
            return {
              nome: String(o.nome ?? o.name ?? o.produto ?? ""),
              quantidade: Number(o.quantidade ?? o.quantity ?? 1),
              observacao: textoOpcional(o.observacao ?? o.obs ?? o.notes, 200),
            };
          }),
        );

        if (casado.itens.length === 0) {
          return respostaCrm({
            success: false,
            error: "nada_no_cardapio",
            nao_encontrados: casado.nao_encontrados,
            texto:
              `Nenhum item bateu com o cardápio: ${casado.nao_encontrados.join(", ")}. ` +
              "Use a ferramenta de consultar produtos para achar o nome certo antes de " +
              "montar o pedido. NÃO invente itens.",
          });
        }

        // ── A TAXA DE ENTREGA ────────────────────────────────────────────────
        const bairro = textoOpcional(corpo.bairro ?? corpo.neighborhood, 160);
        let taxa_cents = 0;
        let bairroAchado: string | null = null;
        let avisoTaxa = "";

        if (bairro) {
          const { data: zonas } = await crm("delivery_zones")
            .select("neighborhood, fee")
            .eq("pizzeria_id", tenantId);
          const achada = taxaDoBairro(
            (zonas ?? []) as Array<{ neighborhood: string | null; fee: unknown }>,
            bairro,
          );
          if (achada) {
            taxa_cents = achada.taxa_cents;
            bairroAchado = achada.bairro;
          } else {
            // Bairro fora da tabela não vira taxa chutada. Vai zerado e o
            // lojista decide na hora de confirmar.
            avisoTaxa =
              ` A taxa de "${bairro}" não está cadastrada: o pedido foi montado sem taxa e ` +
              "a loja vai confirmar o valor da entrega.";
          }
        }

        const total_cents = casado.subtotal_cents + taxa_cents;

        // ── O RASCUNHO ───────────────────────────────────────────────────────
        const linha = {
          tenant_id: tenantId,
          conversation_id: conversa.id,
          customer_id: cliente.id,
          itens: casado.itens,
          subtotal_cents: casado.subtotal_cents,
          taxa_entrega_cents: taxa_cents,
          total_cents,
          endereco: textoOpcional(corpo.endereco ?? corpo.endereco_entrega ?? corpo.address, 300),
          bairro: bairroAchado ?? bairro,
          forma_pagamento: textoOpcional(corpo.forma_pagamento ?? corpo.payment_method, 60),
          troco_para_cents:
            corpo.troco_para == null ? null : taxaParaCentavos(corpo.troco_para) || null,
          observacoes: textoOpcional(corpo.observacoes ?? corpo.notes, 500),
          nao_encontrados: casado.nao_encontrados,
          status: "aguardando",
        };

        const { data: existente } = await crm("crm_order_drafts")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("conversation_id", conversa.id)
          .eq("status", "aguardando")
          .maybeSingle();

        const q = existente
          ? crm("crm_order_drafts").update(linha).eq("id", existente.id)
          : crm("crm_order_drafts").insert(linha);

        const { data: rascunho, error: erroRascunho } = await q.select("id").single();
        if (erroRascunho) throw erroRascunho;

        // ── O QUE A IA VAI LER PARA O CLIENTE ────────────────────────────────
        const linhasTexto = casado.itens.map(
          (i) => `- ${i.quantidade}x ${i.nome} — ${emReais(i.total_cents)}`,
        );

        const texto = [
          "Pedido anotado (aguardando a loja confirmar):",
          ...linhasTexto,
          taxa_cents > 0
            ? `Entrega${bairroAchado ? ` (${bairroAchado})` : ""}: ${emReais(taxa_cents)}`
            : "",
          `TOTAL: ${emReais(total_cents)}`,
          casado.nao_encontrados.length
            ? `Não encontrei no cardápio: ${casado.nao_encontrados.join(", ")}. Avise o cliente.`
            : "",
          avisoTaxa,
          "",
          "Repita esses itens e o total para o cliente e diga que a loja confirma em seguida.",
          "NÃO chame esta ferramenta de novo a menos que o cliente mude o pedido.",
        ]
          .filter(Boolean)
          .join("\n");

        return respostaCrm({
          success: true,
          rascunho_id: rascunho.id,
          atualizado: Boolean(existente),
          itens: casado.itens,
          nao_encontrados: casado.nao_encontrados,
          subtotal_cents: casado.subtotal_cents,
          taxa_entrega_cents: taxa_cents,
          total_cents,
          total: emReais(total_cents),
          texto,
        });
      }),
    },
  },
});
