import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { etapasDoSaque, rotuloDoPonto } from "./situacoes";
import {
  linkDoAfiliado,
  linkParaExibir,
  listaDeDias,
  mascararPix,
  mensagemDeErro,
  nosDias,
  porcentagemDeBps,
  preencherTexto,
  problemaNaChavePix,
  proximoRepasse,
  reais,
  situacaoBloqueante,
  taxaDeConversao,
  textoDaLiberacao,
  textoDosDiasDeRepasse,
  validarCadastroDeAfiliado,
} from "./validacao";

describe("números do portal", () => {
  it("centavos viram reais sem erro de arredondamento", () => {
    expect(reais(74280)).toBe("R$ 742,80");
    expect(reais(2284133)).toBe("R$ 22.841,33");
    expect(reais(-4050)).toBe("-R$ 40,50");
    expect(reais(0)).toBe("R$ 0,00");
    expect(reais(null)).toBe("R$ 0,00");
  });

  it("porcentagem vem em pontos-base", () => {
    expect(porcentagemDeBps(1500)).toBe("15%");
    expect(porcentagemDeBps(1250)).toBe("12,5%");
  });

  it("conversão: 0 de 0 não é 0%", () => {
    expect(taxaDeConversao(null)).toBe("—");
    expect(taxaDeConversao(107)).toBe("10,7%");
    expect(taxaDeConversao(0)).toBe("0%");
  });

  it("rótulo do gráfico por dia e por mês", () => {
    expect(rotuloDoPonto("2026-09-23", "day")).toBe("23/09");
    expect(rotuloDoPonto("2026-09-01", "month")).toBe("set/26");
  });
});

describe("link do afiliado", () => {
  it("monta o link público com o código", () => {
    expect(linkDoAfiliado("JOAO123")).toBe("https://flycontrol.conectfly.com.br/?ref=JOAO123");
    expect(linkParaExibir("JOAO123")).toBe("flycontrol.conectfly.com.br/?ref=JOAO123");
    expect(linkDoAfiliado("JOAO123", "/plans")).toBe(
      "https://flycontrol.conectfly.com.br/plans?ref=JOAO123",
    );
  });

  it("texto pronto sai com o link e o código de quem copia", () => {
    expect(preencherTexto("Use {CODIGO}: {LINK}", "ANA456")).toBe(
      "Use ANA456: https://flycontrol.conectfly.com.br/?ref=ANA456",
    );
  });
});

describe("Pix", () => {
  it("confere a chave pelo tipo", () => {
    expect(problemaNaChavePix("cpf", "123.456.789-09")).toBeNull();
    expect(problemaNaChavePix("cpf", "111.111.111-11")).toBe("CPF inválido.");
    expect(problemaNaChavePix("email", "joao@email.com")).toBeNull();
    expect(problemaNaChavePix("phone", "(11) 99999-0000")).toBeNull();
    expect(problemaNaChavePix("random", "123e4567-e89b-12d3-a456-426614174000")).toBeNull();
    expect(problemaNaChavePix("random", "qualquer-coisa")).not.toBeNull();
  });

  it("Pix é opcional até a hora do saque, mas tipo e chave andam juntos", () => {
    expect(problemaNaChavePix("", "")).toBeNull();
    expect(problemaNaChavePix("", "123")).not.toBeNull();
    expect(problemaNaChavePix("cpf", "")).not.toBeNull();
  });

  it("máscara mostra só o final", () => {
    expect(mascararPix("12345678909")).toBe("•••• 8909");
    expect(mascararPix(null)).toBe("");
  });
});

