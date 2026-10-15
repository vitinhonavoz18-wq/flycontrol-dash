import { AbsoluteFill, Img, staticFile } from "remotion";
import { Celular } from "./comp/Celular";
import { Fundo } from "./comp/Fundo";
import { Titulo } from "./comp/Titulo";
import { Cartao, TelaConversas } from "./cenas/CenaCaos";
import { Fontes } from "./Fontes";
import { COR, FONTE } from "./estilo";

const CARTOES_CAPA = [
  { nome: "Larissa M.", texto: "Qual a taxa de entrega?", x: 800, y: 700, z: 0.6 },
  { nome: "Gustavo P.", texto: "Aceita cartão?", x: 250, y: 860, z: 0.7 },
  { nome: "Aline C.", texto: "Vocês abrem domingo?", x: 830, y: 1080, z: 0.9 },
  { nome: "Rodrigo T.", texto: "Oi, alguém aí?", x: 240, y: 1220, z: 0.9 },
];

/** Capa do Reels: a pergunta, o celular lotado e a assinatura FlyControl. */
export const Capa: React.FC = () => (
  <AbsoluteFill>
    <Fontes />
    <Fundo calor={0.4} />
    <Titulo
      f={999}
      entra={0}
      y={250}
      tamanho={88}
      linhas={[{ texto: "MUITA MENSAGEM NO" }, { texto: "HORÁRIO DE PICO?", cor: COR.laranja }]}
    />
    <Celular x={540} y={1010} rx={8} ry={-10} rz={2} largura={420} altura={860}>
      <TelaConversas f={196} />
    </Celular>
    {CARTOES_CAPA.map((c, i) => (
      <div key={i} style={{ position: "absolute", left: c.x, top: c.y, transform: "translate(-50%,-50%)" }}>
        <Cartao nome={c.nome} texto={c.texto} i={i} escala={1} />
      </div>
    ))}
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 1450,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 18,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          background: COR.preto,
          borderRadius: 999,
          padding: "14px 30px 14px 18px",
          boxShadow: "0 20px 40px -18px rgba(0,0,0,0.5)",
        }}
      >
        <Img src={staticFile("img/flycontrol-mark.png")} style={{ height: 48 }} />
        <span style={{ fontFamily: FONTE.ui, fontWeight: 800, fontSize: 34, color: "#fff", letterSpacing: "0.02em" }}>
          CRM <span style={{ color: COR.laranjaClaro }}>+ IA</span> do FlyControl
        </span>
      </div>
    </div>
  </AbsoluteFill>
);
