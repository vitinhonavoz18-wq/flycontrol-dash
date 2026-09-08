/**
 * As funções de servidor do módulo Estoque & PDV.
 *
 * DUAS REGRAS MANDAM AQUI
 *
 * 1. TODA função começa conferindo dono E plano. Sem exceção, nem para as
 *    telas que "só leem". Esconder o menu no navegador não protege nada: quem
 *    souber o endereço chama direto. É a diferença entre apagar a placa da
 *    porta e trancar a porta.
 *
 * 2. NENHUMA função altera saldo por conta própria. Quem mexe em estoque é a
 *    função `inventory_apply_movement`, no banco — o único lugar que consegue
 *    garantir, ao mesmo tempo, que a movimentação foi gravada, que dois caixas
 *    não venderam a mesma última unidade e que o mesmo pedido não descontou
 *    duas vezes.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnsTenantWithFeature } from "@/lib/server/plan-guard";

/** O porteiro do módulo: dono da loja E plano que inclui Estoque. */
type ClienteSupabase = Parameters<typeof assertOwnsTenantWithFeature>[0];

async function assertEstoque(supabase: ClienteSupabase, userId: string, tenantId: string) {
  await assertOwnsTenantWithFeature(supabase, userId, tenantId, "inventory");
}

/**
 * Traduz os erros do banco para frases que o lojista entende.
 *
 * "ESTOQUE_INSUFICIENTE" não diz nada para quem está no balcão com o cliente
 * esperando. "Só tem 2 em estoque e você pediu 4" diz.
 */
function mensagemDeErro(bruto: string): string {
  const dica = bruto.includes("Disponível:") ? bruto.slice(bruto.indexOf("Disponível:")) : "";
  if (bruto.includes("ESTOQUE_INSUFICIENTE")) {
    return `Não há estoque suficiente para esta saída. ${dica}`.trim();
  }
  if (bruto.includes("CONVERSAO_NAO_CADASTRADA")) {
    return "Falta cadastrar quantas unidades tem essa embalagem. Abra o produto e informe, por exemplo, que 1 caixa tem 12 unidades.";
  }
  if (bruto.includes("PRODUTO_NAO_ENCONTRADO"))
    return "Produto não encontrado no estoque desta loja.";
  if (bruto.includes("ACESSO_NEGADO")) return "Este produto pertence a outra loja.";
  if (bruto.includes("VENDA_SEM_ITENS"))
    return "Adicione ao menos um produto para finalizar a venda.";
  if (bruto.includes("QUANTIDADE_INVALIDA")) return "A quantidade precisa ser maior que zero.";
  if (bruto.includes("PEDIDO_NAO_ENCONTRADO")) return "Pedido não encontrado.";
  return bruto;
}

export type ProdutoDeEstoque = {
  id: string;
  name: string;
  category_id: string | null;
  sku: string | null;
  barcode: string | null;
  internal_code: string | null;
  image_url: string | null;
  cost_cents: number;
  price_cents: number;
  base_unit: string;
  stock_base: number;
  min_stock_base: number;
  ideal_stock_base: number | null;
  allow_negative_stock: boolean;
  active: boolean;
};

/** Verde / laranja / vermelho — e o texto junto, para não depender só da cor. */
export type SituacaoDoEstoque = "sem_estoque" | "baixo" | "normal";

/** O que a função do banco devolve depois de mexer no saldo. */
export type ResultadoDaMovimentacao = {
  applied: boolean;
  status: string;
  movement_id: string | null;
  stock_before: number;
  stock_after: number;
  low_stock_crossed?: boolean;
  out_of_stock?: boolean;
  converted_quantity?: number;
  base_unit?: string;
};

export type ResultadoDaVenda = {
  sale_id: string;
  sale_number: number;
  subtotal_cents: number;
  discount_cents: number;
  surcharge_cents: number;
  total_cents: number;
};

export function situacaoDoEstoque(p: {
  stock_base: number;
  min_stock_base: number;
}): SituacaoDoEstoque {
  if (p.stock_base <= 0) return "sem_estoque";
  if (p.min_stock_base > 0 && p.stock_base <= p.min_stock_base) return "baixo";
  return "normal";
}

export const ROTULO_DA_SITUACAO: Record<SituacaoDoEstoque, string> = {
  sem_estoque: "Sem estoque",
  baixo: "Estoque baixo",
  normal: "Estoque normal",
};

