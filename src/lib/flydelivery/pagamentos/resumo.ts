/**
 * Os números das telas financeiras do Pix do FlyDelivery.
 *
 * TRÊS COISAS DIFERENTES QUE NÃO PODEM SE MISTURAR NA TELA
 *
 *   1. VALOR DEVIDO (previsto): o que a divisão combinada manda para a loja
 *      em cada venda paga — calculado aqui, com a regra de split.ts.
 *   2. VALOR LIQUIDADO: o que a SyncPay efetivamente depositou. O FlyDelivery
 *      NÃO consulta isso; a tela diz "confira na sua conta SyncPay".
 *   3. SALDO DISPONÍVEL PARA SAQUE: idem — só a SyncPay sabe. A tela nunca
 *      afirma que um valor está disponível.
 *
 * Tarifa da SyncPay só entra na conta quando a própria SyncPay informou. Sem
 * isso, "líquido" aparece como "depende da tarifa", e não como um número
 * inventado.
 */

import { formatarCentavos } from "./split";

export type SituacaoDoPagamento =
  | "criando"
  | "pendente"
  | "pago"
  | "falhou"
  | "incerto"
  | "expirado"
  | "estornado"
  | "em_disputa"
  | "divergente"
  | "duplicado";

export type SituacaoDaConta =
  "nao_configurada" | "aguardando_verificacao" | "ativa" | "recusada" | "suspensa";

export type QuemPagaATarifa = "nao_definido" | "plataforma" | "estabelecimento" | "proporcional";

export const ROTULO_DO_PAGAMENTO: Record<SituacaoDoPagamento, string> = {
  criando: "Gerando Pix",
  pendente: "Aguardando pagamento",
  pago: "Pago",
  falhou: "Não concluído",
  incerto: "Em verificação",
  expirado: "Expirado",
  estornado: "Estornado",
  em_disputa: "Em contestação (MED)",
  divergente: "Divergente — em conferência",
  duplicado: "Pago em duplicidade — devolver",
};

export const ROTULO_DA_CONTA: Record<SituacaoDaConta, string> = {
  nao_configurada: "Não configurada",
  aguardando_verificacao: "Aguardando verificação",
  ativa: "Ativa",
  recusada: "Recusada",
  suspensa: "Suspensa",
};

export const EXPLICACAO_DA_CONTA: Record<SituacaoDaConta, string> = {
  nao_configurada:
    "Informe o Client ID da sua conta SyncPay. Sem ela, os clientes do aplicativo continuam pagando na entrega.",
  aguardando_verificacao:
    "Recebemos o seu Client ID. A equipe FlyDelivery confere com a SyncPay antes de liberar o Pix no aplicativo.",
  ativa: "Conta conferida. Você pode oferecer o Pix pelo aplicativo.",
  recusada:
    "A conta não pôde ser usada para receber pelo split. Veja a observação e informe outra conta.",
  suspensa: "O recebimento pelo aplicativo está suspenso. Fale com a equipe FlyDelivery.",
};

export const ROTULO_DA_TARIFA: Record<QuemPagaATarifa, string> = {
  nao_definido: "Não definido no contrato",
  plataforma: "Paga pela plataforma",
  estabelecimento: "Descontada do estabelecimento",
  proporcional: "Dividida proporcionalmente",
};

export function rotuloDoPagamento(status: string): string {
  return ROTULO_DO_PAGAMENTO[status as SituacaoDoPagamento] ?? status;
}

export function rotuloDaConta(status: string | null | undefined): string {
  return ROTULO_DA_CONTA[(status ?? "nao_configurada") as SituacaoDaConta] ?? String(status);
}

export type LinhaDePagamento = {
  id: string;
  store_id: string;
  status: string;
  created_at: string;
  paid_at?: string | null;
  amount_cents: number;
  fee_percent: number;
  platform_amount_cents: number;
  store_amount_cents: number;
  gateway_fee_cents: number | null;
  needs_reconciliation: boolean;
  reconciliation_note?: string | null;
  order_number?: number | null;
  store_name?: string | null;
};

type Soma = { quantidade: number; centavos: number };
const vazia = (): Soma => ({ quantidade: 0, centavos: 0 });

export type Resumo = {
  confirmadas: Soma;
  pendentes: Soma;
  comErro: Soma;
  estornosEAjustes: Soma;
  comissaoPlataforma: number;
  repasseBrutoLoja: number;
  /** null = a SyncPay não informou tarifa de nenhuma venda do período. */
  tarifasInformadas: number | null;
  /** Vendas pagas sem tarifa informada (o líquido delas não é conhecido). */
  vendasSemTarifa: number;
  pendenciasDeConciliacao: number;
};

