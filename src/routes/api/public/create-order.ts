import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
        const headerKey = request.headers.get("x-api-key") ?? "";
        const auth = request.headers.get("authorization") ?? "";
        const apiKey = (headerKey || auth.replace(/^Bearer\s+/i, "")).trim();
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "API Key ausente" }), { status: 401, headers: cors });
        }

        const { data: pz, error: pErr } = await supabaseAdmin
          .from("pizzerias").select("id").eq("api_key", apiKey).eq("status", "active").maybeSingle();
        if (pErr || !pz) {
          return new Response(JSON.stringify({ error: "API Key inválida" }), { status: 403, headers: cors });
        }

        let body: any;
        try { body = await request.json(); } catch {
          return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400, headers: cors });
        }

        const customerName = body?.customer?.name ?? body?.customer_name ?? "";
        const customerPhone = body?.customer?.phone ?? body?.customer_phone ?? "";
        const addr = body?.address ?? {};
        const customerAddress = typeof addr === "string"
          ? addr
          : [addr.street, addr.number].filter(Boolean).join(", ");
        const neighborhood = (typeof addr === "object" ? addr.neighborhood : null) ?? body?.neighborhood ?? null;

        const { data, error } = await supabaseAdmin.from("orders").insert({
          tenant_id: pz.id,
          external_order_id: body.order_id ?? null,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_address: customerAddress,
          neighborhood,
          items: body.items ?? [],
          total: Number(body.total ?? 0),
          delivery_fee: Number(body.delivery_fee ?? 0),
          payment_method: body.payment_method ?? null,
          change_for: body.change_for ?? null,
          notes: body.notes ?? "",
          status: "novo",
        }).select("id").single();

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
        }
        return new Response(JSON.stringify({ success: true, id: data.id }), { status: 200, headers: cors });
      },
    },
  },
});
