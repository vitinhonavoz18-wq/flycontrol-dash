/**
 * O guia de configuração do lado do servidor.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * QUEM DIZ QUE UMA ETAPA ESTÁ PRONTA É O BANCO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Nada aqui aceita "o lojista clicou em concluir". A cada leitura o servidor
 * vai ver a loja de verdade — tem nome? tem telefone? tem produto com preço?
 * — e é ISSO que fecha a etapa.
 *
 * É a diferença entre o garçom anotar "entregue" na comanda e o prato estar
 * na mesa. Guiado por clique, o lojista termina o guia achando que está
 * pronto para vender, abre a loja e descobre que não tem cardápio.
 *
 * A LOJA VEM SEMPRE DA CONTA LOGADA
 *
 * Nunca de um número mandado pela tela. Mesmo molde de
 * `onboarding.functions.ts`: o porteiro confere o nome na lista em vez de
 * aceitar quem diz "pode deixar, eu sou convidado".
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  etapasConcluidas,
  ehIdDeEtapaDoGuia,
  progressoDoGuia,
  proximaEtapaDoGuia,
  type IdDaEtapaDoGuia,
  type SinaisDaConfiguracao,
} from "./etapas";

/**
 * As colunas do guia ainda não estão em `integrations/supabase/types.ts`
 * porque aqueles tipos são gerados a partir do banco e estas colunas são
 * novas. Mesmo molde já usado em `onboarding.functions.ts`: uma descrição
 * enxuta do que ESTE arquivo usa, que some quando os tipos forem regerados.
 */
type LinhaDoGuia = {
  guide_status: string | null;
  guide_current_step: string | null;
  guide_completed_steps: unknown;
};

type CadernoDoGuia = {
  from: (t: "onboarding_answers") => {
    select: (cols: string) => {
      eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: LinhaDoGuia | null }> };
    };
    update: (patch: Record<string, unknown>) => {
      eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

const caderno = supabaseAdmin as unknown as CadernoDoGuia;

export type EstadoDoGuia = {
  /** `false` quando este lojista não precisa (ou não deve) ver o guia. */
  ativo: boolean;
  etapaAtual: IdDaEtapaDoGuia | null;
  concluidas: IdDaEtapaDoGuia[];
  progresso: number;
  /** A rota onde a etapa atual acontece. `null` quando o guia terminou. */
  rota: string | null;
};

const GUIA_DESLIGADO: EstadoDoGuia = {
  ativo: false,
  etapaAtual: null,
  concluidas: [],
  progresso: 100,
  rota: null,
};

async function lojaDoUsuario(userId: string): Promise<{ id: string } | null> {
  const { data } = await supabaseAdmin
    .from("pizzerias")
    .select("id")
    .eq("owner_id", userId)
    .neq("status", "deleted")
    .neq("status", "inactive")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null) ?? null;
}

