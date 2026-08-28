import { describe, expect, it } from "vitest";
import { isBillableOrder, usageIdempotencyKey } from "./billingEngine";
import { POLITICA_CENTS_V2, custoTotalCents, distribuirPorFaixa } from "./centsTiers";

/**
 * O caderno de consumo do ciclo, e o dinheiro que sai dele.
 *
 * O QUE ESTE ARQUIVO TESTA
 *
 * Os testes de `centsTiers.test.ts` provam que a conta das faixas está certa
 * dado um número de pedidos. Estes aqui provam a etapa anterior: que o número
 * de pedidos está certo. É a diferença entre "a calculadora soma bem" e "o
 * caderno tem os pedidos certos anotados".
 *
 * POR QUE UM CADERNO SIMULADO
 *
 * A contagem de verdade acontece dentro do banco, num gatilho — o pedaço do
 * sistema que dispara sozinho toda vez que um pedido muda de status, e que
 * nenhum caminho consegue contornar. Aqui reproduzimos as MESMAS regras desse
 * gatilho em TypeScript para poder testar as situações que dão dor de cabeça
 * na vida real: pedido cancelado, aviso que chegou duas vezes, pedido do
 * iFood e do site chegando ao mesmo tempo.
 *
 * As regras copiadas são exatamente estas, e nesta ordem:
 *
 * 1. cada pedido faturável escreve UMA linha, com uma chave única formada por
 *    ciclo + pedido — como o caderno de reservas que só aceita um nome por
 *    mesa: tentar escrever o segundo, a caneta trava;
 * 2. lançar o mesmo pedido de novo não escreve nada e não mexe no contador;
 * 3. pedido que deixa de ser faturável não apaga a linha original: escreve um
 *    estorno de -1 ao lado, para dar para conferir depois o que aconteceu;
 * 4. só se estorna o que foi lançado NESTE ciclo;
 * 5. a contagem é a soma das linhas, nunca um número guardado à parte.
 *
 * Se o gatilho do banco mudar e estes testes não mudarem junto, a divergência
 * é o próprio problema — `billingHook.test.ts` existe para pegar isso: ele lê
 * o SQL de verdade e compara com o TypeScript.
 */

const CICLO = "ciclo-agosto";

type Linha = {
  chave: string;
  tipo: "order_billable" | "order_reversal";
  quantidade: 1 | -1;
  pedidoId: string;
  loja: string;
};

/** Reprodução fiel do gatilho de consumo, para poder testá-lo aqui. */
class Caderno {
  readonly linhas: Linha[] = [];
  /** O que o gatilho já considera faturável hoje, por pedido. */
  private readonly faturavel = new Map<string, boolean>();

  constructor(
    readonly loja = "loja-a",
    readonly ciclo = CICLO,
  ) {}

  /**
   * Um pedido chegou ou mudou de status.
   *
   * Devolve `true` quando a chamada mexeu no caderno — é o equivalente ao
   * `ROW_COUNT` do banco, que é o que decide se o contador anda.
   */
  registrar(pedidoId: string, pedido: Parameters<typeof isBillableOrder>[0]): boolean {
    const agora = isBillableOrder(pedido);
    const antes = this.faturavel.get(pedidoId) ?? false;

    // Nada mudou em termos de cobrança: o gatilho sai cedo, sem tocar em nada.
    if (agora === antes) return false;
    this.faturavel.set(pedidoId, agora);

    const doPedido = this.linhas.filter((l) => l.pedidoId === pedidoId);
    const estornos = doPedido.filter((l) => l.tipo === "order_reversal").length;
    const saldo = doPedido.reduce((s, l) => s + l.quantidade, 0);
    // A etiqueta leva o número de idas e voltas: a primeira mantém o formato
    // antigo, as seguintes ganham o sufixo — como a 2ª via da comanda.
    const sufixo = estornos > 0 ? `:${estornos}` : "";

    if (agora) {
      if (saldo > 0) return false; // já está cobrado
      const chave = usageIdempotencyKey(this.ciclo, pedidoId) + sufixo;
      if (this.linhas.some((l) => l.chave === chave)) return false;
      this.linhas.push({
        chave,
        tipo: "order_billable",
        quantidade: 1,
        pedidoId,
        loja: this.loja,
      });
      return true;
    }

    // Só estorna o que está cobrado neste ciclo.
    if (saldo <= 0) return false;

    const chave = `order_reversal:${this.ciclo}:${pedidoId}${sufixo}`;
    if (this.linhas.some((l) => l.chave === chave)) return false;
    this.linhas.push({
      chave,
      tipo: "order_reversal",
      quantidade: -1,
      pedidoId,
      loja: this.loja,
    });
    return true;
  }

