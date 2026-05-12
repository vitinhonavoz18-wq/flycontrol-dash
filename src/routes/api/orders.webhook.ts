import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-api-key, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/orders/webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers: cors }),
      POST: async ({ request }) => {
        console.log("--- WEBHOOK: Recebendo pedido externo do SiteCreatorFly ---");
        
        let body: any;
        const bodyText = await request.clone().text();
        try { 
          body = JSON.parse(bodyText); 
        } catch {
          console.error("WEBHOOK Erro: JSON inválido");
          return new Response(JSON.stringify({ success: false, error: "JSON inválido" }), { status: 400, headers: cors });
        }

        const apiKey = (request.headers.get("x-api-key") || "").trim();
        const event = body.event;
        const source = body.source;
        const pizzeriaSlug = body.pizzeria?.slug;

        console.log("Webhook Meta:", { 
          event, 
          source, 
          slug: pizzeriaSlug, 
          apiKeyPartial: apiKey ? `${apiKey.substring(0, 6)}...` : "NONE" 
        });

        if (!apiKey) {
          return new Response(JSON.stringify({ success: false, error: "API Key ausente" }), { status: 401, headers: cors });
        }

        if (event !== "order.created") {
          console.warn("Evento ignorado:", event);
          return new Response(JSON.stringify({ success: false, error: "Evento inválido" }), { status: 400, headers: cors });
        }

        // 1. Validar Pizzaria por Slug E API Key
        const { data: pz, error: pErr } = await supabaseAdmin
          .from("pizzerias")
          .select("id, name, slug")
          .eq("api_key", apiKey)
          .eq("slug", pizzeriaSlug)
          .eq("status", "active")
          .maybeSingle();

        if (pErr || !pz) {
          console.error("Erro: API Key ou Slug inválidos", pErr);
          return new Response(JSON.stringify({ success: false, error: "API Key inválida ou pizzaria não encontrada" }), { status: 403, headers: cors });
        }

        console.log("Pizzaria Autenticada:", pz.name);

        const orderData = body.order || {};
        const customer = body.customer || {};
        const externalOrderId = orderData.id || body.id;

        // 2. Verificar duplicidade (Evitar pedidos duplicados com o mesmo external_id para a mesma pizzaria)
        if (externalOrderId) {
          const { data: existing } = await supabaseAdmin
            .from("orders")
            .select("id")
            .eq("tenant_id", pz.id)
            .eq("external_order_id", String(externalOrderId))
            .maybeSingle();

          if (existing) {
            console.log("Pedido duplicado detectado (external_id):", externalOrderId);
            return new Response(JSON.stringify({ 
              success: true, 
              message: "Pedido já recebido anteriormente", 
              order_id: existing.id 
            }), { status: 200, headers: cors });
          }
        }

        // 3. Mapear Payload do SiteCreatorFly para o schema do FlyControl
        // O FlyControl usa a coluna 'items' como JSONB.
        const mappedOrder = {
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
          items: orderData.items || [], // Salvando o array completo de itens como JSONB
        };

        // 4. Inserir Pedido
        const { data: order, error: orderError } = await supabaseAdmin
          .from("orders")
          .insert(mappedOrder)
          .select("id")
          .single();

        if (orderError) {
          console.error("Erro ao salvar pedido:", orderError);
          return new Response(JSON.stringify({ success: false, error: orderError.message }), { status: 500, headers: cors });
        }

        // 5. Opcional: Inserir na tabela order_items para suporte a queries relacionais se necessário
        if (Array.isArray(orderData.items) && orderData.items.length > 0) {
          const orderItems = orderData.items.map((item: any) => ({
            order_id: order.id,
            product_name: item.name || (item.flavors ? `Pizza ${item.flavors.join("/")}` : "Item"),
            quantity: Number(item.quantity || 1),
            price: Number(item.unit_price || 0),
          }));

          const { error: itemsError } = await supabaseAdmin.from("order_items").insert(orderItems);
          if (itemsError) console.error("Erro ao salvar order_items:", itemsError);
        }

        console.log("Pedido Webhook finalizado com sucesso. ID:", order.id);

        return new Response(JSON.stringify({ 
          success: true, 
          message: "Pedido recebido com sucesso",
          order_id: order.id 
        }), { status: 200, headers: cors });
      },
    },
  },
});
