import { describe, expect, it } from "vitest";
import {
  ROTAS_NAO_LANCADAS,
  TENTAR_DE_NOVO_EM_SEGUNDOS,
  respostaSeNaoLancada,
} from "./naoLancadas";

/**
 * Marketing e FlyDelivery saíram do menu porque ainda não estão prontos.
 *
 * Sumir do menu sozinho não basta: quem digitar o endereço, ou abrir um link
 * salvo nos favoritos, entraria assim mesmo numa tela pela metade. Por isso o
 * servidor responde 503 nesses caminhos.
 *
 * A checagem mora no módulo (e não dentro do server.ts) justamente para caber
 * neste teste. A ligação com o servidor foi conferida à mão contra o servidor
 * de verdade: 503 com `retry-after: 3600` em /marketing e /flydelivery, e
 * /dashboard intocado.
 */

const url = (caminho: string) => `https://flycontrol.exemplo.com${caminho}`;

describe("rotas ainda não lançadas respondem 503", () => {
  it.each([...ROTAS_NAO_LANCADAS])("%s responde 503", (rota) => {
    const r = respostaSeNaoLancada(url(rota));
    expect(r).not.toBeNull();
    expect(r!.status).toBe(503);
  });

  it("diz quando tentar de novo", () => {
    // Sem o Retry-After, um robô de busca trata a indisponibilidade como
    // permanente e tira a página do índice.
    const r = respostaSeNaoLancada(url("/marketing"))!;
    expect(r.headers.get("Retry-After")).toBe(String(TENTAR_DE_NOVO_EM_SEGUNDOS));
    expect(r.headers.get("Content-Type")).toContain("text/html");
  });

  it("não deixa a resposta ficar em cache", () => {
    // Senão o lojista continuaria vendo "em breve" no dia do lançamento.
    expect(respostaSeNaoLancada(url("/marketing"))!.headers.get("Cache-Control")).toBe("no-store");
  });

  it("pega barra final, maiúsculas e sub-caminho", () => {
    for (const caminho of ["/marketing/", "/MARKETING", "/Marketing/", "/flydelivery/qualquer"]) {
      expect(respostaSeNaoLancada(url(caminho)), caminho).not.toBeNull();
    }
  });
});

describe("o 503 não escapa para o resto do painel", () => {
  it.each([
    "/",
    "/dashboard",
    "/menu",
    "/settings",
    "/billing",
    "/api/orders",
    // Só o prefixo não basta: outra rota que COMECE com o mesmo texto tem de
    // passar. É a diferença entre "a rua Marketing" e "a rua Marketingópolis".
    "/marketingoutracoisa",
    "/flydeliveryzinho",
  ])("%s continua passando", (caminho) => {
    expect(respostaSeNaoLancada(url(caminho))).toBeNull();
  });

  it("endereço malformado não derruba o servidor", () => {
    // Esta função roda na porta de entrada: se ela lançar, o site inteiro cai.
    expect(respostaSeNaoLancada("nao-e-uma-url")).toBeNull();
  });
});
