import type { Order } from "@/types/order";

/**
 * O pedido de demonstração da última etapa do guia.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ELE NUNCA É GRAVADO NO BANCO. E ISSO NÃO É PREGUIÇA.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * A tabela `orders` tem OITO gatilhos pendurados nela. Um pedido de mentira
 * gravado ali de verdade dispararia, de uma vez só:
 *
 *   - `trg_orders_record_usage` → COBRANÇA. No plano CENTS, o lojista pagaria
 *     pelo pedido de treino;
 *   - `trg_marketing_capture_customer` → um cliente inventado entraria na
 *     lista de marketing da loja, e receberia campanha;
 *   - `trg_club_on_order_delivered` → pontos de fidelidade para esse cliente
 *     que não existe;
 *   - `inventory_ao_mudar_status_do_pedido` → BAIXA DE ESTOQUE. A loja
 *     perderia produto do inventário por causa de um treino.
 *
 * Fora isso: relatório financeiro com faturamento falso, impressão na cozinha
 * e mensagem de status indo para um telefone que não existe.
 *
 * É o treinamento de incêndio feito com fogo de verdade dentro do prédio.
 *
 * Por isso o pedido de demonstração vive SÓ na tela: ele é um `Order` comum
 * na lista que o painel já tem na memória, e o quadro de pedidos o trata como
 * qualquer outro — inclusive o arrastar e soltar de verdade. O que ele não
 * faz é existir fora daquela aba aberta.
 *
 * COMO O RESTO DO SISTEMA SABE QUE ELE É DE MENTIRA
 *
 * Pelo `id`, que é fixo e reconhecível. `ehPedidoDeDemonstracao` é a única
 * pergunta que existe, e quem grava status no banco a faz antes de gravar.
 */

/** O identificador do pedido de treino. Fixo, para ser reconhecível. */
export const ID_DO_PEDIDO_DE_DEMONSTRACAO = "guia-pedido-de-demonstracao";

export function ehPedidoDeDemonstracao(id: string | null | undefined): boolean {
  return id === ID_DO_PEDIDO_DE_DEMONSTRACAO;
}

/**
 * Monta o pedido de treino usando o cardápio REAL da loja.
 *
 * Um pedido de treino com "Produto Exemplo" ensina a mexer num sistema
 * genérico. Com o X-Salada que o lojista acabou de cadastrar, ele reconhece a
 * própria loja na tela — e é aí que a ficha cai de que aquilo ali é o painel
 * dele, não uma demonstração de vendedor.
 */
export function montarPedidoDeDemonstracao(
  tenantId: string,
  produto: { name: string; price: number } | null,
): Order {
  const item = produto ?? { name: "Item de demonstração", price: 30 };
  const agora = new Date().toISOString();

  return {
    id: ID_DO_PEDIDO_DE_DEMONSTRACAO,
    // Número de pedido zero: nenhum pedido de verdade usa o zero, então ele
    // não colide com a numeração da loja nem "rouba" um número da sequência.
    order_number: 0,
    tenant_id: tenantId,
    customer_name: "Pedido de teste",
    // Telefone claramente inválido de propósito: se algum dia este pedido
    // escapar para uma automação, não há para onde a mensagem ir.
    customer_phone: "00000000000",
    customer_address: "Este pedido é só para você treinar",
    neighborhood: "Demonstração",
    items: [{ name: item.name, qty: 1, price: item.price }],
    total: item.price,
    delivery_fee: 0,
    payment_method: "Dinheiro",
    change_for: null,
    notes: "Pedido de demonstração do guia de configuração. Não é real.",
    status: "novo",
    created_at: agora,
    updated_at: agora,
  } as Order;
}

/** A ordem que o guia ensina, e o que o personagem diz em cada parada. */
export const NARRACAO_DO_TREINO: Readonly<
  Record<string, { titulo: string; descricao: string; emocao: "orientando" | "sucesso" }>
> = {
  novo: {
    titulo: "Seu pedido de teste chegou!",
    descricao:
      "É assim que todo pedido aparece. Arraste o card para 'Em preparo' para avisar a cozinha que você aceitou.",
    emocao: "orientando",
  },
  preparando: {
    titulo: "Aceito. Agora está na cozinha.",
    descricao: "Quando ficar pronto e sair com o entregador, arraste para 'Saiu para entrega'.",
    emocao: "orientando",
  },
  saiu: {
    titulo: "Saiu para entrega.",
    descricao:
      "Falta o último passo: arraste até a faixa verde embaixo para finalizar. O pedido sai do quadro e vai para o histórico.",
    emocao: "orientando",
  },
  entregue: {
    titulo: "Pronto! Esse é o caminho de todo pedido.",
    descricao: "Novo pedido, em preparo, saiu para entrega, finalizado.",
    emocao: "sucesso",
  },
};
