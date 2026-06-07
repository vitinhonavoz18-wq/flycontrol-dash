import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS Pre-flight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      status: 200,
      headers: corsHeaders 
    })
  }

  try {
    const url = new URL(req.url)
    const restaurant_slug = url.searchParams.get('restaurant_slug')?.trim()
    const table_token = url.searchParams.get('table_token')?.trim()

    // Log the incoming request
    console.log(`VALIDATE_TABLE_REQUEST: restaurant_slug=${restaurant_slug}, table_token=${table_token}`)

    if (!restaurant_slug || !table_token) {
      const response = { 
        valid: false, 
        reason: !restaurant_slug ? 'restaurant_not_found' : 'table_not_found' 
      }
      console.log(`VALIDATE_TABLE_RESPONSE: status=200, valid=false, reason=${response.reason}`)
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Find restaurant by slug
    const { data: restaurant, error: restaurantError } = await supabase
      .from('pizzerias')
      .select('id, slug, name')
      .ilike('slug', restaurant_slug)
      .maybeSingle()

    console.log(`VALIDATE_TABLE_RESTAURANT_QUERY: restaurant_found=${!!restaurant}, restaurant_id=${restaurant?.id}`)

    if (restaurantError || !restaurant) {
      const response = { valid: false, reason: 'restaurant_not_found' }
      console.log(`VALIDATE_TABLE_RESPONSE: status=200, valid=false, reason=restaurant_not_found`)
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Find table by restaurant_id and public_token
    const { data: table, error: tableError } = await supabase
      .from('restaurant_tables')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('public_token', table_token)
      .maybeSingle()

    console.log(`VALIDATE_TABLE_TABLE_QUERY: token_received=${table_token}, table_found=${!!table}, table_id=${table?.id}, table_number=${table?.table_number}, is_active=${table?.is_active}`)

    if (tableError || !table) {
      const response = { valid: false, reason: 'table_not_found' }
      console.log(`VALIDATE_TABLE_RESPONSE: status=200, valid=false, reason=table_not_found`)
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Check if table is active
    if (table.is_active !== true) {
      const response = { valid: false, reason: 'inactive_table' }
      console.log(`VALIDATE_TABLE_RESPONSE: status=200, valid=false, reason=inactive_table`)
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Success response
    const successResponse = {
      valid: true,
      table: {
        id: table.id,
        restaurant_id: table.restaurant_id,
        restaurant_slug: restaurant.slug,
        table_number: table.table_number,
        table_name: table.table_name,
        public_token: table.public_token,
        is_active: table.is_active
      }
    }

    console.log(`VALIDATE_TABLE_RESPONSE: status=200, valid=true`)
    return new Response(JSON.stringify(successResponse), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    const errorResponse = { 
      valid: false, 
      reason: 'server_error', 
      message: error.message 
    }
    console.error(`VALIDATE_TABLE_ERROR: ${error.message}`)
    console.log(`VALIDATE_TABLE_RESPONSE: status=500, valid=false, reason=server_error`)
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
