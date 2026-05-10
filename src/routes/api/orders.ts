import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-api-key, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/orders")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers: cors }),
      POST: async ({ request }) => {
        const headerKey = request.headers.get("x-api-key") ?? "";
        const auth = request.headers.get("authorization") ?? "";
        const apiKey = (headerKey || auth.replace(/^Bearer\s+/i, "")).trim();
        
        let body: any;
        try { body = await request.json(); } catch {
          return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400, headers: cors });
        }

        // Final key check (either from header or body)
        const finalKey = (apiKey || body?.api_key || "").trim();
        if (!finalKey) {
          return new Response(JSON.stringify({ error: "API Key ausente" }), { status: 401, headers: cors });
        }

        const { data: pz, error: pErr } = await supabaseAdmin
          .from("pizzerias")
          .select("id")
          .eq("api_key", finalKey)
          .eq("status", "active")
          .maybeSingle();

        if (pErr || !pz) {
          return new Response(JSON.stringify({ error: "API Key inválida" }), { status: 401, headers: cors });
        }

        const customer = body.customer ?? {};
        const customerName = customer.name ?? body.customer_name ?? "Cliente Externo";
        const customerPhone = customer.phone ?? body.customer_phone ?? "";
        const customerAddress = customer.address ?? body.customer_address ?? "";
        
        const items = body.items ?? [];
        const total = Number(body.total ?? items.reduce((acc: number, item: any) => acc + (item.price * item.qty), 0));

        // Insert Order
        const { data: order, error: orderError } = await supabaseAdmin.from("orders").insert({
          tenant_id: pz.id,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_address: customerAddress,
          total: total,
          status: "novo",
          items: items, // Keep JSONB for compatibility
        }).select("id").single();

        if (orderError) {
          console.error("Order error:", orderError);
          return new Response(JSON.stringify({ error: orderError.message }), { status: 500, headers: cors });
        }

        // Insert Order Items if table exists and we have items
        if (items.length > 0) {
          const orderItems = items.map((item: any) => ({
            order_id: order.id,
            product_name: item.name ?? "Produto",
            quantity: Number(item.qty ?? 1),
            price: Number(item.price ?? 0),
          }));

          const { error: itemsError } = await supabaseAdmin.from("order_items").insert(orderItems);
          if (itemsError) {
            console.error("Items error:", itemsError);
          }
        }

        return new Response(JSON.stringify({ success: true, order_id: order.id }), { status: 200, headers: cors });
      },
    },
  },
});
