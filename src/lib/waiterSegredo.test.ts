import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda do segredo que assina o crachá do garçom.
 *
 * O DEFEITO QUE ISSO EVITA DE VOLTAR
 *
 * O código escolhia o segredo assim: primeiro a chave secreta do banco; se
 * faltasse, a chave PÚBLICA (a que viaja dentro de todo cardápio e qualquer
 * pessoa lê); se faltasse essa também, um texto fixo escrito no próprio
 * arquivo.
 *
 * Com qualquer uma dessas duas últimas, quem soubesse do segredo fabricava um
 * crachá em nome de qualquer garçom de qualquer loja. É o carimbo da portaria
 * em cima do balcão, junto com a almofada de tinta.
 *
 * A regra agora é: ou existe segredo de verdade, ou o sistema recusa.
 */

const codigo = readFileSync(join(process.cwd(), "src/lib/waiterAuth.functions.ts"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("o segredo que assina o acesso do garçom", () => {
  it("nunca cai na chave pública do banco", () => {
    expect(codigo).not.toContain("SUPABASE_PUBLISHABLE_KEY");
  });

  it("nunca cai num texto fixo escrito no código", () => {
    expect(codigo).not.toContain("fly-waiter-fallback");
    // Um segredo escrito entre aspas ao lado do "||" é sempre o mesmo erro.
    expect(codigo).not.toMatch(/process\.env\.[A-Z_]+\s*\|\|\s*"/);
  });

  it("faltando segredo, recusa em vez de improvisar", () => {
    expect(codigo).toMatch(/if\s*\(!secret\)\s*\{?\s*throw/);
  });
});
