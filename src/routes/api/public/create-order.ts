import { createFileRoute } from "@tanstack/react-router";

const getCorsHeaders = (request?: Request) => {
  const origin = request?.headers.get("origin") || "*";
  // O navegador NÃO deve mandar cookie nem sessão junto: estas rotas são
  // abertas de propósito (o site de pedidos chama de qualquer domínio) e se
  // identificam pela chave da loja ou pelo segredo da comanda, nunca pelo
  // cookie de quem está com a aba aberta. Devolver a origem de quem chamou
  // JUNTO com "pode mandar credencial" seria o mesmo que o porteiro aceitar
  // qualquer pessoa que diga "sou eu" e ainda entregar a chave.
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, accept",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  };
};

export const Route = createFileRoute("/api/public/create-order")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => new Response(null, { status: 204, headers: getCorsHeaders(request) }),
      POST: async ({ request }) => {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "Endpoint antigo desativado. Use /api/orders.",
          new_endpoint: "/api/orders"
        }), { status: 410, headers: getCorsHeaders(request) });
      },
    },
  },
});