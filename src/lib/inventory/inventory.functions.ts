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

// ============================================================================
// FICHA TÉCNICA — o que cada item do cardápio consome do estoque
// ============================================================================
//
// Sem isto, o estoque nunca baixa sozinho. A baixa automática sabe descontar,
// mas não sabe que a Pizza Calabresa gasta 1 disco de massa, 150 g de
// calabresa e 1 embalagem — isso é o dono quem diz, aqui.
//
// É a receita afixada na parede da cozinha: o pedido chega dizendo "uma
// calabresa", e é a receita que traduz isso em quanto sai de cada prateleira.
//
// Um item do cardápio pode puxar vários produtos do estoque (um lanche), ou um
// só (uma lata de refrigerante), ou nenhum — e nesse último caso ele
// simplesmente não mexe no estoque, o que é legítimo para taxa de entrega,
// couvert e afins.

export type LinhaDaFichaTecnica = {
  id: string;
  inventory_product_id: string;
  produto_nome: string;
  produto_unidade: string;
  produto_estoque_atual: number;
  quantity_base: number;
};

export type ItemDeCardapioComFicha = {
  id: string;
  name: string;
  active: boolean;
  categoria: string | null;
  itens_na_ficha: number;
};

/**
 * Os itens do cardápio da loja, cada um com quantos produtos de estoque já
 * estão amarrados nele. A contagem é o que deixa visível, numa olhada, quais
 * itens ainda não descontam nada — que é a pergunta que o dono realmente tem.
 */
export const listarCardapioParaFichaTecnica = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<ItemDeCardapioComFicha[]> => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    const { data: produtos, error } = await context.supabase
      .from("menu_products")
      .select("id, name, active, menu_categories(name)")
      .eq("pizzeria_id", data.tenantId)
      .order("name");
    if (error) throw new Error(error.message);

    const { data: vinculos, error: erroVinculos } = await context.supabase
      .from("menu_product_inventory_links")
      .select("menu_product_id")
      .eq("pizzeria_id", data.tenantId);
    if (erroVinculos) throw new Error(erroVinculos.message);

    const contagem = new Map<string, number>();
    for (const v of vinculos ?? []) {
      contagem.set(v.menu_product_id, (contagem.get(v.menu_product_id) ?? 0) + 1);
    }

    return (produtos ?? []).map((p) => {
      const categoria = p.menu_categories as { name: string } | null;
      return {
        id: p.id,
        name: p.name,
        active: p.active ?? true,
        categoria: categoria?.name ?? null,
        itens_na_ficha: contagem.get(p.id) ?? 0,
      };
    });
  });

export type ProdutoParaFicha = {
  id: string;
  name: string;
  base_unit: string;
};

/**
 * Todos os produtos ativos do estoque, só com o necessário para montar a
 * receita. A listagem normal é paginada de 30 em 30, o que serviria para uma
 * tabela mas não para uma caixa de seleção — o produto da página 4 ficaria
 * invisível para quem monta a receita.
 */
export const listarProdutosParaFicha = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<ProdutoParaFicha[]> => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    const { data: produtos, error } = await context.supabase
      .from("inventory_products")
      .select("id, name, base_unit")
      .eq("pizzeria_id", data.tenantId)
      .eq("active", true)
      .is("deleted_at", null)
      .order("name");
    if (error) throw new Error(error.message);

    return (produtos ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      base_unit: p.base_unit,
    }));
  });

