/**
 * O onboarding do lado do servidor: ler, salvar etapa a etapa e concluir.
 *
 * DUAS REGRAS MANDAM AQUI
 *
 * 1. O NAVEGADOR NÃO É FONTE CONFIÁVEL. Nada do que chega é aceito como veio:
 *    a loja é conferida contra o dono logado, e cada resposta é conferida
 *    contra o catálogo de perguntas. É o porteiro conferindo o nome na lista
 *    em vez de aceitar quem diz "pode deixar, eu sou convidado".
 *
 * 2. SALVAR É A CADA ETAPA, NUNCA SÓ NO FIM. Se o lojista fechar o navegador
 *    na pergunta 7, as seis anteriores já estão gravadas. Guardar tudo para o
 *    final é anotar o pedido inteiro num guardanapo e só passar para a comanda
 *    quando o cliente for embora.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { layoutRecomendadoPara } from "@/lib/menu/layouts";
import { aplicarResposta, proximaEtapaPendente, terminou } from "./fluxo";
import { etapaPorId, type IdDaEtapa, type Respostas } from "./perguntas";
import type { SinaisDaLoja } from "./primeirosPassos";
import type { Json } from "@/integrations/supabase/types";

/**
 * `onboarding_answers` ainda não está em `integrations/supabase/types.ts`
 * porque aqueles tipos são gerados a partir do banco e esta tabela é nova.
 * Mesmo molde já usado para `signup_attempts` em `signup/rateLimit.server.ts`:
 * uma descrição enxuta do que ESTE arquivo usa, que some quando os tipos forem
 * regerados.
 */
type LinhaOnboarding = {
  status: string;
  current_step: string | null;
  respostas: unknown;
};

