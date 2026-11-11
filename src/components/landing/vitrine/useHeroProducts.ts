import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { normalizarVitrine, type ItemDaVitrine } from "@/lib/vitrine/vitrine";

/**
 * Busca a lista de produtos da vitrine UMA vez por visita.
 *
 * A troca de produto a cada 3 segundos não consulta nada: ela só anda pela
 * lista que já está na memória. A lista em si é guardada por 10 minutos —
 * quem volta à página nesse intervalo nem chega a pedir de novo.
 *
 * Se a busca falhar, a vitrine segue com o produto reserva. O visitante não
 * vê erro nenhum; o motivo fica registrado no console para quem investigar.
 */
export function useHeroProducts(): {
  itens: ItemDaVitrine[];
  carregando: boolean;
  falhou: boolean;
} {
  const consulta = useQuery({
    queryKey: ["vitrine-hero"],
    queryFn: async ({ signal }) => {
      const resposta = await fetch("/api/public/vitrine-hero", {
        signal,
        headers: { accept: "application/json" },
      });
      if (!resposta.ok) throw new Error(`Vitrine respondeu ${resposta.status}`);
      return normalizarVitrine(await resposta.json(), window.location.origin);
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (consulta.error) {
      console.warn("[vitrine] Lista indisponível; mostrando o produto reserva.", consulta.error);
    }
  }, [consulta.error]);

  return {
    itens: consulta.data ?? [],
    carregando: consulta.isPending,
    falhou: consulta.isError,
  };
}
