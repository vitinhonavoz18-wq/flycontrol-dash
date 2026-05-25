import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Função auxiliar para gerar headers CORS robustos
const getCorsHeaders = (request?: Request) => {
  const origin = request?.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, accept",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json",
  };
};

export const Route = createFileRoute("/api/orders")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        return new Response(null, { 
          status: 204, 
          headers: getCorsHeaders(request) 
        });
      },
      POST: async ({ request }) => {
        const cors = getCorsHeaders(request);
        const origin = request.headers.get("origin") || "N/A";
        
        // Coleta de headers para log (ocultando segredos)
        const headersLog: Record<string, string> = {};
        request.headers.forEach((v, k) => {
          if (k.toLowerCase() === "authorization" || k.toLowerCase() === "x-api-key") {
            headersLog[k] = v.substring(0, 10) + "...";
          } else {
            headersLog[k] = v;
          }
        });

        console.log("📥 [API/Orders] Nova requisição recebida");
        console.log(`🌐 Origem: ${origin}`);
        console.log(`📋 Headers:`, JSON.stringify(headersLog));

        let body: any;
        try {
          const bodyText = await request.clone().text();
          body = JSON.parse(bodyText);
          console.log("📦 Payload recebido (simplificado):", JSON.stringify({
            customer: body.customer?.name || body.customer_name,
            total: body.order?.total || body.total,
            items_count: (body.order?.items || body.items || []).length
          }));
        } catch (err) {
          console.error("❌ [API/Orders] JSON inválido no corpo da requisição");
          return new Response(JSON.stringify({ 
            success: false, 
            error: "Corpo da requisição deve ser um JSON válido" 
          }), { status: 400, headers: cors });
        }

        const authHeader = request.headers.get("authorization") || "";
        const apiKey = (
          (authHeader.startsWith("Bearer ") ? authHeader.substring(7) : "") || 
          request.headers.get("x-api-key") || 
          body?.api_key || 
          ""
        ).trim();

        console.log(`🔑 API Key presente: ${apiKey ? "Sim" : "Não"}`);

        if (!apiKey) {
          console.error("❌ [API/Orders] Erro: API Key não fornecida");
          return new Response(JSON.stringify({ 
            success: false, 
            error: "API Key ausente. Envie via header 'x-api-key', 'Authorization: Bearer KEY' ou no JSON como 'api_key'." 
          }), { status: 401, headers: cors });
        }

        // 1. Identificar Pizzaria apenas pela API Key
        console.log(`🔍 [API/Orders] Validando API Key no banco...`);
        const { data: pz, error: pErr } = await supabaseAdmin
          .from("pizzerias")
          .select("id, name, slug, status, is_active")
          .eq("api_key", apiKey)
          .neq("status", "deleted")
          .maybeSingle();

        if (pErr) {
          console.error("❌ [API/Orders] Erro de banco ao buscar pizzaria:", pErr.message);
          return new Response(JSON.stringify({ 
            success: false, 
            error: "Erro interno ao processar validação da loja",
            details: pErr.message
          }), { status: 500, headers: cors });
        }

        if (!pz) {
          console.error("❌ [API/Orders] API Key não encontrada ou loja excluída");
          return new Response(JSON.stringify({ 
            success: false, 
            error: "API Key inválida ou loja não encontrada" 
          }), { status: 403, headers: cors });
        }

        // IMPORTANTE: Não bloqueamos o recebimento se a loja estiver inativa (assinatura vencida)
        // O bloqueio deve ser apenas no painel administrativo do dono.
        console.log(`✅ [API/Orders] Pizzaria identificada: ${pz.name} (ID: ${pz.id}) - Status: ${pz.status}, Ativa: ${pz.is_active}`);

        // 2. Extrair e normalizar dados do pedido
        const orderData = body.order || body || {};
        const customer = body.customer || body || {};
        const externalOrderId = orderData.id || body.order_id || body.id || null;
        const items = orderData.items || body.items || [];

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
          customer_name: customer.name || customer.customer_name || body.customer_name || "Cliente Site",
          customer_phone: customer.phone || customer.customer_phone || body.customer_phone || "",
          customer_address: customer.address || customer.customer_address || body.customer_address || "Não informado",
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

        console.log("💾 [API/Orders] Salvando pedido no banco...");
        const { data: order, error: orderError } = await (supabaseAdmin.from("orders") as any)
          .insert(orderToInsert)
          .select("id")
          .single();

        if (orderError) {
          console.error("❌ [API/Orders] Erro ao salvar pedido principal:", orderError.message);
          await logExternalOrder(apiKey, body, 500, `Erro insert: ${orderError.message}`);
          return new Response(JSON.stringify({ 
            success: false, 
            error: "Falha ao registrar pedido no banco de dados",
            details: orderError.message 
          }), { status: 500, headers: cors });
        }
        
        console.log(`✅ [API/Orders] Pedido salvo com sucesso! ID Interno: ${order.id}`);

        // 3. Salvar itens detalhados (opcional, não bloqueia o sucesso)
        if (Array.isArray(items) && items.length > 0) {
          try {
            const orderItemsToInsert = items.map((it: any) => ({
              order_id: order.id,
              pizzeria_id: pz.id,
              product_name: it.product_name || it.name || it.title || "Item",
              product_type: it.product_type || it.type || "produto",
              quantity: Number(it.quantity || it.qty || 1),
              unit_price: parseMoney(it.unit_price || it.price || 0),
              total_price: parseMoney(it.total_price || 0),
              discount: parseMoney(it.discount || 0),
              observations: it.observations || it.obs || it.notes || ""
            }));

            const { error: itemsError } = await (supabaseAdmin.from("order_items") as any).insert(orderItemsToInsert);
            if (itemsError) console.warn("⚠️ [API/Orders] Erro ao salvar itens do pedido:", itemsError.message);
          } catch (err) {
            console.warn("⚠️ [API/Orders] Exceção ao processar itens:", err);
          }
        }

        // Registrar log de sucesso
        await logExternalOrder(apiKey, body, 200);

        return new Response(JSON.stringify({ 
          success: true, 
          order_id: order.id, 
          message: "Pedido recebido pelo FlyControl" 
        }), { status: 200, headers: cors });
      },
    },
  },
});

async function logExternalOrder(apiKey: string, payload: any, statusCode: number, errorMessage?: string) {
  try {
    const partialKey = apiKey ? `${apiKey.substring(0, 4)}***${apiKey.slice(-4)}` : "N/A";
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
