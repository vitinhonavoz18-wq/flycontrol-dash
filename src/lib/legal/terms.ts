/**
 * Versão dos documentos legais.
 *
 * O aceite registrado no cadastro guarda esta versão. Sem ela, uma alteração
 * futura nos termos tornaria impossível saber a que texto cada cliente
 * consentiu — que é justamente o que um registro de consentimento precisa
 * provar.
 *
 * Suba a versão sempre que o conteúdo mudar de forma material.
 */
export const TERMS_VERSION = "2026-08-27.1";

export const TERMS_LAST_UPDATED = "27 de agosto de 2026";

/**
 * Seções ainda pendentes de redação jurídica.
 *
 * As condições comerciais na página são factuais: descrevem o que o sistema
 * realmente faz, e eu as escrevi a partir do próprio motor de cobrança. As
 * cláusulas listadas aqui são outra natureza de texto — precisam de
 * advogado, e a página as marca visivelmente como pendentes em vez de exibir
 * um texto genérico que aparentaria validade que não tem.
 */
export const PENDING_LEGAL_SECTIONS: readonly string[] = [
  "Limitação de responsabilidade",
  "Propriedade intelectual",
  "Rescisão e suspensão por descumprimento",
  "Foro e legislação aplicável",
  "Tratamento de dados pessoais conforme a LGPD",
  "Política de privacidade completa",
];
