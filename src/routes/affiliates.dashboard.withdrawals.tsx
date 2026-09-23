import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarClock, Check, CircleAlert, KeyRound, Wallet, X } from "lucide-react";
import {
  Carregando,
  Erro,
  Paginacao,
  Painel,
  Selo,
  TituloDaPagina,
  Vazio,
} from "@/components/afiliados/portal/Pecas";
import { usePerfil } from "@/components/afiliados/portal/perfilContexto";
import { POR_PAGINA, useResumoDoAfiliado, useSaques, type Saque } from "@/lib/afiliados/portal";
import { SITUACAO_DO_SAQUE, etapasDoSaque } from "@/lib/afiliados/situacoes";
import {
  dataCurta,
  nosDias,
  mascararPix,
  mensagemDeErro,
  proximoRepasse,
  reais,
  textoDaLiberacao,
  TIPOS_DE_PIX,
} from "@/lib/afiliados/validacao";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/affiliates/dashboard/withdrawals")({ component: Repasses });

/**
 * O parceiro NÃO pede saque. Nos dias de repasse (10 e 20), o banco separa
 * sozinho todo o saldo disponível de cada parceiro, e a equipe FlyControl
 * confere e manda o Pix. Esta tela só mostra quando vai ser, quanto, e o que
 * falta para entrar — como o quadro do salão que diz "pagamento dos
 * motoboys: dias 10 e 20".
 */
