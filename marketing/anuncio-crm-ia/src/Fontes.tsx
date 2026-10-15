import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";

const ARQUIVOS: Array<[string, number, string]> = [
  ["Bricolage Grotesque", 600, "bricolage-grotesque-latin-600-normal.woff2"],
  ["Bricolage Grotesque", 800, "bricolage-grotesque-latin-800-normal.woff2"],
  ["Instrument Sans", 400, "instrument-sans-latin-400-normal.woff2"],
  ["Instrument Sans", 500, "instrument-sans-latin-500-normal.woff2"],
  ["Instrument Sans", 600, "instrument-sans-latin-600-normal.woff2"],
  ["Instrument Sans", 700, "instrument-sans-latin-700-normal.woff2"],
  ["Inter", 400, "inter-latin-400-normal.woff2"],
  ["Inter", 500, "inter-latin-500-normal.woff2"],
  ["Inter", 600, "inter-latin-600-normal.woff2"],
  ["Inter", 700, "inter-latin-700-normal.woff2"],
  ["Inter", 800, "inter-latin-800-normal.woff2"],
  ["Courier Prime", 700, "courier-prime-latin-700-normal.woff2"],
];

/** Carrega as fontes da marca antes de qualquer quadro ser fotografado. */
export const Fontes: React.FC = () => {
  const [handle] = useState(() => delayRender("fontes"));
  useEffect(() => {
    Promise.all(
      ARQUIVOS.map(([fam, peso, arq]) => {
        const ff = new FontFace(fam, `url(${staticFile(`fonts/${arq}`)}) format('woff2')`, {
          weight: String(peso),
        });
        return ff.load().then((f) => document.fonts.add(f));
      }),
    ).then(() => continueRender(handle));
  }, [handle]);
  return null;
};
