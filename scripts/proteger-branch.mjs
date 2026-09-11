#!/usr/bin/env node
/**
 * Branch protection da `main` — Fase I.
 *
 * POR QUE UM SCRIPT, E NÃO UM PARÁGRAFO NA DOCUMENTAÇÃO. Proteção de branch é
 * configuração de painel: alguém clica uma vez, e seis meses depois ninguém sabe
 * o que está ligado nem por quê. Um arquivo versionado responde às duas
 * perguntas, e a segunda — o porquê — é a que some primeiro.
 *
 * O QUE ELE LIGA, e a razão de cada uma:
 *
 *   OS DOIS CI SÃO OBRIGATÓRIOS. `quality.yml` roda em segundos e pega o
 *   grosso; `crc-integracao.yml` sobe Postgres de verdade e é o único que prova
 *   `for update`, rollback, RLS e schema do zero. Exigir só o rápido daria a
 *   sensação de cobertura sem a cobertura.
 *
 *   O BRANCH PRECISA ESTAR ATUALIZADO. Dois PRs que passam sozinhos podem
 *   quebrar juntos — é o clássico: um renomeia a função, o outro acrescenta uma
 *   chamada a ela. Só o merge dos dois mostra.
 *
 *   FORCE PUSH E DELEÇÃO BLOQUEADOS. Um `push --force` na main apaga histórico
 *   de auditoria de um sistema que grava conversa com paciente.
 *
 *   CONVERSAS DE REVIEW RESOLVIDAS. Comentário aberto é pergunta sem resposta.
 *
 * O QUE ELE **NÃO** LIGA, e é uma decisão consciente: aprovação obrigatória de
 * outra pessoa. Este repositório tem um mantenedor. Exigir revisor tornaria
 * impossível corrigir produção num domingo, e a regra que não dá para cumprir é
 * a regra que se desliga — junto com todas as outras.
 *
 * USO:
 *   gh auth login
 *   node scripts/proteger-branch.mjs                # mostra o que faria
 *   node scripts/proteger-branch.mjs --aplicar      # aplica
 */
import { spawnSync } from "node:child_process";

const APLICAR = process.argv.includes("--aplicar");
const BRANCH = "main";

/**
 * A configuração, em um objeto só — para ser lida como documentação.
 *
 * Cada campo aqui é uma decisão, e o formato da API do GitHub é feio o bastante
 * para esconder isso. Os comentários são a metade que importa.
 */
const PROTECAO = {
  required_status_checks: {
    // `strict` é "o branch precisa estar atualizado com a main".
    strict: true,
    contexts: [
      "lint, typecheck, tests and build",
      "schema do zero, tenant, concorrência e recovery",
    ],
  },
  // Sem revisor obrigatório. Ver o cabeçalho.
  required_pull_request_reviews: null,
  enforce_admins: false,
  restrictions: null,
  allow_force_pushes: false,
  allow_deletions: false,
  required_conversation_resolution: true,
  // Histórico linear: `merge commit` de PR esconde qual commit quebrou o quê.
  required_linear_history: true,
};

function repo() {
  const r = spawnSync("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
    encoding: "utf8",
  });

  if (r.error || r.status !== 0) {
    console.error("Não consegui descobrir o repositório. O `gh` está instalado e autenticado?");
    console.error((r.stderr || "").trim());
    process.exit(1);
  }

  return r.stdout.trim();
}

const alvo = repo();

console.log(`Repositório: ${alvo}`);
console.log(`Branch: ${BRANCH}\n`);
console.log(JSON.stringify(PROTECAO, null, 2));

if (!APLICAR) {
  console.log("\n(nada foi alterado — rode com --aplicar para valer)");
  process.exit(0);
}

/*
 * A CHAMADA VAI POR `gh api` COM `--input -`.
 *
 * `gh api -f campo=valor` não sabe montar objeto aninhado, e esta configuração é
 * toda aninhada. Montá-la com flags produziria um payload silenciosamente
 * diferente do que está escrito acima — e a diferença só apareceria no dia em
 * que uma proteção que todo mundo achava ligada deixasse um push passar.
 */
const r = spawnSync(
  "gh",
  ["api", "--method", "PUT", `repos/${alvo}/branches/${BRANCH}/protection`, "--input", "-"],
  { input: JSON.stringify(PROTECAO), encoding: "utf8" },
);

if (r.status !== 0) {
  console.error("\nFalhou:");
  console.error((r.stderr || r.stdout || "").trim());
  console.error(
    "\nProteção de branch exige repositório público ou plano pago, e permissão de admin.",
  );
  process.exit(1);
}

console.log("\nProteção aplicada.");
