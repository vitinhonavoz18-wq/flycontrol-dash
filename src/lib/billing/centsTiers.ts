/**
 * As faixas de preço do plano CENTS.
 *
 * A IDEIA
 *
 * Quanto mais a loja vende, menos ela paga por pedido. Mas o desconto vale
 * DALI PARA FRENTE, e não para trás: quem faz 600 pedidos não paga R$ 0,40
 * nos 600. Paga R$ 0,70 nos primeiros 100, R$ 0,60 nos seguintes, e assim por
 * diante — como conta de luz, que cobra mais caro a primeira faixa de consumo
 * e mais barato a seguinte.
 *
 * ESTE ARQUIVO É A ÚNICA FONTE DE VERDADE DO PREÇO
 *
 * Nenhum outro lugar do sistema pode ter 70, 60, 50 ou 40 escrito à mão. Se
 * dois lugares souberem o preço, um dia eles vão discordar — e a tela vai
 * mostrar um valor enquanto a fatura cobra outro.
 *
 * ── A FRONTEIRA, E POR QUE ELA MUDOU ────────────────────────────────────
 *
 * A especificação trazia uma tabela com faixas 1–100, 101–249, 250–499 e
 * 500+, e ao mesmo tempo dizia que as metas são 100, 250 e 500 pedidos, com
 * o exemplo "em 187 pedidos, faltam 63 para a próxima meta" (250 − 187).
 *
 * Os dois não fecham ao mesmo tempo. Se a faixa nova começa NO pedido 250,
 * então quem tem 249 já desbloqueou — e "falta 1 pedido para desbloquear"
 * seria mentira. Se a meta é "completar 250 pedidos", a faixa nova começa no
 * 251.
 *
 * Adotei a segunda leitura, porque é a que faz as três metas funcionarem do
 * mesmo jeito ("complete 100, complete 250, complete 500") e é a que bate com
 * o exemplo dos 63 pedidos. As faixas ficam:
 *
 *   1–100 → R$ 0,70   |   101–250 → R$ 0,60
 *   251–500 → R$ 0,50 |   501+   → R$ 0,40
 *
 * Assim, "faltam N para a próxima meta" é sempre `meta − pedidos`, e nenhum
 * pedido fica sem faixa ou em duas faixas.
 *
 * ── POR QUE A POLÍTICA TEM VERSÃO ───────────────────────────────────────
 *
 * Mudar o preço amanhã não pode mudar a fatura de ontem. Cada ciclo guarda
 * QUAL política usou; alterar os números aqui cria uma versão nova, e as
 * faturas velhas continuam valendo o que valiam. É o cardápio com data: o
 * preço de hoje não reescreve a conta da semana passada.
 */

import type { Cents } from "./money";

export type NivelCents = 1 | 2 | 3 | 4;

export type FaixaCents = {
  nivel: NivelCents;
  /** Número do primeiro pedido desta faixa (contando a partir de 1). */
  de: number;
  /** Número do último pedido. `null` = não tem fim. */
  ate: number | null;
  precoCents: Cents;
  /** O nome que aparece na tela. */
  rotulo: string;
};

export type PoliticaCents = {
  versao: string;
  faixas: readonly FaixaCents[];
};

/**
 * A política em vigor.
 *
 * NÃO ALTERE ESTES NÚMEROS. Para mudar preço, crie `POLITICA_CENTS_V3` e
 * aponte os ciclos novos para ela — senão as faturas já fechadas passam a
 * dizer outro valor do que cobraram.
 */
export const POLITICA_CENTS_V2: PoliticaCents = {
  versao: "cents_v2",
  faixas: [
    { nivel: 1, de: 1, ate: 100, precoCents: 70, rotulo: "Início" },
    { nivel: 2, de: 101, ate: 250, precoCents: 60, rotulo: "Fase 2" },
    { nivel: 3, de: 251, ate: 500, precoCents: 50, rotulo: "Fase 3" },
    { nivel: 4, de: 501, ate: null, precoCents: 40, rotulo: "CENTS MAX" },
  ],
} as const;

