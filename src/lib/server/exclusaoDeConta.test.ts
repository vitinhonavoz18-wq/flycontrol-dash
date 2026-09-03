import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardas da exclusão da conta de acesso junto com a loja.
 *
 * POR QUE ESTE TESTE É DIFERENTE DOS OUTROS
 *
 * Apagar conta é a única operação deste sistema que não tem volta e não tem
 * lixeira. Não existe "desfazer": o e-mail some, a senha some, e se era o
 * cliente errado não há como reconstruir.
 *
 * Por isso as travas não podem depender de alguém lembrar delas na hora.
 * Estes testes leem o código e conferem que as três continuam lá.
 */

const RAIZ = process.cwd();
const servico = readFileSync(join(RAIZ, "src/lib/server/pizzeriaLifecycle.server.ts"), "utf8");
const rota = readFileSync(join(RAIZ, "src/routes/api/pizzerias.$id.delete.ts"), "utf8");
const tela = readFileSync(join(RAIZ, "src/components/admin/StoreLifecycleActions.tsx"), "utf8");

function soCodigo(conteudo: string): string {
  return conteudo
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("apagar a conta do dono junto com a loja", () => {
  it("nunca apaga uma conta que ainda é dona de outra loja", () => {
    // Sem isto, o dono de duas lojas perderia o acesso à que sobrou.
    const codigo = soCodigo(servico);
    expect(codigo).toContain('.eq("owner_id", ownerId)');
    expect(codigo).toMatch(/outras\s*\?\?\s*\[\]\)\.length\s*>\s*0/);
  });

  it("nunca apaga um administrador da plataforma", () => {
    const codigo = soCodigo(servico);
    expect(codigo).toContain("super_admin");
    expect(codigo).toContain("ehAdmin");
  });

  it("nunca apaga a conta de quem está clicando", () => {
    expect(soCodigo(servico)).toContain("ownerId === adminUserId");
  });

  it("a loja é excluída mesmo quando a conta é preservada", () => {
    // Falhar a exclusão inteira porque a conta não pôde sair seria pior: a
    // loja de teste continuaria misturada com as de verdade.
    const codigo = soCodigo(servico);
    expect(codigo).toContain("avisos.push");
    expect(codigo).toContain("success: true, warning:");
  });

  it("a conta só é apagada DEPOIS da loja", () => {
    const codigo = soCodigo(servico);
    const posDelete = codigo.indexOf('.from("pizzerias").delete()');
    const posConta = codigo.indexOf("apagarContaDoDono(pz.owner_id");
    // Ao contrário, uma falha na exclusão da loja deixaria uma loja sem dono:
    // órfã, sem ninguém para acessá-la nem para excluí-la.
    expect(posDelete).toBeGreaterThan(0);
    expect(posConta).toBeGreaterThan(posDelete);
  });

  it("limpa as fichas que apontam para o login antes de apagá-lo", () => {
    // Não há chave estrangeira ligando estas tabelas ao cadastro de login,
    // então o banco não limpa sozinho.
    const codigo = soCodigo(servico);
    expect(codigo).toContain('.from("user_roles").delete().eq("user_id", ownerId)');
    expect(codigo).toContain('.from("profiles").delete().eq("id", ownerId)');
  });

  it("apagar a conta é escolha explícita: o padrão é preservar", () => {
    // No serviço, na rota e na tela.
    expect(soCodigo(servico)).toContain("alsoDeleteOwner = false");
    expect(soCodigo(rota)).toContain("body?.alsoDeleteOwner === true");
    expect(soCodigo(tela)).toContain("useState(false)");
  });

  it("continua exigindo o nome exato da loja digitado à mão", () => {
    // A trava que já existia não pode ter sido afrouxada no caminho.
    expect(soCodigo(servico)).toContain('return { success: false, error: "name_mismatch" }');
    expect(soCodigo(tela)).toContain("deleteConfirmText.trim() !== pizzeria.name");
  });

  it("só administrador da plataforma consegue chamar a exclusão", () => {
    expect(soCodigo(rota)).toContain("requireGlobalAdmin");
  });

  it("a exclusão fica registrada no livro de auditoria", () => {
    const codigo = soCodigo(servico);
    expect(codigo).toContain("STORE_PERMANENTLY_DELETED");
    expect(codigo).toContain("conta_do_dono_apagada");
  });
});

/**
 * Guarda da progressão do CENTS por loja.
 *
 * A faixa da tela de Pedidos recebe do navegador QUAL loja mostrar, porque o
 * administrador troca de loja no painel. Receber não pode virar obedecer: se
 * o servidor aceitasse o identificador sem conferir, bastaria trocar o número
 * na requisição para espiar o faturamento de outra empresa.
 */
describe("de quem são os números do CENTS", () => {
  const cents = readFileSync(join(RAIZ, "src/lib/billing/cents.functions.ts"), "utf8");

  it("a loja pedida pelo navegador é conferida no servidor", () => {
    const codigo = soCodigo(cents);
    expect(codigo).toContain("assertOwnsTenant(context.supabase, context.userId, data.tenantId)");
  });

  it("sem permissão, a faixa some — não devolve os números de outra loja", () => {
    const codigo = soCodigo(cents);
    // Ancorar na CHAMADA, não no import lá do topo do arquivo.
    const pos = codigo.indexOf("assertOwnsTenant(context.supabase");
    expect(codigo.slice(pos, pos + 400)).toContain("return null");
  });

  it("sem loja informada, continua valendo a loja do próprio dono", () => {
    expect(soCodigo(cents)).toContain('.eq("owner_id", context.userId)');
  });
});
