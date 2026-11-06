import { comparaSemVazar } from "@/lib/crm/n8nAuth";
import type { ModoMaya } from "./orquestrador";

/**
 * A porta das rotas `/api/maya/*` e a chave liga/desliga da MAYA 2.0.
 *
 * POR QUE UMA CHAVE PRÓPRIA (MAYA_N8N_SECRET), E NÃO A DO CRM
 *
 * A do CRM abre as conversas dos restaurantes. A MAYA é o atendimento do
 * próprio FlyControl. Dar a mesma chave aos dois seria usar a chave do
 * escritório para abrir o caixa das lojas: se uma vazar, as duas portas caem.
 *
 * SEM CHAVE CONFIGURADA, A PORTA NÃO ABRE — nunca o contrário.
 *
 * O INTERRUPTOR (MAYA_V2_MODO)
 *
 *   desligado (padrão) → as rotas respondem "desligado" e não tocam no banco.
 *   sombra             → tudo roda e é registrado, mas NADA é enviado ao
 *                        cliente. Serve para comparar com a MAYA antiga sem
 *                        risco: é o aprendiz que anota o que responderia
 *                        enquanto o atendente experiente continua atendendo.
 *   ativo              → a MAYA 2.0 responde de verdade.
 *
 * Voltar atrás é trocar a variável para "desligado": em segundos, sem
 * publicar nada de novo.
 */

export function modoDaMaya(): ModoMaya {
  const v = String(process.env.MAYA_V2_MODO ?? "")
    .trim()
    .toLowerCase();
  return v === "ativo" || v === "sombra" ? v : "desligado";
}

export function conferirChaveDaMaya(
  request: Request,
): { ok: true } | { ok: false; status: number; erro: string } {
  const segredo = (process.env.MAYA_N8N_SECRET || "").trim();
  if (!segredo) return { ok: false, status: 503, erro: "integracao_nao_configurada" };
  const apresentado = (request.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!apresentado || !comparaSemVazar(apresentado, segredo)) {
    return { ok: false, status: 401, erro: "nao_autorizado" };
  }
  return { ok: true };
}

const CABECALHOS = { "Content-Type": "application/json" };

export function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: CABECALHOS });
}

/**
 * Atende uma rota da MAYA com a porta, o interruptor e o tratamento de erro
 * padronizados. Erro inesperado devolve 500 SEM detalhe para fora — o
 * detalhe fica no registro do servidor, sem o texto do cliente.
 */
export async function atenderRotaDaMaya(
  request: Request,
  executar: (corpo: Record<string, unknown>, modo: ModoMaya) => Promise<unknown>,
): Promise<Response> {
  const porta = conferirChaveDaMaya(request);
  if (!porta.ok) return json({ success: false, error: porta.erro }, porta.status);

  let corpo: Record<string, unknown>;
  try {
    const lido = await request.json();
    if (!lido || typeof lido !== "object" || Array.isArray(lido)) throw new Error("corpo");
    corpo = lido as Record<string, unknown>;
  } catch {
    return json({ success: false, error: "corpo_invalido" }, 400);
  }

  const modo = modoDaMaya();
  if (modo === "desligado") return json({ success: true, acao: "desligado" });

  try {
    const resultado = await executar(corpo, modo);
    return json({ success: true, modo, ...(resultado as object) });
  } catch (e) {
    console.error("[maya] falha na rota:", e instanceof Error ? e.message : "erro");
    return json({ success: false, error: "falha_interna" }, 500);
  }
}
