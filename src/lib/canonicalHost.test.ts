import { describe, expect, it } from "vitest";

import { canonicalRedirectUrl } from "./canonicalHost";

describe("endereço oficial flydelivery.app", () => {
  it("não redireciona quem já está no endereço oficial com https", () => {
    expect(canonicalRedirectUrl("https://flydelivery.app/dashboard")).toBeNull();
  });

  it("www vai para o domínio sem www, mantendo caminho e ?ref=", () => {
    expect(canonicalRedirectUrl("https://www.flydelivery.app/plans?ref=JOAO123")).toBe(
      "https://flydelivery.app/plans?ref=JOAO123",
    );
  });

  it("http vira https", () => {
    expect(canonicalRedirectUrl("http://flydelivery.app/login")).toBe(
      "https://flydelivery.app/login",
    );
    expect(canonicalRedirectUrl("http://www.flydelivery.app/")).toBe("https://flydelivery.app/");
  });

  it("não mexe no domínio antigo (avisos de pagamento e pedidos chegam por lá)", () => {
    expect(
      canonicalRedirectUrl(
        "https://flycontrol.conectfly.com.br/api/public/flycontrol-table-closed",
      ),
    ).toBeNull();
    expect(canonicalRedirectUrl("http://flycontrol.conectfly.com.br/")).toBeNull();
  });

  it("não mexe em localhost, prévias nem endereço inválido", () => {
    expect(canonicalRedirectUrl("http://localhost:3000/")).toBeNull();
    expect(canonicalRedirectUrl("https://flycontrol-dash.vitinhonavoz18.workers.dev/")).toBeNull();
    expect(canonicalRedirectUrl("não é url")).toBeNull();
  });
});