/** A receita de um item do cardápio, já com o nome e o saldo de cada produto. */
export const listarFichaTecnica = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string; menuProductId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<LinhaDaFichaTecnica[]> => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    const { data: linhas, error } = await context.supabase
      .from("menu_product_inventory_links")
      .select("id, inventory_product_id, quantity_base")
      .eq("pizzeria_id", data.tenantId)
      .eq("menu_product_id", data.menuProductId);
    if (error) throw new Error(error.message);
    if (!linhas?.length) return [];

    // Duas consultas em vez de um join: o arquivo de tipos do projeto é mais
    // antigo que estas tabelas e ainda não conhece a ligação entre elas.
    // Buscar em duas etapas funciona igual e não depende disso.
    const { data: produtos, error: erroProdutos } = await context.supabase
      .from("inventory_products")
      .select("id, name, base_unit, stock_base")
      .eq("pizzeria_id", data.tenantId)
      .in(
        "id",
        linhas.map((l) => l.inventory_product_id),
      );
    if (erroProdutos) throw new Error(erroProdutos.message);

    const porId = new Map((produtos ?? []).map((p) => [p.id, p]));

    return linhas.map((l) => {
      const p = porId.get(l.inventory_product_id);
      return {
        id: l.id,
        inventory_product_id: l.inventory_product_id,
        produto_nome: p?.name ?? "(produto removido)",
        produto_unidade: p?.base_unit ?? "un",
        produto_estoque_atual: Number(p?.stock_base ?? 0),
        quantity_base: Number(l.quantity_base),
      };
    });
  });

/**
 * Amarra (ou reajusta) um produto do estoque na receita de um item do cardápio.
 *
 * As duas pontas são conferidas contra a loja de quem está logado. Sem isso,
 * bastaria alterar o envio para pendurar o estoque do vizinho na própria
 * receita — e passar a descontar da prateleira dele a cada venda.
 */
export const salvarVinculoDaFichaTecnica = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      tenantId: string;
      menuProductId: string;
      inventoryProductId: string;
      quantityBase: number;
    }) => d,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    if (!(data.quantityBase > 0)) {
      throw new Error("A quantidade consumida precisa ser maior que zero.");
    }

    const [{ data: doCardapio }, { data: doEstoque }] = await Promise.all([
      context.supabase
        .from("menu_products")
        .select("id")
        .eq("id", data.menuProductId)
        .eq("pizzeria_id", data.tenantId)
        .maybeSingle(),
      context.supabase
        .from("inventory_products")
        .select("id")
        .eq("id", data.inventoryProductId)
        .eq("pizzeria_id", data.tenantId)
        .maybeSingle(),
    ]);

    if (!doCardapio) throw new Error("Item de cardápio não encontrado nesta loja.");
    if (!doEstoque) throw new Error("Produto não encontrado no estoque desta loja.");

    // Repetir o mesmo produto na mesma receita é reajuste, não erro: o dono
    // corrigindo "na verdade gasta 200 g, não 150 g".
    const { error } = await context.supabase.from("menu_product_inventory_links").upsert(
      {
        pizzeria_id: data.tenantId,
        menu_product_id: data.menuProductId,
        inventory_product_id: data.inventoryProductId,
        quantity_base: data.quantityBase,
      },
      { onConflict: "menu_product_id,inventory_product_id" },
    );
    if (error) throw new Error(error.message);

    return { ok: true };
  });

/** Tira um produto da receita. O saldo já movimentado não é tocado. */
export const excluirVinculoDaFichaTecnica = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string; id: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);
    const { error } = await context.supabase
      .from("menu_product_inventory_links")
      .delete()
      .eq("id", data.id)
      .eq("pizzeria_id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================================
// FORNECEDORES
// ============================================================================
//
// A agenda de quem abastece a loja. Serve para dois momentos: registrar de
// quem veio cada entrada de mercadoria e ter o telefone à mão na hora de
// repor o que está acabando.

export type Fornecedor = {
  id: string;
  name: string;
  legal_name: string | null;
  trade_name: string | null;
  tax_id: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
};

export const listarFornecedores = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string; incluirInativos?: boolean }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<Fornecedor[]> => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    let q = context.supabase
      .from("inventory_suppliers")
      .select(
        "id, name, legal_name, trade_name, tax_id, phone, whatsapp, email, address, notes, active",
      )
      .eq("pizzeria_id", data.tenantId);

    if (!data.incluirInativos) q = q.eq("active", true);

    const { data: fornecedores, error } = await q.order("name");
    if (error) throw new Error(error.message);
    return (fornecedores ?? []) as Fornecedor[];
  });

