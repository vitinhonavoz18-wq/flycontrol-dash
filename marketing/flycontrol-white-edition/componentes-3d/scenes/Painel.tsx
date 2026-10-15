import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { FPS, WT, clamp, ease, keys, ramp, rgba, useTL } from '../lib';
import { Tablet3D, ContactShadow } from '../Devices';
import { GlassChip, L3D, W3D } from '../Type3D';
import { LightSweep } from '../Studio';
import med from '../medidas-painel.json';
import toques from '../toques-tablet.json';

const TW = 980;
const bezel = Math.round(TW * 0.028);
const SW = TW - bezel * 2;
const K = SW / 1180; // tela real capturada em 1180x820 (x2)
const CY = 860;

/**
 * Cena 6: painel ORIGINAL do FlyControl em Modo Claro (ativado pelo interruptor "Modo Escuro" do próprio
 * painel), num tablet. Dados de demonstração. Destaques laranja nas colunas reais e nos toques reais.
 */
export const Painel: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const { m } = useTL();
  const P0 = m('seuNegocio') - 0.25;
  const END = m('profissional2End') + 0.15;
  if (t < P0 - 0.3 || t > END + 0.4) return null;
  const D = END - P0;
  const at = (r: number) => P0 + r * D;
  const enter = ramp(t, P0 - 0.25, P0 + 0.5);
  const exit = ramp(t, END - 0.1, END + 0.35);
  const push = keys(t, [[P0, 0.94], [END, 1.06]]);
  const steps = [
    { a: P0, img: '02-tablet-quadro-de-pedidos' },
    { a: at(0.46), img: '03-tablet-detalhes-do-pedido' },
    { a: at(0.66), img: '04-tablet-flystatus-em-preparo' },
    { a: at(0.82), img: '05-tablet-quadro-atualizado' },
  ];
  const cur = [...steps].reverse().find((s) => t >= s.a) ?? steps[0];
  const cols: [string, number][] = [['Novo pedido', 0.12], ['Em preparo', 0.22], ['Saiu para entrega', 0.32]];
  return (
    <AbsoluteFill style={{ perspective: 1800, opacity: 1 - exit }}>
      <ContactShadow x={540} y={CY + 400} w={TW * 0.95} o={enter * 0.9} />
      <div style={{ position: 'absolute', left: 540 - TW / 2, top: CY - 360 + (1 - enter) * 500, transform: `scale(${push * (0.85 + 0.15 * enter)})`, transformStyle: 'preserve-3d', opacity: enter }}>
        <Tablet3D width={TW} rotX={(1 - enter) * 24 + 7} rotY={-6 + (t - P0) * 2}>
          {steps.map((s, i) => {
            const p = interpolate(t, [s.a, s.a + 0.18], [0, 1], { ...clamp, easing: ease });
            if (t < s.a - 0.01 || (cur !== s && i !== steps.indexOf(cur) - 1)) return null;
            const slide = s.img.startsWith('03') ? `translateX(${(1 - p) * 30}%)` : '';
            return <Img key={s.img} src={staticFile(`painel/${s.img}.png`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: i === 0 ? 1 : p, transform: slide }} />;
          })}
          {/* destaque laranja nas colunas reais do quadro */}
          {cur.img.startsWith('02') && cols.map(([name, r]) => <Outline key={name} t={t} a={at(r)} b={at(r) + 0.55} rect={(med.before as any)[name].column} />)}
          {cur.img.startsWith('05') && <Outline t={t} a={at(0.84)} b={END} rect={med.after.card1041} />}
          <Tap t={t} at={at(0.42)} xy={toques.verDetalhes} />
          <Tap t={t} at={at(0.62)} xy={toques.emPreparo} />
        </Tablet3D>
      </div>
      <LightSweep at={P0 + 0.1} dur={0.9} strength={0.22} />
      <div style={{ position: 'absolute', top: 262, left: 30, right: 30, textAlign: 'center' }}>
        <W3D text="GESTÃO DE PEDIDOS" at={P0 + 0.1} out={m('profissional2') - 0.12} size={78} from="rise" />
        <div style={{ height: 8 }} />
        <W3D text="ORGANIZADA" at={P0 + 0.35} out={m('profissional2') - 0.12} size={78} orange from="rise" />
      </div>
      <div style={{ position: 'absolute', top: 262, left: 30, right: 30, textAlign: 'center' }}>
        <L3D size={86} out={END - 0.1} words={[{ text: 'MAIS', at: m('profissional2') - 0.3 }, { text: 'PROFISSIONAL.', at: m('profissional2'), orange: true }]} />
      </div>
      <div style={{ position: 'absolute', top: CY + 430, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 14 }}>
        {cols.map(([name, r]) => (
          <StageChip key={name} t={t} on={t >= at(r) && t < at(r) + 0.55} a={P0 + 0.2} b={END}>{name.toUpperCase()}</StageChip>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Outline: React.FC<{ t: number; a: number; b: number; rect: number[] }> = ({ t, a, b, rect }) => {
  const p = interpolate(t, [a, a + 0.15, b - 0.12, b], [0, 1, 1, 0], clamp);
  if (p <= 0) return null;
  const [x, y, w, h] = rect;
  return <div style={{ position: 'absolute', left: x * K - 4, top: y * K - 4, width: w * K + 8, height: h * K + 8, borderRadius: 14, border: `3px solid ${WT.orange}`, boxShadow: `0 0 0 6px ${rgba(WT.orange, 0.15)}, 0 0 24px ${rgba(WT.orange, 0.45)}`, opacity: p, transform: `scale(${1.03 - 0.03 * p})` }} />;
};

const Tap: React.FC<{ t: number; at: number; xy: number[] }> = ({ t, at, xy }) => {
  if (t < at - 0.2 || t > at + 0.5) return null;
  const pre = interpolate(t, [at - 0.2, at], [0, 1], clamp);
  const r = interpolate(t, [at, at + 0.45], [0, 1], { ...clamp, easing: ease });
  const x = xy[0] * K, y = xy[1] * K;
  return (
    <>
      <div style={{ position: 'absolute', left: x - 22, top: y - 22, width: 44, height: 44, borderRadius: 22, background: rgba(WT.orange, 0.25), border: `3px solid ${WT.orange}`, opacity: pre * (1 - r) }} />
      <div style={{ position: 'absolute', left: x - 40, top: y - 40, width: 80, height: 80, borderRadius: 40, border: `3px solid ${WT.orange}`, opacity: (1 - r) * (t >= at ? 1 : 0), transform: `scale(${0.3 + r})` }} />
    </>
  );
};

const StageChip: React.FC<{ t: number; on: boolean; a: number; b: number; children: React.ReactNode }> = ({ t, on, a, b, children }) => {
  const p = interpolate(t, [a, a + 0.3, b - 0.1, b], [0, 1, 1, 0], clamp);
  return (
    <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: 22, letterSpacing: '0.04em', padding: '10px 16px', borderRadius: 30, opacity: p, transform: `scale(${on ? 1.08 : 1})`, color: on ? '#fff' : WT.ink, background: on ? WT.gradPrimary : 'rgba(255,255,255,0.85)', border: `1.5px solid ${on ? 'transparent' : WT.border}`, boxShadow: on ? WT.shadowGlow : WT.shadowElegant }}>
      {children}
    </span>
  );
};

export { GlassChip };
