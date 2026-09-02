import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/authMiddleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { mkt, mktRpc, type ConsultaMarketing } from "./db";
import { assertOwnsTenant } from "@/lib/server/planGuard";
import { aplicarFiltro, construirFiltro, descreverSegmento, type FiltroSegmento } from "./segments";
import {
  renderizarMensagem,
  primeiroNome,
  descreverUltimoPedido,
  variaveisDesconhecidas,
} from "./templateVars";
import { normalizePhone } from "./phone";
import { syncToExternal } from "@/utils/menuSync";
import { ensureRestaurantProvisioned } from "@/lib/provisioning/ensureProvisioned.server";

/* Enquanto o arquivo de tipos gerado não conhecer as tabelas novas (ver
   `db.ts`), as linhas que voltam do banco chegam sem tipo. Depois de regerar
   os tipos, estas anotações podem virar tipos de verdade. */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * As operações do módulo de Marketing.
 *
 * DUAS REGRAS QUE VALEM PARA TODAS AS FUNÇÕES DESTE ARQUIVO
 *
 * 1. A loja NUNCA vem do navegador como verdade. O `tenantId` que chega é
 *    tratado como um pedido, e `assertOwnsTenant` confere se quem está
 *    logado é dono dela antes de qualquer coisa. É o porteiro conferindo o
 *    nome na lista, não aceitando quem diz "pode deixar, eu sou convidado".
 *
 * 2. Quem grava é o servidor, com a chave de serviço, DEPOIS da conferência.
 *    O navegador não tem permissão de escrita nessas tabelas nem se tentar.
 *
 * Toda leitura e toda gravação já entra amarrada ao `tenantId` conferido —
 * nunca ao que veio na requisição.
 */

const TAMANHO_PAGINA_MAX = 100;

// ---------------------------------------------------------------------------
// CLIENTES
// ---------------------------------------------------------------------------

/**
 * As linhas do módulo de marketing chegam sem tipo do banco (ver `db.ts`).
 * Estes tipos dizem o que cada consulta realmente devolve — é o que evita
 * ler um campo que não existe e só descobrir na tela do cliente.
 */
type LinhaDeCliente = {
  id: string;
  name: string | null;
  phone_e164: string;
  is_mobile: boolean;
  orders_count: number;
  total_spent_cents: number;
  ticket_medio_cents: number;
  last_order_at: string | null;
  marketing_opt_in: boolean;
  tags: string[] | null;
  status: string;
};

type LinhaDeCampanha = {
  status: string;
  sent_count: number | null;
  delivered_count: number | null;
  failed_count: number | null;
};

export type ClienteMarketing = {
  id: string;
  name: string | null;
  phone_e164: string;
  is_mobile: boolean;
  orders_count: number;
  total_spent_cents: number;
  ticket_medio_cents: number;
  last_order_at: string | null;
  marketing_opt_in: boolean;
  tags: string[];
  status: string;
};

export const listarClientes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      tenantId: string;
      busca?: string;
      pagina?: number;
      porPagina?: number;
      ordenarPor?: "last_order_at" | "total_spent_cents" | "orders_count" | "name";
      ordem?: "asc" | "desc";
      somenteAptos?: boolean;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);

    const porPagina = Math.min(Math.max(data.porPagina ?? 25, 1), TAMANHO_PAGINA_MAX);
    const pagina = Math.max(data.pagina ?? 1, 1);
    const de = (pagina - 1) * porPagina;

    let q = mkt("marketing_customers")
      .select(
        "id, name, phone_e164, is_mobile, orders_count, total_spent_cents, last_order_at, marketing_opt_in, tags, status",
        { count: "exact" },
      )
      .eq("tenant_id", tenantId);

    if (data.somenteAptos) {
      q = q.eq("marketing_opt_in", true).eq("status", "active").eq("is_mobile", true);
    }

    // A busca aceita nome ou telefone. Se o que foi digitado parece telefone,
    // procuramos pelo número padronizado — assim "(71) 99999-1234" acha o
    // cliente mesmo estando guardado como 5571999991234.
    const busca = (data.busca ?? "").trim();
    if (busca) {
      const tel = normalizePhone(busca);
      if (tel) {
        q = q.eq("phone_e164", tel.e164);
      } else {
        // Escapa o que o PostgREST usaria como separador, senão uma vírgula
        // digitada na busca viraria "mais um filtro" na consulta.
        const seguro = busca.replace(/[%,()]/g, " ");
        q = q.ilike("name", `%${seguro}%`);
      }
    }

    const ordenarPor = data.ordenarPor ?? "last_order_at";
    q = q
      .order(ordenarPor, { ascending: data.ordem === "asc", nullsFirst: false })
      .range(de, de + porPagina - 1);

    const { data: linhas, error, count } = await q;
    if (error) throw new Error(error.message);

    const clientes: ClienteMarketing[] = (linhas ?? []).map((c: LinhaDeCliente) => ({
      ...c,
      tags: c.tags ?? [],
      ticket_medio_cents: c.orders_count > 0 ? Math.round(c.total_spent_cents / c.orders_count) : 0,
    }));

    return { clientes, total: count ?? 0, pagina, porPagina };
  });

