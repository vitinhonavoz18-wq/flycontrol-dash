import React from 'react';
import { AbsoluteFill, Img, Loop, OffthreadVideo, Sequence, interpolate, staticFile } from 'remotion';
import { WT, clamp, ease, easeInOut, f, rgba } from '../lib';
import { ContactShadow, Phone3D, phoneDims } from '../Devices';
import { GlassChip, W3D } from '../Type3D';
import { LightSweep } from '../Studio';
import { useCena } from '../Money';

const Vid: React.FC<{ src: string }> = ({ src }) => (
  <Loop durationInFrames={150} layout="none">
    <OffthreadVideo src={staticFile(`clips/${src}.mp4`)} muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
  </Loop>
);

// Capturas reais do fluxo no Açaí Deus Proverá (1170x2532). Coordenadas medidas nas próprias imagens.
const SW = 1170, SH = 2532;
const REGIOES_F5 = [
  { y0: 1900, y1: 1955, x0: 775, x1: 1038 }, // Nutella
  { y0: 1978, y1: 2034, x0: 513, x1: 907 }, // Calda de Morango
  { y0: 2134, y1: 2189, x0: 395, x1: 661 }, // Paçoca
];
const CAB_F5 = { y0: 1747, y1: 1800, x0: 311, x1: 381 }; // "ADICIONAIS (3)"
const TOQUES: { at: number; x: number; y: number }[] = [
  { at: 3.75, x: 205, y: 1772 }, // "+ ADICIONAIS" do Açaí 500 ml
  { at: 4.35, x: 906, y: 1927 }, // Nutella
  { at: 4.6, x: 710, y: 2006 }, // Calda de Morango
  { at: 4.85, x: 528, y: 2161 }, // Paçoca
  { at: 5.45, x: 583, y: 2348 }, // ADICIONAR
  { at: 6.35, x: 930, y: 2390 }, // carrinho "1 item R$ 18,00"
];

