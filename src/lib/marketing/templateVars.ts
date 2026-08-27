/**
 * As variáveis da mensagem: {{nome}}, {{cupom}}, {{link_cardapio}}…
 *
 * POR QUE ISTO NÃO É UM "SUBSTITUIR TEXTO" SIMPLES
 *
 * A mensagem é escrita pelo dono do restaurante e o valor vem do cadastro do
 * cliente. Se a troca fosse ingênua, um nome de cliente contendo "{{cupom}}"
 * viraria um cupom de verdade na mensagem de outra pessoa — como se, ao
 * escrever o nome no caderno de reservas, o cliente conseguisse escrever
 * também na coluna do desconto.
 *
 * Por isso a substituição acontece em UMA passada só, sobre o texto original.
 * O que sai de uma variável nunca é lido de novo à procura de outra variável.
 *
 * E não existe execução de nada aqui: variável não é código, é troca de
 * texto por texto. Não há eval, não há função, não há acesso a objeto por
 * nome vindo de fora — só um dicionário fechado de chaves conhecidas.
 */

/** As únicas variáveis que existem. Nada fora desta lista é reconhecido. */
export const VARIAVEIS = [
  "nome",
  "primeiro_nome",
  "nome_estabelecimento",
  "cupom",
  "desconto",
  "link_cardapio",
  "ultimo_pedido",
] as const;

export type Variavel = (typeof VARIAVEIS)[number];

export const DESCRICAO_VARIAVEIS: Record<Variavel, string> = {
  nome: "Nome completo do cliente",
  primeiro_nome: "Só o primeiro nome",
  nome_estabelecimento: "Nome do seu restaurante",
  cupom: "Código do cupom da campanha",
  desconto: "Desconto do cupom (ex.: 15%)",
  link_cardapio: "Endereço do seu cardápio",
  ultimo_pedido: "Quando ele pediu pela última vez",
};

export type ValoresVariaveis = Partial<Record<Variavel, string | null | undefined>>;

/**
 * O que aparece quando a variável não tem valor.
 *
 * Deixar "{{primeiro_nome}}" cru na mensagem é o pior resultado possível — o
 * cliente vê o defeito. Trocar por vazio às vezes deixa a frase quebrada
 * ("Oi , tudo bem?"). Então cada variável tem uma saída digna: o nome vira
 * "tudo bem?", o cupom some junto com o espaço em volta.
 */
const RESERVA: Record<Variavel, string> = {
  nome: "cliente",
  primeiro_nome: "cliente",
  nome_estabelecimento: "nosso restaurante",
  cupom: "",
  desconto: "",
  link_cardapio: "",
  ultimo_pedido: "",
};

const PADRAO = /\{\{\s*([a-z_]+)\s*\}\}/g;

/**
 * Troca as variáveis pelos valores, numa passada só.
 *
 * Chaves desconhecidas ({{qualquercoisa}}) são deixadas como estão de
 * propósito: assim o dono percebe na pré-visualização que digitou errado, em
 * vez de a mensagem sair com um buraco silencioso.
 */
export function renderizarMensagem(texto: string, valores: ValoresVariaveis): string {
  const saida = texto.replace(PADRAO, (original, chave: string) => {
    if (!(VARIAVEIS as readonly string[]).includes(chave)) return original;
    const v = valores[chave as Variavel];
    const limpo = typeof v === "string" ? v.trim() : "";
    return limpo !== "" ? limpo : RESERVA[chave as Variavel];
  });

  // Variável vazia costuma deixar espaço duplo e linha só com espaço.
  return saida
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Quais variáveis o dono usou — para mostrar na tela e avisar do que falta. */
export function variaveisUsadas(texto: string): Variavel[] {
  const achadas = new Set<Variavel>();
  for (const m of texto.matchAll(PADRAO)) {
    const chave = m[1];
    if ((VARIAVEIS as readonly string[]).includes(chave)) achadas.add(chave as Variavel);
  }
  return [...achadas];
}

/** Variáveis escritas que não existem — erro de digitação do dono. */
export function variaveisDesconhecidas(texto: string): string[] {
  const achadas = new Set<string>();
  for (const m of texto.matchAll(PADRAO)) {
    if (!(VARIAVEIS as readonly string[]).includes(m[1])) achadas.add(m[1]);
  }
  return [...achadas];
}

export function primeiroNome(nomeCompleto: string | null | undefined): string {
  const limpo = (nomeCompleto ?? "").trim();
  if (!limpo) return "";
  return limpo.split(/\s+/)[0];
}

/** "há 12 dias" / "ontem" / "hoje" — o jeito que uma pessoa fala. */
export function descreverUltimoPedido(quando: string | null | undefined): string {
  if (!quando) return "";
  const data = new Date(quando);
  if (Number.isNaN(data.getTime())) return "";
  const dias = Math.floor((Date.now() - data.getTime()) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "há 1 mês" : `há ${meses} meses`;
}
