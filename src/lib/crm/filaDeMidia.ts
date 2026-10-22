/**
 * A FILA DOS ARQUIVOS QUE A TELA PEDE AO SERVIDOR.
 *
 * Uma conversa antiga pode ter 40 fotos que ainda não foram trazidas do
 * WhatsApp. Se cada balão pedisse a sua ao mesmo tempo, seriam 40 pedidos de
 * uma vez ao servidor e ao WhatsApp da loja — o garçom que vai à cozinha 40
 * vezes ao mesmo tempo e trava a porta. Aqui vão no máximo três por vez.
 *
 * E CADA ARQUIVO É PEDIDO UMA VEZ SÓ: se a tela redesenhar (chegou mensagem
 * nova), o balão reaproveita o pedido que já está andando em vez de abrir
 * outro. Pedido que falhou de vez ("o WhatsApp não tem mais") também fica
 * lembrado, para não insistir a cada redesenho. Falha passageira, não — essa
 * deixa "tentar de novo".
 */

export type ResultadoMidia =
  | { ok: true; url: string; caminho: string; nome: string }
  | { ok: false; motivo: string; definitivo: boolean };

export function criarFila(maxSimultaneos: number) {
  let ativos = 0;
  const esperando: Array<() => void> = [];

  function proximo() {
    if (ativos >= maxSimultaneos) return;
    const vez = esperando.shift();
    if (vez) vez();
  }

  return function naFila<T>(tarefa: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      esperando.push(() => {
        ativos++;
        tarefa()
          .then(resolve, reject)
          .finally(() => {
            ativos--;
            proximo();
          });
      });
      proximo();
    });
  };
}

export function criarMemoriaDeMidia(
  carregar: (messageId: string) => Promise<ResultadoMidia>,
  maxSimultaneos = 3,
) {
  const naFila = criarFila(maxSimultaneos);
  const pedidos = new Map<string, Promise<ResultadoMidia>>();

  return function obter(messageId: string, forcar = false): Promise<ResultadoMidia> {
    const existente = pedidos.get(messageId);
    if (existente && !forcar) return existente;

    const pedido = naFila(() => carregar(messageId))
      .catch((): ResultadoMidia => ({
        ok: false,
        motivo: "Sem conexão com o servidor. Tente de novo.",
        definitivo: false,
      }))
      .then((r) => {
        // Falha passageira não fica lembrada: o "tentar de novo" precisa ir
        // ao servidor de verdade.
        if (!r.ok && !r.definitivo) pedidos.delete(messageId);
        return r;
      });
    pedidos.set(messageId, pedido);
    return pedido;
  };
}
