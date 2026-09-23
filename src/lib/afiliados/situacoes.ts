/**
 * Nome e cor de cada situação que aparece no portal. Um lugar só, para a
 * tabela, o cartão do celular e o filtro dizerem a mesma palavra.
 *
 * Os tons seguem a marca: laranja para "atenção/andamento", azul para
 * "informação", verde só para dinheiro que já é do afiliado, vermelho só
 * para o que deu errado.
 */

import type {
  PeriodoDoGrafico,
  SerieDoAfiliado,
  SituacaoDaComissao,
  SituacaoDaLoja,
  SituacaoDoSaque,
} from "./portal";

export type Tom = "laranja" | "azul" | "verde" | "vermelho" | "cinza";

export const SITUACAO_DA_LOJA: Record<
  SituacaoDaLoja,
  { rotulo: string; tom: Tom; explica: string }
> = {
  CADASTRADO: {
    rotulo: "Cadastrado",
    tom: "azul",
    explica:
      "Criou a conta e ainda não virou cliente pagante (período grátis ou aguardando ativação).",
  },
  ATIVO: { rotulo: "Ativo", tom: "verde", explica: "Cliente pagante, gerando comissão." },
  INADIMPLENTE: {
    rotulo: "Inadimplente",
    tom: "laranja",
    explica: "Cobrança em atraso. A comissão só nasce quando o pagamento entra.",
  },
  CANCELADO: {
    rotulo: "Cancelado",
    tom: "cinza",
    explica: "Loja encerrada ou assinatura cancelada.",
  },
};

export const SITUACAO_DA_COMISSAO: Record<SituacaoDaComissao, { rotulo: string; tom: Tom }> = {
  pending: { rotulo: "Pendente", tom: "laranja" },
  available: { rotulo: "Disponível", tom: "verde" },
  requested: { rotulo: "No repasse", tom: "azul" },
  paid: { rotulo: "Paga", tom: "cinza" },
  reversed: { rotulo: "Estornada", tom: "vermelho" },
};

/**
 * O repasse tem quatro situações no banco; a pessoa vê quatro etapas.
 * "Montado" é quando o robô separa o saldo no dia 10 ou 20; "em
 * conferência" é o tempo em que a equipe confere antes de mandar o Pix. No
 * banco os dois são o mesmo `requested` — a diferença é só de leitura.
 */
export const SITUACAO_DO_SAQUE: Record<SituacaoDoSaque, { rotulo: string; tom: Tom }> = {
  requested: { rotulo: "Em conferência", tom: "laranja" },
  approved: { rotulo: "Aprovado", tom: "azul" },
  paid: { rotulo: "Pago", tom: "verde" },
  rejected: { rotulo: "Recusado", tom: "vermelho" },
};

export type EtapaDoSaque = {
  rotulo: string;
  quando: string | null;
  feita: boolean;
  erro?: boolean;
};

export function etapasDoSaque(s: {
  situacao: SituacaoDoSaque;
  pedido_em: string;
  aprovado_em: string | null;
  pago_em: string | null;
  recusado_em: string | null;
}): EtapaDoSaque[] {
  const etapas: EtapaDoSaque[] = [
    { rotulo: "Montado", quando: s.pedido_em, feita: true },
    { rotulo: "Conferência", quando: null, feita: true },
  ];
  if (s.situacao === "rejected") {
    etapas.push({ rotulo: "Recusado", quando: s.recusado_em, feita: true, erro: true });
    return etapas;
  }
  etapas.push({ rotulo: "Aprovado", quando: s.aprovado_em, feita: Boolean(s.aprovado_em) });
  etapas.push({ rotulo: "Pago", quando: s.pago_em, feita: Boolean(s.pago_em) });
  return etapas;
}

export const CLASSES_DO_TOM: Record<Tom, string> = {
  laranja: "border-[#ff5a00]/30 bg-[#ff5a00]/10 text-[#ff8a3d]",
  azul: "border-[#008cff]/30 bg-[#008cff]/10 text-[#5cb8ff]",
  verde: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  vermelho: "border-red-500/30 bg-red-500/10 text-red-400",
  cinza: "border-white/15 bg-white/5 text-white/60",
};

/** Os recortes de tempo do gráfico e do filtro de comissões. */
export const PERIODOS: { dias: PeriodoDoGrafico; rotulo: string }[] = [
  { dias: 7, rotulo: "7 dias" },
  { dias: 30, rotulo: "30 dias" },
  { dias: 90, rotulo: "3 meses" },
  { dias: 180, rotulo: "6 meses" },
  { dias: 365, rotulo: "12 meses" },
];

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-09-23" → "23/09" (dia/semana) ou "set/26" (mês). Sem fuso: é uma data, não um horário. */
export function rotuloDoPonto(inicio: string, passo: SerieDoAfiliado["passo"]): string {
  const [a, m, d] = inicio.slice(0, 10).split("-");
  if (passo === "month") return `${MESES[Number(m) - 1]}/${a.slice(2)}`;
  return `${d}/${m}`;
}
