import { extrairDaUazapi } from "@/lib/crm/uazapiEvento";
import {
  decidirEntrada,
  HORAS_DE_PAUSA_NA_TRANSFERENCIA,
  SEGUNDOS_PARA_AGRUPAR,
  type EventoRecebido,
} from "./decisao";
import { equipeAtendendo, momentoLocal } from "./horario";
import {
  montarPoliticaComercial,
  tabelaDeSimulacao,
  valoresPermitidosCents,
} from "./politicaComercial";
import { MAYA_VERSAO, montarPromptDoSistema, type Canal, type FichaDoLead } from "./prompt";
import { conferirSaida } from "./saida";
import { lerSinais } from "./sinais";

/**
 * O MAESTRO DA MAYA 2.0.
 *
 * O n8n continua sendo o carteiro (recebe do WhatsApp, chama a IA com a
 * credencial que já tem, entrega a resposta). Mas QUEM DECIDE mora aqui:
 *
 *   1. entrada   → a mensagem chegou: é repetida? é eco? a equipe assumiu?
 *                  pediu uma pessoa? pediu para parar?
 *   2. turno     → depois de esperar o cliente terminar de digitar: junta as
 *                  mensagens picadas e entrega à IA as instruções + contexto.
 *   3. resposta  → a IA respondeu: confere, corrige o que for perigoso,
 *                  cumpre a transferência que ela anunciou e só então libera
 *                  o texto para envio.
 *
 * Cada passo é registrado. Se algo der errado, dá para ver o que a MAYA
 * recebeu, o que respondeu e por quê — o que hoje não existe.
 *
 * O banco entra por uma interface (`RepositorioMaya`). Nos testes ele é uma
 * lista na memória; em produção, as tabelas `maya_*` do Supabase.
 */

export type ModoMaya = "desligado" | "sombra" | "ativo";

export type Autor = "cliente" | "maya" | "equipe";

export type ConversaMaya = {
  id: string;
  canal: Canal;
  contato: string;
  nome: string | null;
  humanoAte: Date | null;
  optOutEm: Date | null;
  apresentouEm: Date | null;
  ficha: FichaDoLead;
};

export type MensagemMaya = {
  id: string;
  conversaId: string;
  autor: Autor;
  texto: string;
  criadaEm: Date;
  turnoId: string | null;
};

export type TurnoMaya = {
  id: string;
  conversaId: string;
  ultimaMensagemId: string;
  status: "aberto" | "respondido";
  volumes: number[];
  modo: ModoMaya;
  criadoEm: Date;
};

export type EventoDeConversa =
  | "transferencia"
  | "pausa_equipe"
  | "liberada_pela_equipe"
  | "opt_out"
  | "resposta_bloqueada"
  | "anti_loop";

export interface RepositorioMaya {
  obterOuCriarConversa(canal: Canal, contato: string, nome: string | null): Promise<ConversaMaya>;
  buscarConversa(id: string): Promise<ConversaMaya | null>;
  atualizarConversa(
    id: string,
    patch: Partial<
      Pick<ConversaMaya, "nome" | "humanoAte" | "optOutEm" | "apresentouEm" | "ficha">
    >,
  ): Promise<void>;
  /** Grava a mensagem. `duplicada` = o mesmo external_id já tinha chegado. */
  registrarMensagem(m: {
    conversaId: string;
    autor: Autor;
    texto: string;
    externalId: string | null;
    turnoId?: string | null;
    modo: ModoMaya;
  }): Promise<{ id: string; duplicada: boolean }>;
  buscarMensagem(id: string): Promise<MensagemMaya | null>;
  /** As últimas `limite` mensagens, da mais antiga para a mais nova. */
  historico(conversaId: string, limite: number): Promise<MensagemMaya[]>;
  saidasDaMayaDesde(conversaId: string, desde: Date): Promise<MensagemMaya[]>;
  /** Abre o turno. Se já existe um para a mesma última mensagem, devolve `jaExistia`. */
  abrirTurno(t: {
    conversaId: string;
    ultimaMensagemId: string;
    volumes: number[];
    modo: ModoMaya;
    versaoPrompt: string;
    versaoComercial: string;
  }): Promise<{ turno: TurnoMaya; jaExistia: boolean }>;
  buscarTurno(id: string): Promise<TurnoMaya | null>;
  /** Fecha o turno SÓ se ainda estiver aberto. `false` = outro pedido fechou antes. */
  fecharTurno(
    id: string,
    resultado: {
      intencao: string;
      proximaAcao: string;
      precisaHumano: boolean;
      alertas: string[];
      substituida: boolean;
      latenciaMs: number | null;
    },
  ): Promise<boolean>;
  registrarEvento(
    conversaId: string,
    tipo: EventoDeConversa,
    detalhe: Record<string, unknown>,
  ): Promise<void>;
}

