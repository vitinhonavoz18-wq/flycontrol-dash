/**
 * Repescagem do provisionamento.
 *
 * O provisionamento acontece no momento em que a assinatura fica ativa. Se o
 * SiteCreatorFly estiver fora do ar naquele instante, o estabelecimento fica
 * marcado como `failed` — e sem esta rotina ele ficaria assim para sempre,
 * esperando alguém perceber.
 *
 * Aqui a máquina percebe: roda pelo mesmo agendador do fechamento de ciclos e
 * refaz o que ficou pendente. Chamar de novo é sempre seguro, porque
 * `ensureRestaurantProvisioned` devolve o mesmo tenant.
 *
 * Protegida pelo mesmo segredo do fechamento de ciclos: é uma rotina de
 * máquina, não uma tela.
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ensureRestaurantProvisioned } from "@/lib/provisioning/ensureProvisioned.server";
import { PROVISION_FAILED, PROVISION_PENDING } from "@/lib/provisioning/provisioning";

/** Teto por execução: uma rodada travada não pode estourar o tempo do Worker. */
const MAX_POR_EXECUCAO = 25;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Comparação em tempo constante: `===` vaza o tamanho do prefixo correto. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/provisioning/retry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = (process.env.BILLING_CRON_SECRET || "").trim();
        if (!expected) {
          // Sem segredo configurado, a rota fica desligada em vez de aberta.
          return json({ error: "not_configured" }, 503);
        }

        const provided = (request.headers.get("x-billing-cron-secret") || "").trim();
        if (!provided || !timingSafeEqual(expected, provided)) {
          return json({ error: "unauthorized" }, 401);
        }

        // Só empresas com assinatura ativa: provisionar quem não pagou seria
        // entregar o cardápio de graça.
        const { data, error } = await supabaseAdmin
          .from("pizzerias")
          .select("id, name, provision_status, sf_restaurant_id, subscription_status")
          .eq("subscription_status", "active")
          .or(
            `provision_status.eq.${PROVISION_FAILED},provision_status.eq.${PROVISION_PENDING},provision_status.is.null,sf_restaurant_id.is.null`,
          )
          .limit(MAX_POR_EXECUCAO);

        if (error) {
          console.error("[provisionamento] falha ao listar pendentes:", error);
          return json({ error: "query_failed" }, 500);
        }

        const pendentes = (data ?? []) as { id: string; name: string }[];
        console.log(`[provisionamento] repescagem: ${pendentes.length} para revisar.`);

        let concluidos = 0;
        let pulados = 0;
        let falhas = 0;

        for (const empresa of pendentes) {
          // Uma empresa com problema não pode impedir a repescagem das outras.
          try {
            const resultado = await ensureRestaurantProvisioned(empresa.id);
            if (!resultado.ok) falhas++;
            else if (resultado.skipped) pulados++;
            else concluidos++;
          } catch (err) {
            falhas++;
            console.error("[provisionamento] erro inesperado em", empresa.id, err);
          }
        }

        // 207 distingue sucesso total de falha parcial para quem só olha o
        // código de status.
        return json(
          { revisados: pendentes.length, concluidos, pulados, falhas },
          falhas > 0 ? 207 : 200,
        );
      },
    },
  },
});
