import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Bot, ReceiptText } from "lucide-react";
import { Avatar, IconeWhats, SeloFly } from "../comp/Pecas";
import { SeloIA } from "../comp/Painel";
import { COR, FONTE, entraSai, iv, onda, pop, suave } from "../estilo";
import T from "../tempos.json";

const [INI, FIM] = T.cenas.c5;
const E = T.c5;

type No = { cx: number; cy: number; z: number; w: number; h: number };
const NOS: No[] = [
  { cx: 300, cy: 585, z: 60, w: 420, h: 220 },
  { cx: 780, cy: 815, z: 0, w: 420, h: 220 },
  { cx: 300, cy: 1045, z: 80, w: 420, h: 220 },
  { cx: 780, cy: 1285, z: 30, w: 440, h: 270 },
];

/** Curva em "cotovelo": sai da base de um cartão e entra pela lateral do próximo. */
function bezier(a: No, b: No) {
  const p0 = { x: a.cx, y: a.cy + a.h / 2 - 4 };
  const lado = b.cx > a.cx ? -1 : 1;
  const p3 = { x: b.cx + (lado * b.w) / 2 + lado * -4, y: b.cy };
  const p1 = { x: p0.x, y: p3.y };
  const p2 = { x: p0.x + (p3.x - p0.x) * 0.55, y: p3.y };
  const ponto = (t: number) => {
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    };
  };
  return { d: `M${p0.x},${p0.y} C${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`, ponto };
}

