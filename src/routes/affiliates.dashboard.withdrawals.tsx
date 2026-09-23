import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, CircleAlert, KeyRound, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import {
  BotaoPrincipal,
  BotaoSecundario,
  Carregando,
  Erro,
  Paginacao,
  Painel,
  Selo,
  TituloDaPagina,
  Vazio,
  classeDoCampo,
} from "@/components/afiliados/portal/Pecas";
import { usePerfil } from "@/components/afiliados/portal/perfilContexto";
import {
  POR_PAGINA,
  solicitarSaque,
  useResumoDoAfiliado,
  useSaques,
  type Saque,
} from "@/lib/afiliados/portal";
import { SITUACAO_DO_SAQUE, etapasDoSaque } from "@/lib/afiliados/situacoes";
import {
  dataCurta,
  mascararPix,
  mensagemDeErro,
  reais,
  TIPOS_DE_PIX,
} from "@/lib/afiliados/validacao";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/affiliates/dashboard/withdrawals")({ component: Saques });

/**
 * O saque é sempre do SALDO DISPONÍVEL INTEIRO, calculado pelo banco. O
 * campo de valor aparece, mas não se digita: o número que ele mostra vai
 * junto no pedido só como conferência. Se o saldo mudou entre abrir a tela
 * e clicar, o banco recusa e avisa o valor novo — em vez de sair um saque
 * diferente do que a pessoa leu.
 */
