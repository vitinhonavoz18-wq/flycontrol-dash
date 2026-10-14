import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, staticFile } from 'remotion';

/** Conteúdo desenhado em 390x844 (tamanho lógico das telas reais) e escalado para a tela do celular. */
export const Logical: React.FC<{ sw: number; children: React.ReactNode }> = ({ sw, children }) => (
  <div style={{ width: 390, height: 844, transform: `scale(${sw / 390})`, transformOrigin: '0 0', position: 'absolute', left: 0, top: 0 }}>{children}</div>
);

/** Clipe real gravado do cardápio (1170x2532) ocupando a tela inteira. */
export const Clip: React.FC<{ name: string; startFrom?: number }> = ({ name, startFrom = 0 }) => (
  <AbsoluteFill>
    <OffthreadVideo src={staticFile(`clips/${name}.mp4`)} startFrom={startFrom} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  </AbsoluteFill>
);

export const Still: React.FC<{ name: string; style?: React.CSSProperties }> = ({ name, style }) => (
  <Img src={staticFile(`stills/${name}.jpg`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', ...style }} />
);
