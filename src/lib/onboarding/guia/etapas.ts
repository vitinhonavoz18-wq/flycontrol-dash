/**
 * O guia de configuração da loja: quais etapas existem, em que ordem, onde
 * cada uma acontece e o que o personagem diz em cada uma.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * A REGRA QUE MANDA AQUI: ETAPA SE CONCLUI COM DADO, NÃO COM CLIQUE
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Nenhuma etapa tem "botão de avançar". Cada uma carrega uma pergunta que só
 * o banco responde: a loja TEM nome e telefone? existe alguma categoria? tem
 * produto com preço?
 *
 * É a diferença entre o garçom anotar "pedido entregue" e o cliente estar
 * com o prato na mesa. A lista de tarefas que se marca sozinha no clique é
 * um boletim que dá nota para matéria que ninguém deu — e pior: o lojista
 * termina o guia achando que está pronto para vender, abre a loja e não tem
 * cardápio.
 *
 * O QUE ESTE ARQUIVO NÃO SABE
 *
 * Ele não lê banco, não desenha nada e não sabe navegar. Só descreve. Quem
 * lê o banco é `guia.functions.ts`; quem desenha é `components/onboarding/guia`.
 * Assim a regra pode ser testada sem subir tela nem banco.
 */

/** As emoções do personagem. Cada uma tem uma pose. Ver `personagem.ts`. */
export type EmocaoDoGuia =
  "boas-vindas" | "orientando" | "trabalhando" | "sucesso" | "atencao" | "comemorando" | "neutro";

export type IdDaEtapaDoGuia =
  | "estabelecimento"
  | "funcionamento"
  | "categoria"
  | "produto"
  | "adicionais"
  | "pagamentos"
  | "whatsapp"
  | "plano_cents"
  | "pedido_teste"
  | "prontidao";

/**
 * Os sinais REAIS da loja. Cada campo aqui existe no banco — nenhum é
 * inventado para o guia ficar bonito.
 */
export type SinaisDaConfiguracao = {
  /** `pizzerias.name` preenchido. */
  temNome: boolean;
  /** `pizzerias.phone` OU `pizzerias.whatsapp` preenchido. */
  temContato: boolean;
  /** Endereço identificável: `address` ou (`street` + `number`). */
  temEndereco: boolean;
  /** `pizzerias.opening_hours` com pelo menos um dia aberto. */
  temHorario: boolean;
  /** `delivery_enabled` ou `pickup_enabled`. */
  temFormaDeAtendimento: boolean;
  /** Quantas categorias de cardápio existem. */
  categorias: number;
  /** Quantos produtos com preço acima de zero existem. */
  produtos: number;
  /** Quantos complementos (`menu_extras`) ativos existem. */
  adicionais: number;
  /** Quantas formas de pagamento estão ligadas em `pizzerias.payment_methods`. */
  formasDePagamento: number;
  /**
   * O número que recebe os pedidos é um celular brasileiro válido.
   *
   * Diferente de `temContato`, que só olha se tem ALGUMA COISA escrita: aqui
   * a pergunta é se dá para mandar mensagem naquele número. Telefone fixo e
   * número pela metade passam no primeiro e reprovam aqui — e é justamente
   * o número pela metade que faz o pedido do cliente cair no vazio.
   */
  whatsappValido: boolean;
};

/**
 * As escolhas do lojista que NÃO dá para deduzir olhando o banco.
 *
 * Loja sem nenhum adicional cadastrado e loja que NÃO USA adicionais são
 * idênticas nos dados. Sem guardar a resposta, o guia perguntaria a mesma
 * coisa para sempre — o garçom que volta de cinco em cinco minutos oferecendo
 * sobremesa depois de o cliente já ter dito que não.
 *
 * Só entra aqui o que o banco não sabe responder sozinho.
 */
export type DecisoesDoGuia = {
  /** "dispensado" = o lojista disse que não usa adicionais. */
  adicionais?: "dispensado";
  /** O lojista viu e reconheceu o resumo de prontidão. */
  prontidao?: "visto";
};

/**
 * As decisões que o servidor aceita gravar. Nada fora desta lista entra.
 *
 * É um `Map`, e não um objeto comum, por um motivo concreto: num objeto,
 * perguntar por `__proto__`, `constructor` ou `toString` NÃO devolve
 * "não existe" — devolve algo herdado. Numa versão anterior deste código
 * `DECISOES_ACEITAS["__proto__"]` derrubava a validação inteira com um erro,
 * e uma requisição com essa chave travava a gravação do guia.
 *
 * É o caderno de reservas que, perguntado por um nome que não está na lista,
 * em vez de dizer "não tem" responde com o nome do dono do caderno.
 *
 * O `Map` só conhece o que foi colocado dentro dele.
 */
