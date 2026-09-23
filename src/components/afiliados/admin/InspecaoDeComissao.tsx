import { Link } from "@tanstack/react-router";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useInspecaoDeComissao } from "@/lib/afiliados/admin";
import { NOME_DA_BASE, NOME_DO_EVENTO, resumoDoEvento } from "@/lib/afiliados/adminRotulos";
import { SITUACAO_DA_COMISSAO } from "@/lib/afiliados/situacoes";
import type { SituacaoDaComissao } from "@/lib/afiliados/portal";
import { dataCurta, mensagemDeErro, porcentagemDeBps, reais } from "@/lib/afiliados/validacao";
import { Carregando, Erro, SeloAdmin } from "./PecasAdmin";

function quando(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}

const NOME_DO_ITEM: Record<string, string> = {
  usage: "Uso CENTS (pedidos)",
  monthly_fee: "Mensalidade",
  setup_fee: "Adesão",
};

/**
 * A lupa: de onde saiu uma comissão, passo a passo — a fatura que o cliente
 * pagou, o que dela contou para a comissão, o pagamento confirmado, o saque
 * em que ela entrou e cada evento da trilha. Só leitura.
 */
export function InspecaoDeComissao({ id, aoFechar }: { id: string | null; aoFechar: () => void }) {
  const q = useInspecaoDeComissao(id);
  const d = q.data;
  const c = d?.comissao;
  const situacao = c
    ? ((c.status === "cancelled" ? "reversed" : c.status) as SituacaoDaComissao)
    : null;

  return (
    <Sheet open={Boolean(id)} onOpenChange={(abrir) => !abrir && aoFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Inspeção da comissão</SheetTitle>
          <SheetDescription>
            De onde veio este valor, do pagamento do cliente até o saque.
          </SheetDescription>
        </SheetHeader>

        {q.isLoading ? (
          <div className="mt-6">
            <Carregando linhas={6} />
          </div>
        ) : q.isError ? (
          <div className="mt-6">
            <Erro mensagem={mensagemDeErro(q.error)} tentarDeNovo={() => q.refetch()} />
          </div>
        ) : !d || !c ? (
          <p className="mt-6 text-sm text-muted-foreground">Comissão não encontrada.</p>
        ) : (
          <div className="mt-6 space-y-6">
            <section>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-bold tabular-nums">
                  {reais(c.commission_amount_cents)}
                </p>
                {situacao ? (
                  <SeloAdmin tom={SITUACAO_DA_COMISSAO[situacao].tom}>
                    {SITUACAO_DA_COMISSAO[situacao].rotulo}
                  </SeloAdmin>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {c.kind === "adjustment"
                  ? "Ajuste negativo (estorno de comissão já paga)"
                  : `${porcentagemDeBps(c.commission_bps)} de ${reais(c.eligible_amount_cents)} elegíveis`}
              </p>
              <dl className="mt-3 divide-y">
                <Linha rotulo="Afiliado">
                  {d.afiliado ? (
                    <Link
                      to="/admin/affiliates/partners/$affiliateId"
                      params={{ affiliateId: d.afiliado.id }}
                      className="text-primary hover:underline"
                    >
                      {d.afiliado.nome} ({d.afiliado.codigo})
                    </Link>
                  ) : (
                    "—"
                  )}
                </Linha>
                <Linha rotulo="Estabelecimento">{d.loja?.nome ?? "Loja removida"}</Linha>
                <Linha rotulo="Indicação">
                  {d.indicacao
                    ? `${d.indicacao.manual ? "manual" : "pelo link"} em ${dataCurta(d.indicacao.convertida_em)}${d.indicacao.ativa ? "" : " (cancelada)"}`
                    : "—"}
                </Linha>
                <Linha rotulo="Valor bruto da fatura">{reais(c.gross_amount_cents)}</Linha>
                <Linha rotulo="Valor elegível">{reais(c.eligible_amount_cents)}</Linha>
                <Linha rotulo="Percentual (gravado no dia)">
                  {porcentagemDeBps(c.commission_bps)}
                </Linha>
                <Linha rotulo="Base usada">
                  {NOME_DA_BASE[String(c.metadata?.commission_base ?? "")] ?? "—"}
                </Linha>
                <Linha rotulo="Criada">{quando(c.created_at)}</Linha>
                <Linha rotulo="Libera em">{quando(c.available_at)}</Linha>
                {c.released_at ? <Linha rotulo="Liberada">{quando(c.released_at)}</Linha> : null}
                {c.paid_at ? <Linha rotulo="Paga">{quando(c.paid_at)}</Linha> : null}
                {c.reversed_at ? <Linha rotulo="Estornada">{quando(c.reversed_at)}</Linha> : null}
                <Linha rotulo="Chave anti-duplicidade">
                  <span className="break-all font-mono text-xs">{c.idempotency_key}</span>
                </Linha>
              </dl>
            </section>

            {d.fatura ? (
              <section>
                <h3 className="text-sm font-semibold">Fatura (evento CENTS)</h3>
                <dl className="mt-1 divide-y">
                  <Linha rotulo="Número">{d.fatura.numero}</Linha>
                  <Linha rotulo="Situação">{d.fatura.status}</Linha>
                  <Linha rotulo="Subtotal">{reais(d.fatura.subtotal_cents)}</Linha>
                  <Linha rotulo="Desconto">{reais(d.fatura.desconto_cents)}</Linha>
                  <Linha rotulo="Total pago">{reais(d.fatura.total_cents)}</Linha>
                  <Linha rotulo="Paga em">{quando(d.fatura.pago_em)}</Linha>
                </dl>
                <ul className="mt-2 space-y-1 rounded-md bg-muted/50 p-3 text-sm">
                  {d.fatura.itens.map((it, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>
                        {NOME_DO_ITEM[it.tipo] ?? it.tipo}
                        {it.quantidade ? ` × ${it.quantidade}` : ""}
                      </span>
                      <span className="tabular-nums">{reais(it.total_cents)}</span>
                    </li>
                  ))}
                  {d.fatura.itens.length === 0 ? (
                    <li className="text-muted-foreground">Sem itens.</li>
                  ) : null}
                </ul>
              </section>
            ) : null}

            <section>
              <h3 className="text-sm font-semibold">Pagamentos da fatura</h3>
              {d.pagamentos.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-sm">
                  {d.pagamentos.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap justify-between gap-2 rounded-md border p-2"
                    >
                      <span>
                        {p.provedor} · {p.status}
                        {p.referencia ? (
                          <span className="ml-1 font-mono text-xs">({p.referencia})</span>
                        ) : null}
                      </span>
                      <span className="tabular-nums">
                        {reais(p.valor_cents)} · {quando(p.pago_em)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {d.ajustes.length ? (
              <section>
                <h3 className="text-sm font-semibold">Ajustes (estornos)</h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {d.ajustes.map((a) => (
                    <li key={a.id} className="rounded-md border p-2">
                      <span className="font-semibold tabular-nums text-destructive">
                        {reais(a.valor_cents)}
                      </span>{" "}
                      em {quando(a.data)}
                      {a.motivo ? (
                        <p className="text-xs text-muted-foreground">{a.motivo}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {d.saque ? (
              <section>
                <h3 className="text-sm font-semibold">Saque</h3>
                <p className="text-sm">
                  {reais(d.saque.valor_cents)} · {d.saque.situacao} · pedido em{" "}
                  {quando(d.saque.pedido_em)}
                  {d.saque.pago_em ? ` · pago em ${quando(d.saque.pago_em)}` : ""}
                </p>
              </section>
            ) : null}

            <section>
              <h3 className="text-sm font-semibold">Trilha de auditoria</h3>
              <ol className="mt-1 space-y-2 border-l pl-4 text-sm">
                {d.eventos.map((e, i) => (
                  <li key={i}>
                    <p className="font-medium">{NOME_DO_EVENTO[e.tipo] ?? e.tipo}</p>
                    <p className="text-xs text-muted-foreground">
                      {quando(e.data)}
                      {e.admin ? ` · por ${e.admin}` : ""}
                    </p>
                    {resumoDoEvento(e.tipo, e.dados) ? (
                      <p className="text-xs">{resumoDoEvento(e.tipo, e.dados)}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
