import { useEffect, useState } from "react";
import { Copy, Loader2, MessageCircle, Pencil, ShoppingBag, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatPhoneForDisplay } from "@/lib/marketing/phone";
import type { ConversaCrm } from "@/lib/crm/crm.functions";

/**
 * A FICHA DO CLIENTE, ao lado da conversa.
 *
 * Atender sabendo que do outro lado está alguém que já pediu 14 vezes, que é
 * alérgico a amendoim e que prefere entrega pelo portão de trás é outro
 * atendimento. Antes isso ficava na cabeça de quem atendeu da última vez —
 * e ia embora junto com ela no fim do turno.
 *
 * AS ETIQUETAS SÃO AS MESMAS DO MARKETING. Marcar alguém como "vip" aqui faz
 * ele aparecer no filtro "vip" na hora de montar campanha. É uma ficha só,
 * escrita de qualquer um dos dois lados.
 */

const SUGESTOES = ["vip", "reclamação", "atacado", "novo"];

function dinheiro(centavos: number): string {
  // Dinheiro é guardado em centavos inteiros; a divisão só acontece aqui, na
  // hora de mostrar.
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function PainelCliente({
  conversa,
  onSalvar,
  onCorrigirNome,
  onFechar,
}: {
  conversa: ConversaCrm;
  onSalvar: (mudanca: { tags?: string[]; notes?: string }) => Promise<void>;
  onCorrigirNome: () => void;
  /** Só existe quando a ficha abre como gaveta (celular/notebook). */
  onFechar?: () => void;
}) {
  const c = conversa.contato;
  const [novaEtiqueta, setNovaEtiqueta] = useState("");
  const [notas, setNotas] = useState(c?.notes ?? "");
  const [salvando, setSalvando] = useState(false);

  // Trocar de conversa traz a anotação do outro cliente.
  useEffect(() => {
    setNotas(c?.notes ?? "");
    setNovaEtiqueta("");
  }, [c?.id, c?.notes]);

  if (!c) return null;

  const etiquetas = c.tags ?? [];
  const telefone = c.phone_e164 ?? "";
  const titulo = c.name?.trim() || formatPhoneForDisplay(telefone) || "Sem nome";
  const notasMudaram = (notas ?? "") !== (c.notes ?? "");

  async function salvar(mudanca: { tags?: string[]; notes?: string }) {
    setSalvando(true);
    try {
      await onSalvar(mudanca);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a ficha.");
    } finally {
      setSalvando(false);
    }
  }

  function adicionar(texto: string) {
    const t = texto.trim().slice(0, 30);
    if (!t || etiquetas.some((e) => e.toLowerCase() === t.toLowerCase())) {
      setNovaEtiqueta("");
      return;
    }
    if (etiquetas.length >= 20) {
      toast.error("Máximo de 20 etiquetas por cliente.");
      return;
    }
    setNovaEtiqueta("");
    void salvar({ tags: [...etiquetas, t] });
  }

  return (
    <aside className="flex h-full min-h-0 flex-col bg-card" aria-label="Ficha do cliente">
      <div className="flex shrink-0 items-center justify-between border-b-2 border-border px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Ficha do cliente
        </p>
        {onFechar && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onFechar}
            aria-label="Fechar ficha"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <div className="flex items-center gap-3">
          {c.avatar_url ? (
            <img
              src={c.avatar_url}
              alt=""
              className="h-14 w-14 rounded-full border border-border object-cover"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          ) : (
            <span className="grid h-14 w-14 place-items-center rounded-full border border-border bg-muted text-lg font-bold">
              {titulo.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <button
              type="button"
              onClick={onCorrigirNome}
              className="group flex items-center gap-1.5 text-left"
              title="Corrigir o nome"
            >
              <span className="truncate font-bold group-hover:underline">{titulo}</span>
              <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
            <p className="text-sm text-muted-foreground">{formatPhoneForDisplay(telefone)}</p>
            <div className="mt-1 flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(telefone)
                    .then(() => toast.success("Telefone copiado."))
                    .catch(() => toast.error("Não consegui copiar."));
                }}
              >
                <Copy className="mr-1 h-3 w-3" aria-hidden="true" />
                Copiar
              </Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" asChild>
                <a href={`https://wa.me/${telefone}`} target="_blank" rel="noreferrer">
                  <MessageCircle className="mr-1 h-3 w-3" aria-hidden="true" />
                  WhatsApp
                </a>
              </Button>
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg border border-border p-2.5">
            <dt className="flex items-center gap-1 text-[11px] font-bold uppercase text-muted-foreground">
              <ShoppingBag className="h-3 w-3" aria-hidden="true" /> Pedidos
            </dt>
            <dd className="mt-0.5 font-bold">{c.orders_count ?? 0}</dd>
          </div>
          <div className="rounded-lg border border-border p-2.5">
            <dt className="text-[11px] font-bold uppercase text-muted-foreground">Já gastou</dt>
            <dd className="mt-0.5 font-bold">{dinheiro(c.total_spent_cents ?? 0)}</dd>
          </div>
          <div className="rounded-lg border border-border p-2.5">
            <dt className="text-[11px] font-bold uppercase text-muted-foreground">Último pedido</dt>
            <dd className="mt-0.5 font-semibold">
              {c.last_order_at ? new Date(c.last_order_at).toLocaleDateString("pt-BR") : "—"}
            </dd>
          </div>
          <div className="rounded-lg border border-border p-2.5">
            <dt className="text-[11px] font-bold uppercase text-muted-foreground">Promoções</dt>
            <dd className="mt-0.5 font-semibold">
              {c.marketing_opt_in ? "Aceita receber" : "Não aceitou"}
            </dd>
          </div>
        </dl>

        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <Tag className="h-3.5 w-3.5" aria-hidden="true" /> Etiquetas
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {etiquetas.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma etiqueta ainda.</p>
            )}
            {etiquetas.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-foreground"
              >
                {t}
                <button
                  type="button"
                  onClick={() => void salvar({ tags: etiquetas.filter((x) => x !== t) })}
                  disabled={salvando}
                  className="rounded-full hover:text-destructive"
                  aria-label={`Tirar a etiqueta ${t}`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            <Input
              value={novaEtiqueta}
              onChange={(e) => setNovaEtiqueta(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  adicionar(novaEtiqueta);
                }
              }}
              placeholder="Nova etiqueta"
              maxLength={30}
              className="h-8 text-xs"
              aria-label="Nova etiqueta"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => adicionar(novaEtiqueta)}
              disabled={salvando || !novaEtiqueta.trim()}
            >
              Pôr
            </Button>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {SUGESTOES.filter((s) => !etiquetas.some((e) => e.toLowerCase() === s)).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => adicionar(s)}
                disabled={salvando}
                className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                + {s}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Anotações
          </h3>
          <Textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ex.: alérgico a amendoim, entregar no portão de trás..."
            maxLength={2000}
            rows={4}
            className="text-sm"
            aria-label="Anotações sobre o cliente"
          />
          <Button
            size="sm"
            className="mt-2 w-full"
            disabled={!notasMudaram || salvando}
            onClick={() => void salvar({ notes: notas })}
          >
            {salvando && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Salvar anotação
          </Button>
        </section>
      </div>
    </aside>
  );
}
