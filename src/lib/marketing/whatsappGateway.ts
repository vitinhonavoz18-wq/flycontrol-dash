/**
 * A porta de saída para o WhatsApp.
 *
 * POR QUE EXISTE UMA PORTA EM VEZ DE FALAR DIRETO COM A UAZAPI
 *
 * Hoje quem entrega a mensagem é a UAZAPI. Amanhã pode ser a API oficial do
 * WhatsApp, ou outra empresa. Se o resto do sistema falasse direto com a
 * UAZAPI, trocar de fornecedor significaria mexer em tudo.
 *
 * É a diferença entre o restaurante ter um telefone fixo na parede e ter uma
 * tomada: o aparelho muda, a tomada continua a mesma.
 *
 * Então: o Marketing conhece esta porta. A porta conhece o fornecedor. O
 * Marketing nunca conhece o fornecedor.
 *
 * ONDE O ENVIO ACONTECE DE VERDADE
 *
 * Neste momento quem conversa com a UAZAPI é o n8n, não o FlyControl. O
 * FlyControl deixa as mensagens prontas numa fila e o n8n vem buscar. Por
 * isso o provedor padrão aqui é o `ProvedorViaFila`: ele não faz chamada de
 * rede nenhuma — apenas registra que a mensagem está pronta.
 *
 * O `ProvedorUazapiDireto` fica escrito e desligado, para o dia em que fizer
 * sentido o FlyControl falar direto. Ele não é usado em nenhum caminho ativo.
 */

export type MensagemTexto = {
  tipo: "texto";
  para: string;
  texto: string;
};

export type MensagemImagem = {
  tipo: "imagem";
  para: string;
  texto: string;
  urlImagem: string;
};

export type MensagemWhatsApp = MensagemTexto | MensagemImagem;

/** Status interno. NUNCA use o nome que o fornecedor deu — traduza para cá. */
export type StatusMensagem =
  | "pending"
  | "queued"
  | "processing"
  | "sent"
  | "delivered"
  | "failed"
  | "cancelled";

export type ResultadoEnvio =
  | { ok: true; providerMessageId?: string; status: StatusMensagem }
  | { ok: false; erro: string; codigo?: string; podeTentarDeNovo: boolean };

export type StatusInstancia = {
  status: "connected" | "connecting" | "disconnected" | "error";
  mensagem?: string;
  telefone?: string;
};

export type EventoWebhook = {
  providerMessageId?: string;
  recipientId?: string;
  status: StatusMensagem;
  erro?: string;
  codigo?: string;
  quando?: string;
};

/**
 * O contrato. Qualquer fornecedor futuro implementa isto e nada mais muda.
 */
export interface WhatsAppProvider {
  readonly nome: string;
  enviar(instanciaId: string, mensagem: MensagemWhatsApp): Promise<ResultadoEnvio>;
  statusInstancia(instanciaId: string): Promise<StatusInstancia>;
  /** Traduz o que o fornecedor mandou para o vocabulário daqui de dentro. */
  interpretarWebhook(corpo: unknown): EventoWebhook | null;
}

/**
 * Tradução de status.
 *
 * Cada fornecedor inventa os próprios nomes ("SERVER_ACK", "DELIVERY_ACK",
 * "read"…). Nenhuma regra de negócio pode depender desses nomes: se amanhã a
 * UAZAPI renomear um status, quebraria o relatório de campanha inteiro.
 *
 * O que não for reconhecido vira "processing" — ou seja, "ainda não sei" —
 * em vez de virar erro. Chutar "falhou" faria a mensagem ser reenviada sem
 * necessidade, e o cliente receberia duas vezes.
 */
const TRADUCAO_UAZAPI: Record<string, StatusMensagem> = {
  pending: "queued",
  sent: "sent",
  server_ack: "sent",
  delivery_ack: "delivered",
  delivered: "delivered",
  read: "delivered",
  played: "delivered",
  error: "failed",
  failed: "failed",
  cancelled: "cancelled",
};

export function traduzirStatus(bruto: unknown): StatusMensagem {
  if (typeof bruto !== "string") return "processing";
  return TRADUCAO_UAZAPI[bruto.trim().toLowerCase()] ?? "processing";
}

/**
 * O provedor em uso: deixa a mensagem pronta e deixa o n8n buscar.
 *
 * Não faz chamada de rede. É de propósito — o disparo em massa não pode
 * depender de o painel ficar aberto, nem prender o pedido de quem clicou.
 */
export class ProvedorViaFila implements WhatsAppProvider {
  readonly nome = "fila";

