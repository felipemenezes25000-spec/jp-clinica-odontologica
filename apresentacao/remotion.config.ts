import path from "node:path";
import { Config } from "@remotion/cli/config";

/**
 * Configuração de render. Vale para `npm run video:render` e para o Studio.
 */

/**
 * O alias `@/`.
 *
 * O Vite lê `resolve.alias` do `vite.config.ts`; o Remotion empacota com
 * webpack e NÃO lê os `paths` do `tsconfig.json`. Sem esta ponte, o `tsc` passa
 * limpo e o render quebra em "Can't resolve '@/components/Marca'" — erro que só
 * aparece na hora de gerar o MP4, que é o pior momento para descobri-lo.
 */
Config.overrideWebpackConfig((atual) => ({
  ...atual,
  resolve: {
    ...atual.resolve,
    alias: {
      ...atual.resolve?.alias,
      "@": path.join(process.cwd(), "src"),
    },
  },
}));

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setConcurrency(null);
Config.setChromiumOpenGlRenderer("angle");

// Qualidade: CRF menor = melhor imagem. 18 é praticamente sem perda visível para
// interface (texto fino e linhas de 1px são o que mais sofre com compressão).
Config.setCrf(18);
