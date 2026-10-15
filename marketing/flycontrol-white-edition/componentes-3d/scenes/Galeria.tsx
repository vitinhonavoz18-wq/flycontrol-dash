import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { FPS, WT, clamp, ease, easeInOut, f, keys, ramp, rgba, useTL } from '../lib';
import { Phone3D, phoneDims, ContactShadow } from '../Devices';
import { GlassChip, L3D, W3D } from '../Type3D';
import { LightSweep } from '../Studio';
import { PW, PY, useOpen } from './Abertura';

const { h: PH } = phoneDims(PW);
const GAP = 640; // distância entre os aparelhos na "vitrine"

/**
 * Cena 5: vitrine de aparelhos num estúdio branco. A câmera passa de lado por cada cardápio REAL
 * (gravado do site no ar, com o vídeo de capa de cada loja) no ritmo das palavras da voz.
 */
export const Galeria: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const { m, CLIP0, G0 } = useOpen();
  const P0 = m('seuNegocio') - 0.25;
  if (t < G0 - 0.05 || t > P0 + 0.4) return null;
  const A = m('acai'), D = m('doce'), H = m('hamburguer'), P = m('pastel'), C = m('cada');
  const BR = H + 0.75; // câmera chega ao Brasa do João
  const camX = keys(t, [[G0, 0], [A - 0.15, 0], [A + 0.35, 1], [D - 0.1, 1], [D + 0.35, 2], [H + 0.3, 2], [BR, 3], [P - 0.15, 3], [P + 0.3, 4], [C - 0.05, 4], [C + 0.9, 2]]);
  const pull = ramp(t, C - 0.05, C + 0.9, easeInOut);
  const S = 1 - pull * 0.62;
  const exit = ramp(t, P0 - 0.1, P0 + 0.35, easeInOut);
  const phones = [
    { name: 'Açaí e Love', node: <Sequence from={f(CLIP0)} layout="none"><Vid src="al" /></Sequence> },
    { name: 'Açaí Deus Proverá', node: <Sequence from={f(G0)} layout="none"><Vid src="hero-dp" /></Sequence> },
    { name: "D'lua Doces", node: <Sequence from={f(G0)} layout="none"><Vid src="hero-dl" /></Sequence> },
    { name: 'Brasa do João', node: <Sequence from={f(G0)} layout="none"><Vid src="hero-bj" zoom={interpolate(t, [BR - 0.2, BR + 0.6, P - 0.1], [1, 1.18, 1.18], clamp)} /></Sequence> },
    {
      name: 'Alpha Pastelaria',
      node: (
        <>
          <Sequence from={f(G0)} durationInFrames={f(P + 0.25 - G0) + 1} layout="none"><Vid src="hero-ap" /></Sequence>
          <Sequence from={f(P + 0.25)} layout="none"><Nav><Vid src="ap-pasteis" /></Nav></Sequence>
        </>
      ),
    },
  ];
  return (
    <AbsoluteFill style={{ perspective: 1800, perspectiveOrigin: '50% 45%', opacity: 1 - exit }}>
      {phones.map((ph, i) => {
        const d = i - camX;
        if (Math.abs(d) * GAP * S > 1500) return null;
        const show = i === 0 ? 1 : ramp(t, G0, G0 + 0.45);
        const depthIn = i === 2 ? ramp(t, D - 0.3, D + 0.35) : 1; // D'lua entra pela profundidade
        const x = 540 + d * GAP * S;
        const y = PY - pull * 40 + exit * 400;
        const z = -Math.abs(d) * 260 * (1 - pull) - (1 - depthIn) * 1800;
        const ry = Math.max(-1.2, Math.min(1.2, d)) * -26 * (1 - pull);
        const op = show * (i === 2 ? Math.min(1, depthIn * 1.5 + (t > D + 0.4 ? 1 : 0)) : 1);
        return (
          <React.Fragment key={i}>
            <ContactShadow x={x} y={y + (PH * S) / 2 + 30 * S} w={PW * S * 1.05} o={op * 0.8} />
            <div style={{ position: 'absolute', left: x - PW / 2, top: y - PH / 2, transform: `translateZ(${z}px) scale(${S})`, transformStyle: 'preserve-3d' }}>
              <Phone3D width={PW} rotY={ry} opacity={op} glow={Math.abs(d) < 0.4 ? 0.5 : 0.15}>{ph.node}</Phone3D>
            </div>
            {pull > 0.6 && (
              <div style={{ position: 'absolute', left: x - 200, width: 400, top: y + (PH * S) / 2 + 26, textAlign: 'center', opacity: ramp(t, C + 0.6, C + 1.0) }}>
                <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 24, color: WT.ink, whiteSpace: 'nowrap' }}>{ph.name}</span>
              </div>
            )}
          </React.Fragment>
        );
      })}
      <BurgerCard t={t} at={H} />
      <LightSweep at={C + 0.3} dur={1.0} strength={0.3} />
      <Titles t={t} BR={BR} P0={P0} />
    </AbsoluteFill>
  );
};