/** Tela do celular central: vídeo de capa → rolagem até os produtos → adicionais → carrinho → resumo. */
const Fluxo: React.FC<{ L: number; sw: number; sh: number }> = ({ L, sw, sh }) => {
  const sc = sw / SW;
  const scroll = interpolate(L, [3.05, 3.4], [0, 1], { ...clamp, easing: easeInOut });
  const show = (a: number) => interpolate(L, [a, a + 0.12], [0, 1], clamp);
  const img = (n: string, o: number, extra?: React.CSSProperties) =>
    o > 0 ? <Img src={staticFile(`stills/${n}.jpg`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: o, ...extra }} /> : null;
  const reg = (r: { y0: number; y1: number; x0: number; x1: number }, o: number, key: number) =>
    o > 0 ? (
      <div key={key} style={{ position: 'absolute', inset: 0, opacity: o, clipPath: `inset(${r.y0 * sc}px ${(SW - r.x1) * sc}px ${(SH - r.y1) * sc}px ${r.x0 * sc}px)` }}>
        <Img src={staticFile('stills/f5-x3.jpg')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      </div>
    ) : null;
  const f7 = interpolate(L, [6.5, 6.8], [0, 1], { ...clamp, easing: ease });
  return (
    <>
      {/* rolagem: capa sobe, lista de produtos entra */}
      {scroll < 1 && (
        <div style={{ position: 'absolute', inset: 0, transform: `translateY(${-scroll * sh}px)` }}>
          <Vid src="hero-dp" />
        </div>
      )}
      {scroll > 0 && (
        <div style={{ position: 'absolute', inset: 0, transform: `translateY(${(1 - scroll) * sh}px)` }}>
          {img('f1-card', 1)}
          {img('f2-extras', show(3.85))}
          {REGIOES_F5.map((r, i) => reg(r, show(TOQUES[i + 1].at + 0.05), i))}
          {reg(CAB_F5, show(TOQUES[3].at + 0.05), 9)}
          {img('f6-added', show(5.55))}
          {img('f7-cart', f7, { transform: `translateY(${(1 - f7) * 60}px)` })}
        </div>
      )}
      {/* toques: anel laranja onde o dedo encosta */}
      {TOQUES.map((q, i) => {
        const p = interpolate(L, [q.at - 0.08, q.at + 0.35], [0, 1], clamp);
        if (p <= 0 || p >= 1) return null;
        const r = 18 + p * 46;
        return (
          <React.Fragment key={i}>
            <div style={{ position: 'absolute', left: q.x * sc - r, top: q.y * sc - r, width: r * 2, height: r * 2, borderRadius: '50%', border: `3px solid ${rgba(WT.orange, 1 - p)}`, boxShadow: `0 0 18px ${rgba(WT.orange, 0.6 * (1 - p))}` }} />
            <div style={{ position: 'absolute', left: q.x * sc - 16, top: q.y * sc - 16, width: 32, height: 32, borderRadius: '50%', background: rgba('#ffffff', 0.75 * (1 - p)), boxShadow: `0 0 0 2px ${rgba(WT.orange, 0.8 * (1 - p))}` }} />
          </React.Fragment>
        );
      })}
    </>
  );
};

/** CENA 7 — cardápios reais com a identidade de cada loja, e o fluxo de pedido de verdade. */
export const Cena7: React.FC = () => {
  const c = useCena('s7');
  if (!c || !c.ativa) return null;
  const { L, t } = c;
  const k = c.nom / (c.b - c.a);
  const T = (x: number) => c.a + x / k;
  const inn = interpolate(L, [0, 0.7], [0, 1], { ...clamp, easing: ease });
  const focus = interpolate(L, [2.9, 3.5], [0, 1], { ...clamp, easing: easeInOut });
  const out = interpolate(L, [c.nom - 0.45, c.nom + 0.05], [0, 1], { ...clamp, easing: easeInOut });
  const lojas = [
    { clip: 'hero-ap', x: 40, w: 290, ry: 32, z: -520, d: 0.2 },
    { clip: 'hero-dl', x: 1040, w: 290, ry: -32, z: -520, d: 0.25 },
    { clip: 'hero-al', x: 250, w: 340, ry: 22, z: -220, d: 0.1 },
    { clip: 'hero-bj', x: 830, w: 340, ry: -22, z: -220, d: 0.15 },
  ];
  const CW = 400 + focus * 120;
  const { sw, sh, h: CH } = phoneDims(CW);
  const cy = 880 + focus * 36;
  return (
    <AbsoluteFill style={{ opacity: 1 - out, perspective: 1800, perspectiveOrigin: '50% 45%' }}>
      {lojas.map((l, i) => {
        const p = interpolate(L, [l.d, l.d + 0.7], [0, 1], { ...clamp, easing: ease });
        const { h } = phoneDims(l.w);
        const x = 540 + (l.x - 540) * (1 + focus * 0.9);
        return (
          <div key={i} style={{ position: 'absolute', left: x - l.w / 2, top: cy - h / 2 + (1 - p) * 300, transform: `translateZ(${l.z - focus * 300}px) translateY(${Math.sin(t * 1.2 + i) * 8}px)`, transformStyle: 'preserve-3d' }}>
            <Phone3D width={l.w} rotY={l.ry * (1 + focus * 0.3)} opacity={p * (1 - focus)} glow={0.15} reflect={false}>
              <Sequence from={f(c.a - 0.6)} layout="none"><Vid src={l.clip} /></Sequence>
            </Phone3D>
          </div>
        );
      })}
      <ContactShadow x={540} y={cy + CH / 2 + 26} w={CW} o={inn * 0.8} />
      <div style={{ position: 'absolute', left: 540 - CW / 2, top: cy - CH / 2 + (1 - inn) * 260, transform: `translateY(${Math.sin(t * 1.3) * 6 * (1 - focus)}px)`, transformStyle: 'preserve-3d' }}>
        <Phone3D width={CW} rotY={(1 - inn) * -30} opacity={inn} glow={0.45} reflect={false}>
          <Sequence from={f(c.a - 0.6)} layout="none">
            <Fluxo L={L} sw={sw} sh={sh} />
          </Sequence>
        </Phone3D>
      </div>
      <LightSweep at={T(0.15)} dur={0.9 / k} strength={0.25} />
      <div style={{ position: 'absolute', top: 262, left: 30, right: 30, textAlign: 'center' }}>
        <W3D text="UM CARDÁPIO" at={T(0.2)} size={70} out={T(2.95)} />
        <div />
        <W3D text="COM A SUA CARA" at={T(0.4)} size={70} orange out={T(2.95)} />
      </div>
      <div style={{ position: 'absolute', top: 250, left: 30, right: 30, textAlign: 'center' }}>
        <W3D text="O CLIENTE ESCOLHE," at={T(3.2)} size={54} out={T(c.nom - 0.5)} />
        <div />
        <W3D text="PERSONALIZA E PEDE." at={T(3.4)} size={54} orange out={T(c.nom - 0.5)} />
      </div>
      {/* recursos (parte 1) */}
      <div style={{ position: 'absolute', top: 1360, left: 30, right: 30, display: 'flex', justifyContent: 'center', gap: 18 }}>
        <GlassChip t={L} a={0.6} b={2.95} dot size={26}>Identidade visual própria</GlassChip>
        <GlassChip t={L} a={1.4} b={2.95} dot size={26}>Logotipo e vídeo de capa</GlassChip>
      </div>
      <div style={{ position: 'absolute', top: 1436, left: 30, right: 30, display: 'flex', justifyContent: 'center' }}>
        <GlassChip t={L} a={2.2} b={2.95} dot size={26}>Produtos e fotos reais</GlassChip>
      </div>
      {/* fluxo (parte 2) */}
      <div style={{ position: 'absolute', top: 1478, left: 30, right: 30, display: 'flex', justifyContent: 'center' }}>
        <GlassChip t={L} a={4.0} b={5.55} dot size={28}>Adicionais e personalização</GlassChip>
        <GlassChip t={L} a={5.65} b={6.5} dot size={28}>Carrinho</GlassChip>
        <GlassChip t={L} a={6.6} b={c.nom - 0.3} dot size={28}>Resumo do pedido</GlassChip>
      </div>
    </AbsoluteFill>
  );
};
