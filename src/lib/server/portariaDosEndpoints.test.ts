import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardas da portaria dos endereços de servidor.
 *
 * O DEFEITO QUE ISSO EVITA DE VOLTAR
 *
 * Dois endereços trabalhavam com a chave mestra do banco — a que passa por
 * cima de todas as regras — e não perguntavam quem estava do outro lado:
 *
 *   - o que recalcula as contas das mesas recebia só o número da loja e já
 *     saía juntando pedidos e regravando totais;
 *   - o de teste do FIQON se contentava com a chave de API colada no corpo do
 *     pedido, uma chave que vazou e que hoje nem o dono legítimo tem em mãos.
 *
 * Endereço que usa chave mestra sem conferir quem chama é a porta dos fundos
 * destrancada: não importa quantas travas tem a porta da frente.
 */

const RAIZ = process.cwd();

function soCodigo(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("quem pode chamar os endereços que usam a chave mestra", () => {
  it("recalcular as contas das mesas exige ser o dono da loja", () => {
    const codigo = soCodigo("src/routes/api/sync-table-sessions.ts");
    expect(codigo).toContain("requireOwnerOrAdmin");
    // A conferência tem de vir ANTES de qualquer escrita.
    const posPortaria = codigo.indexOf("requireOwnerOrAdmin(request");
    const posEscrita = codigo.indexOf(".insert(");
    expect(posPortaria).toBeGreaterThan(0);
    expect(posEscrita).toBeGreaterThan(posPortaria);
  });

  it("o teste do FIQON não aceita mais chave de API colada no corpo", () => {
    const codigo = soCodigo("src/routes/api/pizzerias.fiqon-test.ts");
    expect(codigo).toContain("requireOwnerOrAdmin");
    expect(codigo).not.toContain('.eq("api_key"');
  });

  it("o pedido de fora tem teto por minuto", () => {
    // Sem teto, quem estiver com uma chave vazada empurra pedido falso sem
    // parar — e cada um entra na fatura do lojista.
    const codigo = soCodigo("src/routes/api/orders.ts");
    expect(codigo).toContain("rate_limited");
    expect(codigo).toContain("429");
  });

  it("o registro de eventos não guarda telefone, endereço nem token", () => {
    const codigo = soCodigo("src/routes/api/orders.ts");
    expect(codigo).not.toContain("ORDER_RAW_PAYLOAD");
    expect(codigo).not.toContain("JSON.stringify(orderToInsert)");
    expect(codigo).not.toMatch(/com token \$\{tableToken\}/);
  });
});
