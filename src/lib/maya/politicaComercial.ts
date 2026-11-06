/**
 * O que a MAYA pode dizer sobre preço, plano e condições.
 *
 * DE ONDE VÊM OS NÚMEROS
 *
 * Nenhum valor é digitado aqui. Preço do Premium, faixas do CENTS e dias de
 * teste são lidos de `lib/billing` — os MESMOS arquivos que a fatura usa para
 * cobrar e que a página de planos usa para anunciar. Foi exatamente por não
 * ser assim que a MAYA antiga anunciava "Premium R$ 375/mês" enquanto o site e
 * a cobrança já estavam em R$ 89,90: o preço estava escrito à mão dentro do
 * texto dela, e ninguém lembrou de mudar lá quando mudou aqui.
 *
 * É a diferença entre a atendente ler o preço na etiqueta do produto e ela
 * repetir o preço que decorou no mês passado.
 *
 * O QUE NÃO ESTÁ NO SISTEMA
 *
 * Algumas promessas do material comercial antigo (implementação gratuita,
 * formas de pagamento, cancelamento sem fidelidade, cardápio grátis para
 * sempre) não existem como regra no código — são combinados comerciais. Elas
 * ficam marcadas com a fonte "material_do_dono" e com `confirmadoNoSistema:
 * false`, para o prompt saber a diferença entre "o sistema garante" e "a
 * empresa informou".
 */

import { formatCents, type Cents } from "@/lib/billing/money";
import { PLAN_PRICING, monthlyEquivalentCents } from "@/lib/billing/plans";
import {
  POLITICA_CENTS_VIGENTE,
  custoTotalCents,
  distribuirPorFaixa,
  type PoliticaCents,
} from "@/lib/billing/centsTiers";
import { TRIAL_DURATION_DAYS } from "@/lib/billing/trial";

export const LINK_CADASTRO = "https://flycontrol.conectfly.com.br/signup";

export type FonteDaInformacao = "sistema_de_cobranca" | "material_do_dono";

export type CondicaoComercial = {
  chave: string;
  texto: string;
  fonte: FonteDaInformacao;
  confirmadoNoSistema: boolean;
};

export type PoliticaComercialMaya = {
  /** Muda sempre que um número muda: permite saber o que a MAYA disse em cada época. */
  versao: string;
  cadastroUrl: string;
  testeGratisDias: number;
  cents: {
    versaoFaixas: string;
    ciclo: "mensal";
    /** Desconto vale dali para frente, nunca volta para os pedidos já feitos. */
    retroativo: false;
    faixas: { de: number; ate: number | null; precoCents: Cents }[];
    taxaDeEntradaCents: Cents;
    mensalidadeCents: Cents;
  };
  premiumMensal: { precoCents: Cents; cobraPorPedido: false };
  premiumAnual: { precoCents: Cents; equivalenteMensalCents: Cents; cobraPorPedido: false };
  atendimentoHumano: { abre: number; fecha: number; todosOsDias: true; fuso: string };
  demonstracaoMinutos: number;
  condicoes: CondicaoComercial[];
  /** Perguntas que o dono ainda precisa responder. A MAYA não pode inventar a resposta. */
  pendencias: string[];
};

function versaoDaPolitica(cents: PoliticaCents): string {
  const p = PLAN_PRICING;
  return [
    "maya-comercial",
    cents.versao,
    `pm${p.premium.cycleFeeCents}`,
    `pa${p.premium_anual.cycleFeeCents}`,
    `t${TRIAL_DURATION_DAYS}`,
  ].join("_");
}

