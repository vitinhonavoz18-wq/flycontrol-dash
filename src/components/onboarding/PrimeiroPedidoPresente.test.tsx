import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { publicarPedidoDeTreino } from "@/lib/onboarding/guia/treinoNoQuadro";
import { montarPedidoDeDemonstracao } from "@/lib/onboarding/guia/pedidoDeDemonstracao";
import { PrimeiroPedidoPresente } from "./PrimeiroPedidoPresente";

const loja = "6e206849-945f-4db4-a513-e68db557597d";
const banco = vi.hoisted(() => ({
  pendente: true,
  pedido: false,
  conferirPedido: vi.fn(),
  marcarExibido: vi.fn(),
  receberPedido: () => {},
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(tabela: string) {
      let exibindo = false;
      const consulta = {
        select: () => consulta,
        eq: () => consulta,
        order: () => consulta,
        limit: () => consulta,
        update: () => {
          exibindo = true;
          return consulta;
        },
        async maybeSingle() {
          if (tabela === "orders") {
            banco.conferirPedido();
            return { data: banco.pedido ? { id: "pedido" } : null };
          }
          if (!banco.pendente) return { data: null };
          if (!exibindo) return { data: { id: "presente" } };
          banco.marcarExibido();
          banco.pendente = false;
          return { data: { title: "Parabéns, Marina!", message: "Um ano de FlyDelivery grátis." } };
        },
      };
      return consulta;
    },
    channel: () => ({
      on: (_evento: string, _filtro: unknown, receber: () => void) => {
        banco.receberPedido = receber;
        return { subscribe: () => ({}) };
      },
    }),
    removeChannel: vi.fn(),
  },
}));

function abrirPainel() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cache}>
      <PrimeiroPedidoPresente companyId={loja} />
    </QueryClientProvider>,
  );
}

describe("presente do primeiro pedido", () => {
  beforeEach(() => {
    banco.pendente = true;
    banco.pedido = false;
    banco.conferirPedido.mockClear();
    banco.marcarExibido.mockClear();
    publicarPedidoDeTreino(null);
  });

  it("aguarda um pedido e grava a exibição uma única vez", async () => {
    const painel = abrirPainel();
    await waitFor(() => expect(banco.conferirPedido).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(banco.marcarExibido).not.toHaveBeenCalled();

    banco.pedido = true;
    banco.receberPedido();
    expect(await screen.findByRole("dialog", { name: "Parabéns, Marina!" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continuar para o painel" }));
    painel.unmount();
    abrirPainel();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(banco.marcarExibido).toHaveBeenCalledTimes(1);
  });

  it("também abre após o lojista concluir o pedido de treino", async () => {
    abrirPainel();
    const treino = montarPedidoDeDemonstracao(loja, null);
    act(() => publicarPedidoDeTreino(treino));
    await waitFor(() => expect(banco.conferirPedido).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => publicarPedidoDeTreino({ ...treino, status: "entregue" }));
    expect(await screen.findByRole("dialog", { name: "Parabéns, Marina!" })).toBeTruthy();
    expect(banco.marcarExibido).toHaveBeenCalledTimes(1);
  });
});
