import { readFileSync } from "node:fs";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O endereço público da vitrine (/api/public/vitrine-hero).
 *
 * Usa um banco de mentira: o que interessa aqui é o que o endereço faz com a
 * resposta — monta os links pelo cache de fotos, não deixa sair nada além
 * do necessário, e nunca mostra erro ao visitante.
 */

const rpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({ rpc })) }));

const PROJETO = "knhenchgntttraaeewlj";

beforeEach(() => {
  process.env.SUPABASE_URL = `https://${PROJETO}.supabase.co`;
  process.env.SUPABASE_PUBLISHABLE_KEY = "chave-publica-de-teste";
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  rpc.mockReset();
  vi.restoreAllMocks();
});

// O arquivo do endereço carrega o roteador e o cliente do Supabase: a primeira
// importação demora. Ela é feita uma vez, antes dos testes, com prazo folgado —
// senão o primeiro teste estoura o tempo quando a máquina está ocupada.
let listarVitrine: () => Promise<Response>;
beforeAll(async () => {
  ({ listarVitrine } = await import("./vitrine-hero"));
}, 60_000);

async function chamar() {
  const resposta = await listarVitrine();
  return { resposta, corpo: (await resposta.json()) as { itens: Record<string, unknown>[] } };
}

describe("lista da vitrine", () => {
  it("devolve os recortes pelo cache de fotos, com cache longo", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: "1",
          nome: "Pizza Calabresa",
          tipo: "pizza",
          imagem: "1/abc-1200.webp",
          imagem_pequena: "1/abc-640.webp",
          largura: 1200,
          altura: 900,
          preenchimento: 0.71,
        },
      ],
      error: null,
    });
    const { resposta, corpo } = await chamar();
    expect(rpc).toHaveBeenCalledWith("hero_showcase_public");
    expect(resposta.headers.get("cache-control")).toContain("s-maxage=600");
    expect(corpo.itens).toHaveLength(1);
    expect(corpo.itens[0].imagem).toBe(
      `https://flycontrol.conectfly.com.br/api/public/midia/${PROJETO}/public/hero-showcase/1/abc-1200.webp`,
    );
    expect(corpo.itens[0].imagemPequena).toContain("abc-640.webp");
    expect(corpo.itens[0].preenchimento).toBe(0.71);
  });

  it("só sai o necessário: nada de loja, preço ou dono", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: "1",
          nome: "X",
          tipo: "outro",
          imagem: "1/a.webp",
          imagem_pequena: null,
          largura: 10,
          altura: 10,
          preenchimento: 0.5,
          loja: "Segredo",
          preco: 99,
        },
      ],
      error: null,
    });
    const { corpo } = await chamar();
    expect(Object.keys(corpo.itens[0]).sort()).toEqual(
      [
        "altura",
        "id",
        "imagem",
        "imagemPequena",
        "largura",
        "nome",
        "preenchimento",
        "tipo",
      ].sort(),
    );
  });

  it("caminho com '..' é descartado", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: "1",
          nome: "X",
          tipo: "pizza",
          imagem: "../menu-images/segredo.jpg",
          imagem_pequena: null,
          largura: 1,
          altura: 1,
          preenchimento: 1,
        },
      ],
      error: null,
    });
    const { corpo } = await chamar();
    expect(corpo.itens).toEqual([]);
  });

  it("banco fora do ar: lista vazia, cache curto, sem erro para o visitante", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    const { resposta, corpo } = await chamar();
    expect(resposta.status).toBe(200);
    expect(corpo.itens).toEqual([]);
    expect(resposta.headers.get("cache-control")).toContain("s-maxage=60");
    expect(console.error).toHaveBeenCalled();
  });

  it("usa a chave PÚBLICA, nunca a chave de serviço", () => {
    const codigo = readFileSync("src/routes/api/public/vitrine-hero.ts", "utf8");
    expect(codigo).not.toMatch(/SERVICE_ROLE|supabaseAdmin|client\.server/);
  });
});
