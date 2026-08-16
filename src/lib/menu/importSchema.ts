/**
 * Leitura e conferência do cardápio em arquivo JSON.
 *
 * Funções puras: sem React e sem rede. Quem grava é o componente de
 * importação; aqui só se decide o que é válido e, quando não é, qual a
 * mensagem que o dono do restaurante consegue entender.
 *
 * A regra que guia as mensagens: dizer ONDE está o erro e O QUE fazer. Um
 * "JSON inválido" seco obriga a caçar o problema em duzentas linhas — é como
 * o fornecedor devolver o pedido inteiro dizendo só "tem item errado", sem
 * falar qual.
 */

export type ImportedItem = {
  nome: string;
  descricao?: string;
  preco: number;
};

export type ImportedCategory = {
  nome: string;
  descricao?: string;
  itens: ImportedItem[];
};

export type ParsedMenu = {
  categorias: ImportedCategory[];
  bebidas: ImportedItem[];
  bordas: ImportedItem[];
  adicionais: ImportedItem[];
};

export type ParseResult = { ok: true; data: ParsedMenu } | { ok: false; errors: string[] };

/**
 * Teto de segurança. Um arquivo gigante colado por engano travaria o
 * navegador e geraria centenas de chamadas ao site público antes de alguém
 * conseguir cancelar.
 */
export const MAX_ITEMS = 500;

/** Modelo mostrado na tela, para o dono montar o arquivo dele. */
export const MENU_IMPORT_EXAMPLE = `{
  "categorias": [
    {
      "nome": "Pizzas Salgadas",
      "descricao": "Massa artesanal",
      "itens": [
        {
          "nome": "Calabresa",
          "descricao": "Calabresa, cebola e orégano",
          "preco": 45.90
        },
        {
          "nome": "Marguerita",
          "preco": 42.00
        }
      ]
    },
    {
      "nome": "Pizzas Doces",
      "itens": [
        {
          "nome": "Chocolate com Morango",
          "preco": 48.00
        }
      ]
    }
  ],
  "bebidas": [
    {
      "nome": "Coca-Cola 2L",
      "preco": 12.00
    }
  ],
  "bordas": [
    {
      "nome": "Catupiry",
      "preco": 8.00
    }
  ],
  "adicionais": [
    {
      "nome": "Bacon",
      "preco": 5.00
    }
  ]
}`;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Aceita 45.9, "45.9" e "45,90" — vírgula é como se escreve preço no Brasil,
 * e recusar isso reprovaria o arquivo por um detalhe que não é erro de quem
 * escreveu.
 */
export function parsePrice(raw: unknown): number | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) return null;
    return Math.round(raw * 100) / 100;
  }
  if (typeof raw === "string") {
    const cleaned = raw
      .trim()
      .replace(/^R\$\s*/i, "")
      .replace(/\s/g, "");
    if (!cleaned) return null;
    // "1.234,56" (formato brasileiro) vira "1234.56".
    const normalized = cleaned.includes(",")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned;
    if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
    const value = Number(normalized);
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value * 100) / 100;
  }
  return null;
}

function readName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length > 0 ? name : null;
}

function readOptionalText(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const text = raw.trim();
  return text.length > 0 ? text : undefined;
}

/** Confere um item solto (bebida, borda, adicional ou item de categoria). */
function readItem(raw: unknown, where: string, errors: string[]): ImportedItem | null {
  if (!isPlainObject(raw)) {
    errors.push(`${where}: deveria ser um item com "nome" e "preco".`);
    return null;
  }

  const nome = readName(raw.nome);
  if (!nome) {
    errors.push(`${where}: falta o "nome" (ou está vazio).`);
  }

  const preco = parsePrice(raw.preco);
  if (preco === null) {
    if (raw.preco === undefined) {
      errors.push(`${where}: falta o "preco".`);
    } else {
      errors.push(
        `${where}: o "preco" (${JSON.stringify(raw.preco)}) não é um valor válido. ` +
          `Use 45.90 ou "45,90".`,
      );
    }
  }

  if (!nome || preco === null) return null;
  return { nome, descricao: readOptionalText(raw.descricao), preco };
}

