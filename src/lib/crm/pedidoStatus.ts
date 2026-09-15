/**
 * A situação do pedido, dita do jeito que o cliente entende.
 *
 * O sistema guarda "saiu". O cliente não quer saber de "saiu" — ele quer ouvir
 * "já saiu para entrega, chega logo". É a diferença entre o painel da cozinha
 * e a conversa no WhatsApp: mesma informação, língua diferente.
 *
 * PEDIDO APAGADO NÃO EXISTE PARA O CLIENTE. `deleted` é lixeira do lojista,
 * não situação de pedido. Contar isso ao cliente seria mostrar a ele a
 * bagunça de dentro da loja.
 */

export type SituacaoPedido = "novo" | "preparando" | "saiu" | "entregue" | "cancelado";

/** O que o cliente ouve. */
export const FALA_DO_CLIENTE: Record<SituacaoPedido, string> = {
  novo: "recebido, a cozinha já vai começar",
  preparando: "em preparo agora",
  saiu: "saiu para entrega",
  entregue: "entregue",
  cancelado: "cancelado",
};

/** O que o lojista vê no cartão dentro da conversa. */
export const ROTULO_PAINEL: Record<SituacaoPedido, string> = {
  novo: "Recebido",
  preparando: "Em preparo",
  saiu: "Saiu para entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

/** Pedido que ainda está andando: dá para mexer nele. */
export const EM_ANDAMENTO: SituacaoPedido[] = ["novo", "preparando", "saiu"];

/** Situações que o lojista pode apagar da vista do cliente. */
const ESCONDIDAS = ["deleted", "removed", "excluido"];

export function situacaoValida(status: unknown): SituacaoPedido | null {
  const s = String(status ?? "")
    .trim()
    .toLowerCase();
  if (ESCONDIDAS.includes(s)) return null;
  return (Object.keys(FALA_DO_CLIENTE) as SituacaoPedido[]).includes(s as SituacaoPedido)
    ? (s as SituacaoPedido)
    : null;
}

export function emAndamento(status: unknown): boolean {
  const s = situacaoValida(status);
  return s !== null && EM_ANDAMENTO.includes(s);
}

/**
 * Se ainda dá para a IA mexer neste pedido.
 *
 * SÓ ENQUANTO A COZINHA NÃO COMEÇOU. Depois que o pedido entrou em preparo,
 * mudar o que vai dentro dele é mandar jogar comida fora — e ninguém avisa a
 * cozinha por mensagem de WhatsApp. A partir daí, quem resolve é gente.
 */
export function podeSerAlteradoPelaIa(status: unknown): boolean {
  return situacaoValida(status) === "novo";
}

/** A frase pronta, para a IA ler ao cliente. */
export function frasePara(numero: number | null, status: unknown, quando: string | null): string {
  const s = situacaoValida(status);
  const qual = numero ? `Pedido #${numero}` : "Seu pedido";
  if (!s) return `${qual}: não encontrei a situação. Vou confirmar com a equipe.`;

  const data = quando
    ? ` (feito em ${new Date(quando).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })})`
    : "";

  return `${qual}: ${FALA_DO_CLIENTE[s]}${data}.`;
}
