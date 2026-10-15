import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { FPS, WT, clamp, ease, easeIn, easeInOut, f, keys, ramp, rgba, rnd, useTL } from '../lib';
import { Phone3D, phoneDims, ContactShadow } from '../Devices';
import { Bubble, ChatLight, buildChat } from '../ChatLight';
import { GlassChip, L3D, W3D } from '../Type3D';
import { ImpactRing, LightStream, LightSweep } from '../Studio';
import { body } from '../fonts';

export const PW = 470; // largura base do celular (igual à da galeria, para a passagem ser contínua)
export const PY = 930; // centro vertical do celular depois da revelação
const { sw, h: PH } = phoneDims(PW);

/** Tempos derivados da narração (valem para a versão 36 s e para a de 25 s). */
export const useOpen = () => {
  const { m, hasChaos } = useTL();
  const FREEZE = m('freeze');
  const IMP = m('fly1');
  const MORPH0 = Math.max(FREEZE + 0.4, m('lugarEnd') - 2.2);
  const FLIP0 = IMP - 1.55;
  const CLIP0 = IMP - 0.5; // troca a tela (conversa → cardápio real) enquanto o verso está virado
  const G0 = m('seja') - 0.4; // início da galeria
  return { m, hasChaos, FREEZE, IMP, MORPH0, FLIP0, CLIP0, G0 };
};

const FLOATS = [
  { text: 'Tem X-Bacon?', x: 230, y: 700, z: 120 },
  { text: 'Quanto custa?', x: 820, y: 690, z: -60, orange: true },
  { text: 'Quero dois!', x: 220, y: 900, z: 40 },
  { text: 'Sem cebola!', x: 860, y: 820, z: 160 },
  { audio: '0:28', x: 300, y: 1230, z: -40 },
  { text: 'Troca a batata por milkshake!', x: 640, y: 1390, z: 200, orange: true },
  { text: 'oi?', x: 900, y: 1130, z: -120 },
  { text: 'tá aí?', x: 160, y: 1080, z: -160 },
  { text: 'e o endereço…', x: 780, y: 1560, z: 160 },
  { text: '??', x: 120, y: 1300, z: -200 },
  { text: 'faz um de morango', x: 820, y: 1000, z: -40 },
  { text: 'muda o refri pra zero', x: 330, y: 1460, z: 60 },
];

const MORPH = [
  { front: 'Tem X-Bacon?', ui: 'card-burger-dp', w: 330, ar: 582 / 1080 },
  { front: 'Quanto custa?', ui: 'card-tigela-dp', w: 300, ar: 1 },
  { front: 'Quero dois!', ui: 'btn-adicionar-dp', w: 380, ar: 0.16 },
  { front: 'Sem cebola!', ui: 'chips-adicionais-dp', w: 360, ar: 480 / 1062 },
  { front: 'Troca a batata por milkshake!', ui: 'cat-acai-love', w: 320, ar: 804 / 1086 },
  { front: '🎤 0:28', ui: 'pill-carrinho-dp', w: 230, ar: 192 / 432 },
  { front: 'tá aí?', ui: 'item-pedido-dp', w: 360, ar: 348 / 1062 },
  { front: 'oi??', ui: 'cat-pasteis-alpha', w: 330, ar: 471 / 1074 },
];

