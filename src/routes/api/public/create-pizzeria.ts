import { createFileRoute } from "@tanstack/react-router";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-api-key, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// Endpoint antigo: criava uma empresa sem pedir nenhuma senha ou identificação
// — qualquer pessoa que descobrisse este endereço conseguia criar uma empresa
// nova, com chave de API própria, sem se identificar. Nenhum lugar do sistema
// chama mais esta rota; a criação de empresa hoje passa por
// `/api/pizzerias/create`, que exige login de administrador.
export const Route = createFileRoute("/api/public/create-pizzeria")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers: cors }),
      POST: async () =>
        new Response(
          JSON.stringify({
            error:
              "Endpoint antigo desativado. Use /api/pizzerias/create (requer login de administrador).",
            new_endpoint: "/api/pizzerias/create",
          }),
          { status: 410, headers: cors },
        ),
    },
  },
});
