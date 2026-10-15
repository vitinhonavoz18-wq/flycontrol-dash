import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { FPS, WT, clamp, ease, rgba } from './lib';
import { display } from './fonts';

/** Extrusão 3D discreta para fundo branco: camadas na própria cor, escurecidas, + sombra macia. */
const extrudeLight = (depth: number, side: string, glow?: string) => {
  const s: string[] = [];
  for (let i = 1; i <= depth; i++) s.push(`${i * 0.55}px ${i * 0.85}px 0 ${side}`);
  s.push(`${depth * 0.9}px ${depth * 2.2}px ${depth * 3}px rgba(17,24,39,0.18)`);
  if (glow) s.push(`0 0 26px ${rgba(glow, 0.35)}`);
  return s.join(',');
};

export type TWord = { text: string; at: number; orange?: boolean };

/** Palavra 3D: entra com perspectiva, máscara e motion blur proporcional à velocidade; sai subindo. */
export const W3D: React.FC<{
  text: string; at: number; out?: number; size: number; orange?: boolean; from?: 'rise' | 'zoom' | 'flip' | 'slam'; tracking?: number; weight?: number; style?: React.CSSProperties;
}> = ({ text, at, out, size, orange, from = 'rise', tracking = -0.01, weight = 900, style }) => {
  const t = useCurrentFrame() / FPS;
  const p = interpolate(t, [at, at + 0.4], [0, 1], { ...clamp, easing: ease });
  const pp = interpolate(t - 1 / FPS, [at, at + 0.4], [0, 1], { ...clamp, easing: ease });
  const q = out !== undefined ? interpolate(t, [out, out + 0.28], [0, 1], { ...clamp, easing: ease }) : 0;
  if (t < at - 0.05 || q >= 1) return null;
  const vel = Math.abs(p - pp) * 30;
  let tr = '';
  if (from === 'rise') tr = `translateY(${(1 - p) * size * 0.8}px) rotateX(${(1 - p) * -75}deg)`;
  if (from === 'zoom') tr = `scale(${2.2 - 1.2 * p})`;
  if (from === 'flip') tr = `rotateY(${(1 - p) * 85}deg)`;
  if (from === 'slam') tr = `scale(${interpolate(t, [at, at + 0.14, at + 0.27, at + 0.42], [2.8, 0.95, 1.03, 1], clamp)})`;
  tr += ` translateY(${-q * size * 0.45}px)`;
  const depth = Math.max(2, Math.round(size / 20));
  return (
    <span
      style={{
        display: 'inline-block', fontFamily: display, fontWeight: weight, fontSize: size, lineHeight: 1.02, whiteSpace: 'pre',
        color: orange ? WT.orange : WT.ink,
        backgroundImage: orange ? 'linear-gradient(180deg, #ff7a00 0%, #ff5a00 55%, #e04a00 100%)' : undefined,
        WebkitBackgroundClip: orange ? 'text' : undefined,
        WebkitTextFillColor: orange ? 'transparent' : undefined,
        filter: `drop-shadow(${orange ? '0 0 0 transparent' : '0 0 0 transparent'}) blur(${Math.min(vel * 5, 9) + q * 7}px)`,
        textShadow: orange ? undefined : extrudeLight(depth, '#c9cdd4'),
        letterSpacing: `${tracking + (1 - p) * 0.2}em`, transform: tr, transformOrigin: '50% 65%', opacity: Math.min(1, p * 1.6) * (1 - q),
        ...style,
      } as React.CSSProperties}
    >
      {orange ? <OrangeDepth text={text} depth={depth} /> : text}
    </span>
  );
};

/** Texto laranja com gradiente: a extrusão vai numa camada atrás (gradiente + text-shadow não combinam). */
const OrangeDepth: React.FC<{ text: string; depth: number }> = ({ text, depth }) => (
  <span style={{ position: 'relative', display: 'inline-block' }}>
    <span aria-hidden style={{ position: 'absolute', inset: 0, color: '#b83b00', WebkitTextFillColor: '#b83b00', textShadow: extrudeLight(depth, '#a83500', WT.orange), zIndex: -1 }}>{text}</span>
    {text}
  </span>
);

/** Linha de palavras, cada uma no tempo da voz. */
export const L3D: React.FC<{ words: TWord[]; size: number; out?: number; gap?: number; from?: 'rise' | 'zoom' | 'flip' | 'slam' }> = ({ words, size, out, gap = 0.26, from = 'rise' }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: `0 ${size * gap}px`, perspective: 900 }}>
    {words.map((w, i) => (
      <W3D key={i} text={w.text} at={w.at} out={out} size={size} orange={w.orange} from={from} />
    ))}
  </div>
);

/** Selo de vidro branco (chip), usado para nomes de lojas e etiquetas. */
export const GlassChip: React.FC<{ t: number; a: number; b: number; children: React.ReactNode; dot?: boolean; size?: number }> = ({ t, a, b, children, dot, size = 28 }) => {
  if (b - a < 0.3) return null;
  const e = Math.min(0.25, (b - a) / 3);
  const p = interpolate(t, [a, a + e, b - e * 0.6, b], [0, 1, 1, 0], clamp);
  if (p <= 0) return null;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 12, fontFamily: 'Inter', fontWeight: 700, fontSize: size, color: WT.ink, opacity: p,
        transform: `translateY(${(1 - p) * 12}px)`, padding: `${size * 0.36}px ${size * 0.8}px`, borderRadius: 60,
        background: 'rgba(255,255,255,0.78)', border: `1.5px solid ${rgba(WT.orange, 0.35)}`, boxShadow: `${WT.shadowElegant}, 0 8px 30px rgba(255,90,0,0.12)`,
        backdropFilter: 'blur(10px)',
      }}
    >
      {dot && <span style={{ width: size * 0.36, height: size * 0.36, borderRadius: '50%', background: WT.gradPrimary, boxShadow: `0 0 12px ${WT.orange}` }} />}
      {children}
    </span>
  );
};