/** Lê uma lista de itens soltos (bebidas, bordas, adicionais). */
function readItemList(raw: unknown, key: string, errors: string[]): ImportedItem[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.push(`"${key}": deveria ser uma lista entre colchetes [ ].`);
    return [];
  }
  const items: ImportedItem[] = [];
  raw.forEach((entry, index) => {
    const item = readItem(entry, `${key}[${index}]`, errors);
    if (item) items.push(item);
  });
  return items;
}

function readCategories(raw: unknown, errors: string[]): ImportedCategory[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.push(`"categorias": deveria ser uma lista entre colchetes [ ].`);
    return [];
  }

  const categories: ImportedCategory[] = [];
  raw.forEach((entry, index) => {
    const where = `categorias[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${where}: deveria ser uma categoria com "nome" e "itens".`);
      return;
    }

    const nome = readName(entry.nome);
    if (!nome) errors.push(`${where}: falta o "nome" da categoria (ou está vazio).`);

    let itens: ImportedItem[] = [];
    if (entry.itens === undefined || entry.itens === null) {
      // Categoria sem itens é permitida: serve para criar a seção vazia e
      // preencher depois pela tela normal.
      itens = [];
    } else if (!Array.isArray(entry.itens)) {
      errors.push(`${where}.itens: deveria ser uma lista entre colchetes [ ].`);
    } else {
      entry.itens.forEach((itemRaw, itemIndex) => {
        const item = readItem(itemRaw, `${where}.itens[${itemIndex}]`, errors);
        if (item) itens.push(item);
      });
    }

    if (!nome) return;
    categories.push({ nome, descricao: readOptionalText(entry.descricao), itens });
  });

  return categories;
}

/** Quantos registros a importação vai criar ao todo. */
export function countEntries(menu: ParsedMenu): number {
  const itensDeCategoria = menu.categorias.reduce((sum, c) => sum + c.itens.length, 0);
  return (
    menu.categorias.length +
    itensDeCategoria +
    menu.bebidas.length +
    menu.bordas.length +
    menu.adicionais.length
  );
}

/**
 * Lê o texto colado e devolve o cardápio pronto, ou a lista de erros.
 *
 * Todos os erros saem de uma vez, e não um por vez: corrigir, reenviar e
 * descobrir o próximo é o que faz o dono desistir na terceira tentativa.
 */
export function parseMenuImport(rawText: string): ParseResult {
  const text = rawText.trim();
  if (!text) {
    return { ok: false, errors: ["Cole o conteúdo do arquivo JSON ou anexe o arquivo."] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      errors: [
        "O arquivo não é um JSON válido — geralmente é uma vírgula sobrando, " +
          "uma chave { } que não fechou ou aspas faltando.",
        `Detalhe técnico: ${detail}`,
      ],
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      errors: [
        'O arquivo precisa começar com { e terminar com }, contendo "categorias", ' +
          '"bebidas", "bordas" ou "adicionais".',
      ],
    };
  }

  const errors: string[] = [];
  const categorias = readCategories(parsed.categorias, errors);
  const bebidas = readItemList(parsed.bebidas, "bebidas", errors);
  const bordas = readItemList(parsed.bordas, "bordas", errors);
  const adicionais = readItemList(parsed.adicionais, "adicionais", errors);

  const known = ["categorias", "bebidas", "bordas", "adicionais"];
  const unknownKeys = Object.keys(parsed).filter((k) => !known.includes(k));
  if (unknownKeys.length > 0) {
    // Aviso, não erro: costuma ser erro de digitação no nome do campo, e
    // ignorar em silêncio faria o dono achar que importou o que não importou.
    errors.push(
      `Campo desconhecido: ${unknownKeys.map((k) => `"${k}"`).join(", ")}. ` +
        `Os aceitos são: ${known.map((k) => `"${k}"`).join(", ")}.`,
    );
  }

  const menu: ParsedMenu = { categorias, bebidas, bordas, adicionais };

  if (errors.length === 0 && countEntries(menu) === 0) {
    return {
      ok: false,
      errors: ["O arquivo está vazio: nenhuma categoria, bebida, borda ou adicional encontrada."],
    };
  }

  const total = countEntries(menu);
  if (total > MAX_ITEMS) {
    errors.push(
      `O arquivo tem ${total} registros, acima do limite de ${MAX_ITEMS} por importação. ` +
        `Divida em partes menores.`,
    );
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data: menu };
}
