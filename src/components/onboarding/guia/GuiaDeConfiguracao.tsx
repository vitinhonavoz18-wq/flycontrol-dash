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
  estadoDoGuia as lerEstadoDoGuia,
  sairDoGuia,
  type EstadoDoGuia,
} from "@/lib/onboarding/guia/guia.functions";
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
export function GuiaDeConfiguracao({ habilitado }: GuiaDeConfiguracaoProps) {
  const router = useRouter();
  const rota = useRouterState({ select: (s) => s.location.pathname });
  const busca = useRouterState({ select: (s) => s.location.search });
  const perguntar = useServerFn(lerEstadoDoGuia);
  const pedirParaSair = useServerFn(sairDoGuia);

  const [estado, setEstado] = useState<EstadoDoGuia | null>(null);
  const [saindo, setSaindo] = useState(false);
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

  // ── A COMEMORAÇÃO ────────────────────────────────────────────────────────
  //
  // Quando a etapa muda, o personagem comemora por um instante. É o retorno
  // que diz "deu certo, pode seguir" — sem ele o guia simplesmente troca de
  // texto e a pessoa não sabe se foi ela que fez alguma coisa.
  useEffect(() => {
    const atual = etapa?.id ?? null;
    const antes = etapaAnterior.current;
    etapaAnterior.current = atual;
    if (!antes || !atual || antes === atual) return;

    setComemorando(true);
    const id = setTimeout(() => setComemorando(false), 1800);
    return () => clearTimeout(id);
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
      router.history.push(enderecoDaEtapa(destino));
    },
    [router],
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

  const recorte = useRecorteDoAlvo(
    // Fora da rota da etapa não há alvo para iluminar — a tela inteira escurece
    // enquanto o redirecionamento acontece.
    etapa && rota === etapa.rota ? etapa.alvo : undefined,
  );

  const sair = useCallback(async () => {
    setSaindo(true);
    try {
      const r = await pedirParaSair({ data: undefined });
      if (r?.ok) {
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
  }, [pedirParaSair]);

  if (!habilitado || !estado?.ativo || !etapa) return null;

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
            emocao={comemorando ? "comemorando" : etapa.emocao}
            titulo={comemorando ? "Boa! Etapa concluída." : etapa.titulo}
            descricao={comemorando ? "Vamos para a próxima." : etapa.descricao}
            aponta="baixo"
            cta={
              rota === etapa.rota
                ? undefined
                : { rotulo: "Ir para essa etapa", onClick: () => irParaAEtapa(etapa) }
            }
            acaoSecundaria={{
              rotulo: saindo ? "Saindo..." : "Terminar depois",
              onClick: () => void sair(),
            }}
          >
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
          </PersonagemDoGuia>
        </div>
      </div>
    </>
  );
}
