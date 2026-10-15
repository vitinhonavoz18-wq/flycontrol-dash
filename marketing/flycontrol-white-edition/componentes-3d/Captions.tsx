import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { FPS, WT, Word, clamp, rgba } from './lib';
import { body } from './fonts';

export function captionGroups(W: Word[]) {
  const groups: { words: Word[]; start: number; end: number }[] = [];
  let cur: Word[] = [];
  const push = () => { if (cur.length) groups.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end }); cur = []; };
  for (const w of W) {
    const gap = cur.length ? w.start - cur[cur.length - 1].end : 0;
    if (cur.length && (cur.length >= 5 || gap > 0.45)) push();
    cur.push(w);
    if (/[.!?]$/.test(w.text)) push();
  }
  push();
  const merged: typeof groups = [];
  for (const g of groups) {
    const last = merged[merged.length - 1];
    if (last && last.words.length === 1 && last.words[0].text.length <= 2) merged[merged.length - 1] = { words: [...last.words, ...g.words], start: last.start, end: g.end };
    else merged.push(g);
  }
  return merged;
}

/** Legenda dinâmica em pílula de vidro branco, palavra falada em laranja. Fica na área segura do Instagram. */
export const Captions: React.FC<{ groups: ReturnType<typeof captionGroups>; y?: number }> = ({ groups, y = 1530 }) => {
  const t = useCurrentFrame() / FPS;
  const g = groups.find((g) => t >= g.start - 0.08 && t <= g.end + 0.3);
  if (!g) return null;
  const inP = interpolate(t, [g.start - 0.08, g.start + 0.1], [0, 1], clamp);
  const outP = interpolate(t, [g.end + 0.12, g.end + 0.3], [0, 1], clamp);
  return (
    <div style={{ position: 'absolute', left: 110, right: 110, top: y, display: 'flex', justifyContent: 'center', opacity: inP * (1 - outP), transform: `translateY(${(1 - inP) * 12}px)` }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 13px', padding: '14px 26px', borderRadius: 26, background: 'rgba(255,255,255,0.82)', border: `1px solid ${WT.border}`, boxShadow: '0 12px 34px rgba(17,24,39,0.12)', backdropFilter: 'blur(12px)' }}>
        {g.words.map((w, i) => {
          const on = t >= w.start;
          const pop = interpolate(t, [w.start, w.start + 0.12], [1.06, 1], clamp);
          return (
            <span key={i} style={{ fontFamily: body, fontWeight: 700, fontSize: 40, lineHeight: 1.18, color: on ? (t < w.end + 0.05 ? WT.orange : WT.ink) : rgba(WT.ink, 0.35), transform: `scale(${on ? pop : 1})`, display: 'inline-block' }}>
              {w.text.replace('OUTRO', 'outro').replace('VÁRIAS', 'várias')}
            </span>
          );
        })}
      </div>
    </div>
  );
};
