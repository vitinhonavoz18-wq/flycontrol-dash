import { describe, expect, it } from "vitest";
import { isUnsafeMenuSyncUrl, isUnsafeOutboundWebhookUrl } from "./urlSafety";

describe("isUnsafeOutboundWebhookUrl", () => {
  it("aceita um endereço https público comum", () => {
    expect(isUnsafeOutboundWebhookUrl("https://hooks.fiqon.app/abc123")).toBe(false);
  });

  it("recusa endereços que apontam para dentro da própria máquina", () => {
    for (const url of [
      "https://localhost/webhook",
      "https://127.0.0.1/webhook",
      "https://10.0.0.5/webhook",
      "https://192.168.0.10/webhook",
      "https://172.16.3.4/webhook",
      "https://169.254.169.254/latest/meta-data/",
      "https://metadata.google.internal/computeMetadata/v1/",
      "https://algo.internal/webhook",
      "https://[::1]/webhook",
    ]) {
      expect(isUnsafeOutboundWebhookUrl(url), url).toBe(true);
    }
  });

  it("recusa http sem cadeado e lixo que não é endereço", () => {
    expect(isUnsafeOutboundWebhookUrl("http://exemplo.com/webhook")).toBe(true);
    expect(isUnsafeOutboundWebhookUrl("file:///etc/passwd")).toBe(true);
    expect(isUnsafeOutboundWebhookUrl("nao-e-um-endereco")).toBe(true);
  });
});

describe("isUnsafeMenuSyncUrl", () => {
  it("continua aceitando só os destinos conhecidos", () => {
    expect(isUnsafeMenuSyncUrl("https://conectfly.com.br/api/menu")).toBe(false);
    expect(isUnsafeMenuSyncUrl("https://loja.conectfly.com.br/api/menu")).toBe(false);
    expect(isUnsafeMenuSyncUrl("https://x.supabase.co/functions/v1/menu")).toBe(false);
    expect(isUnsafeMenuSyncUrl("https://site-do-atacante.com/menu")).toBe(true);
    expect(isUnsafeMenuSyncUrl("https://127.0.0.1/menu")).toBe(true);
  });
});
