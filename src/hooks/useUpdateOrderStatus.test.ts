import { renderHook } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "@/types/order";
import { STATUS_CHANGE_SOURCE, useUpdateOrderStatus } from "./useUpdateOrderStatus";

type SupabaseResult<T> = { data: T; error: { code?: string; message: string } | null };

const mocks = vi.hoisted(() => ({
  /** Resposta do UPDATE condicional. Lista vazia = ninguém bateu com o filtro. */
  updateResult: { data: [] as unknown[], error: null } as SupabaseResult<unknown[]>,
  /** Resposta da releitura do pedido usada na resolução de conflito. */
  refetchResult: { data: null as unknown, error: null } as SupabaseResult<unknown>,
  historyInsert: vi.fn(),
  /** Trava opcional para inspecionar o estado otimista antes da resposta. */
  gate: null as null | Promise<void>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "order_status_history") {
        return { insert: mocks.historyInsert };
      }
      return {
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: async () => {
                if (mocks.gate) await mocks.gate;
                return mocks.updateResult;
              },
            }),
          }),
        }),
        select: () => ({
          eq: () => ({
            maybeSingle: async () => mocks.refetchResult,
          }),
        }),
      };
    },
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "user-1" } } } }),
    },
  },
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  warning: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMocks }));

const TENANT = "tenant-1";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    order_number: 1024,
    tenant_id: TENANT,
    customer_name: "João da Silva",
    customer_phone: "11999990000",
    customer_address: "Rua das Flores, 123",
    neighborhood: "Centro",
    items: [],
    total: 57.9,
    delivery_fee: 5,
    payment_method: "pix",
    change_for: null,
    notes: null,
    status: "novo",
    created_at: "2026-08-05T12:00:00Z",
    ...overrides,
  };
}

/** Estado de pedidos controlado à mão, no lugar do useState do dashboard. */
function makeOrdersStore(initial: Order[]) {
  const store = { orders: initial };
  const setOrders = ((updater: unknown) => {
    store.orders =
      typeof updater === "function"
        ? (updater as (prev: Order[]) => Order[])(store.orders)
        : (updater as Order[]);
  }) as React.Dispatch<React.SetStateAction<Order[]>>;
  return { store, setOrders };
}

function setup(initial: Order[] = [makeOrder()], onStatusApplied = vi.fn()) {
  const { store, setOrders } = makeOrdersStore(initial);
  const hook = renderHook(() =>
    useUpdateOrderStatus({ setOrders, tenantId: TENANT, onStatusApplied }),
  );
  return { hook, store, onStatusApplied };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateResult = { data: [{ id: "order-1", status: "preparando" }], error: null };
  mocks.refetchResult = { data: null, error: null };
  mocks.historyInsert.mockResolvedValue({ error: null });
  mocks.gate = null;
});