/**
 * A política antiga: um preço só para o ciclo inteiro.
 *
 * Existe para os ciclos que já estavam abertos antes desta mudança. Eles
 * continuam sendo calculados como sempre foram — trocar a regra no meio do
 * mês seria mudar o preço depois de o cliente já ter vendido.
 */
export const POLITICA_CENTS_V1: PoliticaCents = {
  versao: "cents_v1",
  faixas: [{ nivel: 1, de: 1, ate: null, precoCents: 70, rotulo: "Padrão" }],
} as const;

const POLITICAS: Record<string, PoliticaCents> = {
  [POLITICA_CENTS_V1.versao]: POLITICA_CENTS_V1,
  [POLITICA_CENTS_V2.versao]: POLITICA_CENTS_V2,
};

/**
 * Recupera a política que um ciclo usou.
 *
 * Versão desconhecida cai na V1, a mais conservadora: na dúvida, cobra-se o
 * preço cheio e não se inventa um desconto que ninguém contratou.
 */
export function politicaPorVersao(versao: unknown): PoliticaCents {
  if (typeof versao !== "string") return POLITICA_CENTS_V1;
  return POLITICAS[versao] ?? POLITICA_CENTS_V1;
}

// ---------------------------------------------------------------------------
// A conta
// ---------------------------------------------------------------------------

function validarQuantidade(total: number): number {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error(`[cents] quantidade de pedidos inválida: ${String(total)}`);
  }
  return total;
}

/** Em qual faixa cai o pedido de número `n` (1 = primeiro pedido do ciclo). */
export function faixaDoPedido(politica: PoliticaCents, n: number): FaixaCents {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new Error(`[cents] número de pedido inválido: ${String(n)}`);
  }
  const achada = politica.faixas.find((f) => n >= f.de && (f.ate === null || n <= f.ate));
  if (!achada) {
    // Só acontece se alguém criar uma política com buraco entre as faixas.
    throw new Error(`[cents] o pedido ${n} não pertence a nenhuma faixa de ${politica.versao}`);
  }
  return achada;
}

export type PedacoDaConta = {
  faixa: FaixaCents;
  quantidade: number;
  subtotalCents: Cents;
};

/**
 * Quantos pedidos caíram em cada faixa, e quanto cada pedaço custou.
 *
 * É esta lista que vira as linhas da fatura e o "ver detalhes da cobrança" na
 * tela. Faixa sem nenhum pedido não entra — linha de fatura com quantidade
 * zero só confunde quem está conferindo a conta.
 */
export function distribuirPorFaixa(politica: PoliticaCents, total: number): PedacoDaConta[] {
  validarQuantidade(total);
  if (total === 0) return [];

  const pedacos: PedacoDaConta[] = [];

  for (const faixa of politica.faixas) {
    if (total < faixa.de) break;
    const fim = faixa.ate === null ? total : Math.min(total, faixa.ate);
    const quantidade = fim - faixa.de + 1;
    if (quantidade <= 0) continue;
    pedacos.push({
      faixa,
      quantidade,
      // Centavos inteiros multiplicados por inteiro: não existe arredondamento
      // para dar errado.
      subtotalCents: quantidade * faixa.precoCents,
    });
  }

  return pedacos;
}

/** O total do consumo, em centavos. */
export function custoTotalCents(politica: PoliticaCents, total: number): Cents {
  return distribuirPorFaixa(politica, total).reduce((soma, p) => soma + p.subtotalCents, 0);
}

/**
 * A faixa em que o PRÓXIMO pedido vai cair.
 *
 * É esta que a tela mostra como "R$ X,XX por novo pedido" — o preço que vale
 * agora, para o próximo pedido que entrar. Com 100 pedidos feitos, o próximo
 * é o 101, então o preço já é o da faixa 2: foi exatamente isso que a loja
 * conquistou ao completar os 100.
 */
