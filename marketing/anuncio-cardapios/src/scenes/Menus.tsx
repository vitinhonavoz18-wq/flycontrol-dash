import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { C, FPS, M, clamp, ease, f, ramp, wordAt } from '../lib';
import { Phone, hexA, screenSize } from '../components/Phone';
import { Clip } from '../components/Screen';
import { KLine, KWord, Sheen } from '../components/Kinetic';
import { body, display } from '../fonts';

const PW = 600;
const { sw, sh, bezel } = screenSize(PW);
const CY = 1000;

/** Sequência de clipes REAIS gravados em conectfly.com.br (início, fim no vídeo; nome do clipe). */
export const CUTS = [
  { a: M.fly1, b: 28.0, clip: 'al', store: 'Açaí e Love', glow: '#b8358f' },
  { a: 28.0, b: 30.3, clip: 'bj', store: 'Brasa do João', glow: '#ff8a00' },
  { a: 30.3, b: M.acai, clip: 'dp', store: 'Açaí Deus Proverá', glow: '#f5b301' },
  { a: M.acai, b: M.doce, clip: 'dp-acai', store: 'Açaí Deus Proverá', glow: '#f5b301', word: 'AÇAÍ' },
  { a: M.doce, b: M.hamburguer + 0.14, clip: 'dl-bueno', store: "D'lua Doces", glow: '#d98b86', word: 'DOCE' },
  { a: M.hamburguer + 0.14, b: M.pastel, clip: 'dp-burger', store: 'Açaí Deus Proverá', glow: '#f5b301', word: 'HAMBÚRGUER' },
  { a: M.pastel, b: M.cada, clip: 'ap-pasteis', store: 'Alpha Pastelaria', glow: '#ff9a00', word: 'PASTEL' },
];
export const MENUS_END = M.cada;

/** Cenas 4–5: o cardápio real surge da virada e os cinco estabelecimentos aparecem em sequência. */
export const Menus: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  if (t < M.fly1 - 0.05 || t > MENUS_END + 0.35) return null;
  const cut = CUTS.find((c) => t >= c.a && t < c.b) ?? CUTS[CUTS.length - 1];
  // revelação: rotação suave do celular depois do impacto
  const rev = ramp(t, M.fly1, M.fly1 + 0.9);
  const kick = CUTS.reduce((acc, c) => (t >= c.a && t < c.a + 0.6 && c.a > M.fly1 ? Math.sin((t - c.a) * 18) * (1 - (t - c.a) / 0.6) * 7 : acc), 0);
  const float = Math.sin(t * 1.1) * 8;
  const exit = interpolate(t, [MENUS_END - 0.05, MENUS_END + 0.3], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ perspective: 1600 }}>
      <div
        style={{
          position: 'absolute', left: 540 - PW / 2, top: CY - (sh + bezel * 2) / 2 + float,
          transform: `rotateY(${(1 - rev) * 28 + kick}deg) rotateX(${(1 - rev) * -6}deg) scale(${1 - exit * 0.4}) translateY(${exit * 200}px)`,
          transformStyle: 'preserve-3d', opacity: 1 - exit,
        }}
      >
        <Phone width={PW} glow={cut.glow} glowStrength={0.65}>
          {CUTS.map((c) => (
            <Sequence key={c.clip} from={f(c.a)} durationInFrames={f(c.b - c.a) + 9} layout="none">
              <CutLayer a={c.a}>
                <Clip name={c.clip} />
              </CutLayer>
            </Sequence>
          ))}
        </Phone>
      </div>
      <HeroBadge t={t} />
      <TopTitles t={t} />
    </AbsoluteFill>
  );
};

/** Troca de tela: o próximo cardápio entra deslizando em profundidade. */
const CutLayer: React.FC<{ a: number; children: React.ReactNode }> = ({ a, children }) => {
  const t = useCurrentFrame() / FPS; // relativo à Sequence
  const p = a <= M.fly1 + 0.01 ? 1 : interpolate(t, [0, 0.28], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ transform: `translateX(${(1 - p) * 100}%) scale(${0.9 + 0.1 * p})`, filter: `blur(${(1 - p) * 8}px)`, boxShadow: '-30px 0 60px rgba(0,0,0,0.6)' }}>
      {children}
    </AbsoluteFill>
  );
};

