/**
 * Plano da importação: cruza o arquivo com o que JÁ existe no cardápio.
 *
 * Funções puras, sem rede. É aqui que se decide, antes de gravar qualquer
 * coisa, o que é novo e o que já está cadastrado — igual o garçom conferir a
 * comanda contra o que já foi pedido antes de mandar tudo de novo para a
 * cozinha.
 */
import type { ImportedItem, ParsedMenu } from "./importSchema";

/** Nome da categoria onde entram as bebidas do arquivo. */
export const BEVERAGE_CATEGORY_NAME = "Bebidas";

/**
 * Chave de comparação de nomes: sem espaços sobrando e sem diferença entre
 * maiúsculas e minúsculas. "Bebidas", " bebidas " e "BEBIDAS" viram a mesma
 * coisa.
 */
export function normalizeKey(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Retrato do que o estabelecimento já tem. */
export type ExistingMenu = {
  categories: {
    id: string;
    name: string;
    external_id: string | null;
    order_index: number | null;
    active: boolean | null;
  }[];
  products: { name: string; category_id: string | null; product_type: string | null }[];
  extras: { name: string; extra_type: string }[];
};

export type PlannedItem = {
  item: ImportedItem;
  /** null = será criado. Senão, o motivo de não ser criado. */
  skip: null | "banco" | "arquivo";
};

export type PlannedGroup = {
  nome: string;
  descricao?: string;
  /** "standard" = categoria do arquivo; "beverage" = bloco `bebidas`. */
  kind: "standard" | "beverage";
  existing: ExistingMenu["categories"][number] | null;
  itens: PlannedItem[];
};

export type PlannedExtra = {
  item: ImportedItem;
  extraType: "borda" | "adicional";
  skip: null | "banco" | "arquivo";
};

export type ImportPlan = {
  groups: PlannedGroup[];
  extras: PlannedExtra[];
  /** Próxima posição livre na ordem das categorias. */
  nextOrderIndex: number;
};

export type PlanTotals = {
  categoriesToCreate: number;
  categoriesReused: number;
  productsToCreate: number;
  productsSkipped: number;
  extrasToCreate: number;
  extrasSkipped: number;
  /** Categorias que já existem mas estão desativadas. */
  inactiveCategories: string[];
};

export function buildImportPlan(menu: ParsedMenu, existing: ExistingMenu): ImportPlan {
  const categoryByKey = new Map<string, ExistingMenu["categories"][number]>();
  for (const c of existing.categories) {
    const key = normalizeKey(c.name);
    // Se já houver duas com o mesmo nome (cadastro antigo), fica a primeira.
    if (key && !categoryByKey.has(key)) categoryByKey.set(key, c);
  }

  const productKeysInDb = new Set<string>();
  const beverageNamesInDb = new Set<string>();
  for (const p of existing.products) {
    const nameKey = normalizeKey(p.name);
    if (p.product_type === "beverage") beverageNamesInDb.add(nameKey);
    if (p.category_id) productKeysInDb.add(`${p.category_id}|${nameKey}`);
  }

  // Vistos neste arquivo — o mesmo item repetido não entra duas vezes.
  const seenInFile = new Set<string>();

  const planGroup = (
    nome: string,
    descricao: string | undefined,
    kind: PlannedGroup["kind"],
    itens: ImportedItem[],
  ): PlannedGroup => {
    const catKey = normalizeKey(nome);
    const existingCat = categoryByKey.get(catKey) ?? null;

    return {
      nome,
      descricao,
      kind,
      existing: existingCat,
      itens: itens.map((item) => {
        const nameKey = normalizeKey(item.nome);
        // Bebida vale pelo nome na loja toda (cadastros antigos ficam sem
        // categoria); produto comum vale pela dupla categoria + nome.
        const fileKey = kind === "beverage" ? `bev|${nameKey}` : `${catKey}|${nameKey}`;
        let skip: PlannedItem["skip"] = null;
        if (kind === "beverage") {
          if (beverageNamesInDb.has(nameKey)) skip = "banco";
          else if (existingCat && productKeysInDb.has(`${existingCat.id}|${nameKey}`)) {
            skip = "banco";
          }
        } else if (existingCat && productKeysInDb.has(`${existingCat.id}|${nameKey}`)) {
          skip = "banco";
        }
        if (!skip && seenInFile.has(fileKey)) skip = "arquivo";
        seenInFile.add(fileKey);
        return { item, skip };
      }),
    };
  };

  const groups: PlannedGroup[] = menu.categorias.map((c) =>
    planGroup(c.nome, c.descricao, "standard", c.itens),
  );
  if (menu.bebidas.length > 0) {
    groups.push(planGroup(BEVERAGE_CATEGORY_NAME, undefined, "beverage", menu.bebidas));
  }

  const extraKeysInDb = new Set(
    existing.extras.map((e) => `${e.extra_type}|${normalizeKey(e.name)}`),
  );
  const seenExtras = new Set<string>();
  const planExtras = (list: ImportedItem[], extraType: PlannedExtra["extraType"]): PlannedExtra[] =>
    list.map((item) => {
      const key = `${extraType}|${normalizeKey(item.nome)}`;
      let skip: PlannedExtra["skip"] = null;
      if (extraKeysInDb.has(key)) skip = "banco";
      else if (seenExtras.has(key)) skip = "arquivo";
      seenExtras.add(key);
      return { item, extraType, skip };
    });

  const maxOrder = existing.categories.reduce((m, c) => Math.max(m, c.order_index ?? -1), -1);

  return {
    groups,
    extras: [...planExtras(menu.bordas, "borda"), ...planExtras(menu.adicionais, "adicional")],
    nextOrderIndex: maxOrder + 1,
  };
}

export function planTotals(plan: ImportPlan): PlanTotals {
  const newCategoryKeys = new Set<string>();
  const reusedCategoryKeys = new Set<string>();
  const inactive = new Set<string>();
  let productsToCreate = 0;
  let productsSkipped = 0;

  for (const g of plan.groups) {
    const key = normalizeKey(g.nome);
    if (g.existing) {
      reusedCategoryKeys.add(key);
      if (g.existing.active === false) inactive.add(g.existing.name);
    } else {
      newCategoryKeys.add(key);
    }
    for (const it of g.itens) {
      if (it.skip) productsSkipped += 1;
      else productsToCreate += 1;
    }
  }

  const extrasToCreate = plan.extras.filter((e) => !e.skip).length;

  return {
    categoriesToCreate: newCategoryKeys.size,
    categoriesReused: reusedCategoryKeys.size,
    productsToCreate,
    productsSkipped,
    extrasToCreate,
    extrasSkipped: plan.extras.length - extrasToCreate,
    inactiveCategories: [...inactive],
  };
}
