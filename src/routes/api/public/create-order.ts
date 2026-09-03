import { createFileRoute } from "@tanstack/react-router";
import { publicCors } from "@/lib/server/http";

const getCorsHeaders = (request?: Request) => publicCors(request);

export const Route = createFileRoute("/api/public/create-order")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: getCorsHeaders(request) }),
      POST: async ({ request }) => {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Endpoint antigo desativado. Use /api/orders.",
            new_endpoint: "/api/orders",
          }),
          { status: 410, headers: getCorsHeaders(request) },
        );
      },
    },
  },
});
