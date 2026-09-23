/**
 * Tudo o que o Painel Admin → Afiliados pede ao banco.
 *
 * Cada função do banco chamada daqui confere, na primeira linha, se quem
 * chama é administrador de verdade (`afiliado_exigir_admin`). Esconder o
 * menu na tela é só conforto; a porta que vale é a do banco.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  PeriodoDoGrafico,
  SituacaoDaComissao,
  SituacaoDaLoja,
  SituacaoDoAfiliado,
  SituacaoDoSaque,
  Pagina,
} from "./portal";
import type { TipoDePix } from "./validacao";

type RpcSolto = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

async function chamar<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const rpc = (supabase.rpc as unknown as RpcSolto).bind(supabase);
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const POR_PAGINA_ADMIN = 20;

// ─── Tipos ────────────────────────────────────────────────────────────────

export type ResumoAdmin = {
  afiliados_ativos: number;
  afiliados_pendentes: number;
  afiliados_suspensos: number;
  afiliados_bloqueados: number;
  clientes_indicados: number;
  clientes_ativos: number;
  receita_gerada_cents: number;
  comissoes_pendentes_cents: number;
  comissoes_disponiveis_cents: number;
  comissoes_solicitadas_cents: number;
  comissoes_pagas_cents: number;
  saques_em_analise: number;
  saques_em_analise_cents: number;
  saques_a_pagar: number;
  saques_a_pagar_cents: number;
  alertas_30_dias: number;
  /** Parceiros ativos com saldo para repasse e SEM chave Pix — ficam de fora. */
  com_saldo_sem_pix: number;
  dias_de_repasse: number[];
};

export type SerieAdmin = {
  passo: "day" | "week" | "month";
  pontos: {
    inicio: string;
    receita_cents: number;
    comissoes_cents: number;
    novos_afiliados: number;
    novas_indicacoes: number;
  }[];
};

export type AfiliadoNaLista = {
  id: string;
  nome: string;
  email: string;
  codigo: string;
  status: SituacaoDoAfiliado;
  indicacoes: number;
  clientes_ativos: number;
  receita_cents: number;
  comissao_bps: number;
  comissao_propria: boolean;
  disponivel_cents: number;
  criado_em: string;
  telefone: string | null;
  /** Sem chave Pix, o repasse dele não é montado. */
  sem_pix: boolean;
};

export type FichaDoAfiliado = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  documento: string | null;
  pix_tipo: TipoDePix | null;
  pix_chave: string | null;
  codigo: string;
  status: SituacaoDoAfiliado;
  criado_em: string;
  termos_versao: string | null;
  termos_aceitos_em: string | null;
  comissao_bps: number;
  comissao_propria_bps: number | null;
  comissao_padrao_bps: number;
  indicacoes: number;
  clientes_ativos: number;
  cliques: number;
  receita_cents: number;
  acumulado_cents: number;
  pendente_cents: number;
  disponivel_cents: number;
  solicitado_cents: number;
  pago_cents: number;
  alertas: number;
};

export type IndicacaoAdmin = {
  id: string;
  afiliado_id: string;
  afiliado: string;
  loja_id: string;
  loja: string;
  codigo: string;
  data: string;
  situacao: SituacaoDaLoja;
  indicacao_ativa: boolean;
  manual: boolean;
  receita_cents: number;
  comissao_cents: number;
};

export type ComissaoAdmin = {
  id: string;
  afiliado_id: string;
  afiliado: string;
  loja: string;
  fatura_id: string | null;
  fatura_numero: string | null;
  tipo: "commission" | "adjustment";
  bruto_cents: number;
  elegivel_cents: number;
  bps: number;
  comissao_cents: number;
  situacao: SituacaoDaComissao;
  data: string;
  libera_em: string | null;
};

