import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planHasFeature, featureEhContratadaAParte } from "@/lib/planPermissions";
import { addonDaFeature, ehAddonValido } from "@/lib/addons";
import { comparaSemVazar, conferirChaveMestra } from "./n8nAuth";

/**
 * As regras do Chat que não podem quebrar sem ninguém perceber.
 *
 * Cada teste aqui existe por causa de um estrago concreto:
 *
 *   - o CENTS enxergar o Chat = vender o que o plano não tem;
 *   - o premium sem contratar entrar direto = entregar de graça o que é pago;
 *   - a porta do n8n abrir sem segredo = qualquer pessoa que descobrisse o
 *     endereço leria a conversa dos clientes de todos os restaurantes.
 */

const RAIZ = process.cwd();

function soCodigo(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("quem enxerga a aba Chat", () => {
  it("o plano CENTS não tem Chat", () => {
    expect(planHasFeature("cents", "chat")).toBe(false);
  });

  it("o plano PREMIUM tem", () => {
    expect(planHasFeature("premium", "chat")).toBe(true);
  });

  it("as empresas antigas (plano legado) continuam com acesso", () => {
    // Derrubar quem já paga por causa de um valor inesperado no cadastro é um
    // estrago maior do que liberar demais até a migração administrativa.
    expect(planHasFeature("legacy_full_access", "chat")).toBe(true);
    expect(planHasFeature(null, "chat")).toBe(true);
    expect(planHasFeature("valor_estranho_de_producao", "chat")).toBe(true);
  });

  it("as outras features do premium continuam como estavam", () => {
    // O Chat não podia mexer em quem já tinha Mesas, Garçons e Comissões.
    for (const f of ["tables", "waiters", "commissions"] as const) {
      expect(planHasFeature("premium", f)).toBe(true);
      expect(planHasFeature("cents", f)).toBe(false);
    }
  });
});

describe("o Chat é vendido à parte, e a tela de upgrade não pode prometê-lo", () => {
  it("o Chat está marcado como contratado à parte", () => {
    expect(featureEhContratadaAParte("chat")).toBe(true);
  });

  it("Mesas, Garçons e Comissões vêm no plano, sem contratação extra", () => {
    for (const f of ["tables", "waiters", "commissions"] as const) {
      expect(featureEhContratadaAParte(f)).toBe(false);
      expect(addonDaFeature(f)).toBeNull();
    }
  });

  it("a aba Chat depende da contratação do crm_chat", () => {
    expect(addonDaFeature("chat")).toBe("crm_chat");
    expect(ehAddonValido("crm_chat")).toBe(true);
    expect(ehAddonValido("qualquer_outra_coisa")).toBe(false);
  });

  it("a tela de upgrade não lista o Chat entre o que o PREMIUM entrega", () => {
    const codigo = soCodigo("src/components/PremiumFeatureLock.tsx");
    // A lista de benefícios precisa filtrar o que é vendido à parte.
    expect(codigo).toContain("featureEhContratadaAParte");
  });
});

describe("a porta do n8n", () => {
  const segredoOriginal = process.env.CRM_N8N_SECRET;

  function pedido(cabecalho?: string): Request {
    return new Request("https://exemplo.test/api/crm/inbox", {
      method: "POST",
      headers: cabecalho ? { authorization: cabecalho } : {},
    });
  }

  it("sem segredo configurado, a porta não abre para NINGUÉM", () => {
    // O caminho fácil seria "faltou configurar, deixa passar" — e é assim que
    // sistema nasce aberto em produção.
    delete process.env.CRM_N8N_SECRET;
    const r = conferirChaveMestra(pedido("Bearer o-que-for"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
  });

  it("segredo errado é recusado", () => {
    process.env.CRM_N8N_SECRET = "a-chave-certa";
    const r = conferirChaveMestra(pedido("Bearer a-chave-errada"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("sem cabeçalho nenhum é recusado", () => {
    process.env.CRM_N8N_SECRET = "a-chave-certa";
    const r = conferirChaveMestra(pedido());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("o segredo certo passa, com ou sem 'Bearer' na frente", () => {
    process.env.CRM_N8N_SECRET = "a-chave-certa";
    expect(conferirChaveMestra(pedido("Bearer a-chave-certa")).ok).toBe(true);
    expect(conferirChaveMestra(pedido("a-chave-certa")).ok).toBe(true);
  });

  it("a comparação não entrega o segredo letra por letra", () => {
    expect(comparaSemVazar("abc", "abc")).toBe(true);
    expect(comparaSemVazar("abc", "abd")).toBe(false);
    expect(comparaSemVazar("abc", "abcd")).toBe(false);
    expect(comparaSemVazar("", "")).toBe(true);
    expect(comparaSemVazar("abc", "")).toBe(false);
  });

  if (segredoOriginal === undefined) {
    delete process.env.CRM_N8N_SECRET;
  } else {
    process.env.CRM_N8N_SECRET = segredoOriginal;
  }
});

describe("a chave mestra do CRM sozinha não alcança a loja de outro", () => {
  it("todo endereço do n8n confere também a senha daquela loja", () => {
    for (const arquivo of [
      "src/routes/api/crm.inbox.ts",
      "src/routes/api/crm.outbox.ts",
      "src/routes/api/crm.outbox.result.ts",
      "src/routes/api/crm.ping.ts",
    ]) {
      const codigo = soCodigo(arquivo);
      expect(codigo).toContain("conferirChaveMestra");
      expect(codigo).toContain("autenticarLoja");

      // A conferência vem ANTES de qualquer coisa útil acontecer.
      const posChave = codigo.indexOf("conferirChaveMestra");
      const posLoja = codigo.indexOf("autenticarLoja");
      const posTrabalho = Math.max(codigo.indexOf("crmRpc("), codigo.indexOf(".update("));
      expect(posChave).toBeGreaterThan(-1);
      expect(posLoja).toBeGreaterThan(posChave);
      if (posTrabalho > -1) expect(posTrabalho).toBeGreaterThan(posLoja);
    }
  });

  it("a loja usada nas consultas é a CONFERIDA, nunca a que veio no pedido", () => {
    // Usar `corpo.tenant_id` direto depois de conferir seria conferir a
    // entrada de um e abrir a porta de outro.
    for (const arquivo of [
      "src/routes/api/crm.inbox.ts",
      "src/routes/api/crm.outbox.ts",
      "src/routes/api/crm.outbox.result.ts",
      "src/routes/api/crm.ping.ts",
    ]) {
      const codigo = soCodigo(arquivo);
      expect(codigo).toContain("loja.tenantId");
      expect(codigo).not.toMatch(/p_tenant_id:\s*corpo\./);
      expect(codigo).not.toMatch(/"tenant_id",\s*corpo\./);
    }
  });
});

describe("as funções do painel conferem dono, plano e contratação", () => {
  it("todas as operações do Chat passam pelo porteiro", () => {
    const codigo = soCodigo("src/lib/crm/crm.functions.ts");

    // Nenhuma função pode falar com o banco sem passar por `porteiro`, que é
    // o `assertOwnsTenantWithAddon`.
    expect(codigo).toContain("assertOwnsTenantWithAddon");

    const operacoes = codigo.match(/createServerFn\(/g) ?? [];
    const porteiros = codigo.match(/await porteiro\(/g) ?? [];
    expect(operacoes.length).toBeGreaterThan(0);
    expect(porteiros.length).toBe(operacoes.length);
  });

  it("as consultas usam a loja conferida, não a que veio do navegador", () => {
    const codigo = soCodigo("src/lib/crm/crm.functions.ts");
    // A loja que veio do navegador (`data.tenantId`) só pode aparecer sendo
    // ENTREGUE ao porteiro. Qualquer outra aparição seria conferir a entrada
    // de uma loja e consultar a de outra.
    const usosCrus = codigo.match(/data\.tenantId/g) ?? [];
    const entreguesAoPorteiro = codigo.match(/porteiro\(context, data\.tenantId\)/g) ?? [];
    expect(usosCrus.length).toBeGreaterThan(0);
    expect(entreguesAoPorteiro.length).toBe(usosCrus.length);
  });

  it("ligar e desligar o Chat é só do administrador", () => {
    const codigo = soCodigo("src/lib/crm/addonAdmin.functions.ts");
    const operacoes = codigo.match(/createServerFn\(/g) ?? [];
    const conferencias = codigo.match(/await exigirAdmin\(/g) ?? [];
    expect(operacoes.length).toBeGreaterThan(0);
    expect(conferencias.length).toBe(operacoes.length);
  });

  it("desligar o Chat não apaga conversa nenhuma", () => {
    // Apagar histórico de cliente não pode acontecer de carona num
    // cancelamento de plano.
    const codigo = soCodigo("src/lib/crm/addonAdmin.functions.ts");
    expect(codigo).not.toContain(".delete(");
    expect(codigo).toContain('"suspended"');
    expect(codigo).toContain('"paused"');
  });
});

describe("as trancas do banco", () => {
  const sql = readFileSync(
    join(RAIZ, "supabase/migrations/20260911120000_crm_chat_fundacao.sql"),
    "utf8",
  );

  it("as tabelas do Chat têm as regras de acesso ligadas", () => {
    for (const tabela of [
      "company_addons",
      "crm_n8n_links",
      "crm_contacts",
      "crm_conversations",
      "crm_messages",
    ]) {
      expect(sql).toContain(`ALTER TABLE public.${tabela} ENABLE ROW LEVEL SECURITY`);
    }
  });

  it("mexer em conversa exige a contratação ativa, e não só ser o dono", () => {
    expect(sql).toContain("company_has_crm_chat");
    expect(sql).toContain("AS RESTRICTIVE FOR INSERT");
    expect(sql).toContain("AS RESTRICTIVE FOR UPDATE");
    expect(sql).toContain("AS RESTRICTIVE FOR DELETE");
  });

  it("a leitura NÃO é travada pela contratação", () => {
    // Perder o CRM não pode fazer o histórico sumir. Só a escrita trava.
    expect(sql).not.toContain("AS RESTRICTIVE FOR SELECT");
  });

  it("só o administrador liga o recurso", () => {
    expect(sql).toContain('CREATE POLICY "company_addons_admin_write"');
    expect(sql).toContain("USING (public.is_admin())");
  });

  it("a senha de cada loja não é legível por quem está logado no painel", () => {
    // Se a tabela do fluxo tivesse política de leitura para o dono, a senha
    // dele apareceria no navegador — e o que aparece no navegador vaza.
    expect(sql).not.toContain('CREATE POLICY "crm_n8n_links_select_policy"');
  });

  it("as funções de fila são do servidor, não do navegador", () => {
    for (const fn of ["crm_next_outbox", "crm_record_outbox_result", "crm_receive_message"]) {
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}[\\s\\S]*?authenticated`),
      );
    }
  });
});
