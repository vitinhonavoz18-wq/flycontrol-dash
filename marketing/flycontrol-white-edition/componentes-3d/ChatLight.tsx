import React from 'react';
import { interpolate } from 'remotion';
import { WT, clamp, ease, rgba, rnd } from './lib';
import { body } from './fonts';

/**
 * Conversa FICTÍCIA de mensageiro, em tons claros (cinza e laranja), desenhada em 390x844.
 * Não usa marca nem logotipo de nenhum aplicativo real. Os tempos são "da conversa" (ct) e
 * cada versão do vídeo decide como o tempo do vídeo vira tempo da conversa.
 */
export type CMsg = { ct: number; text?: string; me?: boolean; audio?: string; tag?: 'preco' | 'audio' | 'troca' };
export const buildChat = (m: (k: string) => number, hasChaos: boolean): CMsg[] => {
  const P = hasChaos ? m('preco') : 5.5;
  const A = hasChaos ? m('audio') : 7.05;
  const T = hasChaos ? m('mudaPedido') : 8.25;
  const D = hasChaos ? m('mudaTudo') : 10.09;
  return [
    { ct: -1, text: 'Olá! Seja bem-vinda 😊 Como posso ajudar?', me: true },
    { ct: P, text: 'Quanto custa 2 duplo cheddar e uma batata?', tag: 'preco' },
    { ct: P + 0.6, text: 'Tem X-Bacon?' },
    { ct: A, audio: '0:28', tag: 'audio' },
    { ct: A + 0.55, text: 'Quero dois!' },
    { ct: T, text: 'Sem cebola!' },
    { ct: T + 0.45, text: 'Troca a batata por milkshake!', tag: 'troca' },
    { ct: T + 1.05, text: 'faz um de morango' },
    { ct: D, text: 'na verdade…' },
    { ct: D + 0.22, text: 'esquece o milkshake' },
    { ct: D + 0.42, text: 'volta a batata 😅' },
    { ct: D + 0.6, audio: '0:17' },
    { ct: D + 0.76, text: 'e o endereço é outro' },
    { ct: D + 0.9, text: 'tá aí?' },
    { ct: D + 1.02, text: '??' },
    { ct: D + 1.13, text: 'oi?' },
  ];
};
const LH = 19;
const msgH = (x: CMsg) => (x.audio ? 52 : 20 + Math.ceil((x.text!.length + 6) / 30) * LH) + 6;

const Wave: React.FC<{ ct: number; playing: boolean; seed: number }> = ({ ct, playing, seed }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 26 }}>
    {new Array(26).fill(0).map((_, i) => {
      const base = 4 + rnd(i, seed) * 18;
      const live = playing ? 0.5 + 0.5 * Math.abs(Math.sin(ct * 9 + i * 0.7)) : 1;
      return <div key={i} style={{ width: 3, height: base * live, borderRadius: 2, background: playing ? WT.orange : '#9CA3AF' }} />;
    })}
  </div>
);

