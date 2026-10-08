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
 *
 * A OUTRA REGRA: NADA SOME CALADO
 *
 * Quase todo arquivo chega montado pelo ChatGPT, e ele não escreve sempre
 * igual: ora "itens", ora "produtos"; ora "preco", ora "preço" ou "price". A
 * leitura entende esses jeitos de escrever. O que ela não entende vira erro
 * na tela — nunca é jogado fora em silêncio. Antes, uma categoria com
 * "produtos" no lugar de "itens" passava como "arquivo válido" e era criada
 * vazia: o dono confirmava, e os produtos simplesmente não existiam.
 */

export type ImportedItem = {
  nome: string;
  descricao?: string;
  preco: number;
  /** Endereço da foto (https://…). */
  imagem?: string;
};

export type ImportedCategory = {
  nome: string;
  descricao?: string;
  imagem?: string;
  itens: ImportedItem[];
};

export type ParsedMenu = {
  categorias: ImportedCategory[];
  bebidas: ImportedItem[];
  bordas: ImportedItem[];
  adicionais: ImportedItem[];
};

/**
 * `avisos` não impedem a importação: são coisas que a leitura consertou
 * sozinha ou que merecem um olhar antes de confirmar (um preço zerado, por
 * exemplo). Aparecem na prévia.
 */
export type ParseResult =
  { ok: true; data: ParsedMenu; avisos: string[] } | { ok: false; errors: string[] };

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
          "preco": 45.90,
          "imagem": "https://exemplo.com/fotos/calabresa.jpg"
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

/**
 * O texto que o dono cola no ChatGPT (ou outra IA) junto com a foto do
 * cardápio impresso ou a lista que ele já tem.
 *
 * As regras existem para a IA não INVENTAR. Um preço chutado entra no site
 * como se fosse verdade e o cliente paga o valor errado — pior do que deixar
 * o item de fora, que pelo menos o dono percebe e cadastra.
 */
export const INSTRUCAO_PARA_IA = `Transcreva o cardápio informado para o formato JSON abaixo.

Retorne exclusivamente JSON válido, sem explicações antes ou depois e sem \`\`\`.

Use esta estrutura:

{
  "categorias": [
    {
      "nome": "",
      "descricao": "",
      "itens": [
        { "nome": "", "descricao": "", "preco": 0, "imagem": "" }
      ]
    }
  ],
  "bebidas": [
    { "nome": "", "preco": 0 }
  ],
  "bordas": [
    { "nome": "", "preco": 0 }
  ],
  "adicionais": [
    { "nome": "", "preco": 0 }
  ]
}

REGRAS:

1. Use exatamente estes nomes de campo, em português e sem acento: categorias, itens, nome, descricao, preco, imagem, bebidas, bordas, adicionais.
2. Os produtos de cada categoria vão dentro de "itens".
3. "preco" é um número com ponto: 45.90 (sem "R$").
4. Não invente preço. Se não souber o preço de um item, deixe esse item de fora.
5. Não invente descrição nem foto. Se não houver, deixe "" (vazio).
6. "imagem" só aceita um endereço de foto começando com https://.
7. Refrigerantes, sucos e cervejas vão em "bebidas", não dentro de uma categoria.
8. "bordas" são as opções que mudam o produto (na pizzaria, a borda recheada). "adicionais" são os itens extras que o cliente soma ao pedido.
9. Um item que aparece em tamanhos diferentes vira um item para cada tamanho, com o tamanho no nome: "Açaí 300ml", "Açaí 500ml".
10. Mande só as listas que tiverem conteúdo.`;

// ---------------------------------------------------------------------------
// OS NOMES DE CAMPO QUE A LEITURA ENTENDE
// ---------------------------------------------------------------------------

/**
 * Cada campo, e os jeitos de escrever que valem para ele.
 *
 * As chaves do arquivo são comparadas sem acento, sem maiúscula e trocando
 * espaço/hífen por "_": "Preço", "preco" e "PRECO" são a mesma coisa.
 */
const CAMPOS_DA_RAIZ = {
  categorias: ["categorias", "categories", "secoes", "sessoes"],
  bebidas: ["bebidas", "drinks", "beverages"],
  bordas: ["bordas", "borders"],
  adicionais: ["adicionais", "extras", "complementos", "additionals", "addons"],
} as const;

const CAMPOS_DA_CATEGORIA = {
  nome: ["nome", "name", "titulo", "title"],
  descricao: ["descricao", "description"],
  imagem: ["imagem", "imagem_url", "image", "image_url", "foto", "foto_url"],
  itens: ["itens", "items", "produtos", "products"],
} as const;