// ---------------------------------------------------------------------------
// VISÃO GERAL
// ---------------------------------------------------------------------------

export const visaoGeralDoEstoque = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    const { data: produtos, error } = await context.supabase
      .from("inventory_products")
      .select(
        "id, name, image_url, category_id, base_unit, stock_base, min_stock_base, cost_cents, price_cents, active",
      )
      .eq("pizzeria_id", data.tenantId)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);

    const lista = (produtos ?? []) as Array<{
      id: string;
      name: string;
      image_url: string | null;
      category_id: string | null;
      base_unit: string;
      stock_base: number;
      min_stock_base: number;
      cost_cents: number;
      price_cents: number;
      active: boolean;
    }>;

    const ativos = lista.filter((p) => p.active);
    let semEstoque = 0;
    let baixo = 0;
    let normal = 0;
    let itens = 0;
    let valorCustoCents = 0;
    let valorVendaCents = 0;

    for (const p of ativos) {
      const estoque = Number(p.stock_base);
      itens += estoque;
      valorCustoCents += Math.round(estoque * p.cost_cents);
      valorVendaCents += Math.round(estoque * p.price_cents);
      const s = situacaoDoEstoque({
        stock_base: estoque,
        min_stock_base: Number(p.min_stock_base),
      });
      if (s === "sem_estoque") semEstoque++;
      else if (s === "baixo") baixo++;
      else normal++;
    }

    // Os que precisam de atenção, do mais crítico para o menos.
    const atencao = ativos
      .map((p) => ({
        ...p,
        stock_base: Number(p.stock_base),
        min_stock_base: Number(p.min_stock_base),
        situacao: situacaoDoEstoque({
          stock_base: Number(p.stock_base),
          min_stock_base: Number(p.min_stock_base),
        }),
      }))
      .filter((p) => p.situacao !== "normal")
      .sort((a, b) => a.stock_base - b.stock_base)
      .slice(0, 12);

    // O movimento de hoje. O dia começa à meia-noite do fuso da loja; usar o
    // fuso do servidor faria o "vendido hoje" virar em horário errado.
    const inicioDoDia = new Date();
    inicioDoDia.setHours(0, 0, 0, 0);

    const { data: movs } = await context.supabase
      .from("inventory_movements")
      .select("direction, reason, quantity_base")
      .eq("pizzeria_id", data.tenantId)
      .gte("created_at", inicioDoDia.toISOString());

    const doDia = (movs ?? []) as Array<{
      direction: string;
      reason: string;
      quantity_base: number;
    }>;
    const entradasHoje = doDia.filter((m) => m.direction === "in").length;
    const saidasHoje = doDia.filter((m) => m.direction === "out").length;
    const vendasHoje = doDia.filter(
      (m) => m.reason === "venda_balcao" || m.reason === "venda_online",
    ).length;

    const { data: vendas } = await context.supabase
      .from("pos_sales")
      .select("total_cents")
      .eq("pizzeria_id", data.tenantId)
      .eq("status", "concluida")
      .gte("created_at", inicioDoDia.toISOString());

    const vendidoBalcaoHojeCents = ((vendas ?? []) as Array<{ total_cents: number }>).reduce(
      (soma, v) => soma + Number(v.total_cents ?? 0),
      0,
    );

    return {
      cadastrados: lista.length,
      ativos: ativos.length,
      normal,
      baixo,
      semEstoque,
      itensTotais: Math.round(itens * 1000) / 1000,
      valorCustoCents,
      valorVendaCents,
      entradasHoje,
      saidasHoje,
      vendasHoje,
      vendidoBalcaoHojeCents,
      atencao,
    };
  });

// ---------------------------------------------------------------------------
// PRODUTOS
// ---------------------------------------------------------------------------

/**
 * A lista de produtos, em páginas.
 *
 * Um mercado pode ter 8 mil itens. Trazer todos de uma vez travaria o celular
 * do lojista — é como despejar o depósito inteiro no balcão para achar uma
 * caixa. Por isso vem de 30 em 30, já filtrado pelo banco.
 */
