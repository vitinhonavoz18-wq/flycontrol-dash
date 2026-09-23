/**
 * Palavras e contas do Painel Admin → Afiliados. Puro: sem React, sem rede.
 */

import type { SituacaoDoAfiliado } from "./portal";
import { porcentagemDeBps, reais } from "./validacao";

export const SITUACAO_DO_AFILIADO: Record<SituacaoDoAfiliado, { rotulo: string; classe: string }> =
  {
    pending: {
      rotulo: "Pendente",
      classe: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    active: {
      rotulo: "Ativo",
      classe: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    suspended: {
      rotulo: "Suspenso",
      classe: "border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400",
    },
    blocked: {
      rotulo: "Bloqueado",
      classe: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
    },
  };

/** O nome de cada evento da auditoria, como a equipe lê. */
export const NOME_DO_EVENTO: Record<string, string> = {
  AFFILIATE_REGISTERED: "Afiliado criado",
  AFFILIATE_APPROVED: "Afiliado aprovado",
  AFFILIATE_SUSPENDED: "Afiliado suspenso",
  AFFILIATE_REACTIVATED: "Afiliado reativado",
  AFFILIATE_BLOCKED: "Afiliado bloqueado",
  AFFILIATE_STATUS_CHANGED: "Situação alterada",
  COMMISSION_RATE_CHANGED: "Percentual alterado",
  PROFILE_UPDATED: "Dados do afiliado alterados",
  PIX_KEY_CHANGED: "Chave Pix alterada",
  REFERRAL_CREATED: "Cliente atribuído",
  CUSTOMER_CONVERTED: "Cadastro pelo link",
  REFERRAL_REJECTED: "Indicação recusada",
  REFERRAL_CANCELLED: "Indicação cancelada",
  REFERRAL_RESTORED: "Indicação restaurada",
  REFERRAL_ASSIGNED_MANUALLY: "Cliente atribuído manualmente",
  COMMISSION_CREATED: "Comissão criada",
  COMMISSION_RELEASED: "Comissão liberada",
  COMMISSION_REVERSED: "Comissão revertida",
  COMMISSION_ADJUSTED: "Estorno manual de comissão",
  WITHDRAWAL_REQUESTED: "Saque solicitado",
  WITHDRAWAL_APPROVED: "Saque aprovado",
  WITHDRAWAL_PAID: "Saque pago",
  WITHDRAWAL_REJECTED: "Saque recusado",
  SETTINGS_CHANGED: "Configurações alteradas",
  SUSPICIOUS_ACTIVITY: "Atividade suspeita",
};

export const REGRA_SUSPEITA: Record<string, string> = {
  same_phone_as_affiliate: "Loja indicada tem o mesmo celular do afiliado",
  many_conversions_same_device: "Várias lojas criadas pelo mesmo aparelho/rede em 24h",
  withdrawal_soon_after_pix_change: "Saque pedido logo depois de trocar a chave Pix",
};

const NOME_DO_CAMPO: Record<string, string> = {
  program_enabled: "Programa ativo",
  default_commission_bps: "Comissão padrão",
  commission_duration_months: "Duração",
  commission_release_days: "Dias para liberar",
  minimum_withdrawal_cents: "Saque mínimo",
  referral_cookie_days: "Janela do link",
  commission_base: "Base da comissão",
  approval_required: "Aprovação manual",
};

export const NOME_DA_BASE: Record<string, string> = {
  cents_usage: "Só a cobrança por pedido do CENTS",
  recurring: "Cobrança por pedido + mensalidade",
  invoice_total: "Tudo o que o cliente pagou (inclui adesão)",
};

function valorDoCampo(campo: string, v: unknown): string {
  if (v === null || v === undefined)
    return campo === "commission_duration_months" ? "sem limite" : "—";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (campo.endsWith("_bps")) return porcentagemDeBps(Number(v));
  if (campo.endsWith("_cents")) return reais(Number(v));
  if (campo === "commission_base") return NOME_DA_BASE[String(v)] ?? String(v);
  if (campo.endsWith("_days")) return `${v} dias`;
  if (campo.endsWith("_months")) return `${v} meses`;
  return String(v);
}

/**
 * Uma linha legível com o que importa do evento: "15% → 20%", o motivo,
 * o valor do saque. O JSON cru continua disponível na tela para quem
 * precisar investigar.
 */
export function resumoDoEvento(tipo: string, d: Record<string, unknown>): string {
  const partes: string[] = [];
  const motivo = (d.reason ?? d.notes) as string | undefined;
  switch (tipo) {
    case "COMMISSION_RATE_CHANGED":
      partes.push(
        `${porcentagemDeBps(Number(d.old_effective_bps ?? d.old_bps ?? 0))} → ${porcentagemDeBps(
          Number(d.new_effective_bps ?? d.new_bps ?? 0),
        )}${d.new_bps === null ? " (volta ao padrão)" : ""}`,
      );
      break;
    case "SETTINGS_CHANGED": {
      const mudancas = (d.changes ?? {}) as Record<string, { old: unknown; new: unknown }>;
      for (const [campo, m] of Object.entries(mudancas)) {
        partes.push(
          `${NOME_DO_CAMPO[campo] ?? campo}: ${valorDoCampo(campo, m.old)} → ${valorDoCampo(campo, m.new)}`,
        );
      }
      break;
    }
    case "COMMISSION_CREATED":
      partes.push(
        `${reais(Number(d.commission_amount_cents ?? 0))} (${porcentagemDeBps(Number(d.commission_bps ?? 0))} de ${reais(
          Number(d.eligible_amount_cents ?? 0),
        )})`,
      );
      break;
    case "COMMISSION_RELEASED":
    case "COMMISSION_ADJUSTED":
      if (d.commission_amount_cents !== undefined)
        partes.push(reais(Number(d.commission_amount_cents)));
      break;
    case "COMMISSION_REVERSED":
      if (d.adjustment_amount_cents !== undefined)
        partes.push(`ajuste de ${reais(Number(d.adjustment_amount_cents))}`);
      break;
    case "WITHDRAWAL_REQUESTED":
    case "WITHDRAWAL_APPROVED":
    case "WITHDRAWAL_PAID":
    case "WITHDRAWAL_REJECTED":
      if (d.amount_cents !== undefined) partes.push(reais(Number(d.amount_cents)));
      if (d.payment_reference) partes.push(`comprovante ${String(d.payment_reference)}`);
      break;
    case "AFFILIATE_APPROVED":
    case "AFFILIATE_SUSPENDED":
    case "AFFILIATE_REACTIVATED":
    case "AFFILIATE_BLOCKED":
    case "AFFILIATE_STATUS_CHANGED":
      if (d.old_status && d.new_status) {
        const de =
          SITUACAO_DO_AFILIADO[d.old_status as SituacaoDoAfiliado]?.rotulo ?? String(d.old_status);
        const para =
          SITUACAO_DO_AFILIADO[d.new_status as SituacaoDoAfiliado]?.rotulo ?? String(d.new_status);
        partes.push(`${de} → ${para}`);
      }
      break;
    case "SUSPICIOUS_ACTIVITY":
      partes.push(REGRA_SUSPEITA[String(d.rule)] ?? String(d.rule));
      break;
    case "REFERRAL_REJECTED":
      if (d.reason === "autoindicacao") partes.push("autoindicação");
      break;
    case "PIX_KEY_CHANGED":
      partes.push(`final ${d.old_end ?? "—"} → final ${d.new_end ?? "—"}`);
      break;
  }
  if (motivo && tipo !== "REFERRAL_REJECTED") partes.push(`motivo: ${motivo}`);
  return partes.join(" · ");
}

/**
 * "15" / "15,5" / "15.5" → 1500 / 1550 pontos-base. Aceita no máximo duas
 * casas: 15,555% não existe na régua do programa. Devolve null se não der.
 */
export function porcentagemParaBps(texto: string): number | null {
  const t = texto.trim().replace("%", "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const [inteiro, fracao = ""] = t.split(".");
  const bps = Number(inteiro) * 100 + Number(fracao.padEnd(2, "0"));
  return bps >= 0 && bps <= 10000 ? bps : null;
}

/** "100" / "100,50" / "1.000,00" → centavos inteiros, sem passar por conta com vírgula. */
export function reaisParaCentavos(texto: string): number | null {
  const t = texto
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(t)) return null;
  const [inteiro, fracao = ""] = t.split(".");
  return Number(inteiro) * 100 + Number(fracao.padEnd(2, "0"));
}

/** Centavos → "100,00" para preencher o campo de edição. */
export function centavosParaCampo(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}

/** Pontos-base → "15" ou "15,5" para preencher o campo de edição. */
export function bpsParaCampo(bps: number): string {
  return (bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
