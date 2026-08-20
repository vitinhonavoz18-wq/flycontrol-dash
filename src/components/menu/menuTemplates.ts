/**
 * Predefinições de cardápio.
 *
 * Quando uma loja nova ainda não tem nenhuma categoria cadastrada, ela pode
 * escolher um destes modelos em vez de montar tudo do zero — é como baixar um
 * cardápio pronto e só trocar o que for diferente do seu negócio. "Outro"
 * não aplica nada: a loja começa vazia, do jeito que já era antes de existir
 * este seletor.
 *
 * Os preços aqui são só ponto de partida. O dono edita cada um depois, em
 * Cardápio → Sabores/Bebidas/Bordas/Combos, como qualquer produto cadastrado
 * manualmente.
 */

import { supabase } from "@/integrations/supabase/client";

export type MenuTemplateKey = "hamburgueria" | "pizzaria" | "pastelaria";

type TemplateProduct = { name: string; price: number };
type TemplateCategory = { name: string; products: TemplateProduct[] };
type TemplateExtra = { name: string; price: number; extra_type: "borda" | "adicional" };
type TemplateCombo = {
  name: string;
  description: string;
  originalPrice: number;
  comboPrice: number;
  items: { product_name: string; quantity: number }[];
};

export type MenuTemplate = {
  key: MenuTemplateKey;
  label: string;
  description: string;
  categories: TemplateCategory[];
  beverages: TemplateProduct[];
  extras: TemplateExtra[];
  combos: TemplateCombo[];
};

/** Bebidas comuns à maioria dos estabelecimentos — entram em todo modelo. */
const COMMON_BEVERAGES: TemplateProduct[] = [
  { name: "Refrigerante Lata 350ml", price: 6.0 },
  { name: "Refrigerante 2L", price: 12.0 },
  { name: "Água Mineral", price: 4.0 },
  { name: "Suco Natural", price: 8.0 },
];

export const MENU_TEMPLATES: Record<MenuTemplateKey, MenuTemplate> = {
  hamburgueria: {
    key: "hamburgueria",
    label: "Hamburgueria",
    description: "Hambúrgueres, porções e combos prontos para editar.",
    categories: [
      {
        name: "Hambúrgueres",
        products: [
          { name: "X-Burger", price: 18.9 },
          { name: "X-Salada", price: 21.9 },
          { name: "X-Bacon", price: 24.9 },
          { name: "X-Tudo", price: 29.9 },
        ],
      },
      {
        name: "Porções",
        products: [
          { name: "Batata Frita", price: 16.9 },
          { name: "Onion Rings", price: 19.9 },
          { name: "Batata com Cheddar e Bacon", price: 24.9 },
        ],
      },
      {
        name: "Sobremesas",
        products: [
          { name: "Milkshake de Chocolate", price: 14.9 },
          { name: "Brownie com Sorvete", price: 16.9 },
        ],
      },
    ],
    beverages: COMMON_BEVERAGES,
    extras: [
      { name: "Bacon Extra", price: 5.0, extra_type: "adicional" },
      { name: "Queijo Extra", price: 4.0, extra_type: "adicional" },
      { name: "Ovo", price: 3.0, extra_type: "adicional" },
    ],
    combos: [
      {
        name: "Combo X-Burger Clássico",
        description: "X-Burger + batata frita + refrigerante lata",
        originalPrice: 41.8,
        comboPrice: 34.9,
        items: [
          { product_name: "X-Burger", quantity: 1 },
          { product_name: "Batata Frita", quantity: 1 },
          { product_name: "Refrigerante Lata 350ml", quantity: 1 },
        ],
      },
      {
        name: "Combo X-Bacon Duplo",
        description: "X-Bacon + onion rings + refrigerante lata",
        originalPrice: 50.8,
        comboPrice: 42.9,
        items: [
          { product_name: "X-Bacon", quantity: 1 },
          { product_name: "Onion Rings", quantity: 1 },
          { product_name: "Refrigerante Lata 350ml", quantity: 1 },
        ],
      },
    ],
  },

  pizzaria: {
    key: "pizzaria",
    label: "Pizzaria",
    description: "Sabores salgados e doces, com bordas e combos prontos.",
    categories: [
      {
        name: "Pizzas Salgadas",
        products: [
          { name: "Mussarela", price: 39.9 },
          { name: "Calabresa", price: 42.9 },
          { name: "Frango com Catupiry", price: 44.9 },
          { name: "Portuguesa", price: 46.9 },
        ],
      },
      {
        name: "Pizzas Doces",
        products: [
          { name: "Chocolate com Morango", price: 44.9 },
          { name: "Banana com Canela", price: 39.9 },
        ],
      },
    ],
    beverages: COMMON_BEVERAGES,
    extras: [
      { name: "Borda Recheada com Catupiry", price: 8.0, extra_type: "borda" },
      { name: "Borda Recheada com Cheddar", price: 8.0, extra_type: "borda" },
      { name: "Queijo Extra", price: 5.0, extra_type: "adicional" },
    ],
    combos: [
      {
        name: "Combo Pizza Grande + Refri 2L",
        description: "Calabresa + refrigerante 2 litros",
        originalPrice: 54.9,
        comboPrice: 47.9,
        items: [
          { product_name: "Calabresa", quantity: 1 },
          { product_name: "Refrigerante 2L", quantity: 1 },
        ],
      },
      {
        name: "Combo 2 Pizzas Médias",
        description: "Mussarela + Frango com Catupiry",
        originalPrice: 84.8,
        comboPrice: 74.9,
        items: [
          { product_name: "Mussarela", quantity: 1 },
          { product_name: "Frango com Catupiry", quantity: 1 },
        ],
      },
    ],
  },

  pastelaria: {
    key: "pastelaria",
    label: "Pastelaria",
    description: "Pastéis salgados e doces, com caldo de cana e combos.",
    categories: [
      {
        name: "Pastéis Salgados",
        products: [
          { name: "Pastel de Carne", price: 9.0 },
          { name: "Pastel de Queijo", price: 8.5 },
          { name: "Pastel de Frango com Catupiry", price: 10.0 },
          { name: "Pastel de Pizza", price: 9.5 },
        ],
      },
      {
        name: "Pastéis Doces",
        products: [
          { name: "Pastel de Chocolate", price: 9.0 },
          { name: "Pastel de Banana com Canela", price: 8.5 },
        ],
      },
      {
        name: "Porções e Bebidas Especiais",
        products: [
          { name: "Caldo de Cana 300ml", price: 6.0 },
          { name: "Batata Frita", price: 14.9 },
        ],
      },
    ],
    beverages: COMMON_BEVERAGES,
    extras: [
      { name: "Queijo Extra", price: 3.0, extra_type: "adicional" },
      { name: "Catupiry Extra", price: 4.0, extra_type: "adicional" },
    ],
    combos: [
      {
        name: "Combo 2 Pastéis + Caldo de Cana",
        description: "2 pastéis de carne + caldo de cana 300ml",
        originalPrice: 24.0,
        comboPrice: 19.9,
        items: [
          { product_name: "Pastel de Carne", quantity: 2 },
          { product_name: "Caldo de Cana 300ml", quantity: 1 },
        ],
      },
      {
        name: "Combo Pastel Doce + Refri",
        description: "Pastel de chocolate + refrigerante lata",
        originalPrice: 15.0,
        comboPrice: 12.9,
        items: [
          { product_name: "Pastel de Chocolate", quantity: 1 },
          { product_name: "Refrigerante Lata 350ml", quantity: 1 },
        ],
      },
    ],
  },
};

