import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { provisionRestaurantInSF } from "@/integrations/sitecreatorfly/provision.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
};

function genKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "fc_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || `pz-${Date.now()}`;
}


export const Route = createFileRoute("/api/pizzerias/create")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(JSON.stringify({ success: true, message: "CORS OK" }), { status: 200, headers: cors }),
      POST: async ({ request }) => {
        let body: any;
        try { body = await request.json(); } catch {
          return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400, headers: cors });
        }
        const name = String(body?.name ?? "").trim();
        let slug = String(body?.slug ?? "").trim().toLowerCase();
        if (!slug && name) slug = slugify(name);
        const phone = String(body?.phone ?? "").trim();
        const address = String(body?.address ?? "").trim();
        const owner_id = String(body?.owner_id || "").trim();
        const owner_name = String(body?.owner_name ?? "").trim();
        const business_type = String(body?.business_type ?? "pizzeria").trim();
        const selected_template = String(body?.selected_template ?? "default").trim();

        if (!name || !slug) {
          return new Response(JSON.stringify({ error: "name e slug obrigatórios" }), { status: 400, headers: cors });
        }

        const { data: existing } = await supabaseAdmin
          .from("pizzerias").select("id, api_key").eq("slug", slug).maybeSingle();

        if (existing) {
          return new Response(JSON.stringify({
            tenant_id: existing.id,
            api_key: existing.api_key,
            order_endpoint: new URL("/api/orders", request.url).toString(),
          }), { status: 200, headers: cors });
        }

        const api_key = String(body?.api_key || "").trim() || genKey();

        const insertData: any = {
          name,
          slug,
          phone: phone || null,
          address: address || null,
          api_key,
          status: "active",
        };
        if (owner_id) insertData.owner_id = owner_id;

        const { data, error } = await supabaseAdmin
          .from("pizzerias")
          .insert(insertData)
          .select("id, api_key")
          .single();

        if (error || !data) {
          return new Response(JSON.stringify({ error: error?.message ?? "Falha ao criar" }), { status: 500, headers: cors });
        }

        // Auto-provision the restaurant in SiteCreatorFly.
        // On failure: keep the pizzeria, mark status as `provision_pending`
        // so the operator can retry later, and log the error.
        const provision = await provisionRestaurantInSF({
          flycontrol_id: data.id,
          name,
          slug,
          owner_name,
          business_type,
          selected_template,
          api_key: data.api_key,
        });

        if (provision.ok) {
          const update: any = {
            provisioned_at: new Date().toISOString(),
            provision_error: null,
            status: "active",
          };
          if (provision.sf_restaurant_id) update.sf_restaurant_id = provision.sf_restaurant_id;
          if (provision.menu_sync_token) update.menu_sync_token = provision.menu_sync_token;
          if (provision.public_url) update.public_url = provision.public_url;
          if (provision.sync_endpoint) update.sync_endpoint = provision.sync_endpoint;

          const { error: updErr } = await supabaseAdmin
            .from("pizzerias").update(update).eq("id", data.id);
          if (updErr) {
            console.error("[Provision] Failed to persist SF fields:", updErr);
          }

          return new Response(JSON.stringify({
            tenant_id: data.id,
            api_key: data.api_key,
            order_endpoint: new URL("/api/orders", request.url).toString(),
            sf_restaurant_id: provision.sf_restaurant_id ?? null,
            menu_sync_token: provision.menu_sync_token ?? null,
            public_url: provision.public_url ?? null,
            sync_endpoint: provision.sync_endpoint ?? null,
            provision_status: "provisioned",
          }), { status: 200, headers: cors });
        }

        console.error("[Provision] Marking pizzeria as provision_pending:", provision.error);
        await supabaseAdmin
          .from("pizzerias")
          .update({ status: "provision_pending", provision_error: provision.error })
          .eq("id", data.id);

        return new Response(JSON.stringify({
          tenant_id: data.id,
          api_key: data.api_key,
          order_endpoint: new URL("/api/orders", request.url).toString(),
          provision_status: "provision_pending",
          provision_error: provision.error,
        }), { status: 200, headers: cors });
      },
    },
  },
});
