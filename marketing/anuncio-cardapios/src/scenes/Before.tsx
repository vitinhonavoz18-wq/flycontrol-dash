import React from 'react';
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, FPS, M, clamp, ease, easeIn, easeInOut, ramp, rnd, wordsIn } from '../lib';
import { Phone, hexA, screenSize } from '../components/Phone';
import { ChatScreen, MSGS, NotifStack } from '../components/Chat';
import { KLine, KWord, shake } from '../components/Kinetic';
import { Logical } from '../components/Screen';
import { Embers, Flash } from '../components/Atmos';
import { body } from '../fonts';

const PW = 600;
const { sw, sh, bezel } = screenSize(PW);
export const FREEZE = 12.35;
const V0 = M.fly1 - 2.0; // início da virada (tempos relativos do roteiro: 0 / .3 / .8 / 1.5 / 2.0)
const BREAK = V0 + 0.8; // fragmentação
const COLS = 5;
const ROWS = 10;

/** Cenas 1–4: celular com a conversa, congelamento, pergunta e a virada até o cardápio real se montar. */
export const Before: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  if (t > M.fly1 + 0.15) return null;

  // ---- câmera / posição do celular ----
  const enter = ramp(t, 0, 1.3);
  const orbitP = interpolate(t, [FREEZE, 18.6], [0, 1], clamp);
  const orbit = Math.sin(Math.PI * orbitP) * 24;
  const settle = ramp(t, 18.35, BREAK, easeInOut);
  const cy = interpolate(enter, [0, 1], [1500, 1050]) + interpolate(orbitP, [0, 0.15], [0, 50], clamp) * (1 - settle) - settle * 50;
  const sc = interpolate(orbitP, [0, 0.2], [1, 0.86], clamp) * (1 - settle) + settle * 1;
  const rotX = interpolate(enter, [0, 1], [38, 4]) * (1 - settle);
  const rotY = (-8 + Math.sin(t * 0.8) * 3) * (1 - orbitP) + orbit * (1 - settle);
  const chaos = interpolate(t, [10.2, 12.3], [0, 1], clamp) * (t < FREEZE ? 1 : 0);
  const sk = shake(t, 10.2, 2.15, 14 * chaos + 2, 3);
  const freeze = interpolate(t, [FREEZE, FREEZE + 0.25], [0, 1], clamp);
  const chatT = Math.min(t, FREEZE);

  const phoneVisible = t < BREAK + 0.05;
  const stage: React.CSSProperties = {
    position: 'absolute', left: 540 - PW / 2, top: cy - (sh + bezel * 2) / 2,
    transform: `translate(${sk.x}px,${sk.y}px) scale(${sc}) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
    transformStyle: 'preserve-3d', opacity: enter,
  };

  return (
    <AbsoluteFill style={{ perspective: 1600, perspectiveOrigin: '50% 45%' }}>
      {/* bolhas soltas no espaço durante o congelamento */}
      <FloatingBubbles t={t} />
      {phoneVisible && (
        <div style={stage}>
          <Phone width={PW} glow={t < FREEZE ? '#ff3b1a' : C.blue} glowStrength={0.35 + chaos * 0.5}>
            <div style={{ position: 'absolute', inset: 0, filter: `grayscale(${freeze * 0.55}) brightness(${1 - freeze * 0.25}) contrast(${1 + freeze * 0.1})` }}>
              <Logical sw={sw}>
                <ChatScreen t={chatT} />
                <NotifStack t={chatT} />
              </Logical>
            </div>
            {/* tinta fria do congelamento */}
            <div style={{ position: 'absolute', inset: 0, background: hexA(C.blue, 0.12 * freeze), mixBlendMode: 'screen' }} />
          </Phone>
        </div>
      )}
      {t >= BREAK - 0.02 && <Shatter t={t} cy={cy} />}
      <Vortex t={t} cy={cy} />
      <Embers from={V0 + 0.8} to={V0 + 1.55} count={90} cy={cy} spread={1100} speed={1.2} />
      <Embers from={V0 + 1.5} to={M.fly1 + 0.15} count={140} cy={cy} spread={1300} speed={4} />
      <Texts t={t} />
      <Flash at={M.fly1} />
    </AbsoluteFill>
  );
};

/** Pedaços da tela: a conversa se desmonta (saída) e o cardápio real se monta (entrada). */
const Shatter: React.FC<{ t: number; cy: number }> = ({ t, cy }) => {
  const tw = sw / COLS;
  const th = sh / ROWS;
  const ox = 540 - sw / 2;
  const oy = cy - sh / 2;
  const tiles = [] as React.ReactNode[];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const x0 = c * tw;
      const y0 = r * th;
      const dx = x0 + tw / 2 - sw / 2;
      const dy = y0 + th / 2 - sh / 2;
      const a0 = Math.atan2(dy, dx);
      // saída: em espiral, girando, vindo na direção da câmera
      const d = rnd(i, 5) * 0.25;
      const pOut = interpolate(t, [BREAK + d, BREAK + d + 1.0], [0, 1], { ...clamp, easing: easeIn });
      if (pOut < 1) {
        const ang = a0 + pOut * (2.2 + rnd(i, 7));
        const rad = Math.hypot(dx, dy) + pOut * (500 + rnd(i, 9) * 700);
        const z = pOut * (200 + rnd(i, 11) * 900);
        tiles.push(
          <div
            key={'o' + i}
            style={{
              position: 'absolute', left: ox + sw / 2 + Math.cos(ang) * rad - tw / 2, top: oy + sh / 2 + Math.sin(ang) * rad * 1.15 - th / 2,
              width: tw, height: th, overflow: 'hidden', borderRadius: 6 * pOut,
              transform: `translateZ(${z}px) rotateX(${pOut * (rnd(i, 13) - 0.5) * 540}deg) rotateY(${pOut * (rnd(i, 17) - 0.5) * 540}deg)`,
              opacity: 1 - interpolate(pOut, [0.55, 1], [0, 1], clamp),
              boxShadow: `0 0 ${18 * pOut}px ${hexA(C.fire, 0.8 * pOut)}`, filter: `brightness(${1 + pOut * 0.6})`,
            }}
          >
            <div style={{ position: 'absolute', left: -x0, top: -y0, width: sw, height: sh, filter: 'grayscale(0.55) brightness(0.75)' }}>
              <Logical sw={sw}>
                <ChatScreen t={FREEZE} />
                <NotifStack t={FREEZE} />
              </Logical>
            </div>
          </div>,
        );
      }
      // entrada: o cardápio real (1º quadro do Açaí e Love) se reconstrói
      const arrive = M.fly1 - rnd(i, 19) * 0.22;
      const pIn = interpolate(t, [arrive - 0.75, arrive], [0, 1], { ...clamp, easing: ease });
      if (pIn > 0) {
        const ang = a0 - (1 - pIn) * (2.6 + rnd(i, 23));
        const rad = Math.hypot(dx, dy) + (1 - pIn) * (700 + rnd(i, 29) * 600);
        const z = -(1 - pIn) * (900 + rnd(i, 31) * 600);
        tiles.push(
          <div
            key={'i' + i}
            style={{
              position: 'absolute', left: ox + sw / 2 + Math.cos(ang) * rad - tw / 2, top: oy + sh / 2 + Math.sin(ang) * rad * 1.15 - th / 2,
              width: tw + 0.6, height: th + 0.6,
              transform: `translateZ(${z}px) rotateX(${(1 - pIn) * (rnd(i, 37) - 0.5) * 400}deg) rotateY(${(1 - pIn) * (rnd(i, 41) - 0.5) * 400}deg)`,
              backgroundImage: `url(${staticFile('stills/al0.jpg')})`, backgroundSize: `${sw}px ${sh}px`, backgroundPosition: `${-x0}px ${-y0}px`,
              opacity: Math.min(1, pIn * 2), boxShadow: pIn < 1 ? `0 0 16px ${hexA(C.gold, 0.7 * (1 - pIn))}` : undefined,
            }}
          />,
        );
      }
    }
  return <AbsoluteFill style={{ transformStyle: 'preserve-3d' }}>{tiles}</AbsoluteFill>;
};

/** Corrente luminosa (fogo → azul, cores da marca) atravessando a composição. */
const Vortex: React.FC<{ t: number; cy: number }> = ({ t, cy }) => {
  const o = interpolate(t, [V0 + 0.5, V0 + 0.9, M.fly1, M.fly1 + 0.15], [0, 1, 1, 0], clamp);
  if (o <= 0) return null;
  const spin = (t - V0) * (t > V0 + 1.5 ? 5 : 2.2);
  const paths = [0, 1, 2].map((k) => {
    let d = '';
    for (let s = 0; s <= 120; s++) {
      const u = s / 120;
      const ang = spin + k * 2.1 + u * Math.PI * 2.3;
      const r = 60 + u * u * 900;
      const x = 540 + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r * 1.25;
      d += `${s ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
    }
    return d;
  });
  const dash = (t - V0) * 2200;
  return (
    <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0, opacity: o, mixBlendMode: 'screen' }}>
      <defs>
        <linearGradient id="vg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={C.fire} />
          <stop offset="0.55" stopColor={C.gold} />
          <stop offset="1" stopColor={C.blue} />
        </linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="9" /></filter>
      </defs>
      {paths.map((d, k) => (
        <g key={k}>
          <path d={d} fill="none" stroke="url(#vg)" strokeWidth={16} strokeLinecap="round" strokeDasharray="300 700" strokeDashoffset={-dash - k * 300} filter="url(#glow)" opacity={0.75} />
          <path d={d} fill="none" stroke="#fff6e8" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="300 700" strokeDashoffset={-dash - k * 300} />
        </g>
      ))}
    </svg>
  );
};

