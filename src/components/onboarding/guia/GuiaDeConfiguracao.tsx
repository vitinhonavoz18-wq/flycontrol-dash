import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  enderecoDaEtapa,
  etapaDoGuiaPorId,
  rotaPermitidaNoGuia,
  type EtapaDoGuia,
} from "@/lib/onboarding/guia/etapas";
import {
  ativarPlanoPeloGuia,
  estadoDoGuia as lerEstadoDoGuia,
  registrarDecisao,
  sairDoGuia,
  type EstadoDoGuia,
} from "@/lib/onboarding/guia/guia.functions";
import { registrarEvento } from "@/lib/onboarding/guia/eventos";
import { NARRACAO_DO_TREINO } from "@/lib/onboarding/guia/pedidoDeDemonstracao";
import { publicarPedidoDeTreino, usePedidoDeTreino } from "@/lib/onboarding/guia/treinoNoQuadro";
import { usePedidoDeDemonstracao } from "./usePedidoDeDemonstracao";
import { CentralDeAjuda } from "./CentralDeAjuda";
import { ChecklistDeProntidao } from "./ChecklistDeProntidao";
import { Holofote } from "./Holofote";
import { PersonagemDoGuia } from "./PersonagemDoGuia";
import { ProgressoDoGuia } from "./ProgressoDoGuia";
import { useRecorteDoAlvo } from "./useRecorteDoAlvo";

/**
 * De quanto em quanto tempo o guia confere a loja no banco.
 *
 * A etapa não fecha por clique: ela fecha quando o dado existe. Então alguém
 * precisa ir olhar. Dois segundos é rápido o bastante para parecer instantâneo
 * depois que o lojista salva, e espaçado o bastante para não virar uma
 * consulta por segundo em cada loja aberta.
 */
const INTERVALO_MS = 2000;

export type GuiaDeConfiguracaoProps = {
  /** `false` para contas que não têm loja para configurar (administradores). */
  habilitado: boolean;
  /** A loja aberta no momento — usada para montar o pedido de treino. */
  tenantId?: string | null;
};

/**
 * O guia obrigatório de primeira configuração da loja.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * O QUE ELE É, E O QUE ELE NÃO É
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NÃO é um tutorial que passa slides. Cada etapa só fecha quando o dado
 * existe no banco de verdade: a loja TEM telefone, existe UMA categoria,
 * existe UM produto com preço. Clicar em "próximo" não fecha nada, porque
 * não existe "próximo".
 *
 * É a diferença entre o garçom anotar "entregue" e o prato estar na mesa.
 *
 * COMO ELE SABE QUE A ETAPA FECHOU
 *
 * Ele pergunta ao servidor de dois em dois segundos, e o servidor vai olhar a
 * loja. Assim que o lojista salva o formulário, a etapa fecha sozinha e o
 * guia anda — sem ele precisar avisar que terminou.
 *
 * POR QUE ELE PODE BLOQUEAR A TELA, MAS NUNCA TRANCAR A PESSOA
 *
 * Enquanto o guia está no ar, o resto do painel fica escuro e sem toque: um
 * lojista novo diante de doze abas não sabe por onde começar, e mexer na
 * errada primeiro é o que faz a loja ficar meio configurada para sempre.
 *
 * Mas há sempre a saída "Terminar depois", e Documentação, Plano e cobrança e
 * Configurações continuam abertas. Guia sem porta de saída não é guia, é
 * sequestro — e a saída vira ligar para o suporte.
 */