describe("gravação bem-sucedida", () => {
  it("persiste o novo status na lista", async () => {
    const { hook, store } = setup();

    await act(async () => {
      await hook.result.current.moveOrder(makeOrder(), "preparando");
    });

    expect(store.orders[0].status).toBe("preparando");
  });

  it("aplica a mudança na interface antes da resposta do banco", async () => {
    let release!: () => void;
    mocks.gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const { hook, store } = setup();

    let pending!: Promise<unknown>;
    await act(async () => {
      pending = hook.result.current.moveOrder(makeOrder(), "preparando");
      // Ainda não liberamos o banco: o card já deve ter mudado de coluna.
      await Promise.resolve();
    });
    expect(store.orders[0].status).toBe("preparando");

    await act(async () => {
      release();
      await pending;
    });
    expect(store.orders[0].status).toBe("preparando");
  });

  it("dispara as automações já existentes com o status novo", async () => {
    const { hook, onStatusApplied } = setup();

    await act(async () => {
      await hook.result.current.moveOrder(makeOrder(), "saiu");
    });

    expect(onStatusApplied).toHaveBeenCalledTimes(1);
    expect(onStatusApplied).toHaveBeenCalledWith(
      expect.objectContaining({ id: "order-1", status: "saiu" }),
      "saiu",
    );
  });

  it("registra o histórico com origem, autor e empresa", async () => {
    const { hook } = setup();

    await act(async () => {
      await hook.result.current.moveOrder(makeOrder(), "preparando");
    });

    expect(mocks.historyInsert).toHaveBeenCalledWith({
      order_id: "order-1",
      tenant_id: TENANT,
      from_status: "novo",
      to_status: "preparando",
      changed_by: "user-1",
      source: STATUS_CHANGE_SOURCE,
      note: null,
    });
  });

  it("não derruba a mudança de status quando a tabela de histórico não existe", async () => {
    mocks.historyInsert.mockResolvedValue({
      error: { code: "42P01", message: 'relation "order_status_history" does not exist' },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { hook, store, onStatusApplied } = setup();

    await act(async () => {
      await hook.result.current.moveOrder(makeOrder(), "preparando");
    });

    expect(store.orders[0].status).toBe("preparando");
    expect(onStatusApplied).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("falhas", () => {
  it("reverte o card e avisa o usuário quando o banco recusa", async () => {
    mocks.updateResult = { data: [], error: { message: "permission denied" } };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { hook, store, onStatusApplied } = setup();

    await act(async () => {
      await hook.result.current.moveOrder(makeOrder(), "preparando");
    });

    expect(store.orders[0].status).toBe("novo");
    expect(toastMocks.error).toHaveBeenCalledWith(
      "Não foi possível atualizar o pedido. Tente novamente.",
    );
    // A automação não pode disparar se a gravação não aconteceu.
    expect(onStatusApplied).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("não perde o pedido no rollback", async () => {
    mocks.updateResult = { data: [], error: { message: "boom" } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { hook, store } = setup();

    await act(async () => {
      await hook.result.current.moveOrder(makeOrder(), "preparando");
    });

    expect(store.orders).toHaveLength(1);
    expect(store.orders[0]).toMatchObject({ id: "order-1", customer_name: "João da Silva" });
  });
});

describe("concorrência", () => {
  it("ressincroniza quando outro operador moveu o pedido antes", async () => {
    // UPDATE condicional não bate: o status no banco já é outro.
    mocks.updateResult = { data: [], error: null };
    mocks.refetchResult = { data: { id: "order-1", status: "saiu" }, error: null };
    const { hook, store } = setup();

    await act(async () => {
      await hook.result.current.moveOrder(makeOrder(), "preparando");
    });

    // Prevalece o estado do banco, não a intenção do arraste.
    expect(store.orders[0].status).toBe("saiu");
    expect(toastMocks.warning).toHaveBeenCalledWith(
      expect.stringContaining("atualizado por outro usuário"),
    );
  });

  it("remove da lista o pedido que sumiu do banco", async () => {
    mocks.updateResult = { data: [], error: null };
    mocks.refetchResult = { data: null, error: null };
    const { hook, store } = setup();

    await act(async () => {
      await hook.result.current.moveOrder(makeOrder(), "preparando");
    });

    expect(store.orders).toHaveLength(0);
    expect(toastMocks.error).toHaveBeenCalledWith(
      "Este pedido não está mais disponível. A lista foi atualizada.",
    );
  });

  it("ignora um segundo movimento do mesmo pedido enquanto o primeiro está em voo", async () => {
    let release!: () => void;
    mocks.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { hook } = setup();
    const order = makeOrder();

    let first!: Promise<{ ok: boolean }>;
    let second!: { ok: boolean };
    await act(async () => {
      first = hook.result.current.moveOrder(order, "preparando");
      second = await hook.result.current.moveOrder(order, "saiu");
    });

    expect(second.ok).toBe(false);

    await act(async () => {
      release();
      const result = await first;
      expect(result.ok).toBe(true);
    });

    // Uma única gravação de histórico: o segundo arraste não virou escrita.
    expect(mocks.historyInsert).toHaveBeenCalledTimes(1);
  });
});

describe("movimentos recusados", () => {
  it("não chama o banco ao soltar o card na coluna atual", async () => {
    const { hook } = setup();

    await act(async () => {
      const result = await hook.result.current.moveOrder(makeOrder({ status: "novo" }), "novo");
      expect(result.ok).toBe(false);
    });

    expect(mocks.historyInsert).not.toHaveBeenCalled();
    // Gesto acidental não merece mensagem de erro.
    expect(toastMocks.error).not.toHaveBeenCalled();
  });

  it("explica por que um pedido finalizado não pode voltar ao quadro", async () => {
    const { hook, store } = setup([makeOrder({ status: "entregue" })]);

    await act(async () => {
      const result = await hook.result.current.moveOrder(
        makeOrder({ status: "entregue" }),
        "preparando",
      );
      expect(result.ok).toBe(false);
    });

    expect(store.orders[0].status).toBe("entregue");
    expect(toastMocks.error).toHaveBeenCalledWith(expect.stringContaining("Entregue"));
    expect(mocks.historyInsert).not.toHaveBeenCalled();
  });
});
