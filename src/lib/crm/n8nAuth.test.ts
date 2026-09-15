import { describe, it, expect, afterEach } from "vitest";
import { comparaSemVazar, conferirChaveMestra, respostaNegadaCrm } from "./n8nAuth";
import { ERRO_SENHA_DA_LOJA } from "./n8nTenant";

/**
 * O que estes testes protegem, em português:
 *
 * quando a porta recusa, a resposta precisa dizer QUAL das duas chaves estava
 * errada. Sem isso, quem está configurando fica no escuro — foi exatamente o
 * que aconteceu: horas procurando a senha da loja quando o problema era a
 * chave mestra que nem estava sendo enviada.
 */

function pedido(cabecalho?: string): Request {
  return new Request("https://exemplo.com/api/crm/outbox", {
    method: "POST",
    headers: cabecalho ? { Authorization: cabecalho } : {},
  });
}

const antes = process.env.CRM_N8N_SECRET;
afterEach(() => {
  if (antes === undefined) delete process.env.CRM_N8N_SECRET;
  else process.env.CRM_N8N_SECRET = antes;
});

describe("tranca do CRM", () => {
  it("compara segredos iguais e diferentes", () => {
    expect(comparaSemVazar("abc", "abc")).toBe(true);
    expect(comparaSemVazar("abc", "abd")).toBe(false);
    expect(comparaSemVazar("abc", "abcd")).toBe(false);
  });

  it("sem chave mestra configurada, a porta não abre para ninguém", () => {
    delete process.env.CRM_N8N_SECRET;
    const r = conferirChaveMestra(pedido("Bearer qualquer"));
    expect(r).toEqual({ ok: false, status: 503, erro: "integracao_nao_configurada" });
  });

  it("sem cabeçalho Authorization, recusa apontando a chave mestra", () => {
    process.env.CRM_N8N_SECRET = "chave-certa";
    const r = conferirChaveMestra(pedido());
    expect(r).toEqual({ ok: false, status: 401, erro: "nao_autorizado" });
  });

  it("aceita com ou sem o prefixo Bearer", () => {
    process.env.CRM_N8N_SECRET = "chave-certa";
    expect(conferirChaveMestra(pedido("Bearer chave-certa"))).toEqual({ ok: true });
    expect(conferirChaveMestra(pedido("chave-certa"))).toEqual({ ok: true });
  });

  it("os dois erros de chave têm códigos e mensagens diferentes", async () => {
    expect(ERRO_SENHA_DA_LOJA).not.toBe("nao_autorizado");

    const mestra = await respostaNegadaCrm({ status: 401, erro: "nao_autorizado" }).json();
    const loja = await respostaNegadaCrm({ status: 401, erro: ERRO_SENHA_DA_LOJA }).json();

    expect(mestra.message).not.toBe(loja.message);
    expect(mestra.message).toContain("CRM_N8N_SECRET");
    expect(loja.message).toContain("senha desta loja");
  });
});