const PENDENTES = new Set(["criando", "pendente", "incerto"]);
const ERROS = new Set(["falhou", "divergente"]);
const AJUSTES = new Set(["estornado", "em_disputa", "duplicado"]);

export function resumirPagamentos(linhas: LinhaDePagamento[]): Resumo {
  const r: Resumo = {
    confirmadas: vazia(),
    pendentes: vazia(),
    comErro: vazia(),
    estornosEAjustes: vazia(),
    comissaoPlataforma: 0,
    repasseBrutoLoja: 0,
    tarifasInformadas: null,
    vendasSemTarifa: 0,
    pendenciasDeConciliacao: 0,
  };
  const somar = (s: Soma, centavos: number) => {
    s.quantidade += 1;
    s.centavos += centavos;
  };

  for (const l of linhas) {
    if (l.needs_reconciliation) r.pendenciasDeConciliacao += 1;
    if (l.status === "pago") {
      somar(r.confirmadas, l.amount_cents);
      r.comissaoPlataforma += l.platform_amount_cents;
      r.repasseBrutoLoja += l.store_amount_cents;
      if (l.gateway_fee_cents === null || l.gateway_fee_cents === undefined) {
        r.vendasSemTarifa += 1;
      } else {
        r.tarifasInformadas = (r.tarifasInformadas ?? 0) + l.gateway_fee_cents;
      }
    } else if (PENDENTES.has(l.status)) {
      somar(r.pendentes, l.amount_cents);
    } else if (ERROS.has(l.status)) {
      somar(r.comErro, l.amount_cents);
    } else if (AJUSTES.has(l.status)) {
      somar(r.estornosEAjustes, l.amount_cents);
    }
  }
  return r;
}

/**
 * Líquido previsto da loja. Só vira número quando dá para saber:
 *  - tarifa paga pela plataforma → líquido = repasse bruto;
 *  - tarifa descontada da loja e informada em TODAS as vendas → repasse − tarifa;
 *  - qualquer outro caso → null ("depende da tarifa da SyncPay").
 */
export function liquidoPrevistoDaLoja(resumo: Resumo, quemPaga: QuemPagaATarifa): number | null {
  if (quemPaga === "plataforma") return resumo.repasseBrutoLoja;
  if (quemPaga === "estabelecimento" && resumo.vendasSemTarifa === 0) {
    return resumo.repasseBrutoLoja - (resumo.tarifasInformadas ?? 0);
  }
  return null;
}

export type LinhaPorLoja = {
  storeId: string;
  loja: string;
  resumo: Resumo;
};

export function resumirPorLoja(linhas: LinhaDePagamento[]): LinhaPorLoja[] {
  const grupos = new Map<string, LinhaDePagamento[]>();
  for (const l of linhas) {
    const lista = grupos.get(l.store_id) ?? [];
    lista.push(l);
    grupos.set(l.store_id, lista);
  }
  return [...grupos.entries()]
    .map(([storeId, lista]) => ({
      storeId,
      loja: lista[0].store_name ?? storeId.slice(0, 8),
      resumo: resumirPagamentos(lista),
    }))
    .sort((a, b) => b.resumo.confirmadas.centavos - a.resumo.confirmadas.centavos);
}

// ------------------------------------------------------------ exportação --

function celula(valor: unknown): string {
  let texto = valor === null || valor === undefined ? "" : String(valor);
  // Planilha executa célula que começa com = + - @ como fórmula. Um nome de
  // loja "=HYPERLINK(...)" viraria link malicioso no Excel do administrador.
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function reaisParaPlanilha(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "";
  return formatarCentavos(centavos).replace("R$ ", "").replace(/\./g, "");
}

/** CSV com ";" e vírgula decimal — abre direto no Excel em português. */
export function paraCsv(linhas: LinhaDePagamento[]): string {
  const cabecalho = [
    "data",
    "loja",
    "pedido",
    "situacao",
    "valor_cobrado",
    "comissao_percentual",
    "plataforma_bruto",
    "loja_bruto",
    "tarifa_syncpay",
    "pendente_de_conciliacao",
    "observacao",
  ];
  const corpo = linhas.map((l) =>
    [
      l.created_at,
      l.store_name ?? l.store_id,
      l.order_number ?? "",
      rotuloDoPagamento(l.status),
      reaisParaPlanilha(l.amount_cents),
      l.fee_percent,
      reaisParaPlanilha(l.platform_amount_cents),
      reaisParaPlanilha(l.store_amount_cents),
      reaisParaPlanilha(l.gateway_fee_cents),
      l.needs_reconciliation ? "sim" : "nao",
      l.reconciliation_note ?? "",
    ]
      .map(celula)
      .join(";"),
  );
  return [cabecalho.join(";"), ...corpo].join("\r\n");
}
