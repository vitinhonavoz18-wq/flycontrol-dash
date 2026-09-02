/**
 * Quem manda na plataforma inteira (e não só na própria loja).
 *
 * Existem dois níveis, e eles não são a mesma coisa:
 *
 * - **fundador**: uma conta única, identificada pelo e-mail. É o dono do
 *   FlyControl. Só ela pode fazer o que não tem volta, como apagar uma loja
 *   de vez. É a chave do cofre — existe uma só, e não se copia.
 *
 * - **administrador da plataforma**: o fundador OU qualquer conta com o papel
 *   `super_admin` no banco. É quem enxerga o Painel Admin e passa pelas
 *   travas de loja suspensa. É o molho de chaves do gerente: abre quase tudo,
 *   menos o cofre.
 *
 * Este arquivo existe porque esse e-mail estava escrito à mão em quatro telas
 * diferentes. Trocar de e-mail exigia lembrar dos quatro lugares — e esquecer
 * um significa uma tela que continua obedecendo ao endereço antigo.
 */

/** E-mail da conta do fundador. Único lugar do sistema onde ele aparece. */
export const FOUNDER_EMAIL = "vitinhonavoz18@gmail.com";

/** É a conta do fundador? Comparação sem diferenciar maiúsculas de minúsculas. */
export function isFounderEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase() === FOUNDER_EMAIL;
}
