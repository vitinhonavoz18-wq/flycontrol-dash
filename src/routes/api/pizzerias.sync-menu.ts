import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/pizzerias/sync-menu")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(JSON.stringify({ success: true }), { status: 200, headers: cors }),
      POST: async ({ request }) => {
        let body: any;
        try { body = await request.json(); } catch {
          return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400, headers: cors });
        }

        const apiKey = (request.headers.get("x-api-key") || body?.api_key || "").trim();
        const pizzeriaId = body?.pizzeria_id;
        const menuData = body?.menu; // { categories: [], products: [], beverages: [], extras: [], combos: [] }

        if (!apiKey || !pizzeriaId || !menuData) {
          return new Response(JSON.stringify({ error: "API Key, pizzeria_id e menu são obrigatórios" }), { status: 400, headers: cors });
        }

        // Validar API Key
        const { data: pz, error: pzErr } = await supabaseAdmin
          .from("pizzerias")
          .select("id")
          .eq("id", pizzeriaId)
          .eq("api_key", apiKey)
          .maybeSingle();

        if (pzErr || !pz) {
          return new Response(JSON.stringify({ error: "Credenciais inválidas" }), { status: 403, headers: cors });
        }

        const results = {
          categories: 0,
          products: 0,
          beverages: 0,
          extras: 0,
          combos: 0
        };

        // 1. Sync Categories
        const categoriesMap: Record<string, string> = {}; // external_id -> internal_id
        if (Array.isArray(menuData.categories)) {
          for (const cat of menuData.categories) {
            const { data: existing } = await supabaseAdmin
              .from("menu_categories")
              .select("id")
              .eq("pizzeria_id", pizzeriaId)
              .eq("name", cat.name)
              .maybeSingle();

            if (existing) {
              categoriesMap[cat.id || cat.name] = existing.id;
              await supabaseAdmin.from("menu_categories").update({
                description: cat.description || null,
                active: cat.active !== undefined ? cat.active : true,
                order_index: cat.order_index ?? 0
              }).eq("id", existing.id);
            } else {
              const { data: inserted } = await supabaseAdmin
                .from("menu_categories")
                .insert({
                  pizzeria_id: pizzeriaId,
                  name: cat.name,
                  description: cat.description || null,
                  active: cat.active !== undefined ? cat.active : true,
                  order_index: cat.order_index ?? 0
                })
                .select("id")
                .single();
              if (inserted) {
                categoriesMap[cat.id || cat.name] = inserted.id;
                results.categories++;
              }
            }
          }
        }

        // 2. Sync Products (including flavors)
        if (Array.isArray(menuData.products)) {
          for (const prod of menuData.products) {
            const catId = prod.category_id ? (categoriesMap[prod.category_id] || prod.category_id) : null;
            
            const { data: existing } = await supabaseAdmin
              .from("menu_products")
              .select("id")
              .eq("pizzeria_id", pizzeriaId)
              .eq("name", prod.name)
              .eq("product_type", prod.product_type || "standard")
              .maybeSingle();

            const payload = {
              pizzeria_id: pizzeriaId,
              name: prod.name,
              description: prod.description || null,
              price: prod.price || 0,
              image_url: prod.image_url || null,
              active: prod.active !== undefined ? prod.active : true,
              available: prod.available !== undefined ? prod.available : true,
              product_type: prod.product_type || "standard",
              category_id: catId
            };

            if (existing) {
              await supabaseAdmin.from("menu_products").update(payload).eq("id", existing.id);
            } else {
              await supabaseAdmin.from("menu_products").insert(payload);
              results.products++;
            }
          }
        }

        // 3. Sync Beverages (often separate in SiteCreatorFly)
        if (Array.isArray(menuData.beverages)) {
          for (const bev of menuData.beverages) {
            const { data: existing } = await supabaseAdmin
              .from("menu_products")
              .select("id")
              .eq("pizzeria_id", pizzeriaId)
              .eq("name", bev.name)
              .eq("product_type", "beverage")
              .maybeSingle();

            const payload = {
              pizzeria_id: pizzeriaId,
              name: bev.name,
              description: bev.description || null,
              price: bev.price || 0,
              image_url: bev.image_url || null,
              active: bev.active !== undefined ? bev.active : true,
              available: bev.available !== undefined ? bev.available : true,
              product_type: "beverage"
            };

            if (existing) {
              await supabaseAdmin.from("menu_products").update(payload).eq("id", existing.id);
            } else {
              await supabaseAdmin.from("menu_products").insert(payload);
              results.beverages++;
            }
          }
        }

        // 4. Sync Extras (Bordas/Adicionais)
        if (Array.isArray(menuData.extras)) {
          for (const ext of menuData.extras) {
            const { data: existing } = await supabaseAdmin
              .from("menu_extras")
              .select("id")
              .eq("pizzeria_id", pizzeriaId)
              .eq("name", ext.name)
              .eq("extra_type", ext.extra_type || "borda")
              .maybeSingle();

            const payload = {
              pizzeria_id: pizzeriaId,
              name: ext.name,
              price: ext.price || 0,
              extra_type: ext.extra_type || "borda",
              active: ext.active !== undefined ? ext.active : true
            };

            if (existing) {
              await supabaseAdmin.from("menu_extras").update(payload).eq("id", existing.id);
            } else {
              await supabaseAdmin.from("menu_extras").insert(payload);
              results.extras++;
            }
          }
        }

        return new Response(JSON.stringify({ 
          success: true, 
          message: "Cardápio sincronizado com sucesso",
          results
        }), { status: 200, headers: cors });
      },
    },
  },
});
