import { COR } from "../estilo";

type Props = {
  x: number;
  y: number;
  escala?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  largura?: number;
  altura?: number;
  opacidade?: number;
  desfoque?: number;
  children: React.ReactNode;
};

/**
 * Smartphone em 3D de verdade: corpo com espessura (camadas em profundidade),
 * vidro com reflexo e sombra de contato no chão.
 */
export const Celular: React.FC<Props> = ({
  x,
  y,
  escala = 1,
  rx = 0,
  ry = 0,
  rz = 0,
  largura = 440,
  altura = 900,
  opacidade = 1,
  desfoque = 0,
  children,
}) => {
  const raio = 70;
  const camadas = 10;
  return (
    <div
      style={{
        position: "absolute",
        left: x - largura / 2,
        top: y - altura / 2,
        width: largura,
        height: altura,
        perspective: 2200,
        opacity: opacidade,
        filter: desfoque > 0.05 ? `blur(${desfoque}px)` : undefined,
      }}
    >
      {/* sombra de contato */}
      <div
        style={{
          position: "absolute",
          left: "8%",
          right: "8%",
          bottom: -70 * escala,
          height: 90,
          borderRadius: "50%",
          background: "radial-gradient(closest-side, rgba(17,24,39,0.28), transparent)",
          filter: "blur(18px)",
          transform: `translateX(${ry * 4}px) scale(${escala})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
          transform: `scale(${escala}) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`,
        }}
      >
        {/* espessura do corpo */}
        {Array.from({ length: camadas }).map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: raio,
              background: i === camadas - 1 ? "#2b2b30" : "#3a3a40",
              transform: `translateZ(${-2 - i * 2.2}px)`,
              boxShadow: i === camadas - 1 ? "0 50px 90px -20px rgba(17,24,39,0.45)" : undefined,
            }}
          />
        ))}
        {/* frente */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: raio,
            background: "linear-gradient(145deg,#4a4a52,#18181b 40%,#2a2a30)",
            padding: 14,
            boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.12)",
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              borderRadius: raio - 14,
              overflow: "hidden",
              background: COR.fundo,
            }}
          >
            {children}
            {/* ilha dinâmica */}
            <div
              style={{
                position: "absolute",
                top: 14,
                left: "50%",
                width: 118,
                height: 34,
                marginLeft: -59,
                borderRadius: 20,
                background: "#000",
              }}
            />
            {/* reflexo do vidro */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(${115 + ry}deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.22) 42%, rgba(255,255,255,0) 52%)`,
                pointerEvents: "none",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

/** Barra de status do celular. */
export const BarraStatus: React.FC<{ escuro?: boolean }> = ({ escuro }) => (
  <div
    style={{
      height: 62,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 34px 0",
      fontFamily: "'Inter'",
      fontWeight: 600,
      fontSize: 21,
      color: escuro ? "#fff" : COR.texto,
    }}
  >
    <span>19:42</span>
    <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
        {[8, 11, 14, 17].map((h) => (
          <span key={h} style={{ width: 4, height: h, borderRadius: 1, background: "currentColor" }} />
        ))}
      </span>
      <span
        style={{
          width: 30,
          height: 15,
          borderRadius: 4,
          border: "2px solid currentColor",
          padding: 1.5,
          display: "inline-flex",
        }}
      >
        <span style={{ flex: 1, background: "currentColor", borderRadius: 1.5, width: "70%" }} />
      </span>
    </span>
  </div>
);
