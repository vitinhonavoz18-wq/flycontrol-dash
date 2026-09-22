import { useSyncExternalStore } from "react";
import type { Order } from "@/types/order";

/**
 * O canal por onde o guia entrega o pedido de treino ao quadro de pedidos.
 *
 * POR QUE UM CANAL, E NÃO UMA PROPRIEDADE
 *
 * O guia mora no topo do painel (fora do <main>, para alcançar o menu) e o
 * quadro de pedidos mora lá dentro, na tela do painel. Um não é pai do outro.
 * Passar o pedido de mão em mão exigiria furar cinco componentes que não têm
 * nada a ver com o assunto — cada um deles ganhando uma propriedade que
 * ignora e só repassa.
 *
 * É o recado que, para chegar da portaria à cozinha, passa por todo mundo do
 * salão. Aqui existe um balcão só para esse recado: quem tem põe, quem
 * precisa pega.
 *
 * O quadro trata esse pedido como qualquer outro — inclusive o arrastar e
 * soltar de verdade. Quem sabe que ele é de mentira é a gravação, que o
 * reconhece pelo `id` e não encosta no banco.
 */

let pedido: Order | null = null;
const ouvintes = new Set<() => void>();

export function publicarPedidoDeTreino(novo: Order | null): void {
  if (pedido?.id === novo?.id && pedido?.status === novo?.status) return;
  pedido = novo;
  for (const avisar of ouvintes) avisar();
}

function assinar(avisar: () => void): () => void {
  ouvintes.add(avisar);
  return () => ouvintes.delete(avisar);
}

/** O que está no balcão agora. `null` quando não há treino em andamento. */
export function usePedidoDeTreino(): Order | null {
  return useSyncExternalStore(
    assinar,
    () => pedido,
    // No servidor não existe treino: ele só faz sentido com alguém na tela.
    () => null,
  );
}

/**
 * Junta o pedido de treino à lista real, sem duplicar.
 *
 * O quadro chama isto na hora de desenhar. Quando não há treino, devolve a
 * MESMA lista que recebeu — sem criar um array novo, para não derrubar as
 * memoizações do quadro a cada render.
 */
export function comPedidoDeTreino(reais: Order[], treino: Order | null): Order[] {
  if (!treino) return reais;
  if (reais.some((o) => o.id === treino.id)) return reais;
  // O treino entra na frente: ele é o que o lojista deve olhar agora.
  return [treino, ...reais];
}
