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
    const path = url.pathname.replace(/\/$/, '')
    const restaurant_slug = url.searchParams.get('restaurant_slug')?.trim()
    const table_token = url.searchParams.get('table_token')?.trim()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Log the incoming request
    console.log(`PUBLIC_API_REQUEST: path=${path}, restaurant_slug=${restaurant_slug}, table_token=${table_token}`)

    if (!restaurant_slug) {
      return new Response(JSON.stringify({ 
        success: false, 
        valid: false,
        reason: 'restaurant_not_found' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Find restaurant by slug
    const { data: restaurant, error: restaurantError } = await supabase
      .from('pizzerias')
      .select('id, slug, name')
      .ilike('slug', restaurant_slug)
      .maybeSingle()

    console.log(`PUBLIC_API_RESTAURANT_LOOKUP: restaurant_found=${!!restaurant}, restaurant_id=${restaurant?.id}, slug_received=${restaurant_slug}`)

    if (restaurantError || !restaurant) {
      return new Response(JSON.stringify({ 
        success: false,
        valid: false, 
        reason: 'restaurant_not_found' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Route based on path (Edge Function path usually includes the function name)
    // Local: /public-tables, Deployed: /functions/v1/public-tables
    // We'll also handle the specific sub-paths if requested, but for now we'll switch based on query params or path suffixes if we had them.
    // Since we only have one function name 'public-tables', we'll use a param or subpath.
    
    const isValidatePath = path.endsWith('/validate-table') || !!table_token
    const isListPath = path.endsWith('/restaurant-tables') || (!table_token && !path.endsWith('/validate-table'))

    if (isValidatePath && table_token) {
      // VALIDATE TABLE
      console.log(`VALIDATE_TABLE_REQUEST: slug=${restaurant_slug}, token=${table_token}`)
      
      const { data: table, error: tableError } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('public_token', table_token)
        .maybeSingle()

      console.log(`VALIDATE_TABLE_TOKEN_LOOKUP: token_found=${!!table}, table_id=${table?.id}, is_active=${table?.is_active}`)

      if (tableError || !table) {
        return new Response(JSON.stringify({ valid: false, reason: 'table_not_found' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (table.is_active !== true) {
        return new Response(JSON.stringify({ valid: false, reason: 'inactive_table' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const response = {
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
      
      console.log(`VALIDATE_TABLE_RESPONSE: valid=true, table_number=${table.table_number}`)
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })

    } else {
      // LIST TABLES
      console.log(`PUBLIC_TABLES_REQUEST: slug=${restaurant_slug}`)
      
      const { data: tables, error: tablesError } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('is_active', true)
        .order('table_number', { ascending: true })

      if (tablesError) {
        console.error(`PUBLIC_TABLES_ERROR: ${tablesError.message}`)
        return new Response(JSON.stringify({ success: false, reason: 'server_error' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const response = {
        success: true,
        restaurant: {
          id: restaurant.id,
          slug: restaurant.slug,
          name: restaurant.name
        },
        tables: tables.map(t => ({
          id: t.id,
          restaurant_id: t.restaurant_id,
          table_number: t.table_number,
          table_name: t.table_name,
          public_token: t.public_token,
          qr_code_url: t.qr_code_url,
          is_active: t.is_active
        }))
      }

      console.log(`PUBLIC_TABLES_RESULT: tables_count=${tables.length}`)
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

  } catch (error) {
    console.error(`PUBLIC_API_CRITICAL_ERROR: ${error.message}`)
    return new Response(JSON.stringify({ 
      success: false, 
      valid: false, 
      reason: 'server_error', 
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
