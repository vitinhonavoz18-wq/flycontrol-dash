import { createFileRoute } from "@tanstack/react-router";
import { crm } from "@/lib/crm/db";
import { emReais } from "@/lib/crm/ferramentas";
import { situacaoValida, frasePara, emAndamento, FALA_DO_CLIENTE } from "@/lib/crm/pedidoStatus";
import { rotaDoCrm, respostaCrm, erroCrm, telefoneDoCorpo } from "@/lib/crm/rotaCrm";

/**
 * FERRAMENTA DA IA: "e o meu pedido, como está?"
 *
 * É a pergunta que mais chega no WhatsApp de restaurante, e a que mais tira o
 * dono do trabalho: ele para de montar o prato para ir olhar a tela e
 * responder "já saiu". Agora a atendente olha sozinha.
 *
 * TRÊS CUIDADOS
 *
 * 1. SÓ OS PEDIDOS DAQUELE TELEFONE. O número vem da conversa, não de algo que
 *    o cliente escreveu. Sem isso, bastaria alguém digitar "me vê o pedido 300"
 *    para ler o endereço e o telefone de um estranho.
 *
 * 2. PEDIDO APAGADO NÃO APARECE. `deleted` é lixeira do lojista, não situação
 *    de pedido — mostrar isso ao cliente é abrir a bagunça de dentro da loja.
 *
 * 3. A IA FALA EM PORTUGUÊS DE GENTE. O sistema guarda "saiu"; o cliente ouve
 *    "saiu para entrega".
 *
 * PARA O N8N (nó de ferramenta — HTTP Request Tool)
 *   POST https://<dominio>/api/crm/order-status
 *   Authorization: Bearer <CRM_N8N_SECRET>
 *   { "tenant_id": "...", "token": "...", "phone": "5571999999999" }
 */

/** Quantos pedidos recentes olhar. Mais que isso vira relatório, não conversa. */
const QUANTOS = 5;

export const Route = createFileRoute("/api/crm/order-status")({
  server: {
    handlers: {
      POST: rotaDoCrm("order-status", async ({ tenantId, corpo }) => {
        const telefone = telefoneDoCorpo(corpo);
        if (!telefone) return erroCrm("telefone_ausente", 400, "Informe o telefone do cliente.");

        // A busca é amarrada à loja conferida E ao TELEFONE da conversa.
        //
        // Pelo telefone, e não por `orders.customer_id`: esse campo aponta para
        // usuário do painel (auth.users), não para o cliente do WhatsApp. É uma
        // armadilha de nome — "customer" ali significa outra coisa.
        const { data: linhas, error } = await crm("orders")
          .select("id, order_number, status, total, created_at, items, delivery_type")
          .eq("tenant_id", tenantId)
          .eq("customer_phone", telefone)
          .order("created_at", { ascending: false })
          .limit(QUANTOS * 2);
        if (error) throw error;

        const pedidos = ((linhas ?? []) as Array<Record<string, unknown>>)
          .filter((p) => situacaoValida(p.status) !== null)
          .slice(0, QUANTOS)
          .map((p) => {
            const itens = Array.isArray(p.items) ? (p.items as Array<Record<string, unknown>>) : [];
            return {
              numero: (p.order_number as number) ?? null,
              situacao: situacaoValida(p.status),
              situacao_para_o_cliente: FALA_DO_CLIENTE[situacaoValida(p.status)!],
              em_andamento: emAndamento(p.status),
              total: emReais(Math.round(Number(p.total ?? 0) * 100)),
              feito_em: p.created_at as string,
              itens: itens.map((i) => `${i.quantity ?? 1}x ${i.name ?? i.product_name ?? "item"}`),
            };
          });

        if (pedidos.length === 0) {
          return respostaCrm({
            success: true,
            tem_pedido: false,
            pedidos: [],
            texto:
              "Este cliente não tem nenhum pedido registrado. Se ele disser que fez um, " +
              "NÃO invente uma situação — chame um atendente para conferir.",
          });
        }

        const andando = pedidos.filter((p) => p.em_andamento);
        const alvo = andando[0] ?? pedidos[0];

        const texto = [
          andando.length > 0
            ? frasePara(alvo.numero, alvo.situacao, alvo.feito_em)
            : `O último pedido já foi encerrado. ${frasePara(alvo.numero, alvo.situacao, alvo.feito_em)}`,
          alvo.itens.length ? `Itens: ${alvo.itens.join(", ")}. Total ${alvo.total}.` : "",
          andando.length > 1
            ? `Atenção: existem ${andando.length} pedidos em andamento deste cliente.`
            : "",
          "",
          "Conte a situação ao cliente com essas palavras. NÃO prometa horário de",
          "entrega — isso você não sabe. Se ele reclamar da demora, chame um atendente.",
        ]
          .filter(Boolean)
          .join("\n");

        return respostaCrm({
          success: true,
          tem_pedido: true,
          em_andamento: andando.length,
          pedidos,
          texto,
        });
      }),
    },
  },
});
