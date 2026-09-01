import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    console.log(`ORDER_RECEIVED: ${JSON.stringify(body)}`)

    const { 
      restaurant_slug, 
      customer_name, 
      customer_phone, 
      items, 
      total, 
      order_type,
      table_number,
      table_token,
      notes
    } = body

    // Validações básicas
    if (!restaurant_slug) throw new Error("restaurant_slug is required")
    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ success: false, reason: "items_empty" }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }
    if (isNaN(Number(total)) || Number(total) <= 0) {
      return new Response(JSON.stringify({ success: false, reason: "invalid_total" }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // Buscar restaurante
    const { data: restaurant, error: resError } = await supabase
      .from('pizzerias')
      .select('id')
      .ilike('slug', restaurant_slug)
      .maybeSingle()

    if (!restaurant) {
      return new Response(JSON.stringify({ success: false, reason: "restaurant_not_found" }), { 
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // Validação específica de mesa
    if ((order_type === 'table' || order_type === 'mesa')) {
        if (!table_number) {
            return new Response(JSON.stringify({ success: false, reason: "table_number_missing" }), { 
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            })
        }
    }

    // Salvar pedido
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        tenant_id: restaurant.id,
        customer_name,
        customer_phone,
        items,
        total: Number(total),
        order_type: order_type || 'delivery',
        table_number,
        table_token,
        notes,
        status: 'pendente'
      })
      .select()
      .single()

    if (orderError) throw orderError

    console.log(`ORDER_SAVED: id=${order.id}`)

    return new Response(JSON.stringify({ 
      success: true, 
      order_id: order.id,
      message: "Pedido recebido pelo FlyControl"
    }), { 
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    console.error(`ORDER_ERROR: ${error.message}`)
    return new Response(JSON.stringify({ success: false, error: error.message }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
