/**
 * Assinatura dos webhooks enviados ao SiteCreatorFly.
 *
 * Esquema (espelhado em `src/lib/webhookSignature.ts` do conectfly):
 *   header  `x-fl-signature: t=<unix_seconds>,v1=<hex hmac-sha256>`
 *   payload assinado: `${t}.${rawBody}` — o corpo EXATO enviado, sem reserializar
 *   segredo: `FL_WEBHOOK_SECRET`, o mesmo valor nos dois projetos
 *
 * O timestamp entra na assinatura para impedir replay: o SiteCreatorFly só
 * aceita requisições dentro de uma janela de 5 minutos.
 *
 * TODO(fase 2): extrair para um pacote compartilhado entre FL e SF, junto
 * com os tipos de payload da integração.
 */

export const SIGNATURE_HEADER = "x-fl-signature";

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buffer = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Devolve o valor do header de assinatura para `rawBody`, ou `null` quando
 * `FL_WEBHOOK_SECRET` não está configurado — nesse caso o webhook segue sem
 * assinatura e o SiteCreatorFly registra em log (ou rejeita, se já estiver
 * exigindo). Só use com o mesmo texto que vai no corpo da requisição.
 */
export async function signWebhookBody(rawBody: string): Promise<string | null> {
  const secret = (process.env.FL_WEBHOOK_SECRET || "").trim();
  if (!secret) return null;

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await hmacHex(secret, `${timestamp}.${rawBody}`);
  return `t=${timestamp},v1=${signature}`;
}
