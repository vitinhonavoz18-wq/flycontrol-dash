/**
 * O que a Venda no Balcão levou para o Financeiro.
 *
 * Mora fora de `inventory.functions.ts` de propósito. Lá dentro, toda função
 * exige o plano Premium — correto para as telas do módulo, e errado aqui: o
 * Financeiro é de todo mundo, e uma loja do plano CENTS que abrisse a tela
 * receberia um erro no lugar do faturamento dela.
 *
 * Aqui basta ser dono da loja. Quem nunca vendeu no balcão simplesmente vê
 * zero, que é a resposta certa — e não uma porta trancada.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnsTenant } from "@/lib/server/plan-guard";

export type ResumoDoBalcao = {
  /** Em reais, para somar com o faturamento dos pedidos. */
  total: number;
  /** Quantas vendas de balcão no período. */
  quantidade: number;
};

/**
 * Soma as vendas de balcão de uma ou mais lojas dentro do período.
 *
 * O balcão guarda dinheiro em centavos inteiros; o Financeiro trabalha em
 * reais. A divisão acontece uma vez só, aqui no fim da soma — somar centavos
 * e dividir depois evita o arredondamento de cada venda virar diferença no
 * total do mês.
 */
export const resumoDoBalcaoNoPeriodo = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantIds: string[]; de: string; ate: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<ResumoDoBalcao> => {
    if (data.tenantIds.length === 0) return { total: 0, quantidade: 0 };

    // Uma loja de cada vez: o dono pode ter várias, e cada uma precisa ser
    // conferida. Sem isso, bastaria acrescentar um código na lista para
    // enxergar o faturamento do vizinho.
    await Promise.all(
      data.tenantIds.map((id) => assertOwnsTenant(context.supabase, context.userId, id)),
    );

    const { data: vendas, error } = await context.supabase
      .from("pos_sales")
      .select("total_cents")
      .in("pizzeria_id", data.tenantIds)
      .eq("status", "concluida")
      .gte("created_at", data.de)
      .lte("created_at", data.ate);

    if (error) throw new Error(error.message);

    const centavos = (vendas ?? []).reduce((soma, v) => soma + Number(v.total_cents ?? 0), 0);

    return { total: centavos / 100, quantidade: vendas?.length ?? 0 };
  });
