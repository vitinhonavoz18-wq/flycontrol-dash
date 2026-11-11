import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Anda pela lista da vitrine: a cada `intervaloMs`, o próximo produto.
 *
 * Um relógio só, que é desmontado e remontado a cada troca. Assim nunca
 * existem dois relógios rodando ao mesmo tempo (o defeito clássico de
 * vitrine que "acelera" depois de um tempo), e parar é só desligar.
 *
 * O PRODUTO NA TELA É LEMBRADO PELO NOME, NÃO PELA POSIÇÃO
 *
 * A lista pode mudar no meio do caminho: os produtos de verdade chegam do
 * servidor um instante depois de a página abrir, ou uma imagem quebrada sai
 * da roda. Se a vitrine guardasse só "estou no 3º", a chegada da lista nova
 * trocaria o produto na hora, fora do ritmo. Guardando QUAL produto está na
 * tela, ele fica até o fim dos seus 3 segundos, e só então a vitrine segue
 * para o próximo da lista nova.
 *
 * Quando `ativo` é falso (aba escondida, vitrine fora da tela, pessoa pediu
 * menos animação), o relógio para. Ao voltar, o produto atual ganha os 3
 * segundos inteiros — ninguém volta à aba e vê uma troca instantânea.
 */
export function useProductRotation<T extends { id: string }>(
  sequencia: readonly T[],
  {
    intervaloMs,
    ativo,
    removidos,
  }: { intervaloMs: number; ativo: boolean; removidos?: ReadonlySet<string> },
): T {
  const [atual, setAtual] = useState<T>(() => sequencia[0]);
  // A lista mais recente, para o relógio consultar no momento da troca (e
  // não a lista de quando ele foi ligado).
  const listaRef = useRef(sequencia);
  listaRef.current = sequencia;

  // Imagem do produto da tela quebrou: não dá para esperar 3 segundos
  // mostrando um buraco — segue já para o próximo.
  const quebrou = !!atual && !!removidos?.has(atual.id);
  useEffect(() => {
    if (!quebrou) return;
    const lista = listaRef.current;
    setAtual(lista[0]);
  }, [quebrou]);

  const temRoda = sequencia.length >= 2;
  useEffect(() => {
    if (!ativo || !temRoda) return;
    const relogio = window.setTimeout(() => {
      const lista = listaRef.current;
      const aqui = lista.findIndex((it) => it.id === atual.id);
      // Fora da lista (era o produto reserva, e a lista de verdade chegou):
      // o próximo é o primeiro da lista nova.
      setAtual(lista[(aqui + 1) % lista.length]);
    }, intervaloMs);
    return () => window.clearTimeout(relogio);
  }, [atual, ativo, intervaloMs, temRoda]);

  return atual ?? sequencia[0];
}

/**
 * A vitrine está à vista? Falso quando a aba está escondida ou quando a
 * pessoa rolou a página para longe do topo — aí não faz sentido gastar
 * bateria do celular animando o que ninguém vê.
 */
export function useVitrineVisivel(alvo: RefObject<HTMLElement | null>): boolean {
  const [naTela, setNaTela] = useState(true);
  const [abaVisivel, setAbaVisivel] = useState(true);

  useEffect(() => {
    const aoMudarAba = () => setAbaVisivel(document.visibilityState !== "hidden");
    aoMudarAba();
    document.addEventListener("visibilitychange", aoMudarAba);
    return () => document.removeEventListener("visibilitychange", aoMudarAba);
  }, []);

  useEffect(() => {
    const el = alvo.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(([e]) => setNaTela(e.isIntersecting), {
      threshold: 0.05,
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, [alvo]);

  return naTela && abaVisivel;
}
