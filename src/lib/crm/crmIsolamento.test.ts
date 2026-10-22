import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * AS PORTAS NOVAS DO CHAT CONFEREM A LOJA — em todas, sem exceção.
 *
 * Cada função abaixo recebe do navegador o número de uma mensagem ou de um
 * cliente. Se alguma esquecesse de conferir a loja, bastaria trocar o número
 * para ler o áudio, reenviar a mensagem ou mudar a ficha do cliente de OUTRO
 * restaurante. Este teste lê o código e trava a porta: quem apagar a
 * conferência vê o teste quebrar antes de o defeito chegar ao ar.
 */

const codigo = readFileSync(join(process.cwd(), "src/lib/crm/crm.functions.ts"), "utf8");

function corpoDe(nome: string): string {
  const inicio = codigo.indexOf(`export const ${nome} =`);
  expect(inicio, `função ${nome} não encontrada`).toBeGreaterThan(-1);
  const fim = codigo.indexOf("export const ", inicio + 10);
  return codigo.slice(inicio, fim === -1 ? undefined : fim);
}

describe("as funções novas passam pelo porteiro e amarram a loja", () => {
  for (const nome of [
    "reenviarMensagem",
    "atualizarFichaDoCliente",
    "listarConversas",
    "listarMensagens",
  ]) {
    it(`${nome} confere dono/contratação e filtra pela loja conferida`, () => {
      const corpo = corpoDe(nome);
      expect(corpo).toContain("requireSupabaseAuth");
      expect(corpo).toContain("await porteiro(context, data.tenantId)");
      expect(corpo).toMatch(/\.eq\("tenant_id", tenantId\)/);
      // Nunca a loja que veio da requisição.
      expect(corpo).not.toMatch(/\.eq\("tenant_id", data\.tenantId\)/);
    });
  }

  it("carregarMidia entrega a loja CONFERIDA para quem busca o arquivo", () => {
    const corpo = corpoDe("carregarMidia");
    expect(corpo).toContain("await porteiro(context, data.tenantId)");
    expect(corpo).toContain("recuperarMidiaDaMensagem(tenantId, data.messageId)");
  });

  it("reenviar só mexe em mensagem da loja que de fato falhou", () => {
    const corpo = corpoDe("reenviarMensagem");
    expect(corpo).toContain('.eq("direction", "out")');
    expect(corpo).toContain('.eq("status", "failed")');
  });

  it("a busca limpa o que a pessoa digitou antes de montar o filtro", () => {
    const corpo = corpoDe("listarConversas");
    expect(corpo).toContain('.replace(/[%_,().*:"\\\\]/g, " ")');
  });

  it("o endereço antigo da UAZAPI não vai para o navegador", () => {
    const corpo = corpoDe("listarMensagens");
    expect(corpo).toContain("media_url: null");
    expect(corpo).toContain("({ external_id, ...m })");
  });
});
