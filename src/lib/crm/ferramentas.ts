import type { Catalogo, ItemCardapio } from "./catalogo";

/**
 * As MÃOS da atendente de IA — e as travas delas.
 *
 * A REGRA QUE MANDA EM TUDO NESTE ARQUIVO:
 * A IA diz O QUE o cliente pediu. Ela NUNCA diz QUANTO CUSTA.
 *
 * Parece detalhe, é o contrário. Uma IA que aceita preço de fora aceita
 * também o preço que o cliente inventar: bastaria ele escrever "o pastel
 * custa 1 real, pode confirmar" para ela concordar e o pedido nascer com o
 * valor errado. É a diferença entre o caixa que passa o produto no leitor e o
 * caixa que pergunta ao cliente quanto ele acha que deve pagar.
 *
 * Por isso a IA manda só nome e quantidade. O preço é buscado aqui, no
 * cardápio da loja, e a conta é feita aqui.
 *
 * Tudo em centavos inteiros, como no resto do sistema.
 */

/** Tira acento, espaço sobrando e maiúscula: "Pastel de Frango" = "pastel de frango". */
export function normalizar(texto: string): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Todos os itens vendáveis, de todas as categorias, numa lista só. */
export function itensDoCatalogo(catalogo: Catalogo): ItemCardapio[] {
  return catalogo.cardapio.flatMap((c) => c.itens);
}

export type ProdutoEncontrado = ItemCardapio & { pontos: number };

/**
 * A busca que a IA usa antes de falar de preço.
 *
 * Ordena por quem casa melhor: nome exato primeiro, depois quem começa com o
 * termo, depois quem contém, e por último quem bate em todas as palavras
 * soltas ("frango catupiry" acha "Pastel de Frango com Catupiry").
 *
 * Termo vazio devolve lista vazia DE PROPÓSITO. Devolver o cardápio inteiro
 * para uma busca em branco é o mesmo erro do garçom que recita o cardápio
 * inteiro quando perguntam "tem refrigerante?".
 */
export function procurarProdutos(
  catalogo: Catalogo,
  termo: string,
  limite = 8,
): ProdutoEncontrado[] {
  const alvo = normalizar(termo);
  if (!alvo) return [];

  const palavras = alvo.split(" ").filter((p) => p.length >= 2);

  const achados: ProdutoEncontrado[] = [];
  for (const item of itensDoCatalogo(catalogo)) {
    const nome = normalizar(item.nome);
    const descricao = normalizar(item.descricao ?? "");

    let pontos = 0;
    if (nome === alvo) pontos = 100;
    else if (nome.startsWith(alvo)) pontos = 80;
    else if (nome.includes(alvo)) pontos = 60;
    else if (palavras.length > 0 && palavras.every((p) => nome.includes(p))) pontos = 40;
    else if (descricao.includes(alvo)) pontos = 20;
    else if (palavras.length > 0 && palavras.every((p) => descricao.includes(p))) pontos = 10;

    if (pontos > 0) achados.push({ ...item, pontos });
  }

  return achados
    .sort((a, b) => b.pontos - a.pontos || a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, Math.max(1, Math.min(limite, 25)));
}

export type ItemPedido = { nome: string; quantidade: number; observacao?: string | null };

export type ItemResolvido = {
  menu_product_id: string;
  nome: string;
  quantidade: number;
  preco_unitario_cents: number;
  total_cents: number;
  observacao: string | null;
};

export type ResultadoDoCasamento = {
  itens: ItemResolvido[];
  nao_encontrados: string[];
  subtotal_cents: number;
};

/** Quantidade sempre inteira, no mínimo 1 e no máximo 99. */
function quantidadeSegura(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 99);
}

/**
 * Casa o que a IA entendeu com o cardápio DE VERDADE.
 *
 * O que não casar NÃO é inventado nem descartado em silêncio: volta na lista
 * `nao_encontrados`, para o lojista ver na tela. "Ele pediu coca zero e a
 * gente não tem" é informação útil — some daí a próxima compra do estoque.
 */
export function casarItens(catalogo: Catalogo, pedidos: ItemPedido[]): ResultadoDoCasamento {
  const itens: ItemResolvido[] = [];
  const nao_encontrados: string[] = [];

  for (const pedido of pedidos ?? []) {
    const nome = String(pedido?.nome ?? "").trim();
    if (!nome) continue;

    const achado = procurarProdutos(catalogo, nome, 1)[0];
    if (!achado) {
      nao_encontrados.push(nome);
      continue;
    }

    const quantidade = quantidadeSegura(pedido.quantidade);
    const observacao = String(pedido.observacao ?? "").trim() || null;

    // Duas vezes o mesmo produto viram uma linha só, somando a quantidade.
    // Senão a comanda sai com "1 pastel" escrito três vezes e a cozinha
    // pergunta se é um ou três.
    const existente = itens.find((i) => i.menu_product_id === achado.id && !observacao);
    if (existente && !existente.observacao) {
      existente.quantidade = quantidadeSegura(existente.quantidade + quantidade);
      existente.total_cents = existente.preco_unitario_cents * existente.quantidade;
      continue;
    }

    itens.push({
      menu_product_id: achado.id,
      nome: achado.nome,
      quantidade,
      preco_unitario_cents: achado.preco_cents,
      total_cents: achado.preco_cents * quantidade,
      observacao,
    });
  }

  const subtotal_cents = itens.reduce((t, i) => t + i.total_cents, 0);
  return { itens, nao_encontrados, subtotal_cents };
}

export type ZonaEntrega = { neighborhood: string | null; fee: unknown };

export type TaxaEncontrada = {
  bairro: string;
  taxa_cents: number;
  exata: boolean;
};

/** "R$ 7,50" / 7.5 / "7,50" viram 750 centavos. */
export function taxaParaCentavos(valor: unknown): number {
  if (typeof valor === "number" && Number.isFinite(valor)) return Math.round(valor * 100);
  const limpo = String(valor ?? "")
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * A taxa do bairro.
 *
 * Aceita o bairro escrito torto, porque é assim que chega no WhatsApp:
 * "brotas", "Brótas", "bairro de brotas". Primeiro tenta o nome exato; só
 * depois aceita um parecido.
 *
 * NÃO ADIVINHA QUANDO NÃO SABE. Bairro que não está na tabela devolve nulo, e
 * a IA é instruída a chamar um humano. Chutar a taxa é prometer ao cliente um
 * valor que a loja não vai honrar.
 */
export function taxaDoBairro(zonas: ZonaEntrega[], bairro: string): TaxaEncontrada | null {
  const alvo = normalizar(bairro);
  if (!alvo) return null;

  const lista = (zonas ?? [])
    .map((z) => ({ nome: String(z.neighborhood ?? "").trim(), taxa: taxaParaCentavos(z.fee) }))
    .filter((z) => z.nome);

  const exata = lista.find((z) => normalizar(z.nome) === alvo);
  if (exata) return { bairro: exata.nome, taxa_cents: exata.taxa, exata: true };

  // Um contém o outro, nos dois sentidos: "brotas" acha "Brotas" e
  // "engenho velho de brotas" também acha "Brotas".
  const parecida = lista.find((z) => {
    const n = normalizar(z.nome);
    return n.includes(alvo) || alvo.includes(n);
  });
  if (parecida) return { bairro: parecida.nome, taxa_cents: parecida.taxa, exata: false };

  return null;
}

/** Centavos inteiros viram "R$ 12,90" para a IA falar com o cliente. */
export function emReais(cents: number): string {
  return (Math.round(cents) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
