import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile } from 'remotion';
import { WT, clamp, ease, easeInOut, rgba } from '../lib';
import { L3D, W3D } from '../Type3D';
import { LightSweep } from '../Studio';
import { ContactShadow } from '../Devices';
import { PRECO_CENTS, brl, get, pct, restante, taxaPedido, totalPb } from '../calculos';
import { COR, Contador, Etiqueta, NotaDividida, Pct, Rodape, VooDeMoedas, useCena } from '../Money';
import { body, display } from '../fonts';

/** Hambúrguer de exemplo (foto real recortada), flutuando com sombra e leve giro 3D. */
export const Burger: React.FC<{ w: number; x: number; y: number; rot?: number; t: number; o?: number; shadow?: boolean }> = ({ w, x, y, rot = 0, t, o = 1, shadow = true }) => {
  const h = w * (647 / 818);
  const bob = Math.sin(t * 1.6 + x) * 8;
  return (
    <>
      {shadow && <ContactShadow x={x} y={y + h * 0.55} w={w * 0.9} o={o * 0.9} />}
      <div style={{ position: 'absolute', left: x - w / 2, top: y - h / 2 + bob, width: w, height: h, opacity: o, transform: `perspective(1200px) rotateY(${rot}deg) rotateX(6deg)`, filter: 'drop-shadow(0 30px 40px rgba(17,24,39,0.22))' }}>
        <Img src={staticFile('produtos/hamburguer.png')} style={{ width: '100%', height: '100%' }} />
      </div>
    </>
  );
};