export const atualizarCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      tenantId: string;
      customerId: string;
      tags?: string[];
      notes?: string;
      marketingOptIn?: boolean;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);

    const mudanca: Record<string, unknown> = {};
    if (data.tags)
      mudanca.tags = data.tags
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 20);
    if (data.notes !== undefined) mudanca.notes = data.notes.slice(0, 2000);

    // Descadastrar é sempre permitido. Cadastrar à mão fica registrado com a
    // origem "painel", para o dia em que alguém perguntar quem autorizou.
    if (data.marketingOptIn !== undefined) {
      mudanca.marketing_opt_in = data.marketingOptIn;
      if (data.marketingOptIn) {
        mudanca.marketing_opt_in_at = new Date().toISOString();
        mudanca.marketing_opt_in_source = "painel";
        mudanca.marketing_opt_out_at = null;
      } else {
        mudanca.marketing_opt_out_at = new Date().toISOString();
      }
    }

    if (Object.keys(mudanca).length === 0) return { ok: true };

    const { error } = await mkt("marketing_customers")
      .update(mudanca)
      .eq("id", data.customerId)
      // O `eq` na loja não é redundante: impede que um id de cliente de outra
      // loja, chutado ou vazado, seja alterado por aqui.
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// PÚBLICO
// ---------------------------------------------------------------------------

/**
 * Quantas pessoas receberiam esta campanha.
 *
 * Conta sem trazer os dados: pergunta ao banco "quantos?" em vez de trazer a
 * lista e contar aqui. Com base grande, a diferença é entre a tela responder
 * na hora e a tela travar.
 */
export const contarPublico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; filtro: FiltroSegmento }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);

    const resolvido = construirFiltro(data.filtro);
    let q = mkt("marketing_customers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    q = aplicarFiltro(q, resolvido);

    const { count, error } = await q;
    if (error) throw new Error(error.message);

    return { total: count ?? 0, descricao: descreverSegmento(data.filtro) };
  });

// ---------------------------------------------------------------------------
// CAMPANHAS
// ---------------------------------------------------------------------------