type OnboardingDb = {
  from: (t: "onboarding_answers") => {
    select: (cols: string) => {
      eq: (
        c: string,
        v: string,
      ) => { maybeSingle: () => Promise<{ data: LinhaOnboarding | null }> };
    };
    upsert: (
      linha: Record<string, unknown>,
      opcoes: { onConflict: string; ignoreDuplicates: boolean },
    ) => Promise<{ error: { message: string } | null }>;
    update: (patch: Record<string, unknown>) => {
      eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

const caderno = supabaseAdmin as unknown as OnboardingDb;

export type EstadoDoOnboarding = {
  companyId: string;
  companyName: string;
  status: "not_started" | "in_progress" | "completed";
  etapaAtual: IdDaEtapa | null;
  respostas: Respostas;
  /** Quantos produtos a loja já tem. Decide o destino ao terminar. */
  produtos: number;
};

/**
 * A loja deste usuário.
 *
 * Sempre pela conta logada, nunca por um identificador que veio da tela. Um
 * lojista não escolhe de qual empresa está respondendo o onboarding: é a dele.
 */
async function lojaDoUsuario(userId: string): Promise<{ id: string; name: string } | null> {
  const { data } = await supabaseAdmin
    .from("pizzerias")
    .select("id, name")
    .eq("owner_id", userId)
    .neq("status", "deleted")
    .neq("status", "inactive")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return (data as { id: string; name: string } | null) ?? null;
}

async function contarProdutos(companyId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("menu_products")
    .select("id", { count: "exact", head: true })
    .eq("pizzeria_id", companyId);
  return count ?? 0;
}

function respostasDe(linha: { respostas?: unknown } | null | undefined): Respostas {
  const cru = linha?.respostas;
  return cru && typeof cru === "object" && !Array.isArray(cru) ? (cru as Respostas) : {};
}

/** Lê o estado atual. É o que a tela usa para saber onde continuar. */
export const lerOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EstadoDoOnboarding | null> => {
    const loja = await lojaDoUsuario(context.userId);
    if (!loja) return null;

    const { data } = await caderno
      .from("onboarding_answers")
      .select("status, current_step, respostas")
      .eq("company_id", loja.id)
      .maybeSingle();

    const linha = data;
    const respostas = respostasDe(data);

    return {
      companyId: loja.id,
      companyName: loja.name,
      status: (linha?.status as EstadoDoOnboarding["status"]) ?? "not_started",
      etapaAtual:
        (linha?.current_step as IdDaEtapa | null) ?? proximaEtapaPendente(respostas) ?? null,
      respostas,
      produtos: await contarProdutos(loja.id),
    };
  });

/**
 * Guarda a resposta de UMA etapa e devolve o estado já recalculado.
 *
 * Devolver o estado inteiro (e não só "ok") é de propósito: mudar uma resposta
 * pode apagar o caminho de outra, e quem manda no caminho é o servidor. A tela
 * não recalcula nada por conta própria.
 */
export const salvarEtapa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((entrada: { etapa?: string; escolhidos?: unknown; texto?: unknown }) => ({
    etapa: typeof entrada?.etapa === "string" ? entrada.etapa : "",
    escolhidos: Array.isArray(entrada?.escolhidos)
      ? entrada.escolhidos.filter((v): v is string => typeof v === "string").slice(0, 30)
      : [],
    texto: typeof entrada?.texto === "string" ? entrada.texto : undefined,
  }))
  .handler(async ({ context, data }): Promise<EstadoDoOnboarding | null> => {
    const etapa = etapaPorId(data.etapa);
    if (!etapa) return null;

    const loja = await lojaDoUsuario(context.userId);
    if (!loja) return null;

    const { data: atual } = await caderno
      .from("onboarding_answers")
      .select("status, respostas")
      .eq("company_id", loja.id)
      .maybeSingle();

    // Onboarding já concluído não é reaberto por uma requisição: quem terminou,
    // terminou. Sem isso, bastaria repetir a chamada para reabrir o
    // questionário de um cliente que já está trabalhando.
    if (atual?.status === "completed") {
      return lerEstado(loja, atual);
    }

    const respostas = aplicarResposta(respostasDe(atual), etapa.id, data.escolhidos, data.texto);
    const proxima = proximaEtapaPendente(respostas);
    const agora = new Date().toISOString();

    const { error } = await caderno.from("onboarding_answers").upsert(
      {
        company_id: loja.id,
        status: "in_progress",
        current_step: proxima,
        respostas: respostas as unknown as Record<string, unknown>,
        started_at: agora,
        last_activity_at: agora,
      },
      { onConflict: "company_id", ignoreDuplicates: false },
    );

    if (error) {
      console.error("[onboarding] falha ao salvar etapa:", error.message);
      // Devolver nulo faz a tela dizer "não conseguimos salvar, tente de
      // novo" sem avançar. Avançar em silêncio perderia a resposta.
      return null;
    }

    return {
      companyId: loja.id,
      companyName: loja.name,
      status: "in_progress",
      etapaAtual: proxima,
      respostas,
      produtos: await contarProdutos(loja.id),
    };
  });

function lerEstado(
  loja: { id: string; name: string },
  linha: Partial<LinhaOnboarding> | null,
): EstadoDoOnboarding {
  return {
    companyId: loja.id,
    companyName: loja.name,
    status: (linha?.status as EstadoDoOnboarding["status"]) ?? "not_started",
    etapaAtual: (linha?.current_step as IdDaEtapa | null) ?? null,
    respostas: respostasDe(linha),
    produtos: 0,
  };
}

/**
 * Aplica o que dá para aplicar sozinho, sem nunca passar por cima do lojista.
 *
 * A ORDEM DE QUEM MANDA
 *
 *   1. o que o lojista escolheu à mão;
 *   2. o que o onboarding recomenda;
 *   3. o padrão do sistema.
 *
 * Por isso cada ajuste aqui só acontece se o campo ainda estiver vazio. Se ele
 * já escolheu o layout do cardápio numa tela do painel, o onboarding não
 * reescreve: seria trocar a placa que o dono acabou de pendurar na porta.
 */
async function aplicarConfiguracaoAutomatica(companyId: string, respostas: Respostas) {
  const tipo = (respostas.tipo_de_negocio ?? [])[0];
  if (!tipo) return;

  const { data: loja } = await supabaseAdmin
    .from("pizzerias")
    .select("business_type, site_settings")
    .eq("id", companyId)
    .maybeSingle();

  const atual = loja as { business_type: string | null; site_settings: unknown } | null;
  const ajustes: { business_type?: string; site_settings?: Json } = {};

  // Tipo de negócio: só preenche se estiver vazio.
  if (!atual?.business_type) {
    const rotulo = etapaPorId("tipo_de_negocio")?.opcoes.find((o) => o.valor === tipo)?.rotulo;
    // No "Outro", vale o que a pessoa escreveu — é o nome que ela dá ao
    // próprio negócio.
    const escrito = respostas.textoLivre?.tipo_de_negocio;
    ajustes.business_type = tipo === "outro" && escrito ? escrito : (rotulo ?? tipo);
  }

  // Layout do cardápio: a recomendação vem do mesmo motor que a tela "Minha
  // Loja" usa. Um mapa só para os dois lugares.
  const settings =
    atual?.site_settings && typeof atual.site_settings === "object"
      ? (atual.site_settings as Record<string, unknown>)
      : {};
  const jaEscolheu = typeof settings.menu_layout === "string" && settings.menu_layout;
  if (!jaEscolheu) {
    const recomendado = layoutRecomendadoPara(ajustes.business_type ?? atual?.business_type);
    if (recomendado) {
      ajustes.site_settings = { ...settings, menu_layout: recomendado } as Json;
    }
  }

  if (Object.keys(ajustes).length === 0) return;
  const { error } = await supabaseAdmin.from("pizzerias").update(ajustes).eq("id", companyId);
  if (error) console.error("[onboarding] falha ao aplicar configuração:", error.message);
}

/**
 * Fecha o onboarding.
 *
 * A ORDEM IMPORTA: primeiro aplica as configurações, só depois marca como
 * concluído. Ao contrário, uma falha no meio deixaria o cliente com o
 * onboarding "pronto" e o sistema sem nenhum ajuste — e ele nunca mais
 * passaria por aqui para consertar.
 */
export const concluirOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ ok: boolean; destino: "cardapio" | "painel"; erro?: string }> => {
      const loja = await lojaDoUsuario(context.userId);
      if (!loja) return { ok: false, destino: "painel", erro: "loja_nao_encontrada" };

      const { data } = await caderno
        .from("onboarding_answers")
        .select("status, respostas")
        .eq("company_id", loja.id)
        .maybeSingle();

      const respostas = respostasDe(data);
      const produtos = await contarProdutos(loja.id);

      if (data?.status === "completed") {
        return { ok: true, destino: produtos > 0 ? "painel" : "cardapio" };
      }

      if (!terminou(respostas)) {
        return { ok: false, destino: "painel", erro: "faltam_respostas" };
      }

      await aplicarConfiguracaoAutomatica(loja.id, respostas);

      const agora = new Date().toISOString();
      const { error } = await caderno
        .from("onboarding_answers")
        .update({
          status: "completed",
          current_step: null,
          completed_at: agora,
          last_activity_at: agora,
        })
        .eq("company_id", loja.id);

      if (error) {
        console.error("[onboarding] falha ao concluir:", error.message);
        return { ok: false, destino: "painel", erro: "falha_ao_salvar" };
      }

      // Loja sem nenhum produto vai para o cardápio, não para o painel: um
      // painel de pedidos sem cardápio é uma cozinha sem ingredientes.
      return { ok: true, destino: produtos > 0 ? "painel" : "cardapio" };
    },
  );