export type AvisoParaEquipe = {
  motivo: string;
  contato: string;
  nome: string | null;
  ultimaMensagem: string;
  ficha: FichaDoLead;
  dentroDoHorario: boolean;
};

export type RespostaEntrada =
  | { acao: "desligado" }
  | { acao: "ignorar"; motivo: string }
  | { acao: "silenciar"; motivo: string }
  | { acao: "aguardar"; mensagem_id: string; aguardar_segundos: number }
  | {
      acao: "enviar";
      motivo: string;
      enviar: string[];
      em_sombra: boolean;
      seria_enviado?: string[];
      avisar_equipe: AvisoParaEquipe | null;
    };

export type RespostaTurno =
  | { acao: "desligado" }
  | { acao: "agrupada"; motivo: string }
  | { acao: "silenciar"; motivo: string }
  | { acao: "ja_processado" }
  | {
      acao: "chamar_ia";
      turno_id: string;
      prompt_sistema: string;
      mensagens: { role: "user" | "assistant"; content: string }[];
    };

export type RespostaFinal =
  | { acao: "desligado" }
  | { acao: "ja_processado"; enviar: [] }
  | {
      acao: "enviar";
      enviar: string[];
      em_sombra: boolean;
      seria_enviado?: string[];
      avisar_equipe: AvisoParaEquipe | null;
      alertas: string[];
    };

/** Quantas respostas da MAYA num minuto, na mesma conversa, já é sinal de loop. */
export const LIMITE_DE_RESPOSTAS_POR_MINUTO = 4;
const MENSAGENS_DE_HISTORICO = 20;

export function eventoDaUazapi(corpo: Record<string, unknown>): EventoRecebido {
  const uaz = extrairDaUazapi(corpo);
  const bruto = (corpo.message ?? corpo.data ?? {}) as Record<string, unknown>;
  const m = (Array.isArray(bruto) ? bruto[0] : bruto) as Record<string, unknown>;
  // O n8n pode mandar o texto já transcrito/descrito (áudio, imagem).
  const transcrito = typeof corpo.texto === "string" ? corpo.texto.trim() : "";
  const tipo = String(m?.messageType ?? "").toLowerCase();
  const ehMidia = /audio|image|video|document|sticker|ptt/.test(tipo);
  return {
    telefone: uaz?.telefone || null,
    texto: transcrito || uaz?.texto || "",
    fromMe: uaz?.fromMe === true,
    enviadaPelaApi: m?.wasSentByApi === true,
    ehGrupo: uaz?.ignorar === true,
    externalId: uaz?.externalId ?? null,
    midiaSemTexto: ehMidia && !transcrito && !uaz?.texto,
  };
}

function aviso(
  conversa: ConversaMaya,
  motivo: string,
  ultima: string,
  agora: Date,
): AvisoParaEquipe {
  return {
    motivo,
    contato: conversa.contato,
    nome: conversa.nome,
    // Só o começo: o aviso é para chamar a equipe, não para copiar a conversa
    // para outro lugar. A conversa inteira continua no WhatsApp.
    ultimaMensagem: ultima.slice(0, 300),
    ficha: conversa.ficha,
    dentroDoHorario: equipeAtendendo(agora),
  };
}