export const salvarCampanha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      tenantId: string;
      campaignId?: string;
      nome: string;
      tipo: string;
      mensagem: string;
      filtro: FiltroSegmento;
      mediaUrl?: string | null;
      cupom?: string | null;
      agendarPara?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);

    const nome = data.nome.trim();
    if (!nome) throw new Error("Dê um nome para a campanha");
    if (!data.mensagem.trim()) throw new Error("Escreva a mensagem que será enviada");

    const desconhecidas = variaveisDesconhecidas(data.mensagem);
    if (desconhecidas.length) {
      throw new Error(
        `Estas variáveis não existem: ${desconhecidas.map((v) => `{{${v}}}`).join(", ")}`,
      );
    }

    const registro = {
      tenant_id: tenantId,
      name: nome.slice(0, 120),
      type: data.tipo,
      message_body: data.mensagem.slice(0, 4000),
      audience_mode: data.filtro.tipo === "manual" ? "manual" : "segmento",
      audience_filters: data.filtro as unknown as Record<string, unknown>,
      media_url: data.mediaUrl ?? null,
      media_type: data.mediaUrl ? "image" : null,
      coupon_code: data.cupom?.trim() || null,
      scheduled_at: data.agendarPara ?? null,
      created_by: context.userId,
    };

    if (data.campaignId) {
      // Campanha que já saiu não pode ser reescrita: o histórico tem de
      // continuar contando o que foi realmente enviado.
      const { data: atual, error: e1 } = await mkt("marketing_campaigns")
        .select("status")
        .eq("id", data.campaignId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (e1) throw new Error(e1.message);
      if (!atual) throw new Error("Campanha não encontrada");
      if (atual.status !== "draft" && atual.status !== "scheduled") {
        throw new Error("Esta campanha já foi disparada e não pode mais ser alterada");
      }

      const { error } = await mkt("marketing_campaigns")
        .update(registro)
        .eq("id", data.campaignId)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { campaignId: data.campaignId };
    }

    const { data: criada, error } = await mkt("marketing_campaigns")
      .insert({ ...registro, status: "draft" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await registrarEvento(tenantId, criada.id, "campaign_created", { nome }, context.userId);
    return { campaignId: criada.id as string };
  });

/**
 * Confirmar o disparo.
 *
 * É aqui que o público deixa de ser um filtro e vira uma lista de pessoas.
 * A partir deste instante a campanha não muda mais de público: se um cliente
 * novo entrar amanhã, ele não recebe esta campanha. É o que permite explicar
 * meses depois por que cada pessoa recebeu.
 */
export const dispararCampanha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; campaignId: string; idempotencyKey?: string }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);

    const { data: campanha, error: e1 } = await mkt("marketing_campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!campanha) throw new Error("Campanha não encontrada");

    // Clique repetido, aba duplicada, internet lenta: a campanha só dispara
    // uma vez. Como o comprovante do estacionamento — a segunda via não abre
    // a cancela de novo.
    if (campanha.status !== "draft" && campanha.status !== "scheduled") {
      return { jaDisparada: true, total: campanha.estimated_recipients ?? 0 };
    }

    const { data: loja } = await supabaseAdmin
      .from("pizzerias")
      .select("name, slug, public_url")
      .eq("id", tenantId)
      .maybeSingle();

    const filtro = (campanha.audience_filters ?? { tipo: "todos" }) as FiltroSegmento;
    const resolvido = construirFiltro(filtro);

    // Traz o público em blocos. Sem isso, uma base de 20 mil clientes viraria
    // uma única resposta gigante que estoura a memória do servidor.
    const BLOCO = 500;
    let de = 0;
    let totalCriados = 0;

    for (;;) {
      let q = mkt("marketing_customers")
        .select("id, name, phone_e164, last_order_at")
        .eq("tenant_id", tenantId);
      q = aplicarFiltro(q, resolvido);
      const { data: bloco, error } = await q.range(de, de + BLOCO - 1);
      if (error) throw new Error(error.message);
      if (!bloco || bloco.length === 0) break;

      const linhas = bloco.map((c: LinhaDeCliente) => ({
        campaign_id: data.campaignId,
        tenant_id: tenantId,
        customer_id: c.id,
        phone_e164: c.phone_e164,
        customer_name: c.name,
        rendered_message: renderizarMensagem(campanha.message_body ?? "", {
          nome: c.name,
          primeiro_nome: primeiroNome(c.name),
          nome_estabelecimento: loja?.name,
          cupom: campanha.coupon_code,
          link_cardapio:
            loja?.public_url ?? (loja?.slug ? `https://conectfly.com/${loja.slug}` : ""),
          ultimo_pedido: descreverUltimoPedido(c.last_order_at),
        }),
        status: "pending" as const,
      }));

      // `upsert` ignorando repetidos: se o disparo for tentado duas vezes, a
      // mesma pessoa não entra duas vezes na mesma campanha.
      const { error: e2 } = await mkt("marketing_campaign_recipients").upsert(linhas, {
        onConflict: "campaign_id,phone_e164",
        ignoreDuplicates: true,
      });
      if (e2) throw new Error(e2.message);

      totalCriados += linhas.length;
      if (bloco.length < BLOCO) break;
      de += BLOCO;
    }

    if (totalCriados === 0) {
      throw new Error(
        "Nenhum cliente se encaixa neste público. Lembre que só entram clientes que aceitaram receber ofertas.",
      );
    }

    const { error: e3 } = await mkt("marketing_campaigns")
      .update({
        status: "queued",
        estimated_recipients: totalCriados,
        started_at: new Date().toISOString(),
      })
      .eq("id", data.campaignId)
      .eq("tenant_id", tenantId);
    if (e3) throw new Error(e3.message);

    await registrarEvento(
      tenantId,
      data.campaignId,
      "campaign_started",
      { total: totalCriados },
      context.userId,
    );

    return { jaDisparada: false, total: totalCriados };
  });

