import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Search as Lupa } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CHAVE_ADMIN,
  POR_PAGINA_ADMIN,
  decidirSaque,
  estornarComissao,
  mudarSituacaoDaIndicacao,
  useComissoesAdmin,
  useEventosAdmin,
  useIndicacoesAdmin,
  useSaquesAdmin,
  type ComissaoAdmin,
  type IndicacaoAdmin,
  type SaqueAdmin,
} from "@/lib/afiliados/admin";
import { NOME_DO_EVENTO, resumoDoEvento } from "@/lib/afiliados/adminRotulos";
import type { SituacaoDaComissao, SituacaoDaLoja, SituacaoDoSaque } from "@/lib/afiliados/portal";
import {
  SITUACAO_DA_COMISSAO,
  SITUACAO_DA_LOJA,
  SITUACAO_DO_SAQUE,
} from "@/lib/afiliados/situacoes";
import {
  TIPOS_DE_PIX,
  dataCurta,
  mensagemDeErro,
  porcentagemDeBps,
  reais,
} from "@/lib/afiliados/validacao";
import { cn } from "@/lib/utils";
import { InspecaoDeComissao } from "./InspecaoDeComissao";
import { Carregando, ConfirmarAcao, Erro, PaginacaoAdmin, SeloAdmin, Vazio } from "./PecasAdmin";

function quando(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function LinkDoAfiliado({ id, nome }: { id: string; nome: string }) {
  return (
    <Link
      to="/admin/affiliates/partners/$affiliateId"
      params={{ affiliateId: id }}
      className="text-primary hover:underline"
    >
      {nome}
    </Link>
  );
}

/** Depois de qualquer ação, tudo do painel de afiliados é buscado de novo. */
function useRecarregar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: CHAVE_ADMIN });
}

// ═════════════════════════════════════════════════════════════════════════
// COMISSÕES
// ═════════════════════════════════════════════════════════════════════════

