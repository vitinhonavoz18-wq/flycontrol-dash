/**
 * Os textos do cardápio que o dono da loja pode escrever do jeito dele.
 *
 * O QUE ISSO RESOLVE
 *
 * O cardápio tinha frases escritas dentro do código — "Curadoria
 * Gastronômica", "Nossa Cozinha". Serviam bem para um restaurante e mal para
 * uma farmácia ou uma loja de bebidas. Era a placa da fachada vindo pronta de
 * fábrica, igual para todo mundo.
 *
 * COMO ESTÁ ORGANIZADO, E POR QUÊ
 *
 * A lista `TEXTOS_DO_CARDAPIO` é o catálogo: cada linha descreve um texto
 * editável, com rótulo, ajuda, limite de tamanho e o valor padrão. A tela de
 * edição e o cardápio leem dessa mesma lista.
 *
 * Isso é de propósito. Amanhã, quando quisermos deixar editável a mensagem de
 * "loja fechada", o texto do carrinho ou o aviso de pedido mínimo, basta
 * acrescentar uma linha aqui: o campo aparece sozinho na tela de edição, com
 * contador e validação, e o cardápio já sabe onde buscar. É o cardápio de
 * papel com espaço para escrever o prato do dia — não é preciso reimprimir
 * tudo para acrescentar um item.
 *
 * O TEXTO PADRÃO NUNCA SOME
 *
 * Loja que nunca mexeu nisso continua vendo exatamente o que via antes. O
 * padrão de cada texto é a frase que já estava no ar; a configuração só
 * substitui quando existe e não está vazia.
 */

/** Identificadores fixos. Nunca comparar pelo texto que aparece na tela. */
export type ChaveDeTexto = "menu_badge" | "menu_title" | "menu_description";

export type DefinicaoDeTexto = {
  chave: ChaveDeTexto;
  /** Nome do campo na tela de edição. */
  rotulo: string;
  /** Explicação curta embaixo do campo. */
  ajuda: string;
  /** Máximo de caracteres aceito. */
  maximo: number;
  /** O que a loja vê hoje, e continua vendo se nunca editar. */
  padrao: string;
  /** Campo de várias linhas em vez de uma linha só. */
  multilinha?: boolean;
};

/**
 * O catálogo. Para acrescentar um texto editável no futuro, some uma linha
 * aqui — e mais nada.
 */
export const TEXTOS_DO_CARDAPIO: readonly DefinicaoDeTexto[] = [
  {
    chave: "menu_badge",
    rotulo: "Texto de destaque",
    ajuda: "A tarja pequena acima do título, em letras maiúsculas.",
    maximo: 50,
    padrao: "Curadoria Gastronômica",
  },
  {
    chave: "menu_title",
    rotulo: "Título principal",
    ajuda: "O título grande do cardápio. A última palavra sai na cor da sua loja.",
    maximo: 50,
    padrao: "Nossa Cozinha",
  },
  {
    chave: "menu_description",
    rotulo: "Descrição do cardápio",
    ajuda: "A frase abaixo do título, que convida o cliente a escolher.",
    maximo: 200,
    padrao:
      "Selecione uma categoria para descobrir nossas especialidades artesanais de alta qualidade.",
    multilinha: true,
  },
] as const;

/** Onde o pacote de textos mora dentro das configurações da loja. */
export const CHAVE_NO_SITE_SETTINGS = "menu_texts";

export type TextosDoCardapio = Record<ChaveDeTexto, string>;

function definicao(chave: ChaveDeTexto): DefinicaoDeTexto {
  const d = TEXTOS_DO_CARDAPIO.find((t) => t.chave === chave);
  if (!d) throw new Error(`[textos] chave desconhecida: ${chave}`);
  return d;
}

/**
 * Limpa um texto digitado.
 *
 * Tira marcação de HTML, junta espaços repetidos e corta no limite. O motivo
 * do HTML sair: sem isso, alguém poderia colar um pedaço de código no campo e
 * ele iria parar na página do cliente. É o porteiro conferindo a sacola na
 * entrada — não porque todo mundo é suspeito, mas porque basta um.
 */
export function limparTexto(valor: unknown, chave: ChaveDeTexto): string {
  const d = definicao(chave);
  if (typeof valor !== "string") return "";
  return valor
    .replace(/<[^>]*>/g, "") // qualquer coisa entre < e > sai
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, d.maximo);
}

/**
 * Diz o que está errado com o texto, ou `null` se estiver bom.
 *
 * Texto vazio é permitido de propósito: apagar o campo significa "quero o
 * texto padrão de volta", e não "quero um buraco no cardápio".
 */
export function conferirTexto(valor: string, chave: ChaveDeTexto): string | null {
  const d = definicao(chave);
  if (valor.length > d.maximo) return `Máximo de ${d.maximo} caracteres.`;
  // Só espaços não vira texto: viraria um buraco na página sem ninguém notar.
  if (valor.length > 0 && valor.trim().length === 0) return "Escreva algo ou deixe em branco.";
  if (/<[^>]*>/.test(valor)) return "Não use sinais de < ou > no texto.";
  return null;
}

/**
 * Lê o que está salvo e devolve os textos prontos para exibir.
 *
 * Aceita qualquer coisa como entrada — inclusive `null`, texto solto ou um
 * formato antigo — porque isto roda em cima de dados que já estão no banco há
 * meses. Se não der para entender, cai no padrão, que é sempre o que a loja
 * já via.
 */
export function resolverTextos(siteSettings: unknown): TextosDoCardapio {
  const pacote =
    siteSettings && typeof siteSettings === "object"
      ? (siteSettings as Record<string, unknown>)[CHAVE_NO_SITE_SETTINGS]
      : null;

  const salvos =
    pacote && typeof pacote === "object" && !Array.isArray(pacote)
      ? (pacote as Record<string, unknown>)
      : {};

  const saida = {} as TextosDoCardapio;
  for (const d of TEXTOS_DO_CARDAPIO) {
    const limpo = limparTexto(salvos[d.chave], d.chave);
    saida[d.chave] = limpo.length > 0 ? limpo : d.padrao;
  }
  return saida;
}

/** Só os textos realmente personalizados, prontos para gravar. */
export function paraGravar(valores: Partial<TextosDoCardapio>): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const d of TEXTOS_DO_CARDAPIO) {
    const limpo = limparTexto(valores[d.chave], d.chave);
    // Campo em branco não é gravado: é assim que "voltar ao padrão" funciona
    // sem precisar de uma marcação separada dizendo "este está no padrão".
    if (limpo.length > 0 && limpo !== d.padrao) saida[d.chave] = limpo;
  }
  return saida;
}

/**
 * Parte o título em "começo" e "última palavra".
 *
 * O cardápio sempre pintou a última palavra do título na cor da loja — era
 * "Nossa **Cozinha**". Como agora o título é escrito pelo lojista, a regra
 * continua valendo para o que ele escrever: "Sabores da **Casa**". Assim o
 * visual não muda, só as palavras.
 */
export function dividirTitulo(titulo: string): { inicio: string; destaque: string } {
  const partes = titulo.trim().split(/\s+/);
  if (partes.length <= 1) return { inicio: "", destaque: titulo.trim() };
  const destaque = partes.pop() as string;
  return { inicio: partes.join(" ") + " ", destaque };
}
