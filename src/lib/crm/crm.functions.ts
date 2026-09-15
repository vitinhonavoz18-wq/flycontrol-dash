import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { crm, crmRpc } from "./db";
import { assertOwnsTenantWithAddon } from "@/lib/server/plan-guard";
import { normalizePhone } from "@/lib/marketing/phone";
import { podeSerAlteradoPelaIa } from "./pedidoStatus";

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
  customer_id: string;
  status: "open" | "pending" | "closed";
  assigned_to: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  /**
   * A ficha do cliente — a MESMA que o Marketing usa.
   *
   * Por isso vêm junto os pedidos e o quanto a pessoa já gastou: atender
   * sabendo que do outro lado está alguém que já comprou 14 vezes é diferente
   * de atender às cegas. É a diferença entre o garçom que reconhece o cliente
   * da mesa 5 e o que trata todo mundo como se fosse a primeira vez.
   */
  contato: {
    id: string;
    name: string | null;
    phone_e164: string;
    /** Foto do WhatsApp, guardada pelo servidor. Pode não existir. */
    avatar_url: string | null;
    orders_count: number;
    total_spent_cents: number;
    last_order_at: string | null;
    marketing_opt_in: boolean;
  } | null;
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
        "id, customer_id, status, assigned_to, last_message_at, last_message_preview, unread_count, " +
          "contato:marketing_customers!crm_conversations_customer_id_fkey" +
          "(id, name, phone_e164, avatar_url, orders_count, total_spent_cents, last_order_at, marketing_opt_in)",
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
  /**
   * Quem digitou, quando foi gente da loja. Vazio significa que foi a IA — ela
   * responde pelo fluxo, sem entrar no painel, então não deixa assinatura.
   * É o que permite a tela separar "você", "sua equipe" e "a IA".
   */
  sent_by: string | null;
  /** O carimbo de quem respondeu: "painel", "ia" ou "celular". */
  origin: string | null;
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
      .select(
        "id, direction, sent_by, origin, body, media_url, media_type, status, error_message, created_at",
      )
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
        origin: "painel",
      })
      .select(
        "id, direction, sent_by, origin, body, media_url, media_type, status, error_message, created_at",
      )
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

    // Se a pessoa já existe (pediu pelo site), a ficha dela é reaproveitada
    // com todo o histórico de pedidos — não nasce um cliente novo. E o nome
    // que já estava lá não é apagado por um campo deixado em branco aqui.
    const { data: existente } = await crm("marketing_customers")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("phone_e164", telefone.e164)
      .maybeSingle();

    const { data: contato, error: erroContato } = await crm("marketing_customers")
      .upsert(
        {
          tenant_id: tenantId,
          phone_e164: telefone.e164,
          phone_raw: data.telefone,
          name: nome ?? existente?.name ?? null,
          // Quem o lojista puxa conversa não vira alvo de campanha por isso.
          // Aceitar receber promoção é uma decisão do cliente, não um efeito
          // colateral de o restaurante ter mandado um "oi".
          ...(existente ? {} : { source: "whatsapp", marketing_opt_in: false, is_mobile: true }),
          // Nome digitado por uma pessoa manda mais que o apelido do WhatsApp.
          ...(nome ? { name_locked: true } : {}),
        },
        { onConflict: "tenant_id,phone_e164" },
      )
      .select("id")
      .single();

    if (erroContato) throw new Error(erroContato.message);

    const { data: conversa, error: erroConversa } = await crm("crm_conversations")
      .upsert(
        { tenant_id: tenantId, customer_id: contato.id, status: "open" },
        { onConflict: "tenant_id,customer_id" },
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

/**
 * Corrigir o nome do cliente pela tela.
 *
 * POR QUE ISSO PRECISOU EXISTIR
 *
 * O WhatsApp nem sempre manda o nome certo. Numa mensagem que o próprio dono
 * digitou no celular dele, o nome que vem junto é o do PERFIL DA LOJA — e foi
 * assim que três clientes diferentes foram gravados como "flycontrol". O
 * defeito que causava isso está corrigido, mas quem já ficou com o nome errado
 * precisa de uma borracha.
 *
 * NOME CORRIGIDO À MÃO FICA TRAVADO. A partir da correção, o que vier do
 * WhatsApp não sobrescreve mais. É a etiqueta escrita a caneta por cima da
 * impressa: dali em diante, vale a caneta. Apagar o nome destrava de novo.
 *
 * O nome é o MESMO que o Marketing enxerga — é uma ficha só. Corrigir aqui
 * corrige lá.
 */
export const renomearContato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; customerId: string; nome: string }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await porteiro(context, data.tenantId);

    if (!data.customerId) throw new Error("Cliente não informado.");

    const nome = (data.nome ?? "").trim();
    if (nome.length > 120) throw new Error("Nome muito longo (máximo de 120 letras).");

    // O `tenantId` conferido entra na função do banco junto com o número do
    // cliente. Sem ele, mandar o número de um cliente de outra loja renomearia
    // o cliente da outra loja.
    const { data: ok, error } = await crmRpc("crm_rename_customer", {
      p_tenant_id: tenantId,
      p_customer_id: data.customerId,
      p_name: nome,
    });

    if (error) throw new Error(error.message);
    if (!ok) throw new Error("Cliente não encontrado nesta loja.");

    return { nome: nome || null };
  });

