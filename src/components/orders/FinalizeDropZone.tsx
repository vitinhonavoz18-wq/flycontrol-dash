import { useEffect, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { CheckCircle2 } from "lucide-react";
import { FINALIZE_TARGET_ID } from "./orderStatusConfig";

export type FinalizeDropZoneProps = {
  /**
   * `true` só quando há um card na mão E esse card pode ser finalizado de
   * onde está. Quem decide é `canFinalizeFrom`, em `orderStatusConfig`.
   */
  active: boolean;
};

/** Tempo da entrada e da saída. Curto o bastante para não atrapalhar o gesto. */
const DURACAO_MS = 200;

/**
 * A faixa verde de "Finalizar pedido".
 *
 * ═══════════════════════════════════════════════════════════════════════
 * POR QUE ELA FICA EMBAIXO, E NÃO NA LATERAL
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Ela já foi uma faixa na lateral direita — e cobria justamente a coluna
 * "Saiu para entrega", que é de onde o pedido sai para ser finalizado. O
 * lojista pegava o card e a coluna de origem desaparecia atrás do verde: é
 * como puxar a toalha da mesa para poder alcançar o prato.
 *
 * Embaixo, atravessada, ela fica no caminho natural do polegar e não disputa
 * espaço com nenhuma coluna. E o quadro abre uma folga embaixo enquanto ela
 * está no ar, para os últimos cards continuarem alcançáveis.
 *
 * SÓ APARECE PARA QUEM PODE FINALIZAR
 *
 * Um pedido que acabou de entrar não pode ir direto para "entregue" — nem
 * foi aceito ainda. Mostrar a faixa nesse caso seria oferecer uma porta que
 * não abre, e convidar ao engano que some com o pedido do quadro.
 *
 * ONDE ELA PARA
 *
 * No celular ela encosta LOGO ACIMA da barra de navegação de baixo, nunca
 * atrás dela; no computador, onde essa barra não existe, ela desce até o pé
 * da tela e começa depois do menu lateral. Essa conta mora em `styles.css`,
 * na classe `faixa-finalizar`, porque depende de medidas que já são tokens
 * de lá.
 *
 * A SAÍDA TAMBÉM É ANIMADA
 *
 * O componente continua montado durante a animação de saída; sumir de uma
 * vez faz a tela "piscar" no fim de todo arraste, e o olho lê isso como
 * defeito.
 */
export function FinalizeDropZone({ active }: FinalizeDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: FINALIZE_TARGET_ID, disabled: !active });

  // `montado` segura o elemento no ar durante a saída; `dentro` é o que
  // realmente anima (de fora da tela para dentro e vice-versa).
  const [montado, setMontado] = useState(active);
  const [dentro, setDentro] = useState(false);

  useEffect(() => {
    if (active) {
      setMontado(true);
      // Um quadro depois: se entrasse já com a classe final, o navegador não
      // teria estado inicial para animar e a faixa apareceria estalada.
      const id = requestAnimationFrame(() => setDentro(true));
      return () => cancelAnimationFrame(id);
    }
    setDentro(false);
    const id = setTimeout(() => setMontado(false), DURACAO_MS);
    return () => clearTimeout(id);
  }, [active]);

  if (!montado) return null;

  return (
    <div
      // ═══════════════════════════════════════════════════════════════════
      // O ALVO FICA PARADO; QUEM DESLIZA É A PINTURA
      // ═══════════════════════════════════════════════════════════════════
      //
      // Este elemento — o que o dnd-kit conhece como alvo (`setNodeRef`) —
      // nasce já no lugar final e NUNCA se move.
      //
      // Foi aqui que o "finalizar" quebrou uma vez. O dnd-kit mede onde cada
      // alvo está no instante em que ele nasce, e guarda essa medida. A faixa
      // nascia fora da tela, esperando a animação de entrada — e era essa
      // posição, fora da tela, que ficava gravada. Depois, mesmo com a faixa
      // à vista, o ponteiro nunca "entrava" nela.
      //
      // É o porteiro que anota o número da vaga quando o carro ainda está na
      // rua. Depois o carro estaciona, mas a ficha continua dizendo "lá
      // fora" — e ninguém acha o carro.
      //
      // A animação continua existindo: quem desliza é a camada de dentro.
      // Durante a animação de SAÍDA a faixa ainda está montada. Aí ela
      // devolve o toque para a tela: senão engoliria o primeiro clique do
      // lojista logo depois de soltar o pedido.
      className={`faixa-finalizar z-[var(--z-overlay)] flex items-stretch overflow-hidden ${
        active ? "pointer-events-auto" : "pointer-events-none"
      }`}
      ref={setNodeRef}
      role="button"
      aria-label="Finalizar pedido. Solte o pedido aqui para enviá-lo ao histórico."
      aria-hidden={!active}
    >
      <div
        style={{ transitionDuration: `${DURACAO_MS}ms` }}
        className={`flex flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-4 text-center shadow-2xl transition-[transform,opacity,background-color,border-color] ease-out will-change-transform ${
          dentro ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
        } ${
          isOver
            ? "border-emerald-300 bg-emerald-500 text-white"
            : "border-dashed border-emerald-500/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
        }`}
      >
        {/* O FUNDO É OPACO DE PROPÓSITO.
            Com verde transparente, no celular os cards apareciam por trás da
            faixa e o texto ficava ilegível — letra verde em cima de letra
            branca em cima de card. É a placa de trânsito pintada em vidro.

            O ícone e o texto carregam o significado sozinhos: quem não
            distingue verde precisa entender igual. */}
        <CheckCircle2
          className={`h-8 w-8 shrink-0 transition-transform md:h-10 md:w-10 ${
            isOver ? "scale-110" : ""
          }`}
          aria-hidden="true"
        />
        <span className="text-sm font-black uppercase leading-tight tracking-wide md:text-lg">
          {isOver ? "Solte para finalizar" : "Arraste aqui para finalizar"}
        </span>
        <span
          className={`text-[11px] font-semibold leading-snug transition-opacity md:text-xs ${
            isOver ? "opacity-90" : "opacity-70"
          }`}
        >
          {/* Frase curta de propósito: numa tela de 390px, a explicação longa
              quebrava em duas linhas e empurrava o texto principal. */}
          Vai para o histórico
        </span>
      </div>
    </div>
  );
}
