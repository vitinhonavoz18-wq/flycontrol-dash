/**
 * Modelo visual do checkout do site público.
 *
 * Fica guardado dentro de `site_settings` — o mesmo "pacotinho" de
 * configurações do cardápio que já viaja do FlyControl para o SiteCreatorFly
 * (ver `handleSiteSettingUpdate` em `routes/_app/my-store.tsx`). Não precisa
 * de coluna nova nem de integração nova: entra junto com as que já existem.
 *
 * A escolha é de CADA estabelecimento. Um restaurante usar o modelo central
 * não muda nada para os outros.
 */

export const CHECKOUT_LAYOUTS = ["lateral", "central"] as const;

export type CheckoutLayout = (typeof CHECKOUT_LAYOUTS)[number];

/** O que vale para quem nunca escolheu — ou seja, todos os clientes atuais. */
export const DEFAULT_CHECKOUT_LAYOUT: CheckoutLayout = "lateral";

/**
 * Converte o que veio do banco em um valor confiável.
 *
 * Vazio, nulo, ausente ou escrito errado vira "lateral". Isso é o que garante
 * que nenhum cliente já cadastrado veja o visual mudar sozinho: só muda quem
 * escolher "central" de propósito.
 */
export function normalizeCheckoutLayout(raw: unknown): CheckoutLayout {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  return (CHECKOUT_LAYOUTS as readonly string[]).includes(value)
    ? (value as CheckoutLayout)
    : DEFAULT_CHECKOUT_LAYOUT;
}

export const CHECKOUT_LAYOUT_INFO: Record<CheckoutLayout, { title: string; description: string }> =
  {
    lateral: {
      title: "Layout Lateral",
      description: "Checkout exibido em painel lateral.",
    },
    central: {
      title: "Layout Central",
      description: "Checkout moderno exibido de baixo para cima.",
    },
  };
