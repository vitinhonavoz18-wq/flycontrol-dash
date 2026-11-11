/**
 * A MARCA, EM UM LUGAR SÓ.
 *
 * Antes, o nome do produto estava escrito à mão em mais de cem telas. Trocar
 * a marca significou caçar cada uma. Daqui para frente, o que for novo deve
 * ler o nome DAQUI — é como ter a placa da fachada num molde: muda o molde,
 * mudam todas as placas.
 *
 * ── O QUE MUDOU E O QUE NÃO MUDOU ─────────────────────────────────────────
 *
 * O FlyControl virou FlyDelivery. Isso é a FACHADA: nome, logotipo, cores,
 * textos que o lojista lê.
 *
 * O ENCANAMENTO não mudou de nome, de propósito. Endereços, nomes de tabela
 * no banco, chaves guardadas no navegador e variáveis do servidor continuam
 * com "flycontrol" — outros sistemas (o site de pedidos, o n8n, o WhatsApp, o
 * meio de pagamento) batem nessas portas pelo nome antigo. Trocar o nome da
 * rua no mesmo dia em que se pinta a fachada faria o carteiro se perder. O
 * mapa completo está em `docs/FLYDELIVERY-MIGRACAO.md`.
 *
 * ── DOIS "FLYDELIVERY" ────────────────────────────────────────────────────
 *
 * Já existia um FlyDelivery: o APLICATIVO onde o cliente final acha a loja e
 * pede. Agora o painel do restaurante também se chama FlyDelivery. É a mesma
 * marca vista de dois lados do balcão — por isso, sempre que um texto fala do
 * aplicativo do cliente, ele diz "app FlyDelivery", para o lojista não
 * confundir a vitrine com a cozinha.
 */

export const BRAND = {
  /** Nome do produto, como aparece para o lojista. */
  name: "FlyDelivery",
  /** Como o nome sai no letreiro (duas palavras, caixa alta). */
  wordmark: "FLY DELIVERY",
  /** Empresa responsável. */
  company: "ConnectFly",
  /** Nome anterior do produto — usado só no aviso de transição. */
  legacyName: "FlyControl",
  /** Como chamar o aplicativo do cliente final sem confundir com o painel. */
  consumerApp: "app FlyDelivery",
  tagline: "Seu delivery começa no desejo.",
  description:
    "Pedidos, cardápio, clientes, operação e financeiro do seu delivery em uma plataforma só.",
  /** Cor da barra do navegador no celular e do ícone instalado. */
  themeColor: "#FF6B35",
  /** Fundo da tela de abertura do aplicativo instalado. */
  backgroundColor: "#101828",
} as const;

/**
 * As cores oficiais, para os poucos lugares que não conseguem ler o CSS
 * (gráfico desenhado em tela, PDF, e-mail). Nas telas, use as classes do
 * tema (`bg-primary`, `text-success`...) — elas já apontam para estas cores e
 * acompanham o modo claro/escuro.
 */
export const BRAND_COLORS = {
  laranja: "#FF6B35",
  laranjaDestaque: "#FF8A3D",
  azulNoturno: "#101828",
  grafite: "#1D2939",
  branco: "#FFFFFF",
  sucesso: "#12B76A",
  alerta: "#F04438",
} as const;

/**
 * O AVISO DE TRANSIÇÃO ("O FlyControl evoluiu").
 *
 * Aparece só para quem JÁ era cliente antes da troca — quem criou a conta
 * depois nunca ouviu falar em FlyControl, e para essa pessoa o aviso seria
 * ruído. E some sozinho depois da data final: placa de "sob nova direção" que
 * fica um ano na porta vira mancha na parede.
 *
 * Para mudar o período, basta mudar as duas datas abaixo (ano-mês-dia).
 */
export const BRAND_TRANSITION = {
  /** Dia em que a marca nova entrou no ar. Conta criada antes disso vê o aviso. */
  launchedAt: "2026-11-11",
  /** Último dia em que o aviso aparece. */
  noticeUntil: "2027-02-11",
  /** Chave no navegador que lembra que a pessoa já fechou o aviso. */
  storageKey: "flydelivery.aviso-nova-marca.v1",
  title: "O FlyControl evoluiu. Agora somos FlyDelivery.",
  message:
    "Seus dados, sua loja e suas operações continuam aqui, com uma experiência ainda melhor.",
} as const;

/**
 * Decide se o aviso de transição deve aparecer.
 *
 * Função pura, sem ler relógio nem navegador por conta própria — recebe tudo
 * por parâmetro. É isso que permite testá-la com datas inventadas.
 */
export function shouldShowBrandTransitionNotice(input: {
  /** Momento atual. */
  now: Date;
  /** Quando a conta do usuário foi criada (texto ISO vindo do login). */
  userCreatedAt: string | null | undefined;
  /** A pessoa já fechou o aviso neste aparelho? */
  dismissed: boolean;
}): boolean {
  if (input.dismissed) return false;

  // Fim do dia final, no fuso de Brasília (UTC-3, sem horário de verão).
  const fim = new Date(`${BRAND_TRANSITION.noticeUntil}T23:59:59-03:00`);
  if (input.now.getTime() > fim.getTime()) return false;

  // Sem data de criação não dá para afirmar que é cliente antigo. Na dúvida,
  // não mostra: aviso a mais para cliente novo confunde; aviso a menos para
  // cliente antigo não quebra nada (a marca nova já está em toda a tela).
  if (!input.userCreatedAt) return false;
  const criada = new Date(input.userCreatedAt);
  if (Number.isNaN(criada.getTime())) return false;

  const lancamento = new Date(`${BRAND_TRANSITION.launchedAt}T00:00:00-03:00`);
  return criada.getTime() < lancamento.getTime();
}
