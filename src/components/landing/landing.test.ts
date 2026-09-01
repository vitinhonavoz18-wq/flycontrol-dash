import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatCents } from "@/lib/billing/money";
import { PLAN_PRICING } from "@/lib/billing/plans";
import { TRIAL_DURATION_DAYS } from "@/lib/billing/trial";

/**
 * Guardas da página pública.
 *
 * Não testam aparência — testam as duas coisas que, se quebrarem, viram
 * problema com cliente:
 *
 * 1. PREÇO ESCRITO NA MÃO. Se alguém digitar "R$ 0,70" no meio do texto, o
 *    dia em que o preço mudar a página vai continuar anunciando o antigo, e
 *    o cliente descobre a diferença na fatura. É o cardápio da parede com o
 *    preço de antes do aumento: quem pediu confiando nele tem razão de
 *    reclamar.
 *
 * 2. PRESSÃO FALSA. Contagem regressiva, vaga limitada e preço riscado são
 *    mentira com data marcada. Se aparecerem, este teste acusa.
 */

// `import.meta.url` aqui aponta para a raiz do servidor de desenvolvimento,
// não para o disco. A pasta do projeto é o lugar certo de onde partir.
const RAIZ = process.cwd();
const PASTA = join(RAIZ, "src", "components", "landing");
const PAGINA = join(RAIZ, "src", "routes", "index.tsx");

/** Tira comentários: neles o termo é explicação, não promessa ao cliente. */
function semComentarios(conteudo: string): string {
  return conteudo
    .split("\n")
    .filter((linha) => !/^\s*(\*|\/\/|\/\*)/.test(linha))
    .join("\n");
}

function arquivosDaPagina(): { nome: string; conteudo: string }[] {
  const daPasta = readdirSync(PASTA)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => ({ nome: f, conteudo: readFileSync(join(PASTA, f), "utf8") }));

  return [...daPasta, { nome: "routes/index.tsx", conteudo: readFileSync(PAGINA, "utf8") }];
}

describe("nenhum preço escrito na mão", () => {
  it("não existe valor em reais digitado no texto da página", () => {
    for (const { nome, conteudo } of arquivosDaPagina()) {
      const achados = semComentarios(conteudo).match(/R\$\s*\d/g) ?? [];
      expect(achados, `${nome} tem preço escrito na mão: ${achados.join(", ")}`).toEqual([]);
    }
  });

  it("também não existe número de dias de teste digitado na mão", () => {
    for (const { nome, conteudo } of arquivosDaPagina()) {
      const achados = semComentarios(conteudo).match(/\b\d+\s+dias\s+gr[áa]tis/gi) ?? [];
      expect(achados, `${nome} tem o prazo escrito na mão: ${achados.join(", ")}`).toEqual([]);
    }
  });
});

describe("os números vêm do mesmo lugar que a cobrança usa", () => {
  it("o preço do CENTS e a mensalidade do Premium são os do sistema", () => {
    // Se estes valores mudarem em `lib/billing`, a página muda junto — é o
    // motivo de ela ler daqui em vez de ter o número escrito.
    expect(formatCents(PLAN_PRICING.cents.defaultOrderUnitPriceCents)).toMatch(/^R\$/);
    expect(formatCents(PLAN_PRICING.premium.monthlyFeeCents)).toMatch(/^R\$/);
    expect(PLAN_PRICING.cents.promotionThresholdOrders).toBeGreaterThan(0);
    expect(TRIAL_DURATION_DAYS).toBeGreaterThan(0);
  });
});

describe("sem pressão falsa", () => {
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
});

describe("acessibilidade estrutural", () => {
  it("a página tem um H1 só", () => {
    const pagina = readFileSync(PAGINA, "utf8");
    expect((pagina.match(/<h1\b/g) ?? []).length).toBe(1);
  });

  it("todo print tem descrição em texto", () => {
    const pagina = readFileSync(PAGINA, "utf8");
    // Cada imagem passada ao showcase precisa vir com `alt` preenchido.
    const blocos = pagina.match(/src: "\/images\/[^"]+",\s*\n\s*alt: "([^"]*)"/g) ?? [];
    expect(blocos.length).toBeGreaterThan(0);
    for (const bloco of blocos) {
      const alt = bloco.match(/alt: "([^"]*)"/)?.[1] ?? "";
      expect(alt.length, `print sem descrição: ${bloco}`).toBeGreaterThan(10);
    }
  });
});
