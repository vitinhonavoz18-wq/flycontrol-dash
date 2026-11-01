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
function itensDoCatalogo(catalogo: Catalogo): ItemCardapio[] {
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
    // O nome com a seção na frente: "Cuscuz Manteiga", "Tapioca Salgada
    // Manteiga". Existe porque há lojas com o MESMO nome em seções diferentes,
    // e cada um com seu preço — é o garçom que precisa ouvir "manteiga DO
    // CUSCUZ" para não lançar a tapioca de manteiga na comanda.
    const comSecao = normalizar(`${item.categoria ?? ""} ${item.nome}`);

    let pontos = 0;
    if (nome === alvo || comSecao === alvo) pontos = 100;
    else if (nome.startsWith(alvo)) pontos = 80;
    else if (nome.includes(alvo)) pontos = 60;
    else if (palavras.length > 0 && palavras.every((p) => nome.includes(p))) pontos = 40;
    else if (descricao.includes(alvo)) pontos = 20;
    else if (palavras.length > 0 && palavras.every((p) => comSecao.includes(p))) pontos = 15;
    else if (palavras.length > 0 && palavras.every((p) => descricao.includes(p))) pontos = 10;

    if (pontos > 0) achados.push({ ...item, pontos });
  }

  return achados
    .sort((a, b) => b.pontos - a.pontos || a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, Math.max(1, Math.min(limite, 25)));
}

/**
 * Uma SEÇÃO inteira do cardápio, quando a busca é o nome dela.
 *
 * Cardápio grande chega à IA resumido (só exemplos de cada seção). Sem isto,
 * "quais tapiocas salgadas vocês têm?" virava uma busca que devolve 8 de 24 —
 * o garçom que lê só a primeira página do cardápio. Com isto, a IA pede
 * "Tapioca Salgada" e recebe a seção completa.
 *
 * Devolve `null` quando o termo não é o nome de nenhuma seção, para quem
 * chama seguir com a busca normal.
 */
export function itensDaSecao(catalogo: Catalogo, termo: string): ItemCardapio[] | null {
  const alvo = normalizar(termo);
  if (!alvo) return null;
  const secao = catalogo.cardapio.find((c) => normalizar(c.categoria) === alvo);
  return secao && secao.itens.length > 0 ? secao.itens : null;
}

export type ItemPedido = {
  nome: string;
  quantidade: number;
  observacao?: string | null;
  /**
   * Bordas e adicionais DESTE item, só pelo nome ("Borda Catupiry", "Bacon").
   * O preço de cada um sai do cadastro de adicionais da loja, nunca da IA.
   * Opcional: quem não manda (açaí, pastel) continua exatamente como antes.
   */
  adicionais?: string[] | null;
};

export type AdicionalResolvido = { nome: string; preco_cents: number };

