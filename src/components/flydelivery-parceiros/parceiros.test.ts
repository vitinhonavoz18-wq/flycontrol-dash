import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatCents, isValidCents } from "@/lib/billing/money";
import { FUNCIONALIDADES, INDICADORES_DE_EXEMPLO, QUADRO_DE_EXEMPLO } from "./dados";

/**
 * Guardas da página FlyDelivery Parceiros — as mesmas regras da página atual
 * do FlyControl (ver components/landing/landing.test.ts), mais duas que são
 * desta etapa:
 *
 * - a página inicial atual não pode depender da página nova (as duas
 *   convivem; uma não encosta na outra);
 * - o FlyBoy, que ainda não existe, nunca aparece sem o selo "Em breve".
 */

const RAIZ = process.cwd();
const PASTA = join(RAIZ, "src", "components", "flydelivery-parceiros");
const ROTA = join(RAIZ, "src", "routes", "flydelivery-parceiros.tsx");
const HOME_ATUAL = join(RAIZ, "src", "routes", "index.tsx");

/** Tira comentários: neles o termo é explicação, não promessa ao cliente. */
function semComentarios(conteudo: string): string {
  return conteudo
    .split("\n")
    .filter((linha) => !/^\s*(\*|\/\/|\/\*|\{\/\*)/.test(linha))
    .join("\n");
}

function arquivosDaPagina() {
  return [
    ...readdirSync(PASTA)
      .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))
      .map((f) => ({ nome: f, conteudo: readFileSync(join(PASTA, f), "utf8") })),
    { nome: "routes/flydelivery-parceiros.tsx", conteudo: readFileSync(ROTA, "utf8") },
  ];
}

describe("a página atual continua intacta", () => {
  it("a página inicial do FlyControl não importa nada da página nova", () => {
    const home = readFileSync(HOME_ATUAL, "utf8");
    expect(home).not.toMatch(/flydelivery-parceiros/);
  });
});

describe("nada de valor escrito na mão", () => {
  it("não existe preço em reais digitado no texto", () => {
    for (const { nome, conteudo } of arquivosDaPagina()) {
      const achados = semComentarios(conteudo).match(/R\$\s*\d/g) ?? [];
      expect(achados, `${nome} tem preço escrito na mão`).toEqual([]);
    }
  });

  it("não existe prazo de teste grátis digitado na mão", () => {
    for (const { nome, conteudo } of arquivosDaPagina()) {
      const achados = semComentarios(conteudo).match(/\b\d+\s+dias\s+gr[áa]tis/gi) ?? [];
      expect(achados, `${nome} tem o prazo escrito na mão`).toEqual([]);
    }
  });

  it("os valores das ilustrações são centavos inteiros", () => {
    const valores = [
      INDICADORES_DE_EXEMPLO.faturamentoHojeCentavos,
      ...QUADRO_DE_EXEMPLO.flatMap((c) => c.pedidos.map((p) => p.totalCentavos)),
    ];
    for (const v of valores) {
      expect(isValidCents(v), `${v} não é centavo inteiro`).toBe(true);
      expect(formatCents(v)).toMatch(/^R\$ \d/);
    }
  });
});

describe("sem pressão falsa e sem promessa que o sistema não cumpre", () => {
  const PROIBIDOS = [
    /contagem\s+regressiva/i,
    /vagas?\s+limitad/i,
    /últimas?\s+vagas/i,
    /oferta\s+expira/i,
    /por\s+tempo\s+limitado/i,
    /line-through/,
  ];

  it("a página não usa urgência, escassez nem preço riscado", () => {
    for (const { nome, conteudo } of arquivosDaPagina()) {
      for (const proibido of PROIBIDOS) {
        expect(proibido.test(semComentarios(conteudo)), `${nome} usa ${proibido}`).toBe(false);
      }
    }
  });

  it("o FlyBoy aparece como 'Em breve' nos recursos e na seção dele", () => {
    const flyboy = FUNCIONALIDADES.find((f) => f.titulo === "FlyBoy");
    expect(flyboy?.emBreve).toBe(true);
    const secao = readFileSync(join(PASTA, "FlyBoySection.tsx"), "utf8");
    expect(secao).toMatch(/<SeloEmBreve\s*\/>/);
  });
});

describe("estrutura", () => {
  it("a página tem um H1 só", () => {
    const total = arquivosDaPagina().reduce(
      (soma, { conteudo }) => soma + (conteudo.match(/<h1\b/g) ?? []).length,
      0,
    );
    expect(total).toBe(1);
  });
});

