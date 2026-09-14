import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

/**
 * O endereço público do cardápio da loja.
 *
 * Devolve nulo quando a loja ainda não tem cardápio no ar — e nulo é melhor
 * do que um link chutado: botão que abre uma página de erro é pior do que
 * botão apagado, porque faz a pessoa achar que a loja está quebrada.
 */
function enderecoDoCardapio(
  ficha: { slug: string | null; public_url: string | null } | undefined,
): string | null {
  const gravado = ficha?.public_url?.trim();
  if (gravado) return gravado;
  const slug = ficha?.slug?.trim();
  return slug ? `https://conectfly.com.br/${slug}` : null;
}

export function useAdminPizzerias() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin-pizzerias"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pizzeria_financial_metrics").select("*");
      if (error) throw error;
      const rows = data ?? [];

      // A view de métricas não traz plano, nome do dono nem o endereço
      // público da loja — busca à parte, para os modais de
      // descadastro/exclusão e os botões de cardápio não inventarem uma
      // segunda fonte de verdade.
      const pizzeriaIds = rows.map((r) => r.pizzeria_id).filter((id): id is string => !!id);
      const ownerIds = Array.from(
        new Set(rows.map((r) => r.owner_id).filter((id): id is string => !!id)),
      );

      const [{ data: extra }, { data: profiles }] = await Promise.all([
        pizzeriaIds.length
          ? supabase
              .from("pizzerias")
              .select("id, plan_type, slug, public_url")
              .in("id", pizzeriaIds)
          : Promise.resolve({
              data: [] as {
                id: string;
                plan_type: string | null;
                slug: string | null;
                public_url: string | null;
              }[],
            }),
        ownerIds.length
          ? supabase.from("profiles").select("id, full_name").in("id", ownerIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
      ]);

      const fichaById = new Map((extra ?? []).map((e) => [e.id, e]));
      const nameByOwner = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

      return rows.map((r) => {
        const ficha = r.pizzeria_id ? fichaById.get(r.pizzeria_id) : undefined;
        return {
          ...r,
          plan_type: ficha?.plan_type ?? null,
          owner_name: r.owner_id ? (nameByOwner.get(r.owner_id) ?? null) : null,
          // O endereço do cardápio é o que está gravado na ficha da loja.
          // Montar um a partir do slug daria errado nas lojas cujo endereço
          // ganhou um sufixo para não colidir com outra de nome igual — a
          // BOTECO VT, por exemplo, tem slug "boteco-vt" e endereço
          // ".../boteco-vt-a6ik". Quem manda é o endereço gravado.
          endereco_do_cardapio: enderecoDoCardapio(ficha),
        };
      });
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("pizzerias-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "pizzerias" }, () =>
        queryClient.invalidateQueries({ queryKey: ["admin-pizzerias"] }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}
