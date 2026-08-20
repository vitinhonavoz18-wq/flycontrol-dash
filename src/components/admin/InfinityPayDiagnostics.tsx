/**
 * Painel de diagnóstico da integração automática com a InfinityPay.
 *
 * Responde, com um clique, à pergunta "por que um cadastro não está
 * ativando sozinho" — sem precisar abrir log de servidor.
 */

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getInfinityPayDiagnostics,
  type InfinityPayDiagnostics as Diagnostics,
} from "@/lib/billing/infinitypay/diagnostics.functions";

export function InfinityPayDiagnostics() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Diagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const data = await getInfinityPayDiagnostics();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível verificar agora.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="space-y-1">
          <h2 className="font-bold">Diagnóstico da integração automática</h2>
          <p className="text-sm text-muted-foreground">
            Confere, na hora, se o servidor está enxergando a configuração da InfinityPay — sem
            precisar mexer em log nenhum.
          </p>
        </div>

        <Button onClick={() => void run()} disabled={loading} className="h-11 gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
          Testar agora
        </Button>

        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {result && (
          <div className="space-y-2">
            <DiagnosticRow
              ok={result.handleConfigured}
              label="INFINITYPAY_HANDLE"
              detail={
                result.handleConfigured
                  ? `Configurada (${result.handlePreview}).`
                  : "Não encontrada no servidor. Confira se foi salva no ambiente Production."
              }
            />
            <DiagnosticRow
              ok={result.publicUrlConfigured}
              label="FLYCONTROL_PUBLIC_URL"
              detail={
                result.publicUrlConfigured
                  ? `Configurada (${result.publicUrl}).`
                  : "Não encontrada no servidor. Sem ela, o modo automático não liga."
              }
            />
            {result.connectionTest && (
              <DiagnosticRow
                ok={result.connectionTest.ok}
                label="Conexão com a InfinityPay"
                detail={result.connectionTest.detail}
              />
            )}
            {!result.handleConfigured && (
              <p className="text-sm text-muted-foreground">
                Sem a InfiniteTag configurada, o teste de conexão nem é tentado — é a primeira coisa
                a corrigir.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DiagnosticRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
        ok ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      )}
      <div>
        <p className="font-medium text-foreground">{label}</p>
        <p className="text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
