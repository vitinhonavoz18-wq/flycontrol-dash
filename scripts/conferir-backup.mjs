#!/usr/bin/env node
/**
 * Confere se um backup do banco (feito com `supabase db dump`) está completo.
 *
 * COMO USAR
 *
 *   node scripts/conferir-backup.mjs <pasta-do-backup>
 *
 * A pasta precisa ter os três arquivos gerados pelo passo a passo
 * (docs/backup/COMO-FAZER-BACKUP-DO-BANCO.md): roles.sql, schema.sql e
 * data.sql.
 *
 * O QUE ELE FAZ — E O QUE NÃO FAZ
 *
 * Só LÊ os arquivos no seu computador. Não conecta no banco, não manda nada
 * para a internet e não mostra nenhum dado de cliente na tela: só contagens
 * ("a tabela de pedidos tem 739 linhas") e a impressão digital de cada
 * arquivo. É o conferente que conta as caixas do estoque sem abrir nenhuma.
 *
 * As contagens são comparadas com o gabarito tirado do banco em 22/10/2026
 * (docs/backup/FOTOGRAFIA-ANTES-DA-TRANCA-2026-10-22.md). Tabelas que crescem
 * o tempo todo podem vir com MAIS linhas; com MENOS, algo faltou.
 */

import { createHash } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const GABARITO = {
  "auth.users": 32,
  "public.affiliates": 1,
  "public.billing_cycles": 27,
  "public.club_cycles": 23,
  "public.crm_conversations": 458,
  "public.crm_messages": 22853,
  "public.inventory_products": 169,
  "public.invoices": 3,
  "public.marketing_customers": 627,
  "public.menu_categories": 85,
  "public.menu_products": 616,
  "public.order_items": 545,
  "public.orders": 739,
  "public.payment_transactions": 1,
  "public.pizzerias": 30,
  "public.restaurant_tables": 360,
  "public.subscriptions": 16,
  "public.table_sessions": 2,
  "public.user_roles": 32,
  "public.waiters": 1,
};

/** O que precisa aparecer no arquivo de estrutura para ele estar inteiro. */
const ESTRUTURA_MINIMA = [
  ["tabela de lojas", /CREATE TABLE (IF NOT EXISTS )?"?public"?\."?pizzerias"?/],
  ["tabela de pedidos", /CREATE TABLE (IF NOT EXISTS )?"?public"?\."?orders"?/],
  ["tabela de comandas", /CREATE TABLE (IF NOT EXISTS )?"?public"?\."?table_sessions"?/],
  ["função is_admin", /CREATE (OR REPLACE )?FUNCTION "?public"?\."?is_admin"?/],
  ["função crm_next_outbox", /CREATE (OR REPLACE )?FUNCTION "?public"?\."?crm_next_outbox"?/],
  ["visão de faturamento", /CREATE (OR REPLACE )?VIEW "?public"?\."?pizzeria_financial_metrics"?/],
];

const ARQUIVOS = ["roles.sql", "schema.sql", "data.sql"];

function tamanhoLegivel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function impressaoDigital(caminho) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(caminho)
      .on("data", (pedaco) => hash.update(pedaco))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

/** Lê o arquivo linha a linha (aguenta arquivo grande sem travar). */
async function* linhas(caminho) {
  const leitor = createInterface({ input: createReadStream(caminho), crlfDelay: Infinity });
  for await (const linha of leitor) yield linha;
}

/** Conta as linhas de dados de cada bloco `COPY tabela ... FROM stdin;`. */
async function contarDados(caminho) {
  const contagem = {};
  let atual = null;
  for await (const linha of linhas(caminho)) {
    if (atual) {
      if (linha === "\\.") atual = null;
      else contagem[atual] += 1;
      continue;
    }
    const m = linha.match(/^COPY "?([a-z_0-9]+)"?\."?([a-z_0-9]+)"? .*FROM stdin;$/i);
    if (m) {
      atual = `${m[1]}.${m[2]}`;
      contagem[atual] = contagem[atual] ?? 0;
    }
  }
  return { contagem, terminouNoMeio: atual !== null };
}

