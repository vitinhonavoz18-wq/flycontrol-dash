/**
 * A largura do papel da comanda.
 *
 * O PROBLEMA QUE ISTO RESOLVE
 *
 * A comanda era desenhada com 80 mm fixos e centralizada. Funcionava na
 * impressora térmica de 80 mm bem configurada — e falhava nas outras:
 *
 * - na bobina de 58 mm, a mais comum nas impressoras baratas, o lado direito
 *   (preços e total) era cortado;
 * - na impressora genérica que o computador acha que é "folha A4", a comanda
 *   ia para o meio da folha, e a impressora — que só alcança a borda
 *   esquerda — imprimia em branco ou pela metade;
 * - na impressora comum (jato de tinta, laser) saía uma tira estreita e
 *   miúda.
 *
 * Agora a comanda segue o papel. O padrão ("Automático") ocupa a largura que
 * a impressora informar, até 80 mm, encostada à esquerda — onde toda
 * impressora alcança. Quando a impressora informa a largura errada, o lojista
 * escolhe uma vez e o computador lembra.
 *
 * É a diferença entre o garçom que só sabe servir na mesa de quatro lugares e
 * o que olha o tamanho da mesa antes de pôr os pratos.
 */

export type Papel = "auto" | "80" | "58" | "a4";

export const PAPEIS: ReadonlyArray<{ id: Papel; rotulo: string; ajuda: string }> = [
  {
    id: "auto",
    rotulo: "Automático",
    ajuda: "Segue a largura que a impressora informar. Serve para a maioria.",
  },
  {
    id: "80",
    rotulo: "Bobina 80 mm",
    ajuda: "Impressora térmica de bobina larga.",
  },
  {
    id: "58",
    rotulo: "Bobina 58 mm",
    ajuda: "Impressora térmica pequena. Use se a comanda sai cortada do lado direito.",
  },
  {
    id: "a4",
    rotulo: "Folha A4 / Carta",
    ajuda: "Impressora comum, de jato de tinta ou laser.",
  },
];

/**
 * Guardado no computador, e não na conta da loja: cada computador tem a sua
 * impressora. O caixa com bobina de 58 mm e o escritório com impressora a
 * laser são da mesma loja e precisam de escolhas diferentes.
 */
const CHAVE = "flycontrol:papel-da-comanda";

export function ehPapel(valor: unknown): valor is Papel {
  return PAPEIS.some((p) => p.id === valor);
}

export function lerPapelSalvo(): Papel {
  try {
    const salvo = window.localStorage.getItem(CHAVE);
    return ehPapel(salvo) ? salvo : "auto";
  } catch {
    // Navegador em modo privado ou com armazenamento bloqueado: segue no
    // automático, que serve para a maioria.
    return "auto";
  }
}

export function salvarPapel(papel: Papel): void {
  try {
    window.localStorage.setItem(CHAVE, papel);
  } catch {
    // Sem armazenamento a escolha vale só para esta comanda — imprime igual.
  }
}

type Medidas = {
  /** Regra @page: tamanho e margem da folha. */
  pagina: string;
  /** Largura do corpo da página na impressão. */
  larguraDoCorpo: string;
  /** Largura da comanda (com o respiro interno). */
  larguraDaComanda: string;
  /** Largura máxima da comanda. */
  larguraMaxima: string;
  respiro: string;
  /**
   * Tamanho base das letras grandes (nome do cliente, total). Na bobina de
   * 58 mm, a letra do tamanho da de 80 mm quebrava cada nome em três linhas
   * e gastava o dobro de papel.
   */
  letraBase: string;
  /** Centralizar só quando a largura da folha é conhecida. */
  centralizar: boolean;
  fonte: string;
};

/**
 * As medidas de cada papel.
 *
 * As larguras de 72 mm e 48 mm são a área que a cabeça de impressão alcança
 * nas bobinas de 80 e 58 mm — a bobina é mais larga que a área impressa.
 *
 * O tamanho da FOLHA nunca é forçado — só a largura da comanda. Era
 * `size: 80mm auto` aqui, que nem é uma regra válida ("auto" junto de uma
 * medida), e cada navegador fazia uma coisa com ela. Forçar um tamanho
 * válido também não serve: parte das impressoras térmicas recusa folha de
 * tamanho personalizado. A folha fica sendo a que a impressora tem.
 */
