import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Endereço antigo DESATIVADO.
//
// Ele criava pedido em qualquer loja só com o nome da loja (o "slug", que está
// no link do cardápio), sem senha nenhuma e sem limite por minuto. Qualquer
// pessoa podia encher a tela da cozinha de pedidos falsos — e cada pedido
// entra na conta do CENTS do lojista.
//
// Conferido em produção: nenhum pedido jamais entrou por aqui, e o
// SiteCreatorFly não chama este endereço. O caminho certo é /api/orders do
// painel, que exige a chave da loja e tem teto de pedidos por minuto.
//
// ATENÇÃO: mudar este arquivo NÃO muda o que está no ar. A função publicada
// no Supabase só muda quando alguém publica de novo (ou apaga a função lá).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Endpoint antigo desativado. Use /api/orders do FlyControl.',
      new_endpoint: '/api/orders',
    }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
