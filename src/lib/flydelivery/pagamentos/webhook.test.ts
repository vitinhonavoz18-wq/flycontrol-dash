import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { chaveDoAviso, conferirAutenticidade, iguaisEmTempoConstante, lerAviso } from "./webhook";

const SEGREDO = "segredo-do-aviso";
const CORPO = '{"event":"transaction","data":{"identifier":"SYNC-1","status":"completed"}}';
const hmac = (texto: string, segredo = SEGREDO) =>
  createHmac("sha256", segredo).update(texto).digest("hex");
const cab = (h: Record<string, string>) => new Headers(h);

describe("autenticidade do aviso da SyncPay", () => {
  it("aceita HMAC-SHA256 do corpo bruto em X-SyncPay-Signature", async () => {
    const r = await conferirAutenticidade({
      corpoBruto: CORPO,
      cabecalhos: cab({ "X-SyncPay-Signature": hmac(CORPO) }),
      segredo: SEGREDO,
    });
    expect(r).toEqual({ ok: true, metodo: "hmac" });
  });

  it("aceita o prefixo sha256=", async () => {
    const r = await conferirAutenticidade({
      corpoBruto: CORPO,
      cabecalhos: cab({ "x-syncpay-signature": `sha256=${hmac(CORPO)}` }),
      segredo: SEGREDO,
    });
    expect(r.ok).toBe(true);
  });

  it("recusa assinatura errada, de outro segredo, ou de corpo alterado", async () => {
    const casos = [
      { corpo: CORPO, assinatura: "abc123" },
      { corpo: CORPO, assinatura: hmac(CORPO, "outro-segredo") },
      // Mesmo conteúdo, só com espaço a mais: a assinatura vale para os bytes EXATOS.
      { corpo: CORPO.replace(":", ": "), assinatura: hmac(CORPO) },
      // Valor do pedido trocado por quem interceptou.
      { corpo: CORPO.replace("completed", 'completed","amount":1'), assinatura: hmac(CORPO) },
    ];
    for (const caso of casos) {
      const r = await conferirAutenticidade({
        corpoBruto: caso.corpo,
        cabecalhos: cab({ "x-syncpay-signature": caso.assinatura }),
        segredo: SEGREDO,
      });
      expect(r).toEqual({ ok: false, motivo: "assinatura_invalida" });
    }
  });

  it("formato com horário (t=,v1=): aceita dentro da janela e recusa reenvio antigo", async () => {
    const agora = 1_800_000_000;
    const dentro = await conferirAutenticidade({
      corpoBruto: CORPO,
      cabecalhos: cab({
        "x-syncpay-signature": `t=${agora - 60},v1=${hmac(`${agora - 60}.${CORPO}`)}`,
      }),
      segredo: SEGREDO,
      agoraSegundos: agora,
    });
    expect(dentro.ok).toBe(true);

    const velho = await conferirAutenticidade({
      corpoBruto: CORPO,
      cabecalhos: cab({
        "x-syncpay-signature": `t=${agora - 3600},v1=${hmac(`${agora - 3600}.${CORPO}`)}`,
      }),
      segredo: SEGREDO,
      agoraSegundos: agora,
    });
    expect(velho).toEqual({ ok: false, motivo: "fora_da_janela" });
  });

  it("aceita Authorization: Bearer <segredo> (formato da documentação de ajuda) e recusa outro valor", async () => {
    expect(
      await conferirAutenticidade({
        corpoBruto: CORPO,
        cabecalhos: cab({ Authorization: `Bearer ${SEGREDO}` }),
        segredo: SEGREDO,
      }),
    ).toEqual({ ok: true, metodo: "bearer" });
    expect(
      await conferirAutenticidade({
        corpoBruto: CORPO,
        cabecalhos: cab({ Authorization: "Bearer chute" }),
        segredo: SEGREDO,
      }),
    ).toEqual({ ok: false, motivo: "assinatura_invalida" });
  });

  it("sem assinatura nenhuma, ou sem segredo configurado no servidor, recusa", async () => {
    expect(
      await conferirAutenticidade({ corpoBruto: CORPO, cabecalhos: cab({}), segredo: SEGREDO }),
    ).toEqual({
      ok: false,
      motivo: "sem_assinatura",
    });
    expect(
      await conferirAutenticidade({
        corpoBruto: CORPO,
        cabecalhos: cab({ "x-syncpay-signature": hmac(CORPO) }),
        segredo: "",
      }),
    ).toEqual({ ok: false, motivo: "sem_segredo" });
  });

  it("comparação em tempo constante acerta igualdade", () => {
    expect(iguaisEmTempoConstante("abc", "abc")).toBe(true);
    expect(iguaisEmTempoConstante("abc", "abd")).toBe(false);
    expect(iguaisEmTempoConstante("abc", "abcd")).toBe(false);
  });
});

describe("leitura do aviso", () => {
  it("acha a transação dentro de data, ou no próprio aviso", () => {
    expect(
      lerAviso({ event_id: "evt-1", event: "transaction", data: { identifier: "S1" } }),
    ).toEqual({
      eventoId: "evt-1",
      tipo: "transaction",
      referencia: "S1",
    });
    expect(lerAviso({ reference_id: "S2", status: "completed" }).referencia).toBe("S2");
    expect(lerAviso(null)).toEqual({ eventoId: null, tipo: null, referencia: null });
  });

  it("num aviso 'achatado', o id da TRANSAÇÃO não é usado como id do aviso", () => {
    // Senão o aviso "pago" seria descartado como repetição do "pendente".
    expect(lerAviso({ id: "S3", status: "completed" }).eventoId).toBeNull();
    expect(lerAviso({ id: "evt-9", data: { id: "S3" } }).eventoId).toBe("evt-9");
  });

  it("chave contra repetição: event_id quando existe, senão a impressão digital do corpo", async () => {
    expect(await chaveDoAviso({ eventoId: "evt-1", tipo: null, referencia: null }, CORPO)).toBe(
      "id:evt-1",
    );
    const a = await chaveDoAviso({ eventoId: null, tipo: null, referencia: "S1" }, CORPO);
    const b = await chaveDoAviso({ eventoId: null, tipo: null, referencia: "S1" }, CORPO);
    const c = await chaveDoAviso(
      { eventoId: null, tipo: null, referencia: "S1" },
      CORPO.replace("completed", "pending"),
    );
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