export const salvarFornecedor = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      tenantId: string;
      id?: string;
      name: string;
      legalName?: string;
      tradeName?: string;
      taxId?: string;
      phone?: string;
      whatsapp?: string;
      email?: string;
      address?: string;
      notes?: string;
      active?: boolean;
    }) => d,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    const nome = (data.name ?? "").trim();
    if (!nome) throw new Error("O fornecedor precisa de um nome.");

    const campos = {
      pizzeria_id: data.tenantId,
      name: nome,
      legal_name: data.legalName?.trim() || null,
      trade_name: data.tradeName?.trim() || null,
      tax_id: data.taxId?.trim() || null,
      phone: data.phone?.trim() || null,
      whatsapp: data.whatsapp?.trim() || null,
      email: data.email?.trim() || null,
      address: data.address?.trim() || null,
      notes: data.notes?.trim() || null,
      active: data.active ?? true,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      // O filtro por loja no UPDATE não é redundante: sem ele, bastaria mandar
      // o código de um fornecedor do vizinho para reescrever a ficha dele.
      const { error } = await context.supabase
        .from("inventory_suppliers")
        .update(campos)
        .eq("id", data.id)
        .eq("pizzeria_id", data.tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: criado, error } = await context.supabase
      .from("inventory_suppliers")
      .insert(campos)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: criado.id as string };
  });

/**
 * Fornecedor sai de circulação, mas não some.
 *
 * As entradas antigas apontam para ele: apagar de verdade deixaria o histórico
 * de compras sem dizer de quem veio a mercadoria. É como riscar o nome do
 * fornecedor de todas as notas fiscais antigas por ele ter parado de atender.
 */
export const arquivarFornecedor = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string; id: string; ativo: boolean }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);
    const { error } = await context.supabase
      .from("inventory_suppliers")
      .update({ active: data.ativo, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("pizzeria_id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Chama uma função do banco que o arquivo de tipos ainda não conhece.
 *
 * `src/integrations/supabase/types.ts` é gerado a partir do banco e está mais
 * antigo que as funções da Fase 6. Regerar o arquivo inteiro só por causa
 * disto traria milhares de linhas sem relação com esta mudança — e o arquivo
 * gerado vem numa única linha, impossível de revisar.
 *
 * O nome da função nunca vem de fora: é sempre uma constante escrita aqui.
 */
function rpcDaFase6(
  supabase: ClienteSupabase,
  nome: "inventory_register_entry" | "inventory_start_count" | "inventory_apply_count",
  argumentos: Record<string, unknown>,
) {
  const cliente = supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  return cliente.rpc(nome, argumentos);
}

// ============================================================================
// ENTRADA DE MERCADORIA
// ============================================================================

export type ItemDaEntrada = {
  productId: string;
  quantity: number;
  unit?: string;
  unitCostCents?: number;
  batch?: string;
  expiresAt?: string;
  notes?: string;
};

export type EntradaRegistrada = {
  entry_id: string;
  itens: number;
  total_cents: number;
  repetida: boolean;
};

export type EntradaNaLista = {
  id: string;
  entry_date: string;
  invoice_number: string | null;
  total_cost_cents: number;
  fornecedor: string | null;
  itens: number;
};

/**
 * Lança a chegada da mercadoria: o estoque sobe e a nota fica registrada.
 *
 * A gravação inteira acontece no banco, numa função só — ou entram todos os
 * itens, ou nenhum. Uma nota de 40 itens que gravasse 28 e falhasse no 29
 * deixaria o estoque pior do que antes de começar, e ninguém saberia onde
 * parou para continuar à mão.
 */
export const registrarEntradaDeMercadoria = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      tenantId: string;
      itens: ItemDaEntrada[];
      supplierId?: string;
      invoiceNumber?: string;
      entryDate?: string;
      notes?: string;
      chaveDaEntrada: string;
    }) => d,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<EntradaRegistrada> => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    const itens = data.itens.filter((i) => i.productId && i.quantity > 0);
    if (itens.length === 0) {
      throw new Error("Adicione ao menos um produto com quantidade para lançar a entrada.");
    }

    const { data: r, error } = await rpcDaFase6(context.supabase, "inventory_register_entry", {
      p_pizzeria_id: data.tenantId,
      p_items: itens.map((i) => ({
        product_id: i.productId,
        quantity: i.quantity,
        unit: i.unit ?? null,
        unit_cost_cents: i.unitCostCents != null ? Math.max(0, Math.round(i.unitCostCents)) : 0,
        batch: i.batch ?? null,
        expires_at: i.expiresAt ?? null,
        notes: i.notes ?? null,
      })),
      p_supplier_id: data.supplierId ?? null,
      p_invoice_number: data.invoiceNumber ?? null,
      p_entry_date: data.entryDate ?? null,
      p_notes: data.notes ?? null,
      p_user_id: context.userId,
      p_idempotency_key: data.chaveDaEntrada,
    });

    if (error) throw new Error(mensagemDeErro(error.message));
    return r as unknown as EntradaRegistrada;
  });

