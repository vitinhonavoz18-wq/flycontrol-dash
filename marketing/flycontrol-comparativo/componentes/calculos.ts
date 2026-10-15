/**
 * Todas as contas do anúncio, em CENTAVOS INTEIROS e percentuais em pontos-base (1% = 100 pb).
 * Arredondamento monetário: meio centavo para cima (half-up), aplicado uma única vez no fim de cada conta.
 * Fontes e datas: auditoria/FlyControl_Comparativo_Auditoria.md.
 */
export type Cenario = { id: 'ifood' | '99food' | 'flycontrol'; nome: string; plano: string; partesPb?: { rotulo: string; pb: number }[]; fixoCents?: number };

export const PRECO_CENTS = 2600; // hambúrguer de exemplo: R$ 26,00
export const PEDIDOS = 100;

export const CENARIOS: Cenario[] = [
  { id: 'ifood', nome: 'iFood', plano: 'Plano Entrega', partesPb: [{ rotulo: 'comissão', pb: 2300 }, { rotulo: 'pagamento pela plataforma', pb: 320 }] },
  { id: '99food', nome: '99Food', plano: 'Entrega pela 99', partesPb: [{ rotulo: 'comissão', pb: 890 }, { rotulo: 'intermediação de pagamento', pb: 320 }] },
  // Plano CENTS (flycontrol-dash/src/lib/billing/centsTiers.ts, POLITICA_CENTS_V2): R$ 0,70 por pedido aceito nos pedidos 1–100 do ciclo.
  { id: 'flycontrol', nome: 'FlyControl', plano: 'Plano CENTS', fixoCents: 70 },
];
/** Faixas vigentes do CENTS (cópia fiel de POLITICA_CENTS_V2, para o cálculo de N pedidos). */
export const FAIXAS_CENTS = [
  { de: 1, ate: 100, cents: 70 },
  { de: 101, ate: 250, cents: 60 },
  { de: 251, ate: 500, cents: 50 },
  { de: 501, ate: Infinity, cents: 40 },
];

const divHalfUp = (num: number, den: number) => Math.floor((num + Math.floor(den / 2)) / den);
export const totalPb = (c: Cenario) => (c.partesPb ?? []).reduce((s, p) => s + p.pb, 0);
/** taxa de UM pedido */
export const taxaPedido = (c: Cenario, precoCents = PRECO_CENTS) => (c.partesPb ? divHalfUp(precoCents * totalPb(c), 10000) : c.fixoCents!);
export const restante = (c: Cenario, precoCents = PRECO_CENTS) => precoCents - taxaPedido(c, precoCents);
/** taxas sobre N pedidos: percentual sobre o total vendido; CENTS pelas faixas progressivas */
export const taxaNPedidos = (c: Cenario, n = PEDIDOS, precoCents = PRECO_CENTS) => {
  if (c.partesPb) return divHalfUp(n * precoCents * totalPb(c), 10000);
  let s = 0;
  for (const f of FAIXAS_CENTS) { const q = Math.max(0, Math.min(n, f.ate) - f.de + 1); s += q * f.cents; }
  return s;
};
/**
 * Menor preço que preserva a receita desejada DEPOIS da taxa (já arredondada ao centavo):
 * parte de receita / (1 − taxa%) e sobe centavo a centavo até p − taxa(p) ≥ receita. Tarifa fixa: receita + tarifa.
 */
export const precoParaPreservar = (c: Cenario, receitaCents = PRECO_CENTS) => {
  if (!c.partesPb) return receitaCents + c.fixoCents!;
  let p = Math.floor((receitaCents * 10000) / (10000 - totalPb(c)));
  while (p - taxaPedido(c, p) < receitaCents) p++;
  return p;
};

export const brl = (cents: number) => 'R$ ' + (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (pb: number) => (pb / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
export const get = (id: Cenario['id']) => CENARIOS.find((c) => c.id === id)!;
