/**
 * Tudo o que o portal do afiliado pede ao banco, num lugar só.
 *
 * Nenhuma chamada daqui manda "qual afiliado" — o banco descobre pela sessão
 * de quem está logado (ver 20260924120000_portal_do_afiliado.sql). Não
 * existe parâmetro para trocar, então não há o que forjar.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RegrasPublicas, TipoDePix } from "./validacao";

export type SituacaoDoAfiliado = "pending" | "active" | "suspended" | "blocked";

export type PerfilDoAfiliado = {
  nome: string;
  email: string;
  telefone: string | null;
  pix_tipo: TipoDePix | null;
  pix_chave: string | null;
  codigo: string;
  status: SituacaoDoAfiliado;
  criado_em: string;
  comissao_bps: number;
  comissao_tipo: "recurring";
  comissao_meses: number | null;
  dias_para_liberar: number;
  saque_minimo_cents: number;
  programa_ativo: boolean;
  /** Dias do mês em que o repasse é montado, ex.: [10, 20]. */
  dias_de_repasse: number[];
};

export type ResumoDoAfiliado = {
  disponivel_cents: number;
  pendente_cents: number;
  solicitado_cents: number;
  recebido_cents: number;
  acumulado_cents: number;
  receita_gerada_cents: number;
  clientes_ativos: number;
  total_indicacoes: number;
  cliques: number;
  conversao_milesimos: number | null;
  comissao_bps: number;
  comissao_tipo: "recurring";
  comissao_meses: number | null;
};

export type PeriodoDoGrafico = 7 | 30 | 90 | 180 | 365;

export type SerieDoAfiliado = {
  passo: "day" | "week" | "month";
  pontos: { inicio: string; ganhos_cents: number; indicacoes: number }[];
};

export type SituacaoDaLoja = "CADASTRADO" | "ATIVO" | "INADIMPLENTE" | "CANCELADO";

export type Pagina<T> = { total: number; pagina: number; por_pagina: number; itens: T[] };

export type Indicacao = {
  id: string;
  loja: string;
  data: string;
  situacao: SituacaoDaLoja;
  receita_cents: number;
  comissao_cents: number;
};

export type SituacaoDaComissao = "pending" | "available" | "requested" | "paid" | "reversed";

export type Comissao = {
  id: string;
  data: string;
  loja: string;
  tipo: "commission" | "adjustment";
  valor_elegivel_cents: number;
  bps: number;
  comissao_cents: number;
  situacao: SituacaoDaComissao;
  libera_em: string | null;
};

export type SituacaoDoSaque = "requested" | "approved" | "paid" | "rejected";

export type Saque = {
  id: string;
  valor_cents: number;
  pix_final: string | null;
  situacao: SituacaoDoSaque;
  pedido_em: string;
  aprovado_em: string | null;
  pago_em: string | null;
  recusado_em: string | null;
  motivo: string | null;
};

export type Material = {
  id: string;
  kind: "banner" | "story" | "post" | "logo" | "video" | "copy" | "link";
  title: string;
  description: string | null;
  file_url: string | null;
  body_text: string | null;
  target_path: string | null;
};

/**
 * As funções do programa são mais novas que os tipos gerados do banco.
 * Mesmo molde usado em outros pontos do projeto: o cast some quando os
 * tipos forem regerados.
 */
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

// ─── Leituras ─────────────────────────────────────────────────────────────

export const chaves = {
  perfil: ["afiliado", "perfil"] as const,
  resumo: ["afiliado", "resumo"] as const,
  serie: (dias: PeriodoDoGrafico) => ["afiliado", "serie", dias] as const,
  indicacoes: (f: FiltroDeIndicacoes) => ["afiliado", "indicacoes", f] as const,
  comissoes: (f: FiltroDeComissoes) => ["afiliado", "comissoes", f] as const,
  saques: (pagina: number) => ["afiliado", "saques", pagina] as const,
  materiais: ["afiliado", "materiais"] as const,
};

/**
 * Situação de conta não se resolve tentando de novo: "em análise" continua
 * "em análise" na segunda tentativa. Só erro de rede merece nova tentativa.
 */
const tentarDeNovo = (falhas: number, erro: Error) =>
  falhas < 2 && !/^(afiliado_|nao_afiliado|nao_autenticado)/.test(erro.message);

type Opcoes<T> = Omit<UseQueryOptions<T, Error>, "queryKey" | "queryFn">;