async function conferirEstrutura(caminho) {
  const achados = new Set();
  let regras = 0;
  let tabelas = 0;
  for await (const linha of linhas(caminho)) {
    if (/^CREATE POLICY /.test(linha)) regras += 1;
    if (/^CREATE TABLE /.test(linha)) tabelas += 1;
    for (const [nome, padrao] of ESTRUTURA_MINIMA) if (padrao.test(linha)) achados.add(nome);
  }
  return { achados, regras, tabelas };
}

async function main() {
  const pasta = process.argv[2];
  if (!pasta) {
    console.error("Uso: node scripts/conferir-backup.mjs <pasta-do-backup>");
    process.exit(2);
  }

  let problemas = 0;
  const falha = (msg) => {
    problemas += 1;
    console.log(`  ✗ ${msg}`);
  };
  const ok = (msg) => console.log(`  ✓ ${msg}`);

  console.log(`\nConferindo o backup em: ${pasta}\n`);
  console.log("1) Os três arquivos existem e não estão vazios");
  for (const nome of ARQUIVOS) {
    const caminho = join(pasta, nome);
    if (!existsSync(caminho)) {
      falha(`${nome} não encontrado`);
      continue;
    }
    const tamanho = statSync(caminho).size;
    if (tamanho === 0) falha(`${nome} está vazio`);
    else ok(`${nome} — ${tamanhoLegivel(tamanho)}`);
  }
  if (problemas > 0) {
    console.log("\nResultado: BACKUP INCOMPLETO. Refaça o passo a passo antes de seguir.\n");
    process.exit(1);
  }

  console.log("\n2) A estrutura do banco está inteira (schema.sql)");
  const estrutura = await conferirEstrutura(join(pasta, "schema.sql"));
  for (const [nome] of ESTRUTURA_MINIMA) {
    if (estrutura.achados.has(nome)) ok(nome);
    else falha(`não achei: ${nome}`);
  }
  ok(`${estrutura.tabelas} tabelas e ${estrutura.regras} regras de acesso no arquivo`);
  if (estrutura.tabelas < 100) falha("menos de 100 tabelas — o banco tem 122 só no esquema public");

  console.log("\n3) Os dados vieram completos (data.sql), comparando com o gabarito");
  const { contagem, terminouNoMeio } = await contarDados(join(pasta, "data.sql"));
  if (terminouNoMeio) falha("o arquivo de dados termina no meio de uma tabela (cópia cortada)");
  for (const [tabela, esperado] of Object.entries(GABARITO)) {
    const achado = contagem[tabela];
    if (achado === undefined) falha(`${tabela}: tabela ausente no backup`);
    else if (achado < esperado)
      falha(`${tabela}: ${achado} linhas (esperado pelo menos ${esperado})`);
    else ok(`${tabela}: ${achado} linhas (gabarito: ${esperado})`);
  }
  const totalLinhas = Object.values(contagem).reduce((a, b) => a + b, 0);
  ok(`${Object.keys(contagem).length} tabelas com dados, ${totalLinhas} linhas no total`);

  console.log("\n4) Impressão digital (SHA-256) — anote junto do backup");
  for (const nome of ARQUIVOS) {
    console.log(`  ${nome}: ${await impressaoDigital(join(pasta, nome))}`);
  }

  if (problemas > 0) {
    console.log(`\nResultado: ${problemas} PROBLEMA(S). Não use este backup; refaça a cópia.\n`);
    process.exit(1);
  }
  console.log("\nResultado: BACKUP CONFERIDO. Pode guardar com segurança.\n");
}

main().catch((erro) => {
  console.error("Não consegui ler o backup:", erro.message);
  process.exit(1);
});