/**
 * O PEDIDO QUE A IA FEZ, dentro da conversa.
 *
 * O pedido entra direto na lista de Pedidos — sem ninguém confirmar. Mas o
 * lojista continua vendo, ali na conversa, o que foi vendido e em que pé está:
 * é a comanda pregada ao lado do telefone, não guardada numa gaveta em outra
 * sala.
 *
 * E tem o botão de cancelar. Como não existe mais a conferência antes, o
 * cancelamento é a rede: percebeu que a IA entendeu errado, um clique desfaz
 * — enquanto a cozinha não começou.
 */
export type PedidoDoChat = {
  id: string;
  numero: number | null;
  status: string;
  total: number;
  delivery_fee: number;
  customer_address: string | null;
  neighborhood: string | null;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
  items: Array<{
    name?: string;
    quantity?: number;
    unit_price?: number;
    total_price?: number;
    notes?: string;
  }>;
};

const CAMPOS_PEDIDO =
  "id, order_number, status, total, delivery_fee, customer_address, neighborhood, " +
  "payment_method, notes, created_at, items";

/** O último pedido que o Chat gerou para o cliente desta conversa. */
export const pedidoDaConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; conversationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await porteiro(context, data.tenantId);
    if (!data.conversationId) throw new Error("Conversa não informada.");

    const { data: conversa, error: erroConversa } = await crm("crm_conversations")
      .select("customer_id")
      .eq("tenant_id", tenantId)
      .eq("id", data.conversationId)
      .maybeSingle();

    if (erroConversa) throw new Error(erroConversa.message);
    if (!conversa) return { pedido: null };

    const { data: linha, error } = await crm("orders")
      .select(CAMPOS_PEDIDO)
      .eq("tenant_id", tenantId)
      .eq("customer_id", conversa.customer_id)
      .eq("source", "chat-ia")
      .neq("status", "deleted")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!linha) return { pedido: null };

    return {
      pedido: {
        id: linha.id,
        numero: linha.order_number ?? null,
        status: String(linha.status ?? ""),
        total: Number(linha.total ?? 0),
        delivery_fee: Number(linha.delivery_fee ?? 0),
        customer_address: linha.customer_address ?? null,
        neighborhood: linha.neighborhood ?? null,
        payment_method: linha.payment_method ?? null,
        notes: linha.notes ?? null,
        created_at: String(linha.created_at),
        items: Array.isArray(linha.items) ? linha.items : [],
      } as PedidoDoChat,
    };
  });

/**
 * Cancelar o pedido que a IA fez.
 *
 * SÓ ENQUANTO A COZINHA NÃO COMEÇOU. Depois de "em preparo" o cancelamento
 * deixa de ser um clique e vira uma conversa com a cozinha — e cancelar na
 * tela sem avisar ninguém faria a comida sair mesmo assim, sem pedido para
 * cobrar.
 */
export const cancelarPedidoDoChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; pedidoId: string }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await porteiro(context, data.tenantId);
    if (!data.pedidoId) throw new Error("Pedido não informado.");

    const { data: pedido, error } = await crm("orders")
      .select("id, status, order_number")
      .eq("tenant_id", tenantId)
      .eq("id", data.pedidoId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!pedido) throw new Error("Pedido não encontrado nesta loja.");

    if (!podeSerAlteradoPelaIa(pedido.status)) {
      throw new Error(
        "Este pedido já entrou em preparo. Cancele pela tela de Pedidos, avisando a cozinha.",
      );
    }

    const { error: erroCancela } = await crm("orders")
      .update({ status: "cancelado", updated_at: new Date().toISOString() })
      .eq("id", pedido.id)
      .eq("tenant_id", tenantId);

    if (erroCancela) throw new Error(erroCancela.message);

    return { numero: (pedido.order_number as number) ?? null };
  });
