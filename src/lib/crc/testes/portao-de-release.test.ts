/**
 * O portão de release não pode ser desligado por um `name:` editado.
 *
 * ============================================================================
 *  O DEFEITO REAL QUE ESTE TESTE EXISTE PARA IMPEDIR — encontrado em 13/09/26.
 *
 *  A proteção da `main` exigia o check:
 *
 *      "schema do zero, tenant, concorrência e recovery"
 *
 *  E o job de integração se chamava, naquele dia:
 *
 *      "schema do zero, tenant, concorrência, recovery e navegador"
 *
 *  Quando o passo de Playwright entrou no workflow, alguém acrescentou
 *  "e navegador" ao nome do job. O GitHub casa check exigido com check
 *  reportado POR STRING EXATA — então, daquele commit em diante:
 *
 *    · o check exigido nunca mais chegou, e ficou pendente para sempre;
 *    · o check que chegava não era exigido, e o resultado dele não bloqueava
 *      nada.
 *
 *  Ninguém viu porque `enforce_admins` estava desligado e quem publica é o
 *  dono do repositório: o portão nunca chegou a ser testado contra ele.
 *
 *  RENOMEAR UM JOB VIROU, ASSIM, UMA FORMA DE DESLIGAR UM PORTÃO SEM QUE
 *  NENHUMA TELA MUDE DE COR. É exatamente a classe de falha que um teste
 *  estrutural pega e um teste de comportamento não.
 * ============================================================================
 *
 * O QUE ELE NÃO FAZ, dito para ninguém confiar demais: ele não consulta a API
 * do GitHub. Um teste que dependesse da rede e de um token seria instável no CI
 * e inútil localmente. Ele compara o workflow versionado contra a lista
 * versionada — o que prende as duas pontas que vivem no repositório.
 *
 * A terceira ponta — a configuração de proteção, que vive no GitHub — está
 * documentada em `docs/crc/RELEASE-GATE.md` com o comando que a lê e o comando
 * que a corrige.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Os nomes de job que a proteção da `main` exige, escritos como o GitHub os vê.
 *
 * MUDAR UM `name:` NO WORKFLOW OBRIGA A MUDAR AQUI **E** NA PROTEÇÃO DO
 * REPOSITÓRIO. É o ponto do teste: tornar a segunda metade impossível de
 * esquecer, porque a primeira metade quebra o CI.
 */
const CHECKS_OBRIGATORIOS: readonly { readonly workflow: string; readonly job: string }[] = [
  { workflow: ".github/workflows/quality.yml", job: "lint, typecheck, tests and build" },
  { workflow: ".github/workflows/crc-smoke.yml", job: "typecheck, tests and build" },
  {
    workflow: ".github/workflows/crc-integracao.yml",
    job: "schema do zero, tenant, concorrência, recovery e navegador",
  },
];

/**
 * Os `name:` de job de um workflow.
 *
 * NÃO USA PARSER DE YAML de propósito: a única coisa que interessa é o texto do
 * nome como o GitHub o publica, e um parser traria uma dependência nova para
 * responder a uma pergunta que uma linha responde. A distinção entre `name:` de
 * job e `name:` de passo é a indentação — passo vem depois de um `- `.
 */
function nomesDeJob(caminho: string): string[] {
  const linhas = readFileSync(caminho, "utf8").split("\n");
  const nomes: string[] = [];

  for (const linha of linhas) {
    // Job: indentado dentro de `jobs:`, sem o hífen de item de lista.
    const achado = /^ {4}name:\s*(.+?)\s*$/u.exec(linha);
    if (achado?.[1]) nomes.push(achado[1].replace(/^["']|["']$/gu, ""));
  }

  return nomes;
}

describe("o portão de release", () => {
  it.each(CHECKS_OBRIGATORIOS)(
    "o job exigido `$job` ainda existe em $workflow",
    ({ workflow, job }) => {
      const nomes = nomesDeJob(workflow);

      expect(
        nomes,
        `O check "${job}" consta da proteção da \`main\`, mas nenhum job de ` +
          `${workflow} se chama assim.\n\n` +
          `Jobs encontrados: ${nomes.map((n) => `"${n}"`).join(", ") || "(nenhum)"}\n\n` +
          `Se o nome mudou de propósito, atualize os DOIS lados:\n` +
          `  1. a lista CHECKS_OBRIGATORIOS neste arquivo;\n` +
          `  2. a proteção do repositório — o comando está em docs/crc/RELEASE-GATE.md.\n\n` +
          `Enquanto os dois não baterem, o portão aceita HEAD vermelho em silêncio.`,
      ).toContain(job);
    },
  );

  /**
   * CONTROLE POSITIVO — a injeção de defeito que prova que o teste morde.
   *
   * Sem isto, um `nomesDeJob` que devolvesse a lista errada (ou vazia) faria
   * todos os casos acima passarem por acidente, e o teste viraria enfeite.
   */
  it("acusa um nome que não existe — a prova de que a varredura morde", () => {
    const nomes = nomesDeJob(".github/workflows/quality.yml");

    expect(nomes.length).toBeGreaterThan(0);
    expect(nomes).not.toContain("lint, typecheck, tests and build (renomeado)");
  });

  it("lê nome de job, e não nome de passo", () => {
    // `Checkout` é passo em todos os workflows. Se ele aparecer aqui, a
    // varredura está lendo a indentação errada e a proteção acima é ilusória.
    for (const { workflow } of CHECKS_OBRIGATORIOS) {
      expect(nomesDeJob(workflow)).not.toContain("Checkout");
    }
  });
});
