import React, { createContext, useContext } from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { FPS, WT, clamp, ease, easeIn, easeInOut, rgba, rnd } from './lib';
import { brl } from './calculos';
import { display, body } from './fonts';
import roteiro from '../composicoes/roteiro.json';

/** Cores para distinguir os três cenários (sem imitar logotipos). */
export const COR = { ifood: '#E5484D', '99food': '#2F6FEB', flycontrol: WT.orange } as const;

// ---------- tempo de cena: cada cena tem uma duração "nominal"; versões curtas só aceleram ----------
/** [início, fim] em segundos do vídeo; um 3º número opcional corta a cena nesse tempo nominal (versões curtas). */
export type Agenda = Record<string, number[]>;
export const AgendaCtx = createContext<{ agenda: Agenda; duracao: number }>({ agenda: {}, duracao: 53 });
/** tempo local da cena em segundos NOMINAIS (null se a cena não existe nesta versão) */
export const useCena = (id: keyof typeof roteiro.nominal) => {
  const { agenda } = useContext(AgendaCtx);
  const t = useCurrentFrame() / FPS;
  const ab = agenda[id];
  if (!ab) return null;
  const [a, b] = ab;
  const nom = ab[2] ?? roteiro.nominal[id];
  const k = nom / (b - a);
  return { L: (t - a) * k, nom, a, b, t, ativa: t >= a - 0.6 && t <= b + 0.6 };
};

// ---------- contador monetário: sempre em centavos inteiros, valor final exato ----------
export const Contador: React.FC<{ L: number; de: number; ate: number; at: number; dur?: number; style?: React.CSSProperties }> = ({ L, de, ate, at, dur = 1.2, style }) => {
  const p = interpolate(L, [at, at + dur], [0, 1], { ...clamp, easing: easeInOut });
  const v = Math.round(de + (ate - de) * p);
  return <span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{brl(v)}</span>;
};

// ---------- moeda 3D ----------
export const Moeda: React.FC<{ size: number; spin?: number; style?: React.CSSProperties }> = ({ size, spin = 0, style }) => {
  const sx = Math.cos((spin * Math.PI) / 180);
  return (
    <div style={{ width: size, height: size, position: 'relative', ...style }}>
      {/* espessura (borda) */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'linear-gradient(90deg,#b86d00,#e09a1a,#b86d00)', transform: `scaleX(${Math.max(0.12, Math.abs(sx))}) translateX(${sx < 0 ? -size * 0.04 : size * 0.04}px)` }} />
      <div
        style={{
          position: 'absolute', inset: 0, borderRadius: '50%', transform: `scaleX(${Math.max(0.08, Math.abs(sx))})`,
          background: 'radial-gradient(circle at 35% 30%, #fff1b8 0%, #ffd36b 22%, #f4b23a 55%, #d58a10 100%)',
          boxShadow: `inset 0 0 0 ${size * 0.06}px #e8a52a, inset 0 0 0 ${size * 0.09}px #ffe08a, 0 ${size * 0.12}px ${size * 0.25}px rgba(17,24,39,0.22)`,
          display: 'grid', placeItems: 'center', fontFamily: display, fontWeight: 900, fontSize: size * 0.34, color: '#a86200', textShadow: '0 1px 0 #ffe6a3',
        }}
      >
        {Math.abs(sx) > 0.35 ? 'R$' : ''}
      </div>
    </div>
  );
};

/** Moedas saindo de um ponto e caindo numa pilha de "taxas". */
export const VooDeMoedas: React.FC<{ L: number; at: number; n: number; from: [number, number]; to: [number, number]; size?: number; dur?: number }> = ({ L, at, n, from, to, size = 54, dur = 1.1 }) => (
  <>
    {new Array(n).fill(0).map((_, i) => {
      const s = at + (i / n) * dur * 0.7;
      const p = interpolate(L, [s, s + 0.55], [0, 1], { ...clamp, easing: easeIn });
      if (L < s) return null;
      const landed = p >= 1;
      const x = from[0] + (to[0] - from[0]) * p + Math.sin(i * 2.1) * 30 * (1 - p);
      const arc = -Math.sin(Math.PI * p) * (160 + rnd(i, 3) * 80);
      const stackY = to[1] - i * size * 0.16;
      const y = landed ? stackY : from[1] + (stackY - from[1]) * p + arc;
      return (
        <div key={i} style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, transform: landed ? `scaleY(0.42)` : `rotate(${p * 200}deg)`, zIndex: i }}>
          <Moeda size={size} spin={landed ? 0 : p * 720 + i * 40} />
        </div>
      );
    })}
  </>
);

