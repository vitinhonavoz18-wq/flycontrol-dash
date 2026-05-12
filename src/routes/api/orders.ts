import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-api-key, authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/orders")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers: cors }),
      POST: async ({ request }) => {
        console.log("📥 [WebHook] Recebendo pedido externo");
        
        let body: any;
        try { 
          const bodyText = await request.clone().text();
          body = JSON.parse(bodyText); 
        } catch (err) {
          console.error("❌ [WebHook] Erro: JSON inválido");
          return new Response(JSON.stringify({ success: false, error: "JSON inválido" }), { status: 400, headers: cors });
        }

        const apiKey = (request.headers.get("x-api-key") || body?.api_key || "").trim();
        const event = body.event;
        const pizzeriaSlug = body.pizzeria?.slug || body.slug;

        console.log("🔐 [WebHook] API Key presente?", Boolean(apiKey));
        console.log("🍕 [WebHook] Slug:", pizzeriaSlug);

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
          console.error("❌ [WebHook] Erro: API Key ou Slug inválidos", pErr);
          return new Response(JSON.stringify({ success: false, error: "Pizzaria não encontrada ou API Key inválida" }), { status: 403, headers: cors });
        }

        console.log("✅ [WebHook] Pizzaria encontrada:", pz.name, `(${pz.id})`);

        // 2. Tratar Webhook do SiteCreatorFly (event: order.created)
        if (event === "order.created") {
          const orderData = body.order || {};
          const customer = body.customer || {};
          const externalOrderId = orderData.id || body.id;

          console.log("📦 [WebHook] Payload order.created recebido ID:", externalOrderId);

          // Verificar duplicidade
          if (externalOrderId) {
            const { data: existing } = await supabaseAdmin
              .from("orders")
              .select("id")
              .eq("tenant_id", pz.id)
              .eq("external_order_id", String(externalOrderId))
              .maybeSingle();

            if (existing) {
              console.log("🔁 [WebHook] Pedido já existe, ignorando duplicado.");
              return new Response(JSON.stringify({ success: true, message: "Pedido já registrado anteriormente", order_id: existing.id }), { status: 200, headers: cors });
            }
          }

          const orderToInsert = {
            tenant_id: pz.id,
            external_order_id: externalOrderId ? String(externalOrderId) : null,
            customer_name: customer.name || "Cliente",
            customer_phone: customer.phone || "",
            customer_address: customer.address || "",
            neighborhood: customer.neighborhood || null,
            customer_reference: customer.reference || null,
            total: Number(orderData.total || 0),
            subtotal: Number(orderData.subtotal || orderData.total || 0),
            delivery_fee: Number(orderData.delivery_fee || 0),
            payment_method: orderData.payment_method || "Não informado",
            change_for: orderData.change_for ? Number(orderData.change_for) : null,
            delivery_type: orderData.delivery_type || "delivery",
            notes: orderData.notes || "",
            whatsapp_message: orderData.whatsapp_message || null,
            status: "novo",
            source: body.source || "sitecreatorfly",
            items: orderData.items || [],
          };

          const { data: order, error: orderError } = await supabaseAdmin
            .from("orders")
            .insert(orderToInsert)
            .select("id")
            .single();

          if (orderError) {
            console.error("❌ [WebHook] Erro ao salvar pedido:", orderError);
            await logExternalOrder(apiKey, body, 500, orderError.message);
            return new Response(JSON.stringify({ success: false, error: "Erro interno ao salvar pedido", details: orderError.message }), { status: 500, headers: cors });
          }
          
          console.log("💾 [WebHook] Pedido salvo com sucesso ID:", order.id);
          await logExternalOrder(apiKey, body, 200);
          return new Response(JSON.stringify({ success: true, order_id: order.id, message: "Pedido recebido com sucesso" }), { status: 200, headers: cors });
        }

        // 3. Tratar Formato Antigo/Simples (fallback)
        console.log("📦 [WebHook] Payload genérico recebido");
        const customerName = body.customer_name || body.customerName || "Cliente Externo";
        const items = body.items || [];
        const externalId = body.order_id || body.external_id || body.id || null;

        const { data: order, error: orderError } = await (supabaseAdmin.from("orders") as any).insert({
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
          source: body.source || "external",
          items: items,
        }).select("id").single();

        if (orderError) {
          console.error("❌ [WebHook] Erro ao salvar pedido genérico:", orderError);
          await logExternalOrder(apiKey, body, 500, orderError.message);
          return new Response(JSON.stringify({ success: false, error: orderError.message }), { status: 500, headers: cors });
        }

        console.log("💾 [WebHook] Pedido genérico salvo com sucesso ID:", order.id);
        await logExternalOrder(apiKey, body, 200);
        return new Response(JSON.stringify({ success: true, order_id: order.id, message: "Pedido recebido com sucesso" }), { status: 200, headers: cors });
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
