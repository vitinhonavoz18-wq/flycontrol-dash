import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { Celular } from "../comp/Celular";
import { TelaChatCelular } from "../comp/TelaChatCelular";
import { Titulo } from "../comp/Titulo";
import { COR, FONTE, entraSai, iv, pop, suave } from "../estilo";
import T from "../tempos.json";

const [INI] = T.cenas.c7;
const E = T.c7;

export const CenaFinal: React.FC = () => {
  const f = useCurrentFrame();
  const afasta = iv(f, [INI - 4, INI + 30], [0, 1], entraSai);
  const logo = iv(f, [E.logo, E.logo + 30], [0, 1], suave);
  const pulso = iv(f, [E.final, E.final + 8], [0, 1]) * iv(f, [E.final + 8, E.final + 28], [1, 0]);
  const sec = iv(f, [E.logo + 30, E.logo + 46], [0, 1], suave);
  const botao = pop(f, E.logo + 40, 20);
  const url = iv(f, [E.logo + 52, E.logo + 66], [0, 1], suave);
  const brilho = ((f - (E.logo + 60)) % 60) / 60;

  return (
    <AbsoluteFill style={{ opacity: iv(f, [INI - 6, INI + 6], [0, 1]) }}>
      <AbsoluteFill style={{ background: "#fff" }} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(560px 420px at 540px 640px, rgba(255,90,0,${0.12 * logo + 0.12 * pulso}), transparent 70%)`,
        }}
      />
      {/* o celular se afasta */}
      {afasta < 1 && (
        <Celular
          x={790 - 250 * afasta}
          y={1010 - 360 * afasta}
          escala={0.92 - 0.6 * afasta}
          rx={6 + 20 * afasta}
          ry={-10 + 10 * afasta}
          largura={400}
          altura={800}
          opacidade={1 - afasta}
          desfoque={afasta * 8}
        >
          <TelaChatCelular f={999999} ini={0} />
        </Celular>
      )}

      {/* logotipo oficial */}
      <div
        style={{
          position: "absolute",
          left: 540,
          top: 640,
          width: 640,
          transform: `translate(-50%,-50%) scale(${(0.8 + 0.2 * logo) * (1 + 0.035 * pulso)})`,
          opacity: logo,
          filter: logo < 0.99 ? `blur(${(1 - logo) * 16}px)` : `drop-shadow(0 0 ${24 * pulso}px rgba(255,90,0,0.6))`,
        }}
      >
        <Img src={staticFile("img/logo-hero.png")} style={{ width: "100%" }} />
      </div>

      <Titulo
        f={f}
        entra={E.logo + 18}
        y={930}
        tamanho={78}
        passo={3}
        linhas={[{ texto: "SEU ATENDIMENTO" }, { texto: "PODE IR ALÉM.", cor: COR.laranja }]}
      />

      <div
        style={{
          position: "absolute",
          top: 1112,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: FONTE.ui,
          fontWeight: 700,
          fontSize: 28,
          letterSpacing: "0.12em",
          color: COR.cinza,
          opacity: sec,
          transform: `translateY(${(1 - sec) * 16}px)`,
        }}
      >
        CRM <span style={{ color: COR.laranja }}>+</span> WHATSAPP <span style={{ color: COR.laranja }}>+</span> INTELIGÊNCIA ARTIFICIAL
      </div>

      <div style={{ position: "absolute", top: 1180, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            transform: `scale(${botao})`,
            background: `linear-gradient(135deg, ${COR.laranjaClaro}, ${COR.laranja})`,
            color: "#fff",
            fontFamily: FONTE.ui,
            fontWeight: 800,
            fontSize: 38,
            letterSpacing: "0.02em",
            padding: "26px 56px",
            borderRadius: 999,
            boxShadow: "0 24px 50px -18px rgba(255,90,0,0.85)",
            whiteSpace: "nowrap",
          }}
        >
          CONHEÇA O FLYCONTROL
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: 120,
              left: `${-30 + brilho * 160}%`,
              background: "linear-gradient(100deg, transparent, rgba(255,255,255,0.55), transparent)",
              transform: "skewX(-20deg)",
              opacity: f > E.logo + 60 ? 1 : 0,
            }}
          />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 1318,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: FONTE.ui,
          fontWeight: 700,
          fontSize: 34,
          color: COR.texto,
          opacity: url,
          transform: `translateY(${(1 - url) * 14}px)`,
        }}
      >
        flycontrol.conectfly.com.br
      </div>
    </AbsoluteFill>
  );
};
