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
  | "pedido_teste";

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
};

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
   */
  concluida: (s: SinaisDaConfiguracao) => boolean;
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

  // ── Ainda não conduzidas pelo guia ──────────────────────────────────────
  {
    id: "adicionais",
    rotulo: "Adicionais",
    rota: "/menu",
    emocao: "neutro",
    titulo: "Adicionais",
    descricao: "Bacon, borda recheada, tamanho maior — o que o cliente soma ao pedido.",
    comoConcluir: "Em breve.",
    concluida: () => false,
    emBreve: true,
  },
  {
    id: "pagamentos",
    rotulo: "Pagamentos",
    rota: "/my-store",
    emocao: "neutro",
    titulo: "Pagamentos",
    descricao: "Como o cliente paga: Pix, cartão, dinheiro.",
    comoConcluir: "Em breve.",
    concluida: () => false,
    emBreve: true,
  },
  {
    id: "whatsapp",
    rotulo: "WhatsApp",
    rota: "/chat",
    emocao: "neutro",
    titulo: "WhatsApp",
    descricao: "O número que recebe e responde os pedidos.",
    comoConcluir: "Em breve.",
    concluida: () => false,
    emBreve: true,
  },
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

/** O endereço completo da etapa, já com a aba quando ela existe. */
export function enderecoDaEtapa(etapa: EtapaDoGuia): string {
  return etapa.aba ? `${etapa.rota}?aba=${encodeURIComponent(etapa.aba)}` : etapa.rota;
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
export function etapasAtendidas(s: SinaisDaConfiguracao): IdDaEtapaDoGuia[] {
  return ETAPAS_ATIVAS.filter((e) => e.concluida(s)).map((e) => e.id);
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
): IdDaEtapaDoGuia[] {
  const conjunto = new Set<IdDaEtapaDoGuia>(etapasAtendidas(s));
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
