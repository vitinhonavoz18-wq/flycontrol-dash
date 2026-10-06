import { createFileRoute } from "@tanstack/react-router";
import { FlyDeliveryParceirosPage } from "@/components/flydelivery-parceiros/FlyDeliveryParceirosPage";
import parceirosCss from "@/components/flydelivery-parceiros/parceiros.css?url";
import { cabecalhoDaPagina } from "@/lib/flydelivery-parceiros/site";

/**
 * /flydelivery-parceiros — a página nova, em teste.
 *
 * Ela convive com a página inicial do FlyControl sem encostar nela: "/"
 * continua exatamente como estava. Esta rota só existe para quem tem o
 * endereço, e diz ao Google para não mostrá-la nas buscas enquanto a chave
 * de indexação não for ligada (ver lib/flydelivery-parceiros/site.ts).
 */
export const Route = createFileRoute("/flydelivery-parceiros")({
  head: () => {
    const { meta, links } = cabecalhoDaPagina();
    return {
      meta,
      links: [
        ...links,
        // O visual da página nova: só é baixado aqui, nunca no painel.
        { rel: "stylesheet", href: parceirosCss },
        // Os pesos 700 e 800 da Inter, para os títulos. A Inter já é baixada
        // pelo site inteiro; aqui só entram os dois pesos mais fortes.
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Inter:wght@700;800&display=swap",
        },
      ],
    };
  },
  component: FlyDeliveryParceirosPage,
});