const DECISOES_ACEITAS = new Map<string, readonly string[]>([
  ["adicionais", ["dispensado"]],
  ["prontidao", ["visto"]],
]);

export function decisaoValida(chave: string, valor: string): boolean {
  return DECISOES_ACEITAS.get(chave)?.includes(valor) ?? false;
}

/** As chaves aceitas, para quem precisar listar (telas, testes). */
export function chavesDeDecisao(): string[] {
  return [...DECISOES_ACEITAS.keys()];
}

export type EtapaDoGuia = {
  id: IdDaEtapaDoGuia;
  /** O nome curto, o que aparece na lista de progresso. */
  rotulo: string;
  /** A rota onde esta etapa acontece. */
  rota: string;
  /**
   * A aba dentro dessa rota, quando a tela tem abas ("Minha Loja" tem sete).
   * Vai como `?aba=` no endereço: sem isto o guia mandaria o lojista para a
   * página certa e iluminaria um campo que está escondido atrás de outra aba.
   */
  aba?: string;
  /**
   * A marca do elemento que deve ficar em destaque, procurada na tela como
   * `[data-guia="..."]`. Sem marca, o holofote ilumina a tela inteira — que é
   * o certo para uma etapa que não tem um campo único.
   */
  alvo?: string;
  emocao: EmocaoDoGuia;
  titulo: string;
  descricao: string;
  /** O que falta, dito em uma linha, quando a etapa ainda não fecha. */
  comoConcluir: string;
  /**
   * A pergunta que o BANCO responde. Devolver `true` é a única coisa que
   * conclui a etapa.
   *
   * `d` são as escolhas que o banco não sabe responder sozinho (ver
   * `DecisoesDoGuia`). A esmagadora maioria das etapas ignora esse segundo
   * parâmetro de propósito: quanto menos etapa depender de uma resposta em
   * vez de um dado, menos chance de alguém terminar o guia sem a loja pronta.
   */
  concluida: (s: SinaisDaConfiguracao, d: DecisoesDoGuia) => boolean;
  /**
   * Quando a etapa oferece uma escolha em vez de só apontar um campo.
   * Usado na de adicionais: nem todo negócio usa complementos, e obrigar uma
   * hamburgueria sem adicionais a inventar um só para destravar o guia seria
   * pedir para ela sujar o próprio cardápio.
   */
  escolha?: {
    pergunta: string;
    /** O botão que leva à tela de configurar. */
    configurar: string;
    /** O botão que dispensa, gravando a decisão. */
    dispensar: string;
    /** A decisão gravada ao dispensar. */
    chave: keyof DecisoesDoGuia;
    valor: string;
  };
  /**
   * Etapa que ainda não faz parte do guia — aparece na lista de progresso
   * como "em breve", para o lojista ver o caminho inteiro, mas não prende
   * ninguém esperando uma tela que não existe.
   */
  emBreve?: boolean;
};

/**
 * O roteiro completo da preparação de uma loja.
 *
 * As cinco últimas estão marcadas como `emBreve`: elas fazem parte do plano e
 * por isso aparecem na lista, mas o guia ainda não as conduz. Mostrar o
 * caminho inteiro é o que faz o lojista entender onde ele está; conduzir até
 * uma tela que ainda não existe é o que o deixaria preso.
 */
