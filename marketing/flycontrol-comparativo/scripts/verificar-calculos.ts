// Confere cada número que aparece no vídeo. Sai com erro se algum valor divergir do esperado.
import { CENARIOS, PRECO_CENTS, PEDIDOS, taxaPedido, restante, taxaNPedidos, precoParaPreservar, totalPb, brl, pct, get } from '../componentes/calculos';
const esperado: Record<string, [string, string]> = {
  'ifood total %': [pct(totalPb(get('ifood'))), '26,2%'],
  'ifood taxa 1 pedido': [brl(taxaPedido(get('ifood'))), 'R$ 6,81'],
  'ifood restante': [brl(restante(get('ifood'))), 'R$ 19,19'],
  'ifood preço p/ preservar 26': [brl(precoParaPreservar(get('ifood'))), 'R$ 35,23'],
  'ifood 100 pedidos': [brl(taxaNPedidos(get('ifood'))), 'R$ 681,20'],
  '99 total %': [pct(totalPb(get('99food'))), '12,1%'],
  '99 taxa 1 pedido': [brl(taxaPedido(get('99food'))), 'R$ 3,15'],
  '99 restante': [brl(restante(get('99food'))), 'R$ 22,85'],
  '99 preço p/ preservar 26': [brl(precoParaPreservar(get('99food'))), 'R$ 29,58'],
  '99 100 pedidos': [brl(taxaNPedidos(get('99food'))), 'R$ 314,60'],
  'fly taxa 1 pedido': [brl(taxaPedido(get('flycontrol'))), 'R$ 0,70'],
  'fly restante': [brl(restante(get('flycontrol'))), 'R$ 25,30'],
  'fly preço p/ preservar 26': [brl(precoParaPreservar(get('flycontrol'))), 'R$ 26,70'],
  'fly 100 pedidos (faixa 1–100)': [brl(taxaNPedidos(get('flycontrol'))), 'R$ 70,00'],
  'vendas 100 pedidos': [brl(PEDIDOS * PRECO_CENTS), 'R$ 2.600,00'],
  'diferença vs ifood': [brl(taxaNPedidos(get('ifood')) - taxaNPedidos(get('flycontrol'))), 'R$ 611,20'],
  'diferença vs 99': [brl(taxaNPedidos(get('99food')) - taxaNPedidos(get('flycontrol'))), 'R$ 244,60'],
};
let ok = true;
for (const [k, [v, e]] of Object.entries(esperado)) { const bom = v.replace(/ /g, ' ') === e; ok &&= bom; console.log((bom ? 'OK   ' : 'ERRO ') + k.padEnd(32) + v.replace(/ /g, ' ') + (bom ? '' : `  (esperado ${e})`)); }
// conferências cruzadas: taxa + restante = preço; preço calculado devolve a receita após a taxa
for (const c of CENARIOS) {
  if (taxaPedido(c) + restante(c) !== PRECO_CENTS) { ok = false; console.log('ERRO soma', c.id); }
  const p = precoParaPreservar(c); const sobra = p - taxaPedido(c, p);
  console.log(`     ${c.id}: cobrando ${brl(p)} sobram ${brl(sobra)} depois das taxas`);
  if (sobra < PRECO_CENTS) { ok = false; console.log('ERRO preservar', c.id); }
}
// por pedido × 100 (arredondando pedido a pedido) só para registro
for (const c of CENARIOS) console.log(`     registro: ${c.id} 100 × taxa arredondada por pedido = ${brl(100 * taxaPedido(c))}`);
if (!ok) process.exit(1);
console.log('Todos os números conferem.');