function texto(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * O campo de horário aceita tanto texto livre ("seg a sex 18h às 23h") quanto
 * uma lista. Vazio é `[]` em quase todas as lojas — é assim que o campo
 * nasce. Conferir o CONTEÚDO, e não só a existência, evita dar a etapa por
 * feita porque o campo existe vazio.
 */
function temConteudo(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return false;
}

/** A fotografia da loja neste instante. */
async function lerSinais(companyId: string): Promise<SinaisDaConfiguracao> {
  const [{ data: loja }, { count: categorias }, { count: produtos }] = await Promise.all([
    supabaseAdmin
      .from("pizzerias")
      .select(
        "name, phone, whatsapp, address, street, number, opening_hours, delivery_enabled, pickup_enabled",
      )
      .eq("id", companyId)
      .maybeSingle(),
    supabaseAdmin
      .from("menu_categories")
      .select("id", { count: "exact", head: true })
      .eq("pizzeria_id", companyId),
    supabaseAdmin
      .from("menu_products")
      .select("id", { count: "exact", head: true })
      .eq("pizzeria_id", companyId)
      .gt("price", 0),
  ]);

  const p = loja as {
    name: string | null;
    phone: string | null;
    whatsapp: string | null;
    address: string | null;
    street: string | null;
    number: string | null;
    opening_hours: unknown;
    delivery_enabled: boolean | null;
    pickup_enabled: boolean | null;
  } | null;

  return {
    temNome: texto(p?.name),
    // Telefone OU WhatsApp: exigir os dois barraria quem atende só por um
    // número, que é a maioria das lojas pequenas.
    temContato: texto(p?.phone) || texto(p?.whatsapp),
    temEndereco: texto(p?.address) || (texto(p?.street) && texto(p?.number)),
    temHorario: temConteudo(p?.opening_hours),
    temFormaDeAtendimento: !!p?.delivery_enabled || !!p?.pickup_enabled,
    categorias: categorias ?? 0,
    produtos: produtos ?? 0,
  };
}

function listaDeEtapas(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * O estado do guia para este lojista.
 *
 * Esta é a única função que a tela chama. Ela lê o caderno, lê a loja,
 * recalcula tudo e — quando o banco confirma uma etapa nova — GRAVA essa
 * confirmação antes de responder.
 */
export const estadoDoGuia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EstadoDoGuia> => {
    const loja = await lojaDoUsuario(context.userId);
    // Sem loja não há o que configurar. Administrador da plataforma e conta
    // recém-criada sem loja caem aqui e entram direto no painel.
    if (!loja) return GUIA_DESLIGADO;

    const { data } = await caderno
      .from("onboarding_answers")
      .select("guide_status, guide_current_step, guide_completed_steps")
      .eq("company_id", loja.id)
      .maybeSingle();

    // ═══════════════════════════════════════════════════════════════════
    // SEM CADERNO NÃO HÁ GUIA
    // ═══════════════════════════════════════════════════════════════════
    //
    // O caderno é aberto no cadastro. Quem não tem um é loja que já existia
    // antes do guia, loja criada pelo Painel Admin ou loja restaurada — e
    // nenhuma dessas pode ser parada no meio do expediente para responder um
    // guia de primeira configuração.
    //
    // Essa regra já foi o contrário uma vez e custou caro: o questionário
    // voltava a cada login para quem nunca tinha sido convidado.
    if (!data || data.guide_status === "completed") return GUIA_DESLIGADO;

    const sinais = await lerSinais(loja.id);
    const jaConfirmadas = listaDeEtapas(data.guide_completed_steps);
    const concluidas = etapasConcluidas(sinais, jaConfirmadas);
    const proxima = proximaEtapaDoGuia(concluidas);

    // O que mudou desde a última visita é gravado agora. Sem isso, a etapa
    // "primeiro produto" reabriria no dia em que o lojista apagasse aquele
    // produto — a porta que se tranca de novo atrás de quem já passou.
    const novasConfirmacoes = concluidas.length !== jaConfirmadas.length;
    const mudouEtapa = (proxima?.id ?? null) !== data.guide_current_step;
    const agora = new Date().toISOString();

    if (novasConfirmacoes || mudouEtapa || data.guide_status === "not_started") {
      const patch: Record<string, unknown> = {
        guide_status: proxima ? "in_progress" : "completed",
        guide_current_step: proxima?.id ?? null,
        guide_completed_steps: concluidas,
      };
      if (data.guide_status === "not_started") patch.guide_started_at = agora;
      if (!proxima) patch.guide_completed_at = agora;

      const { error } = await caderno
        .from("onboarding_answers")
        .update(patch)
        .eq("company_id", loja.id);
      // Falhar ao gravar não pode travar o lojista: o guia segue pelo que foi
      // calculado agora e tenta gravar de novo na próxima leitura.
      if (error) console.error("[guia] falha ao gravar progresso:", error.message);
    }

    if (!proxima) return { ...GUIA_DESLIGADO, concluidas, progresso: 100 };

    return {
      ativo: true,
      etapaAtual: proxima.id,
      concluidas,
      progresso: progressoDoGuia(concluidas),
      rota: proxima.rota,
    };
  });

/**
 * "Terminar depois".
 *
 * A TRAVA DE SEGURANÇA DA PORTA
 *
 * Toda porta que só abre de um jeito acaba prendendo alguém. Se um campo não
 * salvar, se a internet cair no meio, ou se o lojista precisar ver os pedidos
 * ANTES de terminar de configurar, tem que haver saída — senão a única saída
 * vira ligar para o suporte.
 *
 * Sair não apaga o progresso: as etapas já confirmadas continuam confirmadas,
 * e o "Prepare sua loja" do painel continua lembrando o que falta. O guia é
 * um andaime, não uma jaula.
 */
export const sairDoGuia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean }> => {
    const loja = await lojaDoUsuario(context.userId);
    if (!loja) return { ok: true };

    const agora = new Date().toISOString();
    const { error } = await caderno
      .from("onboarding_answers")
      .update({
        guide_status: "completed",
        guide_current_step: null,
        guide_completed_at: agora,
      })
      .eq("company_id", loja.id);

    if (error) {
      console.error("[guia] falha ao sair:", error.message);
      return { ok: false };
    }
    return { ok: true };
  });

/** Exportado para teste: a leitura dos sinais sem passar pela rota. */
export const __lerSinais = lerSinais;
export const __temConteudo = temConteudo;
export type { IdDaEtapaDoGuia };
export { ehIdDeEtapaDoGuia };
