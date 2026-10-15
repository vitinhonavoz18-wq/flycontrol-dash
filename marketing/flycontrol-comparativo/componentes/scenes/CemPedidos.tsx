import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { WT, clamp, ease, easeIn, easeInOut, rgba } from '../lib';
import { W3D } from '../Type3D';
import { LightSweep } from '../Studio';
import { PEDIDOS, PRECO_CENTS, brl, get, taxaNPedidos } from '../calculos';
import { COR, Contador, Rodape, useCena } from '../Money';
import { body, display } from '../fonts';

/** Comanda de pedido (ícone): papel branco com faixa laranja e linhas. */
const Comanda: React.FC<{ s: number }> = ({ s }) => (
  <div style={{ width: s, height: s * 1.2, borderRadius: s * 0.14, background: '#fff', border: `1.5px solid ${WT.border}`, boxShadow: '0 6px 14px rgba(17,24,39,0.10)', overflow: 'hidden', position: 'relative' }}>
    <div style={{ height: s * 0.2, background: WT.gradPrimary }} />
    {[0.36, 0.56, 0.76].map((y, i) => (
      <div key={i} style={{ position: 'absolute', left: s * 0.16, top: s * 1.2 * y, width: s * (i === 2 ? 0.4 : 0.68), height: s * 0.08, borderRadius: 4, background: i === 2 ? rgba(WT.orange, 0.55) : '#e5e7eb' }} />
    ))}
  </div>
);