export function politicaComercialVigente(): PoliticaComercialMaya {
  const cents = POLITICA_CENTS_VIGENTE;
  return {
    versao: versaoDaPolitica(cents),
    cadastroUrl: LINK_CADASTRO,
    testeGratisDias: TRIAL_DURATION_DAYS,
    cents: {
      versaoFaixas: cents.versao,
      ciclo: "mensal",
      retroativo: false,
      faixas: cents.faixas.map((f) => ({ de: f.de, ate: f.ate, precoCents: f.precoCents })),
      taxaDeEntradaCents: PLAN_PRICING.cents.setupFeeCents,
      mensalidadeCents: PLAN_PRICING.cents.cycleFeeCents,
    },
    premiumMensal: { precoCents: PLAN_PRICING.premium.cycleFeeCents, cobraPorPedido: false },
    premiumAnual: {
      precoCents: PLAN_PRICING.premium_anual.cycleFeeCents,
      equivalenteMensalCents: monthlyEquivalentCents("premium_anual"),
      cobraPorPedido: false,
    },
    atendimentoHumano: { abre: 7, fecha: 23, todosOsDias: true, fuso: "America/Bahia" },
    demonstracaoMinutos: 30,
    condicoes: [
      {
        chave: "cadastro_gratis",
        texto: "O cadastro é gratuito.",
        fonte: "sistema_de_cobranca",
        confirmadoNoSistema: true,
      },
      {
        chave: "teste_gratis",
        texto: `Todo cadastro novo começa com ${TRIAL_DURATION_DAYS} dias grátis (uma vez por e-mail/documento).`,
        fonte: "sistema_de_cobranca",
        confirmadoNoSistema: true,
      },
      {
        chave: "implementacao_gratis",
        texto: "Implementação gratuita com profissionais da equipe.",
        fonte: "material_do_dono",
        confirmadoNoSistema: false,
      },
      {
        chave: "cardapio_digital_gratis",
        texto: "Cardápio digital 100% grátis.",
        fonte: "material_do_dono",
        confirmadoNoSistema: false,
      },
      {
        chave: "formas_de_pagamento",
        texto: "Pagamento por PIX, cartão de débito ou crédito.",
        fonte: "material_do_dono",
        confirmadoNoSistema: false,
      },
      {
        chave: "cancelamento",
        texto: "Pode cancelar quando quiser, sem fidelidade.",
        fonte: "material_do_dono",
        confirmadoNoSistema: false,
      },
      {
        chave: "troca_de_plano",
        texto: "Dá para trocar de plano depois, pelo próprio painel.",
        fonte: "sistema_de_cobranca",
        confirmadoNoSistema: true,
      },
    ],
    pendencias: [
      "O 'cardápio digital 100% grátis' continua grátis depois dos 30 dias de teste, sem plano pago?",
      "Existem taxas externas (ex.: taxa do meio de pagamento) que o cliente precisa saber?",
      "O FlyDelivery já está disponível? Para quem e com quais condições?",
      "Quem antes pagava Premium R$ 375,00 continua nesse valor — a MAYA deve mencionar isso a clientes antigos?",
    ],
  };
}

// ---------------------------------------------------------------------------
// Comparação de planos (a ferramenta `simular_planos`)
// ---------------------------------------------------------------------------

export type SimulacaoDePlanos = {
  pedidosPorMes: number;
  centsTotalCents: Cents;
  centsDetalhe: {
    de: number;
    ate: number;
    quantidade: number;
    precoCents: Cents;
    subtotalCents: Cents;
  }[];
  premiumMensalCents: Cents;
  premiumAnualEquivalenteMensalCents: Cents;
  maisEconomico: "cents" | "premium_mensal" | "empate";
  /** Frase pronta, com a conta à mostra, para a MAYA usar sem precisar calcular. */
  resumo: string;
  premissas: string[];
};

/** Maior volume que a ferramenta aceita. Acima disso é conversa com a equipe, não com a calculadora. */
export const MAX_PEDIDOS_SIMULACAO = 100_000;

/**
 * A IA manda "300", 300, "300 pedidos", "1.000" ou 300.0. Aceita o número
 * inteiro e devolve NaN para o resto — melhor recusar do que simular o volume
 * errado e a MAYA recomendar o plano errado com toda a confiança.
 */
export function lerQuantidadeDePedidos(valor: unknown): number {
  if (typeof valor === "number") return Number.isInteger(valor) ? valor : Math.floor(valor);
  const texto = String(valor ?? "").replace(/(\d)\.(\d{3})(?!\d)/g, "$1$2");
  const achado = texto.match(/\d+/);
  return achado ? Number(achado[0]) : NaN;
}

/**
 * Quanto a loja pagaria em cada plano, num mês com N pedidos.
 *
 * O modelo de linguagem é péssimo de conta: "300 pedidos" vira R$ 120 porque
 * ele aplica R$ 0,40 em tudo. A conta sai daqui, com a mesma função que fecha
 * a fatura, e a MAYA só lê o resultado.
 */
export function simularPlanos(pedidosPorMes: number): SimulacaoDePlanos {
  if (
    !Number.isSafeInteger(pedidosPorMes) ||
    pedidosPorMes < 0 ||
    pedidosPorMes > MAX_PEDIDOS_SIMULACAO
  ) {
    throw new Error(`[maya] pedidos por mês inválido: ${String(pedidosPorMes)}`);
  }
  const politica = POLITICA_CENTS_VIGENTE;
  const pedacos = distribuirPorFaixa(politica, pedidosPorMes);
  const centsTotal = custoTotalCents(politica, pedidosPorMes);
  const premium = PLAN_PRICING.premium.cycleFeeCents;
  const anualMes = monthlyEquivalentCents("premium_anual");

  const maisEconomico: SimulacaoDePlanos["maisEconomico"] =
    centsTotal < premium ? "cents" : centsTotal > premium ? "premium_mensal" : "empate";

  const detalhe = pedacos.map((p) => ({
    de: p.faixa.de,
    ate: p.faixa.de + p.quantidade - 1,
    quantidade: p.quantidade,
    precoCents: p.faixa.precoCents,
    subtotalCents: p.subtotalCents,
  }));

  const conta = detalhe.length
    ? detalhe.map((d) => `${d.quantidade} × ${formatCents(d.precoCents)}`).join(" + ")
    : "nenhum pedido";

  const comparacao =
    maisEconomico === "cents"
      ? "o CENTS sai mais barato que o Premium Mensal"
      : maisEconomico === "premium_mensal"
        ? "o Premium Mensal sai mais barato que o CENTS"
        : "os dois saem pelo mesmo valor";

  const resumo =
    `Com ${pedidosPorMes} pedidos no mês, o CENTS daria ${formatCents(centsTotal)} (${conta}). ` +
    `O Premium Mensal é ${formatCents(premium)} fixo, sem cobrança por pedido. ` +
    `Nesse volume, ${comparacao}. ` +
    `No Premium Anual o equivalente fica ${formatCents(anualMes)} por mês, pago de uma vez (${formatCents(PLAN_PRICING.premium_anual.cycleFeeCents)} por ano).`;

  return {
    pedidosPorMes,
    centsTotalCents: centsTotal,
    centsDetalhe: detalhe,
    premiumMensalCents: premium,
    premiumAnualEquivalenteMensalCents: anualMes,
    maisEconomico,
    resumo,
    premissas: [
      "Conta feita com a tabela de preços vigente para ciclos novos.",
      "No CENTS a contagem recomeça a cada ciclo mensal e o desconto vale dali para frente (não é retroativo).",
      "Os primeiros 30 dias do cadastro são grátis e não entram nessa conta.",
      "Não considera taxas externas, se houver.",
    ],
  };
}

