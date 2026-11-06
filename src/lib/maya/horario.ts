/**
 * O relógio da equipe humana.
 *
 * O servidor roda em UTC (horário de Londres). Se a conta fosse feita no
 * relógio do servidor, às 21h em Salvador ele acharia que já é meia-noite e
 * diria ao cliente que a equipe foi dormir. Por isso a hora é sempre lida no
 * fuso de Brasília.
 */

export const FUSO_DA_EQUIPE = "America/Sao_Paulo";
export const HORA_ABRE = 7;
export const HORA_FECHA = 23;

export type MomentoLocal = { hora: number; minuto: number; rotulo: string };

export function momentoLocal(agora: Date, fuso = FUSO_DA_EQUIPE): MomentoLocal {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);
  const pega = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const hora = Number(pega("hour"));
  const minuto = Number(pega("minute"));
  return {
    hora,
    minuto,
    rotulo: `${pega("weekday")}, ${pega("day")}/${pega("month")}/${pega("year")} às ${pega("hour")}:${pega("minute")}`,
  };
}

/** Das 07:00 às 22:59 a equipe está atendendo. Às 23:00 já está fechado. */
export function equipeAtendendo(agora: Date): boolean {
  const { hora } = momentoLocal(agora);
  return hora >= HORA_ABRE && hora < HORA_FECHA;
}