export type InspecaoDeComissao = {
  comissao: {
    id: string;
    kind: "commission" | "adjustment";
    status: string;
    invoice_id: string | null;
    gross_amount_cents: number;
    eligible_amount_cents: number;
    commission_bps: number;
    commission_amount_cents: number;
    idempotency_key: string;
    created_at: string;
    available_at: string;
    released_at: string | null;
    requested_at: string | null;
    paid_at: string | null;
    reversed_at: string | null;
    metadata: Record<string, unknown>;
  };
  afiliado: { id: string; nome: string; codigo: string } | null;
  loja: { id: string; nome: string; plano: string; assinatura: string } | null;
  indicacao: {
    id: string;
    codigo: string;
    convertida_em: string;
    ativa: boolean;
    manual: boolean;
  } | null;
  fatura: {
    id: string;
    numero: string;
    status: string;
    subtotal_cents: number;
    desconto_cents: number;
    total_cents: number;
    pago_em: string | null;
    criada_em: string;
    provedor: string | null;
    itens: { tipo: string; descricao: string; quantidade: number | null; total_cents: number }[];
  } | null;
  pagamentos: {
    id: string;
    provedor: string;
    status: string;
    valor_cents: number;
    metodo: string | null;
    pago_em: string | null;
    referencia: string | null;
  }[];
  ajustes: {
    id: string;
    valor_cents: number;
    situacao: string;
    data: string;
    motivo: string | null;
  }[];
  saque: {
    id: string;
    situacao: string;
    valor_cents: number;
    pedido_em: string;
    pago_em: string | null;
  } | null;
  eventos: { tipo: string; data: string; admin: string | null; dados: Record<string, unknown> }[];
};

export type SaqueAdmin = {
  id: string;
  afiliado_id: string;
  afiliado: string;
  codigo: string;
  afiliado_status: SituacaoDoAfiliado;
  /** Celular do parceiro — a equipe fala com ele na hora do Pix. */
  telefone: string | null;
  /** Dia do repasse automático que montou este saque (nulo nos antigos, pedidos à mão). */
  ciclo: string | null;
  valor_cents: number;
  elegivel_cents: number;
  pix: string;
  pix_tipo: TipoDePix | null;
  pix_mudou: boolean;
  situacao: SituacaoDoSaque;
  pedido_em: string;
  aprovado_em: string | null;
  aprovado_por: string | null;
  pago_em: string | null;
  pago_por: string | null;
  recusado_em: string | null;
  recusado_por: string | null;
  referencia: string | null;
  notas: string | null;
  alertas: number;
};

export type EventoAdmin = {
  id: string;
  tipo: string;
  data: string;
  afiliado_id: string | null;
  afiliado: string | null;
  codigo: string | null;
  admin: string | null;
  usuario: string | null;
  dados: Record<string, unknown>;
};

export type BaseDaComissao = "cents_usage" | "recurring" | "invoice_total";

export type ConfiguracoesAdmin = {
  programa_ativo: boolean;
  comissao_bps: number;
  comissao_tipo: "recurring";
  duracao_meses: number | null;
  dias_para_liberar: number;
  saque_minimo_cents: number;
  /** `null` = sem prazo: o primeiro clique vale para sempre. */
  dias_do_link: number | null;
  base: BaseDaComissao;
  aprovacao_manual: boolean;
  dias_de_repasse: number[];
  atualizado_em: string;
  atualizado_por: string | null;
};

// ─── Leituras ─────────────────────────────────────────────────────────────

export const CHAVE_ADMIN = ["admin-afiliados"] as const;

const semTentarDeNovo = (falhas: number, erro: Error) =>
  falhas < 2 && !/somente_admin|situacao_invalida|periodo_invalido/.test(erro.message);

/** O mesmo resumo, fora de uma tela (para o lembrete de repasses). */
export function buscarResumoAdmin() {
  return chamar<ResumoAdmin>("afiliado_admin_resumo");
}

export function useResumoAdmin() {
  return useQuery<ResumoAdmin, Error>({
    queryKey: [...CHAVE_ADMIN, "resumo"],
    queryFn: () => chamar("afiliado_admin_resumo"),
    retry: semTentarDeNovo,
  });
}

