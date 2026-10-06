import {
  BarChart3,
  Bike,
  ChefHat,
  CircleCheck,
  Contact,
  LayoutDashboard,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Navigation,
  PackageCheck,
  ReceiptText,
  Settings,
  ShoppingBag,
  Smartphone,
  Store,
  Timer,
  Truck,
  UtensilsCrossed,
  Users,
  Zap,
  BellRing,
  Layers,
  ShieldCheck,
  Radio,
  type LucideIcon,
} from "lucide-react";
import type { Cents } from "@/lib/billing/money";

/**
 * O texto da página FlyDelivery Parceiros, separado do desenho.
 *
 * REGRA: NADA DE PROMESSA QUE O SISTEMA NÃO CUMPRE
 *
 * Cada frase aqui corresponde a algo que existe hoje no FlyControl ou no
 * aplicativo FlyDelivery. A exceção é o FlyBoy — o aplicativo dos
 * entregadores ainda não existe (só a parte do servidor está pronta) — e por
 * isso ele aparece com o selo "Em breve" em todo lugar onde é citado.
 *
 * Os pedidos, nomes e valores das ilustrações são de mentira, de propósito:
 * servem para desenhar a tela, como o prato de cera na vitrine. Os valores
 * ficam em centavos inteiros, como em todo o sistema.
 */

export type Item = { titulo: string; texto: string; icone: LucideIcon };

/* ── Barra do topo ─────────────────────────────────────────────────────── */

export const LINKS_DO_MENU = [
  { href: "#produto", rotulo: "Produto" },
  { href: "#recursos", rotulo: "Recursos" },
  { href: "#como-funciona", rotulo: "Como funciona" },
  { href: "#marketplace", rotulo: "Marketplace" },
  { href: "#parceiros", rotulo: "Parceiros" },
] as const;

/* ── Seção 02 · Ecossistema ────────────────────────────────────────────── */

export type EtapaDoEcossistema = Item & { lado: "cliente" | "restaurante"; destaque?: boolean };

export const ECOSSISTEMA: EtapaDoEcossistema[] = [
  { titulo: "Cliente", texto: "Bateu a fome, abriu o app.", icone: Smartphone, lado: "cliente" },
  {
    titulo: "FlyDelivery Marketplace",
    texto: "Encontra sua loja e monta o pedido.",
    icone: Store,
    lado: "cliente",
  },
  { titulo: "Pedido", texto: "Sai do celular já completo.", icone: ReceiptText, lado: "cliente" },
  {
    titulo: "FlyDelivery Parceiros",
    texto: "Cai na sua tela na mesma hora.",
    icone: LayoutDashboard,
    lado: "restaurante",
    destaque: true,
  },
  { titulo: "Operação", texto: "A cozinha recebe e prepara.", icone: ChefHat, lado: "restaurante" },
  { titulo: "Entrega", texto: "Sai para o endereço certo.", icone: Bike, lado: "restaurante" },
];

/* ── Seção 03 · Gestão de pedidos ──────────────────────────────────────── */

export const BENEFICIOS_PEDIDOS: Item[] = [
  { titulo: "Pedidos centralizados", texto: "App, site e salão no mesmo quadro.", icone: Layers },
  { titulo: "Status em tempo real", texto: "Mudou na cozinha, mudou na tela.", icone: Radio },
  {
    titulo: "Organização da operação",
    texto: "Colunas por etapa: novo, em preparo, em entrega.",
    icone: LayoutDashboard,
  },
  {
    titulo: "Acompanhamento das entregas",
    texto: "Veja o que já saiu e o que está esperando.",
    icone: Truck,
  },
  {
    titulo: "Menos erros",
    texto: "O pedido chega completo, sem anotar à mão.",
    icone: ShieldCheck,
  },
  { titulo: "Mais velocidade", texto: "Alerta sonoro e comanda direto na cozinha.", icone: Zap },
];

export type PedidoDeExemplo = {
  numero: number;
  cliente: string;
  itens: string;
  totalCentavos: Cents;
  tipo: "Delivery" | "Retirada";
  tempo: string;
};

export type ColunaDeExemplo = {
  titulo: string;
  cor: "laranja" | "ambar" | "verde";
  pedidos: PedidoDeExemplo[];
};

