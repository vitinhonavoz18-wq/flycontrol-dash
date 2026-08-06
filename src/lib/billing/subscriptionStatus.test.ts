import { describe, expect, it } from "vitest";
import {
  SUBSCRIPTION_STATUSES,
  allowedTransitionsFrom,
  availableActions,
  canTransition,
  isOperational,
  isSubscriptionStatus,
  isTerminalStatus,
} from "./subscriptionStatus";

describe("transições do fluxo normal", () => {
  it("percorre o caminho feliz do cadastro até a operação", () => {
    expect(canTransition("pending_activation", "pending_payment").allowed).toBe(true);
    expect(canTransition("pending_payment", "active").allowed).toBe(true);
  });

  it("permite ativação direta enquanto não há gateway", () => {
    // Sem InfinityPay integrada, quem confirma o pagamento é um
    // administrador — e ele confirma o que já recebeu.
    expect(canTransition("pending_activation", "active").allowed).toBe(true);
  });

  it("cobre o ciclo de inadimplência", () => {
    expect(canTransition("active", "past_due").allowed).toBe(true);
    expect(canTransition("past_due", "suspended").allowed).toBe(true);
    expect(canTransition("suspended", "active").allowed).toBe(true);
    // Pagou antes de suspender: volta direto.
    expect(canTransition("past_due", "active").allowed).toBe(true);
  });
});

describe("transições recusadas", () => {
  it("não ressuscita assinatura encerrada", () => {
    // O histórico de cobrança do período encerrado precisa continuar intacto.
    for (const target of SUBSCRIPTION_STATUSES) {
      expect(canTransition("canceled", target).allowed).toBe(false);
      expect(canTransition("expired", target).allowed).toBe(false);
    }
    expect(isTerminalStatus("canceled")).toBe(true);
    expect(isTerminalStatus("expired")).toBe(true);
  });

  it("não pula do cadastro direto para inadimplência", () => {
    expect(canTransition("pending_activation", "past_due").allowed).toBe(false);
    expect(canTransition("pending_activation", "suspended").allowed).toBe(false);
  });

  it("não aceita transição para o mesmo status", () => {
    const result = canTransition("active", "active");
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.reason).toMatch(/já está/i);
  });

  it("recusa status inventado, em vez de aceitar em silêncio", () => {
    expect(canTransition("active", "gratis").allowed).toBe(false);
    expect(canTransition("qualquer_coisa", "active").allowed).toBe(false);
    expect(isSubscriptionStatus("trial")).toBe(false);
  });

  it("explica o motivo em português, sem jargão técnico", () => {
    const result = canTransition("canceled", "active");
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.reason).toContain("Cancelada");
    expect(result.allowed === false && result.reason).toContain("Ativa");
  });
});

describe("operação e acesso", () => {
  it("mantém o restaurante operando em atraso de pagamento", () => {
    // Cortar acesso no primeiro dia de atraso derruba a operação por um
    // pagamento que pode estar só compensando. Suspender é decisão explícita.
    expect(isOperational("past_due")).toBe(true);
    expect(isOperational("active")).toBe(true);
  });

  it("não opera antes de ativar nem depois de encerrar", () => {
    for (const status of [
      "pending_activation",
      "pending_payment",
      "suspended",
      "canceled",
      "expired",
    ]) {
      expect(isOperational(status)).toBe(false);
    }
  });
});

describe("ações oferecidas ao administrador", () => {
  it("oferece ativar a quem nunca operou", () => {
    const keys = availableActions("pending_payment").map((a) => a.key);
    expect(keys).toContain("activate");
    expect(keys).not.toContain("reactivate");
  });

  it("oferece reativar a quem já operou e parou", () => {
    const keys = availableActions("suspended").map((a) => a.key);
    expect(keys).toContain("reactivate");
    expect(keys).not.toContain("activate");
  });

  it("marca suspender e cancelar como destrutivas", () => {
    const actions = availableActions("active");
    expect(actions.find((a) => a.key === "suspend")?.destructive).toBe(true);
    expect(actions.find((a) => a.key === "cancel")?.destructive).toBe(true);
  });

  it("não oferece ação nenhuma em status terminal", () => {
    expect(availableActions("canceled")).toHaveLength(0);
    expect(availableActions("expired")).toHaveLength(0);
  });

  it("só oferece ações que a máquina de estados aceita", () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      for (const action of availableActions(status)) {
        expect(canTransition(status, action.targetStatus).allowed).toBe(true);
      }
    }
  });

  it("toda transição permitida tem destino válido", () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      for (const target of allowedTransitionsFrom(status)) {
        expect(isSubscriptionStatus(target)).toBe(true);
        expect(canTransition(status, target).allowed).toBe(true);
      }
    }
  });
});
