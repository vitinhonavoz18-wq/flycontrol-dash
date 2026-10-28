/**
 * Motor de preços da Pizzaria Premium.
 *
 * ATENÇÃO — ESTE ARQUIVO TEM UMA CÓPIA IDÊNTICA
 *
 * O mesmo arquivo vive no SiteCreatorFly, em `src/lib/site/pizza/motorDePreco.ts`.
 * Os dois sistemas são separados e não compartilham código, mas precisam
 * chegar ao MESMO preço: o site mostra o preço ao cliente e confere o pedido
 * no servidor dele; o FlyControl recebe o pedido e confere a conta de novo.
 * Se as duas cópias divergirem, o cliente vê um preço e a cozinha recebe
 * outro. Os testes (`motorDePreco.test.ts`) também são iguais nos dois lados —
 * mudou aqui, muda lá, e os dois testes precisam passar.
 *
 * O QUE ELE FAZ
 *
 * Recebe o cardápio da pizzaria (tamanhos, sabores, bordas, adicionais e as
 * regras da loja) e a montagem que o cliente escolheu, e devolve:
 *   - o preço, em CENTAVOS INTEIROS (nunca com casas decimais, para não haver
 *     erro de arredondamento na cobrança);
 *   - ou a lista exata do que está errado na montagem.
 *
 * Ele não lê banco, não lê tela e não guarda nada: só faz a conta. Por isso dá
 * para usar a mesma função no navegador (para mostrar o preço enquanto o
 * cliente monta) e no servidor (para conferir o pedido antes de aceitar).
 *
 * As chaves de tamanho e de sabor nas tabelas de preço são os NOMES
 * normalizados (sem acento, minúsculos), e não os códigos internos: o
 * FlyControl e o site guardam o mesmo tamanho com códigos diferentes em
 * bancos diferentes, mas com o mesmo nome. Ver `chaveDeNome`.
 */

export type Centavos = number;

/** Como o preço dos sabores vira o preço da pizza. */
export type RegraDeSabores =
  /** Regra que o cardápio já usava: preço do tamanho + extra de cada sabor especial. */
  | "tamanho_e_especiais"
  /** Vale o preço do sabor mais caro entre os escolhidos. */
  | "maior_preco"
  /** Cada sabor pesa pela fração que ocupa na pizza. */
  | "media_ponderada"
  /** Preço cadastrado para a combinação exata de sabores. */
  | "combinacao";

/** O que fazer, na regra "combinacao", quando a combinação não foi cadastrada. */
export type RegraSemCombinacao = "recusar" | "maior_preco" | "media_ponderada";

export type PrecoDeCombinacao = {
  /** Nome do tamanho (ver `chaveDeNome`). */
  tamanho: string;
  /** Nomes dos sabores da combinação, em qualquer ordem. */
  sabores: string[];
  precoCentavos: Centavos;
};

export type ConfigPizzaria = {
  regra: RegraDeSabores;
  regraSemCombinacao: RegraSemCombinacao;
  bordaObrigatoria: boolean;
  permitirRemoverIngredientes: boolean;
  /** Soma das quantidades de adicionais numa pizza. Nulo = sem limite. */
  maxAdicionaisPorPizza: number | null;
  combinacoes: PrecoDeCombinacao[];
};

export const REGRAS_DE_SABORES: readonly RegraDeSabores[] = [
  "tamanho_e_especiais",
  "maior_preco",
  "media_ponderada",
  "combinacao",
];

export const REGRAS_SEM_COMBINACAO: readonly RegraSemCombinacao[] = [
  "recusar",
  "maior_preco",
  "media_ponderada",
];

/**
 * A configuração de quem nunca mexeu em nada.
 *
 * A regra padrão é a que o cardápio JÁ usava antes deste módulo existir. Assim,
 * ligar o código novo não muda o preço de nenhuma pizza de nenhuma loja: só
 * muda quem for no painel e escolher outra regra.
 */
export const CONFIG_PADRAO: ConfigPizzaria = {
  regra: "tamanho_e_especiais",
  regraSemCombinacao: "recusar",
  bordaObrigatoria: false,
  permitirRemoverIngredientes: false,
  maxAdicionaisPorPizza: null,
  combinacoes: [],
};

/** Onde a configuração fica dentro de `site_settings`, nos dois sistemas. */
export const CHAVE_DA_CONFIG = "pizza_premium";

export const LIMITES = {
  observacao: 280,
  quantidade: 50,
  partesPorSabor: 12,
  removidos: 20,
} as const;

export type TamanhoDoCatalogo = {
  /** `chaveDeNome(nome)`. */
  chave: string;
  nome: string;
  precoBaseCentavos: Centavos;
  maxSabores: number;
  fatias: number | null;
  ativo: boolean;
};

