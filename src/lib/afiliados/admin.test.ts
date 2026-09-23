import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bpsParaCampo,
  centavosParaCampo,
  diasDoTexto,
  diasParaCampo,
  lembreteDeRepasses,
  linkDoWhatsApp,
  NOME_DO_EVENTO,
  porcentagemParaBps,
  reaisParaCentavos,
  resumoDoEvento,
} from "./adminRotulos";
import { dataDoDia } from "./validacao";

describe("campos de número do painel", () => {
  it("porcentagem digitada vira pontos-base sem arredondar", () => {
    expect(porcentagemParaBps("15")).toBe(1500);
    expect(porcentagemParaBps("12,5")).toBe(1250);
    expect(porcentagemParaBps("12.55")).toBe(1255);
    expect(porcentagemParaBps("0")).toBe(0);
    expect(porcentagemParaBps("100")).toBe(10000);
    expect(porcentagemParaBps("100,01")).toBeNull();
    expect(porcentagemParaBps("12,555")).toBeNull();
    expect(porcentagemParaBps("-5")).toBeNull();
    expect(porcentagemParaBps("abc")).toBeNull();
  });

  it("reais digitados viram centavos inteiros", () => {
    expect(reaisParaCentavos("100")).toBe(10000);
    expect(reaisParaCentavos("100,5")).toBe(10050);
    expect(reaisParaCentavos("1.000,00")).toBe(100000);
    expect(reaisParaCentavos("R$ 0,99")).toBe(99);
    expect(reaisParaCentavos("0,1")).toBe(10);
    expect(reaisParaCentavos("10,999")).toBeNull();
    expect(reaisParaCentavos("dez")).toBeNull();
  });

  it("dias de repasse digitados viram lista organizada", () => {
    expect(diasDoTexto("10, 20")).toEqual([10, 20]);
    expect(diasDoTexto("20 e 10")).toEqual([10, 20]);
    expect(diasDoTexto("5;15;25")).toEqual([5, 15, 25]);
    expect(diasDoTexto("10, 10")).toEqual([10]);
    expect(diasDoTexto("29")).toBeNull(); // não existe em fevereiro
    expect(diasDoTexto("0")).toBeNull();
    expect(diasDoTexto("1, 2, 3, 4, 5")).toBeNull(); // no máximo 4
    expect(diasDoTexto("")).toBeNull();
    expect(diasDoTexto("dez")).toBeNull();
    expect(diasParaCampo([20, 10])).toBe("10, 20");
    expect(diasDoTexto(diasParaCampo([10, 20]))).toEqual([10, 20]);
  });

  it("celular do parceiro abre o WhatsApp; data do repasse não muda de dia", () => {
    expect(linkDoWhatsApp("11977776666")).toBe("https://wa.me/5511977776666");
    expect(linkDoWhatsApp("(11) 3333-4444")).toBe("https://wa.me/551133334444");
    expect(linkDoWhatsApp("+55 11 97777-6666")).toBe("https://wa.me/5511977776666");
    expect(linkDoWhatsApp("123")).toBeNull();
    expect(linkDoWhatsApp(null)).toBeNull();
    expect(dataDoDia("2026-10-10")).toBe("10/10/2026");
    expect(dataDoDia(null)).toBe("—");
  });

  it("o caminho de volta preenche o campo do jeito que se digita", () => {
    expect(centavosParaCampo(10000)).toBe("100,00");
    expect(centavosParaCampo(10050)).toBe("100,50");
    expect(bpsParaCampo(1500)).toBe("15");
    expect(bpsParaCampo(1250)).toBe("12,5");
    for (const bps of [0, 1, 999, 1500, 1255, 10000]) {
      expect(porcentagemParaBps(bpsParaCampo(bps))).toBe(bps);
    }
    for (const c of [0, 1, 99, 10000, 123456]) {
      expect(reaisParaCentavos(centavosParaCampo(c))).toBe(c);
    }
  });
});

