import { PLAN_PRICING, monthlyEquivalentCents, annualSavingsCents } from "@/lib/billing/plans";
import {
  POLITICA_CENTS_VIGENTE,
  custoTotalCents,
  type PoliticaCents,
} from "@/lib/billing/centsTiers";
import { TRIAL_DURATION_DAYS, TRIAL_PLAN_CODE } from "@/lib/billing/trial";
import { formatCents, type Cents } from "@/lib/billing/money";

/**
 * O QUE A MAYA PODE PROMETER SOBRE PREÇO E CONDIÇÕES.
 *
 * O PROBLEMA QUE ESTE ARQUIVO RESOLVE
 *
 * A MAYA antiga tinha os preços escritos à mão dentro do texto dela, no n8n:
 * "Premium R$ 375/mês" e "CENTS R$ 0,70, caindo para R$ 0,40 aos 500
 * pedidos". Enquanto isso, a cobrança de verdade já cobrava R$ 89,90 no
 * Premium e o CENTS em faixas (0,70 → 0,60 → 0,50 → 0,40). É o garçom
 * recitando o cardápio do ano passado enquanto o caixa cobra pelo novo — o
 * cliente ouve um preço e paga outro.
 *
 * Aqui os preços NÃO são digitados: são lidos dos mesmos arquivos que a
 * fatura usa (`lib/billing`). Se o preço mudar lá, a MAYA passa a falar o
 * preço novo na próxima publicação, sem ninguém lembrar de editar o texto.
 *
 * DUAS ORIGENS, E A DIFERENÇA IMPORTA
 *
 *   "sistema" → o código de cobrança confirma. Pode falar com segurança.
 *   "dono"    → veio do material comercial do dono e o sistema não tem como
 *               conferir (ex.: "implementação gratuita"). Pode falar, porque
 *               o dono afirmou, mas fica marcado para ele reconfirmar.
 *
 * Tudo em centavos inteiros, como no resto do sistema.
 */

export type OrigemComercial = "sistema" | "dono";

export type CondicaoComercial = {
  chave: string;
  /** Frase pronta, do jeito que a MAYA pode dizer. */
  texto: string;
  origem: OrigemComercial;
};

export type LinhaSimulacao = {
  pedidosNoMes: number;
  centsCents: Cents;
  premiumMensalCents: Cents;
};

export type PoliticaComercialMaya = {
  /** Muda sempre que um preço muda. Fica gravado em cada resposta da MAYA. */
  versao: string;
  cadastroUrl: string;
  testeDias: number;
  centsFaixas: PoliticaCents;
  premiumMensalCents: Cents;
  premiumAnualCents: Cents;
  premiumAnualEquivalenteMensalCents: Cents;
  premiumAnualEconomiaCents: Cents;
  /** A partir de quantos pedidos no mês o Premium Mensal sai mais barato que o CENTS. */
  premiumCompensaAPartirDe: number;
  condicoes: CondicaoComercial[];
  /** Pontos que o dono precisa decidir. A MAYA não pode afirmar nada sobre eles. */
  pendencias: string[];
};

export const CADASTRO_URL = "https://flycontrol.conectfly.com.br/signup";

/** Volumes usados na tabela de comparação que a MAYA recebe pronta. */
const VOLUMES_DE_EXEMPLO = [50, 100, 150, 200, 300, 500, 800, 1000] as const;

/** Quanto o CENTS custa num mês com `pedidos` pedidos válidos (faixas progressivas). */
export function custoCentsNoMes(pedidos: number): Cents {
  return custoTotalCents(POLITICA_CENTS_VIGENTE, pedidos);
}

/**
 * O primeiro volume mensal em que o CENTS passa a custar MAIS que o Premium
 * Mensal. Abaixo disso, o CENTS é mais barato.
 *
 * Conta feita aqui, e não pela IA. Modelo de linguagem erra conta de faixa
 * com frequência — e "o Premium compensa acima de X" errado é exatamente o
 * tipo de promessa que vira reclamação no fim do mês.
 */
export function pontoDeEquilibrioPremium(): number {
  const premium = PLAN_PRICING.premium.cycleFeeCents;
  for (let n = 1; n <= 100_000; n++) {
    if (custoCentsNoMes(n) > premium) return n;
  }
  return Number.POSITIVE_INFINITY;
}

export function simularVolume(pedidosNoMes: number): LinhaSimulacao {
  const n = Math.max(0, Math.floor(pedidosNoMes));
  return {
    pedidosNoMes: n,
    centsCents: custoCentsNoMes(n),
    premiumMensalCents: PLAN_PRICING.premium.cycleFeeCents,
  };
}

export function tabelaDeSimulacao(extras: number[] = []): LinhaSimulacao[] {
  const volumes = Array.from(new Set([...VOLUMES_DE_EXEMPLO, ...extras]))
    .filter((v) => Number.isSafeInteger(v) && v > 0 && v <= 100_000)
    .sort((a, b) => a - b);
  return volumes.map(simularVolume);
}

function textoDasFaixas(p: PoliticaCents): string {
  return p.faixas
    .map((f) =>
      f.ate === null
        ? `do ${f.de}º pedido em diante: ${formatCents(f.precoCents)}`
        : `do ${f.de}º ao ${f.ate}º: ${formatCents(f.precoCents)}`,
    )
    .join("; ");
}

