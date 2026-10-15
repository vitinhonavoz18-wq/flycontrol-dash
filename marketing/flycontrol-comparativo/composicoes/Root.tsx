import React from 'react';
import { Composition } from 'remotion';
import { Comparativo, ComparativoProps } from './Comparativo';
import { FPS, f } from '../componentes/lib';
import roteiro from './roteiro.json';

const d = (v: '53s' | '30s') => f(roteiro.versoes[v].duracao);

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Comparativo53s" component={Comparativo} durationInFrames={d('53s')} fps={FPS} width={1080} height={1920} defaultProps={{ versao: '53s', audio: 'comparativo_53s_voz' } as ComparativoProps} />
    <Composition id="Comparativo30s" component={Comparativo} durationInFrames={d('30s')} fps={FPS} width={1080} height={1920} defaultProps={{ versao: '30s', audio: 'comparativo_30s_voz' } as ComparativoProps} />
    <Composition id="ComparativoSemVoz" component={Comparativo} durationInFrames={d('53s')} fps={FPS} width={1080} height={1920} defaultProps={{ versao: '53s', audio: 'comparativo_53s' } as ComparativoProps} />
  </>
);
