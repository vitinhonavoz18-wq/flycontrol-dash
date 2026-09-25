/**
 * "Impulsionar no FlyDelivery" — as regras que o painel mostra.
 *
 * MODELO PÓS-PAGO: a loja escolhe o produto e o período, vê o preço e
 * confirma. O anúncio entra no ar na hora (ou na data agendada) e o valor vai
 * como uma linha a mais na PRÓXIMA fatura do FlyControl. Nada de PIX, cartão
 * ou checkout na hora.
 *
 * Quem MANDA é o banco (migração `20260926140000_impulsionamento_pos_pago.sql`):
 * preço do pacote, limite de 3 ao mesmo tempo, produto da loja, foto, e a
 * cobrança que nasce junto com o anúncio. Aqui só se traduz para o lojista o
 * que o banco decide.
 */

/** O status que o banco calcula na hora (`flydelivery_campaign_display_status`). */
export type StatusDeCampanha =
  "pending" | "scheduled" | "active" | "paused" | "finished" | "cancelled";

export const LIMITE_DE_CAMPANHAS = 3;

export const ROTULO_DO_STATUS: Record<StatusDeCampanha, string> = {
  // Só campanhas antigas (antes do pós-pago) passam por aprovação.
  pending: "Aguardando aprovação",
  scheduled: "Programado",
  active: "Ativo",
  paused: "Pausado",
  finished: "Finalizado",
  cancelled: "Cancelado",
};

/** Cor do selo de cada status (classes do Tailwind). */
export const COR_DO_STATUS: Record<StatusDeCampanha, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  scheduled: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  active: "bg-success/15 text-success",
  paused: "bg-muted text-muted-foreground",
  finished: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

export function rotuloDoStatus(status: string): string {
  return ROTULO_DO_STATUS[status as StatusDeCampanha] ?? status;
}

/** Campanha que ainda conta no limite de 3 (a que não acabou nem foi cancelada). */
export function contaNoLimite(status: string): boolean {
  return (
    status === "pending" || status === "scheduled" || status === "active" || status === "paused"
  );
}

/**
 * Taxa de cliques: cliques ÷ impressões × 100, com uma casa.
 * Sem impressão não há taxa — mostrar "0%" daria a entender que ninguém se
 * interessou, quando na verdade ninguém viu ainda.
 */
export function taxaDeCliques(impressoes: number, cliques: number): string {
  if (!(impressoes > 0)) return "—";
  return `${((cliques / impressoes) * 100).toFixed(1).replace(".", ",")}%`;
}

type ProdutoParaImpulsionar = {
  active: boolean | null;
  available: boolean | null;
  name: string | null;
  image_url: string | null;
  price: number | null;
};

/**
 * Por que este produto não pode ser impulsionado — ou `null` se pode.
 * Mesma regra do banco (`flydelivery_campaign_issues_of`); o banco confere de
 * novo na hora de criar.
 */
export function motivoParaNaoImpulsionar(
  produto: ProdutoParaImpulsionar,
  lojaNoFlyDelivery: boolean,
): string | null {
  if (!lojaNoFlyDelivery) {
    return "Ligue “Aparecer no aplicativo” na aba Presença para impulsionar produtos.";
  }
  if (produto.active === false) return "Produto desativado no cardápio.";
  if (produto.available === false) return "Produto marcado como indisponível hoje.";
  if (!produto.name?.trim()) return "Produto sem nome.";
  if (!/^https?:\/\//i.test(produto.image_url?.trim() ?? "")) {
    return "Adicione uma imagem para impulsionar este produto.";
  }
  if (!(Number(produto.price) > 0)) {
    return "Produto sem preço próprio (ex.: sabor cobrado pelo tamanho).";
  }
  return null;
}

/** Centavos → "R$ 0,00". Dinheiro é guardado em centavos inteiros. */
export function reaisDeCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Data curta e hora, para as listas: "25/09 14:30". */
export function dataCurta(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
}