export const ETAPAS_DO_GUIA: readonly EtapaDoGuia[] = [
  {
    id: "estabelecimento",
    rotulo: "Estabelecimento",
    rota: "/my-store",
    aba: "identity",
    alvo: "identidade-da-loja",
    emocao: "boas-vindas",
    titulo: "Vamos deixar sua loja pronta",
    descricao:
      "Primeiro o básico: o nome que o cliente vê, um telefone para ele falar com você e o endereço de onde sai o pedido.",
    comoConcluir: "Preencha nome, telefone (ou WhatsApp) e endereço, e clique em salvar.",
    concluida: (s) => s.temNome && s.temContato && s.temEndereco,
  },
  {
    id: "funcionamento",
    rotulo: "Funcionamento",
    rota: "/my-store",
    aba: "service",
    alvo: "atendimento-da-loja",
    emocao: "trabalhando",
    titulo: "Agora, como sua loja funciona",
    descricao:
      "Em que horários você atende e de que jeito o cliente recebe: entrega, retirada no balcão, ou os dois.",
    comoConcluir: "Marque ao menos um dia com horário e escolha entrega e/ou retirada.",
    concluida: (s) => s.temHorario && s.temFormaDeAtendimento,
  },
  {
    id: "categoria",
    rotulo: "Primeira categoria",
    rota: "/menu",
    alvo: "nova-categoria",
    emocao: "orientando",
    titulo: "Hora de montar sua vitrine",
    descricao:
      "Categoria é a prateleira do cardápio: Hambúrgueres, Pizzas, Açaí, Bebidas. Crie a primeira do seu negócio.",
    comoConcluir: "Crie uma categoria no cardápio.",
    concluida: (s) => s.categorias > 0,
  },
  {
    id: "produto",
    rotulo: "Primeiro produto",
    rota: "/menu",
    alvo: "novo-produto",
    emocao: "orientando",
    titulo: "Agora o primeiro produto",
    descricao: "Coloque um item à venda com nome e preço. É ele que o cliente vai ver e pedir.",
    comoConcluir: "Cadastre um produto com preço maior que zero.",
    concluida: (s) => s.produtos > 0,
  },

  {
    id: "adicionais",
    rotulo: "Adicionais",
    rota: "/menu",
    aba: "extras",
    alvo: "novo-adicional",
    emocao: "orientando",
    titulo: "Seus produtos têm complementos?",
    descricao:
      "Bacon, queijo extra, borda recheada, cobertura de açaí. São os itens que o cliente soma ao pedido — e que aumentam o valor da comanda sem você vender nada a mais.",
    comoConcluir: "Cadastre um complemento, ou diga que sua loja não usa.",
    // Duas portas fecham esta etapa: um complemento cadastrado DE VERDADE, ou
    // a resposta de que a loja não usa complementos. Obrigar uma hamburgueria
    // sem adicionais a inventar um só para destravar o guia seria pedir para
    // ela sujar o próprio cardápio.
    concluida: (s, d) => s.adicionais > 0 || d.adicionais === "dispensado",
    escolha: {
      pergunta: "Seu estabelecimento utiliza adicionais ou complementos nos produtos?",
      configurar: "Configurar adicionais",
      dispensar: "Não utilizo adicionais",
      chave: "adicionais",
      valor: "dispensado",
    },
  },
  {
    id: "pagamentos",
    rotulo: "Pagamentos",
    rota: "/my-store",
    aba: "delivery",
    alvo: "formas-de-pagamento",
    emocao: "trabalhando",
    titulo: "Como seus clientes vão pagar",
    descricao:
      "Marque as formas que você aceita de verdade. O que não estiver marcado aqui não aparece para o cliente na hora de fechar o pedido.",
    comoConcluir: "Ligue pelo menos uma forma de pagamento.",
    concluida: (s) => s.formasDePagamento > 0,
  },
  {
    id: "whatsapp",
    rotulo: "Canal de pedidos",
    rota: "/my-store",
    aba: "service",
    alvo: "whatsapp-de-pedidos",
    emocao: "atencao",
    titulo: "Onde você recebe os pedidos",
    descricao:
      "O WhatsApp de pedidos é para onde o cliente é levado quando fecha a compra. Com DDD e os 9 dígitos — um número pela metade faz o pedido cair no vazio, e você nunca fica sabendo.",
    comoConcluir: "Informe o WhatsApp de pedidos com DDD e 9 dígitos.",
    concluida: (s) => s.whatsappValido,
  },
  {
    id: "prontidao",
    rotulo: "Sua loja está pronta",
    rota: "/dashboard",
    emocao: "comemorando",
    titulo: "Pronto! Sua loja está de pé.",
    descricao:
      "Esse é o resumo do que você configurou. Confira, e se algo estiver faltando dá para voltar depois por Minha Loja e pelo Cardápio.",
    comoConcluir: "Confira o resumo e siga para o painel.",
    // A ÚNICA etapa que fecha por clique, e ela é assim de propósito: não
    // existe dado no banco que responda "o lojista viu o resumo". Todas as
    // outras continuam fechando só com dado.
    concluida: (_s, d) => d.prontidao === "visto",
    escolha: {
      pergunta: "Tudo certo até aqui?",
      configurar: "Entendi, quero começar",
      dispensar: "",
      chave: "prontidao",
      valor: "visto",
    },
  },

  // ── Ainda não conduzidas pelo guia ──────────────────────────────────────
  {
    id: "plano_cents",
    rotulo: "Plano Cents",
    rota: "/billing",
    emocao: "neutro",
    titulo: "Plano Cents",
    descricao: "O plano que libera os recursos da sua loja.",
    comoConcluir: "Em breve.",
    concluida: () => false,
    emBreve: true,
  },
  {
    id: "pedido_teste",
    rotulo: "Pedido teste",
    rota: "/dashboard",
    emocao: "comemorando",
    titulo: "Pedido teste",
    descricao: "Um pedido de mentira para você ver tudo funcionando antes do primeiro de verdade.",
    comoConcluir: "Em breve.",
    concluida: () => false,
    emBreve: true,
  },
] as const;