function entregar(modo: ModoMaya, textos: string[]) {
  return modo === "ativo"
    ? { enviar: textos, em_sombra: false }
    : { enviar: [] as string[], em_sombra: true, seria_enviado: textos };
}

export async function processarEntrada(
  repo: RepositorioMaya,
  evento: EventoRecebido,
  opcoes: { modo: ModoMaya; agora: Date; canal: Canal; nome: string | null },
): Promise<RespostaEntrada> {
  const { modo, agora, canal } = opcoes;
  if (modo === "desligado") return { acao: "desligado" };

  // Grupo e sem telefone nem chegam ao banco.
  const previa = decidirEntrada(
    evento,
    {
      existe: false,
      humanoAte: null,
      optOutEm: null,
      saidasRecentes: [],
      mensagemJaRecebida: false,
    },
    agora,
  );
  if (
    previa.acao === "ignorar" &&
    (previa.motivo === "grupo" || previa.motivo === "sem_telefone")
  ) {
    return { acao: "ignorar", motivo: previa.motivo };
  }

  const conversa = await repo.obterOuCriarConversa(
    canal,
    evento.telefone!,
    evento.fromMe ? null : opcoes.nome,
  );

  const recentes = await repo.saidasDaMayaDesde(
    conversa.id,
    new Date(agora.getTime() - 5 * 60_000),
  );
  const estado = {
    existe: true,
    humanoAte: conversa.humanoAte,
    optOutEm: conversa.optOutEm,
    saidasRecentes: recentes.map((s) => ({ texto: s.texto, em: s.criadaEm })),
    mensagemJaRecebida: false,
  };

  const decisao = decidirEntrada(evento, estado, agora);
  if (decisao.acao === "ignorar") return { acao: "ignorar", motivo: decisao.motivo };

  const gravada = await repo.registrarMensagem({
    conversaId: conversa.id,
    autor: evento.fromMe ? "equipe" : "cliente",
    texto: evento.texto,
    externalId: evento.externalId,
    modo,
  });
  if (gravada.duplicada) return { acao: "ignorar", motivo: "repetida" };

  // Com o nome novo, atualiza a ficha (o cliente pode ter trocado o nome).
  if (!evento.fromMe && opcoes.nome && opcoes.nome !== conversa.nome) {
    await repo.atualizarConversa(conversa.id, { nome: opcoes.nome });
    conversa.nome = opcoes.nome;
  }

  switch (decisao.acao) {
    case "pausar_ia":
      await repo.atualizarConversa(conversa.id, { humanoAte: decisao.ate });
      await repo.registrarEvento(conversa.id, "pausa_equipe", { ate: decisao.ate.toISOString() });
      return { acao: "silenciar", motivo: "equipe_respondeu" };

    case "liberar_ia":
      await repo.atualizarConversa(conversa.id, { humanoAte: null });
      await repo.registrarEvento(conversa.id, "liberada_pela_equipe", {});
      return { acao: "silenciar", motivo: "maya_liberada" };

    case "silenciar":
      return { acao: "silenciar", motivo: decisao.motivo };

    case "registrar_opt_out": {
      await repo.atualizarConversa(conversa.id, { optOutEm: agora });
      await repo.registrarEvento(conversa.id, "opt_out", {});
      if (!decisao.resposta) return { acao: "silenciar", motivo: "opt_out_registrado" };
      await repo.registrarMensagem({
        conversaId: conversa.id,
        autor: "maya",
        texto: decisao.resposta,
        externalId: null,
        modo,
      });
      return {
        acao: "enviar",
        motivo: "opt_out",
        ...entregar(modo, [decisao.resposta]),
        avisar_equipe: null,
      };
    }

    case "transferir": {
      await repo.atualizarConversa(conversa.id, { humanoAte: decisao.ate });
      await repo.registrarEvento(conversa.id, "transferencia", { motivo: decisao.motivo });
      await repo.registrarMensagem({
        conversaId: conversa.id,
        autor: "maya",
        texto: decisao.resposta,
        externalId: null,
        modo,
      });
      return {
        acao: "enviar",
        motivo: "transferencia",
        ...entregar(modo, [decisao.resposta]),
        avisar_equipe: aviso(conversa, decisao.motivo, evento.texto, agora),
      };
    }

    case "pedir_reenvio":
      await repo.registrarMensagem({
        conversaId: conversa.id,
        autor: "maya",
        texto: decisao.resposta,
        externalId: null,
        modo,
      });
      return {
        acao: "enviar",
        motivo: "midia_ilegivel",
        ...entregar(modo, [decisao.resposta]),
        avisar_equipe: null,
      };

    case "responder":
      break;

    default: {
      const _nunca: never = decisao;
      void _nunca;
    }
  }

  return { acao: "aguardar", mensagem_id: gravada.id, aguardar_segundos: SEGUNDOS_PARA_AGRUPAR };
}