export function montarPoliticaComercial(): PoliticaComercialMaya {
  const premium = PLAN_PRICING.premium;
  const anual = PLAN_PRICING.premium_anual;
  const equilibrio = pontoDeEquilibrioPremium();

  const condicoes: CondicaoComercial[] = [
    {
      chave: "cadastro",
      texto: `O cadastro é gratuito, pelo link ${CADASTRO_URL}`,
      origem: "sistema",
    },
    {
      chave: "teste",
      texto: `Quem se cadastra começa com ${TRIAL_DURATION_DAYS} dias grátis${
        TRIAL_PLAN_CODE === "cents" ? ", no plano CENTS" : ""
      }. A cobrança só começa depois desse período.`,
      origem: "sistema",
    },
    {
      chave: "cents",
      texto:
        `CENTS: sem mensalidade e sem taxa de entrada; paga por pedido, em faixas que ficam mais baratas ` +
        `conforme a loja vende no mês (${textoDasFaixas(POLITICA_CENTS_VIGENTE)}). ` +
        `O desconto vale dali para a frente, não volta para os pedidos anteriores, e a contagem recomeça a cada mês.`,
      origem: "sistema",
    },
    {
      chave: "premium",
      texto:
        `Premium Mensal: ${formatCents(premium.cycleFeeCents)} por mês, sem cobrança por pedido. ` +
        `Premium Anual: ${formatCents(anual.cycleFeeCents)} pagos uma vez por ano ` +
        `(equivale a ${formatCents(monthlyEquivalentCents("premium_anual"))}/mês; economia de ${formatCents(annualSavingsCents())} no ano).`,
      origem: "sistema",
    },
    {
      chave: "diferenca_planos",
      texto:
        "O Premium inclui Mesas, Garçons e Comissões, que o CENTS não tem. Pedidos, cardápio, clientes e dashboard estão nos dois.",
      origem: "sistema",
    },
    {
      chave: "comparacao",
      texto: Number.isFinite(equilibrio)
        ? `Só pelo preço: abaixo de ${equilibrio} pedidos no mês o CENTS sai mais barato; a partir de ${equilibrio} pedidos, o Premium Mensal sai mais barato.`
        : "Só pelo preço, o CENTS é sempre mais barato que o Premium Mensal.",
      origem: "sistema",
    },
    // ── Do material do dono (o sistema não consegue conferir) ────────────
    { chave: "cardapio", texto: "O cardápio digital é 100% grátis.", origem: "dono" },
    {
      chave: "implementacao",
      texto: "A implementação é gratuita, com ajuda de profissionais da equipe.",
      origem: "dono",
    },
    {
      chave: "pagamento",
      texto: "Formas de pagamento: PIX, cartão de crédito e débito.",
      origem: "dono",
    },
    {
      chave: "cancelamento",
      texto: "Pode cancelar quando quiser, sem fidelidade.",
      origem: "dono",
    },
    {
      chave: "atendimento_humano",
      texto: "A equipe atende todos os dias, das 07h às 23h (horário de Brasília).",
      origem: "dono",
    },
    {
      chave: "demonstracao",
      texto:
        "Dá para pedir uma apresentação de 30 minutos com a equipe; o horário é confirmado por uma pessoa da equipe.",
      origem: "dono",
    },
    {
      chave: "flydelivery",
      texto:
        "O FlyDelivery é uma plataforma do ecossistema pensada para parceiros FlyControl. Não há data de lançamento ou lista de recursos confirmada para divulgar.",
      origem: "dono",
    },
  ];

  const pendencias = [
    "O site (página inicial e /plans) ainda diz que, ao passar de 500 pedidos, o CENTS cai para R$ 0,45 no mês seguinte. A cobrança de verdade usa faixas (0,70/0,60/0,50/0,40) que recomeçam todo mês. A MAYA fala o que a cobrança faz; o site precisa ser corrigido.",
    "Clientes antigos do Premium podem continuar pagando R$ 375,00 (preço da época). A MAYA fala só o preço de contratações novas.",
    "Os 30 dias grátis entram no CENTS. Falta o dono confirmar se quem escolhe o Premium direto também ganha os 30 dias.",
    "Cartão de débito: a InfinityPay do sistema não mostra evidência de débito no código. Confirmar.",
    "Cardápio 100% grátis: confirmar se é para sempre ou só durante o teste.",
  ];

  const versao = [
    "comercial",
    POLITICA_CENTS_VIGENTE.versao,
    `premium${premium.cycleFeeCents}`,
    `anual${anual.cycleFeeCents}`,
    `teste${TRIAL_DURATION_DAYS}`,
  ].join("-");

  return {
    versao,
    cadastroUrl: CADASTRO_URL,
    testeDias: TRIAL_DURATION_DAYS,
    centsFaixas: POLITICA_CENTS_VIGENTE,
    premiumMensalCents: premium.cycleFeeCents,
    premiumAnualCents: anual.cycleFeeCents,
    premiumAnualEquivalenteMensalCents: monthlyEquivalentCents("premium_anual"),
    premiumAnualEconomiaCents: annualSavingsCents(),
    premiumCompensaAPartirDe: equilibrio,
    condicoes,
    pendencias,
  };
}

/**
 * Os valores em reais que a MAYA tem permissão de escrever.
 *
 * É a lista que o conferente da saída (`saida.ts`) usa: qualquer "R$" fora
 * dela é tratado como valor inventado. Inclui os preços, as faixas e os
 * totais da tabela de simulação que ela recebeu naquele turno.
 */
export function valoresPermitidosCents(
  politica: PoliticaComercialMaya,
  simulacao: LinhaSimulacao[],
): Set<Cents> {
  const s = new Set<Cents>([
    politica.premiumMensalCents,
    politica.premiumAnualCents,
    politica.premiumAnualEquivalenteMensalCents,
    politica.premiumAnualEconomiaCents,
    0,
  ]);
  for (const f of politica.centsFaixas.faixas) s.add(f.precoCents);
  for (const l of simulacao) {
    s.add(l.centsCents);
    s.add(l.premiumMensalCents);
    const diferenca = Math.abs(l.centsCents - l.premiumMensalCents);
    s.add(diferenca);
  }
  return s;
}
