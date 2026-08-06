/**
 * Atalho temporário: criar conta sem passar pelo pagamento.
 *
 * Existe para inspecionar o que vem depois do checkout — a configuração da
 * loja, os dados do site — sem precisar de um pagamento real a cada teste.
 *
 * É, por definição, um caminho que entrega acesso completo de graça. Por isso
 * ele nasce desligado e não liga sozinho em lugar nenhum: precisa de
 * SIGNUP_ALLOW_PAYMENT_BYPASS="true" no ambiente. Em produção, deixar essa
 * variável ligada é o mesmo que publicar um botão de "assine grátis".
 *
 * QUANDO REMOVER: assim que a confirmação de pagamento vier da InfinityPay.
 * Apague este arquivo, o campo `bypassPayment` de SignupInput e o botão em
 * routes/signup.tsx — o compilador aponta o resto.
 */

const ENV_VAR = "SIGNUP_ALLOW_PAYMENT_BYPASS";

export const PAYMENT_BYPASS_ENV_VAR = ENV_VAR;

/**
 * Se o atalho está liberado neste ambiente.
 *
 * Só o servidor responde isso. O navegador usa a resposta apenas para decidir
 * se desenha o botão; quem valida de verdade é o servidor, de novo, na hora de
 * criar a conta. Sem essa segunda checagem, bastaria forjar a requisição.
 */
export function isPaymentBypassAllowed(env: Record<string, string | undefined>): boolean {
  return env[ENV_VAR]?.trim().toLowerCase() === "true";
}

/** Texto que acompanha o atalho na tela. Não é para passar despercebido. */
export const PAYMENT_BYPASS_WARNING =
  "Modo de teste: a conta é criada e ativada sem pagamento. Este atalho só existe " +
  "porque o ambiente está com o modo de teste ligado.";

/** Motivo gravado na auditoria da assinatura. */
export const PAYMENT_BYPASS_REASON =
  "Conta ativada pelo atalho de teste, sem pagamento (SIGNUP_ALLOW_PAYMENT_BYPASS)";
