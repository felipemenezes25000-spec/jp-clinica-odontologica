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

      /*
       * OS ARTEFATOS DO PLAYWRIGHT — e a ausência deles aqui QUEBRAVA o portão.
       *
       * As duas pastas estão no `.gitignore`, então nunca chegam ao repositório
       * — e foi por isso que ninguém notou. Mas o `eslint .` do `npm run check`
       * lê o disco, não o índice do git: depois da primeira execução de
       * `npm run e2e` ou `npm run e2e:site`, ele passava a analisar o visualizador
       * de trace do Playwright, que é JavaScript minificado de terceiros.
       *
       * O resultado era `npm run check` VERMELHO na máquina de quem tinha
       * rodado E2E e VERDE em quem não tinha, com um erro apontando para a
       * coluna 101 de um bundle que ninguém escreveu. O CI não via nada disso
       * porque lista os caminhos explicitamente (`eslint src vite.config.ts …`).
       *
       * Mesmo princípio de `apresentacao` e `public/crc-tour`: o que não é
       * nosso, não lintamos.
       */
      "playwright-report",
      "test-results",

      /*
       * AS WORKTREES DAS SESSÕES PARALELAS — e o resto de `.claude/`.
       *
       * Cada `.claude/worktrees/<sessão>` é uma cópia inteira do repositório. O
       * `eslint .` lê o disco, não o índice do git, e os padrões acima só casam
       * na raiz: dentro de cada cópia, `dist`, `.vercel`, `apresentacao` e o
       * bundle minificado de `public/crc-tour` voltavam a ser lintados. Em
       * 24/09/2026 eram 3.833 arquivos em vez de 559, e o lint passava de 10
       * minutos. Cada worktree se linta pelo próprio `npm run lint`, e o resto
       * de `.claude/` é configuração de agente. Ver o comentário gêmeo em
       * `.vercelignore`.
       */
      ".claude",
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
