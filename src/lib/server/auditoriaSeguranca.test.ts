import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardas da auditoria de segurança de outubro/2026.
 *
 * Cada teste aqui segura uma porta que estava aberta. Se alguém, sem querer,
 * desfizer a trava numa mudança futura, o teste fica vermelho antes de a
 * mudança ir para o ar.
 */

const RAIZ = process.cwd();

function soCodigo(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function soSql(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8").replace(/^\s*--.*$/gm, "");
}

describe("aviso assinado de 'mesa fechada' ao SiteCreatorFly", () => {
  const codigo = soCodigo("src/lib/notifyTableClosed.functions.ts");

  it("exige login no painel", () => {
    expect(codigo).toContain(".middleware([requireSupabaseAuth])");
  });

  it("busca a comanda com as regras de quem pediu, não com a chave mestra", () => {
    expect(codigo).toContain('context.supabase\n      .from("table_sessions")');
    expect(codigo).not.toContain("supabaseAdmin");
  });

  it("só avisa comanda que está mesmo fechada", () => {
    expect(codigo).toContain('["closed", "archived"].includes');
  });

  it("loja, mesa e senha da comanda saem do banco, não do navegador", () => {
    expect(codigo).toContain("restaurant_id: sess.restaurant_id");
    expect(codigo).toContain("customer_token: sess.customer_token");
    expect(codigo).not.toContain("customer_token: data.customer_token");
    expect(codigo).not.toContain("restaurant_id: data.restaurant_id");
  });
});

describe("login e crachá do garçom", () => {
  const codigo = soCodigo("src/lib/waiterAuth.functions.ts");

  it("o login tem limite de tentativas erradas", () => {
    expect(codigo).toContain("contarFalhasRecentes");
    expect(codigo).toContain("registrarFalha");
    // A conferência do limite vem ANTES de testar a senha.
    expect(codigo.indexOf("MAX_FALHAS_POR_USUARIO ||")).toBeLessThan(
      codigo.indexOf("verifyPassword(data.password"),
    );
  });

  it("garçom desativado perde o acesso na hora, mesmo com crachá válido", () => {
    const authed = codigo.slice(codigo.indexOf("async function authed"));
    expect(authed).toContain("is_active");
    expect(authed).toContain("garcom.tenant_id !== auth.tenantId");
  });
});

describe("status da comanda pelos caminhos antigos", () => {
  it("não entrega a senha da comanda a quem só sabe loja e mesa", () => {
    const codigo = soCodigo("src/routes/api/public/table-session-status.ts");
    const legado = codigo.match(/const SELECT_LEGADO =\s*"([^"]+)"/);
    expect(legado).not.toBeNull();
    expect(legado![1]).not.toContain("customer_token");
    expect(legado![1]).not.toContain("dining_session_id");
    const depoisDoLegado = codigo.slice(codigo.indexOf("Legacy lookups"));
    expect(depoisDoLegado).not.toContain(".select(SELECT)");
  });
});

describe("pedido de fora não devolve detalhe interno do banco", () => {
  it("as respostas de erro não carregam a mensagem do banco", () => {
    const codigo = soCodigo("src/routes/api/orders.ts");
    expect(codigo).not.toContain("details: pErr.message");
    expect(codigo).not.toContain("details: orderError.message");
  });

  it("o registro externo não guarda a chave inteira da loja", () => {
    const codigo = soCodigo("src/routes/api/orders.ts");
    expect(codigo).toContain("api_key: undefined");
  });
});

describe("endereço antigo de pedidos sem senha (webhook-orders)", () => {
  it("fica desativado no código", () => {
    const codigo = soCodigo("supabase/functions/webhook-orders/index.ts");
    expect(codigo).toContain("status: 410");
    expect(codigo).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(codigo).not.toContain(".insert(");
  });
});

describe("migração que tranca funções e visões do banco", () => {
  const sql = soSql("supabase/migrations/20261022120000_tranca_funcoes_e_visoes_expostas.sql");

  const SO_SERVIDOR = [
    "crm_next_outbox(uuid, integer, text, integer)",
    "crm_receive_message(uuid, text, text, text, text, text, text, boolean)",
    "crm_attach_media(uuid, text, text, text, text)",
    "crm_rename_customer(uuid, uuid, text, text)",
    "club_close_cycle(uuid)",
    "club_close_due_cycles()",
    "club_check_achievements(uuid, uuid)",
    "club_get_or_create_active_cycle(uuid, uuid)",
    "club_recalculate_level(uuid, uuid)",
    "club_resolve_price(uuid, uuid)",
    "flycourier_purge_old_locations(integer)",
    "expire_stale_checkout_intents()",
    "recalculate_table_session_totals(uuid)",
    "sync_order_to_table_session_logic(uuid)",
  ];

  it.each(SO_SERVIDOR)("%s sai do alcance do público e de quem só está logado", (fn) => {
    expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon, authenticated;`);
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role;`);
  });

  it("as funções chamadas pelo painel conferem dono ou administrador", () => {
    const inscrever = sql.slice(sql.indexOf("enroll_company_in_cents("));
    expect(inscrever.slice(0, 600)).toContain("public.is_admin()");
    const mesas = sql.slice(sql.indexOf("generate_default_restaurant_tables(p_restaurant_id"));
    expect(mesas.slice(0, 600)).toContain("public.owns_pizzeria(auth.uid(), p_restaurant_id)");
  });

  it("os relatórios de faturamento obedecem às regras de quem pede", () => {
    expect(sql).toContain(
      "ALTER VIEW public.pizzeria_financial_metrics SET (security_invoker = on);",
    );
    expect(sql).toContain(
      "ALTER VIEW public.admin_global_financial_metrics SET (security_invoker = on);",
    );
  });

  it("fecha as regras largas demais", () => {
    expect(sql).toContain(
      'DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.pizzeria_pizza_sizes;',
    );
    expect(sql).toContain('DROP POLICY IF EXISTS "user_roles_read_policy" ON public.user_roles;');
    expect(sql).toContain(
      'ALTER POLICY "Public can read session lifecycle" ON public.table_sessions TO anon;',
    );
  });
});
