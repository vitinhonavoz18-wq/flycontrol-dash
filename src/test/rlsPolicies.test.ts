/**
 * Trava contra o retorno das portas abertas no banco.
 *
 * A auditoria encontrou regras de acesso que entregavam dados de TODOS os
 * restaurantes para qualquer visitante: a chave de API de cada loja, o token
 * impresso no QR Code das mesas, as comandas abertas com nome do cliente e
 * valor da conta, e até a permissão de gravar pedido em nome de qualquer loja.
 *
 * Este teste lê os arquivos de migração e reprova se alguma dessas regras
 * voltar a existir sem ser removida depois. É o equivalente a conferir, antes
 * de fechar a loja, se as chaves não voltaram para debaixo do tapete.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase/migrations");

/** Migrações em ordem cronológica — o nome do arquivo começa com a data. */
function migrationsInOrder(): { file: string; sql: string }[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8") }));
}

/**
 * `true` quando a regra é criada em algum momento e nunca removida depois.
 * Criar e depois derrubar é normal (foi o que a correção fez); o que não pode
 * é a última palavra sobre a regra ser "criada".
 */
function policyStillActive(policyName: string): boolean {
  let active = false;
  for (const { sql } of migrationsInOrder()) {
    const lower = sql.toLowerCase();
    const name = policyName.toLowerCase();
    // Percorre o arquivo na ordem em que os comandos aparecem.
    const events: { at: number; creates: boolean }[] = [];
    for (const match of lower.matchAll(new RegExp(`create policy\\s+"${name}"`, "g"))) {
      events.push({ at: match.index ?? 0, creates: true });
    }
    for (const match of lower.matchAll(new RegExp(`drop policy[^;]*"${name}"`, "g"))) {
      events.push({ at: match.index ?? 0, creates: false });
    }
    events.sort((a, b) => a.at - b.at);
    for (const event of events) active = event.creates;
  }
  return active;
}

describe("regras de acesso do banco (RLS)", () => {
  const PROIBIDAS: { policy: string; porque: string }[] = [
    {
      policy: "pizzerias_public_select",
      porque:
        "entregava todas as colunas de toda loja ativa a qualquer visitante — inclusive a api_key, que vale como senha para lançar pedidos em nome da loja",
    },
    {
      policy: "pizzerias_claim_unowned",
      porque:
        "deixava qualquer pessoa logada se declarar dona de uma loja sem dono, levando junto pedidos, cardápio e faturamento",
    },
    {
      policy: "orders_insert_policy",
      porque: "permitia gravar pedido em nome de qualquer loja, com o valor que quisesse",
    },
    {
      policy: "orders_anon_insert_policy",
      porque: "mesma coisa, pela porta do visitante anônimo",
    },
    {
      policy: "tables_anon_select_by_token",
      porque: "entregava o token impresso no QR Code de todas as mesas de todos os restaurantes",
    },
    {
      policy: "Public can read session lifecycle",
      porque:
        "entregava todas as comandas de todos os restaurantes, com nome do cliente, valor da conta e o segredo da comanda",
    },
    {
      policy: "Public can view order items",
      porque: "entregava os itens de todo pedido de toda loja",
    },
    {
      policy: "Public can insert order items",
      porque: "deixava qualquer um inventar itens em pedidos alheios",
    },
    {
      policy: "Public can insert external logs",
      porque: "deixava qualquer um encher a tabela de registros de lixo",
    },
    {
      policy: "user_roles_read_policy",
      porque: "mostrava a lista de administradores da plataforma a qualquer usuário logado",
    },
  ];

  for (const { policy, porque } of PROIBIDAS) {
    it(`"${policy}" não pode estar valendo: ${porque}`, () => {
      expect(policyStillActive(policy)).toBe(false);
    });
  }

  // A migração que fechou as portas. O histórico anterior a ela não pode ser
  // reescrito — e não precisa: cada regra antiga já é derrubada por nome
  // acima. O que esta checagem impede é uma migração NOVA reabrir a porta.
  const MIGRACAO_DO_FECHAMENTO = "20260821120000_rls_hardening.sql";

  it("nenhuma migração posterior ao fechamento concede escrita ampla ao visitante anônimo", () => {
    const suspeitas: string[] = [];
    for (const { file, sql } of migrationsInOrder()) {
      if (file < MIGRACAO_DO_FECHAMENTO) continue;
      const lower = sql.toLowerCase();
      // "for insert to anon ... with check (true)" e variações.
      const regex =
        /create policy[^;]*for\s+(insert|update|delete|all)[^;]*to\s+[^;]*\banon\b[^;]*with\s+check\s*\(\s*true\s*\)/g;
      if (regex.test(lower)) suspeitas.push(file);
    }
    expect(suspeitas).toEqual([]);
  });
});
