/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Monta o cardápio de uma loja no formato que a IA de atendimento consome.
 *
 * DUAS REGRAS QUE MANDAM AQUI
 *
 * 1. NUNCA OFERECER O QUE NÃO PODE VENDER. Um item fora do ar, desativado ou
 *    sem ingrediente no estoque sai da lista — não vai marcado como
 *    "indisponível", simplesmente NÃO APARECE. Modelo de linguagem que lê
 *    "indisponível" acaba oferecendo assim mesmo, e aí o restaurante precisa
 *    desdizer o próprio atendimento na frente do cliente.
 *
 * 2. O TEXTO É A ENTREGA PRINCIPAL. Pedir para a IA interpretar JSON cru gasta
 *    mais e erra mais do que entregar a lista já escrita em português. O
 *    formato estruturado fica junto para quem precisar fazer conta.
 *
 * Esta função é separada do endereço de rede de propósito: assim ela pode ser
 * testada sem subir servidor nenhum.
 */

export type ItemCardapio = {
  /**
   * O número do produto no cardápio. Vai junto porque o pedido montado pela IA
   * precisa apontar para o produto DE VERDADE — dois pratos podem se chamar
   * "Pastel de queijo" com preços diferentes, e o nome sozinho não decide qual.
   */
  id: string;
  nome: string;
  descricao: string | null;
  preco_cents: number;
  categoria: string;
};

export type CategoriaCardapio = { categoria: string; itens: ItemCardapio[] };

export type Catalogo = {
  loja: {
    nome: string;
    tipo: string | null;
    aberta: boolean | null;
    faz_entrega: boolean | null;
  };
  cardapio: CategoriaCardapio[];
  tamanhos_pizza: Array<{ nome: string; preco_cents: number; sabores: number | null }>;
  combos: Array<{ nome: string; descricao: string | null; preco_cents: number }>;
  adicionais: Array<{ nome: string; preco_cents: number }>;
  indisponiveis: string[];
  texto: string;
};

