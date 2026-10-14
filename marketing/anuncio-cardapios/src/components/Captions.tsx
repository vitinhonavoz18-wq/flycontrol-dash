import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { C, FPS, T, clamp } from '../lib';
import { body } from '../fonts';

/** Agrupa as palavras da narração em frases curtas (para legenda e para o .srt). */
export function captionGroups(W: { text: string; start: number; end: number }[] = T.words) {
  const groups: { words: typeof W; start: number; end: number }[] = [];
  let cur: typeof W = [];
  for (let i = 0; i < W.length; i++) {
    const w = W[i];
    const gap = cur.length ? w.start - cur[cur.length - 1].end : 0;
    if (cur.length && (cur.length >= 5 || gap > 0.45)) {
      groups.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
      cur = [];
    }
    cur.push(w);
    if (/[.!?]$/.test(w.text)) {
      groups.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
      cur = [];
    }
  }
  if (cur.length) groups.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
  // palavra solta (ex.: "o") vai junto com a frase seguinte
  const merged: typeof groups = [];
  for (const g of groups) {
    const last = merged[merged.length - 1];
    if (last && last.words.length === 1 && last.words[0].text.length <= 2) merged[merged.length - 1] = { words: [...last.words, ...g.words], start: last.start, end: g.end };
    else merged.push(g);
  }
  return merged;
}

const GROUPS = captionGroups();

/** Legenda animada: palavra falada acende em laranja (karaokê). */
export const Captions: React.FC<{ y?: number; groups?: ReturnType<typeof captionGroups> }> = ({ y = 1735, groups = GROUPS }) => {
  const t = useCurrentFrame() / FPS;
  const g = groups.find((g) => t >= g.start - 0.08 && t <= g.end + 0.35);
  if (!g) return null;
  const inP = interpolate(t, [g.start - 0.08, g.start + 0.12], [0, 1], clamp);
  const outP = interpolate(t, [g.end + 0.15, g.end + 0.35], [0, 1], clamp);
  return (
    <div
      style={{
        position: 'absolute', left: 60, right: 60, top: y, display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
        gap: '6px 18px', opacity: inP * (1 - outP), transform: `translateY(${(1 - inP) * 14}px)`,
      }}
    >
      {g.words.map((w, i) => {
        const on = t >= w.start;
        const pop = interpolate(t, [w.start, w.start + 0.12], [1.07, 1], clamp);
        return (
          <span
            key={i}
            style={{
              fontFamily: body, fontWeight: 700, fontSize: 46, lineHeight: 1.15,
              color: on ? C.ink : 'rgba(245,242,238,0.45)',
              transform: `scale(${on ? pop : 1})`, display: 'inline-block',
              textShadow: on ? `0 0 18px rgba(255,90,0,0.55), 0 3px 8px rgba(0,0,0,0.9)` : '0 3px 8px rgba(0,0,0,0.9)',
              borderBottom: on && t < w.end + 0.05 ? `4px solid ${C.fire}` : '4px solid transparent',
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};
