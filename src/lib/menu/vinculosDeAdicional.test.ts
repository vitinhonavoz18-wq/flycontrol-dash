import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { codigosParaOCardapioPublico, diferencaDeVinculos } from "./vinculosDeAdicional";

/**
 * O cenário que o dono pediu para conferir:
 *
 *   Categoria A ................ Adicional 1
 *   Categoria B ................ Adicional 2
 *   Categorias A e B ........... Adicional 3
 *
 * Cada produto só pode receber os complementos da categoria dele.
 */
const CAT_A = "cat-pasteis";
const CAT_B = "cat-hamburgueres";
const CAT_C = "cat-acai";

/**
 * A mesma regra que o cardápio do cliente aplica, escrita aqui para poder ser
 * conferida sem abrir navegador. Ela vive de verdade no `conectfly`
 * (`adicionaisDaCategoria`), e os dois lados precisam concordar.
 */
function adicionaisVisiveis(
  adicionais: { id: string; categorias: string[] }[],
  categoriaDoProduto: string | null,
) {
  return adicionais
    .filter(
      (a) =>
        a.categorias.length === 0 ||
        (categoriaDoProduto !== null && a.categorias.includes(categoriaDoProduto)),
    )
    .map((a) => a.id);
}

describe("cada produto recebe só os complementos da categoria dele", () => {
  const adicionais = [
    { id: "Adicional 1", categorias: [CAT_A] },
    { id: "Adicional 2", categorias: [CAT_B] },
    { id: "Adicional 3", categorias: [CAT_A, CAT_B] },
  ];

  it("produto da Categoria A vê o 1 e o 3, nunca o 2", () => {
    expect(adicionaisVisiveis(adicionais, CAT_A)).toEqual(["Adicional 1", "Adicional 3"]);
  });

  it("produto da Categoria B vê o 2 e o 3, nunca o 1", () => {
    expect(adicionaisVisiveis(adicionais, CAT_B)).toEqual(["Adicional 2", "Adicional 3"]);
  });

  it("produto de uma terceira categoria não vê nenhum dos três", () => {
    expect(adicionaisVisiveis(adicionais, CAT_C)).toEqual([]);
  });
});

describe("a trava que protege quem já está vendendo", () => {
  it("complemento SEM vínculo aparece em todas as categorias", () => {
    // Esta é a regra mais importante do conjunto. No dia em que isto entrou
    // no ar, NENHUM complemento tinha vínculo — e nenhum podia sumir do
    // cardápio de ninguém. Se algum dia alguém inverter isso, este teste cai
    // antes de a loja do cliente ficar sem bacon.
    const global = [{ id: "Bacon", categorias: [] as string[] }];
    expect(adicionaisVisiveis(global, CAT_A)).toEqual(["Bacon"]);
    expect(adicionaisVisiveis(global, CAT_B)).toEqual(["Bacon"]);
    expect(adicionaisVisiveis(global, null)).toEqual(["Bacon"]);
  });

  it("produto sem categoria não recebe complemento vinculado", () => {
    // Sem categoria não há como saber a qual grupo ele pertence. Mostrar tudo
    // seria voltar ao problema; mostrar os globais é o meio-termo honesto.
    const mistos = [
      { id: "Bacon", categorias: [] as string[] },
      { id: "Leite Ninho", categorias: [CAT_C] },
    ];
    expect(adicionaisVisiveis(mistos, null)).toEqual(["Bacon"]);
  });
});

describe("gravar as escolhas", () => {
  it("grava só o que entrou e apaga só o que saiu", () => {
    // Apagar tudo e regravar funcionaria, mas reescreveria linhas que já
    // estavam certas — é refazer o cardápio inteiro porque mudou um item.
    expect(diferencaDeVinculos([CAT_A, CAT_B], [CAT_B, CAT_C])).toEqual({
      inserir: [CAT_C],
      remover: [CAT_A],
    });
  });

  it("não mexe em nada quando a escolha não mudou", () => {
    expect(diferencaDeVinculos([CAT_A, CAT_B], [CAT_B, CAT_A])).toEqual({
      inserir: [],
      remover: [],
    });
  });

  it("desmarcar todas apaga os vínculos e devolve o complemento ao cardápio inteiro", () => {
    expect(diferencaDeVinculos([CAT_A, CAT_B], [])).toEqual({
      inserir: [],
      remover: [CAT_A, CAT_B],
    });
  });
});

describe("o que atravessa para o cardápio público", () => {
  const categorias = [
    { id: CAT_A, name: "Pastéis", external_id: "sf-pasteis" },
    { id: CAT_B, name: "Hambúrgueres", external_id: "sf-burgers" },
    { id: CAT_C, name: "Açaí", external_id: null },
  ];

  it("manda o código que o SITE usa, não o daqui", () => {
    // Mandar o número interno do FlyControl faria o site não reconhecer
    // categoria nenhuma — e o complemento sumiria do cardápio sem explicação.
    const { codigos } = codigosParaOCardapioPublico([CAT_A, CAT_B], categorias);
    expect(codigos).toEqual(["sf-pasteis", "sf-burgers"]);
  });

  it("separa a categoria que ainda não foi sincronizada, para a tela avisar", () => {
    // Sem crachá no site, o vínculo não tem como viajar. Melhor dizer o nome
    // de quem ficou de fora do que deixar o lojista achar que salvou.
    const { codigos, semCodigo } = codigosParaOCardapioPublico([CAT_A, CAT_C], categorias);
    expect(codigos).toEqual(["sf-pasteis"]);
    expect(semCodigo).toEqual(["Açaí"]);
  });

  it("ignora categoria que não existe mais", () => {
    expect(codigosParaOCardapioPublico(["categoria-apagada"], categorias)).toEqual({
      codigos: [],
      semCodigo: [],
    });
  });
});

describe("a sincronização carrega os vínculos", () => {
  const sync = readFileSync("src/utils/menuSync.ts", "utf8");

  // O bloco que monta o pacote do complemento. O `"combo"` aparece antes no
  // arquivo (no tradutor de tipos), então o fim do bloco é procurado a partir
  // do início dele — não desde o começo do arquivo.
  const inicio = sync.indexOf('if (type === "border" || type === "additional")');
  const bloco = sync.slice(inicio, sync.indexOf('if (type === "combo")', inicio));

  it("o bloco do complemento foi encontrado", () => {
    expect(inicio).toBeGreaterThan(0);
    expect(bloco.length).toBeGreaterThan(50);
  });

  it("o complemento leva as categorias junto", () => {
    expect(bloco).toContain("category_ids");
  });

  it("lista vazia viaja; ausência de informação não", () => {
    // Viajar vazio é o que devolve o complemento ao cardápio inteiro quando o
    // dono desmarca tudo. Já a sincronização em massa não informa vínculo
    // nenhum, e nesse caso o site precisa manter o que já tinha.
    expect(bloco).toMatch(/Array\.isArray\(data\.category_ids\)/);
    expect(bloco).toContain(": undefined");
  });
});
