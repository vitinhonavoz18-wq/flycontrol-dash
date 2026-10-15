import React from 'react';
import { AbsoluteFill, Img, Loop, OffthreadVideo, Sequence, interpolate, staticFile } from 'remotion';
import { WT, clamp, ease, easeIn, easeInOut, f, rgba, rnd } from '../lib';
import { GlassChip, W3D } from '../Type3D';
import { ImpactRing, LightSweep } from '../Studio';
import { ContactShadow, Phone3D, phoneDims } from '../Devices';
import { PRECO_CENTS, brl, get, precoParaPreservar, restante, taxaPedido } from '../calculos';
import { COR, Contador, Etiqueta, Moeda, NotaDividida, Pct, Rodape, useCena } from '../Money';
import { body, display } from '../fonts';

/** Cartão com o resultado de um cenário (o que sobra dos R$ 26,00). */
const Resultado: React.FC<{ id: 'ifood' | '99food'; w: number; h: number }> = ({ id, w, h }) => {
  const cen = get(id);
  return (
    <div style={{ width: w, height: h, borderRadius: 32, background: 'rgba(255,255,255,0.96)', border: `2px solid ${rgba(COR[id], 0.5)}`, boxShadow: `0 26px 50px ${rgba(COR[id], 0.16)}, 0 8px 18px rgba(17,24,39,0.08)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 16, height: 16, borderRadius: 8, background: COR[id] }} />
        <span style={{ fontFamily: display, fontWeight: 900, fontSize: 34, color: WT.ink }}>{cen.nome}</span>
      </div>
      <div style={{ fontFamily: body, fontWeight: 600, fontSize: 22, color: WT.muted, marginTop: 2 }}>{cen.plano}</div>
      <div style={{ fontFamily: body, fontWeight: 700, fontSize: 22, color: WT.ink, marginTop: 18 }}>valor após as taxas</div>
      <div style={{ fontFamily: display, fontWeight: 900, fontSize: 74, color: WT.ink, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{brl(restante(cen))}</div>
      <div style={{ fontFamily: body, fontWeight: 600, fontSize: 22, color: WT.muted }}>de {brl(PRECO_CENTS)}</div>
    </div>
  );
};

/** CENA 4 — congela os dois resultados, a pergunta, e os cartões se partem em fragmentos. */
export const Cena4: React.FC = () => {
  const c = useCena('s4');
  if (!c || !c.ativa) return null;
  const { L } = c;
  if (L < 0) return null;
  const k = c.nom / (c.b - c.a);
  const T = (x: number) => c.a + x / k;
  const W = 440, H = 320, FR = 2.6;
  const slam = interpolate(L, [0, 0.12, 0.24, 0.36], [1.18, 0.97, 1.02, 1], clamp);
  const flash = interpolate(L, [0, 0.04, 0.4], [0, 0.85, 0], clamp);
  const push = interpolate(L, [0, FR], [1, 1.06], clamp);
  const q = interpolate(L, [FR, FR + 1.0], [0, 1], { ...clamp, easing: easeIn });
  const out = interpolate(L, [c.nom - 0.3, c.nom], [0, 1], clamp);
  const cards: { id: 'ifood' | '99food'; cx: number }[] = [{ id: 'ifood', cx: 290 }, { id: '99food', cx: 790 }];
  const COLS = 4, ROWS = 3;
  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      <AbsoluteFill style={{ perspective: 1400, transform: `scale(${push})` }}>
        {cards.map(({ id, cx }) => {
          const top = 820;
          if (L < FR) {
            return (
              <div key={id} style={{ position: 'absolute', left: cx - W / 2, top, transform: `scale(${slam})`, filter: 'saturate(0.85)' }}>
                <Resultado id={id} w={W} h={H} />
              </div>
            );
          }
          // fragmentos: o mesmo cartão recortado em pedaços que voam para o centro e para a profundidade
          return new Array(COLS * ROWS).fill(0).map((_, i) => {
            const col = i % COLS, row = Math.floor(i / COLS);
            const x0 = (col / COLS) * W, y0 = (row / ROWS) * H;
            const px = cx - W / 2 + x0 + W / COLS / 2, py = top + y0 + H / ROWS / 2;
            const dx = (540 - px) * 0.9 + (rnd(i, id === 'ifood' ? 3 : 5) - 0.5) * 260;
            const dy = (980 - py) * 0.8 + (rnd(i, 7) - 0.5) * 300;
            const qq = Math.max(0, Math.min(1, q * (1 + rnd(i, 9) * 0.5)));
            return (
              <div
                key={id + i}
                style={{
                  position: 'absolute', left: cx - W / 2, top, width: W, height: H,
                  clipPath: `inset(${y0}px ${W - x0 - W / COLS}px ${H - y0 - H / ROWS}px ${x0}px)`,
                  transformOrigin: `${x0 + W / COLS / 2}px ${y0 + H / ROWS / 2}px`,
                  transform: `translate3d(${dx * qq}px, ${dy * qq}px, ${-qq * 900}px) rotateX(${qq * (rnd(i, 11) - 0.5) * 300}deg) rotateY(${qq * (rnd(i, 13) - 0.5) * 300}deg) scale(${1 - qq * 0.5})`,
                  opacity: 1 - qq,
                }}
              >
                <Resultado id={id} w={W} h={H} />
              </div>
            );
          });
        })}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: '#fff', opacity: flash, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 262, left: 30, right: 30, textAlign: 'center' }}>
        <W3D text="E SE VOCÊ VENDESSE" at={T(0.4)} size={72} out={T(c.nom - 0.35)} />
        <div style={{ height: 6 }} />
        <W3D text="PELO SEU" at={T(1.0)} size={72} out={T(c.nom - 0.35)} />
        <div style={{ height: 6 }} />
        <W3D text="PRÓPRIO CARDÁPIO?" at={T(1.6)} size={80} orange from="slam" out={T(c.nom - 0.35)} />
      </div>
      <Rodape L={L} a={0.3} b={FR} top={1200}>Resultados do exemplo de R$ 26,00 nos dois marketplaces.</Rodape>
    </AbsoluteFill>
  );
};

const Vid: React.FC<{ src: string }> = ({ src }) => (
  <Loop durationInFrames={150} layout="none">
    <OffthreadVideo src={staticFile(`clips/${src}.mp4`)} muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
  </Loop>
);

/** CENA 5 — a virada: fragmentos convergem, impacto laranja, o cardápio próprio e a conta do Plano CENTS. */
export const Cena5: React.FC = () => {
  const c = useCena('s5');
  if (!c || !c.ativa) return null;
  const { L, t } = c;
  const k = c.nom / (c.b - c.a);
  const T = (x: number) => c.a + x / k;
  const fly = get('flycontrol');
  const taxa = taxaPedido(fly);
  const sobra = restante(fly);
  const conv = interpolate(L, [-0.5, 0.5], [0, 1], { ...clamp, easing: easeIn });
  const pop = interpolate(L, [0.45, 1.15], [0, 1], { ...clamp, easing: ease });
  const side = interpolate(L, [2.0, 2.6], [0, 1], { ...clamp, easing: easeInOut });
  const out = interpolate(L, [c.nom - 0.4, c.nom + 0.05], [0, 1], { ...clamp, easing: easeInOut });
  const PW0 = 400;
  const S = 1 - side * 0.2;
  const px = 540 - side * 255;
  const py = 900 - side * 20;
  const { h: PH } = phoneDims(PW0);
  const col = interpolate(L, [2.5, 2.85], [0, 1], clamp);
  const coin = interpolate(L, [3.5, 4.05], [0, 1], { ...clamp, easing: easeIn });
  // logotipo: grande no centro (impacto) → menor, acima do celular
  // 2º momento (só onde a cena tem tempo): quanto o pedido custaria para sobrar R$ 26,00
  const beat2 = c.nom > 6.5;
  const b2 = beat2 ? interpolate(L, [5.5, 5.8], [0, 1], clamp) : 0;
  const logoP = interpolate(L, [0.8, 1.3], [0, 1], { ...clamp, easing: ease });
  const logoW = 300 - side * 80;
  const logoX = 540 - side * 255;
  const logoY = 300 + side * 140;
  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      {/* fragmentos laranja convergindo para o centro */}
      {conv < 1 &&
        new Array(26).fill(0).map((_, i) => {
          const a = rnd(i, 21) * Math.PI * 2;
          const r = (1 - conv) * (500 + rnd(i, 23) * 600);
          const s = 18 + rnd(i, 25) * 40;
          return (
            <div key={i} style={{ position: 'absolute', left: 540 + Math.cos(a) * r - s / 2, top: 900 + Math.sin(a) * r - s / 2, width: s, height: s * 0.7, background: i % 3 ? WT.gradPrimary : '#fff', border: `1px solid ${rgba(WT.orange, 0.4)}`, borderRadius: 6, transform: `rotate(${(1 - conv) * 400 + i * 30}deg)`, opacity: Math.min(1, (1 - conv) * 3) * 0.9, boxShadow: `0 0 20px ${rgba(WT.orange, 0.4)}` }} />
          );
        })}
      <LightSweep at={T(0.05)} dur={0.7 / k} strength={0.45} />
      <ImpactRing at={T(0.5)} cx={540} cy={900} />
      {/* celular com cardápio real (Açaí Deus Proverá, vídeo de capa do próprio site) */}
      <AbsoluteFill style={{ perspective: 1600 }}>
        <ContactShadow x={px} y={py + (PH * S) / 2 + 26} w={PW0 * S} o={pop * 0.8} />
        <div style={{ position: 'absolute', left: px - PW0 / 2, top: py - PH / 2, transform: `scale(${S * (0.6 + 0.4 * pop)}) translateY(${Math.sin(t * 1.4) * 6}px)`, transformStyle: 'preserve-3d' }}>
          <Phone3D width={PW0} rotY={-180 * (1 - pop) + side * 14} opacity={Math.min(1, pop * 2)} glow={0.5} reflect={false}>
            <Sequence from={f(T(0.45))} layout="none"><Vid src="hero-dp" /></Sequence>
          </Phone3D>
        </div>
      </AbsoluteFill>
      {/* logotipo oficial */}
      <div style={{ position: 'absolute', left: logoX - logoW / 2, top: logoY - logoW / 2, width: logoW, height: logoW, opacity: logoP, transform: `scale(${0.7 + 0.3 * logoP})` }}>
        <div style={{ position: 'absolute', inset: '-20%', background: `radial-gradient(circle, ${rgba(WT.amber, 0.3)} 0%, transparent 62%)` }} />
        <Img src={staticFile('brand/flycontrol-logo.webp')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', filter: 'drop-shadow(0 14px 22px rgba(17,24,39,0.18))' }} />
      </div>
      {/* etiqueta do cenário */}
      <div style={{ position: 'absolute', top: 262, left: 0, right: 0, textAlign: 'center', opacity: side }}>
        <Etiqueta L={L} at={2.4} cor={COR.flycontrol} size={28}>Exemplo: venda direta · FlyControl · Plano CENTS</Etiqueta>
      </div>
      <AbsoluteFill style={{ opacity: 1 - b2 }}>
      {/* coluna da conta */}
      <div style={{ position: 'absolute', left: 560, width: 470, top: 470, textAlign: 'center', opacity: col }}>
        <div style={{ fontFamily: body, fontWeight: 700, fontSize: 28, color: WT.muted }}>{L < 3.4 ? 'Preço do pedido' : 'Valor após a taxa'}</div>
        <Contador L={L} de={PRECO_CENTS} ate={sobra} at={3.4} dur={1.0} style={{ fontFamily: display, fontWeight: 900, fontSize: 88, color: WT.ink, letterSpacing: '-0.02em' }} />
      </div>
      <div style={{ position: 'absolute', left: 560, width: 470, top: 640, display: 'flex', justifyContent: 'center' }}>
        <Pct L={L} at={2.9} valor={brl(taxa)} rotulo="por pedido aceito" cor={COR.flycontrol} size={80} />
      </div>
      <div style={{ position: 'absolute', left: 575, top: 830, opacity: interpolate(L, [3.2, 3.35], [0, 1], clamp) }}>
        <NotaDividida L={L} at={3.3} precoCents={PRECO_CENTS} taxaCents={taxa} cor={COR.flycontrol} w={440} h={96} />
      </div>
      {L >= 3.5 && (
        <div style={{ position: 'absolute', left: 990 - 30 + (930 - 990) * coin, top: 878 - 30 + (1010 - 878) * coin - Math.sin(Math.PI * coin) * 120, transform: coin >= 1 ? 'scaleY(0.42)' : `rotate(${coin * 200}deg)` }}>
          <Moeda size={60} spin={coin >= 1 ? 0 : coin * 720} />
        </div>
      )}
      <div style={{ position: 'absolute', left: 600, width: 260, top: 985, textAlign: 'center', opacity: interpolate(L, [3.7, 4.0], [0, 1], clamp) }}>
        <div style={{ fontFamily: body, fontWeight: 700, fontSize: 24, color: COR.flycontrol }}>taxa FlyControl</div>
        <Contador L={L} de={0} ate={taxa} at={3.6} dur={0.6} style={{ fontFamily: display, fontWeight: 900, fontSize: 44, color: COR.flycontrol }} />
      </div>
      </AbsoluteFill>
      {beat2 && <Preservar L={L} />}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1262, textAlign: 'center', opacity: interpolate(L, [4.5, 4.75], [0, 1], clamp), transform: `translateY(${(1 - interpolate(L, [4.5, 4.75], [0, 1], clamp)) * 16}px)` }}>
        <span style={{ fontFamily: body, fontWeight: 700, fontSize: 38, color: WT.ink }}>
          {brl(PRECO_CENTS)} − {brl(taxa)} = <b style={{ fontFamily: display, fontWeight: 900, color: COR.flycontrol }}>{brl(sobra)}</b>
        </span>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1330, display: 'flex', justifyContent: 'center' }}>
        <GlassChip t={L} a={4.8} b={c.nom - 0.2} dot size={24}>R$ 0,70 por pedido aceito · primeiros 100 do mês · sem mensalidade</GlassChip>
      </div>
      <Rodape L={L} a={2.6} b={beat2 ? 5.65 : c.nom - 0.25} top={1420}>
        Plano CENTS (tabela vigente desde 27/08/2026): R$ 0,70 por pedido aceito do 1º ao 100º do ciclo mensal; depois R$ 0,60, R$ 0,50 e R$ 0,40 por faixa. Sem cadastro pago nem mensalidade. Recusados, cancelados e testes não são cobrados. Pagamento e entrega ficam com o estabelecimento; maquininha/Pix à parte.
      </Rodape>
      {beat2 && (
        <Rodape L={L} a={5.7} b={c.nom - 0.25} top={1420}>
          Preço mínimo para sobrar R$ 26,00 depois só das taxas do exemplo (iFood 26,2%; 99Food 12,1%; FlyControl R$ 0,70), arredondado ao centavo. É um preço calculado para compensar as taxas, não o preço praticado nos aplicativos.
        </Rodape>
      )}
    </AbsoluteFill>
  );
};

/** Cenário B: preço necessário para preservar R$ 26,00 depois das taxas de cada cenário. */
const Preservar: React.FC<{ L: number }> = ({ L }) => {
  const p = interpolate(L, [5.6, 5.95], [0, 1], { ...clamp, easing: ease });
  if (p <= 0) return null;
  const linhas = (['ifood', '99food', 'flycontrol'] as const).map((id) => ({ id, cen: get(id), preco: precoParaPreservar(get(id), PRECO_CENTS) }));
  return (
    <div style={{ position: 'absolute', left: 560, width: 470, top: 480, opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
      <div style={{ fontFamily: body, fontWeight: 700, fontSize: 28, color: WT.muted, textAlign: 'center', lineHeight: 1.25 }}>Para sobrar {brl(PRECO_CENTS)},<br />o pedido custaria:</div>
      {linhas.map((l, i) => {
        const q = interpolate(L, [5.8 + i * 0.18, 6.1 + i * 0.18], [0, 1], { ...clamp, easing: ease });
        const isF = l.id === 'flycontrol';
        return (
          <div key={l.id} style={{ marginTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderRadius: 26, whiteSpace: 'nowrap', background: 'rgba(255,255,255,0.95)', border: `2px solid ${rgba(COR[l.id], isF ? 0.7 : 0.4)}`, boxShadow: isF ? WT.shadowGlow : '0 12px 26px rgba(17,24,39,0.08)', opacity: q, transform: `translateX(${(1 - q) * 60}px)` }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 14, height: 14, borderRadius: 7, background: COR[l.id] }} />
                <span style={{ fontFamily: display, fontWeight: 900, fontSize: 28, color: WT.ink }}>{l.cen.nome}</span>
              </div>
              <div style={{ fontFamily: body, fontWeight: 600, fontSize: 20, color: WT.muted, marginLeft: 24 }}>{l.cen.plano}</div>
            </div>
            <span style={{ fontFamily: display, fontWeight: 900, fontSize: 42, color: isF ? WT.orange : WT.ink, fontVariantNumeric: 'tabular-nums' }}>{brl(l.preco)}</span>
          </div>
        );
      })}
    </div>
  );
};
