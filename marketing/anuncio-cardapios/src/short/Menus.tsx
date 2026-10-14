import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { C, FPS, clamp, ease, f, ramp } from '../lib';
import tl from '../timeline-short.json';
import { Phone, hexA, screenSize } from '../components/Phone';
import { Clip } from '../components/Screen';
import { KWord, Sheen } from '../components/Kinetic';
import { body, display } from '../fonts';

const M = tl.markers as Record<string, number>;
const PW = 600;
const { sw, sh, bezel } = screenSize(PW);
const CY = 1000;

/**
 * Versão curta: o cardápio real surge da virada e cada palavra da voz mostra
 * o VÍDEO DE CAPA do próprio estabelecimento (gravado do site no ar).
 */
const BURGER_START = M.hamburguer + 0.14;
const PASTEL_START = M.pastel - 0.14;
export const CUTS = [
  { a: M.fly1, b: M.acai, clip: 'al', store: 'Açaí e Love', glow: '#b8358f', word: '', hero: true },
  { a: M.acai, b: M.doce, clip: 'hero-dp', store: 'Açaí Deus Proverá', glow: '#f5b301', word: 'AÇAÍ', hero: true },
  { a: M.doce, b: BURGER_START, clip: 'hero-dl', store: "D'lua Doces", glow: '#d98b86', word: 'DOCE', hero: true },
  { a: BURGER_START, b: PASTEL_START, clip: 'dp-burger', store: 'Açaí Deus Proverá', glow: '#f5b301', word: 'HAMBÚRGUER', hero: false },
  { a: PASTEL_START, b: M.cada, clip: 'hero-ap', store: 'Alpha Pastelaria', glow: '#ff9a00', word: 'PASTEL', hero: true },
];
export const MENUS_END = M.cada;

export const ShortMenus: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  if (t < M.fly1 - 0.05 || t > MENUS_END + 0.35) return null;
  const cut = CUTS.find((c) => t >= c.a && t < c.b) ?? CUTS[CUTS.length - 1];
  const rev = ramp(t, M.fly1, M.fly1 + 0.7);
  const kick = CUTS.reduce((acc, c) => (t >= c.a && t < c.a + 0.5 && c.a > M.fly1 ? Math.sin((t - c.a) * 20) * (1 - (t - c.a) / 0.5) * 7 : acc), 0);
  const float = Math.sin(t * 1.1) * 8;
  const exit = interpolate(t, [MENUS_END - 0.05, MENUS_END + 0.3], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ perspective: 1600 }}>
      <div
        style={{
          position: 'absolute', left: 540 - PW / 2, top: CY - (sh + bezel * 2) / 2 + float,
          transform: `rotateY(${(1 - rev) * 28 + kick}deg) rotateX(${(1 - rev) * -6}deg) scale(${1 - exit * 0.4}) translateY(${exit * 200}px)`,
          transformStyle: 'preserve-3d', opacity: 1 - exit,
        }}
      >
        <Phone width={PW} glow={cut.glow} glowStrength={0.65}>
          {CUTS.map((c) => (
            <Sequence key={c.clip} from={f(c.a)} durationInFrames={f(c.b - c.a) + 9} layout="none">
              <CutLayer first={c.a <= M.fly1 + 0.01}>
                <Clip name={c.clip} />
              </CutLayer>
            </Sequence>
          ))}
        </Phone>
      </div>
      <HeroBadge t={t} />
      <Titles t={t} />
    </AbsoluteFill>
  );
};

const CutLayer: React.FC<{ first: boolean; children: React.ReactNode }> = ({ first, children }) => {
  const t = useCurrentFrame() / FPS;
  const p = first ? 1 : interpolate(t, [0, 0.24], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ transform: `translateX(${(1 - p) * 100}%) scale(${0.9 + 0.1 * p})`, filter: `blur(${(1 - p) * 8}px)`, boxShadow: '-30px 0 60px rgba(0,0,0,0.6)' }}>
      {children}
    </AbsoluteFill>
  );
};

/** Selo "VÍDEO NA CAPA" sobre cada cardápio cujo vídeo de capa está na tela. */
const HeroBadge: React.FC<{ t: number }> = ({ t }) => {
  const c = CUTS.find((c) => c.hero && t >= c.a + 0.25 && t <= c.b - 0.05);
  const p = c ? interpolate(t, [c.a + 0.25, c.a + 0.45], [0, 1], clamp) : 0;
  if (!c || p <= 0) return null;
  const pulse = (t - c.a) % 1.0;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: CY - sh / 2 - 34, display: 'flex', justifyContent: 'center', opacity: p }}>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', inset: -6, borderRadius: 40, border: `3px solid ${C.gold}`, opacity: 1 - pulse, transform: `scale(${1 + pulse * 0.25})` }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(10,10,12,0.8)', border: `2px solid ${hexA(C.gold, 0.9)}`, borderRadius: 40, padding: '10px 22px', fontFamily: display, fontWeight: 800, fontSize: 24, color: '#fff', letterSpacing: '0.08em', boxShadow: `0 0 30px ${hexA(C.fire, 0.6)}` }}>
          <span style={{ width: 0, height: 0, borderLeft: `16px solid ${C.fire}`, borderTop: '10px solid transparent', borderBottom: '10px solid transparent' }} />
          VÍDEO NA CAPA
          <span style={{ width: 10, height: 10, borderRadius: 5, background: '#ff3b30', opacity: Math.floor(t * 2) % 2 ? 1 : 0.3 }} />
        </div>
      </div>
    </div>
  );
};

const Titles: React.FC<{ t: number }> = ({ t }) => (
  <AbsoluteFill>
    <div style={{ position: 'absolute', top: 95, left: 0, right: 0, textAlign: 'center' }}>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <KWord text="FLYCONTROL" at={M.fly1} out={M.acai - 0.6} size={118} from="zoom" color="#fff" glow={C.fire} depthColor="#5a1d00" tracking={0.02} />
        <Sheen at={M.fly1 + 0.25} w={760} h={130} />
      </div>
    </div>
    {/* nome da loja logo depois do impacto */}
    <div style={{ position: 'absolute', top: 105, left: 0, right: 0, textAlign: 'center' }}>
      <KWord text="AÇAÍ E LOVE" at={M.acai - 0.55} out={M.acai - 0.1} size={84} from="up" color="#fff" depthColor="#2a1206" />
    </div>
    {CUTS.filter((c) => c.word).map((c) => (
      <div key={c.clip} style={{ position: 'absolute', top: 100, left: 0, right: 0, textAlign: 'center' }}>
        <KWord text={c.word} at={c.a} out={c.b - 0.1} size={c.word.length > 6 ? 104 : 128} from="slam" color="#fff" glow={c.glow} depthColor="#3a1400" />
        <SubTag t={t} a={c.a} b={c.b} text={c.store} />
      </div>
    ))}
  </AbsoluteFill>
);

const SubTag: React.FC<{ t: number; a: number; b: number; text: string }> = ({ t, a, b, text }) => {
  const p = interpolate(t, [a, a + 0.2, b - 0.12, b], [0, 1, 1, 0], clamp);
  if (p <= 0) return null;
  return (
    <div style={{ marginTop: 18, opacity: p, transform: `translateY(${(1 - p) * 10}px)` }}>
      <span style={{ fontFamily: body, fontWeight: 600, fontSize: 28, color: '#fff', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', padding: '8px 20px', borderRadius: 30, letterSpacing: '0.04em' }}>
        {text}
      </span>
    </div>
  );
};
