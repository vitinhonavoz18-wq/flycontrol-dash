import { ehComandoDevolver, lerSinais, type SinaisDaMensagem } from "./sinais";
import { equipeAtendendo } from "./horario";

/**
 * O PORTEIRO DA MAYA: antes de ela abrir a boca, alguém decide se deve.
 *
 * Esta função não fala com banco nem com internet. Recebe a foto da situação
 * e devolve a decisão — por isso dá para testar cada caso ("a equipe assumiu
 * a conversa há 2 horas", "o cliente pediu para parar") sem montar nada.
 *
 * A ORDEM IMPORTA, e é de propósito:
 *
 *   1. Grupo, sem telefone, repetida → nem olha.
 *   2. Eco da própria MAYA → ignora (era a causa de ela se calar sozinha).
 *   3. A equipe digitou no celular → MAYA sai de cena por algumas horas.
 *   4. Cliente pediu para parar → registra e confirma uma vez.
 *   5. Cliente pediu uma pessoa → transfere na hora, sem passar pela IA.
 *   6. A equipe está conduzindo → MAYA fica quieta (guarda a mensagem).
 *   7. Senão → MAYA responde.
 */

/** Quanto tempo a MAYA fica quieta quando a equipe responde pelo celular. */
export const HORAS_DE_PAUSA_QUANDO_EQUIPE_RESPONDE = 6;
/** Quanto tempo ela fica quieta depois de transferir para a equipe. */
export const HORAS_DE_PAUSA_NA_TRANSFERENCIA = 12;
/** Janela para reconhecer o eco da própria resposta. */
export const MINUTOS_PARA_RECONHECER_ECO = 5;
/** Espera para juntar mensagens picadas ("oi" / "tudo bem?" / "quanto custa?"). */
export const SEGUNDOS_PARA_AGRUPAR = 8;

export type EventoRecebido = {
  telefone: string | null;
  texto: string;
  fromMe: boolean;
  /** A UAZAPI marca o que o próprio sistema enviou. */
  enviadaPelaApi: boolean;
  ehGrupo: boolean;
  externalId: string | null;
  /** Áudio/imagem que o n8n não conseguiu transformar em texto. */
  midiaSemTexto: boolean;
};

export type EstadoDaConversa = {
  existe: boolean;
  /** Até quando a equipe humana está conduzindo. `null` = MAYA livre. */
  humanoAte: Date | null;
  optOutEm: Date | null;
  /** Textos que a MAYA enviou nos últimos minutos — para reconhecer o eco. */
  saidasRecentes: { texto: string; em: Date }[];
  mensagemJaRecebida: boolean;
};

export type Decisao =
  | { acao: "ignorar"; motivo: "grupo" | "sem_telefone" | "repetida" | "eco_da_maya" | "vazia" }
  | { acao: "pausar_ia"; motivo: "equipe_respondeu"; ate: Date }
  | { acao: "liberar_ia"; motivo: "equipe_devolveu" }
  | { acao: "registrar_opt_out"; resposta: string | null }
  | { acao: "transferir"; motivo: "cliente_pediu_humano"; resposta: string; ate: Date }
  | { acao: "silenciar"; motivo: "equipe_conduzindo" }
  | { acao: "pedir_reenvio"; resposta: string }
  | { acao: "responder"; sinais: SinaisDaMensagem };

function normalizarEco(t: string): string {
  return String(t ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function ehEcoDaMaya(texto: string, estado: EstadoDaConversa, agora: Date): boolean {
  const alvo = normalizarEco(texto);
  if (!alvo) return false;
  const limite = agora.getTime() - MINUTOS_PARA_RECONHECER_ECO * 60_000;
  return estado.saidasRecentes.some(
    (s) => s.em.getTime() >= limite && normalizarEco(s.texto) === alvo,
  );
}

export function mensagemDeTransferencia(agora: Date): string {
  return equipeAtendendo(agora)
    ? "Claro! Já chamei alguém da nossa equipe para continuar com você por aqui. 😊"
    : "Claro! Nossa equipe atende todos os dias, das 7h às 23h. Já deixei seu atendimento encaminhado e alguém continua com você por aqui assim que o horário começar.";
}

export const MENSAGEM_OPT_OUT =
  "Tudo certo, não vou mais te mandar mensagens por aqui. Se precisar de algo, é só chamar. 👋";

export const MENSAGEM_PEDIR_REENVIO =
  "Não consegui abrir o que você mandou 😕 Pode escrever em texto ou mandar de novo?";

const horasDepois = (agora: Date, horas: number) => new Date(agora.getTime() + horas * 3_600_000);

export function decidirEntrada(
  evento: EventoRecebido,
  estado: EstadoDaConversa,
  agora: Date,
): Decisao {
  if (evento.ehGrupo) return { acao: "ignorar", motivo: "grupo" };
  if (!evento.telefone) return { acao: "ignorar", motivo: "sem_telefone" };
  if (estado.mensagemJaRecebida) return { acao: "ignorar", motivo: "repetida" };

  if (evento.fromMe) {
    if (evento.enviadaPelaApi || ehEcoDaMaya(evento.texto, estado, agora)) {
      return { acao: "ignorar", motivo: "eco_da_maya" };
    }
    if (ehComandoDevolver(evento.texto)) return { acao: "liberar_ia", motivo: "equipe_devolveu" };
    return {
      acao: "pausar_ia",
      motivo: "equipe_respondeu",
      ate: horasDepois(agora, HORAS_DE_PAUSA_QUANDO_EQUIPE_RESPONDE),
    };
  }

  const texto = evento.texto.trim();
  if (!texto) {
    return evento.midiaSemTexto
      ? { acao: "pedir_reenvio", resposta: MENSAGEM_PEDIR_REENVIO }
      : { acao: "ignorar", motivo: "vazia" };
  }

  const sinais = lerSinais(texto);
  const humanoConduzindo = !!estado.humanoAte && estado.humanoAte.getTime() > agora.getTime();

  // Com a equipe conduzindo, o pedido de parar é registrado, mas quem responde
  // é a pessoa da equipe — a MAYA não entra no meio da conversa dela.
  if (sinais.optOut) {
    return { acao: "registrar_opt_out", resposta: humanoConduzindo ? null : MENSAGEM_OPT_OUT };
  }

  if (humanoConduzindo) return { acao: "silenciar", motivo: "equipe_conduzindo" };

  if (sinais.pedidoHumano) {
    return {
      acao: "transferir",
      motivo: "cliente_pediu_humano",
      resposta: mensagemDeTransferencia(agora),
      ate: horasDepois(agora, HORAS_DE_PAUSA_NA_TRANSFERENCIA),
    };
  }

  return { acao: "responder", sinais };
}
