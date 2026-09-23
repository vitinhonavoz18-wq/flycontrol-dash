import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Carregando,
  Erro,
  Paginacao,
  Painel,
  Seletor,
  Selo,
  TituloDaPagina,
  Vazio,
} from "@/components/afiliados/portal/Pecas";
import {
  POR_PAGINA,
  useComissoes,
  type Comissao,
  type PeriodoDoGrafico,
  type SituacaoDaComissao,
} from "@/lib/afiliados/portal";
import { PERIODOS, SITUACAO_DA_COMISSAO } from "@/lib/afiliados/situacoes";
import { dataCurta, mensagemDeErro, porcentagemDeBps, reais } from "@/lib/afiliados/validacao";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/affiliates/dashboard/commissions")({ component: Comissoes });

/**
 * O extrato. Só leitura: não existe botão de editar, e o banco não aceita
 * alteração de ninguém de fora — nem se alguém tentar pelo navegador.
 */
function Comissoes() {
  const [situacao, setSituacao] = useState<SituacaoDaComissao | "">("");
  const [dias, setDias] = useState<PeriodoDoGrafico | null>(null);
  const [pagina, setPagina] = useState(1);
  const consulta = useComissoes({ situacao, dias, pagina });
  const filtrando = Boolean(situacao || dias);

  return (
    <div>
      <TituloDaPagina
        titulo="Comissões"
        texto="Cada pagamento dos seus indicados, e quanto ele rendeu para você."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:flex">
        <Seletor
          rotulo="Filtrar por situação"
          valor={situacao}
          aoMudar={(v) => {
            setSituacao(v as SituacaoDaComissao | "");
            setPagina(1);
          }}
          className="sm:w-52"
          opcoes={[
            { valor: "", rotulo: "Todas" },
            ...(Object.keys(SITUACAO_DA_COMISSAO) as SituacaoDaComissao[]).map((s) => ({
              valor: s,
              rotulo: SITUACAO_DA_COMISSAO[s].rotulo,
            })),
          ]}
        />
        <Seletor
          rotulo="Filtrar por período"
          valor={dias ? String(dias) : ""}
          aoMudar={(v) => {
            setDias(v ? (Number(v) as PeriodoDoGrafico) : null);
            setPagina(1);
          }}
          className="sm:w-44"
          opcoes={[
            { valor: "", rotulo: "Todo o período" },
            ...PERIODOS.map((p) => ({ valor: String(p.dias), rotulo: `Últimos ${p.rotulo}` })),
          ]}
        />
      </div>

      {consulta.isLoading ? (
        <Carregando linhas={5} />
      ) : consulta.isError ? (
        <Erro mensagem={mensagemDeErro(consulta.error)} tentarDeNovo={() => consulta.refetch()} />
      ) : !consulta.data || consulta.data.itens.length === 0 ? (
        filtrando ? (
          <Vazio titulo="Nada encontrado" texto="Nenhuma comissão com esses filtros." />
        ) : (
          <Vazio
            titulo="Nenhuma comissão ainda"
            texto="A comissão aparece aqui quando um restaurante indicado paga a fatura do FlyControl."
          />
        )
      ) : (
        <>
          <Painel className="hidden overflow-hidden p-0 sm:p-0 md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-left text-[11px] uppercase tracking-[0.12em] text-white/45">
                  <th className="px-5 py-3 font-medium">Data</th>
                  <th className="px-5 py-3 font-medium">Estabelecimento</th>
                  <th className="px-5 py-3 text-right font-medium">Valor elegível</th>
                  <th className="px-5 py-3 text-right font-medium">Percentual</th>
                  <th className="px-5 py-3 text-right font-medium">Comissão</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {consulta.data.itens.map((c) => (
                  <tr key={c.id} className="border-b border-white/[0.05] last:border-0">
                    <td className="px-5 py-4 text-white/65 tabular-nums">{dataCurta(c.data)}</td>
                    <td className="max-w-[16rem] px-5 py-4">
                      <p className="truncate font-medium text-white">{c.loja}</p>
                      {c.tipo === "adjustment" ? (
                        <p className="text-xs text-white/45">Ajuste de estorno</p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-right text-white/75 tabular-nums">
                      {c.tipo === "adjustment" ? "—" : reais(c.valor_elegivel_cents)}
                    </td>
                    <td className="px-5 py-4 text-right text-white/75 tabular-nums">
                      {porcentagemDeBps(c.bps)}
                    </td>
                    <td
                      className={cn(
                        "px-5 py-4 text-right font-semibold tabular-nums",
                        c.comissao_cents < 0 ? "text-red-400" : "text-white",
                      )}
                    >
                      {reais(c.comissao_cents)}
                    </td>
                    <td className="px-5 py-4">
                      <SeloDaComissao c={c} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Painel>

          <ul className="space-y-3 md:hidden">
            {consulta.data.itens.map((c) => (
              <li key={c.id} className="rounded-[16px] border border-white/[0.08] bg-[#0a0a0a] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-medium text-white">{c.loja}</p>
                    <p className="mt-0.5 text-xs text-white/45">
                      {dataCurta(c.data)}
                      {c.tipo === "adjustment" ? " · Ajuste de estorno" : ""}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "shrink-0 text-lg font-semibold tabular-nums",
                      c.comissao_cents < 0 ? "text-red-400" : "text-white",
                    )}
                  >
                    {reais(c.comissao_cents)}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3 text-xs text-white/55">
                  <span className="tabular-nums">
                    {c.tipo === "adjustment"
                      ? "Devolução de comissão já paga"
                      : `${porcentagemDeBps(c.bps)} de ${reais(c.valor_elegivel_cents)}`}
                  </span>
                  <SeloDaComissao c={c} />
                </div>
              </li>
            ))}
          </ul>

          <Paginacao
            pagina={pagina}
            total={consulta.data.total}
            porPagina={POR_PAGINA}
            aoMudar={setPagina}
          />
        </>
      )}
    </div>
  );
}

function SeloDaComissao({ c }: { c: Comissao }) {
  const s = SITUACAO_DA_COMISSAO[c.situacao];
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Selo tom={s.tom}>{s.rotulo}</Selo>
      {c.situacao === "pending" && c.libera_em ? (
        <span className="text-[11px] text-white/40">libera {dataCurta(c.libera_em)}</span>
      ) : null}
    </span>
  );
}
