import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Tabs } from "@/components/ui/tabs";
import { ScrollableTabs, type ScrollableTabItem } from "./ScrollableTabs";
import { SectionHeader } from "./SectionHeader";

const MENU_TABS: readonly ScrollableTabItem[] = [
  { value: "categories", label: "Categorias" },
  { value: "products", label: "Sabores" },
  { value: "pizza_sizes", label: "Tamanhos" },
  { value: "beverages", label: "Bebidas" },
  { value: "extras", label: "Bordas/Adic." },
  { value: "config", label: "Config.", emphasis: true },
];

beforeAll(() => {
  // jsdom não implementa scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});

function renderTabs(value = "categories") {
  return render(
    <Tabs value={value} onValueChange={() => {}}>
      <ScrollableTabs items={MENU_TABS} value={value} />
    </Tabs>,
  );
}

describe("abas roláveis do cardápio", () => {
  it("renderiza as seis abas", () => {
    renderTabs();
    for (const tab of MENU_TABS) {
      expect(screen.getByRole("tab", { name: tab.label })).toBeInTheDocument();
    }
  });

  it("mantém cada rótulo em uma linha só", () => {
    // A regressão original era `grid-cols-2` com seis itens: três linhas de
    // abas invadindo o conteúdo abaixo.
    renderTabs();
    for (const tab of MENU_TABS) {
      expect(screen.getByRole("tab", { name: tab.label }).className).toContain("whitespace-nowrap");
    }
  });

  it("não usa largura fixa que estoure a viewport", () => {
    const { container } = renderTabs();
    const list = screen.getByRole("tablist");
    // `w-[900px]` era o que causava overflow horizontal entre 900 e 1024px.
    expect(list.className).not.toMatch(/w-\[\d+px\]/);
    expect(container.querySelector(".scroll-x-hidden")).not.toBeNull();
  });

  it("marca a aba ativa de forma programática, não só por cor", () => {
    renderTabs("beverages");
    expect(screen.getByRole("tab", { name: "Bebidas" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Categorias" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("traz a aba ativa para o campo de visão", () => {
    renderTabs("config");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("dá às abas altura de toque confortável", () => {
    renderTabs();
    // h-11 = 44px, o mínimo recomendado para alvos de toque.
    expect(screen.getByRole("tab", { name: "Categorias" }).className).toContain("h-11");
  });
});

describe("cabeçalho de seção", () => {
  it("mostra título e ação sem que um esconda o outro", () => {
    render(
      <SectionHeader title="Categorias" action={<button type="button">Nova Categoria</button>} />,
    );
    expect(screen.getByRole("heading", { name: "Categorias" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova Categoria" })).toBeInTheDocument();
  });

  it("empilha no celular e alinha em linha a partir de sm", () => {
    const { container } = render(<SectionHeader title="Categorias" />);
    const root = container.firstElementChild!;
    expect(root.className).toContain("flex-col");
    expect(root.className).toContain("sm:flex-row");
  });

  it("trunca título longo em vez de empurrar a ação para fora", () => {
    render(
      <SectionHeader
        title="Categoria com um nome absurdamente longo que não caberia em 320px"
        action={<button type="button">Nova</button>}
      />,
    );
    const heading = screen.getByRole("heading");
    expect(heading.className).toContain("truncate");
    // `min-w-0` no pai é o que permite o truncate funcionar dentro de um flex.
    expect(heading.parentElement?.className).toContain("min-w-0");
  });

  it("permite acionar a ação normalmente", async () => {
    const onClick = vi.fn();
    render(
      <SectionHeader
        title="Categorias"
        action={
          <button type="button" onClick={onClick}>
            Nova Categoria
          </button>
        }
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Nova Categoria" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
