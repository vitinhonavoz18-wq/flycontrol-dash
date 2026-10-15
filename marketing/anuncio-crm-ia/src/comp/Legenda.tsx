import { useCurrentFrame, useVideoConfig } from "remotion";
import legendas from "../legendas.json";
import { COR, FONTE, iv } from "../estilo";

/**
 * Legenda dinâmica: uma frase curta por vez, a palavra falada acende em
 * laranja. Fica na faixa segura do Reels (acima da legenda/botões do app).
 */
export const Legenda: React.FC<{ y?: number }> = ({ y = 1452 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = f / fps;
  const bloco = legendas.find((b) => s >= b.ini - 0.05 && s <= b.fim + 0.05);
  if (!bloco) return null;
  const fi = bloco.ini * fps;
  const ff = bloco.fim * fps;
  const op = Math.min(iv(f, [fi - 1.5, fi + 3], [0, 1]), iv(f, [ff - 2, ff + 1.5], [1, 0]));
  const sobe = iv(f, [fi - 1.5, fi + 5], [14, 0]);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: y,
        display: "flex",
        justifyContent: "center",
        opacity: op,
        transform: `translateY(${sobe}px)`,
      }}
    >
      <div
        style={{
          maxWidth: 900,
          padding: "14px 30px 16px",
          borderRadius: 26,
          background: "rgba(14,14,16,0.86)",
          boxShadow: "0 18px 40px -16px rgba(0,0,0,0.45)",
          fontFamily: FONTE.ui,
          fontWeight: 700,
          fontSize: 44,
          lineHeight: 1.18,
          letterSpacing: "-0.01em",
          color: "#fff",
          textAlign: "center",
        }}
      >
        {bloco.palavras.map((p, i) => {
          const ativo = s >= p.t - 0.04;
          return (
            <span key={i} style={{ color: ativo ? "#fff" : "rgba(255,255,255,0.42)" }}>
              {i > 0 ? " " : ""}
              <span style={{ color: s >= p.t - 0.04 && s <= p.f + 0.08 ? COR.laranjaClaro : undefined }}>
                {p.w}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
};
