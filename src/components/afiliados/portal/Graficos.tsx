import { useId, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  useSerieDoAfiliado,
  type PeriodoDoGrafico,
  type SerieDoAfiliado,
} from "@/lib/afiliados/portal";
import { PERIODOS, rotuloDoPonto } from "@/lib/afiliados/situacoes";
import { mensagemDeErro, reais } from "@/lib/afiliados/validacao";
import { cn } from "@/lib/utils";
import { Carregando, Erro, Painel } from "./Pecas";

export function SeletorDePeriodo({
  valor,
  aoMudar,
}: {
  valor: PeriodoDoGrafico;
  aoMudar: (d: PeriodoDoGrafico) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Período"
      className="grid w-full grid-cols-5 gap-0.5 rounded-full border border-white/10 bg-[#0d0d0d] p-1 sm:flex sm:w-auto sm:gap-1"
    >
      {PERIODOS.map((p) => (
        <button
          key={p.dias}
          type="button"
          role="tab"
          aria-selected={valor === p.dias}
          onClick={() => aoMudar(p.dias)}
          className={cn(
            "h-9 min-w-0 whitespace-nowrap rounded-full px-1 text-[11px] font-medium transition-colors sm:px-3 sm:text-xs",
            valor === p.dias ? "bg-white text-black" : "text-white/60 hover:text-white",
          )}
        >
          {p.rotulo}
        </button>
      ))}
    </div>
  );
}

function Dica({
  active,
  payload,
  label,
  formato,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  formato: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[10px] border border-white/10 bg-black/95 px-3 py-2 text-xs shadow-xl">
      <p className="text-white/50">{label}</p>
      <p className="mt-0.5 font-semibold text-white tabular-nums">{formato(payload[0].value)}</p>
    </div>
  );
}

/**
 * Os dois gráficos do painel, com um seletor de período só: ganhar mais num
 * mês costuma andar junto com indicar mais — faz sentido olhar os dois no
 * mesmo recorte.
 */
export function GraficosDoAfiliado() {
  const [dias, setDias] = useState<PeriodoDoGrafico>(30);
  const serie = useSerieDoAfiliado(dias);
  const gradiente = useId().replace(/:/g, "");

  const pontos =
    serie.data?.pontos.map((p) => ({
      rotulo: rotuloDoPonto(p.inicio, serie.data.passo),
      ganhos: p.ganhos_cents,
      indicacoes: p.indicacoes,
    })) ?? [];
  const semNada = pontos.length > 0 && pontos.every((p) => p.ganhos === 0 && p.indicacoes === 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-medium">Desempenho</h2>
        <SeletorDePeriodo valor={dias} aoMudar={setDias} />
      </div>

      {serie.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Carregando linhas={1} altura="h-72" />
          <Carregando linhas={1} altura="h-72" />
        </div>
      ) : serie.isError ? (
        <Erro mensagem={mensagemDeErro(serie.error)} tentarDeNovo={() => serie.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Painel>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/50">
                Ganhos
              </h3>
              <span className="text-sm font-semibold text-white tabular-nums">
                {reais(pontos.reduce((t, p) => t + p.ganhos, 0))}
              </span>
            </div>
            <div className="mt-4 h-56 w-full sm:h-64" data-testid="grafico-ganhos">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pontos} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`g-${gradiente}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff5a00" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#ff5a00" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="rotulo"
                    tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={18}
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={(v: number) =>
                      v >= 100000 ? `${Math.round(v / 100000)}mil` : `${Math.round(v / 100)}`
                    }
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ stroke: "rgba(255,255,255,0.15)" }}
                    content={<Dica formato={(v) => reais(v)} />}
                  />
                  <Area
                    type="monotone"
                    dataKey="ganhos"
                    stroke="#ff5a00"
                    strokeWidth={2}
                    fill={`url(#g-${gradiente})`}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Painel>

          <Painel>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/50">
                Novas indicações
              </h3>
              <span className="text-sm font-semibold text-white tabular-nums">
                {pontos.reduce((t, p) => t + p.indicacoes, 0)}
              </span>
            </div>
            <div className="mt-4 h-56 w-full sm:h-64" data-testid="grafico-indicacoes">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pontos} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="rotulo"
                    tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={18}
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    content={
                      <Dica formato={(v) => `${v} ${v === 1 ? "indicação" : "indicações"}`} />
                    }
                  />
                  <Bar dataKey="indicacoes" fill="#008cff" radius={[6, 6, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Painel>
          {semNada ? (
            <p className="text-sm text-white/45 lg:col-span-2">
              Nenhum ganho nem indicação neste período ainda. Os gráficos se enchem conforme seus
              indicados se cadastram e pagam.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
