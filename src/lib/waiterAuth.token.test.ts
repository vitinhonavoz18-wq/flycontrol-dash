/**
 * O crachá do garçom (token) precisa recusar tudo que não foi assinado por
 * nós. Estes testes existem para que a trava não volte a cair sozinha numa
 * próxima mudança: já houve um valor fixo escrito no código servindo de
 * segredo, o que é o mesmo que a chave da loja pendurada na porta.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyWaiterToken } from "./waiterAuth.functions";

const WAITER_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_A = "22222222-2222-4222-8222-222222222222";

function toB64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function mintToken(secret: string, waiterId: string, tenantId: string, expiresAt: number) {
  const payload = `${waiterId}.${tenantId}.${expiresAt}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret) as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(payload) as unknown as BufferSource,
    ),
  );
  return `${payload}.${toB64(sig)}`;
}

const REAL_SECRET = "segredo-de-verdade-do-servidor-0123456789";
const original = process.env.WAITER_TOKEN_SECRET;

beforeEach(() => {
  process.env.WAITER_TOKEN_SECRET = REAL_SECRET;
});

afterEach(() => {
  if (original === undefined) delete process.env.WAITER_TOKEN_SECRET;
  else process.env.WAITER_TOKEN_SECRET = original;
});

describe("verifyWaiterToken", () => {
  it("aceita um crachá válido e devolve de qual loja ele é", async () => {
    const token = await mintToken(REAL_SECRET, WAITER_ID, TENANT_A, Date.now() + 60_000);
    expect(await verifyWaiterToken(token)).toEqual({
      waiterId: WAITER_ID,
      tenantId: TENANT_A,
    });
  });

  it("recusa crachá assinado com outro segredo (falsificado)", async () => {
    const token = await mintToken("fly-waiter-fallback", WAITER_ID, TENANT_A, Date.now() + 60_000);
    expect(await verifyWaiterToken(token)).toBeNull();
  });

  it("recusa crachá em que alguém trocou a loja depois de assinado", async () => {
    const token = await mintToken(REAL_SECRET, WAITER_ID, TENANT_A, Date.now() + 60_000);
    const [waiterId, , exp, sig] = token.split(".");
    const forged = `${waiterId}.33333333-3333-4333-8333-333333333333.${exp}.${sig}`;
    expect(await verifyWaiterToken(forged)).toBeNull();
  });

  it("recusa crachá vencido", async () => {
    const token = await mintToken(REAL_SECRET, WAITER_ID, TENANT_A, Date.now() - 1000);
    expect(await verifyWaiterToken(token)).toBeNull();
  });

  it("recusa lixo sem derrubar o servidor", async () => {
    expect(await verifyWaiterToken("")).toBeNull();
    expect(await verifyWaiterToken("a.b.c")).toBeNull();
    expect(
      await verifyWaiterToken(`${WAITER_ID}.${TENANT_A}.${Date.now() + 60_000}.$$$nao-e-base64$$$`),
    ).toBeNull();
  });

  it("sem segredo configurado, o portão fecha em vez de aceitar qualquer um", async () => {
    const token = await mintToken(REAL_SECRET, WAITER_ID, TENANT_A, Date.now() + 60_000);
    delete process.env.WAITER_TOKEN_SECRET;
    const previousServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      await expect(verifyWaiterToken(token)).rejects.toThrow(/WAITER_TOKEN_SECRET/);
    } finally {
      if (previousServiceRole !== undefined) {
        process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRole;
      }
    }
  });
});
