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

    console.log(`TABLE_VALIDATE_REQUEST: action=${action}, restaurant_slug=${restaurant_slug}, table_token=${table_token}`)

    if (!restaurant_slug) {
      return new Response(JSON.stringify({ valid: false, reason: 'missing_slug' }), {
        status: 400,
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
      .single()

    if (restaurantError || !restaurant) {
      console.log(`TABLE_VALIDATE_RESULT: valid=false, reason=restaurant_not_found`)
      return new Response(JSON.stringify({ valid: false, reason: 'restaurant_not_found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`TABLE_VALIDATE_RESTAURANT_FOUND: restaurant_id=${restaurant.id}, restaurant_slug=${restaurant.slug}`)

    // Handle validate-table
    if (action === 'validate-table') {
      if (!table_token) {
        return new Response(JSON.stringify({ valid: false, reason: 'missing_token' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: table, error: tableError } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('public_token', table_token)
        .maybeSingle()

      if (tableError || !table) {
        console.log(`TABLE_VALIDATE_RESULT: valid=false, reason=invalid_token`)
        return new Response(JSON.stringify({ valid: false, reason: 'invalid_token' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (!table.is_active) {
        console.log(`TABLE_VALIDATE_RESULT: valid=false, table_number=${table.table_number}, reason=inactive_table`)
        return new Response(JSON.stringify({ valid: false, reason: 'inactive_table' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }


      console.log(`TABLE_VALIDATE_RESULT: valid=true, table_number=${table.table_number}`)
      return new Response(JSON.stringify({
        valid: true,
        table: {
          id: table.id,
          restaurant_id: table.restaurant_id,
          restaurant_slug: restaurant.slug,
          table_number: table.table_number,
          table_name: table.table_name,
          public_token: table.public_token,
          is_active: table.is_active,
          qr_code_url: table.qr_code_url
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
