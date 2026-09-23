import { useEffect, useState } from "react";

/**
 * Espera a pessoa parar de digitar antes de buscar: uma consulta por
 * palavra, não uma por letra.
 */
export function useBuscaComPausa(): [string, string, (v: string) => void] {
  const [digitado, setDigitado] = useState("");
  const [busca, setBusca] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setBusca(digitado.trim()), 350);
    return () => window.clearTimeout(t);
  }, [digitado]);
  return [digitado, busca, setDigitado];
}
