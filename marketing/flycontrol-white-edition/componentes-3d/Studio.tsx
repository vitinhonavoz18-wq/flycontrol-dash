import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { FPS, WT, clamp, ease, rgba, rnd } from './lib';

/** White Studio Environment: estúdio branco com piso, luz de cima e brilhos laranja suaves. */
export const WhiteStudio: React.FC<{ warm?: number }> = ({ warm = 0.5 }) => {
  const t = useCurrentFrame() / FPS;
  const g1x = 30 + Math.sin(t * 0.35) * 12;
  const g2x = 72 + Math.cos(t * 0.28) * 10;
  return (
    <AbsoluteFill style={{ background: WT.bg }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 60% at 50% 38%, #ffffff 0%, #fbfbfc 45%, #eef0f3 100%)' }} />
      {/* brilhos laranja (gradiente institucional) */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 45% 28% at ${g1x}% 18%, ${rgba(WT.amber, 0.16 * (0.5 + warm))} 0%, transparent 70%),
                       radial-gradient(ellipse 50% 30% at ${g2x}% 82%, ${rgba(WT.orange, 0.12 * (0.5 + warm))} 0%, transparent 70%)`,
        }}
      />
      {/* piso: horizonte suave e reflexo */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1380, bottom: 0, background: 'linear-gradient(180deg, rgba(229,231,235,0) 0%, rgba(229,231,235,0.55) 40%, rgba(209,213,219,0.6) 100%)' }} />
      <div style={{ position: 'absolute', left: '8%', right: '8%', top: 1378, height: 2, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)' }} />
      {/* luz de estúdio vinda de cima */}
      <div style={{ position: 'absolute', left: 140, right: 140, top: -200, height: 900, background: 'radial-gradient(ellipse 50% 60% at 50% 0%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 70%)' }} />
      <Dust />
    </AbsoluteFill>
  );
};

/** Partículas alaranjadas discretas. */
const Dust: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  return (
    <AbsoluteFill>
      {new Array(34).fill(0).map((_, i) => {
        const x = rnd(i, 3) * 1080 + Math.sin(t * 0.4 + i) * 20;
        const y = ((rnd(i, 5) * 1920 - t * (10 + rnd(i, 7) * 26)) % 1920 + 1920) % 1920;
        const s = 3 + rnd(i, 11) * 8;
        const c = rnd(i, 13) > 0.5 ? WT.orange : WT.amber;
        return <div key={i} style={{ position: 'absolute', left: x, top: y, width: s, height: s, borderRadius: '50%', background: rgba(c, 0.18 + 0.3 * rnd(i, 17)), filter: `blur(${rnd(i, 19) * 3}px)` }} />;
      })}
    </AbsoluteFill>
  );
};

/** Orange Light Sweep: faixa de luz laranja que atravessa a tela revelando elementos. */
export const LightSweep: React.FC<{ at: number; dur?: number; angle?: number; strength?: number; blend?: 'normal' | 'multiply' }> = ({ at, dur = 0.9, angle = 112, strength = 0.55, blend = 'normal' }) => {
  const t = useCurrentFrame() / FPS;
  if (t < at || t > at + dur) return null;
  const p = interpolate(t, [at, at + dur], [-0.3, 1.3], { ...clamp, easing: ease });
  const c = p * 100;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none', mixBlendMode: blend,
        background: `linear-gradient(${angle}deg, transparent ${c - 22}%, ${rgba(WT.amber, strength * 0.5)} ${c - 9}%, ${rgba(WT.orange, strength)} ${c}%, ${rgba(WT.amber, strength * 0.5)} ${c + 7}%, transparent ${c + 18}%)`,
      }}
    />
  );
};

/** Orange Impact Ring: onda circular laranja no momento da transformação. */
export const ImpactRing: React.FC<{ at: number; cx?: number; cy?: number }> = ({ at, cx = 540, cy = 960 }) => {
  const t = useCurrentFrame() / FPS;
  if (t < at - 0.05 || t > at + 1.3) return null;
  const rings = [0, 0.12, 0.26];
  const flash = interpolate(t, [at - 0.05, at, at + 0.45], [0, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${cx}px ${cy}px, rgba(255,255,255,${0.95 * flash}) 0%, ${rgba(WT.amber, 0.45 * flash)} 22%, ${rgba(WT.orange, 0.18 * flash)} 45%, transparent 70%)` }} />
      {rings.map((d, i) => {
        const p = interpolate(t, [at + d, at + d + 1.0], [0, 1], { ...clamp, easing: ease });
        if (p <= 0 || p >= 1) return null;
        const r = 60 + p * 1100;
        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: cx - r, top: cy - r, width: r * 2, height: r * 2, borderRadius: '50%',
              border: `${(1 - p) * (14 - i * 4) + 1}px solid ${rgba(i === 1 ? WT.amber : WT.orange, (1 - p) * 0.9)}`,
              boxShadow: `0 0 ${40 * (1 - p)}px ${rgba(WT.orange, 0.6 * (1 - p))}, inset 0 0 ${30 * (1 - p)}px ${rgba(WT.amber, 0.5 * (1 - p))}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Linhas luminosas finas (corrente laranja atravessando a cena). */
export const LightStream: React.FC<{ from: number; to: number; cy?: number }> = ({ from, to, cy = 960 }) => {
  const t = useCurrentFrame() / FPS;
  if (t < from || t > to) return null;
  const o = interpolate(t, [from, from + 0.25, to - 0.25, to], [0, 1, 1, 0], clamp);
  const k = (t - from) / (to - from);
  const paths = [0, 1, 2, 3].map((j) => {
    let d = '';
    for (let s = 0; s <= 60; s++) {
      const u = s / 60;
      const x = -100 + u * 1280;
      const y = cy + Math.sin(u * Math.PI * 2 + j * 1.3 + k * 4) * (160 + j * 50) - (j - 1.5) * 90;
      d += `${s ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
    }
    return d;
  });
  return (
    <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0, opacity: o, pointerEvents: 'none' }}>
      <defs>
        <linearGradient id="ls" x1="0" x2="1">
          <stop offset="0" stopColor={WT.orange} stopOpacity="0" />
          <stop offset="0.5" stopColor={WT.orange} />
          <stop offset="1" stopColor={WT.amber} stopOpacity="0" />
        </linearGradient>
        <filter id="lsg"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      {paths.map((d, j) => (
        <g key={j}>
          <path d={d} fill="none" stroke="url(#ls)" strokeWidth={10} filter="url(#lsg)" opacity={0.5} strokeDasharray="520 900" strokeDashoffset={-k * 2600 - j * 400} />
          <path d={d} fill="none" stroke="url(#ls)" strokeWidth={2.5} strokeDasharray="520 900" strokeDashoffset={-k * 2600 - j * 400} />
        </g>
      ))}
    </svg>
  );
};
