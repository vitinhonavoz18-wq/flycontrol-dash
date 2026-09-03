/**
 * Cabeçalhos e respostas dos endereços de API (as "portas" do sistema).
 *
 * Todo endereço de API precisa dizer ao navegador quem pode chamá-lo — são os
 * cabeçalhos CORS. Essa mesma lista estava copiada em treze arquivos, com
 * pequenas diferenças entre eles. Copiar uma lista treze vezes é como ter
 * treze cópias do regulamento da casa espalhadas pelo salão: quando a regra
 * muda, uma delas fica para trás, e a diferença só aparece no dia em que um
 * pedido é recusado sem motivo aparente.
 *
 * Aqui existem dois tipos de porta, e a diferença entre elas importa:
 *
 * - **porta interna** (`adminCors`): usada por quem já está logado como
 *   administrador. Não aceita cookie do navegador e pede poucos cabeçalhos.
 *
 * - **porta de rua** (`publicCors`): usada pelo cardápio digital, que roda em
 *   outro endereço na internet. Ela devolve ao navegador o mesmo endereço de
 *   onde veio o pedido, que é o que permite o site do cliente conversar com o
 *   painel.
 */

/** Cabeçalhos das portas internas: administrador logado, origem livre. */
export function adminCors(options?: {
  methods?: string;
  headers?: string;
}): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": options?.headers ?? "authorization, content-type",
    "Access-Control-Allow-Methods": options?.methods ?? "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  };
}

/**
 * Cabeçalhos das portas de rua: devolvem a origem de quem chamou.
 *
 * Devolver a origem exata (em vez de "*") é obrigatório quando a resposta
 * aceita credenciais — o navegador recusa a combinação "qualquer origem" com
 * "pode mandar credencial".
 */
export function publicCors(
  request?: Request,
  options?: { methods?: string; headers?: string },
): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": request?.headers.get("origin") || "*",
    "Access-Control-Allow-Headers":
      options?.headers ?? "authorization, x-client-info, apikey, content-type, x-api-key, accept",
    "Access-Control-Allow-Methods": options?.methods ?? "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json",
  };
}

/** Resposta em JSON, com os cabeçalhos já no lugar. */
export function jsonResponse(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

/**
 * Resposta da pergunta que o navegador faz antes do pedido de verdade
 * (o "preflight"): "posso chamar esta porta?".
 */
export function preflightResponse(headers: Record<string, string>): Response {
  return new Response(null, { status: 204, headers });
}
