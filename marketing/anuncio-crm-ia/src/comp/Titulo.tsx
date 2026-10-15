import { COR, FONTE, iv, suave } from "../estilo";

export type Linha = { texto: string; cor?: string };

/**
 * Título cinético: cada palavra sobe de dentro de uma "fenda" com leve
 * desfoque, em cascata. Sai subindo e sumindo.
 */
export const Titulo: React.FC<{
  f: number;
  linhas: Linha[];
  entra: number;
  sai?: number;
  y: number;
  tamanho?: number;
  passo?: number;
  alinhamento?: "center" | "left";
}> = ({ f, linhas, entra, sai = 99999, y, tamanho = 92, passo = 3, alinhamento = "center" }) => {
  let n = 0;
  const saida = iv(f, [sai, sai + 12], [0, 1]);
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        top: y,
        textAlign: alinhamento,
        fontFamily: FONTE.titulo,
        fontWeight: 800,
        fontSize: tamanho,
        lineHeight: 0.98,
        letterSpacing: "-0.035em",
        color: COR.preto,
        opacity: 1 - saida,
        transform: `translateY(${-40 * saida}px)`,
        filter: saida > 0.01 ? `blur(${saida * 10}px)` : undefined,
      }}
    >
      {linhas.map((l, i) => (
        <div key={i} style={{ whiteSpace: "nowrap" }}>
          {l.texto.split(" ").map((p, j) => {
            const ini = entra + n++ * passo;
            const t = iv(f, [ini, ini + 16], [0, 1], suave);
            return (
              <span
                key={j}
                style={{
                  display: "inline-block",
                  overflow: "hidden",
                  verticalAlign: "top",
                  paddingBottom: "0.08em",
                  marginRight: "0.22em",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    color: l.cor ?? COR.preto,
                    transform: `translateY(${(1 - t) * 105}%)`,
                    opacity: t,
                    filter: t < 0.99 ? `blur(${(1 - t) * 6}px)` : undefined,
                  }}
                >
                  {p}
                </span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};
