/**
 * Banco falso, em memória, com o formato de `BillingDb` (ver
 * lib/billing/supabaseBridge.ts). Serve para testar os fluxos de cobrança no
 * servidor sem Supabase e sem InfinityPay de verdade.
 *
 * Suporta o que os módulos de cobrança usam: select / insert / update com
 * eq, neq, in, gt, gte, lt, lte, order, limit e maybeSingle; e `rpc` com
 * respostas configuráveis. Embeds (ex.: `plans(code)`) não são resolvidos —
 * o teste grava o objeto embutido direto na linha.
 *
 * Todo update condicionado (`.eq("status", x)`) só pega linhas que ainda
 * casam com o filtro — é o mesmo comportamento que o banco real dá às
 * "reivindicações" que impedem processamento duplicado.
 */

import type { BillingDb, QueryBuilder, QueryResult } from "@/lib/billing/supabaseBridge";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export type FakeDb = BillingDb & {
  tables: Record<string, Row[]>;
  rpcCalls: Array<{ fn: string; args?: Record<string, unknown> }>;
  /** Respostas de rpc por nome de função. */
  rpcHandlers: Record<string, (args?: Record<string, unknown>) => QueryResult>;
  /** Força erro na próxima operação de uma tabela. */
  failNext: Record<string, { message: string; code?: string }>;
};

export function createFakeDb(seed: Record<string, Row[]> = {}): FakeDb {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((r) => ({ ...r }));

  const db: FakeDb = {
    tables,
    rpcCalls: [],
    rpcHandlers: {},
    failNext: {},
    from(table: string) {
      return builder(db, table);
    },
    rpc(fn: string, args?: Record<string, unknown>) {
      db.rpcCalls.push({ fn, args });
      const handler = db.rpcHandlers[fn];
      return Promise.resolve(handler ? handler(args) : { data: null, error: null });
    },
  };
  return db;
}

function builder(db: FakeDb, table: string): QueryBuilder {
  const filters: Filter[] = [];
  let op: "select" | "insert" | "update" = "select";
  let payload: unknown = null;
  let returning = false;
  let orderBy: { col: string; asc: boolean } | null = null;
  let max: number | null = null;
  let headCount = false;

  const rows = () => (db.tables[table] ??= []);

  const run = (single: boolean): QueryResult => {
    const forced = db.failNext[table];
    if (forced) {
      delete db.failNext[table];
      return { data: null, error: forced };
    }

    if (op === "insert") {
      const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
      const inserted = list.map((r) => ({
        id: (r.id as string) ?? crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...r,
      }));
      rows().push(...inserted);
      if (!returning) return { data: null, error: null };
      return { data: single ? (inserted[0] ?? null) : inserted, error: null };
    }

    let matched = rows().filter((r) => filters.every((f) => f(r)));

    if (op === "update") {
      for (const r of matched) Object.assign(r, payload as Row);
      if (!returning) return { data: null, error: null };
      const copies = matched.map((r) => structuredClone(r));
      return { data: single ? (copies[0] ?? null) : copies, error: null };
    }

    if (orderBy) {
      const { col, asc } = orderBy;
      matched = [...matched].sort((a, b) =>
        String(a[col] ?? "") < String(b[col] ?? "") ? (asc ? -1 : 1) : asc ? 1 : -1,
      );
    }
    if (max !== null) matched = matched.slice(0, max);
    // Cópias, como um banco de verdade: quem leu não enxerga gravações
    // posteriores pela mesma referência.
    matched = matched.map((r) => structuredClone(r));
    if (headCount) return { data: null, error: null, count: matched.length };
    if (single) {
      if (matched.length > 1) {
        return { data: null, error: { message: "multiple rows returned", code: "PGRST116" } };
      }
      return { data: matched[0] ?? null, error: null };
    }
    return { data: matched, error: null };
  };

  const b: QueryBuilder = {
    select(_columns?: string, options?: { count?: "exact"; head?: boolean }) {
      if (op === "select") headCount = !!options?.head;
      else returning = true;
      return b;
    },
    insert(values: unknown) {
      op = "insert";
      payload = values;
      return b;
    },
    update(values: unknown) {
      op = "update";
      payload = values;
      return b;
    },
    eq(col, value) {
      filters.push((r) => r[col] === value);
      return b;
    },
    neq(col, value) {
      filters.push((r) => r[col] !== value);
      return b;
    },
    in(col, values) {
      filters.push((r) => values.includes(r[col]));
      return b;
    },
    gt(col, value) {
      filters.push((r) => (r[col] as never) > (value as never));
      return b;
    },
    gte(col, value) {
      filters.push((r) => (r[col] as never) >= (value as never));
      return b;
    },
    lt(col, value) {
      filters.push((r) => (r[col] as never) < (value as never));
      return b;
    },
    lte(col, value) {
      filters.push((r) => (r[col] as never) <= (value as never));
      return b;
    },
    not() {
      return b;
    },
    order(col, options) {
      orderBy = { col, asc: options?.ascending ?? true };
      return b;
    },
    limit(count) {
      max = count;
      return b;
    },
    maybeSingle() {
      return Promise.resolve(run(true));
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(run(false)).then(onFulfilled, onRejected);
    },
  };
  return b;
}
