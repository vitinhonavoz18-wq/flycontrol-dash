import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardas do painel "Mais" do celular.
 *
 * O DEFEITO QUE ISSO EVITA DE VOLTAR
 *
 * A queixa era "a animação trava". Medindo num celular intermediário
 * simulado, o problema não estava na animação: estava no ANTES dela. Do toque
 * até o painel aparecer passavam 300 milissegundos com a tela congelada,
 * porque o painel inteiro era construído do zero naquele instante.
 *
 * É a porta que só é FABRICADA quando alguém aperta a maçaneta. Lubrificar a
 * dobradiça não resolve.
 *
 * Duas coisas seguram a correção, e as duas são fáceis de desfazer sem
 * perceber:
 *
 *   1. o painel precisa continuar montado (construído uma vez, quando o
 *      navegador está ocioso);
 *   2. a animação precisa mexer só em posição e transparência — as duas
 *      únicas coisas que a placa de vídeo faz sozinha. Desfoque, altura ou
 *      margem voltam a obrigar o navegador a redesenhar tudo a cada quadro.
 *
 * E uma trava de segurança: painel escondido NÃO pode receber toque. Um painel
 * invisível capturando toques deixa o aplicativo inteiro sem responder.
 */

const RAIZ = process.cwd();

function soCodigo(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const painel = soCodigo("src/components/mobile/BottomSheet.tsx");
const estilos = soCodigo("src/styles.css");

/** O trecho do CSS que define a animação do painel. */
const bloco = estilos.slice(estilos.indexOf("@keyframes fly-sheet-entra"));

describe("o painel Mais do celular", () => {
  it("é construído uma vez, fora da hora do toque", () => {
    expect(painel).toMatch(/requestIdleCallback/);
    expect(painel).toContain("setPodeMontar");
  });

  it("escondido, não recebe toque nem teclado — escrito no próprio elemento", () => {
    // Inline, e não só na folha de estilo: se um dia o CSS não carregar, um
    // painel invisível capturando toques travaria o aplicativo inteiro.
    expect(painel).toContain('visibility: escondido ? "hidden" : "visible"');
    expect(painel).toContain('pointerEvents: aberto ? "auto" : "none"');
    expect(painel).toContain("inert={escondido}");
  });

  it("a animação mexe só em posição e transparência", () => {
    expect(bloco).toContain("transform: translate3d(0, 100%, 0)");
    expect(bloco).toContain("opacity: 0");
    // As caras: qualquer uma delas volta a derrubar os quadros por segundo.
    for (const proibida of [
      "filter",
      "blur",
      "height",
      "max-height",
      "margin",
      "top:",
      "bottom:",
    ]) {
      expect(bloco).not.toContain(proibida);
    }
  });

  it("a animação é rápida: entre 200 e 300 milissegundos", () => {
    const tempos = [...bloco.matchAll(/animation: fly-sheet[a-z-]* (\d+)ms/g)].map((m) =>
      Number(m[1]),
    );
    expect(tempos.length).toBeGreaterThanOrEqual(4);
    for (const t of tempos) {
      expect(t).toBeGreaterThanOrEqual(200);
      expect(t).toBeLessThanOrEqual(300);
    }
  });

  it("quem desliza não é quem rola", () => {
    // Um elemento que anima e rola ao mesmo tempo faz o navegador desistir da
    // forma rápida de desenhar.
    const posPainel = painel.indexOf('className="fly-sheet ');
    const posRolagem = painel.indexOf("overflow-y-auto");
    expect(posPainel).toBeGreaterThan(0);
    expect(posRolagem).toBeGreaterThan(posPainel);
    const linhaDoPainel = painel.slice(posPainel, painel.indexOf("\n", posPainel));
    expect(linhaDoPainel).not.toContain("overflow");
  });

  it("a página atrás para de rolar enquanto o painel está aberto", () => {
    expect(painel).toContain('document.body.style.overflow = "hidden"');
    expect(painel).toContain("document.body.style.overflow = overflowAntes");
  });

  it("continua fechando por ESC, pelo fundo escuro e devolvendo o foco", () => {
    expect(painel).toContain('e.key === "Escape"');
    expect(painel).toContain("onClick={fechar}");
    expect(painel).toContain("focoAnterior.current?.focus");
  });

  it("respeita a área de segurança de baixo do celular", () => {
    expect(painel).toContain("env(safe-area-inset-bottom");
  });
});
