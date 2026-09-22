import { DndContext } from "@dnd-kit/core";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FinalizeDropZone } from "./FinalizeDropZone";
import {
  ALLOWED_TRANSITIONS,
  canFinalizeFrom,
  canMoveOrder,
  type MoveTarget,
} from "./orderStatusConfig";

/**
 * Finalizar é a única movimentação que TIRA o pedido do quadro: ele some da
 * mesa de trabalho e passa a existir só no histórico. Por isso ela é a que
 * mais dói quando acontece por engano — e a que mais frustra quando não
 * acontece.
 */

function renderZona(active: boolean) {
  return render(
    <DndContext>
      <FinalizeDropZone active={active} />
    </DndContext>,
  );
}

describe("quem pode ser finalizado", () => {
  it("pedido novo NÃO pode ir direto para entregue", () => {
    // Ele nem foi aceito: ninguém preparou, ninguém entregou. Finalizar dali
    // é sempre engano — e engano caro, porque o pedido some do quadro como
    // se tivesse sido cumprido.
    expect(canFinalizeFrom("novo")).toBe(false);
    expect(ALLOWED_TRANSITIONS.novo).not.toContain("entregue");

    const r = canMoveOrder("novo", "entregue");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toContain("Aceite o pedido antes de finalizar");
  });

  it("saiu para entrega pode finalizar", () => {
    expect(canFinalizeFrom("saiu")).toBe(true);
    expect(canMoveOrder("saiu", "entregue").allowed).toBe(true);
  });

  it("em preparo também finaliza — balcão e mesa não têm entregador", () => {
    // Exigir a passagem por "Saiu para entrega" obrigaria o lojista a mentir
    // no quadro para fechar uma retirada no balcão.
    expect(canFinalizeFrom("preparando")).toBe(true);
    expect(canMoveOrder("preparando", "entregue").allowed).toBe(true);
  });

  it("pedido já finalizado ou cancelado não volta pelo quadro", () => {
    expect(canFinalizeFrom("entregue")).toBe(false);
    expect(canFinalizeFrom("cancelado")).toBe(false);
    expect(canMoveOrder("entregue", "preparando").allowed).toBe(false);
  });

  it("voltar uma etapa continua permitido", () => {
    // Pedido devolvido pela cozinha precisa voltar para "Em preparo", e
    // pedido marcado como saído por engano precisa voltar.
    expect(canMoveOrder("saiu", "preparando").allowed).toBe(true);
    expect(canMoveOrder("preparando", "novo").allowed).toBe(true);
  });

  it("soltar na própria coluna não é tratado como erro", () => {
    const r = canMoveOrder("preparando", "preparando");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("O pedido já está nesta etapa.");
  });

  it("toda etapa do quadro tem para onde ir", () => {
    for (const [de, paras] of Object.entries(ALLOWED_TRANSITIONS)) {
      expect(paras.length).toBeGreaterThan(0);
      // Ninguém pode ter a si mesmo como destino.
      expect(paras).not.toContain(de as MoveTarget);
    }
  });
});

describe("a faixa de finalizar", () => {
  it("não existe quando nada está sendo arrastado", () => {
    renderZona(false);
    expect(screen.queryByRole("button", { name: /finalizar pedido/i })).toBeNull();
  });

  it("aparece com ícone e texto, não só com a cor verde", () => {
    // Quem não distingue verde precisa entender igual.
    renderZona(true);
    const zona = screen.getByRole("button", { name: /finalizar pedido/i });
    expect(zona).toBeTruthy();
    expect(zona.textContent).toContain("Arraste aqui para finalizar");
    expect(zona.querySelector("svg")).toBeTruthy();
  });

  it("é uma faixa deitada embaixo, não uma pastilha nem uma coluna lateral", () => {
    // Acertar um alvo pequeno com o pedido na mão, no celular, no meio do
    // movimento da loja, é o que fazia o lojista achar que o sistema não
    // funcionava. E a lateral direita cobria justamente "Saiu para entrega",
    // que é de onde o pedido sai para ser finalizado.
    const { container } = renderZona(true);
    const moldura = container.querySelector(".faixa-finalizar") as HTMLElement;
    expect(moldura).toBeTruthy();
    expect(moldura.className).not.toContain("inset-y-0");
    expect(moldura.className).not.toContain("right-0");
  });

  it("fica acima da barra inferior, nunca atrás dela", () => {
    const { container } = renderZona(true);
    const moldura = container.querySelector(".faixa-finalizar") as HTMLElement;
    expect(moldura.className).toContain("z-[var(--z-overlay)]");
  });

  it("captura o toque enquanto vale, e devolve quando está saindo", () => {
    // Ela é o alvo, então precisa capturar durante o arraste. Mas continua
    // montada por 200ms na animação de saída — e nesse intervalo tem de
    // devolver o toque, senão engole o primeiro clique do lojista logo
    // depois de soltar o pedido.
    const { container } = renderZona(true);
    const alvo = container.querySelector(".faixa-finalizar") as HTMLElement;
    expect(alvo.className).toContain("pointer-events-auto");

    const fonte = readFileSync("src/components/orders/FinalizeDropZone.tsx", "utf8");
    expect(fonte).toMatch(/active \? "pointer-events-auto" : "pointer-events-none"/);
  });

  it("muda o texto quando o pedido entra nela", () => {
    const fonte = readFileSync("src/components/orders/FinalizeDropZone.tsx", "utf8");
    expect(fonte).toContain('isOver ? "Solte para finalizar" : "Arraste aqui para finalizar"');
  });
});

