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
import { garantirContagemCents } from "@/lib/billing/ativarContagemCents.functions";
import { validateBrazilianPhone } from "@/lib/signup/validation";
import {
  decisaoValida,
  etapasConcluidas,
  ehIdDeEtapaDoGuia,
  progressoDoGuia,
  proximaEtapaDoGuia,
  type DecisoesDoGuia,
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
  guide_decisions: unknown;
  guide_test_mode: boolean | null;
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
  /** As escolhas já gravadas — a tela usa para não reoferecer o que foi dito. */
  decisoes: DecisoesDoGuia;
  /**
   * O lojista consegue ligar o próprio plano daqui?
   *
   * Só no CENTS, que não tem valor de entrada nem pagamento a esperar: ali
   * ativar é abrir a contagem, e o botão resolve. No PREMIUM a ativação passa
   * por cobrança, e oferecer um botão que não pode funcionar é pendurar uma
   * maçaneta numa parede.
   */
  podeAtivarSozinho: boolean;
};

const GUIA_DESLIGADO: EstadoDoGuia = {
  ativo: false,
  etapaAtual: null,
  concluidas: [],
  progresso: 100,
  rota: null,
  decisoes: {},
  podeAtivarSozinho: false,
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

/**
 * O número que recebe os pedidos é um celular brasileiro de verdade?
 *
 * Usa o MESMO validador do cadastro (`validateBrazilianPhone`): DDD entre 11 e
 * 99, 10 ou 11 dígitos, e celular começando com 9. Duas regras de telefone no
 * mesmo sistema é como ter duas balanças no açougue — uma hora elas discordam
 * e ninguém sabe qual está certa.
 *
 * Conferido contra as 35 lojas reais: todas gravam de 10 a 11 dígitos, sem o
 * 55 do país na frente.
 */
function numeroDePedidosValido(bruto: unknown): boolean {
  if (typeof bruto !== "string") return false;
  return validateBrazilianPhone(bruto).valid;
}

/**
 * A loja já recebeu pedido de verdade?
 *
 * Um único pedido basta: quem já vendeu está operando, e operação não se
 * interrompe para preencher formulário.
 */
async function jaEstaVendendo(companyId: string): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", companyId)
    .limit(1);
  return (count ?? 0) > 0;
}

/** Fecha o caderno do guia, sem apagar o que já foi confirmado. */
async function encerrarGuia(companyId: string, motivo: string): Promise<void> {
  const agora = new Date().toISOString();
  const { error } = await caderno
    .from("onboarding_answers")
    .update({
      guide_status: "completed",
      guide_current_step: null,
      guide_completed_at: agora,
    })
    .eq("company_id", companyId);
  if (error) console.error(`[guia] falha ao encerrar (${motivo}):`, error.message);
}

/**
 * O plano da loja está em condição de operar?
 *
 * ═══════════════════════════════════════════════════════════════════════
 * "PLANO ATIVO" NÃO É "PLANO CENTS"
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Das 35 lojas do banco, 20 são PREMIUM e 15 são CENTS. Exigir CENTS para
 * fechar a etapa prenderia cada loja PREMIUM no guia para sempre, esperando
 * ativar um plano que não é o dela — a catraca que só aceita um tipo de
 * crachá num prédio onde metade das pessoas tem o outro.
 *
 * Então a pergunta é: existe assinatura funcionando? `active` e `free_trial`
 * são os dois estados em que a loja pode trabalhar; os outros
 * (`pending_payment`, `suspended`, `canceled`...) não são.
 *
 * O SEGUNDO SINAL, SÓ PARA O CENTS
 *
 * No CENTS não basta a assinatura: é preciso um CICLO ABERTO, que é onde os
 * pedidos são contados. Sem ciclo, o lojista vende e nada é registrado —
 * a comanda aberta que nunca chega ao caixa. Quem abre o ciclo é
 * `garantirContagemCents`, que já existe e é a mesma usada pelo painel.
 */
async function lerPlano(
  companyId: string,
): Promise<{ planoAtivo: boolean; centsPrecisaAtivar: boolean }> {
  const [{ data: loja }, { data: assinatura }] = await Promise.all([
    supabaseAdmin.from("pizzerias").select("plan_type").eq("id", companyId).maybeSingle(),
    (
      supabaseAdmin as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              k: string,
              v: string,
            ) => {
              maybeSingle: () => Promise<{
                data: { status: string; current_cycle_id: string | null } | null;
              }>;
            };
          };
        };
      }
    )
      .from("subscriptions")
      .select("status, current_cycle_id")
      .eq("company_id", companyId)
      .maybeSingle(),
  ]);

  const tipo = (loja as { plan_type: string | null } | null)?.plan_type ?? null;
  const planoAtivo = !!assinatura && ["active", "free_trial"].includes(assinatura.status);

  return {
    planoAtivo,
    centsPrecisaAtivar: tipo === "cents" && !assinatura?.current_cycle_id,
  };
}

