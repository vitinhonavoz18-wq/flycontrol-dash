import { createContext, useContext } from 'react';
import { Easing, interpolate } from 'remotion';

export const FPS = 30;
/** Tokens REAIS do tema claro do FlyControl (flycontrol-dash/src/styles.css, :root "LIGHT THEME (White Mode)"). */
export const WT = {
  bg: '#F8F9FB', // --background
  card: '#FFFFFF', // --card
  ink: '#111827', // --foreground
  muted: '#6B7280',
  border: '#E5E7EB', // --border
  secondary: '#F3F4F6', // --secondary
  orange: '#ff5a00', // --primary
  orange2: '#ff7a00',
  amber: '#ffc247',
  blue: '#008cff',
  gradPrimary: 'linear-gradient(135deg, #ff5a00 0%, #ff7a00 35%, #ffc247 100%)', // --gradient-primary
  shadowGlow: '0 10px 40px -10px rgba(255, 90, 0, 0.3)', // --shadow-glow
  shadowElegant: '0 10px 30px -15px rgba(0, 0, 0, 0.1)', // --shadow-elegant
};
export type Word = { text: string; start: number; end: number };
export type Timeline = { duration: number; markers: Record<string, number | null>; words: Word[]; hasChaos: boolean };
export const TLContext = createContext<Timeline | null>(null);
export const useTL = () => {
  const tl = useContext(TLContext)!;
  const m = (k: string) => tl.markers[k] as number;
  return { ...tl, m };
};
export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const ease = Easing.bezier(0.22, 1, 0.36, 1);
export const easeIn = Easing.bezier(0.55, 0, 1, 0.45);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
export const ramp = (t: number, a: number, b: number, e = ease) => interpolate(t, [a, b], [0, 1], { ...clamp, easing: e });
export const rnd = (i: number, s = 1) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
export const f = (sec: number) => Math.round(sec * FPS);
export function rgba(hex: string, a: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}
/** interpolação por trechos (lista de [tempo, valor]) com curva suave */
export const keys = (t: number, k: [number, number][], e = easeInOut) => {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 0; i < k.length - 1; i++) {
    const [a, va] = k[i], [b, vb] = k[i + 1];
    if (t <= b) return va + (vb - va) * e(Math.max(0, Math.min(1, (t - a) / Math.max(1e-6, b - a))));
  }
  return k[k.length - 1][1];
};
