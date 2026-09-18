import { conferirChaveMestra, respostaNegadaCrm } from "./n8nAuth";
import { autenticarLoja } from "./n8nTenant";

/**
 * A porta de entrada, escrita UMA vez.
 *
 * Toda chamada que o fluxo do n8n faz ao FlyControl passa exatamente pelos
 * mesmos cinco passos: conferir a chave mestra, ler o corpo, conferir a senha
 * da loja, trabalhar, e responder. Cinco endereços repetindo isso à mão são
 * cinco lugares onde um deles pode esquecer a conferência — e um endereço
 * esquecido é a porta dos fundos destrancada, que ninguém percebe porque as
 * outras quatro estão bem trancadas.
 *
 * A LOJA CONFERIDA É A ÚNICA QUE VALE. O `tenantId` que chega no corpo é um
 * pedido; o que sai daqui é o conferido. Quem escrever a função de trabalho
 * recebe só o conferido, então não tem como usar o errado sem querer.
 */

const CABECALHOS = { "Content-Type": "application/json" };

export type CorpoCrm = Record<string, unknown>;

export function respostaCrm(dados: unknown, status = 200): Response {
  return new Response(JSON.stringify(dados), { status, headers: CABECALHOS });
}

/**
 * A recusa, escrita para a IA ENTENDER — e não só para o programador.
 *
 * Isto nasceu de um susto real: o pedido falhou, e a atendente anunciou ao
 * cliente "Pedido feito". Ela recebeu um erro seco, não entendeu, e preencheu
 * o vazio com otimismo. É o garçom que não ouviu a cozinha dizer "acabou" e
 * garante ao cliente que já está saindo.
 *
 * Por isso toda recusa carrega um `texto` dizendo, em português e no
 * imperativo, o que a IA deve fazer: avisar que NÃO deu certo.
 */
export function erroCrm(erro: string, status: number, mensagem?: string): Response {
  return respostaCrm(
    {
      success: false,
      error: erro,
      message: mensagem,
      texto:
        `NÃO DEU CERTO: ${mensagem ?? erro}. ` +
        "NÃO diga ao cliente que deu certo. Avise que não conseguiu agora e " +
        "chame um atendente.",
    },
    status,
  );
}

export function rotaDoCrm(
  nome: string,
  trabalho: (entrada: { tenantId: string; corpo: CorpoCrm }) => Promise<Response>,
) {
  return async ({ request }: { request: Request }): Promise<Response> => {
    const mestra = conferirChaveMestra(request);
    if (!mestra.ok) return respostaNegadaCrm(mestra);

    let corpo: CorpoCrm;
    try {
      corpo = (await request.json()) as CorpoCrm;
    } catch {
      return erroCrm("corpo_invalido", 400, "O corpo da chamada não é um JSON válido.");
    }

    const loja = await autenticarLoja(corpo);
    if (!loja.ok) return respostaNegadaCrm(loja);

    try {
      return await trabalho({ tenantId: loja.tenantId, corpo });
    } catch (e) {
      // O motivo real vai para o registro do servidor; para fora sai só
      // "erro_interno". Devolver a mensagem do banco na resposta é entregar o
      // desenho das tabelas a quem estiver batendo na porta.
      console.error(`[crm/${nome}] falhou:`, e);
      return erroCrm("erro_interno", 500, "Não foi possível completar agora.");
    }
  };
}

/** Só os dígitos, do jeito que o resto do sistema guarda telefone. */
export function telefoneDoCorpo(corpo: CorpoCrm): string {
  return String(corpo.phone ?? corpo.telefone ?? corpo.phone_e164 ?? "").replace(/[^0-9]/g, "");
}

/** Texto de campo opcional: vazio vira nulo, e nunca passa de `max`. */
export function textoOpcional(v: unknown, max = 500): string | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  return t.slice(0, max);
}
