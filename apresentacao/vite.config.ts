import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * O visualizador interativo é um app Vite comum. Ele não compartilha bundler com
 * o Remotion de propósito: o Remotion tem o seu próprio (`src/remotion/`), e o
 * único contrato entre os dois é `src/film/` — componentes que só dependem de
 * `frame`. Ver MOTION-SYSTEM.md.
 *
 * `base` e `outDir` apontam para dentro do site: o build cai em
 * `public/crc-tour/`, servido como arquivo estático, e a rota
 * `/crc-institucional` do site o coloca em tela.
 *
 * POR QUE `crc-tour` E NÃO `crc-institucional`
 * Porque uma pasta com o mesmo nome da rota a SOMBREIA: o servidor de arquivos
 * estáticos responde antes do roteador, `/crc-institucional` devolvia o
 * index.html do tour e a página do site (com o caminho de volta e as metatags)
 * nunca chegava a rodar.
 */
export default defineConfig({
  base: "/crc-tour/",
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  css: {
    /**
     * PostCSS explicitamente vazio.
     *
     * Sem isto o Vite sobe a árvore de diretórios procurando `postcss.config.*`
     * e acaba encontrando o da HOME do usuário — que traz um Tailwind v3 sem
     * `content` configurado. O build passava, mas com aviso e com o preflight de
     * outro projeto entrando no CSS desta peça. A apresentação usa CSS próprio.
     */
    postcss: {},
  },
  build: {
    outDir: "../public/crc-tour",
    emptyOutDir: true,
    // O filme tem 28 cenas; deixar o aviso no padrão só produz ruído.
    chunkSizeWarningLimit: 1200,
  },
});
