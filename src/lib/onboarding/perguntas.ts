/**
 * As perguntas do "Vamos preparar seu FlyControl".
 *
 * ESTE ARQUIVO É A ÚNICA LISTA DE PERGUNTAS E RESPOSTAS VÁLIDAS
 *
 * A tela desenha o que está aqui, e o servidor confere o que chega contra o
 * que está aqui. Não existe uma segunda lista em lugar nenhum: se houvesse, um
 * dia a tela ofereceria uma opção que o servidor recusa, ou pior, o servidor
 * aceitaria qualquer coisa que alguém digitasse na requisição.
 *
 * É o cardápio impresso e a comanda da cozinha serem o mesmo papel.
 *
 * COMO ADICIONAR UMA PERGUNTA
 *
 * Basta acrescentar um item nesta lista. A tela, a barra de progresso, o
 * "voltar", a validação do servidor e o salvamento etapa a etapa passam a
 * funcionar sozinhos — não existe `if (etapa === 3)` espalhado pelo sistema.
 */

/** Identificador de cada etapa. Também é a chave da resposta salva. */
export type IdDaEtapa =
  | "tipo_de_negocio"
  | "canais_de_pedido"
  | "volume_mensal"
  | "modelo_de_atendimento"
  | "mesas_e_comandas"
  | "tamanho_da_equipe"
  | "quem_vai_usar"
  | "cardapio_existente"
  | "como_trazer_o_cardapio"
  | "organizacao_atual"
  | "maior_desafio"
  | "objetivo"
  | "entregas"
  | "formas_de_pagamento";

export type Opcao = {
  /** O que fica gravado. Nunca muda depois de estar no ar. */
  valor: string;
  rotulo: string;
  /** Emoji do card. Enfeite: nada depende dele. */
  icone?: string;
  /** Abre um campo de texto para a pessoa descrever. */
  pedeTexto?: boolean;
};

export type Respostas = Partial<Record<IdDaEtapa, string[]>> & {
  /** O que a pessoa escreveu quando escolheu "Outro". */
  textoLivre?: Partial<Record<IdDaEtapa, string>>;
};

export type Etapa = {
  id: IdDaEtapa;
  pergunta: string;
  /** Uma linha de ajuda embaixo da pergunta. */
  explicacao?: string;
  multipla: boolean;
  opcoes: readonly Opcao[];
  /**
   * Quando esta etapa aparece. Sem isso, ela sempre aparece.
   *
   * É aqui que mora a inteligência: quem não faz entrega não é perguntado
   * sobre entregadores, e quem não tem cardápio não é perguntado de onde
   * importar.
   */
  aparece?: (r: Respostas) => boolean;
};

const marcou = (r: Respostas, etapa: IdDaEtapa, valor: string) => (r[etapa] ?? []).includes(valor);