  async enviar(): Promise<ResultadoEnvio> {
    // Quem realmente envia é o n8n, lendo a fila. Aqui a mensagem só é dada
    // como "na fila"; o resultado verdadeiro volta pelo webhook.
    return { ok: true, status: "queued" };
  }

  async statusInstancia(): Promise<StatusInstancia> {
    return {
      status: "disconnected",
      mensagem: "O status vem do n8n. Configure a integração para ver aqui.",
    };
  }

  interpretarWebhook(corpo: unknown): EventoWebhook | null {
    return interpretarWebhookPadrao(corpo);
  }
}

/**
 * Formato que o FlyControl aceita no webhook, venha de onde vier.
 *
 * O n8n é quem normaliza: ele recebe o formato da UAZAPI e reenvia neste.
 * Assim o FlyControl não precisa saber o formato de nenhum fornecedor — e
 * trocar de fornecedor não exige mexer aqui, só no fluxo do n8n.
 */
function interpretarWebhookPadrao(corpo: unknown): EventoWebhook | null {
  if (!corpo || typeof corpo !== "object") return null;
  const c = corpo as Record<string, unknown>;

  const recipientId = pegarTexto(c, ["recipient_id", "recipientId"]);
  const providerMessageId = pegarTexto(c, ["provider_message_id", "providerMessageId", "message_id"]);
  if (!recipientId && !providerMessageId) return null;

  return {
    recipientId,
    providerMessageId,
    status: traduzirStatus(c.status),
    erro: pegarTexto(c, ["error", "error_message"]),
    codigo: pegarTexto(c, ["error_code", "code"]),
    quando: pegarTexto(c, ["timestamp", "at"]),
  };
}

function pegarTexto(o: Record<string, unknown>, chaves: string[]): string | undefined {
  for (const k of chaves) {
    const v = o[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

/**
 * Conversa direta com a UAZAPI. NÃO ESTÁ EM USO.
 *
 * Fica aqui pronto para o dia em que o FlyControl precisar enviar sem passar
 * pelo n8n. O endereço e o token vêm do ambiente do servidor — nunca do
 * banco e nunca do navegador, porque token no navegador é chave de casa
 * pendurada do lado de fora da porta.
 */
export class ProvedorUazapiDireto implements WhatsAppProvider {
  readonly nome = "uazapi";

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async enviar(instanciaId: string, mensagem: MensagemWhatsApp): Promise<ResultadoEnvio> {
    const rota = mensagem.tipo === "imagem" ? "/send/media" : "/send/text";
    const corpo =
      mensagem.tipo === "imagem"
        ? { number: mensagem.para, text: mensagem.texto, file: mensagem.urlImagem, type: "image" }
        : { number: mensagem.para, text: mensagem.texto };

    try {
      const r = await fetch(`${this.baseUrl}${rota}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          token: this.token,
          instance: instanciaId,
        },
        body: JSON.stringify(corpo),
      });

      if (!r.ok) {
        // 4xx é problema do pedido (número inválido, instância errada) e
        // repetir não adianta. 5xx e tempo esgotado merecem nova tentativa.
        return {
          ok: false,
          erro: `Fornecedor respondeu ${r.status}`,
          codigo: String(r.status),
          podeTentarDeNovo: r.status >= 500 || r.status === 429,
        };
      }

      const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        ok: true,
        providerMessageId: pegarTexto(json, ["id", "messageId", "message_id"]),
        status: "sent",
      };
    } catch (e) {
      return {
        ok: false,
        erro: e instanceof Error ? e.message : "Falha de rede",
        podeTentarDeNovo: true,
      };
    }
  }

  async statusInstancia(instanciaId: string): Promise<StatusInstancia> {
    try {
      const r = await fetch(`${this.baseUrl}/instance/status`, {
        headers: { token: this.token, instance: instanciaId },
      });
      if (!r.ok) return { status: "error", mensagem: `Fornecedor respondeu ${r.status}` };
      const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      const bruto = String(json.status ?? "").toLowerCase();
      if (bruto.includes("connected")) return { status: "connected" };
      if (bruto.includes("connecting")) return { status: "connecting" };
      return { status: "disconnected" };
    } catch (e) {
      return { status: "error", mensagem: e instanceof Error ? e.message : "Falha de rede" };
    }
  }

  interpretarWebhook(corpo: unknown): EventoWebhook | null {
    return interpretarWebhookPadrao(corpo);
  }
}

/**
 * Quem o sistema usa. Um lugar só — trocar o fornecedor é trocar esta linha.
 */
export function obterProvedor(): WhatsAppProvider {
  return new ProvedorViaFila();
}
