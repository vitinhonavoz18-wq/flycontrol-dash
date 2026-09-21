import { useEffect, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { CheckCircle2 } from "lucide-react";

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
 * POR QUE UMA FAIXA INTEIRA E NÃO UM BOTÃO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Antes isto era uma pastilha pequena flutuando embaixo. Acertar um alvo
 * pequeno com o pedido na mão, no celular, no meio do movimento da loja, é
 * difícil — e errar significa o pedido voltar para a coluna, dando a
 * impressão de que o sistema "não funcionou".
 *
 * Agora a lateral direita inteira vira o alvo. É a diferença entre ter que
 * acertar a boca do cesto de lixo e ter a parede inteira do fundo valendo:
 * com o pedido na mão, o lojista só precisa levar para o lado.
 *
 * SÓ APARECE PARA QUEM PODE FINALIZAR
 *
 * Um pedido que acabou de entrar não pode ir direto para "entregue" — nem
 * foi aceito ainda. Mostrar a faixa nesse caso seria oferecer uma porta que
 * não abre, e convidar ao engano que some com o pedido do quadro.
 *
 * A SAÍDA TAMBÉM É ANIMADA
 *
 * O componente continua montado durante a animação de saída; sumir de uma
 * vez faz a tela "piscar" no fim de todo arraste, e o olho lê isso como
 * defeito.
 */
export function FinalizeDropZone({ active }: FinalizeDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: "entregue", disabled: !active });

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
      // Foi aqui que o "finalizar" quebrou. O dnd-kit mede onde cada alvo
      // está no instante em que ele nasce, e guarda essa medida. A faixa
      // nascia fora da tela, à direita, esperando a animação de entrada — e
      // era essa posição, fora da tela, que ficava gravada. Depois, mesmo
      // com a faixa à vista, o ponteiro nunca "entrava" nela: para o
      // dnd-kit ela continuava do lado de fora do monitor.
      //
      // É o porteiro que anota o número da vaga quando o carro ainda está na
      // rua. Depois o carro estaciona, mas a ficha continua dizendo "lá
      // fora" — e ninguém acha o carro.
      //
      // A animação continua existindo: quem desliza é a camada de dentro.
      // Durante a animação de SAÍDA a faixa ainda está montada. Aí ela
      // devolve o toque para a tela: senão engoliria o primeiro clique do
      // lojista logo depois de soltar o pedido.
      className={`fixed inset-y-0 right-0 z-[var(--z-overlay)] flex w-[44%] min-w-[8.5rem] max-w-[22rem] items-stretch overflow-hidden sm:w-[32%] md:w-[26%] ${
        active ? "pointer-events-auto" : "pointer-events-none"
      }`}
      ref={setNodeRef}
      role="button"
      aria-label="Finalizar pedido. Solte o pedido aqui para enviá-lo ao histórico."
      aria-hidden={!active}
    >
      <div
        style={{ transitionDuration: `${DURACAO_MS}ms` }}
        className={`flex flex-1 flex-col items-center justify-center gap-3 rounded-l-3xl border-y-2 border-l-2 px-3 text-center shadow-2xl transition-[transform,background-color,border-color] ease-out will-change-transform ${
          dentro ? "translate-x-0" : "translate-x-full"
        } ${
          isOver
            ? "border-emerald-300 bg-emerald-500 text-white"
            : "border-emerald-500/60 border-dashed bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
        }`}
      >
        {/* O ícone e o texto carregam o significado sozinhos: quem não
            distingue verde precisa entender igual. */}
        <CheckCircle2
          className={`h-10 w-10 shrink-0 transition-transform sm:h-14 sm:w-14 ${
            isOver ? "scale-110" : ""
          }`}
          aria-hidden="true"
        />
        <span className="text-sm font-black uppercase leading-tight tracking-wide sm:text-base">
          {isOver ? "Solte para finalizar" : "Finalizar pedido"}
        </span>
        <span
          className={`text-[11px] font-semibold leading-snug transition-opacity ${
            isOver ? "opacity-90" : "opacity-70"
          }`}
        >
          {isOver ? "Vai para o histórico" : "Arraste até aqui"}
        </span>
      </div>
    </div>
  );
}
