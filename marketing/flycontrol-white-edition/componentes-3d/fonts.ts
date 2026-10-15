import { staticFile } from 'remotion';
import { FACES } from './faces';
export const display = 'Montserrat';
export const body = 'Inter';
export const fontCss = FACES.map(
  (f) => `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-style:normal;font-display:block;src:url(${staticFile('fonts/' + f.file)}) format('woff2');unicode-range:${f.range};}`,
).join('\n');
