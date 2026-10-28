/**
 * O cardápio do PAINEL no formato da calculadora de pizza (`motorDePreco.ts`).
 *
 * Serve para a aba "Pizzaria" conferir a configuração antes de publicar e
 * para o simulador mostrar ao lojista o preço que o cliente vai ver.
 *
 * É a versão do painel da mesma conversão que o site faz
 * (SiteCreatorFly, `src/lib/site/pizza/catalogo.ts`). As colunas daqui têm
 * outros nomes (`active` em vez de `is_active`, `pizzeria_pizza_sizes.name`
 * em vez de `label`), por isso a conversão é outra — mas o resultado precisa
 * ser o mesmo, e é por NOME (tamanho e sabor) que os dois lados se entendem.
 *
 * Limitação conhecida: o "extra de sabor especial" é cadastrado só no site.
 * Na regra antiga (tamanho + especiais) o simulador daqui não soma esse extra.
 */

import { layoutPorId, layoutRecomendadoPara } from "@/lib/menu/layouts";
import {
  CHAVE_DA_CONFIG,
  chaveDeNome,
  lerConfigPizzaria,
  lerPrecosPorTamanho,
  reaisParaCentavos,
  type CatalogoDePizza,
  type ConfigPizzaria,
} from "./motorDePreco";

export type TamanhoDoPainel = {
  name: string;
  price: number | string | null;
  max_flavors: number | null;
  slices?: number | null;
  active?: boolean | null;
};

export type ProdutoDoPainel = {
  id: string;
  name: string;
  price?: number | string | null;
  active?: boolean | null;
  pizza_size_prices_cents?: unknown;
  ingredients?: unknown;
};

export type ComplementoDoPainel = ProdutoDoPainel & {
  extra_type?: string | null;
  max_quantity?: number | null;
};

/** A loja usa o layout de pizzaria (escolhido, ou recomendado pelo tipo de negócio)? */
export function ehPizzaria(
  loja: { business_type?: unknown; site_settings?: { menu_layout?: unknown } | null } | null,
): boolean {
  const escolhido = layoutPorId(loja?.site_settings?.menu_layout);
  if (escolhido) return escolhido.id === "pizza";
  return layoutRecomendadoPara(loja?.business_type) === "pizza";
}

function lerIngredientes(bruto: unknown): string[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((i) => String(i ?? "").trim())
    .filter(Boolean)
    .slice(0, 40);
}

/** "cebola, azeitona , ,orégano" → ["cebola", "azeitona", "orégano"], sem repetidos. */
export function textoParaIngredientes(texto: string): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const parte of texto.split(/[,;\n]/)) {
    const nome = parte.trim().slice(0, 60);
    const chave = chaveDeNome(nome);
    if (!nome || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(nome);
  }
  return saida.slice(0, 40);
}

/**
 * Converte o que o lojista digitou na grade ("59,90", "", "abc") em preços
 * por tamanho em centavos. Campo vazio = "usa o preço padrão" (não entra).
 * Devolve também os campos que não deu para entender, para avisar na tela.
 */
export function gradeParaPrecos(grade: Record<string, string>): {
  precos: Record<string, number>;
  invalidos: string[];
} {
  const precos: Record<string, number> = {};
  const invalidos: string[] = [];
  for (const [tamanho, texto] of Object.entries(grade)) {
    const limpo = String(texto ?? "").trim();
    if (!limpo) continue;
    // "1.234,50" e "59,90" (jeito brasileiro) ou "59.90" (com ponto).
    const n = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
    if (!Number.isFinite(n) || n < 0 || n > 100000) {
      invalidos.push(tamanho);
      continue;
    }
    precos[chaveDeNome(tamanho)] = reaisParaCentavos(n);
  }
  return { precos, invalidos };
}

export function montarCatalogoDoPainel(args: {
  tamanhos: TamanhoDoPainel[];
  sabores: ProdutoDoPainel[];
  complementos: ComplementoDoPainel[];
  siteSettings: unknown;
  /** Para o simulador testar uma configuração ainda não salva. */
  configEmEdicao?: ConfigPizzaria;
}): CatalogoDePizza {
  const settings =
    args.siteSettings && typeof args.siteSettings === "object"
      ? (args.siteSettings as Record<string, unknown>)
      : {};
  const opcao = (c: ComplementoDoPainel) => {
    const max = Number(c.max_quantity);
    return {
      id: c.id,
      nome: c.name,
      ativo: c.active !== false,
      precoCentavos: reaisParaCentavos(c.price),
      precosPorTamanho: lerPrecosPorTamanho(c.pizza_size_prices_cents),
      maxQuantidade: Number.isInteger(max) && max >= 1 ? max : 1,
    };
  };
  return {
    config: args.configEmEdicao ?? lerConfigPizzaria(settings[CHAVE_DA_CONFIG]),
    tamanhos: args.tamanhos.map((t) => ({
      chave: chaveDeNome(t.name),
      nome: String(t.name ?? "").trim(),
      precoBaseCentavos: reaisParaCentavos(t.price),
      maxSabores: Math.max(0, Math.round(Number(t.max_flavors) || 0)),
      fatias: Number(t.slices) > 0 ? Number(t.slices) : null,
      ativo: t.active !== false,
    })),
    sabores: args.sabores.map((s) => ({
      id: s.id,
      nome: s.name,
      ativo: s.active !== false,
      precosPorTamanho: lerPrecosPorTamanho(s.pizza_size_prices_cents),
      extraEspecialCentavos: 0,
      ingredientes: lerIngredientes(s.ingredients),
    })),
    bordas: args.complementos.filter((c) => c.extra_type === "borda").map(opcao),
    adicionais: args.complementos.filter((c) => c.extra_type !== "borda").map(opcao),
  };
}
