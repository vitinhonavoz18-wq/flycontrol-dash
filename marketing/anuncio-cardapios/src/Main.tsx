import React from 'react';
import { AbsoluteFill, Audio, staticFile } from 'remotion';
import { Background } from './components/Atmos';
import { Captions } from './components/Captions';
import { Before } from './scenes/Before';
import { Menus } from './scenes/Menus';
import { Montage } from './scenes/Montage';
import { Features } from './scenes/Features';
import { Finale } from './scenes/Finale';
import { FontLoader } from './FontLoader';

export type MainProps = { audio: 'mix' | 'bed' | 'none'; captions: boolean };

/** Anúncio completo. Tudo é função do tempo da narração (src/timeline.json): render sempre igual. */
export const Main: React.FC<MainProps> = ({ audio, captions }) => (
  <AbsoluteFill style={{ background: '#06070a', overflow: 'hidden' }}>
    <FontLoader />
    <Background />
    <Before />
    <Menus />
    <Montage />
    <Features />
    <Finale />
    {captions && <Captions />}
    {audio === 'mix' && <Audio src={staticFile('audio/mix_final.wav')} />}
    {audio === 'bed' && <Audio src={staticFile('audio/bed_final.wav')} />}
  </AbsoluteFill>
);
