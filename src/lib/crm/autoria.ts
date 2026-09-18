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
 * COMO O SISTEMA SABE
 *
 *   chegou de fora ................................. é o cliente
 *   saiu carimbada "painel" / "ia" / "celular" ..... é o carimbo que manda
 *   saiu assinada, sem carimbo ..................... é gente da loja
 *
 * O CARIMBO EXISTE PORQUE DEDUZIR NÃO BASTAVA. A primeira versão deduzia:
 * "saiu sem assinatura, logo é a IA". Funcionou até aparecer a terceira boca —
 * a resposta que o dono digita no celular dele também sai sem assinatura, e
 * passaria a ser anunciada ao lojista como se fosse a IA falando em nome dele.
 * Dedução erra calada; carimbo, não.
 */

export type Autoria = "cliente" | "voce" | "equipe" | "ia" | "celular";

export type MensagemParaAutoria = {
  direction: "in" | "out";
  sent_by?: string | null;
  /** O carimbo gravado pelo banco: "painel", "ia" ou "celular". */
  origin?: string | null;
};

export function quemFalou(m: MensagemParaAutoria, meuUserId?: string | null): Autoria {
  if (m.direction === "in") return "cliente";

  if (m.origin === "ia") return "ia";
  if (m.origin === "celular") return "celular";

  // Carimbo "painel" (ou mensagem antiga, de antes do carimbo): aí a
  // assinatura diz se fui eu ou outra pessoa da equipe.
  if (m.sent_by) return meuUserId && m.sent_by === meuUserId ? "voce" : "equipe";

  return m.origin === "painel" ? "equipe" : "ia";
}

/** O nome curto que aparece em cima da mensagem. */
export const NOME_AUTORIA: Record<Autoria, string> = {
  cliente: "Cliente",
  voce: "Você",
  equipe: "Equipe",
  ia: "Atendente IA",
  celular: "Pelo celular",
};

/** A letra do avatar, quando não há foto nem nome. */
export const INICIAL_AUTORIA: Record<Autoria, string> = {
  cliente: "C",
  voce: "V",
  equipe: "E",
  ia: "IA",
  celular: "📱",
};

/** De que lado a mensagem encosta: o cliente à esquerda, a loja à direita. */
export function ladoDireito(a: Autoria): boolean {
  return a !== "cliente";
}