/** Data com ano, para resumo e histórico: "25/09/2026". */
export function dataLonga(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Fim do impulsionamento: começo + N dias corridos (a mesma conta do banco). */
export function terminoDoImpulso(inicio: Date, dias: number): Date {
  return new Date(inicio.getTime() + dias * 86_400_000);
}

/** "3 dias", "1 dia", "termina hoje". */
export function diasRestantesTexto(dias: number): string {
  if (dias <= 0) return "termina hoje";
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

// --- Cobrança --------------------------------------------------------------

/** Situação da cobrança de um impulsionamento (tabela `billing_addon_charges`). */
export type StatusFinanceiro = "pending_invoice" | "invoiced" | "paid" | "cancelled" | "refunded";

export const ROTULO_FINANCEIRO: Record<StatusFinanceiro, string> = {
  pending_invoice: "Na próxima fatura",
  invoiced: "Faturado",
  paid: "Pago",
  cancelled: "Não cobrado",
  refunded: "Estornado",
};

export const COR_FINANCEIRO: Record<StatusFinanceiro, string> = {
  pending_invoice: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  invoiced: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  paid: "bg-success/15 text-success",
  cancelled: "bg-muted text-muted-foreground",
  refunded: "bg-muted text-muted-foreground",
};

/**
 * O que mostrar na coluna "Status financeiro". Sem cobrança nenhuma (pacote
 * grátis ou campanha de antes do pós-pago) é "Sem custo" — não "Pago", que
 * daria a entender que a loja pagou algo.
 */
export function rotuloFinanceiro(status: string | null, numeroDaFatura?: string | null): string {
  if (!status) return "Sem custo";
  if (status === "invoiced" && numeroDaFatura) return `Na fatura ${numeroDaFatura}`;
  return ROTULO_FINANCEIRO[status as StatusFinanceiro] ?? status;
}

export function corFinanceira(status: string | null): string {
  return (status && COR_FINANCEIRO[status as StatusFinanceiro]) || "bg-muted text-muted-foreground";
}

/**
 * Texto digitado pelo administrador ("60", "60,00", "1.234,56", "R$ 105")
 * → centavos inteiros. `null` se não for um valor válido.
 *
 * Nunca passa por número com casas decimais: "0,1 + 0,2" em ponto flutuante
 * não dá 0,3, e em cobrança um centavo errado é reclamação na certa.
 */
export function centavosDeTexto(texto: string): number | null {
  const limpo = texto.replace(/R\$/i, "").replace(/\s/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(limpo)) return null;
  const [inteiro, fracao = ""] = limpo.replace(/\./g, "").split(",");
  const centavos = Number(inteiro) * 100 + Number(fracao.padEnd(2, "0"));
  return Number.isSafeInteger(centavos) ? centavos : null;
}

/** Centavos → texto para o campo de edição: 6000 → "60,00". */
export function textoDeCentavos(centavos: number): string {
  const reais = Math.floor(centavos / 100);
  return `${reais},${String(centavos % 100).padStart(2, "0")}`;
}

/**
 * Identificador único de UMA contratação. Toque duplo, rede lenta que reenvia,
 * página recarregada: tudo chega com a mesma chave e o banco devolve o
 * contrato que já existe em vez de criar (e cobrar) outro.
 */
export function novaChaveDeContratacao(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** O resumo que `flydelivery_boost_overview` devolve. */
export type ResumoDoImpulsionamento = {
  can_contract: boolean;
  subscription_status: string | null;
  cycle_start: string | null;
  cycle_end: string | null;
  cycle_type: string | null;
  next_invoice_at: string | null;
  max_schedule_days: number;
  refund_if_not_started: boolean;
  pending_amount_cents: number;
  month_invested_cents: number;
  month_days_contracted: number;
  month_products: number;
  active_now: number;
  scheduled: number;
  month_impressions: number;
  month_clicks: number;
  month_orders: number;
  month_orders_revenue_cents: number;
};

/** Em qual fatura o valor entra, em português. */
export function quandoEntraNaFatura(
  resumo: Pick<ResumoDoImpulsionamento, "next_invoice_at" | "cycle_type" | "cycle_end"> | null,
): string {
  if (resumo?.next_invoice_at) return `na fatura de ${dataLonga(resumo.next_invoice_at)}`;
  if (resumo?.cycle_type === "free_trial") {
    return resumo.cycle_end
      ? `na primeira fatura depois do período grátis (que termina em ${dataLonga(resumo.cycle_end)})`
      : "na primeira fatura depois do período grátis";
  }
  return "na próxima fatura";
}

/**
 * Por que a loja não pode contratar agora — ou `null` se pode. Mesma regra
 * de `flydelivery_contract_boost`; o banco confere de novo ao confirmar.
 */
export function motivoParaNaoContratar(
  resumo: Pick<ResumoDoImpulsionamento, "can_contract" | "subscription_status"> | null,
): string | null {
  if (!resumo || resumo.can_contract) return null;
  switch (resumo.subscription_status) {
    case "past_due":
    case "suspended":
      return "Há uma fatura do FlyControl em aberto. Regularize para voltar a impulsionar.";
    case "free_trial":
      return "Impulsionar fica disponível depois do período grátis.";
    case "pending_activation":
    case "pending_payment":
      return "Ative seu plano FlyControl para impulsionar produtos.";
    default:
      return "Para impulsionar, sua loja precisa de um plano FlyControl ativo.";
  }
}

/** Erro do banco ao contratar → frase para o lojista. */
export function mensagemDoContrato(error: { code?: string; message?: string }): string {
  const msg = error.message ?? "";
  if (msg.includes("Limite de 3")) {
    return "Sua loja já tem 3 impulsionamentos ao mesmo tempo. Espere um terminar (ou cancele um) para contratar outro.";
  }
  if (msg.includes("já tem uma campanha")) {
    return "Este produto já está impulsionado nesse período. Escolha outra data de início.";
  }
  if (msg.includes("não elegível")) {
    return "Este produto não cumpre os requisitos para impulsionar (foto, preço e disponível no cardápio).";
  }
  if (error.code === "42501" && !msg) return "Sem permissão para esta loja.";
  return msg || "Não foi possível contratar agora. Tente de novo.";
}