function Saques() {
  const perfil = usePerfil();
  const resumo = useResumoDoAfiliado();
  const [pagina, setPagina] = useState(1);
  const saques = useSaques(pagina);
  const queryClient = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const disponivel = resumo.data?.disponivel_cents ?? 0;
  const minimo = perfil.saque_minimo_cents;
  const temPix = Boolean(perfil.pix_chave);
  // A primeira página vem do mais novo para o mais antigo: um saque em
  // andamento, se existir, está nela.
  const emAndamento = (pagina === 1 ? saques.data?.itens : undefined)?.find(
    (s) => s.situacao === "requested" || s.situacao === "approved",
  );

  const regras = [
    { ok: disponivel > 0, texto: "Ter saldo disponível" },
    { ok: disponivel >= minimo, texto: `Saldo mínimo de ${reais(minimo)}` },
    { ok: temPix, texto: "Chave Pix cadastrada" },
    { ok: !emAndamento, texto: "Nenhum outro saque em andamento" },
  ];
  const pode = resumo.isSuccess && saques.isSuccess && regras.every((r) => r.ok);
  const tipoDoPix = TIPOS_DE_PIX.find((t) => t.valor === perfil.pix_tipo)?.rotulo ?? "Pix";

  async function confirmar() {
    setEnviando(true);
    try {
      await solicitarSaque(disponivel);
      toast.success("Saque solicitado! Acompanhe o andamento abaixo.");
      setConfirmando(false);
      setPagina(1);
    } catch (erro) {
      toast.error(mensagemDeErro(erro));
    } finally {
      setEnviando(false);
      // Sucesso ou recusa, o saldo pode ter mudado: busca tudo de novo.
      await queryClient.invalidateQueries({ queryKey: ["afiliado"] });
    }
  }

  return (
    <div className="space-y-6">
      <TituloDaPagina
        titulo="Saques"
        texto="Transfira suas comissões disponíveis para a sua conta via Pix."
      />

      {resumo.isLoading ? (
        <Carregando linhas={2} altura="h-28" />
      ) : resumo.isError ? (
        <Erro mensagem={mensagemDeErro(resumo.error)} tentarDeNovo={() => resumo.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Painel destaque>
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
              <Wallet className="size-4" /> Saldo disponível
            </span>
            <p
              className="mt-2 text-4xl font-semibold tracking-[-0.03em] text-white tabular-nums"
              data-testid="saldo-disponivel"
            >
              {reais(disponivel)}
            </p>
            {resumo.data && resumo.data.pendente_cents > 0 ? (
              <p className="mt-1 text-sm text-white/50">
                + {reais(resumo.data.pendente_cents)} pendente (libera {perfil.dias_para_liberar}{" "}
                dias após o pagamento do cliente)
              </p>
            ) : null}

            <div className="mt-6 space-y-4">
              <div>
                <span className="block text-sm font-medium text-white/85">Chave Pix</span>
                {temPix ? (
                  <div className="mt-1.5 flex items-center justify-between gap-3 rounded-[12px] border border-white/10 bg-[#0d0d0d] px-4 py-3">
                    <span className="min-w-0 truncate text-sm text-white">
                      {tipoDoPix} ·{" "}
                      <span className="font-mono">{mascararPix(perfil.pix_chave)}</span>
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
              <div>
                <label htmlFor="valor" className="block text-sm font-medium text-white/85">
                  Valor do saque
                </label>
                <input
                  id="valor"
                  readOnly
                  value={reais(disponivel)}
                  className={cn(classeDoCampo, "mt-1.5 cursor-default font-semibold tabular-nums")}
                  aria-describedby="valor-ajuda"
                />
                <p id="valor-ajuda" className="mt-1 text-xs text-white/45">
                  O saque é sempre do saldo disponível inteiro.
                </p>
              </div>

              {confirmando ? (
                <div
                  className="rounded-[14px] border border-[#ff5a00]/35 bg-[#ff5a00]/[0.06] p-4"
                  role="alertdialog"
                  aria-label="Confirmar saque"
                >
                  <p className="text-sm text-white">
                    Confirmar saque de <strong className="tabular-nums">{reais(disponivel)}</strong>{" "}
                    para o Pix <span className="font-mono">{mascararPix(perfil.pix_chave)}</span>?
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <BotaoSecundario
                      type="button"
                      onClick={() => setConfirmando(false)}
                      disabled={enviando}
                    >
                      Voltar
                    </BotaoSecundario>
                    <BotaoPrincipal type="button" onClick={confirmar} disabled={enviando}>
                      {enviando ? "Enviando..." : "Confirmar"}
                    </BotaoPrincipal>
                  </div>
                </div>
              ) : (
                <BotaoPrincipal
                  type="button"
                  onClick={() => setConfirmando(true)}
                  disabled={!pode}
                  className="w-full"
                >
                  Solicitar saque
                </BotaoPrincipal>
              )}
            </div>
          </Painel>

          <Painel>
            <h2 className="text-sm font-medium text-white">Para pedir o saque</h2>
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
              Depois de pedido, o saque passa pela conferência da equipe e é pago na chave Pix
              mostrada no pedido.
            </p>
          </Painel>
        </div>
      )}

      <section aria-label="Histórico de saques">
        <h2 className="mb-3 text-lg font-medium">Histórico</h2>
        {saques.isLoading ? (
          <Carregando linhas={3} />
        ) : saques.isError ? (
          <Erro mensagem={mensagemDeErro(saques.error)} tentarDeNovo={() => saques.refetch()} />
        ) : !saques.data || saques.data.itens.length === 0 ? (
          <Vazio
            titulo="Nenhum saque ainda"
            texto="Seus pedidos de saque aparecem aqui, com cada etapa."
          />
        ) : (
          <>
            <ul className="space-y-3">
              {saques.data.itens.map((s) => (
                <CartaoDoSaque key={s.id} s={s} />
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

function CartaoDoSaque({ s }: { s: Saque }) {
  const situacao = SITUACAO_DO_SAQUE[s.situacao];
  const etapas = etapasDoSaque(s);
  return (
    <li className="rounded-[16px] border border-white/[0.08] bg-[#0a0a0a] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xl font-semibold text-white tabular-nums">{reais(s.valor_cents)}</p>
          <p className="mt-0.5 text-xs text-white/45">
            Pedido em {dataCurta(s.pedido_em)}
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
