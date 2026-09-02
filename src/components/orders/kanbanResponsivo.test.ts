import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardas do quadro de pedidos em telas de tamanhos diferentes.
 *
 * O DEFEITO QUE ISSO EVITA DE VOLTAR
 *
 * O quadro tem três colunas. Cada uma se recusava a ficar mais estreita que
 * o texto mais comprido lá dentro — o nome do cliente, o endereço. Num
 * notebook de 1280px com o menu lateral aberto sobram 936px, e as três
 * colunas exigiam 984px. Faltavam 48px.
 *
 * E aí vinha a parte pior: da largura de tablet para cima, a rolagem lateral
 * estava DESLIGADA. Então as colunas não deslizavam — a terceira ficava
 * pendurada para fora da página, cortada. É a gaveta que não fecha porque
 * tem coisa demais dentro, e alguém resolveu tirar o trilho em vez de tirar
 * a coisa.
 *
 * Medido no navegador depois da correção, de 400px a 2000px de largura:
 * nada mais vaza para fora da tela em nenhuma delas.
 */

const RAIZ = process.cwd();
const trilho = readFileSync(join(RAIZ, "src/components/orders/OrdersKanban.tsx"), "utf8");
const coluna = readFileSync(join(RAIZ, "src/components/orders/OrdersKanbanColumn.tsx"), "utf8");

/**
 * Deixa só o que é código de verdade.
 *
 * Os comentários deste arquivo e dos componentes CITAM as classes erradas
 * para explicar o defeito. Sem tirar os comentários da frente, a guarda
 * acusaria a própria explicação — o detector de fumaça apitando por causa do
 * cartaz que ensina o que fazer quando ele apita.
 */
function soCodigo(conteudo: string): string {
  return conteudo
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "") // comentários de JSX: {/* ... */}
    .replace(/\/\*[\s\S]*?\*\//g, "") // comentários de bloco: /* ... */
    .replace(/^\s*\/\/.*$/gm, ""); // comentários de linha: // ...
}

describe("quadro de pedidos em qualquer largura", () => {
  it("a rolagem para o lado nunca é desligada em nenhum tamanho de tela", () => {
    const codigo = soCodigo(trilho);
    expect(codigo).toContain("overflow-x-auto");
    // Qualquer regra do tipo `md:overflow-x-visible` devolve o defeito: as
    // colunas param de deslizar e passam a vazar.
    expect(codigo).not.toMatch(/:overflow-x-(visible|clip)/);
  });

  it("a coluna tem uma largura mínima própria, e não a do texto de dentro", () => {
    const codigo = soCodigo(coluna);
    // Sem um piso declarado, o navegador usa o conteúdo como piso — e o
    // conteúdo é um endereço inteiro.
    expect(codigo).toMatch(/sm:min-w-\[\d+rem\]/);
  });

  it("da tela de 640px para cima as colunas dividem o espaço e podem encolher", () => {
    const codigo = soCodigo(coluna);
    expect(codigo).toContain("sm:flex-1");
    expect(codigo).toContain("sm:shrink");
    // No celular continua uma coluna por vez, larga, deslizando com o dedo.
    expect(codigo).toContain("w-[85vw]");
    expect(codigo).toContain("shrink-0");
  });

  it("no celular cada coluna encaixa sozinha na tela ao deslizar", () => {
    expect(soCodigo(coluna)).toContain("snap-start");
    const codigo = soCodigo(trilho);
    expect(codigo).toContain("snap-x");
    // Da tela de 640px para cima o encaixe sai do caminho: as três já estão
    // visíveis juntas, e o encaixe só atrapalharia.
    expect(codigo).toContain("sm:snap-none");
  });
});
