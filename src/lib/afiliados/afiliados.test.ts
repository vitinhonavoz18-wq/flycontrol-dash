import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COOKIE_DA_INDICACAO,
  apagarCookieDepoisDoCadastro,
  codigoDoEndereco,
  normalizarCodigoDeAfiliado,
  LIMITE_DO_COOKIE_SEGUNDOS,
  opcoesDoCookie,
  segundosAteVencer,
  segundosDoCookie,
  tokenDoCookie,
} from "./codigo";

describe("código do afiliado", () => {
  it("aceita o código digitado com minúscula ou espaço", () => {
    expect(normalizarCodigoDeAfiliado(" vitor10 ")).toBe("VITOR10");
    expect(normalizarCodigoDeAfiliado("ABCD")).toBe("ABCD");
  });

  it("recusa qualquer coisa fora do formato do cadastro", () => {
    for (const lixo of [
      "",
      "abc",
      "vitor-10",
      "vitor 10",
      "<script>",
      "A".repeat(21),
      "' or 1=1 --",
      null,
      undefined,
      42,
      { codigo: "VITOR10" },
    ]) {
      expect(normalizarCodigoDeAfiliado(lixo)).toBeNull();
    }
  });

  it("lê o ref do endereço, com ou sem outros parâmetros", () => {
    expect(codigoDoEndereco("?ref=vitor10")).toBe("VITOR10");
    expect(codigoDoEndereco("?utm_source=insta&ref=VITOR10&x=1")).toBe("VITOR10");
    expect(codigoDoEndereco("?aba=cardapio")).toBeNull();
    expect(codigoDoEndereco("")).toBeNull();
    expect(codigoDoEndereco("?ref=%3Cscript%3E")).toBeNull();
  });
});

describe("cookie da indicação", () => {
  it("só aceita a ficha no formato que o banco devolve", () => {
    expect(tokenDoCookie("0b7e3a9c-2f1d-4c8e-9a6b-1d2e3f4a5b6c")).toBe(
      "0b7e3a9c-2f1d-4c8e-9a6b-1d2e3f4a5b6c",
    );
    // Colar o código do afiliado direto no cookie não serve de nada.
    expect(tokenDoCookie("VITOR10")).toBeNull();
    expect(tokenDoCookie("")).toBeNull();
    expect(tokenDoCookie(undefined)).toBeNull();
  });

  it("vale até o fim da janela que o banco definiu, nem um segundo a mais", () => {
    const agora = new Date("2026-09-23T12:00:00Z");
    expect(segundosAteVencer("2026-10-23T12:00:00Z", agora)).toBe(30 * 24 * 60 * 60);
    expect(segundosAteVencer("2026-09-23T11:59:59Z", agora)).toBe(0);
    expect(segundosAteVencer("data inválida", agora)).toBe(0);
  });

  it("link sem prazo: o cookie pede o máximo que o navegador aceita (400 dias)", () => {
    const agora = new Date("2026-09-23T12:00:00Z");
    // O banco marca "sem prazo" como daqui a 100 anos.
    expect(segundosDoCookie("2126-09-23T12:00:00Z", agora)).toBe(LIMITE_DO_COOKIE_SEGUNDOS);
    expect(LIMITE_DO_COOKIE_SEGUNDOS).toBe(400 * 24 * 60 * 60);
    // Janela curta continua valendo só até o fim dela.
    expect(segundosDoCookie("2026-10-23T12:00:00Z", agora)).toBe(30 * 24 * 60 * 60);
    expect(segundosDoCookie("2026-09-23T11:00:00Z", agora)).toBe(0);
  });

  it("a página não consegue ler nem trocar o cookie", () => {
    const opcoes = opcoesDoCookie(60);
    expect(opcoes.httpOnly).toBe(true);
    expect(opcoes.secure).toBe(true);
    expect(opcoes.sameSite).toBe("lax");
    expect(opcoes.path).toBe("/");
  });

  it("some depois do cadastro quando a ficha não serve mais", () => {
    for (const encerra of [
      "ok",
      "token_ja_usado",
      "token_vencido",
      "token_desconhecido",
      "afiliado_inativo",
      "autoindicacao",
      "loja_ja_indicada",
    ]) {
      expect(apagarCookieDepoisDoCadastro(encerra)).toBe(true);
    }
    // Falha passageira ou programa pausado: a indicação continua guardada.
    for (const guarda of ["programa_desligado", "sem_token", "erro"]) {
      expect(apagarCookieDepoisDoCadastro(guarda)).toBe(false);
    }
  });
});

