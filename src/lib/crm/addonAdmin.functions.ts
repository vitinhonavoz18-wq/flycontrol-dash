import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { crm } from "./db";

/* As tabelas do CRM ainda não constam do arquivo de tipos gerado (ver `db.ts`). */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Ligar e desligar o Chat de um cliente — as operações do SUPORTE.
 *
 * Sem esta tela, toda venda do CRM exigiria alguém mexer no banco na mão. É a
 * diferença entre ter a chave da sala nova no bolso e precisar chamar o
 * chaveiro toda vez que alguém aluga.
 *
 * TODAS as funções daqui são restritas ao administrador da plataforma. Ligar
 * o próprio recurso seria o cliente carimbando o próprio cartão fidelidade.
 */

const ADDON = "crm_chat";

async function exigirAdmin(supabase: any) {
  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error) throw new Error("Não foi possível verificar suas permissões.");
  if (!isAdmin) throw new Error("Esta ação é restrita a administradores da plataforma.");
}

/**
 * Sorteia a senha daquela loja.
 *
 * Aleatória de verdade (não é a hora nem o nome da loja embaralhado): quem
 * conhece o padrão não consegue adivinhar a senha das outras. São 32 bytes —
 * chutar uma por uma levaria mais tempo do que o universo tem.
 */
function sortearSenha(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type SituacaoChatDaLoja = {
  tenantId: string;
  contratado: boolean;
  desde: string | null;
  fluxoConfigurado: boolean;
  fluxoStatus: string | null;
  workflowName: string | null;
  /** Se o endereço de entrada já foi cadastrado. Sem ele, o Chat fica mudo. */
  temEnderecoDeEntrada: boolean;
  ultimoSinal: string | null;
};

/** A situação do Chat de todas as lojas, para a tela do admin. */
export const situacaoChatDasLojas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantIds?: string[] } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase);

    let qAddons = crm("company_addons")
      .select("tenant_id, status, activated_at")
      .eq("addon", ADDON);
    let qLinks = crm("crm_n8n_links").select("tenant_id, status, workflow_name, last_seen_at");

    if (data.tenantIds?.length) {
      qAddons = qAddons.in("tenant_id", data.tenantIds);
      qLinks = qLinks.in("tenant_id", data.tenantIds);
    }

    const [{ data: addons, error: e1 }, { data: links, error: e2 }] = await Promise.all([
      qAddons,
      qLinks,
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);

    const porLoja = new Map<string, SituacaoChatDaLoja>();

    for (const a of (addons ?? []) as any[]) {
      porLoja.set(a.tenant_id, {
        tenantId: a.tenant_id,
        contratado: a.status === "active",
        desde: a.activated_at ?? null,
        fluxoConfigurado: false,
        fluxoStatus: null,
        workflowName: null,
        temEnderecoDeEntrada: false,
        ultimoSinal: null,
      });
    }

    for (const l of (links ?? []) as any[]) {
      const atual = porLoja.get(l.tenant_id) ?? {
        tenantId: l.tenant_id,
        contratado: false,
        desde: null,
        fluxoConfigurado: false,
        fluxoStatus: null,
        workflowName: null,
        temEnderecoDeEntrada: false,
        ultimoSinal: null,
      };
      atual.fluxoConfigurado = true;
      atual.temEnderecoDeEntrada = Boolean(l.inbound_webhook_url);
      atual.fluxoStatus = l.status ?? null;
      atual.workflowName = l.workflow_name ?? null;
      atual.ultimoSinal = l.last_seen_at ?? null;
      porLoja.set(l.tenant_id, atual);
    }

    return { lojas: Array.from(porLoja.values()) };
  });

