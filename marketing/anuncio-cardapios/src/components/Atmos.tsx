import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, FPS, M, clamp, rnd } from '../lib';
import { hexA } from './Phone';

/** Fundo: escuro e tenso antes da virada; quente e limpo depois. */
export const Background: React.FC<{ fly?: number }> = ({ fly = M.fly1 }) => {
  const t = useCurrentFrame() / FPS;
  const after = interpolate(t, [fly - 0.1, fly + 0.6], [0, 1], clamp);
  const breathe = 0.5 + 0.5 * Math.sin(t * 1.3);
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {/* antes: luz vermelha/âmbar baixa, sufocada */}
      <AbsoluteFill
        style={{
          opacity: 1 - after,
          background: `radial-gradient(ellipse 80% 55% at 50% 62%, ${hexA('#7a1d06', 0.55 + 0.15 * breathe)} 0%, transparent 70%),
                       radial-gradient(ellipse 60% 40% at 20% 10%, ${hexA('#3a0d02', 0.6)} 0%, transparent 70%)`,
        }}
      />
      {/* depois: fogo FlyControl + acento azul da marca */}
      <AbsoluteFill
        style={{
          opacity: after,
          background: `radial-gradient(ellipse 70% 45% at 50% 55%, ${hexA(C.fire, 0.28 + 0.06 * breathe)} 0%, transparent 70%),
                       radial-gradient(ellipse 50% 35% at 85% 15%, ${hexA(C.blue, 0.18)} 0%, transparent 70%),
                       radial-gradient(ellipse 60% 30% at 10% 95%, ${hexA(C.gold, 0.14)} 0%, transparent 70%)`,
        }}
      />
      <Bokeh warm={after} />
      {/* vinheta */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 75% 65% at 50% 50%, transparent 55%, rgba(0,0,0,0.75) 100%)' }} />
    </AbsoluteFill>
  );
};

const Bokeh: React.FC<{ warm: number }> = ({ warm }) => {
  const t = useCurrentFrame() / FPS;
  return (
    <AbsoluteFill>
      {new Array(26).fill(0).map((_, i) => {
        const x = rnd(i, 3) * 1080;
        const y = ((rnd(i, 5) * 1920 - t * (8 + rnd(i, 7) * 22)) % 1920 + 1920) % 1920;
        const s = 6 + rnd(i, 11) * 26;
        const col = i % 5 === 0 ? C.blue : rnd(i, 13) > 0.5 ? C.fire : C.gold;
        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: x, top: y, width: s, height: s, borderRadius: '50%',
              background: hexA(col, (0.12 + 0.25 * rnd(i, 17)) * (0.35 + 0.65 * warm)),
              filter: `blur(${2 + rnd(i, 19) * 6}px)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Partículas de energia (determinísticas). */
export const Embers: React.FC<{ from: number; to: number; count?: number; cx?: number; cy?: number; spread?: number; speed?: number }> = ({
  from, to, count = 70, cx = 540, cy = 960, spread = 900, speed = 1,
}) => {
  const t = useCurrentFrame() / FPS;
  if (t < from || t > to) return null;
  const k = (t - from) * speed;
  const e = Math.min(0.3, (to - from) / 3);
  const fade = interpolate(t, [from, from + e, to - e, to], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: fade, mixBlendMode: 'screen' }}>
      {new Array(count).fill(0).map((_, i) => {
        const a = rnd(i, 21) * Math.PI * 2;
        const r = (rnd(i, 23) * spread * 0.5 + k * (60 + rnd(i, 29) * 140)) % (spread * 0.75);
        const x = cx + Math.cos(a + k * 0.3) * r;
        const y = cy + Math.sin(a + k * 0.3) * r * 1.3 - k * 40 * rnd(i, 31);
        const s = 2 + rnd(i, 37) * 5;
        const col = rnd(i, 41) > 0.82 ? C.blue : rnd(i, 43) > 0.4 ? C.gold : C.fire;
        return <div key={i} style={{ position: 'absolute', left: x, top: y, width: s, height: s, borderRadius: '50%', background: col, boxShadow: `0 0 ${s * 3}px ${col}` }} />;
      })}
    </AbsoluteFill>
  );
};

export const Flash: React.FC<{ at: number; dur?: number; color?: string; strength?: number }> = ({ at, dur = 0.55, color = '#fff2e0', strength = 0.9 }) => {
  const t = useCurrentFrame() / FPS;
  const o = interpolate(t, [at - 0.06, at, at + dur], [0, strength, 0], clamp);
  if (o <= 0) return null;
  return <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 50%, ${color} 0%, ${hexA(C.fire, 0.8)} 35%, transparent 75%)`, opacity: o, mixBlendMode: 'screen' }} />;
};
