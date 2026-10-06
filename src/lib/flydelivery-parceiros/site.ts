/**
 * Configuração da página FlyDelivery Parceiros — endereço, Google e prévia do
 * link, num lugar só.
 *
 * POR QUE FICA AQUI, E NÃO NA ROTA
 *
 * Hoje a página mora em /flydelivery-parceiros, separada da página inicial do
 * FlyControl. No dia em que ela virar a página principal, a rota "/" chama a
 * mesma função `cabecalhoDaPagina()` e pronto: título, descrição, imagem da
 * prévia e a regra do Google vão juntos, sem ninguém copiar texto de um
 * arquivo para o outro. É a mesma placa da loja — só muda o poste onde ela é
 * pendurada.
 *
 * AS DUAS CHAVES (variáveis de ambiente, opcionais)
 *
 * - VITE_FLYDELIVERY_PARCEIROS_URL: o endereço completo da página
 *   (ex.: https://parceiros.flydelivery.com.br). Vira o "endereço oficial"
 *   informado ao Google e a base da imagem da prévia do WhatsApp.
 *
 * - VITE_FLYDELIVERY_PARCEIROS_INDEXAR: só com o valor "sim" o Google é
 *   autorizado a mostrar a página nas buscas. Sem ela — que é o caso de agora
 *   — a página diz "não me indexe, não siga meus links". É a placa de "em
 *   obras" na porta: quem tem o endereço entra, mas ela não aparece no guia
 *   da cidade.
 *
 * O padrão seguro é sempre NÃO indexar: esquecer de configurar nunca publica
 * a página de teste no Google por acidente.
 */

/** Onde a página mora dentro do sistema. */
export const ROTA_DA_PAGINA = "/flydelivery-parceiros";

/** Endereço usado quando nenhum outro foi configurado: o domínio atual. */
const URL_PADRAO = "https://flycontrol.conectfly.com.br/flydelivery-parceiros";

export const TITULO = "FlyDelivery Parceiros | Gestão completa para delivery";
export const DESCRICAO =
  "Gerencie pedidos, cardápio, entregas e sua operação em um só lugar com o FlyDelivery Parceiros.";

const NOME_DO_SITE = "FlyDelivery Parceiros";
const CAMINHO_IMAGEM_PREVIA = "/flydelivery-parceiros/og-image.jpg";
const DESCRICAO_IMAGEM_PREVIA =
  "FlyDelivery Parceiros: “Seu delivery começa no desejo.” ao lado de um hambúrguer";

/** Tira espaços e a barra final, para não sair "//" grudado em outro caminho. */
export function normalizarUrl(valor: string | undefined | null): string {
  const limpo = (valor ?? "").trim().replace(/\/+$/, "");
  return limpo || URL_PADRAO;
}

/** Só "sim" liga. Qualquer outra coisa — vazio, "true", erro de digitação — mantém desligado. */
export function lerPermissaoDeIndexar(valor: string | undefined | null): boolean {
  return (valor ?? "").trim().toLowerCase() === "sim";
}

export const URL_DA_PAGINA = normalizarUrl(import.meta.env.VITE_FLYDELIVERY_PARCEIROS_URL);
export const PERMITIR_INDEXACAO = lerPermissaoDeIndexar(
  import.meta.env.VITE_FLYDELIVERY_PARCEIROS_INDEXAR,
);

type Meta = Record<string, string>;
type Link = Record<string, string>;

/**
 * Monta o cabeçalho invisível da página: o que o Google, o WhatsApp e a aba
 * do navegador leem.
 *
 * Recebe o endereço e a permissão como parâmetro (em vez de ler sozinha) para
 * poder ser testada com qualquer combinação — inclusive a de produção — sem
 * mexer em configuração nenhuma.
 */
export function cabecalhoDaPagina({
  url = URL_DA_PAGINA,
  indexar = PERMITIR_INDEXACAO,
}: { url?: string; indexar?: boolean } = {}): { meta: Meta[]; links: Link[] } {
  const endereco = normalizarUrl(url);
  // A imagem precisa de endereço COMPLETO: o robô do WhatsApp vem de fora e
  // não entende caminho curto. Ela fica sempre na raiz do domínio.
  const imagem = new URL(CAMINHO_IMAGEM_PREVIA, `${endereco}/`).href;

  return {
    meta: [
      { title: TITULO },
      { name: "description", content: DESCRICAO },
      { name: "robots", content: indexar ? "index, follow" : "noindex, nofollow" },

      // Barra do navegador no celular combinando com a página branca.
      { name: "theme-color", content: "#ffffff" },
      { name: "apple-mobile-web-app-title", content: "FlyDelivery" },

      { property: "og:type", content: "website" },
      { property: "og:site_name", content: NOME_DO_SITE },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:url", content: endereco },
      { property: "og:title", content: TITULO },
      { property: "og:description", content: DESCRICAO },
      { property: "og:image", content: imagem },
      { property: "og:image:secure_url", content: imagem },
      { property: "og:image:type", content: "image/jpeg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: DESCRICAO_IMAGEM_PREVIA },

      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITULO },
      { name: "twitter:description", content: DESCRICAO },
      { name: "twitter:image", content: imagem },
      { name: "twitter:image:alt", content: DESCRICAO_IMAGEM_PREVIA },
    ],
    links: [
      { rel: "canonical", href: endereco },
      // Ícone da aba com o símbolo do FlyDelivery (o mesmo do aplicativo).
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/flydelivery-parceiros/favicon-32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "192x192",
        href: "/flydelivery-parceiros/icon-192.png",
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/flydelivery-parceiros/apple-touch-icon.png",
      },
    ],
  };
}
