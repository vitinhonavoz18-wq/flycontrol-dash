import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { primeirosPassos, quantosFeitos, tudoFeito } from "./primeirosPassos";

/**
 * As travas do onboarding que não dá para conferir só olhando a tela.
 *
 * Três coisas aqui são o tipo de detalhe que alguém desfaz sem perceber, e que
 * quebram de um jeito caro:
 *
 *   1. a porta do painel: se ela sumir, o lojista novo cai direto no dashboard
 *      e nunca vê a preparação;
 *   2. a espera antes de decidir: se o painel for desenhado antes de saber a
 *      resposta, o dashboard pisca e some — parece defeito;
 *   3. quem manda é o servidor: se a decisão virar uma variável guardada no
 *      navegador, basta limpar o navegador (ou mexer nele) para pular a
 *      preparação.
 */

const RAIZ = process.cwd();

function soCodigo(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const painel = soCodigo("src/routes/_app.tsx");
const servidor = soCodigo("src/lib/onboarding/onboarding.functions.ts");
const tela = soCodigo("src/routes/preparar.tsx");

describe("a porta do painel", () => {
  it("o painel pergunta ao servidor se falta preparar", () => {
    expect(painel).toContain("precisaDeOnboarding");
  });

  it("quem ainda não preparou é mandado para a preparação", () => {
    expect(painel).toMatch(/onboardingPendente\)\s*nav\(\{\s*to:\s*"\/preparar"/);
  });

  it("o painel NÃO é desenhado enquanto a resposta não chega", () => {
    // É isso que evita o dashboard piscar por meio segundo antes de sumir.
    expect(painel).toContain("onboardingPendente !== false");
  });

  it("a decisão não vem do navegador", () => {
    // Nem localStorage, nem sessionStorage: a verdade é do servidor.
    expect(painel).not.toMatch(/localStorage[^\n]*onboard/i);
    expect(tela).not.toMatch(/localStorage[^\n]*(onboard|respost)/i);
  });
});

describe("o servidor do onboarding", () => {
  it("a loja vem sempre da conta logada, nunca de um número mandado pela tela", () => {
    // A loja é sempre buscada pelo dono; e quem passa o dono é sempre o
    // `context.userId`, que vem do login conferido no servidor.
    expect(servidor).toContain('.eq("owner_id", userId)');
    expect(servidor).toContain("lojaDoUsuario(context.userId)");
    // Se um dia alguém aceitar companyId por parâmetro, isto acusa.
    expect(servidor).not.toMatch(/data\.companyId/);
  });

  it("cada resposta é conferida contra o catálogo de perguntas", () => {
    expect(servidor).toContain("etapaPorId(data.etapa)");
    expect(servidor).toContain("aplicarResposta");
  });

  it("onboarding concluído não é reaberto por uma requisição repetida", () => {
    expect(servidor).toMatch(/status === "completed"/);
  });

  it("as configurações são aplicadas ANTES de marcar como concluído", () => {
    const posConfig = servidor.indexOf("aplicarConfiguracaoAutomatica(loja.id");
    const posConcluir = servidor.indexOf('status: "completed"');
    expect(posConfig).toBeGreaterThan(0);
    expect(posConcluir).toBeGreaterThan(posConfig);
  });

  it("a escolha manual do lojista nunca é sobrescrita", () => {
    // Só preenche o que estiver vazio.
    expect(servidor).toContain("if (!atual?.business_type)");
    expect(servidor).toContain("if (!jaEscolheu)");
  });

  it("o layout recomendado vem do mesmo motor que a tela Minha Loja usa", () => {
    expect(servidor).toContain("layoutRecomendadoPara");
  });

  it("sem produtos, o destino é o cardápio — não o painel", () => {
    expect(servidor).toMatch(/produtos > 0 \? "painel" : "cardapio"/);
  });
});

describe('a lista "Prepare sua loja"', () => {
  const cheio = {
    onboardingConcluido: true,
    produtos: 12,
    lojaIdentificada: true,
    temPagamento: true,
    cardapioPublicado: true,
    pedidos: 3,
  };

  it("some quando tudo estiver feito", () => {
    expect(tudoFeito(cheio)).toBe(true);
  });

  it("nenhum passo se marca sozinho: tudo vem de um dado real", () => {
    const vazio = {
      onboardingConcluido: false,
      produtos: 0,
      lojaIdentificada: false,
      temPagamento: false,
      cardapioPublicado: false,
      pedidos: 0,
    };
    expect(primeirosPassos(vazio).every((p) => !p.feito)).toBe(true);
    expect(quantosFeitos(vazio).feitos).toBe(0);
  });

  it("o passo do cardápio leva para o cardápio", () => {
    const passo = primeirosPassos({ ...cheio, produtos: 0 }).find((p) => p.id === "produtos");
    expect(passo?.para).toBe("/menu");
    expect(passo?.feito).toBe(false);
  });
});
