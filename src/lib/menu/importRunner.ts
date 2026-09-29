/**
 * Execução da importação, seguindo o plano.
 *
 * Quem fala com o banco e com o site público é passado de fora (`ImportDeps`):
 * assim a regra — "achou a categoria, guarda o código dela, e cada item entra
 * com esse código" — pode ser testada sem internet, com um caderno de mentira.
 *
 * Regra de ouro: NENHUMA falha é engolida. Cada categoria ou item que não
 * entrar vira uma linha em `failures` com o nome e o motivo.
 */
import type { ImportedItem } from "./importSchema";
import { normalizeKey, type ImportPlan } from "./importPlan";

export type CategoryResult =
  { ok: true; id: string; externalId: string | null } | { ok: false; why: string };

/**
 * `warning` = o item FOI salvo no painel, mas o site público não recebeu.
 * Não é falha de gravação, e sim um aviso que o dono precisa ver.
 */
export type WriteResult = { ok: true; warning?: string } | { ok: false; why: string };

export type ImportDeps = {
  createCategory(input: {
    nome: string;
    descricao?: string;
    orderIndex: number;
  }): Promise<CategoryResult>;
  createProduct(input: {
    item: ImportedItem;
    categoryId: string;
    externalCategoryId: string | null;
    productType: "standard" | "beverage";
  }): Promise<WriteResult>;
  createExtra(input: {
    item: ImportedItem;
    extraType: "borda" | "adicional";
  }): Promise<WriteResult>;
  onProgress?(done: number, total: number): void;
};

export type ImportMessage = { nome: string; mensagem: string };

export type ImportReport = {
  categoriesCreated: number;
  categoriesReused: number;
  productsCreated: number;
  productsSkipped: number;
  extrasCreated: number;
  extrasSkipped: number;
  failures: ImportMessage[];
  warnings: ImportMessage[];
};

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Mensagem de sucesso mostrada ao dono. */
export function mensagemFinal(report: ImportReport): string {
  const n = report.productsCreated;
  const extras = report.extrasCreated;
  let text = `Importação concluída: ${n} ${n === 1 ? "produto adicionado" : "produtos adicionados"}`;
  if (extras > 0) text += ` e ${extras} ${extras === 1 ? "complemento" : "complementos"}`;
  return `${text}.`;
}

/** Quantos passos o executor vai dar (para a barra de progresso). */
export function countSteps(plan: ImportPlan): number {
  const groups = plan.groups.reduce((s, g) => s + 1 + g.itens.length, 0);
  return groups + plan.extras.length;
}

export async function runImport(plan: ImportPlan, deps: ImportDeps): Promise<ImportReport> {
  const report: ImportReport = {
    categoriesCreated: 0,
    categoriesReused: 0,
    productsCreated: 0,
    productsSkipped: 0,
    extrasCreated: 0,
    extrasSkipped: 0,
    failures: [],
    warnings: [],
  };

  const total = countSteps(plan);
  let done = 0;
  const advance = () => {
    done += 1;
    deps.onProgress?.(done, total);
  };
  deps.onProgress?.(0, total);

  const fail = (nome: string, mensagem: string) => {
    console.error(`[Importação] ${mensagem}`);
    report.failures.push({ nome, mensagem });
  };

  // Categorias já resolvidas nesta importação (achadas ou criadas), pelo nome
  // normalizado. É o que impede criar "Bebidas" duas vezes quando o arquivo
  // tem a categoria "Bebidas" E o bloco `bebidas`.
  const resolved = new Map<string, { id: string; externalId: string | null }>();
  const failedCategories = new Map<string, string>();
  let orderIndex = plan.nextOrderIndex;

  for (const group of plan.groups) {
    const key = normalizeKey(group.nome);
    let category = resolved.get(key) ?? null;

    if (!category && !failedCategories.has(key)) {
      if (group.existing) {
        category = { id: group.existing.id, externalId: group.existing.external_id };
        resolved.set(key, category);
        report.categoriesReused += 1;
      } else {
        try {
          const created = await deps.createCategory({
            nome: group.nome,
            descricao: group.descricao,
            orderIndex,
          });
          if (created.ok) {
            category = { id: created.id, externalId: created.externalId };
            resolved.set(key, category);
            orderIndex += 1;
            report.categoriesCreated += 1;
          } else {
            failedCategories.set(key, created.why);
            fail(group.nome, `Erro ao importar a categoria ${group.nome}: ${created.why}`);
          }
        } catch (err) {
          failedCategories.set(key, errorText(err));
          fail(group.nome, `Erro ao importar a categoria ${group.nome}: ${errorText(err)}`);
        }
      }
    }
    advance();

    if (!category) {
      const why = failedCategories.get(key) ?? "categoria não foi criada";
      for (const planned of group.itens) {
        if (planned.skip) {
          report.productsSkipped += 1;
        } else {
          fail(
            planned.item.nome,
            `Erro ao importar ${planned.item.nome}: a categoria ${group.nome} não foi criada (${why}).`,
          );
        }
        advance();
      }
      continue;
    }

    for (const planned of group.itens) {
      if (planned.skip) {
        report.productsSkipped += 1;
        advance();
        continue;
      }
      try {
        const result = await deps.createProduct({
          item: planned.item,
          categoryId: category.id,
          externalCategoryId: category.externalId,
          productType: group.kind === "beverage" ? "beverage" : "standard",
        });
        if (result.ok) {
          report.productsCreated += 1;
          if (result.warning) {
            report.warnings.push({
              nome: planned.item.nome,
              mensagem: `${planned.item.nome} foi salvo no painel, mas o site público não recebeu: ${result.warning}`,
            });
          }
        } else {
          fail(planned.item.nome, `Erro ao importar ${planned.item.nome}: ${result.why}`);
        }
      } catch (err) {
        fail(planned.item.nome, `Erro ao importar ${planned.item.nome}: ${errorText(err)}`);
      }
      advance();
    }
  }

  for (const planned of plan.extras) {
    if (planned.skip) {
      report.extrasSkipped += 1;
      advance();
      continue;
    }
    try {
      const result = await deps.createExtra({ item: planned.item, extraType: planned.extraType });
      if (result.ok) {
        report.extrasCreated += 1;
        if (result.warning) {
          report.warnings.push({
            nome: planned.item.nome,
            mensagem: `${planned.item.nome} foi salvo no painel, mas o site público não recebeu: ${result.warning}`,
          });
        }
      } else {
        fail(planned.item.nome, `Erro ao importar ${planned.item.nome}: ${result.why}`);
      }
    } catch (err) {
      fail(planned.item.nome, `Erro ao importar ${planned.item.nome}: ${errorText(err)}`);
    }
    advance();
  }

  for (const w of report.warnings) console.warn(`[Importação] ${w.mensagem}`);
  return report;
}