export async function prepararTurno(
  repo: RepositorioMaya,
  mensagemId: string,
  opcoes: { modo: ModoMaya; agora: Date },
): Promise<RespostaTurno> {
  const { modo, agora } = opcoes;
  if (modo === "desligado") return { acao: "desligado" };

  const mensagem = await repo.buscarMensagem(mensagemId);
  if (!mensagem || mensagem.autor !== "cliente")
    return { acao: "agrupada", motivo: "mensagem_desconhecida" };

  const conversa = await repo.buscarConversa(mensagem.conversaId);
  if (!conversa) return { acao: "agrupada", motivo: "conversa_desconhecida" };

  // A equipe assumiu enquanto o cliente ainda digitava.
  if (conversa.humanoAte && conversa.humanoAte.getTime() > agora.getTime()) {
    return { acao: "silenciar", motivo: "equipe_conduzindo" };
  }

  const historico = await repo.historico(conversa.id, MENSAGENS_DE_HISTORICO);
  const ultimaDoCliente = [...historico].reverse().find((m) => m.autor === "cliente");
  // Chegou outra mensagem depois desta: quem responde é o turno da última.
  if (ultimaDoCliente && ultimaDoCliente.id !== mensagem.id) {
    return { acao: "agrupada", motivo: "chegou_mensagem_mais_nova" };
  }

  const ultimas = await repo.saidasDaMayaDesde(conversa.id, new Date(agora.getTime() - 60_000));
  if (ultimas.length >= LIMITE_DE_RESPOSTAS_POR_MINUTO) {
    await repo.registrarEvento(conversa.id, "anti_loop", { respostas_no_minuto: ultimas.length });
    return { acao: "silenciar", motivo: "anti_loop" };
  }

  // O que o cliente mandou desde a última fala de alguém do nosso lado.
  let inicioPendentes = historico.length;
  while (inicioPendentes > 0 && historico[inicioPendentes - 1].autor === "cliente")
    inicioPendentes--;
  const pendentes = historico.slice(inicioPendentes);
  const anteriores = historico.slice(0, inicioPendentes);
  const textoAgrupado = pendentes.map((m) => m.texto).join("\n");

  const sinais = lerSinais(textoAgrupado);
  const volume = sinais.volumeMensalDeclarado ?? conversa.ficha.volume_pedidos_mes ?? null;
  const politica = montarPoliticaComercial();
  const volumes = volume ? [volume] : [];
  const simulacao = tabelaDeSimulacao(volumes);

  const { turno, jaExistia } = await repo.abrirTurno({
    conversaId: conversa.id,
    ultimaMensagemId: mensagem.id,
    volumes,
    modo,
    versaoPrompt: MAYA_VERSAO,
    versaoComercial: politica.versao,
  });
  if (jaExistia) return { acao: "ja_processado" };

  const jaSeApresentou = !!conversa.apresentouEm || anteriores.some((m) => m.autor === "maya");

  const prompt = montarPromptDoSistema(politica, {
    canal: conversa.canal,
    dataHora: momentoLocal(agora).rotulo,
    equipeAtendendo: equipeAtendendo(agora),
    jaSeApresentou,
    nomeDoContato: conversa.nome,
    ficha: conversa.ficha,
    sinais: { ...sinais, volumeMensalDeclarado: volume },
    simulacao,
  });

  const mensagens = anteriores.map((m) => ({
    role: m.autor === "cliente" ? ("user" as const) : ("assistant" as const),
    content: m.autor === "equipe" ? `[mensagem da equipe humana] ${m.texto}` : m.texto,
  }));
  mensagens.push({ role: "user", content: textoAgrupado });

  return { acao: "chamar_ia", turno_id: turno.id, prompt_sistema: prompt, mensagens };
}