/** A fotografia da loja neste instante. */
async function lerSinais(companyId: string): Promise<SinaisDaConfiguracao> {
  const [{ data: loja }, { count: categorias }, { count: produtos }, { count: adicionais }, plano] =
    await Promise.all([
      supabaseAdmin
        .from("pizzerias")
        .select(
          "name, phone, whatsapp, address, street, number, opening_hours, delivery_enabled, pickup_enabled, payment_methods",
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
      // Complemento desligado não aparece para o cliente, então não conta como
      // "a loja tem adicionais". `active` nulo é tratado como ligado: é assim
      // que as linhas antigas ficaram.
      supabaseAdmin
        .from("menu_extras")
        .select("id", { count: "exact", head: true })
        .eq("pizzeria_id", companyId)
        .or("active.is.null,active.eq.true"),
      lerPlano(companyId),
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
    payment_methods: unknown;
  } | null;

  // As formas que o lojista marcou. A tela grava uma lista de textos
  // ("Pix", "Dinheiro"...); qualquer outra coisa é tratada como nenhuma.
  const formas = Array.isArray(p?.payment_methods)
    ? p.payment_methods.filter((f) => typeof f === "string" && f.trim().length > 0)
    : [];

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
    adicionais: adicionais ?? 0,
    formasDePagamento: formas.length,
    // O campo "WhatsApp de Pedidos" da tela Minha Loja grava em `phone` — foi
    // conferido no código da tela e nas 35 lojas do banco. A coluna `whatsapp`
    // existe e está vazia em todas elas; ela é lida como reserva, para o dia
    // em que alguém passe a preenchê-la.
    whatsappValido: numeroDePedidosValido(p?.phone) || numeroDePedidosValido(p?.whatsapp),
    planoAtivo: plano.planoAtivo,
    centsPrecisaAtivar: plano.centsPrecisaAtivar,
  };
}

function listaDeEtapas(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * As decisões gravadas, passadas pelo mesmo crivo de sempre.
 *
 * O que veio do banco também é conferido contra o catálogo — não só o que vem
 * da tela. Uma linha com lixo (de uma versão antiga, de um script, de um
 * engano) não pode virar etapa dada por concluída em silêncio.
 */
function decisoesDe(v: unknown): DecisoesDoGuia {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const limpo: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(v as Record<string, unknown>)) {
    if (typeof valor === "string" && decisaoValida(chave, valor)) limpo[chave] = valor;
  }
  return limpo as DecisoesDoGuia;
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
      .select(
        "guide_status, guide_current_step, guide_completed_steps, guide_decisions, guide_test_mode",
      )
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

    // ═══════════════════════════════════════════════════════════════════
    // LOJA QUE JÁ ESTÁ VENDENDO NÃO É PARADA
    // ═══════════════════════════════════════════════════════════════════
    //
    // Segunda trava, independente da primeira. Se um caderno em aberto
    // sobrar por engano numa loja que já recebe pedidos — um script, uma
    // restauração, um cadastro refeito — o guia se encerra sozinho em vez de
    // escurecer o painel de quem tem pedido chegando.
    //
    // É a catraca no meio do salão durante o almoço: quem já está sentado
    // não pode ser obrigado a passar por ela para continuar comendo.
    //
    // A exceção é a loja de ENSAIO (`guide_test_mode`), ligada à mão no banco
    // para o dono da plataforma poder ver o guia rodando. É o alarme de
    // incêndio que precisa deixar o bombeiro testar se ele toca.
    if (!data.guide_test_mode && (await jaEstaVendendo(loja.id))) {
      await encerrarGuia(loja.id, "loja já opera");
      return GUIA_DESLIGADO;
    }

    const sinais = await lerSinais(loja.id);
    const decisoes = decisoesDe(data.guide_decisions);
    const jaConfirmadas = listaDeEtapas(data.guide_completed_steps);
    const concluidas = etapasConcluidas(sinais, jaConfirmadas, decisoes);
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

    if (!proxima) return { ...GUIA_DESLIGADO, concluidas, progresso: 100, decisoes };

    return {
      ativo: true,
      etapaAtual: proxima.id,
      concluidas,
      progresso: progressoDoGuia(concluidas),
      rota: proxima.rota,
      decisoes,
      podeAtivarSozinho: sinais.centsPrecisaAtivar,
    };
  });

