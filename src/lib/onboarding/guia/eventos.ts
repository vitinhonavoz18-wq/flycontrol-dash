/**
 * Os eventos do guia de configuração.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * POR QUE ISTO NÃO É UMA FERRAMENTA DE ANALYTICS
 * ═══════════════════════════════════════════════════════════════════════
 *
 * O FlyControl não tem hoje nenhum sistema de medição de uso — não há
 * PostHog, nem Google Analytics, nem tabela de eventos. Montar uma
 * infraestrutura inteira para medir o guia seria construir o arquivo antes de
 * ter o primeiro documento.
 *
 * O que existe aqui é o PONTO DE ENTREGA: um lugar único por onde os eventos
 * passam. Hoje eles vão para o console do navegador, que já ajuda a entender
 * um relato de "travou no meio". No dia em que o FlyControl tiver medição de
 * verdade, muda-se ESTE arquivo e nada mais — as chamadas espalhadas pelo
 * guia continuam iguais.
 *
 * É deixar a tubulação passada na parede antes de decidir a marca da torneira.
 *
 * O QUE NUNCA ENTRA AQUI
 *
 * Nome, telefone, endereço, e-mail: nada que identifique o lojista ou o
 * cliente dele. Só o nome da etapa e, quando há falha, um motivo curto — os
 * mesmos motivos internos que já vão para o log do servidor.
 */

export type EventoDoGuia =
  | "onboarding_started"
  | "onboarding_step_started"
  | "onboarding_step_completed"
  | "onboarding_step_error"
  | "onboarding_abandoned"
  | "onboarding_completed";

export type DadosDoEvento = {
  /** O id da etapa, quando o evento é de uma etapa. */
  etapa?: string;
  /** Motivo curto e técnico, só em falhas. Nunca texto de tela. */
  motivo?: string;
  /** Quantas etapas já fecharam, de zero a nove. */
  concluidas?: number;
};

export function registrarEvento(evento: EventoDoGuia, dados: DadosDoEvento = {}): void {
  if (typeof window === "undefined") return;
  // `console.debug` e não `console.log`: quem está depurando liga o nível
  // "verbose" e vê; quem não está não tem o console poluído a cada etapa.
  console.debug("[guia]", evento, dados);
}
