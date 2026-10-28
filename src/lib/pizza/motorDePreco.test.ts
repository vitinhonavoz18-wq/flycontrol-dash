import { describe, expect, it } from "vitest";
import {
  CONFIG_PADRAO,
  calcularPizza,
  chaveDeNome,
  conferirRegistroDaPizza,
  descreverPizza,
  formatarCentavos,
  lerConfigPizzaria,
  lerPrecosPorTamanho,
  reaisParaCentavos,
  registrarPizza,
  validarConfigPizzaria,
  type CatalogoDePizza,
  type ConfigPizzaria,
  type MontagemDePizza,
} from "./motorDePreco";

/**
 * ATENÇÃO — ESTE ARQUIVO TEM UMA CÓPIA IDÊNTICA no SiteCreatorFly
 * (`src/lib/site/pizza/motorDePreco.test.ts`). Os mesmos casos, os mesmos
 * números: se um lado passar e o outro não, as duas cópias do motor
 * divergiram e o cliente veria um preço diferente do que a cozinha recebe.
 */

function catalogo(config: Partial<ConfigPizzaria> = {}): CatalogoDePizza {
  return {
    config: { ...CONFIG_PADRAO, ...config },
    tamanhos: [
      {
        chave: "media",
        nome: "Média",
        precoBaseCentavos: 4000,
        maxSabores: 2,
        fatias: 6,
        ativo: true,
      },
      {
        chave: "grande",
        nome: "Grande",
        precoBaseCentavos: 5000,
        maxSabores: 3,
        fatias: 8,
        ativo: true,
      },
      {
        chave: "familia",
        nome: "Família",
        precoBaseCentavos: 6500,
        maxSabores: 4,
        fatias: 12,
        ativo: false,
      },
    ],
    sabores: [
      {
        id: "calabresa",
        nome: "Calabresa",
        ativo: true,
        precosPorTamanho: { media: 4000, grande: 5000 },
        extraEspecialCentavos: 0,
        ingredientes: ["mussarela", "calabresa", "cebola"],
      },
      {
        id: "frango",
        nome: "Frango com Catupiry",
        ativo: true,
        precosPorTamanho: { media: 4000, grande: 5000 },
        extraEspecialCentavos: 0,
        ingredientes: ["frango", "catupiry"],
      },
      {
        id: "camarao",
        nome: "Camarão",
        ativo: true,
        precosPorTamanho: { media: 6000, grande: 7900 },
        extraEspecialCentavos: 1500,
        ingredientes: ["camarão", "mussarela", "cebolinha"],
      },
      {
        id: "portuguesa",
        nome: "Portuguesa",
        ativo: true,
        // Sem preço por tamanho: cai no preço do tamanho + extra.
        precosPorTamanho: {},
        extraEspecialCentavos: 0,
        ingredientes: ["presunto", "ovo", "cebola", "ervilha"],
      },
      {
        id: "sazonal",
        nome: "Sazonal",
        ativo: false,
        precosPorTamanho: { media: 4500, grande: 5500 },
        extraEspecialCentavos: 0,
        ingredientes: [],
      },
    ],
    bordas: [
      {
        id: "catupiry",
        nome: "Catupiry",
        ativo: true,
        precoCentavos: 800,
        precosPorTamanho: { grande: 1000 },
        maxQuantidade: 1,
      },
      {
        id: "chocolate",
        nome: "Chocolate",
        ativo: false,
        precoCentavos: 900,
        precosPorTamanho: {},
        maxQuantidade: 1,
      },
    ],
    adicionais: [
      {
        id: "bacon",
        nome: "Bacon",
        ativo: true,
        precoCentavos: 500,
        precosPorTamanho: {},
        maxQuantidade: 3,
      },
      {
        id: "milho",
        nome: "Milho",
        ativo: true,
        precoCentavos: 250,
        precosPorTamanho: { grande: 300 },
        maxQuantidade: 1,
      },
      {
        id: "palmito",
        nome: "Palmito",
        ativo: false,
        precoCentavos: 600,
        precosPorTamanho: {},
        maxQuantidade: 1,
      },
    ],
  };
}

function preco(c: CatalogoDePizza, m: MontagemDePizza) {
  const r = calcularPizza(c, m);
  if (!r.ok) throw new Error(`esperava sucesso, veio: ${r.erros.map((e) => e.codigo).join(", ")}`);
  return r.pizza;
}

