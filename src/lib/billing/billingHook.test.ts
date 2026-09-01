import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BILLABLE_STATUSES, usageIdempotencyKey } from "./billingEngine";

/**
 * A definição de pedido faturável existe em dois lugares por necessidade: em
 * SQL, porque o trigger é o único ponto que nenhum caminho de escrita
 * contorna; e em TypeScript, porque a interface precisa estimar o consumo do
 * ciclo sem consultar o banco.
 *
 * Duas cópias divergindo cobrariam errado em silêncio. Estes testes leem a
 * migration e comparam, para a divergência quebrar a suíte.
 *
 * As migrations aparecem aqui na ordem em que o banco as aplica.
 *
 * Uma função pode ser redefinida depois. Ler só a primeira versão testaria um
 * texto que o banco já substituiu — como conferir o cardápio do ano passado
 * para saber o preço de hoje. Por isso lemos todas e, quando houver mais de
 * uma definição da mesma função, vale a ÚLTIMA.
 */
const MIGRATION_PATHS = [
  "DATABASE/supabase/migrations/20260806140000_billing_usage_hook.sql",
  "DATABASE/supabase/migrations/20260828120000_pedido_restaurado_volta_a_contar.sql",
];
const sql = MIGRATION_PATHS.map((p) => readFileSync(p, "utf8")).join("\n");

