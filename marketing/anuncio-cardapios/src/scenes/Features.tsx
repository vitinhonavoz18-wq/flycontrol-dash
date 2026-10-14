import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, FPS, M, clamp, ease, ramp } from '../lib';
import { Phone, hexA, screenSize } from '../components/Phone';
import { Still } from '../components/Screen';
import { KWord } from '../components/Kinetic';
import { body, display } from '../fonts';

const PW = 640;
const { sw, sh, bezel } = screenSize(PW);
const CY = 990;
const k = sw / 390; // escala: posições medidas na tela real (390x844)
export const FEAT_START = 41.0;
export const FEAT_END = 48.9;

// Telas REAIS capturadas no fluxo do Açaí Deus Proverá (nenhum pedido enviado).
const STEPS = [
  { at: FEAT_START, still: 'f1-card' },
  { at: M.personalize, still: 'f2-extras' },
  { at: 42.62, still: 'f3-x1' },
  { at: 42.86, still: 'f4-x2' },
  { at: 43.06, still: 'f5-x3' },
  { at: 43.45, still: 'f6-added' },
];
// Toques: posições medidas com o navegador nos botões reais (capture/boxes.mjs)
const TAPS = [
  { at: M.escolha, x: 195, y: 330 },
  { at: M.personalize - 0.12, x: 195, y: 592 },
  { at: 42.62 - 0.05, x: 296, y: 642 },
  { at: 42.86 - 0.05, x: 231, y: 668 },
  { at: 43.06 - 0.05, x: 170, y: 720 },
  { at: 43.32, x: 195, y: 785 },
  { at: 44.38, x: 302, y: 797 },
];
const CART = M.confira;
const CART_SCROLL = 46.55;