export function faixaAtual(politica: PoliticaCents, total: number): FaixaCents {
  validarQuantidade(total);
  return faixaDoPedido(politica, total + 1);
}

export type ProximaMeta = {
  /** Quantos pedidos no ciclo desbloqueiam a faixa seguinte. */
  meta: number;
  faltam: number;
  faixaSeguinte: FaixaCents;
};

/**
 * A próxima conquista, ou `null` quando já está no último nível.
 *
 * A meta é "completar N pedidos", então `faltam` é sempre `meta − feitos`.
 */
export function proximaMeta(politica: PoliticaCents, total: number): ProximaMeta | null {
  validarQuantidade(total);
  const atual = faixaAtual(politica, total);
  const seguinte = politica.faixas.find((f) => f.nivel === atual.nivel + 1);
  if (!seguinte) return null;

  const meta = seguinte.de - 1;
  return { meta, faltam: Math.max(0, meta - total), faixaSeguinte: seguinte };
}

export type ProgressoCents = {
  politica: string;
  pedidos: number;
  faixaAtual: FaixaCents;
  precoDoProximoPedidoCents: Cents;
  proxima: ProximaMeta | null;
  /** 0 a 100: quanto já andou DENTRO da fase atual. */
  percentDaFase: number;
  /** 0 a 100: a posição na trilha inteira, com as fases em pedaços iguais. */
  posicaoNaTrilha: number;
  pedacos: PedacoDaConta[];
  totalCents: Cents;
  /** `true` no último nível — a trilha para de andar, o contador não. */
  noMaximo: boolean;
};

/**
 * Tudo que a tela precisa saber, calculado num lugar só.
 *
 * A tela não faz conta de dinheiro: ela recebe pronto. Se o navegador
 * calculasse, bastaria alguém mexer no que ele mostra para a conta contar
 * outra história — e a fatura chegaria diferente do que a tela prometia.
 */
export function progressoCents(politica: PoliticaCents, total: number): ProgressoCents {
  validarQuantidade(total);

  const atual = faixaAtual(politica, total);
  const proxima = proximaMeta(politica, total);
  const pedacos = distribuirPorFaixa(politica, total);

  const inicioDaFase = atual.de - 1;
  const fimDaFase = proxima?.meta ?? null;
  const percentDaFase =
    fimDaFase === null || fimDaFase <= inicioDaFase
      ? 100
      : Math.min(100, Math.round(((total - inicioDaFase) / (fimDaFase - inicioDaFase)) * 100));

  return {
    politica: politica.versao,
    pedidos: total,
    faixaAtual: atual,
    precoDoProximoPedidoCents: atual.precoCents,
    proxima,
    percentDaFase,
    posicaoNaTrilha: posicaoNaTrilha(politica, total),
    pedacos,
    totalCents: pedacos.reduce((s, p) => s + p.subtotalCents, 0),
    noMaximo: proxima === null,
  };
}

/**
 * Onde o marcador fica na trilha, de 0 a 100.
 *
 * A trilha NÃO é uma régua proporcional. As fases têm tamanhos muito
 * diferentes (100, 150, 250 pedidos), e numa régua linear a primeira fase
 * viraria um tracinho — o lojista que está no começo não veria progresso
 * nenhum e acharia que o sistema travou.
 *
 * Então cada fase ocupa uma fatia igual da barra, e dentro da fatia o
 * marcador anda proporcionalmente. É o mapa do metrô: as estações não estão
 * na distância real, estão espaçadas para dar para ler.
 */
