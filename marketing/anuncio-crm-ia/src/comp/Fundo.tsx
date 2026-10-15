import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COR, onda } from "../estilo";

/** Fundo branco premium: luz quente muito sutil, grade de pontos e brilhos laranja suaves. */
export const Fundo: React.FC<{ calor?: number }> = ({ calor = 0 }) => {
  const f = useCurrentFrame();
  const dx = onda(f, 1, 0.01) * 30;
  const dy = onda(f, 2, 0.008) * 30;
  return (
    <AbsoluteFill style={{ background: COR.fundo, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1200px 900px at ${50 + dx / 20}% 8%, rgba(255,90,0,${0.05 + calor * 0.08}), transparent 70%),
             radial-gradient(900px 900px at 100% 100%, rgba(255,193,90,${0.08 + calor * 0.1}), transparent 70%),
             radial-gradient(900px 700px at 0% 70%, rgba(255,138,61,${0.04 + calor * 0.06}), transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(rgba(17,24,39,0.10) 1.4px, transparent 1.6px)",
          backgroundSize: "36px 36px",
          backgroundPosition: `${dx}px ${dy}px`,
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, black 20%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, black 20%, transparent 80%)",
          opacity: 0.55,
        }}
      />
    </AbsoluteFill>
  );
};
