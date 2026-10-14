import React from 'react';
import { Composition, Sequence } from 'remotion';
import { Main, MainProps } from './Main';
import { FPS, T, f } from './lib';

const W = 1080;
const H = 1920;

/** Trecho do anúncio completo (mesma animação, mesmo áudio). */
const Cut: React.FC<{ from: number; to: number; at: number; props: MainProps }> = ({ from, to, at, props }) => (
  <Sequence from={f(at)} durationInFrames={f(to - from)}>
    <Sequence from={-f(from)}>
      <Main {...props} />
    </Sequence>
  </Sequence>
);

// Versão resumida (~26 s): pergunta → virada → cardápios com vídeo de capa → marca e CTA.
const SHORT = [
  { from: 13.4, to: 25.4 },
  { from: 36.6, to: 41.0 },
  { from: 48.9, to: 59.0 },
];
const shortLen = SHORT.reduce((s, c) => s + (c.to - c.from), 0);

const Short: React.FC = () => {
  let at = 0;
  return (
    <>
      {SHORT.map((c, i) => {
        const el = <Cut key={i} from={c.from} to={c.to} at={at} props={{ audio: 'mix', captions: true }} />;
        at += c.to - c.from;
        return el;
      })}
    </>
  );
};

const Transition: React.FC = () => <Cut from={16.8} to={22.6} at={0} props={{ audio: 'mix', captions: false }} />;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Anuncio" component={Main} durationInFrames={f(T.duration)} fps={FPS} width={W} height={H} defaultProps={{ audio: 'mix', captions: true } as MainProps} />
    <Composition id="SemNarracao" component={Main} durationInFrames={f(T.duration)} fps={FPS} width={W} height={H} defaultProps={{ audio: 'bed', captions: false } as MainProps} />
    <Composition id="Resumido" component={Short} durationInFrames={f(shortLen)} fps={FPS} width={W} height={H} />
    <Composition id="PreviewTransicao" component={Transition} durationInFrames={f(22.6 - 16.8)} fps={FPS} width={W} height={H} />
  </>
);