const Vid: React.FC<{ src: string; zoom?: number }> = ({ src, zoom = 1 }) => (
  <OffthreadVideo src={staticFile(`clips/${src}.mp4`)} muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})`, transformOrigin: '50% 30%' }} />
);

/** Navegação real (Alpha): a tela da categoria entra deslizando, como no site. */
const Nav: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const t = useCurrentFrame() / FPS;
  const p = interpolate(t, [0, 0.3], [0, 1], { ...clamp, easing: ease });
  return <AbsoluteFill style={{ transform: `translateX(${(1 - p) * 100}%)`, boxShadow: '-20px 0 40px rgba(0,0,0,0.3)' }}>{children}</AbsoluteFill>;
};

/** Destaque fotográfico: o hambúrguer REAL do cardápio do Açaí Deus Proverá passa à frente da câmera. */
const BurgerCard: React.FC<{ t: number; at: number }> = ({ t, at }) => {
  if (t < at - 0.05 || t > at + 1.2) return null;
  const p = interpolate(t, [at, at + 0.3], [0, 1], { ...clamp, easing: ease });
  const q = interpolate(t, [at + 0.75, at + 1.15], [0, 1], { ...clamp, easing: easeInOut });
  const w = 560;
  return (
    <div style={{ position: 'absolute', left: 540 - w / 2 - q * 900, top: 700 - p * 40, width: w, height: w * (582 / 1080), borderRadius: 28, overflow: 'hidden', transform: `translateZ(260px) rotate(${-4 + q * -8}deg) scale(${0.6 + 0.4 * p})`, opacity: p * (1 - q * 0.6), boxShadow: `0 40px 80px rgba(17,24,39,0.3), 0 0 0 3px #fff, 0 0 40px ${rgba(WT.orange, 0.4)}` }}>
      <Img src={staticFile('ui/card-burger-dp.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  );
};

const Titles: React.FC<{ t: number; BR: number; P0: number }> = ({ t, BR, P0 }) => {
  const { m } = useTL();
  const A = m('acai'), D = m('doce'), H = m('hamburguer'), P = m('pastel'), C = m('cada');
  const items = [
    { w: 'AÇAÍ', a: A, b: D, chip: 'Açaí Deus Proverá' },
    { w: 'DOCE', a: D, b: H, chip: "D'lua Doces" },
    { w: 'HAMBÚRGUER', a: H, b: BR - 0.05, chip: 'Açaí Deus Proverá' },
    { w: 'BRASA DO JOÃO', a: BR, b: P, chip: 'vídeo de capa · Brasa do João', small: true },
    { w: 'PASTEL', a: P, b: C, chip: 'Alpha Pastelaria' },
  ];
  return (
    <AbsoluteFill>
      {items.map((it) => (
        <div key={it.w} style={{ position: 'absolute', top: 262, left: 0, right: 0, textAlign: 'center' }}>
          <W3D text={it.w} at={it.a} out={it.b - 0.1} size={it.small ? 84 : it.w.length > 6 ? 100 : 124} orange={!it.small} from="slam" />
          <div style={{ marginTop: 16 }}>
            <GlassChip t={t} a={it.a + 0.05} b={it.b} dot>{it.chip}</GlassChip>
          </div>
        </div>
      ))}
      <div style={{ position: 'absolute', top: 262, left: 40, right: 40, textAlign: 'center' }}>
        <L3D size={70} out={P0 - 0.2} words={[{ text: 'CADA', at: C }, { text: 'NEGÓCIO,', at: m('cada') + 0.27 }]} />
        <div style={{ height: 10 }} />
        <L3D size={70} out={P0 - 0.2} words={[{ text: 'SEU PRÓPRIO', at: m('proprio') - 0.3 }, { text: 'CARDÁPIO', at: m('cardapio'), orange: true }]} />
      </div>
    </AbsoluteFill>
  );
};
