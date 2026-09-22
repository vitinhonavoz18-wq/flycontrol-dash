import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ID_DO_PEDIDO_DE_DEMONSTRACAO,
  montarPedidoDeDemonstracao,
} from "@/lib/onboarding/guia/pedidoDeDemonstracao";
import type { Order } from "@/types/order";

/**
 * O pedido de treino, montado com o cardápio REAL da loja.
 *
 * Um pedido de treino com "Produto Exemplo" ensina a mexer num sistema
 * genérico. Com o X-Salada que o lojista acabou de cadastrar, ele reconhece a
 * própria loja na tela — e é aí que a ficha cai de que aquele painel é dele.
 *
 * Se a busca do produto falhar, o pedido é montado assim mesmo com um nome
 * genérico: perder a última etapa do guia por causa de uma consulta lenta
 * seria trocar o treino inteiro por um detalhe.
 */
export function usePedidoDeDemonstracao(tenantId: string | null, ligado: boolean): Order | null {
  const [pedido, setPedido] = useState<Order | null>(null);
  // O pedido é montado UMA vez por loja: remontar a cada render trocaria o
  // card do quadro no meio do arraste do lojista.
  const montadoPara = useRef<string | null>(null);

  useEffect(() => {
    if (!ligado || !tenantId) {
      setPedido(null);
      montadoPara.current = null;
      return;
    }
    if (montadoPara.current === tenantId) return;
    montadoPara.current = tenantId;

    let cancelado = false;
    void (async () => {
      let produto: { name: string; price: number } | null = null;
      try {
        const { data } = await supabase
          .from("menu_products")
          .select("name, price")
          .eq("pizzeria_id", tenantId)
          .gt("price", 0)
          .order("created_at")
          .limit(1)
          .maybeSingle();
        if (data) produto = data as { name: string; price: number };
      } catch {
        // Segue com o nome genérico.
      }
      if (!cancelado) setPedido(montarPedidoDeDemonstracao(tenantId, produto));
    })();

    return () => {
      cancelado = true;
    };
  }, [tenantId, ligado]);

  return pedido;
}

export { ID_DO_PEDIDO_DE_DEMONSTRACAO };
