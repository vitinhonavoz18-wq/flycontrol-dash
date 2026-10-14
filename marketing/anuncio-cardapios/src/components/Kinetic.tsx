import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { C, FPS, clamp, ease, rnd } from '../lib';
import { display } from '../fonts';
import { hexA } from './Phone';

/** Sombra em camadas = extrusão 3D discreta + brilho controlado. */
export const extrude = (depth: number, color: string, glow?: string, glowA = 0.32) => {
  const s: string[] = [];
  for (let i = 1; i <= depth; i++) s.push(`${i * 0.7}px ${i * 0.9}px 0 ${color}`);
  s.push(`${depth * 0.8}px ${depth * 1.2}px ${depth * 2}px rgba(0,0,0,0.55)`);
  if (glow) s.push(`0 0 14px ${hexA(glow, glowA)}`, `0 0 36px ${hexA(glow, glowA * 0.5)}`);
  return s.join(',');
};

type WordProps = {
  text: string;
  at: number; // segundo em que entra (sincronizado com a voz)
  out?: number; // segundo em que sai
  size: number;
  color?: string;
  depthColor?: string;
  glow?: string;
  from?: 'zoom' | 'up' | 'flip' | 'slam';
  tracking?: number;
  weight?: number;
  style?: React.CSSProperties;
};

/** Palavra cinética: máscara + perspectiva + motion blur proporcional à velocidade. */
export const KWord: React.FC<WordProps> = ({
  text, at, out, size, color = C.ink, depthColor = '#5a1f00', glow, from = 'up', tracking = 0, weight = 900, style,
}) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const p = interpolate(t, [at, at + 0.42], [0, 1], { ...clamp, easing: ease });
  const pPrev = interpolate(t - 1 / FPS, [at, at + 0.42], [0, 1], { ...clamp, easing: ease });
  const q = out !== undefined ? interpolate(t, [out, out + 0.3], [0, 1], { ...clamp, easing: ease }) : 0;
  if (t < at - 0.05 || q >= 1) return null;
  const vel = Math.abs(p - pPrev) * 30;
  let transform = '';
  if (from === 'zoom') transform = `scale(${interpolate(p, [0, 1], [2.4, 1])}) translateZ(0)`;
  if (from === 'up') transform = `translateY(${interpolate(p, [0, 1], [size * 0.9, 0])}px) rotateX(${interpolate(p, [0, 1], [-70, 0])}deg)`;
  if (from === 'flip') transform = `rotateY(${interpolate(p, [0, 1], [80, 0])}deg) translateX(${interpolate(p, [0, 1], [60, 0])}px)`;
  if (from === 'slam') {
    const k = interpolate(t, [at, at + 0.16, at + 0.3, at + 0.45], [3.2, 0.94, 1.03, 1], clamp);
    transform = `scale(${k})`;
  }
  transform += ` translateY(${-q * size * 0.5}px)`;
  const letter = interpolate(p, [0, 1], [tracking + 0.25, tracking]);
  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: display,
        fontWeight: weight,
        fontSize: size,
        lineHeight: 1,
        color,
        letterSpacing: `${letter}em`,
        textShadow: extrude(Math.max(2, Math.round(size / 18)), depthColor, glow),
        transform,
        opacity: Math.min(p * 1.6, 1) * (1 - q),
        filter: `blur(${Math.min(vel * 6, 10) + q * 8}px)`,
        transformOrigin: '50% 60%',
        whiteSpace: 'pre',
        ...style,
      }}
    >
      {text}
    </span>
  );
};

/** Linha de palavras, cada uma no seu tempo. */
export const KLine: React.FC<{
  words: { text: string; at: number; color?: string; glow?: string }[];
  out?: number;
  size: number;
  gap?: number;
  from?: WordProps['from'];
  depthColor?: string;
}> = ({ words, out, size, gap = 0.28, from = 'up', depthColor }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: `0 ${size * gap}px`, perspective: 900 }}>
    {words.map((w, i) => (
      <KWord key={i} text={w.text} at={w.at} out={out} size={size} color={w.color} glow={w.glow} from={from} depthColor={depthColor} />
    ))}
  </div>
);

/** Brilho que varre o texto (luz controlada). */
export const Sheen: React.FC<{ at: number; w: number; h: number }> = ({ at, w, h }) => {
  const t = useCurrentFrame() / FPS;
  const x = interpolate(t, [at, at + 0.9], [-0.4, 1.4], clamp);
  if (t < at || t > at + 1) return null;
  return (
    <div
      style={{
        position: 'absolute', left: 0, top: 0, width: w, height: h, pointerEvents: 'none', mixBlendMode: 'screen',
        background: `linear-gradient(105deg, transparent ${x * 100 - 12}%, rgba(255,255,255,0.65) ${x * 100}%, transparent ${x * 100 + 12}%)`,
      }}
    />
  );
};

export const shake = (t: number, at: number, dur: number, amp: number, seed = 1) => {
  if (t < at || t > at + dur) return { x: 0, y: 0 };
  const k = 1 - (t - at) / dur;
  const i = Math.floor(t * 60);
  return { x: (rnd(i, seed) - 0.5) * amp * k, y: (rnd(i, seed + 9) - 0.5) * amp * k };
};