export const listarProdutosDeEstoque = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      tenantId: string;
      busca?: string;
      categoriaId?: string;
      situacao?: SituacaoDoEstoque | "todos";
      apenasAtivos?: boolean;
      ordenar?: "nome" | "menor_estoque" | "maior_estoque" | "recentes";
      pagina?: number;
    }) => d,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    const porPagina = 30;
    const pagina = Math.max(1, data.pagina ?? 1);

    let q = context.supabase
      .from("inventory_products")
      .select(
        "id, name, category_id, sku, barcode, internal_code, image_url, cost_cents, price_cents, base_unit, stock_base, min_stock_base, ideal_stock_base, allow_negative_stock, active",
        { count: "exact" },
      )
      .eq("pizzeria_id", data.tenantId)
      .is("deleted_at", null);

    const busca = (data.busca ?? "").trim();
    if (busca) {
      // Nome, SKU, código interno ou código de barras — a mesma caixa de busca
      // serve para digitar e para a pistola do caixa.
      const escapado = busca.replace(/[%,()]/g, "");
      q = q.or(
        `name.ilike.%${escapado}%,sku.ilike.%${escapado}%,internal_code.ilike.%${escapado}%,barcode.ilike.%${escapado}%`,
      );
    }
    if (data.categoriaId) q = q.eq("category_id", data.categoriaId);
    if (data.apenasAtivos !== false) q = q.eq("active", true);

    if (data.situacao === "sem_estoque") q = q.lte("stock_base", 0);
    else if (data.situacao === "baixo") q = q.gt("stock_base", 0);

    if (data.ordenar === "menor_estoque") q = q.order("stock_base", { ascending: true });
    else if (data.ordenar === "maior_estoque") q = q.order("stock_base", { ascending: false });
    else if (data.ordenar === "recentes") q = q.order("updated_at", { ascending: false });
    else q = q.order("name");

    const de = (pagina - 1) * porPagina;
    const { data: linhas, error, count } = await q.range(de, de + porPagina - 1);
    if (error) throw new Error(error.message);

    let itens = ((linhas ?? []) as ProdutoDeEstoque[]).map((p) => ({
      ...p,
      stock_base: Number(p.stock_base),
      min_stock_base: Number(p.min_stock_base),
      situacao: situacaoDoEstoque({
        stock_base: Number(p.stock_base),
        min_stock_base: Number(p.min_stock_base),
      }),
    }));

    // "Estoque baixo" compara duas colunas entre si, e o filtro do banco não
    // faz isso direto. O banco já cortou o grosso (só os com saldo acima de
    // zero); aqui sobra só a peneira fina da página atual.
    if (data.situacao === "baixo") itens = itens.filter((p) => p.situacao === "baixo");

    return { itens, total: count ?? itens.length, pagina, porPagina };
  });

export const salvarProdutoDeEstoque = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      tenantId: string;
      id?: string;
      name: string;
      description?: string | null;
      categoryId?: string | null;
      brand?: string | null;
      sku?: string | null;
      barcode?: string | null;
      internalCode?: string | null;
      imageUrl?: string | null;
      costCents?: number;
      priceCents?: number;
      baseUnit?: string;
      minStockBase?: number;
      idealStockBase?: number | null;
      allowNegativeStock?: boolean;
      lowStockAlertEnabled?: boolean;
      location?: string | null;
      active?: boolean;
    }) => d,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    const nome = (data.name ?? "").trim();
    if (!nome) throw new Error("O produto precisa de um nome.");

    const inteiroNaoNegativo = (v: unknown) => Math.max(0, Math.round(Number(v ?? 0) || 0));

    const linha = {
      pizzeria_id: data.tenantId,
      name: nome,
      description: data.description ?? null,
      category_id: data.categoryId || null,
      brand: data.brand ?? null,
      sku: data.sku?.trim() || null,
      barcode: data.barcode?.trim() || null,
      internal_code: data.internalCode?.trim() || null,
      image_url: data.imageUrl ?? null,
      cost_cents: inteiroNaoNegativo(data.costCents),
      price_cents: inteiroNaoNegativo(data.priceCents),
      base_unit: (data.baseUnit ?? "unidade").trim() || "unidade",
      min_stock_base: Math.max(0, Number(data.minStockBase ?? 0) || 0),
      ideal_stock_base: data.idealStockBase ?? null,
      allow_negative_stock: !!data.allowNegativeStock,
      low_stock_alert_enabled: data.lowStockAlertEnabled !== false,
      location: data.location ?? null,
      active: data.active !== false,
      updated_at: new Date().toISOString(),
    };

    // O SALDO NÃO ESTÁ AQUI, DE PROPÓSITO.
    //
    // Cadastrar e corrigir a ficha do produto é uma coisa; mexer na quantidade
    // é outra, e essa só acontece por movimentação registrada. Se este
    // formulário pudesse gravar "estoque = 30", o extrato deixaria de explicar
    // o saldo no primeiro dia de uso.
    if (data.id) {
      const { error } = await context.supabase
        .from("inventory_products")
        .update(linha)
        .eq("id", data.id)
        .eq("pizzeria_id", data.tenantId);
      if (error) throw new Error(traduzirConflito(error.message));
      return { id: data.id };
    }

    const { data: criado, error } = await context.supabase
      .from("inventory_products")
      .insert(linha)
      .select("id")
      .single();
    if (error) throw new Error(traduzirConflito(error.message));
    return { id: (criado as { id: string }).id };
  });

