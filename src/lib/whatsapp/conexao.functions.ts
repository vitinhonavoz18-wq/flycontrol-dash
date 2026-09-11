import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertOwnsTenant } from "@/lib/server/plan-guard";
import {
  configUazapi,
  criarInstancia,
  conectarInstancia,
  statusInstancia,
  desconectarInstancia,
  configurarWebhook,
  traduzirStatusInstancia,
} from "./uazapi";

/* As tabelas envolvidas ainda não constam do arquivo de tipos gerado. */
/* eslint-disable @typescript-eslint/no-explicit-any */
const db = (tabela: string): any => (supabaseAdmin as any).from(tabela);

/**
 * Ligar e desligar o WhatsApp da loja — pela tela do próprio lojista.
 *
 * O PROBLEMA QUE ISSO RESOLVE
 *
 * O WhatsApp derruba a conexão sozinho de tempos em tempos: troca de celular,
 * ficar dias sem internet, ou simplesmente porque sim. Antes, quando caía, o
 * restaurante ficava mudo até alguém do suporte ler um QR Code por ele — e
 * isso podia levar horas, num sábado à noite, com cliente esperando resposta.
 *
 * Agora é como o WhatsApp Web: caiu, o dono aponta a câmera e volta. Em
 * trinta segundos, sem telefonema para ninguém.
 *
 * A CONFERÊNCIA DE DONO É A MESMA DE SEMPRE. O `tenantId` que chega do
 * navegador é um pedido, nunca uma verdade.
 */

const PROVEDOR = "uazapi";

export type EstadoConexao = {
  configurado: boolean;
  status: "connected" | "connecting" | "disconnected" | "error";
  telefone: string | null;
  nomePerfil: string | null;
  avisoWebhook: boolean;
  ultimaVerificacao: string | null;
  mensagem: string | null;
};

/** A ficha do aparelho + o token guardado no cofre. */
async function fichaDoAparelho(tenantId: string) {
  const { data: ficha } = await db("marketing_whatsapp_instances")
    .select("external_instance_id, phone_e164, status, instance_name, webhook_configured_at")
    .eq("tenant_id", tenantId)
    .eq("provider", PROVEDOR)
    .maybeSingle();

  const { data: cofre } = await db("whatsapp_instance_secrets")
    .select("instance_token")
    .eq("tenant_id", tenantId)
    .eq("provider", PROVEDOR)
    .maybeSingle();

  return { ficha, token: (cofre?.instance_token as string | undefined) ?? null };
}

async function gravarFicha(tenantId: string, campos: Record<string, unknown>) {
  await db("marketing_whatsapp_instances").upsert(
    { tenant_id: tenantId, provider: PROVEDOR, ...campos, updated_at: new Date().toISOString() },
    { onConflict: "tenant_id,provider" },
  );
}

/** Para onde os avisos de mensagem nova daquela loja devem ir. */
async function enderecoDoFluxo(tenantId: string): Promise<string | null> {
  const { data } = await db("crm_n8n_links")
    .select("inbound_webhook_url")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const url = (data?.inbound_webhook_url as string | undefined)?.trim();
  return url || null;
}

/**
 * Como está a conexão agora.
 *
 * Pergunta para a UAZAPI, mas NÃO depende dela: se a UAZAPI não responder, a
 * tela mostra o último estado conhecido em vez de ficar em branco. O lojista
 * precisa saber se pode contar com o WhatsApp, e "não sei" é uma resposta
 * pior do que "há dez minutos estava conectado".
 */
export const estadoConexaoWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => d)
  .handler(async ({ data, context }): Promise<EstadoConexao> => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);

    if (!configUazapi()) {
      return {
        configurado: false,
        status: "disconnected",
        telefone: null,
        nomePerfil: null,
        avisoWebhook: false,
        ultimaVerificacao: null,
        mensagem: "A integração com o WhatsApp ainda não foi configurada neste ambiente.",
      };
    }

    const { ficha, token } = await fichaDoAparelho(tenantId);

    if (!token) {
      return {
        configurado: true,
        status: "disconnected",
        telefone: null,
        nomePerfil: null,
        avisoWebhook: false,
        ultimaVerificacao: null,
        mensagem: null,
      };
    }

    const r = await statusInstancia(token);

    if (!r.ok) {
      return {
        configurado: true,
        status: traduzirStatusInstancia(ficha?.status),
        telefone: (ficha?.phone_e164 as string | undefined) ?? null,
        nomePerfil: null,
        avisoWebhook: !ficha?.webhook_configured_at,
        ultimaVerificacao: null,
        mensagem: r.erro,
      };
    }

    const conectado = Boolean(r.dados.status?.connected && r.dados.status?.loggedIn);
    const status = conectado ? "connected" : traduzirStatusInstancia(r.dados.instance?.status);
    const telefone = extrairTelefone(r.dados.instance?.owner) ?? null;
    const agora = new Date().toISOString();

    await gravarFicha(tenantId, {
      status,
      phone_e164: telefone,
      last_synced_at: agora,
      connected_at: conectado ? (ficha?.status === "connected" ? undefined : agora) : undefined,
      disconnected_at: conectado ? undefined : agora,
      status_message: r.dados.instance?.lastDisconnectReason ?? null,
    });

    return {
      configurado: true,
      status,
      telefone,
      nomePerfil: r.dados.instance?.profileName ?? null,
      // Aparelho conectado e aviso não apontado = o WhatsApp recebe mensagem e
      // ninguém fica sabendo. Parece que está tudo bem, e não está.
      avisoWebhook: conectado && !ficha?.webhook_configured_at,
      ultimaVerificacao: agora,
      mensagem: null,
    };
  });