export function posicaoNaTrilha(politica: PoliticaCents, total: number): number {
  validarQuantidade(total);

  const fases = politica.faixas.length;
  if (fases <= 1) return 100;

  const atual = faixaAtual(politica, total);
  const proxima = proximaMeta(politica, total);
  if (!proxima) return 100;

  // As fatias são contadas pelas fases que têm fim: a última não anda.
  const fatia = 100 / (fases - 1);
  const inicioDaFase = atual.de - 1;
  const tamanhoDaFase = proxima.meta - inicioDaFase;
  const dentro = tamanhoDaFase <= 0 ? 1 : (total - inicioDaFase) / tamanhoDaFase;

  const posicao = (atual.nivel - 1) * fatia + Math.min(1, Math.max(0, dentro)) * fatia;
  return Math.min(100, Math.round(posicao * 100) / 100);
}

/** Os marcos da trilha: 100, 250, 500 — e o que cada um desbloqueia. */
export type MarcoDaTrilha = {
  meta: number;
  precoCents: Cents;
  nivel: NivelCents;
  rotulo: string;
  estado: "concluido" | "atual" | "bloqueado";
  /** Onde ele fica na barra, de 0 a 100. */
  posicao: number;
};

export function marcosDaTrilha(politica: PoliticaCents, total: number): MarcoDaTrilha[] {
  validarQuantidade(total);
  const fases = politica.faixas.length;
  if (fases <= 1) return [];

  const atual = faixaAtual(politica, total);
  const fatia = 100 / (fases - 1);

  return politica.faixas
    .filter((f) => f.nivel > 1)
    .map((f) => {
      const meta = f.de - 1;
      const estado: MarcoDaTrilha["estado"] =
        total >= meta ? "concluido" : f.nivel === atual.nivel + 1 ? "atual" : "bloqueado";
      return {
        meta,
        precoCents: f.precoCents,
        nivel: f.nivel,
        rotulo: f.rotulo,
        estado,
        posicao: Math.min(100, (f.nivel - 1) * fatia),
      };
    });
}

// ---------------------------------------------------------------------------
// Vigência: a partir de quando as faixas valem
// ---------------------------------------------------------------------------

/**
 * A data em que as faixas passam a valer, no formato `2026-09-01`.
 *
 * SEM ESTA VARIÁVEL PREENCHIDA, NADA MUDA PARA NINGUÉM. É o interruptor:
 * enquanto ela estiver vazia, todo ciclo continua sendo calculado como
 * sempre foi — um preço só, o congelado na abertura.
 *
 * Ela existe porque trocar a regra no meio de um ciclo seria mudar o preço
 * depois de o cliente já ter vendido. Com a data, só os ciclos que ABREM
 * daquele dia em diante nascem com faixas; os que já estavam rodando
 * terminam com a regra que começaram.
 */
export const VARIAVEL_DE_VIGENCIA = "CENTS_V2_VIGENCIA";

/**
 * Qual política um ciclo usa, a partir do dia em que ele abriu.
 *
 * A resposta é sempre a mesma para o mesmo ciclo — a data de abertura não
 * muda depois. É isso que garante que uma fatura fechada continue valendo o
 * que valia, mesmo que a vigência seja alterada amanhã.
 */
export function politicaParaCiclo(
  inicioDoCiclo: Date | string | null | undefined,
  env: Record<string, string | undefined>,
): PoliticaCents {
  const bruto = env[VARIAVEL_DE_VIGENCIA]?.trim();
  if (!bruto) return POLITICA_CENTS_V1;

  const vigencia = new Date(bruto);
  if (Number.isNaN(vigencia.getTime())) {
    console.warn(`[cents] ${VARIAVEL_DE_VIGENCIA} não é uma data válida: "${bruto}"`);
    return POLITICA_CENTS_V1;
  }

  if (!inicioDoCiclo) return POLITICA_CENTS_V1;
  const inicio = new Date(inicioDoCiclo);
  if (Number.isNaN(inicio.getTime())) return POLITICA_CENTS_V1;

  return inicio.getTime() >= vigencia.getTime() ? POLITICA_CENTS_V2 : POLITICA_CENTS_V1;
}
