import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, FPS, clamp, ease, ramp } from '../lib';
import tl from '../timeline-short.json';
import { Phone, hexA, screenSize } from '../components/Phone';
import { KWord } from '../components/Kinetic';
import { body, display } from '../fonts';
import taps from './taps.json';

const M = tl.markers as Record<string, number>;
export const G_START = M.seuNegocio - 0.15;
export const G_END = M.conheca - 0.2;
const PW = 560;
const { sw, sh, bezel } = screenSize(PW);
const k = sw / 390;
const PX = 610; // centro do celular
const PY = 1060;

/**
 * Take da GESTÃO DE PEDIDOS: telas ORIGINAIS do painel FlyControl (flycontrol-dash rodando aqui,
 * com pedidos de demonstração). Toques nos botões reais: Ver detalhes → Em preparo (FlyStatus avisa
 * o cliente) → Minha Loja › Aparência (troca o visual) → Capa (Hero) com o vídeo de capa.
 */
const D = G_END - G_START;
const at = (r: number) => G_START + r * D;
const STEPS = [
  { at: at(0), img: 'k0' },
  { at: at(0.2), img: 'd1' },
  { at: at(0.37), img: 'd2' },
  { at: at(0.58), img: 's1' },
  { at: at(0.68), img: 's2' },
  { at: at(0.83), img: 'h1' },
];
const TAPS = [
  { at: at(0.17), xy: taps.verDetalhes },
  { at: at(0.34), xy: taps.emPreparo },
  { at: at(0.65), xy: taps.white },
];
const WORDS = [
  { text: 'GESTÃO DE PEDIDOS', a: at(0), b: at(0.34), color: '#fff' },
  { text: 'MUDE O STATUS', a: at(0.34), b: at(0.58), color: C.gold },
  { text: 'PERSONALIZE O DESIGN', a: at(0.58), b: G_END, color: C.ember },
];

export const Gestao: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  if (t < G_START - 0.3 || t > G_END + 0.35) return null;
  const enter = ramp(t, G_START - 0.25, G_START + 0.35);
  const exit = interpolate(t, [G_END - 0.05, G_END + 0.3], [0, 1], { ...clamp, easing: ease });
  const cur = [...STEPS].reverse().find((s) => t >= s.at) ?? STEPS[0];
  const deskP = interpolate(t, [G_START - 0.2, G_START + 0.4, at(0.55), at(0.7)], [0, 1, 1, 0.35], clamp);
  return (
    <AbsoluteFill style={{ perspective: 1700, opacity: 1 - exit }}>
      {/* painel no computador: a mesma gestão em tela grande */}
      <div
        style={{
          position: 'absolute', left: 40, top: 330, width: 900, height: 563, borderRadius: 18, overflow: 'hidden',
          transform: `rotateY(${18 - enter * 4}deg) rotateX(4deg) translateX(${(1 - enter) * -300}px) translateZ(-120px)`,
          opacity: deskP, border: '6px solid #1d1f24', boxShadow: `0 40px 80px rgba(0,0,0,0.7), 0 0 60px ${hexA(C.fire, 0.25)}`,
        }}
      >
        <Img src={staticFile('fc/desk.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top left' }} />
      </div>
      {/* celular com o painel mobile */}
      <div
        style={{
          position: 'absolute', left: PX - PW / 2, top: PY - (sh + bezel * 2) / 2 + (1 - enter) * 500,
          transform: `rotateY(${-10 + Math.sin(t) * 2}deg) rotateX(${(1 - enter) * 20}deg) scale(${1 - exit * 0.3})`, opacity: enter,
        }}
      >
        <Phone width={PW} glow={C.fire} glowStrength={0.7}>
          {STEPS.map((s, i) => {
            const p = interpolate(t, [s.at, s.at + 0.16], [0, 1], { ...clamp, easing: ease });
            const shown = cur === s || (STEPS[i + 1] && t >= s.at && t < STEPS[i + 1].at + 0.16);
            if (!shown) return null;
            const slide = s.img === 'd1' ? `translateX(${(1 - p) * 100}%)` : s.img === 'd2' ? `translateY(${(1 - p) * 40}%)` : '';
            return <Img key={s.img} src={staticFile(`fc/${s.img}.jpg`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: i === 0 ? 1 : p, transform: slide }} />;
          })}
          {TAPS.map((tp, i) => (
            <Tap key={i} t={t} at={tp.at} x={tp.xy[0] * k} y={tp.xy[1] * k} />
          ))}
        </Phone>
      </div>
      {WORDS.map((w) => (
        <div key={w.text} style={{ position: 'absolute', top: 110, left: 30, right: 30, textAlign: 'center' }}>
          <KWord text={w.text} at={w.a} out={w.b - 0.12} size={w.text.length > 16 ? 70 : 82} from="slam" color={w.color} glow={C.fire} depthColor="#3a1400" />
        </div>
      ))}
      <Chip t={t} a={G_START + 0.3} b={G_END} />
    </AbsoluteFill>
  );
};

const Chip: React.FC<{ t: number; a: number; b: number }> = ({ t, a, b }) => {
  const p = interpolate(t, [a, a + 0.3, b - 0.1, b], [0, 1, 1, 0], clamp);
  if (p <= 0) return null;
  return (
    <div style={{ position: 'absolute', top: 232, left: 0, right: 0, textAlign: 'center', opacity: p }}>
      <span style={{ fontFamily: body, fontWeight: 600, fontSize: 28, color: '#fff', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', padding: '8px 20px', borderRadius: 30 }}>
        painel FlyControl · no celular e no computador
      </span>
    </div>
  );
};

const Tap: React.FC<{ t: number; at: number; x: number; y: number }> = ({ t, at, x, y }) => {
  if (t < at - 0.2 || t > at + 0.5) return null;
  const pre = interpolate(t, [at - 0.2, at], [0, 1], clamp);
  const r = interpolate(t, [at, at + 0.45], [0, 1], { ...clamp, easing: ease });
  return (
    <>
      <div style={{ position: 'absolute', left: x - 30, top: y - 30, width: 60, height: 60, borderRadius: 30, background: 'rgba(255,255,255,0.35)', border: '3px solid rgba(255,255,255,0.9)', opacity: pre * (1 - r) }} />
      <div style={{ position: 'absolute', left: x - 55, top: y - 55, width: 110, height: 110, borderRadius: 55, border: `4px solid ${C.gold}`, opacity: (1 - r) * (t >= at ? 1 : 0), transform: `scale(${0.3 + r})` }} />
    </>
  );
};

export { display };
