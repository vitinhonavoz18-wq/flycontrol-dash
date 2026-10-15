import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Bot, Check, ChevronDown } from "lucide-react";
import { Avatar } from "../comp/Pecas";
import { COR, FONTE, entraSai, iv, pop, suave } from "../estilo";
import T from "../tempos.json";

const [INI, FIM] = T.cenas.c4;
const E = T.c4;

export const COMBOS = [
  { nome: "Combo Smash", desc: "Burger + fritas + refri", preco: "R$ 32,90", emoji: "🍔" },
  { nome: "Combo Duplo Bacon", desc: "Duplo + fritas + refri", preco: "R$ 39,90", emoji: "🍔" },
  { nome: "Combo Família", desc: "4 burgers + 2 fritas", preco: "R$ 89,90", emoji: "🍟" },
];

const Balao: React.FC<{ de: "cliente" | "ia"; f: number; t: number; children: React.ReactNode }> = ({
  de,
  f,
  t,
  children,
}) => {
  const e = pop(f, t, 16);
  const ia = de === "ia";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: ia ? "row-reverse" : "row",
        alignItems: "flex-end",
        gap: 12,
        opacity: Math.min(1, e * 1.4),
        transform: `scale(${0.85 + 0.15 * e})`,
        transformOrigin: ia ? "bottom right" : "bottom left",
      }}
    >
      {ia ? (
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            background: COR.ia,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
          }}
        >
          <Bot color="#fff" size={30} />
        </div>
      ) : (
        <Avatar nome="Mariana Lopes" i={0} tam={52} />
      )}
      <div style={{ maxWidth: 640 }}>
        {ia && (
          <div style={{ textAlign: "right", fontSize: 17, fontWeight: 700, color: COR.ia, marginBottom: 4 }}>
            Atendente IA
          </div>
        )}
        <div
          style={{
            padding: "16px 22px",
            borderRadius: 26,
            borderBottomRightRadius: ia ? 8 : 26,
            borderBottomLeftRadius: ia ? 26 : 8,
            background: ia ? COR.ia : "#fff",
            color: ia ? "#fff" : COR.texto,
            border: ia ? undefined : `1px solid ${COR.borda}`,
            fontSize: 27,
            lineHeight: 1.3,
            fontWeight: 500,
            boxShadow: "0 10px 24px -16px rgba(17,24,39,0.4)",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

const Digitando: React.FC<{ f: number; de: number; ate: number }> = ({ f, de, ate }) => {
  if (f < de || f >= ate) return null;
  const op = Math.min(iv(f, [de, de + 5], [0, 1]), iv(f, [ate - 3, ate], [1, 0]));
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, opacity: op, alignItems: "center" }}>
      <span style={{ fontSize: 18, color: COR.ia, fontWeight: 600 }}>IA digitando</span>
      <div style={{ display: "flex", gap: 7, background: "#E0F2FE", padding: "16px 20px", borderRadius: 24 }}>
        {[0, 1, 2].map((k) => (
          <span
            key={k}
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              background: COR.ia,
              opacity: 0.35 + 0.65 * Math.max(0, Math.sin((f - de) * 0.35 - k * 0.9)),
            }}
          />
        ))}
      </div>
    </div>
  );
};

const Passo: React.FC<{ n: number; texto: string; f: number; t: number }> = ({ n, texto, f, t }) => {
  const on = iv(f, [t - 2, t + 8], [0, 1]);
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        borderRadius: 20,
        background: on > 0.5 ? "#FFF1E8" : "#fff",
        border: `2px solid ${on > 0.5 ? COR.laranja : COR.borda}`,
        boxShadow: on > 0.5 ? "0 12px 26px -14px rgba(255,90,0,0.7)" : undefined,
        transform: `translateY(${-6 * pop(f, t, 12) + 6}px)`,
        opacity: 0.45 + 0.55 * on,
        fontFamily: FONTE.ui,
      }}
    >
      <span
        style={{
          width: 36,
          height: 36,
          flex: "none",
          borderRadius: 18,
          background: on > 0.5 ? COR.laranja : COR.cinzaClaro,
          color: on > 0.5 ? "#fff" : COR.cinza,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 19,
        }}
      >
        {on > 0.5 ? <Check size={22} strokeWidth={3} /> : n}
      </span>
      <span style={{ fontSize: 21, fontWeight: 700, color: COR.texto, lineHeight: 1.1 }}>{texto}</span>
    </div>
  );
};

