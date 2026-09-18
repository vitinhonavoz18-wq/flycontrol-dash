import { AlertTriangle, Loader2, PlugZap } from "lucide-react";
import { linkWhatsAppSuporte } from "@/lib/landing/contato";

/**
 * A tarja que avisa quando o WhatsApp não está respondendo.
 *
 * POR QUE ELA EXISTE
 *
 * O envio não é imediato: a mensagem entra numa fila e o n8n vem buscar. Isso
 * é ótimo quando tudo funciona — e péssimo em silêncio quando não funciona.
 * Sem este aviso, o lojista passa a manhã digitando respostas que ninguém
 * recebe, achando que está atendendo. É a comanda empilhando no balcão sem
 * nenhum entregador passar.
 *
 * A tarja NUNCA trava a tela. O histórico continua lá, as conversas continuam
 * legíveis, e o que a pessoa escrever continua sendo guardado — sai sozinho
 * assim que a conexão voltar.
 */

const LIMITE_SEM_SINAL_MINUTOS = 30;

export type StatusIntegracao = {
  configurado: boolean;
  status: string;
  ultimoSinal: string | null;
  ultimoErro: string | null;
  mensagensNaFila: number;
};

function minutosDesde(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 60_000);
}

function descreverEspera(minutos: number): string {
  if (minutos < 60) return `${minutos} minutos`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return horas === 1 ? "1 hora" : `${horas} horas`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

export function AvisoIntegracao({
  status,
  carregando,
}: {
  status: StatusIntegracao | null;
  carregando: boolean;
}) {
  if (carregando) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b-2 border-border bg-muted px-4 py-2 text-xs font-medium text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Conferindo a conexão com o WhatsApp...
      </div>
    );
  }

  if (!status) return null;

  // Caso 1: contratado, mas o fluxo ainda não foi montado do lado do n8n.
  if (!status.configurado) {
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b-2 border-amber-600 bg-amber-500 px-4 py-2 text-xs font-semibold text-amber-950">
        <PlugZap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          O Chat está contratado, mas a conexão com o WhatsApp ainda não foi ligada. As mensagens
          não vão entrar nem sair até isso ser feito.
        </span>
        <a
          className="font-bold underline decoration-2 underline-offset-2"
          href={linkWhatsAppSuporte(
            "Olá! Meu Chat do Fly Control está contratado mas a conexão com o WhatsApp ainda não foi ligada.",
          )}
          target="_blank"
          rel="noopener noreferrer"
        >
          Avisar o suporte
        </a>
      </div>
    );
  }

  // Caso 2: alguém pausou o fluxo (downgrade, cancelamento, manutenção).
  if (status.status === "paused") {
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b-2 border-amber-600 bg-amber-500 px-4 py-2 text-xs font-semibold text-amber-950">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          A conexão com o WhatsApp está pausada. O histórico continua aqui, mas nada entra nem sai
          enquanto isso.
        </span>
      </div>
    );
  }

  const minutos = minutosDesde(status.ultimoSinal);
  const semSinal = minutos === null || minutos > LIMITE_SEM_SINAL_MINUTOS;

  // Caso 3: ligado, mas mudo faz tempo.
  if (semSinal) {
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b-2 border-destructive bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          {minutos === null
            ? "Ainda não recebemos nenhum sinal do WhatsApp."
            : `Sem sinal do WhatsApp há ${descreverEspera(minutos)}.`}{" "}
          {status.mensagensNaFila > 0
            ? `${status.mensagensNaFila} mensagem(ns) esperando para sair — elas não se perdem, saem quando a conexão voltar.`
            : "O que você escrever fica guardado e sai quando a conexão voltar."}
        </span>
      </div>
    );
  }

  // Caso 4: tudo certo, mas com fila acumulando.
  if (status.mensagensNaFila > 3) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b-2 border-border bg-muted px-4 py-2 text-xs font-medium text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        {status.mensagensNaFila} mensagens saindo agora.
      </div>
    );
  }

  return null;
}
