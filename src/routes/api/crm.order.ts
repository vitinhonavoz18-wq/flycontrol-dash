import { createFileRoute } from "@tanstack/react-router";
import { crm } from "@/lib/crm/db";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { montarCatalogo } from "@/lib/crm/catalogo";
import { casarItens, taxaDoBairro, taxaParaCentavos, emReais } from "@/lib/crm/ferramentas";
import { podeSerAlteradoPelaIa } from "@/lib/crm/pedidoStatus";
import { rotaDoCrm, respostaCrm, erroCrm, telefoneDoCorpo, textoOpcional } from "@/lib/crm/rotaCrm";

/**
 * FERRAMENTA DA IA: fazer o pedido.
 *
 * O pedido entra DIRETO na lista de Pedidos, igual ao que vem do site — sem
 * ninguém precisar confirmar. Foi a escolha do dono: mais prático.
 *
 * O QUE SEGURA O ERRO, JÁ QUE NÃO EXISTE MAIS CONFERÊNCIA
 *
 * 1. O PREÇO NUNCA VEM DA IA. Ela manda nome e quantidade; o valor sai do
 *    cardápio, aqui dentro. Bastaria o cliente escrever "o refrigerante custa
 *    1 real, confirma?" para uma IA crédula concordar.
 *
 * 2. ITEM QUE NÃO EXISTE NÃO ENTRA, e o que ela tentou pedir e não existe fica
 *    escrito na observação do pedido — o lojista lê na tela de Pedidos em vez
 *    de descobrir pelo cliente reclamando.
 *
 * 3. CLIENTE QUE MUDA DE IDEIA NÃO VIRA DOIS PEDIDOS. Se já existe um pedido
 *    deste cliente feito pelo Chat e a cozinha ainda não começou, ele é
 *    ATUALIZADO. Depois que entrou em preparo, não: mudar aí é mandar jogar
 *    comida fora, e a cozinha não lê WhatsApp.
 *
 * PARA O N8N (nó de ferramenta — HTTP Request Tool)
 *   POST https://<dominio>/api/crm/order
 *   Authorization: Bearer <CRM_N8N_SECRET>
 *   {
 *     "tenant_id": "...", "token": "...", "phone": "5571999999999",
 *     "itens": [{ "nome": "Calabresa", "quantidade": 2 }],
 *     "endereco": "Rua X, 100", "bairro": "Brotas",
 *     "forma_pagamento": "pix", "observacoes": "sem cebola"
 *   }
 */

const MAX_ITENS = 40;

/** Centavos inteiros viram reais só na fronteira com a tabela de pedidos. */
function reais(cents: number): number {
  return Math.round(Number(cents) || 0) / 100;
}