export const mudarEstadoCampanha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { tenantId: string; campaignId: string; acao: "pausar" | "retomar" | "cancelar" }) => d,
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);

    const { data: campanha, error: e1 } = await mkt("marketing_campaigns")
      .select("id, status")
      .eq("id", data.campaignId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!campanha) throw new Error("Campanha não encontrada");

    if (data.acao === "cancelar") {
      const { error } = await mktRpc("marketing_cancel_campaign", {
        p_campaign_id: data.campaignId,
      });
      if (error) throw new Error(error.message);
      await registrarEvento(tenantId, data.campaignId, "campaign_cancelled", {}, context.userId);
      return { status: "cancelled" };
    }

    if (campanha.status === "completed" || campanha.status === "cancelled") {
      throw new Error("Esta campanha já terminou");
    }

    const novo = data.acao === "pausar" ? "paused" : "processing";
    const { error } = await mkt("marketing_campaigns")
      .update({ status: novo })
      .eq("id", data.campaignId)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);

    await registrarEvento(
      tenantId,
      data.campaignId,
      data.acao === "pausar" ? "campaign_paused" : "campaign_resumed",
      {},
      context.userId,
    );
    return { status: novo };
  });

export const listarCampanhas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; pagina?: number; porPagina?: number }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);
    const porPagina = Math.min(Math.max(data.porPagina ?? 20, 1), TAMANHO_PAGINA_MAX);
    const de = (Math.max(data.pagina ?? 1, 1) - 1) * porPagina;

    const {
      data: linhas,
      error,
      count,
    } = await mkt("marketing_campaigns")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(de, de + porPagina - 1);
    if (error) throw new Error(error.message);

    return { campanhas: linhas ?? [], total: count ?? 0 };
  });

export const detalheCampanha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; campaignId: string }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);

    const { data: campanha, error } = await mkt("marketing_campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!campanha) throw new Error("Campanha não encontrada");

    // Só as falhas, e poucas: quem abre o detalhe quer saber o que deu errado,
    // não ler oito mil linhas de "entregue".
    const { data: falhas } = await mkt("marketing_campaign_recipients")
      .select("customer_name, phone_e164, error_code, error_message, attempts")
      .eq("campaign_id", data.campaignId)
      .eq("status", "failed")
      .limit(50);

    return { campanha, falhas: falhas ?? [] };
  });

// ---------------------------------------------------------------------------
// MODELOS DE MENSAGEM
// ---------------------------------------------------------------------------

export const listarModelos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);
    const { data: linhas, error } = await mkt("marketing_templates")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { modelos: linhas ?? [] };
  });

export const salvarModelo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      tenantId: string;
      templateId?: string;
      titulo: string;
      categoria: string;
      mensagem: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);
    if (!data.titulo.trim()) throw new Error("Dê um nome ao modelo");
    if (!data.mensagem.trim()) throw new Error("Escreva a mensagem do modelo");

    const registro = {
      tenant_id: tenantId,
      title: data.titulo.trim().slice(0, 120),
      category: data.categoria,
      body: data.mensagem.slice(0, 4000),
      created_by: context.userId,
    };

    if (data.templateId) {
      const { error } = await mkt("marketing_templates")
        .update(registro)
        .eq("id", data.templateId)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { templateId: data.templateId };
    }

    const { data: criado, error } = await mkt("marketing_templates")
      .insert(registro)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { templateId: criado.id as string };
  });

