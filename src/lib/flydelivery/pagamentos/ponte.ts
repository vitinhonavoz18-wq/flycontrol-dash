/**
 * Ponte de tipos para as tabelas e funções do Pix do FlyDelivery.
 *
 * As tabelas criadas pela migração do Pix ainda não estão em
 * `integrations/supabase/types.ts` (os tipos são gerados a partir do banco, e
 * a migração ainda não foi aplicada). Mesmo desenho de
 * `lib/billing/supabaseBridge.ts`: em vez de espalhar `any`, o formato usado
 * está declarado aqui. Quando os tipos forem regerados, este arquivo some.
 */

export type ResultadoDaConsulta = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

export type Consulta = {
  select: (colunas?: string) => Consulta;
  eq: (coluna: string, valor: unknown) => Consulta;
  in: (coluna: string, valores: unknown[]) => Consulta;
  not: (coluna: string, operador: string, valor: unknown) => Consulta;
  lt: (coluna: string, valor: unknown) => Consulta;
  gte: (coluna: string, valor: unknown) => Consulta;
  or: (filtro: string) => Consulta;
  order: (coluna: string, opcoes?: { ascending?: boolean }) => Consulta;
  limit: (n: number) => Consulta;
  maybeSingle: () => PromiseLike<ResultadoDaConsulta>;
} & PromiseLike<ResultadoDaConsulta>;

export type BancoSemTipos = {
  from: (tabela: string) => Consulta;
  rpc: (funcao: string, args?: Record<string, unknown>) => PromiseLike<ResultadoDaConsulta>;
};

export function semTipos(cliente: unknown): BancoSemTipos {
  return cliente as BancoSemTipos;
}