/** O primeiro pedido da primeira coluna é o que "chega" animado. */
export const QUADRO_DE_EXEMPLO: ColunaDeExemplo[] = [
  {
    titulo: "Novos",
    cor: "laranja",
    pedidos: [
      {
        numero: 1847,
        cliente: "Mariana S.",
        itens: "2× Hambúrguer Premium",
        totalCentavos: 7980,
        tipo: "Delivery",
        tempo: "agora",
      },
      {
        numero: 1846,
        cliente: "Carlos E.",
        itens: "Combo Smash + refrigerante",
        totalCentavos: 4290,
        tipo: "Retirada",
        tempo: "2 min",
      },
    ],
  },
  {
    titulo: "Em preparo",
    cor: "ambar",
    pedidos: [
      {
        numero: 1844,
        cliente: "Juliana R.",
        itens: "Pizza calabresa grande",
        totalCentavos: 5990,
        tipo: "Delivery",
        tempo: "9 min",
      },
      {
        numero: 1843,
        cliente: "Pedro A.",
        itens: "Açaí 500 ml",
        totalCentavos: 2450,
        tipo: "Delivery",
        tempo: "12 min",
      },
    ],
  },
  {
    titulo: "Em entrega",
    cor: "verde",
    pedidos: [
      {
        numero: 1841,
        cliente: "Ana L.",
        itens: "3× Pastel de carne",
        totalCentavos: 3600,
        tipo: "Delivery",
        tempo: "18 min",
      },
      {
        numero: 1840,
        cliente: "Rafael M.",
        itens: "Hambúrguer duplo",
        totalCentavos: 3890,
        tipo: "Delivery",
        tempo: "21 min",
      },
    ],
  },
];

export const INDICADORES_DE_EXEMPLO = {
  pedidosHoje: 24,
  emAndamento: 6,
  faturamentoHojeCentavos: 117360 as Cents,
};

/* ── Seção 04 · Marketplace ────────────────────────────────────────────── */

export const PONTOS_MARKETPLACE: Item[] = [
  { titulo: "Produtos", texto: "Fotos, preços e adicionais do seu cadastro.", icone: ShoppingBag },
  { titulo: "Cardápio", texto: "Mudou no painel, mudou no app.", icone: UtensilsCrossed },
  { titulo: "Pedidos", texto: "Caem direto no seu quadro.", icone: ReceiptText },
  { titulo: "Clientes", texto: "Gente da sua região encontra sua loja.", icone: Users },
  { titulo: "Delivery", texto: "Entrega ou retirada, do jeito que você atende.", icone: Bike },
];

/* ── Seção 05 · Funcionalidades ────────────────────────────────────────── */

export type Funcionalidade = Item & { grande?: boolean; emBreve?: boolean };

/*
 * A ORDEM IMPORTA: os dois cartões grandes ocupam duas casas. Nesta ordem a
 * grade do computador (4 colunas) fecha 4 + 4 + 4, sem buraco no meio.
 */
export const FUNCIONALIDADES: Funcionalidade[] = [
  {
    titulo: "Gestão de pedidos",
    texto: "Quadro único por etapa, com alerta de pedido novo e comanda para a cozinha.",
    icone: LayoutDashboard,
    grande: true,
  },
  {
    titulo: "Cardápio digital",
    texto: "Categorias, tamanhos, combos e adicionais.",
    icone: UtensilsCrossed,
  },
  {
    titulo: "Gestão de entregas",
    texto: "Áreas por bairro ou raio, taxa e retirada.",
    icone: MapPin,
  },
  {
    titulo: "Marketplace FlyDelivery",
    texto: "Sua loja no aplicativo, para clientes perto de você — com o mesmo cardápio do painel.",
    icone: Store,
    grande: true,
  },
  { titulo: "FlyBoy", texto: "Entregadores ligados ao pedido.", icone: Bike, emBreve: true },
  { titulo: "Clientes", texto: "Base formada pelos próprios pedidos.", icone: Contact },
  {
    titulo: "Relatórios",
    texto: "Faturamento, ticket médio e vendas por canal.",
    icone: BarChart3,
  },
  { titulo: "WhatsApp", texto: "Campanhas para quem já comprou.", icone: MessageCircle },
  { titulo: "CRM", texto: "Conversas e histórico do cliente juntos.", icone: MessagesSquare },
  { titulo: "Configurações", texto: "Horários, pagamentos e dados da loja.", icone: Settings },
];

/* ── Seção 06 · Operação ───────────────────────────────────────────────── */

export const ETAPAS_DA_OPERACAO: Item[] = [
  {
    titulo: "Pedido recebido",
    texto: "O alerta toca e o pedido entra no quadro.",
    icone: BellRing,
  },
  { titulo: "Preparação", texto: "A cozinha recebe a comanda.", icone: ChefHat },
  { titulo: "Retirada", texto: "Pronto para o entregador ou o balcão.", icone: PackageCheck },
  { titulo: "Entrega", texto: "Saiu para o endereço do cliente.", icone: Bike },
  { titulo: "Cliente", texto: "Recebeu — e acompanhou tudo pelo app.", icone: CircleCheck },
];

/* ── Seção 07 · FlyBoy ─────────────────────────────────────────────────── */

export const ETAPAS_FLYBOY: Item[] = [
  {
    titulo: "O motoboy recebe a corrida",
    texto: "No celular, com o endereço da loja.",
    icone: Smartphone,
  },
  { titulo: "Retirada", texto: "Chega no balcão e pega o pedido certo.", icone: Store },
  { titulo: "Rota", texto: "Segue até o endereço do cliente.", icone: Navigation },
  { titulo: "Entrega", texto: "Pedido na porta, corrida concluída.", icone: PackageCheck },
  { titulo: "Status sincronizado", texto: "Painel e cliente veem tudo na hora.", icone: Timer },
];
