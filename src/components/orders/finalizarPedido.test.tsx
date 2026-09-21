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
    expect(zona.textContent).toContain("Finalizar pedido");
    expect(zona.querySelector("svg")).toBeTruthy();
  });

  it("ocupa a lateral direita inteira, não uma pastilha", () => {
    // Acertar um alvo pequeno com o pedido na mão, no celular, no meio do
    // movimento da loja, é justamente o que fazia o lojista achar que o
    // sistema não funcionava.
    const { container } = renderZona(true);
    const moldura = container.querySelector(".fixed") as HTMLElement;
    expect(moldura.className).toContain("inset-y-0");
    expect(moldura.className).toContain("right-0");
    expect(moldura.className).not.toContain("inset-x-0");
  });

  it("fica acima da barra inferior, nunca atrás dela", () => {
    const { container } = renderZona(true);
    const moldura = container.querySelector(".fixed") as HTMLElement;
    expect(moldura.className).toContain("z-[var(--z-overlay)]");
  });

  it("captura o toque enquanto vale, e devolve quando está saindo", () => {
    // Ela é o alvo, então precisa capturar durante o arraste. Mas continua
    // montada por 200ms na animação de saída — e nesse intervalo tem de
    // devolver o toque, senão engole o primeiro clique do lojista logo
    // depois de soltar o pedido.
    const { container } = renderZona(true);
    const alvo = container.querySelector(".fixed") as HTMLElement;
    expect(alvo.className).toContain("pointer-events-auto");

    const fonte = readFileSync("src/components/orders/FinalizeDropZone.tsx", "utf8");
    expect(fonte).toMatch(/active \? "pointer-events-auto" : "pointer-events-none"/);
  });
});

describe("o código que sustenta o comportamento", () => {
  const zona = readFileSync("src/components/orders/FinalizeDropZone.tsx", "utf8");
  const quadro = readFileSync("src/components/orders/OrdersKanban.tsx", "utf8");
  const hook = readFileSync("src/hooks/useUpdateOrderStatus.ts", "utf8");

  it("a faixa entra e sai deslizando, sem piscar", () => {
    // Sumir de uma vez faz a tela piscar no fim de todo arraste, e o olho lê
    // isso como defeito.
    expect(zona).toContain("translate-x-full");
    expect(zona).toContain("translate-x-0");
    expect(zona).toContain("transition-[transform");
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
    expect(alvo).not.toContain("translate-x");
  });

  it("a animação é de transform, não de largura", () => {
    // Animar largura obriga o navegador a recalcular o layout a cada quadro,
    // justamente enquanto o dedo está arrastando.
    expect(zona).toContain("will-change-transform");
    expect(zona).not.toMatch(/transition-\[.*width/);
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
