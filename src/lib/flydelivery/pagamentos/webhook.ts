/**
 * Conferência dos avisos (webhooks) que a SyncPay manda quando um pagamento
 * muda de situação.
 *
 * O AVISO NÃO PROVA NADA SOZINHO
 * Mesmo com assinatura válida, o aviso só serve de gatilho: quem decide que um
 * pedido foi pago é a CONSULTA que o servidor faz em seguida na própria
 * SyncPay (valor, situação, recebedor). Assim, um aviso falso, repetido ou
 * fora de ordem no máximo provoca uma conferência a mais — nunca um pedido
 * pago de mentira. É o porteiro que, além de olhar o crachá, liga para o
 * apartamento antes de abrir.
 *
 * AUTENTICIDADE — dois formatos aceitos, ambos com o SYNCPAY_WEBHOOK_SECRET:
 *   1. `X-SyncPay-Signature`: HMAC-SHA256 do CORPO BRUTO (exatamente os bytes
 *      recebidos, sem reformatar o JSON), em hexadecimal — aceito puro,
 *      com prefixo "sha256=", ou no formato "t=<segundos>,v1=<hex>", em que o
 *      texto assinado é "<t>.<corpo>" e o horário precisa estar dentro de uma
 *      janela de 5 minutos (proteção contra reenvio de aviso antigo).
 *   2. `Authorization: Bearer <segredo>`, que é como a documentação de ajuda
 *      da SyncPay descreve a entrega dos avisos.
 *   Qualquer outra coisa é recusada. A comparação é feita em tempo constante.
 *
 * O formato exato da assinatura precisa ser confirmado no painel da SyncPay
 * antes de ligar em produção (ver checklist no README do pagamento).
 */

export const CABECALHO_ASSINATURA = "x-syncpay-signature";
export const JANELA_DE_TEMPO_SEGUNDOS = 5 * 60;

export type Autenticidade =
  | { ok: true; metodo: "hmac" | "bearer" }
  | {
      ok: false;
      motivo: "sem_segredo" | "sem_assinatura" | "assinatura_invalida" | "fora_da_janela";
    };

const codificador = new TextEncoder();

async function hmacHex(segredo: string, mensagem: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    codificador.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, codificador.encode(mensagem));
  return Array.from(new Uint8Array(assinatura), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(texto: string): Promise<string> {
  const resumo = await crypto.subtle.digest("SHA-256", codificador.encode(texto));
  return Array.from(new Uint8Array(resumo), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compara sem "vazar" pelo tempo quantas letras acertou. */
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  const ba = codificador.encode(a);
  const bb = codificador.encode(b);
  let diferenca = ba.length ^ bb.length;
  const n = Math.max(ba.length, bb.length);
  for (let i = 0; i < n; i++) diferenca |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  return diferenca === 0;
}

type Cabecalhos = { get(nome: string): string | null };

export async function conferirAutenticidade(params: {
  corpoBruto: string;
  cabecalhos: Cabecalhos;
  segredo: string | undefined;
  agoraSegundos?: number;
}): Promise<Autenticidade> {
  const segredo = (params.segredo ?? "").trim();
  if (!segredo) return { ok: false, motivo: "sem_segredo" };

  const assinatura = (params.cabecalhos.get(CABECALHO_ASSINATURA) ?? "").trim();
  if (assinatura) {
    const partes = Object.fromEntries(
      assinatura.split(",").map((p) => {
        const i = p.indexOf("=");
        return i > 0 ? [p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim()] : [p.trim(), ""];
      }),
    ) as Record<string, string>;

    if (partes.t && partes.v1) {
      const t = Number(partes.t);
      const agora = params.agoraSegundos ?? Math.floor(Date.now() / 1000);
      if (!Number.isFinite(t) || Math.abs(agora - t) > JANELA_DE_TEMPO_SEGUNDOS) {
        return { ok: false, motivo: "fora_da_janela" };
      }
      const esperado = await hmacHex(segredo, `${partes.t}.${params.corpoBruto}`);
      return iguaisEmTempoConstante(esperado, partes.v1.toLowerCase())
        ? { ok: true, metodo: "hmac" }
        : { ok: false, motivo: "assinatura_invalida" };
    }

    const recebido = assinatura.replace(/^sha256=/i, "").toLowerCase();
    const esperado = await hmacHex(segredo, params.corpoBruto);
    return iguaisEmTempoConstante(esperado, recebido)
      ? { ok: true, metodo: "hmac" }
      : { ok: false, motivo: "assinatura_invalida" };
  }

  const autorizacao = (params.cabecalhos.get("authorization") ?? "").trim();
  if (/^bearer\s+/i.test(autorizacao)) {
    const token = autorizacao.replace(/^bearer\s+/i, "").trim();
    return iguaisEmTempoConstante(token, segredo)
      ? { ok: true, metodo: "bearer" }
      : { ok: false, motivo: "assinatura_invalida" };
  }

  return { ok: false, motivo: "sem_assinatura" };
}

export type AvisoLido = {
  eventoId: string | null;
  tipo: string | null;
  /** Identificador da transação na SyncPay — a chave para a reconferência. */
  referencia: string | null;
};

function primeiroTexto(...valores: unknown[]): string | null {
  for (const v of valores) {
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 200);
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

/**
 * Tira do aviso só o que importa. Tolerante de propósito: o aviso é gatilho,
 * e a consulta que vem depois é que traz os números que valem.
 */
export function lerAviso(json: unknown): AvisoLido {
  const raiz = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const temEnvelope = !!raiz.data && typeof raiz.data === "object";
  const dados = (temEnvelope ? raiz.data : {}) as Record<string, unknown>;
  return {
    // `id` só conta como identificador do AVISO quando a transação vem dentro
    // de `data`. Num aviso "achatado", `id` é a própria transação — e usar
    // isso como chave faria o "pago" ser descartado como repetição do
    // "pendente" da mesma transação.
    eventoId: primeiroTexto(raiz.event_id, raiz.eventId, temEnvelope ? raiz.id : null),
    tipo: primeiroTexto(raiz.event, raiz.type, raiz.event_type),
    referencia: primeiroTexto(
      dados.reference_id,
      dados.identifier,
      dados.id,
      raiz.reference_id,
      raiz.identifier,
    ),
  };
}

/** Chave que impede processar o mesmo aviso duas vezes. */
export async function chaveDoAviso(aviso: AvisoLido, corpoBruto: string): Promise<string> {
  return aviso.eventoId ? `id:${aviso.eventoId}` : `sha256:${await sha256Hex(corpoBruto)}`;
}
