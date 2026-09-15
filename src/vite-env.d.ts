/// <reference types="vite/client" />

/**
 * As variáveis de ambiente que chegam ao NAVEGADOR.
 *
 * `tsconfig.json` liga `noPropertyAccessFromIndexSignature`, então
 * `import.meta.env.VITE_ALGO` só compila se o nome estiver declarado aqui. O
 * efeito colateral é o que interessa: esta lista é a lista COMPLETA do que o
 * site publica no JavaScript que o paciente baixa, e ela não cresce por
 * descuido — qualquer nome novo passa por este arquivo.
 *
 * A REGRA QUE VALE NO `.env.example` VALE AQUI: só entra identificador público.
 * Chave, token e segredo não ganham prefixo `VITE_` e não aparecem neste
 * arquivo; eles moram no servidor. `scripts/conferir-bundle.mjs` roda depois do
 * build e falha o CI se algum segredo tiver viajado para o pacote.
 */
interface ImportMetaEnv {
  /** Container do Google Tag Manager (`GTM-XXXXXXX`). Ausente: nada carrega. */
  readonly VITE_GTM_ID?: string;
  /** Pixel da Meta (só dígitos). Ausente: nada carrega. */
  readonly VITE_META_PIXEL_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
