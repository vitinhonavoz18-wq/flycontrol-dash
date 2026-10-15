import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Avatar, IconeWhats, SeloFly } from "../comp/Pecas";
import { Busca, JanelaPainel, SeloIA } from "../comp/Painel";
import { Titulo } from "../comp/Titulo";
import { CONVERSAS_CRM } from "../dados";
import { COR, FONTE, entraSai, iv, pop, suave } from "../estilo";
import T from "../tempos.json";

const [INI, FIM] = T.cenas.c3;

/** Linha animada entre dois pontos, com pulsos de luz viajando nela. */
export const Conexao: React.FC<{
  f: number;
  x1: number;
  x2: number;
  y: number;
  desenha: number;
}> = ({ f, x1, x2, y, desenha }) => {
  const comp = x2 - x1;
  return (
    <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={1080} height={1920}>
      <defs>
        <linearGradient id="gLinha" gradientUnits="userSpaceOnUse" x1={x1} y1={y} x2={x2} y2={y}>
          <stop offset="0" stopColor={COR.whats} />
          <stop offset="1" stopColor={COR.laranja} />
        </linearGradient>
      </defs>
      <line x1={x1} y1={y} x2={x1 + comp * desenha} y2={y} stroke="url(#gLinha)" strokeWidth={6} strokeLinecap="round" />
      {desenha > 0.98 &&
        [0, 1, 2].map((k) => {
          const p = ((f * 0.025 + k / 3) % 1 + 1) % 1;
          return (
            <circle
              key={k}
              cx={x1 + comp * p}
              cy={y}
              r={9}
              fill={COR.laranja}
              style={{ filter: "drop-shadow(0 0 10px rgba(255,90,0,0.9))" }}
              opacity={Math.sin(p * Math.PI)}
            />
          );
        })}
    </svg>
  );
};

export const CenaCRM: React.FC = () => {
  const f = useCurrentFrame();
  const sai = iv(f, [FIM - 14, FIM + 2], [0, 1], entraSai);

  // feixe de luz laranja atravessando a tela
  const feixe = iv(f, [T.feixe, T.feixe + 30], [-0.4, 1.4], entraSai);
  const feixeOp = iv(f, [T.feixe, T.feixe + 6], [0, 1]) * iv(f, [T.feixe + 22, T.feixe + 34], [1, 0]);

  const painel = iv(f, [T.c3.painel, T.c3.painel + 26], [0, 1], suave);
  const conecta = iv(f, [T.c3.conexao, T.c3.conexao + 30], [0, 1], entraSai);
  const ok = pop(f, T.c3.conectado, 16);
  const nos = iv(f, [T.c3.conexao - 14, T.c3.conexao + 4], [0, 1]);

  return (
    <AbsoluteFill style={{ opacity: 1 - sai, transform: `scale(${1 + sai * 0.04})` }}>
      {/* feixe */}
      <AbsoluteFill style={{ opacity: feixeOp, pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            left: `${feixe * 100 - 60}%`,
            top: "-20%",
            width: "70%",
            height: "140%",
            transform: "rotate(18deg)",
            background:
              "linear-gradient(90deg, transparent, rgba(255,138,61,0.0) 30%, rgba(255,138,61,0.55) 47%, rgba(255,255,255,0.95) 50%, rgba(255,138,61,0.55) 53%, transparent 70%)",
            filter: "blur(18px)",
          }}
        />
      </AbsoluteFill>

      <Titulo
        f={f}
        entra={T.c3.painel - 6}
        sai={FIM - 10}
        y={236}
        tamanho={80}
        linhas={[{ texto: "CONHEÇA O CRM" }, { texto: "INTELIGENTE", cor: COR.laranja }, { texto: "DO FLYCONTROL" }]}
      />

      {/* WhatsApp ⇄ FlyControl */}
      <div style={{ opacity: nos }}>
        <Conexao f={f} x1={330} x2={750} y={540} desenha={conecta} />
        <div style={{ position: "absolute", left: 290, top: 500, transform: `scale(${0.6 + 0.4 * nos})` }}>
          <IconeWhats tam={80} />
        </div>
        <div style={{ position: "absolute", left: 710, top: 500, transform: `scale(${0.6 + 0.4 * nos})` }}>
          <SeloFly tam={80} />
        </div>
        <div
          style={{
            position: "absolute",
            left: 540,
            top: 520,
            transform: `translateX(-50%) scale(${ok})`,
            background: "#ECFDF5",
            color: "#047857",
            border: "2px solid #A7F3D0",
            borderRadius: 999,
            padding: "6px 16px",
            fontFamily: FONTE.ui,
            fontWeight: 700,
            fontSize: 20,
            whiteSpace: "nowrap",
          }}
        >
          ● WhatsApp conectado
        </div>
      </div>

      {/* painel do Chat */}
      <div
        style={{
          position: "absolute",
          left: 60,
          top: 612,
          opacity: painel,
          transform: `perspective(2000px) translateY(${(1 - painel) * 120}px) rotateX(${(1 - painel) * 16}deg) scale(${0.92 + 0.08 * painel})`,
          filter: painel < 0.99 ? `blur(${(1 - painel) * 10}px)` : undefined,
        }}
      >
        <JanelaPainel largura={960} altura={780}>
          <div style={{ padding: "26px 28px 0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontFamily: FONTE.titulo, fontWeight: 800, fontSize: 40, color: COR.texto }}>Chat</div>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ fontSize: 17, fontWeight: 700, color: COR.laranja, background: "#FFF1E8", borderRadius: 999, padding: "6px 14px" }}>
                  Abertas · 5
                </span>
              </div>
            </div>
            <Busca />
          </div>
          <div style={{ marginTop: 12 }}>
            {CONVERSAS_CRM.map((c, i) => {
              const t = T.c3.painel + 16 + i * 5;
              const e = iv(f, [t, t + 14], [0, 1], suave);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    height: 112,
                    padding: "0 28px",
                    borderBottom: `1px solid ${COR.borda}`,
                    background: i === 0 ? "#FFF7F2" : undefined,
                    opacity: e,
                    transform: `translateX(${(1 - e) * 60}px)`,
                  }}
                >
                  <Avatar nome={c.nome} i={i} tam={64} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 700, fontSize: 28, color: COR.texto }}>{c.nome}</span>
                      <span style={{ fontSize: 17, color: COR.cinza }}>{c.hora}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                      <span style={{ fontSize: 24, color: "#4B5563" }}>{c.texto}</span>
                      {c.quem === "ia" ? (
                        <SeloIA texto="IA respondeu" tam={17} />
                      ) : (
                        <span
                          style={{
                            minWidth: 30,
                            height: 30,
                            borderRadius: 15,
                            background: COR.laranja,
                            color: "#fff",
                            fontWeight: 800,
                            fontSize: 17,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {c.nao}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </JanelaPainel>
      </div>
    </AbsoluteFill>
  );
};
