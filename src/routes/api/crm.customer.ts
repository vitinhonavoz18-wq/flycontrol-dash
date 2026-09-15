import { createFileRoute } from "@tanstack/react-router";
import { crm } from "@/lib/crm/db";
import { emReais } from "@/lib/crm/ferramentas";
import { rotaDoCrm, respostaCrm, erroCrm, telefoneDoCorpo } from "@/lib/crm/rotaCrm";
import { detalhesDoContato } from "@/lib/whatsapp/uazapi";

/**
 * A FICHA DO CLIENTE — para a IA e para a tela.
 *
 * Atender sabendo quem está do outro lado é outro atendimento. "Oi, Dona
 * Marlene, é o de sempre?" só é possível para quem sabe que ela já pediu 14
 * vezes. É o garçom que reconhece o cliente da mesa 5 contra o que trata todo
 * mundo como se fosse a primeira vez.
 *
 * A FOTO DE PERFIL é buscada no WhatsApp e GUARDADA aqui. Buscar a cada
 * abertura de tela seria bater no WhatsApp centenas de vezes por dia para
 * receber sempre a mesma foto — e quem faz isso toma bloqueio. Por isso só
 * busca de novo depois de um tempo, ou quando o fluxo pedir de propósito.
 *
 * O ENDEREÇO DA FOTO VENCE: o WhatsApp entrega um link temporário. Por isso a
 * data da busca é guardada junto. É o cupom do estacionamento — vale hoje,
 * amanhã não abre mais a cancela.
 *
 * PARA O N8N
 *   POST https://<dominio>/api/crm/customer
 *   Authorization: Bearer <CRM_N8N_SECRET>
 *   { "tenant_id": "...", "token": "...", "phone": "5571999999999" }
 */

/** De quanto em quanto tempo vale a pena perguntar a foto de novo. */
const VALIDADE_DA_FOTO_HORAS = 24;

function horasDesde(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isFinite(ms) ? ms / 3_600_000 : Number.POSITIVE_INFINITY;
}

export const Route = createFileRoute("/api/crm/customer")({
  server: {
    handlers: {
      POST: rotaDoCrm("customer", async ({ tenantId, corpo }) => {
        const telefone = telefoneDoCorpo(corpo);
        if (!telefone) return erroCrm("telefone_ausente", 400, "Informe o telefone do cliente.");

        const { data: cliente, error } = await crm("marketing_customers")
          .select(
            "id, name, phone_e164, avatar_url, avatar_updated_at, orders_count, " +
              "total_spent_cents, first_order_at, last_order_at, last_chat_at, notes, tags, " +
              "marketing_opt_in, source, name_locked",
          )
          .eq("tenant_id", tenantId)
          .eq("phone_e164", telefone)
          .maybeSingle();

        if (error) throw error;

        if (!cliente) {
          return respostaCrm({
            success: true,
            encontrado: false,
            telefone,
            texto: "Cliente novo: nunca falou com a loja nem fez pedido antes.",
          });
        }

        // ── A FOTO ──────────────────────────────────────────────────────────
        let foto: string | null = cliente.avatar_url ?? null;
        const vencida = horasDesde(cliente.avatar_updated_at) > VALIDADE_DA_FOTO_HORAS;

        if (vencida || corpo.atualizar_foto === true) {
          const { data: ficha } = await crm("whatsapp_instance_secrets")
            .select("instance_token")
            .eq("tenant_id", tenantId)
            .maybeSingle();

          if (ficha?.instance_token) {
            const r = await detalhesDoContato(String(ficha.instance_token), telefone);
            if (r.ok) {
              foto = r.dados.foto;
              // Falhar ao buscar a foto NÃO apaga a que já existia e NÃO
              // derruba a ficha inteira: rosto é enfeite, o resto é o que
              // importa para atender.
              await crm("marketing_customers")
                .update({ avatar_url: foto, avatar_updated_at: new Date().toISOString() })
                .eq("id", cliente.id);
            }
          }
        }

        const gasto = Number(cliente.total_spent_cents ?? 0);
        const pedidos = Number(cliente.orders_count ?? 0);
        const nome = cliente.name ? String(cliente.name) : null;

        const texto = [
          nome ? `Cliente: ${nome}.` : "Cliente ainda sem nome cadastrado.",
          pedidos > 0
            ? `Já fez ${pedidos} ${pedidos === 1 ? "pedido" : "pedidos"}, ` +
              `somando ${emReais(gasto)}.` +
              (cliente.last_order_at
                ? ` Último em ${new Date(cliente.last_order_at).toLocaleDateString("pt-BR")}.`
                : "")
            : "Nunca fez pedido pelo sistema — trate como cliente novo.",
          cliente.notes ? `Observação da loja: ${cliente.notes}` : "",
        ]
          .filter(Boolean)
          .join(" ");

        return respostaCrm({
          success: true,
          encontrado: true,
          cliente: {
            id: cliente.id,
            nome,
            telefone: cliente.phone_e164,
            foto,
            pedidos,
            total_gasto_cents: gasto,
            total_gasto: emReais(gasto),
            primeiro_pedido_em: cliente.first_order_at,
            ultimo_pedido_em: cliente.last_order_at,
            observacoes: cliente.notes,
            etiquetas: cliente.tags ?? [],
            aceita_campanha: Boolean(cliente.marketing_opt_in),
          },
          texto,
        });
      }),
    },
  },
});