export const listarEntradasDeMercadoria = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<EntradaNaLista[]> => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    const { data: entradas, error } = await context.supabase
      .from("inventory_entries")
      .select("id, entry_date, invoice_number, total_cost_cents, supplier_id")
      .eq("pizzeria_id", data.tenantId)
      .order("entry_date", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    if (!entradas?.length) return [];

    // Duas consultas em vez de joins: o arquivo de tipos do projeto ainda não
    // conhece estas tabelas novas, e buscar em etapas funciona igual.
    const [{ data: fornecedores }, { data: itens }] = await Promise.all([
      context.supabase
        .from("inventory_suppliers")
        .select("id, name")
        .eq("pizzeria_id", data.tenantId),
      context.supabase
        .from("inventory_entry_items")
        .select("entry_id")
        .in(
          "entry_id",
          entradas.map((e) => e.id),
        ),
    ]);

    const nomeDoFornecedor = new Map((fornecedores ?? []).map((f) => [f.id, f.name]));
    const contagem = new Map<string, number>();
    for (const i of itens ?? []) {
      contagem.set(i.entry_id, (contagem.get(i.entry_id) ?? 0) + 1);
    }

    return entradas.map((e) => ({
      id: e.id,
      entry_date: e.entry_date,
      invoice_number: e.invoice_number,
      total_cost_cents: Number(e.total_cost_cents ?? 0),
      fornecedor: e.supplier_id ? (nomeDoFornecedor.get(e.supplier_id) ?? null) : null,
      itens: contagem.get(e.id) ?? 0,
    }));
  });

// ============================================================================
// CONTAGEM DE INVENTÁRIO
// ============================================================================

export type ItemDaContagem = {
  id: string;
  product_id: string;
  produto_nome: string;
  produto_unidade: string;
  system_quantity_base: number;
  counted_quantity_base: number | null;
  applied: boolean;
};

export type ContagemAberta = {
  id: string;
  started_at: string;
  status: string;
  itens: ItemDaContagem[];
};

export const abrirContagem = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string; categoriaId?: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    const { data: r, error } = await rpcDaFase6(context.supabase, "inventory_start_count", {
      p_pizzeria_id: data.tenantId,
      p_scope: data.categoriaId ? "categoria" : "todos",
      p_category_id: data.categoriaId ?? null,
      p_user_id: context.userId,
    });

    if (error) {
      if (error.message.includes("CONTAGEM_JA_ABERTA")) {
        throw new Error(
          "Já existe uma contagem em andamento. Termine ou cancele aquela antes de abrir outra.",
        );
      }
      throw new Error(mensagemDeErro(error.message));
    }
    return r as unknown as { count_id: string; itens: number };
  });

