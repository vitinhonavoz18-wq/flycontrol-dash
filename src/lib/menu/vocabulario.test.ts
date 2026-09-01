import { describe, expect, it } from "vitest";
import { LAYOUTS, type LayoutId } from "./layouts";
import { contarSabores, VOCABULARIOS, vocabularioDaLoja } from "./vocabulario";

const CAMPOS = [
  "abaProdutos",
  "tituloProdutos",
  "tipoSabor",
  "abaTamanhos",
  "tituloTamanhos",
  "sabor",
  "sabores",
  "rotuloMaxSabores",
  "abaExtras",
  "tituloExtras",
  "grupoBordas",
  "grupoAdicionais",
  "exemploNomeCategoria",
  "exemploDescricaoCategoria",
] as const;

describe("todo nicho tem todas as palavras", () => {
  it("existe um vocabulário para cada layout, sem buraco", () => {
    for (const layout of LAYOUTS) {
      const v = VOCABULARIOS[layout.id];
      expect(v, `faltou vocabulário para ${layout.id}`).toBeDefined();
      for (const campo of CAMPOS) {
        expect(v[campo].trim().length, `${layout.id}.${campo} vazio`).toBeGreaterThan(0);
      }
    }
  });

  it("não sobra vocabulário para layout que não existe", () => {
    const idsDosLayouts = new Set<string>(LAYOUTS.map((l) => l.id));
    for (const id of Object.keys(VOCABULARIOS)) {
      expect(idsDosLayouts.has(id), `${id} não é um layout`).toBe(true);
    }
  });
});

describe("a pizzaria continua exatamente como estava", () => {
  // Esta funcionalidade não pode mexer na tela de quem já usa o sistema. Se
  // alguém mudar uma destas palavras, foi de propósito — e este teste avisa.
  it("mantém as palavras que a tela já mostrava", () => {
    const v = VOCABULARIOS.pizza;
    expect(v.abaProdutos).toBe("Sabores");
    expect(v.tituloProdutos).toBe("Sabores & Produtos");
    expect(v.abaTamanhos).toBe("Tamanhos");
    expect(v.tituloTamanhos).toBe("Tamanhos & Preços de Pizza");
    expect(v.abaExtras).toBe("Bordas/Adic.");
    expect(v.tituloExtras).toBe("Bordas & Adicionais");
    expect(v.grupoBordas).toBe("Bordas Recheadas");
    expect(v.grupoAdicionais).toBe("Adicionais");
    expect(v.rotuloMaxSabores).toBe("Máx. de Sabores");
    expect(v.sabor).toBe("sabor");
    expect(v.sabores).toBe("sabores");
  });
});

describe("nichos que não são pizzaria não falam de pizza", () => {
  it("nenhuma palavra de farmácia, adega, mercado ou padaria cita pizza, sabor ou borda", () => {
    for (const id of ["pharmacy", "beverage", "market", "bakery"] as LayoutId[]) {
      const v = VOCABULARIOS[id];
      for (const campo of CAMPOS) {
        expect(v[campo].toLowerCase(), `${id}.${campo}`).not.toMatch(/pizza|sabor|borda/);
      }
    }
  });

  it("a farmácia fala de apresentação, não de borda recheada", () => {
    expect(VOCABULARIOS.pharmacy.grupoBordas).toBe("Apresentações");
    expect(VOCABULARIOS.pharmacy.abaProdutos).toBe("Produtos");
  });

  it("a hamburgueria fala de lanche", () => {
    expect(VOCABULARIOS.burger.abaProdutos).toBe("Lanches");
  });

  it("o açaí fala de complemento", () => {
    expect(VOCABULARIOS.acai.grupoAdicionais).toBe("Complementos");
  });
});

describe("de onde vem o nicho", () => {
  it("o layout escolhido na mão manda", () => {
    const loja = { business_type: "Pizzaria", site_settings: { menu_layout: "pharmacy" } };
    expect(vocabularioDaLoja(loja).grupoBordas).toBe("Apresentações");
  });

  it("sem layout escolhido, vale o tipo de estabelecimento", () => {
    expect(vocabularioDaLoja({ business_type: "Farmácia" }).grupoBordas).toBe("Apresentações");
    expect(vocabularioDaLoja({ business_type: "Hamburgueria" }).abaProdutos).toBe("Lanches");
    // Reconhece o tipo escrito no meio do nome, como já fazia a escolha de layout.
    expect(vocabularioDaLoja({ business_type: "Pizzaria do Zé" }).abaProdutos).toBe("Sabores");
  });

  it("tipo desconhecido cai nas palavras neutras, sem quebrar", () => {
    for (const tipo of ["Barbearia", "", null, undefined, 42, {}]) {
      const v = vocabularioDaLoja({ business_type: tipo });
      expect(v.abaProdutos).toBe("Produtos");
      expect(v.abaExtras).toBe("Adicionais");
    }
  });

  it("loja sem nada gravada não derruba a tela", () => {
    expect(() => vocabularioDaLoja(null)).not.toThrow();
    expect(() => vocabularioDaLoja(undefined)).not.toThrow();
    expect(vocabularioDaLoja({}).abaProdutos).toBe("Produtos");
  });

  it("layout inválido no banco é ignorado e o tipo assume", () => {
    const loja = { business_type: "Adega", site_settings: { menu_layout: "layout_inventado" } };
    expect(vocabularioDaLoja(loja).tituloProdutos).toBe("Produtos da Adega");
  });
});

describe("contagem no plural certo", () => {
  it("usa singular e plural do nicho", () => {
    expect(contarSabores(1, VOCABULARIOS.pizza)).toBe("1 sabor");
    expect(contarSabores(3, VOCABULARIOS.pizza)).toBe("3 sabores");
    expect(contarSabores(1, VOCABULARIOS.pharmacy)).toBe("1 opção");
    expect(contarSabores(2, VOCABULARIOS.pharmacy)).toBe("2 opções");
  });
});
