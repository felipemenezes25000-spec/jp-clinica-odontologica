import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": srcDir },
    // Vite 8 resolves compilerOptions.paths natively. Keeping the explicit @
    // alias above makes the most common path independent from tsconfig lookup,
    // while tsconfigPaths covers any future aliases without another plugin.
    tsconfigPaths: true,
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
          // Rolldown deprecated `inlineDynamicImports`; `codeSplitting: false`
          // is the supported equivalent and preserves the SSR incident fix.
          output: { codeSplitting: false },
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

  /*
   * OS IDs DE MEDIÇÃO VIRAM LITERAL NOS DOIS BUNDLES — e este `define` existe
   * porque, sem ele, eles viravam literal só num.
   *
   * MEDIDO em 15/09/2026, com o build servido: `import.meta.env.VITE_GTM_ID`
   * era substituído no pacote do NAVEGADOR e sobrevivia como leitura de runtime
   * no de SSR, onde `import.meta.env` não tem as variáveis. O efeito é o pior
   * possível para medição:
   *
   *   o HTML SERVIDO saía sem o script do GTM (o servidor achava que não havia
   *   ID configurado);
   *
   *   o cliente, que tinha o literal, queria renderizar o script — divergindo
   *   do `<head>` servido e jogando o container para depois da hidratação.
   *
   * O Consent Mode depende da ORDEM: os padrões negados têm de estar no
   * `dataLayer` antes de o container subir. Um GTM que entra depois da
   * hidratação perde essa garantia e perde a visita inteira de quem sai rápido.
   *
   * São identificadores PÚBLICOS — um container de GTM e um Pixel aparecem no
   * código-fonte de qualquer site que os use. Nenhum segredo entra aqui, e
   * `scripts/conferir-bundle.mjs` reprova o build se algum tentar.
   */
  define: {
    "import.meta.env.VITE_GTM_ID": JSON.stringify(process.env["VITE_GTM_ID"] ?? ""),
    "import.meta.env.VITE_META_PIXEL_ID": JSON.stringify(process.env["VITE_META_PIXEL_ID"] ?? ""),
  },

  // Plugin order matters: Tailwind must be registered before TanStack Start
  // generates the route tree, and React comes last so it transforms the output
  // of everything above it. Path aliases are resolved natively by Vite 8.
  plugins: [
    tailwindcss(),
    // Routes the bundled server entry to src/server.ts (the SSR error wrapper).
    tanstackStart({ server: { entry: "server" } }),
    // Build-only. Nitro auto-detects the host (Vercel sets VERCEL=1); this is the
    // fallback when nothing is detected. Override with NITRO_PRESET=<preset>.
    nitro({ defaultPreset: "vercel" }),
    viteReact(),
  ],
});
