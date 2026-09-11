import type { Feature } from "@/lib/planPermissions";

/**
 * Os recursos que um cliente contrata À PARTE, por cima do plano.
 *
 * POR QUE ISTO EXISTE
 *
 * Até agora o sistema só sabia responder uma pergunta: "essa loja é premium
 * ou é cents?". O Chat trouxe uma segunda: "essa loja premium CONTRATOU o
 * Chat?". São perguntas diferentes e precisam de respostas separadas — é a
 * diferença entre ter o plano do restaurante e ter pedido a taça de sobremesa
 * que não vem no combo.
 *
 * O plano decide se a aba APARECE. O addon decide se ela FUNCIONA.
 *
 * Este arquivo é o único lugar que sabe quais recursos são assim. Para
 * vender um segundo recurso à parte amanhã, acrescenta-se uma chave aqui —
 * nada mais no sistema precisa saber.
 */

/** O código guardado no banco, na coluna `company_addons.addon`. */
export type Addon = "crm_chat";

export const ADDON_LABELS: Record<Addon, string> = {
  crm_chat: "Chat (CRM)",
};

/** Qual aba depende de qual contratação. */
export const ADDON_DA_FEATURE: Partial<Record<Feature, Addon>> = {
  chat: "crm_chat",
};

export function addonDaFeature(feature: Feature): Addon | null {
  return ADDON_DA_FEATURE[feature] ?? null;
}

/** Os dois estados que uma contratação tem. Desligar nunca apaga. */
export type StatusAddon = "active" | "suspended";

export function ehAddonValido(valor: string): valor is Addon {
  return Object.prototype.hasOwnProperty.call(ADDON_LABELS, valor);
}
