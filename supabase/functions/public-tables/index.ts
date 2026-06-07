import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const action = pathParts[pathParts.length - 1]
    
    const restaurant_slug = url.searchParams.get('restaurant_slug')
    const table_token = url.searchParams.get('table_token')

    console.log(`VALIDATE_TABLE_DEBUG: restaurant_slug_received=${restaurant_slug}, table_token_received=${table_token}`)

    if (!restaurant_slug) {
      console.log(`VALIDATE_TABLE_RESULT: valid=false, reason=missing_slug`)
      return new Response(JSON.stringify({ valid: false, reason: 'missing_slug' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Find restaurant by slug
    const { data: restaurant, error: restaurantError } = await supabase
      .from('pizzerias')
      .select('id, slug, name')
      .eq('slug', restaurant_slug)
      .maybeSingle()

    console.log(`VALIDATE_TABLE_DEBUG: restaurant_found=${!!restaurant}, restaurant_id_found=${restaurant?.id}`)

    if (restaurantError || !restaurant) {
      console.log(`VALIDATE_TABLE_RESULT: valid=false, reason=restaurant_not_found`)
      return new Response(JSON.stringify({ valid: false, reason: 'restaurant_not_found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Handle validate-table
    if (action === 'validate-table') {
      if (!table_token) {
        console.log(`VALIDATE_TABLE_RESULT: valid=false, reason=missing_token`)
        return new Response(JSON.stringify({ valid: false, reason: 'invalid_token' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Check table by token alone first for debug
      const { data: tableAny, error: tableAnyError } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('public_token', table_token)
        .maybeSingle()
      
      console.log(`VALIDATE_TABLE_DEBUG: table_found_by_token_any_restaurant=${!!tableAny}`)

      const { data: table, error: tableError } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('public_token', table_token)
        .maybeSingle()

      console.log(`VALIDATE_TABLE_DEBUG: table_found_by_restaurant_and_token=${!!table}`)

      if (tableError || !table) {
        console.log(`VALIDATE_TABLE_RESULT: valid=false, reason=invalid_token`)
        return new Response(JSON.stringify({ valid: false, reason: 'invalid_token' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      console.log(`VALIDATE_TABLE_DEBUG: table_is_active=${table.is_active}`)

      if (table.is_active !== true) {
        console.log(`VALIDATE_TABLE_RESULT: valid=false, table_number=${table.table_number}, reason=inactive_table`)
        return new Response(JSON.stringify({ valid: false, reason: 'inactive_table' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      console.log(`VALIDATE_TABLE_RESULT: valid=true, table_number=${table.table_number}`)
      return new Response(JSON.stringify({
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
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Handle restaurant-tables (list)
    if (action === 'restaurant-tables') {
      const { data: tables, error: tablesError } = await supabase
        .from('restaurant_tables')
        .select('table_number, table_name, public_token, qr_code_url, is_active')
        .eq('restaurant_id', restaurant.id)
        .eq('is_active', true)

      if (tablesError) {
        return new Response(JSON.stringify({ error: tablesError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify(tables), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
