import { createFileRoute } from "@tanstack/react-router";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-api-key, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/public/create-order")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers: cors }),
      POST: async ({ request }) => {
        // Redireciona internamente para o novo endpoint centralizado
        // OU simplesmente avisa que deve usar o novo
        return new Response(JSON.stringify({ 
          success: false, 
          error: "Endpoint antigo desativado. Use /api/orders.",
          new_endpoint: "/api/orders"
        }), { status: 410, headers: cors });
      },
    },
  },
});
