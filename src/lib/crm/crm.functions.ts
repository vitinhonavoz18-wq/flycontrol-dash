import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { crm } from "./db";
import { assertOwnsTenantWithAddon } from "@/lib/server/plan-guard";
import { normalizePhone } from "@/lib/marketing/phone";

/* As tabelas do CRM ainda não constam do arquivo de tipos gerado (ver
   `db.ts`), então as linhas chegam sem tipo. Depois de regerar os tipos,
   estas anotações viram tipos de verdade. */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * As operações do Chat (CRM).
 *
 * TRÊS REGRAS QUE VALEM PARA TODAS AS FUNÇÕES DESTE ARQUIVO
 *
 * 1. A loja NUNCA vem do navegador como verdade. O `tenantId` que chega é um
 *    pedido, e `assertOwnsTenantWithAddon` confere dono, plano e contratação
 *    antes de qualquer coisa. É o porteiro conferindo o nome na lista em vez
 *    de aceitar quem diz "pode deixar, eu sou convidado".
 *
 * 2. Toda consulta entra amarrada ao `tenantId` CONFERIDO — nunca ao que veio
 *    na requisição. Isso é o que garante que um restaurante jamais leia a
 *    conversa do vizinho, mesmo que mande o número da conversa dele de
 *    propósito.
 *
 * 3. Quem grava é o servidor, com a chave de serviço, DEPOIS da conferência.
 */

const TAMANHO_PAGINA_MAX = 100;
const ADDON = "crm_chat" as const;

/** O porteiro, escrito uma vez só. */
async function porteiro(context: any, tenantId: string) {
  return assertOwnsTenantWithAddon(context.supabase, context.userId, tenantId, "chat", ADDON);
}

export type ConversaCrm = {
  id: string;
  contact_id: string;
  status: "open" | "pending" | "closed";
  assigned_to: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  contato: { id: string; name: string | null; phone_e164: string } | null;
};

/**
 * A lista da esquerda da tela: quem falou com o restaurante, mais recente em
 * cima. Conversa sem mensagem nenhuma fica no fim — não some, mas também não
 * ocupa o topo por ter sido criada agora.
 */
export const listarConversas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      tenantId: string;
      busca?: string;
      status?: "open" | "pending" | "closed" | "todas";
      pagina?: number;
      porPagina?: number;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await porteiro(context, data.tenantId);

    const porPagina = Math.min(Math.max(data.porPagina ?? 30, 1), TAMANHO_PAGINA_MAX);
    const pagina = Math.max(data.pagina ?? 1, 1);
    const de = (pagina - 1) * porPagina;

    let q = crm("crm_conversations")
      .select(
        "id, contact_id, status, assigned_to, last_message_at, last_message_preview, unread_count, " +
          "contato:crm_contacts!crm_conversations_contact_id_fkey(id, name, phone_e164)",
        { count: "exact" },
      )
      .eq("tenant_id", tenantId);

    if (data.status && data.status !== "todas") q = q.eq("status", data.status);

    const {
      data: linhas,
      error,
      count,
    } = await q
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .range(de, de + porPagina - 1);

    if (error) throw new Error(error.message);

    let conversas = (linhas ?? []) as ConversaCrm[];

    // A busca por nome/telefone é feita aqui em cima, e não no banco, porque
    // o nome mora na tabela do contato. Para as listas de hoje (dezenas de
    // conversas por página) isso é de graça. Se um dia uma loja tiver
    // milhares, vira uma busca no banco de verdade.
    const busca = (data.busca ?? "").trim().toLowerCase();
    if (busca) {
      const digitos = busca.replace(/[^0-9]/g, "");
      conversas = conversas.filter(
        (c) =>
          (c.contato?.name ?? "").toLowerCase().includes(busca) ||
          (digitos.length >= 3 && (c.contato?.phone_e164 ?? "").includes(digitos)),
      );
    }

    return { conversas, total: count ?? conversas.length, pagina, porPagina };
  });

export type MensagemCrm = {
  id: string;
  direction: "in" | "out";
  body: string | null;
  media_url: string | null;
  media_type: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

/**
 * As mensagens de uma conversa.
 *
 * O `tenant_id` entra na consulta MESMO com o número da conversa em mãos. Sem
 * isso, mandar o número de uma conversa alheia devolveria a conversa alheia —
 * o equivalente a entregar a comanda da mesa 5 para quem só sabe dizer "5".
 */
export const listarMensagens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; conversationId: string; limite?: number }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await porteiro(context, data.tenantId);
    if (!data.conversationId) throw new Error("Conversa não informada.");

    const limite = Math.min(Math.max(data.limite ?? 100, 1), 300);

    const { data: linhas, error } = await crm("crm_messages")
      .select("id, direction, body, media_url, media_type, status, error_message, created_at")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: false })
      .limit(limite);

    if (error) throw new Error(error.message);

    // Vêm do banco do mais novo para o mais velho (é o que o índice faz
    // rápido) e a tela lê de cima para baixo. A inversão acontece aqui.
    return { mensagens: ((linhas ?? []) as MensagemCrm[]).slice().reverse() };
  });

