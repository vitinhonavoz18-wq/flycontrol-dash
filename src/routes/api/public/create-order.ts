import { createFileRoute } from "@tanstack/react-router";

const getCorsHeaders = (request?: Request) => {
  const origin = request?.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, accept",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "true",
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