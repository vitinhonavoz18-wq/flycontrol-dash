import type { Recorte } from "./useRecorteDoAlvo";

export type HolofoteProps = {
  /** A área que fica acesa. `null` escurece a tela inteira. */
  recorte: Recorte | null;
};

/**
 * O escuro em volta do que importa agora.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * O BURACO É UM BURACO DE VERDADE, NÃO UM DESENHO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * O escuro é feito de QUATRO retângulos — acima, abaixo, à esquerda e à
 * direita do alvo. No meio não existe elemento nenhum.
 *
 * A alternativa comum (uma tela escura inteira com um recorte desenhado por
 * cima) parece igual e não é: o recorte continua sendo vidro. O dedo bate
 * nele, o clique morre ali, e o lojista fica tocando o campo que está vendo
 * aceso sem nada acontecer. É a vitrine iluminada com a porta trancada.
 *
 * Com quatro retângulos, o meio é ar: o clique chega no campo porque não há
 * nada entre o dedo e ele. E o que está debaixo do escuro fica bloqueado de
 * graça, porque tem um painel em cima.
 *
 * O ESCURO FICA ABAIXO DOS DIÁLOGOS
 *
 * `--z-guia-holofote` é 45, e todo diálogo, seletor e menu do projeto é 50.
 * O formulário que o guia mandou abrir precisa abrir POR CIMA dele — senão o
 * guia tranca a porta que ele mesmo mandou usar.
 */
export function Holofote({ recorte }: HolofoteProps) {
  const escuro = "fixed bg-black/60 z-[var(--z-guia-holofote)] transition-all duration-200";

  if (!recorte) {
    // Sem alvo, escurece tudo: a etapa fala da tela inteira, não de um campo.
    return <div className={`${escuro} inset-0`} aria-hidden="true" />;
  }

  const { top, left, width, height } = recorte;

  return (
    <div aria-hidden="true">
      <div className={`${escuro} inset-x-0 top-0`} style={{ height: Math.max(0, top) }} />
      <div className={`${escuro} inset-x-0 bottom-0`} style={{ top: top + height }} />
      <div className={`${escuro} left-0`} style={{ top, height, width: Math.max(0, left) }} />
      <div className={`${escuro} right-0`} style={{ top, height, left: left + width }} />

      {/* A moldura do que está aceso. Não captura toque: é só a borda
          brilhante, o meio continua sendo ar. */}
      <div
        className="pointer-events-none fixed z-[var(--z-guia-holofote)] rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-transparent transition-all duration-200"
        style={{ top, left, width, height }}
      />
    </div>
  );
}
