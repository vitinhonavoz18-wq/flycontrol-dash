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

  it("o vídeo do Hero toca sozinho, mudo, em loop, sem controles", () => {
    const video = readFileSync(join(PASTA, "HeroVideo.tsx"), "utf8");
    const tag = video.match(/<video[\s\S]*?\/>/)?.[0] ?? "";
    expect(tag).toMatch(/\bmuted\b/);
    expect(tag).toMatch(/\bloop\b/);
    expect(tag).toMatch(/\bplaysInline\b/);
    expect(tag).not.toMatch(/\bcontrols\b/);
  });
});
