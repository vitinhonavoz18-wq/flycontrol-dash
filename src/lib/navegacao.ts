import {
  BookOpenText,
  ChartNoAxesCombined,
  ClipboardList,
  CreditCard,
  Handshake,
  Layers,
  LayoutGrid,
  LifeBuoy,
  Megaphone,
  MessageSquare,
  Package,
  PieChart,
  Search,
  Settings,
  Smartphone,
  Sparkles,
  Store,
  Trophy,
  Users,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Feature } from "@/lib/planPermissions";

/**
 * O MAPA DO MENU LATERAL.
 *
 * Antes eram dezesseis itens numa fila só, na ordem em que foram sendo
 * criados — "Pedidos", "Mesas", "Minha Loja", "Cardápio", "Estoque"... Para
 * achar "Garçons" era preciso ler a lista inteira. É a despensa onde tudo foi
 * guardado na ordem em que chegou do mercado.
 *
 * Agora os itens ficam em prateleiras, pela pergunta que o lojista está se
 * fazendo naquela hora:
 *
 *   Operação       "o que está acontecendo AGORA?"   pedidos, mesas, busca
 *   Gestão         "o que eu vendo e quem trabalha?" cardápio, estoque, equipe
 *   Crescimento    "como eu vendo mais?"             números, marketing, chat, app
 *   Administração  "como está a minha conta?"        loja, ajustes, cobrança, ajuda
 *
 * REGRA: SÓ ENTRA O QUE EXISTE
 *
 * Cada item aqui abre uma tela de verdade. Nada de "em breve" — item de menu
 * que abre uma tela vazia é a porta pintada na parede. Integrações e
 * impressão, por exemplo, não têm tela própria: moram dentro de
 * "Configurações" e do pedido, então não ganham item separado.
 *
 * Este arquivo só descreve o menu (dados). Quem desenha é o layout
 * (`routes/_app.tsx`). Separar os dois é o que permite testar o menu sem
 * precisar abrir o navegador.
 */

export type ItemDeMenu = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Quando presente, o item só aparece se o plano da loja incluir o recurso. */
  feature?: Feature;
  /** Some para quem administra a plataforma (não tem assinatura própria). */
  ocultoParaAdmin?: boolean;
  /**
   * `true` quando a tela tem sub-telas (ex.: /inventory/products). Aí o item
   * continua aceso em qualquer uma delas.
   */
  comFilhas?: boolean;
};

export type GrupoDeMenu = {
  id: string;
  titulo: string;
  itens: ItemDeMenu[];
};

export const GRUPOS_DO_MENU: GrupoDeMenu[] = [
  {
    id: "operacao",
    titulo: "Operação",
    itens: [
      { to: "/dashboard", label: "Pedidos", icon: ClipboardList },
      { to: "/tables", label: "Mesas", icon: LayoutGrid, feature: "tables" },
      { to: "/search-orders", label: "Buscar pedidos", icon: Search },
    ],
  },
  {
    id: "gestao",
    titulo: "Gestão",
    itens: [
      { to: "/menu", label: "Cardápio", icon: BookOpenText },
      { to: "/combos", label: "Combos", icon: Layers },
      {
        to: "/inventory",
        label: "Estoque e PDV",
        icon: Package,
        feature: "inventory",
        comFilhas: true,
      },
      { to: "/waiters", label: "Garçons", icon: UtensilsCrossed, feature: "waiters" },
      { to: "/commissions", label: "Comissões", icon: Wallet, feature: "commissions" },
    ],
  },
  {
    id: "crescimento",
    titulo: "Crescimento",
    itens: [
      { to: "/finance", label: "Relatórios e finanças", icon: ChartNoAxesCombined },
      { to: "/marketing", label: "Marketing", icon: Megaphone },
      // A aba do Chat APARECE para todo premium, inclusive para quem ainda não
      // contratou — é assim que ele descobre que o recurso existe e pede para
      // ativar. Quem não pode nem ver é o CENTS, e disso cuida o `feature`.
      { to: "/chat", label: "Chat", icon: MessageSquare, feature: "chat" },
      // "App", e não só "FlyDelivery": o painel inteiro agora se chama
      // FlyDelivery. Esta tela cuida de como a loja aparece no APLICATIVO do
      // cliente final — a vitrine, não a cozinha.
      { to: "/flydelivery", label: "App FlyDelivery", icon: Smartphone },
    ],
  },
  {
    id: "administracao",
    titulo: "Administração",
    itens: [
      { to: "/my-store", label: "Minha loja", icon: Store },
      { to: "/settings", label: "Configurações", icon: Settings },
      // "Plano e cobrança" mostra a assinatura do DONO da loja —
      // administradores não assinam a própria plataforma. Quem administra
      // assinaturas de todo mundo usa "Clientes e planos", no bloco de baixo.
      { to: "/billing", label: "Plano e cobrança", icon: CreditCard, ocultoParaAdmin: true },
      { to: "/docs", label: "Ajuda", icon: LifeBuoy },
    ],
  },
];

/**
 * O bloco que só a equipe da plataforma vê.
 *
 * Esconder este bloco no menu NÃO é o que protege essas telas: cada uma
 * confere no servidor se quem pediu é administrador. O menu é só a placa da
 * porta; a fechadura fica do outro lado.
 */
export const GRUPO_DA_PLATAFORMA: GrupoDeMenu = {
  id: "plataforma",
  titulo: "Administração global",
  itens: [
    { to: "/admin/analytics", label: "Insights globais", icon: PieChart, comFilhas: true },
    { to: "/admin/users", label: "Usuários", icon: Users, comFilhas: true },
    { to: "/admin/subscriptions", label: "Clientes e planos", icon: CreditCard, comFilhas: true },
    { to: "/admin/cents", label: "Clube CENTS", icon: Trophy, comFilhas: true },
    { to: "/admin/affiliates", label: "Afiliados", icon: Handshake, comFilhas: true },
    // Pix pago no aplicativo do cliente com divisão SyncPay: comissões,
    // contas recebedoras das lojas, conciliação e auditoria.
    {
      to: "/admin/flydelivery-pagamentos",
      label: "Pagamentos do app",
      icon: Wallet,
      comFilhas: true,
    },
    // Os alimentos que flutuam no topo da página inicial do site.
    { to: "/admin/vitrine-site", label: "Vitrine do site", icon: Sparkles },
  ],
};

/**
 * Monta o menu de UMA pessoa: tira o que o plano dela não inclui e o que não
 * faz sentido para o papel dela. Grupo que fica vazio some junto com o título
 * — prateleira vazia com etiqueta só confunde.
 */
export function montarMenu(opcoes: {
  temRecurso: (recurso: Feature) => boolean;
  ehAdminDaPlataforma: boolean;
}): GrupoDeMenu[] {
  const grupos = GRUPOS_DO_MENU.map((grupo) => ({
    ...grupo,
    itens: grupo.itens.filter(
      (item) =>
        (!item.feature || opcoes.temRecurso(item.feature)) &&
        !(item.ocultoParaAdmin && opcoes.ehAdminDaPlataforma),
    ),
  })).filter((grupo) => grupo.itens.length > 0);

  return opcoes.ehAdminDaPlataforma ? [...grupos, GRUPO_DA_PLATAFORMA] : grupos;
}

/** O item está aceso neste endereço? */
export function itemEstaAtivo(item: ItemDeMenu, caminho: string): boolean {
  if (caminho === item.to) return true;
  return Boolean(item.comFilhas) && caminho.startsWith(`${item.to}/`);
}