export function GuiaDeConfiguracao({ habilitado, tenantId = null }: GuiaDeConfiguracaoProps) {
  const router = useRouter();
  const rota = useRouterState({ select: (s) => s.location.pathname });
  const busca = useRouterState({ select: (s) => s.location.search });
  const perguntar = useServerFn(lerEstadoDoGuia);
  const pedirParaSair = useServerFn(sairDoGuia);
  const gravarDecisao = useServerFn(registrarDecisao);
  const pedirAtivacao = useServerFn(ativarPlanoPeloGuia);

  const [estado, setEstado] = useState<EstadoDoGuia | null>(null);
  const [saindo, setSaindo] = useState(false);
  const [ativando, setAtivando] = useState(false);
  const [falhaDaEtapa, setFalhaDaEtapa] = useState<string | null>(null);
  /**
   * Trava síncrona contra o toque repetido.
   *
   * `useState` só reflete no render seguinte, e dois toques rápidos acontecem
   * antes disso — é a campainha tocada três vezes antes de alguém chegar na
   * porta. Gravar a mesma decisão duas vezes não estraga nada (o valor é o
   * mesmo), mas manda duas requisições e pisca o botão.
   */
  const gravando = useRef(false);
  const [aguardando, setAguardando] = useState(false);
  /** A última etapa vista, para comemorar quando ela muda. */
  const etapaAnterior = useRef<string | null>(null);
  const [comemorando, setComemorando] = useState(false);

  // ── A LEITURA ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!habilitado) {
      setEstado(null);
      return;
    }
    let cancelado = false;

    const conferir = async () => {
      try {
        const r = await perguntar({ data: undefined });
        if (!cancelado) setEstado(r);
      } catch {
        // Não conseguimos perguntar: o guia some em vez de prender. Uma falha
        // de rede não pode trancar o lojista fora do próprio painel — ele
        // volta a ver o guia na próxima vez que a pergunta funcionar.
        if (!cancelado) setEstado(null);
      }
    };

    void conferir();
    const relogio = setInterval(conferir, INTERVALO_MS);
    return () => {
      cancelado = true;
      clearInterval(relogio);
    };
  }, [habilitado, perguntar]);

  const etapa: EtapaDoGuia | null = estado?.etapaAtual
    ? (etapaDoGuiaPorId(estado.etapaAtual) ?? null)
    : null;

  // ── O PEDIDO DE TREINO ───────────────────────────────────────────────────
  //
  // Só existe durante a etapa dele. Ele é montado com um produto REAL do
  // cardápio e entregue ao quadro de pedidos pelo balcão de recados — ver
  // `treinoNoQuadro.ts`. Nunca é gravado no banco.
  const naEtapaDoTreino = etapa?.id === "pedido_teste";
  const pedidoDeTreino = usePedidoDeDemonstracao(tenantId, naEtapaDoTreino);
  const treinoNoQuadro = usePedidoDeTreino();

  useEffect(() => {
    publicarPedidoDeTreino(naEtapaDoTreino ? pedidoDeTreino : null);
  }, [naEtapaDoTreino, pedidoDeTreino]);

  // O card só sai do quadro quando o lojista o leva até "entregue". É esse
  // gesto — o arrastar de verdade, no quadro de verdade — que fecha a etapa.
  const treinoTerminou = treinoNoQuadro?.status === "entregue";

  // ── A COMEMORAÇÃO ────────────────────────────────────────────────────────
  //
  // Quando a etapa muda, o personagem comemora por um instante. É o retorno
  // que diz "deu certo, pode seguir" — sem ele o guia simplesmente troca de
  // texto e a pessoa não sabe se foi ela que fez alguma coisa.
  useEffect(() => {
    const atual = etapa?.id ?? null;
    const antes = etapaAnterior.current;
    etapaAnterior.current = atual;

    if (atual) registrarEvento("onboarding_step_started", { etapa: atual });
    if (antes && antes !== atual) {
      registrarEvento("onboarding_step_completed", {
        etapa: antes,
        concluidas: estado?.concluidas.length,
      });
    }
    if (antes && !atual) {
      registrarEvento("onboarding_completed", { concluidas: estado?.concluidas.length });
    }

    if (!antes || !atual || antes === atual) return;

    setComemorando(true);
    const id = setTimeout(() => setComemorando(false), 1800);
    return () => clearTimeout(id);
    // `estado` de propósito fora das dependências: ele muda a cada leitura
    // de 2 segundos, e incluí-lo dispararia a comemoração sem a etapa mudar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapa?.id]);

  // ── A PROTEÇÃO DE ROTA ───────────────────────────────────────────────────
  //
  // Bloquear o clique não basta: nada impede alguém de digitar /finance na
  // barra de endereços. É trancar a porta da frente e deixar a lateral
  // encostada.
  /** A aba aberta agora, quando a tela tem abas. */
  const abaAberta = new URLSearchParams(typeof busca === "string" ? busca : "").get("aba");

  const irParaAEtapa = useCallback(
    (destino: EtapaDoGuia) => {
      // Pelo histórico, e não por `nav({ to })`, porque o destino é calculado
      // a partir do roteiro (texto comum) e não é uma das rotas literais que
      // o roteador sabe conferir em tempo de compilação. `enderecoDaEtapa` já
      // monta o endereço com a aba.
      router.history.push(enderecoDaEtapa(destino, typeof busca === "string" ? busca : ""));
    },
    [router, busca],
  );

  useEffect(() => {
    if (!etapa || !estado?.ativo) return;

    // Rota errada: traz de volta.
    if (!rotaPermitidaNoGuia(rota, etapa)) {
      irParaAEtapa(etapa);
      return;
    }
    // Rota certa, aba errada: "Minha Loja" tem sete abas, e o campo desta
    // etapa está escondido atrás de uma delas. Iluminar o que não está na
    // tela é apontar o holofote para a coxia.
    if (etapa.aba && rota === etapa.rota && abaAberta !== etapa.aba) {
      irParaAEtapa(etapa);
    }
  }, [etapa, estado?.ativo, rota, abaAberta, irParaAEtapa]);

  /** Estamos na tela (e na aba) onde esta etapa acontece? */
  const naTelaDaEtapa = !!etapa && rota === etapa.rota && (!etapa.aba || abaAberta === etapa.aba);

  /**
   * A escolha "configurar ou dispensar" fica visível até o lojista decidir.
   *
   * Quem clica em "Configurar adicionais" está dizendo "vou cadastrar" — e a
   * partir daí a pergunta some e fica só o holofote em cima do botão de
   * cadastrar. Deixar "Não utilizo adicionais" na tela enquanto ele já está
   * cadastrando é continuar oferecendo a saída para quem já entrou.
   *
   * Volta a aparecer se a etapa mudar: cada etapa faz a sua pergunta do zero.
   */
  const [mostrarEscolha, setMostrarEscolha] = useState(true);
  useEffect(() => {
    setMostrarEscolha(true);
  }, [etapa?.id]);

  const recorte = useRecorteDoAlvo(
    // Fora da rota da etapa não há alvo para iluminar — a tela inteira escurece
    // enquanto o redirecionamento acontece.
    // Sem alvo enquanto a pergunta da escolha está na tela: acender o botão
    // de cadastrar antes de o lojista dizer que USA adicionais seria apontar
    // o caminho antes de perguntar se ele quer ir.
    naTelaDaEtapa && !(etapa?.escolha && mostrarEscolha) ? etapa?.alvo : undefined,
  );

  /**
   * Grava uma escolha do lojista e relê o estado na hora.
   *
   * Reler logo em seguida (em vez de esperar o relógio de 2 segundos) é o que
   * faz o guia responder na hora do clique. Mas quem decide se a etapa fechou
   * continua sendo o servidor: a tela não marca nada por conta própria.
   */
  const escolher = useCallback(
    async (chave: string, valor: string) => {
      if (gravando.current) return;
      gravando.current = true;
      setAguardando(true);
      try {
        const r = await gravarDecisao({ data: { chave, valor } });
        if (!r?.ok) {
          toast.error("Não conseguimos salvar sua escolha. Tente de novo.");
          return;
        }
        setEstado(await perguntar({ data: undefined }));
      } catch {
        toast.error("Não conseguimos salvar sua escolha. Tente de novo.");
      } finally {
        gravando.current = false;
        setAguardando(false);
      }
    },
    [gravarDecisao, perguntar],
  );

  /**
   * Liga o plano — Fase 7.
   *
   * Quem faz o trabalho é a função de cobrança que já existe. Aqui só há o
   * estado de espera, o aviso de falha e a releitura. Abrir a tela NÃO fecha
   * a etapa: quem fecha é o servidor confirmando que a assinatura está de pé.
   */
  const ativarPlano = useCallback(async () => {
    if (gravando.current) return;
    gravando.current = true;
    setAtivando(true);
    setFalhaDaEtapa(null);
    registrarEvento("onboarding_step_started", { etapa: "plano_cents" });
    try {
      const r = await pedirAtivacao({ data: undefined });
      if (!r?.ok) {
        registrarEvento("onboarding_step_error", { etapa: "plano_cents", motivo: r?.motivo });
        setFalhaDaEtapa(
          "Não conseguimos confirmar a ativação do seu plano. Tente de novo em instantes.",
        );
        return;
      }
      setEstado(await perguntar({ data: undefined }));
    } catch {
      registrarEvento("onboarding_step_error", { etapa: "plano_cents", motivo: "rede" });
      setFalhaDaEtapa(
        "Não conseguimos confirmar a ativação do seu plano. Tente de novo em instantes.",
      );
    } finally {
      gravando.current = false;
      setAtivando(false);
    }
  }, [pedirAtivacao, perguntar]);

  const treinoJaGravado = useRef(false);
  useEffect(() => {
    if (!naEtapaDoTreino || !treinoTerminou || treinoJaGravado.current) return;
    treinoJaGravado.current = true;
    void escolher("pedido_teste", "feito");
  }, [naEtapaDoTreino, treinoTerminou, escolher]);

  const sair = useCallback(async () => {
    setSaindo(true);
    try {
      const r = await pedirParaSair({ data: undefined });
      if (r?.ok) {
        registrarEvento("onboarding_abandoned", {
          etapa: etapa?.id,
          concluidas: estado?.concluidas.length,
        });
        setEstado(null);
        toast.success("Tudo bem. O que falta continua no 'Prepare sua loja', no painel.");
      } else {
        toast.error("Não foi possível sair do guia agora. Tente de novo.");
      }
    } catch {
      toast.error("Não foi possível sair do guia agora. Tente de novo.");
    } finally {
      setSaindo(false);
    }
  }, [pedirParaSair, etapa?.id, estado?.concluidas.length]);

  // O que o personagem diz durante o treino depende da coluna em que o card
  // está agora — é ele que conduz cada passo do quadro.
  const narracao =
    naEtapaDoTreino && treinoNoQuadro ? NARRACAO_DO_TREINO[treinoNoQuadro.status] : undefined;

  if (!habilitado) return null;

  // Guia encerrado: o mesmo personagem fica de plantão no canto, como atalho.
  // Durante o guia ele NÃO aparece — dois flutuantes disputando o mesmo canto,
  // um deles oferecendo saída do que o outro está pedindo, é convite a errar.
  if (!estado?.ativo || !etapa) return <CentralDeAjuda />;

  return (
    <>
      <Holofote recorte={recorte} />

      {/* O balão flutua acima do escuro e abaixo dos diálogos.
          `pointer-events-none` na moldura e `auto` só no cartão: assim a área
          vazia em volta do personagem não rouba o toque de quem está mirando
          o campo aceso logo atrás. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[var(--z-guia-balao)] flex justify-end p-3 sm:p-5"
        style={{ paddingBottom: "calc(var(--bottom-nav-offset) + 0.75rem)" }}
      >
        <div className="pointer-events-none w-full max-w-md md:max-w-lg">
          <PersonagemDoGuia
            emocao={comemorando ? "comemorando" : (narracao?.emocao ?? etapa.emocao)}
            titulo={comemorando ? "Boa! Etapa concluída." : (narracao?.titulo ?? etapa.titulo)}
            descricao={
              comemorando ? "Vamos para a próxima." : (narracao?.descricao ?? etapa.descricao)
            }
            aponta="baixo"
            pergunta={etapa.escolha?.pergunta}
            cta={
              // Três casos, nesta ordem:
              //   1. a etapa oferece escolha e já estamos na tela dela:
              //      o botão é a própria escolha;
              //   2. estamos noutra tela: o botão leva até a etapa;
              //   3. a etapa só aponta um campo: nenhum botão principal — o
              //      que fecha a etapa é o lojista salvar o formulário.
              etapa.id === "plano_cents" && naTelaDaEtapa
                ? {
                    rotulo: ativando ? "Estamos confirmando sua ativação..." : "Ativar meu plano",
                    onClick: () => void ativarPlano(),
                  }
                : etapa.escolha && naTelaDaEtapa
                  ? {
                      rotulo: aguardando ? "Salvando..." : etapa.escolha.configurar,
                      onClick: () => {
                        if (etapa.id === "prontidao") {
                          void escolher(etapa.escolha!.chave, etapa.escolha!.valor);
                        } else {
                          // "Configurar adicionais" não grava decisão nenhuma:
                          // ele só leva o lojista até a tela. Quem fecha a
                          // etapa é o complemento aparecendo no banco.
                          setMostrarEscolha(false);
                        }
                      },
                    }
                  : naTelaDaEtapa
                    ? undefined
                    : { rotulo: "Ir para essa etapa", onClick: () => irParaAEtapa(etapa) }
            }
            alternativa={
              etapa.escolha?.dispensar && naTelaDaEtapa && mostrarEscolha
                ? {
                    rotulo: etapa.escolha.dispensar,
                    onClick: () => void escolher(etapa.escolha!.chave, etapa.escolha!.valor),
                  }
                : undefined
            }
            acaoSecundaria={
              etapa.id === "prontidao" || etapa.id === "conclusao"
                ? undefined
                : {
                    rotulo: saindo ? "Saindo..." : "Terminar depois",
                    onClick: () => void sair(),
                  }
            }
          >
            {falhaDaEtapa && (
              // NUNCA avança em silêncio quando falha: o lojista precisa saber
              // que não deu certo, e ter como tentar de novo sem recarregar.
              <p
                role="alert"
                className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
              >
                {falhaDaEtapa}
              </p>
            )}

            {etapa.id === "prontidao" || etapa.id === "conclusao" ? (
              <ChecklistDeProntidao concluidas={estado.concluidas} />
            ) : (
              <>
                {/* O que falta, dito em uma linha. A pessoa não deve precisar
                    adivinhar qual campo está faltando para a etapa fechar. */}
                <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-xs font-semibold text-foreground">
                  {etapa.comoConcluir}
                </p>

                <ProgressoDoGuia
                  concluidas={estado.concluidas}
                  etapaAtual={etapa.id}
                  progresso={estado.progresso}
                />
              </>
            )}
          </PersonagemDoGuia>
        </div>
      </div>
    </>
  );
}
