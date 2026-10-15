import React from 'react';
import { AbsoluteFill, Audio, staticFile } from 'remotion';
import { TLContext, Timeline } from '../componentes-3d/lib';
import { FontLoader } from '../componentes-3d/FontLoader';
import { WhiteStudio } from '../componentes-3d/Studio';
import { Captions, captionGroups } from '../componentes-3d/Captions';
import { Abertura } from '../componentes-3d/scenes/Abertura';
import { Galeria } from '../componentes-3d/scenes/Galeria';
import { Painel } from '../componentes-3d/scenes/Painel';
import { Encerramento } from '../componentes-3d/scenes/Encerramento';

export type WhiteProps = { tl: Timeline; versao: 'v2' | '25s'; voz: boolean };

/** FlyControl — White Edition. Tudo é função da linha do tempo da narração: render sempre igual. */
export const WhiteAd: React.FC<WhiteProps> = ({ tl, versao, voz }) => {
  const groups = captionGroups(tl.words);
  return (
    <TLContext.Provider value={tl}>
      <AbsoluteFill style={{ background: '#F8F9FB', overflow: 'hidden' }}>
        <FontLoader />
        <WhiteStudio />
        <Abertura />
        <Galeria />
        <Painel />
        <Encerramento />
        {voz && <Captions groups={groups} />}
        <Audio src={staticFile(voz ? `audio/${versao}_mix.wav` : `audio/${versao}_trilha_sem_voz.wav`)} />
      </AbsoluteFill>
    </TLContext.Provider>
  );
};
