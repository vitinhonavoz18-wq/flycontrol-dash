/**
 * Desenha a comanda — na tela (prévia) e no papel, com o MESMO elemento.
 *
 * Não existe uma "versão de tela" e outra "de impressão": o que o lojista vê
 * aqui é exatamente o bloco que vai para a impressora, letra por letra,
 * linha por linha. Cada linha da lista vira uma linha no papel.
 */

import { forwardRef } from "react";
import type { Linha } from "@/lib/impressao/comanda";
import type { PerfilDeImpressao } from "@/lib/impressao/perfil";
import { estiloDaGrade, estiloDeImpressao, larguraDaAreaMm } from "@/lib/impressao/papel";

type Props = {
  linhas: Linha[];
  perfil: PerfilDeImpressao;
  logoUrl?: string | null;
  nomeDaLoja?: string;
  /** `false` para a prévia que não vai para o papel (quando há duas na tela). */
  imprimivel?: boolean;
};

export const ComandaImpressa = forwardRef<HTMLDivElement, Props>(function ComandaImpressa(
  { linhas, perfil, logoUrl, nomeDaLoja, imprimivel = true },
  ref,
) {
  const grade = {
    colunas: perfil.colunas,
    margemMm: perfil.margemMm,
    espacamento: perfil.espacamento,
  };
  const comLogo = perfil.mostrarLogo && !!logoUrl;

  return (
    <>
      <div
        ref={ref}
        className={`${imprimivel ? "print-area" : ""} comanda-folha`}
        // Na tela, a folha tem a largura da área impressa de verdade — a mesma
        // usada na conta do tamanho da letra. Assim a prévia quebra as linhas
        // nos mesmos lugares que o papel.
        style={{ width: `${larguraDaAreaMm(perfil.papel)}mm`, padding: `${perfil.margemMm}mm` }}
        data-colunas={perfil.colunas}
      >
        {comLogo && (
          <img
            src={logoUrl ?? undefined}
            alt={nomeDaLoja ?? "Logo da loja"}
            className="comanda-logo"
          />
        )}
        <div className="comanda-texto" role="document" aria-label="Comanda">
          {linhas.map((l, i) => (
            <div key={i} className={`l l-${l.estilo}`}>
              {l.texto || " "}
            </div>
          ))}
        </div>
      </div>
      <style>{`
        .comanda-folha {
          max-width: 100%;
          background: #fff;
          color: #000;
          box-sizing: border-box;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        }
        .comanda-logo {
          display: block;
          margin: 0 auto 2mm auto;
          max-height: 24mm;
          max-width: 80%;
          object-fit: contain;
        }
        ${imprimivel ? estiloDeImpressao(perfil.papel, grade) : estiloDaGrade(perfil.papel, grade)}
      `}</style>
    </>
  );
});
