/**
 * Administração — pacotes de impulsionamento e regras de cobrança.
 *
 * Criar, editar, desativar e reordenar pacotes (dias + preço). Preço é
 * digitado em reais e gravado em CENTAVOS inteiros.
 *
 * Mudar o preço vale só para contratações novas: cada contrato guarda o valor
 * que a loja aceitou, e é ele que vai para a fatura.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Save, Tags } from "lucide-react";
import { toast } from "sonner";
import { centavosDeTexto, textoDeCentavos } from "@/lib/flydelivery/campanhas";

type Pacote = {
  id: string;
  duration_days: number;
  label: string;
  price_cents: number;
  description: string | null;
  active: boolean;
  sort_order: number;
};

type Rascunho = {
  label: string;
  dias: string;
  preco: string;
  descricao: string;
  ordem: string;
  ativo: boolean;
};

type Regras = {
  refund_if_not_started: boolean;
  allow_during_trial: boolean;
  max_schedule_days: number;
};

const vazio: Rascunho = { label: "", dias: "", preco: "", descricao: "", ordem: "", ativo: true };

function rascunhoDe(p: Pacote): Rascunho {
  return {
    label: p.label,
    dias: String(p.duration_days),
    preco: textoDeCentavos(p.price_cents),
    descricao: p.description ?? "",
    ordem: String(p.sort_order),
    ativo: p.active,
  };
}

/** Confere o rascunho e devolve o que gravar — ou a mensagem do erro. */
function validar(
  r: Rascunho,
): { ok: true; linha: Omit<Pacote, "id"> } | { ok: false; erro: string } {
  const dias = Number(r.dias);
  if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
    return { ok: false, erro: "Dias: um número inteiro de 1 a 365." };
  }
  const centavos = centavosDeTexto(r.preco);
  if (centavos === null) return { ok: false, erro: "Preço inválido. Exemplo: 60,00" };
  if (!r.label.trim()) return { ok: false, erro: "Dê um nome ao pacote (ex.: 7 dias)." };
  const ordem = r.ordem.trim() === "" ? 0 : Number(r.ordem);
  if (!Number.isInteger(ordem)) return { ok: false, erro: "Ordem: um número inteiro." };
  return {
    ok: true,
    linha: {
      label: r.label.trim(),
      duration_days: dias,
      price_cents: centavos,
      description: r.descricao.trim() || null,
      sort_order: ordem,
      active: r.ativo,
    },
  };
}

function mensagemDoBanco(msg: string): string {
  if (msg.includes("duplicate") || msg.includes("unique")) {
    return "Já existe um pacote com esse número de dias.";
  }
  return msg;
}

