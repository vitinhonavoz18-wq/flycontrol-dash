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
        console.log("--- Recebendo pedido externo ---");
        
        let body: any;
        const bodyText = await request.clone().text();
        try { 
          body = JSON.parse(bodyText); 
        } catch {
          console.error("Erro: JSON inválido");
          return new Response(JSON.stringify({ success: false, error: "JSON inválido" }), { status: 400, headers: cors });
        }

        const apiKey = (request.headers.get("x-api-key") || body?.api_key || "").trim();
        const event = body.event;
        const pizzeriaSlug = body.pizzeria?.slug;

        console.log("Meta:", { event, slug: pizzeriaSlug, apiKeyPartial: apiKey ? `${apiKey.substring(0, 6)}...` : "NONE" });

        if (!apiKey) {
          return new Response(JSON.stringify({ success: false, error: "API Key ausente" }), { status: 401, headers: cors });
        }

        // 1. Identificar Pizzaria
        let pzQuery = supabaseAdmin.from("pizzerias").select("id, name, slug").eq("api_key", apiKey).eq("status", "active");
        
        if (pizzeriaSlug) {
          pzQuery = pzQuery.eq("slug", pizzeriaSlug);
        }

        const { data: pz, error: pErr } = await pzQuery.maybeSingle();

        if (pErr || !pz) {
          console.error("Erro: API Key ou Slug inválidos", pErr);
          return new Response(JSON.stringify({ success: false, error: "API Key inválida ou pizzaria não encontrada" }), { status: 403, headers: cors });
        }

        // 2. Tratar Webhook do SiteCreatorFly (event: order.created)
        if (event === "order.created") {
          const orderData = body.order || {};
          const customer = body.customer || {};
          const externalOrderId = orderData.id || body.id;

          // Duplicidade
          if (externalOrderId) {
            const { data: existing } = await supabaseAdmin
              .from("orders")
              .select("id")
              .eq("tenant_id", pz.id)
              .eq("external_order_id", String(externalOrderId))
              .maybeSingle();

            if (existing) {
              return new Response(JSON.stringify({ success: true, message: "Pedido já existe", order_id: existing.id }), { status: 200, headers: cors });
            }
          }

          const { data: order, error: orderError } = await supabaseAdmin.from("orders").insert({
            tenant_id: pz.id,
            external_order_id: externalOrderId ? String(externalOrderId) : null,
            customer_name: customer.name || "Cliente",
            customer_phone: customer.phone || "",
            customer_address: customer.address || "",
            neighborhood: customer.neighborhood || null,
            total: Number(orderData.total || 0),
            delivery_fee: Number(orderData.delivery_fee || 0),
            payment_method: orderData.payment_method || "Não informado",
            change_for: orderData.change_for ? Number(orderData.change_for) : null,
            notes: orderData.notes || "",
            status: "novo",
            items: orderData.items || [],
          }).select("id").single();

          if (orderError) return new Response(JSON.stringify({ success: false, error: orderError.message }), { status: 500, headers: cors });
          
          await logExternalOrder(apiKey, body, 200);
          return new Response(JSON.stringify({ success: true, order_id: order.id, message: "Pedido recebido" }), { status: 200, headers: cors });
        }

        // 3. Tratar Formato Antigo/Simples (fallback)
        const customerName = body.customer_name || body.customerName || "Cliente Externo";
        const items = body.items || [];
        const externalId = body.order_id || body.external_id || body.id || null;

        const { data: order, error: orderError } = await supabaseAdmin.from("orders").insert({
          tenant_id: pz.id,
          external_order_id: externalId ? String(externalId) : null,
          customer_name: customerName,
          customer_phone: body.customer_phone || body.phone || "",
          customer_address: body.customer_address || body.address || "",
          neighborhood: body.neighborhood || null,
          total: Number(body.total || 0),
          delivery_fee: Number(body.delivery_fee || 0),
          payment_method: body.payment_method || "Não informado",
          status: "novo",
          items: items,
        }).select("id").single();

        if (orderError) {
          await logExternalOrder(apiKey, body, 500, orderError.message);
          return new Response(JSON.stringify({ success: false, error: orderError.message }), { status: 500, headers: cors });
        }

        await logExternalOrder(apiKey, body, 200);
        return new Response(JSON.stringify({ success: true, order_id: order.id }), { status: 200, headers: cors });
      },
    },
  },
});

async function logExternalOrder(apiKey: string, payload: any, statusCode: number, errorMessage?: string) {
  try {
    const partialKey = apiKey ? `${apiKey.substring(0, 4)}***` : null;
    await supabaseAdmin.from("external_order_logs").insert({
      api_key_partial: partialKey,
      payload: payload,
      status_code: statusCode,
      error_message: errorMessage
    });
  } catch (err) {
    console.error("Erro ao salvar log de pedido externo:", err);
  }
}
