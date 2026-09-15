import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { crm, crmRpc } from "./db";
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
 * O PEDIDO QUE A IA MONTOU, ESPERANDO O DONO.
 *
 * Ele não vai para a cozinha sozinho. Fica na conversa com um botão, e só
 * vira pedido de verdade quando alguém da loja confirma. É a comanda que o
 * garçom repete em voz alta antes de passar para a chapa: se a IA entendeu
 * "sem cebola" como "com cebola", o erro morre aqui e não no prato.
 */
export type RascunhoPedido = {
  id: string;
  itens: Array<{
    nome: string;
    quantidade: number;
    preco_unitario_cents: number;
    total_cents: number;
    observacao: string | null;
    menu_product_id: string;
  }>;
  subtotal_cents: number;
  taxa_entrega_cents: number;
  total_cents: number;
  endereco: string | null;
  bairro: string | null;
  forma_pagamento: string | null;
  observacoes: string | null;
  nao_encontrados: string[];
  status: "aguardando" | "confirmado" | "recusado" | "cancelado";
  order_id: string | null;
  created_at: string;
};

const CAMPOS_RASCUNHO =
  "id, itens, subtotal_cents, taxa_entrega_cents, total_cents, endereco, bairro, " +
  "forma_pagamento, observacoes, nao_encontrados, status, order_id, created_at";

/** O rascunho que está esperando decisão nesta conversa (se houver). */
export const rascunhoDaConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; conversationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await porteiro(context, data.tenantId);
    if (!data.conversationId) throw new Error("Conversa não informada.");

    const { data: linha, error } = await crm("crm_order_drafts")
      .select(CAMPOS_RASCUNHO)
      .eq("tenant_id", tenantId)
      .eq("conversation_id", data.conversationId)
      .eq("status", "aguardando")
      .maybeSingle();

    if (error) throw new Error(error.message);
    return { rascunho: (linha ?? null) as RascunhoPedido | null };
  });

/** Centavos inteiros viram reais só aqui, na fronteira com a tabela de pedidos. */
function reais(cents: number): number {
  return Math.round(Number(cents) || 0) / 100;
}

/**
 * O lojista decide: vira pedido de verdade, ou não vira.
 *
 * CONFIRMAR CRIA O PEDIDO NO MESMO LUGAR QUE O SITE. Não existe uma lista
 * separada de "pedidos do WhatsApp" — seria o segundo caderno de comandas que
 * ninguém lembra de conferir. Entra na mesma tela, com a etiqueta de origem.
 *
 * O TOTAL É RECALCULADO AQUI. Mesmo que alguém tenha mexido na linha do
 * rascunho no meio do caminho, a conta que vale é a soma dos itens gravados.
 */
export const decidirRascunho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { tenantId: string; rascunhoId: string; decisao: "confirmar" | "recusar" }) => d,
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await porteiro(context, data.tenantId);
    if (!data.rascunhoId) throw new Error("Pedido não informado.");

    const { data: rascunho, error } = await crm("crm_order_drafts")
      .select(CAMPOS_RASCUNHO + ", customer_id, conversation_id")
      .eq("tenant_id", tenantId)
      .eq("id", data.rascunhoId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!rascunho) throw new Error("Pedido não encontrado nesta loja.");
    if (rascunho.status !== "aguardando") {
      throw new Error("Este pedido já foi decidido.");
    }

    if (data.decisao === "recusar") {
      const { error: e } = await crm("crm_order_drafts")
        .update({
          status: "recusado",
          decidido_por: context.userId,
          decidido_em: new Date().toISOString(),
        })
        .eq("id", rascunho.id);
      if (e) throw new Error(e.message);
      return { status: "recusado" as const, orderId: null };
    }

    const { data: cliente } = await crm("marketing_customers")
      .select("name, phone_e164")
      .eq("id", rascunho.customer_id)
      .maybeSingle();

    const itens = (rascunho.itens ?? []) as RascunhoPedido["itens"];
    const subtotalCents = itens.reduce((t: number, i) => t + Number(i.total_cents || 0), 0);
    const taxaCents = Number(rascunho.taxa_entrega_cents || 0);

    const { data: pedido, error: erroPedido } = await crm("orders")
      .insert({
        tenant_id: tenantId,
        customer_name: cliente?.name || "Cliente do WhatsApp",
        customer_phone: cliente?.phone_e164 ?? null,
        customer_address: rascunho.endereco || "Não informado",
        neighborhood: rascunho.bairro ?? null,
        subtotal: reais(subtotalCents),
        delivery_fee: reais(taxaCents),
        total: reais(subtotalCents + taxaCents),
        payment_method: rascunho.forma_pagamento || "Não informado",
        notes: rascunho.observacoes || "",
        status: "novo",
        order_type: "delivery",
        delivery_type: "delivery",
        service_mode: "delivery",
        // A etiqueta de origem é o que permite, depois, saber quanto o Chat
        // vendeu — e conferir se a IA está acertando ou dando prejuízo.
        source: "chat-ia",
        customer_id: rascunho.customer_id,
        items: itens.map((i) => ({
          name: i.nome,
          type: "other",
          notes: i.observacao ?? "",
          quantity: i.quantidade,
          unit_price: reais(i.preco_unitario_cents),
          total_price: reais(i.total_cents),
          menu_product_id: i.menu_product_id,
        })),
      })
      .select("id, order_number")
      .single();

    if (erroPedido) throw new Error(erroPedido.message);

    const { error: erroFecha } = await crm("crm_order_drafts")
      .update({
        status: "confirmado",
        order_id: pedido.id,
        decidido_por: context.userId,
        decidido_em: new Date().toISOString(),
      })
      .eq("id", rascunho.id);
    if (erroFecha) throw new Error(erroFecha.message);

    return {
      status: "confirmado" as const,
      orderId: pedido.id as string,
      numero: pedido.order_number as number | null,
    };
  });