const CAMPOS_DO_ITEM = {
  nome: ["nome", "name", "titulo", "title"],
  descricao: ["descricao", "description"],
  preco: ["preco", "price", "valor", "preco_venda"],
  imagem: ["imagem", "imagem_url", "image", "image_url", "foto", "foto_url"],
} as const;

/**
 * Campos que a IA costuma acrescentar por conta própria e que não carregam
 * nada que a importação use. Ignorar estes não perde informação: um "id"
 * inventado pela IA não significa nada para o FlyControl.
 */
const IGNORADOS_SEM_PERDA = new Set(["id"]);

function normalizarChave(chave: string): string {
  return chave
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
}

/** O valor do primeiro campo do objeto escrito com um destes nomes. */
function valorPorNome(objeto: Record<string, unknown>, nomes: readonly string[]): unknown {
  for (const [chave, valor] of Object.entries(objeto)) {
    if (nomes.includes(normalizarChave(chave))) return valor;
  }
  return undefined;
}

function rotuloDosCampos(campos: Record<string, readonly string[]>): string {
  return Object.keys(campos)
    .map((c) => `"${c}"`)
    .join(", ");
}

/**
 * Separa os campos do objeto pelos nomes que a leitura entende.
 *
 * O que não for reconhecido vira erro com o nome do campo e a lista dos
 * aceitos — é aqui que um "produtos" escrito de um jeito que ninguém previu
 * deixa de sumir calado.
 */
function lerCampos<C extends Record<string, readonly string[]>>(
  objeto: Record<string, unknown>,
  campos: C,
  onde: string,
  errors: string[],
): Partial<Record<keyof C, unknown>> {
  const lidos: Partial<Record<keyof C, unknown>> = {};
  const desconhecidos: string[] = [];

  for (const [chaveOriginal, valor] of Object.entries(objeto)) {
    const chave = normalizarChave(chaveOriginal);
    const campo = (Object.keys(campos) as (keyof C)[]).find((c) => campos[c].includes(chave));

    if (!campo) {
      if (!IGNORADOS_SEM_PERDA.has(chave)) desconhecidos.push(chaveOriginal);
      continue;
    }
    if (campo in lidos) {
      errors.push(
        `${onde}: o campo "${String(campo)}" aparece duas vezes (como "${chaveOriginal}" também). Deixe só um.`,
      );
      continue;
    }
    lidos[campo] = valor;
  }

  if (desconhecidos.length > 0) {
    const um = desconhecidos.length === 1;
    errors.push(
      `${onde}: não reconheço ${um ? "o campo" : "os campos"} ` +
        `${desconhecidos.map((k) => `"${k}"`).join(", ")}, e o que estiver ${um ? "nele" : "neles"} ` +
        `seria perdido. Os aceitos aqui são: ${rotuloDosCampos(campos)}.`,
    );
  }

  return lidos;
}

// ---------------------------------------------------------------------------
// LEITURA DO TEXTO COLADO
// ---------------------------------------------------------------------------

/**
 * Transforma o erro cru do navegador numa frase com linha e coluna.
 *
 * O Chrome diz "... at position 1423"; o Firefox diz "line 12 column 5".
 * Ninguém conta 1423 caracteres na mão — mas todo editor mostra a linha.
 * `deslocamento` é onde o trecho lido começa dentro do texto original (quando
 * a leitura descartou um "Aqui está o JSON:" antes da chave).
 */
function explicarErroDeSintaxe(erro: unknown, original: string, deslocamento: number): string {
  const base =
    "O arquivo não é um JSON válido — geralmente é uma vírgula faltando, " +
    "uma chave { } que não fechou ou aspas faltando.";
  const mensagem = erro instanceof Error ? erro.message : String(erro);

  const porLinha = /line (\d+) column (\d+)/i.exec(mensagem);
  if (porLinha && deslocamento === 0) {
    return `${base} O problema começa na linha ${porLinha[1]}, coluna ${porLinha[2]}.`;
  }

  const posicao = /position (\d+)/i.exec(mensagem)?.[1];
  if (posicao) {
    const ate = original.slice(0, deslocamento + Number(posicao));
    const linha = ate.split("\n").length;
    const coluna = ate.length - ate.lastIndexOf("\n");
    return `${base} O problema começa na linha ${linha}, coluna ${coluna}.`;
  }

  return base;
}

type LeituraDoJson =
  { ok: true; valor: unknown; consertos: string[] } | { ok: false; erro: string };

/**
 * Lê o JSON, consertando sozinho os três estragos que mais aparecem quando o
 * texto vem do ChatGPT ou passou pelo WhatsApp.
 *
 * Primeiro tenta o texto como veio. Só se isso falhar é que tenta consertar —
 * e conta o que consertou, para a prévia mostrar. Assim um arquivo certo
 * nunca é mexido.
 */
