/**
 * Leitura e conferência do JSON de produtos de estoque.
 *
 * Funções puras: sem React, sem rede, sem banco. Aqui só se decide o que é
 * válido e, quando não é, qual a frase que o lojista consegue entender.
 *
 * A REGRA DAS MENSAGENS: dizer ONDE está o erro e O QUE fazer.
 *
 * "JSON inválido" seco obriga a caçar o problema em duzentas linhas — é como o
 * fornecedor devolver a nota inteira dizendo só "tem item errado", sem falar
 * qual. Por isso cada erro carrega a posição e o nome do produto.
 *
 * O `parsePrice` é o mesmo que o importador de cardápio já usa. Uma régua só
 * para os dois: se um dia alguém consertar a leitura de "1.234,56", conserta
 * nos dois lugares de uma vez.
 */

import { parsePrice } from "@/lib/menu/importSchema";

/**
 * Teto por importação.
 *
 * Um arquivo gigante colado por engano travaria o navegador e faria o banco
 * trabalhar minutos numa operação que ninguém queria. Mil produtos cobrem um
 * mercado inteiro; quem tiver mais faz em duas levas.
 */
export const MAX_PRODUTOS_POR_IMPORTACAO = 1000;

/** Teto de tamanho do texto colado, antes mesmo de tentar ler. */
export const MAX_CARACTERES = 2_000_000;

export type EmbalagemImportada = {
  /** Como aparece para o lojista: "Caixa com 12". */
  nome: string;
  /** A unidade em si: "caixa", "fardo", "pacote". */
  unidade: string;
  /** Quantas unidades base cabem nela. */
  quantidade: number;
  /** Preço próprio da embalagem, quando informado. Nulo = calcula pelo unitário. */
  precoCents: number | null;
};

export type ProdutoImportado = {
  nome: string;
  sku: string;
  codigoBarras: string;
  categoria: string;
  marca: string;
  descricao: string;
  imagemUrl: string;
  unidadeBase: string;
  quantidadeEstoque: number;
  estoqueMinimo: number;
  precoCustoCents: number;
  precoVendaCents: number;
  ativo: boolean;
  embalagens: EmbalagemImportada[];
  /** Posição no arquivo (1, 2, 3…), para a mensagem de erro apontar o culpado. */
  posicao: number;
  /** Nome enxuto para comparar duplicidade. "Coca-Cola 2L " → "coca-cola-2l". */
  chave: string;
};

export type ErroDeImportacao = {
  posicao: number;
  nome: string;
  mensagem: string;
};

export type ResultadoDaLeitura = {
  /** Erro que impede ler o arquivo inteiro (JSON quebrado, sem "produtos"…). */
  erroGeral: string | null;
  produtos: ProdutoImportado[];
  erros: ErroDeImportacao[];
};

/**
 * O nome enxuto usado só para comparar se dois produtos são o mesmo.
 *
 * "Coca-Cola 2L", "coca cola 2l" e "  COCA-COLA   2L  " viram todos
 * "coca-cola-2l". O nome original é preservado para exibição — ninguém quer
 * ver o produto cadastrado em minúsculas e com hífen.
 */
