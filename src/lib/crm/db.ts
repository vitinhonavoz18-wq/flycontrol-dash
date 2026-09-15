import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * A única porta entre o código do Chat e as tabelas novas.
 *
 * Mesma situação já explicada em `lib/marketing/db.ts`: o arquivo de tipos do
 * banco é gerado automaticamente e ainda não conhece as tabelas do CRM — é a
 * planta da casa desenhada antes do puxadinho. Depois que a migração rodar em
 * produção e alguém regerar esse arquivo, este atalho pode ser apagado.
 *
 * ATENÇÃO: este cliente usa a chave de serviço e IGNORA as regras de acesso
 * do banco. Nunca chame nada daqui sem antes ter passado por
 * `assertOwnsTenantWithAddon`, e sempre amarre a consulta ao tenant
 * conferido. A chave de serviço é a chave mestra do prédio: quem a usa tem de
 * conferir o nome na portaria por conta própria, porque o elevador não vai
 * conferir por ele.
 */

export type TabelaCrm =
  | "company_addons"
  | "crm_n8n_links"
  // A ficha do cliente é UMA só: a mesma tabela que o Marketing usa. Quem
  // conversou pelo WhatsApp e quem pediu pelo site são a mesma pessoa, e
  // manter duas fichas era descobrir no fim do mês que o "Seu João" do
  // delivery e o do balcão eram o mesmo Seu João.
  | "marketing_customers"
  | "crm_conversations"
  | "crm_messages"
  // O rascunho de pedido que a IA monta e o lojista confirma.
  | "crm_order_drafts"
  // As taxas de entrega por bairro, que a IA consulta antes de prometer preço.
  | "delivery_zones"
  // O pedido de verdade, criado quando o lojista confirma o rascunho.
  | "orders"
  // O cofre do token do aparelho de WhatsApp. Fica nesta lista porque a fila
  // de saída precisa entregar a credencial ao fluxo do n8n.
  | "whatsapp_instance_secrets";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function crm(tabela: TabelaCrm): any {
  return (supabaseAdmin as any).from(tabela);
}

/** Funções do banco do módulo, pelo mesmo motivo. */
export function crmRpc(nome: string, args: Record<string, unknown>): any {
  return (supabaseAdmin as any).rpc(nome, args);
}
