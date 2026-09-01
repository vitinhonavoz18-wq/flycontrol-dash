import { useEffect, useState } from "react";

/**
 * Descobre se o visitante pediu menos animação no aparelho dele.
 *
 * Quem liga essa opção no celular ou no computador normalmente tem um motivo
 * — enjoo, enxaqueca, sensibilidade a movimento. A página respeita: nada de
 * flutuar, nada de reagir ao mouse. É como baixar o som ambiente do salão
 * quando o cliente avisa que está com dor de cabeça.
 *
 * O nome começa em inglês ("use") porque é assim que o React reconhece um
 * hook — a regra é dele, não nossa.
 */
export function useMenosAnimacao(): boolean {
  const [menos, setMenos] = useState(false);

  useEffect(() => {
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
    setMenos(consulta.matches);
    const aoMudar = (e: MediaQueryListEvent) => setMenos(e.matches);
    consulta.addEventListener("change", aoMudar);
    return () => consulta.removeEventListener("change", aoMudar);
  }, []);

  return menos;
}
