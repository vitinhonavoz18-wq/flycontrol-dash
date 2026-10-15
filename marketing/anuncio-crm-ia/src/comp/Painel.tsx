import { Img, staticFile } from "remotion";
import { Bot, LayoutDashboard, LayoutGrid, Megaphone, Menu, MessageSquare, Search } from "lucide-react";
import { COR, FONTE } from "../estilo";

/** Itens reais do menu lateral do painel FlyControl (src/routes/_app.tsx). */
const NAV = [
  { r: "Pedidos", I: LayoutDashboard },
  { r: "Mesas", I: LayoutGrid },
  { r: "Cardápio", I: Menu },
  { r: "Marketing", I: Megaphone },
  { r: "Chat", I: MessageSquare },
];

/** Moldura de janela do painel, com a barra lateral do FlyControl. */
export const JanelaPainel: React.FC<{
  largura: number;
  altura: number;
  ativo?: string;
  children: React.ReactNode;
}> = ({ largura, altura, ativo = "Chat", children }) => (
  <div
    style={{
      width: largura,
      height: altura,
      borderRadius: 34,
      background: "#fff",
      boxShadow: "0 50px 100px -30px rgba(17,24,39,0.35), 0 0 0 1px rgba(17,24,39,0.07)",
      display: "flex",
      overflow: "hidden",
      fontFamily: FONTE.ui,
    }}
  >
    <div
      style={{
        width: 112,
        flex: "none",
        background: "#FAFAFA",
        borderRight: `1px solid ${COR.borda}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 22,
        gap: 14,
      }}
    >
      <Img src={staticFile("img/flycontrol-mark.png")} style={{ width: 80, marginBottom: 14 }} />
      {NAV.map(({ r, I }) => {
        const on = r === ativo;
        return (
          <div
            key={r}
            style={{
              width: 88,
              padding: "12px 0 10px",
              borderRadius: 18,
              background: on ? COR.laranja : "transparent",
              color: on ? "#fff" : COR.cinza,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 5,
              fontSize: 15,
              fontWeight: 600,
              boxShadow: on ? "0 10px 20px -10px rgba(255,90,0,0.8)" : undefined,
            }}
          >
            <I size={28} strokeWidth={2.2} />
            {r}
          </div>
        );
      })}
    </div>
    <div style={{ flex: 1, minWidth: 0, position: "relative" }}>{children}</div>
  </div>
);

export const Busca: React.FC = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      height: 52,
      borderRadius: 16,
      border: `1px solid ${COR.borda}`,
      padding: "0 16px",
      color: COR.cinza,
      fontSize: 20,
    }}
  >
    <Search size={22} /> Buscar conversa
  </div>
);

/** Selo da autoria "Atendente IA", com o azul que o chat real usa. */
export const SeloIA: React.FC<{ tam?: number; texto?: string }> = ({ tam = 15, texto = "IA" }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      background: COR.ia,
      color: "#fff",
      borderRadius: 999,
      padding: `${tam * 0.2}px ${tam * 0.55}px`,
      fontSize: tam,
      fontWeight: 700,
      whiteSpace: "nowrap",
    }}
  >
    <Bot size={tam * 1.15} strokeWidth={2.4} />
    {texto}
  </span>
);