describe("o navegador nunca decide a indicação", () => {
  const captura = readFileSync("src/components/afiliados/CapturaDeIndicacao.tsx", "utf8");
  const rastreio = readFileSync("src/lib/afiliados/rastreio.functions.ts", "utf8");
  const cadastro = readFileSync("src/lib/signup/signup.functions.ts", "utf8");

  it("a página não grava o cookie por conta própria", () => {
    expect(captura).not.toMatch(/document\.cookie/);
    expect(captura).not.toContain(COOKIE_DA_INDICACAO);
  });

  it("o servidor valida o código antes de ir ao banco", () => {
    expect(rastreio).toMatch(/inputValidator\([\s\S]{0,120}normalizarCodigoDeAfiliado/);
  });

  it("o cadastro não recebe afiliado nenhum do formulário", () => {
    const entrada = cadastro.slice(
      cadastro.indexOf("export type SignupInput"),
      cadastro.indexOf("};", cadastro.indexOf("export type SignupInput")),
    );
    expect(entrada).not.toMatch(/ref|afiliad|affiliate/i);
    expect(cadastro).toContain("converterIndicacaoDoCadastro");
  });

  it("a indicação só é ligada nas saídas de sucesso do cadastro", () => {
    // Todas as saídas com "return {" depois da criação da loja passam pelo
    // `concluir`, que é quem converte a indicação.
    const depoisDaLoja = cadastro.slice(
      cadastro.indexOf("companyId = company.id;"),
      cadastro.indexOf("} catch (err) {", cadastro.indexOf("companyId = company.id;")),
    );
    expect(depoisDaLoja).not.toMatch(/return \{/);
    expect(depoisDaLoja.match(/return await concluir\(/g)?.length).toBe(5);
  });
});

describe("migration do programa de afiliados", () => {
  const bruto = readFileSync(
    "supabase/migrations/20260923120000_programa_de_afiliados.sql",
    "utf8",
  );
  // Comentários fora: as garantias têm de estar no código, não na explicação.
  const sql = bruto
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

  it("dinheiro em centavos inteiros e taxa em pontos-base", () => {
    expect(sql).toMatch(/amount_cents bigint/);
    expect(sql).toMatch(/commission_bps integer/);
    expect(sql).not.toMatch(/numeric|real\b|double precision|float/);
  });

  it("uma comissão por fatura, uma chave por evento", () => {
    expect(sql).toMatch(
      /create unique index if not exists affiliate_commissions_uma_por_fatura on public\.affiliate_commissions \(invoice_id\) where kind = 'commission'/,
    );
    expect(sql).toMatch(/idempotency_key text not null unique/);
  });

  it("uma loja tem um afiliado só, e ninguém troca depois", () => {
    expect(sql).toMatch(/establishment_id uuid not null unique/);
    expect(sql).toContain("create trigger afiliado_indicacao_imutavel");
    expect(sql).toContain("on conflict (establishment_id) do nothing");
  });

  it("a comissão nasce do pagamento confirmado, não da cobrança criada", () => {
    expect(sql).toMatch(/new\.status = 'paid'/);
    expect(sql).toContain("create trigger afiliado_ao_mudar_fatura");
  });

  it("um problema no programa nunca impede a fatura de ser marcada como paga", () => {
    const gatilho = sql.slice(
      sql.indexOf("function public.afiliado_ao_mudar_fatura()"),
      sql.indexOf("create trigger afiliado_ao_mudar_fatura"),
    );
    expect(gatilho).toContain("exception when others");
  });

  it("apagar uma fatura não apaga a comissão", () => {
    expect(sql).not.toMatch(/invoice_id uuid[^,]*references/);
  });

  it("o histórico de eventos não pode ser reescrito", () => {
    expect(sql).toContain("create trigger afiliado_evento_somente_leitura");
  });

  it("toda tabela do programa tem regra de acesso ligada", () => {
    for (const tabela of [
      "affiliate_settings",
      "affiliates",
      "affiliate_attributions",
      "affiliate_referrals",
      "affiliate_commissions",
      "affiliate_withdrawals",
      "affiliate_events",
    ]) {
      expect(sql).toContain(`alter table public.${tabela} enable row level security`);
    }
  });

  it("ninguém de fora escreve direto nas tabelas", () => {
    expect(sql).toMatch(
      /revoke insert, update, delete on public\.affiliate_settings, public\.affiliates, public\.affiliate_attributions, public\.affiliate_referrals, public\.affiliate_commissions, public\.affiliate_withdrawals, public\.affiliate_events from anon, authenticated/,
    );
    expect(sql).not.toMatch(/create policy [^;]* for (insert|update|delete|all)/);
  });

  it("as funções de dinheiro e de rastreio ficam só com o servidor", () => {
    const revoga = sql.slice(sql.indexOf("revoke execute on function"));
    for (const fn of [
      "afiliado_criar_comissao_da_fatura(uuid)",
      "afiliado_reverter_comissao_da_fatura(uuid, text)",
      "afiliado_liberar_comissoes()",
      "afiliado_registrar_visita(text, text, text)",
      "afiliado_converter_indicacao(uuid, uuid, uuid, text)",
    ]) {
      expect(revoga).toContain(fn);
    }
    expect(revoga).toMatch(/from public, anon, authenticated/);

    const liberadasAoLogado = sql.slice(
      sql.indexOf("grant execute on function public.afiliado_solicitar_saque()"),
    );
    expect(liberadasAoLogado.slice(0, 300)).not.toMatch(/criar_comissao|converter_indicacao/);
  });

  it("as funções de administrador conferem o administrador lá dentro", () => {
    for (const fn of [
      "afiliado_decidir_saque",
      "afiliado_definir_taxa",
      "afiliado_definir_status",
    ]) {
      const corpo = sql.slice(sql.indexOf(`function public.${fn}(`));
      expect(corpo.slice(0, 1200)).toContain("afiliado_eh_admin()");
    }
  });
});