export type SaborDoCatalogo = {
  id: string;
  nome: string;
  ativo: boolean;
  /** Preço deste sabor em cada tamanho, pela chave do tamanho. Opcional. */
  precosPorTamanho: Record<string, Centavos>;
  /** Extra do sabor "especial" — usado quando não há preço por tamanho. */
  extraEspecialCentavos: Centavos;
  ingredientes: string[];
};

export type OpcaoDoCatalogo = {
  id: string;
  nome: string;
  ativo: boolean;
  /** Preço único, usado quando não há preço para o tamanho escolhido. */
  precoCentavos: Centavos;
  precosPorTamanho: Record<string, Centavos>;
  /** Quantas vezes a mesma opção pode entrar na mesma pizza. */
  maxQuantidade: number;
};

export type CatalogoDePizza = {
  config: ConfigPizzaria;
  tamanhos: TamanhoDoCatalogo[];
  sabores: SaborDoCatalogo[];
  bordas: OpcaoDoCatalogo[];
  adicionais: OpcaoDoCatalogo[];
};

export type MontagemDePizza = {
  /** Chave (ou nome) do tamanho. */
  tamanho: string;
  /** `partes` = quanto da pizza o sabor ocupa; sem informar, divide igual. */
  sabores: { id: string; partes?: number }[];
  bordaId?: string | null;
  adicionais?: { id: string; quantidade: number }[];
  removidos?: string[];
  observacao?: string | null;
  quantidade?: number;
};

export type CodigoDeErro =
  | "tamanho_inexistente"
  | "tamanho_indisponivel"
  | "sem_sabores"
  | "sabores_demais"
  | "sabor_inexistente"
  | "sabor_indisponivel"
  | "sabor_repetido"
  | "partes_invalidas"
  | "combinacao_nao_cadastrada"
  | "borda_obrigatoria"
  | "borda_inexistente"
  | "borda_indisponivel"
  | "adicional_inexistente"
  | "adicional_indisponivel"
  | "adicional_repetido"
  | "adicional_quantidade_invalida"
  | "adicionais_demais"
  | "remocao_nao_permitida"
  | "ingrediente_desconhecido"
  | "removidos_demais"
  | "observacao_longa"
  | "quantidade_invalida";

export type ErroDeMontagem = { codigo: CodigoDeErro; mensagem: string; ref?: string };

export type SaborCalculado = {
  id: string;
  nome: string;
  partes: number;
  /** "1/2", "1/3", "2/3"… */
  fracao: string;
  /** Arredondado para exibir; a conta usa as partes, nunca este número. */
  percentual: number;
  precoNoTamanhoCentavos: Centavos;
};

export type AdicionalCalculado = {
  id: string;
  nome: string;
  quantidade: number;
  precoUnitarioCentavos: Centavos;
  totalCentavos: Centavos;
};

export type PizzaCalculada = {
  tamanho: { chave: string; nome: string; fatias: number | null; maxSabores: number };
  sabores: SaborCalculado[];
  /** A regra configurada na loja. */
  regra: RegraDeSabores;
  /** A regra que de fato fez a conta (difere quando a combinação não existe). */
  regraAplicada: RegraDeSabores;
  precoSaboresCentavos: Centavos;
  borda: { id: string; nome: string; precoCentavos: Centavos } | null;
  adicionais: AdicionalCalculado[];
  removidos: string[];
  observacao: string;
  precoUnitarioCentavos: Centavos;
  quantidade: number;
  totalCentavos: Centavos;
};

export type ResultadoDaPizza =
  { ok: true; pizza: PizzaCalculada } | { ok: false; erros: ErroDeMontagem[] };

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/**
 * Nome → chave estável: sem acento, minúsculo e com espaços únicos.
 * "Família ", "familia" e "FAMÍLIA" viram a mesma chave.
 */
