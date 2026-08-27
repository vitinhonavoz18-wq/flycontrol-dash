import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * A única porta entre o código do Marketing e as tabelas novas.
 *
 * POR QUE ISTO EXISTE (E QUANDO SOME)
 *
 * O arquivo `integrations/supabase/types.ts` é gerado automaticamente a
 * partir do banco de verdade. Ele lista as tabelas que existiam no dia em que
 * foi gerado — e as tabelas de marketing são novas, então ele ainda não sabe
 * que elas existem. É como uma planta da casa desenhada antes do puxadinho.
 *
 * Depois que a migration for aplicada em produção e alguém regerar esse
 * arquivo, este atalho deixa de ser necessário e este arquivo pode ser
 * apagado, trocando `mkt("x")` por `supabaseAdmin.from("x")`.
 *
 * Concentrar o atalho aqui, em vez de espalhar pelo código, é o que garante
 * que essa limpeza seja um passo só — e que ninguém use o atalho para
 * escapar da conferência de dono, que continua acontecendo antes.
 *
 * ATENÇÃO: este cliente usa a chave de serviço e IGNORA as regras de acesso
 * do banco. Nunca chame nada daqui sem antes ter passado por
 * `assertOwnsTenant`, e sempre amarre a consulta ao tenant conferido.
 */

export type TabelaMarketing =
  | "marketing_customers"
  | "marketing_campaigns"
  | "marketing_campaign_recipients"
  | "marketing_templates"
  | "marketing_whatsapp_instances"
  | "marketing_events"
  | "marketing_usage";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mkt(tabela: TabelaMarketing): any {
  return (supabaseAdmin as any).from(tabela);
}

/** Funções do banco do módulo, pelo mesmo motivo. */
export function mktRpc(nome: string, args: Record<string, unknown>): any {
  return (supabaseAdmin as any).rpc(nome, args);
}
