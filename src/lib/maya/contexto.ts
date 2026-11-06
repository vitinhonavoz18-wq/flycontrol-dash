/**
 * A ponte entre o n8n e o "cérebro" da MAYA que mora aqui.
 *
 * O n8n é o carteiro: recebe a mensagem do WhatsApp, entrega a resposta. As
 * decisões que precisam ser iguais em todo canal (o prompt, os preços, "o
 * cliente pediu humano?", "a resposta é segura de mandar?") ficam aqui, num
 * lugar só, com teste.
 *
 * A PORTA
 *
 * Chave própria, `MAYA_N8N_SECRET`, separada da do CRM. A do CRM abre as
 * conversas das lojas; esta só lê o prompt e faz conta de plano. Misturar as
 * duas seria usar a chave do cofre para abrir o armário de vassoura — se a do
 * armário vazar, o cofre continua fechado.
 *
 * Sem a variável configurada, a porta não abre para ninguém.
 */

import { comparaSemVazar } from "@/lib/crm/n8nAuth";
import { politicaComercialVigente, type PoliticaComercialMaya } from "./politicaComercial";
import { MAYA_PROMPT_VERSAO, montarPromptMaya, type CanalMaya } from "./prompt";
import { lerSinais, type SinaisDaMensagem } from "./sinais";

export type ResultadoPortaMaya = { ok: true } | { ok: false; status: number; erro: string };

export function conferirPortaMaya(request: Request): ResultadoPortaMaya {
  const segredo = (process.env.MAYA_N8N_SECRET || "").trim();
  if (!segredo) return { ok: false, status: 503, erro: "maya_nao_configurada" };

  const cabecalho = request.headers.get("authorization") || "";
  const apresentado = cabecalho.replace(/^Bearer\s+/i, "").trim();
  if (!apresentado || !comparaSemVazar(apresentado, segredo)) {
    return { ok: false, status: 401, erro: "nao_autorizado" };
  }
  return { ok: true };
}

export function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function lerCorpo(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const corpo = (await request.json()) as unknown;
    return corpo && typeof corpo === "object" && !Array.isArray(corpo)
      ? (corpo as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const CANAIS: readonly CanalMaya[] = ["whatsapp", "instagram", "site", "outro"];
const FERRAMENTAS_CONHECIDAS = ["simular_planos"] as const;

/** Hora e minuto no fuso da equipe, sem depender do fuso do servidor. */
export function relogioDaEquipe(agora: Date, fuso: string): { hora: number; texto: string } {
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
  const texto = `${pega("weekday")}, ${pega("day")}/${pega("month")}/${pega("year")} às ${pega("hour")}:${pega("minute")}`;
  return { hora, texto };
}

export type EntradaContexto = {
  mensagem: string;
  canal: CanalMaya;
  nome: string | null;
  primeiroContato: boolean;
  ferramentas: string[];
};

export function lerEntradaContexto(corpo: Record<string, unknown>): EntradaContexto {
  const canalBruto = String(corpo.canal ?? "whatsapp").toLowerCase();
  const canal = (CANAIS as readonly string[]).includes(canalBruto)
    ? (canalBruto as CanalMaya)
    : "outro";
  const ferramentas = Array.isArray(corpo.ferramentas)
    ? corpo.ferramentas
        .map(String)
        .filter((f) => (FERRAMENTAS_CONHECIDAS as readonly string[]).includes(f))
    : [];
  const nome = corpo.nome ? String(corpo.nome).slice(0, 80) : null;
  return {
    // Mensagem enorme não vira prompt enorme: corta antes.
    mensagem: String(corpo.mensagem ?? "").slice(0, 4000),
    canal,
    nome,
    primeiroContato: corpo.primeiro_contato === true,
    ferramentas,
  };
}

export type ContextoMaya = {
  versaoPrompt: string;
  versaoPolitica: string;
  systemPrompt: string;
  sinais: SinaisDaMensagem;
  dentroDoHorarioHumano: boolean;
};

export function montarContextoMaya(
  entrada: EntradaContexto,
  agora: Date,
  politica: PoliticaComercialMaya = politicaComercialVigente(),
): ContextoMaya {
  const relogio = relogioDaEquipe(agora, politica.atendimentoHumano.fuso);
  const dentro =
    relogio.hora >= politica.atendimentoHumano.abre &&
    relogio.hora < politica.atendimentoHumano.fecha;
  return {
    versaoPrompt: MAYA_PROMPT_VERSAO,
    versaoPolitica: politica.versao,
    systemPrompt: montarPromptMaya(politica, {
      canal: entrada.canal,
      agoraTexto: relogio.texto,
      dentroDoHorarioHumano: dentro,
      nomeDoContato: entrada.nome,
      primeiroContato: entrada.primeiroContato,
      ferramentas: entrada.ferramentas,
    }),
    sinais: lerSinais(entrada.mensagem),
    dentroDoHorarioHumano: dentro,
  };
}