const Cartao: React.FC<{
  no: No;
  f: number;
  i: number;
  aceso: number;
  icone: React.ReactNode;
  titulo: string;
  sub: string;
  children: React.ReactNode;
}> = ({ no, f, i, aceso, icone, titulo, sub, children }) => {
  const t0 = INI + 2 + i * 6;
  const e = iv(f, [t0, t0 + 22], [0, 1], suave);
  const flutua = onda(f, i * 3, 0.05) * 8;
  return (
    <div
      style={{
        position: "absolute",
        left: no.cx - no.w / 2,
        top: no.cy - no.h / 2 + flutua,
        width: no.w,
        height: no.h,
        transform: `translateZ(${no.z - (1 - e) * 500}px)`,
        opacity: e,
        borderRadius: 30,
        background: "#fff",
        border: `3px solid ${aceso > 0.05 ? `rgba(255,90,0,${0.3 + 0.7 * aceso})` : COR.borda}`,
        boxShadow: `0 40px 80px -30px rgba(17,24,39,0.38), 0 0 ${60 * aceso}px ${-4 + 10 * aceso}px rgba(255,90,0,${0.55 * aceso})`,
        padding: "20px 22px",
        fontFamily: FONTE.ui,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
        {icone}
        <div>
          <div style={{ fontWeight: 800, fontSize: 27, letterSpacing: "0.01em", color: COR.texto }}>{titulo}</div>
          <div style={{ fontSize: 19, color: COR.cinza, fontWeight: 500 }}>{sub}</div>
        </div>
      </div>
      {children}
    </div>
  );
};

const MiniBalao: React.FC<{ cor?: string; fundo?: string; children: React.ReactNode }> = ({
  cor = COR.texto,
  fundo = COR.cinzaClaro,
  children,
}) => (
  <div
    style={{
      display: "inline-block",
      background: fundo,
      color: cor,
      borderRadius: 16,
      padding: "8px 14px",
      fontSize: 20,
      fontWeight: 600,
      marginBottom: 8,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </div>
);

export const CenaEcossistema: React.FC = () => {
  const f = useCurrentFrame();
  const entra = iv(f, [INI - 6, INI + 14], [0, 1]);
  const sai = iv(f, [FIM - 10, FIM + 8], [0, 1], entraSai);
  const giro = -10 + 9 * Math.sin((f - INI) * 0.018);
  const inclina = 16 - 6 * iv(f, [INI, FIM], [0, 1], (v) => v);

  const curvas = [bezier(NOS[0], NOS[1]), bezier(NOS[1], NOS[2]), bezier(NOS[2], NOS[3])];
  const desenho = curvas.map((_, k) => iv(f, [INI + 14 + k * 6, INI + 40 + k * 6], [0, 1], entraSai));

  // nó aceso: quando o "atendimento" chega nele
  const chegada = [E.trechos[0][0] - 6, E.trechos[0][1], E.trechos[1][1], E.trechos[2][1]];
  const aceso = chegada.map((t) => iv(f, [t, t + 6], [0, 1]) * iv(f, [t + 30, t + 60], [1, 0.25]));

  const pedido = pop(f, E.pedido, 18);

  const textos = ["CONVERSAS CENTRALIZADAS", "RESPOSTAS AUTOMATIZADAS", "GESTÃO CONECTADA"];

  return (
    <AbsoluteFill style={{ opacity: entra * (1 - sai), filter: sai > 0.01 ? `blur(${sai * 14}px)` : undefined }}>
      {/* brilho central */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(600px 700px at 540px 930px, rgba(255,90,0,${0.1 + 0.06 * Math.sin(f * 0.08)}), transparent 70%)`,
        }}
      />

      {/* textos em sequência */}
      <div style={{ position: "absolute", top: 232, left: 60, right: 60, textAlign: "center" }}>
        {textos.map((t, i) => {
          const ti = E.textos[i];
          const e = iv(f, [ti, ti + 14], [0, 1], suave);
          const atual = f >= ti && (i === 2 || f < E.textos[i + 1]);
          return (
            <div
              key={t}
              style={{
                fontFamily: FONTE.titulo,
                fontWeight: 800,
                fontSize: 60,
                letterSpacing: "-0.03em",
                lineHeight: 1.08,
                color: atual ? COR.laranja : COR.preto,
                opacity: e * (atual ? 1 : 0.85),
                transform: `translateY(${(1 - e) * 30}px)`,
                filter: e < 0.99 ? `blur(${(1 - e) * 8}px)` : undefined,
              }}
            >
              {t}
            </div>
          );
        })}
      </div>

      {/* composição 3D */}
      <AbsoluteFill style={{ perspective: 2400, perspectiveOrigin: "540px 900px" }}>
        <AbsoluteFill
          style={{
            transformStyle: "preserve-3d",
            transformOrigin: "540px 930px",
            transform: `rotateX(${inclina}deg) rotateY(${giro}deg) scale(${0.97 + 0.03 * entra})`,
          }}
        >
          <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={1080} height={1920}>
            {curvas.map((c, k) => (
              <g key={k}>
                <path d={c.d} stroke="rgba(255,90,0,0.18)" strokeWidth={16} fill="none" strokeLinecap="round" pathLength={1} strokeDasharray={`${desenho[k]} 1`} />
                <path
                  d={c.d}
                  stroke={COR.laranja}
                  strokeWidth={5}
                  fill="none"
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray={`${desenho[k]} 1`}
                />
                {/* pulsos contínuos */}
                {desenho[k] > 0.99 &&
                  [0, 1].map((j) => {
                    const p = (((f - INI) * 0.02 + j * 0.5 + k * 0.2) % 1 + 1) % 1;
                    const pt = c.ponto(p);
                    return <circle key={j} cx={pt.x} cy={pt.y} r={6} fill="#FFB27A" opacity={Math.sin(p * Math.PI) * 0.9} />;
                  })}
                {/* o atendimento viajando */}
                {(() => {
                  const [a, b] = E.trechos[k];
                  if (f < a || f > b + 4) return null;
                  const p = iv(f, [a, b], [0, 1], entraSai);
                  const pt = c.ponto(p);
                  return (
                    <g style={{ filter: "drop-shadow(0 0 14px rgba(255,90,0,1))" }}>
                      <circle cx={pt.x} cy={pt.y} r={20} fill={COR.laranja} opacity={0.35} />
                      <circle cx={pt.x} cy={pt.y} r={11} fill="#fff" stroke={COR.laranja} strokeWidth={5} />
                    </g>
                  );
                })()}
              </g>
            ))}
          </svg>

          <Cartao no={NOS[0]} f={f} i={0} aceso={aceso[0]} icone={<IconeWhats tam={60} />} titulo="WHATSAPP" sub="Entrada das mensagens">
            <MiniBalao>Qual combo vocês têm hoje?</MiniBalao>
            <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 17, color: COR.whatsEscuro, fontWeight: 700 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: COR.whats }} /> novas conversas chegando
            </div>
          </Cartao>

          <Cartao no={NOS[1]} f={f} i={1} aceso={aceso[1]} icone={<SeloFly tam={60} />} titulo="CRM FLYCONTROL" sub="Atendimentos centralizados">
            {["Mariana Lopes", "Carlos Mendes"].map((n, k) => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <Avatar nome={n} i={k} tam={34} />
                <span style={{ fontSize: 18, fontWeight: 600, color: COR.texto, flex: 1 }}>{n}</span>
                {k === 0 ? (
                  <SeloIA tam={14} texto="IA" />
                ) : (
                  <span style={{ fontSize: 14, fontWeight: 700, color: COR.cinza }}>Aberta</span>
                )}
              </div>
            ))}
          </Cartao>

          <Cartao
            no={NOS[2]}
            f={f}
            i={2}
            aceso={aceso[2]}
            icone={
              <div style={{ width: 60, height: 60, borderRadius: 17, background: COR.ia, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Bot color="#fff" size={36} />
              </div>
            }
            titulo="IA INTELIGENTE"
            sub="Respostas e assistência"
          >
            <MiniBalao cor="#fff" fundo={COR.ia}>
              Posso te mostrar o cardápio! 🍔
            </MiniBalao>
            <div style={{ fontSize: 16, color: COR.cinza, fontWeight: 600 }}>Consulta produtos e preços do sistema</div>
          </Cartao>

          <Cartao
            no={NOS[3]}
            f={f}
            i={3}
            aceso={aceso[3]}
            icone={
              <div style={{ width: 60, height: 60, borderRadius: 17, background: COR.laranja, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ReceiptText color="#fff" size={34} />
              </div>
            }
            titulo="CARDÁPIO + PEDIDOS"
            sub="Produtos e gestão conectados"
          >
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {["🍔 Smash", "🍔 Duplo Bacon", "🍟 Família"].map((c, k) => (
                <span
                  key={c}
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    padding: "5px 10px",
                    borderRadius: 999,
                    whiteSpace: "nowrap",
                    background: k === 1 && f >= E.trechos[2][1] - 8 ? "#FFF1E8" : COR.cinzaClaro,
                    color: k === 1 && f >= E.trechos[2][1] - 8 ? COR.laranja : COR.cinza,
                    border: `2px solid ${k === 1 && f >= E.trechos[2][1] - 8 ? COR.laranja : "transparent"}`,
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
            <div
              style={{
                borderRadius: 18,
                border: `1px solid ${COR.borda}`,
                borderTop: `5px solid #3B82F6`,
                padding: "10px 14px",
                opacity: Math.min(1, pedido * 1.3),
                transform: `scale(${0.8 + 0.2 * pedido})`,
                transformOrigin: "top center",
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: FONTE.comanda, fontWeight: 700, fontSize: 24, color: COR.texto }}>#1843</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#C2410C", background: "#FFEDD5", borderRadius: 999, padding: "3px 10px", letterSpacing: "0.06em" }}>
                  NOVO PEDIDO
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color: COR.ia, background: "#E0F2FE", borderRadius: 999, padding: "3px 10px" }}>
                  via Chat IA
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 18 }}>
                <span style={{ color: COR.texto, fontWeight: 600 }}>1x Combo Duplo Bacon</span>
                <span style={{ color: COR.laranja, fontWeight: 800 }}>R$ 39,90</span>
              </div>
            </div>
          </Cartao>
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