/** Só as etapas que o guia realmente conduz hoje. */
export const ETAPAS_ATIVAS: readonly EtapaDoGuia[] = ETAPAS_DO_GUIA.filter((e) => !e.emBreve);

/**
 * O endereço completo da etapa, já com a aba quando ela existe.
 *
 * `buscaAtual` é o que já estava no endereço (`?pizzeriaId=...`). Ele é
 * mantido: quem tem mais de uma loja chega nas telas com a loja escolhida no
 * endereço, e jogar isso fora levaria o guia a configurar a loja errada.
 */
export function enderecoDaEtapa(etapa: EtapaDoGuia, buscaAtual = ""): string {
  const params = new URLSearchParams(buscaAtual);
  // `aba` é sempre reescrita; o resto do bilhete fica.
  params.delete("aba");
  if (etapa.aba) params.set("aba", etapa.aba);
  const cauda = params.toString();
  return cauda ? `${etapa.rota}?${cauda}` : etapa.rota;
}

export function etapaDoGuiaPorId(id: string): EtapaDoGuia | undefined {
  return ETAPAS_DO_GUIA.find((e) => e.id === id);
}

export function ehIdDeEtapaDoGuia(id: string | null | undefined): id is IdDaEtapaDoGuia {
  return !!id && ETAPAS_DO_GUIA.some((e) => e.id === id);
}

/**
 * Quais etapas o banco confirma AGORA.
 *
 * Note que isto não olha para nada guardado: é a fotografia da loja neste
 * instante. Quem junta com o que já foi confirmado antes é
 * `etapasConcluidas`.
 */
export function etapasAtendidas(
  s: SinaisDaConfiguracao,
  d: DecisoesDoGuia = {},
): IdDaEtapaDoGuia[] {
  return ETAPAS_ATIVAS.filter((e) => e.concluida(s, d)).map((e) => e.id);
}

/**
 * Tudo que já foi dado por feito: o que o banco confirma agora MAIS o que já
 * tinha sido confirmado antes.
 *
 * POR QUE O QUE JÁ FOI FEITO NÃO VOLTA A SER COBRADO
 *
 * O lojista cadastra o primeiro produto, o guia segue em frente, e depois ele
 * apaga esse produto para refazer. Se a etapa voltasse a abrir, o guia o
 * puxaria de volta para o cardápio no meio de outra coisa — é a porta que se
 * tranca de novo atrás de quem já passou.
 */
export function etapasConcluidas(
  s: SinaisDaConfiguracao,
  jaConfirmadas: readonly string[],
  d: DecisoesDoGuia = {},
): IdDaEtapaDoGuia[] {
  const conjunto = new Set<IdDaEtapaDoGuia>(etapasAtendidas(s, d));
  for (const id of jaConfirmadas) {
    if (ehIdDeEtapaDoGuia(id)) conjunto.add(id);
  }
  // Devolve na ordem do roteiro, não na ordem em que foram marcadas.
  return ETAPAS_ATIVAS.filter((e) => conjunto.has(e.id)).map((e) => e.id);
}

/** Onde o lojista deve estar agora: a primeira etapa ativa ainda em aberto. */
export function proximaEtapaDoGuia(concluidas: readonly IdDaEtapaDoGuia[]): EtapaDoGuia | null {
  const feitas = new Set(concluidas);
  return ETAPAS_ATIVAS.find((e) => !feitas.has(e.id)) ?? null;
}

/** De 0 a 100, sobre as etapas que o guia realmente conduz. */
export function progressoDoGuia(concluidas: readonly IdDaEtapaDoGuia[]): number {
  if (ETAPAS_ATIVAS.length === 0) return 100;
  const feitas = new Set(concluidas);
  const quantas = ETAPAS_ATIVAS.filter((e) => feitas.has(e.id)).length;
  return Math.round((quantas / ETAPAS_ATIVAS.length) * 100);
}

/**
 * Esta rota é permitida enquanto o guia está em `etapa`?
 *
 * O guia é obrigatório, mas nem toda porta pode ser trancada. Documentação,
 * cobrança e as telas da conta continuam abertas: trancar o lojista fora da
 * página de pagamento ou do suporte transformaria um guia em sequestro.
 */
export const ROTAS_SEMPRE_LIBERADAS: readonly string[] = [
  "/docs",
  "/billing",
  "/settings",
  "/preparar",
];

export function rotaPermitidaNoGuia(rota: string, etapa: EtapaDoGuia | null): boolean {
  if (!etapa) return true;
  if (ROTAS_SEMPRE_LIBERADAS.some((r) => rota === r || rota.startsWith(`${r}/`))) return true;
  return rota === etapa.rota || rota.startsWith(`${etapa.rota}/`);
}
