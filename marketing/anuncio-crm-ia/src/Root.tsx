import { Composition, Still } from "remotion";
import { Anuncio, type PropsAnuncio } from "./Anuncio";
import { Capa } from "./Capa";
import tempos from "./tempos.json";

const padrao: PropsAnuncio = {
  // Coloque um vídeo vertical em public/video/ e informe o caminho aqui
  // (ex.: "video/cozinha.mp4") para trocar a cena 6 por uma filmagem real.
  videoCena6: null,
  comAudio: true,
};

export const Root: React.FC = () => (
  <>
    <Composition
      id="AnuncioCRM"
      component={Anuncio}
      durationInFrames={tempos.total}
      fps={tempos.fps}
      width={tempos.largura}
      height={tempos.altura}
      defaultProps={padrao}
    />
    <Still id="Capa" component={Capa} width={tempos.largura} height={tempos.altura} />
  </>
);
