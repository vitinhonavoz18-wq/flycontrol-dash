import { createFileRoute } from "@tanstack/react-router";

import { destinoDoLinkDaLoja } from "@/lib/site/enderecoDaLoja";

/**
 * flydelivery.app/loja/<loja> — o link de campanha do app FlyDelivery.
 *
 * No celular com o app instalado (e o domínio verificado), o Android/iOS abre
 * o app direto na loja e esta página nem é chamada. Sem o app — no
 * computador, no iPhone sem o app, no navegador do Instagram — antes dava
 * "página não encontrada". Agora a pessoa cai no cardápio online da loja e
 * consegue pedir do mesmo jeito: o cartaz da campanha nunca leva a uma porta
 * fechada.
 *
 * 302 (temporário) de propósito: se um dia o app ganhar versão web, este
 * endereço pode passar a abri-la sem que navegadores tenham guardado o
 * destino antigo.
 */
export const Route = createFileRoute("/loja/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const destino = destinoDoLinkDaLoja(params.slug, new URL(request.url).search);
        return new Response(null, {
          status: 302,
          headers: { location: destino, "cache-control": "no-store" },
        });
      },
    },
  },
});
