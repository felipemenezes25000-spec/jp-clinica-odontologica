/**
 * "Isto é produção?" — perguntado ao RUNTIME, e não ao bundler.
 *
 * ============================================================================
 *  O PROBLEMA, QUE CUSTOU HORAS PARA SER ENTENDIDO.
 *
 *  `process.env["NODE_ENV"]` é substituído por um LITERAL no bundle do
 *  servidor. E não é o `--mode` que decide: o build do servidor define
 *  `"production"` nas duas passagens. Foi conferido no artefato:
 *
 *      // src/lib/crc/integracoes/meta/config.ts, antes
 *      export function sandboxLigado(): boolean {
 *        if (process.env["NODE_ENV"] === "production") return false;
 *        return (process.env["META_SANDBOX"] ?? "").trim() === "1";
 *      }
 *
 *      // .output/server/_ssr/ssr.mjs, depois — nos DOIS modos
 *      function sandboxLigado() { return false; }
 *
 *  `grep -c META_SANDBOX .output/server/_ssr/ssr.mjs` devolve **0**. A variável
 *  não era ignorada: não era nem lida. O caminho do sandbox não existia no
 *  arquivo.
 *
 *  O efeito prático era um E2E que não conseguia provar NENHUM envio — nem do
 *  Instagram, nem do WhatsApp. E o sintoma ficava a três camadas da causa: "a
 *  conta da Meta está cadastrada para receber, mas não tem token de envio".
 * ============================================================================
 *
 * ============================================================================
 *  POR QUE A LEITURA INDIRETA, E O QUE ELA CUSTA.
 *
 *  A substituição do bundler casa o caminho a partir do IDENTIFICADOR
 *  `process` — e propaga por variável local, o que derrubou a primeira
 *  tentativa de conserto. A forma que sobrevive está documentada em
 *  `ambienteDeExecucao`, logo abaixo.
 *
 *  O QUE SE PERDE: a trava deixa de ser impossível-por-construção e passa a
 *  depender de o processo ter `NODE_ENV=production`. O que se ganha: um E2E que
 *  exercita o envio.
 *
 *  A TROCA É SEGURA, e vale ser explícito sobre por quê:
 *
 *    O PRESET `node-server` DO NITRO DEFINE `NODE_ENV=production` no processo.
 *    A Vercel também. Ou seja: em produção a variável está lá, e a trava fecha.
 *
 *    LIGAR SANDBOX EM PRODUÇÃO exigiria DUAS coisas ao mesmo tempo: apagar
 *    `NODE_ENV` do ambiente E definir `META_SANDBOX=1`. Antes exigia zero, mas
 *    também era impossível; agora exige duas, e uma delas é desfazer o que o
 *    runtime faz sozinho.
 *
 *    A CONSEQUÊNCIA DE ERRAR FICA VISÍVEL. `lerSaudeDaMeta` mostra o estado
 *    medido: com sandbox ligado nada chega da Meta, e o cartão vira ATENÇÃO com
 *    "nenhum webhook chegou ainda". Antes desta entrega, nem isso existia.
 * ============================================================================
 *
 * ============================================================================
 *  ONDE O MESMO PADRÃO AINDA ESTÁ, E POR QUE NÃO FOI TROCADO AQUI.
 *
 *  `process.env["NODE_ENV"] === "production"` aparece em nove outros lugares —
 *  Dental Office, gateway de IA, embeddings, `servidor/sessao.ts`,
 *  `servidor/instalacao.ts`. Todos são constantes no bundle do servidor, e para
 *  a maioria isso está CERTO: cookie seguro e recusa de semente de exemplo
 *  devem valer no artefato de produção, e não depender de variável.
 *
 *  Os que são trava de sandbox têm o mesmo defeito latente que este arquivo
 *  conserta, e trocá-los é uma mudança de comportamento em caminhos que já
 *  estão em produção — fora do escopo desta entrega. Está registrado em
 *  `docs/crc/META-FINAL-ACCEPTANCE.md`.
 * ============================================================================
 */

/**
 * O valor de `NODE_ENV` no PROCESSO, lido de um jeito que o bundler não dobra.
 *
 * ============================================================================
 *  O ACESSO É POR `globalThis`, E A PRIMEIRA TENTATIVA NÃO FOI SUFICIENTE.
 *
 *  Guardar `process.env` numa variável local não bastou: o bundler propaga a
 *  constante através dela. Conferido no artefato:
 *
 *      // o que estava escrito
 *      const variaveis: Record<string, string | undefined> = process.env;
 *      return (variaveis["NODE_ENV"] ?? "").trim();
 *
 *      // o que saiu em .output/server/_ssr/ssr.mjs
 *      function ambienteDeExecucao() { return "production".trim(); }
 *
 *  A substituição casa o caminho `process.env.NODE_ENV` a partir do
 *  identificador `process`. Chegar em `process` por `globalThis` sai desse
 *  casamento — não há identificador `process` na expressão.
 *
 *  NÃO SIMPLIFIQUE ISTO. Cada forma "mais limpa" já foi tentada e dobrada, e o
 *  invariante em `testes/invariantes-arquiteturais.test.ts` reprova a volta.
 * ============================================================================
 *
 * O `?.` em cada passo não é excesso: este módulo é importado por código que
 * roda no servidor, mas `globalThis.process` não existe em runtime de borda —
 * e ali a resposta certa é "não sei", não uma exceção.
 */
export function ambienteDeExecucao(): string {
  const raiz = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return (raiz.process?.env?.["NODE_ENV"] ?? "").trim();
}

/** Estamos rodando em produção? */
export function ehProducao(): boolean {
  return ambienteDeExecucao() === "production";
}
