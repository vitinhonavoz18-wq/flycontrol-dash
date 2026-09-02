/**
 * Os quatro tipos de coisa que o cardápio tem.
 *
 * Cada tela do cardápio (categorias, produtos, adicionais, tamanhos de pizza)
 * descrevia à sua maneira o que lia do banco — ou não descrevia nada. Aqui a
 * descrição é uma só, e as telas leem dela.
 *
 * Os campos são opcionais quando o banco aceita vazio. `external_id` é o
 * número que o cardápio digital usa para reconhecer o mesmo item do lado de
 * lá: é o código de barras do produto, o que permite atualizar em vez de
 * duplicar a cada sincronização.
 */

/** Uma categoria do cardápio ("Pizzas salgadas", "Bebidas"…). */
export type MenuCategory = {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  active?: boolean | null;
  external_id?: string | null;
  /** Posição da categoria na lista do cardápio. */
  order_index?: number | null;
};

/** Um produto do cardápio. */
export type MenuProduct = {
  id: string;
  name: string;
  description?: string | null;
  price?: number | string | null;
  category_id?: string | null;
  product_type?: string | null;
  image_url?: string | null;
  external_id?: string | null;
  active?: boolean | null;
  available?: boolean | null;
  menu_categories?: { name?: string | null } | null;
};

/** Um adicional ou uma borda. `extra_type` diz qual dos dois. */
export type MenuExtra = {
  id: string;
  name: string;
  price?: number | string | null;
  extra_type?: string | null;
  active?: boolean | null;
  external_id?: string | null;
};

/** Um tamanho de pizza, com quantos sabores e fatias ele comporta. */
export type PizzaSize = {
  id: string;
  name: string;
  price?: number | string | null;
  slices?: number | null;
  max_flavors?: number | null;
  sort_order?: number | null;
  active?: boolean | null;
  external_id?: string | null;
};
