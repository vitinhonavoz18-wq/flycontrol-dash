import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * O painel que sobe de baixo no celular (o "Mais" da barra inferior).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUAL ERA O PROBLEMA DE VERDADE
 *
 * A queixa era "a animação trava". Medindo num celular intermediário
 * simulado, descobri que a animação em si estava bem: o que travava era o
 * ANTES dela. Do toque até o painel aparecer na tela passavam 300
 * milissegundos com a tela congelada — porque o painel inteiro era construído
 * do zero naquele instante: quinze itens, treze ícones, e toda a maquinaria da
 * biblioteca de janelas (travar a rolagem, prender o foco, esconder o resto da
 * página dos leitores de tela).
 *
 * É a diferença entre a porta emperrada e a porta que só é FABRICADA quando
 * alguém aperta a maçaneta. Lubrificar a dobradiça não resolve: o tempo estava
 * sendo gasto em montar a porta.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O QUE MUDOU
 *
 * 1. O painel é montado UMA VEZ, quando o navegador está ocioso — depois que a
 *    tela já carregou e o lojista já está trabalhando. Quando ele toca em
 *    "Mais", não há nada para construir: o painel só desliza.
 *
 * 2. Abrir e fechar mexem só em POSIÇÃO (o painel) e TRANSPARÊNCIA (o fundo
 *    escuro) — as duas únicas coisas que a placa de vídeo faz sozinha, sem
 *    redesenhar nada. A animação da biblioteca mexia também em DESFOQUE, mesmo
 *    com desfoque zero, e desfoque obriga a redesenhar tudo a cada quadro.
 *
 * 3. Quando está fechado, o painel fica escondido E sem receber toque — isso
 *    está escrito direto no elemento, não só na folha de estilo. Um painel
 *    invisível que continuasse capturando toques deixaria o aplicativo inteiro
 *    sem responder, e esse é o tipo de defeito que não pode depender de um
 *    arquivo de estilo carregar certo.
 *
 * O DESENHO NÃO MUDOU: mesmas bordas arredondadas, mesma altura máxima, mesmo
 * fundo escurecido, mesma sombra, mesmos cards.
 */

/** Tem de bater com o tempo das animações em `styles.css`. */
const SAIDA_MS = 200;

function focaveis(raiz: HTMLElement): HTMLElement[] {
  return [
    ...raiz.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((el) => el.offsetParent !== null);
}

export function BottomSheet({
  aberto,
  onAbertoChange,
  children,
  rotulo,
}: {
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  children: ReactNode;
  /** Nome do painel para quem usa leitor de tela. */
  rotulo: string;
}) {
  // Só existe no navegador: no servidor não há onde pendurar o painel.
  const [podeMontar, setPodeMontar] = useState(false);
  // Continua na tela durante a animação de saída, mesmo já "fechado".
  const [naTela, setNaTela] = useState(false);
  const painelRef = useRef<HTMLDivElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);

  // Pré-aquecimento: monta quando o navegador estiver de folga. Assim o custo
  // de construir o painel não cai em cima do toque do lojista — e também não
  // atrapalha o carregamento inicial da tela.
  useEffect(() => {
    const janela = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (janela.requestIdleCallback) {
      const id = janela.requestIdleCallback(() => setPodeMontar(true), { timeout: 3000 });
      return () => janela.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setPodeMontar(true), 1200);
    return () => window.clearTimeout(id);
  }, []);

  // Abrir mostra na hora; fechar espera a animação terminar para sumir.
  useEffect(() => {
    if (aberto) {
      setNaTela(true);
      return;
    }
    if (!naTela) return;
    const id = window.setTimeout(() => setNaTela(false), SAIDA_MS);
    return () => window.clearTimeout(id);
  }, [aberto, naTela]);

  const fechar = useCallback(() => onAbertoChange(false), [onAbertoChange]);

  // Enquanto o painel está aberto: a página atrás não rola, ESC fecha, e o
  // foco fica preso dentro do painel.
  useEffect(() => {
    if (!aberto) return;

    focoAnterior.current = document.activeElement as HTMLElement | null;
    painelRef.current?.focus({ preventScroll: true });

    const overflowAntes = document.body.style.overflow;
    // `overflow: hidden` no corpo. Em celular não existe barra de rolagem
    // ocupando largura, então isso não provoca o "pulo" da página que
    // acontece no computador.
    document.body.style.overflow = "hidden";

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        fechar();
        return;
      }
      if (e.key !== "Tab" || !painelRef.current) return;
      const lista = focaveis(painelRef.current);
      if (lista.length === 0) return;
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      const atual = document.activeElement;
      if (e.shiftKey && (atual === primeiro || atual === painelRef.current)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && atual === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAntes;
      // Devolve o foco para o botão "Mais", senão o teclado fica perdido no
      // início da página.
      focoAnterior.current?.focus?.({ preventScroll: true });
    };
  }, [aberto, fechar]);

  if (!podeMontar && !aberto) return null;
  if (typeof document === "undefined") return null;

  const estado = aberto ? "open" : "closed";
  // Escondido de verdade quando não está na tela: sem toque, sem leitura por
  // leitor de tela, sem atalho de teclado. Escrito no próprio elemento para
  // não depender de nenhuma folha de estilo.
  const escondido = !naTela;

  return createPortal(
    <>
      <div
        className="fly-sheet-fundo fixed inset-0 z-50 bg-black/80 md:hidden"
        data-state={estado}
        onClick={fechar}
        aria-hidden="true"
        style={{
          visibility: escondido ? "hidden" : "visible",
          pointerEvents: aberto ? "auto" : "none",
        }}
      />
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        tabIndex={-1}
        data-state={estado}
        inert={escondido}
        className="fly-sheet fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border bg-background shadow-lg outline-none md:hidden"
        style={{
          visibility: escondido ? "hidden" : "visible",
          pointerEvents: aberto ? "auto" : "none",
        }}
      >
        {/* O conteúdo inteiro acompanha o painel: nenhum card, ícone ou texto
            tem animação própria. Um movimento só, de uma peça só — é isso que
            faz parecer aplicativo nativo em vez de página web.

            A rolagem fica NESTA caixa de dentro, e não no painel que desliza:
            um elemento que anima e rola ao mesmo tempo faz o navegador
            desistir da forma rápida de desenhar. */}
        <div
          // 85vh MENOS a borda de cima do painel: a borda fica fora da caixa
          // de rolagem, então sem descontar 1 pixel o painel inteiro ficava 1
          // pixel mais alto que antes. Ninguém veria, mas o desenho tem de
          // ficar igual ao que já estava no ar.
          className="max-h-[calc(85vh-1px)] overflow-y-auto overscroll-contain"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}
