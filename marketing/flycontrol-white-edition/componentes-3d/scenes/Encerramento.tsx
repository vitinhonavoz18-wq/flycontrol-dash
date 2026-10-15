import React from 'react';
import { AbsoluteFill, Img, Loop, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { FPS, WT, clamp, ease, f, keys, ramp, rgba, useTL } from '../lib';
import { Phone3D, Tablet3D } from '../Devices';
import { W3D } from '../Type3D';
import { body } from '../fonts';

/** Cena 7: três celulares e o tablet suspensos, faixa de luz laranja ao fundo, marca oficial e CTA. */
export const Encerramento: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const { m, duration } = useTL();
  const A = m('profissional2End') + 0.05;
  if (t < A - 0.1) return null;
  const C = m('conheca');
  const come = ramp(t, A, A + 0.55);
  const apart = ramp(t, C - 0.2, C + 0.9);
  const logoP = ramp(t, A + 0.1, A + 0.7);
  const end = interpolate(t, [duration - 0.45, duration], [0, 1], clamp);
  const band = keys(t, [[A, -0.4], [duration, 1.3]], (x) => x);
  const devs = [
    { k: 'p', clip: 'hero-dp', x: -330, y: 1380, w: 270, ry: 24 },
    { k: 't', x: 0, y: 1430, w: 640 },
    { k: 'p', clip: 'hero-dl', x: 330, y: 1380, w: 270, ry: -24 },
    { k: 'p', clip: 'hero-ap', x: 0, y: 1330, w: 250, ry: 0, front: true },
  ];
  return (
    <AbsoluteFill style={{ perspective: 1600 }}>
      {/* faixa de luz laranja passando atrás dos aparelhos */}
      <div style={{ position: 'absolute', left: -400, right: -400, top: 1060, height: 520, transform: `translateX(${band * 1080 - 540}px) rotate(-12deg)`, background: `linear-gradient(90deg, transparent, ${rgba(WT.amber, 0.35)}, ${rgba(WT.orange, 0.45)}, ${rgba(WT.amber, 0.3)}, transparent)`, filter: 'blur(30px)', opacity: come * (1 - end) }} />
      <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d' }}>
        {devs.map((d, i) => {
          const x = 540 + d.x * (1 + apart * 0.35);
          const z = (1 - come) * -900 - apart * 260 + (d.front ? 120 : 0);
          return (
            <div key={i} style={{ position: 'absolute', left: x - d.w / 2, top: d.y - (d.k === 't' ? 230 : 280), transform: `translateZ(${z}px) translateY(${Math.sin(t * 1.3 + i) * 10}px)`, transformStyle: 'preserve-3d' }}>
              {d.k === 't' ? (
                <Tablet3D width={d.w} rotX={12} style={{ opacity: come }}>
                  <Img src={staticFile('painel/05-tablet-quadro-atualizado.png')} style={{ width: '100%', height: '100%' }} />
                </Tablet3D>
              ) : (
                <Phone3D width={d.w} rotY={d.ry} reflect={false} opacity={come}>
                  <Sequence from={f(A)} layout="none">
                    <Loop durationInFrames={150} layout="none">
                      <OffthreadVideo src={staticFile(`clips/${d.clip}.mp4`)} muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    </Loop>
                  </Sequence>
                </Phone3D>
              )}
            </div>
          );
        })}
      </div>
      {/* marca oficial (flycontrol-dash/src/assets/flycontrol-logo.webp) */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 210, display: 'flex', justifyContent: 'center', opacity: logoP * (1 - end), transform: `scale(${0.7 + 0.3 * logoP})` }}>
        <div style={{ position: 'relative', width: 380, height: 380 }}>
          <div style={{ position: 'absolute', inset: -60, background: `radial-gradient(circle, ${rgba(WT.amber, 0.35)} 0%, transparent 65%)` }} />
          <Img src={staticFile('brand/flycontrol-logo.webp')} style={{ position: 'absolute', inset: 0, width: 380, height: 380, filter: `drop-shadow(0 18px 30px rgba(17,24,39,0.2)) brightness(${1 + 0.25 * interpolate(t, [C + 0.55, C + 0.7, C + 1.3], [0, 1, 0], clamp)})` }} />
        </div>
      </div>
      <div style={{ position: 'absolute', top: 610, left: 40, right: 40, textAlign: 'center', opacity: 1 - end }}>
        <W3D text="SEU DELIVERY" at={A + 0.2} size={84} />
        <div />
        <W3D text="EM OUTRO NÍVEL." at={A + 0.4} size={84} orange />
        <Sub t={t} at={A + 0.6} />
      </div>
      <Cta t={t} at={C} end={end} />
      <AbsoluteFill style={{ background: '#fff', opacity: end }} />
    </AbsoluteFill>
  );
};

const Sub: React.FC<{ t: number; at: number }> = ({ t, at }) => {
  const p = interpolate(t, [at, at + 0.4], [0, 1], { ...clamp, easing: ease });
  return (
    <div style={{ marginTop: 22, fontFamily: body, fontWeight: 600, fontSize: 33, color: WT.muted, opacity: p, transform: `translateY(${(1 - p) * 14}px)` }}>
      Mais organização. Mais praticidade.
      <br />
      Mais profissionalismo.
    </div>
  );
};

const Cta: React.FC<{ t: number; at: number; end: number }> = ({ t, at, end }) => {
  const p = interpolate(t, [at - 0.1, at + 0.3], [0, 1], { ...clamp, easing: ease });
  if (p <= 0) return null;
  const x = ((t - at) * 0.8) % 1.6;
  return (
    <div style={{ position: 'absolute', top: 905, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: p * (1 - end), transform: `scale(${(0.75 + 0.25 * p) * (1 + 0.02 * Math.sin((t - at) * 6))})` }}>
      <div style={{ position: 'relative', overflow: 'hidden', padding: '28px 58px', borderRadius: 70, background: WT.gradPrimary, boxShadow: `${WT.shadowGlow}, 0 24px 50px rgba(255,90,0,0.35)` }}>
        <span style={{ fontFamily: 'Montserrat', fontWeight: 900, fontSize: 50, color: '#fff', letterSpacing: '0.03em', textShadow: '0 2px 6px rgba(160,50,0,0.35)' }}>CONHEÇA O FLYCONTROL</span>
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(105deg, transparent ${x * 100 - 30}%, rgba(255,255,255,0.6) ${x * 100 - 15}%, transparent ${x * 100}%)` }} />
      </div>
    </div>
  );
};
