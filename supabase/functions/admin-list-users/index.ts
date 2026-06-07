import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // Check if the requester is a super_admin
    const { data: roleData, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .maybeSingle()

    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden: Only super admins can list users' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch users from Auth (requires service role)
    const { data: { users: authUsers }, error: authError } = await supabaseAdmin.auth.admin.listUsers()
    if (authError) throw authError

    // Fetch profiles
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
    if (profileError) throw profileError

    // Fetch roles
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .select('*')
    if (rolesError) throw rolesError

    // Fetch pizzerias (restaurant associations)
    const { data: pizzerias, error: pizzeriasError } = await supabaseAdmin
      .from('pizzerias')
      .select('owner_id, name')
    if (pizzeriasError) throw pizzeriasError

    // Combine data
    const combinedUsers = authUsers.map(authUser => {
      const profile = profiles.find(p => p.id === authUser.id)
      const userRoles = roles.filter(r => r.user_id === authUser.id).map(r => r.role)
      const pizzeria = pizzerias?.find(p => p.owner_id === authUser.id)
      
      return {
        id: authUser.id,
        email: authUser.email,
        full_name: profile?.full_name || 'N/A',
        phone: profile?.phone || 'N/A',
        roles: userRoles,
        status: authUser.email_confirmed_at ? 'active' : 'pending',
        created_at: authUser.created_at,
        last_sign_in_at: authUser.last_sign_in_at,
        restaurant_name: pizzeria?.name || 'N/A' 
      }
    })

    return new Response(JSON.stringify({ success: true, users: combinedUsers }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