const CAMPOS_DA_FICHA = [
  "nome_estabelecimento",
  "segmento",
  "volume_pedidos_mes",
  "plano_de_interesse",
  "objetivo",
] as const;

/** Junta o que a IA anotou com o que já se sabia, sem apagar nada com vazio. */
export function juntarFicha(atual: FichaDoLead, nova: FichaDoLead): FichaDoLead {
  const r: FichaDoLead = { ...atual };
  for (const campo of CAMPOS_DA_FICHA) {
    const v = nova[campo];
    if (v === undefined || v === null || v === "") continue;
    (r as Record<string, unknown>)[campo] = v;
  }
  return r;
}

export async function concluirTurno(
  repo: RepositorioMaya,
  turnoId: string,
  saidaDaIa: unknown,
  opcoes: { modo: ModoMaya; agora: Date },
): Promise<RespostaFinal> {
  const { modo, agora } = opcoes;
  if (modo === "desligado") return { acao: "desligado" };

  const turno = await repo.buscarTurno(turnoId);
  if (!turno || turno.status !== "aberto") return { acao: "ja_processado", enviar: [] };

  const conversa = await repo.buscarConversa(turno.conversaId);
  if (!conversa) return { acao: "ja_processado", enviar: [] };

  const politica = montarPoliticaComercial();
  const permitidos = valoresPermitidosCents(politica, tabelaDeSimulacao(turno.volumes));
  const saida = conferirSaida(saidaDaIa, { valoresPermitidosCents: permitidos });

  const fechou = await repo.fecharTurno(turno.id, {
    intencao: saida.intencao,
    proximaAcao: saida.proximaAcao,
    precisaHumano: saida.precisaHumano,
    alertas: saida.alertas,
    substituida: saida.substituida,
    latenciaMs: agora.getTime() - turno.criadoEm.getTime(),
  });
  // Outro pedido (o n8n tentou de novo) chegou antes. Não manda duas vezes.
  if (!fechou) return { acao: "ja_processado", enviar: [] };

  await repo.registrarMensagem({
    conversaId: conversa.id,
    autor: "maya",
    texto: saida.mensagem,
    externalId: null,
    turnoId: turno.id,
    modo,
  });

  const patch: Parameters<RepositorioMaya["atualizarConversa"]>[1] = {
    ficha: juntarFicha(conversa.ficha, saida.ficha),
  };
  if (!conversa.apresentouEm) patch.apresentouEm = agora;

  let avisar: AvisoParaEquipe | null = null;
  if (saida.precisaHumano) {
    patch.humanoAte = new Date(agora.getTime() + HORAS_DE_PAUSA_NA_TRANSFERENCIA * 3_600_000);
    const motivo = saida.motivoHumano ?? "maya_pediu_humano";
    await repo.registrarEvento(conversa.id, "transferencia", { motivo, alertas: saida.alertas });
    const historico = await repo.historico(conversa.id, 3);
    const ultimaDoCliente =
      [...historico].reverse().find((m) => m.autor === "cliente")?.texto ?? "";
    avisar = aviso(
      { ...conversa, ficha: patch.ficha ?? conversa.ficha },
      motivo,
      ultimaDoCliente,
      agora,
    );
  }
  if (saida.substituida) {
    await repo.registrarEvento(conversa.id, "resposta_bloqueada", { alertas: saida.alertas });
  }
  await repo.atualizarConversa(conversa.id, patch);

  return {
    acao: "enviar",
    ...entregar(modo, [saida.mensagem]),
    avisar_equipe: avisar,
    alertas: saida.alertas,
  };
}
