/**
 * Trava de segurança para rotas que buscam uma URL escolhida por quem chama
 * (proxy server-side). Sem isso, o próprio servidor pode ser usado como
 * disfarce para atacar endereços internos da rede — é o mesmo tipo de checagem
 * que o SiteCreatorFly já usa (`isInvalidUrl`, em `submit-order.ts`), replicada
 * aqui para o mesmo padrão valer nos dois sistemas.
 *
 * Além de bloquear IPs privados/locais, restringe o destino a hosts que
 * fazem sentido para um link de sincronização de cardápio: o domínio do
 * SiteCreatorFly ou uma Edge Function do Supabase.
 */

const ALLOWED_HOST_SUFFIXES = [".conectfly.com.br", ".supabase.co"];
const ALLOWED_HOSTS = ["conectfly.com.br"];

function isPrivateOrInternalHost(host: string): boolean {
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    return true;
  }

  // IPv6 literais (inclui ::1 e faixas locais) — bloqueia por precaução.
  if (host.startsWith("[")) return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = parseInt(ipv4[1], 10);
    const b = parseInt(ipv4[2], 10);
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    ) {
      return true;
    }
  }

  return false;
}

/** `true` quando a URL não pode ser buscada pelo proxy server-side. */
export function isUnsafeMenuSyncUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return true;
  }

  if (parsed.protocol !== "https:") return true;

  const host = parsed.hostname.toLowerCase();
  if (!host || isPrivateOrInternalHost(host)) return true;

  const isAllowedHost =
    ALLOWED_HOSTS.includes(host) || ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));

  return !isAllowedHost;
}