/** A definição que realmente vale de uma função: a última escrita. */
function definicaoVigente(nome: string): string {
  const todas = [
    ...sql.matchAll(
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${nome}[\\s\\S]*?\\$\\$;`, "g"),
    ),
  ];
  expect(todas.length, `função ${nome} não encontrada nas migrations`).toBeGreaterThan(0);
  return todas[todas.length - 1][0];
}

/** Extrai os literais da lista `IN (...)` de is_billable_order_status. */
function extractSqlBillableStatuses(): string[] {
  const fn = definicaoVigente("is_billable_order_status");

  const list = fn.match(/IN\s*\(([\s\S]*?)\)/);
  expect(list, "lista IN (...) não encontrada").not.toBeNull();

  return [...list![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe("paridade entre a regra em SQL e a em TypeScript", () => {
  it("usa exatamente os mesmos status faturáveis", () => {
    const fromSql = extractSqlBillableStatuses().sort();
    const fromTs = [...BILLABLE_STATUSES].sort();
    expect(fromSql).toEqual(fromTs);
  });

  it("não inclui `novo` em nenhum dos dois lados", () => {
    // Um pedido recém-chegado ainda pode ser recusado. Cobrar por ele seria
    // cobrar por algo que não virou operação.
    expect(extractSqlBillableStatuses()).not.toContain("novo");
    expect(BILLABLE_STATUSES.has("novo")).toBe(false);
  });

  it("monta a chave de idempotência com o mesmo formato dos dois lados", () => {
    const tsKey = usageIdempotencyKey("CYCLE", "ORDER");
    expect(tsKey).toBe("order_billable:CYCLE:ORDER");
    // No SQL: 'order_billable:' || v_cycle.id || ':' || NEW.id
    expect(sql).toContain("'order_billable:' || v_cycle.id || ':' || NEW.id");
  });
});

describe("garantias estruturais do gancho", () => {
  it("dispara em INSERT e em mudança de status", () => {
    // Um pedido pode nascer já em `preparando` quando vem por integração.
    expect(sql).toMatch(/AFTER INSERT OR UPDATE OF status ON public\.orders/);
  });

  it("nunca derruba a operação do restaurante", () => {
    // Sem o EXCEPTION, uma falha de cobrança abortaria o UPDATE do pedido.
    const fn = definicaoVigente("record_order_usage");
    expect(fn).toContain("EXCEPTION WHEN OTHERS THEN");
    expect(fn).toMatch(/RAISE WARNING/);
    // O caminho de exceção devolve NEW: o pedido segue gravado.
    expect(fn.slice(fn.indexOf("EXCEPTION WHEN OTHERS"))).toContain("RETURN NEW");
  });

  it("só incrementa o contador quando o evento foi de fato inserido", () => {
    // ON CONFLICT DO NOTHING + ROW_COUNT é o que impede contagem dupla ao
    // reprocessar o mesmo pedido.
    expect(sql).toContain("ON CONFLICT (idempotency_key) DO NOTHING");
    expect(sql).toContain("GET DIAGNOSTICS v_inserted = ROW_COUNT");
    expect(sql).toMatch(/IF v_inserted > 0 THEN[\s\S]*?billable_order_count \+ 1/);
  });

  it("estorna em vez de apagar o evento original", () => {
    expect(sql).toContain("'order_reversal'");
    // Quantidade negativa: a soma dos eventos continua sendo a verdade.
    expect(sql).toMatch(/'order_reversal', -1/);
    expect(sql).not.toMatch(/DELETE FROM public\.usage_events/);
  });

  it("não deixa o contador ficar negativo", () => {
    expect(sql).toMatch(/GREATEST\(billable_order_count - 1, 0\)/);
  });

  it("volta a cobrar um pedido restaurado, com etiqueta nova", () => {
    // Sem o sufixo de "2ª via", a nova cobrança tentaria a mesma etiqueta do
    // primeiro lançamento, bateria no ON CONFLICT e o pedido restaurado
    // ficaria de graça para sempre.
    const fn = definicaoVigente("record_order_usage");
    expect(fn).toMatch(/v_key := v_key \|\| ':' \|\| v_reversals/);
    // A contagem de idas e voltas sai do próprio caderno de eventos.
    expect(fn).toMatch(/COUNT\(\*\) FILTER \(WHERE event_type = 'order_reversal'\)/);
  });

  it("confere o saldo do pedido antes de cobrar ou estornar", () => {
    // É a trava contra dois avisos no mesmo instante: nenhum pedido é cobrado
    // duas vezes nem estornado duas vezes, mesmo que a etiqueta fosse igual.
    const fn = definicaoVigente("record_order_usage");
    expect(fn).toMatch(/COALESCE\(SUM\(quantity\), 0\)/);
    expect(fn).toMatch(/IF v_saldo > 0 THEN\s*\n\s*RETURN NEW;/);
  });

  it("ignora planos de mensalidade fixa", () => {
    // No PREMIUM o pedido é métrica, não faturamento.
    expect(sql).toContain("s.billing_model = 'usage_per_order'");
  });

  it("só lança em assinatura viva", () => {
    expect(sql).toMatch(/s\.status IN \('active', 'past_due'\)/);
  });

  it("não abre ciclo por efeito colateral de um pedido", () => {
    // Abrir ciclo é decisão de ativação/fechamento. Criar um a partir de um
    // pedido geraria ciclo com data de início errada.
    const fn = definicaoVigente("record_order_usage");
    expect(fn).not.toContain("open_billing_cycle");
    expect(fn).not.toMatch(/INSERT INTO public\.billing_cycles/);
  });

  it("roda com privilégios próprios, já que o cliente não escreve em usage_events", () => {
    const fn = definicaoVigente("record_order_usage");
    expect(fn).toContain("SECURITY DEFINER");
    expect(fn).toContain("SET search_path = public");
  });

  it("abre ciclo de forma idempotente", () => {
    const fn = definicaoVigente("open_billing_cycle");
    // Já existe ciclo aberto? Devolve o existente em vez de criar o segundo.
    expect(fn).toMatch(/IF v_existing IS NOT NULL THEN[\s\S]*?RETURN v_existing/);
  });

  it("trata o dia âncora inexistente no mês seguinte, como o TypeScript", () => {
    const fn = definicaoVigente("open_billing_cycle");
    expect(fn).toContain("v_anchor_day > v_days_next_month");
  });
});
