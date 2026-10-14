import React from 'react';
import { interpolate } from 'remotion';
import { C, M, clamp, ease, rnd } from '../lib';
import { body } from '../fonts';

/**
 * Conversa FICTÍCIA de mensageiro (simulação do "antes").
 * Desenhada em 390x844 (mesmo tamanho lógico das telas reais) e escalada pela moldura.
 * Não usa marca nem logotipo de nenhum aplicativo real.
 */
type Msg = { at: number; text?: string; me?: boolean; audio?: string; tag?: 'preco' | 'audio' | 'troca' | 'trocado' };
export const MSGS: Msg[] = [
  { at: -1, text: 'Olá! Seja bem-vinda 😊 Como posso ajudar?', me: true },
  { at: 5.9, text: 'oii, boa noite!' },
  { at: 6.4, text: 'quanto fica 2 duplo cheddar e uma batata?', tag: 'preco' },
  { at: 7.05, text: 'tem x bacon também?' },
  { at: 7.55, text: 'Boa noite! Só um minutinho, vou ver aqui 🙏', me: true },
  { at: 8.0, audio: '0:28', tag: 'audio' },
  { at: 8.65, text: 'ah, sem cebola em um' },
  { at: 9.2, text: 'na verdade, troca a batata por milkshake', tag: 'troca' },
  { at: 9.75, text: 'faz um de morango' },
  { at: 10.25, text: 'e coloca maionese extra também, por favor' },
  { at: 10.6, audio: '0:17' },
  { at: 10.9, text: 'e o endereço é…' },
  { at: 11.1, text: 'ah, espera' },
  { at: 11.3, text: 'na verdade é outro endereço' },
  { at: 11.45, text: '??' },
  { at: 11.6, text: 'oi?' },
  { at: 11.72, text: 'tá aí?' },
  { at: 11.84, text: 'moço???' },
  { at: 11.95, text: 'muda o refri pra zero' },
  { at: 12.05, text: 'esquece o milkshake' },
  { at: 12.15, text: 'volta a batata kkk' },
  { at: 12.24, text: '🙄' },
];
const lineH = 19;
const charsPerLine = 30;
const msgH = (m: Msg) => (m.audio ? 50 : 18 + Math.ceil((m.text!.length + 6) / charsPerLine) * lineH) + 6;

const Wave: React.FC<{ t: number; playing: boolean; seed: number }> = ({ t, playing, seed }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 26 }}>
    {new Array(28).fill(0).map((_, i) => {
      const base = 4 + rnd(i, seed) * 18;
      const live = playing ? 0.55 + 0.45 * Math.abs(Math.sin(t * 9 + i * 0.7)) : 1;
      return <div key={i} style={{ width: 3, height: base * live, borderRadius: 2, background: playing ? '#8be9c6' : '#9fb0b8' }} />;
    })}
  </div>
);

