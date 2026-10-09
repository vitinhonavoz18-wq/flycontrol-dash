/**
 * Configuração do Pix com split, lida do ambiente do servidor (Cloudflare).
 *
 * Os valores sensíveis entram pelo cofre do Cloudflare, nunca pelo código:
 *
 *   wrangler secret put SYNCPAY_CLIENT_ID
 *   wrangler secret put SYNCPAY_CLIENT_SECRET
 *   wrangler secret put SYNCPAY_WEBHOOK_SECRET
 *   wrangler secret put FLYDELIVERY_RECONCILE_SECRET
 *
 * e, como variáveis comuns (não secretas):
 *
 *   SYNCPAY_ENABLED=true            ← a chave geral. Sem ela, nenhuma cobrança
 *                                     é criada, mesmo com tudo configurado.
 *   SYNCPAY_API_BASE_URL            ← opcional; padrão https://api.syncpayments.com.br
 *   FLYCONTROL_PUBLIC_URL           ← já existe; monta o endereço do aviso
 *
 * SYNCPAY_PLATFORM_FEE_PERCENT não é lido em tempo de execução: a comissão
 * mora no banco e é mudada pelo painel administrativo (com auditoria). Ter o
 * número em dois lugares seria ter dois donos para o mesmo dinheiro.
 */

import { SYNCPAY_URL_PADRAO } from "./syncpay";

export type ConfigDoPix = {
  ligado: boolean;
  clientId: string;
  clientSecret: string;
  segredoDoAviso: string;
  baseUrl: string;
  urlDoAviso: string | null;
  segredoDaConciliacao: string;
};

function limpo(valor: string | undefined): string {
  return (valor ?? "").trim().replace(/^["']|["']$/g, "");
}

export function lerConfigDoPix(env: Record<string, string | undefined> = process.env): ConfigDoPix {
  const publica = limpo(env.FLYCONTROL_PUBLIC_URL).replace(/\/+$/, "");
  return {
    ligado: limpo(env.SYNCPAY_ENABLED).toLowerCase() === "true",
    clientId: limpo(env.SYNCPAY_CLIENT_ID),
    clientSecret: limpo(env.SYNCPAY_CLIENT_SECRET),
    segredoDoAviso: limpo(env.SYNCPAY_WEBHOOK_SECRET),
    baseUrl: limpo(env.SYNCPAY_API_BASE_URL) || SYNCPAY_URL_PADRAO,
    urlDoAviso: publica.startsWith("https://") ? `${publica}/api/webhooks/syncpay` : null,
    segredoDaConciliacao: limpo(env.FLYDELIVERY_RECONCILE_SECRET),
  };
}

/** O que falta para cobrar de verdade. Lista vazia = pronto. */
export function pendenciasDeConfiguracao(config: ConfigDoPix): string[] {
  const faltando: string[] = [];
  if (!config.clientId) faltando.push("SYNCPAY_CLIENT_ID");
  if (!config.clientSecret) faltando.push("SYNCPAY_CLIENT_SECRET");
  if (!config.segredoDoAviso) faltando.push("SYNCPAY_WEBHOOK_SECRET");
  if (!config.urlDoAviso) faltando.push("FLYCONTROL_PUBLIC_URL (com https://)");
  if (!config.ligado) faltando.push("SYNCPAY_ENABLED=true");
  return faltando;
}
