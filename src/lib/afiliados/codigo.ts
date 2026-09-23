/**
 * Regras puras do rastreio de afiliados — sem banco, sem rede.
 *
 * Tudo aqui é conferido DE NOVO pelo banco (`afiliado_registrar_visita` e
 * `afiliado_converter_indicacao`). Este arquivo só serve para não gastar uma
 * ida ao servidor com o que já se sabe que é lixo, e para as regras do
 * cookie ficarem num lugar só, testável.
 */

/** Nome do cookie que guarda a indicação. Só o servidor lê e escreve. */
export const COOKIE_DA_INDICACAO = "fly_ref";

/** Mesmo formato exigido pela tabela `affiliates.referral_code`. */
const FORMATO_DO_CODIGO = /^[A-Z0-9]{4,20}$/;

/** Formato de um uuid — o que o banco devolve como ficha da visita. */
const FORMATO_DO_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Deixa o código no formato do cadastro, ou devolve `null` se não tem jeito.
 *
 * "vitor10 " vira "VITOR10": quem digita o link à mão no celular erra
 * maiúscula e espaço, e isso não deveria custar a indicação a ninguém.
 * Já "vitor-10" ou "<script>" não viram nada — não existe afiliado assim.
 */
export function normalizarCodigoDeAfiliado(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const codigo = bruto.trim().toUpperCase();
  return FORMATO_DO_CODIGO.test(codigo) ? codigo : null;
}

/**
 * Tira o `ref` do endereço — `?ref=VITOR10&utm=x` devolve "VITOR10".
 *
 * Recebe o texto do endereço (a parte do `?` em diante), não o objeto que o
 * roteador monta, para funcionar igual em qualquer tela.
 */
export function codigoDoEndereco(search: string): string | null {
  try {
    return normalizarCodigoDeAfiliado(new URLSearchParams(search).get("ref"));
  } catch {
    return null;
  }
}

/** O cookie só é aceito se carregar um uuid — qualquer outra coisa é ignorada. */
export function tokenDoCookie(valor: string | undefined | null): string | null {
  if (!valor) return null;
  const token = valor.trim();
  return FORMATO_DO_TOKEN.test(token) ? token : null;
}

/**
 * Por quantos segundos o cookie vale: até o fim da janela da indicação que o
 * banco definiu, nem um segundo a mais. Se a data já passou (ou é inválida),
 * devolve 0 — e quem chama não grava nada.
 */
export function segundosAteVencer(venceEm: string, agora: Date = new Date()): number {
  const fim = new Date(venceEm).getTime();
  if (Number.isNaN(fim)) return 0;
  return Math.max(0, Math.floor((fim - agora.getTime()) / 1000));
}

/**
 * O máximo que um navegador guarda um cookie: 400 dias. Pedir mais não
 * adianta — o Chrome e os outros cortam em 400 do mesmo jeito. Por isso o
 * link "sem prazo" é renovado a cada novo clique (veja `rastreio.functions`).
 */
export const LIMITE_DO_COOKIE_SEGUNDOS = 400 * 24 * 60 * 60;

/**
 * Quanto tempo o cookie da indicação vale: até a data que o banco deu, mas
 * nunca mais que o limite do navegador.
 */
export function segundosDoCookie(venceEm: string, agora: Date = new Date()): number {
  return Math.min(segundosAteVencer(venceEm, agora), LIMITE_DO_COOKIE_SEGUNDOS);
}

/**
 * Opções do cookie. Cada uma tem motivo:
 *
 * - `httpOnly`: o JavaScript da página não enxerga nem troca o valor. Sem
 *   isso, bastaria abrir o console do navegador para colar o código de outro
 *   afiliado na hora de se cadastrar.
 * - `secure`: só viaja em conexão segura (https).
 * - `sameSite: "lax"`: acompanha quem chega clicando num link de fora (o
 *   caso do afiliado divulgando no Instagram), mas não é enviado por
 *   formulários de outros sites.
 * - `path: "/"`: vale para o site inteiro — a pessoa pode clicar na página
 *   inicial e se cadastrar em outra.
 */
export function opcoesDoCookie(maxAgeSegundos: number) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSegundos,
  };
}

/**
 * Motivos que `afiliado_converter_indicacao` devolve. Todos, menos `ok` e
 * `sem_token`, significam que a indicação foi recusada — e o cookie pode ser
 * jogado fora, porque ele nunca mais vai servir.
 */
export type ResultadoDaConversao =
  | "ok"
  | "sem_token"
  | "programa_desligado"
  | "token_desconhecido"
  | "token_ja_usado"
  | "token_vencido"
  | "afiliado_inativo"
  | "autoindicacao"
  | "loja_ja_indicada";

/**
 * Depois de um cadastro, o cookie some? Some quando a ficha foi usada ou
 * nunca mais vai servir. Fica quando o programa está desligado — se ele
 * for religado dentro da janela, a próxima loja da mesma pessoa ainda conta
 * — e quando a resposta é desconhecida (uma falha passageira não deve custar
 * a indicação a ninguém).
 */
const RESULTADOS_QUE_ENCERRAM_A_FICHA: ReadonlySet<string> = new Set<ResultadoDaConversao>([
  "ok",
  "token_desconhecido",
  "token_ja_usado",
  "token_vencido",
  "afiliado_inativo",
  "autoindicacao",
  "loja_ja_indicada",
]);

export function apagarCookieDepoisDoCadastro(resultado: string): boolean {
  return RESULTADOS_QUE_ENCERRAM_A_FICHA.has(resultado);
}
