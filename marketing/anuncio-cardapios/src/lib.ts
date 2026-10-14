import { Easing, interpolate } from 'remotion';
import timeline from './timeline.json';
export const FPS = 30;
export const T = timeline as unknown as {
  duration: number;
  markers: Record<string, number>;
  words: { text: string; start: number; end: number }[];
};
export const M = T.markers;
export const f = (sec: number) => Math.round(sec * FPS);
export const C = {
  bg: '#06070a',
  fire: '#ff5a00',
  gold: '#ffb627',
  ember: '#ff7a1a',
  blue: '#2f8cff',
  ink: '#f5f2ee',
  chatBg: '#0b141a',
  chatIn: '#1f2c34',
  chatOut: '#005c4b',
};
export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const ease = Easing.bezier(0.22, 1, 0.36, 1);
export const easeIn = Easing.bezier(0.55, 0, 1, 0.45);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
/** 0→1 entre a e b (segundos), com curva */
export const ramp = (t: number, a: number, b: number, e = ease) => interpolate(t, [a, b], [0, 1], { ...clamp, easing: e });
/** pseudo-aleatório determinístico */
export const rnd = (i: number, s = 1) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
/** palavras da narração que começam em [a,b) */
export const wordsIn = (a: number, b: number) => T.words.filter((w) => w.start >= a && w.start < b);
export const wordAt = (txt: string, after = 0) =>
  T.words.find((w) => w.start >= after && w.text.toLowerCase().replace(/[.,!?…]/g, '') === txt.toLowerCase())!.start;