export function TabelaDeComissoes({
  status,
  busca = "",
  afiliadoId,
  esconderAfiliado,
}: {
  status: SituacaoDaComissao | "";
  busca?: string;
  afiliadoId?: string;
  esconderAfiliado?: boolean;
}) {
  const [pagina, setPagina] = useState(1);
  const [chaveDoFiltro, setChaveDoFiltro] = useState(`${status}|${busca}`);
  if (chaveDoFiltro !== `${status}|${busca}`) {
    setChaveDoFiltro(`${status}|${busca}`);
    setPagina(1);
  }
  const consulta = useComissoesAdmin({ status, busca, afiliadoId, pagina });
  const [inspecionar, setInspecionar] = useState<string | null>(null);
  const [estornar, setEstornar] = useState<ComissaoAdmin | null>(null);
  const recarregar = useRecarregar();
  const itens = consulta.data?.itens ?? [];

  const podeEstornar = (c: ComissaoAdmin) => c.tipo === "commission" && c.situacao !== "reversed";

  return (
    <>
      {consulta.isLoading ? (
        <Carregando />
      ) : consulta.isError ? (
        <Erro mensagem={mensagemDeErro(consulta.error)} tentarDeNovo={() => consulta.refetch()} />
      ) : itens.length === 0 ? (
        <Vazio
          titulo="Nenhuma comissão"
          texto="Comissões nascem quando a fatura de um cliente indicado é paga e confirmada."
        />
      ) : (
        <>
          <div className="hidden rounded-md border lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {esconderAfiliado ? null : <TableHead>Afiliado</TableHead>}
                  <TableHead>Estabelecimento</TableHead>
                  <TableHead>Fatura</TableHead>
                  <TableHead className="text-right">Bruto</TableHead>
                  <TableHead className="text-right">Elegível</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((c) => {
                  const s = SITUACAO_DA_COMISSAO[c.situacao];
                  return (
                    <TableRow key={c.id}>
                      {esconderAfiliado ? null : (
                        <TableCell>
                          <LinkDoAfiliado id={c.afiliado_id} nome={c.afiliado} />
                        </TableCell>
                      )}
                      <TableCell className="max-w-[12rem] truncate">{c.loja}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {c.tipo === "adjustment" ? "ajuste" : (c.fatura_numero ?? "—")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.tipo === "adjustment" ? "—" : reais(c.bruto_cents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.tipo === "adjustment" ? "—" : reais(c.elegivel_cents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {porcentagemDeBps(c.bps)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-semibold tabular-nums",
                          c.comissao_cents < 0 && "text-destructive",
                        )}
                      >
                        {reais(c.comissao_cents)}
                      </TableCell>
                      <TableCell>
                        <SeloAdmin tom={s.tom}>{s.rotulo}</SeloAdmin>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {quando(c.data)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button size="sm" variant="ghost" onClick={() => setInspecionar(c.id)}>
                          <Lupa className="mr-1 h-4 w-4" /> Inspecionar
                        </Button>
                        {podeEstornar(c) ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => setEstornar(c)}
                          >
                            Estornar
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2 lg:hidden">
            {itens.map((c) => {
              const s = SITUACAO_DA_COMISSAO[c.situacao];
              return (
                <li key={c.id} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.loja}</p>
                      <p className="text-xs text-muted-foreground">
                        {esconderAfiliado ? null : <>{c.afiliado} · </>}
                        {quando(c.data)}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "shrink-0 font-semibold tabular-nums",
                        c.comissao_cents < 0 && "text-destructive",
                      )}
                    >
                      {reais(c.comissao_cents)}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {c.tipo === "adjustment"
                        ? "Ajuste de estorno"
                        : `${porcentagemDeBps(c.bps)} de ${reais(c.elegivel_cents)}`}
                    </span>
                    <SeloAdmin tom={s.tom}>{s.rotulo}</SeloAdmin>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setInspecionar(c.id)}
                    >
                      Inspecionar
                    </Button>
                    {podeEstornar(c) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-destructive"
                        onClick={() => setEstornar(c)}
                      >
                        Estornar
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          <PaginacaoAdmin
            pagina={pagina}
            total={consulta.data?.total ?? 0}
            porPagina={POR_PAGINA_ADMIN}
            aoMudar={setPagina}
          />
        </>
      )}

      <InspecaoDeComissao id={inspecionar} aoFechar={() => setInspecionar(null)} />

      <ConfirmarAcao
        aberto={Boolean(estornar)}
        aoFechar={() => setEstornar(null)}
        titulo="Estornar comissão"
        perigosa
        rotuloDoBotao="Estornar"
        descricao={
          estornar ? (
            <>
              <p>
                Comissão de <strong>{reais(estornar.comissao_cents)}</strong> para{" "}
                <strong>{estornar.afiliado}</strong> ({estornar.loja}).
              </p>
              <p>
                {estornar.situacao === "paid" || estornar.situacao === "requested"
                  ? "Ela já foi sacada ou está em saque: nada é apagado, e nasce um ajuste negativo do mesmo valor, descontado das próximas comissões do afiliado."
                  : "Ela ainda não foi sacada: passa a valer zero e sai do saldo do afiliado. O registro continua no histórico."}
              </p>
            </>
          ) : null
        }
        motivo={{
          rotulo: "Motivo do estorno",
          minimo: 10,
          obrigatorio: true,
          dica: "Obrigatório. Fica na auditoria.",
        }}
        aoConfirmar={async ({ motivo }) => {
          if (!estornar) return;
          try {
            await estornarComissao(estornar.id, motivo);
            toast.success("Comissão estornada.");
            await recarregar();
          } catch (e) {
            toast.error(mensagemDeErro(e));
            throw e;
          }
        }}
      />
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SAQUES
// ═════════════════════════════════════════════════════════════════════════

type Decisao = { saque: SaqueAdmin; acao: "approve" | "pay" | "reject" };

export function TabelaDeSaques({
  status,
  afiliadoId,
  esconderAfiliado,
}: {
  status: SituacaoDoSaque | "open" | "";
  afiliadoId?: string;
  esconderAfiliado?: boolean;
}) {
  const [pagina, setPagina] = useState(1);
  const [ultimoStatus, setUltimoStatus] = useState(status);
  if (ultimoStatus !== status) {
    setUltimoStatus(status);
    setPagina(1);
  }
  const consulta = useSaquesAdmin({ status, afiliadoId, pagina });
  const [decisao, setDecisao] = useState<Decisao | null>(null);
  const recarregar = useRecarregar();
  const itens = consulta.data?.itens ?? [];

  const tipoDoPix = (t: string | null) => TIPOS_DE_PIX.find((x) => x.valor === t)?.rotulo ?? "Pix";

  const Acoes = ({ s, cheio }: { s: SaqueAdmin; cheio?: boolean }) => (
    <div className={cn("flex gap-2", cheio ? "w-full" : "justify-end")}>
      {s.situacao === "requested" ? (
        <Button
          size="sm"
          className={cn(cheio && "flex-1")}
          onClick={() => setDecisao({ saque: s, acao: "approve" })}
        >
          Aprovar
        </Button>
      ) : null}
      {s.situacao === "approved" ? (
        <Button
          size="sm"
          className={cn(cheio && "flex-1")}
          onClick={() => setDecisao({ saque: s, acao: "pay" })}
        >
          Marcar como pago
        </Button>
      ) : null}
      {s.situacao === "requested" || s.situacao === "approved" ? (
        <Button
          size="sm"
          variant="outline"
          className={cn("text-destructive", cheio && "flex-1")}
          onClick={() => setDecisao({ saque: s, acao: "reject" })}
        >
          Recusar
        </Button>
      ) : null}
    </div>
  );

  const Avisos = ({ s }: { s: SaqueAdmin }) => (
    <>
      {s.elegivel_cents !== s.valor_cents ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" /> Comissões ligadas ({reais(s.elegivel_cents)})
          não batem com o valor
        </p>
      ) : null}
      {s.pix_mudou && (s.situacao === "requested" || s.situacao === "approved") ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" /> O afiliado trocou o Pix depois do pedido
        </p>
      ) : null}
      {s.alertas > 0 ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" /> Pedido logo depois de trocar a chave Pix
        </p>
      ) : null}
      {s.afiliado_status !== "active" ? (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Afiliado não está ativo</p>
      ) : null}
    </>
  );

  const Historico = ({ s }: { s: SaqueAdmin }) => (
    <div className="text-xs text-muted-foreground">
      {s.aprovado_em ? (
        <p>
          Aprovado {quando(s.aprovado_em)} por {s.aprovado_por ?? "—"}
        </p>
      ) : null}
      {s.pago_em ? (
        <p>
          Pago {quando(s.pago_em)} por {s.pago_por ?? "—"}
          {s.referencia ? ` · comprovante ${s.referencia}` : ""}
        </p>
      ) : null}
      {s.recusado_em ? (
        <p>
          Recusado {quando(s.recusado_em)} por {s.recusado_por ?? "—"}
        </p>
      ) : null}
      {s.notas ? <p>Nota: {s.notas}</p> : null}
    </div>
  );

  const d = decisao;
  return (
    <>
      {consulta.isLoading ? (
        <Carregando />
      ) : consulta.isError ? (
        <Erro mensagem={mensagemDeErro(consulta.error)} tentarDeNovo={() => consulta.refetch()} />
      ) : itens.length === 0 ? (
        <Vazio
          titulo={
            status === "open" || status === "requested" ? "Nenhum saque aguardando" : "Nenhum saque"
          }
          texto="Pedidos de saque dos afiliados aparecem aqui."
        />
      ) : (
        <>
          <div className="hidden rounded-md border lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {esconderAfiliado ? null : <TableHead>Afiliado</TableHead>}
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Pix</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead className="text-right">Saldo elegível</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((s) => {
                  const st = SITUACAO_DO_SAQUE[s.situacao];
                  return (
                    <TableRow key={s.id} className="align-top">
                      {esconderAfiliado ? null : (
                        <TableCell>
                          <LinkDoAfiliado id={s.afiliado_id} nome={s.afiliado} />
                          <div className="font-mono text-xs text-muted-foreground">{s.codigo}</div>
                        </TableCell>
                      )}
                      <TableCell className="text-right font-semibold tabular-nums">
                        {reais(s.valor_cents)}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">{tipoDoPix(s.pix_tipo)}</div>
                        <div className="break-all font-mono text-xs">{s.pix}</div>
                        <Avisos s={s} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {quando(s.pedido_em)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {reais(s.elegivel_cents)}
                      </TableCell>
                      <TableCell>
                        <SeloAdmin tom={st.tom}>{st.rotulo}</SeloAdmin>
                        <Historico s={s} />
                      </TableCell>
                      <TableCell>
                        <Acoes s={s} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2 lg:hidden">
            {itens.map((s) => {
              const st = SITUACAO_DO_SAQUE[s.situacao];
              return (
                <li key={s.id} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-lg font-semibold tabular-nums">{reais(s.valor_cents)}</p>
                      {esconderAfiliado ? null : <p className="truncate text-sm">{s.afiliado}</p>}
                      <p className="text-xs text-muted-foreground">Pedido {quando(s.pedido_em)}</p>
                    </div>
                    <SeloAdmin tom={st.tom}>{st.rotulo}</SeloAdmin>
                  </div>
                  <div className="mt-2 rounded-md bg-muted/50 p-2">
                    <div className="text-xs text-muted-foreground">{tipoDoPix(s.pix_tipo)}</div>
                    <div className="break-all font-mono text-sm">{s.pix}</div>
                  </div>
                  <Avisos s={s} />
                  <div className="mt-2">
                    <Historico s={s} />
                  </div>
                  <div className="mt-3">
                    <Acoes s={s} cheio />
                  </div>
                </li>
              );
            })}
          </ul>

          <PaginacaoAdmin
            pagina={pagina}
            total={consulta.data?.total ?? 0}
            porPagina={POR_PAGINA_ADMIN}
            aoMudar={setPagina}
          />
        </>
      )}

      <ConfirmarAcao
        aberto={Boolean(d)}
        aoFechar={() => setDecisao(null)}
        titulo={
          d?.acao === "approve"
            ? "Aprovar saque"
            : d?.acao === "pay"
              ? "Marcar saque como pago"
              : "Recusar saque"
        }
        perigosa={d?.acao === "reject"}
        rotuloDoBotao={
          d?.acao === "approve" ? "Aprovar" : d?.acao === "pay" ? "Confirmar pagamento" : "Recusar"
        }
        descricao={
          d ? (
            <>
              <p>
                <strong>{reais(d.saque.valor_cents)}</strong> para{" "}
                <strong>{d.saque.afiliado}</strong>, na chave Pix{" "}
                <span className="break-all font-mono">{d.saque.pix}</span>.
              </p>
              {d.acao === "approve" ? (
                <p>
                  Aprovar diz que o pedido foi conferido. O dinheiro ainda não sai: o próximo passo
                  é pagar.
                </p>
              ) : d.acao === "pay" ? (
                <p>
                  Confirme só depois de fazer a transferência no banco. Um saque pago não pode ser
                  pago de novo nem desfeito.
                </p>
              ) : (
                <p>
                  O valor volta a ficar disponível para o afiliado, e ele vê o motivo no portal.
                </p>
              )}
            </>
          ) : null
        }
        motivo={
          d?.acao === "reject"
            ? { rotulo: "Motivo da recusa (o afiliado vai ler)", minimo: 5, obrigatorio: true }
            : d?.acao === "approve"
              ? { rotulo: "Observação interna", minimo: 0, obrigatorio: false }
              : undefined
        }
        campoExtra={
          d?.acao === "pay"
            ? {
                rotulo: "Comprovante (código da transação Pix)",
                dica: "O código que aparece no comprovante do banco. Fica guardado na auditoria.",
              }
            : undefined
        }
        aoConfirmar={async ({ motivo, extra }) => {
          if (!d) return;
          try {
            await decidirSaque(d.saque.id, d.acao, motivo || null, extra || null);
            toast.success(
              d.acao === "approve"
                ? "Saque aprovado."
                : d.acao === "pay"
                  ? "Saque marcado como pago."
                  : "Saque recusado.",
            );
            await recarregar();
          } catch (e) {
            toast.error(mensagemDeErro(e));
            await recarregar();
            throw e;
          }
        }}
      />
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// INDICAÇÕES
// ═════════════════════════════════════════════════════════════════════════

export function TabelaDeIndicacoes({
  busca = "",
  situacao,
  afiliadoId,
  esconderAfiliado,
}: {
  busca?: string;
  situacao: SituacaoDaLoja | "";
  afiliadoId?: string;
  esconderAfiliado?: boolean;
}) {
  const [pagina, setPagina] = useState(1);
  const [chaveDoFiltro, setChaveDoFiltro] = useState(`${situacao}|${busca}`);
  if (chaveDoFiltro !== `${situacao}|${busca}`) {
    setChaveDoFiltro(`${situacao}|${busca}`);
    setPagina(1);
  }
  const consulta = useIndicacoesAdmin({ busca, situacao, afiliadoId, pagina });
  const [mudar, setMudar] = useState<IndicacaoAdmin | null>(null);
  const recarregar = useRecarregar();
  const itens = consulta.data?.itens ?? [];

  return (
    <>
      {consulta.isLoading ? (
        <Carregando />
      ) : consulta.isError ? (
        <Erro mensagem={mensagemDeErro(consulta.error)} tentarDeNovo={() => consulta.refetch()} />
      ) : itens.length === 0 ? (
        <Vazio
          titulo="Nenhuma indicação"
          texto="Lojas criadas pelo link de um afiliado aparecem aqui."
        />
      ) : (
        <>
          <div className="hidden rounded-md border lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {esconderAfiliado ? null : <TableHead>Afiliado</TableHead>}
                  <TableHead>Estabelecimento</TableHead>
                  <TableHead>Código usado</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Receita elegível</TableHead>
                  <TableHead className="text-right">Comissão acumulada</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((i) => {
                  const s = SITUACAO_DA_LOJA[i.situacao];
                  return (
                    <TableRow key={i.id}>
                      {esconderAfiliado ? null : (
                        <TableCell>
                          <LinkDoAfiliado id={i.afiliado_id} nome={i.afiliado} />
                        </TableCell>
                      )}
                      <TableCell className="max-w-[14rem]">
                        <p className="truncate">{i.loja}</p>
                        {i.manual ? (
                          <p className="text-xs text-muted-foreground">atribuída manualmente</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{i.codigo}</TableCell>
                      <TableCell className="text-xs tabular-nums">{dataCurta(i.data)}</TableCell>
                      <TableCell>
                        <SeloAdmin tom={s.tom}>{s.rotulo}</SeloAdmin>
                        {!i.indicacao_ativa ? (
                          <p className="mt-1 text-xs text-destructive">indicação cancelada</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {reais(i.receita_cents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {reais(i.comissao_cents)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className={cn(i.indicacao_ativa && "text-destructive")}
                          onClick={() => setMudar(i)}
                        >
                          {i.indicacao_ativa ? "Cancelar" : "Restaurar"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2 lg:hidden">
            {itens.map((i) => {
              const s = SITUACAO_DA_LOJA[i.situacao];
              return (
                <li key={i.id} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{i.loja}</p>
                      <p className="text-xs text-muted-foreground">
                        {esconderAfiliado ? null : <>{i.afiliado} · </>}
                        <span className="font-mono">{i.codigo}</span> · {dataCurta(i.data)}
                        {i.manual ? " · manual" : ""}
                      </p>
                    </div>
                    <SeloAdmin tom={s.tom}>{s.rotulo}</SeloAdmin>
                  </div>
                  <div className="mt-2 flex justify-between text-xs">
                    <span>Receita {reais(i.receita_cents)}</span>
                    <span className="font-semibold">Comissão {reais(i.comissao_cents)}</span>
                  </div>
                  {!i.indicacao_ativa ? (
                    <p className="mt-1 text-xs text-destructive">indicação cancelada</p>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full"
                    onClick={() => setMudar(i)}
                  >
                    {i.indicacao_ativa ? "Cancelar indicação" : "Restaurar indicação"}
                  </Button>
                </li>
              );
            })}
          </ul>

          <PaginacaoAdmin
            pagina={pagina}
            total={consulta.data?.total ?? 0}
            porPagina={POR_PAGINA_ADMIN}
            aoMudar={setPagina}
          />
        </>
      )}

      <ConfirmarAcao
        aberto={Boolean(mudar)}
        aoFechar={() => setMudar(null)}
        titulo={mudar?.indicacao_ativa ? "Cancelar indicação" : "Restaurar indicação"}
        perigosa={mudar?.indicacao_ativa}
        rotuloDoBotao={mudar?.indicacao_ativa ? "Cancelar indicação" : "Restaurar"}
        descricao={
          mudar ? (
            <>
              <p>
                <strong>{mudar.loja}</strong>, indicada por <strong>{mudar.afiliado}</strong>.
              </p>
              <p>
                {mudar.indicacao_ativa
                  ? "Enquanto cancelada, as próximas faturas pagas desta loja não geram comissão. O que já foi gerado continua como está. O afiliado da loja não muda."
                  : "As próximas faturas pagas voltam a gerar comissão para este afiliado. Faturas pagas enquanto esteve cancelada não geram nada retroativo."}
              </p>
            </>
          ) : null
        }
        motivo={{
          rotulo: "Motivo",
          minimo: 5,
          obrigatorio: true,
          dica: "Obrigatório. Fica na auditoria.",
        }}
        aoConfirmar={async ({ motivo }) => {
          if (!mudar) return;
          try {
            await mudarSituacaoDaIndicacao(mudar.id, !mudar.indicacao_ativa, motivo);
            toast.success(mudar.indicacao_ativa ? "Indicação cancelada." : "Indicação restaurada.");
            await recarregar();
          } catch (e) {
            toast.error(mensagemDeErro(e));
            throw e;
          }
        }}
      />
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// AUDITORIA
// ═════════════════════════════════════════════════════════════════════════

export function ListaDeEventos({
  tipo,
  afiliadoId,
  esconderAfiliado,
}: {
  tipo: string;
  afiliadoId?: string;
  esconderAfiliado?: boolean;
}) {
  const [pagina, setPagina] = useState(1);
  const [ultimoTipo, setUltimoTipo] = useState(tipo);
  if (ultimoTipo !== tipo) {
    setUltimoTipo(tipo);
    setPagina(1);
  }
  const consulta = useEventosAdmin({ tipo, afiliadoId, pagina });
  const [aberto, setAberto] = useState<string | null>(null);
  const itens = consulta.data?.itens ?? [];

  if (consulta.isLoading) return <Carregando />;
  if (consulta.isError) {
    return (
      <Erro mensagem={mensagemDeErro(consulta.error)} tentarDeNovo={() => consulta.refetch()} />
    );
  }
  if (itens.length === 0) {
    return (
      <Vazio
        titulo="Nenhum evento"
        texto="Cada ação do programa de afiliados fica registrada aqui."
      />
    );
  }

  return (
    <>
      <ol className="divide-y rounded-md border">
        {itens.map((e) => {
          const suspeito = e.tipo === "SUSPICIOUS_ACTIVITY";
          const resumo = resumoDoEvento(e.tipo, e.dados);
          return (
            <li key={e.id} className={cn("p-3 text-sm", suspeito && "bg-red-500/5")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={cn("font-medium", suspeito && "text-destructive")}>
                    {suspeito ? <AlertTriangle className="mr-1 inline h-4 w-4" /> : null}
                    {NOME_DO_EVENTO[e.tipo] ?? e.tipo}
                  </p>
                  {resumo ? <p className="text-muted-foreground">{resumo}</p> : null}
                  <p className="text-xs text-muted-foreground">
                    {esconderAfiliado || !e.afiliado_id ? null : (
                      <>
                        <LinkDoAfiliado id={e.afiliado_id} nome={e.afiliado ?? "afiliado"} /> ·{" "}
                      </>
                    )}
                    {e.admin ? (
                      <>por {e.admin}</>
                    ) : e.usuario ? (
                      <>pelo próprio usuário ({e.usuario})</>
                    ) : (
                      <>pelo sistema</>
                    )}
                  </p>
                </div>
                <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {quando(e.data)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAberto(aberto === e.id ? null : e.id)}
                className="mt-1 text-xs text-primary hover:underline"
              >
                {aberto === e.id ? "Esconder dados" : "Ver dados"}
              </button>
              {aberto === e.id ? (
                <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">
                  {JSON.stringify(e.dados, null, 2)}
                </pre>
              ) : null}
            </li>
          );
        })}
      </ol>
      <PaginacaoAdmin
        pagina={pagina}
        total={consulta.data?.total ?? 0}
        porPagina={30}
        aoMudar={setPagina}
      />
    </>
  );
}