/** Cena 6: escolha → personalize → adicione ao carrinho → confira o pedido. */
export const Features: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  if (t < FEAT_START - 0.4 || t > FEAT_END + 0.4) return null;
  const enter = ramp(t, FEAT_START - 0.35, FEAT_START + 0.3);
  const exit = interpolate(t, [FEAT_END - 0.1, FEAT_END + 0.35], [0, 1], { ...clamp, easing: ease });
  const cur = [...STEPS].reverse().find((s) => t >= s.at) ?? STEPS[0];
  // aproximação da câmera na área do card durante a personalização
  const zoom = interpolate(t, [M.personalize - 0.2, M.personalize + 0.3, 43.5, 44.2], [1, 1.16, 1.16, 1], { ...clamp, easing: ease });
  const drawer = interpolate(t, [CART, CART + 0.5], [0, 1], { ...clamp, easing: ease });
  const scroll = interpolate(t, [CART_SCROLL, CART_SCROLL + 0.6], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ perspective: 1600, opacity: 1 - exit }}>
      <div
        style={{
          position: 'absolute', left: 540 - PW / 2, top: CY - (sh + bezel * 2) / 2 + (1 - enter) * 500,
          transform: `rotateY(${(1 - enter) * -25 + Math.sin(t * 0.9) * 2}deg) rotateX(${(1 - enter) * 15}deg) scale(${1 - exit * 0.3})`,
          opacity: enter,
        }}
      >
        <Phone width={PW} glow="#f5b301" glowStrength={0.6}>
          <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: `50% ${(640 / 844) * 100}%` }}>
            {STEPS.map((s) => (
              <Still key={s.still} name={s.still} style={{ opacity: s === cur ? 1 : 0 }} />
            ))}
            {TAPS.map((tp, i) => (
              <Tap key={i} t={t} at={tp.at} x={tp.x * k} y={tp.y * k} />
            ))}
          </div>
          {/* carrinho real abrindo (painel desliza da direita, como no site) */}
          {drawer > 0 && (
            <>
              <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${0.6 * drawer})` }} />
              <div style={{ position: 'absolute', inset: 0, transform: `translateX(${(1 - drawer) * 100}%)`, overflow: 'hidden' }}>
                <Still name="f7-cart" style={{ opacity: 1 - scroll }} />
                <Still name="f8-cart-bottom" style={{ opacity: scroll, transform: `translateY(${(1 - scroll) * 12}%)` }} />
              </div>
            </>
          )}
        </Phone>
      </div>
      <Pin t={t} at={CART + 0.6} out={CART_SCROLL - 0.1} text="Resumo do pedido" x={540 - sw / 2 + 120 * k} y={CY - sh / 2 + 112 * k} />
      <Pin t={t} at={CART + 1.1} out={CART_SCROLL - 0.1} text="Entrega ou retirada" x={540 - sw / 2 + 120 * k} y={CY - sh / 2 + 232 * k} />
      <Pin t={t} at={CART_SCROLL + 0.7} out={FEAT_END} text="Total na hora" x={540 - sw / 2 + 120 * k} y={CY - sh / 2 + 765 * k} />
      <div style={{ position: 'absolute', top: 120, left: 0, right: 0, textAlign: 'center' }}>
        <KWord text="ESCOLHA." at={M.escolha} out={M.personalize - 0.15} size={120} from="slam" color="#fff" glow={C.gold} depthColor="#3a2a00" />
      </div>
      <div style={{ position: 'absolute', top: 120, left: 0, right: 0, textAlign: 'center' }}>
        <KWord text="PERSONALIZE." at={M.personalize} out={M.confira - 0.15} size={104} from="slam" color={C.gold} glow={C.fire} depthColor="#3a2a00" />
      </div>
      <div style={{ position: 'absolute', top: 120, left: 0, right: 0, textAlign: 'center' }}>
        <KWord text="FINALIZE." at={M.confira} out={FEAT_END - 0.3} size={120} from="slam" color={C.ember} glow={C.fire} depthColor="#4a1200" />
      </div>
    </AbsoluteFill>
  );
};

const Tap: React.FC<{ t: number; at: number; x: number; y: number }> = ({ t, at, x, y }) => {
  if (t < at - 0.25 || t > at + 0.6) return null;
  const pre = interpolate(t, [at - 0.25, at], [0, 1], clamp);
  const r = interpolate(t, [at, at + 0.5], [0, 1], { ...clamp, easing: ease });
  return (
    <>
      <div style={{ position: 'absolute', left: x - 34, top: y - 34, width: 68, height: 68, borderRadius: 34, background: 'rgba(255,255,255,0.35)', border: '3px solid rgba(255,255,255,0.9)', opacity: pre * (1 - r), transform: `scale(${1.3 - pre * 0.3 - r * 0.2})`, boxShadow: '0 4px 14px rgba(0,0,0,0.4)' }} />
      <div style={{ position: 'absolute', left: x - 60, top: y - 60, width: 120, height: 120, borderRadius: 60, border: `4px solid ${C.gold}`, opacity: (1 - r) * (t >= at ? 1 : 0), transform: `scale(${0.3 + r})` }} />
    </>
  );
};

const Pin: React.FC<{ t: number; at: number; out: number; text: string; x: number; y: number }> = ({ t, at, out, text, x, y }) => {
  const p = interpolate(t, [at, at + 0.3, out - 0.2, out], [0, 1, 1, 0], clamp);
  if (p <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: x - 330, top: y - 26, display: 'flex', alignItems: 'center', opacity: p, transform: `translateX(${(1 - p) * -30}px)` }}>
      <div style={{ fontFamily: display, fontWeight: 800, fontSize: 26, color: '#111', background: C.gold, padding: '10px 18px', borderRadius: 30, boxShadow: `0 0 24px ${hexA(C.fire, 0.6)}` }}>
        {text}
      </div>
      <div style={{ width: 60 * p, height: 3, background: C.gold }} />
      <div style={{ width: 14, height: 14, borderRadius: 7, background: C.gold, boxShadow: `0 0 12px ${C.gold}` }} />
    </div>
  );
};