export const CenaIA: React.FC = () => {
  const f = useCurrentFrame();
  const entra = iv(f, [INI, INI + 18], [0, 1], suave);
  const sai = iv(f, [FIM - 8, FIM + 8], [0, 1], entraSai);
  const cardapio = iv(f, [E.cardapio, E.cardapio + 22], [0, 1], suave);
  const toque = f >= E.toque;
  const anelToque = iv(f, [E.toque, E.toque + 20], [0, 1]);

  // rolagem do chat conforme as mensagens chegam
  const ALT = { c1: 96, ia1: 160, c2: 96, ia2: 200, dig: 84 };
  const corpo = 470;
  let total = 0;
  if (f >= E.cliente1) total += ALT.c1;
  if (f >= E.digita1[0]) total += f >= E.ia1 ? ALT.ia1 : ALT.dig;
  if (f >= E.cliente2) total += ALT.c2;
  if (f >= E.digita2[0]) total += f >= E.ia2 ? ALT.ia2 : ALT.dig;
  const alvo = Math.max(0, total - corpo);
  // suaviza a rolagem: interpola entre o alvo antes/depois de cada evento
  const rolagem = (() => {
    let r = 0;
    const marcos = [E.cliente2, E.digita2[0], E.ia2];
    const parcial = [ALT.c1 + ALT.ia1 + ALT.c2, ALT.c1 + ALT.ia1 + ALT.c2 + ALT.dig, ALT.c1 + ALT.ia1 + ALT.c2 + ALT.ia2];
    marcos.forEach((m, i) => {
      const prev = i === 0 ? ALT.c1 + ALT.ia1 : parcial[i - 1];
      r = f >= m ? Math.max(0, prev - corpo) + (Math.max(0, parcial[i] - corpo) - Math.max(0, prev - corpo)) * iv(f, [m, m + 10], [0, 1]) : r;
    });
    return Math.min(r, alvo + 1);
  })();

  return (
    <AbsoluteFill
      style={{
        opacity: entra * (1 - sai),
        transform: `scale(${(0.96 + 0.04 * entra) * (1 - 0.06 * sai)})`,
        filter: sai > 0.01 ? `blur(${sai * 12}px)` : undefined,
        fontFamily: FONTE.ui,
      }}
    >
      {/* identificador */}
      <div style={{ position: "absolute", top: 250, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 24px",
            borderRadius: 999,
            background: COR.preto,
            color: "#fff",
            fontWeight: 700,
            fontSize: 23,
            letterSpacing: "0.08em",
          }}
        >
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              background: COR.laranja,
              boxShadow: `0 0 0 ${4 + 4 * Math.abs(Math.sin(f * 0.12))}px rgba(255,90,0,0.3)`,
            }}
          />
          IA FLYCONTROL — ATENDIMENTO AUTOMATIZADO
        </div>
      </div>

      {/* passos sincronizados com a narração */}
      <div style={{ position: "absolute", top: 336, left: 60, right: 60, display: "flex", gap: 14 }}>
        <Passo n={1} texto="Conecte o WhatsApp" f={f} t={E.passos[0]} />
        <Passo n={2} texto="Centralize as conversas" f={f} t={E.passos[1]} />
        <Passo n={3} texto="Ative a IA" f={f} t={E.passos[2]} />
      </div>

      {/* janela de conversa do Chat */}
      <div
        style={{
          position: "absolute",
          left: 60,
          top: 456,
          width: 960,
          height: 610,
          borderRadius: 34,
          background: "#F8F9FB",
          boxShadow: "0 50px 100px -30px rgba(17,24,39,0.35), 0 0 0 1px rgba(17,24,39,0.07)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 96,
            background: "#fff",
            borderBottom: `1px solid ${COR.borda}`,
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "0 26px",
          }}
        >
          <Avatar nome="Mariana Lopes" i={0} tam={56} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 26, color: COR.texto }}>Mariana Lopes</div>
            <div style={{ fontSize: 17, color: COR.verdeOk, fontWeight: 600 }}>via WhatsApp</div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: `1px solid ${COR.borda}`,
              borderRadius: 14,
              padding: "8px 14px",
              fontSize: 19,
              fontWeight: 600,
              color: COR.texto,
            }}
          >
            Aberta <ChevronDown size={18} />
          </div>
        </div>
        <div style={{ position: "relative", height: corpo, overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              left: 26,
              right: 26,
              top: 20 - rolagem,
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            {f >= E.cliente1 && (
              <Balao de="cliente" f={f} t={E.cliente1}>
                Boa noite! Qual combo vocês têm hoje?
              </Balao>
            )}
            <Digitando f={f} de={E.digita1[0]} ate={E.ia1} />
            {f >= E.ia1 && (
              <Balao de="ia" f={f} t={E.ia1}>
                Boa noite! Posso te mostrar as opções disponíveis no nosso cardápio! 🍔
              </Balao>
            )}
            {f >= E.cliente2 && (
              <Balao de="cliente" f={f} t={E.cliente2}>
                Quero o Combo Duplo Bacon!
              </Balao>
            )}
            <Digitando f={f} de={E.digita2[0]} ate={E.ia2} />
            {f >= E.ia2 && (
              <Balao de="ia" f={f} t={E.ia2}>
                Ótima escolha! 1 Combo Duplo Bacon, R$ 39,90. É para entrega ou retirada?
              </Balao>
            )}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 44,
            background: "linear-gradient(transparent, #F8F9FB)",
          }}
        />
      </div>

      {/* fluxo de dados: do cardápio para a conversa */}
      {f >= E.toque && f < E.ia2 + 20 && (
        <svg style={{ position: "absolute", left: 0, top: 0 }} width={1080} height={1920}>
          {[0, 1, 2, 3].map((k) => {
            const p = iv(f, [E.toque + 4 + k * 4, E.toque + 22 + k * 4], [0, 1], entraSai);
            const y = 1112 - p * 120;
            return (
              <circle
                key={k}
                cx={540}
                cy={y}
                r={8 - k}
                fill={COR.laranja}
                opacity={p > 0 && p < 1 ? 1 : 0}
                style={{ filter: "drop-shadow(0 0 8px rgba(255,90,0,0.9))" }}
              />
            );
          })}
        </svg>
      )}

      {/* cardápio digital */}
      <div
        style={{
          position: "absolute",
          left: 60,
          top: 1092,
          width: 960,
          opacity: cardapio,
          transform: `translateY(${(1 - cardapio) * 140}px)`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <div style={{ fontFamily: FONTE.titulo, fontWeight: 800, fontSize: 32, color: COR.texto }}>
            Cardápio · <span style={{ color: COR.laranja }}>Combos</span>
          </div>
          <div style={{ fontSize: 18, color: COR.cinza, fontWeight: 600 }}>do sistema, preço atualizado</div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {COMBOS.map((c, i) => {
            const sel = toque && i === 1;
            const e = iv(f, [E.cardapio + 4 + i * 4, E.cardapio + 20 + i * 4], [0, 1], suave);
            return (
              <div
                key={i}
                style={{
                  position: "relative",
                  flex: 1,
                  borderRadius: 26,
                  background: "#fff",
                  border: `3px solid ${sel ? COR.laranja : COR.borda}`,
                  boxShadow: sel ? "0 24px 40px -18px rgba(255,90,0,0.6)" : "0 14px 30px -20px rgba(17,24,39,0.35)",
                  overflow: "hidden",
                  opacity: e,
                  transform: `translateY(${(1 - e) * 40}px) scale(${sel ? 1 + 0.04 * pop(f, E.toque, 14) : 1})`,
                }}
              >
                <div
                  style={{
                    height: 130,
                    background: "radial-gradient(circle at 50% 60%, #FFE2C7, #FFF6EE 70%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 78,
                  }}
                >
                  {c.emoji}
                  {i === 1 && <span style={{ fontSize: 48, marginLeft: -10, marginTop: 30 }}>🥓</span>}
                </div>
                <div style={{ padding: "12px 16px 16px" }}>
                  <div style={{ fontWeight: 700, fontSize: 22, color: COR.texto, whiteSpace: "nowrap" }}>{c.nome}</div>
                  <div style={{ fontSize: 16, color: COR.cinza, marginTop: 2 }}>{c.desc}</div>
                  <div style={{ fontWeight: 800, fontSize: 24, color: COR.laranja, marginTop: 6 }}>{c.preco}</div>
                </div>
                {sel && (
                  <div
                    style={{
                      position: "absolute",
                      top: 12,
                      right: 12,
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      background: COR.laranja,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transform: `scale(${pop(f, E.toque + 2, 14)})`,
                    }}
                  >
                    <Check color="#fff" size={26} strokeWidth={3} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* toque do cliente */}
      {f >= E.toque - 14 && f < E.toque + 24 && (
        <>
          <div
            style={{
              position: "absolute",
              left: 540,
              top: 1230,
              width: 70,
              height: 70,
              marginLeft: -35,
              marginTop: -35,
              borderRadius: 35,
              background: "rgba(17,24,39,0.22)",
              border: "3px solid rgba(255,255,255,0.9)",
              opacity: iv(f, [E.toque - 14, E.toque - 6], [0, 1]) * iv(f, [E.toque + 8, E.toque + 20], [1, 0]),
              transform: `translateY(${iv(f, [E.toque - 14, E.toque], [60, 0])}px) scale(${toque ? 0.85 : 1})`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 540,
              top: 1230,
              width: 220,
              height: 220,
              marginLeft: -110,
              marginTop: -110,
              borderRadius: 110,
              border: `4px solid ${COR.laranja}`,
              opacity: toque ? 1 - anelToque : 0,
              transform: `scale(${0.2 + anelToque})`,
            }}
          />
        </>
      )}

      <div
        style={{
          position: "absolute",
          left: 60,
          top: 1404,
          fontSize: 16,
          color: "#9CA3AF",
          fontWeight: 500,
        }}
      >
        Simulação ilustrativa · conversa e cardápio fictícios
      </div>
    </AbsoluteFill>
  );
};
