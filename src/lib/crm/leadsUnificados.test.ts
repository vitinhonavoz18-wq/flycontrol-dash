import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();
const sql = readFileSync(
  join(RAIZ, "supabase/migrations/20260915050000_leads_unificados.sql"),
  "utf8",
);

/**
 * As promessas da junção das duas tabelas de cliente.
 *
 * Estas regras são difíceis de testar rodando, porque moram dentro do banco.
 * Mas são exatamente as que, se alguém apagar sem perceber, causam estrago
 * caro e silencioso — mandar promoção para quem só perguntou o horário, ou
 * apagar de novo o nome que o lojista corrigiu à mão.
 */
describe("um cadastro só de cliente", () => {
  it("as fichas antigas do Chat são copiadas antes de a tabela sumir", () => {
    const copia = sql.indexOf("INSERT INTO public.marketing_customers");
    const dropa = sql.indexOf("DROP TABLE IF EXISTS public.crm_contacts");
    expect(copia).toBeGreaterThan(-1);
    expect(dropa).toBeGreaterThan(-1);
    expect(copia).toBeLessThan(dropa);
  });

  it("quem já existia pelo site não perde o nome que tinha", () => {
    expect(sql).toContain("COALESCE(public.marketing_customers.name, EXCLUDED.name)");
  });

  it("quem só conversou no WhatsApp NÃO entra em campanha sozinho", () => {
    // Disparar promoção para quem só perguntou "vocês abrem que horas?" é o
    // caminho mais curto para o número da loja ser bloqueado no WhatsApp.
    expect(sql).toMatch(/marketing_opt_in[\s\S]{0,40}FALSE/i);
    expect(sql).not.toMatch(/marketing_opt_in\s*=\s*TRUE/i);
  });

  it("uma conversa por pessoa continua valendo", () => {
    expect(sql).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS crm_conversations_tenant_customer_key",
    );
  });
});

describe("o nome do cliente", () => {
  it("nome corrigido à mão nunca é sobrescrito pelo WhatsApp", () => {
    expect(sql).toContain("WHEN public.marketing_customers.name_locked THEN");
  });

  it("corrigir pelo painel trava o nome; apagar destrava", () => {
    expect(sql).toContain("name_locked = (v_nome IS NOT NULL)");
  });

  it("renomear exige a loja certa, e não só o número do cliente", () => {
    // Sem o tenant, mandar o número de um cliente de outra loja renomearia o
    // cliente da outra loja.
    const fn = sql.slice(sql.indexOf("FUNCTION public.crm_rename_customer"));
    expect(fn).toContain("AND tenant_id = p_tenant_id");
  });
});

describe("a mensagem que o dono digitou no celular dele", () => {
  it("entra do lado da loja, não do lado do cliente", () => {
    expect(sql).toContain("CASE WHEN p_from_me THEN 'out' ELSE 'in' END");
  });

  it("não traz o nome junto — o nome dela é o da loja", () => {
    expect(sql).toContain("CASE WHEN p_from_me THEN NULL");
  });

  it("não acende a bolinha de não lida", () => {
    // Ele acabou de escrever: marcar como não lida é avisar a pessoa sobre a
    // própria fala dela.
    expect(sql).toContain("unread_count = CASE WHEN p_from_me THEN 0 ELSE unread_count + 1 END");
  });
});
