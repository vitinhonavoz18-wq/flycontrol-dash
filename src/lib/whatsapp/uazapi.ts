/**
 * A conversa direta entre o FlyControl e a UAZAPI.
 *
 * POR QUE O FLYCONTROL PASSOU A FALAR DIRETO COM A UAZAPI
 *
 * Quem entrega e recebe as mensagens continua sendo o n8n. Isso não mudou.
 *
 * O que mudou foi o LIGAR o aparelho. Um QR Code do WhatsApp vive poucos
 * segundos e precisa ser trocado na cara do lojista enquanto ele aponta o
 * celular. Passar essa figurinha por um intermediário a cada renovação seria
 * como pedir a senha do cofre por carta: quando a carta chega, a senha já
 * mudou.
 *
 * Então a divisão é esta, e vale a pena decorar:
 *
 *   LIGAR O APARELHO (QR Code, status, desligar)  →  FlyControl ↔ UAZAPI
 *   AS MENSAGENS DO DIA A DIA (entra e sai)       →  UAZAPI ↔ n8n ↔ FlyControl
 *
 * O ENDEREÇO E A CHAVE DE ADMINISTRADOR vêm SEMPRE do ambiente do servidor —
 * nunca do banco, nunca do navegador. Chave no navegador é chave de casa
 * pendurada do lado de fora da porta.
 *
 * Referência do contrato da UAZAPI usada aqui (v2):
 *   POST /instance/create      (cabeçalho `admintoken`)
 *   POST /instance/connect     (cabeçalho `token`)  → devolve qrcode/paircode
 *   GET  /instance/status      (cabeçalho `token`)
 *   POST /instance/disconnect  (cabeçalho `token`)
 *   POST /webhook              (cabeçalho `token`)
 *   POST /send/text            (cabeçalho `token`)
 */

/** Quanto tempo esperar a UAZAPI antes de desistir de uma chamada. */
const TEMPO_LIMITE_MS = 15_000;

export type ConfigUazapi = { baseUrl: string; adminToken: string };

/**
 * Lê a configuração do ambiente.
 *
 * Devolve `null` em vez de explodir quando falta configuração: a tela precisa
 * dizer "a integração ainda não foi configurada" em português, e não mostrar
 * um erro de programador para o dono do restaurante.
 */
export function configUazapi(): ConfigUazapi | null {
  const baseUrl = (process.env.UAZAPI_BASE_URL || "").trim().replace(/\/+$/, "");
  const adminToken = (process.env.UAZAPI_ADMIN_TOKEN || "").trim();
  if (!baseUrl || !adminToken) return null;
  return { baseUrl, adminToken };
}

export type RespostaUazapi<T> =
  { ok: true; dados: T } | { ok: false; erro: string; status?: number; podeTentarDeNovo: boolean };

async function chamar<T>(
  caminho: string,
  opcoes: {
    metodo?: "GET" | "POST" | "DELETE";
    token?: string;
    adminToken?: string;
    corpo?: Record<string, unknown>;
  } = {},
): Promise<RespostaUazapi<T>> {
  const cfg = configUazapi();
  if (!cfg) {
    return {
      ok: false,
      erro: "A integração com o WhatsApp ainda não foi configurada neste ambiente.",
      podeTentarDeNovo: false,
    };
  }

  const cabecalhos: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  // A UAZAPI usa DOIS cabeçalhos diferentes: `admintoken` para criar aparelho
  // (coisa de dono da conta) e `token` para mexer num aparelho específico.
  // Mandar o de administrador onde bastava o do aparelho é dar a chave mestra
  // do prédio para quem só precisava entrar na própria sala.
  if (opcoes.adminToken) cabecalhos.admintoken = opcoes.adminToken;
  if (opcoes.token) cabecalhos.token = opcoes.token;

  // Sem um limite de tempo, uma UAZAPI lenta prenderia o pedido do lojista até
  // a tela dele desistir sozinha, sem explicação nenhuma.
  const cancelar = AbortSignal.timeout(TEMPO_LIMITE_MS);

  try {
    const r = await fetch(`${cfg.baseUrl}${caminho}`, {
      method: opcoes.metodo ?? "POST",
      headers: cabecalhos,
      body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
      signal: cancelar,
    });

    const texto = await r.text();
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = null;
    }

    if (!r.ok) {
      // 4xx é problema do pedido (aparelho errado, token vencido) e repetir
      // não adianta. 5xx e 429 merecem nova tentativa.
      return {
        ok: false,
        erro: mensagemDeErro(json, r.status),
        status: r.status,
        podeTentarDeNovo: r.status >= 500 || r.status === 429,
      };
    }

    return { ok: true, dados: (json ?? {}) as T };
  } catch (e) {
    const abortou = e instanceof Error && e.name === "TimeoutError";
    return {
      ok: false,
      erro: abortou
        ? "O WhatsApp demorou demais para responder. Tente de novo."
        : "Não conseguimos falar com o WhatsApp agora.",
      podeTentarDeNovo: true,
    };
  }
}