function traduzirConflito(msg: string): string {
  if (msg.includes("inventory_products_barcode_unico"))
    return "Já existe outro produto com este código de barras nesta loja.";
  if (msg.includes("inventory_products_sku_unico"))
    return "Já existe outro produto com este SKU nesta loja.";
  if (msg.includes("inventory_products_codigo_interno_unico"))
    return "Já existe outro produto com este código interno nesta loja.";
  return msg;
}

/**
 * Aposentar o produto, nunca apagar.
 *
 * Apagar a linha levaria junto todo o extrato dele — as entradas, as vendas,
 * as perdas. No dia em que alguém perguntasse "quanto compramos de Coca-Cola
 * ano passado?", a resposta teria sumido.
 */
export const arquivarProdutoDeEstoque = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string; id: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);
    const { error } = await context.supabase
      .from("inventory_products")
      .update({ active: false, deleted_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("pizzeria_id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// MOVIMENTAÇÕES
// ---------------------------------------------------------------------------

export const registrarMovimentacao = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      tenantId: string;
      productId: string;
      direction: "in" | "out";
      reason: string;
      quantity: number;
      unit?: string | null;
      notes?: string | null;
      supplierId?: string | null;
    }) => d,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    const { data: r, error } = await context.supabase.rpc("inventory_apply_movement", {
      p_product_id: data.productId,
      p_direction: data.direction,
      p_reason: data.reason,
      p_quantity: data.quantity,
      p_unit: data.unit ?? null,
      p_notes: data.notes ?? null,
      p_supplier_id: data.supplierId ?? null,
      p_user_id: context.userId,
    });

    if (error) throw new Error(mensagemDeErro(error.message));
    return r as unknown as ResultadoDaMovimentacao;
  });

export const listarMovimentacoes = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { tenantId: string; productId?: string; pagina?: number; desdeIso?: string }) => d,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    const porPagina = 40;
    const pagina = Math.max(1, data.pagina ?? 1);
    const de = (pagina - 1) * porPagina;

    let q = context.supabase
      .from("inventory_movements")
      .select(
        "id, product_id, direction, reason, quantity, unit, quantity_base, stock_before, stock_after, notes, created_at, user_id, order_id, pos_sale_id",
        { count: "exact" },
      )
      .eq("pizzeria_id", data.tenantId)
      .order("created_at", { ascending: false });

    if (data.productId) q = q.eq("product_id", data.productId);
    if (data.desdeIso) q = q.gte("created_at", data.desdeIso);

    const { data: linhas, error, count } = await q.range(de, de + porPagina - 1);
    if (error) throw new Error(error.message);
    return { itens: linhas ?? [], total: count ?? 0, pagina, porPagina };
  });

// ---------------------------------------------------------------------------
// VENDA NO BALCÃO
// ---------------------------------------------------------------------------