export function chaveDeNome(nome: unknown): string {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Valor em reais (como as tabelas antigas guardam) → centavos inteiros. */
export function reaisParaCentavos(valor: unknown): Centavos {
  const n = typeof valor === "number" ? valor : Number(String(valor ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function centavosParaReais(centavos: Centavos): number {
  return Math.round(centavos) / 100;
}

export function formatarCentavos(centavos: Centavos): string {
  const negativo = centavos < 0;
  const abs = Math.abs(Math.round(centavos));
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cents = String(abs % 100).padStart(2, "0");
  return `${negativo ? "-" : ""}R$ ${reais},${cents}`;
}

function inteiroNaoNegativo(valor: unknown): number | null {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/** Lê um mapa "chave do tamanho → centavos", descartando o que não for número. */
export function lerPrecosPorTamanho(bruto: unknown): Record<string, Centavos> {
  const saida: Record<string, Centavos> = {};
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return saida;
  for (const [chave, valor] of Object.entries(bruto as Record<string, unknown>)) {
    const c = inteiroNaoNegativo(valor);
    const k = chaveDeNome(chave);
    if (c !== null && k) saida[k] = c;
  }
  return saida;
}

/** Divisão inteira arredondando a metade para cima (0,5 centavo vira 1). */
function dividirArredondando(numerador: number, denominador: number): number {
  return Math.floor((2 * numerador + denominador) / (2 * denominador));
}

function mdc(a: number, b: number): number {
  return b === 0 ? a : mdc(b, a % b);
}

function fracaoLegivel(partes: number, total: number): string {
  const d = mdc(partes, total);
  return partes === total ? "inteira" : `${partes / d}/${total / d}`;
}

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

/**
 * Lê a configuração gravada em `site_settings.pizza_premium`.
 *
 * Tolerante de propósito: o que vier faltando ou escrito errado volta ao
 * padrão, campo por campo. Uma configuração estragada nunca pode tirar o
 * cardápio do ar — no máximo, volta ao comportamento antigo.
 */
export function lerConfigPizzaria(bruto: unknown): ConfigPizzaria {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return { ...CONFIG_PADRAO };
  const b = bruto as Record<string, unknown>;

  const regra = REGRAS_DE_SABORES.includes(b.regra as RegraDeSabores)
    ? (b.regra as RegraDeSabores)
    : CONFIG_PADRAO.regra;
  const regraSemCombinacao = REGRAS_SEM_COMBINACAO.includes(
    b.regraSemCombinacao as RegraSemCombinacao,
  )
    ? (b.regraSemCombinacao as RegraSemCombinacao)
    : CONFIG_PADRAO.regraSemCombinacao;

  const max = b.maxAdicionaisPorPizza;
  const maxAdicionaisPorPizza =
    max === null || max === undefined || max === "" ? null : inteiroNaoNegativo(max);

  const combinacoes: PrecoDeCombinacao[] = [];
  if (Array.isArray(b.combinacoes)) {
    for (const c of b.combinacoes) {
      if (!c || typeof c !== "object") continue;
      const cc = c as Record<string, unknown>;
      const tamanho = chaveDeNome(cc.tamanho);
      const sabores = Array.isArray(cc.sabores) ? cc.sabores.map(chaveDeNome).filter(Boolean) : [];
      const preco = inteiroNaoNegativo(cc.precoCentavos);
      if (!tamanho || sabores.length < 2 || preco === null) continue;
      combinacoes.push({ tamanho, sabores, precoCentavos: preco });
    }
  }

  return {
    regra,
    regraSemCombinacao,
    bordaObrigatoria: b.bordaObrigatoria === true,
    permitirRemoverIngredientes: b.permitirRemoverIngredientes === true,
    maxAdicionaisPorPizza,
    combinacoes,
  };
}

/** Mesma combinação de sabores, em qualquer ordem? */
function mesmaCombinacao(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].map(chaveDeNome).sort();
  const y = [...b].map(chaveDeNome).sort();
  return x.every((v, i) => v === y[i]);
}

/**
 * Problemas da configuração que impedem publicar com segurança.
 *
 * Devolve frases para o lojista ler. Lista vazia = pode publicar.
 */
export function validarConfigPizzaria(catalogo: CatalogoDePizza): string[] {
  const problemas: string[] = [];
  const { config, tamanhos, sabores } = catalogo;
  const tamanhosAtivos = tamanhos.filter((t) => t.ativo);
  const saboresAtivos = sabores.filter((s) => s.ativo);

  if (tamanhosAtivos.length === 0) problemas.push("Nenhum tamanho ativo cadastrado.");
  if (saboresAtivos.length === 0) problemas.push("Nenhum sabor ativo cadastrado.");

  const nomesDeTamanho = new Map<string, number>();
  for (const t of tamanhos) nomesDeTamanho.set(t.chave, (nomesDeTamanho.get(t.chave) ?? 0) + 1);
  for (const [chave, n] of nomesDeTamanho) {
    if (n > 1)
      problemas.push(`Há ${n} tamanhos com o mesmo nome ("${chave}"). Use nomes diferentes.`);
  }

  for (const t of tamanhosAtivos) {
    if (!Number.isInteger(t.maxSabores) || t.maxSabores < 1) {
      problemas.push(`O tamanho "${t.nome}" precisa aceitar pelo menos 1 sabor.`);
    }
  }

  // Nas regras que usam o preço de cada sabor, um sabor sem preço no tamanho
  // cai no preço do tamanho. Isso é permitido, mas um preço zerado não é.
  if (config.regra === "maior_preco" || config.regra === "media_ponderada") {
    for (const s of saboresAtivos) {
      for (const t of tamanhosAtivos) {
        const preco = s.precosPorTamanho[t.chave] ?? t.precoBaseCentavos + s.extraEspecialCentavos;
        if (preco <= 0) {
          problemas.push(`O sabor "${s.nome}" está sem preço no tamanho "${t.nome}".`);
        }
      }
    }
  }

  if (config.regra === "combinacao") {
    const multiplos = tamanhosAtivos.some((t) => t.maxSabores > 1);
    if (multiplos && config.combinacoes.length === 0 && config.regraSemCombinacao === "recusar") {
      problemas.push(
        'A regra "Preço por combinação" está escolhida, mas nenhuma combinação foi cadastrada. Do jeito que está, nenhuma pizza com mais de um sabor poderia ser vendida.',
      );
    }
    const chavesDeSabor = new Set(sabores.map((s) => chaveDeNome(s.nome)));
    const chavesDeTamanho = new Set(tamanhos.map((t) => t.chave));
    config.combinacoes.forEach((c, i) => {
      if (!chavesDeTamanho.has(c.tamanho)) {
        problemas.push(`A combinação ${i + 1} usa um tamanho que não existe ("${c.tamanho}").`);
      }
      for (const s of c.sabores) {
        if (!chavesDeSabor.has(s)) {
          problemas.push(`A combinação ${i + 1} usa um sabor que não existe ("${s}").`);
        }
      }
      const t = tamanhos.find((x) => x.chave === c.tamanho);
      if (t && c.sabores.length > t.maxSabores) {
        problemas.push(
          `A combinação ${i + 1} tem ${c.sabores.length} sabores, mas o tamanho "${t.nome}" aceita no máximo ${t.maxSabores}.`,
        );
      }
      const repetida = config.combinacoes.findIndex(
        (o, j) => j < i && o.tamanho === c.tamanho && mesmaCombinacao(o.sabores, c.sabores),
      );
      if (repetida >= 0) {
        problemas.push(`As combinações ${repetida + 1} e ${i + 1} são iguais. Deixe só uma.`);
      }
    });
  }

  if (config.bordaObrigatoria && catalogo.bordas.filter((b) => b.ativo).length === 0) {
    problemas.push("A borda está marcada como obrigatória, mas não há nenhuma borda ativa.");
  }

  return problemas;
}

// ---------------------------------------------------------------------------
// Preços de cada peça
// ---------------------------------------------------------------------------

/** Preço de um sabor num tamanho: o cadastrado para o tamanho, ou o do tamanho + extra. */
export function precoDoSaborNoTamanho(
  sabor: SaborDoCatalogo,
  tamanho: TamanhoDoCatalogo,
): Centavos {
  const proprio = sabor.precosPorTamanho[tamanho.chave];
  if (typeof proprio === "number") return proprio;
  return tamanho.precoBaseCentavos + sabor.extraEspecialCentavos;
}

/** Preço de uma borda ou adicional num tamanho: o do tamanho, ou o preço único. */
export function precoDaOpcaoNoTamanho(
  opcao: OpcaoDoCatalogo,
  tamanho: TamanhoDoCatalogo,
): Centavos {
  const proprio = opcao.precosPorTamanho[tamanho.chave];
  return typeof proprio === "number" ? proprio : opcao.precoCentavos;
}

function precoPorRegra(
  regra: Exclude<RegraDeSabores, "combinacao">,
  tamanho: TamanhoDoCatalogo,
  escolhidos: { sabor: SaborDoCatalogo; partes: number }[],
): Centavos {
  if (regra === "tamanho_e_especiais") {
    return (
      tamanho.precoBaseCentavos +
      escolhidos.reduce((soma, e) => soma + e.sabor.extraEspecialCentavos, 0)
    );
  }
  const precos = escolhidos.map((e) => ({
    preco: precoDoSaborNoTamanho(e.sabor, tamanho),
    partes: e.partes,
  }));
  if (regra === "maior_preco") return Math.max(...precos.map((p) => p.preco));
  const totalDePartes = precos.reduce((s, p) => s + p.partes, 0);
  const somaPonderada = precos.reduce((s, p) => s + p.preco * p.partes, 0);
  return dividirArredondando(somaPonderada, totalDePartes);
}

// ---------------------------------------------------------------------------
// A conta
// ---------------------------------------------------------------------------

/**
 * Confere a montagem e calcula o preço.
 *
 * Junta TODOS os erros de uma vez (em vez de parar no primeiro), para a tela
 * conseguir mostrar tudo o que falta e o servidor conseguir registrar o motivo
 * completo de uma recusa.
 */
export function calcularPizza(
  catalogo: CatalogoDePizza,
  montagem: MontagemDePizza,
): ResultadoDaPizza {
  const erros: ErroDeMontagem[] = [];
  const { config } = catalogo;

  // Tamanho ----------------------------------------------------------------
  const chaveDoTamanho = chaveDeNome(montagem.tamanho);
  const tamanho = catalogo.tamanhos.find((t) => t.chave === chaveDoTamanho);
  if (!tamanho) {
    return {
      ok: false,
      erros: [
        {
          codigo: "tamanho_inexistente",
          mensagem: "Escolha um tamanho válido.",
          ref: montagem.tamanho,
        },
      ],
    };
  }
  if (!tamanho.ativo) {
    erros.push({
      codigo: "tamanho_indisponivel",
      mensagem: `O tamanho ${tamanho.nome} não está disponível agora.`,
      ref: tamanho.chave,
    });
  }

  // Quantidade -------------------------------------------------------------
  const quantidade = montagem.quantidade ?? 1;
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > LIMITES.quantidade) {
    erros.push({
      codigo: "quantidade_invalida",
      mensagem: `A quantidade precisa ser entre 1 e ${LIMITES.quantidade}.`,
    });
  }

  // Sabores ----------------------------------------------------------------
  const pedidos = Array.isArray(montagem.sabores) ? montagem.sabores : [];
  if (pedidos.length === 0) {
    erros.push({ codigo: "sem_sabores", mensagem: "Escolha pelo menos um sabor." });
  }
  if (pedidos.length > tamanho.maxSabores) {
    erros.push({
      codigo: "sabores_demais",
      mensagem: `O tamanho ${tamanho.nome} aceita no máximo ${tamanho.maxSabores} ${
        tamanho.maxSabores === 1 ? "sabor" : "sabores"
      }.`,
    });
  }
  const vistos = new Set<string>();
  const escolhidos: { sabor: SaborDoCatalogo; partes: number }[] = [];
  for (const p of pedidos) {
    if (vistos.has(p.id)) {
      erros.push({
        codigo: "sabor_repetido",
        mensagem: "O mesmo sabor foi escolhido duas vezes.",
        ref: p.id,
      });
      continue;
    }
    vistos.add(p.id);
    const sabor = catalogo.sabores.find((s) => s.id === p.id);
    if (!sabor) {
      erros.push({
        codigo: "sabor_inexistente",
        mensagem: "Um dos sabores não existe mais no cardápio.",
        ref: p.id,
      });
      continue;
    }
    if (!sabor.ativo) {
      erros.push({
        codigo: "sabor_indisponivel",
        mensagem: `O sabor ${sabor.nome} está indisponível agora.`,
        ref: sabor.id,
      });
    }
    const partes = p.partes ?? 1;
    if (!Number.isInteger(partes) || partes < 1 || partes > LIMITES.partesPorSabor) {
      erros.push({
        codigo: "partes_invalidas",
        mensagem: "A divisão dos sabores é inválida.",
        ref: sabor.id,
      });
      continue;
    }
    escolhidos.push({ sabor, partes });
  }

  // Borda ------------------------------------------------------------------
  let borda: PizzaCalculada["borda"] = null;
  if (montagem.bordaId) {
    const opcao = catalogo.bordas.find((b) => b.id === montagem.bordaId);
    if (!opcao) {
      erros.push({
        codigo: "borda_inexistente",
        mensagem: "A borda escolhida não existe mais.",
        ref: montagem.bordaId,
      });
    } else if (!opcao.ativo) {
      erros.push({
        codigo: "borda_indisponivel",
        mensagem: `A borda ${opcao.nome} está indisponível agora.`,
        ref: opcao.id,
      });
    } else {
      borda = {
        id: opcao.id,
        nome: opcao.nome,
        precoCentavos: precoDaOpcaoNoTamanho(opcao, tamanho),
      };
    }
  } else if (config.bordaObrigatoria) {
    erros.push({ codigo: "borda_obrigatoria", mensagem: "Escolha uma borda." });
  }

  // Adicionais -------------------------------------------------------------
  const adicionais: AdicionalCalculado[] = [];
  const idsDeAdicional = new Set<string>();
  let quantidadeDeAdicionais = 0;
  for (const a of montagem.adicionais ?? []) {
    if (idsDeAdicional.has(a.id)) {
      erros.push({
        codigo: "adicional_repetido",
        mensagem: "O mesmo adicional veio duas vezes.",
        ref: a.id,
      });
      continue;
    }
    idsDeAdicional.add(a.id);
    const opcao = catalogo.adicionais.find((o) => o.id === a.id);
    if (!opcao) {
      erros.push({
        codigo: "adicional_inexistente",
        mensagem: "Um dos adicionais não existe mais.",
        ref: a.id,
      });
      continue;
    }
    if (!opcao.ativo) {
      erros.push({
        codigo: "adicional_indisponivel",
        mensagem: `O adicional ${opcao.nome} está indisponível agora.`,
        ref: opcao.id,
      });
      continue;
    }
    const maximo = Math.max(1, opcao.maxQuantidade);
    if (!Number.isInteger(a.quantidade) || a.quantidade < 1 || a.quantidade > maximo) {
      erros.push({
        codigo: "adicional_quantidade_invalida",
        mensagem: `${opcao.nome}: escolha de 1 a ${maximo}.`,
        ref: opcao.id,
      });
      continue;
    }
    quantidadeDeAdicionais += a.quantidade;
    const unit = precoDaOpcaoNoTamanho(opcao, tamanho);
    adicionais.push({
      id: opcao.id,
      nome: opcao.nome,
      quantidade: a.quantidade,
      precoUnitarioCentavos: unit,
      totalCentavos: unit * a.quantidade,
    });
  }
  if (
    config.maxAdicionaisPorPizza !== null &&
    quantidadeDeAdicionais > config.maxAdicionaisPorPizza
  ) {
    erros.push({
      codigo: "adicionais_demais",
      mensagem: `Esta pizza aceita no máximo ${config.maxAdicionaisPorPizza} ${
        config.maxAdicionaisPorPizza === 1 ? "adicional" : "adicionais"
      }.`,
    });
  }

  // Ingredientes retirados e observação -----------------------------------
  // Retirar ingrediente NUNCA dá desconto: não existe regra comercial disso
  // no cadastro. "Sem cebola" é pedido de preparo, não troca de preço.
  const removidos = (montagem.removidos ?? []).map((r) => String(r).trim()).filter(Boolean);
  if (removidos.length > 0 && !config.permitirRemoverIngredientes) {
    erros.push({
      codigo: "remocao_nao_permitida",
      mensagem: "Esta pizzaria não aceita retirar ingredientes pelo cardápio. Use a observação.",
    });
  }
  if (removidos.length > LIMITES.removidos) {
    erros.push({ codigo: "removidos_demais", mensagem: "Ingredientes retirados demais." });
  }
  const ingredientesDosSabores = new Set(
    escolhidos.flatMap((e) => e.sabor.ingredientes.map(chaveDeNome)),
  );
  if (config.permitirRemoverIngredientes) {
    for (const r of removidos) {
      if (!ingredientesDosSabores.has(chaveDeNome(r))) {
        erros.push({
          codigo: "ingrediente_desconhecido",
          mensagem: `"${r}" não é ingrediente dos sabores escolhidos.`,
          ref: r,
        });
      }
    }
  }

  const observacao = String(montagem.observacao ?? "").trim();
  if (observacao.length > LIMITES.observacao) {
    erros.push({
      codigo: "observacao_longa",
      mensagem: `A observação pode ter no máximo ${LIMITES.observacao} letras.`,
    });
  }

  // Preço dos sabores ------------------------------------------------------
  let precoSaboresCentavos = 0;
  let regraAplicada: RegraDeSabores = config.regra;
  if (escolhidos.length > 0) {
    if (config.regra === "combinacao") {
      if (escolhidos.length === 1) {
        precoSaboresCentavos = precoDoSaborNoTamanho(escolhidos[0].sabor, tamanho);
      } else {
        const nomes = escolhidos.map((e) => e.sabor.nome);
        const combinacao = config.combinacoes.find(
          (c) => c.tamanho === tamanho.chave && mesmaCombinacao(c.sabores, nomes),
        );
        if (combinacao) {
          precoSaboresCentavos = combinacao.precoCentavos;
        } else if (config.regraSemCombinacao === "recusar") {
          erros.push({
            codigo: "combinacao_nao_cadastrada",
            mensagem: "Esta combinação de sabores não está disponível neste tamanho.",
          });
        } else {
          regraAplicada = config.regraSemCombinacao;
          precoSaboresCentavos = precoPorRegra(config.regraSemCombinacao, tamanho, escolhidos);
        }
      }
    } else {
      precoSaboresCentavos = precoPorRegra(config.regra, tamanho, escolhidos);
    }
  }

  if (erros.length > 0) return { ok: false, erros };

  const totalDePartes = escolhidos.reduce((s, e) => s + e.partes, 0);
  const sabores: SaborCalculado[] = escolhidos.map((e) => ({
    id: e.sabor.id,
    nome: e.sabor.nome,
    partes: e.partes,
    fracao: fracaoLegivel(e.partes, totalDePartes),
    percentual: Math.round((e.partes * 100) / totalDePartes),
    precoNoTamanhoCentavos: precoDoSaborNoTamanho(e.sabor, tamanho),
  }));

  const precoUnitarioCentavos =
    precoSaboresCentavos +
    (borda?.precoCentavos ?? 0) +
    adicionais.reduce((s, a) => s + a.totalCentavos, 0);

  return {
    ok: true,
    pizza: {
      tamanho: {
        chave: tamanho.chave,
        nome: tamanho.nome,
        fatias: tamanho.fatias,
        maxSabores: tamanho.maxSabores,
      },
      sabores,
      regra: config.regra,
      regraAplicada,
      precoSaboresCentavos,
      borda,
      adicionais,
      removidos,
      observacao,
      precoUnitarioCentavos,
      quantidade,
      totalCentavos: precoUnitarioCentavos * quantidade,
    },
  };
}

// ---------------------------------------------------------------------------
// Texto e registro no pedido
// ---------------------------------------------------------------------------

export const NOMES_DAS_REGRAS: Record<RegraDeSabores, string> = {
  tamanho_e_especiais: "Preço do tamanho + extra dos sabores especiais",
  maior_preco: "Vale o sabor mais caro",
  media_ponderada: "Média proporcional dos sabores",
  combinacao: "Preço por combinação cadastrada",
};

/**
 * Descrição legível, a mesma que vai para a cozinha, para o WhatsApp e para o
 * atendimento. Feita a partir da pizza JÁ CALCULADA — nunca de texto digitado.
 */
export function descreverPizza(pizza: PizzaCalculada): string {
  const linhas: string[] = [`PIZZA ${pizza.tamanho.nome.toUpperCase()}`];
  if (pizza.sabores.length === 1) {
    linhas.push(`• Sabor: ${pizza.sabores[0].nome} (inteira)`);
  } else {
    for (const s of pizza.sabores) linhas.push(`• ${s.nome}: ${s.fracao} (${s.percentual}%)`);
  }
  if (pizza.borda) linhas.push(`• Borda: ${pizza.borda.nome}`);
  for (const a of pizza.adicionais) {
    linhas.push(`• Adicional: ${a.nome}${a.quantidade > 1 ? ` x${a.quantidade}` : ""}`);
  }
  if (pizza.removidos.length > 0) linhas.push(`• Sem: ${pizza.removidos.join(", ")}`);
  if (pizza.observacao) linhas.push(`• Observação: ${pizza.observacao}`);
  return linhas.join("\n");
}

/** A versão do registro gravado no pedido. Mudou o formato, muda o número. */
export const VERSAO_DO_REGISTRO = 1;

/**
 * O registro da pizza que viaja com o pedido e fica gravado nele.
 *
 * É uma FOTOGRAFIA: nomes, frações e preços como estavam no momento da compra.
 * Se o cardápio mudar amanhã, o pedido de hoje continua dizendo o que foi
 * vendido e por quanto.
 */
export type RegistroDaPizza = {
  versao: typeof VERSAO_DO_REGISTRO;
  tamanho: string;
  fatias: number | null;
  sabores: {
    id: string;
    nome: string;
    fracao: string;
    partes: number;
    percentual: number;
    preco_no_tamanho_centavos: number;
  }[];
  regra: RegraDeSabores;
  regra_aplicada: RegraDeSabores;
  preco_sabores_centavos: number;
  borda: { id: string; nome: string; preco_centavos: number } | null;
  adicionais: {
    id: string;
    nome: string;
    quantidade: number;
    preco_unitario_centavos: number;
    total_centavos: number;
  }[];
  removidos: string[];
  observacao: string;
  preco_unitario_centavos: number;
  quantidade: number;
  total_centavos: number;
  descricao: string;
};

export function registrarPizza(pizza: PizzaCalculada): RegistroDaPizza {
  return {
    versao: VERSAO_DO_REGISTRO,
    tamanho: pizza.tamanho.nome,
    fatias: pizza.tamanho.fatias,
    sabores: pizza.sabores.map((s) => ({
      id: s.id,
      nome: s.nome,
      fracao: s.fracao,
      partes: s.partes,
      percentual: s.percentual,
      preco_no_tamanho_centavos: s.precoNoTamanhoCentavos,
    })),
    regra: pizza.regra,
    regra_aplicada: pizza.regraAplicada,
    preco_sabores_centavos: pizza.precoSaboresCentavos,
    borda: pizza.borda
      ? { id: pizza.borda.id, nome: pizza.borda.nome, preco_centavos: pizza.borda.precoCentavos }
      : null,
    adicionais: pizza.adicionais.map((a) => ({
      id: a.id,
      nome: a.nome,
      quantidade: a.quantidade,
      preco_unitario_centavos: a.precoUnitarioCentavos,
      total_centavos: a.totalCentavos,
    })),
    removidos: pizza.removidos,
    observacao: pizza.observacao,
    preco_unitario_centavos: pizza.precoUnitarioCentavos,
    quantidade: pizza.quantidade,
    total_centavos: pizza.totalCentavos,
    descricao: descreverPizza(pizza),
  };
}

/**
 * Confere se um registro de pizza que chegou num pedido FECHA A CONTA.
 *
 * Quem recebe o pedido (o FlyControl) não tem o cardápio do site em mãos com
 * os mesmos códigos, então não refaz o preço do zero — isso é feito pelo
 * servidor do site, que tem o cardápio oficial. Aqui se confere a aritmética:
 * as peças somam o preço unitário, o unitário vezes a quantidade dá o total,
 * as frações fecham 100% e, nas regras que dependem só do preço de cada sabor,
 * o preço dos sabores bate com a regra. Um registro adulterado no caminho não
 * fecha a conta.
 */
export function conferirRegistroDaPizza(registro: unknown): string[] {
  const erros: string[] = [];
  if (!registro || typeof registro !== "object") return ["registro ausente"];
  const r = registro as RegistroDaPizza;
  const inteiro = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;

  if (r.versao !== VERSAO_DO_REGISTRO) erros.push("versão do registro desconhecida");
  if (!Array.isArray(r.sabores) || r.sabores.length === 0) erros.push("sem sabores");
  if (!Array.isArray(r.adicionais)) erros.push("adicionais inválidos");
  if (!REGRAS_DE_SABORES.includes(r.regra_aplicada)) erros.push("regra desconhecida");
  for (const campo of [
    "preco_sabores_centavos",
    "preco_unitario_centavos",
    "total_centavos",
  ] as const) {
    if (!inteiro(r[campo])) erros.push(`${campo} inválido`);
  }
  if (!Number.isInteger(r.quantidade) || r.quantidade < 1 || r.quantidade > LIMITES.quantidade) {
    erros.push("quantidade inválida");
  }
  if (erros.length > 0) return erros;

  const somaAdicionais = r.adicionais.reduce((s, a) => {
    if (
      !inteiro(a.preco_unitario_centavos) ||
      !Number.isInteger(a.quantidade) ||
      a.quantidade < 1
    ) {
      erros.push(`adicional ${a.nome ?? "?"} inválido`);
      return s;
    }
    if (a.total_centavos !== a.preco_unitario_centavos * a.quantidade) {
      erros.push(`adicional ${a.nome} não fecha a conta`);
    }
    return s + a.preco_unitario_centavos * a.quantidade;
  }, 0);
  const borda = r.borda ? r.borda.preco_centavos : 0;
  if (r.borda && !inteiro(r.borda.preco_centavos)) erros.push("borda inválida");

  if (r.preco_unitario_centavos !== r.preco_sabores_centavos + borda + somaAdicionais) {
    erros.push("as peças não somam o preço unitário");
  }
  if (r.total_centavos !== r.preco_unitario_centavos * r.quantidade) {
    erros.push("preço unitário x quantidade não dá o total");
  }

  const partes = r.sabores.map((s) => s.partes);
  if (partes.some((p) => !Number.isInteger(p) || p < 1)) erros.push("divisão de sabores inválida");
  if (r.sabores.some((s) => !inteiro(s.preco_no_tamanho_centavos)))
    erros.push("preço de sabor inválido");
  if (erros.length > 0) return erros;

  const total = partes.reduce((a, b) => a + b, 0);
  if (r.regra_aplicada === "maior_preco") {
    const maior = Math.max(...r.sabores.map((s) => s.preco_no_tamanho_centavos));
    if (r.preco_sabores_centavos !== maior)
      erros.push("preço dos sabores não segue a regra do maior preço");
  } else if (r.regra_aplicada === "media_ponderada") {
    const soma = r.sabores.reduce((s, x) => s + x.preco_no_tamanho_centavos * x.partes, 0);
    if (r.preco_sabores_centavos !== dividirArredondando(soma, total)) {
      erros.push("preço dos sabores não segue a média proporcional");
    }
  }
  return erros;
}
