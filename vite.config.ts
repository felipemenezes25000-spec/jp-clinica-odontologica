import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": srcDir },
    // React and TanStack must resolve to a single copy. A duplicated React
    // breaks hooks at runtime; a duplicated query-core breaks the cache identity.
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },

  server: {
    port: 8080,
    host: true,
  },

  // SÓ o ambiente de servidor vira um pedaço único.
  //
  // O bug era ciclo ENTRE pedaços do bundle de SSR: o fatiador punha
  // `createCsrfMiddleware` num pedaço que o pedaço do framework importava de
  // volta, e em ESM isso vira `undefined` em vez de erro — 500 em todas as
  // rotas, com o build passando limpo. Sem fatiamento não há ciclo possível.
  // Ver docs/INCIDENTE-BUILD-500.md.
  //
  // No servidor isso não custa nada: o arquivo é carregado inteiro na primeira
  // requisição de qualquer jeito, não existe download incremental.
  //
  // NO CLIENTE CUSTARIA CARO, e por isso a regra fica aqui e não em `build`:
  // aplicada globalmente, ela juntou o site inteiro num único JS de 993 KB, e
  // quem abrisse a home baixaria junto o painel de RH inteiro.
  environments: {
    ssr: {
      build: {
        rollupOptions: {
          output: { inlineDynamicImports: true },
        },
      },
    },
  },

  css: {
    // Tailwind v4 runs through @tailwindcss/vite, not PostCSS. Pinning an inline
    // (empty) config stops Vite from walking up the filesystem for a postcss.config
    // file — a stray one in a parent directory would otherwise load Tailwind v3's
    // PostCSS plugin on top of v4 and fail the build.
    postcss: {},
  },

  // Plugin order matters: Tailwind and path resolution must be registered before
  // TanStack Start generates the route tree, and React comes last so it transforms
  // the output of everything above it.
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    // Routes the bundled server entry to src/server.ts (the SSR error wrapper).
    tanstackStart({ server: { entry: "server" } }),
    // Build-only. Nitro auto-detects the host (Vercel sets VERCEL=1); this is the
    // fallback when nothing is detected. Override with NITRO_PRESET=<preset>.
    nitro({ defaultPreset: "vercel" }),
    viteReact(),
  ],
});