export const Route = createFileRoute("/api/crm/order")({
  server: {
    handlers: {
      POST: rotaDoCrm("order", async ({ tenantId, corpo }) => {
        const telefone = telefoneDoCorpo(corpo);
        if (!telefone) return erroCrm("telefone_ausente", 400, "Informe o telefone do cliente.");

        // A ferramenta do n8n costuma entregar a lista como texto. Aceitar os
        // dois formatos evita um erro que só apareceria no meio de um pedido.
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
              "fazer o pedido. NÃO invente itens. O pedido NÃO foi feito.",
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
            // Bairro fora da tabela não vira taxa chutada: entra zerado e o
            // lojista acerta na tela de Pedidos.
            avisoTaxa =
              ` A taxa de "${bairro}" não está cadastrada, então o pedido foi feito SEM taxa. ` +
              "Diga ao cliente que a loja confirma o valor da entrega.";
          }
        }

        const subtotal_cents = casado.subtotal_cents;
        const total_cents = subtotal_cents + taxa_cents;
        const retirada =
          corpo.retirada === true ||
          String(corpo.tipo ?? corpo.delivery_type ?? "").toLowerCase() === "retirada";

        const observacoes = [
          textoOpcional(corpo.observacoes ?? corpo.notes, 400),
          // O que o cliente pediu e a loja não tem vai ESCRITO no pedido. Some
          // daí a próxima compra do estoque.
          casado.nao_encontrados.length
            ? `Pediu e não temos: ${casado.nao_encontrados.join(", ")}.`
            : "",
          avisoTaxa ? "Taxa de entrega a confirmar (bairro não cadastrado)." : "",
        ]
          .filter(Boolean)
          .join(" ");

        const linhaPedido = {
          tenant_id: tenantId,
          customer_id: cliente.id,
          customer_name: cliente.name || "Cliente do WhatsApp",
          customer_phone: telefone,
          customer_address: retirada
            ? "Retirada no balcão"
            : textoOpcional(corpo.endereco ?? corpo.endereco_entrega ?? corpo.address, 300) ||
              "Não informado",
          neighborhood: retirada ? null : (bairroAchado ?? bairro),
          subtotal: reais(subtotal_cents),
          delivery_fee: reais(taxa_cents),
          total: reais(total_cents),
          payment_method:
            textoOpcional(corpo.forma_pagamento ?? corpo.payment_method, 60) || "Não informado",
          notes: observacoes,
          status: "novo",
          order_type: retirada ? "pickup" : "delivery",
          delivery_type: retirada ? "pickup" : "delivery",
          service_mode: retirada ? "pickup" : "delivery",
          // A etiqueta de origem é o que permite depois saber quanto o Chat
          // vendeu — e conferir se a IA está acertando ou dando prejuízo.
          source: "chat-ia",
          items: casado.itens.map((i) => ({
            name: i.nome,
            type: "other",
            notes: i.observacao ?? "",
            quantity: i.quantidade,
            unit_price: reais(i.preco_unitario_cents),
            total_price: reais(i.total_cents),
            menu_product_id: i.menu_product_id,
          })),
        };

        // ── CLIENTE QUE MUDA DE IDEIA ATUALIZA O MESMO PEDIDO ────────────────
        const { data: aberto } = await crm("orders")
          .select("id, order_number, status")
          .eq("tenant_id", tenantId)
          .eq("customer_id", cliente.id)
          .eq("source", "chat-ia")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const podeAtualizar = aberto && podeSerAlteradoPelaIa(aberto.status);

        let pedido: { id: string; order_number: number | null };
        if (podeAtualizar) {
          const { data, error } = await crm("orders")
            .update(linhaPedido)
            .eq("id", aberto.id)
            .eq("tenant_id", tenantId)
            .select("id, order_number")
            .single();
          if (error) throw error;
          pedido = data;
        } else {
          const { data, error } = await crm("orders")
            .insert(linhaPedido)
            .select("id, order_number")
            .single();
          if (error) throw error;
          pedido = data;
        }

        // ── O QUE A IA VAI LER PARA O CLIENTE ────────────────────────────────
        const texto = [
          podeAtualizar
            ? `Pedido #${pedido.order_number} ATUALIZADO:`
            : `Pedido #${pedido.order_number} feito e já enviado para a loja:`,
          ...casado.itens.map((i) => `- ${i.quantidade}x ${i.nome} — ${emReais(i.total_cents)}`),
          taxa_cents > 0
            ? `Entrega${bairroAchado ? ` (${bairroAchado})` : ""}: ${emReais(taxa_cents)}`
            : "",
          `TOTAL: ${emReais(total_cents)}`,
          casado.nao_encontrados.length
            ? `Não temos: ${casado.nao_encontrados.join(", ")}. Avise o cliente.`
            : "",
          avisoTaxa,
          "",
          `Repita os itens e o total para o cliente e diga o número do pedido (#${pedido.order_number}).`,
          "NÃO chame esta ferramenta de novo a menos que o cliente MUDE o pedido.",
        ]
          .filter(Boolean)
          .join("\n");

        return respostaCrm({
          success: true,
          pedido_id: pedido.id,
          numero: pedido.order_number,
          atualizado: Boolean(podeAtualizar),
          itens: casado.itens,
          nao_encontrados: casado.nao_encontrados,
          subtotal_cents,
          taxa_entrega_cents: taxa_cents,
          total_cents,
          total: emReais(total_cents),
          texto,
        });
      }),
    },
  },
});