describe("cadastro de parceiro", () => {
  const ok = {
    nome: "João da Silva",
    email: "joao@email.com",
    telefone: "(11) 99999-0000",
    senha: "senha1234",
    aceitouTermos: true,
  };

  it("aceita um cadastro completo", () => {
    expect(validarCadastroDeAfiliado(ok, { exigirSenha: true })).toEqual({});
  });

  it("exige aceite das regras e celular", () => {
    const e = validarCadastroDeAfiliado(
      { ...ok, aceitouTermos: false, telefone: "" },
      { exigirSenha: true },
    );
    expect(e.termos).toBeTruthy();
    expect(e.telefone).toBeTruthy();
  });

  it("quem já está logado não informa e-mail nem senha", () => {
    expect(
      validarCadastroDeAfiliado({ ...ok, email: "", senha: "" }, { exigirSenha: false }),
    ).toEqual({});
  });
});

describe("mensagens e situações", () => {
  it("traduz o código do banco", () => {
    expect(mensagemDeErro(new Error("afiliado_pending"))).toBe("Seu cadastro está em análise.");
    expect(situacaoBloqueante(new Error("afiliado_blocked"))).toBe("blocked");
    expect(situacaoBloqueante(new Error("outra coisa"))).toBeNull();
  });

  it("frase pronta do banco passa; erro técnico não", () => {
    expect(mensagemDeErro(new Error("Seu saldo disponível mudou para R$ 150,00."))).toBe(
      "Seu saldo disponível mudou para R$ 150,00.",
    );
    expect(mensagemDeErro(new Error("permission denied for function x"))).toBe(
      "Não foi possível carregar agora. Tente novamente.",
    );
  });

  it("saque mostra as etapas na ordem, e recusado encerra a linha", () => {
    const pago = etapasDoSaque({
      situacao: "paid",
      pedido_em: "2026-08-01",
      aprovado_em: "2026-08-02",
      pago_em: "2026-08-03",
      recusado_em: null,
    });
    expect(pago.map((e) => e.rotulo)).toEqual(["Montado", "Conferência", "Aprovado", "Pago"]);
    expect(pago.every((e) => e.feita)).toBe(true);

    const recusado = etapasDoSaque({
      situacao: "rejected",
      pedido_em: "2026-08-01",
      aprovado_em: null,
      pago_em: null,
      recusado_em: "2026-08-02",
    });
    expect(recusado.map((e) => e.rotulo)).toEqual(["Montado", "Conferência", "Recusado"]);
  });
});

describe("o portal nunca manda 'qual afiliado'", () => {
  const portal = readFileSync("src/lib/afiliados/portal.ts", "utf8");

  it("nenhuma chamada ao banco leva id de afiliado ou de usuário", () => {
    expect(portal).not.toMatch(/p_affiliate_id|p_user_id|p_afiliado|affiliate_id:/);
  });

  it("as rotas do painel não leem id do endereço", () => {
    for (const rota of [
      "affiliates.dashboard.tsx",
      "affiliates.dashboard.index.tsx",
      "affiliates.dashboard.referrals.tsx",
      "affiliates.dashboard.commissions.tsx",
      "affiliates.dashboard.withdrawals.tsx",
      "affiliates.dashboard.settings.tsx",
      "affiliates.dashboard.materials.tsx",
    ]) {
      const fonte = readFileSync(`src/routes/${rota}`, "utf8");
      expect(fonte, rota).not.toMatch(/useParams|validateSearch|\$id/);
    }
  });
});

