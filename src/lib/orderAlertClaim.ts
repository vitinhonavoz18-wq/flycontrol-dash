/**
 * Evita que dois avisos diferentes toquem o som e mostrem o alerta do MESMO
 * pedido novo ao mesmo tempo.
 *
 * O Dashboard escuta pedidos novos para atualizar a lista e mostrar o
 * crachá "NOVO" no card; o aviso global (`NotificationsProvider`) escuta a
 * mesma tabela para avisar o usuário em QUALQUER tela do sistema, não só no
 * Dashboard. Os dois precisam existir — mas com o Dashboard aberto, os dois
 * reagem ao mesmo pedido, e sem essa trava o som tocava duas vezes e o
 * aviso aparecia duplicado. É como dois garçons ouvirem a mesma campainha
 * da cozinha e os dois saírem gritando "pedido pronto!" ao mesmo tempo —
 * só o primeiro precisa avisar.
 */
const claimed = new Set<string>();

/** `true` na primeira vez que este pedido é reivindicado; `false` depois. */
export function claimOrderAlert(orderId: string): boolean {
  if (claimed.has(orderId)) return false;
  claimed.add(orderId);
  // Não cresce para sempre: um Set com milhares de IDs numa aba aberta há
  // dias é desperdício de memória sem necessidade nenhuma.
  if (claimed.size > 500) {
    const oldest = claimed.values().next().value;
    if (oldest !== undefined) claimed.delete(oldest);
  }
  return true;
}
