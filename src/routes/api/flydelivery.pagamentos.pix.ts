/**
 * Pix do pedido do FlyDelivery — chamado pelo APLICATIVO do cliente.
 *
 *   POST /api/flydelivery/pagamentos/pix   { checkout_id, cpf }  → gera (ou devolve) o Pix
 *   GET  /api/flydelivery/pagamentos/pix?checkout_id=...         → "já pagou?"
 *
 * Os dois exigem o login do cliente (o mesmo Fly ID do aplicativo, mandado como
 * `Authorization: Bearer <token>`). O valor NUNCA vem do aplicativo: sai da
 * sala de espera que o servidor calculou. Mandar um valor no corpo não muda
 * nada — ele é simplesmente ignorado.
 */

import { createFileRoute } from "@tanstack/react-router";
import { requireBearerCaller } from "@/integrations/supabase/adminGuard.server";
import { dependenciasReais } from "@/lib/flydelivery/pagamentos/banco.server";
import { consultarSituacao, gerarPix } from "@/lib/flydelivery/pagamentos/pix.server";

// O aplicativo não usa cookie: a autorização vai no cabeçalho. Por isso
// liberar qualquer origem aqui não abre porta nenhuma.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function responder(http: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), {
    status: http,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function quemChama(request: Request): Promise<string | Response> {
  try {
    const caller = await requireBearerCaller(request, CORS);
    return caller.userId;
  } catch (resposta) {
    if (resposta instanceof Response) return resposta;
    return responder(401, { ok: false, codigo: "login_necessario" });
  }
}

export const Route = createFileRoute("/api/flydelivery/pagamentos/pix")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async ({ request }) => {
        const clienteId = await quemChama(request);
        if (clienteId instanceof Response) return clienteId;

        const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const checkoutId = typeof corpo?.checkout_id === "string" ? corpo.checkout_id : "";

        try {
          const r = await gerarPix({ checkoutId, clienteId, cpf: corpo?.cpf }, dependenciasReais());
          return responder(r.http, r.corpo);
        } catch (falha) {
          console.error(
            "[pix-syncpay] erro ao gerar Pix:",
            falha instanceof Error ? falha.message : falha,
          );
          return responder(500, {
            ok: false,
            codigo: "erro_interno",
            mensagem: "Tente de novo em instantes.",
          });
        }
      },

      GET: async ({ request }) => {
        const clienteId = await quemChama(request);
        if (clienteId instanceof Response) return clienteId;

        const checkoutId = new URL(request.url).searchParams.get("checkout_id") ?? "";
        try {
          const r = await consultarSituacao({ checkoutId, clienteId }, dependenciasReais());
          return responder(r.http, r.corpo);
        } catch (falha) {
          console.error(
            "[pix-syncpay] erro ao consultar Pix:",
            falha instanceof Error ? falha.message : falha,
          );
          return responder(500, { ok: false, codigo: "erro_interno" });
        }
      },
    },
  },
});