describe("migration do portal", () => {
  const sql = readFileSync("supabase/migrations/20260924120000_portal_do_afiliado.sql", "utf8")
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

  it("funções do portal não recebem id de afiliado", () => {
    for (const fn of [
      "afiliado_meu_perfil()",
      "afiliado_meu_resumo()",
      "afiliado_minha_serie(p_dias integer)",
      "afiliado_meus_saques( p_pagina integer default 1",
    ]) {
      expect(sql).toContain(`function public.${fn}`);
    }
    expect(sql).not.toMatch(
      /function public\.afiliado_(meu|minha|minhas|meus)[a-z_]*\([^)]*affiliate_id/,
    );
  });

  it("os números só saem para parceiro ativo", () => {
    for (const fn of [
      "afiliado_meu_resumo",
      "afiliado_minha_serie",
      "afiliado_minhas_indicacoes",
      "afiliado_minhas_comissoes",
      "afiliado_meus_saques",
    ]) {
      const corpo = sql.slice(sql.indexOf(`function public.${fn}(`));
      expect(corpo.slice(0, 900), fn).toContain("public.afiliado_ativo_do_usuario()");
    }
  });

  it("atualizar dados não mexe em código, taxa nem situação", () => {
    const corpo = sql.slice(
      sql.indexOf("function public.afiliado_atualizar_meus_dados("),
      sql.indexOf("drop function if exists public.afiliado_solicitar_saque()"),
    );
    // A única escrita da função: nome, telefone e Pix. Nada mais.
    const escrita = /update public\.affiliates set (.*?) where/.exec(corpo)?.[1] ?? "";
    expect(escrita).toBe("name = v_nome, phone = v_tel, pix_key_type = v_tipo, pix_key = v_chave");
    expect(corpo).not.toMatch(/referral_code|commission_bps/);
  });

  it("saque confere o valor visto e recalcula no banco", () => {
    const corpo = sql.slice(
      sql.indexOf("function public.afiliado_solicitar_saque(p_valor_confirmado_cents bigint)"),
    );
    expect(corpo).toContain("p_valor_confirmado_cents <> v_total");
    expect(corpo).toContain("status in ('requested', 'approved')");
    expect(corpo).toContain("minimum_withdrawal_cents");
  });

  it("cadastro só pelo servidor; portal só para quem está logado", () => {
    expect(sql).toMatch(
      /grant execute on function public\.afiliado_cadastrar\(uuid, text, text, text, text\) to service_role;/,
    );
    expect(sql).toMatch(
      /from public, anon, authenticated; grant execute on function public\.afiliado_cadastrar/,
    );
    expect(sql).not.toMatch(/afiliado_meu_resumo\(\)[^;]*to anon/);
  });

  it("indicações não expõem dados do dono da loja", () => {
    const corpo = sql.slice(
      sql.indexOf("function public.afiliado_minhas_indicacoes("),
      sql.indexOf("function public.afiliado_minhas_comissoes("),
    );
    expect(corpo).not.toMatch(/owner_id|phone|email|address|document/);
  });
});

