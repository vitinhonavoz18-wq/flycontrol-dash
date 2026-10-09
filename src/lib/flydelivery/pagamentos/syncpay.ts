/**
 * Conversa com a API da SyncPay — sempre de servidor para servidor.
 *
 * O segredo da conta (client_secret) só existe aqui, lido do cofre do
 * Cloudflare (Workers Secrets). Ele nunca vai para o navegador, para o
 * aplicativo, para o banco, para uma resposta da nossa API nem para o log.
 *
 * O QUE FOI CONFERIDO NA DOCUMENTAÇÃO DA SYNCPAY
 *   - POST /api/partner/v1/auth-token  { client_id, client_secret }
 *       → { access_token, token_type: "Bearer", expires_in: 3600, expires_at }
 *     O token vale 1 hora; pedir token repetidamente devolve 429. Por isso ele
 *     fica guardado e só é renovado perto de vencer.
 *   - POST /api/partner/v1/cash-in  { amount, description, webhook_url,
 *       client: { name, cpf, email, phone }, split: [{ user_id, percentage }] }
 *       → { message, pix_code, identifier }
 *     `amount` em reais; `percentage` inteiro; quem gera a cobrança fica com o
 *     que não foi destinado no split.
 *   - Consulta: GET /api/partner/v2/transactions/{reference_id} (a indicada
 *     pela FlyDelivery) e GET /api/partner/v1/transaction/{identifier} (a da
 *     documentação de ajuda), com `status` em pending | completed | failed |
 *     refunded | med e `amount` em reais.
 *
 * O QUE NÃO FOI POSSÍVEL CONFERIR (e por isso é tratado com cautela)
 *   - Nomes exatos dos campos de divisão e de tarifa na consulta. Se vierem
 *     (`split`), são comparados; se não vierem, nada é inventado.
 *
 * A REGRA DE OURO DA CRIAÇÃO
 * Pedir uma cobrança nunca é repetido sozinho quando a resposta se perde
 * (queda de rede, demora, erro 5xx): não dá para saber se a cobrança nasceu,
 * e repetir pode gerar duas. Nesses casos a resposta é "incerto" e quem
 * decide o próximo passo é a conciliação. Só se repete quando a SyncPay
 * respondeu com certeza que NÃO processou (401 de token vencido).
 */

import { reaisParaCentavos, centavosParaValorDaApi } from "./split";

export const SYNCPAY_URL_PADRAO = "https://api.syncpayments.com.br";

export type TipoDeFalha =
  | "credenciais"
  | "validacao"
  | "limite"
  | "indisponivel"
  | "incerto"
  | "nao_encontrada"
  | "resposta_invalida";

export class FalhaSyncPay extends Error {
  readonly tipo: TipoDeFalha;
  readonly status?: number;
  constructor(tipo: TipoDeFalha, mensagem: string, status?: number) {
    super(mensagem);
    this.name = "FalhaSyncPay";
    this.tipo = tipo;
    this.status = status;
  }
}

export type ConfigSyncPay = {
  baseUrl?: string;
  clientId: string;
  clientSecret: string;
  /** Trocável nos testes. */
  fetch?: typeof fetch;
  agora?: () => number;
  esperar?: (ms: number) => Promise<void>;
  timeoutMs?: number;
};

export type RecebedorDoSplit = { userId: string; percentual: number };

export type PedidoDeCobranca = {
  valorCentavos: number;
  descricao: string;
  webhookUrl: string;
  cliente: { nome: string; cpf: string; email: string; telefone: string };
  split: RecebedorDoSplit[];
};

export type CobrancaCriada = { identificador: string; pixCopiaECola: string };

export type TransacaoConsultada = {
  referencia: string | null;
  /** Exatamente como a SyncPay escreveu (pending, completed, ...). */
  situacao: string | null;
  valorCentavos: number | null;
  /** `null` = a SyncPay não informou a divisão nesta consulta. */
  split: RecebedorDoSplit[] | null;
  /** Resposta sem dados pessoais, para guardar como comprovante da conferência. */
  resumo: Record<string, unknown>;
};

type Token = { valor: string; expiraEm: number };

// Guardado por conta (client_id), vivo enquanto o Worker estiver de pé.
const tokensGuardados = new Map<string, Token>();
const tokensSendoPedidos = new Map<string, Promise<Token>>();

/** Só para os testes começarem do zero. */
export function esquecerTokensGuardados(): void {
  tokensGuardados.clear();
  tokensSendoPedidos.clear();
}