/** Bolhas, áudios e dúvidas soltos no espaço (congelamento). */
const FloatingBubbles: React.FC<{ t: number }> = ({ t }) => {
  const o = interpolate(t, [FREEZE + 0.2, FREEZE + 1.2, BREAK - 0.1, BREAK + 0.5], [0, 1, 1, 0], clamp);
  if (o <= 0) return null;
  const items = MSGS.filter((m) => !m.me).slice(0, 12);
  const pull = interpolate(t, [BREAK - 0.2, BREAK + 0.6], [0, 1], { ...clamp, easing: easeIn });
  return (
    <AbsoluteFill style={{ transformStyle: 'preserve-3d', opacity: o }}>
      {items.map((m, i) => {
        const side = i % 2 ? 1 : -1;
        const x = 540 + side * (300 + rnd(i, 3) * 160) + Math.sin(t * 0.6 + i) * 18;
        const y = 560 + rnd(i, 5) * 1100 + Math.cos(t * 0.5 + i) * 22;
        const z = 120 + rnd(i, 7) * 380;
        const sw2 = interpolate(pull, [0, 1], [0, 1]);
        const px = x + (540 - x) * sw2 + Math.cos(i + t * 6) * 300 * sw2;
        const py = y + (1000 - y) * sw2 + Math.sin(i + t * 6) * 300 * sw2;
        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: px - 150, top: py - 30, width: 300, transform: `translateZ(${z * (1 - pull)}px) rotateY(${side * -18 + t * 6}deg) rotateZ(${(rnd(i, 9) - 0.5) * 16}deg)`,
              background: C.chatIn, color: '#e9edef', fontFamily: body, fontSize: 24, padding: '12px 16px', borderRadius: 16,
              boxShadow: `0 20px 40px rgba(0,0,0,0.6), 0 0 22px ${hexA(C.blue, 0.25)}`, filter: `blur(${z > 380 ? 1.5 : 0}px)`, opacity: 0.92,
            }}
          >
            {m.audio ? '▶ ıılıılıılıı  ' + m.audio : m.text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Texts: React.FC<{ t: number }> = ({ t }) => {
  const W = wordsIn(13.9, 17.7).filter((w) => !/^(mas|por|outro|lugar)/i.test(w.text.replace(/…/, '')));
  const push = interpolate(t, [18.45, 19.05], [0, 1], { ...clamp, easing: easeIn });
  return (
    <AbsoluteFill>
      {/* Cena 1 */}
      <div style={{ position: 'absolute', top: 170, left: 0, right: 0, textAlign: 'center' }}>
        <KLine size={92} out={4.15} from="zoom" words={[{ text: 'VÁRIAS', at: 3.0, color: C.ember, glow: C.fire }, { text: 'MENSAGENS', at: 3.22 }]} />
      </div>
      <div style={{ position: 'absolute', top: 120, left: 0, right: 0, textAlign: 'center' }}>
        <KLine size={60} out={6.3} words={['SEU', 'PEDIDO', 'AINDA', 'CHEGA'].map((w, i) => ({ text: w, at: 4.3 + i * 0.13 }))} />
        <div style={{ marginTop: 16 }}>
          <KWord text="ASSIM?" at={M.q1End - 0.45} out={6.3} size={170} from="slam" color={C.ember} glow={C.fire} depthColor="#4a1200" />
        </div>
      </div>
      {/* Cena 2: palavras flutuantes sincronizadas com a voz */}
      <Callout t={t} at={M.preco} text="PREÇO?" x={150} y={640} rot={-9} />
      <Callout t={t} at={M.audio} text="ÁUDIO!" x={930} y={880} rot={8} />
      <Callout t={t} at={M.mudaPedido} text="TROCA O PEDIDO!" x={430} y={1240} rot={-6} />
      <Callout t={t} at={M.mudaTudo} text="DE NOVO!" x={800} y={520} rot={7} big />
      {/* Cena 3: a pergunta */}
      <div style={{ position: 'absolute', top: 150, left: 0, right: 0, textAlign: 'center' }}>
        <KWord text="MAS…" at={M.mas} out={14.15} size={96} tracking={0.2} color="#cfd8e3" depthColor="#0d1a2b" />
      </div>
      <div style={{ position: 'absolute', top: 130, left: 70, right: 70, textAlign: 'center' }}>
        <KLine size={62} out={17.7} depthColor="#0d1a2b" words={W.map((w) => ({ text: w.text.replace('…', '').toUpperCase(), at: w.start }))} />
      </div>
      <div
        style={{
          position: 'absolute', top: 160, left: 0, right: 0, textAlign: 'center', perspective: 800,
          transform: `scale(${1 + push * 7}) translateY(${push * 60}px)`, opacity: 1 - push, filter: `blur(${push * 6}px)`, transformOrigin: '50% 40%',
        }}
      >
        <KWord text="POR" at={M.porOutro} size={86} tracking={0.3} color="#dfe8f5" depthColor="#0d1a2b" />
        <div style={{ height: 6 }} />
        <KWord text="OUTRO" at={M.outro} size={190} from="slam" color={C.ember} glow={C.fire} depthColor="#4a1200" />
        <div />
        <KWord text="LUGAR?" at={M.lugar} size={190} from="slam" color={C.ember} glow={C.fire} depthColor="#4a1200" />
      </div>
    </AbsoluteFill>
  );
};

const Callout: React.FC<{ t: number; at: number; text: string; x: number; y: number; rot: number; big?: boolean }> = ({ t, at, text, x, y, rot, big }) => {
  if (t < at - 0.05 || t > at + 2.2) return null;
  const drift = (t - at) * 10;
  return (
    <div style={{ position: 'absolute', left: x, top: y - drift, transform: `translate(-50%,-50%) rotate(${rot}deg)`, perspective: 700 }}>
      <KWord text={text} at={at} out={at + 1.8} size={big ? 92 : 74} from="slam" color="#fff" glow={C.fire} depthColor="#5a1500" />
    </div>
  );
};
