import React from 'react';
import { AbsoluteFill, Img, Loop, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, FPS, M, clamp, ease, f, ramp } from '../lib';
import { Phone, hexA, screenSize } from '../components/Phone';
import { Clip } from '../components/Screen';
import { KLine, KWord, Sheen } from '../components/Kinetic';
import { Embers } from '../components/Atmos';
import { STORES } from './Montage';
import { body, display } from '../fonts';
import { FEAT_END } from './Features';

const A = FEAT_END;
const LOGO = 55.8;

/** Cena 7: os cinco cardápios em 3D, a câmera passeia e os aparelhos abrem caminho para a marca. */
export const Finale: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  if (t < A - 0.1) return null;
  const pan = interpolate(t, [A, 59], [-14, 10]);
  const spread = ramp(t, M.fly2 - 0.1, M.fly2 + 1.1);
  const dim = interpolate(spread, [0, 1], [1, 0.42]);
  const logoP = ramp(t, M.fly2, M.fly2 + 0.9);
  const end = interpolate(t, [58.2, 59], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ perspective: 1400, opacity: 1 - end }}>
      <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transform: `rotateY(${pan}deg) rotateX(${4 - spread * 6}deg)` }}>
        {STORES.map((s, i) => {
          const pos = i - 2;
          const enter = ramp(t, A + i * 0.06, A + i * 0.06 + 0.7);
          const w = 300;
          const { sh, bezel } = screenSize(w);
          const x = 540 + pos * (190 + spread * 140);
          const y = 1080 + Math.abs(pos) * 40 + spread * 430;
          const z = -Math.abs(pos) * 200 - spread * 500 + (1 - enter) * -900;
          return (
            <div key={s.clip} style={{ position: 'absolute', left: x - w / 2, top: y - (sh + bezel * 2) / 2, transform: `translateZ(${z}px) rotateY(${-pos * (20 + spread * 12)}deg) rotateZ(${pos * 2}deg)`, opacity: enter * dim, transformStyle: 'preserve-3d' }}>
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
      <Embers from={M.fly2 - 0.2} to={59} count={90} cy={560} spread={1100} speed={0.6} />
      {/* marca FlyControl (logo oficial do repositório flycontrol-dash) */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 250, display: 'flex', justifyContent: 'center', opacity: logoP, transform: `scale(${0.6 + 0.4 * logoP}) translateY(${(1 - logoP) * 60}px)` }}>
        <div style={{ position: 'relative', width: 760, height: 527 }}>
          <div style={{ position: 'absolute', inset: -80, background: `radial-gradient(ellipse at 50% 50%, ${hexA(C.fire, 0.45)} 0%, transparent 65%)`, filter: 'blur(20px)' }} />
          <Img src={staticFile('brand/flycontrol-logo-hero.png')} style={{ position: 'absolute', inset: 0, width: 760, height: 527, mixBlendMode: 'screen', filter: `brightness(${1 + 0.25 * Math.sin(t * 3)})` }} />
          <Sheen at={LOGO} w={760} h={527} />
        </div>
      </div>
      <div style={{ position: 'absolute', top: 820, left: 40, right: 40, textAlign: 'center' }}>
        <KLine size={92} words={[{ text: 'TRANSFORME', at: M.seuNegocio - 0.25 }, { text: 'SEUS', at: M.seuNegocio - 0.1 }, { text: 'PEDIDOS.', at: M.seuNegocio + 0.05, color: C.ember, glow: C.fire }]} />
        <Sub t={t} at={52.0} />
      </div>
      <Cta t={t} at={M.conheca} />
    </AbsoluteFill>
  );
};

const Sub: React.FC<{ t: number; at: number }> = ({ t, at }) => {
  const p = interpolate(t, [at, at + 0.5], [0, 1], { ...clamp, easing: ease });
  return (
    <div style={{ marginTop: 34, fontFamily: body, fontWeight: 500, fontSize: 40, color: '#f1e6dc', opacity: p, transform: `translateY(${(1 - p) * 18}px)`, letterSpacing: `${(1 - p) * 0.1}em`, textShadow: '0 2px 10px #000' }}>
      Cardápios digitais com a identidade
      <br />
      do seu negócio.
    </div>
  );
};

const Cta: React.FC<{ t: number; at: number }> = ({ t, at }) => {
  const p = interpolate(t, [at - 0.1, at + 0.35], [0, 1], { ...clamp, easing: ease });
  if (p <= 0) return null;
  const pulse = 1 + 0.025 * Math.sin((t - at) * 6);
  const x = ((t - at) * 0.6) % 1.6;
  return (
    <div style={{ position: 'absolute', top: 1230, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: p, transform: `scale(${(0.7 + 0.3 * p) * pulse})` }}>
      <div style={{ position: 'relative', overflow: 'hidden', padding: '30px 60px', borderRadius: 70, background: `linear-gradient(135deg, ${C.fire}, ${C.gold})`, boxShadow: `0 0 60px ${hexA(C.fire, 0.75)}, 0 20px 40px rgba(0,0,0,0.6)` }}>
        <span style={{ fontFamily: display, fontWeight: 900, fontSize: 52, color: '#1a0800', letterSpacing: '0.04em' }}>CONHEÇA O FLYCONTROL</span>
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(105deg, transparent ${x * 100 - 30}%, rgba(255,255,255,0.7) ${x * 100 - 15}%, transparent ${x * 100}%)` }} />
      </div>
    </div>
  );
};

export { KWord };