function lerJsonTolerante(texto: string): LeituraDoJson {
  try {
    return { ok: true, valor: JSON.parse(texto), consertos: [] };
  } catch (erroOriginal) {
    const consertos: string[] = [];
    let trecho = texto;
    let deslocamento = 0;

    // 1. O ChatGPT costuma cercar a resposta com ```json … ``` e às vezes
    //    escreve "Aqui está o seu cardápio:" antes. Fica só do primeiro "{"
    //    ao último "}".
    const inicio = trecho.indexOf("{");
    const fim = trecho.lastIndexOf("}");
    const sobraTexto = inicio > 0 || fim < trecho.length - 1;
    if (inicio !== -1 && fim > inicio && sobraTexto) {
      deslocamento = inicio;
      trecho = trecho.slice(inicio, fim + 1);
      consertos.push(
        "Removi o texto que estava antes ou depois do JSON (como o ```json do ChatGPT).",
      );
    }

    const tentativas: Array<{ texto: string; conserto?: string }> = [{ texto: trecho }];

    // 2. Vírgula sobrando antes de fechar lista ou objeto: [ {…}, ]
    const semVirgulaSobrando = trecho.replace(/,(\s*[}\]])/g, "$1");
    if (semVirgulaSobrando !== trecho) {
      tentativas.push({
        texto: semVirgulaSobrando,
        conserto: "Removi vírgulas sobrando antes de fechar uma lista.",
      });
    }

    // 3. Aspas curvas “assim”, que o WhatsApp, o Word e o celular colocam no
    //    lugar das aspas retas. Só quando o texto não tem NENHUMA aspa reta:
    //    se tiver, as curvas estão dentro de um nome ("Pizza “da casa”") e
    //    trocá-las quebraria o que estava certo.
    if (!trecho.includes('"') && /[“”]/.test(trecho)) {
      tentativas.push({
        texto: semVirgulaSobrando.replace(/[“”]/g, '"'),
        conserto: "Troquei as aspas curvas (“ ”) por aspas retas.",
      });
    }

    for (const tentativa of tentativas) {
      try {
        const valor = JSON.parse(tentativa.texto);
        return {
          ok: true,
          valor,
          consertos: tentativa.conserto ? [...consertos, tentativa.conserto] : consertos,
        };
      } catch {
        // próxima tentativa
      }
    }

    // Nenhum conserto bastou: aponta a linha no texto que a pessoa colou.
    try {
      JSON.parse(trecho);
    } catch (erroDoTrecho) {
      return { ok: false, erro: explicarErroDeSintaxe(erroDoTrecho, texto, deslocamento) };
    }
    return { ok: false, erro: explicarErroDeSintaxe(erroOriginal, texto, 0) };
  }
}

// ---------------------------------------------------------------------------
// CONFERÊNCIA DE CADA PEDAÇO
// ---------------------------------------------------------------------------

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

/**
 * Foto é opcional, mas quando vem precisa ser um endereço https.
 *
 * Um endereço "http://" ou um nome de arquivo do computador ("pizza.jpg")
 * apareceria como foto quebrada no cardápio do cliente — melhor avisar agora
 * do que o dono descobrir pelo celular de um cliente.
 */
function readImage(raw: unknown, where: string, errors: string[]): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") {
    errors.push(`${where}: a "imagem" precisa ser um endereço entre aspas, como "https://…".`);
    return undefined;
  }
  const url = raw.trim();
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return url;
  } catch {
    // cai no erro abaixo
  }
  errors.push(
    `${where}: a "imagem" (${JSON.stringify(url)}) não é um endereço de foto válido. ` +
      `Use um endereço começando com https:// ou deixe vazio e envie a foto depois pela tela.`,
  );
  return undefined;
}

/** O nome enxuto, só para comparar repetidos: "Coca-Cola 2L" = "coca cola 2l". */
function chaveDoNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function rotulo(base: string, posicao: number, nome: string | null): string {
  return `${base}, item ${posicao}${nome ? ` ("${nome}")` : ""}`;
}

/** Confere um item (bebida, borda, adicional ou item de categoria). */
function readItem(
  raw: unknown,
  base: string,
  posicao: number,
  errors: string[],
): ImportedItem | null {
  if (!isPlainObject(raw)) {
    errors.push(`${rotulo(base, posicao, null)}: deveria ser um item com "nome" e "preco".`);
    return null;
  }

  const where = rotulo(base, posicao, readName(valorPorNome(raw, CAMPOS_DO_ITEM.nome)));
  const campos = lerCampos(raw, CAMPOS_DO_ITEM, where, errors);

  const nome = readName(campos.nome);
  if (!nome) {
    errors.push(`${where}: falta o "nome" (ou está vazio).`);
  }

  const preco = parsePrice(campos.preco);
  if (preco === null) {
    if (campos.preco === undefined) {
      errors.push(`${where}: falta o "preco".`);
    } else {
      errors.push(
        `${where}: o "preco" (${JSON.stringify(campos.preco)}) não é um valor válido. ` +
          `Use 45.90 ou "45,90".`,
      );
    }
  }

  const imagem = readImage(campos.imagem, where, errors);

  if (!nome || preco === null) return null;
  return { nome, descricao: readOptionalText(campos.descricao), preco, imagem };
}

