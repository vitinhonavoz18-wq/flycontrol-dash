import { describe, expect, it } from "vitest";
import dados from "./demonstracoes.json";
import {
  categorias,
  demonstracoesPublicas,
  mostrarFiltros,
  type Demonstracao,
} from "./demonstracoes";

const video = (extra: Partial<NonNullable<Demonstracao["video"]>> = {}) => ({
  mp4: "/vitrine/x/demo.mp4",
  webm: null,
  poster: "/vitrine/x/poster.webp",
  largura: 720,
  altura: 1280,
  duracao: 15,
  tamanhoKB: 2000,
  gravadoEm: "2026-11-11T00:00:00Z",
  versaoRoteiro: 2,
  etapas: ["capa", "cardápio", "produto adicionado", "resumo do pedido"],
  lojaFechadaNaGravacao: false,
  ...extra,
});
const loja = (slug: string, extra: Partial<Demonstracao> = {}): Demonstracao => ({
  slug,
  nome: slug,
  categoria: "Hamburgueria",
  cidade: null,
  url: `https://conectfly.com.br/${slug}`,
  cor: "#000",
  logo: null,
  publicar: true,
  video: video(),
  ...extra,
});

describe("vitrine de cardápios", () => {
  it("só mostra o que foi aprovado E tem vídeo", () => {
    const lista = demonstracoesPublicas([
      loja("aprovada"),
      loja("nao-aprovada", { publicar: false }),
      loja("sem-video", { video: null }),
    ]);
    expect(lista.map((d) => d.slug)).toEqual(["aprovada"]);
  });

  it("loja aberta com pedido completo vem antes de loja fechada", () => {
    const lista = demonstracoesPublicas([
      loja("fechada", {
        video: video({ lojaFechadaNaGravacao: true, etapas: ["capa", "cardápio"] }),
      }),
      loja("completa"),
    ]);
    expect(lista[0].slug).toBe("completa");
  });

  it("filtro só aparece com dados suficientes", () => {
    const poucas = demonstracoesPublicas([loja("a"), loja("b"), loja("c")]);
    expect(mostrarFiltros(poucas)).toBe(false);
    const muitas = demonstracoesPublicas(
      ["Pizzaria", "Pizzaria", "Açaí", "Açaí", "Restaurante", "Restaurante"].map((c, i) =>
        loja(`l${i}`, { categoria: c }),
      ),
    );
    expect(mostrarFiltros(muitas)).toBe(true);
    expect(categorias(muitas)).toHaveLength(3);
  });

  it("os dados reais não têm nada privado e todo cardápio é https", () => {
    for (const d of dados as Demonstracao[]) {
      expect(d.url.startsWith("https://")).toBe(true);
      expect(JSON.stringify(d)).not.toMatch(/token=|api_key|@gmail|cpf|cnpj/i);
    }
  });
});
