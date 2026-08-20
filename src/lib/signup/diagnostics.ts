/**
 * Detalhe técnico na mensagem de erro do cadastro.
 *
 * A mensagem curta em português é a certa para quem está se cadastrando:
 * código de restrição e nome de coluna não ajudam o cliente e ainda revelam a
 * estrutura do banco para quem estiver olhando.
 *
 * Mas já aconteceu de um cadastro falhar em produção e a única forma de
 * descobrir o motivo ser abrir o log do servidor — uma investigação inteira
 * por causa de um erro de uma linha. Com esta chave ligada, o erro do banco
 * aparece junto da mensagem, e a causa fica visível na hora.
 *
 * Nasce DESLIGADA. Ligue só enquanto estiver investigando algo, e desligue
 * depois: é o equivalente a deixar a porta da cozinha aberta para procurar um
 * barulho — útil enquanto se procura, ruim de esquecer aberta.
 *
 * Diferente do antigo atalho de teste, esta chave NÃO cria conta, NÃO ativa
 * assinatura e NÃO libera nada de graça. Ela só muda o texto de uma mensagem
 * de erro.
 */

const ENV_VAR = "SIGNUP_DEBUG_ERRORS";

export const SIGNUP_DEBUG_ENV_VAR = ENV_VAR;

export function isSignupDebugEnabled(env: Record<string, string | undefined>): boolean {
  return env[ENV_VAR]?.trim().toLowerCase() === "true";
}

/** Anexa o erro do banco à mensagem, apenas com a chave ligada. */
export function withDiagnostics(message: string, error: unknown, enabled: boolean): string {
  if (!enabled || !error) return message;

  const e = error as { code?: string; message?: string; details?: string; hint?: string };
  const parts = [e.code, e.message, e.details, e.hint].filter(Boolean);
  return parts.length > 0 ? `${message}\n\n[diagnóstico] ${parts.join(" · ")}` : message;
}
