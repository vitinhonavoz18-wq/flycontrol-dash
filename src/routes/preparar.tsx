import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { CardDeOpcao } from "@/components/onboarding/CardDeOpcao";
import {
  concluirOnboarding,
  lerOnboarding,
  salvarEtapa,
  type EstadoDoOnboarding,
} from "@/lib/onboarding/onboarding.functions";
import { etapaAnterior, etapasVisiveis, progresso, resumo } from "@/lib/onboarding/fluxo";
import { etapaPorId, type IdDaEtapa, type Respostas } from "@/lib/onboarding/perguntas";

/**
 * "Vamos preparar seu FlyControl" — a configuração guiada que acontece uma vez,
 * logo depois do cadastro.
 *
 * POR QUE ESTA TELA FICA FORA DO PAINEL
 *
 * Ela é uma rota de primeiro nível, e não uma página de dentro do painel, de
 * propósito: aqui não carrega menu lateral, barra inferior, avisos de pedido,
 * cobrança nem tempo real. É a recepção do prédio, não uma sala lá dentro —
 * quem chega para se apresentar não precisa que o escritório inteiro acenda.
 *
 * NÃO É UM QUESTIONÁRIO, É UMA PREPARAÇÃO
 *
 * Cada resposta é gravada assim que é dada. Fechou o navegador, acabou a
 * internet, trocou de celular: ele volta exatamente na pergunta onde parou.
 */

export const Route = createFileRoute("/preparar")({ component: PrepararPage });

type Estado = EstadoDoOnboarding | null;