/** Margem para renovar antes de vencer: um token que vence no meio do caminho vira 401. */
const MARGEM_DE_RENOVACAO_MS = 60_000;
const MAXIMO_DE_RECEBEDORES = 3;

const CHAVES_PESSOAIS = new Set([
  "client",
  "customer",
  "payer",
  "cpf",
  "cnpj",
  "document",
  "email",
  "phone",
  "name",
  "address",
  "pix_code",
  "qr_code",
  "qrcode",
]);

/** Copia a resposta tirando qualquer coisa que identifique uma pessoa. */
export function semDadosPessoais(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 4) return null;
  if (Array.isArray(valor))
    return valor.slice(0, 20).map((v) => semDadosPessoais(v, profundidade + 1));
  if (valor && typeof valor === "object") {
    const limpo: Record<string, unknown> = {};
    for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
      if (CHAVES_PESSOAIS.has(chave.toLowerCase())) continue;
      limpo[chave] = semDadosPessoais(v, profundidade + 1);
    }
    return limpo;
  }
  if (typeof valor === "string") return valor.slice(0, 300);
  return valor;
}

function textoDaFalha(corpo: unknown): string {
  if (corpo && typeof corpo === "object") {
    const c = corpo as Record<string, unknown>;
    const mensagem = typeof c.message === "string" ? c.message : "";
    const erros =
      c.errors && typeof c.errors === "object" ? Object.values(c.errors as object).flat() : [];
    const detalhes = erros
      .filter((e) => typeof e === "string")
      .slice(0, 3)
      .join(" ");
    return [mensagem, detalhes].filter(Boolean).join(" — ").slice(0, 300);
  }
  return "";
}

function lerRecebedores(bruto: unknown): RecebedorDoSplit[] | null {
  if (!Array.isArray(bruto)) return null;
  const lista: RecebedorDoSplit[] = [];
  for (const item of bruto) {
    if (!item || typeof item !== "object") return null;
    const r = item as Record<string, unknown>;
    const userId = typeof r.user_id === "string" ? r.user_id : null;
    const percentual = typeof r.percentage === "number" ? r.percentage : Number(r.percentage);
    if (!userId || !Number.isFinite(percentual)) return null;
    lista.push({ userId, percentual });
  }
  return lista;
}

