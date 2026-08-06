import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

// O cliente Supabase real explode na importação sem as variáveis de ambiente,
// e nenhum teste desta suíte deve tocar a rede.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

// jsdom não implementa a API de medição usada pelo dnd-kit.
if (!globalThis.DOMRect) {
  // @ts-expect-error — stub mínimo suficiente para o dnd-kit montar.
  globalThis.DOMRect = class {
    constructor(
      public x = 0,
      public y = 0,
      public width = 0,
      public height = 0,
    ) {}
    top = 0;
    left = 0;
    right = 0;
    bottom = 0;
  };
}