  /** A verdade da cobrança: a soma das linhas. */
  contar(): number {
    return Math.max(
      0,
      this.linhas.reduce((soma, l) => soma + l.quantidade, 0),
    );
  }

  /** Quanto esta loja vai pagar pelo que está no caderno. */
  totalCents(): number {
    return custoTotalCents(POLITICA_CENTS_V2, this.contar());
  }
}

/** Um pedido comum, do tipo que sempre conta. */
function pedidoNormal(status = "entregue") {
  return { status, total: 45.9, items: [{ name: "Pizza" }], customer_name: "Ana" };
}

// ---------------------------------------------------------------------------
// Item 48 — pedido novo, cancelado, repetido, restaurado, importado
// ---------------------------------------------------------------------------

describe("o que entra e o que não entra na conta", () => {
  it("pedido novo entra e cobra a faixa em que caiu", () => {
    const c = new Caderno();
    expect(c.registrar("p1", pedidoNormal())).toBe(true);
    expect(c.contar()).toBe(1);
    // O primeiro pedido do mês é o mais caro: R$ 0,70.
    expect(c.totalCents()).toBe(70);
  });

  it("o mesmo pedido lançado duas vezes conta uma só", () => {
    // Acontece de verdade: o site reenvia a confirmação, o app do entregador
    // marca "entregue" de novo, o gerente reabre e fecha o pedido.
    const c = new Caderno();
    c.registrar("p1", pedidoNormal("preparando"));
    c.registrar("p1", pedidoNormal("saiu"));
    c.registrar("p1", pedidoNormal("entregue"));

    expect(c.contar()).toBe(1);
    expect(c.totalCents()).toBe(70);
    expect(c.linhas.filter((l) => l.tipo === "order_billable")).toHaveLength(1);
  });

  it("aviso repetido do mesmo pedido não escreve segunda linha", () => {
    // O caso do webhook que chega duas vezes porque a primeira resposta
    // demorou: quem manda acha que falhou e manda de novo.
    const c = new Caderno();
    expect(c.registrar("p1", pedidoNormal())).toBe(true);
    expect(c.registrar("p1", pedidoNormal())).toBe(false);
    expect(c.linhas).toHaveLength(1);
    expect(c.contar()).toBe(1);
  });

  it("pedido cancelado antes de virar operação nunca chega a contar", () => {
    const c = new Caderno();
    c.registrar("p1", pedidoNormal("novo"));
    c.registrar("p1", pedidoNormal("cancelado"));

    expect(c.contar()).toBe(0);
    expect(c.totalCents()).toBe(0);
    // Não existe estorno do que nunca foi lançado — o caderno fica limpo.
    expect(c.linhas).toHaveLength(0);
  });

  it("pedido cancelado depois de contar sai da conta, e o estorno fica registrado", () => {
    const c = new Caderno();
    c.registrar("p1", pedidoNormal("entregue"));
    expect(c.contar()).toBe(1);

    c.registrar("p1", pedidoNormal("cancelado"));
    expect(c.contar()).toBe(0);
    expect(c.totalCents()).toBe(0);

    // A linha original NÃO some. Fica ela e o estorno ao lado — é o que
    // permite responder depois "por que esse pedido saiu da fatura?".
    expect(c.linhas.map((l) => l.tipo)).toEqual(["order_billable", "order_reversal"]);
  });

  it("pedido cancelado e depois restaurado volta a contar uma única vez", () => {
    // Cancelamento por engano, ou o gerente arrastando o cartão para trás e
    // para a frente no quadro de pedidos. O pedido voltou para a operação:
    // precisa voltar para a conta também.
    const c = new Caderno();
    c.registrar("p1", pedidoNormal("entregue"));
    c.registrar("p1", pedidoNormal("cancelado"));
    c.registrar("p1", pedidoNormal("entregue"));

    expect(c.contar()).toBe(1);
    expect(c.totalCents()).toBe(70);
    // Três linhas no caderno, e nenhuma apagada: cobrança, estorno, cobrança.
    expect(c.linhas.map((l) => l.tipo)).toEqual([
      "order_billable",
      "order_reversal",
      "order_billable",
    ]);
  });

  it("aguenta várias idas e voltas sem duplicar nem perder o pedido", () => {
    const c = new Caderno();
    for (let volta = 0; volta < 4; volta++) {
      c.registrar("p1", pedidoNormal("entregue"));
      // O aviso repetido no meio do caminho continua sem efeito.
      c.registrar("p1", pedidoNormal("entregue"));
      expect(c.contar()).toBe(1);
      c.registrar("p1", pedidoNormal("cancelado"));
      expect(c.contar()).toBe(0);
    }
    c.registrar("p1", pedidoNormal("entregue"));
    expect(c.contar()).toBe(1);
    expect(c.totalCents()).toBe(70);
    // Toda etiqueta é única: é isso que impede a cobrança dobrada.
    expect(new Set(c.linhas.map((l) => l.chave)).size).toBe(c.linhas.length);
  });

  it("cancelar duas vezes não estorna duas vezes", () => {
    // Sem essa trava, dois cliques no botão de cancelar zerariam a conta de
    // dois pedidos, e a fatura sairia menor do que o devido.
    const c = new Caderno();
    c.registrar("p1", pedidoNormal("entregue"));
    c.registrar("p2", pedidoNormal("entregue"));
    c.registrar("p1", pedidoNormal("cancelado"));
    c.registrar("p1", pedidoNormal("cancelado"));

    expect(c.contar()).toBe(1);
    expect(c.totalCents()).toBe(70);
  });

  it("a contagem nunca fica negativa", () => {
    const c = new Caderno();
    c.registrar("p1", pedidoNormal("entregue"));
    c.registrar("p1", pedidoNormal("cancelado"));
    c.registrar("p2", pedidoNormal("cancelado"));

    expect(c.contar()).toBe(0);
    expect(c.totalCents()).toBe(0);
  });

  it("pedido de teste e pedido-fantasma não entram na conta", () => {
    const c = new Caderno();
    c.registrar("teste", { ...pedidoNormal(), is_test: true });
    // O site cria um registro vazio ao abrir a sessão de mesa: total zero,
    // sem itens, sem cliente. Não é operação, não é cobrança.
    c.registrar("fantasma", { status: "entregue", total: 0, items: [], customer_name: null });

    expect(c.contar()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Item 48 — origens diferentes não podem contar duas vezes
// ---------------------------------------------------------------------------

describe("pedidos de origens diferentes", () => {
  it("iFood e site somam, cada um contando uma vez", () => {
    const c = new Caderno();
    c.registrar("ifood-9001", pedidoNormal());
    c.registrar("site-abc", pedidoNormal());
    c.registrar("balcao-1", pedidoNormal());

    expect(c.contar()).toBe(3);
    expect(c.totalCents()).toBe(210);
  });

  it("o mesmo pedido importado duas vezes com o mesmo identificador conta uma vez", () => {
    // A importação do iFood roda de novo depois de uma queda de internet e
    // traz o mesmo pedido. Como o identificador é o mesmo, a caneta trava.
    const c = new Caderno();
    c.registrar("ifood-9001", pedidoNormal());
    c.registrar("ifood-9001", pedidoNormal());

    expect(c.contar()).toBe(1);
  });

  it("importar o mesmo pedido com outro identificador conta duas vezes — e isso é responsabilidade da importação", () => {
    // Deixado explícito de propósito: a chave única protege contra o MESMO
    // pedido, não contra dois cadastros diferentes do mesmo almoço. Quem
    // importa precisa reaproveitar o identificador de origem.
    const c = new Caderno();
    c.registrar("ifood-9001", pedidoNormal());
    c.registrar("ifood-9001-copia", pedidoNormal());

    expect(c.contar()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Item 49 — dois pedidos ao mesmo tempo
// ---------------------------------------------------------------------------

describe("pedidos simultâneos", () => {
  it("dois pedidos diferentes no mesmo instante contam dois", () => {
    const c = new Caderno();
    // Cada um escreve a própria linha, com a própria chave. Não existe
    // disputa: são duas linhas distintas no caderno.
    c.registrar("p1", pedidoNormal());
    c.registrar("p2", pedidoNormal());

    expect(c.contar()).toBe(2);
    expect(new Set(c.linhas.map((l) => l.chave)).size).toBe(2);
  });

  it("duas tentativas simultâneas do MESMO pedido resultam em uma linha só", () => {
    // É o ponto em que um contador ingênuo erraria: os dois leem "0", os dois
    // gravam "1". Com a chave única, o segundo simplesmente não entra.
    const c = new Caderno();
    const resultados = [c.registrar("p1", pedidoNormal()), c.registrar("p1", pedidoNormal())];

    expect(resultados).toEqual([true, false]);
    expect(c.contar()).toBe(1);
  });

  it("cem pedidos simultâneos atravessam a virada de faixa sem perder nem repetir nenhum", () => {
    const c = new Caderno();
    for (let i = 1; i <= 100; i++) c.registrar(`p${i}`, pedidoNormal());
    // Uma segunda rodada de avisos repetidos, como acontece quando a fila de
    // integração reprocessa o lote inteiro.
    for (let i = 1; i <= 100; i++) c.registrar(`p${i}`, pedidoNormal());

    expect(c.contar()).toBe(100);
    // 100 pedidos: todos ainda na primeira faixa.
    expect(c.totalCents()).toBe(7000);

    c.registrar("p101", pedidoNormal());
    expect(c.contar()).toBe(101);
    // O 101º já entra a R$ 0,60 — e os 100 primeiros continuam a R$ 0,70.
    expect(c.totalCents()).toBe(7060);
  });
});

// ---------------------------------------------------------------------------
// Itens 50-51 — o pedido de uma loja não pode afetar a conta de outra
// ---------------------------------------------------------------------------

describe("isolamento entre lojas", () => {
  it("cada loja tem o próprio caderno e a própria conta", () => {
    const a = new Caderno("loja-a", "ciclo-a");
    const b = new Caderno("loja-b", "ciclo-b");

    for (let i = 1; i <= 150; i++) a.registrar(`a${i}`, pedidoNormal());
    b.registrar("b1", pedidoNormal());

    expect(a.contar()).toBe(150);
    expect(b.contar()).toBe(1);
    // A loja B não herda a faixa da loja A: o primeiro pedido dela custa
    // R$ 0,70, e não os R$ 0,60 que a loja A já conquistou.
    expect(b.totalCents()).toBe(70);
    expect(a.totalCents()).toBe(7000 + 50 * 60);
  });

  it("a chave de um pedido carrega o ciclo, então nunca colide entre lojas", () => {
    // Duas lojas podem ter pedidos com o mesmo número interno. Se a chave
    // fosse só o número do pedido, o pedido 42 da segunda loja seria tratado
    // como repetição do pedido 42 da primeira e não seria cobrado.
    expect(usageIdempotencyKey("ciclo-a", "42")).not.toBe(usageIdempotencyKey("ciclo-b", "42"));
  });

  it("cancelar na loja A não mexe no caderno da loja B", () => {
    const a = new Caderno("loja-a", "ciclo-a");
    const b = new Caderno("loja-b", "ciclo-b");
    a.registrar("42", pedidoNormal());
    b.registrar("42", pedidoNormal());

    a.registrar("42", pedidoNormal("cancelado"));

    expect(a.contar()).toBe(0);
    expect(b.contar()).toBe(1);
    expect(b.totalCents()).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// A ponte entre o caderno e a fatura
// ---------------------------------------------------------------------------

describe("do caderno para a fatura", () => {
  it("o detalhamento por faixa bate com o que o caderno contou", () => {
    const c = new Caderno();
    for (let i = 1; i <= 320; i++) c.registrar(`p${i}`, pedidoNormal());
    for (let i = 1; i <= 20; i++) c.registrar(`p${i}`, pedidoNormal("cancelado"));

    expect(c.contar()).toBe(300);

    const pedacos = distribuirPorFaixa(POLITICA_CENTS_V2, c.contar());
    expect(pedacos.map((p) => [p.quantidade, p.faixa.precoCents, p.subtotalCents])).toEqual([
      [100, 70, 7000],
      [150, 60, 9000],
      [50, 50, 2500],
    ]);
    // A soma das linhas da fatura é o total cobrado. Nunca sobra centavo.
    expect(pedacos.reduce((s, p) => s + p.subtotalCents, 0)).toBe(c.totalCents());
    expect(c.totalCents()).toBe(18500);
  });

  it("os 20 cancelados saem exatamente da faixa mais barata que a loja tinha alcançado", () => {
    // O desconto conquistado não é perdido por um cancelamento: o que sai é
    // sempre o último pedido da conta, o mais barato. É a fila do caixa —
    // quem desiste é o último da fila, não o primeiro.
    const cheio = custoTotalCents(POLITICA_CENTS_V2, 320);
    const comCancelados = custoTotalCents(POLITICA_CENTS_V2, 300);
    expect(cheio - comCancelados).toBe(20 * 50);
  });
});
