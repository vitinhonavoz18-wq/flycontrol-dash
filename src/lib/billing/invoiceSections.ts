/**
 * A fatura em duas partes, do jeito que o cliente lê:
 *
 *   ASSINATURA   Plano FlyControl ..................... R$ 139,90
 *   ADICIONAIS   Impulsionamento — Produto A — 7 dias . R$  60,00
 *                Impulsionamento — Produto B — 3 dias . R$  25,00
 *   TOTAL ............................................. R$ 224,90
 *
 * "Adicional" é o item do tipo `addon` (hoje, impulsionamento no FlyDelivery);
 * todo o resto (mensalidade, pedidos, taxa de cadastro, desconto, ajuste) é a
 * assinatura. O TOTAL é sempre o gravado na fatura — é ele que o cliente paga.
 */

export type ItemDaFatura = {
  itemType: string;
  description: string;
  quantity: number;
  totalCents: number;
};

export type SecoesDaFatura = {
  assinatura: ItemDaFatura[];
  adicionais: ItemDaFatura[];
  assinaturaCents: number;
  adicionaisCents: number;
  totalCents: number;
};

export function separarItensDaFatura(itens: ItemDaFatura[], totalCents: number): SecoesDaFatura {
  const adicionais = itens.filter((i) => i.itemType === "addon");
  let assinatura = itens.filter((i) => i.itemType !== "addon");
  const adicionaisCents = adicionais.reduce((t, i) => t + i.totalCents, 0);

  // Fatura antiga, sem itens gravados: o plano é o total inteiro.
  if (itens.length === 0) {
    assinatura = [
      { itemType: "monthly_fee", description: "Plano FlyControl", quantity: 1, totalCents },
    ];
  }

  return {
    assinatura,
    adicionais,
    assinaturaCents: assinatura.reduce((t, i) => t + i.totalCents, 0),
    adicionaisCents,
    totalCents,
  };
}
