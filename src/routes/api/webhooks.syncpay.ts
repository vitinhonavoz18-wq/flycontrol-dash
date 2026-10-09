/**
 * Aviso da SyncPay: "a transação X mudou de situação".
 *
 *   POST /api/webhooks/syncpay
 *
 * O corpo é lido como TEXTO BRUTO antes de qualquer coisa: a assinatura é
 * calculada sobre os bytes exatos que chegaram, e reformatar o JSON antes de
 * conferir quebraria a conta.
 *
 * O aviso é só o gatilho. Quem confirma o pagamento é a consulta que o
 * servidor faz em seguida na própria SyncPay (ver pix.server.ts). Nenhum
 * pedido vira "pago" porque um aviso disse.
 */

import { createFileRoute } from "@tanstack/react-router";
import { dependenciasReais } from "@/lib/flydelivery/pagamentos/banco.server";
import { processarAviso } from "@/lib/flydelivery/pagamentos/pix.server";

/** Aviso legítimo é pequeno. Corpo gigante é abuso. */
const TAMANHO_MAXIMO = 64 * 1024;

export const Route = createFileRoute("/api/webhooks/syncpay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const corpoBruto = await request.text();
        if (corpoBruto.length > TAMANHO_MAXIMO) {
          return new Response(JSON.stringify({ ok: false }), { status: 413 });
        }
        try {
          const r = await processarAviso(
            { corpoBruto, cabecalhos: request.headers },
            dependenciasReais(),
          );
          return new Response(JSON.stringify(r.corpo), {
            status: r.http,
            headers: { "Content-Type": "application/json" },
          });
        } catch (falha) {
          console.error(
            "[pix-syncpay] erro no aviso:",
            falha instanceof Error ? falha.message : falha,
          );
          return new Response(JSON.stringify({ ok: false }), { status: 500 });
        }
      },
    },
  },
});
