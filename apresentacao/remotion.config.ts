import { Config } from "@remotion/cli/config";

/**
 * Configuração de render. Vale para `npm run video:render` e para o Studio.
 *
 * `overwrite` ligado porque o alvo é sempre o mesmo arquivo em `out/`, e ter que
 * apagar à mão entre dois renders é atrito sem ganho.
 */
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setConcurrency(null);
Config.setChromiumOpenGlRenderer("angle");

// Qualidade: CRF menor = melhor imagem. 18 é praticamente sem perda visível para
// interface (texto fino e linhas de 1px são o que mais sofre com compressão).
Config.setCrf(18);