/**
 * Pedir o QR Code (ou o código de pareamento).
 *
 * Faz três coisas numa tacada, na ordem certa:
 *   1. cria o aparelho na UAZAPI, se esta loja ainda não tiver um;
 *   2. aponta o aviso de mensagem nova para o fluxo daquela loja;
 *   3. pede o QR Code.
 *
 * O passo 2 vem ANTES do 3 de propósito. Se viesse depois, haveria uma janela
 * em que o aparelho já está conectado e o aviso ainda não foi apontado — e as
 * mensagens que chegassem nesse intervalo sumiriam sem deixar rastro.
 */
export const iniciarConexaoWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; telefone?: string }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);

    if (!configUazapi()) {
      throw new Error("A integração com o WhatsApp ainda não foi configurada neste ambiente.");
    }

    let { ficha, token } = await fichaDoAparelho(tenantId);

    // 1. O aparelho existe?
    if (!token) {
      const { data: loja } = await db("pizzerias")
        .select("name, slug")
        .eq("id", tenantId)
        .maybeSingle();
      const nome = `flycontrol-${(loja?.slug || tenantId).toString().slice(0, 40)}`;

      const criada = await criarInstancia(nome, tenantId);
      if (!criada.ok) throw new Error(criada.erro);

      const novoToken = criada.dados.token ?? criada.dados.instance?.token;
      if (!novoToken) throw new Error("O WhatsApp não devolveu a credencial do aparelho.");

      await db("whatsapp_instance_secrets").upsert(
        {
          tenant_id: tenantId,
          provider: PROVEDOR,
          instance_token: novoToken,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,provider" },
      );

      await gravarFicha(tenantId, {
        external_instance_id: criada.dados.instance?.id ?? null,
        instance_name: nome,
        status: "disconnected",
      });

      token = novoToken;
      ficha = { ...(ficha ?? {}), instance_name: nome };
    }

    // 2. Para onde vão as mensagens que chegarem.
    const url = await enderecoDoFluxo(tenantId);
    let avisoSemFluxo = false;
    if (url) {
      const w = await configurarWebhook(token, url);
      if (w.ok) {
        await gravarFicha(tenantId, { webhook_configured_at: new Date().toISOString() });
      }
    } else {
      // Sem endereço cadastrado, a conexão ainda vale a pena (o Marketing usa
      // o mesmo aparelho), mas o Chat fica mudo. A tela precisa dizer isso.
      avisoSemFluxo = true;
    }

    // 3. O QR Code.
    const r = await conectarInstancia(token, data.telefone);
    if (!r.ok) throw new Error(r.erro);

    const inst = r.dados.instance;
    const jaConectado = Boolean(r.dados.connected && r.dados.loggedIn);

    if (jaConectado) {
      await gravarFicha(tenantId, { status: "connected", connected_at: new Date().toISOString() });
    } else {
      await gravarFicha(tenantId, { status: "connecting" });
    }

    return {
      jaConectado,
      // Vem da UAZAPI já em base64, pronto para virar imagem na tela.
      qrcode: inst?.qrcode ?? null,
      paircode: inst?.paircode ?? null,
      avisoSemFluxo,
    };
  });

/**
 * Desligar o WhatsApp da loja.
 *
 * NÃO apaga o aparelho nem o histórico: desconecta. O mesmo aparelho volta a
 * funcionar na próxima leitura de QR Code, com o mesmo número, e todas as
 * conversas continuam onde estavam.
 */
export const desconectarWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => d)
  .handler(async ({ data, context }) => {
    const { tenantId } = await assertOwnsTenant(context.supabase, context.userId, data.tenantId);

    const { token } = await fichaDoAparelho(tenantId);
    if (!token) return { ok: true };

    const r = await desconectarInstancia(token);
    // Mesmo que a UAZAPI recuse, anotamos como desconectado: o lojista clicou
    // em desconectar e a tela não pode continuar dizendo "conectado".
    await gravarFicha(tenantId, {
      status: "disconnected",
      disconnected_at: new Date().toISOString(),
    });

    if (!r.ok) throw new Error(r.erro);
    return { ok: true };
  });

/**
 * O telefone vem colado ao identificador do WhatsApp
 * ("5571999999999@s.whatsapp.net"). Guardamos só os dígitos.
 */
function extrairTelefone(owner: string | undefined): string | null {
  if (!owner) return null;
  const digitos = owner.split("@")[0]?.replace(/\D/g, "") ?? "";
  return digitos.length >= 10 ? digitos : null;
}
