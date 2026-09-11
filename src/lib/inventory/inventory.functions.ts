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

// ---------------------------------------------------------------------------
// UM PRODUTO E SUAS EMBALAGENS
// ---------------------------------------------------------------------------

export const lerProdutoDeEstoque = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string; id: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    const { data: produto, error } = await context.supabase
      .from("inventory_products")
      .select("*")
      .eq("id", data.id)
      .eq("pizzeria_id", data.tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!produto) throw new Error("Produto não encontrado no estoque desta loja.");

    const { data: conversoes } = await context.supabase
      .from("inventory_package_conversions")
      .select("id, unit, base_quantity")
      .eq("product_id", data.id)
      .order("base_quantity");

    return {
      produto: produto as unknown as ProdutoDeEstoque & {
        description: string | null;
        brand: string | null;
        low_stock_alert_enabled: boolean;
        location: string | null;
      },
      conversoes: (
        (conversoes ?? []) as Array<{
          id: string;
          unit: string;
          base_quantity: number;
        }>
      ).map((c) => ({ ...c, base_quantity: Number(c.base_quantity) })),
    };
  });

/**
 * "1 caixa = 12 unidades".
 *
 * Sem esta ficha, uma entrada de 10 caixas seria recusada pelo motor — ele se
 * recusa a chutar que caixa é o mesmo que unidade, porque chutar
 * transformaria 120 latas em 10 e o saldo passaria a mentir em silêncio.
 */
export const salvarConversaoDeEmbalagem = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { tenantId: string; productId: string; unit: string; baseQuantity: number }) => d,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    const unidade = (data.unit ?? "").trim();
    if (!unidade) throw new Error("Dê um nome à embalagem (caixa, fardo, pacote…).");
    if (!(data.baseQuantity > 0)) {
      throw new Error("Diga quantas unidades cabem nessa embalagem — precisa ser maior que zero.");
    }

    // O produto precisa ser desta loja. Sem esta conferência, alguém poderia
    // pendurar uma embalagem na ficha de um produto do vizinho.
    const { data: dono } = await context.supabase
      .from("inventory_products")
      .select("id")
      .eq("id", data.productId)
      .eq("pizzeria_id", data.tenantId)
      .maybeSingle();
    if (!dono) throw new Error("Produto não encontrado no estoque desta loja.");

    const { error } = await context.supabase.from("inventory_package_conversions").insert({
      pizzeria_id: data.tenantId,
      product_id: data.productId,
      unit: unidade,
      base_quantity: data.baseQuantity,
    });

    if (error) {
      if (error.message.includes("inventory_package_uma_por_produto")) {
        throw new Error(`Este produto já tem uma embalagem chamada "${unidade}".`);
      }
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const excluirConversaoDeEmbalagem = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string; id: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);
    const { error } = await context.supabase
      .from("inventory_package_conversions")
      .delete()
      .eq("id", data.id)
      .eq("pizzeria_id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * A busca do PDV: nome, SKU, código interno ou código de barras.
 *
 * Devolve pouca coisa e no máximo 20 itens, porque isso roda a cada tecla
 * digitada no balcão com o cliente esperando.
 */
export const buscarProdutosParaVenda = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string; termo: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    const termo = (data.termo ?? "").trim();
    if (!termo) return [];
    const escapado = termo.replace(/[%,()]/g, "");

    const { data: linhas, error } = await context.supabase
      .from("inventory_products")
      .select(
        "id, name, image_url, price_cents, base_unit, stock_base, min_stock_base, barcode, sku",
      )
      .eq("pizzeria_id", data.tenantId)
      .eq("active", true)
      .is("deleted_at", null)
      .or(
        `name.ilike.%${escapado}%,sku.ilike.%${escapado}%,internal_code.ilike.%${escapado}%,barcode.ilike.%${escapado}%`,
      )
      .order("name")
      .limit(20);

    if (error) throw new Error(error.message);
    return ((linhas ?? []) as Array<Record<string, unknown>>).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      image_url: (p.image_url as string) ?? null,
      price_cents: Number(p.price_cents),
      base_unit: p.base_unit as string,
      stock_base: Number(p.stock_base),
      min_stock_base: Number(p.min_stock_base),
      barcode: (p.barcode as string) ?? null,
      sku: (p.sku as string) ?? null,
    }));
  });

