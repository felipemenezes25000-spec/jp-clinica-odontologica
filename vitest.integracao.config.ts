import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Os testes que precisam de Postgres de verdade — Fase E.
 *
 * SEPARADOS DO `vitest.config.ts` DE PROPÓSITO, e a separação é o desenho:
 *
 *   `npm test` continua rodando em qualquer máquina, sem banco, em segundos. É o
 *   que roda cem vezes por dia. Misturar os dois faria todo mundo precisar de um
 *   Postgres em pé para mudar uma função pura.
 *
 *   `npm run test:integracao` roda contra um banco criado DO ZERO a partir de
 *   `supabase/*.sql`. É mais lento, exige serviço, e prova o que o banco em
 *   memória nunca vai poder provar: `for update`, rollback de transação, RLS,
 *   e o comportamento sob concorrência real.
 *
 * O QUE ESTE ARQUIVO NÃO FAZ: pular os testes quando o banco não está lá. Se
 * alguém rodar isto sem banco, tem que falhar — um teste de integração que
 * "passa" sem integração é a pior linha verde possível.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/lib/crc/testes/integracao/**/*.test.ts"],
    reporters: ["default"],
    /*
     * UM ARQUIVO POR VEZ, e não em paralelo.
     *
     * Os arquivos compartilham o MESMO banco. Rodando em paralelo, o `limpar()`
     * de um apaga as linhas do outro no meio da asserção — e o resultado é
     * falha intermitente, que é o tipo de teste que as pessoas aprendem a
     * ignorar. O paralelismo que importa aqui é o DENTRO de cada teste, onde a
     * concorrência é o objeto de estudo.
     */
    fileParallelism: false,
    /*
     * Conexão, migração e espera de serviço custam tempo real. O default de 5s
     * reprovaria o teste de carga por lentidão, e não por defeito.
     */
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