/** CENA 1 — o mesmo hambúrguer, três canais. */
export const Cena1: React.FC = () => {
  const c = useCena('s1');
  if (!c || !c.ativa) return null;
  const { L, t } = c;
  const split = interpolate(L, [1.7, 2.4], [0, 1], { ...clamp, easing: easeInOut });
  const out = interpolate(L, [4.6, 5.2], [0, 1], clamp);
  const ids = ['ifood', '99food', 'flycontrol'] as const;
  const labels = [['iFood', 'Plano Entrega'], ['99Food', 'Entrega pela 99'], ['Venda direta', 'FlyControl']];
  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      {ids.map((id, i) => {
        const x = 540 + (i - 1) * 330 * split;
        const w = 640 - 330 * split;
        const rot = Math.sin(L * 0.9) * 14 * (1 - split) + (i - 1) * -10 * split;
        if (i !== 1 && split <= 0) return null;
        return <Burger key={id} w={w} x={x} y={860 - split * 40} rot={rot} t={t} o={i === 1 ? 1 : split} />;
      })}
      {ids.map((id, i) => {
        const p = interpolate(L, [2.4 + i * 0.3, 2.7 + i * 0.3], [0, 1], { ...clamp, easing: ease });
        if (p <= 0) return null;
        return (
          <div key={id} style={{ position: 'absolute', left: 540 + (i - 1) * 330 - 150, top: 1060, width: 300, textAlign: 'center', opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
            <div style={{ margin: '0 auto', width: 260, padding: '18px 0', borderRadius: 26, background: 'rgba(255,255,255,0.92)', border: `2px solid ${rgba(COR[id], 0.55)}`, boxShadow: `0 18px 40px ${rgba(COR[id], 0.18)}` }}>
              <div style={{ width: 16, height: 16, borderRadius: 8, background: COR[id], margin: '0 auto 8px' }} />
              <div style={{ fontFamily: display, fontWeight: 900, fontSize: 30, color: WT.ink }}>{labels[i][0]}</div>
              <div style={{ fontFamily: body, fontWeight: 600, fontSize: 22, color: WT.muted, marginTop: 4 }}>{labels[i][1]}</div>
            </div>
          </div>
        );
      })}
      <LightSweep at={c.a + 0.35} dur={0.9} strength={0.25} />
      <div style={{ position: 'absolute', top: 262, left: 40, right: 40, textAlign: 'center' }}>
        <W3D text="O MESMO HAMBÚRGUER." at={c.a + 0.5 / (c.nom / (c.b - c.a))} size={68} />
        <div style={{ height: 14 }} />
        <L3D size={62} words={[{ text: 'MAS QUANTO', at: c.a + 2.0 / (c.nom / (c.b - c.a)) }, { text: 'SOBRA', at: c.a + 2.15 / (c.nom / (c.b - c.a)), orange: true }, { text: 'DA VENDA?', at: c.a + 2.3 / (c.nom / (c.b - c.a)) }]} />
      </div>
      <Rodape L={L} a={0.6} b={4.8}>Exemplo ilustrativo: um pedido de R$ 26,00.<br />iFood e 99Food são marcas de seus titulares, citadas só para comparação.</Rodape>
    </AbsoluteFill>
  );
};

/** CENAS 2 e 3 — um cenário de marketplace: preço, percentuais, nota dividida, moedas e o que sobra. */
export const CenaTaxa: React.FC<{ id: 'ifood' | '99food'; cena: 's2' | 's3' }> = ({ id, cena }) => {
  const c = useCena(cena);
  if (!c || !c.ativa) return null;
  const { L, t } = c;
  const cen = get(id);
  const cor = COR[id];
  const taxa = taxaPedido(cen);
  const sobra = restante(cen);
  const k = c.nom / (c.b - c.a);
  const T = (x: number) => c.a + x / k; // tempo nominal → tempo do vídeo (para os textos 3D)
  const inn = interpolate(L, [0, 0.6], [0, 1], { ...clamp, easing: ease });
  const out = interpolate(L, [c.nom - 0.45, c.nom + 0.05], [0, 1], { ...clamp, easing: easeInOut });
  const enterX = id === 'ifood' ? 0 : (1 - inn) * 900; // 99Food entra de lado
  const partes = cen.partesPb!;
  const label = id === 'ifood' ? 'Exemplo: iFood · Plano Entrega' : 'Exemplo: 99Food · entrega pela 99';
  return (
    <AbsoluteFill style={{ opacity: inn * (1 - out), transform: `translateX(${enterX - out * 700}px)` }}>
      <Burger w={400} x={540} y={560} rot={Math.sin(L) * 8} t={t} />
      <div style={{ position: 'absolute', top: 262, left: 0, right: 0, textAlign: 'center' }}>
        <Etiqueta L={L} at={0.5} cor={cor}>{label}</Etiqueta>
      </div>
      {/* preço → o que sobra */}
      <div style={{ position: 'absolute', top: 770, left: 0, right: 0, textAlign: 'center', opacity: interpolate(L, [0.4, 0.8], [0, 1], clamp) }}>
        <div style={{ fontFamily: body, fontWeight: 700, fontSize: 28, color: WT.muted }}>{L < 3.8 ? 'Preço do pedido' : 'Valor após essas taxas'}</div>
        <Contador L={L} de={PRECO_CENTS} ate={sobra} at={3.8} dur={1.25} style={{ fontFamily: display, fontWeight: 900, fontSize: 120, color: L < 3.8 ? WT.ink : L > 5.0 ? WT.ink : rgba(WT.ink, 0.85), letterSpacing: '-0.02em' }} />
      </div>
      {/* percentuais */}
      <div style={{ position: 'absolute', top: 990, left: 40, right: 40, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: 24 }}>
        <Pct L={L} at={1.5} valor={pct(partes[0].pb)} rotulo={partes[0].rotulo} cor={cor} size={84} />
        <div style={{ fontFamily: display, fontWeight: 900, fontSize: 70, color: WT.muted, opacity: L > 2.4 ? 1 : 0, marginTop: 4 }}>+</div>
        <Pct L={L} at={2.4} valor={pct(partes[1].pb)} rotulo={partes[1].rotulo} cor={cor} size={84} />
      </div>
      <div style={{ position: 'absolute', top: 1150, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        {L >= 3.3 && L < 3.95 ? <Pct L={L} at={3.3} valor={'= ' + pct(totalPb(cen))} rotulo="total neste cenário" cor={cor} size={104} /> : null}
      </div>
      {/* nota de R$ 26,00 se divide; a parte da taxa vira moedas */}
      <div style={{ position: 'absolute', top: 1170, left: 110, opacity: interpolate(L, [3.75, 3.95], [0, 1], clamp) }}>
        <NotaDividida L={L} at={3.85} precoCents={PRECO_CENTS} taxaCents={taxa} cor={cor} w={620} h={110} />
      </div>
      <VooDeMoedas L={L} at={4.2} n={id === 'ifood' ? 9 : 5} from={[720, 1220]} to={[880, 1300]} size={58} />
      <div style={{ position: 'absolute', left: 760, width: 260, top: 1330, textAlign: 'center', opacity: interpolate(L, [4.3, 4.6], [0, 1], clamp) }}>
        <div style={{ fontFamily: body, fontWeight: 700, fontSize: 24, color: cor }}>taxas</div>
        <Contador L={L} de={0} ate={taxa} at={4.2} dur={1.0} style={{ fontFamily: display, fontWeight: 900, fontSize: 44, color: cor }} />
      </div>
      <div style={{ position: 'absolute', left: 110, width: 600, top: 1300, opacity: interpolate(L, [5.1, 5.4], [0, 1], clamp) }}>
        <span style={{ fontFamily: body, fontWeight: 700, fontSize: 30, color: WT.ink }}>
          {brl(PRECO_CENTS)} − {brl(taxa)} = <b style={{ color: WT.ink }}>{brl(sobra)}</b>
        </span>
      </div>
      <Rodape L={L} a={1.0} b={c.nom - 0.3} top={1430}>
        {id === 'ifood' ? (
          <>iFood · Plano Entrega (parceiros.ifood.com.br, consulta em 15/10/2026): 23% de comissão sobre pedidos delivery + 3,2% em pedidos pagos via iFood. Não inclui a mensalidade de R$ 150 (cobrada acima de R$ 1.800/mês de faturamento). Valores variam por contrato e forma de pagamento.</>
        ) : (
          <>99Food · entrega pela 99 (merchant.99app.com, consulta em 15/10/2026): 8,9% de comissão + 3,2% de intermediação quando o cliente paga na plataforma. Custos logísticos por km não incluídos. Taxas e benefícios variam conforme contrato.</>
        )}
      </Rodape>
    </AbsoluteFill>
  );
};
