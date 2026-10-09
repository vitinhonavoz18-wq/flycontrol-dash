/** Períodos e datas das telas financeiras do Pix. */

export const PERIODOS = [
  { dias: 7, rotulo: "Últimos 7 dias" },
  { dias: 30, rotulo: "Últimos 30 dias" },
  { dias: 90, rotulo: "Últimos 90 dias" },
] as const;

export function intervaloDosUltimosDias(dias: number): { de: Date; ate: Date } {
  const ate = new Date(Date.now() + 60_000);
  const de = new Date();
  de.setHours(0, 0, 0, 0);
  de.setDate(de.getDate() - (dias - 1));
  return { de, ate };
}

export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
