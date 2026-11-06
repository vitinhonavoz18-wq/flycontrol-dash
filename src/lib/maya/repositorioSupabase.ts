import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Canal, FichaDoLead } from "./prompt";
import type { ConversaMaya, MensagemMaya, RepositorioMaya, TurnoMaya } from "./orquestrador";

/**
 * As tabelas `maya_*` do Supabase.
 *
 * Elas só existem depois que o SQL de `docs/maya-2/APLICAR-NO-SUPABASE-maya-2.sql`
 * for aplicado. Enquanto isso, a MAYA 2.0 fica no modo "desligado" e este
 * arquivo nem é chamado.
 *
 * Usa a chave de serviço (passa por cima das regras de acesso do banco). Por
 * isso só é alcançado pelas rotas `/api/maya/*`, que conferem a chave do n8n
 * antes de qualquer coisa — e as tabelas têm RLS ligada SEM nenhuma regra de
 * leitura pública: pelo navegador, ninguém lê uma linha.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = (tabela: string): any => (supabaseAdmin as any).from(tabela);

const VIOLACAO_DE_UNICO = "23505";

function data(v: unknown): Date | null {
  return typeof v === "string" && v ? new Date(v) : null;
}

function paraConversa(r: any): ConversaMaya {
  return {
    id: r.id,
    canal: r.canal as Canal,
    contato: r.contato,
    nome: r.nome ?? null,
    humanoAte: data(r.humano_ate),
    optOutEm: data(r.opt_out_em),
    apresentouEm: data(r.apresentou_em),
    ficha: (r.ficha ?? {}) as FichaDoLead,
  };
}

function paraMensagem(r: any): MensagemMaya {
  return {
    id: r.id,
    conversaId: r.conversa_id,
    autor: r.autor,
    texto: r.texto ?? "",
    criadaEm: new Date(r.created_at),
    turnoId: r.turno_id ?? null,
  };
}

function paraTurno(r: any): TurnoMaya {
  return {
    id: r.id,
    conversaId: r.conversa_id,
    ultimaMensagemId: r.ultima_mensagem_id,
    status: r.status,
    volumes: Array.isArray(r.volumes) ? r.volumes.map(Number) : [],
    modo: r.modo,
    criadoEm: new Date(r.created_at),
  };
}

function falhou(contexto: string, error: any): never {
  // Sem o texto da mensagem do cliente no registro: só o código do erro.
  throw new Error(`[maya] ${contexto}: ${error?.code ?? ""} ${error?.message ?? ""}`.trim());
}

export const repositorioSupabase: RepositorioMaya = {
  async obterOuCriarConversa(canal, contato, nome) {
    const existente = await db("maya_conversas")
      .select("*")
      .eq("canal", canal)
      .eq("contato", contato)
      .maybeSingle();
    if (existente.error) falhou("buscar conversa", existente.error);
    if (existente.data) return paraConversa(existente.data);

    const criada = await db("maya_conversas").insert({ canal, contato, nome }).select("*").single();
    if (!criada.error) return paraConversa(criada.data);
    // Duas mensagens do mesmo número chegaram juntas: a outra criou primeiro.
    if (criada.error.code === VIOLACAO_DE_UNICO) {
      const de_novo = await db("maya_conversas")
        .select("*")
        .eq("canal", canal)
        .eq("contato", contato)
        .single();
      if (de_novo.error) falhou("buscar conversa após corrida", de_novo.error);
      return paraConversa(de_novo.data);
    }
    falhou("criar conversa", criada.error);
  },

  async buscarConversa(id) {
    const r = await db("maya_conversas").select("*").eq("id", id).maybeSingle();
    if (r.error) falhou("buscar conversa", r.error);
    return r.data ? paraConversa(r.data) : null;
  },

  async atualizarConversa(id, patch) {
    const linha: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ("nome" in patch) linha.nome = patch.nome;
    if ("humanoAte" in patch) linha.humano_ate = patch.humanoAte?.toISOString() ?? null;
    if ("optOutEm" in patch) linha.opt_out_em = patch.optOutEm?.toISOString() ?? null;
    if ("apresentouEm" in patch) linha.apresentou_em = patch.apresentouEm?.toISOString() ?? null;
    if ("ficha" in patch) linha.ficha = patch.ficha ?? {};
    const r = await db("maya_conversas").update(linha).eq("id", id);
    if (r.error) falhou("atualizar conversa", r.error);
  },

  async registrarMensagem(m) {
    const r = await db("maya_mensagens")
      .insert({
        conversa_id: m.conversaId,
        autor: m.autor,
        texto: m.texto,
        external_id: m.externalId,
        turno_id: m.turnoId ?? null,
        modo: m.modo,
      })
      .select("id")
      .single();
    if (!r.error) return { id: r.data.id as string, duplicada: false };
    if (r.error.code === VIOLACAO_DE_UNICO) return { id: "", duplicada: true };
    falhou("gravar mensagem", r.error);
  },

  async buscarMensagem(id) {
    const r = await db("maya_mensagens").select("*").eq("id", id).maybeSingle();
    if (r.error) falhou("buscar mensagem", r.error);
    return r.data ? paraMensagem(r.data) : null;
  },

  async historico(conversaId, limite) {
    const r = await db("maya_mensagens")
      .select("*")
      .eq("conversa_id", conversaId)
      .order("created_at", { ascending: false })
      .limit(limite);
    if (r.error) falhou("ler histórico", r.error);
    return (r.data ?? []).map(paraMensagem).reverse();
  },

  async saidasDaMayaDesde(conversaId, desde) {
    const r = await db("maya_mensagens")
      .select("*")
      .eq("conversa_id", conversaId)
      .eq("autor", "maya")
      .gte("created_at", desde.toISOString())
      .order("created_at", { ascending: true });
    if (r.error) falhou("ler respostas recentes", r.error);
    return (r.data ?? []).map(paraMensagem);
  },

  async abrirTurno(t) {
    const r = await db("maya_turnos")
      .insert({
        conversa_id: t.conversaId,
        ultima_mensagem_id: t.ultimaMensagemId,
        volumes: t.volumes,
        modo: t.modo,
        versao_prompt: t.versaoPrompt,
        versao_comercial: t.versaoComercial,
      })
      .select("*")
      .single();
    if (!r.error) return { turno: paraTurno(r.data), jaExistia: false };
    if (r.error.code === VIOLACAO_DE_UNICO) {
      const existente = await db("maya_turnos")
        .select("*")
        .eq("ultima_mensagem_id", t.ultimaMensagemId)
        .single();
      if (existente.error) falhou("buscar turno existente", existente.error);
      return { turno: paraTurno(existente.data), jaExistia: true };
    }
    falhou("abrir turno", r.error);
  },

  async buscarTurno(id) {
    const r = await db("maya_turnos").select("*").eq("id", id).maybeSingle();
    if (r.error) falhou("buscar turno", r.error);
    return r.data ? paraTurno(r.data) : null;
  },

  async fecharTurno(id, resultado) {
    // "Só se ainda estiver aberto": é isso que impede a mesma resposta de ser
    // liberada duas vezes quando o n8n repete o pedido.
    const r = await db("maya_turnos")
      .update({
        status: "respondido",
        intencao: resultado.intencao,
        proxima_acao: resultado.proximaAcao,
        precisa_humano: resultado.precisaHumano,
        alertas: resultado.alertas,
        substituida: resultado.substituida,
        latencia_ms: resultado.latenciaMs,
        respondido_em: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "aberto")
      .select("id");
    if (r.error) falhou("fechar turno", r.error);
    return Array.isArray(r.data) && r.data.length === 1;
  },

  async registrarEvento(conversaId, tipo, detalhe) {
    const r = await db("maya_eventos").insert({ conversa_id: conversaId, tipo, detalhe });
    if (r.error) falhou("registrar evento", r.error);
  },
};
