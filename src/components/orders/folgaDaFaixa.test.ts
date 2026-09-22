import { describe, expect, it } from "vitest";
import { podeRecolherAFolga } from "./folgaDaFaixa";

/**
 * A folga que o quadro abre embaixo enquanto a faixa de finalizar está no ar.
 *
 * O RISCO QUE ESTES TESTES GUARDAM
 *
 * Quem rolou até o fim da página está apoiado nessa folga. Recolhê-la naquele
 * instante faz o navegador puxar a rolagem de volta e a tela inteira salta —
 * bem no segundo em que o pedido acabou de ser solto, que é justamente quando
 * a pessoa está olhando para confirmar se deu certo.
 *
 * É puxar o tapete de baixo de quem está em cima dele.
 */
describe("recolher a folga sem a tela saltar", () => {
  const folga = 120;

  it("pode recolher quando ainda há página de sobra embaixo", () => {
    // 400px de conteúdo abaixo do que está à vista: tirar 120 não mexe em nada.
    expect(podeRecolherAFolga({ rolagem: 0, janela: 800, conteudo: 1200, folga })).toBe(true);
  });

  it("NÃO pode recolher quando a página está no fim", () => {
    // A pessoa rolou até embaixo: a folga é o chão em que ela está pisando.
    expect(podeRecolherAFolga({ rolagem: 400, janela: 800, conteudo: 1200, folga })).toBe(false);
  });

  it("NÃO pode recolher quando sobra menos do que a folga", () => {
    // Sobram 100px e a folga é 120: recolher move a tela 20px. Pouco, mas um
    // tranco visível no momento errado.
    expect(podeRecolherAFolga({ rolagem: 300, janela: 800, conteudo: 1200, folga })).toBe(false);
  });

  it("no limite exato, pode", () => {
    expect(podeRecolherAFolga({ rolagem: 280, janela: 800, conteudo: 1200, folga })).toBe(true);
  });

  it("página que nem rola: recolher é sempre seguro", () => {
    // Conteúdo menor que a janela — não existe rolagem para ser puxada.
    expect(podeRecolherAFolga({ rolagem: 0, janela: 800, conteudo: 500, folga: 0 })).toBe(true);
  });
});