export const ChatScreen: React.FC<{ t: number }> = ({ t }) => {
  const visible = MSGS.filter((m) => t >= m.at);
  // auto-rolagem: a conversa sobe conforme chegam mensagens
  const total = visible.reduce((s, m) => s + msgH(m), 0);
  const area = 844 - 92 - 64;
  const lastAt = visible.length ? visible[visible.length - 1].at : 0;
  const lastH = visible.length ? msgH(visible[visible.length - 1]) : 0;
  const slide = interpolate(t, [lastAt, lastAt + 0.18], [lastH, 0], { ...clamp, easing: ease });
  const scroll = Math.max(0, total - area) - (total > area ? Math.min(slide, total - area) : 0);
  const nowPlaying = t >= M.audio && t < M.audio + 1.6;
  const strike = interpolate(t, [M.mudaPedido, M.mudaPedido + 0.35], [0, 1], clamp);
  let y = 0;
  return (
    <div style={{ width: 390, height: 844, background: C.chatBg, fontFamily: body, position: 'relative', overflow: 'hidden' }}>
      {/* fundo com textura */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.06, backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
      {/* cabeçalho */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 92, background: '#1f2c34', display: 'flex', alignItems: 'flex-end', padding: '0 14px 12px', gap: 10, zIndex: 3 }}>
        <div style={{ color: '#d1d7db', fontSize: 22 }}>←</div>
        <div style={{ width: 38, height: 38, borderRadius: 19, background: '#6b7c85', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700 }}>M</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#e9edef', fontWeight: 600, fontSize: 17 }}>Mariana</div>
          <div style={{ color: '#8696a0', fontSize: 12 }}>{(t > 2.5 && t < 5.9) || (t > 9 && Math.floor(t * 4) % 2) ? 'digitando…' : 'online'}</div>
        </div>
        <div style={{ color: '#aebac1', fontSize: 18, letterSpacing: 10 }}>⌕ ⋮</div>
      </div>
      {/* mensagens */}
      <div style={{ position: 'absolute', top: 92, left: 0, right: 0, bottom: 64, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, transform: `translateY(${-scroll}px)` }}>
          {visible.map((m, i) => {
            const top = y;
            y += msgH(m);
            const pop = interpolate(t, [m.at, m.at + 0.2], [0, 1], { ...clamp, easing: ease });
            const hiPreco = m.tag === 'preco' ? interpolate(t, [M.preco, M.preco + 0.2, M.preco + 1.3, M.preco + 1.7], [0, 1, 1, 0], clamp) : 0;
            const hiAudio = m.tag === 'audio' ? interpolate(t, [M.audio, M.audio + 0.2, M.audio + 1.4, M.audio + 1.8], [0, 1, 1, 0], clamp) : 0;
            const hiTroca = m.tag === 'troca' ? interpolate(t, [M.mudaPedido, M.mudaPedido + 0.2, M.mudaPedido + 1.4, M.mudaPedido + 1.8], [0, 1, 1, 0], clamp) : 0;
            const hi = Math.max(hiPreco, hiAudio, hiTroca);
            const bg = m.me ? C.chatOut : C.chatIn;
            return (
              <div key={i} style={{ position: 'absolute', top: top + 4, left: 0, right: 0, display: 'flex', justifyContent: m.me ? 'flex-end' : 'flex-start', padding: '0 10px' }}>
                <div
                  style={{
                    maxWidth: 290, background: bg, color: '#e9edef', borderRadius: 10, padding: m.audio ? '8px 10px' : '6px 10px 7px',
                    fontSize: 15.5, lineHeight: `${lineH}px`, transformOrigin: m.me ? '100% 100%' : '0% 100%',
                    transform: `scale(${0.6 + 0.4 * pop}) translateX(${m.tag === 'troca' ? (1 - pop) * -80 : 0}px) scale(${1 + hi * 0.06})`,
                    opacity: pop, position: 'relative',
                    boxShadow: hi ? `0 0 0 2px ${C.gold}, 0 0 24px ${C.fire}` : '0 1px 1px rgba(0,0,0,0.3)',
                  }}
                >
                  {m.audio ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 0, height: 0, borderLeft: '13px solid #aebac1', borderTop: '8px solid transparent', borderBottom: '8px solid transparent', opacity: m.tag === 'audio' && nowPlaying ? 0.3 : 1 }} />
                      <Wave t={t} playing={m.tag === 'audio' && nowPlaying} seed={i} />
                      <span style={{ fontSize: 11, color: '#8696a0' }}>{m.audio}</span>
                    </div>
                  ) : m.tag === 'preco' ? (
                    <span>
                      quanto fica 2 duplo cheddar e{' '}
                      <span style={{ position: 'relative' }}>
                        uma batata
                        <span style={{ position: 'absolute', left: 0, top: '52%', height: 2, width: `${strike * 100}%`, background: '#ff6b5b' }} />
                      </span>
                      ?
                    </span>
                  ) : (
                    m.text
                  )}
                  <span style={{ fontSize: 10, color: '#8696a0', marginLeft: 8, float: 'right', marginTop: 6 }}>
                    21:{String(14 + Math.floor(i / 3)).padStart(2, '0')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* barra de digitação */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 64, display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
        <div style={{ flex: 1, height: 44, borderRadius: 22, background: '#1f2c34', color: '#8696a0', display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: 16 }}>Mensagem</div>
        <div style={{ width: 44, height: 44, borderRadius: 22, background: '#00a884', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 18 }}>🎤</div>
      </div>
    </div>
  );
};

/** Banners de notificação empilhando no topo (excesso de mensagens). */
export const NotifStack: React.FC<{ t: number }> = ({ t }) => {
  const list = MSGS.filter((m) => m.at >= 10.25 && t >= m.at && !m.me).slice(-4);
  return (
    <div style={{ position: 'absolute', top: 10, left: 10, right: 10, zIndex: 5 }}>
      {list.map((m, i) => {
        const p = interpolate(t, [m.at, m.at + 0.15], [0, 1], { ...clamp, easing: ease });
        return (
          <div
            key={m.at}
            style={{
              marginTop: i ? -46 : 0, transform: `translateY(${(1 - p) * -60 + i * 8}px) scale(${0.94 + i * 0.02})`, opacity: p,
              background: 'rgba(40,44,48,0.92)', borderRadius: 18, padding: '10px 14px', color: '#fff', fontFamily: body, fontSize: 13,
              boxShadow: '0 8px 20px rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 12, opacity: 0.8 }}>Mariana · agora</div>
            <div>{m.text ?? '🎤 Mensagem de voz'}</div>
          </div>
        );
      })}
    </div>
  );
};