export function useSerieAdmin(dias: PeriodoDoGrafico) {
  return useQuery<SerieAdmin, Error>({
    queryKey: [...CHAVE_ADMIN, "serie", dias],
    queryFn: () => chamar("afiliado_admin_serie", { p_dias: dias }),
    retry: semTentarDeNovo,
    placeholderData: keepPreviousData,
  });
}

export function useAfiliadosAdmin(f: {
  busca: string;
  status: SituacaoDoAfiliado | "";
  pagina: number;
}) {
  return useQuery<Pagina<AfiliadoNaLista>, Error>({
    queryKey: [...CHAVE_ADMIN, "afiliados", f],
    queryFn: () =>
      chamar("afiliado_admin_afiliados", {
        p_busca: f.busca || null,
        p_status: f.status || null,
        p_pagina: f.pagina,
        p_por_pagina: POR_PAGINA_ADMIN,
      }),
    retry: semTentarDeNovo,
    placeholderData: keepPreviousData,
  });
}

export function useFichaDoAfiliado(id: string) {
  return useQuery<FichaDoAfiliado | null, Error>({
    queryKey: [...CHAVE_ADMIN, "afiliado", id],
    queryFn: () => chamar("afiliado_admin_afiliado", { p_affiliate_id: id }),
    retry: semTentarDeNovo,
  });
}

export function useIndicacoesAdmin(f: {
  busca: string;
  situacao: SituacaoDaLoja | "";
  afiliadoId?: string;
  pagina: number;
}) {
  return useQuery<Pagina<IndicacaoAdmin>, Error>({
    queryKey: [...CHAVE_ADMIN, "indicacoes", f],
    queryFn: () =>
      chamar("afiliado_admin_indicacoes", {
        p_busca: f.busca || null,
        p_situacao: f.situacao || null,
        p_affiliate_id: f.afiliadoId ?? null,
        p_pagina: f.pagina,
        p_por_pagina: POR_PAGINA_ADMIN,
      }),
    retry: semTentarDeNovo,
    placeholderData: keepPreviousData,
  });
}

export function useComissoesAdmin(f: {
  status: SituacaoDaComissao | "";
  busca: string;
  afiliadoId?: string;
  pagina: number;
}) {
  return useQuery<Pagina<ComissaoAdmin>, Error>({
    queryKey: [...CHAVE_ADMIN, "comissoes", f],
    queryFn: () =>
      chamar("afiliado_admin_comissoes", {
        p_status: f.status || null,
        p_affiliate_id: f.afiliadoId ?? null,
        p_busca: f.busca || null,
        p_pagina: f.pagina,
        p_por_pagina: POR_PAGINA_ADMIN,
      }),
    retry: semTentarDeNovo,
    placeholderData: keepPreviousData,
  });
}

export function useInspecaoDeComissao(id: string | null) {
  return useQuery<InspecaoDeComissao | null, Error>({
    queryKey: [...CHAVE_ADMIN, "comissao", id],
    queryFn: () => chamar("afiliado_admin_comissao", { p_commission_id: id }),
    enabled: Boolean(id),
    retry: semTentarDeNovo,
  });
}

export function useSaquesAdmin(f: {
  status: SituacaoDoSaque | "open" | "";
  afiliadoId?: string;
  pagina: number;
}) {
  return useQuery<Pagina<SaqueAdmin>, Error>({
    queryKey: [...CHAVE_ADMIN, "saques", f],
    queryFn: () =>
      chamar("afiliado_admin_saques", {
        p_status: f.status || null,
        p_affiliate_id: f.afiliadoId ?? null,
        p_pagina: f.pagina,
        p_por_pagina: POR_PAGINA_ADMIN,
      }),
    retry: semTentarDeNovo,
    placeholderData: keepPreviousData,
  });
}

export function useEventosAdmin(f: { tipo: string; afiliadoId?: string; pagina: number }) {
  return useQuery<Pagina<EventoAdmin>, Error>({
    queryKey: [...CHAVE_ADMIN, "eventos", f],
    queryFn: () =>
      chamar("afiliado_admin_eventos", {
        p_tipo: f.tipo || null,
        p_affiliate_id: f.afiliadoId ?? null,
        p_pagina: f.pagina,
        p_por_pagina: 30,
      }),
    retry: semTentarDeNovo,
    placeholderData: keepPreviousData,
  });
}

