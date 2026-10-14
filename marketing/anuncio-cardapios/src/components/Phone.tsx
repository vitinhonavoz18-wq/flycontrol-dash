import React from 'react';
import { C } from '../lib';

/** Moldura de smartphone. A tela é 1170x2532 (proporção das capturas reais). */
export const SCREEN_RATIO = 2532 / 1170;

export const Phone: React.FC<{
  width: number;
  children: React.ReactNode;
  glow?: string;
  glowStrength?: number;
  style?: React.CSSProperties;
}> = ({ width, children, glow = C.fire, glowStrength = 0.5, style }) => {
  const bezel = Math.round(width * 0.028);
  const sw = width - bezel * 2;
  const sh = Math.round(sw * SCREEN_RATIO);
  const r = width * 0.13;
  return (
    <div
      style={{
        width,
        height: sh + bezel * 2,
        borderRadius: r,
        padding: bezel,
        background: 'linear-gradient(145deg,#3a3d44 0%,#121317 35%,#0a0b0d 60%,#2b2e34 100%)',
        boxShadow: [
          `0 0 0 2px rgba(255,255,255,0.08) inset`,
          `0 ${width * 0.06}px ${width * 0.18}px rgba(0,0,0,0.75)`,
          `0 0 ${width * 0.25}px ${hexA(glow, glowStrength * 0.55)}`,
        ].join(','),
        position: 'relative',
        transformStyle: 'preserve-3d',
        ...style,
      }}
    >
      <div
        style={{
          width: sw,
          height: sh,
          borderRadius: r - bezel,
          overflow: 'hidden',
          position: 'relative',
          background: '#000',
        }}
      >
        {children}
        {/* reflexo de vidro */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(115deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 28%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.05) 100%)',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
};

export const screenSize = (width: number) => {
  const bezel = Math.round(width * 0.028);
  const sw = width - bezel * 2;
  return { sw, sh: Math.round(sw * SCREEN_RATIO), bezel };
};

export function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}
