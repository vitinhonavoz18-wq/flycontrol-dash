/**
 * O aviso de "está acabando", fora das telas do Estoque.
 *
 * Quem está no painel de pedidos não fica olhando a Visão Geral do Estoque —
 * e é justamente no meio do movimento que a última caixa acaba. O aviso vai
 * até o dono em vez de esperar que ele vá até o aviso.
 *
 * Mora fora de `inventory.functions.ts` pelo mesmo motivo do balcão: lá toda
 * função exige Premium, e este aviso é consultado pelo painel inteiro. Loja
 * sem o módulo simplesmente não tem produto nenhum e recebe lista vazia.
 *
 * POR QUE NÃO É EM TEMPO REAL
 *
 * Pedido novo precisa de aviso na hora: tem cliente esperando. Estoque baixo,
 * não — a diferença entre saber agora e saber daqui a cinco minutos não muda
 * nenhuma decisão. Ligar o tempo real numa tabela que muda a cada item
 * vendido custaria tráfego o dia inteiro para ganhar minutos que não fazem
 * falta.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnsTenant } from "@/lib/server/plan-guard";

export type ProdutoAcabando = {
  id: string;
  pizzeria_id: string;
  name: string;
  stock_base: number;
  min_stock_base: number;
  base_unit: string;
  acabou: boolean;
};

/**
 * Produtos no mínimo ou abaixo dele.
 *
 * Mínimo zero significa "não me avise" — e é o valor da maioria dos produtos
 * que o dono cadastrou sem pensar em reposição. Avisar sobre eles encheria a
 * tela de alerta que ninguém pediu, e alerta demais é alerta nenhum.
 */
export const produtosAcabando = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantIds: string[] }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<ProdutoAcabando[]> => {
    if (data.tenantIds.length === 0) return [];

    await Promise.all(
      data.tenantIds.map((id) => assertOwnsTenant(context.supabase, context.userId, id)),
    );

    const { data: produtos, error } = await context.supabase
      .from("inventory_products")
      .select("id, pizzeria_id, name, stock_base, min_stock_base, base_unit")
      .in("pizzeria_id", data.tenantIds)
      .eq("active", true)
      .is("deleted_at", null)
      .gt("min_stock_base", 0)
      .order("stock_base");

    if (error) throw new Error(error.message);

    return (produtos ?? [])
      .filter((p) => Number(p.stock_base) <= Number(p.min_stock_base))
      .map((p) => ({
        id: p.id,
        pizzeria_id: p.pizzeria_id,
        name: p.name,
        stock_base: Number(p.stock_base),
        min_stock_base: Number(p.min_stock_base),
        base_unit: p.base_unit,
        acabou: Number(p.stock_base) <= 0,
      }));
  });
