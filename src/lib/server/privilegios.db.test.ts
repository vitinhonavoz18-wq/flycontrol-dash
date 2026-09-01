import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * As duas primeiras etapas da auditoria de segurança fecharam portas que
 * ficaram abertas por anos. Nada na tela mudou — e é justamente por isso que
 * estes testes existem: uma trava invisível é fácil de remover sem querer numa
 * migration futura, e ninguém perceberia até alguém entrar pela porta de novo.
 *
 * Estes testes leem o SQL de verdade que foi aplicado. Se uma migration futura
 * reescrever uma dessas funções e esquecer a trava, a suíte quebra aqui, na
 * hora — em vez de o problema voltar em silêncio.
 *
 * A ordem importa: o banco aplica as migrations por data, e uma função pode ser
 * reescrita depois. Por isso lemos TODAS as migrations e, quando há mais de uma
 * definição da mesma função, vale a ÚLTIMA — a mesma regra que
 * billingHook.test.ts já usa.
 */

import { readdirSync } from "node:fs";

const DIR = "supabase/migrations";

/** Todas as migrations concatenadas na ordem em que o banco as aplica. */
const sql = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(`${DIR}/${f}`, "utf8"))
  .join("\n");

/** A definição que realmente vale de uma função: a última escrita. */
function definicaoVigente(nome: string): string {
  const todas = [
    ...sql.matchAll(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${nome}[\\s\\S]*?\\$\\$;`, "g")),
  ];
  expect(todas.length, `função ${nome} não encontrada nas migrations`).toBeGreaterThan(0);
  return todas[todas.length - 1][0];
}

describe("SEC-01 — ninguém se promove a administrador sozinho", () => {
  const fn = () => definicaoVigente("proteger_coluna_is_admin");

  it("existe um gatilho vigiando a ficha do usuário", () => {
    expect(sql).toContain("CREATE TRIGGER trg_proteger_coluna_is_admin");
    // Sem o INSERT, bastaria apagar a própria ficha e criá-la já marcada.
    expect(sql).toMatch(/trg_proteger_coluna_is_admin[\s\S]{0,120}BEFORE INSERT OR UPDATE ON public\.profiles/);
  });

  it("ficha nova nunca nasce administradora", () => {
    expect(fn()).toContain("NEW.is_admin := false");
  });

  it("ficha existente mantém o valor que já tinha", () => {
    expect(fn()).toContain("NEW.is_admin := OLD.is_admin");
  });

  it("o conferente NÃO tem poderes elevados", () => {
    // Dentro de uma função SECURITY DEFINER, `current_user` vira o dono da
    // função — o conferente enxergaria "gerente" em todo mundo que passasse.
    expect(fn()).not.toContain("SECURITY DEFINER");
    expect(fn()).toContain("current_user IN (");
  });

  it("administrador de verdade continua podendo mexer", () => {
    expect(fn()).toContain("public.is_admin()");
  });
});

describe("SEC-07 — as funções privilegiadas do Clube CENTS estão trancadas", () => {
  // Assinatura exata, porque REVOKE em Postgres é por assinatura: errar o tipo
  // de um argumento faz o comando trancar uma função que não existe, em silêncio.
  const SO_PELO_SERVIDOR = [
    "public.club_close_due_cycles()",
    "public.club_close_cycle(UUID)",
    "public.club_get_or_create_active_cycle(UUID, UUID)",
    "public.club_resolve_price(UUID, UUID)",
    "public.club_recalculate_level(UUID, UUID)",
    "public.club_check_achievements(UUID, UUID)",
    "public.expire_stale_checkout_intents()",
  ];

  it.each(SO_PELO_SERVIDOR)("%s não é alcançável pela internet", (assinatura) => {
    expect(sql).toContain(
      `REVOKE ALL ON FUNCTION ${assinatura} FROM PUBLIC, anon, authenticated;`,
    );
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${assinatura} TO service_role;`);
  });

  it("as funções de gatilho do módulo também ficam fechadas", () => {
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.club_on_order_delivered() FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.club_audit_admin_change() FROM PUBLIC, anon, authenticated;",
    );
  });
});

describe("SEC-07 — a matrícula no clube confere quem chamou", () => {
  const fn = () => definicaoVigente("enroll_company_in_cents");

  it("continua alcançável pelo painel admin, que a chama pelo navegador", () => {
    // src/components/admin/dashboards/SubscriptionsDashboard.tsx chama por RPC.
    // Trancar para `authenticated` quebraria a troca de plano para CENTS.
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.enroll_company_in_cents(UUID, UUID) TO authenticated, service_role;",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.enroll_company_in_cents(UUID, UUID) FROM PUBLIC, anon;",
    );
  });

  it("por isso a conferência está DENTRO da função", () => {
    expect(fn()).toContain("public.is_admin()");
    expect(fn()).toContain("insufficient_privilege");
  });

  it("o cadastro de uma loja nova pelo servidor continua passando", () => {
    // src/routes/api/pizzerias.create.ts chama com a chave de serviço, sem
    // usuário logado — `auth.role()` vem nulo e precisa ser aceito.
    expect(fn()).toContain("coalesce(auth.role(), 'service_role') <> 'service_role'");
  });

  it("continua fazendo exatamente o que fazia antes", () => {
    expect(fn()).toContain("PERFORM public.club_get_or_create_active_cycle(p_company_id, p_club_id)");
    expect(fn()).toContain("PERFORM public.club_recalculate_level(p_company_id, p_club_id)");
  });
});

describe("SEC-17 — funções privilegiadas fixam onde procuram as tabelas", () => {
  const ASSINATURAS = [
    "public.get_admin_global_metrics()",
    "public.get_my_financial_metrics()",
    "public.get_pizzerias_ranking(integer)",
    "public.sync_order_to_table_session_logic(uuid)",
  ];

  it.each(ASSINATURAS)("%s tem search_path fixo", (assinatura) => {
    expect(sql).toContain(`ALTER FUNCTION ${assinatura} SET search_path = public;`);
  });

  it("get_dashboard_period_metrics tem search_path fixo", () => {
    // Assinatura longa demais para uma linha só; o arquivo a quebra em três.
    expect(sql).toMatch(
      /ALTER FUNCTION public\.get_dashboard_period_metrics\([\s\S]*?\) SET search_path = public;/,
    );
  });
});

describe("existe caminho de volta escrito para as duas etapas", () => {
  // Correção sem roteiro de reversão é correção que ninguém tem coragem de
  // aplicar numa sexta-feira.
  it.each([
    "20260901120000_trancar_coluna_is_admin",
    "20260901121000_trancar_funcoes_privilegiadas",
  ])("%s tem arquivo de desfazer", (nome) => {
    const roteiro = readFileSync(`supabase/rollback/${nome}.desfazer.sql`, "utf8");
    expect(roteiro).toContain("NÃO É UMA MIGRATION");
  });

  it("os roteiros de volta ficam FORA de supabase/migrations", () => {
    // Se caíssem lá dentro, o banco os aplicaria sozinho e desfaria a correção
    // no mesmo instante em que ela foi feita.
    const migrations = readdirSync(DIR);
    expect(migrations.filter((f) => f.includes("desfazer"))).toEqual([]);
  });
});
