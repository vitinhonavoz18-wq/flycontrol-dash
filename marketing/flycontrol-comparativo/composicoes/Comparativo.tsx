import React from 'react';
import { AbsoluteFill, Audio, staticFile } from 'remotion';
import { WT } from '../componentes/lib';
import { FontLoader } from '../componentes/FontLoader';
import { WhiteStudio } from '../componentes/Studio';
import { Agenda, AgendaCtx } from '../componentes/Money';
import { Cena1, CenaTaxa } from '../componentes/scenes/Taxas';
import { Cena4, Cena5 } from '../componentes/scenes/Virada';
import { Cena6 } from '../componentes/scenes/CemPedidos';
import { Cena7 } from '../componentes/scenes/Cardapios';
import { Cena8 } from '../componentes/scenes/Final';
import roteiro from './roteiro.json';

/** audio: nome do arquivo em assets/audio (sem .wav); vazio = sem áudio (quadros de conferência). */
export type ComparativoProps = { versao: '53s' | '30s'; audio: string };

/** FlyControl — Quanto custa vender? Cada cena lê o seu trecho em roteiro.json; versões curtas só aceleram. */
export const Comparativo: React.FC<ComparativoProps> = ({ versao, audio }) => {
  const v = roteiro.versoes[versao];
  return (
    <AgendaCtx.Provider value={{ agenda: v.cenas as unknown as Agenda, duracao: v.duracao }}>
      <AbsoluteFill style={{ background: WT.bg, overflow: 'hidden' }}>
        <FontLoader />
        <WhiteStudio />
        <Cena1 />
        <CenaTaxa id="ifood" cena="s2" />
        <CenaTaxa id="99food" cena="s3" />
        <Cena4 />
        <Cena5 />
        <Cena6 />
        <Cena7 />
        <Cena8 />
        {audio ? <Audio src={staticFile(`audio/${audio}.wav`)} /> : null}
      </AbsoluteFill>
    </AgendaCtx.Provider>
  );
};
