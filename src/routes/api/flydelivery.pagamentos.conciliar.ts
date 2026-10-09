/**
 * Faxina periódica do Pix: reconfere na SyncPay os pagamentos que ficaram
 * pendentes ou incertos e vence os pedidos que ninguém pagou.
 *
 *   POST /api/flydelivery/pagamentos/conciliar
 *   x-reconcile-secret: <FLYDELIVERY_RECONCILE_SECRET>
 *
 * Deve ser chamado por um agendador EXTERNO a cada 10 minutos (ex.: um fluxo
 * do n8n com "Schedule Trigger" + "HTTP Request"). É a rede de segurança para
 * o aviso da SyncPay que se perdeu — além dela, o próprio aplicativo provoca
 * uma reconferência enquanto o cliente espera, e o administrador tem o botão
 * "Reconferir pendentes agora".
 *
 * Por que não o agendador do próprio Worker: no build atual (TanStack Start +
 * nitro), o `scheduled()` de src/server.ts não é ligado ao Worker publicado —
 * ver a nota no relatório da integração.
 */

import { createFileRoute } from "@tanstack/react-router";
import { dependenciasReais } from "@/lib/flydelivery/pagamentos/banco.server";
import { conciliarPendentes } from "@/lib/flydelivery/pagamentos/pix.server";
import { iguaisEmTempoConstante } from "@/lib/flydelivery/pagamentos/webhook";

export const Route = createFileRoute("/api/flydelivery/pagamentos/conciliar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const deps = dependenciasReais();
        const segredo = deps.config.segredoDaConciliacao;
        const recebido = (request.headers.get("x-reconcile-secret") ?? "").trim();
        if (!segredo || !iguaisEmTempoConstante(recebido, segredo)) {
          return new Response(JSON.stringify({ ok: false }), { status: 401 });
        }
        if (!deps.config.clientId || !deps.config.clientSecret) {
          return new Response(JSON.stringify({ ok: true, pulado: "syncpay_nao_configurada" }), {
            status: 200,
          });
        }
        const resumo = await conciliarPendentes(deps);
        return new Response(JSON.stringify({ ok: true, ...resumo }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
