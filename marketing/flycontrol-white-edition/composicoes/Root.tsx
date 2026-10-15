import React from 'react';
import { Composition } from 'remotion';
import { WhiteAd, WhiteProps } from './WhiteAd';
import { Timeline, f, FPS } from '../componentes-3d/lib';
import v2 from './timeline-v2.json';
import v25 from './timeline-25s.json';

const T2 = v2 as unknown as Timeline;
const T25 = v25 as unknown as Timeline;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="WhiteEditionV2" component={WhiteAd} durationInFrames={f(T2.duration)} fps={FPS} width={1080} height={1920} defaultProps={{ tl: T2, versao: 'v2', voz: true } as WhiteProps} />
    <Composition id="WhiteEdition25s" component={WhiteAd} durationInFrames={f(T25.duration)} fps={FPS} width={1080} height={1920} defaultProps={{ tl: T25, versao: '25s', voz: true } as WhiteProps} />
    <Composition id="WhiteEditionSemVoz" component={WhiteAd} durationInFrames={f(T2.duration)} fps={FPS} width={1080} height={1920} defaultProps={{ tl: T2, versao: 'v2', voz: false } as WhiteProps} />
  </>
);
