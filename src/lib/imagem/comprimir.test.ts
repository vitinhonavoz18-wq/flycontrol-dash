import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { comprimirParaWebp } from "./comprimir";

/**
 * A compressão em si é do navegador (abrir a foto e regravar). Aqui ela é de
 * mentira: o que se testa são as decisões — quando regravar e quando ficar
 * com a original.
 */

let medidas = { width: 4000, height: 3000 };
let saida: Blob | null = null;
let ultimoCanvas: { width: number; height: number } | null = null;

beforeEach(() => {
  medidas = { width: 4000, height: 3000 };
  saida = new Blob([new Uint8Array(100)], { type: "image/webp" });
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ ...medidas, close: vi.fn() })),
  );
  const criarOriginal = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag !== "canvas") return criarOriginal(tag);
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (cb: (b: Blob | null) => void) => cb(saida),
    };
    ultimoCanvas = canvas;
    return canvas as unknown as HTMLCanvasElement;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const arquivo = (bytes: number, tipo: string) => new Blob([new Uint8Array(bytes)], { type: tipo });

describe("comprimir foto", () => {
  it("encolhe para o limite, sem distorcer", async () => {
    const r = await comprimirParaWebp(arquivo(5000, "image/png"), 900);
    expect(r).toBe(saida);
    expect(ultimoCanvas).toMatchObject({ width: 900, height: 675 });
  });

  it("no envio normal, WebP já pequeno passa direto", async () => {
    medidas = { width: 800, height: 600 };
    const original = arquivo(5000, "image/webp");
    expect(await comprimirParaWebp(original, 900)).toBe(original);
  });

  it("na otimização (forcar), regrava mesmo o WebP pequeno de 2 MB", async () => {
    medidas = { width: 800, height: 600 };
    const r = await comprimirParaWebp(arquivo(2_000_000, "image/webp"), 900, { forcar: true });
    expect(r).toBe(saida);
  });

  it("na otimização, nunca troca por uma versão mais pesada", async () => {
    saida = new Blob([new Uint8Array(9000)], { type: "image/webp" });
    const original = arquivo(5000, "image/png");
    expect(await comprimirParaWebp(original, 900, { forcar: true })).toBe(original);
  });

  it("na otimização, navegador sem WebP (devolve PNG): fica a original", async () => {
    saida = new Blob([new Uint8Array(10)], { type: "image/png" });
    const original = arquivo(5000, "image/jpeg");
    expect(await comprimirParaWebp(original, 900, { forcar: true })).toBe(original);
  });
});