/** CENA 6 — 100 pedidos de R$ 26,00, gráfico das taxas e a diferença do exemplo. */
export const Cena6: React.FC = () => {
  const c = useCena('s6');
  if (!c || !c.ativa) return null;
  const { L } = c;
  const k = c.nom / (c.b - c.a);
  const T = (x: number) => c.a + x / k;
  const inn = interpolate(L, [0, 0.4], [0, 1], clamp);
  const out = interpolate(L, [c.nom - 0.4, c.nom + 0.05], [0, 1], { ...clamp, easing: easeInOut });
  const ifood = taxaNPedidos(get('ifood')); // 68120
  const n99 = taxaNPedidos(get('99food')); // 31460
  const fly = taxaNPedidos(get('flycontrol')); // 7000
  const vendas = PEDIDOS * PRECO_CENTS;
  // grade de comandas
  const S = 56, G = 68, X0 = 540 - (G * 10) / 2 + (G - S) / 2, Y0 = 500;
  const gridOut = interpolate(L, [2.0, 2.6], [0, 1], clamp);
  // barras
  const BASE = 1180, MAXH = 520, BW = 220;
  const bars = [
    { id: 'ifood' as const, v: ifood, x: 230, a: 2.4, d: 1.6 },
    { id: '99food' as const, v: n99, x: 540, a: 2.6, d: 1.3 },
    { id: 'flycontrol' as const, v: fly, x: 850, a: 2.8, d: 0.8 },
  ];
  const barsIn = interpolate(L, [2.3, 2.6], [0, 1], clamp);
  const arrow = interpolate(L, [5.0, 5.5], [0, 1], { ...clamp, easing: ease });
  const hTop = (v: number) => BASE - (v / ifood) * MAXH;
  return (
    <AbsoluteFill style={{ opacity: inn * (1 - out) }}>
      {/* 100 comandas */}
      {gridOut < 1 &&
        new Array(100).fill(0).map((_, i) => {
          const col = i % 10, row = Math.floor(i / 10);
          const s0 = 0.2 + (col + row) * 0.06;
          const p = interpolate(L, [s0, s0 + 0.3], [0, 1], { ...clamp, easing: ease });
          if (p <= 0) return null;
          const g = Math.max(0, Math.min(1, gridOut * 1.6 - (9 - row) * 0.06));
          const bump = interpolate(L, [s0, s0 + 0.12, s0 + 0.3], [0.4, 1.12, 1], clamp);
          return (
            <div key={i} style={{ position: 'absolute', left: X0 + col * G, top: Y0 + row * G * 1.08 + g * g * 500, transform: `scale(${bump * (1 - g * 0.5)}) rotate(${g * (col - 4.5) * 8}deg)`, opacity: p * (1 - g) }}>
              <Comanda s={S} />
            </div>
          );
        })}
      <div style={{ position: 'absolute', top: 262, left: 30, right: 30, textAlign: 'center' }}>
        <W3D text="100 PEDIDOS" at={T(0.8)} size={88} out={T(2.15)} from="slam" />
        <div style={{ height: 8 }} />
        <W3D text={`${brl(vendas)} EM VENDAS`} at={T(1.6)} size={58} orange out={T(2.15)} />
      </div>
      <div style={{ position: 'absolute', top: 1260, left: 0, right: 0, textAlign: 'center', fontFamily: body, fontWeight: 700, fontSize: 32, color: WT.muted, opacity: interpolate(L, [1.8, 2.0, 2.1, 2.3], [0, 1, 1, 0], clamp) }}>
        {PEDIDOS} × {brl(PRECO_CENTS)}
      </div>
      {/* gráfico */}
      <div style={{ position: 'absolute', top: 262, left: 30, right: 30, textAlign: 'center' }}>
        <W3D text="TAXAS EM 100 PEDIDOS" at={T(2.4)} size={64} out={T(5.3)} />
        <div style={{ height: 4 }} />
        <div style={{ fontFamily: body, fontWeight: 600, fontSize: 30, color: WT.muted, opacity: interpolate(L, [2.6, 2.9, 5.2, 5.45], [0, 1, 1, 0], clamp) }}>sobre {brl(vendas)} em vendas</div>
      </div>
      <div style={{ position: 'absolute', left: 60, right: 60, top: BASE, height: 3, borderRadius: 2, background: rgba(WT.ink, 0.15), opacity: barsIn }} />
      {bars.map((b) => {
        const p = interpolate(L, [b.a, b.a + b.d], [0, 1], { ...clamp, easing: easeInOut });
        const h = Math.max(6, (b.v / ifood) * MAXH * p);
        const cen = get(b.id);
        const isF = b.id === 'flycontrol';
        return (
          <React.Fragment key={b.id}>
            <div style={{ position: 'absolute', left: b.x - BW / 2, top: BASE - h, width: BW, height: h, borderRadius: '18px 18px 4px 4px', opacity: barsIn, background: isF ? WT.gradPrimary : `linear-gradient(180deg, ${b.id === 'ifood' ? '#f06a6e' : '#5a8ff2'}, ${COR[b.id]})`, boxShadow: `0 18px 40px ${rgba(COR[b.id], 0.28)}` }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: 'linear-gradient(90deg, rgba(255,255,255,0.28), rgba(255,255,255,0) 40%)' }} />
            </div>
            <div style={{ position: 'absolute', left: b.x - 160, width: 320, top: BASE - h - 64, textAlign: 'center', opacity: interpolate(L, [b.a, b.a + 0.2], [0, 1], clamp) }}>
              <Contador L={L} de={0} ate={b.v} at={b.a} dur={b.d} style={{ fontFamily: display, fontWeight: 900, fontSize: 46, color: isF ? WT.orange : WT.ink }} />
            </div>
            <div style={{ position: 'absolute', left: b.x - 160, width: 320, top: BASE + 14, textAlign: 'center', opacity: barsIn }}>
              <div style={{ fontFamily: display, fontWeight: 900, fontSize: 32, color: WT.ink }}>{cen.nome}</div>
              <div style={{ fontFamily: body, fontWeight: 600, fontSize: 22, color: WT.muted }}>{cen.plano}</div>
            </div>
          </React.Fragment>
        );
      })}
      {/* diferença em relação ao cenário iFood */}
      {arrow > 0 && (
        <>
          <div style={{ position: 'absolute', left: 230 + BW / 2 + 10, width: (850 - 230) * arrow, top: hTop(ifood), height: 0, borderTop: `3px dashed ${rgba(WT.ink, 0.35)}` }} />
          <div style={{ position: 'absolute', left: 850 - 3, top: hTop(ifood) + (hTop(fly) - hTop(ifood)) * (1 - arrow), width: 6, height: (hTop(fly) - 10 - hTop(ifood)) * arrow, borderRadius: 3, background: WT.gradPrimary }} />
          <div style={{ position: 'absolute', left: 850 - 15, top: hTop(ifood) - 4, width: 0, height: 0, borderLeft: '15px solid transparent', borderRight: '15px solid transparent', borderBottom: `22px solid ${WT.orange}`, opacity: arrow }} />
          <div style={{ position: 'absolute', left: 850 - 150, width: 300, top: (hTop(ifood) + hTop(fly)) / 2 - 40, textAlign: 'center', opacity: interpolate(L, [5.3, 5.6], [0, 1], clamp) }}>
            <span style={{ display: 'inline-block', padding: '10px 22px', borderRadius: 40, background: 'rgba(255,255,255,0.95)', border: `2px solid ${rgba(WT.orange, 0.5)}`, boxShadow: WT.shadowGlow, fontFamily: display, fontWeight: 900, fontSize: 40, color: WT.orange }}>{brl(ifood - fly)}</span>
          </div>
        </>
      )}
      <LightSweep at={T(5.55)} dur={0.8 / k} strength={0.3} />
      <div style={{ position: 'absolute', top: 262, left: 30, right: 30, textAlign: 'center' }}>
        <W3D text={`ATÉ ${brl(ifood - fly)}`} at={T(5.6)} size={92} orange from="slam" />
        <div style={{ height: 4 }} />
        <W3D text="DE DIFERENÇA NAS TAXAS" at={T(5.85)} size={50} />
        <div />
        <W3D text="DESTE EXEMPLO" at={T(6.0)} size={50} />
        <div style={{ marginTop: 12, fontFamily: body, fontWeight: 700, fontSize: 28, color: WT.muted, opacity: interpolate(L, [6.3, 6.6], [0, 1], clamp) }}>
          {brl(n99 - fly)} em relação ao cenário 99Food
        </div>
      </div>
      <Rodape L={L} a={2.6} b={c.nom - 0.2} top={1330}>
        Compara só as taxas por pedido sobre {brl(vendas)} em vendas ({PEDIDOS} × {brl(PRECO_CENTS)}). Fora da conta: mensalidades, entrega/logística, anúncios, cupons e as taxas de maquininha ou Pix do próprio restaurante. Não é lucro líquido nem economia garantida. Os marketplaces incluem exposição no app e, conforme o plano, a entrega.
      </Rodape>
    </AbsoluteFill>
  );
};
