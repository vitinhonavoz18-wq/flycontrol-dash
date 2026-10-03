import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// O banco e o site público são trocados por dublês que só anotam o que a tela
// mandou gravar — para conferir que foto e produtos chegam de verdade.
const { gravados, sincronizados } = vi.hoisted(() => ({
  gravados: [] as Array<{ tabela: string; linha: Record<string, unknown> }>,
  sincronizados: [] as Array<{ type: string; data: Record<string, unknown> }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => ({
      insert: (linha: Record<string, unknown>) => {
        gravados.push({ tabela, linha });
        const resposta = { data: { id: `${tabela}-local` }, error: null };
        return {
          select: () => ({ single: () => Promise.resolve(resposta) }),
          then: (seguir: (r: { error: null }) => unknown) =>
            Promise.resolve({ error: null }).then(seguir),
        };
      },
    }),
  },
}));

vi.mock("@/utils/menuSync", () => ({
  syncToExternal: (params: { type: string; data: Record<string, unknown> }) => {
    sincronizados.push({ type: params.type, data: params.data });
    return Promise.resolve({ success: true, externalId: `ext-${sincronizados.length}` });
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MenuImportDialog } from "./MenuImportDialog";

// Do jeito que o ChatGPT costuma responder: com texto antes, cercado de
// ```json e usando "produtos" no lugar de "itens".
const RESPOSTA_DO_CHATGPT = `Aqui está o seu cardápio:
\`\`\`json
{
  "categorias": [
    {
      "nome": "Açaí",
      "produtos": [
        { "nome": "Açaí 300ml", "preço": 15, "imagem": "https://fotos.exemplo.com/acai.jpg" },
        { "nome": "Açaí 500ml", "preço": "22,00" }
      ]
    }
  ]
}
\`\`\``;

function abrir() {
  render(
    <MenuImportDialog
      pizzeriaId="loja-1"
      pizzeriaSlug="loja"
      pizzeriaApiKey="chave"
      syncEndpoint="https://site.exemplo.com/api/menu-sync"
      existingCategoryCount={3}
      onImported={() => {}}
    />,
  );
}

describe("importar cardápio por JSON", () => {
  beforeEach(() => {
    gravados.length = 0;
    sincronizados.length = 0;
  });

  it("mostra a instrução pronta para colar no ChatGPT", async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(screen.getByRole("button", { name: /importar json/i }));
    await user.click(screen.getByRole("button", { name: /montar com o chatgpt/i }));
    expect(screen.getByText(/Transcreva o cardápio informado/)).toBeInTheDocument();
  });

  it("aceita a resposta do ChatGPT e grava os produtos com foto", async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(screen.getByRole("button", { name: /importar json/i }));
    await user.click(screen.getByRole("textbox"));
    await user.paste(RESPOSTA_DO_CHATGPT);
    await user.click(screen.getByRole("button", { name: /validar arquivo/i }));

    // A prévia conta os dois produtos (antes ficavam zero) e avisa o conserto.
    expect(await screen.findByText(/arquivo válido/i)).toBeInTheDocument();
    expect(screen.getByText(/antes ou depois do JSON/)).toBeInTheDocument();
    expect(
      screen.getByText(/Açaí 300ml — R\$ 15\.00 · Açaí 500ml — R\$ 22\.00/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /confirmar e importar 3/i }));
    await waitFor(() => expect(screen.getByText(/3 registros criados/)).toBeInTheDocument());

    const produtos = gravados.filter((g) => g.tabela === "menu_products").map((g) => g.linha);
    expect(produtos).toHaveLength(2);
    expect(produtos[0]).toMatchObject({
      name: "Açaí 300ml",
      price: 15,
      image_url: "https://fotos.exemplo.com/acai.jpg",
      category_id: "menu_categories-local",
    });
    expect(produtos[1]).toMatchObject({ name: "Açaí 500ml", price: 22, image_url: null });

    // A foto também viaja para o site público, e a categoria entra no fim da
    // ordem que já existe (3 categorias antes dela).
    const categoriaNoSite = sincronizados.find((s) => s.type === "category");
    expect(categoriaNoSite?.data).toMatchObject({ name: "Açaí", order_index: 3 });
    const produtoNoSite = sincronizados.find((s) => s.data.name === "Açaí 300ml");
    expect(produtoNoSite?.data.image_url).toBe("https://fotos.exemplo.com/acai.jpg");
  });

  it("campo desconhecido aparece como problema, e nada é gravado", async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(screen.getByRole("button", { name: /importar json/i }));
    await user.click(screen.getByRole("textbox"));
    await user.paste('{ "bebidas": [ { "nome": "Coca", "preco": 12, "tamanho": "2L" } ] }');
    await user.click(screen.getByRole("button", { name: /validar arquivo/i }));

    expect(await screen.findByText(/não reconheço o campo "tamanho"/)).toBeInTheDocument();
    expect(gravados).toHaveLength(0);
  });
});
