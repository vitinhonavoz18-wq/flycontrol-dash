/**
 * O mapa do sistema: quais telas existem e quem enxerga cada uma.
 *
 * Antes, esta lista existia duas vezes — uma no menu do computador, outra no
 * menu do celular — junto com as regras de quem vê o quê. Criar uma tela nova
 * exigia lembrar de mexer nos dois lugares, e esquecer um significava uma tela
 * que aparecia no computador e sumia no celular.
 *
 * É como o cardápio da parede e o cardápio da mesa: quando são dois papéis
 * diferentes, um dia o preço muda só num deles. Aqui existe um papel só, e os
 * dois menus leem dele.
 *
 * As duas listas de dono continuam separadas de propósito — o menu do celular
 * mostra menos itens e usa nomes mais curtos, porque a tela é menor. O que
 * deixou de ser repetido são as REGRAS de quem enxerga o quê.
 */

import {
  BarChart3,
  CreditCard,
  LayoutDashboard,
  LayoutGrid,
  Megaphone,
  Menu,
  Package,
  PieChart,
  Search,
  Settings,
  ShoppingBag,
  Smartphone,
  Store,
  Trophy,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import type { Feature } from "@/lib/planPermissions";
import { emDesenvolvimento } from "@/lib/featureFlags";

export type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Recurso do plano que libera o item. Sem isso, o item é de todo mundo. */
  feature?: Feature;
  /** Marca o item como ativo em telas com endereço filho (ex.: /admin/...). */
  match?: (path: string) => boolean;
};

/** Menu lateral, no computador. */
export const SIDEBAR_ITEMS: readonly NavItem[] = [
  { to: "/dashboard", label: "Pedidos", icon: LayoutDashboard },
  { to: "/tables", label: "Mesas", icon: LayoutGrid, feature: "tables" },
  { to: "/search-orders", label: "Buscar Pedidos", icon: Search },
  { to: "/my-store", label: "Minha Loja", icon: Store },
  { to: "/menu", label: "Cardápio", icon: Menu },
  { to: "/flydelivery", label: "FlyDelivery", icon: Smartphone },
  { to: "/combos", label: "Combos", icon: PieChart },
  { to: "/marketing", label: "Marketing", icon: Megaphone },
  { to: "/finance", label: "Gestão Financeira", icon: BarChart3 },
  { to: "/billing", label: "Plano e cobrança", icon: CreditCard },
  { to: "/settings", label: "Configurações", icon: Settings },
  { to: "/waiters", label: "Garçons", icon: UtensilsCrossed, feature: "waiters" },
  { to: "/commissions", label: "Comissões", icon: Wallet, feature: "commissions" },
];

/** Barra de baixo do celular: as quatro telas do dia a dia. */
export const MOBILE_PRIMARY_ITEMS: readonly NavItem[] = [
  { to: "/dashboard", label: "Início", icon: LayoutDashboard },
  { to: "/search-orders", label: "Pedidos", icon: ShoppingBag },
  { to: "/menu", label: "Cardápio", icon: Menu },
  { to: "/tables", label: "Mesas", icon: LayoutGrid },
];

/** O que abre no botão "Mais", no celular. */
export const MOBILE_MORE_ITEMS: readonly NavItem[] = [
  { to: "/my-store", label: "Minha Loja", icon: Store },
  { to: "/combos", label: "Combos / Produtos", icon: Package },
  { to: "/finance", label: "Relatórios", icon: BarChart3 },
  { to: "/commissions", label: "Comissões", icon: Wallet },
  { to: "/waiters", label: "Garçons", icon: UtensilsCrossed },
  { to: "/billing", label: "Plano e cobrança", icon: CreditCard },
  { to: "/settings", label: "Configurações", icon: Settings },
];

/** Painel Admin, no menu lateral. */
export const ADMIN_SIDEBAR_ITEMS: readonly NavItem[] = [
  { to: "/admin/pizzerias", label: "FlyPizzarias", icon: Store },
  { to: "/admin/analytics", label: "Insights Globais", icon: PieChart },
  { to: "/admin/finance", label: "Financeiro Global", icon: BarChart3 },
  { to: "/admin/users", label: "Usuários", icon: Users },
  { to: "/admin/subscriptions", label: "Clientes e Planos", icon: CreditCard },
  { to: "/admin/cents", label: "Clube CENTS", icon: Trophy },
];

/** Painel Admin, no celular. Nomes mais curtos e sem as telas de leitura longa. */
export const ADMIN_MOBILE_ITEMS: readonly NavItem[] = [
  { to: "/admin/pizzerias", label: "FlyPizzarias", icon: Store },
  { to: "/admin/analytics", label: "Insights Globais", icon: PieChart },
  { to: "/admin/finance", label: "Financeiro Global", icon: BarChart3 },
  { to: "/admin/users", label: "Usuários", icon: Users },
  { to: "/admin/subscriptions", label: "Planos", icon: CreditCard },
].map((it) => ({ ...it, match: (path: string) => path.startsWith(it.to) }));

/**
 * Filtra o menu do dono. As três regras vivem só aqui:
 *
 * 1. item de recurso pago só aparece para quem tem o recurso no plano;
 * 2. "Plano e cobrança" some para quem administra a plataforma — administrador
 *    não assina o próprio sistema; ele usa "Clientes e Planos", no Painel Admin;
 * 3. área ainda em obra some para todo mundo (ver `featureFlags.ts`).
 */
export function visibleOwnerItems(
  items: readonly NavItem[],
  options: { isPlatformAdmin: boolean; hasFeature?: (feature: Feature) => boolean },
): NavItem[] {
  return items.filter(
    (it) =>
      (!it.feature || !options.hasFeature || options.hasFeature(it.feature)) &&
      !(it.to === "/billing" && options.isPlatformAdmin) &&
      !emDesenvolvimento(it.to),
  );
}

/** O item corresponde ao endereço aberto agora? */
export function isNavItemActive(item: NavItem, path: string): boolean {
  return item.match ? item.match(path) : path === item.to;
}
