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
  return (
    readFileSync(join(RAIZ, caminho), "utf8")
      // O comentário de bloco sai PRIMEIRO. Fazer o contrário — começar pelo
      // `{/* ... */}` do JSX — é o que quebrava: esse padrão termina em
      // `*/}`, e quando o `*/` encontrado não é seguido de `}`, a busca
      // continua até um `*/` mais adiante e leva o CÓDIGO do meio junto.
      // Medido: um arquivo de 2.464 letras virava 334, e os testes passavam a
      // conferir o vazio — o detector de fumaça com a bateria tirada.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
  );
}

const painel = soCodigo("src/routes/_app.tsx");
const servidor = soCodigo("src/lib/onboarding/onboarding.functions.ts");
const tela = soCodigo("src/routes/preparar.tsx");

describe("o questionário foi aposentado", () => {
  it("o painel não manda mais ninguém para o questionário", () => {
    // Existia aqui uma porta que parava todo lojista novo em `/preparar`
    // antes de ele ver o painel. Quem faz esse trabalho agora é o guia de
    // configuração, e faz melhor: em vez de PERGUNTAR que negócio a pessoa
    // tem, ele leva até a tela e confere no banco se ficou configurado.
    //
    // Manter os dois era o formulário na portaria e a mesma pergunta de novo
    // na recepção.
    expect(painel).not.toContain("precisaDeOnboarding");
    expect(painel).not.toMatch(/nav\(\{\s*to:\s*"\/preparar"/);
  });

  it("quem entra no painel vê o painel, sem espera extra", () => {
    // Sem a porta, não há resposta de servidor para esperar antes de
    // desenhar: a tela de "Carregando..." volta a depender só do login.
    expect(painel).toMatch(/if \(loading \|\| !user\) \{/);
    expect(painel).not.toContain("onboardingPendente");
  });

  it("a tela do questionário continua de pé para quem tiver o endereço", () => {
    // Aposentar é tirar de serviço, não demolir: quem já respondeu tem as
    // respostas guardadas, e a tela sozinha manda para o painel quando não
    // há nada pendente.
    expect(tela.length).toBeGreaterThan(100);
  });

  it("quem manda continua sendo o servidor, não o navegador", () => {
    expect(painel).not.toMatch(/localStorage[^\n]*onboard/i);
    expect(tela).not.toMatch(/localStorage[^\n]*(onboard|respost)/i);
  });
});

describe("o guia é a porta agora", () => {
  it("é ele que fica no painel, e não o questionário", () => {
    expect(painel).toMatch(/<GuiaDeConfiguracao\s+habilitado=\{!isSuperAdmin\}/);
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

  it("todo passo em aberto tem para onde levar", () => {
    // Passo sem destino vira texto morto na tela: o dono clica, nada acontece
    // e não há como descobrir o que fazer. Foi exatamente isso que travou o
    // "Conhecemos seu estabelecimento" — o único sem destino da lista.
    const nada = {
      onboardingConcluido: false,
      produtos: 0,
      lojaIdentificada: false,
      temPagamento: false,
      cardapioPublicado: false,
      pedidos: 0,
    };

    // "Receba seu primeiro pedido" é a exceção legítima: não existe tela que
    // faça um cliente pedir — quem completa esse passo é o cliente, não o dono.
    const semDestino = primeirosPassos(nada)
      .filter((p) => !p.feito && p.id !== "primeiro_pedido")
      .filter((p) => !p.para);

    expect(semDestino).toEqual([]);
  });

  it("o passo do questionário saiu da lista", () => {
    // Ele marcava "Conhecemos seu estabelecimento" a partir do questionário
    // aposentado. Deixá-lo ali seria um item de boletim de uma matéria que
    // não existe mais na grade.
    const passo = primeirosPassos({ ...cheio, onboardingConcluido: false }).find(
      (p) => p.id === "conhecemos",
    );
    expect(passo).toBeUndefined();
  });

  it("todo passo que sobrou continua vindo de um dado real", () => {
    // A regra da lista não mudou: nada se marca sozinho.
    const vazio = primeirosPassos({
      ...cheio,
      produtos: 0,
      lojaIdentificada: false,
      temPagamento: false,
      cardapioPublicado: false,
      pedidos: 0,
    });
    expect(vazio.every((p) => !p.feito)).toBe(true);
    expect(vazio.length).toBeGreaterThan(0);
  });
});
