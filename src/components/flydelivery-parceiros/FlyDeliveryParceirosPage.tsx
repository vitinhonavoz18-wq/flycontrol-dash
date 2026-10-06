import { EcosystemSection } from "./EcosystemSection";
import { FeaturesSection } from "./FeaturesSection";
import { FinalCTA } from "./FinalCTA";
import { FlyBoySection } from "./FlyBoySection";
import { FlyDeliveryFooter } from "./FlyDeliveryFooter";
import { FlyDeliveryHero } from "./FlyDeliveryHero";
import { FlyDeliveryNavbar } from "./FlyDeliveryNavbar";
import { MarketplaceSection } from "./MarketplaceSection";
import { OperationsSection } from "./OperationsSection";
import { OrdersSection } from "./OrdersSection";
import { useAmbienteDaPagina } from "./ganchos";

/**
 * A página FlyDelivery Parceiros inteira, montada em um componente só.
 *
 * HOJE ela é aberta em /flydelivery-parceiros (ver src/routes/). A página
 * inicial atual do FlyControl (src/routes/index.tsx) não foi tocada.
 *
 * NO DIA DA TROCA (só com autorização), a rota "/" passa a mostrar
 * <FlyDeliveryParceirosPage /> e a usar `cabecalhoDaPagina()` de
 * lib/flydelivery-parceiros/site.ts. Nenhuma seção precisa ser refeita —
 * é trocar o quadro de parede, não reformar a sala.
 *
 * Todo o visual vive dentro de `.fdp` (ver parceiros.css), então nada daqui
 * vaza para o painel.
 */
export function FlyDeliveryParceirosPage() {
  useAmbienteDaPagina();

  return (
    <div className="fdp min-h-screen">
      <a
        href="#conteudo"
        className="sr-only z-[60] rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-md focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Pular para o conteúdo
      </a>

      <FlyDeliveryNavbar />

      <main id="conteudo">
        <FlyDeliveryHero />
        <EcosystemSection />
        <OrdersSection />
        <MarketplaceSection />
        <FeaturesSection />
        <OperationsSection />
        <FlyBoySection />
        <FinalCTA />
      </main>

      <FlyDeliveryFooter />
    </div>
  );
}