/**
 * A pergunta mais barata possível: este lojista ainda precisa passar pelo
 * onboarding?
 *
 * O painel inteiro pergunta isso a cada sessão, então ela é de propósito
 * enxuta — uma consulta, sem contar produtos nem carregar respostas. É a
 * portaria conferindo a pulseira, não revistando a mochila.
 *
 * Loja SEM caderno é loja nova: toda empresa que já existia quando esta
 * funcionalidade entrou no ar recebeu um caderno marcado como concluído.
 * Ninguém que já é cliente cai no questionário.
 */
export const precisaDeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ pendente: boolean }> => {
    const loja = await lojaDoUsuario(context.userId);
    // Sem loja não há o que preparar: quem não tem loja vê a tela de
    // boas-vindas do painel, não o questionário.
    if (!loja) return { pendente: false };

    const { data } = await caderno
      .from("onboarding_answers")
      .select("status")
      .eq("company_id", loja.id)
      .maybeSingle();

    return { pendente: data?.status !== "completed" };
  });

/**
 * Os sinais reais da loja para o "Prepare sua loja" do painel.
 *
 * Cada resposta vem de um dado que existe: produto cadastrado, pedido
 * recebido, cardápio publicado. Nada é marcado por conta própria — passo que
 * se marca sozinho é boletim que dá nota para matéria que ninguém deu.
 */
export const sinaisDaLoja = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SinaisDaLoja | null> => {
    const loja = await lojaDoUsuario(context.userId);
    if (!loja) return null;

    const [{ data: dados }, { data: fichaOnboarding }, produtos, { count: pedidos }] =
      await Promise.all([
        supabaseAdmin
          .from("pizzerias")
          .select("name, phone, address, payment_methods, provision_status, public_url")
          .eq("id", loja.id)
          .maybeSingle(),
        caderno.from("onboarding_answers").select("status").eq("company_id", loja.id).maybeSingle(),
        contarProdutos(loja.id),
        supabaseAdmin
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", loja.id),
      ]);

    const p = dados as {
      name: string | null;
      phone: string | null;
      address: string | null;
      payment_methods: unknown;
      provision_status: string | null;
      public_url: string | null;
    } | null;

    const formas = Array.isArray(p?.payment_methods) ? p.payment_methods : [];

    return {
      onboardingConcluido: fichaOnboarding?.status === "completed",
      produtos,
      lojaIdentificada: !!(p?.name?.trim() && p?.phone?.trim() && p?.address?.trim()),
      temPagamento: formas.length > 0,
      cardapioPublicado: !!p?.public_url && p?.provision_status === "provisioned",
      pedidos: pedidos ?? 0,
    };
  });
