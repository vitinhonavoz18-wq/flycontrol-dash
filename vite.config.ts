// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// O tipo do @lovable.dev/vite-tanstack-config só declara preset/output/
// cloudflare, mas ele repassa o objeto `nitro` inteiro para o Nitro (ver
// `...userNitroOpts` em node_modules/@lovable.dev/vite-tanstack-config/dist).
// Por isso a conversão de tipo: `plugins` é opção oficial do Nitro.
const nitroOptions = {
  plugins: [fileURLToPath(new URL("./src/nitro/billingCron.plugin.ts", import.meta.url))],
} as unknown as { preset?: string };

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
  // Despertador diário da cobrança. No pacote publicado quem recebe o
  // "scheduled" da Cloudflare é o Nitro, e ele só repassa a plugins inscritos
  // no gancho `cloudflare:scheduled` (ver o próprio plugin).
  nitro: nitroOptions,
});
