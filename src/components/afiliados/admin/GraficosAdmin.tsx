import { useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSerieAdmin } from "@/lib/afiliados/admin";
import type { PeriodoDoGrafico } from "@/lib/afiliados/portal";
import { PERIODOS, rotuloDoPonto } from "@/lib/afiliados/situacoes";
import { mensagemDeErro, reais } from "@/lib/afiliados/validacao";
import { cn } from "@/lib/utils";
import { Carregando, Erro } from "./PecasAdmin";

// Cinzas neutros que funcionam no tema claro e no escuro (o SVG do gráfico
// não entende as variáveis de cor do tema).
const GRADE = "rgba(128,128,128,0.18)";
const EIXO = { fill: "rgba(128,128,128,0.95)", fontSize: 11 };
const LARANJA = "#ff5a00";
const AZUL = "#008cff";

type Ponto = { rotulo: string; valor: number };

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
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums">{formato(payload[0].value)}</p>
    </div>
  );
}

function GraficoDeDinheiro({
  titulo,
  pontos,
  cor,
  id,
}: {
  titulo: string;
  pontos: Ponto[];
  cor: string;
  id: string;
}) {
  const total = pontos.reduce((t, p) => t + p.valor, 0);
  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{titulo}</CardTitle>
        <span className="text-sm font-semibold tabular-nums">{reais(total)}</span>
      </CardHeader>
      <CardContent className="h-56 pb-4" data-testid={`grafico-${id}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={pontos} margin={{ top: 6, right: 6, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id={`admin-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={cor} stopOpacity={0.35} />
                <stop offset="100%" stopColor={cor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRADE} vertical={false} />
            <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={false} minTickGap={18} />
            <YAxis
              tick={EIXO}
              tickLine={false}
              axisLine={false}
              width={52}
              allowDecimals={false}
              tickFormatter={(v: number) =>
                v >= 100000 ? `${Math.round(v / 100000)}mil` : `${Math.round(v / 100)}`
              }
            />
            <Tooltip content={<Dica formato={(v) => reais(v)} />} />
            <Area
              type="monotone"
              dataKey="valor"
              stroke={cor}
              strokeWidth={2}
              fill={`url(#admin-${id})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function GraficoDeContagem({
  titulo,
  pontos,
  cor,
  id,
}: {
  titulo: string;
  pontos: Ponto[];
  cor: string;
  id: string;
}) {
  const total = pontos.reduce((t, p) => t + p.valor, 0);
  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{titulo}</CardTitle>
        <span className="text-sm font-semibold tabular-nums">{total}</span>
      </CardHeader>
      <CardContent className="h-56 pb-4" data-testid={`grafico-${id}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={pontos} margin={{ top: 6, right: 6, left: -8, bottom: 0 }}>
            <CartesianGrid stroke={GRADE} vertical={false} />
            <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={false} minTickGap={18} />
            <YAxis tick={EIXO} tickLine={false} axisLine={false} width={52} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "rgba(128,128,128,0.08)" }}
              content={<Dica formato={(v) => String(v)} />}
            />
            <Bar dataKey="valor" fill={cor} radius={[4, 4, 0, 0]} maxBarSize={26} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/** Os quatro gráficos da Visão Geral, todos no mesmo recorte de tempo. */
export function GraficosAdmin() {
  const [dias, setDias] = useState<PeriodoDoGrafico>(30);
  const serie = useSerieAdmin(dias);

  const passo = serie.data?.passo ?? "day";
  const pontos = serie.data?.pontos ?? [];
  const eixo = (f: (p: (typeof pontos)[number]) => number): Ponto[] =>
    pontos.map((p) => ({ rotulo: rotuloDoPonto(p.inicio, passo), valor: f(p) }));
  const semNada =
    pontos.length > 0 &&
    pontos.every(
      (p) => !p.receita_cents && !p.comissoes_cents && !p.novos_afiliados && !p.novas_indicacoes,
    );

  return (
    <section className="space-y-3" aria-label="Gráficos">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Evolução</h2>
        <div
          role="tablist"
          aria-label="Período"
          className="flex w-max gap-1 rounded-lg bg-muted/50 p-1"
        >
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              role="tab"
              aria-selected={dias === p.dias}
              onClick={() => setDias(p.dias)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                dias === p.dias
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>

      {serie.isLoading ? (
        <Carregando linhas={4} />
      ) : serie.isError ? (
        <Erro mensagem={mensagemDeErro(serie.error)} tentarDeNovo={() => serie.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <GraficoDeDinheiro
              id="receita"
              titulo="Receita originada por afiliados"
              pontos={eixo((p) => p.receita_cents)}
              cor={AZUL}
            />
            <GraficoDeDinheiro
              id="comissoes"
              titulo="Comissões geradas"
              pontos={eixo((p) => p.comissoes_cents)}
              cor={LARANJA}
            />
            <GraficoDeContagem
              id="afiliados"
              titulo="Novos afiliados"
              pontos={eixo((p) => p.novos_afiliados)}
              cor={LARANJA}
            />
            <GraficoDeContagem
              id="indicacoes"
              titulo="Novas indicações"
              pontos={eixo((p) => p.novas_indicacoes)}
              cor={AZUL}
            />
          </div>
          {semNada ? (
            <p className="text-sm text-muted-foreground">
              Nada neste período ainda. Os gráficos se enchem conforme parceiros se cadastram,
              indicam lojas e essas lojas pagam.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
