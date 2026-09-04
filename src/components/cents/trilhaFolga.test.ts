import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda do espaço embaixo da trilha do CENTS.
 *
 * O DEFEITO QUE ISSO EVITA DE VOLTAR
 *
 * Embaixo de cada marco da trilha ficam duas linhas penduradas: o número de
 * pedidos ("250") e o preço ("R$ 0,50"). Elas são desenhadas por cima do
 * layout, então não empurram nada — quem reserva o espaço delas é a folga de
 * baixo da trilha.
 *
 * Quando essa folga ficou pequena demais, o preço do marco caiu em cima da
 * frase "Faltam X pedidos…" na tela de Pedidos: duas frases uma por cima da
 * outra, ilegíveis. É a prateleira presa baixa demais na parede — cabe, mas
 * esmaga o que está embaixo.
 *
 * A CONTA
 *
 *   trilho no meio      = 40px (folga de cima) + 5px (metade do trilho)
 *   marco maior         = 16px (metade dos 32px do círculo "atual")
 *   distância do rótulo =  6px
 *   rótulo (2 linhas)   = 11px + 2px + 10px ≈ 23px
 *   ------------------------------------------------
 *   fim do rótulo       ≈ 90px do topo da trilha
 *
 * Com 40px em cima e 10px de trilho, a folga de baixo precisa passar de 40px
 * para o rótulo caber. pb-12 são 48px — sobram 8px de respiro.
 */

const arquivo = readFileSync(join(process.cwd(), "src/components/cents/CentsTrilha.tsx"), "utf8");

function soCodigo(conteudo: string): string {
  return conteudo
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("espaço embaixo da trilha do CENTS", () => {
  const codigo = soCodigo(arquivo);

  it("a folga de baixo é maior que o rótulo pendurado", () => {
    const folga = codigo.match(/pb-(\d+)/);
    expect(folga).not.toBeNull();
    // pb-12 = 48px. Abaixo de 44px (pb-11) o rótulo volta a encostar.
    expect(Number(folga![1])).toBeGreaterThanOrEqual(12);
  });

  it("o rótulo continua pendurado — por isso a folga precisa existir", () => {
    // Se um dia o rótulo deixar de ser posicionado por cima do layout, ele
    // passa a empurrar sozinho e esta guarda perde o sentido. Enquanto ele
    // for "absolute … top-full", a folga é obrigatória.
    expect(codigo).toContain("absolute left-1/2 top-full");
  });
});
