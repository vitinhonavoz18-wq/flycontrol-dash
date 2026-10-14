import React from 'react';
import { AbsoluteFill, Audio, staticFile } from 'remotion';
import tl from '../timeline-short.json';
import { Background } from '../components/Atmos';
import { Captions, captionGroups } from '../components/Captions';
import { FontLoader } from '../FontLoader';
import { ShortIntro } from './Intro';
import { ShortMenus } from './Menus';
import { ShortMontage } from './Montage';
import { Gestao } from './Gestao';
import { Final } from './Final';

const GROUPS = captionGroups(tl.words as { text: string; start: number; end: number }[]);
export type ShortProps = { audio: 'mix' | 'bed' | 'none'; captions: boolean };

/** Anúncio curto (~24 s). Tudo é função de src/timeline-short.json: render sempre igual. */
export const ShortMain: React.FC<ShortProps> = ({ audio, captions }) => (
  <AbsoluteFill style={{ background: '#06070a', overflow: 'hidden' }}>
    <FontLoader />
    <Background fly={tl.markers.fly1} />
    <ShortIntro />
    <ShortMenus />
    <ShortMontage />
    <Gestao />
    <Final />
    {captions && <Captions groups={GROUPS} />}
    {audio === 'mix' && <Audio src={staticFile('audio/short_mix_final.wav')} />}
    {audio === 'bed' && <Audio src={staticFile('audio/short_bed_final.wav')} />}
  </AbsoluteFill>
);