describe("onde a faixa para na tela", () => {
  const css = readFileSync("src/styles.css", "utf8");
  const regra = css.slice(css.indexOf(".faixa-finalizar {"));

  it("no celular ela encosta ACIMA da barra de navegação", () => {
    // `bottom: 0` a jogaria atrás da barra de baixo, e o lojista soltaria o
    // pedido em cima de "Início" ou "Cardápio" sem querer. O token já soma a
    // área de segurança do aparelho — a tarja do iPhone, o gesto do Android.
    expect(regra).toMatch(/bottom: calc\(var\(--bottom-nav-offset\) \+ [^)]*\);/);
  });

  it("no computador ela começa depois do menu lateral", () => {
    // Lá não existe barra de baixo (o <nav> é `md:hidden`); quem ocupa a
    // lateral é o menu, e passar por cima dele esconderia a navegação.
    expect(regra).toContain("left: calc(var(--sidebar-width)");
    expect(regra).toContain("env(safe-area-inset-bottom");
  });

  it("no celular deitado ela respeita o trilho estreito de ícones", () => {
    expect(regra).toContain("var(--landscape-rail-width)");
  });

  it("a largura do menu lateral do CSS e a do layout continuam iguais", () => {
    // `--sidebar-width` existe só para a faixa saber onde o menu termina. Se
    // alguém trocar o `w-72` do <aside> e esquecer do token, a faixa passa a
    // cobrir o menu — ou a deixar uma tira branca do lado.
    expect(css).toContain("--sidebar-width: 18rem"); // 18rem = w-72
    const layout = readFileSync("src/routes/_app.tsx", "utf8");
    const aside = layout.slice(
      layout.indexOf("<aside"),
      layout.indexOf(">", layout.indexOf("<aside")),
    );
    expect(aside).toContain("w-72");
  });

  it("a altura é grande o bastante para o dedo, e maior no computador", () => {
    expect(css).toContain("--faixa-finalizar-altura: 6rem"); // 96px no celular
    expect(css).toContain("--faixa-finalizar-altura: 8rem"); // 128px daí para cima
    expect(regra).toContain("height: var(--faixa-finalizar-altura)");
  });
});