function erros(c: CatalogoDePizza, m: MontagemDePizza) {
  const r = calcularPizza(c, m);
  if (r.ok) throw new Error("esperava erro, a pizza foi aceita");
  return r.erros.map((e) => e.codigo);
}

describe("utilidades", () => {
  it("chave de nome ignora acento, caixa e espaços", () => {
    expect(chaveDeNome("  Família  Grande ")).toBe("familia grande");
    expect(chaveDeNome("FAMÍLIA")).toBe(chaveDeNome("familia"));
  });

  it("reais viram centavos inteiros sem erro de ponto flutuante", () => {
    expect(reaisParaCentavos(0.1 + 0.2)).toBe(30);
    expect(reaisParaCentavos(49.9)).toBe(4990);
    expect(reaisParaCentavos("39,90")).toBe(3990);
    expect(reaisParaCentavos("abc")).toBe(0);
  });

  it("formata centavos em reais", () => {
    expect(formatarCentavos(123456)).toBe("R$ 1.234,56");
    expect(formatarCentavos(5)).toBe("R$ 0,05");
  });

  it("mapa de preço por tamanho descarta lixo e normaliza as chaves", () => {
    expect(lerPrecosPorTamanho({ " Média ": 4000, grande: -1, familia: "x", g: 10.4 })).toEqual({
      media: 4000,
      g: 10,
    });
    expect(lerPrecosPorTamanho(null)).toEqual({});
  });
});

describe("1–4: quantidade de sabores", () => {
  it("1. um sabor", () => {
    const p = preco(catalogo({ regra: "maior_preco" }), {
      tamanho: "Grande",
      sabores: [{ id: "calabresa" }],
    });
    expect(p.precoUnitarioCentavos).toBe(5000);
    expect(p.sabores[0].fracao).toBe("inteira");
  });

  it("2. dois sabores de preço igual", () => {
    const p = preco(catalogo({ regra: "media_ponderada" }), {
      tamanho: "grande",
      sabores: [{ id: "calabresa" }, { id: "frango" }],
    });
    expect(p.precoUnitarioCentavos).toBe(5000);
    expect(p.sabores.map((s) => [s.fracao, s.percentual])).toEqual([
      ["1/2", 50],
      ["1/2", 50],
    ]);
  });

  it("3. dois sabores de preços diferentes", () => {
    const m = { tamanho: "grande", sabores: [{ id: "calabresa" }, { id: "camarao" }] };
    expect(preco(catalogo({ regra: "maior_preco" }), m).precoUnitarioCentavos).toBe(7900);
    expect(preco(catalogo({ regra: "media_ponderada" }), m).precoUnitarioCentavos).toBe(6450);
  });

  it("4. três sabores com proporções válidas, arredondando meio centavo para cima", () => {
    const p = preco(catalogo({ regra: "media_ponderada" }), {
      tamanho: "grande",
      sabores: [{ id: "calabresa" }, { id: "frango" }, { id: "camarao" }],
    });
    // (5000 + 5000 + 7900) / 3 = 5966,67 → 5967
    expect(p.precoUnitarioCentavos).toBe(5967);
    expect(p.sabores.map((s) => s.fracao)).toEqual(["1/3", "1/3", "1/3"]);
  });

  it("4b. proporção desigual usa as partes reais, não a quantidade de sabores", () => {
    const p = preco(catalogo({ regra: "media_ponderada" }), {
      tamanho: "grande",
      sabores: [
        { id: "calabresa", partes: 2 },
        { id: "camarao", partes: 1 },
      ],
    });
    // (5000*2 + 7900*1) / 3 = 5966,67 → 5967, e não a média simples 6450
    expect(p.precoUnitarioCentavos).toBe(5967);
    expect(p.sabores.map((s) => s.fracao)).toEqual(["2/3", "1/3"]);
  });
});

