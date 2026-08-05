/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Configuração separada de vite.config.ts de propósito: aquele arquivo é o
// preset do Lovable, que monta o build do TanStack Start e do Cloudflare e não
// deve ser carregado para rodar testes.
//
// Sem @vitejs/plugin-react: o JSX é transformado pelo esbuild a partir do
// `"jsx": "react-jsx"` do tsconfig, e o plugin só traria o Fast Refresh, que
// não serve para nada aqui.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
