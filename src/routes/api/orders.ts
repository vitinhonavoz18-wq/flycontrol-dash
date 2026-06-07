import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Função auxiliar para gerar headers CORS robustos
const getCorsHeaders = (request?: Request) => {
  const origin = request?.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, accept, x-idempotency-key",
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

        const validateTableForOrder = async (restaurantId: string, tableNumber: string, tableToken: string) => {
          console.log(`🔍 [API/Orders] Validando mesa: #${tableNumber} com token ${tableToken}`);
          const { data: table, error } = await supabaseAdmin
            .from("restaurant_tables")
            .select("id, table_number, table_name, public_token, is_active")
            .eq("restaurant_id", restaurantId)
            .eq("table_number", tableNumber)
            .eq("public_token", tableToken)
            .eq("is_active", true)
            .maybeSingle();

          if (error) {
            console.error("❌ [API/Orders] Erro ao buscar mesa:", error.message);
            return { valid: false, reason: "db_error" };
          }

          if (!table) {
            console.warn("⚠️ [API/Orders] Mesa não encontrada ou token inválido");
            return { valid: false, reason: "invalid_table" };
          }

          return { valid: true, table };
        };

        const getOrCreateTableSession = async (restaurantId: string, tableId: string, tableNumber: string, tableName?: string) => {
          console.log(`🔍 [API/Orders] TABLE_ORDER_SESSION_LOOKUP para Mesa ${tableNumber} (Restaurant: ${restaurantId})`);
          const { data: session, error: sError } = await supabaseAdmin
            .from("table_sessions")
            .select("id, total_amount, subtotal_amount, customer_name, service_fee_enabled, service_fee_percent")
            .eq("restaurant_id", restaurantId)
            .eq("table_number", tableNumber)
            .eq("status", "open")
            .maybeSingle();

          if (sError) {
            console.error("❌ [API/Orders] Erro ao buscar sessão:", sError.message);
            throw sError;
          }

          if (session) {
            console.log(`✅ [API/Orders] TABLE_ORDER_LINKED_TO_SESSION: ${session.id}`);
            return session;
          }

          console.log(`🆕 [API/Orders] TABLE_SESSION_CREATED para Mesa ${tableNumber}`);
          const { data: newSession, error: iError } = await supabaseAdmin
            .from("table_sessions")
            .insert({
              restaurant_id: restaurantId,
              table_id: tableId,
              table_number: tableNumber,
              table_name: tableName || `Mesa ${tableNumber}`,
              status: "open",
              subtotal_amount: 0,
              service_fee_enabled: false,
              service_fee_percent: 15,
              service_fee_amount: 0,
              total_amount: 0,
              opened_at: new Date().toISOString()
            })
            .select("id, total_amount, subtotal_amount, customer_name, service_fee_enabled, service_fee_percent")
            .single();

          if (iError) {
            console.error("❌ [API/Orders] Erro ao criar sessão:", iError.message);
            throw iError;
          }

          return newSession;
        };
        const origin = request.headers.get("origin") || "N/A";
        
        console.log("📥 [API/Orders] Requisição POST recebida");
        console.log(`🌐 Origem: ${origin}`);

        let body: any;
        try {
          const bodyText = await request.clone().text();
          body = JSON.parse(bodyText);
          
          console.log("ORDER_RECEIVED_RAW_PAYLOAD:", JSON.stringify(body));
        } catch (err) {
          console.error("❌ [API/Orders] JSON inválido");
          return new Response(JSON.stringify({ 
            success: false, 
            error: "JSON inválido" 
          }), { status: 400, headers: cors });
        }

        const apiKey = (
          request.headers.get("x-api-key") || 
          body?.api_key || 
          (request.headers.get("authorization")?.startsWith("Bearer ") ? request.headers.get("authorization")?.substring(7) : "") ||
          ""
        ).trim();

        console.log(`🔑 API Key identificada: ${apiKey ? "Sim (presente)" : "Não (ausente)"}`);

        if (!apiKey) {
          console.error("❌ [API/Orders] Erro: API Key ausente");
          return new Response(JSON.stringify({ 
            success: false, 
            error: "API Key ausente" 
          }), { status: 401, headers: cors });
        }

        // 1. Identificar Pizzaria
        console.log(`🔍 [API/Orders] Buscando pizzaria pela API Key...`);
        const { data: pz, error: pErr } = await supabaseAdmin
          .from("pizzerias")
          .select("id, name, slug, status, is_active, is_open, subscription_status, fiqon_enabled, fiqon_webhook_url")
          .eq("api_key", apiKey)
          .neq("status", "deleted")
          .maybeSingle();

        if (pErr) {
          console.error("❌ [API/Orders] Erro no banco:", pErr.message);
          return new Response(JSON.stringify({ 
            success: false, 
            error: "Erro de banco de dados",
            details: pErr.message
          }), { status: 500, headers: cors });
        }

        if (!pz) {
          console.error("❌ [API/Orders] Pizzaria não encontrada para esta API Key");
          return new Response(JSON.stringify({ 
            success: false, 
            error: "Pizzaria não encontrada ou API Key inválida" 
          }), { status: 403, headers: cors });
        }

        console.log(`✅ [API/Orders] Loja identificada: ${pz.name} (ID: ${pz.id}) | Aberta: ${pz.is_open}`);
        
        // Verificação de assinatura suspensa
        if (pz.subscription_status === "suspended" || pz.is_active === false) {
          console.error(`❌ [API/Orders] Loja ${pz.name} está SUSPENSA. Bloqueando pedido.`);
          return new Response(JSON.stringify({ 
            success: false, 
            error: "Esta loja está temporariamente suspensa. Entre em contato com o suporte." 
          }), { status: 403, headers: cors });
        }

        // Verificação de loja aberta
        if (pz.is_open === false) {
          console.error(`❌ [API/Orders] Loja ${pz.name} está FECHADA. Bloqueando pedido.`);
          return new Response(JSON.stringify({ 
            success: false, 
            error: "Loja fechada no momento. Os pedidos estão temporariamente indisponíveis." 
          }), { status: 403, headers: cors });
        }

        // 2. Tratar TESTE REAL (Item 5 e 6 do pedido do usuário)
        if (body.test === true || body.payload?.test === true) {
          console.log("🧪 [API/Orders] RECEBIDO PAYLOAD DE TESTE");
          
          // Registrar log de teste
          await logExternalOrder(apiKey, body, 200, "Teste de conexão bem-sucedido");
          
          return new Response(JSON.stringify({ 
            success: true, 
            message: "FlyControl recebeu teste",
            received_at: new Date().toISOString(),
            pizzeria: pz.name
          }), { status: 200, headers: cors });
        }

        // 3. Processamento de Pedido Real
        const orderData = body.order || body || {};
        const customer = body.customer || body || {};
        const items = orderData.items || body.items || [];

        const parseMoney = (val: any) => {
          if (typeof val === "number") return val;
          if (typeof val === "string") {
            const num = parseFloat(val.replace(/[^\d.,]/g, "").replace(",", "."));
            return isNaN(num) ? 0 : num;
          }
          return 0;
        };

        // 3. Validação de Mesa (se aplicável)
        const deliveryType = (orderData.delivery_type || body.delivery_type || body.service_mode || "delivery").toLowerCase();
        const isTableOrder = deliveryType === "table" || deliveryType === "mesa";
        
        console.log("ORDER_TYPE_DETECTED:", deliveryType, `(isTableOrder: ${isTableOrder})`);

        let validatedTableId = null;
        let validatedTableNumber = body.table_number || orderData.table_number || "";
        let validatedTableName = body.table_name || orderData.table_name || "";

        if (isTableOrder) {
          const tableNumber = body.table_number || orderData.table_number;
          const tableToken = body.table_token || orderData.table_token;

          console.log("TABLE_ORDER_DATA:", { tableNumber, tableToken });

          if (!tableNumber || !tableToken) {
            console.error("❌ [API/Orders] Pedido de mesa sem table_number ou table_token");
            return new Response(JSON.stringify({ 
              success: false, 
              error: "invalid_table",
              message: "Número da mesa ou token ausente" 
            }), { status: 400, headers: cors });
          }

          const validation = await validateTableForOrder(pz.id, String(tableNumber), tableToken);
          console.log("TABLE_ORDER_VALIDATION_RESULT:", validation.valid ? "Valid" : "Invalid", validation.reason || "");

          if (!validation.valid) {
            return new Response(JSON.stringify({ 
              success: false, 
              error: "invalid_table",
              message: "Mesa inválida ou inativa" 
            }), { status: 400, headers: cors });
          }
          
          validatedTableId = validation.table?.id;
          validatedTableNumber = validation.table?.table_number || validatedTableNumber;
          validatedTableName = validation.table?.table_name || validatedTableName;
        }

        const orderToInsert: any = {
          tenant_id: pz.id,
          external_order_id: String(orderData.id || body.order_id || body.id || `ext_${Date.now()}`),
          customer_name: customer.name || customer.customer_name || body.customer_name || "Cliente Site",
          customer_phone: customer.phone || customer.customer_phone || body.customer_phone || "",
          customer_address: isTableOrder ? "Consumo no Local" : (customer.address || customer.customer_address || body.customer_address || "Não informado"),
          neighborhood: isTableOrder ? "Mesa" : (customer.neighborhood || body.neighborhood || null),
          total: parseMoney(orderData.total || body.total || 0),
          subtotal: parseMoney(orderData.subtotal || body.subtotal || 0),
          delivery_fee: isTableOrder ? 0 : parseMoney(orderData.delivery_fee || body.delivery_fee || 0),
          payment_method: orderData.payment_method || body.payment_method || "Não informado",
          delivery_type: isTableOrder ? "table" : deliveryType,
          order_type: isTableOrder ? "table" : deliveryType,
          service_mode: isTableOrder ? "mesa" : deliveryType,
          table_number: String(validatedTableNumber),
          table_id: validatedTableId,
          table_name: validatedTableName,
          table_token: body.table_token || orderData.table_token || null,
          notes: orderData.notes || body.notes || "",
          status: "novo",
          source: body.source || "sitecreatorfly",
          items: items,
        };

        console.log("ORDER_INSERT_PAYLOAD:", JSON.stringify(orderToInsert));
        console.log("ORDER_INSERT_TABLE: orders");

        const { data: order, error: orderError } = await (supabaseAdmin.from("orders") as any)
          .insert(orderToInsert)
          .select("id")
          .single();

        if (orderError) {
          console.error("ORDER_INSERT_ERROR:", orderError.message);
          await logExternalOrder(apiKey, body, 500, `Erro insert: ${orderError.message}`);
          return new Response(JSON.stringify({ 
            success: false, 
            error: "database_schema_error",
            message: "Erro ao salvar pedido no FlyControl",
            details: orderError.message 
          }), { status: 500, headers: cors });
        }
        
        console.log(`✨ [API/Orders] Pedido salvo! ID: ${order.id}`);
        console.log("ORDER_SAVE_RESULT: success");

        // 5. Vincular à Comanda (se for pedido de mesa)
        if (isTableOrder && validatedTableId) {
          try {
            const customerName = orderToInsert.customer_name;
            
            console.log("TABLE_SESSION_CREATE_OR_UPDATE:", { tableId: validatedTableId, tableNumber: validatedTableNumber });
            
            const session = await getOrCreateTableSession(pz.id, validatedTableId, String(validatedTableNumber), validatedTableName);
            
            // Log do ID da sessão recebida/encontrada
            console.log("TABLE_ORDER_SESSION_ID_FOUND:", session.id);

            // Atualizar nome do cliente e table_name na sessão se necessário
            const updateData: any = {};
            if (customerName && customerName !== "Cliente Site" && !session.customer_name) {
              updateData.customer_name = customerName;
            }
            if (validatedTableName) {
              updateData.table_name = validatedTableName;
            }

            if (Object.keys(updateData).length > 0) {
              await supabaseAdmin
                .from("table_sessions")
                .update(updateData)
                .eq("id", session.id);
            }

            // Vincular pedido à sessão
            console.log(`🔗 [API/Orders] TABLE_ORDER_LINKED_TO_SESSION: Order ${order.id} -> Session ${session.id}`);
            await supabaseAdmin.from("table_session_orders").insert({
              table_session_id: session.id,
              order_id: order.id
            });

            // RECALCULAR TOTAIS DA SESSÃO USANDO DADOS REAIS DOS PEDIDOS
            console.log(`🔄 [API/Orders] TABLE_SESSION_RECALCULATING: Session ${session.id}`);
            
            // Buscar todos os IDs de pedidos vinculados a esta sessão
            const { data: linkedOrders, error: linkError } = await supabaseAdmin
              .from("table_session_orders")
              .select("order_id")
              .eq("table_session_id", session.id);
            
            if (linkError) throw linkError;

            const orderIds = (linkedOrders || []).map(lo => lo.order_id);
            console.log("TABLE_SESSION_ORDERS_LINKS_FOUND:", orderIds.length);
            
            if (orderIds.length > 0) {
              // Buscar os totais reais desses pedidos
              const { data: ordersInfo, error: ordersError } = await supabaseAdmin
                .from("orders")
                .select("id, total")
                .in("id", orderIds);
              
              if (ordersError) throw ordersError;

              const subtotal = (ordersInfo || []).reduce((sum, o) => {
                const orderTotal = Number(o.total) || 0;
                console.log(`[API/Orders] TABLE_SESSION_ORDER_FETCHED: id=${o.id}, total=${orderTotal}`);
                return sum + orderTotal;
              }, 0);
              
              let serviceFeeAmount = 0;
              let finalTotal = subtotal;

              // Usar a configuração atual da sessão
              if (session.service_fee_enabled) {
                const percent = Number(session.service_fee_percent) || 15;
                serviceFeeAmount = subtotal * (percent / 100);
                finalTotal = subtotal + serviceFeeAmount;
                console.log(`[API/Orders] TABLE_SESSION_SERVICE_FEE_CALCULATED: ${serviceFeeAmount} (${percent}%)`);
              }

              const { error: updateSessionError } = await supabaseAdmin
                .from("table_sessions")
                .update({ 
                  subtotal_amount: subtotal,
                  service_fee_amount: serviceFeeAmount,
                  total_amount: finalTotal,
                  updated_at: new Date().toISOString()
                })
                .eq("id", session.id);
              
              if (updateSessionError) {
                console.error("❌ [API/Orders] TABLE_SESSION_RECALCULATE_ERROR:", updateSessionError.message);
              } else {
                console.log(`📊 [API/Orders] TABLE_SESSION_TOTAL_UPDATED: Subtotal: ${subtotal}, Total: ${finalTotal}`);
              }
            }
          } catch (err) {
            console.error("❌ [API/Orders] Erro ao processar sessão da mesa:", err);
          }
        }

        // Tenta salvar itens na tabela relacionada (não bloqueante)
        if (Array.isArray(items) && items.length > 0) {
          try {
            const orderItemsToInsert = items.map((it: any) => ({
              order_id: order.id,
              pizzeria_id: pz.id,
              product_name: it.product_name || it.name || "Item",
              quantity: Number(it.quantity || 1),
              unit_price: parseMoney(it.unit_price || it.price || 0),
              total_price: Number(it.quantity || 1) * parseMoney(it.unit_price || it.price || 0)
            }));
            await (supabaseAdmin.from("order_items") as any).insert(orderItemsToInsert);
          } catch (err) {
            console.warn("⚠️ [API/Orders] Erro não-crítico ao salvar itens:", err);
          }
        }

        await logExternalOrder(apiKey, body, 200);
        console.log("ORDER_RESPONSE_SENT: success");

        // 4. Integração FIQON (Assíncrona/Não-bloqueante para o cliente)
        if (pz.fiqon_enabled && pz.fiqon_webhook_url) {
          console.log("🚀 [API/Orders] Disparando integração FIQON...");
          // Usamos uma IIFE para não aguardar a resposta da FIQON antes de responder ao cliente
          (async () => {
            try {
              const fiqonPayload = {
                event: "order.created",
                source: "flycontrol",
                restaurant: {
                  slug: pz.slug,
                  name: pz.name
                },
                order: {
                  id: order.id,
                  customer_name: orderToInsert.customer_name,
                  customer_phone: orderToInsert.customer_phone,
                  address: orderToInsert.customer_address,
                  items: orderToInsert.items,
                  subtotal: orderToInsert.subtotal,
                  delivery_fee: orderToInsert.delivery_fee,
                  total: orderToInsert.total,
                  payment_method: orderToInsert.payment_method,
                  notes: orderToInsert.notes,
                  status: orderToInsert.status,
                  created_at: new Date().toISOString()
                }
              };

              const response = await fetch(pz.fiqon_webhook_url!, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(fiqonPayload)
              });

              const respText = await response.text();
              const isSuccess = response.status >= 200 && response.status < 300;

              // Registrar log da FIQON
              await supabaseAdmin.from("flycontrol_fiqon_logs").insert({
                restaurant_id: pz.id,
                order_id: order.id,
                fiqon_url: pz.fiqon_webhook_url,
                payload: fiqonPayload,
                status_http: response.status,
                response_body: respText,
                success: isSuccess,
                error_message: isSuccess ? null : `Status ${response.status}: ${respText.substring(0, 100)}`
              });

              console.log(`✅ [FIQON] Resposta: ${response.status}`);
            } catch (err: any) {
              console.error("❌ [FIQON] Erro no envio:", err.message);
              await supabaseAdmin.from("flycontrol_fiqon_logs").insert({
                restaurant_id: pz.id,
                order_id: order.id,
                fiqon_url: pz.fiqon_webhook_url,
                payload: {},
                success: false,
                error_message: err.message
              });
            }
          })();
        }

        console.log("ORDER_RESPONSE_SENT: success");

        return new Response(JSON.stringify({ 
          success: true, 
          order_id: order.id, 
          order_type: orderToInsert.delivery_type,
          service_mode: orderToInsert.delivery_type === "table" ? "mesa" : orderToInsert.delivery_type,
          table_number: orderToInsert.table_number,
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
    console.error("Falha ao registrar log externo:", err);
  }
}
