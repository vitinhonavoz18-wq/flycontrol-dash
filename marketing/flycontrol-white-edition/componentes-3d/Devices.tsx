import React from 'react';
import { Img, staticFile } from 'remotion';
import { WT, rgba } from './lib';

/** Proporção das capturas reais dos cardápios (1170x2532). */
export const PHONE_RATIO = 2532 / 1170;
export const phoneDims = (w: number) => {
  const bezel = Math.round(w * 0.03);
  const sw = w - bezel * 2;
  const sh = Math.round(sw * PHONE_RATIO);
  return { bezel, sw, sh, h: sh + bezel * 2 };
};

/**
 * Floating Device: smartphone branco (ou grafite) com frente e verso — pode girar 180°/360° de verdade.
 * Reflexo no piso por -webkit-box-reflect (sem duplicar o vídeo).
 */
export const Phone3D: React.FC<{
  width: number;
  children?: React.ReactNode;
  rotY?: number;
  rotX?: number;
  rotZ?: number;
  graphite?: boolean;
  glow?: number;
  reflect?: boolean;
  opacity?: number;
  style?: React.CSSProperties;
}> = ({ width, children, rotY = 0, rotX = 0, rotZ = 0, graphite = false, glow = 0.35, reflect = true, opacity = 1, style }) => {
  const { bezel, sw, sh, h } = phoneDims(width);
  const r = width * 0.14;
  const body = graphite
    ? 'linear-gradient(145deg,#4b4f57 0%,#25272c 40%,#1a1b1f 70%,#3b3e45 100%)'
    : 'linear-gradient(145deg,#ffffff 0%,#eceef1 38%,#d9dce1 62%,#f7f8fa 100%)';
  // opacidade vai em cada face: opacidade no pai achata o 3D e o verso apareceria por cima
  const face: React.CSSProperties = { position: 'absolute', inset: 0, borderRadius: r, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', opacity };
  return (
    <div style={{ width, height: h, position: 'relative', transformStyle: 'preserve-3d', transform: `rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)`, ...style }}>
      {/* frente */}
      <div
        style={{
          ...face, padding: bezel, background: body,
          boxShadow: [`0 0 0 1px ${graphite ? 'rgba(255,255,255,0.1)' : 'rgba(17,24,39,0.08)'} inset`, `0 ${width * 0.08}px ${width * 0.16}px rgba(17,24,39,0.22)`, `0 ${width * 0.02}px ${width * 0.04}px rgba(17,24,39,0.12)`, `0 0 ${width * 0.22}px ${rgba(WT.orange, glow * 0.5)}`].join(','),
          WebkitBoxReflect: reflect ? 'below 18px linear-gradient(transparent 76%, rgba(255,255,255,0.28))' : undefined,
        } as React.CSSProperties}
      >
        <div style={{ width: sw, height: sh, borderRadius: r - bezel, overflow: 'hidden', position: 'relative', background: '#000', boxShadow: '0 0 0 4px #0b0c0e' }}>
          {children}
          <div style={{ position: 'absolute', top: sh * 0.012, left: '50%', width: sw * 0.28, height: sw * 0.075, marginLeft: -sw * 0.14, borderRadius: sw, background: '#0b0c0e' }} />
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(118deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 26%, rgba(255,255,255,0) 72%, rgba(255,255,255,0.08) 100%)' }} />
        </div>
      </div>
      {/* verso: branco, câmera e a marca */}
      <div style={{ ...face, transform: 'rotateY(180deg)', background: body, boxShadow: `0 ${width * 0.08}px ${width * 0.16}px rgba(17,24,39,0.22), 0 0 0 1px rgba(17,24,39,0.08) inset` }}>
        <div style={{ position: 'absolute', left: width * 0.08, top: width * 0.08, width: width * 0.36, height: width * 0.36, borderRadius: width * 0.1, background: graphite ? '#1b1c20' : 'linear-gradient(145deg,#e9ebee,#cfd3d9)', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.15)' }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ position: 'absolute', left: [0.12, 0.55, 0.12][i] * width * 0.36, top: [0.12, 0.33, 0.55][i] * width * 0.36, width: width * 0.13, height: width * 0.13, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #4b5563, #0b0c0e 70%)', boxShadow: '0 0 0 3px rgba(255,255,255,0.6)' }} />
          ))}
        </div>
        <Img src={staticFile('brand/flycontrol-logo.webp')} style={{ position: 'absolute', left: width * 0.2, top: h * 0.42, width: width * 0.6 }} />
      </div>
    </div>
  );
};

/** Tablet grafite (iPad na horizontal), tela 2360x1640 como a captura real do painel. */
export const TABLET_RATIO = 1640 / 2360;
export const Tablet3D: React.FC<{ width: number; children?: React.ReactNode; rotY?: number; rotX?: number; style?: React.CSSProperties }> = ({ width, children, rotY = 0, rotX = 0, style }) => {
  const bezel = Math.round(width * 0.028);
  const sw = width - bezel * 2;
  const sh = Math.round(sw * TABLET_RATIO);
  return (
    <div
      style={{
        width, height: sh + bezel * 2, borderRadius: width * 0.045, padding: bezel, position: 'relative',
        background: 'linear-gradient(145deg,#3a3d44 0%,#1c1d21 45%,#111215 70%,#2e3137 100%)',
        boxShadow: `0 0 0 1px rgba(255,255,255,0.08) inset, 0 ${width * 0.06}px ${width * 0.12}px rgba(17,24,39,0.28), 0 0 ${width * 0.12}px ${rgba(WT.orange, 0.18)}`,
        transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)`, transformStyle: 'preserve-3d',
        WebkitBoxReflect: 'below 16px linear-gradient(transparent 80%, rgba(255,255,255,0.22))',
        ...style,
      } as React.CSSProperties}
    >
      <div style={{ width: sw, height: sh, borderRadius: width * 0.018, overflow: 'hidden', position: 'relative', background: '#fff' }}>
        {children}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(118deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 30%)' }} />
      </div>
      <div style={{ position: 'absolute', top: bezel * 0.35, left: '50%', width: 8, height: 8, marginLeft: -4, borderRadius: 4, background: '#0b0c0e' }} />
    </div>
  );
};

/** Sombra de contato no piso. */
export const ContactShadow: React.FC<{ x: number; y: number; w: number; o?: number }> = ({ x, y, w, o = 1 }) => (
  <div style={{ position: 'absolute', left: x - w / 2, top: y - w * 0.06, width: w, height: w * 0.12, borderRadius: '50%', background: 'radial-gradient(ellipse at center, rgba(17,24,39,0.28) 0%, rgba(17,24,39,0) 70%)', opacity: o, filter: 'blur(6px)' }} />
);
