import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * O questionário de preparação só pode aparecer UMA vez, logo após o cadastro.
 *
 * A regra que garante isso não dá para conferir olhando a tela: ela é a
 * combinação de três arquivos que precisam concordar. Se um deles for mexido
 * sozinho, o sintoma volta — e o sintoma é o cliente sendo parado na portaria
 * a cada login, do jeito que já aconteceu.
 */

const servidor = readFileSync("src/lib/onboarding/onboarding.functions.ts", "utf8");
const cadastro = readFileSync("src/lib/signup/signup.functions.ts", "utf8");
const tela = readFileSync("src/routes/preparar.tsx", "utf8");

describe("o questionário só aparece para quem tem convite", () => {
  it("loja sem caderno NÃO é mandada para o questionário", () => {
    // Esta é a inversão que consertou o problema. Antes, a ausência de caderno
    // era lida como "loja nova" — e caderno não nasce sozinho, então toda
    // loja criada pelo Painel Admin, toda loja restaurada e todo cadastro
    // abandonado na primeira pergunta caíam no questionário para sempre.
    const inicio = servidor.indexOf("export const precisaDeOnboarding");
    expect(inicio).toBeGreaterThan(0);
    const bloco = servidor.slice(inicio, servidor.indexOf("export const", inicio + 10));

    expect(bloco).toContain("if (!data) return { pendente: false }");
    // A conferência do "sem caderno" precisa vir ANTES da conferência de
    // status: invertido, `undefined !== "completed"` volta a dar verdadeiro.
    expect(bloco.indexOf("if (!data)")).toBeLessThan(bloco.indexOf('!== "completed"'));
  });

  it("a tela de preparação usa a mesma regra da portaria", () => {
    // Se as duas discordarem, o painel manda para o questionário e o
    // questionário manda de volta para o painel — a porta giratória.
    const inicio = servidor.indexOf("export const lerOnboarding");
    const bloco = servidor.slice(inicio, servidor.indexOf("export const", inicio + 10));
    expect(bloco).toContain("if (!data) return null");
    // E a tela precisa tratar nulo como "não é lugar de ficar".
    expect(tela).toMatch(/if \(!r \|\| r\.status === "completed"\)/);
  });

  it("o cadastro abre o convite", () => {
    // Sem isto, a inversão acima faria o questionário nunca mais aparecer
    // para ninguém — inclusive para quem acabou de se cadastrar, que é
    // justamente quem deve vê-lo.
    expect(cadastro).toContain('.from("onboarding_answers" as never)');
    expect(cadastro).toContain('status: "not_started"');
  });

  it("o convite é aberto depois que a loja existe", () => {
    // O caderno aponta para a loja. Gravado antes, a chave estrangeira
    // recusa e o cadastro inteiro cai.
    const posLoja = cadastro.indexOf("companyId = company.id;");
    const posConvite = cadastro.indexOf('.from("onboarding_answers" as never)');
    expect(posLoja).toBeGreaterThan(0);
    expect(posConvite).toBeGreaterThan(posLoja);
  });

  it("falhar ao abrir o convite não derruba o cadastro", () => {
    // A conta e a loja valem mais do que o questionário. Se o caderno não
    // for gravado, o cliente entra direto no painel — não fica sem conta.
    const posConvite = cadastro.indexOf('.from("onboarding_answers" as never)');
    const trecho = cadastro.slice(posConvite, posConvite + 900);
    expect(trecho).toContain("erroConvite");
    expect(trecho).toContain("console.error");
    // Nada de `throw` nem de rollback por causa do convite.
    expect(trecho).not.toMatch(/throw new Error|await rollback\(/);
  });
});

describe("ninguém fica trancado do lado de fora", () => {
  it("existe uma saída do questionário", () => {
    // Toda porta que só abre de um jeito acaba prendendo alguém: uma pergunta
    // que não carrega, ou que não serve para o negócio dele, não pode custar
    // o acesso ao painel de pedidos.
    expect(servidor).toContain("export const pularOnboarding");
    expect(tela).toContain("pularAgora");
    expect(tela).toMatch(/>\s*Pular\s*</);
  });

  it("pular fecha o caderno, não o deixa em aberto", () => {
    // Caderno aberto é convite em aberto: o questionário voltaria no próximo
    // login, que é exatamente o problema que estamos consertando.
    const inicio = servidor.indexOf("export const pularOnboarding");
    const bloco = servidor.slice(inicio);
    expect(bloco).toContain('status: "completed"');
    expect(bloco).toContain("pulado: true");
  });

  it("pular leva ao painel mesmo se a gravação falhar", () => {
    // Falha de rede não pode virar cliente preso numa tela de questionário.
    const inicio = tela.indexOf("const pularAgora");
    const bloco = tela.slice(inicio, tela.indexOf("const finalizar"));
    expect(bloco).toMatch(/finally\s*\{[\s\S]*nav\(\{ to: "\/dashboard" \}\)/);
  });
});