describe("5–7: regras de preço", () => {
  it("5. maior preço", () => {
    const p = preco(catalogo({ regra: "maior_preco" }), {
      tamanho: "media",
      sabores: [{ id: "frango" }, { id: "camarao" }],
    });
    expect(p.precoSaboresCentavos).toBe(6000);
    expect(p.regraAplicada).toBe("maior_preco");
  });

  it("6. média ponderada", () => {
    const p = preco(catalogo({ regra: "media_ponderada" }), {
      tamanho: "media",
      sabores: [{ id: "frango" }, { id: "camarao" }],
    });
    expect(p.precoSaboresCentavos).toBe(5000);
  });

  it("7. preço por combinação cadastrada", () => {
    const c = catalogo({
      regra: "combinacao",
      combinacoes: [
        { tamanho: "media", sabores: ["camarao", "frango com catupiry"], precoCentavos: 5490 },
      ],
    });
    const p = preco(c, { tamanho: "media", sabores: [{ id: "frango" }, { id: "camarao" }] });
    expect(p.precoSaboresCentavos).toBe(5490);
    // Um sabor só não precisa de combinação: vale o preço do sabor.
    expect(preco(c, { tamanho: "media", sabores: [{ id: "camarao" }] }).precoSaboresCentavos).toBe(
      6000,
    );
  });

  it("7b. combinação não cadastrada é recusada — nunca vira outra regra em silêncio", () => {
    const c = catalogo({ regra: "combinacao", regraSemCombinacao: "recusar" });
    expect(
      erros(c, { tamanho: "media", sabores: [{ id: "frango" }, { id: "calabresa" }] }),
    ).toEqual(["combinacao_nao_cadastrada"]);
  });

  it("7c. sem combinação, só usa outra regra quando a loja escolheu qual", () => {
    const c = catalogo({ regra: "combinacao", regraSemCombinacao: "maior_preco" });
    const p = preco(c, { tamanho: "media", sabores: [{ id: "frango" }, { id: "camarao" }] });
    expect(p.regra).toBe("combinacao");
    expect(p.regraAplicada).toBe("maior_preco");
    expect(p.precoSaboresCentavos).toBe(6000);
  });

  it("regra antiga (padrão): preço do tamanho + extra de cada sabor especial", () => {
    const p = preco(catalogo(), {
      tamanho: "media",
      sabores: [{ id: "frango" }, { id: "camarao" }],
    });
    expect(p.precoSaboresCentavos).toBe(4000 + 1500);
  });

  it("sabor sem preço para o tamanho cai no preço do tamanho + extra", () => {
    const p = preco(catalogo({ regra: "maior_preco" }), {
      tamanho: "media",
      sabores: [{ id: "portuguesa" }],
    });
    expect(p.precoSaboresCentavos).toBe(4000);
  });
});

describe("8–10: limites e disponibilidade", () => {
  it("8. sabores acima do limite do tamanho", () => {
    expect(
      erros(catalogo(), {
        tamanho: "media",
        sabores: [{ id: "calabresa" }, { id: "frango" }, { id: "camarao" }],
      }),
    ).toContain("sabores_demais");
  });

  it("8b. o limite é do tamanho, não um número fixo", () => {
    expect(
      preco(catalogo(), {
        tamanho: "grande",
        sabores: [{ id: "calabresa" }, { id: "frango" }, { id: "camarao" }],
      }).sabores,
    ).toHaveLength(3);
  });

  it("9. sabor indisponível", () => {
    expect(erros(catalogo(), { tamanho: "media", sabores: [{ id: "sazonal" }] })).toEqual([
      "sabor_indisponivel",
    ]);
  });

  it("10. tamanho inexistente", () => {
    expect(erros(catalogo(), { tamanho: "gigante", sabores: [{ id: "calabresa" }] })).toEqual([
      "tamanho_inexistente",
    ]);
  });

  it("10b. tamanho desativado", () => {
    expect(erros(catalogo(), { tamanho: "familia", sabores: [{ id: "calabresa" }] })).toContain(
      "tamanho_indisponivel",
    );
  });

  it("sabor que não existe, repetido e sem sabor", () => {
    expect(erros(catalogo(), { tamanho: "media", sabores: [{ id: "inventado" }] })).toContain(
      "sabor_inexistente",
    );
    expect(
      erros(catalogo(), { tamanho: "media", sabores: [{ id: "frango" }, { id: "frango" }] }),
    ).toContain("sabor_repetido");
    expect(erros(catalogo(), { tamanho: "media", sabores: [] })).toContain("sem_sabores");
  });
});