export function useConfiguracoesAdmin() {
  return useQuery<ConfiguracoesAdmin, Error>({
    queryKey: [...CHAVE_ADMIN, "configuracoes"],
    queryFn: () => chamar("afiliado_admin_configuracoes"),
    retry: semTentarDeNovo,
  });
}

export function buscarLojasSemAfiliado(busca: string) {
  return chamar<{ id: string; nome: string; criado_em: string }[]>(
    "afiliado_admin_lojas_sem_afiliado",
    { p_busca: busca },
  );
}

// ─── Ações ────────────────────────────────────────────────────────────────

export function definirSituacaoDoAfiliado(
  id: string,
  status: "active" | "suspended" | "blocked",
  motivo: string | null,
) {
  return chamar<null>("afiliado_definir_status", {
    p_affiliate_id: id,
    p_status: status,
    p_motivo: motivo,
  });
}

/** `bps` nulo = voltar a usar a porcentagem padrão do programa. */
export function definirPorcentagem(id: string, bps: number | null) {
  return chamar<null>("afiliado_definir_taxa", { p_affiliate_id: id, p_bps: bps });
}

export function decidirSaque(
  id: string,
  decisao: "approve" | "pay" | "reject",
  notas: string | null,
  referencia: string | null,
) {
  return chamar<null>("afiliado_decidir_saque", {
    p_withdrawal_id: id,
    p_decisao: decisao,
    p_notas: notas,
    p_referencia: referencia,
  });
}

export function estornarComissao(id: string, motivo: string) {
  return chamar<null>("afiliado_admin_estornar_comissao", {
    p_commission_id: id,
    p_motivo: motivo,
  });
}

export function mudarSituacaoDaIndicacao(id: string, ativa: boolean, motivo: string) {
  return chamar<null>("afiliado_admin_situacao_indicacao", {
    p_referral_id: id,
    p_ativa: ativa,
    p_motivo: motivo,
  });
}

export function atribuirIndicacao(lojaId: string, afiliadoId: string, motivo: string) {
  return chamar<string>("afiliado_admin_atribuir_indicacao", {
    p_establishment_id: lojaId,
    p_affiliate_id: afiliadoId,
    p_motivo: motivo,
  });
}

export function salvarConfiguracoes(c: {
  programaAtivo: boolean;
  comissaoBps: number;
  duracaoMeses: number | null;
  diasParaLiberar: number;
  saqueMinimoCents: number;
  diasDoLink: number | null;
  base: BaseDaComissao;
  aprovacaoManual: boolean;
  diasDeRepasse: number[];
}) {
  return chamar<null>("afiliado_atualizar_configuracoes", {
    p_programa_ativo: c.programaAtivo,
    p_comissao_bps: c.comissaoBps,
    p_duracao_meses: c.duracaoMeses,
    p_dias_para_liberar: c.diasParaLiberar,
    p_saque_minimo_cents: c.saqueMinimoCents,
    p_dias_do_link: c.diasDoLink,
    p_base: c.base,
    p_aprovacao_manual: c.aprovacaoManual,
    p_dias_de_repasse: c.diasDeRepasse,
  });
}

export type ResultadoDosRepasses = {
  executado: boolean;
  data: string;
  repasses: number;
  valor_cents: number;
  abaixo_do_minimo: number;
  sem_pix: number;
  com_repasse_em_aberto: number;
  falhas: number;
};

/**
 * Monta os repasses de hoje na hora, sem esperar o robô. Serve para o dia em
 * que o robô falhar. Não duplica: um repasse por parceiro por dia, e quem já
 * tem repasse em aberto fica para depois.
 */
export function gerarRepassesAgora() {
  return chamar<ResultadoDosRepasses>("afiliado_admin_gerar_repasses");
}