/** Cenas 1–4: mensagens soltas → conversa no celular → congelamento e pergunta → transformação 3D. */
export const Abertura: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const { m, hasChaos, FREEZE, IMP, MORPH0, FLIP0, CLIP0, G0 } = useOpen();
  if (t > G0 + 0.05) return null;
  const chaosFrom = hasChaos ? m('mudaTudo') : 4.0;
  // ---- câmera / celular ----
  const zoomA = hasChaos ? m('preco') - 0.4 : 3.0;
  const scale = keys(t, [[2.1, 0.78], [2.9, 0.8], [zoomA, 0.8], [FREEZE, 1.1], [FREEZE + 0.15, 1.1], [MORPH0 + 0.4, 0.8], [IMP - 0.2, 0.86], [IMP + 0.6, 1]]);
  const y = keys(t, [[2.1, 2350], [2.95, 1010], [zoomA, 1010], [FREEZE, 950], [MORPH0 + 0.4, 1000], [IMP - 0.2, 960], [IMP + 0.6, PY]], ease);
  const spin = keys(t, [[IMP - 1.1, 0], [IMP, -336]], easeInOut);
  const rotY = keys(t, [[2.1, 38], [2.95, -8], [zoomA, -6], [FREEZE, -3], [MORPH0 + 0.4, -24]], ease) + spin + (t < FREEZE ? Math.sin(t * 1.1) * 3 : 0);
  const rotX = keys(t, [[2.1, 22], [2.95, 5], [FREEZE, 3], [MORPH0 + 0.4, 9], [IMP - 0.3, 4], [IMP + 0.4, 0]]);
  const sh = t > chaosFrom && t < FREEZE ? (1 - (FREEZE - t) / (FREEZE - chaosFrom)) * 9 + 2 : 0;
  const jx = sh ? (rnd(Math.floor(t * 50), 3) - 0.5) * sh : 0;
  const jy = sh ? (rnd(Math.floor(t * 50), 9) - 0.5) * sh : 0;
  const settle = Math.sin(Math.max(0, t - IMP - 0.6) * 1.1) * 8 * ramp(t, IMP + 0.6, IMP + 1.2);
  // ---- tempo da conversa ----
  const chat = buildChat(m, hasChaos);
  const marks = hasChaos ? { preco: m('preco'), audio: m('audio'), troca: m('mudaPedido') } : { preco: 5.5, audio: 7.05, troca: 8.25 };
  const ct = hasChaos ? Math.min(t, FREEZE) : interpolate(t, [2.3, FREEZE - 0.15], [5.2, 11.3], clamp);
  const frozen = ramp(t, FREEZE, FREEZE + 0.3);
  return (
    <AbsoluteFill style={{ perspective: 1700, perspectiveOrigin: '50% 45%' }}>
      <Floats t={t} />
      <ContactShadow x={540} y={y + (PH * scale) / 2 + 40} w={PW * scale * 1.1} o={ramp(t, 2.4, 3.0) * 0.8} />
      <div style={{ position: 'absolute', left: 540 - PW / 2, top: y - PH / 2 + settle, transform: `translate(${jx}px,${jy}px) scale(${scale})`, transformStyle: 'preserve-3d' }}>
        <Phone3D width={PW} rotY={rotY} rotX={rotX} glow={0.25 + frozen * 0.2} reflect={false} opacity={t < 2.05 ? 0 : 1}>
          {t < CLIP0 ? (
            <div style={{ position: 'absolute', inset: 0, filter: `grayscale(${frozen * 0.6}) contrast(${1 - frozen * 0.05})` }}>
              <div style={{ width: 390, height: 844, transform: `scale(${sw / 390})`, transformOrigin: '0 0' }}>
                <ChatLight ct={ct} msgs={chat} marks={marks} />
                <Notifs t={t} ct={ct} chat={chat} from={hasChaos ? m('mudaTudo') : 9.5} />
              </div>
            </div>
          ) : (
            <Sequence from={f(CLIP0)} layout="none">
              <OffthreadVideo src={staticFile('clips/al.mp4')} muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            </Sequence>
          )}
        </Phone3D>
      </div>
      <MorphCards t={t} cy={y} />
      <LightStream from={IMP - 0.9} to={IMP + 0.45} cy={y} />
      <ImpactRing at={IMP} cy={PY} />
      <LightSweep at={IMP + 0.05} dur={0.8} strength={0.35} />
      <Texts t={t} />
      <PostImpact t={t} />
    </AbsoluteFill>
  );
};

