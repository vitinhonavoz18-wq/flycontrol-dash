type ItemDoSite = {
  external_id?: string | number | null;
  name: string;
  type?: string;
  description?: string | null;
  price?: number;
  image_url?: string | null;
  is_active?: boolean;
};

type ProdutoLocal = {
  id: string;
  category_id: string | null;
  external_id: string | null;
  name: string;
  product_type: string | null;
};

function tipoParaComparacao(tipo: string | null) {
  return tipo === "product" ? "standard" : tipo;
}

function codigoDoItem(codigo: string | null) {
  return codigo?.replace(/^sf_(?:prod|drink|bev)_/, "") ?? null;
}

async function idParaProdutoNovo(loja: string, item: ItemDoSite, categoria: string, tipo: string) {
  // A mesma loja importando o mesmo item em duas abas usa o mesmo ID de inserção.
  const origem = codigoDoItem(item.external_id?.toString() ?? null);
  const chave = JSON.stringify([loja, "menu-sync", tipo, origem ?? [categoria, item.name]]);
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(chave)),
  );
  hash[6] = (hash[6] & 0x0f) | 0x80;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = Array.from(hash.subarray(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function planejarProdutosNormalizados(
  loja: string,
  recebidos: { item: ItemDoSite; categoria: string }[],
  existentes: ProdutoLocal[],
  dataDaImportacao: string,
) {
  const porId = new Map(existentes.map((produto) => [produto.id, produto]));
  const linhas = new Map<
    string,
    ProdutoLocal & {
      pizzeria_id: string;
      description: string | null;
      price: number;
      image_url: string | null;
      active: boolean;
      available: boolean;
      external_source: string;
      last_synced_at: string;
    }
  >();

  for (const { item, categoria } of recebidos) {
    const externalId = item.external_id?.toString() || null;
    const codigo = codigoDoItem(externalId);
    const tipo = item.type === "drink" ? "beverage" : item.type || "standard";
    const comparacao = tipoParaComparacao(tipo);
    const sameType = (produto: ProdutoLocal) =>
      tipoParaComparacao(produto.product_type) === comparacao;
    const porCodigo =
      codigo &&
      Array.from(porId.values()).find(
        (produto) => sameType(produto) && codigoDoItem(produto.external_id) === codigo,
      );
    const porNome = Array.from(porId.values()).filter(
      (produto) =>
        sameType(produto) &&
        produto.category_id === categoria &&
        produto.name === item.name &&
        (!externalId || !produto.external_id),
    );
    const existente = porCodigo || (porNome.length === 1 ? porNome[0] : null);
    const id =
      existente?.id ?? (await idParaProdutoNovo(loja, item, categoria, comparacao ?? tipo));
    const linha = {
      id,
      pizzeria_id: loja,
      category_id: categoria,
      product_type: existente?.product_type ?? tipo,
      name: item.name,
      description: item.description || null,
      price: item.price || 0,
      image_url: item.image_url || null,
      active: item.is_active ?? true,
      available: item.is_active ?? true,
      external_id: existente?.external_id || externalId,
      external_source: "sitecreatorfly",
      last_synced_at: dataDaImportacao,
    };
    linhas.set(id, linha);
    porId.set(id, linha);
  }

  return Array.from(linhas.values());
}
