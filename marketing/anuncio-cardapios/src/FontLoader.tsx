import React, { useEffect, useState } from 'react';
import { continueRender, delayRender } from 'remotion';
import { FACES } from './faces';
import { fontCss } from './fonts';

/** Segura cada quadro até as fontes locais carregarem (render determinístico). */
export const FontLoader: React.FC = () => {
  const [handle] = useState(() => delayRender('fontes'));
  useEffect(() => {
    let done = false;
    const finish = () => { if (!done) { done = true; continueRender(handle); } };
    Promise.all(FACES.map((f) => document.fonts.load(`${f.weight} 40px '${f.family}'`, 'AÇÃÉáçõ'))).then(finish, finish);
    const id = setTimeout(finish, 8000);
    return () => clearTimeout(id);
  }, [handle]);
  return <style>{fontCss}</style>;
};