export const excluirModelo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; templateId: string }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);
    const { error } = await mkt("marketing_templates")
      .delete()
      .eq("id", data.templateId)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// VISÃO GERAL
// ---------------------------------------------------------------------------

export const resumoMarketing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);

    // Contagens em vez de listas: a tela precisa de números, não de dados.
    const contar = async (montar: (q: ConsultaMarketing) => ConsultaMarketing) => {
      let q = mkt("marketing_customers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      q = montar(q);
      const { count } = await q;
      return count ?? 0;
    };

    const [totalClientes, aptos] = await Promise.all([
      contar((q) => q),
      contar((q) => q.eq("marketing_opt_in", true).eq("status", "active").eq("is_mobile", true)),
    ]);

    const { data: campanhas } = await mkt("marketing_campaigns")
      .select("status, sent_count, delivered_count, failed_count")
      .eq("tenant_id", tenantId);

    const feitas = (campanhas ?? []).filter((c: LinhaDeCampanha) =>
      ["completed", "processing", "queued", "paused"].includes(c.status),
    );
    const enviadas = feitas.reduce((s: number, c: any) => s + (c.sent_count ?? 0), 0);
    const entregues = feitas.reduce((s: number, c: any) => s + (c.delivered_count ?? 0), 0);

    const { data: instancia } = await mkt("marketing_whatsapp_instances")
      .select("status, last_synced_at")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    return {
      totalClientes,
      aptos,
      campanhasFeitas: feitas.length,
      mensagensEnviadas: enviadas,
      // Sem envio ainda, a taxa é nula em vez de 0% — "0% de entrega" assusta
      // sem motivo quando ninguém mandou nada.
      taxaEntrega: enviadas > 0 ? Math.round((entregues / enviadas) * 100) : null,
      whatsappStatus: instancia?.status ?? "disconnected",
      whatsappUltimaSync: instancia?.last_synced_at ?? null,
    };
  });

export const statusWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);
    const { data: linha } = await mkt("marketing_whatsapp_instances")
      .select(
        "provider, external_instance_id, phone_e164, status, status_message, connected_at, last_synced_at, last_message_at",
      )
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const { data: errosRecentes } = await mkt("marketing_campaign_recipients")
      .select("error_code, error_message, failed_at")
      .eq("tenant_id", tenantId)
      .eq("status", "failed")
      .order("failed_at", { ascending: false })
      .limit(5);

    return { instancia: linha ?? null, errosRecentes: errosRecentes ?? [] };
  });

// ---------------------------------------------------------------------------

async function registrarEvento(
  tenantId: string,
  campaignId: string | null,
  evento: string,
  payload: Record<string, unknown>,
  actor?: string,
) {
  // Auditoria nunca derruba a operação principal: se o registro falhar, a
  // campanha continua. E nada de token ou chave aqui dentro.
  try {
    await mkt("marketing_events").insert({
      tenant_id: tenantId,
      campaign_id: campaignId,
      event: evento,
      payload,
      actor: actor ?? null,
    });
  } catch (e) {
    console.warn("[marketing] não consegui registrar o evento", evento, e);
  }
}

// ---------------------------------------------------------------------------
// DESCONTO PARA QUEM ACEITA RECEBER OFERTAS
//
// Mora em `pizzerias.site_settings`, o mesmo pacote de configurações que já
// viaja para o site de pedidos junto com o modelo de checkout. Nenhuma
// integração nova: ele pega carona.
//
// O teto de 50% é aplicado AQUI, no servidor, e de novo na entrada do pedido.
// Não adianta o navegador mandar 90: quem grava é este código, e quem cobra
// confere de novo. É o caixa conferindo a conta em vez de aceitar o valor
// escrito no guardanapo.
// ---------------------------------------------------------------------------

const DESCONTO_ACEITE_TETO = 50;

