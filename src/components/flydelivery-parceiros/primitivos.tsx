import type { ReactNode } from "react";
import { Reveal } from "@/components/landing/primitivos";

/**
 * O cabeçalho que abre cada seção: etiqueta laranja, título e uma frase.
 *
 * O `Reveal` (aparecer ao rolar) é o mesmo da página atual do FlyControl —
 * reaproveitado, não copiado.
 */
export function CabecalhoDeSecao({
  id,
  rotulo,
  titulo,
  texto,
  centralizado = false,
  escuro = false,
}: {
  id: string;
  rotulo: ReactNode;
  titulo: ReactNode;
  texto?: ReactNode;
  centralizado?: boolean;
  escuro?: boolean;
}) {
  return (
    <Reveal className={centralizado ? "mx-auto max-w-3xl text-center" : "max-w-2xl"}>
      <p className="fdp-rotulo" style={escuro ? { color: "var(--fdp-laranja-claro)" } : undefined}>
        {rotulo}
      </p>
      <h2 id={id} className="fdp-titulo-secao mt-4" style={escuro ? { color: "#fff" } : undefined}>
        {titulo}
      </h2>
      {texto && (
        <p
          className={`fdp-texto-lg mt-5 ${centralizado ? "mx-auto max-w-2xl" : "max-w-xl"}`}
          style={escuro ? { color: "rgb(255 255 255 / 0.72)" } : undefined}
        >
          {texto}
        </p>
      )}
    </Reveal>
  );
}

/** "Em breve" — para o que ainda não existe no sistema. */
export function SeloEmBreve({ escuro = false }: { escuro?: boolean }) {
  return (
    <span
      className="fdp-selo"
      style={
        escuro
          ? {
              background: "rgb(255 255 255 / 0.08)",
              color: "var(--fdp-laranja-claro)",
              borderColor: "rgb(255 138 61 / 0.35)",
            }
          : undefined
      }
    >
      Em breve
    </span>
  );
}
