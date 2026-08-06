/**
 * Ponte de tipos para as tabelas de cobrança.
 *
 * As tabelas criadas pelas migrations de cobrança ainda não estão em
 * `integrations/supabase/types.ts`, porque os tipos são gerados a partir do
 * banco e as migrations não foram aplicadas. Sem isso, o cliente tipado do
 * Supabase recusa `from("subscriptions")`.
 *
 * Em vez de espalhar `any`, o formato usado está declarado aqui. Quando os
 * tipos forem regerados, este módulo deixa de ser necessário e some junto com
 * os casts que o usam.
 */

export type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

/**
 * Construtor de consulta encadeável, modelado só até onde os módulos de
 * cobrança usam. `PromiseLike` permite `await` em qualquer ponto da cadeia,
 * que é como o cliente real se comporta.
 */
export type QueryBuilder = {
  select: (columns?: string, options?: { count?: "exact"; head?: boolean }) => QueryBuilder;
  insert: (values: unknown) => QueryBuilder;
  update: (values: unknown) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  neq: (column: string, value: unknown) => QueryBuilder;
  not: (column: string, operator: string, value: unknown) => QueryBuilder;
  maybeSingle: () => PromiseLike<QueryResult>;
} & PromiseLike<QueryResult>;

export type BillingDb = {
  from: (table: string) => QueryBuilder;
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<QueryResult>;
};

/** Converte um cliente Supabase real na visão restrita usada aqui. */
export function asBillingDb(client: unknown): BillingDb {
  return client as BillingDb;
}