// ---------------------------------------------------------------------------
// IMPORTAÇÃO POR JSON
// ---------------------------------------------------------------------------

export type AcaoDoProduto = "criar" | "atualizar" | "ignorar";

export type ProdutoParaImportar = {
  nome: string;
  sku?: string;
  codigoBarras?: string;
  categoria?: string;
  marca?: string;
  descricao?: string;
  imagemUrl?: string;
  unidadeBase?: string;
  quantidadeEstoque?: number;
  estoqueMinimo?: number;
  precoCustoCents?: number;
  precoVendaCents?: number;
  ativo?: boolean;
  embalagens?: Array<{ unidade: string; quantidade: number; precoCents: number | null }>;
  acao?: AcaoDoProduto;
  produtoExistenteId?: string | null;
};

export type ProdutoJaExistente = {
  /** Índice do produto na lista enviada, para a tela casar com a linha certa. */
  indice: number;
  existenteId: string;
  existenteNome: string;
  /** Por qual campo bateu — é o que a tela explica ao lojista. */
  motivo: "codigo_barras" | "sku" | "nome_e_categoria" | "nome";
};

function normalizarChave(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Quais destes produtos já existem no estoque desta loja?
 *
 * A ordem da comparação vai do mais confiável para o menos: código de barras
 * é único no mundo; SKU é único na loja; nome é palpite. Comparar primeiro
 * pelo nome faria "Coca-Cola 2L" e "Coca Cola 2 Litros" passarem como
 * produtos diferentes, e dois códigos de barras iguais passarem como iguais —
 * exatamente ao contrário do que interessa.
 *
 * Isto NÃO decide nada: só informa a tela, para o lojista escolher entre
 * ignorar, atualizar ou criar assim mesmo.
 */
export const conferirDuplicidadeDeProdutos = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      tenantId: string;
      produtos: Array<{ nome: string; sku?: string; codigoBarras?: string; categoria?: string }>;
    }) => d,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<ProdutoJaExistente[]> => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    if (!Array.isArray(data.produtos) || data.produtos.length === 0) return [];

    // Uma consulta só para a loja inteira. Perguntar produto por produto daria
    // mil idas ao banco numa importação de mil itens.
    const { data: existentes, error } = await context.supabase
      .from("inventory_products")
      .select("id, name, sku, barcode, category_id, inventory_categories(name)")
      .eq("pizzeria_id", data.tenantId)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);

    type Linha = {
      id: string;
      name: string;
      sku: string | null;
      barcode: string | null;
      inventory_categories?: { name?: string } | null;
    };

    const lista = (existentes ?? []) as unknown as Linha[];
    const porCodigo = new Map<string, Linha>();
    const porSku = new Map<string, Linha>();
    const porNomeCategoria = new Map<string, Linha>();
    const porNome = new Map<string, Linha>();

    for (const p of lista) {
      if (p.barcode?.trim()) porCodigo.set(p.barcode.trim(), p);
      if (p.sku?.trim()) porSku.set(normalizarChave(p.sku), p);
      const chaveNome = normalizarChave(p.name);
      const categoria = normalizarChave(p.inventory_categories?.name ?? "");
      porNomeCategoria.set(`${chaveNome}|${categoria}`, p);
      if (!porNome.has(chaveNome)) porNome.set(chaveNome, p);
    }

    const achados: ProdutoJaExistente[] = [];

    data.produtos.forEach((novo, indice) => {
      const codigo = novo.codigoBarras?.trim();
      const sku = novo.sku?.trim();
      const chaveNome = normalizarChave(novo.nome);
      const chaveCategoria = normalizarChave(novo.categoria ?? "");

      let achado: Linha | undefined;
      let motivo: ProdutoJaExistente["motivo"] = "nome";

      if (codigo && porCodigo.has(codigo)) {
        achado = porCodigo.get(codigo);
        motivo = "codigo_barras";
      } else if (sku && porSku.has(normalizarChave(sku))) {
        achado = porSku.get(normalizarChave(sku));
        motivo = "sku";
      } else if (porNomeCategoria.has(`${chaveNome}|${chaveCategoria}`)) {
        achado = porNomeCategoria.get(`${chaveNome}|${chaveCategoria}`);
        motivo = "nome_e_categoria";
      } else if (porNome.has(chaveNome)) {
        achado = porNome.get(chaveNome);
        motivo = "nome";
      }

      if (achado) {
        achados.push({
          indice,
          existenteId: achado.id,
          existenteNome: achado.name,
          motivo,
        });
      }
    });

    return achados;
  });

