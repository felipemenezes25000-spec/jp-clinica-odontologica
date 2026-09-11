#!/usr/bin/env node
/**
 * Aplica `supabase/*.sql` em ordem, num banco vazio — Fase E.
 *
 * POR QUE ISTO É UM TESTE, E NÃO SÓ UM UTILITÁRIO.
 *
 * Os arquivos de schema deste projeto nunca foram aplicados do zero. Eles foram
 * escritos um a um contra um banco que já existia, e rodados à mão. Isso deixa
 * uma classe inteira de defeito invisível:
 *
 *   ORDEM QUEBRADA. Um arquivo referencia tabela que só nasce no arquivo
 *   seguinte. No banco de produção funciona — a tabela já estava lá desde antes.
 *   Numa instalação nova, explode.
 *
 *   ARQUIVO FORA DE SINCRONIA. Foi exatamente o caso de `crc_users.foto_url`:
 *   a coluna existia no banco e NÃO existia nos arquivos. Quem instalasse do
 *   zero nasceria sem ela, e o botão de trocar foto falharia — só na instalação
 *   nova, nunca na que está no ar.
 *
 *   DEPENDÊNCIA NÃO DECLARADA. `vector`, `pgcrypto`, `unaccent`: extensões que
 *   alguém habilitou pelo painel do Supabase um dia e ninguém escreveu no SQL.
 *
 * Rodar isto num Postgres vazio a cada PR é o que transforma "os arquivos
 * provavelmente descrevem o banco" em "os arquivos DESCREVEM o banco".
 *
 * USO:
 *   node scripts/aplicar-schema.mjs
 *   DATABASE_URL=postgres://... node scripts/aplicar-schema.mjs
 *
 * Precisa de `psql` no PATH. Em CI, o runner do Ubuntu já tem.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const URL_BANCO =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const PASTA = "supabase";

/**
 * A ORDEM É NUMÉRICA, e não alfabética.
 *
 * `sort()` de string põe `10-...` antes de `02-...`, e o schema do CRC inteiro
 * tentaria nascer depois das tabelas que dependem dele. O prefixo numérico
 * existe justamente para dizer a ordem — ignorá-lo seria descartar a única
 * informação que os nomes carregam.
 */
/**
 * OS ARQUIVOS `9x-` SÃO DE TESTE, E FICAM DE FORA POR PADRÃO.
 *
 * `99-teste-apenas.sql` cria uma função que executa SQL arbitrário. Ela é
 * necessária para os testes de integração e é veneno em produção.
 *
 * A trava é do script, e não da memória de quem roda: para incluí-los é preciso
 * passar `--com-teste`. Uma trava que depende de alguém lembrar não é uma trava,
 * e o dia em que esse alguém estiver com pressa é justamente o dia em que ela
 * precisaria funcionar.
 */
const COM_TESTE = process.argv.includes("--com-teste");
const ehDeTeste = (nome) => /^9[0-9]-/u.test(nome);

function arquivosEmOrdem() {
  return readdirSync(PASTA)
    .filter((n) => n.endsWith(".sql"))
    .filter((n) => COM_TESTE || !ehDeTeste(n))
    .map((nome) => ({ nome, n: Number.parseInt(nome.slice(0, nome.indexOf("-")), 10) }))
    .sort((a, b) =>
      Number.isNaN(a.n) || Number.isNaN(b.n) ? a.nome.localeCompare(b.nome) : a.n - b.n,
    )
    .map((f) => f.nome);
}

function aplicar(nome) {
  const caminho = join(PASTA, nome);

  /*
   * `ON_ERROR_STOP=1` É O PONTO DESTE SCRIPT.
   *
   * Sem essa flag, `psql` reporta o erro, segue para o próximo comando e sai com
   * status 0. O CI ficaria verde com metade do schema criado — que é pior do que
   * não ter CI nenhum, porque passa a impressão de cobertura.
   *
   * `--single-transaction` NÃO é usado: alguns arquivos criam extensão e índice
   * concorrente, que não podem viver dentro de uma transação. O preço é que uma
   * falha no meio deixa o banco parcial — aceitável, porque o banco é efêmero e
   * a execução seguinte parte de outro vazio.
   */
  const r = spawnSync(
    "psql",
    [URL_BANCO, "--variable=ON_ERROR_STOP=1", "--quiet", "--no-psqlrc", "--file", caminho],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  if (r.error) {
    console.error(`\n✗ ${nome}: não foi possível executar o psql — ${r.error.message}`);
    return false;
  }
  if (r.status !== 0) {
    console.error(`\n✗ ${nome} falhou:`);
    console.error((r.stderr || r.stdout || "").trim());
    return false;
  }

  // O stderr com status 0 é `NOTICE` — "já existe", tipicamente. Não é falha, e
  // esconder tudo faria a saída mentir sobre o que aconteceu.
  const avisos = (r.stderr || "").trim();
  console.log(`✓ ${nome}${avisos.length > 0 ? `  (${avisos.split("\n").length} aviso(s))` : ""}`);
  return true;
}

const arquivos = arquivosEmOrdem();
console.log(
  `Aplicando ${arquivos.length} arquivos de schema em ${URL_BANCO.replace(/:[^:@]*@/u, ":***@")}`,
);
if (COM_TESTE) {
  console.log("⚠️  --com-teste: arquivos 9x incluídos. NUNCA use isto em produção.");
}
console.log("");

for (const nome of arquivos) {
  if (!aplicar(nome)) {
    console.error("\nO schema NÃO subiu inteiro. Ver o erro acima.");
    process.exit(1);
  }
}

console.log(`\nSchema completo: ${arquivos.length} arquivos, do zero.`);
