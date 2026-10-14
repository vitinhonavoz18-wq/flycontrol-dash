import React from 'react';
import { AbsoluteFill, Img, Loop, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, FPS, clamp, ease, f, ramp } from '../lib';
import tl from '../timeline-short.json';
import { Phone, hexA, screenSize } from '../components/Phone';
import { Clip } from '../components/Screen';
import { Sheen } from '../components/Kinetic';
import { Embers } from '../components/Atmos';
import { display } from '../fonts';
import { G_END } from './Gestao';

const M = tl.markers as Record<string, number>;
const DUR = tl.duration;
const LOGO = M.conheca + 0.45;
const HEROES = [
  { clip: 'hero-al', glow: '#b8358f' },
  { clip: 'hero-dp', glow: '#f5b301' },
  { clip: 'hero-dl', glow: '#d98b86' },
  { clip: 'hero-bj', glow: '#ff8a00' },
  { clip: 'hero-ap', glow: '#ff9a00' },
];

/** Fecho: logo oficial, os cinco vídeos de capa ao fundo e o CTA no "Conheça agora!". */
export const Final: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  if (t < G_END - 0.1) return null;
  const A = G_END;
  const logoP = ramp(t, A, A + 0.6);
  const end = interpolate(t, [DUR - 0.4, DUR], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ perspective: 1400, opacity: 1 - end }}>
      <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transform: `rotateY(${interpolate(t, [A, DUR], [-8, 8])}deg)` }}>
        {HEROES.map((s, i) => {
          const pos = i - 2;
          const p = ramp(t, A + i * 0.05, A + i * 0.05 + 0.5);
          const w = 300;
          const { sh, bezel } = screenSize(w);
          return (
            <div key={s.clip} style={{ position: 'absolute', left: 540 + pos * 330 - w / 2, top: 1480 - (sh + bezel * 2) / 2 + Math.abs(pos) * 40, transform: `translateZ(${-Math.abs(pos) * 220 - 300 + (1 - p) * -600}px) rotateY(${-pos * 26}deg)`, opacity: p * 0.55 }}>
              <Phone width={w} glow={s.glow} glowStrength={0.6}>
                <Sequence from={f(A)} layout="none">
                  <Loop durationInFrames={150} layout="none">
                    <Clip name={s.clip} />
                  </Loop>
                </Sequence>
              </Phone>
            </div>
          );
        })}
      </div>
      <Embers from={A} to={DUR} count={90} cy={600} spread={1100} speed={0.6} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 300, display: 'flex', justifyContent: 'center', opacity: logoP, transform: `scale(${0.6 + 0.4 * logoP}) translateY(${(1 - logoP) * 60}px)` }}>
        <div style={{ position: 'relative', width: 760, height: 527 }}>
          <div style={{ position: 'absolute', inset: -80, background: `radial-gradient(ellipse at 50% 50%, ${hexA(C.fire, 0.45)} 0%, transparent 65%)`, filter: 'blur(20px)' }} />
          <Img src={staticFile('brand/flycontrol-logo-hero.png')} style={{ position: 'absolute', inset: 0, width: 760, height: 527, mixBlendMode: 'screen', filter: `brightness(${1 + 0.35 * interpolate(t, [LOGO, LOGO + 0.15, LOGO + 0.8], [0, 1, 0], clamp)})` }} />
          <Sheen at={LOGO} w={760} h={527} />
        </div>
      </div>
      <Cta t={t} at={M.conheca} />
    </AbsoluteFill>
  );
};

const Cta: React.FC<{ t: number; at: number }> = ({ t, at }) => {
  const p = interpolate(t, [at - 0.1, at + 0.3], [0, 1], { ...clamp, easing: ease });
  if (p <= 0) return null;
  const pulse = 1 + 0.025 * Math.sin((t - at) * 6);
  const x = ((t - at) * 0.7) % 1.6;
  return (
    <div style={{ position: 'absolute', top: 900, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: p, transform: `scale(${(0.7 + 0.3 * p) * pulse})` }}>
      <div style={{ position: 'relative', overflow: 'hidden', padding: '30px 60px', borderRadius: 70, background: `linear-gradient(135deg, ${C.fire}, ${C.gold})`, boxShadow: `0 0 60px ${hexA(C.fire, 0.75)}, 0 20px 40px rgba(0,0,0,0.6)` }}>
        <span style={{ fontFamily: display, fontWeight: 900, fontSize: 52, color: '#1a0800', letterSpacing: '0.04em' }}>CONHEÇA O FLYCONTROL</span>
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(105deg, transparent ${x * 100 - 30}%, rgba(255,255,255,0.7) ${x * 100 - 15}%, transparent ${x * 100}%)` }} />
      </div>
    </div>
  );
};
