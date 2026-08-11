import { describe, expect, it } from "vitest";
import { extractStoragePath } from "./pizzeriaLifecycle.server";

describe("extractStoragePath — reconhece o caminho do arquivo dentro da signed URL", () => {
  it("extrai o caminho de uma signed URL válida do bucket menu-images", () => {
    const url =
      "https://laufyadcizmruejafcpi.supabase.co/storage/v1/object/sign/menu-images/hero/123-abc.webp?token=xyz";
    expect(extractStoragePath(url)).toBe("hero/123-abc.webp");
  });

  it("decodifica caracteres especiais no caminho (ex.: espaço virou %20)", () => {
    const url =
      "https://x.supabase.co/storage/v1/object/sign/menu-images/logos/foto%20do%20logo.png?token=abc";
    expect(extractStoragePath(url)).toBe("logos/foto do logo.png");
  });

  it("devolve null para uma URL que não é do bucket menu-images", () => {
    const url = "https://x.supabase.co/storage/v1/object/sign/outro-bucket/arquivo.png?token=abc";
    expect(extractStoragePath(url)).toBeNull();
  });

  it("devolve null para valores vazios", () => {
    expect(extractStoragePath(null)).toBeNull();
    expect(extractStoragePath(undefined)).toBeNull();
    expect(extractStoragePath("")).toBeNull();
  });

  it("devolve null para uma URL que não tem nada a ver com storage", () => {
    expect(extractStoragePath("https://exemplo.com/foto.png")).toBeNull();
  });
});