export function usePerfilDoAfiliado(
  userId: string | null | undefined,
  opcoes?: Opcoes<PerfilDoAfiliado | null>,
) {
  return useQuery<PerfilDoAfiliado | null, Error>({
    queryKey: [...chaves.perfil, userId],
    queryFn: () => chamar<PerfilDoAfiliado | null>("afiliado_meu_perfil"),
    enabled: Boolean(userId),
    retry: tentarDeNovo,
    ...opcoes,
  });
}

export function useResumoDoAfiliado() {
  return useQuery<ResumoDoAfiliado, Error>({
    queryKey: chaves.resumo,
    queryFn: () => chamar<ResumoDoAfiliado>("afiliado_meu_resumo"),
    retry: tentarDeNovo,
  });
}

export function useSerieDoAfiliado(dias: PeriodoDoGrafico) {
  return useQuery<SerieDoAfiliado, Error>({
    queryKey: chaves.serie(dias),
    queryFn: () => chamar<SerieDoAfiliado>("afiliado_minha_serie", { p_dias: dias }),
    retry: tentarDeNovo,
    placeholderData: (anterior) => anterior,
  });
}

export type FiltroDeIndicacoes = { busca: string; situacao: SituacaoDaLoja | ""; pagina: number };

export function useIndicacoes(f: FiltroDeIndicacoes) {
  return useQuery<Pagina<Indicacao>, Error>({
    queryKey: chaves.indicacoes(f),
    queryFn: () =>
      chamar<Pagina<Indicacao>>("afiliado_minhas_indicacoes", {
        p_busca: f.busca || null,
        p_situacao: f.situacao || null,
        p_pagina: f.pagina,
        p_por_pagina: POR_PAGINA,
      }),
    retry: tentarDeNovo,
    placeholderData: (anterior) => anterior,
  });
}

export type FiltroDeComissoes = {
  situacao: SituacaoDaComissao | "";
  dias: PeriodoDoGrafico | null;
  pagina: number;
};

export function useComissoes(f: FiltroDeComissoes) {
  return useQuery<Pagina<Comissao>, Error>({
    queryKey: chaves.comissoes(f),
    queryFn: () =>
      chamar<Pagina<Comissao>>("afiliado_minhas_comissoes", {
        p_situacao: f.situacao || null,
        p_dias: f.dias,
        p_pagina: f.pagina,
        p_por_pagina: POR_PAGINA,
      }),
    retry: tentarDeNovo,
    placeholderData: (anterior) => anterior,
  });
}

export function useSaques(pagina: number) {
  return useQuery<Pagina<Saque>, Error>({
    queryKey: chaves.saques(pagina),
    queryFn: () =>
      chamar<Pagina<Saque>>("afiliado_meus_saques", { p_pagina: pagina, p_por_pagina: POR_PAGINA }),
    retry: tentarDeNovo,
    placeholderData: (anterior) => anterior,
  });
}

type TabelaSolta = {
  from: (t: "affiliate_materials") => {
    select: (c: string) => {
      order: (
        c: string,
        o: { ascending: boolean },
      ) => {
        order: (
          c: string,
          o: { ascending: boolean },
        ) => Promise<{ data: Material[] | null; error: { message: string } | null }>;
      };
    };
  };
};

/** Materiais publicados. A regra de acesso do banco só entrega a afiliado ativo. */
export function useMateriais() {
  return useQuery<Material[], Error>({
    queryKey: chaves.materiais,
    queryFn: async () => {
      const db = supabase as unknown as TabelaSolta;
      const { data, error } = await db
        .from("affiliate_materials")
        .select("id, kind, title, description, file_url, body_text, target_path")
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export const POR_PAGINA = 10;

/** As regras gerais do programa, abertas a qualquer visitante. */
export function useRegrasPublicas() {
  return useQuery<RegrasPublicas | null, Error>({
    queryKey: ["afiliado", "regras"],
    queryFn: () => chamar<RegrasPublicas | null>("afiliado_regras_publicas"),
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Ações ────────────────────────────────────────────────────────────────

export function atualizarMeusDados(d: {
  nome: string;
  telefone: string | null;
  pixTipo: TipoDePix | null;
  pixChave: string | null;
}) {
  return chamar<null>("afiliado_atualizar_meus_dados", {
    p_nome: d.nome,
    p_telefone: d.telefone,
    p_pix_tipo: d.pixTipo,
    p_pix_chave: d.pixChave,
  });
}
