import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Carregando,
  Erro,
  PaginacaoAdmin,
  SeletorAdmin,
  SeloDoAfiliado,
  Vazio,
} from "@/components/afiliados/admin/PecasAdmin";
import { useBuscaComPausa } from "@/components/afiliados/admin/useBuscaComPausa";
import { POR_PAGINA_ADMIN, useAfiliadosAdmin } from "@/lib/afiliados/admin";
import type { SituacaoDoAfiliado } from "@/lib/afiliados/portal";
import { dataCurta, mensagemDeErro, porcentagemDeBps, reais } from "@/lib/afiliados/validacao";

export const Route = createFileRoute("/_app/admin/affiliates/partners/")({
  component: ListaDeAfiliados,
});

function ListaDeAfiliados() {
  const [digitado, busca, setDigitado] = useBuscaComPausa();
  const [status, setStatus] = useState<SituacaoDoAfiliado | "">("");
  const [pagina, setPagina] = useState(1);
  useEffect(() => setPagina(1), [busca, status]);

  const consulta = useAfiliadosAdmin({ busca, status, pagina });
  const itens = consulta.data?.itens ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por nome, e-mail ou código"
            value={digitado}
            onChange={(e) => setDigitado(e.target.value)}
            className="pl-9"
          />
        </div>
        <SeletorAdmin
          rotulo="Filtrar por situação"
          valor={status}
          aoMudar={(v) => setStatus(v as SituacaoDoAfiliado | "")}
          className="sm:w-48"
          opcoes={[
            { valor: "", rotulo: "Todas as situações" },
            { valor: "active", rotulo: "Ativo" },
            { valor: "pending", rotulo: "Pendente" },
            { valor: "suspended", rotulo: "Suspenso" },
            { valor: "blocked", rotulo: "Bloqueado" },
          ]}
        />
      </div>

      {consulta.isLoading ? (
        <Carregando />
      ) : consulta.isError ? (
        <Erro mensagem={mensagemDeErro(consulta.error)} tentarDeNovo={() => consulta.refetch()} />
      ) : itens.length === 0 ? (
        <Vazio
          titulo={
            busca || status ? "Nenhum afiliado encontrado" : "Nenhum afiliado cadastrado ainda"
          }
          texto={
            busca || status
              ? "Tente outra busca ou outro filtro."
              : "Quem se cadastrar em flycontrol.conectfly.com.br/affiliates aparece aqui."
          }
        />
      ) : (
        <>
          <div className="hidden rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Indicações</TableHead>
                  <TableHead className="text-right">Clientes ativos</TableHead>
                  <TableHead className="text-right">Receita gerada</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead className="text-right">Saldo disponível</TableHead>
                  <TableHead>Entrada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link
                        to="/admin/affiliates/partners/$affiliateId"
                        params={{ affiliateId: a.id }}
                        className="font-medium text-primary hover:underline"
                      >
                        {a.nome}
                      </Link>
                      <div className="text-xs text-muted-foreground">{a.email}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{a.codigo}</TableCell>
                    <TableCell>
                      <SeloDoAfiliado status={a.status} />
                      {a.sem_pix ? <SemPix /> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a.indicacoes}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.clientes_ativos}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {reais(a.receita_cents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {porcentagemDeBps(a.comissao_bps)}
                      {a.comissao_propria ? (
                        <span className="ml-1 text-xs text-primary" title="Porcentagem individual">
                          ●
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {reais(a.disponivel_cents)}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {dataCurta(a.criado_em)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2 md:hidden">
            {itens.map((a) => (
              <li key={a.id}>
                <Link
                  to="/admin/affiliates/partners/$affiliateId"
                  params={{ affiliateId: a.id }}
                  className="block rounded-lg border bg-card p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{a.nome}</p>
                      <p className="font-mono text-xs text-muted-foreground">{a.codigo}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <SeloDoAfiliado status={a.status} />
                      {a.sem_pix ? <SemPix /> : null}
                    </div>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Indicações</dt>
                      <dd className="tabular-nums">
                        {a.indicacoes} ({a.clientes_ativos} ativos)
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Comissão</dt>
                      <dd className="tabular-nums">{porcentagemDeBps(a.comissao_bps)}</dd>
                    </div>
                    <div className="text-right">
                      <dt className="text-muted-foreground">Disponível</dt>
                      <dd className="tabular-nums">{reais(a.disponivel_cents)}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          <PaginacaoAdmin
            pagina={pagina}
            total={consulta.data?.total ?? 0}
            porPagina={POR_PAGINA_ADMIN}
            aoMudar={setPagina}
          />
        </>
      )}
    </div>
  );
}

/** Sem chave Pix, o repasse dos dias 10 e 20 pula este afiliado. */
function SemPix() {
  return (
    <span
      className="mt-1 inline-block rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400"
      title="Sem chave Pix: fica fora do repasse até cadastrar"
    >
      Sem Pix
    </span>
  );
}