function Repasses() {
  const perfil = usePerfil();
  const resumo = useResumoDoAfiliado();
  const [pagina, setPagina] = useState(1);
  const saques = useSaques(pagina);

  const disponivel = resumo.data?.disponivel_cents ?? 0;
  const minimo = perfil.saque_minimo_cents;
  const temPix = Boolean(perfil.pix_chave);
  const dias = perfil.dias_de_repasse;
  const proximo = proximoRepasse(dias);
  // A primeira página vem do mais novo para o mais antigo: um repasse em
  // andamento, se existir, está nela.
  const emAndamento = (pagina === 1 ? saques.data?.itens : undefined)?.find(
    (s) => s.situacao === "requested" || s.situacao === "approved",
  );

  const regras = [
    { ok: disponivel >= minimo && disponivel > 0, texto: `Saldo de pelo menos ${reais(minimo)}` },
    { ok: temPix, texto: "Chave Pix cadastrada" },
    { ok: !emAndamento, texto: "Repasse anterior já pago" },
  ];
  const entra = resumo.isSuccess && saques.isSuccess && regras.every((r) => r.ok);
  const tipoDoPix = TIPOS_DE_PIX.find((t) => t.valor === perfil.pix_tipo)?.rotulo ?? "Pix";

  return (
    <div className="space-y-6">
      <TituloDaPagina
        titulo="Repasses"
        texto={`Seu saldo é pago automaticamente ${nosDias(dias)} de cada mês, via Pix. Você não precisa pedir.`}
      />

      {resumo.isLoading ? (
        <Carregando linhas={2} altura="h-28" />
      ) : resumo.isError ? (
        <Erro mensagem={mensagemDeErro(resumo.error)} tentarDeNovo={() => resumo.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Painel destaque>
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#ff8a3d]">
              <CalendarClock className="size-4" /> Próximo repasse
            </span>
            <p
              className="mt-2 text-4xl font-semibold tracking-[-0.03em] text-white tabular-nums"
              data-testid="proximo-repasse"
            >
              {proximo ? dataCurta(proximo) : "—"}
            </p>

            <div className="mt-5 flex items-center justify-between gap-3 rounded-[12px] border border-white/10 bg-[#0d0d0d] px-4 py-3">
              <span className="inline-flex items-center gap-2 text-sm text-white/70">
                <Wallet className="size-4 text-emerald-400" /> Saldo disponível
              </span>
              <span
                className="text-lg font-semibold text-white tabular-nums"
                data-testid="saldo-disponivel"
              >
                {reais(disponivel)}
              </span>
            </div>
            {resumo.data && resumo.data.pendente_cents > 0 ? (
              <p className="mt-1.5 text-xs text-white/50">
                + {reais(resumo.data.pendente_cents)} pendente (
                {textoDaLiberacao(perfil.dias_para_liberar).toLowerCase()})
              </p>
            ) : null}

            <div className="mt-4">
              <span className="block text-sm font-medium text-white/85">Chave Pix</span>
              {temPix ? (
                <div className="mt-1.5 flex items-center justify-between gap-3 rounded-[12px] border border-white/10 bg-[#0d0d0d] px-4 py-3">
                  <span className="min-w-0 truncate text-sm text-white">
                    {tipoDoPix} · <span className="font-mono">{mascararPix(perfil.pix_chave)}</span>
                  </span>
                  <Link
                    to="/affiliates/dashboard/settings"
                    className="shrink-0 text-xs text-[#ff8a3d] hover:underline"
                  >
                    Trocar
                  </Link>
                </div>
              ) : (
                <Link
                  to="/affiliates/dashboard/settings"
                  className="mt-1.5 flex items-center gap-2 rounded-[12px] border border-dashed border-[#ff5a00]/40 px-4 py-3 text-sm text-[#ff8a3d]"
                >
                  <KeyRound className="size-4" /> Cadastrar chave Pix
                </Link>
              )}
            </div>

            <p
              className={cn(
                "mt-4 rounded-[12px] border px-4 py-3 text-sm leading-relaxed",
                entra
                  ? "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-300"
                  : "border-white/10 bg-white/[0.03] text-white/70",
              )}
              data-testid="situacao-do-repasse"
            >
              {situacaoDoRepasse({
                entra,
                disponivel,
                minimo,
                temPix,
                emAndamento,
                proximo,
              })}
            </p>
          </Painel>

          <Painel>
            <h2 className="text-sm font-medium text-white">Para entrar no próximo repasse</h2>
            <ul className="mt-3 space-y-2.5">
              {regras.map((r) => (
                <li key={r.texto} className="flex items-center gap-2.5 text-sm">
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full",
                      r.ok ? "bg-emerald-500/15 text-emerald-400" : "bg-white/5 text-white/35",
                    )}
                  >
                    {r.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                  </span>
                  <span className={r.ok ? "text-white/80" : "text-white/50"}>{r.texto}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 flex gap-2 text-xs leading-relaxed text-white/45">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              {`${capitalizar(nosDias(dias))}, todo o seu saldo disponível é separado de uma vez. A equipe FlyControl confere, envia o Pix para a chave cadastrada e fala com você pelo celular. Saldo abaixo de ${reais(minimo)} fica guardado e soma no repasse seguinte.`}
            </p>
          </Painel>
        </div>
      )}

      <section aria-label="Histórico de repasses">
        <h2 className="mb-3 text-lg font-medium">Histórico</h2>
        {saques.isLoading ? (
          <Carregando linhas={3} />
        ) : saques.isError ? (
          <Erro mensagem={mensagemDeErro(saques.error)} tentarDeNovo={() => saques.refetch()} />
        ) : !saques.data || saques.data.itens.length === 0 ? (
          <Vazio
            titulo="Nenhum repasse ainda"
            texto={`Os repasses feitos ${nosDias(dias)} aparecem aqui, com cada etapa.`}
          />
        ) : (
          <>
            <ul className="space-y-3">
              {saques.data.itens.map((s) => (
                <CartaoDoRepasse key={s.id} s={s} />
              ))}
            </ul>
            <Paginacao
              pagina={pagina}
              total={saques.data.total}
              porPagina={POR_PAGINA}
              aoMudar={setPagina}
            />
          </>
        )}
      </section>
    </div>
  );
}

/** A frase que diz, sem rodeio, o que vai acontecer no próximo repasse. */
function situacaoDoRepasse(d: {
  entra: boolean;
  disponivel: number;
  minimo: number;
  temPix: boolean;
  emAndamento: Saque | undefined;
  proximo: string | null;
}): string {
  const quando = d.proximo ? `no dia ${dataCurta(d.proximo)}` : "no próximo repasse";
  if (d.emAndamento) {
    return `Você tem um repasse de ${reais(d.emAndamento.valor_cents)} em andamento. O saldo novo entra no repasse seguinte, depois que este for pago.`;
  }
  if (!d.temPix) {
    return "Cadastre uma chave Pix para receber. Sem chave, o saldo fica guardado até você cadastrar.";
  }
  if (d.disponivel <= 0) {
    return "Sem saldo disponível por enquanto. As comissões dos seus clientes entram aqui assim que eles pagam.";
  }
  if (d.disponivel < d.minimo) {
    return `Faltam ${reais(d.minimo - d.disponivel)} para o mínimo de ${reais(d.minimo)}. O saldo fica guardado e soma no próximo repasse.`;
  }
  return d.entra
    ? `${reais(d.disponivel)} entram no repasse ${quando}.`
    : `Seu saldo entra no repasse ${quando}.`;
}

function CartaoDoRepasse({ s }: { s: Saque }) {
  const situacao = SITUACAO_DO_SAQUE[s.situacao];
  const etapas = etapasDoSaque(s);
  return (
    <li className="rounded-[16px] border border-white/[0.08] bg-[#0a0a0a] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xl font-semibold text-white tabular-nums">{reais(s.valor_cents)}</p>
          <p className="mt-0.5 text-xs text-white/45">
            Repasse de {dataCurta(s.pedido_em)}
            {s.pix_final ? ` · Pix •••• ${s.pix_final}` : ""}
          </p>
        </div>
        <Selo tom={situacao.tom}>{situacao.rotulo}</Selo>
      </div>
      <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {etapas.map((e) => (
          <li
            key={e.rotulo}
            className={cn(
              "rounded-[10px] border px-3 py-2 text-xs",
              e.erro
                ? "border-red-500/30 bg-red-500/[0.06] text-red-300"
                : e.feita
                  ? "border-white/10 bg-white/[0.03] text-white/80"
                  : "border-dashed border-white/10 text-white/35",
            )}
          >
            <span className="block font-medium">{e.rotulo}</span>
            <span className="block tabular-nums">
              {e.quando ? dataCurta(e.quando) : e.feita ? "✓" : "—"}
            </span>
          </li>
        ))}
      </ol>
      {s.motivo ? <p className="mt-3 text-sm text-red-300/90">Motivo: {s.motivo}</p> : null}
    </li>
  );
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
