import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Carregando,
  Erro,
  Paginacao,
  Painel,
  Seletor,
  Selo,
  TituloDaPagina,
  Vazio,
  classeDoCampo,
} from "@/components/afiliados/portal/Pecas";
import { useIndicacoes, POR_PAGINA, type SituacaoDaLoja } from "@/lib/afiliados/portal";
import { SITUACAO_DA_LOJA } from "@/lib/afiliados/situacoes";
import { dataCurta, mensagemDeErro, reais } from "@/lib/afiliados/validacao";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/affiliates/dashboard/referrals")({ component: Indicacoes });

/**
 * As lojas que chegaram pelo link do parceiro. Mostra só o nome da loja, a
 * data, a situação e os valores — nada de dono, telefone, e-mail ou
 * endereço. O banco nem entrega esses dados para esta tela.
 */
function Indicacoes() {
  const [digitado, setDigitado] = useState("");
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<SituacaoDaLoja | "">("");
  const [pagina, setPagina] = useState(1);

  // Espera a pessoa parar de digitar antes de buscar — uma consulta por
  // palavra, não uma por letra.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setBusca(digitado.trim());
      setPagina(1);
    }, 350);
    return () => window.clearTimeout(t);
  }, [digitado]);

  const consulta = useIndicacoes({ busca, situacao, pagina });
  const filtrando = Boolean(busca || situacao);

  return (
    <div>
      <TituloDaPagina titulo="Indicações" texto="Restaurantes que criaram a conta pelo seu link." />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Buscar estabelecimento</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/35" />
          <input
            type="search"
            placeholder="Buscar estabelecimento"
            value={digitado}
            onChange={(e) => setDigitado(e.target.value)}
            className={cn(classeDoCampo, "rounded-full pl-10")}
          />
        </label>
        <Seletor
          rotulo="Filtrar por situação"
          valor={situacao}
          aoMudar={(v) => {
            setSituacao(v as SituacaoDaLoja | "");
            setPagina(1);
          }}
          className="sm:w-52"
          opcoes={[
            { valor: "", rotulo: "Todas as situações" },
            ...(Object.keys(SITUACAO_DA_LOJA) as SituacaoDaLoja[]).map((s) => ({
              valor: s,
              rotulo: SITUACAO_DA_LOJA[s].rotulo,
            })),
          ]}
        />
      </div>

      {consulta.isLoading ? (
        <Carregando linhas={5} />
      ) : consulta.isError ? (
        <Erro mensagem={mensagemDeErro(consulta.error)} tentarDeNovo={() => consulta.refetch()} />
      ) : !consulta.data || consulta.data.itens.length === 0 ? (
        filtrando ? (
          <Vazio titulo="Nada encontrado" texto="Nenhuma indicação com esse nome ou situação." />
        ) : (
          <Vazio
            titulo="Nenhuma indicação ainda"
            texto="Compartilhe seu link. Cada restaurante que criar a conta por ele aparece aqui."
          />
        )
      ) : (
        <>
          {/* Computador: tabela. */}
          <Painel className="hidden overflow-hidden p-0 sm:p-0 md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-left text-[11px] uppercase tracking-[0.12em] text-white/45">
                  <th className="px-5 py-3 font-medium">Estabelecimento</th>
                  <th className="px-5 py-3 font-medium">Data</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Receita elegível</th>
                  <th className="px-5 py-3 text-right font-medium">Comissão acumulada</th>
                </tr>
              </thead>
              <tbody>
                {consulta.data.itens.map((i) => (
                  <tr key={i.id} className="border-b border-white/[0.05] last:border-0">
                    <td className="max-w-[18rem] truncate px-5 py-4 font-medium text-white">
                      {i.loja}
                    </td>
                    <td className="px-5 py-4 text-white/65 tabular-nums">{dataCurta(i.data)}</td>
                    <td className="px-5 py-4">
                      <span title={SITUACAO_DA_LOJA[i.situacao].explica}>
                        <Selo tom={SITUACAO_DA_LOJA[i.situacao].tom}>
                          {SITUACAO_DA_LOJA[i.situacao].rotulo}
                        </Selo>
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right text-white/80 tabular-nums">
                      {reais(i.receita_cents)}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold text-white tabular-nums">
                      {reais(i.comissao_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Painel>

          {/* Celular: um cartão por loja, sem rolagem de lado. */}
          <ul className="space-y-3 md:hidden">
            {consulta.data.itens.map((i) => (
              <li key={i.id} className="rounded-[16px] border border-white/[0.08] bg-[#0a0a0a] p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 break-words font-medium text-white">{i.loja}</p>
                  <Selo tom={SITUACAO_DA_LOJA[i.situacao].tom}>
                    {SITUACAO_DA_LOJA[i.situacao].rotulo}
                  </Selo>
                </div>
                <p className="mt-1 text-xs text-white/45">Indicado em {dataCurta(i.data)}</p>
                <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-3">
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.1em] text-white/40">
                      Receita elegível
                    </dt>
                    <dd className="mt-0.5 text-sm text-white/85 tabular-nums">
                      {reais(i.receita_cents)}
                    </dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-[11px] uppercase tracking-[0.1em] text-white/40">
                      Comissão
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold text-white tabular-nums">
                      {reais(i.comissao_cents)}
                    </dd>
                  </div>
                </dl>
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