function mensagemDeErro(json: unknown, status: number): string {
  const c = (json ?? {}) as Record<string, unknown>;
  const bruto = [c.error, c.message, c.response].find((v) => typeof v === "string" && v.trim());
  if (typeof bruto === "string") return bruto.slice(0, 200);
  if (status === 401 || status === 403) return "O WhatsApp recusou a autorização.";
  if (status === 404) return "Aparelho não encontrado no WhatsApp.";
  return `O WhatsApp respondeu ${status}.`;
}

// ---------------------------------------------------------------------------
// O que a UAZAPI devolve, nas partes que usamos
// ---------------------------------------------------------------------------

export type InstanciaUazapi = {
  id?: string;
  token?: string;
  status?: string;
  /** A figurinha do QR Code, já em base64 pronta para virar imagem na tela. */
  qrcode?: string;
  /** O código de 8 letras, alternativa a apontar a câmera. */
  paircode?: string;
  name?: string;
  profileName?: string;
  owner?: string;
  lastDisconnect?: string;
  lastDisconnectReason?: string;
};

/** Cria o aparelho na UAZAPI. Só precisa acontecer UMA vez por restaurante. */
export async function criarInstancia(
  nome: string,
  identificacaoDaLoja: string,
): Promise<RespostaUazapi<{ token?: string; instance?: InstanciaUazapi }>> {
  const cfg = configUazapi();
  if (!cfg) {
    return {
      ok: false,
      erro: "A integração com o WhatsApp ainda não foi configurada neste ambiente.",
      podeTentarDeNovo: false,
    };
  }
  return chamar("/instance/create", {
    adminToken: cfg.adminToken,
    corpo: {
      name: nome,
      systemName: "flycontrol",
      // Guardamos a identificação da loja junto do aparelho lá na UAZAPI. É o
      // que permite descobrir de quem é um aparelho olhando só o painel deles.
      adminField01: identificacaoDaLoja,
    },
  });
}

/**
 * Pede o QR Code (ou o código de pareamento).
 *
 * Com `telefone`, a UAZAPI devolve um CÓDIGO de 8 letras para digitar no
 * aparelho. Sem ele, devolve o QR Code para apontar a câmera. Os dois
 * caminhos existem porque nem todo mundo consegue apontar a câmera de um
 * celular para a tela do próprio computador.
 */
export async function conectarInstancia(
  token: string,
  telefone?: string,
): Promise<
  RespostaUazapi<{ connected?: boolean; loggedIn?: boolean; instance?: InstanciaUazapi }>
> {
  return chamar("/instance/connect", {
    token,
    corpo: telefone ? { phone: telefone.replace(/\D/g, "") } : {},
  });
}

export async function statusInstancia(token: string): Promise<
  RespostaUazapi<{
    instance?: InstanciaUazapi;
    status?: { connected?: boolean; loggedIn?: boolean; jid?: unknown };
  }>
> {
  return chamar("/instance/status", { metodo: "GET", token });
}

export async function desconectarInstancia(
  token: string,
): Promise<RespostaUazapi<{ instance?: InstanciaUazapi; response?: string }>> {
  return chamar("/instance/disconnect", { token });
}

/**
 * Aponta o aviso de "chegou mensagem" para o fluxo daquela loja.
 *
 * É ISTO que faz o religamento ser mesmo sozinho: sempre que o lojista
 * reconecta, o aviso é reapontado para o lugar certo, sem ninguém precisar
 * abrir a UAZAPI.
 *
 * `excludeMessages` é o filtro que evita ruído: mensagem que o próprio
 * restaurante enviou volta como evento, e sem o filtro ela entraria na tela
 * como se o cliente tivesse falado. Grupo também fica de fora — CRM de
 * atendimento não é grupo da família.
 */
export async function configurarWebhook(
  token: string,
  url: string,
): Promise<RespostaUazapi<unknown>> {
  return chamar("/webhook", {
    token,
    corpo: {
      enabled: true,
      url,
      events: ["messages", "connection"],
      excludeMessages: ["fromMeYes", "isGroupYes"],
      addUrlEvents: false,
      addUrlTypesMessages: false,
    },
  });
}

/** Envio direto, usado só como plano B quando o fluxo do n8n não está de pé. */
export async function enviarTexto(
  token: string,
  numero: string,
  texto: string,
): Promise<RespostaUazapi<{ id?: string; messageid?: string }>> {
  return chamar("/send/text", {
    token,
    corpo: { number: numero.replace(/\D/g, ""), text: texto, linkPreview: false },
  });
}

/**
 * Traduz o vocabulário da UAZAPI para o nosso.
 *
 * Nenhuma regra daqui de dentro pode depender do nome que o fornecedor deu:
 * se amanhã a UAZAPI renomear um status, quebraria a tela inteira. O que não
 * for reconhecido vira "desconectado", que é o palpite seguro — faz a tela
 * oferecer o QR Code em vez de dizer "tudo certo" para um aparelho mudo.
 */
export function traduzirStatusInstancia(
  bruto: string | null | undefined,
): "connected" | "connecting" | "disconnected" | "error" {
  const v = (bruto ?? "").trim().toLowerCase();
  if (v === "connected" || v === "open") return "connected";
  if (v === "connecting" || v === "qrcode" || v === "pairing") return "connecting";
  if (v === "error" || v === "banned" || v === "removed") return "error";
  return "disconnected";
}