/**
 * O ciclo do Hero (hambúrguer → pedidos → hambúrguer → marketplace →
 * hambúrguer). Estes testes leem o CSS e garantem as regras que fazem o laço
 * não ter emenda — se alguém mexer num tempo e esquecer da outra ponta, o
 * teste acusa antes de ir para o ar.
 */
describe("ciclo do Hero", () => {
  const css = readFileSync(join(PASTA, "parceiros.css"), "utf8");
  const visual = readFileSync(join(PASTA, "HeroVisual.tsx"), "utf8");

  /** Devolve os blocos de um @keyframes: { "0%": "...", "16.25%": "...", ... } */
  function quadrosDe(nome: string): Map<string, string> {
    const inicio = css.indexOf(`@keyframes ${nome} {`);
    expect(inicio, `@keyframes ${nome} não existe`).toBeGreaterThanOrEqual(0);
    let i = css.indexOf("{", inicio) + 1;
    let nivel = 1;
    let fim = i;
    while (nivel > 0 && fim < css.length) {
      if (css[fim] === "{") nivel++;
      if (css[fim] === "}") nivel--;
      fim++;
    }
    const corpo = css.slice(i, fim - 1);
    const mapa = new Map<string, string>();
    for (const m of corpo.matchAll(/([\d.%,\s]+)\{([^}]*)\}/g)) {
      // A curva de tempo não é estado visual: fica de fora da comparação.
      const declaracoes = m[2]
        .split(";")
        .map((d) => d.replace(/\s+/g, " ").trim())
        .filter((d) => d && !d.startsWith("animation-timing-function"))
        .sort()
        .join("; ");
      for (const sel of m[1]
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)) {
        mapa.set(sel, declaracoes);
      }
      i = 0;
    }
    return mapa;
  }

  const ANIMACOES = [
    "fdp-heroi-hamburguer",
    "fdp-heroi-balanco",
    "fdp-heroi-respiro",
    "fdp-heroi-pedidos",
    "fdp-heroi-marketplace",
  ];

  it.each(ANIMACOES)("%s termina exatamente como começa (laço sem emenda)", (nome) => {
    const q = quadrosDe(nome);
    expect(q.get("0%"), `${nome} sem 0%`).toBeTruthy();
    expect(q.get("100%"), `${nome} sem 100%`).toBeTruthy();
    expect(q.get("100%")).toBe(q.get("0%"));
  });

  it("todas as camadas usam o mesmo ciclo (8 s), e o respiro cabe nele inteiro", () => {
    expect(css).toMatch(/--fdp-heroi-ciclo:\s*8s/);
    expect(css).toMatch(/animation-duration:\s*var\(--fdp-heroi-ciclo\)/);
    expect(css).toMatch(/animation-duration:\s*calc\(var\(--fdp-heroi-ciclo\)\s*\/\s*2\)/);
  });

  it("o hambúrguer está visível no início e no fim; as interfaces, escondidas", () => {
    expect(quadrosDe("fdp-heroi-hamburguer").get("0%")).toMatch(/opacity: 1/);
    expect(quadrosDe("fdp-heroi-pedidos").get("0%")).toMatch(/opacity: 0/);
    expect(quadrosDe("fdp-heroi-marketplace").get("0%")).toMatch(/opacity: 0/);
  });

  it("só anima o que a placa de vídeo faz sozinha (sem mexer em tamanho ou posição de layout)", () => {
    for (const nome of ANIMACOES) {
      for (const declaracoes of quadrosDe(nome).values()) {
        for (const d of declaracoes.split("; ")) {
          const propriedade = d.split(":")[0];
          expect(["opacity", "transform", "filter"], `${nome} anima ${propriedade}`).toContain(
            propriedade,
          );
        }
      }
    }
  });

  it("respeita quem pediu menos movimento", () => {
    const bloco = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(bloco).toMatch(/\.fdp-heroi \.fdp-heroi-anima\s*\{\s*animation: none !important;/);
  });

  it("usa a imagem oficial e os componentes que a página já tem", () => {
    expect(visual).toMatch(/hero-hamburguer\.webp/);
    expect(visual).toMatch(/<QuadroDePedidos \/>/);
    expect(visual).toMatch(/<CelularMarketplace \/>/);
  });

  it("não usa cronômetros: o tempo é todo do CSS", () => {
    expect(visual).not.toMatch(/setTimeout|setInterval|requestAnimationFrame/);
  });
});
