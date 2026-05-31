import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/pizzerias/fiqon-test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Obter auth/token para validar que é o dono (simplificado aqui para usar api_key ou validar via profile se possível)
        // Como é um endpoint de servidor, podemos pedir a API Key ou validar a sessão se o tanstack router permitir.
        // No entanto, para simplicidade e segurança, vamos esperar o payload com a API Key da pizzaria.
        
        const body = await request.json();
        const { pizzeria_id, api_key } = body;

        if (!pizzeria_id || !api_key) {
          return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
        }

        const { data: pz, error: pErr } = await supabaseAdmin
          .from("pizzerias")
          .select("*")
          .eq("id", pizzeria_id)
          .eq("api_key", api_key)
          .single();

        if (pErr || !pz) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        }

        if (!pz.fiqon_webhook_url) {
          return new Response(JSON.stringify({ error: "Webhook URL not configured" }), { status: 400 });
        }

        const payload = {
          event: "order.created",
          source: "flycontrol_manual_test",
          restaurant: {
            slug: pz.slug,
            name: pz.name
          },
          order: {
            id: "TEST-" + Math.random().toString(36).substring(7).toUpperCase(),
            customer_name: "Teste FIQON",
            customer_phone: "(11) 99999-9999",
            address: "Rua Teste, 123",
            items: [{ name: "Pizza Teste", quantity: 1, price: 50.0 }],
            subtotal: 50.0,
            delivery_fee: 5.0,
            total: 55.0,
            payment_method: "Cartão",
            notes: "Pedido de teste manual via painel FlyControl",
            status: "novo",
            created_at: new Date().toISOString()
          }
        };

        try {
          const response = await fetch(pz.fiqon_webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });

          const respText = await response.text();
          const isSuccess = response.status >= 200 && response.status < 300;

          await supabaseAdmin.from("flycontrol_fiqon_logs").insert({
            restaurant_id: pz.id,
            fiqon_url: pz.fiqon_webhook_url,
            payload: payload,
            status_http: response.status,
            response_body: respText,
            success: isSuccess,
            error_message: isSuccess ? null : `Status ${response.status}: ${respText.substring(0, 100)}`
          });

          return new Response(JSON.stringify({ 
            success: isSuccess, 
            status: response.status,
            response: respText 
          }), { status: 200 });
        } catch (err: any) {
          await supabaseAdmin.from("flycontrol_fiqon_logs").insert({
            restaurant_id: pz.id,
            fiqon_url: pz.fiqon_webhook_url,
            payload: {},
            success: false,
            error_message: err.message
          });
          return new Response(JSON.stringify({ error: err.message }), { status: 500 });
        }
      }
    }
  }
});