describe("11–13: borda, adicionais e ingredientes", () => {
  it("11. borda opcional: sem borda passa", () => {
    expect(preco(catalogo(), { tamanho: "media", sabores: [{ id: "frango" }] }).borda).toBeNull();
  });

  it("11b. borda obrigatória: sem borda é recusado", () => {
    expect(
      erros(catalogo({ bordaObrigatoria: true }), {
        tamanho: "media",
        sabores: [{ id: "frango" }],
      }),
    ).toEqual(["borda_obrigatoria"]);
  });

  it("11c. borda com preço por tamanho e borda indisponível", () => {
    const c = catalogo();
    expect(
      preco(c, { tamanho: "grande", sabores: [{ id: "frango" }], bordaId: "catupiry" }).borda
        ?.precoCentavos,
    ).toBe(1000);
    expect(
      preco(c, { tamanho: "media", sabores: [{ id: "frango" }], bordaId: "catupiry" }).borda
        ?.precoCentavos,
    ).toBe(800);
    expect(
      erros(c, { tamanho: "media", sabores: [{ id: "frango" }], bordaId: "chocolate" }),
    ).toEqual(["borda_indisponivel"]);
  });

  it("12. adicionais com quantidades diferentes", () => {
    const p = preco(catalogo({ regra: "maior_preco" }), {
      tamanho: "grande",
      sabores: [{ id: "calabresa" }],
      adicionais: [
        { id: "bacon", quantidade: 2 },
        { id: "milho", quantidade: 1 },
      ],
    });
    expect(p.adicionais.map((a) => a.totalCentavos)).toEqual([1000, 300]);
    expect(p.precoUnitarioCentavos).toBe(5000 + 1000 + 300);
  });

  it("12b. adicional acima do máximo dele e do máximo da pizza", () => {
    expect(
      erros(catalogo(), {
        tamanho: "media",
        sabores: [{ id: "frango" }],
        adicionais: [{ id: "bacon", quantidade: 4 }],
      }),
    ).toEqual(["adicional_quantidade_invalida"]);
    expect(
      erros(catalogo({ maxAdicionaisPorPizza: 2 }), {
        tamanho: "media",
        sabores: [{ id: "frango" }],
        adicionais: [
          { id: "bacon", quantidade: 2 },
          { id: "milho", quantidade: 1 },
        ],
      }),
    ).toEqual(["adicionais_demais"]);
    expect(
      erros(catalogo(), {
        tamanho: "media",
        sabores: [{ id: "frango" }],
        adicionais: [{ id: "palmito", quantidade: 1 }],
      }),
    ).toEqual(["adicional_indisponivel"]);
  });

  it("13. retirar ingrediente não dá desconto", () => {
    const c = catalogo({ permitirRemoverIngredientes: true, regra: "maior_preco" });
    const com = preco(c, { tamanho: "media", sabores: [{ id: "calabresa" }] });
    const sem = preco(c, {
      tamanho: "media",
      sabores: [{ id: "calabresa" }],
      removidos: ["Cebola"],
    });
    expect(sem.precoUnitarioCentavos).toBe(com.precoUnitarioCentavos);
    expect(sem.removidos).toEqual(["Cebola"]);
  });

  it("13b. retirar só quando a loja permite, e só ingrediente dos sabores escolhidos", () => {
    expect(
      erros(catalogo(), {
        tamanho: "media",
        sabores: [{ id: "calabresa" }],
        removidos: ["cebola"],
      }),
    ).toEqual(["remocao_nao_permitida"]);
    expect(
      erros(catalogo({ permitirRemoverIngredientes: true }), {
        tamanho: "media",
        sabores: [{ id: "frango" }],
        removidos: ["cebola"],
      }),
    ).toEqual(["ingrediente_desconhecido"]);
  });

  it("observação longa e quantidade inválida", () => {
    expect(
      erros(catalogo(), {
        tamanho: "media",
        sabores: [{ id: "frango" }],
        observacao: "x".repeat(281),
      }),
    ).toEqual(["observacao_longa"]);
    expect(
      erros(catalogo(), { tamanho: "media", sabores: [{ id: "frango" }], quantidade: 0 }),
    ).toEqual(["quantidade_invalida"]);
  });

  it("quantidade multiplica o total, não o unitário", () => {
    const p = preco(catalogo({ regra: "maior_preco" }), {
      tamanho: "media",
      sabores: [{ id: "frango" }],
      quantidade: 3,
    });
    expect(p.precoUnitarioCentavos).toBe(4000);
    expect(p.totalCentavos).toBe(12000);
  });
});