/** Notificações empilhando no topo da conversa (excesso de mensagens). */
const Notifs: React.FC<{ t: number; ct: number; chat: ReturnType<typeof buildChat>; from: number }> = ({ ct, chat, from }) => {
  const list = chat.filter((x) => x.ct >= from && ct >= x.ct && !x.me).slice(-3);
  return (
    <div style={{ position: 'absolute', top: 10, left: 10, right: 10, zIndex: 5 }}>
      {list.map((x, i) => {
        const p = interpolate(ct, [x.ct, x.ct + 0.15], [0, 1], { ...clamp, easing: ease });
        return (
          <div key={x.ct} style={{ marginTop: i ? -48 : 0, transform: `translateY(${(1 - p) * -60 + i * 8}px) scale(${0.94 + i * 0.02})`, opacity: p, background: 'rgba(255,255,255,0.96)', border: `1px solid ${WT.border}`, borderRadius: 18, padding: '10px 14px', color: WT.ink, fontFamily: body, fontSize: 13, boxShadow: '0 8px 22px rgba(17,24,39,0.16)' }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: WT.orange }}>Mariana · agora</div>
            <div>{x.text ?? '🎤 Mensagem de voz'}</div>
          </div>
        );
      })}
    </div>
  );
};

/** Cena 1: mensagens surgindo soltas no estúdio branco, em várias profundidades. */
const Floats: React.FC<{ t: number }> = ({ t }) => {
  const { FREEZE, hasChaos, m } = useOpen();
  const away = ramp(t, FREEZE, FREEZE + 0.9, easeIn);
  if (away >= 1) return null;
  const spread = hasChaos ? ramp(t, m('preco') - 0.4, FREEZE, easeInOut) : ramp(t, 3.4, FREEZE);
  return (
    <AbsoluteFill style={{ transformStyle: 'preserve-3d' }}>
      {FLOATS.map((b, i) => {
        const at = 0.35 + i * 0.36;
        const p = interpolate(t, [at, at + 0.3], [0, 1], { ...clamp, easing: ease });
        if (p <= 0) return null;
        const dx = (b.x - 540) * (1 + spread * 0.35 + away * 0.8);
        const dy = (b.y - 960) * (1 + spread * 0.2 + away * 0.5);
        const z = b.z - spread * 200 - away * 600;
        return (
          <div key={i} style={{ position: 'absolute', left: 540 + dx, top: 960 + dy + Math.sin(t * 1.3 + i) * 10, transform: `translate(-50%,-50%) translateZ(${z}px) rotateY(${(540 - b.x) / 30}deg) rotateZ(${(rnd(i, 2) - 0.5) * 10}deg) scale(${0.4 + 0.6 * p})`, opacity: p * (1 - away), filter: `blur(${Math.abs(z) > 180 ? 1.4 : 0}px)` }}>
            <Bubble text={b.text} audio={b.audio} orange={b.orange} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Clean UI Morph: balões viram cartões, os cartões giram e viram componentes REAIS do cardápio. */
const MorphCards: React.FC<{ t: number; cy: number }> = ({ t, cy }) => {
  const { MORPH0, FLIP0, IMP } = useOpen();
  if (t < MORPH0 || t > IMP + 0.05) return null;
  return (
    <AbsoluteFill style={{ transformStyle: 'preserve-3d' }}>
      {MORPH.map((c, k) => {
        const det = ramp(t, MORPH0 + k * 0.09, MORPH0 + k * 0.09 + 0.7);
        const flip = interpolate(t, [FLIP0 + k * 0.07, FLIP0 + k * 0.07 + 0.45], [0, 180], { ...clamp, easing: easeInOut });
        const snap = ramp(t, IMP - 0.38 + k * 0.02, IMP, easeIn);
        const a = (k / MORPH.length) * Math.PI * 2 + 0.4 + (t - MORPH0) * 0.45;
        const ox = 540 + Math.cos(a) * 420;
        const oy = cy + Math.sin(a) * 560;
        const sx = 540 + (rnd(k, 3) - 0.5) * 160;
        const sy = cy - 220 + k * 60;
        const x = (sx + (ox - sx) * det) * (1 - snap) + 540 * snap;
        const y = (sy + (oy - sy) * det) * (1 - snap) + cy * snap;
        const z = (Math.sin(a) * 220 + 60) * det * (1 - snap);
        const w = c.w;
        const hh = Math.max(64, w * c.ar);
        const face: React.CSSProperties = { position: 'absolute', inset: 0, borderRadius: 18, overflow: 'hidden', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', opacity: det * (1 - snap) };
        return (
          <div key={k} style={{ position: 'absolute', left: x - w / 2, top: y - hh / 2, width: w, height: hh, transformStyle: 'preserve-3d', transform: `translateZ(${z}px) rotateY(${flip + Math.sin(t * 2 + k) * 8}deg) rotateZ(${(rnd(k, 5) - 0.5) * 12 * (1 - snap)}deg) scale(${(0.5 + 0.5 * det) * (1 - snap * 0.75)})` }}>
            <div style={{ ...face, background: '#fff', border: `1.5px solid ${WT.border}`, display: 'grid', placeItems: 'center', boxShadow: '0 22px 44px rgba(17,24,39,0.16)', fontFamily: body, fontWeight: 600, fontSize: 24, color: WT.ink, padding: 12, textAlign: 'center' }}>{c.front}</div>
            <div style={{ ...face, transform: 'rotateY(180deg)', background: '#fff', boxShadow: `0 24px 48px rgba(17,24,39,0.2), 0 0 0 2px ${rgba(WT.orange, 0.5)}, 0 0 30px ${rgba(WT.orange, 0.35)}` }}>
              <Img src={staticFile(`ui/${c.ui}.jpg`)} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#1a1220' }} />
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Textos das cenas 1–3, cada palavra no tempo da voz. */
const Texts: React.FC<{ t: number }> = ({ t }) => {
  const { m, hasChaos, FREEZE } = useOpen();
  const { words } = useTL();
  const q = words.filter((w) => w.start >= m('eSe') - 0.05 && w.start < m('porOutro') - 0.02);
  const burst = interpolate(t, [m('outro') - 0.05, m('outro') + 0.15, m('lugarEnd') + 0.6], [0, 1, 0.55], clamp);
  const qOut = m('lugarEnd') + 0.75;
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 270, left: 40, right: 40, textAlign: 'center' }}>
        <L3D size={96} out={hasChaos ? m('q1End') + 0.25 : FREEZE - 0.1} from="zoom" words={[{ text: 'VÁRIAS', at: m('varias'), orange: true }, { text: 'MENSAGENS', at: m('varias') + 0.2 }]} />
        <div style={{ height: 18 }} />
        <L3D size={58} out={hasChaos ? m('q1End') + 0.25 : FREEZE - 0.1} words={[{ text: 'SÓ PRA FAZER', at: m('so') }, { text: 'UM PEDIDO?', at: m('so') + 0.4, orange: true }]} />
      </div>
      {hasChaos && (
        <>
          <Callout t={t} at={m('preco')} text="PREÇO?" x={170} y={700} rot={-8} />
          <Callout t={t} at={m('audio')} text="ÁUDIO!" x={905} y={860} rot={7} />
          <Callout t={t} at={m('mudaPedido')} text="TROCA O PEDIDO!" x={430} y={1300} rot={-5} />
          <Callout t={t} at={m('mudaTudo')} text="DE NOVO!" x={790} y={560} rot={6} />
        </>
      )}
      <div style={{ position: 'absolute', top: 270, left: 60, right: 60, textAlign: 'center' }}>
        <L3D size={60} out={m('porOutro') - 0.08} words={q.map((w) => ({ text: w.text.replace('…', '').toUpperCase(), at: w.start }))} />
      </div>
      {/* "OUTRO LUGAR?" com explosão luminosa laranja por trás, sem perder a leitura */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 120, height: 560, opacity: burst * (1 - ramp(t, qOut - 0.2, qOut + 0.2)), background: `radial-gradient(ellipse 55% 45% at 50% 55%, rgba(255,255,255,0.95) 0%, ${rgba(WT.amber, 0.55)} 35%, ${rgba(WT.orange, 0.18)} 60%, transparent 75%)`, transform: `scale(${0.8 + burst * 0.3})` }} />
      <div style={{ position: 'absolute', top: 250, left: 0, right: 0, textAlign: 'center', perspective: 800 }}>
        <W3D text="POR" at={m('porOutro')} out={qOut} size={80} tracking={0.25} />
        <div style={{ height: 6 }} />
        <W3D text="OUTRO" at={m('outro')} out={qOut} size={176} orange from="slam" />
        <div />
        <W3D text="LUGAR?" at={m('lugar')} out={qOut} size={176} orange from="slam" />
      </div>
    </AbsoluteFill>
  );
};

const Callout: React.FC<{ t: number; at: number; text: string; x: number; y: number; rot: number }> = ({ t, at, text, x, y, rot }) => {
  if (t < at - 0.05 || t > at + 1.7) return null;
  return (
    <div style={{ position: 'absolute', left: x, top: y - (t - at) * 12, transform: `translate(-50%,-50%) rotate(${rot}deg)`, perspective: 700 }}>
      <W3D text={text} at={at} out={at + 1.35} size={70} orange from="slam" />
    </div>
  );
};

/** Depois do impacto: o cardápio real do Açaí e Love, "simples / moderno / profissional" e alguns componentes flutuando. */
const PostImpact: React.FC<{ t: number }> = ({ t }) => {
  const { m, IMP, G0 } = useOpen();
  if (t < IMP - 0.05) return null;
  const hasLine = m('simples') != null;
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 262, left: 0, right: 0, textAlign: 'center' }}>
        <W3D text="FLYCONTROL" at={IMP} out={hasLine ? m('simples') - 0.15 : G0 - 0.15} size={108} from="zoom" orange tracking={0.01} />
      </div>
      {hasLine && (
        <div style={{ position: 'absolute', top: 280, left: 30, right: 30, textAlign: 'center' }}>
          <L3D size={64} out={G0 - 0.2} from="flip" words={[{ text: 'SIMPLES.', at: m('simples') }, { text: 'MODERNO.', at: m('moderno') }, { text: 'PROFISSIONAL.', at: m('profissional1'), orange: true }]} />
        </div>
      )}
      <div style={{ position: 'absolute', top: PY + PH / 2 + 26, left: 0, right: 0, textAlign: 'center' }}>
        <GlassChip t={t} a={IMP + 0.7} b={G0 + 0.35} dot>Açaí e Love · vídeo na capa</GlassChip>
      </div>
      {hasLine && <Orbit t={t} from={IMP + 0.3} to={G0} />}
    </AbsoluteFill>
  );
};

/** Floating UI: componentes reais orbitando suavemente o celular depois da revelação. */
const Orbit: React.FC<{ t: number; from: number; to: number }> = ({ t, from, to }) => {
  const o = interpolate(t, [from, from + 0.5, to - 0.5, to], [0, 1, 1, 0], clamp);
  if (o <= 0) return null;
  const items = [
    { ui: 'pill-carrinho-dp', w: 210, ar: 192 / 432, x: 840, y: 1200 },
    { ui: 'btn-adicionar-dp', w: 300, ar: 0.16, x: 250, y: 1270 },
    { ui: 'card-tigela-dp', w: 200, ar: 1, x: 170, y: 600 },
    { ui: 'chips-adicionais-dp', w: 260, ar: 480 / 1062, x: 900, y: 640 },
  ];
  return (
    <AbsoluteFill>
      {items.map((c, i) => (
        <div key={c.ui} style={{ position: 'absolute', left: c.x - c.w / 2, top: c.y + Math.sin(t * 1.2 + i) * 14, width: c.w, height: Math.max(48, c.w * c.ar), borderRadius: 16, overflow: 'hidden', opacity: o, transform: `rotate(${(i % 2 ? 1 : -1) * 6 + Math.sin(t + i) * 2}deg) scale(${0.8 + 0.2 * o})`, background: '#1a1220', boxShadow: `0 20px 40px rgba(17,24,39,0.18), 0 0 0 2px ${rgba(WT.orange, 0.35)}` }}>
          <Img src={staticFile(`ui/${c.ui}.jpg`)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
      ))}
    </AbsoluteFill>
  );
};
