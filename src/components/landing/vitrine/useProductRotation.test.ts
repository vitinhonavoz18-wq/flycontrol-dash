import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProductRotation } from "./useProductRotation";

const A = { id: "a" };
const B = { id: "b" };
const C = { id: "c" };
const R = { id: "reserva" };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function avancar(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("troca de produto da vitrine", () => {
  it("troca a cada 3 segundos e dá a volta", () => {
    const { result } = renderHook(() =>
      useProductRotation([A, B, C], { intervaloMs: 3000, ativo: true }),
    );
    const vistos = [result.current.id];
    for (let i = 0; i < 6; i++) {
      avancar(2999);
      expect(result.current.id).toBe(vistos[vistos.length - 1]); // ainda não
      avancar(1);
      vistos.push(result.current.id);
    }
    expect(vistos).toEqual(["a", "b", "c", "a", "b", "c", "a"]);
  });

  it("parada (aba escondida, fora da tela) não troca", () => {
    const { result, rerender } = renderHook(
      ({ ativo }) => useProductRotation([A, B], { intervaloMs: 3000, ativo }),
      { initialProps: { ativo: false } },
    );
    avancar(20000);
    expect(result.current.id).toBe("a");
    // Voltou: o produto atual ganha os 3 segundos inteiros.
    rerender({ ativo: true });
    avancar(2900);
    expect(result.current.id).toBe("a");
    avancar(100);
    expect(result.current.id).toBe("b");
  });

  it("lista nova no meio da contagem não troca fora do ritmo", () => {
    const { result, rerender } = renderHook(
      ({ lista }) => useProductRotation(lista, { intervaloMs: 3000, ativo: true }),
      { initialProps: { lista: [R] } },
    );
    avancar(1500);
    // Os produtos de verdade chegaram do servidor.
    rerender({ lista: [A, B, C] });
    expect(result.current.id).toBe("reserva"); // continua na tela
    avancar(3000);
    expect(result.current.id).toBe("a"); // e só então segue para a lista nova
  });

  it("produto com imagem quebrada sai na hora", () => {
    const { result, rerender } = renderHook(
      ({ lista, removidos }) =>
        useProductRotation(lista, { intervaloMs: 3000, ativo: true, removidos }),
      { initialProps: { lista: [A, B, C], removidos: new Set<string>() } },
    );
    expect(result.current.id).toBe("a");
    rerender({ lista: [B, C], removidos: new Set(["a"]) });
    expect(result.current.id).toBe("b");
  });

  it("um produto só: nenhum relógio fica rodando", () => {
    renderHook(() => useProductRotation([A], { intervaloMs: 3000, ativo: true }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ao sair da tela, o relógio é desligado (nada fica rodando à toa)", () => {
    const { unmount } = renderHook(() =>
      useProductRotation([A, B], { intervaloMs: 3000, ativo: true }),
    );
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
