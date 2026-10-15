import React from 'react';
import { AbsoluteFill, Img, Loop, OffthreadVideo, Sequence, interpolate, staticFile } from 'remotion';
import { WT, clamp, ease, f, rgba } from '../lib';
import { Phone3D, Tablet3D } from '../Devices';
import { W3D } from '../Type3D';
import { Rodape, useCena } from '../Money';
import { body, display } from '../fonts';

/** CENA 8 — aparelhos ao redor da marca, onda laranja, frase final, CTA e assinatura sonora. */
export const Cena8: React.FC = () => {
  const c = useCena('s8');
  if (!c || !c.ativa) return null;
  const { L, t } = c;
  const k = c.nom / (c.b - c.a);
  const T = (x: number) => c.a + x / k;
  const come = interpolate(L, [0, 0.7], [0, 1], { ...clamp, easing: ease });
  const logoP = interpolate(L, [0.1, 0.7], [0, 1], { ...clamp, easing: ease });
  const end = interpolate(L, [c.nom - 0.5, c.nom], [0, 1], clamp);
  const band = interpolate(L, [0, c.nom], [-0.4, 1.3]);
  const sig = interpolate(L, [3.0, 3.15, 3.8], [0, 1, 0], clamp);
  const devs = [
    { k: 't', x: 0, y: 1250, w: 680 },
    { k: 'p', clip: 'hero-dp', x: -385, y: 1250, w: 240, ry: 22, front: true },
    { k: 'p', clip: 'hero-bj', x: 385, y: 1250, w: 240, ry: -22, front: true },
  ];
  return (
    <AbsoluteFill style={{ perspective: 1600 }}>
      {/* onda laranja atrás dos aparelhos */}
      <div style={{ position: 'absolute', left: -400, right: -400, top: 960, height: 560, transform: `translateX(${band * 1080 - 540}px) rotate(-12deg)`, background: `linear-gradient(90deg, transparent, ${rgba(WT.amber, 0.35)}, ${rgba(WT.orange, 0.45)}, ${rgba(WT.amber, 0.3)}, transparent)`, filter: 'blur(30px)', opacity: come * (1 - end) }} />
      <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d' }}>
        {devs.map((d, i) => {
          const x = 540 + d.x;
          const z = (1 - come) * -900 + (d.front ? 90 : 0);
          return (
            <div key={i} style={{ position: 'absolute', left: x - d.w / 2, top: d.y - (d.k === 't' ? 235 : 255), transform: `translateZ(${z}px) translateY(${Math.sin(t * 1.3 + i) * 10}px)`, transformStyle: 'preserve-3d' }}>
              {d.k === 't' ? (
                <Tablet3D width={d.w} rotX={12} style={{ opacity: come }}>
                  <Img src={staticFile('painel/05-tablet-quadro-atualizado.png')} style={{ width: '100%', height: '100%' }} />
                </Tablet3D>
              ) : (
                <Phone3D width={d.w} rotY={d.ry} reflect={false} opacity={come}>
                  <Sequence from={f(c.a - 0.6)} layout="none">
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
      {/* marca oficial */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 170, display: 'flex', justifyContent: 'center', opacity: logoP * (1 - end), transform: `scale(${0.7 + 0.3 * logoP})` }}>
        <div style={{ position: 'relative', width: 360, height: 360 }}>
          <div style={{ position: 'absolute', inset: -60, background: `radial-gradient(circle, ${rgba(WT.amber, 0.35)} 0%, transparent 65%)` }} />
          <Img src={staticFile('brand/flycontrol-logo.webp')} style={{ position: 'absolute', inset: 0, width: 360, height: 360, filter: `drop-shadow(0 18px 30px rgba(17,24,39,0.2)) brightness(${1 + 0.25 * sig})` }} />
        </div>
      </div>
      <div style={{ position: 'absolute', top: 500, left: 30, right: 30, textAlign: 'center', opacity: 1 - end }}>
        <W3D text="MAIS CONTROLE" at={T(0.8)} size={76} />
        <div />
        <W3D text="SOBRE SUAS VENDAS." at={T(0.95)} size={76} orange />
        <Sub L={L} at={1.6} />
      </div>
      <Cta L={L} at={2.4} end={end} />
      <Rodape L={L} a={0.6} b={c.nom - 0.5} top={1545}>
        iFood e 99Food são marcas de seus titulares, citadas só para comparação de taxas públicas. Sem parceria ou vínculo com o FlyControl.
      </Rodape>
      <AbsoluteFill style={{ background: '#fff', opacity: end }} />
    </AbsoluteFill>
  );
};

const Sub: React.FC<{ L: number; at: number }> = ({ L, at }) => {
  const p = interpolate(L, [at, at + 0.4], [0, 1], { ...clamp, easing: ease });
  return (
    <div style={{ marginTop: 18, fontFamily: body, fontWeight: 600, fontSize: 36, color: WT.muted, opacity: p, transform: `translateY(${(1 - p) * 14}px)` }}>
      Seu cardápio. Sua marca. Seus pedidos.
    </div>
  );
};

const Cta: React.FC<{ L: number; at: number; end: number }> = ({ L, at, end }) => {
  const p = interpolate(L, [at - 0.1, at + 0.3], [0, 1], { ...clamp, easing: ease });
  if (p <= 0) return null;
  const x = ((L - at) * 0.8) % 1.6;
  return (
    <div style={{ position: 'absolute', top: 790, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: p * (1 - end), transform: `scale(${(0.75 + 0.25 * p) * (1 + 0.02 * Math.sin((L - at) * 6))})` }}>
      <div style={{ position: 'relative', overflow: 'hidden', padding: '26px 56px', borderRadius: 70, background: WT.gradPrimary, boxShadow: `${WT.shadowGlow}, 0 24px 50px rgba(255,90,0,0.35)` }}>
        <span style={{ fontFamily: display, fontWeight: 900, fontSize: 50, color: '#fff', letterSpacing: '0.03em', textShadow: '0 2px 6px rgba(160,50,0,0.35)' }}>CONHEÇA O FLYCONTROL</span>
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(105deg, transparent ${x * 100 - 30}%, rgba(255,255,255,0.6) ${x * 100 - 15}%, transparent ${x * 100}%)` }} />
      </div>
    </div>
  );
};