describe("repasses automáticos (dias 10 e 20)", () => {
  it("o próximo repasse é o próximo dia 10 ou 20, às 4h de Brasília", () => {
    // 23/09, meio-dia: próximo é 10/10.
    expect(proximoRepasse([10, 20], new Date("2026-09-23T15:00:00Z"))).toBe(
      "2026-10-10T07:00:00.000Z",
    );
    // Dia 10, 3h59 de Brasília: o repasse de hoje ainda não saiu.
    expect(proximoRepasse([10, 20], new Date("2026-10-10T06:59:00Z"))).toBe(
      "2026-10-10T07:00:00.000Z",
    );
    // Dia 10, 4h em ponto: o de hoje já foi montado, o próximo é o dia 20.
    expect(proximoRepasse([10, 20], new Date("2026-10-10T07:00:00Z"))).toBe(
      "2026-10-20T07:00:00.000Z",
    );
    // Virada de ano.
    expect(proximoRepasse([10, 20], new Date("2026-12-25T12:00:00Z"))).toBe(
      "2027-01-10T07:00:00.000Z",
    );
    // 30/09 às 23h de Brasília já é 01/10 no relógio mundial: continua sendo setembro aqui.
    expect(proximoRepasse([10, 20], new Date("2026-10-01T02:00:00Z"))).toBe(
      "2026-10-10T07:00:00.000Z",
    );
  });

  it("lista de dias estragada não inventa data", () => {
    expect(proximoRepasse([], new Date("2026-09-23T12:00:00Z"))).toBeNull();
    expect(proximoRepasse(null)).toBeNull();
    expect(proximoRepasse([0, 29, 31])).toBeNull();
    // Resposta estranha do banco não derruba a tela.
    expect(proximoRepasse(0 as unknown as number[])).toBeNull();
    expect(listaDeDias("10" as unknown as number[])).toBe("");
    expect(proximoRepasse([20, 10, 10], new Date("2026-09-23T12:00:00Z"))).toBe(
      proximoRepasse([10, 20], new Date("2026-09-23T12:00:00Z")),
    );
  });

  it("os dias e a liberação viram frase", () => {
    expect(listaDeDias([10, 20])).toBe("10 e 20");
    expect(listaDeDias([25, 5, 15])).toBe("5, 15 e 25");
    expect(listaDeDias([10])).toBe("10");
    expect(listaDeDias([])).toBe("");
    expect(textoDosDiasDeRepasse([10, 20])).toBe("Dias 10 e 20 de cada mês");
    expect(textoDosDiasDeRepasse([15])).toBe("Dia 15 de cada mês");
    expect(nosDias([10, 20])).toBe("nos dias 10 e 20");
    expect(nosDias([10])).toBe("no dia 10");
    expect(nosDias(undefined)).toBe("nos dias de repasse");
    expect(textoDaLiberacao(0)).toBe("Libera assim que o pagamento do cliente é confirmado");
    expect(textoDaLiberacao(1)).toBe("Libera 1 dia após o pagamento do cliente");
    expect(textoDaLiberacao(7)).toBe("Libera 7 dias após o pagamento do cliente");
  });

  it("o parceiro não tem mais como pedir saque", () => {
    const portal = readFileSync("src/lib/afiliados/portal.ts", "utf8");
    const tela = readFileSync("src/routes/affiliates.dashboard.withdrawals.tsx", "utf8");
    expect(portal).not.toContain("afiliado_solicitar_saque");
    expect(tela).not.toMatch(/Solicitar saque|solicitarSaque/);
  });

  const sql = readFileSync("supabase/migrations/20260926120000_repasses_automaticos.sql", "utf8")
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

  it("só o robô monta o repasse; o botão da equipe exige administrador", () => {
    expect(sql).toContain(
      "revoke execute on function public.afiliado_solicitar_saque(bigint) from public, anon, authenticated;",
    );
    expect(sql).toContain(
      "grant execute on function public.afiliado_gerar_repasses(boolean) to service_role;",
    );
    expect(sql).not.toMatch(/afiliado_gerar_repasses\(boolean\)[^;]*to [^;]*authenticated/);
    const corpo = sql.slice(sql.indexOf("function public.afiliado_admin_gerar_repasses()"));
    const primeiro = corpo.slice(corpo.indexOf(" begin ") + 7).trim();
    expect(primeiro.startsWith("perform public.afiliado_exigir_admin();")).toBe(true);
  });

  it("um repasse por parceiro por dia, e nunca dois abertos ao mesmo tempo", () => {
    expect(sql).toContain(
      "create unique index if not exists affiliate_withdrawals_um_por_ciclo on public.affiliate_withdrawals (affiliate_id, payout_cycle) where payout_cycle is not null",
    );
    const corpo = sql.slice(sql.indexOf("function public.afiliado_gerar_repasses("));
    expect(corpo).toContain("status in ('requested', 'approved')");
    expect(corpo).toContain("payout_cycle = v_hoje");
    expect(corpo).toContain("v_total < v_cfg.minimum_withdrawal_cents");
    expect(corpo).toContain("where a.status = 'active'");
    expect(corpo).toContain("for update");
  });

  it("as regras do dono ficam gravadas: 15%, R$ 100, dias 10 e 20, link sem prazo", () => {
    const regras = sql.slice(sql.lastIndexOf("update public.affiliate_settings set"));
    expect(regras).toContain("default_commission_bps = 1500");
    expect(regras).toContain("commission_duration_months = null");
    expect(regras).toContain("minimum_withdrawal_cents = 10000");
    expect(regras).toContain("referral_cookie_days = null");
    expect(regras).toContain("approval_required = true");
    expect(regras).toContain("payout_days = '{10,20}'");
    expect(sql).toContain("cron.schedule('afiliados-repasses', '0 7 * * *'");
  });
});
