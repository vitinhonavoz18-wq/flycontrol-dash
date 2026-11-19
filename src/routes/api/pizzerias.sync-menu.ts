import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireBearerCaller } from "@/integrations/supabase/adminGuard.server";
import { planejarProdutosNormalizados } from "@/lib/menu/importarProdutosNormalizados";
import { isUnsafeMenuSyncUrl } from "@/lib/server/urlSafety";

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
      OPTIONS: async () =>
        new Response(JSON.stringify({ success: true }), { status: 200, headers: cors }),

      GET: async ({ request }) => {
        // Antes esta rota buscava qualquer endereço da internet a pedido de
        // quem chamasse, sem checar quem estava pedindo nem para onde a
        // busca ia — um mensageiro que entrega em qualquer endereço sem
        // perguntar quem está mandando. Agora exige login (o dono da
        // pizzaria testando o próprio link) e só busca endereços do
        // SiteCreatorFly ou do Supabase, nunca um endereço interno.
        try {
          await requireBearerCaller(request, cors);
        } catch (guardResponse) {
          if (guardResponse instanceof Response) return guardResponse;
          throw guardResponse;
        }

        const url = new URL(request.url);
        const syncUrl = url.searchParams.get("sync_url");

        if (!syncUrl) {
          return new Response(JSON.stringify({ error: "sync_url é obrigatório" }), {
            status: 400,
            headers: cors,
          });
        }

        if (isUnsafeMenuSyncUrl(syncUrl)) {
          return new Response(JSON.stringify({ error: "sync_url não permitido" }), {
            status: 400,
            headers: cors,
          });
        }

        try {
          const response = await fetch(syncUrl, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(12_000),
          });

          const text = await response.text();
          console.log(`📡 [Proxy Sync] Status: ${response.status}`);

          return new Response(text, {
            status: response.status,
            headers: cors,
          });
        } catch (error) {
          const demorou = error instanceof Error && error.name === "TimeoutError";
          console.error("[Proxy Sync] Falha ao consultar o cardápio.", { demorou });
          return new Response(
            JSON.stringify({
              error: demorou
                ? "O site público demorou para responder."
                : "Falha ao consultar o site público.",
            }),
            {
              status: demorou ? 504 : 502,
              headers: cors,
            },
          );
        }
      },

      POST: async ({ request }) => {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "JSON inválido" }), {
            status: 400,
            headers: cors,
          });
        }

        const apiKey = (request.headers.get("x-api-key") || body?.api_key || "").trim();
        const pizzeriaId = body?.pizzeria_id;
        const menuData = body?.menu;

        if (!apiKey || !pizzeriaId || !menuData) {
          return new Response(
            JSON.stringify({ error: "API Key, pizzeria_id e menu são obrigatórios" }),
            { status: 400, headers: cors },
          );
        }

        console.log(`🔍 [Sync] Iniciando sincronização para pizzeria_id: ${pizzeriaId}`);
        const { data: pz, error: pzErr } = await supabaseAdmin
          .from("pizzerias")
          .select("id, name, slug")
          .eq("id", pizzeriaId)
          .eq("api_key", apiKey)
          .maybeSingle();

        if (pzErr) {
          console.error("❌ [Sync] Erro ao buscar pizzaria:", pzErr);
          return new Response(JSON.stringify({ error: "Erro ao validar credenciais" }), {
            status: 500,
            headers: cors,
          });
        }

        if (!pz) {
          console.error(`❌ [Sync] Credenciais inválidas ou pizzaria não encontrada`);
          return new Response(
            JSON.stringify({ error: "Credenciais inválidas ou pizzaria não encontrada" }),
            { status: 403, headers: cors },
          );
        }

        console.log(`✅ [Sync] Pizzaria autorizada: ${pz.name} (${pz.slug})`);

        const results = {
          categories: 0,
          products: 0,
          beverages: 0,
          extras: 0,
          combos: 0,
          pizza_sizes: 0,
          products_updated: 0,
          products_created: 0,
          categories_created: 0,
          imported_from_normalized: 0,
        };

        console.log(`FL_SYNC_JSON_RECEIVED: ${JSON.stringify(menuData).substring(0, 500)}...`);

        const normalizedProducts = menuData.normalized_products || [];
        const traditionalProducts = menuData.products || [];
        const traditionalDrinks = menuData.beverages || menuData.drinks || [];
        const traditionalCombos = menuData.combos || [];

        console.log(`FL_SYNC_NORMALIZED_PRODUCTS_COUNT: ${normalizedProducts.length}`);
        console.log(`FL_MENU_SYNC_PRODUCTS_COUNT: ${traditionalProducts.length}`);
        console.log(`FL_MENU_SYNC_DRINKS_COUNT: ${traditionalDrinks.length}`);

        const categoriesMap: Record<string, string> = {};

        // Self-healing helper: never overwrite a valid existing external_id.
        // Returns a payload copy safe to pass to update().
        const preserveExternalId = <T extends { external_id?: any }>(
          payload: T,
          existing: { external_id: string | null } | null | undefined,
          incoming: string | undefined,
        ): T => {
          const clone: any = { ...payload };
          if (existing?.external_id) {
            // Existing row already has a valid external_id — keep it untouched.
            delete clone.external_id;
          } else if (incoming) {
            // Backfill missing external_id.
            clone.external_id = incoming;
          } else {
            delete clone.external_id;
          }
          return clone;
        };

        // Helper: resolve or create a category by (external_id, name).
        // Safety: never overwrites an existing external_id, only fills NULL.
        const getOrCreateCategory = async (catName: string, externalId?: string) => {
          const extKey = externalId ? `ext:${externalId}` : null;
          if (extKey && categoriesMap[extKey]) return categoriesMap[extKey];
          if (categoriesMap[catName]) return categoriesMap[catName];

          // Prefer match by external_id first (authoritative), then by name.
          let existing: { id: string; external_id: string | null; name: string } | null = null;
          if (externalId) {
            const { data } = await supabaseAdmin
              .from("menu_categories")
              .select("id, external_id, name")
              .eq("pizzeria_id", pizzeriaId)
              .eq("external_id", externalId)
              .maybeSingle();
            existing = data as any;
          }
          if (!existing) {
            const { data } = await supabaseAdmin
              .from("menu_categories")
              .select("id, external_id, name")
              .eq("pizzeria_id", pizzeriaId)
              .eq("name", catName)
              .maybeSingle();
            existing = data as any;
          }

          if (existing) {
            const update: {
              last_synced_at: string;
              external_source: string;
              external_id?: string;
            } = {
              last_synced_at: new Date().toISOString(),
              external_source: "sitecreatorfly",
            };
            // Only backfill external_id when local row is missing it.
            if (externalId && !existing.external_id) {
              update.external_id = externalId;
              console.log(
                `[Sync] Backfilled external_id for legacy category "${existing.name}" (${existing.id}) → ${externalId}`,
              );
            }
            await supabaseAdmin.from("menu_categories").update(update).eq("id", existing.id);
            categoriesMap[catName] = existing.id;
            if (extKey) categoriesMap[extKey] = existing.id;
            return existing.id;
          }

          const { data: inserted } = await supabaseAdmin
            .from("menu_categories")
            .insert({
              pizzeria_id: pizzeriaId,
              name: catName,
              active: true,
              order_index: 0,
              external_id: externalId || null,
              external_source: "sitecreatorfly",
              last_synced_at: new Date().toISOString(),
            })
            .select("id")
            .single();
          if (inserted) {
            categoriesMap[catName] = inserted.id;
            if (extKey) categoriesMap[extKey] = inserted.id;
            results.categories_created++;
            results.categories++;
            return inserted.id;
          }
          return null;
        };

        // Pre-seed categories from the SF payload so external_id is known
        // BEFORE processing products (products reference categories by name).
        if (Array.isArray(menuData.categories)) {
          for (const cat of menuData.categories) {
            const extId = (cat.external_id ?? cat.id)?.toString();
            if (cat?.name) await getOrCreateCategory(cat.name, extId);
          }
        }

        if (normalizedProducts.length > 0) {
          console.log("🚀 [Sync] Usando normalized_products como fonte principal");
          try {
            const recebidos: Parameters<typeof planejarProdutosNormalizados>[1] = [];
            for (const item of normalizedProducts) {
              const catName = item.category_name || "Geral";
              const catExternalId = (item.category_external_id ?? item.category_id)?.toString();
              const categoria = await getOrCreateCategory(catName, catExternalId);
              if (!categoria) throw new Error("Não foi possível vincular a categoria.");
              recebidos.push({ item, categoria });
            }

            const limite = AbortSignal.timeout(20_000);
            // Busca os itens em páginas e grava em lote. Cada linha continua
            // identificada pela loja e pelo ID local já vinculado.
            const tamanhoDaPagina = 500;
            const existentes: Parameters<typeof planejarProdutosNormalizados>[2] = [];
            for (let offset = 0; ; offset += tamanhoDaPagina) {
              const { data, error } = await supabaseAdmin
                .from("menu_products")
                .select("id, category_id, external_id, name, product_type")
                .eq("pizzeria_id", pizzeriaId)
                .order("id")
                .range(offset, offset + tamanhoDaPagina - 1)
                .abortSignal(limite);
              if (error) throw error;
              existentes.push(...data);
              if (data.length < tamanhoDaPagina) break;
            }

            const linhas = await planejarProdutosNormalizados(
              pizzeriaId,
              recebidos,
              existentes,
              new Date().toISOString(),
            );
            const idsExistentes = new Set(existentes.map((item) => item.id));
            const tamanhoDoLote = 200;
            for (let offset = 0; offset < linhas.length; offset += tamanhoDoLote) {
              const lote = linhas.slice(offset, offset + tamanhoDoLote);
              const { error } = await supabaseAdmin
                .from("menu_products")
                .upsert(lote, { onConflict: "id", defaultToNull: false })
                .abortSignal(limite);
              if (error) throw error;

              for (const item of lote) {
                if (idsExistentes.has(item.id)) results.products_updated++;
                else {
                  results.products_created++;
                  if (item.product_type === "beverage") results.beverages++;
                  else results.products++;
                }
              }
              results.imported_from_normalized += lote.length;
            }
          } catch (error) {
            console.error("[Sync] Falha ao importar produtos normalizados", error);
            return new Response(
              JSON.stringify({
                success: false,
                error: "Não foi possível terminar a sincronização dos produtos. Tente novamente.",
              }),
              { status: 502, headers: cors },
            );
          }
          console.log(`FL_SYNC_PRODUCTS_IMPORTED: ${results.imported_from_normalized}`);
          console.log(`FL_SYNC_CATEGORIES_IMPORTED: ${results.categories}`);
        } else {
          console.log("⚠️ [Sync] normalized_products vazio, tentando fontes tradicionais");

          // Original logic for categories
          if (Array.isArray(menuData.categories)) {
            for (const cat of menuData.categories) {
              const externalId = cat.id?.toString();
              const catId = await getOrCreateCategory(cat.name, externalId);
              if (catId) {
                // Category update already handled in getOrCreateCategory payload for existing
              }
            }
          }

          // Original logic for products
          if (Array.isArray(traditionalProducts)) {
            for (const prod of traditionalProducts) {
              const externalId = prod.id?.toString();
              const catId = prod.category_id
                ? categoriesMap[prod.category_id] || prod.category_id
                : null;

              let query = supabaseAdmin
                .from("menu_products")
                .select("id, external_id")
                .eq("pizzeria_id", pizzeriaId)
                .eq("product_type", prod.product_type || "standard");

              if (externalId) {
                query = query.or(`external_id.eq.${externalId},name.eq."${prod.name}"`);
              } else {
                query = query.eq("name", prod.name);
              }

              if (catId) {
                query = query.eq("category_id", catId);
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
                category_id: catId,
                external_id: externalId,
                external_source: "sitecreatorfly",
                last_synced_at: new Date().toISOString(),
              };

              if (existing) {
                await supabaseAdmin
                  .from("menu_products")
                  .update(preserveExternalId(payload, existing, externalId))
                  .eq("id", existing.id);
                results.products_updated++;
              } else {
                await supabaseAdmin.from("menu_products").insert(payload);
                results.products_created++;
                results.products++;
              }
            }
          }

          // Original logic for beverages
          if (Array.isArray(traditionalDrinks)) {
            for (const bev of traditionalDrinks) {
              const externalId = bev.id?.toString();

              let query = supabaseAdmin
                .from("menu_products")
                .select("id, external_id")
                .eq("pizzeria_id", pizzeriaId)
                .eq("product_type", "beverage");

              if (externalId) {
                query = query.or(`external_id.eq.${externalId},name.eq."${bev.name}"`);
              } else {
                query = query.eq("name", bev.name);
              }

              const { data: existing } = await query.maybeSingle();

              const payload = {
                pizzeria_id: pizzeriaId,
                name: bev.name,
                description: bev.description || null,
                price: bev.price || 0,
                image_url: bev.image_url || null,
                active: bev.active !== undefined ? bev.active : true,
                available: bev.available !== undefined ? bev.available : true,
                product_type: "beverage",
                external_id: externalId,
                external_source: "sitecreatorfly",
                last_synced_at: new Date().toISOString(),
              };

              if (existing) {
                await supabaseAdmin
                  .from("menu_products")
                  .update(preserveExternalId(payload, existing, externalId))
                  .eq("id", existing.id);
                results.products_updated++;
              } else {
                await supabaseAdmin.from("menu_products").insert(payload);
                results.products_created++;
                results.beverages++;
              }
            }
          }
        }

        // Always sync extras, combos and sizes if present
        if (Array.isArray(menuData.extras)) {
          for (const ext of menuData.extras) {
            const externalId = ext.id?.toString();

            let query = supabaseAdmin
              .from("menu_extras")
              .select("id, external_id")
              .eq("pizzeria_id", pizzeriaId)
              .eq("extra_type", ext.extra_type || "borda");

            if (externalId) {
              query = query.or(`external_id.eq.${externalId},name.eq."${ext.name}"`);
            } else {
              query = query.eq("name", ext.name);
            }

            const { data: existing } = await query.maybeSingle();

            const payload = {
              pizzeria_id: pizzeriaId,
              name: ext.name,
              price: ext.price || 0,
              extra_type: ext.extra_type || "borda",
              active: ext.active !== undefined ? ext.active : true,
              external_id: externalId,
              external_source: "sitecreatorfly",
              last_synced_at: new Date().toISOString(),
            };

            if (existing) {
              await supabaseAdmin
                .from("menu_extras")
                .update(preserveExternalId(payload, existing, externalId))
                .eq("id", existing.id);
            } else {
              await supabaseAdmin.from("menu_extras").insert(payload);
              results.extras++;
            }
          }
        }

        if (Array.isArray(traditionalCombos)) {
          for (const cb of traditionalCombos) {
            const externalId = cb.id?.toString();

            let query = supabaseAdmin
              .from("combos")
              .select("id, external_id")
              .eq("pizzeria_id", pizzeriaId);

            if (externalId) {
              query = query.or(`external_id.eq.${externalId},name.eq."${cb.name}"`);
            } else {
              query = query.eq("name", cb.name);
            }

            const { data: existing } = await query.maybeSingle();

            const payload = {
              pizzeria_id: pizzeriaId,
              name: cb.name,
              description: cb.description || null,
              original_price: cb.original_price || 0,
              combo_price: cb.combo_price || 0,
              image_url: cb.image_url || null,
              active: cb.active !== undefined ? cb.active : true,
              highlight: cb.highlight !== undefined ? cb.highlight : false,
              available_days: cb.available_days || [
                "seg",
                "ter",
                "qua",
                "qui",
                "sex",
                "sab",
                "dom",
              ],
              external_id: externalId,
              external_source: "sitecreatorfly",
              last_synced_at: new Date().toISOString(),
            };

            let comboId = existing?.id;
            if (existing) {
              await supabaseAdmin
                .from("combos")
                .update(preserveExternalId(payload, existing, externalId))
                .eq("id", existing.id);
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

            if (comboId && Array.isArray(cb.items)) {
              await supabaseAdmin.from("combo_items").delete().eq("combo_id", comboId);
              for (const item of cb.items) {
                await supabaseAdmin.from("combo_items").insert({
                  combo_id: comboId,
                  product_type: item.product_type || "standard",
                  product_name: item.product_name,
                  quantity: item.quantity || 1,
                });
              }
            }
          }
        }

        if (Array.isArray(menuData.pizza_sizes)) {
          for (const size of menuData.pizza_sizes) {
            const externalId = size.id?.toString();

            let query = supabaseAdmin
              .from("pizzeria_pizza_sizes")
              .select("id, external_id")
              .eq("pizzeria_id", pizzeriaId);

            if (externalId) {
              query = query.or(`external_id.eq.${externalId},name.eq."${size.name}"`);
            } else {
              query = query.eq("name", size.name);
            }

            const { data: existing } = await query.maybeSingle();

            const payload = {
              pizzeria_id: pizzeriaId,
              name: size.name,
              price: size.price || 0,
              max_flavors: size.max_flavors || 1,
              slices: size.slices || 8,
              active: size.active !== undefined ? size.active : true,
              sort_order: size.sort_order || 0,
              external_id: externalId,
              updated_at: new Date().toISOString(),
            };

            if (existing) {
              await supabaseAdmin
                .from("pizzeria_pizza_sizes")
                .update(preserveExternalId(payload, existing, externalId))
                .eq("id", existing.id);
            } else {
              await supabaseAdmin.from("pizzeria_pizza_sizes").insert(payload);
              results.pizza_sizes++;
            }
          }
        }

        console.log(`FL_SYNC_CATEGORIES_CREATED: ${results.categories_created}`);
        console.log(`FL_SYNC_PRODUCTS_CREATED: ${results.products_created}`);
        console.log(`FL_SYNC_PRODUCTS_UPDATED: ${results.products_updated}`);

        const totalItems =
          results.products +
          results.beverages +
          results.combos +
          results.extras +
          results.pizza_sizes;
        if (totalItems === 0) {
          console.log(
            "FL_MENU_SYNC_NO_ITEMS_REASON: Todos os arrays de produtos e categorias estavam vazios no JSON.",
          );
        }

        // Self-healing validation: report any rows still missing external_id.
        const [catsMissing, prodsMissing, extrasMissing, combosMissing, sizesMissing] =
          await Promise.all([
            supabaseAdmin
              .from("menu_categories")
              .select("id", { count: "exact", head: true })
              .eq("pizzeria_id", pizzeriaId)
              .is("external_id", null),
            supabaseAdmin
              .from("menu_products")
              .select("id", { count: "exact", head: true })
              .eq("pizzeria_id", pizzeriaId)
              .is("external_id", null),
            supabaseAdmin
              .from("menu_extras")
              .select("id", { count: "exact", head: true })
              .eq("pizzeria_id", pizzeriaId)
              .is("external_id", null),
            supabaseAdmin
              .from("combos")
              .select("id", { count: "exact", head: true })
              .eq("pizzeria_id", pizzeriaId)
              .is("external_id", null),
            supabaseAdmin
              .from("pizzeria_pizza_sizes")
              .select("id", { count: "exact", head: true })
              .eq("pizzeria_id", pizzeriaId)
              .is("external_id", null),
          ]);
        const validation = {
          categories_missing_external_id: catsMissing.count ?? 0,
          products_missing_external_id: prodsMissing.count ?? 0,
          extras_missing_external_id: extrasMissing.count ?? 0,
          combos_missing_external_id: combosMissing.count ?? 0,
          pizza_sizes_missing_external_id: sizesMissing.count ?? 0,
        };
        console.log(`FL_SYNC_VALIDATION: ${JSON.stringify(validation)}`);

        return new Response(JSON.stringify({ success: true, results, validation }), {
          status: 200,
          headers: cors,
        });
      },
    },
  },
});