export function chaveDeComparacao(nome: string): string {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function texto(cru: unknown): string {
  if (typeof cru === "string") return cru.trim().replace(/\s+/g, " ");
  return "";
}

/**
 * O resultado de ler um número do arquivo.
 *
 * "Não é número" e "é negativo" precisam ser respostas DIFERENTES. Dizer que
 * -5 "não é um número" manda o lojista caçar um erro de digitação que não
 * existe — o número está lá, o problema é o sinal.
 */
type LeituraDeNumero =
  { ok: true; valor: number } | { ok: false; motivo: "nao_numero" | "negativo" };

function negativo(cru: unknown): boolean {
  if (typeof cru === "number") return cru < 0;
  if (typeof cru === "string") return /^\s*-/.test(cru.replace(/^R\$\s*/i, ""));
  return false;
}

/** Quantidade pode vir número ou texto: 12, "12" ou "1,5". */
function quantidade(cru: unknown): LeituraDeNumero {
  if (cru === undefined || cru === null || cru === "") return { ok: true, valor: 0 };
  if (negativo(cru)) return { ok: false, motivo: "negativo" };
  const n = parsePrice(cru);
  if (n === null) return { ok: false, motivo: "nao_numero" };
  return { ok: true, valor: Math.round(n * 1000) / 1000 };
}

function paraCentavos(cru: unknown): LeituraDeNumero {
  if (cru === undefined || cru === null || cru === "") return { ok: true, valor: 0 };
  if (negativo(cru)) return { ok: false, motivo: "negativo" };
  const reais = parsePrice(cru);
  if (reais === null) return { ok: false, motivo: "nao_numero" };
  return { ok: true, valor: Math.round(reais * 100) };
}

function booleano(cru: unknown, padrao: boolean): boolean {
  if (typeof cru === "boolean") return cru;
  if (typeof cru === "string") {
    const v = cru.trim().toLowerCase();
    if (["true", "sim", "1", "ativo"].includes(v)) return true;
    if (["false", "nao", "não", "0", "inativo"].includes(v)) return false;
  }
  return padrao;
}

/**
 * As embalagens do produto ("1 caixa = 12 unidades").
 *
 * A variação de quantidade 1 é a própria unidade base — ela não vira
 * embalagem, porque "1 unidade = 1 unidade" não é uma conversão, é a régua.
 * Cadastrá-la criaria uma linha inútil que o motor teria que ignorar depois.
 */
function lerEmbalagens(cru: unknown, posicao: number, nome: string, erros: ErroDeImportacao[]) {
  const embalagens: EmbalagemImportada[] = [];
  let precoDaUnidadeCents: number | null = null;

  if (cru === undefined || cru === null) return { embalagens, precoDaUnidadeCents };

  if (!Array.isArray(cru)) {
    erros.push({ posicao, nome, mensagem: 'O campo "variacoes" precisa ser uma lista.' });
    return { embalagens, precoDaUnidadeCents };
  }

  const vistas = new Set<string>();

  for (const item of cru) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;

    const leituraQtd = quantidade(v.quantidade_por_embalagem ?? v.quantidade);
    const qtd = leituraQtd.ok ? leituraQtd.valor : 0;
    if (!leituraQtd.ok || qtd <= 0) {
      erros.push({
        posicao,
        nome,
        mensagem:
          'Cada variação precisa de "quantidade_por_embalagem" maior que zero (quantas unidades cabem nela).',
      });
      continue;
    }

    const leituraPreco = paraCentavos(v.preco_venda);
    if (!leituraPreco.ok) {
      erros.push({
        posicao,
        nome,
        mensagem:
          leituraPreco.motivo === "negativo"
            ? 'O "preco_venda" de uma das variações está negativo.'
            : 'O "preco_venda" de uma das variações não é um número válido.',
      });
      continue;
    }
    const preco = leituraPreco.valor;

    // Quantidade 1 = a unidade base. Ela só empresta o preço, não vira linha.
    if (qtd === 1) {
      if (preco > 0) precoDaUnidadeCents = preco;
      continue;
    }

    const unidade = texto(v.tipo) || texto(v.nome) || "caixa";
    const chave = chaveDeComparacao(unidade);
    if (vistas.has(chave)) {
      erros.push({
        posicao,
        nome,
        mensagem: `Este produto tem duas embalagens chamadas "${unidade}". Deixe só uma.`,
      });
      continue;
    }
    vistas.add(chave);

    embalagens.push({
      nome: texto(v.nome) || unidade,
      unidade,
      quantidade: qtd,
      precoCents: preco > 0 ? preco : null,
    });
  }

  return { embalagens, precoDaUnidadeCents };
}

function lerProduto(
  cru: unknown,
  posicao: number,
  erros: ErroDeImportacao[],
): ProdutoImportado | null {
  if (!cru || typeof cru !== "object" || Array.isArray(cru)) {
    erros.push({
      posicao,
      nome: "",
      mensagem: 'Este item da lista não é um produto — esperava um objeto com { "nome": … }.',
    });
    return null;
  }

  const p = cru as Record<string, unknown>;
  const nome = texto(p.nome ?? p.name);

  // O ÚNICO campo obrigatório. Sem nome não dá nem para mostrar o erro direito.
  if (!nome) {
    erros.push({
      posicao,
      nome: "",
      mensagem: 'Faltou o campo "nome". Ele é o único obrigatório.',
    });
    return null;
  }

  const numeros: Array<[string, unknown, (v: unknown) => LeituraDeNumero]> = [
    ["quantidade_estoque", p.quantidade_estoque, quantidade],
    ["estoque_minimo", p.estoque_minimo, quantidade],
    ["preco_custo", p.preco_custo, paraCentavos],
    ["preco_venda", p.preco_venda, paraCentavos],
  ];

  const valores: Record<string, number> = {};
  let temErroDeNumero = false;

  for (const [campo, valor, leitor] of numeros) {
    const lido = leitor(valor);
    if (!lido.ok) {
      erros.push({
        posicao,
        nome,
        mensagem:
          lido.motivo === "negativo"
            ? `O campo "${campo}" não pode ser negativo.`
            : `O campo "${campo}" precisa ser um número. Use 12 ou 12.50, sem "R$".`,
      });
      temErroDeNumero = true;
      continue;
    }
    valores[campo] = lido.valor;
  }

  if (temErroDeNumero) return null;

  const { embalagens, precoDaUnidadeCents } = lerEmbalagens(p.variacoes, posicao, nome, erros);

  return {
    nome,
    sku: texto(p.sku),
    codigoBarras: texto(p.codigo_barras ?? p.codigo_de_barras),
    categoria: texto(p.categoria),
    marca: texto(p.marca),
    descricao: texto(p.descricao),
    imagemUrl: texto(p.imagem_url),
    unidadeBase: texto(p.unidade_base) || "unidade",
    quantidadeEstoque: valores.quantidade_estoque ?? 0,
    estoqueMinimo: valores.estoque_minimo ?? 0,
    precoCustoCents: valores.preco_custo ?? 0,
    // A variação "Unidade" pode trazer o preço quando o produto não trouxe.
    precoVendaCents: valores.preco_venda || precoDaUnidadeCents || 0,
    ativo: booleano(p.ativo, true),
    embalagens,
    posicao,
    chave: chaveDeComparacao(nome),
  };
}

