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
          console.error("Erro: JSON inválido no corpo da requisição");
          return new Response(JSON.stringify({ success: false, error: "JSON inválido" }), { status: 400, headers: cors });
        }

        const headerKey = request.headers.get("x-api-key") ?? "";
        const auth = request.headers.get("authorization") ?? "";
        const apiKeyFromAuth = auth.startsWith("Bearer ") ? auth.substring(7) : auth;
        const apiKey = (headerKey || apiKeyFromAuth || body?.api_key || "").trim();
        
        console.log("API Key recebida (parcial):", apiKey ? `${apiKey.substring(0, 4)}...` : "Não informada");
        console.log("Payload recebido:", JSON.stringify(body, null, 2));

        if (!apiKey) {
          await logExternalOrder(apiKey, body, 401, "API Key ausente");
          return new Response(JSON.stringify({ success: false, error: "API Key ausente" }), { status: 401, headers: cors });
        }

        const { data: pz, error: pErr } = await supabaseAdmin
          .from("pizzerias")
          .select("id, name")
          .eq("api_key", apiKey)
          .eq("status", "active")
          .maybeSingle();

        if (pErr || !pz) {
          console.error("Erro ao buscar pizzaria ou API Key inválida:", pErr);
          await logExternalOrder(apiKey, body, 401, "API Key inválida ou pizzaria inativa");
          return new Response(JSON.stringify({ success: false, error: "API Key inválida ou pizzaria inativa" }), { status: 401, headers: cors });
        }

        console.log("Pizzaria encontrada:", pz.name, `(ID: ${pz.id})`);

        // Mapping flexible payload
        const customer = body.customer ?? {};
        const customerName = customer.name ?? body.customer_name ?? body.customerName ?? "Cliente Externo";
        const customerPhone = customer.phone ?? body.customer_phone ?? body.customerPhone ?? body.phone ?? "";
        const addrRaw = customer.address ?? body.customer_address ?? body.address ?? "";
        
        let customerAddress = "";
        let neighborhood = body.neighborhood ?? null;

        if (typeof addrRaw === "string") {
          customerAddress = addrRaw;
        } else if (typeof addrRaw === "object" && addrRaw !== null) {
          customerAddress = [addrRaw.street, addrRaw.number].filter(Boolean).join(", ");
          neighborhood = addrRaw.neighborhood ?? neighborhood;
        }

        const items = body.items ?? [];
        const total = Number(body.total ?? body.total_amount ?? body.totalAmount ?? 0);
        const paymentMethod = body.payment_method ?? body.paymentMethod ?? "Não informado";
        const notes = body.notes ?? body.observations ?? "";
        const deliveryFee = Number(body.delivery_fee ?? body.deliveryFee ?? 0);
        const externalId = body.order_id ?? body.external_id ?? body.id ?? null;

        // Insert Order
        const { data: order, error: orderError } = await supabaseAdmin.from("orders").insert({
          tenant_id: pz.id,
          external_order_id: externalId ? String(externalId) : null,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_address: customerAddress,
          neighborhood: neighborhood,
          total: total,
          delivery_fee: deliveryFee,
          payment_method: paymentMethod,
          notes: notes,
          status: "novo",
          items: items, // JSONB backup
        }).select("id").single();

        if (orderError) {
          console.error("Erro ao criar pedido na tabela orders:", orderError);
          await logExternalOrder(apiKey, body, 500, orderError.message);
          return new Response(JSON.stringify({ success: false, error: orderError.message }), { status: 500, headers: cors });
        }

        console.log("Pedido criado na tabela orders com ID:", order.id);

        // Insert Order Items if we have items
        if (Array.isArray(items) && items.length > 0) {
          const orderItems = items.map((item: any) => ({
            order_id: order.id,
            product_name: item.name ?? item.product_name ?? "Produto",
            quantity: Number(item.quantity ?? item.qty ?? 1),
            price: Number(item.price ?? 0),
          }));

          const { error: itemsError } = await supabaseAdmin.from("order_items").insert(orderItems);
          if (itemsError) {
            console.error("Erro ao criar itens na tabela order_items:", itemsError);
            // We don't fail the whole request if items fail but order succeeded
          } else {
            console.log("Itens criados na tabela order_items");
          }
        }

        console.log("Pedido externo finalizado com sucesso");
        await logExternalOrder(apiKey, body, 200);

        return new Response(JSON.stringify({ 
          success: true, 
          order_id: order.id,
          message: "Pedido recebido com sucesso pelo FlyControl" 
        }), { status: 200, headers: cors });
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
