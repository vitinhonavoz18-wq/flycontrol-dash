import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/orders")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(JSON.stringify({ success: true, message: "CORS OK" }), { status: 200, headers: cors }),
      POST: async ({ request }) => {
        console.log("📥 [WebHook] Pedido recebido do SiteCreatorFly");
        
        let body: any;
        try { 
          const bodyText = await request.clone().text();
          body = JSON.parse(bodyText); 
        } catch (err) {
          console.error("❌ [WebHook] Erro detalhado: JSON inválido no corpo da requisição");
          return new Response(JSON.stringify({ success: false, error: "JSON inválido" }), { status: 400, headers: cors });
        }

        const authHeader = request.headers.get("authorization") || "";
        const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : "";
        const apiKey = (bearerToken || request.headers.get("x-api-key") || body?.api_key || "").trim();
        const pizzeriaSlug = body.pizzeria?.slug || body.pizzeria_slug || body.slug;
        
        if (!apiKey) {
          console.error("❌ [WebHook] Erro: API Key ausente");
          return new Response(JSON.stringify({ 
            success: false, 
            error: "API Key ausente ou inválida",
            debug: { hasApiKey: false }
          }), { status: 401, headers: cors });
        }

        // 1. Identificar Pizzaria - Sem filtros restritivos de status para não bloquear recebimento
        let pzQuery = supabaseAdmin
          .from("pizzerias")
          .select("id, name, slug, status, is_active")
          .eq("api_key", apiKey)
          .neq("status", "deleted");
        
        if (pizzeriaSlug) {
          pzQuery = pzQuery.eq("slug", pizzeriaSlug);
        }

        const { data: pz, error: pErr } = await pzQuery.maybeSingle();

        if (pErr) {
          console.error("❌ [WebHook] Erro detalhado de banco:", pErr.message);
          await logExternalOrder(apiKey, body, 500, `Erro DB: ${pErr.message}`);
          return new Response(JSON.stringify({ success: false, error: "Erro interno ao validar pizzaria" }), { status: 500, headers: cors });
        }

        if (!pz) {
          console.error("❌ [WebHook] Erro: Pizzaria não encontrada para esta API Key / Slug");
          await logExternalOrder(apiKey, body, 403, "Pizzaria não encontrada");
          return new Response(JSON.stringify({ success: false, error: "Pizzaria não encontrada" }), { status: 403, headers: cors });
        }

        console.log(`✅ [WebHook] Pizzaria encontrada: ${pz.name}`);

        // 2. Extrair dados do pedido
        const orderData = body.order || body || {};
        const customer = body.customer || body || {};
        const externalOrderId = orderData.id || body.order_id || body.id || null;
        const items = orderData.items || body.items || [];

        // Normalização de valores
        const parseMoney = (val: any) => {
          if (typeof val === "number") return val;
          if (typeof val === "string") {
            const num = parseFloat(val.replace(/[^\d.,]/g, "").replace(",", "."));
            return isNaN(num) ? 0 : num;
          }
          return 0;
        };

        const orderToInsert = {
          tenant_id: pz.id,
          external_order_id: externalOrderId ? String(externalOrderId) : null,
          customer_name: customer.name || customer.customer_name || body.customer_name || "Cliente",
          customer_phone: customer.phone || customer.customer_phone || body.customer_phone || "",
          customer_address: customer.address || customer.customer_address || body.customer_address || "",
          neighborhood: customer.neighborhood || body.neighborhood || null,
          customer_reference: customer.reference || body.customer_reference || null,
          total: parseMoney(orderData.total || body.total || 0),
          subtotal: parseMoney(orderData.subtotal || orderData.total || body.subtotal || body.total || 0),
          delivery_fee: parseMoney(orderData.delivery_fee || body.delivery_fee || 0),
          discount: parseMoney(orderData.discount || body.discount || 0),
          payment_method: orderData.payment_method || body.payment_method || "Não informado",
          change_for: orderData.change_for ? parseMoney(orderData.change_for) : null,
          delivery_type: orderData.delivery_type || body.delivery_type || "delivery",
          notes: orderData.notes || body.notes || "",
          whatsapp_message: orderData.whatsapp_message || body.whatsapp_message || null,
          status: "novo",
          source: body.source || "sitecreatorfly",
          items: items,
        };

        const { data: order, error: orderError } = await (supabaseAdmin.from("orders") as any)
          .insert(orderToInsert)
          .select("id")
          .single();

        if (orderError) {
          console.error("❌ [WebHook] Erro detalhado ao salvar pedido:", orderError.message);
          await logExternalOrder(apiKey, body, 500, `Erro insert: ${orderError.message}`);
          return new Response(JSON.stringify({ success: false, error: "Erro ao salvar pedido" }), { status: 500, headers: cors });
        }
        
        console.log("✅ [WebHook] Pedido salvo com sucesso");

        
        // 3. Salvar itens detalhados na tabela order_items
        if (Array.isArray(items) && items.length > 0) {
          console.log(`💾 [WebHook] Processando ${items.length} itens...`);
          try {
            const orderItemsToInsert = items.map((it: any) => {
              const unitPrice = parseMoney(it.unit_price || it.price || 0);
              const qty = Number(it.quantity || it.qty || 1);
              const disc = parseMoney(it.discount || 0);
              const totPrice = parseMoney(it.total_price || (unitPrice * qty) - disc);

              return {
                order_id: order.id,
                pizzeria_id: pz.id,
                product_name: it.product_name || it.name || it.title || "Item",
                product_type: it.product_type || it.type || "produto",
                quantity: qty,
                unit_price: unitPrice,
                total_price: totPrice,
                discount: disc,
                observations: it.observations || it.obs || it.notes || ""
              };
            });

            const { error: itemsError } = await (supabaseAdmin.from("order_items") as any).insert(orderItemsToInsert);
            
            if (itemsError) {
              console.error("⚠️ [WebHook] Erro ao salvar itens detalhados:", itemsError);
              // Não falha a requisição se o pedido principal foi salvo
            } else {
              console.log("✅ [WebHook] Itens do pedido salvos com sucesso.");
            }
          } catch (err) {
            console.warn("⚠️ [WebHook] Exceção ao processar order_items:", err);
          }
        }

        await logExternalOrder(apiKey, body, 200);
        return new Response(JSON.stringify({ 
          success: true, 
          order_id: order.id, 
          message: "Pedido recebido e processado com sucesso" 
        }), { status: 200, headers: cors });
      },
    },
  },
});

async function logExternalOrder(apiKey: string, payload: any, statusCode: number, errorMessage?: string) {
  try {
    const partialKey = apiKey ? `${apiKey.substring(0, 4)}***${apiKey.slice(-4)}` : null;
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
