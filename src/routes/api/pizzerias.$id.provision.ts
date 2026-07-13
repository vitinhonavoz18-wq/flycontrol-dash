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

export const Route = createFileRoute("/api/pizzerias/$id/provision")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(JSON.stringify({ success: true }), { status: 200, headers: cors }),

      POST: async ({ params }) => {
        const id = String(params.id || "").trim();
        if (!id) {
          return new Response(JSON.stringify({ error: "missing_id" }), { status: 400, headers: cors });
        }

        console.log("[Reprovision] START pizzeria:", id);

        const { data: pz, error: pzErr } = await supabaseAdmin
          .from("pizzerias")
          .select("id, name, slug, api_key, owner_id, sf_restaurant_id")
          .eq("id", id)
          .maybeSingle();

        if (pzErr || !pz) {
          console.error("[Reprovision] pizzeria not found:", pzErr);
          return new Response(JSON.stringify({ error: "pizzeria_not_found" }), { status: 404, headers: cors });
        }

        // Mark as pending, clear last error.
        await supabaseAdmin
          .from("pizzerias")
          .update({ provision_status: "provision_pending", provision_error: null } as any)
          .eq("id", id);

        // Try to enrich with owner_name from profiles (optional).
        let owner_name = "";
        if ((pz as any).owner_id) {
          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("full_name")
            .eq("id", (pz as any).owner_id)
            .maybeSingle();
          owner_name = String((prof as any)?.full_name ?? "");
        }

        // Idempotent: SF endpoint should upsert by flycontrol_id.
        const provision = await provisionRestaurantInSF({
          flycontrol_id: pz.id,
          name: pz.name,
          slug: pz.slug,
          owner_name,
          business_type: "pizzeria",
          selected_template: "default",
          api_key: pz.api_key,
        });

        if (provision.ok) {
          const update: any = {
            provision_status: "provisioned",
            provision_error: null,
            provisioned_at: new Date().toISOString(),
          };
          if (provision.sf_restaurant_id) update.sf_restaurant_id = provision.sf_restaurant_id;
          if (provision.menu_sync_token) update.menu_sync_token = provision.menu_sync_token;
          if (provision.public_url) update.public_url = provision.public_url;
          if (provision.sync_endpoint) update.sync_endpoint = provision.sync_endpoint;

          const { error: updErr } = await supabaseAdmin
            .from("pizzerias").update(update).eq("id", id);
          if (updErr) console.error("[Reprovision] persist error:", updErr);

          console.log("[Reprovision] SUCCESS", id, "already_existed:", provision.already_existed);
          return new Response(JSON.stringify({
            success: true,
            provision_status: "provisioned",
            already_existed: !!provision.already_existed,
            sf_restaurant_id: provision.sf_restaurant_id ?? (pz as any).sf_restaurant_id ?? null,
            menu_sync_token: provision.menu_sync_token ?? null,
            public_url: provision.public_url ?? null,
            sync_endpoint: provision.sync_endpoint ?? null,
          }), { status: 200, headers: cors });
        }

        console.error("[Reprovision] FAILED", id, provision.error);
        await supabaseAdmin
          .from("pizzerias")
          .update({ provision_status: "failed", provision_error: provision.error } as any)
          .eq("id", id);

        return new Response(JSON.stringify({
          success: false,
          provision_status: "failed",
          error: provision.error,
        }), { status: 502, headers: cors });
      },
    },
  },
});