function PrepararPage() {
  const { user, loading: carregandoLogin } = useAuth();
  const nav = useNavigate();
  const buscar = useServerFn(lerOnboarding);
  const salvar = useServerFn(salvarEtapa);
  const concluir = useServerFn(concluirOnboarding);

  const [estado, setEstado] = useState<Estado>(null);
  const [carregando, setCarregando] = useState(true);
  const [etapaId, setEtapaId] = useState<IdDaEtapa | null>(null);
  const [selecao, setSelecao] = useState<string[]>([]);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [naConclusao, setNaConclusao] = useState(false);
  const topoRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!carregandoLogin && !user) nav({ to: "/login" });
  }, [carregandoLogin, user, nav]);

  // Carrega o estado uma vez e posiciona na etapa certa.
  useEffect(() => {
    if (!user) return;
    let cancelado = false;
    void (async () => {
      try {
        const r = (await buscar({ data: undefined })) as Estado;
        if (cancelado) return;
        if (!r || r.status === "completed") {
          // Já preparado (ou sem loja): não é lugar de ficar.
          nav({ to: "/dashboard" });
          return;
        }
        setEstado(r);
        setEtapaId(r.etapaAtual ?? etapasVisiveis(r.respostas)[0]?.id ?? null);
      } catch {
        if (!cancelado) setErro("Não conseguimos carregar suas informações. Tente novamente.");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [user, buscar, nav]);

  // Memoizado porque é a chave de várias contas abaixo: um objeto novo a cada
  // render faria a barra de progresso e o "voltar" se recalcularem à toa.
  const respostas: Respostas = useMemo(() => estado?.respostas ?? {}, [estado]);
  const etapa = etapaId ? etapaPorId(etapaId) : undefined;

  // Quando muda de pergunta, a seleção passa a ser a que já estava gravada —
  // é isso que faz o "voltar" mostrar o que ele tinha escolhido.
  useEffect(() => {
    if (!etapaId) return;
    setSelecao(respostas[etapaId] ?? []);
    setTexto(respostas.textoLivre?.[etapaId] ?? "");
    setErro(null);
    // Leitor de tela precisa saber que a pergunta trocou.
    topoRef.current?.focus?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapaId, estado]);

  const porcentagem = useMemo(
    () => (naConclusao ? 100 : progresso(respostas, etapaId)),
    [respostas, etapaId, naConclusao],
  );

  const precisaDeTexto = useMemo(
    () => !!etapa?.opcoes.some((o) => o.pedeTexto && selecao.includes(o.valor)),
    [etapa, selecao],
  );

  const podeAvancar = selecao.length > 0 && (!precisaDeTexto || texto.trim().length > 0);

  const alternar = useCallback(
    (valor: string) => {
      if (!etapa) return;
      setSelecao((atual) => {
        if (!etapa.multipla) return [valor];
        return atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor];
      });
    },
    [etapa],
  );

  const avancar = useCallback(async () => {
    if (!etapa || !podeAvancar || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      const novo = (await salvar({
        data: { etapa: etapa.id, escolhidos: selecao, texto },
      })) as Estado;
      if (!novo) {
        // Não avança em silêncio: a resposta não foi gravada, e perder o que
        // ele acabou de responder seria pior do que pedir para tentar de novo.
        setErro("Não conseguimos salvar essa resposta. Tente novamente.");
        return;
      }
      setEstado(novo);
      if (novo.etapaAtual) setEtapaId(novo.etapaAtual);
      else setNaConclusao(true);
    } catch {
      setErro("Não conseguimos salvar essa resposta. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }, [etapa, podeAvancar, salvando, salvar, selecao, texto]);

  const voltar = useCallback(() => {
    if (naConclusao) {
      const visiveis = etapasVisiveis(respostas);
      setNaConclusao(false);
      setEtapaId(visiveis[visiveis.length - 1]?.id ?? null);
      return;
    }
    if (!etapaId) return;
    const anterior = etapaAnterior(respostas, etapaId);
    if (anterior) setEtapaId(anterior);
  }, [naConclusao, respostas, etapaId]);

  const finalizar = useCallback(async () => {
    setSalvando(true);
    setErro(null);
    try {
      const r = await concluir({ data: undefined });
      if (!r?.ok) {
        setErro("Não conseguimos finalizar agora. Tente novamente.");
        return;
      }
      nav({ to: r.destino === "cardapio" ? "/menu" : "/dashboard" });
    } catch {
      setErro("Não conseguimos finalizar agora. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }, [concluir, nav]);

  if (carregandoLogin || carregando) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Carregando</span>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Barra de progresso — sempre à vista, inclusive no celular. */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-5 py-4 backdrop-blur-none">
        <div className="mx-auto max-w-2xl">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              Preparando seu FlyControl
            </p>
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">
              {porcentagem}%
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={porcentagem}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso da preparação"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: `${porcentagem}%` }}
            />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-2xl px-5 pb-40 pt-8">
        {naConclusao ? (
          <Conclusao
            nome={estado?.companyName ?? ""}
            linhas={resumo(respostas)}
            temProdutos={(estado?.produtos ?? 0) > 0}
          />
        ) : (
          etapa && (
            <>
              <h1
                ref={topoRef}
                tabIndex={-1}
                className="text-2xl font-black leading-tight outline-none sm:text-3xl"
              >
                {etapa.pergunta}
              </h1>
              {etapa.explicacao && (
                <p className="mt-2 text-sm text-muted-foreground">{etapa.explicacao}</p>
              )}

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {etapa.opcoes.map((o) => (
                  <CardDeOpcao
                    key={o.valor}
                    opcao={o}
                    marcado={selecao.includes(o.valor)}
                    onEscolher={() => alternar(o.valor)}
                  />
                ))}
              </div>

              {precisaDeTexto && (
                <div className="mt-4">
                  <label
                    htmlFor="texto-livre"
                    className="mb-1.5 block text-sm font-semibold text-foreground"
                  >
                    Qual?
                  </label>
                  <input
                    id="texto-livre"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    maxLength={200}
                    autoComplete="off"
                    placeholder="Escreva aqui"
                    className="w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-base outline-none focus-visible:border-primary"
                  />
                </div>
              )}
            </>
          )
        )}

        {erro && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <span>{erro}</span>
          </div>
        )}
      </main>

      {/* Os botões ficam colados embaixo: no celular o polegar chega neles sem
          precisar rolar até o fim da lista de opções. */}
      <div
        className="fixed inset-x-0 bottom-0 border-t border-border bg-background px-5 py-4"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1rem)" }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={voltar}
            disabled={
              salvando || (!naConclusao && !etapaAnterior(respostas, etapaId ?? "objetivo"))
            }
            className="min-h-12 px-4"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" /> Voltar
          </Button>

          {naConclusao ? (
            <Button
              type="button"
              onClick={finalizar}
              disabled={salvando}
              className="min-h-12 flex-1 text-base font-bold"
            >
              {salvando ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (estado?.produtos ?? 0) > 0 ? (
                "Ir para meu FlyControl"
              ) : (
                "Configurar meu cardápio"
              )}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={avancar}
              disabled={!podeAvancar || salvando}
              className="min-h-12 flex-1 text-base font-bold"
            >
              {salvando ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <>
                  Continuar <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Conclusao({
  nome,
  linhas,
  temProdutos,
}: {
  nome: string;
  linhas: { icone: string; texto: string }[];
  temProdutos: boolean;
}) {
  return (
    <div>
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/15">
        <Check className="h-7 w-7 text-primary" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-black leading-tight sm:text-3xl">
        Seu FlyControl está quase pronto!
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Já entendemos como {nome ? <strong className="text-foreground">{nome}</strong> : "sua loja"}{" "}
        funciona. Agora vamos preparar os últimos detalhes para você começar.
      </p>

      <ul className="mt-6 space-y-2">
        {linhas.map((l) => (
          <li
            key={l.texto}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              {l.icone}
            </span>
            <span className="text-sm font-semibold">{l.texto}</span>
          </li>
        ))}
      </ul>

      {!temProdutos && (
        <p className="mt-6 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          O próximo passo é o seu cardápio. Sem produtos cadastrados, o cliente não tem o que pedir
          — é a loja de porta aberta e prateleira vazia.
        </p>
      )}
    </div>
  );
}
