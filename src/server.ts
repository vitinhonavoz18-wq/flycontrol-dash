import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { runDailyBillingCron } from "./lib/billing/dailyCron";
import { renderErrorPage } from "./lib/error-page";
import { ehPedidoDeMidia, entregarMidia } from "./lib/midia/entregarMidia";

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

// ATENÇÃO: no pacote publicado (Nitro, preset cloudflare-module) a porta de
// entrada do Worker é a do Nitro, não este arquivo. O `scheduled` abaixo NÃO
// é chamado pela Cloudflare — quem recebe o despertador diário é o plugin
// `src/nitro/billingCron.plugin.ts`. Fica aqui só para um build sem Nitro.

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // Fotos e vídeos do cardápio: atalho direto para a "geladeira", sem
    // montar o sistema inteiro de páginas. É o pedido mais repetido do
    // servidor — cada cliente que abre o cardápio pede dezenas deles.
    if (ehPedidoDeMidia(request)) {
      try {
        return await entregarMidia(request);
      } catch (error) {
        console.error("[midia] atalho falhou, seguindo pelo caminho normal:", error);
      }
    }
    try {
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