/**
 * Ligar ou desligar o Chat de uma loja.
 *
 * DESLIGAR NÃO APAGA NADA. A ficha vira "suspensa", o fluxo do n8n é PAUSADO,
 * e as conversas continuam guardadas exatamente onde estão. Se o cliente
 * voltar em três meses, o histórico está inteiro — como guardar as comandas
 * antigas na gaveta em vez de rasgar.
 *
 * Apagar conversa de cliente é decisão séria demais para acontecer de
 * carona num cancelamento de plano.
 */
export const definirChatDaLoja = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; ativo: boolean; notas?: string }) => {
    if (!d?.tenantId) throw new Error("Loja não informada.");
    return d;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase);

    const agora = new Date().toISOString();

    const { error } = await crm("company_addons").upsert(
      {
        tenant_id: data.tenantId,
        addon: ADDON,
        status: data.ativo ? "active" : "suspended",
        activated_at: agora,
        suspended_at: data.ativo ? null : agora,
        changed_by: context.userId,
        notes: data.notas ?? null,
        updated_at: agora,
      },
      { onConflict: "tenant_id,addon" },
    );

    if (error) throw new Error(error.message);

    // O fluxo acompanha: desligar o recurso pausa o fluxo, religar reativa.
    // Sem isso, uma loja cancelada continuaria com o fluxo de pé lá no n8n
    // tentando entregar mensagens que o sistema já recusa.
    const { data: link } = await crm("crm_n8n_links")
      .select("tenant_id")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();

    if (link) {
      await crm("crm_n8n_links")
        .update({ status: data.ativo ? "active" : "paused", updated_at: agora })
        .eq("tenant_id", data.tenantId);
    }

    return { ok: true, ativo: data.ativo };
  });

/**
 * Guardar qual fluxo do n8n é desta loja e sortear a senha dela.
 *
 * A SENHA APARECE UMA VEZ SÓ, aqui na resposta. Ela não é mostrada de novo
 * depois, nem para você: é a mesma ideia da senha do banco, que você anota na
 * hora em que é criada. Se perder, gere outra — a antiga para de valer na
 * hora, então o fluxo do n8n precisa ser atualizado com a nova.
 */
export const configurarFluxoN8n = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      tenantId: string;
      workflowId?: string;
      workflowName?: string;
      inboundWebhookUrl?: string;
      gerarNovaSenha?: boolean;
    }) => {
      if (!d?.tenantId) throw new Error("Loja não informada.");
      const url = (d.inboundWebhookUrl ?? "").trim();
      if (url) {
        // Endereço torto aqui não dá erro na hora: dá um restaurante mudo
        // semanas depois, sem ninguém entender por quê. Melhor recusar agora.
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          throw new Error("Endereço do fluxo inválido. Precisa começar com https://");
        }
        if (parsed.protocol !== "https:") {
          throw new Error("O endereço do fluxo precisa ser https.");
        }
      }
      return d;
    },
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase);

    const agora = new Date().toISOString();

    const { data: existente } = await crm("crm_n8n_links")
      .select("tenant_id, webhook_token")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();

    const precisaDeSenha = !existente?.webhook_token || data.gerarNovaSenha === true;
    const senha = precisaDeSenha ? sortearSenha() : null;

    const linha: Record<string, unknown> = {
      tenant_id: data.tenantId,
      workflow_id: data.workflowId ?? null,
      workflow_name: data.workflowName ?? null,
      status: "active",
      updated_at: agora,
    };
    // O endereço para onde a UAZAPI deve avisar "chegou mensagem". É ele que
    // o sistema reaponta sozinho toda vez que o lojista lê o QR Code.
    const url = (data.inboundWebhookUrl ?? "").trim();
    if (url) linha.inbound_webhook_url = url;
    if (senha) linha.webhook_token = senha;

    const { error } = await crm("crm_n8n_links").upsert(linha, { onConflict: "tenant_id" });
    if (error) throw new Error(error.message);

    return {
      ok: true,
      // `null` quando a senha antiga foi mantida: não temos como mostrá-la de
      // novo, e fingir que temos seria pior.
      senha,
    };
  });
