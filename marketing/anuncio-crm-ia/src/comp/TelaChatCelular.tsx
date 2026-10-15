import { Check } from "lucide-react";
import { BarraStatus } from "./Celular";
import { Avatar } from "./Pecas";
import { SeloIA } from "./Painel";
import { COR, FONTE, iv } from "../estilo";

const LINHAS = [
  { nome: "Mariana Lopes", texto: "Pedido anotado! 🍔", s: "ia" },
  { nome: "Carlos Mendes", texto: "Obrigado, chegou certinho", s: "ok" },
  { nome: "Juliana Rocha", texto: "Entrega no Centro: sim", s: "ia" },
  { nome: "Pedro Alves", texto: "Pode ser no Pix", s: "ok" },
  { nome: "Ana Beatriz", texto: "Saiu para entrega", s: "ia" },
  { nome: "Rafael Souza", texto: "Valeu!", s: "ok" },
];

/** O Chat do FlyControl no celular, já organizado. */
export const TelaChatCelular: React.FC<{ f: number; ini: number }> = ({ f, ini }) => (
  <div style={{ position: "absolute", inset: 0, background: "#fff", fontFamily: FONTE.ui }}>
    <BarraStatus />
    <div style={{ padding: "6px 24px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontFamily: FONTE.titulo, fontWeight: 800, fontSize: 36, color: COR.texto }}>Chat</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: COR.verdeOk, background: "#ECFDF5", borderRadius: 999, padding: "5px 12px" }}>
        ● Conectado
      </span>
    </div>
    {LINHAS.map((l, i) => {
      const e = iv(f, [ini + i * 4, ini + 14 + i * 4], [0, 1]);
      return (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 20px",
            borderBottom: `1px solid ${COR.borda}`,
            opacity: e,
            transform: `translateX(${(1 - e) * 40}px)`,
          }}
        >
          <Avatar nome={l.nome} i={i} tam={54} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 21, color: COR.texto }}>{l.nome}</div>
            <div style={{ fontSize: 17, color: "#4B5563", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.texto}</div>
          </div>
          {l.s === "ia" ? (
            <SeloIA tam={13} />
          ) : (
            <span style={{ width: 28, height: 28, borderRadius: 14, background: "#D1FAE5", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Check size={18} color={COR.verdeOk} strokeWidth={3} />
            </span>
          )}
        </div>
      );
    })}
  </div>
);