describe("o código que sustenta o comportamento", () => {
  const zona = readFileSync("src/components/orders/FinalizeDropZone.tsx", "utf8");
  const quadro = readFileSync("src/components/orders/OrdersKanban.tsx", "utf8");
  const hook = readFileSync("src/hooks/useUpdateOrderStatus.ts", "utf8");

  it("a faixa entra e sai deslizando POR BAIXO, sem piscar", () => {
    // Sumir de uma vez faz a tela piscar no fim de todo arraste, e o olho lê
    // isso como defeito. Ela entra de baixo para cima, que é de onde ela vem.
    expect(zona).toContain("translate-y-full");
    expect(zona).toContain("translate-y-0");
    expect(zona).toContain("opacity-0");
    expect(zona).toContain("transition-[transform");
    expect(zona).toContain("DURACAO_MS = 200");
    // Continua montada durante a saída.
    expect(zona).toMatch(/setTimeout\(\(\) => setMontado\(false\), DURACAO_MS\)/);
  });

  it("o ALVO fica parado; quem desliza é a camada de dentro", () => {
    // ESTE É O DEFEITO QUE FAZIA "FINALIZAR" NÃO FUNCIONAR.
    //
    // O dnd-kit mede onde cada alvo está no instante em que ele nasce, e
    // guarda essa medida. Com a animação aplicada no próprio alvo, a faixa
    // nascia FORA DA TELA (à direita, esperando entrar) — e era essa posição
    // que ficava gravada. Depois, mesmo com a faixa à vista, o ponteiro
    // nunca "entrava" nela: para o dnd-kit ela seguia do lado de fora do
    // monitor. Medido no navegador: a narração dizia "Fora de qualquer
    // coluna" com o cursor no meio da faixa verde.
    //
    // É o porteiro que anota o número da vaga com o carro ainda na rua.
    //
    // Se alguém voltar a pôr `translate-x` no elemento do `setNodeRef`, o
    // "finalizar" para de funcionar de novo — e em silêncio.
    const inicio = zona.indexOf("<div");
    const alvo = zona.slice(inicio, zona.indexOf(">", zona.indexOf("ref={setNodeRef}")));
    expect(alvo).toContain("ref={setNodeRef}");
    expect(alvo).not.toContain("translate-y");
    expect(alvo).not.toContain("translate-x");
  });

  it("a animação é de transform, não de altura", () => {
    // Animar altura obriga o navegador a recalcular o layout a cada quadro,
    // justamente enquanto o dedo está arrastando.
    expect(zona).toContain("will-change-transform");
    expect(zona).not.toMatch(/transition-\[.*height/);
    expect(zona).not.toMatch(/transition-\[.*width/);
  });

  it("existe UMA faixa só, registrada com o id compartilhado", () => {
    // Duas zonas de finalizar ao mesmo tempo dariam dois alvos disputando o
    // mesmo drop — e o id escrito à mão em cada lugar transformaria um erro
    // de digitação em um soltar que não faz nada, em silêncio.
    expect(zona).toContain("useDroppable({ id: FINALIZE_TARGET_ID");
    expect(zona.match(/useDroppable\(/g)?.length).toBe(1);
    expect(quadro.match(/<FinalizeDropZone/g)?.length).toBe(1);
  });

  it("quando o dedo está na faixa, a faixa ganha da coluna embaixo dela", () => {
    // O desempate de fábrica é pela distância até o centro de cada alvo, e a
    // faixa é larga: soltar perto da ponta fazia a coluna ganhar, e o pedido
    // voltava para a fila em vez de ser finalizado.
    expect(quadro).toContain("collisionDetection={detectarColisao}");
    expect(quadro).toMatch(/colisoes\.find\(\(c\) => c\.id === FINALIZE_TARGET_ID\)/);
    expect(quadro).toContain("return naFaixa ? [naFaixa] : colisoes;");
  });

  it("a tela não corre sozinha debaixo do dedo parado na faixa", () => {
    expect(quadro).toContain("canScroll: () => !sobreAFaixa.current");
    expect(quadro).toContain("autoScroll={autoScroll}");
  });

  it("o quadro abre folga embaixo enquanto a faixa está no ar", () => {
    // Sem isso o último card de uma coluna comprida fica debaixo da faixa,
    // sem jeito de alcançar.
    expect(quadro).toContain("useFolgaDaFaixa(faixaAtiva, trilhoRef)");
    expect(quadro).toContain("reserva-da-faixa-finalizar");
  });

  it("o quadro pergunta a regra em vez de repetir a lista de status", () => {
    // Regra espalhada é regra que vai divergir: um lugar bloqueia, o outro
    // deixa passar.
    expect(quadro).toContain("canFinalizeFrom(draggingFromStatus)");
    expect(quadro).not.toContain("visible={activeOrder !== null}");
  });

  it("finalizar tem aviso próprio de sucesso e de erro", () => {
    // Quem some com um pedido da tela precisa saber se sumiu porque deu
    // certo ou porque deu errado.
    expect(hook).toContain('toast.success("Pedido finalizado com sucesso.")');
    expect(hook).toContain("Não foi possível finalizar o pedido. Tente novamente.");
  });

  it("o mesmo pedido não é finalizado duas vezes", () => {
    // `pendingIds` só reflete no próximo render; dois toques rápidos
    // aconteceriam antes disso. A trava síncrona é o `inFlight`.
    expect(hook).toContain("if (inFlight.current.has(order.id)) return { ok: false }");
    expect(hook).toMatch(/inFlight = useRef<Set<string>>/);
  });

  it("a gravação é condicional ao status anterior", () => {
    // Sem isto, dois operadores mexendo no mesmo pedido fariam o último
    // sobrescrever o primeiro sem ninguém perceber.
    expect(hook).toMatch(/\.eq\("id", order\.id\)\s*\.eq\("status", fromStatus\)/);
  });

  it("erro no banco devolve o pedido para a coluna de origem", () => {
    expect(hook).toContain("const rollback =");
    expect(hook.match(/rollback\(\);/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