function normalizarPercent(bruto: unknown): number {
  const n = typeof bruto === "number" ? bruto : Number(String(bruto ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Meio por cento é o menor passo que faz sentido numa conta de restaurante.
  return Math.min(Math.round(n * 2) / 2, DESCONTO_ACEITE_TETO);
}

export const lerDescontoAceite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);
    const { data: loja, error } = await supabaseAdmin
      .from("pizzerias")
      .select("site_settings")
      .eq("id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const cfg = (loja?.site_settings ?? {}) as Record<string, unknown>;
    return { percent: normalizarPercent(cfg.marketing_opt_in_discount_percent) };
  });

export const salvarDescontoAceite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; percent: number }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);

    const percent = normalizarPercent(data.percent);

    // Lê o pacote inteiro e devolve com a chave trocada. Escrever só a chave
    // apagaria todo o resto da configuração do site — é como reescrever a
    // ficha do cliente inteira só para mudar o telefone.
    const { data: loja, error: e1 } = await supabaseAdmin
      .from("pizzerias")
      .select("site_settings")
      .eq("id", tenantId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);

    const atual = (loja?.site_settings ?? {}) as Record<string, unknown>;
    const novo = { ...atual, marketing_opt_in_discount_percent: percent };

    const { error: e2 } = await supabaseAdmin
      .from("pizzerias")
      .update({ site_settings: novo })
      .eq("id", tenantId);
    if (e2) throw new Error(e2.message);

    // ── E agora a parte que faltava ──────────────────────────────────────
    //
    // Os dois sistemas têm bancos SEPARADOS. Guardar aqui não faz o site de
    // pedidos saber de nada — é como anotar o preço novo no caderno da
    // cozinha e o garçom continuar com o cardápio velho na mão.
    //
    // Então, depois de salvar, empurramos a configuração para o site pelo
    // mesmo caminho que a tela "Minha Loja" já usa. O SiteCreatorFly mescla
    // com o que ele tem: manda só esta chave, não apaga o resto.
    //
    // Se o empurrão falhar, o valor CONTINUA salvo aqui e a resposta avisa.
    // A tela mostra o aviso em vez de dizer "salvou" e deixar o dono achando
    // que está no ar quando não está.
    let sincronizou = true;
    let erroSincronia: string | undefined;
    try {
      let { data: loja2 } = await supabaseAdmin
        .from("pizzerias")
        .select("slug, api_key, sync_endpoint")
        .eq("id", tenantId)
        .maybeSingle();

      // Loja recém-cadastrada costuma chegar aqui sem o endereço de
      // sincronização — a conexão com o site é feita em segundo plano no
      // cadastro e pode não ter terminado, ou ter falhado.
      //
      // Antes desta parte, a tela simplesmente desistia e avisava. Só que a
      // tela "Minha Loja" já sabia se virar sozinha nessa hora, e esta não —
      // por isso o desconto funcionava nas lojas antigas (que já tinham
      // passado por lá) e não nas novas. Agora as duas fazem a mesma coisa:
      // pedem a conexão na hora e seguem.
      if (!(loja2 as any)?.sync_endpoint) {
        await ensureRestaurantProvisioned(tenantId);
        const { data: recarregada } = await supabaseAdmin
          .from("pizzerias")
          .select("slug, api_key, sync_endpoint")
          .eq("id", tenantId)
          .maybeSingle();
        loja2 = recarregada;
      }

      const endpoint = (loja2 as any)?.sync_endpoint;
      if (!endpoint) {
        sincronizou = false;
        erroSincronia = "não consegui conectar esta loja ao site de pedidos agora";
      } else {
        const r = await syncToExternal({
          type: "restaurant",
          action: "update",
          id: tenantId,
          pizzeriaSlug: (loja2 as any)?.slug,
          pizzeriaApiKey: (loja2 as any)?.api_key,
          syncEndpoint: endpoint,
          data: { site_settings: novo },
        });
        sincronizou = r.success;
        erroSincronia = r.error;
      }
    } catch (e) {
      sincronizou = false;
      erroSincronia = e instanceof Error ? e.message : "Falha ao falar com o site";
    }

    await registrarEvento(
      tenantId,
      null,
      "desconto_aceite_alterado",
      { de: normalizarPercent(atual.marketing_opt_in_discount_percent), para: percent },
      context.userId,
    );

    return { percent, sincronizou, erroSincronia };
  });