export const finalizarVendaNoBalcao = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      tenantId: string;
      itens: Array<{ productId: string; quantity: number; unit?: string | null }>;
      paymentMethod?: string | null;
      discountCents?: number;
      surchargeCents?: number;
      customerName?: string | null;
      notes?: string | null;
    }) => d,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    if (!Array.isArray(data.itens) || data.itens.length === 0) {
      throw new Error("Adicione ao menos um produto para finalizar a venda.");
    }

    // O preço NÃO viaja daqui para o banco: quem decide quanto custa é a ficha
    // do produto, dentro da função `pos_finalize_sale`. Mandar o preço junto
    // seria deixar o cliente escrever o valor na própria comanda.
    const itens = data.itens.map((i) => ({
      product_id: i.productId,
      quantity: Number(i.quantity),
      unit: i.unit ?? null,
    }));

    const { data: r, error } = await context.supabase.rpc("pos_finalize_sale", {
      p_pizzeria_id: data.tenantId,
      p_items: itens,
      p_payment_method: data.paymentMethod ?? null,
      p_discount_cents: Math.max(0, Math.round(data.discountCents ?? 0)),
      p_surcharge_cents: Math.max(0, Math.round(data.surchargeCents ?? 0)),
      p_customer_name: data.customerName ?? null,
      p_notes: data.notes ?? null,
    });

    if (error) throw new Error(mensagemDeErro(error.message));
    return r as unknown as ResultadoDaVenda;
  });

// ---------------------------------------------------------------------------
// CATEGORIAS
// ---------------------------------------------------------------------------

export const listarCategoriasDeEstoque = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);
    const { data: linhas, error } = await context.supabase
      .from("inventory_categories")
      .select("id, name, sort_order, active")
      .eq("pizzeria_id", data.tenantId)
      .order("sort_order")
      .order("name");
    if (error) throw new Error(error.message);
    return (linhas ?? []) as Array<{
      id: string;
      name: string;
      sort_order: number;
      active: boolean;
    }>;
  });

export const salvarCategoriaDeEstoque = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string; id?: string; name: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);
    const nome = (data.name ?? "").trim();
    if (!nome) throw new Error("A categoria precisa de um nome.");

    if (data.id) {
      const { error } = await context.supabase
        .from("inventory_categories")
        .update({ name: nome, updated_at: new Date().toISOString() })
        .eq("id", data.id)
        .eq("pizzeria_id", data.tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: criada, error } = await context.supabase
      .from("inventory_categories")
      .insert({ pizzeria_id: data.tenantId, name: nome })
      .select("id")
      .single();
    if (error) {
      if (error.message.includes("inventory_categories_uma_por_loja")) {
        throw new Error(`Já existe uma categoria chamada "${nome}".`);
      }
      throw new Error(error.message);
    }
    return { id: (criada as { id: string }).id };
  });

/**
 * Categoria com produtos dentro não some sem aviso.
 *
 * Apagar levaria os produtos para "sem categoria" em silêncio, e o dono só
 * descobriria ao procurar as bebidas e achar a prateleira vazia.
 */
export const excluirCategoriaDeEstoque = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string; id: string; confirmado?: boolean }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    const { count } = await context.supabase
      .from("inventory_products")
      .select("id", { count: "exact", head: true })
      .eq("pizzeria_id", data.tenantId)
      .eq("category_id", data.id)
      .is("deleted_at", null);

    const quantos = count ?? 0;
    if (quantos > 0 && !data.confirmado) {
      return { precisaConfirmar: true, produtos: quantos };
    }

    const { error } = await context.supabase
      .from("inventory_categories")
      .delete()
      .eq("id", data.id)
      .eq("pizzeria_id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true, produtosRealocados: quantos };
  });

// ---------------------------------------------------------------------------
// CONFIGURAÇÕES DO MÓDULO
// ---------------------------------------------------------------------------

export const lerConfiguracoesDeEstoque = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);
    const { data: linha } = await context.supabase
      .from("inventory_settings")
      .select("deduct_on_status, auto_deduct_orders, low_stock_notifications")
      .eq("pizzeria_id", data.tenantId)
      .maybeSingle();

    return {
      deduct_on_status: (linha?.deduct_on_status as string) ?? "preparando",
      auto_deduct_orders: linha?.auto_deduct_orders ?? true,
      low_stock_notifications: linha?.low_stock_notifications ?? true,
    };
  });

export const salvarConfiguracoesDeEstoque = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      tenantId: string;
      deductOnStatus?: string;
      autoDeductOrders?: boolean;
      lowStockNotifications?: boolean;
    }) => d,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    const momentos = ["novo", "preparando", "saiu", "entregue"];
    const momento = momentos.includes(data.deductOnStatus ?? "")
      ? data.deductOnStatus
      : "preparando";

    const { error } = await context.supabase.from("inventory_settings").upsert(
      {
        pizzeria_id: data.tenantId,
        deduct_on_status: momento,
        auto_deduct_orders: data.autoDeductOrders !== false,
        low_stock_notifications: data.lowStockNotifications !== false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "pizzeria_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