/** A contagem em andamento, se houver, com a lista para o dono preencher. */
export const contagemEmAndamento = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<ContagemAberta | null> => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    const { data: contagem, error } = await context.supabase
      .from("inventory_counts")
      .select("id, started_at, status")
      .eq("pizzeria_id", data.tenantId)
      .eq("status", "em_andamento")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!contagem) return null;

    const { data: itens, error: erroItens } = await context.supabase
      .from("inventory_count_items")
      .select("id, product_id, system_quantity_base, counted_quantity_base, applied")
      .eq("count_id", contagem.id);
    if (erroItens) throw new Error(erroItens.message);

    const { data: produtos } = await context.supabase
      .from("inventory_products")
      .select("id, name, base_unit")
      .eq("pizzeria_id", data.tenantId);

    const porId = new Map((produtos ?? []).map((p) => [p.id, p]));

    return {
      id: contagem.id,
      started_at: contagem.started_at,
      status: contagem.status,
      itens: (itens ?? [])
        .map((i) => ({
          id: i.id,
          product_id: i.product_id,
          produto_nome: porId.get(i.product_id)?.name ?? "(produto removido)",
          produto_unidade: porId.get(i.product_id)?.base_unit ?? "un",
          system_quantity_base: Number(i.system_quantity_base),
          counted_quantity_base:
            i.counted_quantity_base === null ? null : Number(i.counted_quantity_base),
          applied: i.applied,
        }))
        .sort((a, b) => a.produto_nome.localeCompare(b.produto_nome, "pt-BR")),
    };
  });

/**
 * Anota o que foi contado na prateleira. Ainda não mexe no saldo — só depois
 * de fechar a contagem é que a diferença vira movimentação.
 */
export const anotarContagem = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string; itemId: string; quantidade: number | null }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    if (data.quantidade !== null && data.quantidade < 0) {
      throw new Error("A quantidade contada não pode ser negativa.");
    }

    // A contagem precisa ser desta loja: sem a conferência, bastaria mandar o
    // código de um item da contagem do vizinho para escrever nela.
    const { data: item } = await context.supabase
      .from("inventory_count_items")
      .select("id, count_id")
      .eq("id", data.itemId)
      .maybeSingle();
    if (!item) throw new Error("Item de contagem não encontrado.");

    const { data: dona } = await context.supabase
      .from("inventory_counts")
      .select("id")
      .eq("id", item.count_id)
      .eq("pizzeria_id", data.tenantId)
      .maybeSingle();
    if (!dona) throw new Error("Esta contagem é de outra loja.");

    const { error } = await context.supabase
      .from("inventory_count_items")
      .update({ counted_quantity_base: data.quantidade })
      .eq("id", data.itemId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Fecha a contagem: cada diferença vira uma movimentação de acerto. */
export const fecharContagem = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string; countId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    const { data: dona } = await context.supabase
      .from("inventory_counts")
      .select("id")
      .eq("id", data.countId)
      .eq("pizzeria_id", data.tenantId)
      .maybeSingle();
    if (!dona) throw new Error("Esta contagem é de outra loja.");

    const { data: r, error } = await rpcDaFase6(context.supabase, "inventory_apply_count", {
      p_count_id: data.countId,
      p_user_id: context.userId,
    });
    if (error) throw new Error(mensagemDeErro(error.message));

    return r as unknown as {
      ajustados: number;
      divergencias: number;
      valor_divergencia_cents: number;
    };
  });

// ============================================================================
// RELATÓRIOS
// ============================================================================
//
// As perguntas que o dono faz no fim do mês: quanto gastei comprando, quanto
// saiu em venda, quanto perdi, e o que está parado ocupando prateleira e
// dinheiro.

export type LinhaDoRelatorio = {
  product_id: string;
  produto: string;
  unidade: string;
  entrou: number;
  saiu_vendido: number;
  perdido: number;
  saldo_atual: number;
  custo_cents: number;
  valor_parado_cents: number;
  dias_sem_mover: number | null;
};

export type RelatorioDeEstoque = {
  compras_cents: number;
  vendido_balcao_cents: number;
  perdas_cents: number;
  valor_em_estoque_cents: number;
  linhas: LinhaDoRelatorio[];
};

/** Motivos que significam "perdeu mercadoria", e não "vendeu". */
const MOTIVOS_DE_PERDA = ["perda", "vencido", "danificado"];
const MOTIVOS_DE_VENDA = ["venda_balcao", "venda_online"];

