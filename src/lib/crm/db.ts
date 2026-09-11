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
  | "crm_contacts"
  | "crm_conversations"
  | "crm_messages"
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
