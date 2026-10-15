import { MessageCircle } from "lucide-react";
import { Img, staticFile } from "remotion";
import { COR, FONTE } from "../estilo";

const PASTEIS = ["#FDE68A", "#BFDBFE", "#FBCFE8", "#C7D2FE", "#BBF7D0", "#FED7AA", "#DDD6FE", "#A5F3FC"];
const TINTAS = ["#92400E", "#1E3A8A", "#9D174D", "#3730A3", "#166534", "#9A3412", "#5B21B6", "#155E75"];

/** Avatar com iniciais (sem fotos de pessoas reais). */
export const Avatar: React.FC<{ nome: string; i: number; tam?: number }> = ({ nome, i, tam = 64 }) => {
  const ini = nome
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  return (
    <div
      style={{
        width: tam,
        height: tam,
        flex: "none",
        borderRadius: "50%",
        background: PASTEIS[i % PASTEIS.length],
        color: TINTAS[i % TINTAS.length],
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONTE.ui,
        fontWeight: 700,
        fontSize: tam * 0.38,
      }}
    >
      {ini}
    </div>
  );
};

/** Ícone genérico de "mensageiro verde" (não reproduz o logotipo oficial do WhatsApp). */
export const IconeWhats: React.FC<{ tam?: number }> = ({ tam = 64 }) => (
  <div
    style={{
      width: tam,
      height: tam,
      borderRadius: tam * 0.28,
      background: `linear-gradient(160deg, ${COR.whats}, ${COR.whatsEscuro})`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 10px 24px -10px rgba(29,168,81,0.7)",
      flex: "none",
    }}
  >
    <MessageCircle color="#fff" size={tam * 0.58} strokeWidth={2.4} />
  </div>
);

/** Selo laranja com o símbolo do FlyControl. */
export const SeloFly: React.FC<{ tam?: number }> = ({ tam = 64 }) => (
  <div
    style={{
      width: tam,
      height: tam,
      borderRadius: tam * 0.28,
      background: "#fff",
      border: `2px solid ${COR.borda}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 10px 24px -12px rgba(255,90,0,0.6)",
      flex: "none",
      overflow: "hidden",
    }}
  >
    <Img
      src={staticFile("img/flycontrol-mark.png")}
      style={{ width: tam * 0.86, objectFit: "contain" }}
    />
  </div>
);

export const Chip: React.FC<{ cor: string; fundo: string; children: React.ReactNode; tam?: number }> = ({
  cor,
  fundo,
  children,
  tam = 18,
}) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: `${tam * 0.25}px ${tam * 0.6}px`,
      borderRadius: 999,
      background: fundo,
      color: cor,
      fontFamily: FONTE.ui,
      fontWeight: 700,
      fontSize: tam,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </span>
);