export function PacotesAdmin() {
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({});
  const [novo, setNovo] = useState<Rascunho>(vazio);
  const [regras, setRegras] = useState<Regras | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [pl, rg] = await Promise.all([
      supabase
        .from("flydelivery_campaign_plans")
        .select("id, duration_days, label, price_cents, description, active, sort_order")
        .order("sort_order"),
      supabase
        .from("flydelivery_boost_settings")
        .select("refund_if_not_started, allow_during_trial, max_schedule_days")
        .maybeSingle(),
    ]);
    if (pl.error) toast.error("Erro ao carregar pacotes: " + pl.error.message);
    const lista = (pl.data ?? []) as Pacote[];
    setPacotes(lista);
    setRascunhos(Object.fromEntries(lista.map((p) => [p.id, rascunhoDe(p)])));
    setRegras((rg.data as Regras | null) ?? null);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const mudar = (id: string, patch: Partial<Rascunho>) =>
    setRascunhos((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  const salvar = async (p: Pacote) => {
    const v = validar(rascunhos[p.id]);
    if (!v.ok) {
      toast.error(v.erro);
      return;
    }
    setSalvando(p.id);
    const { error } = await supabase
      .from("flydelivery_campaign_plans")
      .update({ ...v.linha, updated_at: new Date().toISOString() })
      .eq("id", p.id);
    setSalvando(null);
    if (error) toast.error(mensagemDoBanco(error.message));
    else toast.success("Pacote salvo. Vale para contratações novas.");
    carregar();
  };

  const criar = async () => {
    const v = validar(novo);
    if (!v.ok) {
      toast.error(v.erro);
      return;
    }
    setSalvando("novo");
    const { error } = await supabase.from("flydelivery_campaign_plans").insert(v.linha);
    setSalvando(null);
    if (error) {
      toast.error(mensagemDoBanco(error.message));
      return;
    }
    toast.success("Pacote criado.");
    setNovo(vazio);
    carregar();
  };

  const salvarRegras = async (patch: Partial<Regras>) => {
    if (!regras) return;
    const proximas = { ...regras, ...patch };
    setRegras(proximas);
    const { error } = await supabase
      .from("flydelivery_boost_settings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) {
      toast.error("Não foi possível salvar: " + error.message);
      carregar();
    } else toast.success("Regra salva.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Tags className="h-5 w-5 text-primary" /> Pacotes de impulsionamento
        </CardTitle>
        <CardDescription>
          Preço em reais (ex.: 60,00). Mudar o preço vale só para contratações novas — quem já
          contratou continua com o valor que aceitou. Pacote desativado some da tela da loja.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {carregando ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {pacotes.map((p) => {
                const r = rascunhos[p.id];
                if (!r) return null;
                return (
                  <div
                    key={p.id}
                    className={`grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_5rem_7rem_4rem_auto_auto] sm:items-end ${
                      r.ativo ? "" : "opacity-60"
                    }`}
                  >
                    <Campo rotulo="Nome" className="col-span-2 sm:col-span-1">
                      <Input
                        value={r.label}
                        onChange={(e) => mudar(p.id, { label: e.target.value })}
                      />
                    </Campo>
                    <Campo rotulo="Dias">
                      <Input
                        inputMode="numeric"
                        value={r.dias}
                        onChange={(e) => mudar(p.id, { dias: e.target.value })}
                      />
                    </Campo>
                    <Campo rotulo="Preço (R$)">
                      <Input
                        inputMode="decimal"
                        value={r.preco}
                        onChange={(e) => mudar(p.id, { preco: e.target.value })}
                      />
                    </Campo>
                    <Campo rotulo="Ordem">
                      <Input
                        inputMode="numeric"
                        value={r.ordem}
                        onChange={(e) => mudar(p.id, { ordem: e.target.value })}
                      />
                    </Campo>
                    <label className="flex items-center gap-2 pb-2 text-sm">
                      <Switch
                        className="no-touch-min"
                        checked={r.ativo}
                        onCheckedChange={(v) => mudar(p.id, { ativo: v })}
                      />
                      Ativo
                    </label>
                    <Button
                      size="sm"
                      className="order-last col-span-2 sm:order-none sm:col-span-1"
                      disabled={salvando === p.id}
                      onClick={() => salvar(p)}
                    >
                      {salvando === p.id ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-1 h-4 w-4" />
                      )}
                      Salvar
                    </Button>
                    <Campo rotulo="Descrição (opcional)" className="col-span-2 sm:col-span-6">
                      <Input
                        value={r.descricao}
                        placeholder="Ex.: mais escolhido"
                        onChange={(e) => mudar(p.id, { descricao: e.target.value })}
                      />
                    </Campo>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-[1fr_5rem_7rem_4rem_auto] sm:items-end">
              <Campo rotulo="Novo pacote" className="col-span-2 sm:col-span-1">
                <Input
                  value={novo.label}
                  placeholder="Ex.: 10 dias"
                  onChange={(e) => setNovo({ ...novo, label: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Dias">
                <Input
                  inputMode="numeric"
                  value={novo.dias}
                  onChange={(e) => setNovo({ ...novo, dias: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Preço (R$)">
                <Input
                  inputMode="decimal"
                  value={novo.preco}
                  placeholder="0,00"
                  onChange={(e) => setNovo({ ...novo, preco: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Ordem">
                <Input
                  inputMode="numeric"
                  value={novo.ordem}
                  onChange={(e) => setNovo({ ...novo, ordem: e.target.value })}
                />
              </Campo>
              <Button
                size="sm"
                className="col-span-2 sm:col-span-1"
                disabled={salvando === "novo"}
                onClick={criar}
              >
                <Plus className="mr-1 h-4 w-4" /> Criar
              </Button>
            </div>

            {regras ? (
              <div className="space-y-3 rounded-lg bg-muted/50 p-3 text-sm">
                <p className="font-semibold">Regras de cobrança</p>
                <label className="flex items-start justify-between gap-3">
                  <span>
                    Cancelou <strong>antes de começar</strong>: não cobrar
                    <span className="block text-xs text-muted-foreground">
                      Depois que o anúncio começou, a cobrança nunca é cancelada sozinha.
                    </span>
                  </span>
                  <Switch
                    className="no-touch-min shrink-0"
                    checked={regras.refund_if_not_started}
                    onCheckedChange={(v) => salvarRegras({ refund_if_not_started: v })}
                  />
                </label>
                <label className="flex items-start justify-between gap-3">
                  <span>
                    Loja no <strong>período grátis</strong> pode impulsionar
                    <span className="block text-xs text-muted-foreground">
                      O valor entra na primeira fatura depois do período grátis.
                    </span>
                  </span>
                  <Switch
                    className="no-touch-min shrink-0"
                    checked={regras.allow_during_trial}
                    onCheckedChange={(v) => salvarRegras({ allow_during_trial: v })}
                  />
                </label>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="max-agenda">Agendar o início para até (dias)</Label>
                  <Input
                    id="max-agenda"
                    inputMode="numeric"
                    className="h-8 w-20"
                    defaultValue={regras.max_schedule_days}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (
                        Number.isInteger(v) &&
                        v >= 0 &&
                        v <= 365 &&
                        v !== regras.max_schedule_days
                      ) {
                        salvarRegras({ max_schedule_days: v });
                      }
                    }}
                  />
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Campo({
  rotulo,
  className,
  children,
}: {
  rotulo: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <span className="text-xs text-muted-foreground">{rotulo}</span>
      {children}
    </div>
  );
}
