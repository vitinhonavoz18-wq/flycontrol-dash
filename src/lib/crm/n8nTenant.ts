import { crm } from "./db";
import { comparaSemVazar } from "./n8nAuth";

/**
 * A segunda conferência: a senha DAQUELA loja.
 *
 * A chave mestra (CRM_N8N_SECRET) só diz "quem está batendo é o n8n". Ela não
 * diz DE QUAL LOJA. É esta função que amarra a chamada a um restaurante
 * específico — sem ela, o fluxo da pizzaria A conseguiria pedir as conversas
 * da pizzaria B trocando um número no corpo da mensagem.
 *
 * E confere ainda uma terceira coisa: se a loja continua com o Chat
 * contratado. Quem cancelou para de receber e de enviar na hora, sem precisar
 * ninguém lembrar de desligar o fluxo lá no n8n.
 */

export type ResultadoLoja =
  { ok: true; tenantId: string } | { ok: false; status: number; erro: string };

/**
 * POR QUE AQUI O ERRO PODE SER ESPECÍFICO
 *
 * Só chega nesta função quem já passou pela chave mestra. Ou seja: quem está
 * batendo já provou que é o n8n do FlyControl, não um estranho. Dizer para ele
 * "a senha da loja é que está errada" não entrega nada a ninguém de fora — é
 * como o porteiro, depois de conferir o crachá de funcionário, poder dizer
 * "seu crachá está certo, mas essa chave não é a da sala 12".
 *
 * Quando os dois erros eram a mesma frase, ninguém conseguia saber QUAL das
 * duas chaves estava errada, e a procura virava adivinhação.
 */
export const ERRO_SENHA_DA_LOJA = "senha_da_loja_invalida";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function autenticarLoja(entrada: Record<string, unknown>): Promise<ResultadoLoja> {
  const tenantId = String(entrada.tenant_id ?? entrada.tenantId ?? "").trim();
  const token = String(entrada.token ?? entrada.webhook_token ?? "").trim();

  if (!tenantId || !token) return { ok: false, status: 401, erro: ERRO_SENHA_DA_LOJA };

  const { data, error } = await crm("crm_n8n_links")
    .select("tenant_id, webhook_token, status")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  // Erro de banco não libera ninguém: uma consulta que falhou não é prova de
  // que a senha estava certa.
  if (error) return { ok: false, status: 503, erro: "indisponivel" };
  if (!data || !data.webhook_token) return { ok: false, status: 401, erro: ERRO_SENHA_DA_LOJA };

  if (!comparaSemVazar(token, String(data.webhook_token))) {
    return { ok: false, status: 401, erro: ERRO_SENHA_DA_LOJA };
  }

  // Fluxo pausado (downgrade, cancelamento, manutenção) não entrega nem
  // recebe nada — mas continua existindo, com todo o histórico.
  if (data.status === "paused") return { ok: false, status: 409, erro: "fluxo_pausado" };

  // A contratação também é conferida, e no banco, não aqui: quem cancelou
  // para de funcionar na hora.
  const { data: liberado, error: erroAddon } = await (crm("company_addons") as any)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("addon", "crm_chat")
    .eq("status", "active")
    .limit(1);

  if (erroAddon) return { ok: false, status: 503, erro: "indisponivel" };
  if (!liberado || liberado.length === 0) {
    return { ok: false, status: 409, erro: "crm_nao_contratado" };
  }

  return { ok: true, tenantId: String(data.tenant_id) };
}
