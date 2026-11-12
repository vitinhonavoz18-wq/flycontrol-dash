/**
 * Endereço oficial do painel: https://flydelivery.app (sem "www").
 *
 * Quem chega por www.flydelivery.app ou por http:// (sem cadeado) é mandado,
 * com redirecionamento permanente (301), para o mesmo caminho no endereço
 * oficial — como a placa "entrada pela outra porta" que leva ao mesmo balcão.
 *
 * De propósito NÃO mexe no domínio antigo (flycontrol.conectfly.com.br):
 * InfinityPay e SiteCreatorFly ainda mandam avisos de pagamento e pedido para
 * lá, e um redirecionamento no meio do caminho pode fazer o aviso se perder.
 * Também não mexe em localhost nem nas prévias do workers.dev.
 */
export const CANONICAL_HOST = "flydelivery.app";

const HOSTS_REDIRECIONADOS = new Set([CANONICAL_HOST, `www.${CANONICAL_HOST}`]);

/** Devolve o endereço para onde redirecionar, ou null se já está certo. */
export function canonicalRedirectUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!HOSTS_REDIRECIONADOS.has(host)) return null;
  if (host === CANONICAL_HOST && url.protocol === "https:") return null;

  return `https://${CANONICAL_HOST}${url.pathname}${url.search}`;
}
