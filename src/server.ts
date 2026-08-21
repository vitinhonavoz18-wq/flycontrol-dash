import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

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

/**
 * Cabeçalhos de segurança em toda resposta.
 *
 * São instruções para o navegador do cliente, não para o nosso servidor. Cada
 * uma fecha um truque conhecido:
 *
 * - `X-Frame-Options` / `frame-ancestors`: impede que alguém coloque o painel
 *   dentro de uma página falsa e engane o dono da loja a clicar em "excluir"
 *   achando que está clicando em outra coisa (é o golpe da porta com a
 *   plaquinha trocada);
 * - `X-Content-Type-Options`: impede o navegador de "adivinhar" que um arquivo
 *   enviado é, na verdade, um programa;
 * - `Strict-Transport-Security`: o navegador passa a exigir conexão segura,
 *   mesmo se alguém tentar empurrar o endereço sem cadeado;
 * - `Referrer-Policy`: ao clicar num link para fora, o site de destino não
 *   recebe o endereço completo da página de onde a pessoa saiu (que pode ter
 *   número de pedido ou identificador de loja);
 * - `Permissions-Policy`: a página não pede câmera, microfone nem localização.
 *
 * Nada aqui bloqueia script da própria aplicação — a política de conteúdo
 * (CSP) completa ficou de fora de propósito, porque o painel usa scripts
 * embutidos e uma regra apertada demais derrubaria telas legítimas.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy": "frame-ancestors 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

function withSecurityHeaders(response: Response): Response {
  // Resposta sem corpo alterável (redirect 3xx com corpo nulo) continua
  // funcionando: só os cabeçalhos são copiados.
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(brandedErrorResponse());
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
