import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { Fundo } from "./comp/Fundo";
import { Legenda } from "./comp/Legenda";
import { Fontes } from "./Fontes";
import { CenaCaos } from "./cenas/CenaCaos";
import { CenaCRM } from "./cenas/CenaCRM";
import { CenaIA } from "./cenas/CenaIA";
import { CenaEcossistema } from "./cenas/CenaEcossistema";
import { CenaBeneficio } from "./cenas/CenaBeneficio";
import { CenaFinal } from "./cenas/CenaFinal";
import T from "./tempos.json";

export type PropsAnuncio = { videoCena6: string | null; comAudio: boolean };

const C = T.cenas;

/** Monta a cena só no intervalo dela; as cenas usam o quadro GLOBAL (tempos.json). */
const Janela: React.FC<{ de: number; ate: number; children: React.ReactNode }> = ({ de, ate, children }) => {
  const f = useCurrentFrame();
  return f >= de && f < ate ? <>{children}</> : null;
};

export const Anuncio: React.FC<PropsAnuncio> = ({ comAudio, videoCena6 }) => (
  <AbsoluteFill style={{ background: "#fff" }}>
    <Fontes />
    <Fundo />
    <Janela de={0} ate={C.c3[0] + 50}>
      <CenaCaos />
    </Janela>
    <Janela de={T.feixe} ate={C.c3[1] + 10}>
      <CenaCRM />
    </Janela>
    <Janela de={C.c4[0] - 6} ate={C.c4[1] + 10}>
      <CenaIA />
    </Janela>
    <Janela de={C.c5[0] - 8} ate={C.c5[1] + 10}>
      <CenaEcossistema />
    </Janela>
    <Janela de={C.c6[0] - 8} ate={C.c6[1] + 12}>
      <CenaBeneficio video={videoCena6} />
    </Janela>
    <Janela de={C.c7[0] - 6} ate={C.c7[1]}>
      <CenaFinal />
    </Janela>
    <Legenda />
    {comAudio && <Audio src={staticFile("audio/mix_final.wav")} />}
  </AbsoluteFill>
);
