/**
 * "Impulsionar no FlyDelivery" — as regras que o painel mostra.
 *
 * Como na vitrine, quem MANDA é o banco (migração
 * `20260925120000_impulsionar_campanhas.sql` no repositório FlyDelivery):
 * limite de 3 campanhas, produto da loja, foto, aprovação pelo administrador.
 * Aqui só se traduz para o lojista o que o banco decide.
 */

/** O status que o banco calcula na hora (`flydelivery_campaign_display_status`). */
export type StatusDeCampanha =
  "pending" | "scheduled" | "active" | "paused" | "finished" | "cancelled";

export const LIMITE_DE_CAMPANHAS = 3;

export const ROTULO_DO_STATUS: Record<StatusDeCampanha, string> = {
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
