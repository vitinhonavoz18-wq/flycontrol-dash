/**
 * Dispara um pedido de mentira para o webhook do FIQON, para o lojista testar
 * a integração.
 *
 * COMO ELE CONFERIA QUEM ESTAVA PEDINDO — E POR QUE ISSO NÃO SERVE MAIS
 *
 * A identificação era a chave de API colada no corpo do pedido. Duas coisas
 * pioraram isso: a chave vazou (ela ficava visível em telas do painel e chegou
 * a sair pelo cardápio público), e nós tiramos a chave de todas as telas —
 * então nem o dono legítimo a tem mais em mãos.
 *
 * Chave que todo mundo pode ter não identifica ninguém: é o crachá xerocado na
 * portaria. Agora vale a mesma porta do resto do painel — a conta do dono da
 * loja, ou a do administrador da plataforma.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireOwnerOrAdmin } from "@/integrations/supabase/adminGuard.server";

const cors = { "Content-Type": "application/json" };

export const Route = createFileRoute("/api/pizzerias/fiqon-test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json();
        const { pizzeria_id } = body;

        if (!pizzeria_id) {
          return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
        }

        try {
          await requireOwnerOrAdmin(request, cors, String(pizzeria_id), supabaseAdmin as any);
        } catch (respostaDaPortaria) {
          if (respostaDaPortaria instanceof Response) return respostaDaPortaria;
          throw respostaDaPortaria;
        }

        const { data: pz, error: pErr } = await supabaseAdmin
          .from("pizzerias")
          .select("id, name, slug, fiqon_webhook_url")
          .eq("id", pizzeria_id)
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