/** Destaque do diferencial: o VÍDEO de capa de cada cardápio. */
const HeroBadge: React.FC<{ t: number }> = ({ t }) => {
  const windows = [
    [M.fly1 + 0.7, 25.3],
    [28.15, 29.1],
    [30.45, 31.1],
  ];
  const w = windows.find(([a, b]) => t >= a - 0.1 && t <= b + 0.3);
  if (!w) return null;
  const p = interpolate(t, [w[0], w[0] + 0.3, w[1], w[1] + 0.3], [0, 1, 1, 0], clamp);
  const pulse = (t - w[0]) % 1.2;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: CY - sh / 2 - 34, display: 'flex', justifyContent: 'center', opacity: p, transform: `translateY(${(1 - p) * -20}px)` }}>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', inset: -6, borderRadius: 40, border: `3px solid ${C.gold}`, opacity: 1 - pulse / 1.2, transform: `scale(${1 + pulse * 0.25})` }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(10,10,12,0.78)', border: `2px solid ${hexA(C.gold, 0.9)}`, borderRadius: 40, padding: '10px 22px', fontFamily: display, fontWeight: 800, fontSize: 24, color: '#fff', letterSpacing: '0.08em', boxShadow: `0 0 30px ${hexA(C.fire, 0.6)}` }}>
          <span style={{ width: 0, height: 0, borderLeft: `16px solid ${C.fire}`, borderTop: '10px solid transparent', borderBottom: '10px solid transparent' }} />
          VÍDEO NA CAPA
          <span style={{ width: 10, height: 10, borderRadius: 5, background: '#ff3b30', opacity: Math.floor(t * 2) % 2 ? 1 : 0.3 }} />
        </div>
      </div>
    </div>
  );
};

const TopTitles: React.FC<{ t: number }> = ({ t }) => {
  const simples = wordAt('simples', 20);
  const moderno = wordAt('moderno', 20);
  const prof = wordAt('profissional', 20);
  return (
    <AbsoluteFill>
      {/* "FLYCONTROL" no impacto + simples / moderno / profissional */}
      <div style={{ position: 'absolute', top: 95, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <KWord text="FLYCONTROL" at={M.fly1} out={simples - 0.15} size={118} from="zoom" color="#fff" glow={C.fire} depthColor="#5a1d00" tracking={0.02} />
          <Sheen at={M.fly1 + 0.3} w={760} h={130} />
        </div>
      </div>
      <div style={{ position: 'absolute', top: 120, left: 40, right: 40, textAlign: 'center' }}>
        <KLine size={66} out={23.3} from="flip" words={[
          { text: 'SIMPLES.', at: simples },
          { text: 'MODERNO.', at: moderno, color: C.gold },
          { text: 'PROFISSIONAL.', at: prof, color: C.ember, glow: C.fire },
        ]} />
      </div>
      {/* nome de cada estabelecimento */}
      {CUTS.filter((c) => !c.word).map((c, i) => {
        const a = i === 0 ? M.imagine - 0.1 : c.a;
        return <StoreTitle key={c.clip} t={t} a={a} b={c.b} store={c.store} />;
      })}
      {/* açaí / doce / hambúrguer / pastel — no instante exato da palavra */}
      {CUTS.filter((c) => c.word).map((c) => (
        <div key={c.clip} style={{ position: 'absolute', top: 100, left: 0, right: 0, textAlign: 'center' }}>
          <KWord text={c.word!} at={c.a} out={c.b - 0.12} size={c.word!.length > 6 ? 104 : 128} from="slam" color="#fff" glow={c.glow} depthColor="#3a1400" />
          <SubTag t={t} a={c.a} b={c.b} text={c.store} />
        </div>
      ))}
    </AbsoluteFill>
  );
};

const StoreTitle: React.FC<{ t: number; a: number; b: number; store: string }> = ({ t, a, b, store }) => {
  if (t < a - 0.05 || t > b + 0.3) return null;
  return (
    <div style={{ position: 'absolute', top: 105, left: 0, right: 0, textAlign: 'center' }}>
      <KWord text={store.toUpperCase()} at={a} out={b - 0.1} size={store.length > 14 ? 72 : 84} from="up" color="#fff" depthColor="#2a1206" />
      <SubTag t={t} a={a + 0.15} b={b} text="cardápio real · FlyControl" />
    </div>
  );
};

const SubTag: React.FC<{ t: number; a: number; b: number; text: string }> = ({ t, a, b, text }) => {
  const p = interpolate(t, [a, a + 0.25, b - 0.15, b], [0, 1, 1, 0], clamp);
  return (
    <div style={{ marginTop: 18, opacity: p, transform: `translateY(${(1 - p) * 10}px)` }}>
      <span style={{ fontFamily: body, fontWeight: 600, fontSize: 28, color: '#fff', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', padding: '8px 20px', borderRadius: 30, letterSpacing: '0.04em' }}>
        {text}
      </span>
    </div>
  );
};
