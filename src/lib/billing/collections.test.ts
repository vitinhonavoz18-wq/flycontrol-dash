import { describe, expect, it } from "vitest";
import {
  OVERDUE_GRACE_HOURS,
  decideCollectionsAction,
  pizzeriaAccessStatusFor,
} from "./collections";

const HOUR_MS = 60 * 60 * 1000;

describe("decideCollectionsAction", () => {
  it("não faz nada antes do vencimento", () => {
    const dueAt = new Date("2026-08-20T00:00:00Z");
    const now = new Date("2026-08-19T23:59:59Z");
    expect(decideCollectionsAction({ dueAt, now, subscriptionStatus: "active" })).toBe("none");
  });

  it("marca em atraso assim que vence, dentro da tolerância", () => {
    const dueAt = new Date("2026-08-20T00:00:00Z");
    const now = new Date(dueAt.getTime() + 1000);
    expect(decideCollectionsAction({ dueAt, now, subscriptionStatus: "active" })).toBe(
      "mark_past_due",
    );
  });

  it("não repete a marcação de atraso se já estiver past_due", () => {
    const dueAt = new Date("2026-08-20T00:00:00Z");
    // Dentro da tolerância: metade dela, para o teste continuar valendo se o
    // prazo mudar de novo.
    const now = new Date(dueAt.getTime() + (OVERDUE_GRACE_HOURS / 2) * HOUR_MS);
    expect(decideCollectionsAction({ dueAt, now, subscriptionStatus: "past_due" })).toBe("none");
  });

  it(`dá ${OVERDUE_GRACE_HOURS} horas de tolerância antes de suspender`, () => {
    const dueAt = new Date("2026-08-20T00:00:00Z");
    const justBeforeGraceEnds = new Date(dueAt.getTime() + OVERDUE_GRACE_HOURS * HOUR_MS - 1000);
    expect(
      decideCollectionsAction({ dueAt, now: justBeforeGraceEnds, subscriptionStatus: "past_due" }),
    ).toBe("none");
  });

  it("suspende depois do prazo de tolerância vencido", () => {
    const dueAt = new Date("2026-08-20T00:00:00Z");
    const afterGrace = new Date(dueAt.getTime() + OVERDUE_GRACE_HOURS * HOUR_MS + 1000);
    expect(
      decideCollectionsAction({ dueAt, now: afterGrace, subscriptionStatus: "past_due" }),
    ).toBe("suspend");
  });

  it("suspende mesmo se pulou direto de active (sem passar por past_due)", () => {
    // O cron pode não rodar todo dia — a assinatura pode nunca ter sido
    // marcada past_due e já estar muito além do prazo.
    const dueAt = new Date("2026-08-20T00:00:00Z");
    const afterGrace = new Date(dueAt.getTime() + (OVERDUE_GRACE_HOURS + 240) * HOUR_MS);
    expect(decideCollectionsAction({ dueAt, now: afterGrace, subscriptionStatus: "active" })).toBe(
      "suspend",
    );
  });

  it("não repete a suspensão se já estiver suspensa", () => {
    const dueAt = new Date("2026-08-20T00:00:00Z");
    const afterGrace = new Date(dueAt.getTime() + (OVERDUE_GRACE_HOURS + 1) * HOUR_MS);
    expect(
      decideCollectionsAction({ dueAt, now: afterGrace, subscriptionStatus: "suspended" }),
    ).toBe("none");
  });
});

describe("pizzeriaAccessStatusFor", () => {
  it("mantém acesso liberado em active e past_due", () => {
    // past_due opera de propósito — é o prazo de tolerância funcionando.
    expect(pizzeriaAccessStatusFor("active")).toBe("active");
    expect(pizzeriaAccessStatusFor("past_due")).toBe("active");
  });

  it("bloqueia em qualquer outro status", () => {
    expect(pizzeriaAccessStatusFor("suspended")).toBe("suspended");
    expect(pizzeriaAccessStatusFor("canceled")).toBe("suspended");
    expect(pizzeriaAccessStatusFor("expired")).toBe("suspended");
    expect(pizzeriaAccessStatusFor("pending_activation")).toBe("suspended");
  });
});
