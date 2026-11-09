import type { CatalogoDePizza } from "./motorDePreco";

/**
 * Avisos da aba Pizzaria que NÃO impedem publicar, mas mudam o que o cliente
 * vê. (Os que impedem estão em `validarConfigPizzaria`, no motor de preço.)
 *
 * Nasceu de um caso real (rocketpizzaria, 09/11/2026): o lojista preencheu o
 * preço de cada sabor em cada tamanho, mas a loja continuava na regra
 * "tamanho + especiais", que ignora esses preços e cobra só o preço do
 * tamanho. O site mostrava Atum a R$ 47,90 na Grande quando ele tinha
 * cadastrado R$ 52,90 — a pizza especial saía mais barata, sem ninguém
 * perceber. É como imprimir a tabela de preços nova e o caixa continuar
 * cobrando pela antiga.
 */
export type AvisoDaPizzaria = {
  codigo: "precos_ignorados_pela_regra" | "categoria_sem_site";
  mensagem: string;
};

export function avisosDaPizzaria(
  catalogo: CatalogoDePizza,
  extras: { categoriasSemSite?: string[] } = {},
): AvisoDaPizzaria[] {
  const avisos: AvisoDaPizzaria[] = [];

  if (catalogo.config.regra === "tamanho_e_especiais") {
    const comPreco = catalogo.sabores.filter(
      (s) => s.ativo && Object.keys(s.precosPorTamanho).length > 0,
    );
    if (comPreco.length > 0) {
      const exemplos = comPreco
        .slice(0, 3)
        .map((s) => `“${s.nome}”`)
        .join(", ");
      avisos.push({
        codigo: "precos_ignorados_pela_regra",
        mensagem:
          `${comPreco.length} ${comPreco.length === 1 ? "sabor tem" : "sabores têm"} preço próprio por tamanho ` +
          `(${exemplos}${comPreco.length > 3 ? "…" : ""}), mas a regra escolhida — “tamanho + especiais” — ` +
          "ignora esses preços e cobra só o preço do tamanho. Para o site usar os preços que você " +
          "cadastrou, escolha “Maior preço” ou “Média proporcional” e clique em Publicar regras.",
      });
    }
  }

  const semSite = extras.categoriasSemSite ?? [];
  if (semSite.length > 0) {
    avisos.push({
      codigo: "categoria_sem_site",
      mensagem:
        `A categoria ${semSite.map((n) => `“${n}”`).join(", ")} ainda não existe no site de pedidos. ` +
        "Abra e salve uma vez na aba do cardápio para criá-la lá; até isso, ela não aparece como pizza no site.",
    });
  }

  return avisos;
}
