import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Fecha todos os ciclos CENTS vencidos (ends_at <= now()). Idempotente: um ciclo
// só é fechado uma vez (transiciona de 'ativo' para 'fechado'), então chamadas
// repetidas do cron não duplicam efeito. Chamado por um Cron Job diário (Volume 2/8).

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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data, error } = await supabaseAdmin.rpc('club_close_due_cycles')

    if (error) {
      console.error('[club-close-cycle] erro ao fechar ciclos:', error)
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    return new Response(JSON.stringify({ success: true, cycles_closed: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (e) {
    console.error('[club-close-cycle] erro inesperado:', e)
    return new Response(JSON.stringify({ success: false, error: 'Erro interno' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
