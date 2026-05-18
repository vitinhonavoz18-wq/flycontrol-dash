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

        // Validar API Key e encontrar pizzaria
        console.log(`🔍 [Sync] Validando pizzaria_id: ${pizzeriaId}`);
        const { data: pz, error: pzErr } = await supabaseAdmin
          .from("pizzerias")
          .select("id, name, slug")
          .eq("id", pizzeriaId)
          .eq("api_key", apiKey)
          .maybeSingle();

        if (pzErr || !pz) {
          console.error("❌ [Sync] Credenciais inválidas ou pizzaria não encontrada:", pzErr || "Not found");
          return new Response(JSON.stringify({ error: "Credenciais inválidas" }), { status: 403, headers: cors });
        }

        console.log(`✅ [Sync] Pizzaria autorizada: ${pz.name} (${pz.slug})`);

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
            
            // Anti-duplication: pizzeria_id + name + product_type + category_id
            const query = supabaseAdmin
              .from("menu_products")
              .select("id")
              .eq("pizzeria_id", pizzeriaId)
              .eq("name", prod.name)
              .eq("product_type", prod.product_type || "standard");
            
            if (catId) {
              query.eq("category_id", catId);
            } else {
              query.is("category_id", null);
            }

            const { data: existing } = await query.maybeSingle();

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

        // 3. Sync Beverages
        if (Array.isArray(menuData.beverages)) {
          for (const bev of menuData.beverages) {
            // Anti-duplication for beverages: pizzeria_id + name + type
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
            // Anti-duplication: pizzeria_id + name + extra_type
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

        // 5. Sync Combos
        if (Array.isArray(menuData.combos)) {
          for (const cb of menuData.combos) {
            // Anti-duplication: pizzeria_id + name
            const { data: existing } = await supabaseAdmin
              .from("combos")
              .select("id")
              .eq("pizzeria_id", pizzeriaId)
              .eq("name", cb.name)
              .maybeSingle();

            const payload = {
              pizzeria_id: pizzeriaId,
              name: cb.name,
              description: cb.description || null,
              original_price: cb.original_price || 0,
              combo_price: cb.combo_price || 0,
              image_url: cb.image_url || null,
              active: cb.active !== undefined ? cb.active : true,
              highlight: cb.highlight !== undefined ? cb.highlight : false,
              available_days: cb.available_days || ["seg", "ter", "qua", "qui", "sex", "sab", "dom"]
            };

            let comboId = existing?.id;
            if (existing) {
              await supabaseAdmin.from("combos").update(payload).eq("id", existing.id);
            } else {
              const { data: inserted } = await supabaseAdmin
                .from("combos")
                .insert(payload)
                .select("id")
                .single();
              if (inserted) {
                comboId = inserted.id;
                results.combos++;
              }
            }

            // Sync Combo Items if provided
            if (comboId && Array.isArray(cb.items)) {
              // Clear existing items for this combo to avoid duplicates/conflicts
              await supabaseAdmin.from("combo_items").delete().eq("combo_id", comboId);
              
              for (const item of cb.items) {
                await supabaseAdmin.from("combo_items").insert({
                  combo_id: comboId,
                  product_type: item.product_type || "standard",
                  product_name: item.product_name,
                  quantity: item.quantity || 1
                });
              }
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
