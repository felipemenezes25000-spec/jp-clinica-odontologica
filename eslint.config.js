import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  /*
   * `apresentacao/` é um sub-projeto isolado, com package.json, tsconfig e
   * ferramentas próprios. Ele tem o próprio `npm run check`; lintar daqui só
   * produziria ruído com regras que não são as dele.
   *
   * ============================================================================
   *  O RESTO DA LISTA É SAÍDA DE BUILD, e ela precisa acompanhar o `.gitignore`.
   *
   *  `.vercel` faltava aqui, e o sintoma não foi um lint falhando — foi o
   *  `npm run lint` MORRENDO:
   *
   *      RangeError: Invalid string length
   *        at eslint/lib/cli-engine/formatters/stylish.js:84
   *
   *  São 85 bundles minificados, 21 MB, cada linha de mil colunas virando erro
   *  de Prettier. O formatter monta a saída inteira numa string só e estoura o
   *  limite do V8 antes de conseguir imprimir qualquer coisa.
   *
   *  Isso passou despercebido porque o CI não roda `npm run lint`: o
   *  `quality.yml` roda `npx eslint src vite.config.ts eslint.config.js`, que é
   *  escopado e nunca encosta em `.vercel`. Ou seja, o script que a pessoa roda
   *  na máquina estava quebrado e o CI continuava verde — que é a pior
   *  combinação possível, porque ninguém desconfia do CI.
   *
   *  REGRA: o que o `.gitignore` trata como artefato de build entra aqui também.
   *  `.tanstack` e `.data` não têm nenhum arquivo lintável hoje, mas somam 21 MB
   *  que o eslint percorreria à toa — e amanhã podem ter.
   *
   *  `public/crc-tour/` é a EXCEÇÃO À REGRA, e por isso vem com nome próprio:
   *  ele é build (o `outDir` do `apresentacao/vite.config.ts`) mas é RASTREADO
   *  pelo git, de propósito — vai commitado para ser servido sem exigir a build
   *  do sub-projeto no CI. Não está no `.gitignore` e nunca estaria; mesmo assim
   *  é saída de ferramenta, e `index-WVEd94Q-.js` são 512 KB em 17 linhas.
   *  Ignorar a fonte (`apresentacao`) e lintar a saída dela seria incoerente.
   * ============================================================================
   */
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      ".vercel",
      ".tanstack",
      ".data",
      "apresentacao",
      "public/crc-tour",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
);
