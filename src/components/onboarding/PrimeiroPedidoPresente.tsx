import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePedidoDeTreino } from "@/lib/onboarding/guia/treinoNoQuadro";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const TIPO_PRESENTE = "first_order_gift";

export function PrimeiroPedidoPresente({ companyId }: { companyId: string }) {
  const treino = usePedidoDeTreino();
  const cache = useQueryClient();
  const { data: presente } = useQuery({
    queryKey: [TIPO_PRESENTE, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_notifications")
        .select("id")
        .eq("company_id", companyId)
        .eq("notification_type", TIPO_PRESENTE)
        .eq("displayed", false)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: Infinity,
  });

  const {
    data: mensagem,
    mutate: exibir,
    isIdle,
    isSuccess,
    reset,
  } = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("club_notifications")
        .update({ displayed: true })
        .eq("id", id)
        .eq("company_id", companyId)
        .eq("displayed", false)
        .select("title, message")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: () => cache.setQueryData([TIPO_PRESENTE, companyId], null),
    retry: 2,
  });

  const aguardandoPedido = Boolean(presente) && !isSuccess;
  const { data: temPedido, refetch } = useQuery({
    queryKey: [TIPO_PRESENTE, companyId, "pedido"],
    enabled: aguardandoPedido,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id")
        .eq("tenant_id", companyId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    refetchInterval: (query) => (query.state.data ? false : 30_000),
  });

  useEffect(() => {
    if (!aguardandoPedido) return;
    const canal = supabase
      .channel(`presente-primeiro-pedido:${companyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `tenant_id=eq.${companyId}` },
        () => void refetch(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refetch();
      });
    return () => void supabase.removeChannel(canal);
  }, [aguardandoPedido, companyId, refetch]);

  const testeConcluido = treino?.tenant_id === companyId && treino.status === "entregue";
  useEffect(() => {
    if (presente && isIdle && (temPedido || testeConcluido)) exibir(presente.id);
  }, [exibir, isIdle, presente, temPedido, testeConcluido]);

  return (
    <Dialog open={Boolean(mensagem)} onOpenChange={(open) => !open && reset()}>
      {mensagem && (
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border-amber-200 bg-[#fff8ed] p-0 text-[#311a10] shadow-2xl [&>button]:hidden">
          <div className="relative isolate overflow-hidden px-6 pb-7 pt-8 text-center sm:px-9 sm:pb-9 sm:pt-10">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 bg-[radial-gradient(ellipse_at_top,#ffcf8c,transparent_73%)]"
            />
            <div className="relative mx-auto flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[#f56628] to-[#a83218] text-white shadow-lg shadow-orange-900/25">
              <Gift aria-hidden="true" className="size-9" strokeWidth={1.7} />
              <Sparkles
                aria-hidden="true"
                className="absolute -right-7 -top-2 size-6 text-[#b3471a]"
              />
              <Sparkles
                aria-hidden="true"
                className="absolute -bottom-1 -left-7 size-5 text-[#b3471a]"
              />
            </div>
            <DialogTitle className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">
              {mensagem.title}
            </DialogTitle>
            <DialogDescription className="mt-3 whitespace-pre-line text-base leading-relaxed text-[#643f2a]">
              {mensagem.message}
            </DialogDescription>
            <Button
              type="button"
              onClick={reset}
              className="mt-6 bg-[#9d351b] px-6 text-white hover:bg-[#7e2714] focus-visible:ring-[#a13a20]"
            >
              Continuar para o painel
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