export function criarClienteSyncPay(config: ConfigSyncPay) {
  const baseUrl = (config.baseUrl || SYNCPAY_URL_PADRAO).replace(/\/+$/, "");
  const buscar = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const agora = config.agora ?? (() => Date.now());
  const esperar = config.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const timeoutMs = config.timeoutMs ?? 15_000;

  if (!config.clientId || !config.clientSecret) {
    throw new FalhaSyncPay("credenciais", "Credenciais da SyncPay não configuradas no servidor.");
  }

  async function chamar(
    metodo: "GET" | "POST",
    caminho: string,
    corpo: unknown,
    token: string | null,
  ): Promise<{ status: number; json: unknown; retryAfterMs: number | null }> {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), timeoutMs);
    try {
      const resposta = await buscar(`${baseUrl}${caminho}`, {
        method: metodo,
        headers: {
          Accept: "application/json",
          ...(corpo === undefined ? {} : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: controle.signal,
      });
      const texto = await resposta.text();
      let json: unknown = null;
      try {
        json = texto ? JSON.parse(texto) : null;
      } catch {
        json = null;
      }
      const retry = Number(resposta.headers.get("retry-after"));
      return {
        status: resposta.status,
        json,
        retryAfterMs: Number.isFinite(retry) && retry > 0 ? Math.min(retry * 1000, 5000) : null,
      };
    } finally {
      clearTimeout(relogio);
    }
  }

  async function pedirTokenNovo(): Promise<Token> {
    let ultimaFalha: unknown = null;
    // Pedir token não cobra nada: é seguro tentar duas vezes em queda de rede.
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        const { status, json } = await chamar(
          "POST",
          "/api/partner/v1/auth-token",
          { client_id: config.clientId, client_secret: config.clientSecret },
          null,
        );
        if (status === 401 || status === 403 || status === 422) {
          throw new FalhaSyncPay(
            "credenciais",
            `A SyncPay recusou as credenciais da plataforma (HTTP ${status}). Confira SYNCPAY_CLIENT_ID e SYNCPAY_CLIENT_SECRET.`,
            status,
          );
        }
        if (status === 429) {
          throw new FalhaSyncPay(
            "limite",
            "A SyncPay pediu para esperar antes de gerar outro token (HTTP 429).",
            429,
          );
        }
        if (status >= 500) {
          ultimaFalha = new FalhaSyncPay(
            "indisponivel",
            `SyncPay indisponível ao autenticar (HTTP ${status}).`,
            status,
          );
          await esperar(400);
          continue;
        }
        const corpo = (json ?? {}) as Record<string, unknown>;
        const valor = typeof corpo.access_token === "string" ? corpo.access_token : "";
        if (status < 200 || status >= 300 || !valor) {
          throw new FalhaSyncPay(
            "resposta_invalida",
            `Resposta inesperada da SyncPay ao autenticar (HTTP ${status}).`,
            status,
          );
        }
        const segundos = Number(corpo.expires_in);
        const porSegundos = Number.isFinite(segundos) && segundos > 0 ? segundos * 1000 : 3600_000;
        const venceEm =
          typeof corpo.expires_at === "string" ? Date.parse(corpo.expires_at) - agora() : NaN;
        const validade =
          Number.isFinite(venceEm) && venceEm > 0 ? Math.min(porSegundos, venceEm) : porSegundos;
        return { valor, expiraEm: agora() + Math.max(validade - MARGEM_DE_RENOVACAO_MS, 30_000) };
      } catch (erro) {
        if (erro instanceof FalhaSyncPay) throw erro;
        ultimaFalha = erro;
        await esperar(400);
      }
    }
    if (ultimaFalha instanceof FalhaSyncPay) throw ultimaFalha;
    throw new FalhaSyncPay("indisponivel", "Não foi possível falar com a SyncPay para autenticar.");
  }

  /** Token guardado enquanto válido; uma única ida à SyncPay mesmo com várias chamadas juntas. */
  async function obterToken(forcarNovo = false): Promise<string> {
    const guardado = tokensGuardados.get(config.clientId);
    if (!forcarNovo && guardado && guardado.expiraEm > agora()) return guardado.valor;

    let pedido = tokensSendoPedidos.get(config.clientId);
    if (!pedido) {
      pedido = pedirTokenNovo().finally(() => tokensSendoPedidos.delete(config.clientId));
      tokensSendoPedidos.set(config.clientId, pedido);
    }
    const token = await pedido;
    tokensGuardados.set(config.clientId, token);
    return token.valor;
  }

  function esquecerToken() {
    tokensGuardados.delete(config.clientId);
  }

  async function criarCobrancaPix(pedido: PedidoDeCobranca): Promise<CobrancaCriada> {
    // Conferências antes de qualquer chamada: um erro aqui é nosso, e não
    // pode virar cobrança.
    if (pedido.split.length === 0 || pedido.split.length > MAXIMO_DE_RECEBEDORES) {
      throw new FalhaSyncPay(
        "validacao",
        `O split do Pix aceita de 1 a ${MAXIMO_DE_RECEBEDORES} recebedores.`,
      );
    }
    let soma = 0;
    for (const r of pedido.split) {
      if (!Number.isInteger(r.percentual) || r.percentual < 1 || r.percentual > 99) {
        throw new FalhaSyncPay(
          "validacao",
          "Percentual do split precisa ser inteiro entre 1 e 99.",
        );
      }
      if (!r.userId || r.userId === config.clientId) {
        throw new FalhaSyncPay(
          "validacao",
          "O recebedor do split não pode ser a própria conta da plataforma.",
        );
      }
      soma += r.percentual;
    }
    if (soma >= 100) {
      throw new FalhaSyncPay(
        "validacao",
        "A soma do split precisa deixar uma parte para a plataforma.",
      );
    }

    const corpo = {
      amount: centavosParaValorDaApi(pedido.valorCentavos),
      description: pedido.descricao.slice(0, 140),
      webhook_url: pedido.webhookUrl,
      client: {
        name: pedido.cliente.nome.slice(0, 120),
        cpf: pedido.cliente.cpf,
        email: pedido.cliente.email,
        phone: pedido.cliente.telefone,
      },
      split: pedido.split.map((r) => ({ user_id: r.userId, percentage: r.percentual })),
    };

    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const token = await obterToken(tentativa > 0);
      let resposta: Awaited<ReturnType<typeof chamar>>;
      try {
        resposta = await chamar("POST", "/api/partner/v1/cash-in", corpo, token);
      } catch {
        // Rede caiu ou demorou: o pedido pode ter chegado. NÃO repete.
        throw new FalhaSyncPay(
          "incerto",
          "A SyncPay não respondeu a tempo. Não é possível saber se a cobrança foi criada.",
        );
      }
      const { status, json } = resposta;

      if (status === 401 && tentativa === 0) {
        // Token recusado = pedido não processado. Renova e tenta UMA vez.
        esquecerToken();
        continue;
      }
      if (status === 401 || status === 403) {
        throw new FalhaSyncPay(
          "credenciais",
          `A SyncPay recusou a autorização (HTTP ${status}). ${textoDaFalha(json)}`.trim(),
          status,
        );
      }
      if (status === 400 || status === 422) {
        throw new FalhaSyncPay(
          "validacao",
          textoDaFalha(json) || `A SyncPay recusou os dados da cobrança (HTTP ${status}).`,
          status,
        );
      }
      if (status === 429) {
        throw new FalhaSyncPay(
          "limite",
          "A SyncPay pediu para aguardar um pouco antes de gerar outra cobrança.",
          429,
        );
      }
      if (status < 200 || status >= 300) {
        throw new FalhaSyncPay(
          "incerto",
          `A SyncPay respondeu HTTP ${status}. Não é possível saber se a cobrança foi criada.`,
          status,
        );
      }

      const dados = (json ?? {}) as Record<string, unknown>;
      const identificador = typeof dados.identifier === "string" ? dados.identifier.trim() : "";
      const pixCopiaECola = typeof dados.pix_code === "string" ? dados.pix_code.trim() : "";
      if (!identificador || !pixCopiaECola) {
        throw new FalhaSyncPay(
          "incerto",
          "A SyncPay respondeu sem o código Pix ou sem o identificador.",
          status,
        );
      }
      return { identificador, pixCopiaECola };
    }
    throw new FalhaSyncPay("credenciais", "A SyncPay recusou a autorização mesmo com token novo.");
  }

  async function consultarCaminho(caminho: string): Promise<{ status: number; json: unknown }> {
    let renovou = false;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const token = await obterToken();
      let resposta: Awaited<ReturnType<typeof chamar>>;
      try {
        resposta = await chamar("GET", caminho, undefined, token);
      } catch {
        // Consultar não cobra nada: pode repetir com calma.
        await esperar(300 * (tentativa + 1));
        continue;
      }
      if (resposta.status === 401 && !renovou) {
        renovou = true;
        esquecerToken();
        tentativa--;
        continue;
      }
      if (resposta.status === 429 || resposta.status >= 500) {
        await esperar(resposta.retryAfterMs ?? 300 * 3 ** tentativa);
        continue;
      }
      return resposta;
    }
    throw new FalhaSyncPay("indisponivel", "A SyncPay não respondeu à consulta da transação.");
  }

  async function consultarTransacao(identificador: string): Promise<TransacaoConsultada> {
    const id = encodeURIComponent(identificador.trim());
    if (!id) throw new FalhaSyncPay("validacao", "Identificador da transação vazio.");

    let { status, json } = await consultarCaminho(`/api/partner/v2/transactions/${id}`);
    if (status === 404) {
      ({ status, json } = await consultarCaminho(`/api/partner/v1/transaction/${id}`));
    }
    if (status === 404) {
      throw new FalhaSyncPay("nao_encontrada", "A SyncPay não encontrou esta transação.", 404);
    }
    if (status === 401 || status === 403) {
      throw new FalhaSyncPay(
        "credenciais",
        `A SyncPay recusou a consulta (HTTP ${status}).`,
        status,
      );
    }
    if (status < 200 || status >= 300) {
      throw new FalhaSyncPay(
        "resposta_invalida",
        `Consulta à SyncPay respondeu HTTP ${status}.`,
        status,
      );
    }

    const raiz = (json ?? {}) as Record<string, unknown>;
    const dados = (
      raiz.data && typeof raiz.data === "object" && !Array.isArray(raiz.data) ? raiz.data : raiz
    ) as Record<string, unknown>;

    const referencia =
      [dados.reference_id, dados.identifier, dados.id].find((v) => typeof v === "string" && v) ??
      null;

    return {
      referencia: referencia as string | null,
      situacao: typeof dados.status === "string" ? dados.status : null,
      valorCentavos: reaisParaCentavos(dados.amount),
      split: lerRecebedores(dados.split ?? dados.splits),
      resumo: semDadosPessoais(dados) as Record<string, unknown>,
    };
  }

  return { obterToken, criarCobrancaPix, consultarTransacao };
}

export type ClienteSyncPay = ReturnType<typeof criarClienteSyncPay>;