export type ItemResolvido = {
  menu_product_id: string;
  nome: string;
  quantidade: number;
  /** Preço do produto + preço dos adicionais escolhidos, por unidade. */
  preco_unitario_cents: number;
  total_cents: number;
  observacao: string | null;
  adicionais: AdicionalResolvido[];
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
 * Acha um adicional (borda, bacon extra...) no cadastro da loja pelo nome.
 *
 * Primeiro o nome exato. Se não houver, aceita um nome parecido SÓ quando
 * todos os parecidos custam o mesmo — "catupiry" que bate em duas bordas com
 * preços diferentes não é escolhido no chute: volta como não encontrado, e a
 * IA é mandada usar o nome certo. Cobrar a borda errada é cobrar errado.
 */
export function acharAdicional(catalogo: Catalogo, nome: string): AdicionalResolvido | null {
  const alvo = normalizar(nome);
  if (!alvo) return null;
  const lista = (catalogo.adicionais ?? []).filter((a) => normalizar(a.nome));

  const exato = lista.find((a) => normalizar(a.nome) === alvo);
  if (exato) return { nome: exato.nome, preco_cents: exato.preco_cents };

  const palavras = alvo.split(" ").filter((p) => p.length >= 2);
  const parecidos = lista.filter((a) => {
    const n = normalizar(a.nome);
    return n.includes(alvo) || (palavras.length > 0 && palavras.every((p) => n.includes(p)));
  });
  if (parecidos.length === 0) return null;
  const precos = new Set(parecidos.map((a) => a.preco_cents));
  if (precos.size > 1) return null;
  return { nome: parecidos[0].nome, preco_cents: parecidos[0].preco_cents };
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

    // Bordas e adicionais: o nome vem da IA, o PREÇO vem do cadastro. O que
    // não existir não é cobrado no chute — vai para a lista de "não temos".
    const adicionais: AdicionalResolvido[] = [];
    for (const bruto of (Array.isArray(pedido.adicionais) ? pedido.adicionais : []).slice(0, 10)) {
      const nomeAdicional = String(bruto ?? "").trim();
      if (!nomeAdicional) continue;
      const adicional = acharAdicional(catalogo, nomeAdicional);
      if (adicional) adicionais.push(adicional);
      else nao_encontrados.push(`${nomeAdicional} (adicional de ${achado.nome})`);
    }

    const textoDosAdicionais = adicionais.length
      ? `+ ${adicionais.map((a) => a.nome).join(", ")}`
      : "";
    const observacao =
      [textoDosAdicionais, String(pedido.observacao ?? "").trim()].filter(Boolean).join(" | ") ||
      null;
    const unitario = achado.preco_cents + adicionais.reduce((t, a) => t + a.preco_cents, 0);

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
      preco_unitario_cents: unitario,
      total_cents: unitario * quantidade,
      observacao,
      adicionais,
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

/**
 * O CARDÁPIO INTEIRO, quando o cliente pergunta "o que vocês têm?".
 *
 * ISTO NASCEU DE UM ERRO MEU. A busca (`procurarProdutos`) devolve lista vazia
 * quando não tem termo — e eu tinha deixado só a busca. Resultado: o cliente
 * perguntava "qual é o cardápio?" e a atendente respondia que não sabia, com a
 * loja tendo 23 pratos cadastrados. É o garçom que só sabe responder se você
 * já souber o nome do prato.
 *
 * O TETO EXISTE POR UM MOTIVO. Uma loja com 300 itens não cabe numa mensagem
 * de WhatsApp — nem na cabeça de quem lê. Passando do teto, vão os nomes das
 * categorias e alguns exemplos, e a atendente pergunta o que a pessoa quer.
 * Recitar 300 pratos é o mesmo que não responder.
 */
export function listarCardapio(catalogo: Catalogo, teto = 60): string {
  const total = itensDoCatalogo(catalogo).length;
  if (total === 0) {
    return (
      "Esta loja ainda não tem nenhum produto disponível no cardápio. " +
      "NÃO invente itens. Diga ao cliente que vai chamar um atendente."
    );
  }

  const linhas: string[] = [
    `CARDÁPIO DE ${catalogo.loja.nome.toUpperCase()} (${total} itens):`,
    "",
  ];

  if (total > teto) {
    linhas.push(
      "O cardápio é grande. Estas são as seções e alguns exemplos de cada uma.",
      "Pergunte ao cliente o que ele procura e use a busca por nome.",
      "",
    );
    for (const c of catalogo.cardapio) {
      const exemplos = c.itens.slice(0, 3).map((i) => `${i.nome} (${emReais(i.preco_cents)})`);
      linhas.push(`## ${c.categoria} — ${c.itens.length} itens: ${exemplos.join(", ")}...`);
    }
  } else {
    for (const c of catalogo.cardapio) {
      linhas.push(`## ${c.categoria}`);
      for (const i of c.itens) {
        const desc = i.descricao ? ` — ${i.descricao}` : "";
        linhas.push(`- ${i.nome}: ${emReais(i.preco_cents)}${desc}`);
      }
      linhas.push("");
    }
  }

  if (catalogo.combos.length > 0) {
    linhas.push("## Combos no ar agora");
    for (const c of catalogo.combos) linhas.push(`- ${c.nome}: ${emReais(c.preco_cents)}`);
    linhas.push("");
  }

  if (catalogo.tamanhos_pizza.length > 0) {
    linhas.push("## Tamanhos de pizza");
    for (const t of catalogo.tamanhos_pizza) {
      const sab = t.sabores ? ` (até ${t.sabores} sabores)` : "";
      linhas.push(`- ${t.nome}: ${emReais(t.preco_cents)}${sab}`);
    }
    linhas.push("");
  }

  // Bordas, complementos e adicionais. Sem esta lista a atendente não sabia
  // que a borda de catupiry existia nem quanto custava — o garçom que não sabe
  // que a casa tem borda recheada deixa de vender a borda.
  const adicionais = adicionaisSemRepetir(catalogo);
  if (adicionais.length > 0) {
    linhas.push("## Adicionais (bordas, complementos e extras)");
    for (const a of adicionais) linhas.push(`- ${a.nome}: ${emReais(a.preco_cents)}`);
    linhas.push("");
  }

  linhas.push(
    "Ofereça SOMENTE o que está escrito acima, com ESTES preços.",
    "Não mande a lista inteira de uma vez: sugira 3 ou 4 e pergunte.",
  );

  return linhas.join("\n");
}

/** Os adicionais da loja sem repetir o mesmo nome com o mesmo preço. */
export function adicionaisSemRepetir(
  catalogo: Catalogo,
): Array<{ nome: string; preco_cents: number }> {
  const vistos = new Set<string>();
  const saida: Array<{ nome: string; preco_cents: number }> = [];
  for (const a of catalogo.adicionais ?? []) {
    const nome = String(a?.nome ?? "").trim();
    if (!nome) continue;
    const chave = `${normalizar(nome)}|${a.preco_cents}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push({ nome, preco_cents: a.preco_cents });
  }
  return saida;
}

/**
 * Os adicionais cujo nome bate com a busca ("borda", "catupiry", "bacon").
 * Uma busca por "borda" que só olhasse os pratos voltaria vazia, e a
 * atendente diria que a casa não tem borda.
 */
export function procurarAdicionais(
  catalogo: Catalogo,
  termo: string,
): Array<{ nome: string; preco_cents: number }> {
  const alvo = normalizar(termo);
  if (!alvo) return [];
  const palavras = alvo.split(" ").filter((p) => p.length >= 3);
  return adicionaisSemRepetir(catalogo).filter((a) => {
    const n = normalizar(a.nome);
    return n.includes(alvo) || alvo.includes(n) || palavras.some((p) => n.includes(p));
  });
}

/** Os bairros onde a loja entrega, com a taxa de cada um. */
export function listarBairros(zonas: ZonaEntrega[]): Array<{ bairro: string; taxa_cents: number }> {
  return (zonas ?? [])
    .map((z) => ({
      bairro: String(z.neighborhood ?? "").trim(),
      taxa_cents: taxaParaCentavos(z.fee),
    }))
    .filter((z) => z.bairro)
    .sort((a, b) => a.bairro.localeCompare(b.bairro, "pt-BR"));
}

/**
 * A lista de bairros escrita para a IA ler.
 *
 * QUANDO A LOJA NÃO CADASTROU NENHUM BAIRRO, o texto diz isso com todas as
 * letras. Antes o silêncio parecia defeito do robô; era cadastro faltando. É a
 * diferença entre o entregador dizer "não sei se a gente vai aí" e dizer "a
 * gente ainda não marcou no mapa até onde vai" — a segunda frase manda alguém
 * resolver.
 */
export function textoDosBairros(zonas: ZonaEntrega[]): string {
  const lista = listarBairros(zonas);
  if (lista.length === 0) {
    return (
      "Esta loja ainda NÃO cadastrou nenhum bairro de entrega no painel. " +
      "NÃO invente taxa e NÃO prometa entrega. Pergunte o endereço, diga que " +
      "um atendente confirma o valor da entrega, e chame um atendente."
    );
  }
  return [
    `A loja entrega em ${lista.length} bairro(s):`,
    ...lista.map((z) => `- ${z.bairro}: ${z.taxa_cents === 0 ? "grátis" : emReais(z.taxa_cents)}`),
    "",
    "Só estes. Bairro fora desta lista: NÃO prometa entrega, chame um atendente.",
  ].join("\n");
}