describe("14–15: preço que muda e total adulterado", () => {
  it("14. o mesmo pedido, depois que o cardápio mudou de preço, sai com o preço novo", () => {
    const m = { tamanho: "media", sabores: [{ id: "frango" }] };
    const antes = preco(catalogo({ regra: "maior_preco" }), m).precoUnitarioCentavos;
    const c = catalogo({ regra: "maior_preco" });
    c.sabores[1].precosPorTamanho.media = 4500;
    const depois = preco(c, m).precoUnitarioCentavos;
    expect(antes).toBe(4000);
    expect(depois).toBe(4500);
  });

  it("15. registro adulterado no caminho não fecha a conta", () => {
    const p = preco(catalogo({ regra: "media_ponderada" }), {
      tamanho: "grande",
      sabores: [{ id: "calabresa" }, { id: "camarao" }],
      bordaId: "catupiry",
      adicionais: [{ id: "bacon", quantidade: 2 }],
      quantidade: 2,
    });
    const registro = registrarPizza(p);
    expect(conferirRegistroDaPizza(registro)).toEqual([]);

    const barato = { ...registro, preco_unitario_centavos: 100, total_centavos: 200 };
    expect(conferirRegistroDaPizza(barato)).toContain("as peças não somam o preço unitário");

    const saborBarato = { ...registro, preco_sabores_centavos: 100 };
    expect(conferirRegistroDaPizza(saborBarato).length).toBeGreaterThan(0);

    const totalErrado = { ...registro, total_centavos: registro.preco_unitario_centavos };
    expect(conferirRegistroDaPizza(totalErrado)).toContain(
      "preço unitário x quantidade não dá o total",
    );

    const mediaErrada = {
      ...registro,
      preco_sabores_centavos: 7900,
      preco_unitario_centavos: 7900 + 1000 + 1000,
      total_centavos: (7900 + 2000) * 2,
    };
    expect(conferirRegistroDaPizza(mediaErrada)).toContain(
      "preço dos sabores não segue a média proporcional",
    );
  });
});

describe("configuração e texto", () => {
  it("configuração estragada volta ao padrão, campo por campo", () => {
    expect(lerConfigPizzaria(null)).toEqual(CONFIG_PADRAO);
    const lida = lerConfigPizzaria({
      regra: "inventada",
      bordaObrigatoria: "sim",
      maxAdicionaisPorPizza: "3",
      combinacoes: [
        { tamanho: "Média", sabores: ["Frango", "Camarão"], precoCentavos: 5000 },
        { tamanho: "media", sabores: ["só um"], precoCentavos: 1 },
        "lixo",
      ],
    });
    expect(lida.regra).toBe("tamanho_e_especiais");
    expect(lida.bordaObrigatoria).toBe(false);
    expect(lida.maxAdicionaisPorPizza).toBe(3);
    expect(lida.combinacoes).toEqual([
      { tamanho: "media", sabores: ["frango", "camarao"], precoCentavos: 5000 },
    ]);
  });

  it("aponta configuração contraditória antes de publicar", () => {
    const c = catalogo({ regra: "combinacao", bordaObrigatoria: true });
    c.bordas = [];
    const problemas = validarConfigPizzaria(c);
    expect(problemas.some((p) => p.includes("nenhuma combinação"))).toBe(true);
    expect(problemas.some((p) => p.includes("obrigatória"))).toBe(true);
    expect(validarConfigPizzaria(catalogo())).toEqual([]);
  });

  it("descrição legível com frações, borda, adicionais, retirados e observação", () => {
    const p = preco(catalogo({ permitirRemoverIngredientes: true, regra: "maior_preco" }), {
      tamanho: "grande",
      sabores: [{ id: "calabresa" }, { id: "frango" }],
      bordaId: "catupiry",
      adicionais: [{ id: "bacon", quantidade: 2 }],
      removidos: ["cebola"],
      observacao: "bem assada",
    });
    expect(descreverPizza(p)).toBe(
      [
        "PIZZA GRANDE",
        "• Calabresa: 1/2 (50%)",
        "• Frango com Catupiry: 1/2 (50%)",
        "• Borda: Catupiry",
        "• Adicional: Bacon x2",
        "• Sem: cebola",
        "• Observação: bem assada",
      ].join("\n"),
    );
  });
});
