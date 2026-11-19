import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tenantId: "adega",
  buscar: vi.fn(),
  finalizar: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/inventory/inventory.functions", () => ({
  buscarProdutosParaVenda: mocks.buscar,
  finalizarVendaNoBalcao: mocks.finalizar,
}));
vi.mock("@/lib/inventory/loja-context", () => ({
  useLojaDoEstoque: () => ({ tenantId: mocks.tenantId }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { Route } from "./inventory.pos";

const Pagina = Route.options.component as ComponentType;
const amstel = {
  id: "amstel",
  name: "Amstel lata 350 ml",
  barcode: "7891234567890",
  internal_code: "17",
  sku: "AM350",
  image_url: null,
  base_unit: "un",
  price_cents: 450,
  stock_base: 20,
  min_stock_base: 0,
};
const amstel473 = {
  ...amstel,
  id: "amstel473",
  name: "Amstel lata 473 ml",
  barcode: "7891234567897",
  internal_code: "170",
  sku: "AM473",
};

function respostaPendente<T>() {
  let resolver!: (valor: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promise, resolve: resolver };
}

function abrirCaixa() {
  const tela = render(<Pagina />);
  return { ...tela, busca: screen.getByRole("combobox", { name: "Buscar produto para vender" }) };
}

function carrinho() {
  return within(screen.getByRole("heading", { name: /^Carrinho/ }).parentElement!);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.tenantId = "adega";
});

describe("Venda no Balcão pelo teclado", () => {
  it.each([
    ["7891234567890", [amstel, { ...amstel473, barcode: "17891234567890" }]],
    ["17", [amstel473, amstel]],
    ["amstel lata 350 ml", [amstel473, amstel]],
  ] as const)("adiciona %s com Enter antes da busca atrasada", async (termo, resposta) => {
    mocks.buscar.mockResolvedValue(resposta);
    const { busca } = abrirCaixa();

    fireEvent.change(busca, { target: { value: termo } });
    expect(mocks.buscar).not.toHaveBeenCalled();
    fireEvent.keyDown(busca, { key: "Enter" });
    expect(mocks.buscar).toHaveBeenCalledExactlyOnceWith({ data: { tenantId: "adega", termo } });

    expect(await carrinho().findByText(amstel.name)).toBeVisible();
    expect(busca).toHaveValue("");
    expect(busca).toHaveFocus();
    expect(mocks.finalizar).not.toHaveBeenCalled();
  });

  it("permite escolher entre nomes parecidos com as setas e fecha com um novo Enter", async () => {
    const venda = respostaPendente<{ sale_number: number; total_cents: number }>();
    mocks.buscar.mockResolvedValue([amstel, amstel473]);
    mocks.finalizar.mockReturnValue(venda.promise);
    const usuario = userEvent.setup();
    const { busca } = abrirCaixa();

    await usuario.type(busca, "Amstel{Enter}");
    const segundoProduto = await screen.findByRole("option", { name: /Amstel lata 473 ml/ });
    expect(carrinho().getByText("Nenhum item ainda.")).toBeVisible();
    await usuario.keyboard("{ArrowDown}{ArrowDown}");
    expect(segundoProduto).toHaveAttribute("aria-selected", "true");
    expect(busca).toHaveAttribute("aria-activedescendant", segundoProduto.id);
    await usuario.keyboard("{Enter}");
    expect(carrinho().getByText(amstel473.name)).toBeVisible();

    fireEvent.keyDown(busca, { key: "Enter", repeat: true });
    expect(mocks.finalizar).not.toHaveBeenCalled();
    await usuario.keyboard("{Enter}{Enter}");
    expect(mocks.finalizar).toHaveBeenCalledExactlyOnceWith({
      data: {
        tenantId: "adega",
        itens: [{ productId: amstel473.id, quantity: 1 }],
        paymentMethod: "dinheiro",
        discountCents: 0,
        surchargeCents: 0,
        customerName: null,
      },
    });

    await act(async () => venda.resolve({ sale_number: 12, total_cents: 450 }));
    expect(screen.getByText("#12")).toBeVisible();
    expect(carrinho().getByText("Nenhum item ainda.")).toBeVisible();
    expect(busca).toHaveFocus();
  });

  it("adiciona produtos em sequência e registra todos juntos", async () => {
    mocks.buscar.mockResolvedValueOnce([amstel473, amstel]).mockResolvedValueOnce([amstel473]);
    mocks.finalizar.mockResolvedValue({ sale_number: 14, total_cents: 900 });
    const usuario = userEvent.setup();
    const { busca } = abrirCaixa();

    await usuario.type(busca, "17{Enter}");
    await carrinho().findByText(amstel.name);
    await usuario.type(busca, "170{Enter}");
    expect(await carrinho().findByText(amstel473.name)).toBeVisible();
    expect(mocks.finalizar).not.toHaveBeenCalled();

    await usuario.keyboard("{Enter}");
    expect(await screen.findByText("#14")).toBeVisible();
    expect(mocks.finalizar).toHaveBeenCalledWith({
      data: expect.objectContaining({
        itens: [
          { productId: amstel.id, quantity: 1 },
          { productId: amstel473.id, quantity: 1 },
        ],
      }),
    });
  });

  it("ignora uma busca atrasada e mantém a venda aberta quando o código atual não existe", async () => {
    const atrasada = respostaPendente<(typeof amstel)[]>();
    mocks.buscar
      .mockResolvedValueOnce([amstel])
      .mockReturnValueOnce(atrasada.promise)
      .mockResolvedValueOnce([]);
    const { busca } = abrirCaixa();

    fireEvent.change(busca, { target: { value: amstel.barcode } });
    fireEvent.keyDown(busca, { key: "Enter" });
    await carrinho().findByText(amstel.name);

    fireEvent.change(busca, { target: { value: amstel473.name } });
    fireEvent.keyDown(busca, { key: "Enter" });
    fireEvent.change(busca, { target: { value: "999" } });
    fireEvent.keyDown(busca, { key: "Enter" });
    expect(await screen.findByText("Nenhum produto encontrado.")).toBeVisible();

    await act(async () => atrasada.resolve([amstel473]));
    expect(carrinho().queryByText(amstel473.name)).not.toBeInTheDocument();
    expect(busca).toHaveValue("999");
    expect(mocks.finalizar).not.toHaveBeenCalled();
  });

  it("preserva o carrinho quando a venda falha e permite tentar novamente", async () => {
    mocks.buscar.mockResolvedValue([amstel]);
    mocks.finalizar
      .mockRejectedValueOnce(new Error("Falha na venda"))
      .mockResolvedValueOnce({ sale_number: 13, total_cents: 450 });
    const { busca } = abrirCaixa();

    fireEvent.change(busca, { target: { value: amstel.sku } });
    fireEvent.keyDown(busca, { key: "Enter" });
    await carrinho().findByText(amstel.name);
    await act(async () => {
      fireEvent.keyDown(busca, { key: "Enter" });
    });
    expect(carrinho().getByText(amstel.name)).toBeVisible();
    expect(busca).toHaveFocus();
    fireEvent.keyDown(busca, { key: "Enter" });
    expect(await screen.findByText("#13")).toBeVisible();
    expect(mocks.finalizar).toHaveBeenCalledTimes(2);
  });

  it("isola o carrinho e a busca ao trocar de loja", async () => {
    const atrasada = respostaPendente<(typeof amstel)[]>();
    mocks.buscar.mockResolvedValueOnce([amstel]).mockReturnValueOnce(atrasada.promise);
    const { busca, rerender } = abrirCaixa();

    fireEvent.change(busca, { target: { value: amstel.sku } });
    fireEvent.keyDown(busca, { key: "Enter" });
    await carrinho().findByText(amstel.name);
    fireEvent.change(busca, { target: { value: amstel473.name } });
    fireEvent.keyDown(busca, { key: "Enter" });

    mocks.tenantId = "mercado";
    rerender(<Pagina />);
    await act(async () => atrasada.resolve([amstel473]));
    expect(carrinho().getByText("Nenhum item ainda.")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Buscar produto para vender" })).toHaveFocus();
  });
});
