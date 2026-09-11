import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Config PRÓPRIA do Vitest, separada de `vite.config.ts` de propósito.
 *
 * Carregar a config do app aqui traria o plugin do TanStack Start, o Nitro e o
 * Tailwind para dentro do runner. Nenhum deles serve para rodar teste de função
 * pura, e o plugin do Start gera a árvore de rotas a cada execução — o que
 * transforma `npm test` num build parcial de 20 segundos.
 *
 * O alias `@` é replicado à mão pelo mesmo motivo: sem `vite-tsconfig-paths`,
 * que também é um plugin do app.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    /*
     * OS TESTES DE INTEGRAÇÃO FICAM DE FORA DAQUI, e não por serem lentos.
     *
     * Eles EXIGEM um Postgres de verdade e falham alto quando não o encontram —
     * de propósito, porque um teste de integração que passa sem integração é a
     * pior linha verde do repositório. Deixá-los neste `include` faria
     * `npm test` reprovar em toda máquina que não tem banco em pé.
     *
     * Quem os roda é `npm run test:integracao`, com a config própria.
     */
    exclude: ["**/node_modules/**", "src/lib/crc/testes/integracao/**"],
    // O relatório precisa ser legível no terminal de quem roda `npm run check`.
    reporters: ["default"],
  },
});