export const ChatLight: React.FC<{ ct: number; msgs: CMsg[]; marks: { preco: number; audio: number; troca: number } }> = ({ ct, msgs, marks }) => {
  const vis = msgs.filter((x) => ct >= x.ct);
  const total = vis.reduce((s, x) => s + msgH(x), 0);
  const area = 844 - 96 - 66;
  const last = vis[vis.length - 1];
  const slide = last ? interpolate(ct, [last.ct, last.ct + 0.18], [msgH(last), 0], { ...clamp, easing: ease }) : 0;
  const scroll = Math.max(0, total - area) - (total > area ? Math.min(slide, total - area) : 0);
  const strike = interpolate(ct, [marks.troca, marks.troca + 0.35], [0, 1], clamp);
  let y = 0;
  return (
    <div style={{ width: 390, height: 844, background: '#f4f1ec', fontFamily: body, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.5, backgroundImage: 'radial-gradient(#e2ddd5 1.2px, transparent 1.2px)', backgroundSize: '18px 18px' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 96, background: '#ffffff', borderBottom: `1px solid ${WT.border}`, display: 'flex', alignItems: 'flex-end', padding: '0 14px 12px', gap: 10, zIndex: 3 }}>
        <div style={{ color: WT.ink, fontSize: 22 }}>←</div>
        <div style={{ width: 40, height: 40, borderRadius: 20, background: '#e5e7eb', color: WT.ink, display: 'grid', placeItems: 'center', fontWeight: 700 }}>M</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: WT.ink, fontWeight: 700, fontSize: 17 }}>Mariana</div>
          <div style={{ color: WT.muted, fontSize: 12 }}>{Math.floor(ct * 3) % 2 && ct > 5 ? 'digitando…' : 'online'}</div>
        </div>
        <div style={{ color: WT.muted, fontSize: 18, letterSpacing: 10 }}>⌕ ⋮</div>
      </div>
      <div style={{ position: 'absolute', top: 96, left: 0, right: 0, bottom: 66, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 6, transform: `translateY(${-scroll}px)` }}>
          {vis.map((x, i) => {
            const top = y;
            y += msgH(x);
            const pop = interpolate(ct, [x.ct, x.ct + 0.2], [0, 1], { ...clamp, easing: ease });
            const mk = x.tag ? (marks as any)[x.tag] : null;
            const hi = mk != null ? interpolate(ct, [mk, mk + 0.18, mk + 1.2, mk + 1.6], [0, 1, 1, 0], clamp) : 0;
            const playing = x.tag === 'audio' && ct >= marks.audio && ct < marks.audio + 1.6;
            return (
              <div key={i} style={{ position: 'absolute', top: top + 4, left: 0, right: 0, display: 'flex', justifyContent: x.me ? 'flex-end' : 'flex-start', padding: '0 10px' }}>
                <div
                  style={{
                    maxWidth: 292, background: x.me ? '#fff1e6' : '#ffffff', color: WT.ink, borderRadius: 12, padding: x.audio ? '8px 10px' : '7px 11px 8px',
                    fontSize: 15.5, lineHeight: `${LH}px`, transformOrigin: x.me ? '100% 100%' : '0% 100%', opacity: pop, position: 'relative',
                    transform: `scale(${(0.6 + 0.4 * pop) * (1 + hi * 0.06)})`,
                    border: `1px solid ${hi ? WT.orange : x.me ? rgba(WT.orange, 0.25) : WT.border}`,
                    boxShadow: hi ? `0 0 0 2px ${rgba(WT.orange, 0.9)}, 0 10px 26px ${rgba(WT.orange, 0.35)}` : '0 1px 2px rgba(17,24,39,0.08)',
                  }}
                >
                  {x.audio ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 0, height: 0, borderLeft: `13px solid ${playing ? WT.orange : '#6B7280'}`, borderTop: '8px solid transparent', borderBottom: '8px solid transparent' }} />
                      <Wave ct={ct} playing={playing} seed={i} />
                      <span style={{ fontSize: 11, color: WT.muted }}>{x.audio}</span>
                    </div>
                  ) : x.tag === 'preco' ? (
                    <span>
                      Quanto custa 2 duplo cheddar e{' '}
                      <span style={{ position: 'relative' }}>
                        uma batata
                        <span style={{ position: 'absolute', left: 0, top: '52%', height: 2, width: `${strike * 100}%`, background: WT.orange }} />
                      </span>
                      ?
                    </span>
                  ) : (
                    x.text
                  )}
                  <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 8, float: 'right', marginTop: 6 }}>21:{String(14 + Math.floor(i / 3)).padStart(2, '0')}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 66, display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', background: '#f4f1ec' }}>
        <div style={{ flex: 1, height: 44, borderRadius: 22, background: '#fff', border: `1px solid ${WT.border}`, color: '#9CA3AF', display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: 16 }}>Mensagem</div>
        <div style={{ width: 44, height: 44, borderRadius: 22, background: WT.gradPrimary, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 18 }}>🎤</div>
      </div>
    </div>
  );
};

/** Bolha solta (fora do celular), usada na abertura e na transformação. */
export const Bubble: React.FC<{ text?: string; audio?: string; orange?: boolean; style?: React.CSSProperties; scale?: number }> = ({ text, audio, orange, style, scale = 1 }) => (
  <div
    style={{
      fontFamily: body, fontSize: 26 * scale, fontWeight: 600, color: orange ? '#fff' : WT.ink, whiteSpace: 'nowrap',
      background: orange ? WT.gradPrimary : '#ffffff', border: orange ? 'none' : `1.5px solid ${WT.border}`,
      padding: `${14 * scale}px ${22 * scale}px`, borderRadius: 22 * scale, borderBottomLeftRadius: 6 * scale,
      boxShadow: orange ? `0 18px 40px ${rgba(WT.orange, 0.35)}` : '0 18px 40px rgba(17,24,39,0.12), 0 2px 6px rgba(17,24,39,0.06)',
      ...style,
    }}
  >
    {audio ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 * scale }}>
        <span style={{ width: 0, height: 0, borderLeft: `${14 * scale}px solid ${orange ? '#fff' : WT.orange}`, borderTop: `${9 * scale}px solid transparent`, borderBottom: `${9 * scale}px solid transparent` }} />
        <span style={{ display: 'inline-flex', gap: 3 * scale, alignItems: 'center' }}>
          {new Array(14).fill(0).map((_, i) => <span key={i} style={{ width: 3 * scale, height: (6 + rnd(i, 4) * 18) * scale, borderRadius: 2, background: orange ? '#fff' : '#9CA3AF' }} />)}
        </span>
        <span style={{ fontSize: 18 * scale, opacity: 0.7 }}>{audio}</span>
      </span>
    ) : (
      text
    )}
  </div>
);
