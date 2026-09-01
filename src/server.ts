import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { respostaSeNaoLancada } from "./lib/naoLancadas";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

/**
 * Disparo diário do Cloudflare Cron Trigger (ver wrangler.jsonc).
 *
 * Não repete a lógica de fechamento aqui — chama o próprio endpoint HTTP
 * já protegido pelo segredo, exatamente como qualquer outro agendador
 * externo faria. Um único caminho de fechamento, testado uma vez só.
 */
async function runDailyBillingCron(env: Record<string, string | undefined>): Promise<void> {
  const base = (env.FLYCONTROL_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  const secret = (env.BILLING_CRON_SECRET || "").trim();

  if (!base || !secret) {
    console.error(
      "[cron] FLYCONTROL_PUBLIC_URL ou BILLING_CRON_SECRET ausente — fechamento de ciclos não disparado.",
    );
    return;
  }

  try {
    const resp = await fetch(`${base}/api/billing/close-cycles`, {
      method: "POST",
      headers: { "x-billing-cron-secret": secret },
    });
    console.log(`[cron] fechamento de ciclos: status ${resp.status}`);
  } catch (error) {
    console.error("[cron] falha ao disparar o fechamento de ciclos:", error);
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // Funcionalidade ainda não lançada: 503 antes de qualquer coisa.
      //
      // A checagem mora AQUI, na porta de entrada do servidor, e não dentro da
      // rota. Tentar lançar a resposta de dentro do `beforeLoad` da rota não
      // funciona: o TanStack tenta serializar o valor lançado para mandar ao
      // navegador, um `Response` não é serializável, e o que chega ao visitante
      // é um 500 com "Seroval Error" — testado e descartado.
      const naoLancada = respostaSeNaoLancada(request.url);
      if (naoLancada) return naoLancada;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },

  async scheduled(
    _event: unknown,
    env: Record<string, string | undefined>,
    ctx: { waitUntil: (promise: Promise<unknown>) => void },
  ) {
    ctx.waitUntil(runDailyBillingCron(env));
  },
};