/**
 * O restaurante responde.
 *
 * A mensagem NÃO é enviada aqui: ela entra na fila e o n8n vem buscar. Quem
 * clicou em enviar não fica com a tela travada esperando o WhatsApp responder,
 * e se o n8n estiver fora do ar a mensagem espera na fila em vez de se perder.
 * É deixar o pedido pronto no balcão para o entregador levar.
 */
export const enviarMensagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; conversationId: string; texto: string }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await porteiro(context, data.tenantId);

    const texto = (data.texto ?? "").trim();
    if (!texto) throw new Error("Escreva a mensagem antes de enviar.");
    if (texto.length > 4096) throw new Error("Mensagem muito longa (máximo de 4096 caracteres).");

    const { data: conversa, error: erroConversa } = await crm("crm_conversations")
      .select("id")
      .eq("id", data.conversationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (erroConversa) throw new Error(erroConversa.message);
    if (!conversa) throw new Error("Conversa não encontrada.");

    const { data: criada, error } = await crm("crm_messages")
      .insert({
        tenant_id: tenantId,
        conversation_id: conversa.id,
        direction: "out",
        body: texto,
        status: "queued",
        sent_by: context.userId,
      })
      .select("id, direction, body, media_url, media_type, status, error_message, created_at")
      .single();

    if (error) throw new Error(error.message);

    // Responder também significa "eu vi": zera a bolinha de não lidas e tira
    // a conversa do estado fechado.
    await crm("crm_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: texto.slice(0, 140),
        unread_count: 0,
        status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversa.id)
      .eq("tenant_id", tenantId);

    return { mensagem: criada as MensagemCrm };
  });

/** Abrir a conversa apaga a bolinha de não lidas. */
export const marcarComoLida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; conversationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await porteiro(context, data.tenantId);

    const { error } = await crm("crm_conversations")
      .update({ unread_count: 0, updated_at: new Date().toISOString() })
      .eq("id", data.conversationId)
      .eq("tenant_id", tenantId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Marcar a conversa como resolvida (ou reabrir). */
export const alterarStatusConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { tenantId: string; conversationId: string; status: "open" | "pending" | "closed" }) => {
      if (!["open", "pending", "closed"].includes(d?.status)) throw new Error("Status inválido.");
      return d;
    },
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await porteiro(context, data.tenantId);

    const { error } = await crm("crm_conversations")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.conversationId)
      .eq("tenant_id", tenantId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Começar uma conversa do zero, digitando o telefone.
 *
 * O telefone passa pela MESMA normalização do Marketing. Sem isso,
 * "(71) 99999-9999" e "71999999999" viram dois contatos diferentes — o mesmo
 * cliente em duas fichas, cada uma com metade do histórico.
 */
export const iniciarConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; telefone: string; nome?: string }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await porteiro(context, data.tenantId);

    const telefone = normalizePhone(data.telefone);
    if (!telefone) throw new Error("Telefone inválido. Use DDD + número.");
    if (!telefone.isMobile) {
      throw new Error("Só celular recebe WhatsApp. Confira o número.");
    }

    const nome = (data.nome ?? "").trim() || null;

    const { data: contato, error: erroContato } = await crm("crm_contacts")
      .upsert(
        { tenant_id: tenantId, phone_e164: telefone.e164, name: nome },
        { onConflict: "tenant_id,phone_e164" },
      )
      .select("id")
      .single();

    if (erroContato) throw new Error(erroContato.message);

    const { data: conversa, error: erroConversa } = await crm("crm_conversations")
      .upsert(
        { tenant_id: tenantId, contact_id: contato.id, status: "open" },
        { onConflict: "tenant_id,contact_id" },
      )
      .select("id")
      .single();

    if (erroConversa) throw new Error(erroConversa.message);

    return { conversationId: conversa.id as string };
  });

/**
 * "O WhatsApp está no ar?"
 *
 * A resposta vem de quando o n8n deu sinal de vida pela última vez. Com isso
 * a tela consegue avisar "faz 3 horas que não conseguimos falar com o
 * WhatsApp" em vez de deixar o lojista mandando mensagem no vazio a manhã
 * inteira, achando que está tudo certo.
 */
export const statusDaIntegracao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await porteiro(context, data.tenantId);

    const { data: link, error } = await crm("crm_n8n_links")
      .select("status, last_seen_at, last_error, workflow_name")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    const naFila = await crm("crm_messages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("direction", "out")
      .in("status", ["queued", "sending"]);

    return {
      // Sem fluxo cadastrado, o recurso está contratado mas ainda não foi
      // ligado do lado do n8n. A tela precisa dizer isso com todas as letras,
      // senão o lojista fica esperando resposta que nunca vem.
      configurado: Boolean(link),
      status: (link?.status ?? "pendente") as string,
      ultimoSinal: (link?.last_seen_at ?? null) as string | null,
      ultimoErro: (link?.last_error ?? null) as string | null,
      mensagensNaFila: naFila.count ?? 0,
    };
  });
