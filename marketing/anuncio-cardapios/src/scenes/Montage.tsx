import React from 'react';
import { AbsoluteFill, Loop, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { C, FPS, M, clamp, ease, f, ramp, wordAt } from '../lib';
import { Phone, screenSize } from '../components/Phone';
import { Clip } from '../components/Screen';
import { KLine, KWord } from '../components/Kinetic';
import { body, display } from '../fonts';
import { hexA } from '../components/Phone';

export const STORES = [
  { clip: 'hero-al', name: 'Açaí e Love', glow: '#b8358f' },
  { clip: 'hero-dp', name: 'Açaí Deus Proverá', glow: '#f5b301' },
  { clip: 'hero-dl', name: "D'lua Doces", glow: '#d98b86' },
  { clip: 'hero-bj', name: 'Brasa do João', glow: '#ff8a00' },
  { clip: 'hero-ap', name: 'Alpha Pastelaria', glow: '#ff9a00' },
];
// ordem no palco: o do meio fica na frente
const ORDER = [1, 3, 2, 4, 0];
const A = M.cada;
export const MONTAGE_END = 41.0;

/** "Cada negócio com o seu próprio cardápio": os cinco vídeos de capa REAIS rodando lado a lado. */
export const Montage: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  if (t < A - 0.1 || t > MONTAGE_END + 0.4) return null;
  const pan = interpolate(t, [A, MONTAGE_END], [9, -9]);
  const out = interpolate(t, [MONTAGE_END - 0.1, MONTAGE_END + 0.35], [0, 1], { ...clamp, easing: ease });
  const seu = wordAt('seu', A);
  return (
    <AbsoluteFill style={{ perspective: 1500, opacity: 1 - out }}>
      <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transform: `rotateY(${pan}deg) translateZ(${-out * 400}px)` }}>
        {ORDER.map((si, k) => {
          const s = STORES[si];
          const pos = k - 2;
          const p = ramp(t, A + 0.07 * Math.abs(pos), A + 0.07 * Math.abs(pos) + 0.6);
          const w = 400;
          const { sh, bezel } = screenSize(w);
          const x = 540 + pos * 225;
          const z = -Math.abs(pos) * 300 + 60;
          return (
            <div
              key={s.clip}
              style={{
                position: 'absolute', left: x - w / 2, top: 1010 - (sh + bezel * 2) / 2 + (1 - p) * 700,
                transform: `translateZ(${z}px) rotateY(${-pos * 22}deg)`, opacity: p, transformStyle: 'preserve-3d',
              }}
            >
              <Phone width={w} glow={s.glow} glowStrength={0.7}>
                <Sequence from={f(A)} layout="none">
                  <Loop durationInFrames={150} layout="none">
                    <Clip name={s.clip} />
                  </Loop>
                </Sequence>
              </Phone>
              <div style={{ marginTop: 18, textAlign: 'center', fontFamily: body, fontWeight: 700, fontSize: 24, color: '#fff', opacity: interpolate(t, [A + 0.6, A + 1], [0, 1], clamp), textShadow: '0 2px 8px #000' }}>
                {s.name}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', top: 120, left: 40, right: 40, textAlign: 'center' }}>
        <KLine size={70} words={[{ text: 'CADA', at: A }, { text: 'NEGÓCIO,', at: wordAt('negócio', A) }]} />
        <div style={{ height: 14 }} />
        <KLine size={70} words={[{ text: 'SEU', at: seu }, { text: 'PRÓPRIO', at: wordAt('próprio', A), color: C.gold }, { text: 'CARDÁPIO', at: wordAt('cardápio', A), color: C.ember, glow: C.fire }]} />
      </div>
      <VideoChip t={t} at={39.25} />
    </AbsoluteFill>
  );
};

const VideoChip: React.FC<{ t: number; at: number }> = ({ t, at }) => {
  const p = interpolate(t, [at, at + 0.35], [0, 1], { ...clamp, easing: ease });
  if (p <= 0) return null;
  return (
    <div style={{ position: 'absolute', top: 1500, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: p, transform: `translateY(${(1 - p) * 30}px) scale(${0.9 + 0.1 * p})` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 30px', borderRadius: 50, background: 'rgba(12,10,10,0.8)', border: `2px solid ${hexA(C.gold, 0.85)}`, boxShadow: `0 0 40px ${hexA(C.fire, 0.5)}`, fontFamily: display, fontWeight: 800, color: '#fff', fontSize: 34, letterSpacing: '0.03em' }}>
        <span style={{ width: 0, height: 0, borderLeft: `20px solid ${C.fire}`, borderTop: '13px solid transparent', borderBottom: '13px solid transparent' }} />
        com vídeo de capa exclusivo
      </div>
    </div>
  );
};

export { KWord };
