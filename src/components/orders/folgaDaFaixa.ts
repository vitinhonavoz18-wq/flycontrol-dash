import { useEffect, useState, type RefObject } from "react";

/**
 * A folga que o quadro abre embaixo enquanto a faixa de "Finalizar pedido"
 * está no ar.
 *
 * POR QUE ELA EXISTE
 *
 * A faixa fica colada na parte de baixo da tela. Sem essa folga, o último
 * card de uma coluna comprida ficaria embaixo dela, sem jeito de alcançar —
 * a pessoa rolaria até o fim e o card continuaria escondido.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * POR QUE ELA NÃO É RECOLHIDA NA HORA
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Se a pessoa rolou até o fim da página, ela está literalmente APOIADA nessa
 * folga. Tirá-la naquele instante faz o navegador puxar a rolagem de volta, e
 * a tela inteira dá um salto para baixo bem no momento em que o pedido acabou
 * de ser solto.
 *
 * É puxar o tapete de baixo de quem está em cima dele.
 *
 * Então a folga só é recolhida quando a página NÃO está apoiada nela. Se
 * estiver, ela fica — é espaço em branco embaixo do último card, que ninguém
 * nota — e some sozinha assim que a pessoa rolar para cima.
 */

export type MedidaDaPagina = {
  /** Quanto a página já rolou. */
  rolagem: number;
  /** Altura visível da janela. */
  janela: number;
  /** Altura total do conteúdo, já contando a folga. */
  conteudo: number;
  /** Tamanho da folga que se quer recolher. */
  folga: number;
};

/** Dá para recolher a folga sem a tela saltar? */
export function podeRecolherAFolga({ rolagem, janela, conteudo, folga }: MedidaDaPagina): boolean {
  // Até onde daria para rolar DEPOIS de tirar a folga. O piso em zero importa:
  // numa tela curta, onde o conteúdo nem enche a janela, essa conta dá
  // negativo — e não existe rolagem para ser puxada, então recolher é sempre
  // seguro ali.
  const rolagemMaximaDepois = Math.max(0, conteudo - folga - janela);

  // Só é seguro se a pessoa já está dentro do que vai sobrar.
  return rolagem <= rolagemMaximaDepois;
}

/**
 * Diz se o quadro deve estar com a folga aberta.
 *
 * `alvo` é o elemento que recebe a folga — ela é medida nele, e não
 * recalculada aqui, para o valor continuar sendo o do CSS mesmo quando ele
 * mudar de tamanho entre o celular e o computador.
 */
export function useFolgaDaFaixa(ativa: boolean, alvo: RefObject<HTMLElement | null>): boolean {
  const [aberta, setAberta] = useState(false);

  useEffect(() => {
    if (ativa) {
      setAberta(true);
      return;
    }
    if (!aberta || typeof window === "undefined") return;

    const tentarRecolher = () => {
      const el = alvo.current;
      const folga = el ? Number.parseFloat(getComputedStyle(el).paddingBottom) || 0 : 0;
      const podeRecolher = podeRecolherAFolga({
        rolagem: window.scrollY,
        janela: window.innerHeight,
        conteudo: document.documentElement.scrollHeight,
        folga,
      });
      if (podeRecolher) setAberta(false);
      return podeRecolher;
    };

    if (tentarRecolher()) return;

    // Ainda apoiada: espera a pessoa sair de cima.
    const aoMexer = () => {
      if (tentarRecolher()) desligar();
    };
    const desligar = () => {
      window.removeEventListener("scroll", aoMexer);
      window.removeEventListener("resize", aoMexer);
    };
    window.addEventListener("scroll", aoMexer, { passive: true });
    window.addEventListener("resize", aoMexer);
    return desligar;
  }, [ativa, aberta, alvo]);

  return aberta;
}
