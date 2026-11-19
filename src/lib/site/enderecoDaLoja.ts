/**
 * ENDEREÇO DA LOJA NO CARDÁPIO ONLINE (conectfly.com.br/<endereço>)
 *
 * Quem decide se um endereço pode ser usado é o SiteCreatorFly — é lá que
 * ficam as lojas e o caderno de endereços, e é o banco de lá que recusa nome
 * repetido. Esta cópia daqui serve só para a tela reagir enquanto o dono
 * digita: mostrar a prévia já arrumada e avisar de cara quando é curto ou
 * longo demais, sem esperar a resposta do outro sistema.
 *
 * A regra é a mesma de `src/lib/site/storeAddress.ts` do SiteCreatorFly, e os
 * dois lados têm teste com os mesmos exemplos. Mudou lá, mude aqui.
 */

/** Endereço oficial dos cardápios (precisa bater com publicDomain.ts do SiteCreatorFly). */
export const CARDAPIO_HOST = "cardapio.flydelivery.app";
export const CARDAPIO_ORIGEM = `https://${CARDAPIO_HOST}`;
/** Endereços antigos — ainda abrem, mas não devem mais ser mostrados ao lojista. */
export const CARDAPIO_HOSTS_ANTIGOS: readonly string[] = [
  "conectfly.com.br",
  "www.conectfly.com.br",
];

export const ENDERECO_BASE = CARDAPIO_HOST;
export const ENDERECO_MIN = 3;
export const ENDERECO_MAX = 40;

const FORMATO = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** "Açaí e Love" → "acai-e-love". */
export function normalizarEndereco(entrada: string | null | undefined): string {
  return String(entrada ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s_.]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .slice(0, ENDERECO_MAX)
    .replace(/-+$/, "");
}

/** Respostas possíveis do SiteCreatorFly, mais as que a tela descobre sozinha. */
export type SituacaoDoEndereco =
  | "available"
  | "yours"
  | "current"
  | "taken"
  | "too_short"
  | "too_long"
  | "invalid_format"
  | "reserved"
  | "test_pattern";

/** Problema de formato que dá para ver sem perguntar ao servidor. */
export function problemaDeFormato(endereco: string): SituacaoDoEndereco | null {
  if (endereco.length < ENDERECO_MIN) return "too_short";
  if (endereco.length > ENDERECO_MAX) return "too_long";
  if (!FORMATO.test(endereco) || endereco.includes("--")) return "invalid_format";
  return null;
}

/** Pode apertar "Usar este endereço"? */
export function podeSalvar(situacao: SituacaoDoEndereco | null): boolean {
  return situacao === "available" || situacao === "yours";
}

export type Aviso = { tom: "ok" | "erro" | "neutro"; texto: string };

/** O texto que aparece embaixo do campo, em português de gente. */
export function avisoDoEndereco(situacao: SituacaoDoEndereco): Aviso {
  switch (situacao) {
    case "available":
      return { tom: "ok", texto: "Disponível" };
    case "yours":
      return { tom: "ok", texto: "Disponível — este endereço já foi da sua loja" };
    case "current":
      return { tom: "neutro", texto: "Este já é o endereço atual da sua loja" };
    case "taken":
      return { tom: "erro", texto: "Já está em uso, tente uma variação" };
    case "too_short":
      return { tom: "erro", texto: `Formato inválido: use pelo menos ${ENDERECO_MIN} caracteres` };
    case "too_long":
      return { tom: "erro", texto: `Formato inválido: use no máximo ${ENDERECO_MAX} caracteres` };
    case "invalid_format":
      return {
        tom: "erro",
        texto: "Formato inválido: use só letras, números e traço (sem traço no começo ou no fim)",
      };
    case "reserved":
      return { tom: "erro", texto: "Este nome é usado pelo próprio sistema, tente uma variação" };
    case "test_pattern":
      return { tom: "erro", texto: 'Endereços começando com "teste" não são permitidos' };
  }
}

/** Situações que o servidor pode devolver e esta tela conhece. */
const CONHECIDAS = new Set<SituacaoDoEndereco>([
  "available",
  "yours",
  "current",
  "taken",
  "too_short",
  "too_long",
  "invalid_format",
  "reserved",
  "test_pattern",
]);

export function situacaoConhecida(valor: unknown): SituacaoDoEndereco | null {
  return typeof valor === "string" && CONHECIDAS.has(valor as SituacaoDoEndereco)
    ? (valor as SituacaoDoEndereco)
    : null;
}

/** O endereço que está no ar, lido do link gravado (`public_url`). */
export function enderecoAtualDoLink(publicUrl: string | null | undefined): string | null {
  const url = (publicUrl ?? "").trim();
  if (!url) return null;
  try {
    const caminho = new URL(url).pathname.split("/").filter(Boolean)[0];
    return caminho ? caminho.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * O link do cardápio para MOSTRAR ao lojista (copiar, abrir, QR Code, PDF).
 *
 * Lojas antigas têm gravado no banco `https://conectfly.com.br/<loja>`. Em vez
 * de reescrever o banco (arriscado e desnecessário — o endereço antigo
 * continua funcionando), a troca é feita aqui, na hora de mostrar: o
 * lojista sempre vê e imprime o endereço oficial. Um link de outro domínio
 * (domínio próprio da loja) é respeitado como está.
 */
export function linkDoCardapio(
  publicUrl: string | null | undefined,
  slug?: string | null,
): string | null {
  const gravado = (publicUrl ?? "").trim();
  if (gravado) {
    try {
      const url = new URL(gravado);
      if (CARDAPIO_HOSTS_ANTIGOS.includes(url.hostname.toLowerCase())) {
        const caminho = url.pathname === "/" ? "" : url.pathname;
        return `${CARDAPIO_ORIGEM}${caminho}${url.search}${url.hash}`;
      }
      return gravado;
    } catch {
      // link gravado quebrado: cai no endereço montado pelo slug
    }
  }
  const s = (slug ?? "").trim();
  return s ? `${CARDAPIO_ORIGEM}/${s}` : null;
}

/** Link impresso no QR Code da mesa. Mesmo formato que o SiteCreatorFly lê. */
export function linkDaMesa(
  slug: string,
  numeroDaMesa: string | number,
  tokenDaMesa: string,
): string {
  const q = new URLSearchParams({
    mode: "table",
    table_number: String(numeroDaMesa),
    table_token: tokenDaMesa,
  });
  return `${CARDAPIO_ORIGEM}/${slug}?${q.toString()}`;
}

/**
 * Para onde vai quem abre flydelivery.app/loja/<loja> sem o app. Só aceita um
 * apelido de loja de verdade (letras, números e traço); qualquer outra coisa
 * vai para a página inicial do FlyDelivery — nunca para um endereço de fora.
 */
export function destinoDoLinkDaLoja(slug: string, busca = ""): string {
  const limpo = String(slug ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(limpo)) return "https://flydelivery.app/";
  const q = busca && busca.startsWith("?") ? busca : "";
  return `${CARDAPIO_ORIGEM}/${limpo}${q}`;
}
