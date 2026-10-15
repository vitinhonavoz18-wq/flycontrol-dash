import { AbsoluteFill, Img, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import { CheckCircle2 } from "lucide-react";
import { Celular } from "../comp/Celular";
import { TelaChatCelular } from "../comp/TelaChatCelular";
import { Titulo } from "../comp/Titulo";
import { COR, FONTE, entraSai, iv, onda, pop, suave } from "../estilo";
import T from "../tempos.json";

const [INI, FIM] = T.cenas.c6;

/** Luzes quentes desfocadas, como as de um salão de restaurante à noite. */
const Bokeh: React.FC<{ f: number }> = ({ f }) => (
  <>
    {Array.from({ length: 14 }).map((_, i) => {
      const x = (i * 97) % 580;
      const y = 40 + ((i * 173) % 640);
      const r = 40 + ((i * 37) % 70);
      return (
        <div
          key={i}
          style={{
            position: "absolute",
            left: x + onda(f, i, 0.02) * 20,
            top: y + onda(f, i + 5, 0.015) * 16,
            width: r,
            height: r,
            borderRadius: "50%",
            background: i % 3 === 0 ? "rgba(255,200,120,0.55)" : "rgba(255,140,60,0.35)",
            filter: "blur(10px)",
          }}
        />
      );
    })}
  </>
);

export const CenaBeneficio: React.FC<{ video: string | null }> = ({ video }) => {
  const f = useCurrentFrame();
  const entra = iv(f, [INI - 8, INI + 16], [0, 1], suave);
  const sai = iv(f, [FIM - 4, FIM + 10], [0, 1], entraSai);
  const janela = iv(f, [INI, INI + 26], [0, 1], suave);
  const cel = iv(f, [INI + 10, INI + 40], [0, 1], suave);
  const empurra = iv(f, [INI, FIM], [0, 1], (v) => v);
  const selo = pop(f, INI + 52, 18);

  return (
    <AbsoluteFill style={{ opacity: entra * (1 - iv(sai, [0.3, 1], [0, 1])) }}>
      <AbsoluteFill style={{ background: "linear-gradient(180deg,#FFFFFF 0%,#FFF6EE 55%,#FFEBDC 100%)" }} />
      <Titulo
        f={f}
        entra={T.c6.titulo - 6}
        y={236}
        tamanho={76}
        passo={3}
        linhas={[{ texto: "MENOS TEMPO" }, { texto: "RESPONDENDO." }]}
      />
      <Titulo
        f={f}
        entra={1044}
        y={236 + 2 * 75 + 26}
        tamanho={76}
        passo={4}
        linhas={[{ texto: "MAIS TEMPO" }, { texto: "CRESCENDO.", cor: COR.laranja }]}
      />

      {/* janela para o estabelecimento */}
      <div
        style={{
          position: "absolute",
          left: 60,
          top: 590,
          width: 600,
          height: 820,
          borderRadius: 44,
          overflow: "hidden",
          opacity: janela,
          transform: `translateY(${(1 - janela) * 80}px) scale(${1.02 - 0.02 * janela})`,
          boxShadow: "0 50px 90px -40px rgba(124,45,18,0.45)",
          background: "radial-gradient(120% 90% at 50% 100%, #FF8A3D 0%, #FFB27A 35%, #FFE7D3 75%)",
        }}
      >
        {video ? (
          <OffthreadVideo
            src={staticFile(video)}
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.08 - 0.06 * empurra})` }}
          />
        ) : (
          <>
            <Bokeh f={f} />
            <Img
              src={staticFile("img/sucesso_s.png")}
              style={{
                position: "absolute",
                left: -40,
                bottom: -10,
                width: 680,
                transform: `scale(${1.04 - 0.04 * empurra}) translateY(${(1 - janela) * 40}px)`,
                transformOrigin: "bottom center",
              }}
            />
          </>
        )}
      </div>

      <Celular
        x={790}
        y={1010 - 6 * onda(f, 2, 0.05)}
        escala={0.86 + 0.06 * cel}
        rx={6}
        ry={-16 + 6 * empurra}
        rz={2}
        largura={400}
        altura={800}
        opacidade={cel}
      >
        <TelaChatCelular f={f} ini={INI + 18} />
      </Celular>

      <div
        style={{
          position: "absolute",
          left: 470,
          top: 1310,
          transform: `scale(${selo})`,
          transformOrigin: "left center",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "#fff",
          borderRadius: 999,
          padding: "12px 22px 12px 14px",
          boxShadow: "0 20px 40px -18px rgba(17,24,39,0.4)",
          fontFamily: FONTE.ui,
          fontWeight: 700,
          fontSize: 24,
          color: COR.texto,
          whiteSpace: "nowrap",
        }}
      >
        <CheckCircle2 color={COR.verdeOk} size={30} /> Conversas organizadas
      </div>
    </AbsoluteFill>
  );
};