// ---------------------------------------------------------------------------
// O bloco de texto que entra no prompt
// ---------------------------------------------------------------------------

function faixaEmTexto(f: { de: number; ate: number | null; precoCents: Cents }): string {
  return f.ate === null
    ? `do ${f.de}º pedido em diante: ${formatCents(f.precoCents)} por pedido`
    : `do ${f.de}º ao ${f.ate}º pedido: ${formatCents(f.precoCents)} por pedido`;
}

export function politicaEmTexto(p: PoliticaComercialMaya): string {
  const confirmadas = p.condicoes.filter((c) => c.confirmadoNoSistema).map((c) => `- ${c.texto}`);
  const informadas = p.condicoes.filter((c) => !c.confirmadoNoSistema).map((c) => `- ${c.texto}`);
  return [
    `Versão da política comercial: ${p.versao}`,
    "",
    "PLANOS (valores do sistema de cobrança — são os únicos valores que você pode citar):",
    `- CENTS: sem mensalidade e sem taxa de entrada (${formatCents(p.cents.mensalidadeCents)} / ${formatCents(p.cents.taxaDeEntradaCents)}). Paga por pedido, em faixas que baixam conforme o volume do mês:`,
    ...p.cents.faixas.map((f) => `    • ${faixaEmTexto(f)}`),
    "  A contagem recomeça a cada ciclo mensal. O desconto NÃO é retroativo: quem faz 600 pedidos paga cada faixa pelo preço dela, não R$ 0,40 em todos.",
    `- Premium Mensal: ${formatCents(p.premiumMensal.precoCents)} por mês, sem cobrança por pedido.`,
    `- Premium Anual: ${formatCents(p.premiumAnual.precoCents)} por ano, pago de uma vez (equivale a ${formatCents(p.premiumAnual.equivalenteMensalCents)} por mês), sem cobrança por pedido.`,
    `- Teste: ${p.testeGratisDias} dias grátis no cadastro novo. O cadastro começa no CENTS; o Premium pode ser contratado dentro do painel.`,
    `- Link oficial de cadastro: ${p.cadastroUrl}`,
    "",
    "CONFIRMADO NO SISTEMA:",
    ...confirmadas,
    "",
    "INFORMADO PELA EMPRESA (pode usar, mas sem detalhar além do que está escrito):",
    ...informadas,
    "",
    `ATENDIMENTO HUMANO: todos os dias, das ${String(p.atendimentoHumano.abre).padStart(2, "0")}:00 às ${p.atendimentoHumano.fecha}:00 (horário de Brasília/Bahia).`,
    `DEMONSTRAÇÃO: reunião de ${p.demonstracaoMinutos} minutos com a equipe, dentro desse horário. Não existe agenda integrada: você NÃO marca horário — você registra o interesse e transfere para a equipe confirmar.`,
    "",
    "AINDA NÃO DEFINIDO (se perguntarem, diga que vai confirmar com a equipe e transfira):",
    ...p.pendencias.map((x) => `- ${x}`),
  ].join("\n");
}

/** Todo valor em R$ que a política permite citar. Serve para a auditoria apontar número inventado. */
export function valoresDaPolitica(p: PoliticaComercialMaya): string[] {
  const centavos = [
    p.cents.taxaDeEntradaCents,
    p.cents.mensalidadeCents,
    ...p.cents.faixas.map((f) => f.precoCents),
    p.premiumMensal.precoCents,
    p.premiumAnual.precoCents,
    p.premiumAnual.equivalenteMensalCents,
  ];
  return [...new Set(centavos.map(formatCents))];
}

/** Os valores que uma simulação produziu — também podem aparecer na resposta. */
export function valoresDaSimulacao(s: SimulacaoDePlanos): string[] {
  return [
    s.centsTotalCents,
    s.premiumMensalCents,
    s.premiumAnualEquivalenteMensalCents,
    ...s.centsDetalhe.flatMap((d) => [d.precoCents, d.subtotalCents]),
  ].map(formatCents);
}
