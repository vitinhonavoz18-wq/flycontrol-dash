/**
 * A trava que faz a atendente de IA calar a boca quando um humano assume.
 *
 * POR QUE ISTO EXISTE, E POR QUE MORA AQUI
 *
 * Um cliente falando com duas pessoas ao mesmo tempo recebe duas versões da
 * mesma história. É o garçom anotando o pedido enquanto o dono já estava
 * anotando na outra ponta da mesa: alguém vai embora achando que pediu uma
 * coisa e vai receber outra.
 *
 * A trava já existia, mas só enxergava METADE do problema. Ela morava no
 * fluxo do n8n e dependia de a resposta do humano passar pelo WhatsApp e
 * voltar. Isso acontece quando o dono digita NO CELULAR dele — mas NÃO
 * acontece quando o atendente responde PELO PAINEL: essa mensagem sai do
 * FlyControl direto para o WhatsApp e é filtrada na volta de propósito, senão
 * a própria resposta voltaria como se fosse pergunta nova.
 *
 * Ou seja: o caminho mais usado era justamente o que não travava nada.
 *
 * Por isso a trava vive AQUI. O FlyControl é o único lugar que enxerga os
 * dois caminhos — a mensagem do celular entra por ele, e a do painel nasce
 * dentro dele.
 *
 * GUARDAMOS UMA HORA, NÃO UM SIM/NÃO
 *
 * Um sim/não precisaria de alguém para desligar depois. Guardando a hora em
 * que a IA pode voltar a falar, a trava se solta sozinha — como a moeda do
 * parquímetro, que vale até a hora marcada e depois acaba sem ninguém mexer.
 *
 * Sem isso, uma conversa respondida uma vez num domingo ficaria com a IA
 * calada para sempre, e ninguém entenderia por quê.
 */

/**
 * Quanto tempo a IA fica quieta depois que uma pessoa responde.
 *
 * Uma hora é o meio-termo que funciona no balcão: tempo suficiente para o
 * atendente terminar a conversa sem ser atropelado, e curto o bastante para
 * que a IA volte a atender o mesmo cliente à noite sem ninguém precisar
 * lembrar de religar nada.
 */
export const MINUTOS_DE_PAUSA = 60;

/** A hora em que a IA pode voltar a falar nesta conversa. */
export function horaDeVoltarAFalar(agora: Date = new Date()): string {
  return new Date(agora.getTime() + MINUTOS_DE_PAUSA * 60 * 1000).toISOString();
}

/**
 * A IA está calada nesta conversa agora?
 *
 * Data vazia, data sem sentido ou data já vencida: pode falar. O palpite
 * seguro aqui é DEIXAR FALAR, porque uma coluna vazia é o estado normal de
 * quase toda conversa — travar por dúvida deixaria a loja muda.
 */
export function iaEstaPausada(ate: string | null | undefined, agora: Date = new Date()): boolean {
  if (!ate) return false;
  const limite = new Date(ate).getTime();
  if (!Number.isFinite(limite)) return false;
  return limite > agora.getTime();
}