/** Dinheiro sempre em centavos inteiros — a regra da casa. */
function paraCentavos(valor: unknown): number {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function reais(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * O combo está no ar AGORA?
 *
 * Combo de segunda-feira anunciado num sábado é promessa que a cozinha não
 * cumpre. A conferência é feita no horário de Brasília, que é o horário em que
 * o restaurante vive — o servidor roda em UTC e usar a hora dele faria a
 * promoção da noite virar promoção da madrugada.
 */
export function comboNoAr(combo: any, agora: Date = new Date()): boolean {
  if (combo?.active === false) return false;

  const brasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);

  if (combo?.starts_at && new Date(combo.starts_at) > agora) return false;
  if (combo?.ends_at && new Date(combo.ends_at) < agora) return false;

  const dias: unknown = combo?.available_days;
  if (Array.isArray(dias) && dias.length > 0) {
    const hoje = brasilia.getUTCDay();
    const aceita = dias.some((d) => Number(d) === hoje);
    if (!aceita) return false;
  }

  const hhmm = `${String(brasilia.getUTCHours()).padStart(2, "0")}:${String(
    brasilia.getUTCMinutes(),
  ).padStart(2, "0")}`;
  const inicio = typeof combo?.start_time === "string" ? combo.start_time.slice(0, 5) : null;
  const fim = typeof combo?.end_time === "string" ? combo.end_time.slice(0, 5) : null;
  if (inicio && fim) {
    // Faixa que vira a noite (22:00 às 02:00) é a soma de dois pedaços.
    const dentro = inicio <= fim ? hhmm >= inicio && hhmm <= fim : hhmm >= inicio || hhmm <= fim;
    if (!dentro) return false;
  }

  return true;
}

export async function montarCatalogo(supabase: any, tenantId: string): Promise<Catalogo> {
  const db = (t: string) => (supabase as any).from(t);

  const [loja, categorias, produtos, tamanhos, combos, adicionais, vinculos] = await Promise.all([
    db("pizzerias")
      .select("name, business_type, is_open, delivery_enabled")
      .eq("id", tenantId)
      .maybeSingle(),
    db("menu_categories")
      .select("id, name, active, order_index")
      .eq("pizzeria_id", tenantId)
      .eq("active", true)
      .order("order_index"),
    db("menu_products")
      .select("id, category_id, name, description, price, active, available")
      .eq("pizzeria_id", tenantId)
      .eq("active", true)
      .limit(400),
    db("pizzeria_pizza_sizes")
      .select("name, price, max_flavors, active, sort_order")
      .eq("pizzeria_id", tenantId)
      .eq("active", true)
      .order("sort_order"),
    db("combos")
      .select(
        "name, description, combo_price, active, available_days, start_time, end_time, starts_at, ends_at",
      )
      .eq("pizzeria_id", tenantId)
      .eq("active", true),
    db("menu_extras").select("name, price, active").eq("pizzeria_id", tenantId).eq("active", true),
    db("menu_product_inventory_links")
      .select(
        "menu_product_id, quantity_base, inventory_products(name, stock_base, allow_negative_stock, active)",
      )
      .eq("pizzeria_id", tenantId),
  ]);

  const indisponiveis: string[] = [];

  // ── O QUE O ESTOQUE DERRUBA ──────────────────────────────────────────────
  //
  // Se a ficha técnica do prato aponta para um ingrediente que acabou, o prato
  // sai do cardápio. Só derruba quando a loja NÃO permite estoque negativo —
  // quem permite é porque prefere vender e repor depois, e não cabe a nós
  // decidir o contrário por ela.
  const semIngrediente = new Set<string>();
  for (const v of (vinculos?.data ?? []) as any[]) {
    const ing = v.inventory_products;
    if (!ing || ing.active === false) continue;
    if (ing.allow_negative_stock === true) continue;
    const saldo = Number(ing.stock_base ?? 0);
    const precisa = Number(v.quantity_base ?? 0) || 0;
    if (saldo <= 0 || (precisa > 0 && saldo < precisa)) {
      semIngrediente.add(String(v.menu_product_id));
    }
  }

  const nomeCategoria = new Map<string, string>();
  for (const c of (categorias?.data ?? []) as any[])
    nomeCategoria.set(String(c.id), String(c.name));

  const porCategoria = new Map<string, ItemCardapio[]>();
  for (const p of (produtos?.data ?? []) as any[]) {
    const categoria = nomeCategoria.get(String(p.category_id)) ?? "Outros";

    if (p.available === false) {
      indisponiveis.push(`${p.name} (desligado no cardápio)`);
      continue;
    }
    if (semIngrediente.has(String(p.id))) {
      indisponiveis.push(`${p.name} (sem ingrediente no estoque)`);
      continue;
    }

    const lista = porCategoria.get(categoria) ?? [];
    lista.push({
      id: String(p.id),
      nome: String(p.name),
      descricao: p.description ? String(p.description) : null,
      preco_cents: paraCentavos(p.price),
      categoria,
    });
    porCategoria.set(categoria, lista);
  }

  const cardapio: CategoriaCardapio[] = Array.from(porCategoria.entries()).map(
    ([categoria, itens]) => ({ categoria, itens }),
  );

  const tamanhosLista = ((tamanhos?.data ?? []) as any[]).map((t) => ({
    nome: String(t.name),
    preco_cents: paraCentavos(t.price),
    sabores: t.max_flavors ?? null,
  }));

  const combosLista = ((combos?.data ?? []) as any[])
    .filter((c) => comboNoAr(c))
    .map((c) => ({
      nome: String(c.name),
      descricao: c.description ? String(c.description) : null,
      preco_cents: paraCentavos(c.combo_price),
    }));

  const adicionaisLista = ((adicionais?.data ?? []) as any[]).map((a) => ({
    nome: String(a.name),
    preco_cents: paraCentavos(a.price),
  }));

  return {
    loja: {
      nome: String(loja?.data?.name ?? "").trim() || "a loja",
      tipo: loja?.data?.business_type ?? null,
      aberta: loja?.data?.is_open ?? null,
      faz_entrega: loja?.data?.delivery_enabled ?? null,
    },
    cardapio,
    tamanhos_pizza: tamanhosLista,
    combos: combosLista,
    adicionais: adicionaisLista,
    indisponiveis,
    texto: escreverEmPortugues({
      nomeLoja: String(loja?.data?.name ?? "").trim() || "a loja",
      aberta: loja?.data?.is_open ?? null,
      fazEntrega: loja?.data?.delivery_enabled ?? null,
      cardapio,
      tamanhos: tamanhosLista,
      combos: combosLista,
      adicionais: adicionaisLista,
    }),
  };
}

/** A lista escrita do jeito que uma pessoa leria em voz alta. */
function escreverEmPortugues(d: {
  nomeLoja: string;
  aberta: boolean | null;
  fazEntrega: boolean | null;
  cardapio: CategoriaCardapio[];
  tamanhos: Catalogo["tamanhos_pizza"];
  combos: Catalogo["combos"];
  adicionais: Catalogo["adicionais"];
}): string {
  const linhas: string[] = [`CARDÁPIO DE ${d.nomeLoja.toUpperCase()} (disponível agora)`, ""];

  // A situação da loja vem ANTES do cardápio. De nada adianta a IA descrever
  // o hambúrguer com carinho e fechar o pedido se a cozinha está fechada —
  // é o garçom anotando a comanda com as luzes do salão já apagadas.
  if (d.aberta === false) {
    linhas.push(
      "⚠️ A LOJA ESTÁ FECHADA AGORA. Avise o cliente antes de anotar qualquer pedido.",
      "",
    );
  } else if (d.aberta === true) {
    linhas.push("A loja está ABERTA agora.", "");
  }
  if (d.fazEntrega === false) {
    linhas.push("Esta loja NÃO faz entrega: é retirada no balcão ou consumo no local.", "");
  }

  if (d.cardapio.length === 0) {
    linhas.push("Nenhum item disponível no momento.");
  }

  for (const c of d.cardapio) {
    linhas.push(`## ${c.categoria}`);
    for (const i of c.itens) {
      const desc = i.descricao ? ` — ${i.descricao}` : "";
      linhas.push(`- ${i.nome}: ${reais(i.preco_cents)}${desc}`);
    }
    linhas.push("");
  }

  if (d.tamanhos.length > 0) {
    linhas.push("## Tamanhos de pizza");
    for (const t of d.tamanhos) {
      const sab = t.sabores ? ` (até ${t.sabores} sabores)` : "";
      linhas.push(`- ${t.nome}: ${reais(t.preco_cents)}${sab}`);
    }
    linhas.push("");
  }

  if (d.combos.length > 0) {
    linhas.push("## Combos no ar agora");
    for (const c of d.combos) {
      const desc = c.descricao ? ` — ${c.descricao}` : "";
      linhas.push(`- ${c.nome}: ${reais(c.preco_cents)}${desc}`);
    }
    linhas.push("");
  }

  if (d.adicionais.length > 0) {
    linhas.push("## Adicionais");
    linhas.push(d.adicionais.map((a) => `${a.nome} (${reais(a.preco_cents)})`).join(", "));
    linhas.push("");
  }

  linhas.push(
    "REGRA: ofereça SOMENTE o que está escrito acima. Se o cliente pedir algo que",
    "não está na lista, diga que hoje não tem e ofereça a opção mais parecida.",
  );

  return linhas.join("\n");
}