/** Avisa sobre nome repetido dentro da mesma lista. */
function conferirRepetidos(itens: { nome: string }[], onde: string, errors: string[]) {
  const vistos = new Set<string>();
  for (const item of itens) {
    const chave = chaveDoNome(item.nome);
    if (vistos.has(chave)) {
      errors.push(
        `${onde}: "${item.nome}" aparece mais de uma vez. Ficariam dois itens iguais no cardápio — deixe só um.`,
      );
    }
    vistos.add(chave);
  }
}

/** Lê uma lista de itens soltos (bebidas, bordas, adicionais). */
function readItemList(raw: unknown, rotuloDaLista: string, errors: string[]): ImportedItem[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.push(`"${rotuloDaLista.toLowerCase()}": deveria ser uma lista entre colchetes [ ].`);
    return [];
  }
  const items: ImportedItem[] = [];
  raw.forEach((entry, index) => {
    const item = readItem(entry, rotuloDaLista, index + 1, errors);
    if (item) items.push(item);
  });
  conferirRepetidos(items, rotuloDaLista, errors);
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
    if (!isPlainObject(entry)) {
      errors.push(`Categoria ${index + 1}: deveria ser uma categoria com "nome" e "itens".`);
      return;
    }

    const nomeLido = readName(valorPorNome(entry, CAMPOS_DA_CATEGORIA.nome));
    const where = `Categoria ${index + 1}${nomeLido ? ` ("${nomeLido}")` : ""}`;
    const campos = lerCampos(entry, CAMPOS_DA_CATEGORIA, where, errors);

    const nome = readName(campos.nome);
    if (!nome) errors.push(`${where}: falta o "nome" da categoria (ou está vazio).`);

    let itens: ImportedItem[] = [];
    if (campos.itens === undefined || campos.itens === null) {
      // Categoria sem itens é permitida: serve para criar a seção vazia e
      // preencher depois pela tela normal.
      itens = [];
    } else if (!Array.isArray(campos.itens)) {
      errors.push(`${where}: os "itens" deveriam ser uma lista entre colchetes [ ].`);
    } else {
      campos.itens.forEach((itemRaw, itemIndex) => {
        const item = readItem(itemRaw, where, itemIndex + 1, errors);
        if (item) itens.push(item);
      });
      conferirRepetidos(itens, where, errors);
    }

    const imagem = readImage(campos.imagem, where, errors);

    if (!nome) return;
    categories.push({ nome, descricao: readOptionalText(campos.descricao), imagem, itens });
  });

  conferirRepetidos(categories, "Categorias", errors);
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
 * Produto e bebida com preço zero aparecem DE GRAÇA no cardápio. Não é erro
 * (pode ser de propósito), mas é o tipo de coisa que a IA põe quando não
 * achou o preço — por isso vira aviso na prévia. Borda e adicional sem custo
 * são comuns ("escolha 3 complementos grátis") e não entram aqui.
 */
function avisosDePrecoZero(menu: ParsedMenu): string[] {
  const zerados = [
    ...menu.categorias.flatMap((c) =>
      c.itens.filter((i) => i.preco === 0).map((i) => `"${i.nome}" (${c.nome})`),
    ),
    ...menu.bebidas.filter((b) => b.preco === 0).map((b) => `"${b.nome}" (bebidas)`),
  ];
  if (zerados.length === 0) return [];
  return [
    `${zerados.length === 1 ? "Este item está" : "Estes itens estão"} com preço 0 e ` +
      `${zerados.length === 1 ? "vai aparecer" : "vão aparecer"} de graça no cardápio: ` +
      `${zerados.join(", ")}. Confira antes de importar.`,
  ];
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

  const leitura = lerJsonTolerante(text);
  if (!leitura.ok) return { ok: false, errors: [leitura.erro] };
  const parsed = leitura.valor;

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
  const raiz = lerCampos(parsed, CAMPOS_DA_RAIZ, "No arquivo", errors);
  const categorias = readCategories(raiz.categorias, errors);
  const bebidas = readItemList(raiz.bebidas, "Bebidas", errors);
  const bordas = readItemList(raiz.bordas, "Bordas", errors);
  const adicionais = readItemList(raiz.adicionais, "Adicionais", errors);

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
  return { ok: true, data: menu, avisos: [...leitura.consertos, ...avisosDePrecoZero(menu)] };
}