/**
 * Lê o texto colado e devolve o que dá para importar e o que está errado.
 *
 * Um produto com problema NÃO derruba os outros: o lojista importa os 47 que
 * estão certos e conserta os 3 que não estão. Recusar o arquivo inteiro por
 * causa de uma linha seria devolver a carga toda porque uma caixa veio
 * amassada.
 */
/**
 * Transforma o erro cru do navegador numa frase que ajuda.
 *
 * O navegador diz "Unexpected token } in JSON at position 1423". Ninguém
 * conta 1423 caracteres na mão — mas todo editor mostra número de linha.
 */
function explicarErroDeSintaxe(erro: unknown, conteudo: string): string {
  const base = "Não consegui ler o JSON. Confira se falta uma vírgula, uma aspa ou uma chave.";

  const mensagem = erro instanceof Error ? erro.message : "";
  const posicao = /position (\d+)/i.exec(mensagem)?.[1];
  if (!posicao) return `${base} O botão “Formatar” ajuda a encontrar.`;

  const ate = conteudo.slice(0, Number(posicao));
  const linha = ate.split("\n").length;
  const coluna = ate.length - ate.lastIndexOf("\n");

  return `${base} O problema começa na linha ${linha}, coluna ${coluna}.`;
}

export function lerImportacaoDeProdutos(textoBruto: string): ResultadoDaLeitura {
  const vazio: ResultadoDaLeitura = { erroGeral: null, produtos: [], erros: [] };

  const conteudo = String(textoBruto ?? "").trim();
  if (!conteudo) {
    return { ...vazio, erroGeral: "Cole o JSON ou escolha um arquivo para começar." };
  }
  if (conteudo.length > MAX_CARACTERES) {
    return { ...vazio, erroGeral: "O arquivo é grande demais. Divida a importação em partes." };
  }

  let dados: unknown;
  try {
    dados = JSON.parse(conteudo);
  } catch (e) {
    // Apontar a LINHA em vez de dizer só "está errado".
    //
    // Num arquivo de trezentas linhas, "JSON inválido" manda a pessoa procurar
    // agulha no palheiro. "Erro na linha 87" resolve em dez segundos.
    return { ...vazio, erroGeral: explicarErroDeSintaxe(e, conteudo) };
  }

  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    return {
      ...vazio,
      erroGeral: 'O arquivo precisa começar com { "produtos": [ … ] }.',
    };
  }

  const lista = (dados as Record<string, unknown>).produtos;
  if (lista === undefined) {
    return { ...vazio, erroGeral: 'Não encontrei o campo "produtos" no arquivo.' };
  }
  if (!Array.isArray(lista)) {
    return { ...vazio, erroGeral: 'O campo "produtos" precisa ser uma lista.' };
  }
  if (lista.length === 0) {
    return { ...vazio, erroGeral: "A lista de produtos está vazia." };
  }
  if (lista.length > MAX_PRODUTOS_POR_IMPORTACAO) {
    return {
      ...vazio,
      erroGeral: `São ${lista.length} produtos de uma vez. O limite é ${MAX_PRODUTOS_POR_IMPORTACAO} por importação — divida em partes.`,
    };
  }

  const erros: ErroDeImportacao[] = [];
  const produtos: ProdutoImportado[] = [];
  const vistos = new Map<string, number>();

  lista.forEach((cru, i) => {
    const produto = lerProduto(cru, i + 1, erros);
    if (!produto) return;

    // Repetido DENTRO do próprio arquivo. Diferente de já existir no estoque
    // (isso é conferido depois, no servidor) — aqui é a mesma linha escrita
    // duas vezes pela IA ou pelo copiar-e-colar.
    const jaVisto = vistos.get(produto.chave);
    if (jaVisto) {
      erros.push({
        posicao: produto.posicao,
        nome: produto.nome,
        mensagem: `Repetido: este produto já aparece na posição ${jaVisto} deste mesmo arquivo.`,
      });
      return;
    }
    vistos.set(produto.chave, produto.posicao);
    produtos.push(produto);
  });

  return { erroGeral: null, produtos, erros };
}