export function medidasDoPapel(papel: Papel): Medidas {
  switch (papel) {
    case "80":
      return {
        pagina: "margin: 0;",
        larguraDoCorpo: "80mm",
        larguraDaComanda: "76mm",
        larguraMaxima: "76mm",
        respiro: "2mm",
        letraBase: "16px",
        centralizar: true,
        fonte: "10px",
      };
    case "58":
      return {
        pagina: "margin: 0;",
        larguraDoCorpo: "58mm",
        larguraDaComanda: "52mm",
        larguraMaxima: "52mm",
        respiro: "2mm",
        letraBase: "12px",
        centralizar: true,
        fonte: "9px",
      };
    case "a4":
      return {
        pagina: "margin: 10mm;",
        larguraDoCorpo: "auto",
        larguraDaComanda: "100%",
        larguraMaxima: "110mm",
        respiro: "0",
        letraBase: "16px",
        centralizar: false,
        fonte: "12px",
      };
    case "auto":
    default:
      // Sem tamanho de folha: vale o papel escolhido na impressora. A comanda
      // ocupa a largura disponível até 80 mm e fica encostada à esquerda —
      // se a impressora disser "A4" para uma bobina, a comanda continua no
      // pedaço de papel que existe de verdade.
      return {
        pagina: "margin: 0;",
        larguraDoCorpo: "auto",
        larguraDaComanda: "100%",
        larguraMaxima: "76mm",
        // Um pouco mais de respiro que nas bobinas: sem saber a folha, a
        // comanda começa na beirada, e algumas impressoras não alcançam o
        // primeiro milímetro.
        respiro: "3mm",
        letraBase: "16px",
        centralizar: false,
        fonte: "10px",
      };
  }
}

/** A largura da prévia na tela, para o lojista ver como vai sair. */
export function larguraDaPrevia(papel: Papel): string {
  if (papel === "58") return "58mm";
  if (papel === "a4") return "120mm";
  return "80mm";
}

/** O CSS de impressão da comanda para o papel escolhido. */
export function estiloDeImpressao(papel: Papel): string {
  const m = medidasDoPapel(papel);
  return `
@media print {
  @page { ${m.pagina} }

  html {
    font-size: ${m.letraBase} !important;
  }

  html, body {
    width: ${m.larguraDoCorpo} !important;
    height: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    display: block !important;
    background: #fff !important;
  }

  /* Só a comanda vai para o papel. "display: none" — e não só esconder —
     para avisos e janelinhas do sistema não ocuparem espaço e gastarem
     bobina em branco. */
  body *:not(.print-area):not(:has(.print-area)):not(.print-area *) {
    display: none !important;
  }
  /* Reforço para navegadores antigos que não entendem a regra acima. */
  body * { visibility: hidden; }
  .print-area, .print-area * { visibility: visible; }

  .print-area {
    position: static !important;
    width: ${m.larguraDaComanda} !important;
    max-width: ${m.larguraMaxima} !important;
    margin: ${m.centralizar ? "0 auto" : "0"} !important;
    padding: ${m.respiro} !important;
    box-sizing: border-box !important;
    box-shadow: none !important;
    background: #fff !important;
    font-family: monospace, Arial, sans-serif !important;
    font-size: ${m.fonte} !important;
    line-height: 1.2 !important;
    overflow-wrap: anywhere !important;
    page-break-before: avoid !important;
    page-break-after: avoid !important;
  }

  /* Impressora térmica não tem cinza: texto cinza sai fraco ou some, e
     fundo cinza sai pontilhado. Tudo em preto puro, sem fundo. */
  .print-area, .print-area * {
    color: #000 !important;
    border-color: #000 !important;
    background: transparent !important;
  }
}
${
  papel === "auto"
    ? `
/* No automático, a folha estreita (bobina de 58 mm) também ganha a letra
   compacta — a regra pergunta a largura do papel na hora de imprimir. */
@media print and (max-width: 65mm) {
  html { font-size: 12px !important; }
  .print-area { font-size: 9px !important; }
}
`
    : ""
}`;
}

/**
 * Espera a logo e as letras carregarem antes de abrir a impressão.
 *
 * A impressão abria num tempo fixo (0,8 s). Na internet lenta da loja, a
 * logo ainda não tinha chegado: saía a comanda sem cabeçalho — e algumas
 * impressoras chegavam a receber a página ainda em branco. Agora ela espera
 * o que falta, com um teto para nunca travar: se a logo não vier em
 * `limiteMs`, imprime sem ela.
 */
export async function esperarConteudoCarregar(
  raiz: HTMLElement | null,
  limiteMs = 4000,
): Promise<void> {
  if (!raiz) return;
  const imagens = Array.from(raiz.querySelectorAll("img")).map((img) =>
    img.complete
      ? Promise.resolve()
      : new Promise<void>((pronto) => {
          img.addEventListener("load", () => pronto(), { once: true });
          img.addEventListener("error", () => pronto(), { once: true });
        }),
  );
  const letras =
    typeof document !== "undefined" && document.fonts ? document.fonts.ready : Promise.resolve();
  await Promise.race([
    Promise.all([...imagens, letras]),
    new Promise((pronto) => setTimeout(pronto, limiteMs)),
  ]);
}
