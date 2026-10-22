/**
 * O HISTÓRICO DA CONVERSA SEM MENSAGEM REPETIDA E SEM BURACO.
 *
 * A tela recebe mensagens por três caminhos ao mesmo tempo: a resposta do
 * próprio envio, o aviso em tempo real do banco e o "carregar mais antigas".
 * Se cada um simplesmente empilhasse o que trouxe, a mesma mensagem apareceria
 * duas vezes — e o atendente acharia que o cliente mandou duas vezes.
 *
 * A regra é a do caderno de comandas: cada comanda tem um número, e uma
 * comanda com número repetido substitui a anterior em vez de virar outra.
 */

type ComId = { id: string; created_at: string };

/**
 * Junta o que já está na tela com o que acabou de chegar.
 *
 * - mesma mensagem (mesmo id): vale a versão que chegou agora, que é a mais
 *   nova — é assim que "na fila" vira "enviada" sem piscar;
 * - o que já estava e não veio de novo (as antigas carregadas antes) fica;
 * - tudo em ordem de horário.
 */
export function mesclarMensagens<T extends ComId>(atuais: T[], novas: T[]): T[] {
  const porId = new Map<string, T>();
  for (const m of atuais) porId.set(m.id, m);
  for (const m of novas) porId.set(m.id, { ...porId.get(m.id), ...m });
  return Array.from(porId.values()).sort((a, b) => {
    const d = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

/**
 * O atendente está lendo o fim da conversa?
 *
 * Se ele subiu para reler uma mensagem antiga, a tela NÃO pode arrastá-lo de
 * volta para baixo a cada mensagem nova — é como virar a página do caderno
 * enquanto a pessoa ainda está lendo. Uma folga de 120px conta como "no fim".
 */
export function estaNoFim(el: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
}