/**
 * Liga a contagem do plano CENTS para este lojista.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * NÃO EXISTE SEGUNDO SISTEMA DE ASSINATURA AQUI
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Quem faz o trabalho é `garantirContagemCents`, que já existe e é a MESMA
 * que o painel usa. Este envelope só descobre qual é a loja do usuário e
 * chama. Um segundo caminho de ativação seria uma segunda chave da mesma
 * porta, com segredo diferente: um dia uma delas deixa de fechar.
 *
 * CHAMAR DUAS VEZES NÃO ABRE DOIS CICLOS
 *
 * A função de origem sai no primeiro `if` quando já existe ciclo aberto —
 * dois ciclos fariam o mesmo pedido ser contado duas vezes. Então o toque
 * repetido do lojista impaciente é inofensivo.
 */
export const ativarPlanoPeloGuia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; motivo?: string }> => {
    const loja = await lojaDoUsuario(context.userId);
    if (!loja) return { ok: false, motivo: "loja_nao_encontrada" };

    try {
      const r = await garantirContagemCents({ data: { tenantId: loja.id } });
      // `ativouAgora: false` com motivo "ja_contando" é sucesso: alguém (ou
      // um toque anterior) já ligou. Só os outros motivos são falha.
      if (r.ativouAgora || r.motivo === "ja_contando") return { ok: true };
      console.warn("[guia] ativação do plano não concluída:", r.motivo);
      return { ok: false, motivo: r.motivo };
    } catch (erro) {
      // O motivo vai para o log do servidor, nunca para a tela: ele cita
      // nomes internos de tabela e de estado que não dizem nada ao lojista.
      console.error("[guia] falha ao ativar o plano:", erro);
      return { ok: false, motivo: "erro_inesperado" };
    }
  });

/**
 * Grava uma escolha do lojista — as poucas que o banco não sabe responder.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * O QUE CHEGA DA TELA NÃO É ACEITO COMO VEIO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * A chave e o valor são conferidos contra o catálogo `DECISOES_ACEITAS`
 * antes de qualquer coisa. Sem isso, bastaria uma requisição inventada para
 * gravar "pagamentos: dispensado" e pular uma etapa que exige dado de
 * verdade — a porta dos fundos do guia inteiro.
 *
 * É o porteiro conferindo o nome na lista em vez de aceitar quem diz "pode
 * deixar, eu sou convidado".
 *
 * GRAVAR A MESMA COISA DUAS VEZES NÃO FAZ MAL
 *
 * O lojista com internet lenta toca o botão três vezes. As três chegam, as
 * três gravam o mesmo valor, e o resultado é idêntico ao de uma só — não
 * existe "dispensado duas vezes".
 */
export const registrarDecisao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((entrada: { chave?: string; valor?: string }) => ({
    chave: typeof entrada?.chave === "string" ? entrada.chave : "",
    valor: typeof entrada?.valor === "string" ? entrada.valor : "",
  }))
  .handler(async ({ context, data }): Promise<{ ok: boolean }> => {
    if (!decisaoValida(data.chave, data.valor)) {
      console.warn("[guia] decisão recusada:", data.chave, data.valor);
      return { ok: false };
    }

    const loja = await lojaDoUsuario(context.userId);
    if (!loja) return { ok: false };

    const { data: atual } = await caderno
      .from("onboarding_answers")
      .select(
        "guide_status, guide_current_step, guide_completed_steps, guide_decisions, guide_test_mode",
      )
      .eq("company_id", loja.id)
      .maybeSingle();

    // Sem caderno não há guia, e sem guia não há decisão a gravar.
    if (!atual || atual.guide_status === "completed") return { ok: false };

    const decisoes = { ...decisoesDe(atual.guide_decisions), [data.chave]: data.valor };

    const { error } = await caderno
      .from("onboarding_answers")
      .update({ guide_decisions: decisoes })
      .eq("company_id", loja.id);

    if (error) {
      console.error("[guia] falha ao gravar decisão:", error.message);
      return { ok: false };
    }
    return { ok: true };
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

    await encerrarGuia(loja.id, "o lojista pediu para sair");
    return { ok: true };
  });

/** Exportado para teste: a leitura dos sinais sem passar pela rota. */
export const __lerSinais = lerSinais;
export const __temConteudo = temConteudo;
export type { IdDaEtapaDoGuia };
export { ehIdDeEtapaDoGuia };
