/**
 * Leitura tolerante das variáveis do Supabase.
 *
 * O endereço e as chaves atravessam vários lugares até chegar aqui: secrets
 * do GitHub, ambiente de build, secrets do Cloudflare, painéis web, teclado
 * de celular. Em cada parada dá para grudar sujeira no valor — aspas copiadas
 * junto de um arquivo .env, espaço no começo, quebra de linha no fim, ou o
 * domínio sem o "https://".
 *
 * Qualquer uma dessas derruba a aplicação inteira com "Invalid supabaseUrl",
 * porque o valor existe (é verdadeiro) mas não é uma URL. É uma falha cara
 * para uma causa boba, e ela já aconteceu em produção.
 *
 * Aqui o valor é limpo antes de ser usado, e quando ainda assim não dá para
 * aproveitar, a mensagem diz qual variável está errada e com o que ela se
 * parece — sem imprimir chave secreta.
 */

/** Tira espaços e aspas que tenham sido copiadas junto do valor. */
function unwrap(raw: string | undefined | null): string {
  if (typeof raw !== "string") return "";
  // Aspas primeiro, espaços depois: `" https://x "` precisa das duas passadas.
  return raw
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

/**
 * Normaliza o endereço do projeto Supabase.
 *
 * Aceita `projeto.supabase.co` e completa o esquema: um domínio sozinho é o
 * erro de digitação mais comum, e recusá-lo não protege de nada.
 * Devolve `null` quando não sobra nada aproveitável.
 */
export function normalizeSupabaseUrl(raw: string | undefined | null): string | null {
  const value = unwrap(raw);
  if (!value) return null;

  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }

  // Sem host não há projeto: "https://" sozinho passaria pelo construtor.
  if (!parsed.hostname || !parsed.hostname.includes(".")) return null;

  // Barra final quebra a montagem de algumas rotas do supabase-js.
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

/** Limpa uma chave. O conteúdo não é validado — só a sujeira em volta. */
export function normalizeSupabaseKey(raw: string | undefined | null): string | null {
  const value = unwrap(raw);
  return value || null;
}

/**
 * Descreve um valor problemático sem vazar segredo.
 *
 * Mostra o tamanho e um trecho do começo. Para uma URL isso já identifica o
 * erro na hora; para uma chave, os primeiros caracteres bastam para saber se
 * veio truncada ou com aspas, sem revelar a chave.
 */
export function describeBadValue(raw: string | undefined | null): string {
  if (typeof raw !== "string" || raw.length === 0) return "vazia";
  const head = raw.slice(0, 12).replace(/\n/g, "\\n");
  return `${raw.length} caracteres, começa com "${head}…"`;
}

export type SupabaseEnvResult =
  { ok: true; url: string; key: string } | { ok: false; message: string };

/**
 * Resolve endereço e chave, com mensagem acionável quando falha.
 *
 * `urlNames` e `keyNames` recebem os nomes reais das variáveis consultadas,
 * para que a mensagem aponte onde mexer — o mesmo código roda com nomes
 * diferentes no navegador (VITE_) e no servidor.
 */
export function resolveSupabaseEnv(
  rawUrl: string | undefined | null,
  rawKey: string | undefined | null,
  names: { url: string; key: string },
): SupabaseEnvResult {
  const url = normalizeSupabaseUrl(rawUrl);
  const key = normalizeSupabaseKey(rawKey);

  const problems: string[] = [];
  if (!url) problems.push(`${names.url} (${describeBadValue(rawUrl)})`);
  if (!key) problems.push(`${names.key} (${describeBadValue(rawKey)})`);

  if (problems.length > 0) {
    return {
      ok: false,
      message:
        `Configuração do Supabase inválida em: ${problems.join(" e ")}. ` +
        `O endereço deve ficar assim: https://SEU-PROJETO.supabase.co — ` +
        `sem aspas, sem espaços e sem barra no final.`,
    };
  }

  return { ok: true, url: url!, key: key! };
}