export type ResultadoDaImportacao = {
  import_id: string;
  repetida: boolean;
  total_received: number;
  total_created: number;
  total_updated: number;
  total_skipped: number;
  total_errors: number;
  errors: Array<{ nome: string; mensagem: string }>;
};

/**
 * Grava a importação.
 *
 * O `chaveDeImportacao` é a senha desta importação específica, criada pela
 * tela. Se o dono clicar duas vezes, ou a internet cair e o navegador tentar
 * de novo, a segunda chegada devolve o resultado da primeira sem cadastrar
 * nada — é o caderno de reservas que só aceita um nome por mesa.
 */
export const importarProdutosPorJson = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { tenantId: string; chaveDeImportacao: string; produtos: ProdutoParaImportar[] }) => d,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<ResultadoDaImportacao> => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    if (!Array.isArray(data.produtos) || data.produtos.length === 0) {
      throw new Error("Selecione ao menos um produto para importar.");
    }
    if (data.produtos.length > 1000) {
      throw new Error("O limite é de 1000 produtos por importação. Divida em partes.");
    }
    if (!data.chaveDeImportacao?.trim()) {
      throw new Error("Importação sem identificação. Recarregue a tela e tente de novo.");
    }

    // O que vai para o banco é montado AQUI, campo por campo. O navegador não
    // manda tenant_id, nem id de produto solto, nem nada que decida acesso:
    // a loja é a que o servidor conferiu, e só.
    const paraGravar = data.produtos.map((p) => ({
      nome: String(p.nome ?? "").trim(),
      sku: p.sku ?? "",
      codigo_barras: p.codigoBarras ?? "",
      categoria: p.categoria ?? "",
      marca: p.marca ?? "",
      descricao: p.descricao ?? "",
      imagem_url: p.imagemUrl ?? "",
      unidade_base: p.unidadeBase || "unidade",
      quantidade_estoque: Math.max(0, Number(p.quantidadeEstoque ?? 0) || 0),
      estoque_minimo: Math.max(0, Number(p.estoqueMinimo ?? 0) || 0),
      preco_custo_cents: Math.max(0, Math.round(Number(p.precoCustoCents ?? 0) || 0)),
      preco_venda_cents: Math.max(0, Math.round(Number(p.precoVendaCents ?? 0) || 0)),
      ativo: p.ativo !== false,
      acao: p.acao ?? "criar",
      produto_existente_id: p.acao === "atualizar" ? (p.produtoExistenteId ?? null) : null,
      embalagens: (p.embalagens ?? [])
        .filter((e) => e && e.unidade && Number(e.quantidade) > 0)
        .map((e) => ({
          unidade: String(e.unidade).trim(),
          quantidade: Number(e.quantidade),
          preco_cents: e.precoCents != null ? Math.max(0, Math.round(e.precoCents)) : null,
        })),
    }));

    const { data: r, error } = await context.supabase.rpc("inventory_import_products", {
      p_pizzeria_id: data.tenantId,
      p_products: paraGravar,
      p_idempotency_key: data.chaveDeImportacao.trim(),
      p_user_id: context.userId,
    });

    if (error) {
      console.error("[estoque] importacao falhou:", error.message);
      throw new Error(mensagemDeErro(error.message));
    }

    return r as unknown as ResultadoDaImportacao;
  });
