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

    if (!user) throw new Error('Unauthorized')

    // Verificar se é super_admin
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .single()

    if (!roleData) throw new Error('Forbidden: Only super admins can delete users')

    const { userId } = await req.json()
    if (!userId) throw new Error('User ID is required')

    // 1. Obter dados do usuário alvo
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: targetUser, error: getError } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (getError || !targetUser.user) throw new Error('User not found')

    const targetEmail = targetUser.user.email

    // 2. Proteções
    if (targetEmail === 'vitinhonavoz18@gmail.com') {
      throw new Error('A conta admin principal não pode ser excluída.')
    }
    if (userId === user.id) {
      throw new Error('Você não pode excluir sua própria conta enquanto está logado.')
    }

    // 3. Registrar na tabela de bloqueio
    await supabaseAdmin.from('blocked_emails').insert({
      email: targetEmail,
      user_id_antigo: userId,
      deleted_by: user.id,
      reason: 'Excluído pelo administrador'
    })

    // 4. Exclusão lógica no profile
    await supabaseAdmin.from('profiles').update({ 
      deleted_at: new Date().toISOString()
    }).eq('id', userId)

    // 5. Remover vínculos com pizzarias (user_roles ou tabelas de vínculo)
    // No FlyControl, as permissões parecem estar em user_roles e profiles.is_admin
    await supabaseAdmin.from('user_roles').delete().eq('user_id', userId)

    // 6. Excluir do Auth
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (deleteError) throw deleteError

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
