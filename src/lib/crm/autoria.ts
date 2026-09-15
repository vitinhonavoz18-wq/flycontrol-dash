/**
 * Quem escreveu cada mensagem.
 *
 * Numa conversa do Chat existem TRÊS bocas falando, e antes disso a tela
 * mostrava só duas caixinhas: uma de um lado, outra do outro. O lojista não
 * tinha como saber se a resposta simpática das 23h saiu da IA, do funcionário
 * do balcão ou dele mesmo pelo celular.
 *
 * É a diferença entre a comanda que diz "mesa 5" e a comanda que diz
 * "mesa 5 — garçom João": quando dá problema, dá para saber com quem falar.
 *
 * COMO O SISTEMA SABE, sem precisar de coluna nova no banco:
 *
 *   chegou de fora ................................ é o cliente
 *   saiu e tem o nome de quem digitou .............. é gente da loja
 *   saiu sem nome de ninguém ....................... foi a IA
 *
 * A IA responde pelo fluxo do n8n, que não entra no painel com login nenhum —
 * então ela nunca deixa assinatura. É justamente essa ausência de assinatura
 * que a identifica.
 */

export type Autoria = "cliente" | "voce" | "equipe" | "ia";

export type MensagemParaAutoria = {
  direction: "in" | "out";
  sent_by?: string | null;
};

export function quemFalou(m: MensagemParaAutoria, meuUserId?: string | null): Autoria {
  if (m.direction === "in") return "cliente";
  if (!m.sent_by) return "ia";
  if (meuUserId && m.sent_by === meuUserId) return "voce";
  return "equipe";
}

/** O nome curto que aparece em cima da mensagem. */
export const NOME_AUTORIA: Record<Autoria, string> = {
  cliente: "Cliente",
  voce: "Você",
  equipe: "Equipe",
  ia: "Atendente IA",
};

/** A letra do avatar, quando não há foto nem nome. */
export const INICIAL_AUTORIA: Record<Autoria, string> = {
  cliente: "C",
  voce: "V",
  equipe: "E",
  ia: "IA",
};

/** De que lado a mensagem encosta: o cliente à esquerda, a loja à direita. */
export function ladoDireito(a: Autoria): boolean {
  return a !== "cliente";
}
