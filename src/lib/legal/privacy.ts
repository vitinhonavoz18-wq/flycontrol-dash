/**
 * Versão da Política de Privacidade.
 *
 * Separada da versão dos termos de propósito: os dois documentos mudam por
 * motivos diferentes, e versioná-los juntos obrigaria a invalidar o aceite de
 * um por causa de uma correção no outro.
 */
export const PRIVACY_VERSION = "2026-08-06.1";

export const PRIVACY_LAST_UPDATED = "6 de agosto de 2026";

/**
 * Pendências de redação jurídica desta política.
 *
 * O que a página descreve sobre coleta, compartilhamento e segurança é
 * factual — foi levantado do próprio banco e do código. O que está listado
 * aqui não se resolve escrevendo texto: depende de decisões do negócio
 * (prazos, encarregado, contratos) e de revisão jurídica. Exibir cláusula
 * genérica no lugar aparentaria uma conformidade que não existe.
 */
export const PENDING_PRIVACY_SECTIONS: readonly string[] = [
  "Nomeação do encarregado (DPO) e canal oficial de contato",
  "Prazos de retenção e rotina de descarte de cada categoria de dado",
  "Base legal formalizada para cada finalidade de tratamento",
  "Contrato de operador (DPA) com os estabelecimentos contratantes",
  "Formalização da transferência internacional de dados",
  "Procedimento de resposta a incidentes e comunicação à ANPD",
];
