// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    // Cada rota vira seu próprio pedaço de JS, carregado só quando o usuário
    // realmente abre aquela tela — sem isso, abrir o Dashboard baixava
    // também o código do Financeiro, do Admin, do Cardápio etc., mesmo sem
    // usar nada disso. Menos dado consumido e primeiro carregamento mais
    // rápido no 4G, sem mudar nenhuma rota manualmente.
    router: { autoCodeSplitting: true },
  },
});