/** Deixa o JSON arrumado e legível, ou explica por que não deu. */
export function formatarJson(
  textoBruto: string,
): { ok: true; texto: string } | { ok: false; erro: string } {
  try {
    return { ok: true, texto: JSON.stringify(JSON.parse(textoBruto), null, 2) };
  } catch {
    return {
      ok: false,
      erro: "Não consegui formatar: o JSON ainda tem algum erro de escrita.",
    };
  }
}

// ---------------------------------------------------------------------------
// MODELOS MOSTRADOS NA TELA
// ---------------------------------------------------------------------------

export const MODELO_SIMPLES = `{
  "produtos": [
    {
      "nome": "Coca-Cola 2L",
      "categoria": "Bebidas",
      "quantidade_estoque": 20,
      "preco_venda": 12
    },
    {
      "nome": "Guaraná Antarctica 2L",
      "categoria": "Bebidas",
      "quantidade_estoque": 10,
      "preco_venda": 10
    }
  ]
}`;

export const MODELO_COMPLETO = `{
  "produtos": [
    {
      "nome": "Coca-Cola 2L",
      "sku": "COCA2L",
      "codigo_barras": "7894900011517",
      "categoria": "Bebidas",
      "marca": "Coca-Cola",
      "descricao": "Refrigerante Coca-Cola 2 litros",
      "imagem_url": "",
      "unidade_base": "unidade",
      "quantidade_estoque": 24,
      "estoque_minimo": 6,
      "preco_custo": 7.5,
      "preco_venda": 12,
      "ativo": true,
      "variacoes": [
        {
          "nome": "Unidade",
          "tipo": "unidade",
          "quantidade_por_embalagem": 1,
          "preco_venda": 12
        },
        {
          "nome": "Caixa com 6",
          "tipo": "caixa",
          "quantidade_por_embalagem": 6,
          "preco_venda": 65
        }
      ]
    }
  ]
}`;

/**
 * O texto que o lojista copia e cola numa IA junto com a foto da prateleira
 * ou a lista do fornecedor.
 *
 * As regras existem para a IA não INVENTAR. Um preço chutado entra no sistema
 * como se fosse verdade e vira etiqueta errada na gôndola — pior do que campo
 * vazio, que pelo menos aparece como pendência.
 */
export const INSTRUCAO_PARA_IA = `Transcreva todos os produtos informados para o seguinte formato JSON.

Retorne exclusivamente JSON válido, sem explicações antes ou depois.

Utilize esta estrutura:

{
  "produtos": [
    {
      "nome": "",
      "sku": "",
      "codigo_barras": "",
      "categoria": "",
      "marca": "",
      "descricao": "",
      "imagem_url": "",
      "unidade_base": "unidade",
      "quantidade_estoque": 0,
      "estoque_minimo": 0,
      "preco_custo": 0,
      "preco_venda": 0,
      "ativo": true,
      "variacoes": [
        {
          "nome": "Unidade",
          "tipo": "unidade",
          "quantidade_por_embalagem": 1,
          "preco_venda": 0
        }
      ]
    }
  ]
}

REGRAS:

1. Não invente informações que não estejam disponíveis.
2. Caso não saiba SKU ou código de barras, utilize string vazia.
3. Caso não saiba quantidade de estoque, utilize 0.
4. Caso não saiba preço, utilize 0.
5. Identifique corretamente marca, apresentação, quantidade, volume e embalagem pelo nome do produto.
6. Produtos diferentes devem gerar registros separados.
7. Caso o produto possa ser vendido por caixa e unidade, crie as duas variações.
8. Quando souber quantas unidades existem dentro da caixa, preencha quantidade_por_embalagem.
9. Não duplicar produtos.
10. Retorne somente JSON válido.`;