export type ApplyTemplateResult = { ok: true } | { ok: false; error: string };

/**
 * Grava o modelo escolhido no banco: categorias primeiro (para ter os IDs),
 * depois produtos, bebidas, bordas/adicionais e combos.
 *
 * Não é transacional — o cliente Supabase usado aqui não abre transação
 * entre tabelas. Se algo falhar no meio, o que já foi criado fica na tela
 * normalmente (a loja não fica pior do que estava, só com o cardápio
 * parcialmente preenchido); o erro retornado diz o que não entrou.
 */
export async function applyMenuTemplate(
  pizzeriaId: string,
  templateKey: MenuTemplateKey,
): Promise<ApplyTemplateResult> {
  const template = MENU_TEMPLATES[templateKey];

  const { data: insertedCategories, error: categoriesError } = await supabase
    .from("menu_categories")
    .insert(
      template.categories.map((cat, index) => ({
        pizzeria_id: pizzeriaId,
        name: cat.name,
        order_index: index,
        active: true,
      })),
    )
    .select("id, name");

  if (categoriesError || !insertedCategories) {
    return { ok: false, error: categoriesError?.message ?? "Falha ao criar categorias" };
  }

  const categoryIdByName = new Map(insertedCategories.map((c) => [c.name, c.id]));

  const productRows = template.categories.flatMap((cat) =>
    cat.products.map((p) => ({
      pizzeria_id: pizzeriaId,
      category_id: categoryIdByName.get(cat.name) ?? null,
      name: p.name,
      price: p.price,
      product_type: "standard",
      active: true,
      available: true,
    })),
  );

  const beverageRows = template.beverages.map((b) => ({
    pizzeria_id: pizzeriaId,
    category_id: null,
    name: b.name,
    price: b.price,
    product_type: "beverage",
    active: true,
    available: true,
  }));

  const [{ error: productsError }, { error: beveragesError }] = await Promise.all([
    supabase.from("menu_products").insert(productRows),
    supabase.from("menu_products").insert(beverageRows),
  ]);

  if (productsError || beveragesError) {
    return {
      ok: false,
      error: (productsError ?? beveragesError)?.message ?? "Falha ao criar produtos",
    };
  }

  const { error: extrasError } = await supabase.from("menu_extras").insert(
    template.extras.map((e) => ({
      pizzeria_id: pizzeriaId,
      name: e.name,
      price: e.price,
      extra_type: e.extra_type,
      active: true,
    })),
  );

  if (extrasError) {
    return { ok: false, error: extrasError.message };
  }

  for (const combo of template.combos) {
    const { data: insertedCombo, error: comboError } = await supabase
      .from("combos")
      .insert({
        pizzeria_id: pizzeriaId,
        name: combo.name,
        description: combo.description,
        original_price: combo.originalPrice,
        combo_price: combo.comboPrice,
        active: true,
      })
      .select("id")
      .single();

    if (comboError || !insertedCombo) {
      return { ok: false, error: comboError?.message ?? "Falha ao criar combo" };
    }

    const { error: comboItemsError } = await supabase.from("combo_items").insert(
      combo.items.map((item) => ({
        combo_id: insertedCombo.id,
        product_name: item.product_name,
        quantity: item.quantity,
      })),
    );

    if (comboItemsError) {
      return { ok: false, error: comboItemsError.message };
    }
  }

  return { ok: true };
}