export const relatorioDeEstoque = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string; de: string; ate: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<RelatorioDeEstoque> => {
    await assertEstoque(context.supabase, context.userId, data.tenantId);

    const [{ data: produtos, error }, { data: movimentos, error: erroMov }] = await Promise.all([
      context.supabase
        .from("inventory_products")
        .select("id, name, base_unit, stock_base, cost_cents")
        .eq("pizzeria_id", data.tenantId)
        .eq("active", true)
        .is("deleted_at", null),
      context.supabase
        .from("inventory_movements")
        .select("product_id, direction, reason, quantity_base, created_at")
        .eq("pizzeria_id", data.tenantId)
        .gte("created_at", data.de)
        .lte("created_at", data.ate),
    ]);

    if (error) throw new Error(error.message);
    if (erroMov) throw new Error(erroMov.message);

    // A última vez que cada produto se mexeu — olhando TODO o histórico, não
    // só o período. "Parado há 90 dias" não pode virar "parado há 30" só
    // porque o filtro da tela mostra o último mês.
    const { data: ultimos } = await context.supabase
      .from("inventory_movements")
      .select("product_id, created_at")
      .eq("pizzeria_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(5000);

    const ultimoMovimento = new Map<string, string>();
    for (const m of ultimos ?? []) {
      if (!ultimoMovimento.has(m.product_id)) ultimoMovimento.set(m.product_id, m.created_at);
    }

    const porProduto = new Map<string, { entrou: number; vendido: number; perdido: number }>();
    for (const m of movimentos ?? []) {
      const atual = porProduto.get(m.product_id) ?? { entrou: 0, vendido: 0, perdido: 0 };
      // quantity_base já vem negativo nas saídas; o módulo evita somar
      // subtraindo sem querer.
      const quantidade = Math.abs(Number(m.quantity_base));

      if (m.direction === "in") atual.entrou += quantidade;
      else if (MOTIVOS_DE_PERDA.includes(m.reason)) atual.perdido += quantidade;
      else if (MOTIVOS_DE_VENDA.includes(m.reason)) atual.vendido += quantidade;

      porProduto.set(m.product_id, atual);
    }

    const agora = Date.now();
    let comprasCents = 0;
    let perdasCents = 0;
    let valorEmEstoqueCents = 0;

    const linhas: LinhaDoRelatorio[] = (produtos ?? []).map((p) => {
      const m = porProduto.get(p.id) ?? { entrou: 0, vendido: 0, perdido: 0 };
      const custo = Number(p.cost_cents ?? 0);
      const saldo = Number(p.stock_base);

      comprasCents += Math.round(m.entrou * custo);
      perdasCents += Math.round(m.perdido * custo);
      valorEmEstoqueCents += Math.round(saldo * custo);

      const ultimo = ultimoMovimento.get(p.id);
      const diasSemMover = ultimo
        ? Math.floor((agora - new Date(ultimo).getTime()) / 86_400_000)
        : null;

      return {
        product_id: p.id,
        produto: p.name,
        unidade: p.base_unit,
        entrou: m.entrou,
        saiu_vendido: m.vendido,
        perdido: m.perdido,
        saldo_atual: saldo,
        custo_cents: custo,
        valor_parado_cents: Math.round(saldo * custo),
        dias_sem_mover: diasSemMover,
      };
    });

    const { data: vendas } = await context.supabase
      .from("pos_sales")
      .select("total_cents")
      .eq("pizzeria_id", data.tenantId)
      .eq("status", "concluida")
      .gte("created_at", data.de)
      .lte("created_at", data.ate);

    return {
      compras_cents: comprasCents,
      vendido_balcao_cents: (vendas ?? []).reduce((s, v) => s + Number(v.total_cents ?? 0), 0),
      perdas_cents: perdasCents,
      valor_em_estoque_cents: valorEmEstoqueCents,
      linhas: linhas.sort((a, b) => b.saiu_vendido - a.saiu_vendido),
    };
  });
