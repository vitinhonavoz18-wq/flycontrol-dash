import { Loader2, Search, MessageSquarePlus, Bot, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatPhoneForDisplay } from "@/lib/marketing/phone";
import type { ConversaCrm } from "@/lib/crm/crm.functions";

/**
 * A coluna da esquerda: quem falou com o restaurante.
 *
 * A ordem é a que a pessoa espera — quem falou por último aparece primeiro,
 * igual ao próprio WhatsApp. A bolinha laranja marca o que ainda não foi lido;
 * sem ela, a conversa nova se perde no meio das antigas.
 *
 * A LISTA TAMBÉM É TRAVADA: a busca fica colada em cima e só os nomes rolam.
 * Rolar a lista atrás de um cliente e perder o campo de busca de vista é o
 * tipo de detalhe que faz a pessoa desistir e pegar o celular.
 */

const ROTULO_STATUS: Record<string, string> = {
  open: "Aberta",
  pending: "Aguardando cliente",
  closed: "Resolvida",
};

/** A tarja colorida do lado esquerdo de cada nome, dizendo a situação. */
const FAIXA_STATUS: Record<string, string> = {
  open: "bg-primary",
  pending: "bg-amber-500",
  closed: "bg-muted-foreground/40",
};

function quando(iso: string | null): string {
  if (!iso) return "";
  const data = new Date(iso);
  const minutos = Math.floor((Date.now() - data.getTime()) / 60_000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ontem";
  if (dias < 7) return `${dias} dias`;
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function ListaConversas({
  conversas,
  carregando,
  selecionada,
  busca,
  onBusca,
  onSelecionar,
  onNova,
}: {
  conversas: ConversaCrm[];
  carregando: boolean;
  selecionada: string | null;
  busca: string;
  onBusca: (v: string) => void;
  onSelecionar: (id: string) => void;
  onNova: () => void;
}) {
  const naoLidas = conversas.reduce((t, c) => t + (c.unread_count > 0 ? 1 : 0), 0);

  return (
    <div className="flex h-full min-h-0 flex-col border-r-2 border-border bg-card">
      {/* ------- BUSCA: colada em cima, nunca rola ------- */}
      <div className="shrink-0 border-b-2 border-border bg-card px-3 py-2.5">
        <div className="flex items-center justify-between gap-2 pb-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Conversas
          </p>
          {naoLidas > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
              {naoLidas} sem ler
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={busca}
              onChange={(e) => onBusca(e.target.value)}
              placeholder="Buscar nome ou telefone"
              className="h-10 border-2 bg-background pl-8 text-sm"
              aria-label="Buscar conversa"
            />
          </div>
          <Button
            size="icon"
            className="h-10 w-10 shrink-0 shadow-sm"
            onClick={onNova}
            title="Nova conversa"
            aria-label="Nova conversa"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ------- NOMES: a única parte que rola ------- */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {carregando && conversas.length === 0 && (
          <div className="grid place-items-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        )}

        {!carregando && conversas.length === 0 && (
          <div className="px-5 py-12 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-border bg-muted">
              <Bot className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">Nenhuma conversa ainda</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Quando um cliente mandar mensagem no WhatsApp da loja, ela aparece aqui.
            </p>
          </div>
        )}

        {conversas.map((c) => {
          const nome = c.contato?.name?.trim();
          const telefone = c.contato?.phone_e164 ?? "";
          const titulo = nome || formatPhoneForDisplay(telefone) || "Sem nome";
          const ativa = c.id === selecionada;
          const semLer = c.unread_count > 0;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelecionar(c.id)}
              aria-current={ativa ? "true" : undefined}
              className={`relative flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left transition-colors ${
                ativa ? "bg-primary/15" : "hover:bg-muted active:bg-muted"
              }`}
            >
              {/* A tarja da situação, na borda. Cor cheia: dá para ler de
                  relance qual conversa ainda está aberta. */}
              <span
                className={`absolute inset-y-0 left-0 w-1 ${FAIXA_STATUS[c.status] ?? "bg-transparent"}`}
                aria-hidden="true"
              />

              {/* A foto do WhatsApp quando existe; a inicial quando não.
                  `onError` derruba a foto para a inicial porque o endereço que
                  o WhatsApp entrega VENCE — sem isso, a lista encheria de
                  quadradinho de imagem quebrada depois de um dia. */}
              {c.contato?.avatar_url ? (
                <img
                  src={c.contato.avatar_url}
                  alt=""
                  loading="lazy"
                  className="ml-1 h-10 w-10 shrink-0 rounded-full border border-border object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    e.currentTarget.nextElementSibling?.classList.remove("hidden");
                  }}
                />
              ) : null}
              <span
                className={`ml-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${
                  c.contato?.avatar_url ? "hidden" : ""
                } ${
                  ativa
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-muted text-foreground"
                }`}
                aria-hidden="true"
              >
                {titulo.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
              </span>

              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-baseline justify-between gap-2">
                  <span
                    className={`truncate text-sm ${semLer ? "font-bold text-foreground" : "font-semibold text-foreground"}`}
                  >
                    {titulo}
                  </span>
                  <span
                    className={`shrink-0 text-[11px] font-semibold ${
                      semLer ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {quando(c.last_message_at)}
                  </span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span
                    className={`truncate text-xs ${
                      semLer ? "font-semibold text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {c.last_message_preview || ROTULO_STATUS[c.status] || ""}
                  </span>
                  {semLer && (
                    <span
                      className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground shadow-sm"
                      aria-label={`${c.unread_count} não lidas`}
                    >
                      {c.unread_count > 99 ? "99+" : c.unread_count}
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
