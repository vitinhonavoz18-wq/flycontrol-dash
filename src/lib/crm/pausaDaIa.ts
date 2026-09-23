/**
 * A TRAVA DA IA: "um humano assumiu esta conversa, a IA fica quieta".
 *
 * Ela mora na conversa (`crm_conversations.ia_pausada_ate`), e não só no
 * Redis do n8n, porque o n8n não enxerga a resposta que sai pelo painel: a
 * UAZAPI está configurada para não devolver o que o sistema enviou (senão a
 * resposta da IA voltaria como eco). Sem a trava aqui, o atendente respondia
 * pelo painel e a IA respondia junto — dois garçons anotando o mesmo pedido.
 *
 * A trava VENCE SOZINHA. Se o atendente esquecer de devolver a conversa, a IA
 * volta a atender depois de um tempo, em vez de o cliente falar sozinho de
 * madrugada. É a plaquinha "volto já" que some sozinha.
 */

/** Quanto tempo a IA fica quieta depois que um humano fala. */
export const MINUTOS_DE_PAUSA_DA_IA = 60;

/** Até quando a IA fica quieta, contando de agora. */
export function pausarAte(agora: Date = new Date(), minutos = MINUTOS_DE_PAUSA_DA_IA): string {
  return new Date(agora.getTime() + minutos * 60_000).toISOString();
}

/** A trava ainda vale? Vazio, inválido ou no passado = a IA pode responder. */
export function iaEstaPausada(ate: string | null | undefined, agora: Date = new Date()): boolean {
  if (!ate) return false;
  const fim = Date.parse(ate);
  return Number.isFinite(fim) && fim > agora.getTime();
}
