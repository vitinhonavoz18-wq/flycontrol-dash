/**
 * Quanto a FlyControl faturou com a cobrança por pedido, somando todas as
 * lojas.
 *
 * ── O QUE ESTAVA ERRADO ──────────────────────────────────────────────────
 *
 * Não existia esse número em lugar nenhum. O card "Faturamento" dos Insights
 * Globais mostrava outra coisa completamente diferente: quanto os
 * RESTAURANTES venderam de pizza. Isso é dinheiro do cliente, não da
 * plataforma. É o shopping olhar a soma das vendas das lojas e achar que
 * aquilo é o aluguel que ele recebe.
 *
 * ── POR QUE NÃO DÁ PARA MULTIPLICAR ──────────────────────────────────────
 *
 * A conta ERRADA seria "total de pedidos × uma tarifa só". Duas coisas
 * impedem isso:
 *
 *   1. cada loja pode estar numa faixa diferente ao mesmo tempo — a açaiteria
 *      pagando R$ 0,70 e a hamburgueria R$ 0,60;
 *   2. dentro da MESMA loja o preço muda conforme os pedidos entram: os 100
 *      primeiros custam R$ 0,70, os seguintes R$ 0,60. Como conta de luz.
 *
 * Tirar uma média das tarifas também não serve: média não é dinheiro.
 *
 * ── A REGRA ──────────────────────────────────────────────────────────────
 *
 * O total é a soma, ciclo por ciclo, do que os pedidos daquele ciclo custam.
 * E "quanto custam" é decidido por uma função só, a mesma que emite a fatura
 * da loja (`consumoDoCicloCents`). Um caderno só.
 *
 * ── E O HISTÓRICO ────────────────────────────────────────────────────────
 *
 * Ciclo já fechado NÃO é recalculado. Ele guarda, congelado, o valor que
 * cobrou — porque a loja pode ter mudado de faixa depois, e a conta do mês
 * passado não muda por causa disso. É a nota fiscal do mês passado: mudou o
 * preço hoje, ela continua valendo o que valia.
 *
 * Ciclo ainda aberto é calculado na hora, porque ele ainda está crescendo.
 */

import { consumoDoCicloCents } from "./billingEngine";
import type { Cents } from "./money";

export type CicloParaSomaGlobal = {
  companyId: string;
  companyName: string;
  /** "open" = ainda correndo. Qualquer outro = já fechado e congelado. */
  status: string;
  /** `true` quando o plano cobra por pedido. Mensal fixo não entra nesta conta. */
  usageBased: boolean;
  centsPolicy: string | null;
  unitPriceCents: number;
  billableOrderCount: number;
  /** O valor congelado no fechamento. Só existe em ciclo fechado. */
  grossUsageAmountCents: number | null;
};

export type ReceitaDeUmaLoja = {
  companyId: string;
  companyName: string;
  pedidos: number;
  receitaCents: Cents;
};

export type ReceitaGlobal = {
  totalCents: Cents;
  pedidos: number;
  lojas: ReceitaDeUmaLoja[];
  /** Ciclos considerados, para conferência. */
  ciclosAbertos: number;
  ciclosFechados: number;
};

function inteiroNaoNegativo(valor: unknown): number {
  const n = Number(valor);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

/** Quanto ESTE ciclo representa de receita por pedido. */
export function receitaDoCicloCents(ciclo: CicloParaSomaGlobal): Cents {
  if (!ciclo.usageBased) return 0;

  const pedidos = inteiroNaoNegativo(ciclo.billableOrderCount);

  // Ciclo fechado: vale o que ficou congelado, sempre. Recalcular aqui seria
  // reescrever a conta do mês passado com o preço de hoje.
  if (ciclo.status !== "open") {
    return inteiroNaoNegativo(ciclo.grossUsageAmountCents);
  }

  return consumoDoCicloCents({
    usageBased: true,
    unitPriceCents: inteiroNaoNegativo(ciclo.unitPriceCents),
    billableOrderCount: pedidos,
    centsPolicy: ciclo.centsPolicy ?? undefined,
  });
}

/**
 * Soma a receita por pedido de todas as lojas.
 *
 * Tudo em centavos inteiros do começo ao fim: 70 + 70 + 60 + 60 = 260, e não
 * 0.7 + 0.7 + 0.6 + 0.6 = 2.5999999999999996.
 */
export function somarReceitaGlobal(ciclos: CicloParaSomaGlobal[]): ReceitaGlobal {
  const porLoja = new Map<string, ReceitaDeUmaLoja>();
  let totalCents = 0;
  let pedidos = 0;
  let ciclosAbertos = 0;
  let ciclosFechados = 0;

  for (const ciclo of ciclos) {
    if (!ciclo.usageBased) continue;
    if (ciclo.status === "open") ciclosAbertos++;
    else ciclosFechados++;

    const receitaCents = receitaDoCicloCents(ciclo);
    const pedidosDoCiclo = inteiroNaoNegativo(ciclo.billableOrderCount);

    totalCents += receitaCents;
    pedidos += pedidosDoCiclo;

    const atual = porLoja.get(ciclo.companyId);
    if (atual) {
      atual.receitaCents += receitaCents;
      atual.pedidos += pedidosDoCiclo;
    } else {
      porLoja.set(ciclo.companyId, {
        companyId: ciclo.companyId,
        companyName: ciclo.companyName,
        pedidos: pedidosDoCiclo,
        receitaCents,
      });
    }
  }

  return {
    totalCents,
    pedidos,
    lojas: [...porLoja.values()].sort((a, b) => b.receitaCents - a.receitaCents),
    ciclosAbertos,
    ciclosFechados,
  };
}