/** Nota virtual de R$ 26,00 que se divide: parte da taxa (colorida) e o que sobra. */
export const NotaDividida: React.FC<{ L: number; at: number; precoCents: number; taxaCents: number; cor: string; w?: number; h?: number }> = ({ L, at, precoCents, taxaCents, cor, w = 860, h = 132 }) => {
  const p = interpolate(L, [at, at + 0.5], [0, 1], { ...clamp, easing: ease });
  const sai = interpolate(L, [at + 0.55, at + 1.25], [0, 1], { ...clamp, easing: easeIn });
  const frac = taxaCents / precoCents;
  const wt = Math.max(w * frac, 34);
  return (
    <div style={{ position: 'relative', width: w, height: h }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: w - wt * p, height: h, borderRadius: `24px ${p > 0.05 ? 6 : 24}px ${p > 0.05 ? 6 : 24}px 24px`, background: 'linear-gradient(135deg,#ffffff,#f3f4f6)', border: `2px solid ${WT.border}`, boxShadow: '0 22px 44px rgba(17,24,39,0.12)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 10, borderRadius: 18, border: `2px dashed ${rgba(WT.ink, 0.1)}` }} />
        <div style={{ position: 'absolute', right: 26, top: '50%', transform: 'translateY(-50%)', fontFamily: display, fontWeight: 900, fontSize: 30, color: rgba(WT.ink, 0.12) }}>R$</div>
      </div>
      <div style={{ position: 'absolute', left: w - wt * p + (p > 0 ? 8 : 0), top: 0, width: wt * p, height: h, borderRadius: '6px 24px 24px 6px', background: `linear-gradient(135deg, ${cor}, ${rgba(cor, 0.75)})`, boxShadow: `0 22px 44px ${rgba(cor, 0.35)}`, transform: `translate(${sai * 140}px, ${-sai * 120}px) rotate(${sai * 14}deg) scale(${1 - sai * 0.5})`, opacity: p * (1 - sai) }} />
    </div>
  );
};

/** Rodapé de condições: discreto, mas legível. */
export const Rodape: React.FC<{ L: number; a: number; b: number; children: React.ReactNode; top?: number }> = ({ L, a, b, children, top = 1452 }) => {
  const p = interpolate(L, [a, a + 0.3, b - 0.2, b], [0, 1, 1, 0], clamp);
  if (p <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: 90, right: 90, top, fontFamily: body, fontSize: 22, lineHeight: 1.35, color: WT.muted, textAlign: 'center', opacity: p }}>
      {children}
    </div>
  );
};

/** Etiqueta de cenário (ex.: "Exemplo: iFood · Plano Entrega"). */
export const Etiqueta: React.FC<{ L: number; at: number; cor: string; children: React.ReactNode; size?: number }> = ({ L, at, cor, children, size = 30 }) => {
  const p = interpolate(L, [at, at + 0.3], [0, 1], { ...clamp, easing: ease });
  if (p <= 0) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontFamily: body, fontWeight: 700, fontSize: size, color: WT.ink, padding: `${size * 0.38}px ${size * 0.8}px`, borderRadius: 60, background: 'rgba(255,255,255,0.9)', border: `2px solid ${rgba(cor, 0.5)}`, boxShadow: `0 10px 30px ${rgba(cor, 0.18)}`, opacity: p, transform: `translateY(${(1 - p) * 14}px)` }}>
      <span style={{ width: size * 0.45, height: size * 0.45, borderRadius: '50%', background: cor }} />
      {children}
    </span>
  );
};

/** Percentual em 3D com o rótulo embaixo. */
export const Pct: React.FC<{ L: number; at: number; valor: string; rotulo: string; cor: string; size?: number }> = ({ L, at, valor, rotulo, cor, size = 92 }) => {
  const p = interpolate(L, [at, at + 0.35], [0, 1], { ...clamp, easing: ease });
  const k = interpolate(L, [at, at + 0.14, at + 0.26, at + 0.38], [2.2, 0.95, 1.04, 1], clamp);
  if (p <= 0) return null;
  const sh: string[] = [];
  for (let i = 1; i <= 5; i++) sh.push(`${i * 0.6}px ${i * 0.9}px 0 ${rgba(cor, 0.55)}`);
  sh.push(`0 18px 30px ${rgba(cor, 0.28)}`);
  return (
    <div style={{ textAlign: 'center', opacity: p, transform: `scale(${k})` }}>
      <div style={{ fontFamily: display, fontWeight: 900, fontSize: size, lineHeight: 1, color: cor, textShadow: sh.join(','), fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
      <div style={{ marginTop: 8, fontFamily: body, fontWeight: 700, fontSize: size * 0.27, color: WT.ink }}>{rotulo}</div>
    </div>
  );
};
