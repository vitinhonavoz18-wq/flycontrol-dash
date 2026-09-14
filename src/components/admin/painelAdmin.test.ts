import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * O Painel Admin depois da faxina: quatro itens de menu em vez de seis, e
 * nenhum link apontando para o endereço antigo.
 */

const menu = readFileSync("src/routes/_app.tsx", "utf8");
const lojas = readFileSync("src/components/admin/dashboards/PizzeriasDashboard.tsx", "utf8");
const usuarios = readFileSync("src/routes/_app/admin/users.tsx", "utf8");
const insights = readFileSync("src/routes/_app/admin/analytics.tsx", "utf8");
const rotaLojas = readFileSync("src/routes/_app/admin/pizzerias.tsx", "utf8");
const rotaFinanceiro = readFileSync("src/routes/_app/admin/finance.tsx", "utf8");
const hook = readFileSync("src/hooks/admin/use-admin-pizzerias.ts", "utf8");

describe("nenhum botão leva para o endereço antigo", () => {
  it("o domínio antigo não aparece em nenhuma tela do admin", () => {
    // O cardápio do cliente final mora em conectfly.com.br. O endereço que
    // estava aqui era de uma ferramenta que a FlyControl não usa mais: quem
    // clicasse em "Abrir Cardápio" ia parar numa página que não existe.
    for (const arquivo of [lojas, usuarios, insights, hook]) {
      expect(arquivo).not.toMatch(/lovable\.app/);
    }
  });

  it("o link do cardápio é o que está gravado na ficha da loja", () => {
    // Dois erros moravam no mesmo botão: o domínio velho E o número interno
    // da loja no lugar do endereço. Nem o número nem um endereço montado a
    // partir do nome servem — a BOTECO VT tem nome curto "boteco-vt" e
    // endereço ".../boteco-vt-a6ik", porque outro nome igual já existia.
    expect(hook).toContain("public_url");
    expect(hook).toContain("endereco_do_cardapio");
    expect(lojas).toContain("p.endereco_do_cardapio");
    // O número interno da loja não pode voltar a ser usado como endereço.
    expect(lojas).not.toMatch(/href=\{`[^`]*\$\{p\.pizzeria_id\}/);
  });

  it("loja sem cardápio publicado tem o botão apagado, não um link quebrado", () => {
    // Botão que abre página de erro é pior do que botão apagado: faz o admin
    // achar que a loja do cliente está fora do ar.
    expect(lojas).toContain("disabled={!p.endereco_do_cardapio}");
    expect(lojas).toContain("Cardápio ainda não publicado");
  });
});

describe("o menu do Painel Admin", () => {
  const bloco = menu.slice(menu.indexOf("const adminItems"), menu.indexOf("const NavItems"));

  it("não tem mais FlyPizzarias nem Financeiro Global", () => {
    expect(bloco).not.toContain("FlyPizzarias");
    expect(bloco).not.toContain("Financeiro Global");
    expect(bloco).not.toContain("/admin/pizzerias");
    expect(bloco).not.toContain("/admin/finance");
  });

  it("mantém os quatro itens que sobraram", () => {
    for (const destino of [
      "/admin/analytics",
      "/admin/users",
      "/admin/subscriptions",
      "/admin/cents",
    ]) {
      expect(bloco).toContain(destino);
    }
  });
});

describe("nada foi perdido, só mudou de gaveta", () => {
  it("a lista de lojas virou aba dentro de Usuários", () => {
    expect(usuarios).toContain("PizzeriasDashboard");
    expect(usuarios).toContain("UsersDashboard");
  });

  it("o Financeiro Global virou aba dentro de Insights Globais", () => {
    expect(insights).toContain("FinanceDashboard");
    expect(insights).toContain("AnalyticsDashboard");
  });

  it("os endereços antigos redirecionam em vez de dar erro", () => {
    // Link salvo nos favoritos não pode virar página de erro só porque a tela
    // mudou de lugar.
    expect(rotaLojas).toMatch(/redirect\(\{ to: "\/admin\/users" \}\)/);
    expect(rotaFinanceiro).toMatch(/redirect\(\{ to: "\/admin\/analytics" \}\)/);
  });
});
