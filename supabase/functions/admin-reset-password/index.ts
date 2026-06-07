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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { userId, newPassword, confirmReset } = await req.json()

    if (!userId || !newPassword) {
      return new Response(JSON.stringify({ error: 'userId and newPassword are required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    if (confirmReset !== true) {
      return new Response(JSON.stringify({ error: 'confirmReset must be true' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Update user password
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword
    })

    if (error) throw error

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Senha redefinida com sucesso.',
      user: {
        id: data.user.id,
        email: data.user.email
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Error resetting password:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