export const ETAPAS: readonly Etapa[] = [
  {
    id: "tipo_de_negocio",
    pergunta: "Qual é o seu tipo de estabelecimento?",
    explicacao: "Usamos isso para já deixar o cardápio no formato que combina com você.",
    multipla: false,
    opcoes: [
      { valor: "hamburgueria", rotulo: "Hamburgueria", icone: "🍔" },
      { valor: "pizzaria", rotulo: "Pizzaria", icone: "🍕" },
      { valor: "restaurante", rotulo: "Restaurante", icone: "🍽️" },
      { valor: "japones", rotulo: "Japonês", icone: "🍣" },
      { valor: "marmitaria", rotulo: "Marmitaria", icone: "🥡" },
      { valor: "bar", rotulo: "Bar / Adega", icone: "🍻" },
      { valor: "acai", rotulo: "Açaí / Sorveteria", icone: "🍧" },
      { valor: "doceria", rotulo: "Doceria", icone: "🍰" },
      { valor: "cafeteria", rotulo: "Cafeteria", icone: "☕" },
      { valor: "mercado", rotulo: "Mercado / Conveniência", icone: "🛒" },
      { valor: "padaria", rotulo: "Padaria", icone: "🥐" },
      { valor: "outro", rotulo: "Outro", icone: "✨", pedeTexto: true },
    ],
  },
  {
    id: "canais_de_pedido",
    pergunta: "Por onde seus clientes costumam fazer pedidos?",
    explicacao: "Pode marcar mais de um.",
    multipla: true,
    opcoes: [
      { valor: "whatsapp", rotulo: "WhatsApp", icone: "💬" },
      { valor: "instagram", rotulo: "Instagram", icone: "📷" },
      { valor: "telefone", rotulo: "Telefone", icone: "📞" },
      { valor: "cardapio_proprio", rotulo: "Meu próprio cardápio/site", icone: "🌐" },
      { valor: "ifood", rotulo: "iFood", icone: "🛵" },
      { valor: "outros_marketplaces", rotulo: "Outros marketplaces", icone: "🏬" },
      { valor: "balcao", rotulo: "Balcão", icone: "🧾" },
      { valor: "mesa", rotulo: "Mesa / Comanda", icone: "🪑" },
    ],
  },
  {
    id: "volume_mensal",
    pergunta: "Quantos pedidos próprios vocês recebem normalmente por mês?",
    explicacao:
      "Considere pedidos fora dos marketplaces: WhatsApp, telefone, site próprio e balcão.",
    multipla: false,
    opcoes: [
      { valor: "comecando", rotulo: "Estou começando agora", icone: "🌱" },
      { valor: "0_100", rotulo: "Até 100", icone: "📦" },
      { valor: "101_250", rotulo: "101 a 250", icone: "📦" },
      { valor: "251_500", rotulo: "251 a 500", icone: "📦" },
      { valor: "501_1000", rotulo: "501 a 1.000", icone: "🚚" },
      { valor: "1000_mais", rotulo: "Mais de 1.000", icone: "🚀" },
    ],
  },
  {
    id: "modelo_de_atendimento",
    pergunta: "Como funciona seu atendimento?",
    explicacao: "Pode marcar mais de um.",
    multipla: true,
    opcoes: [
      { valor: "delivery", rotulo: "Delivery", icone: "🛵" },
      { valor: "retirada", rotulo: "Retirada no estabelecimento", icone: "🛍️" },
      { valor: "balcao", rotulo: "Balcão", icone: "🧾" },
      { valor: "mesas", rotulo: "Atendimento em mesas", icone: "🪑" },
      { valor: "encomendas", rotulo: "Pedidos antecipados / encomendas", icone: "📅" },
    ],
  },
  {
    id: "mesas_e_comandas",
    pergunta: "Você utiliza mesas, comandas ou garçons?",
    multipla: false,
    aparece: (r) => marcou(r, "modelo_de_atendimento", "mesas"),
    opcoes: [
      { valor: "so_mesas", rotulo: "Sim, utilizo mesas", icone: "🪑" },
      { valor: "mesas_e_garcons", rotulo: "Utilizo mesas e garçons", icone: "🧑‍🍳" },
      { valor: "comandas", rotulo: "Utilizo comandas", icone: "🧾" },
      { valor: "tudo", rotulo: "Utilizo tudo isso", icone: "✅" },
      { valor: "pretendo", rotulo: "Ainda não, mas pretendo utilizar", icone: "🕒" },
    ],
  },
  {
    id: "tamanho_da_equipe",
    pergunta: "Quantas pessoas trabalham na operação?",
    multipla: false,
    opcoes: [
      { valor: "so_eu", rotulo: "Só eu", icone: "🙋" },
      { valor: "2_5", rotulo: "2 a 5", icone: "👥" },
      { valor: "6_10", rotulo: "6 a 10", icone: "👥" },
      { valor: "11_20", rotulo: "11 a 20", icone: "👨‍👩‍👧‍👦" },
      { valor: "20_mais", rotulo: "Mais de 20", icone: "🏢" },
    ],
  },
  {
    id: "quem_vai_usar",
    pergunta: "Quem deverá utilizar o FlyControl no dia a dia?",
    explicacao: "Pode marcar mais de um. Ninguém é cadastrado agora — isso é só para entendermos.",
    multipla: true,
    opcoes: [
      { valor: "proprietario", rotulo: "Proprietário", icone: "👑" },
      { valor: "gerente", rotulo: "Gerente", icone: "📋" },
      { valor: "atendimento", rotulo: "Atendimento", icone: "💬" },
      { valor: "caixa", rotulo: "Caixa", icone: "💰" },
      { valor: "cozinha", rotulo: "Cozinha", icone: "🍳" },
      { valor: "garcons", rotulo: "Garçons", icone: "🧑‍🍳" },
      { valor: "entregadores", rotulo: "Entregadores", icone: "🛵" },
      { valor: "outros", rotulo: "Outros colaboradores", icone: "👥", pedeTexto: true },
    ],
  },
  {
    id: "cardapio_existente",
    pergunta: "Você já possui um cardápio pronto?",
    multipla: false,
    opcoes: [
      { valor: "digital", rotulo: "Sim, tenho um cardápio digital", icone: "🌐" },
      { valor: "pdf", rotulo: "Sim, tenho em PDF", icone: "📄" },
      { valor: "imagem", rotulo: "Sim, tenho em imagem", icone: "🖼️" },
      { valor: "ifood", rotulo: "Sim, utilizo cardápio no iFood", icone: "🛵" },
      { valor: "outro_sistema", rotulo: "Sim, utilizo outro sistema", icone: "🗂️" },
      { valor: "nao_tenho", rotulo: "Ainda não tenho um cardápio", icone: "🌱" },
    ],
  },
  {
    id: "como_trazer_o_cardapio",
    pergunta: "Como você gostaria de trazer seu cardápio para o FlyControl?",
    multipla: false,
    // Só faz sentido para quem TEM cardápio. Quem não tem vai direto para o
    // cadastro, sem uma pergunta que não tem resposta boa para ele.
    aparece: (r) =>
      (r.cardapio_existente ?? []).length > 0 && !marcou(r, "cardapio_existente", "nao_tenho"),
    opcoes: [
      { valor: "manual", rotulo: "Quero cadastrar manualmente", icone: "✍️" },
      { valor: "importar", rotulo: "Quero importar meu cardápio", icone: "📥" },
      { valor: "referencia", rotulo: "Quero usar meu cardápio atual como referência", icone: "👀" },
      { valor: "ajuda_equipe", rotulo: "Quero ajuda da equipe FlyControl", icone: "🤝" },
    ],
  },
  {
    id: "organizacao_atual",
    pergunta: "Como vocês organizam os pedidos atualmente?",
    explicacao: "Pode marcar mais de um.",
    multipla: true,
    opcoes: [
      { valor: "papel", rotulo: "Papel / caderno", icone: "📓" },
      { valor: "whatsapp", rotulo: "WhatsApp", icone: "💬" },
      { valor: "planilha", rotulo: "Planilha", icone: "📊" },
      { valor: "sistema", rotulo: "Sistema de gestão", icone: "🗂️" },
      { valor: "marketplace", rotulo: "iFood / marketplace", icone: "🛵" },
      { valor: "outro_app", rotulo: "Outro aplicativo", icone: "📱", pedeTexto: true },
      { valor: "sem_organizacao", rotulo: "Ainda não tenho uma organização definida", icone: "🤷" },
    ],
  },
  {
    id: "maior_desafio",
    pergunta: "Qual é hoje o maior desafio da sua operação?",
    explicacao: "Escolha o principal.",
    multipla: false,
    opcoes: [
      { valor: "organizar_pedidos", rotulo: "Organizar os pedidos", icone: "🗂️" },
      { valor: "pedidos_perdidos", rotulo: "Evitar pedidos perdidos", icone: "🔔" },
      { valor: "agilizar", rotulo: "Agilizar o atendimento", icone: "⚡" },
      { valor: "cozinha", rotulo: "Organizar a produção/cozinha", icone: "🍳" },
      { valor: "financeiro", rotulo: "Controlar o financeiro", icone: "💰" },
      { valor: "entregas", rotulo: "Melhorar as entregas", icone: "🛵" },
      { valor: "cardapio", rotulo: "Organizar o cardápio", icone: "📖" },
      { valor: "vendas", rotulo: "Aumentar as vendas", icone: "📈" },
      { valor: "fidelizar", rotulo: "Fidelizar clientes", icone: "❤️" },
      { valor: "resultados", rotulo: "Entender melhor meus resultados", icone: "📊" },
    ],
  },
  {
    id: "objetivo",
    pergunta: "O que você mais quer conquistar usando o FlyControl?",
    multipla: false,
    opcoes: [
      { valor: "organizar", rotulo: "Organizar melhor minha operação", icone: "🗂️" },
      {
        valor: "cardapio_proprio",
        rotulo: "Receber pedidos pelo meu próprio cardápio",
        icone: "🌐",
      },
      { valor: "controle", rotulo: "Ter mais controle do negócio", icone: "🎛️" },
      { valor: "vender_mais", rotulo: "Vender mais", icone: "📈" },
      { valor: "menos_marketplace", rotulo: "Reduzir dependência de marketplaces", icone: "🔓" },
      { valor: "automatizar", rotulo: "Automatizar processos", icone: "🤖" },
      { valor: "atendimento", rotulo: "Melhorar o atendimento", icone: "💬" },
      { valor: "clientes", rotulo: "Controlar melhor pedidos e clientes", icone: "👥" },
    ],
  },
  {
    id: "entregas",
    pergunta: "Como você realiza suas entregas?",
    multipla: false,
    // Só quem faz delivery. Perguntar sobre entregador para quem só atende no
    // balcão é fazer o cliente responder uma pergunta que não é dele.
    aparece: (r) => marcou(r, "modelo_de_atendimento", "delivery"),
    opcoes: [
      { valor: "proprios", rotulo: "Entregadores próprios", icone: "🛵" },
      { valor: "aplicativo", rotulo: "Moto por aplicativo", icone: "📱" },
      { valor: "misto", rotulo: "Equipe própria + aplicativos", icone: "🔀" },
      { valor: "cliente_retira", rotulo: "O cliente retira", icone: "🛍️" },
      { valor: "estruturando", rotulo: "Ainda estou estruturando as entregas", icone: "🚧" },
    ],
  },
  {
    id: "formas_de_pagamento",
    pergunta: "Quais formas de pagamento você aceita?",
    explicacao: "Pode marcar mais de uma. Você ajusta isso depois quando quiser.",
    multipla: true,
    opcoes: [
      { valor: "pix", rotulo: "PIX", icone: "⚡" },
      { valor: "dinheiro", rotulo: "Dinheiro", icone: "💵" },
      { valor: "cartao_entrega", rotulo: "Cartão na entrega", icone: "💳" },
      { valor: "cartao_local", rotulo: "Cartão no estabelecimento", icone: "🏪" },
      { valor: "online", rotulo: "Pagamento online", icone: "🌐" },
      { valor: "outros", rotulo: "Outros", icone: "✨", pedeTexto: true },
    ],
  },
];

export function etapaPorId(id: string): Etapa | undefined {
  return ETAPAS.find((e) => e.id === id);
}

/** Os valores que o servidor aceita para uma etapa. Nada além disso entra. */
export function valoresValidos(id: string): Set<string> {
  return new Set((etapaPorId(id)?.opcoes ?? []).map((o) => o.valor));
}