describe("auditoria legível", () => {
  it("todo evento do banco tem nome em português", () => {
    // A lista mais nova de tipos de evento é a da migration dos repasses.
    const sql = readFileSync("supabase/migrations/20260926120000_repasses_automaticos.sql", "utf8");
    const lista = sql.slice(sql.indexOf("check (event_type in ("), sql.indexOf("));"));
    const tipos = [...lista.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(tipos.length).toBeGreaterThan(20);
    expect(tipos).toContain("PAYOUT_CYCLE_RUN");
    for (const t of tipos) expect(NOME_DO_EVENTO[t], t).toBeTruthy();
  });

  it("mudança de percentual mostra antes, depois, e a volta ao padrão", () => {
    expect(
      resumoDoEvento("COMMISSION_RATE_CHANGED", {
        old_bps: null,
        new_bps: 2000,
        old_effective_bps: 1500,
        new_effective_bps: 2000,
      }),
    ).toBe("15% → 20%");
    expect(
      resumoDoEvento("COMMISSION_RATE_CHANGED", {
        old_bps: 2000,
        new_bps: null,
        old_effective_bps: 2000,
        new_effective_bps: 1500,
      }),
    ).toBe("20% → 15% (volta ao padrão)");
  });

  it("configuração alterada lista cada campo com valores legíveis", () => {
    const r = resumoDoEvento("SETTINGS_CHANGED", {
      changes: {
        minimum_withdrawal_cents: { old: 10000, new: 5000 },
        commission_duration_months: { old: null, new: 12 },
      },
    });
    expect(r).toContain("Repasse mínimo: R$ 100,00 → R$ 50,00");
    expect(r).toContain("Duração: sem limite → 12 meses");
  });

  it("regras do dono na auditoria: link sem prazo e dias de repasse legíveis", () => {
    const r = resumoDoEvento("SETTINGS_CHANGED", {
      reason: "Regras definidas pelo dono do programa",
      changes: {
        referral_cookie_days: { old: 30, new: null },
        payout_days: { old: null, new: [10, 20] },
        commission_release_days: { old: 7, new: 0 },
      },
    });
    expect(r).toContain("Janela do link: 30 dias → sem prazo");
    expect(r).toContain("Dias de repasse: — → dias 10 e 20");
    expect(r).toContain("Dias para liberar: 7 dias → 0 dias");
    expect(r).toContain("motivo: Regras definidas pelo dono do programa");
  });

  it("rodada de repasses resume quantos, quanto e quem ficou de fora", () => {
    expect(
      resumoDoEvento("PAYOUT_CYCLE_RUN", {
        repasses: 3,
        valor_cents: 45000,
        abaixo_do_minimo: 2,
        sem_pix: 1,
        com_repasse_em_aberto: 0,
        falhas: 0,
        forcado: false,
      }),
    ).toBe("3 repasses · R$ 450,00 · 2 abaixo do mínimo · 1 sem Pix");
    expect(
      resumoDoEvento("PAYOUT_CYCLE_RUN", { repasses: 1, valor_cents: 12000, forcado: true }),
    ).toBe("1 repasse · R$ 120,00 · acionado pela equipe");
    expect(
      resumoDoEvento("WITHDRAWAL_REQUESTED", { amount_cents: 12000, origin: "automatic_payout" }),
    ).toBe("R$ 120,00 · automático");
  });

  it("lembrete da conta administrativa só aparece quando há repasse esperando", () => {
    const nada = {
      saques_em_analise: 0,
      saques_em_analise_cents: 0,
      saques_a_pagar: 0,
      saques_a_pagar_cents: 0,
    };
    expect(lembreteDeRepasses(nada)).toBeNull();
    expect(lembreteDeRepasses(null)).toBeNull();
    expect(
      lembreteDeRepasses({ ...nada, saques_em_analise: 2, saques_em_analise_cents: 150000 }),
    ).toEqual({
      titulo: "Repasses de afiliados esperando você",
      detalhe: "2 para conferir (R$ 1.500,00)",
    });
    expect(
      lembreteDeRepasses({
        saques_em_analise: 1,
        saques_em_analise_cents: 12000,
        saques_a_pagar: 1,
        saques_a_pagar_cents: 74280,
      })?.detalhe,
    ).toBe("1 para conferir (R$ 120,00) · 1 aprovado esperando o Pix (R$ 742,80)");
  });

  it("saque pago mostra valor e comprovante; suspensão mostra o motivo", () => {
    expect(
      resumoDoEvento("WITHDRAWAL_PAID", { amount_cents: 6000, payment_reference: "E2E-1" }),
    ).toBe("R$ 60,00 · comprovante E2E-1");
    expect(
      resumoDoEvento("AFFILIATE_SUSPENDED", {
        old_status: "active",
        new_status: "suspended",
        reason: "Links em spam",
      }),
    ).toBe("Ativo → Suspenso · motivo: Links em spam");
  });
});

describe("migration da gestão (parte 3)", () => {
  const sql = readFileSync(
    "supabase/migrations/20260925120000_admin_do_programa_de_afiliados.sql",
    "utf8",
  )
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

  const funcoesDeAdmin = [
    "afiliado_definir_status",
    "afiliado_definir_taxa",
    "afiliado_decidir_saque",
    "afiliado_atualizar_configuracoes",
    "afiliado_admin_situacao_indicacao",
    "afiliado_admin_atribuir_indicacao",
    "afiliado_admin_estornar_comissao",
    "afiliado_admin_resumo",
    "afiliado_admin_serie",
    "afiliado_admin_afiliados",
    "afiliado_admin_afiliado",
    "afiliado_admin_indicacoes",
    "afiliado_admin_lojas_sem_afiliado",
    "afiliado_admin_comissoes",
    "afiliado_admin_comissao",
    "afiliado_admin_saques",
    "afiliado_admin_eventos",
    "afiliado_admin_configuracoes",
  ];

  it("toda função de administrador confere o administrador antes de tudo", () => {
    for (const fn of funcoesDeAdmin) {
      const inicio = sql.indexOf(`create or replace function public.${fn}(`);
      expect(inicio, fn).toBeGreaterThan(-1);
      const corpo = sql.slice(inicio, sql.indexOf("$$;", inicio));
      const primeiroComando = corpo.slice(corpo.indexOf(" begin ") + 7).trim();
      expect(primeiroComando.startsWith("perform public.afiliado_exigir_admin();"), fn).toBe(true);
    }
  });

  it("ninguém de fora chama as funções de administrador sem estar logado", () => {
    const revoga = sql.slice(
      sql.indexOf("revoke execute on function public.afiliado_exigir_admin()"),
    );
    for (const fn of funcoesDeAdmin) expect(revoga, fn).toContain(`public.${fn}(`);
    expect(revoga).toContain("from public, anon, authenticated;");
    expect(sql).not.toMatch(/to anon/);
  });

  it("saque pago uma vez só: só 'aprovado' vira 'pago', com a linha trancada", () => {
    const corpo = sql.slice(sql.indexOf("function public.afiliado_decidir_saque("));
    expect(corpo).toContain("where id = p_withdrawal_id for update");
    expect(corpo).toContain("if v_s.status <> 'approved' then");
    expect(corpo).toContain("paid_by = auth.uid()");
    expect(corpo).toContain("payment_reference = v_ref");
    expect(corpo).toContain("v_ligadas <> v_s.amount_cents");
  });

  it("suspender e bloquear exigem motivo; nada apaga histórico", () => {
    const status = sql.slice(sql.indexOf("function public.afiliado_definir_status("));
    expect(status.slice(0, 1200)).toContain(
      "p_status in ('suspended', 'blocked') and (v_motivo is null",
    );
    expect(sql).not.toMatch(
      /delete from public\.affiliate_(commissions|withdrawals|referrals|events)/,
    );
  });

  it("estorno manual reaproveita o caminho do estorno de pagamento e é auditado", () => {
    const corpo = sql.slice(sql.indexOf("function public.afiliado_admin_estornar_comissao("));
    expect(corpo).toContain("perform public.afiliado_reverter_comissao_da_fatura(");
    expect(corpo).toContain("'commission_adjusted'");
  });

  it("atribuição manual não troca afiliado de loja e barra autoindicação", () => {
    const corpo = sql.slice(sql.indexOf("function public.afiliado_admin_atribuir_indicacao("));
    expect(corpo).toContain("esta loja já tem afiliado");
    expect(corpo).toContain("autoindicação não é permitida");
    expect(sql).not.toMatch(/update public\.affiliate_referrals set affiliate_id/);
  });

  it("os três alertas de fraude existem e não bloqueiam ninguém", () => {
    for (const regra of [
      "same_phone_as_affiliate",
      "many_conversions_same_device",
      "withdrawal_soon_after_pix_change",
    ]) {
      expect(sql).toContain(`'${regra}'`);
    }
    // O alerta é só um evento: a conversão continua devolvendo 'ok'.
    const conversao = sql.slice(sql.indexOf("function public.afiliado_converter_indicacao("));
    const depoisDoAlerta = conversao.slice(conversao.indexOf("same_phone_as_affiliate"));
    expect(depoisDoAlerta.slice(0, 1500)).toContain("return 'ok';");
  });
});

describe("telas da gestão", () => {
  const menu = readFileSync("src/routes/_app.tsx", "utf8");
  const layoutAdmin = readFileSync("src/routes/_app/admin.tsx", "utf8");

  it("Afiliados aparece só no bloco do Painel Admin", () => {
    const blocoAdmin = menu.slice(menu.indexOf("const adminItems"), menu.indexOf("const NavItems"));
    expect(blocoAdmin).toContain('"/admin/affiliates"');
    const antes = menu.slice(0, menu.indexOf("const adminItems"));
    expect(antes).not.toContain("/admin/affiliates");
  });

  it("as telas moram debaixo de /admin, que já barra quem não é administrador", () => {
    expect(layoutAdmin).toContain("hasAdminAccess");
    const secao = readFileSync("src/routes/_app/admin/affiliates.tsx", "utf8");
    expect(secao).toContain('createFileRoute("/_app/admin/affiliates")');
  });

  it("nenhuma tela de administração apaga registro financeiro", () => {
    for (const arquivo of [
      "src/components/afiliados/admin/Tabelas.tsx",
      "src/lib/afiliados/admin.ts",
    ]) {
      const fonte = readFileSync(arquivo, "utf8");
      expect(fonte, arquivo).not.toMatch(/\.delete\(|\.from\("affiliate_/);
    }
  });
});
