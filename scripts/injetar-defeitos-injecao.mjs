/**
 * Desliga cada camada de defesa contra prompt injection, uma de cada vez, e
 * confere que a suíte adversarial REPROVA.
 *
 * ============================================================================
 *  POR QUE ESTE SCRIPT É MAIS IMPORTANTE QUE OS OUTROS DOIS.
 *
 *  Um teste de segurança que nunca foi visto reprovando não prova segurança:
 *  prova que o teste roda. E, diferente de um número errado num painel, aqui a
 *  falha não aparece na tela de ninguém — ela aparece numa pessoa que
 *  atravessou a cidade para uma consulta que não existe.
 *
 *  A suíte tem 46 casos. Este script desliga a defesa e conta quantos deles
 *  eram, de fato, sensíveis à defesa.
 * ============================================================================
 *
 *  Uso:
 *    node scripts/injetar-defeitos-injecao.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const SUITE = "src/lib/crc/ia-platform/injecao.test.ts";

const DEFEITOS = [
  {
    nome: "a neutralização de cabeçalho é desligada",
    arquivo: "src/lib/crc/dominio/texto-externo.ts",
    de: `      .replace(/^[ \\t]*(#{1,6})[ \\t]+/gmu, "> $1 ")`,
    para: `      .replace(/^[ \\t]*(#{1,6})[ \\t]+/gmu, "$1 ")`,
    alvo: "o cabeçalho forjado não vira seção — vira citação",
  },
  {
    nome: "a cerca de conteúdo externo some",
    arquivo: "src/lib/crc/dominio/texto-externo.ts",
    de: `    ABRE,
    dentro,
    FECHA,`,
    para: `    dentro,`,
    alvo: "a conversa fica dentro de uma cerca que diz que ali é dado",
  },
  {
    nome: "o conteúdo volta a poder fechar a cerca por dentro",
    arquivo: "src/lib/crc/dominio/texto-externo.ts",
    de: `  const dentro = neutralizarTextoExterno(conteudo)
    .split(ABRE)
    .join("⟨abre⟩")
    .split(FECHA)
    .join("⟨fecha⟩");`,
    para: `  const dentro = neutralizarTextoExterno(conteudo);`,
    alvo: "o conteúdo não consegue fechar a cerca por dentro",
  },
  {
    nome: "o nome do paciente volta a entrar cru",
    arquivo: "src/lib/crc/ia-platform/contexto.ts",
    de: `    const linhas = [\`Nome: \${neutralizarLinhaExterna(p.primeiroNome)}\`];`,
    para: `    const linhas = [\`Nome: \${p.primeiroNome}\`];`,
    alvo: "pelo NOME do paciente, que vem do Dental Office",
  },
  {
    nome: "o portão de vaga não consultada sai da cadeia",
    arquivo: "src/lib/crc/dominio/guardrails.ts",
    de: `  portaoHorario,
  portaoVazamento,`,
    para: `  portaoVazamento,`,
    alvo: "E MESMO SE O MODELO OBEDECER, o portão não deixa sair",
  },
  {
    nome: "o portão passa a ignorar se a agenda foi consultada",
    arquivo: "src/lib/crc/dominio/guardrails.ts",
    de: `    if (ctx.horariosOferecidos.length > 0) return PASSA;`,
    para: `    if (ctx.horariosOferecidos.length >= 0) return PASSA;`,
    alvo: "bloqueia: Tenho horário amanhã às 14h",
  },
];

let mordeu = 0;

for (const d of DEFEITOS) {
  const original = readFileSync(d.arquivo, "utf8");
  const ocorrencias = original.split(d.de).length - 1;

  if (ocorrencias !== 1) {
    console.log(`  ?  ${d.nome}`);
    console.log(`     ÂNCORA AMBÍGUA: ${String(ocorrencias)} ocorrências em ${d.arquivo}.\n`);
    continue;
  }

  writeFileSync(d.arquivo, original.split(d.de).join(d.para), "utf8");

  let reprovou = false;
  let saida = "";
  try {
    saida = execFileSync("npx", ["vitest", "run", SUITE, "-t", d.alvo], {
      encoding: "utf8",
      stdio: "pipe",
      shell: process.platform === "win32",
    });
  } catch (erro) {
    reprovou = true;
    saida = `${String(erro.stdout ?? "")}${String(erro.stderr ?? "")}`;
  } finally {
    writeFileSync(d.arquivo, original, "utf8");
  }

  const limpo = saida
    .split(String.fromCharCode(27))
    .join(" ")
    .replace(/\[[0-9;]*m/gu, "");

  if (!/Tests\s+\d+\s+(failed|passed)/u.test(limpo)) {
    console.log(`  ?  ${d.nome}`);
    console.log(`     NENHUM TESTE RODOU com -t "${d.alvo}". O nome do alvo não casa.\n`);
    continue;
  }

  if (reprovou) {
    mordeu += 1;
    console.log(`  ✓  ${d.nome}`);
    console.log(`     reprovou: "${d.alvo}"\n`);
  } else {
    console.log(`  ✗  ${d.nome}`);
    console.log(`     A SUÍTE NÃO VIU A DEFESA SUMIR. alvo: "${d.alvo}"\n`);
  }
}

console.log(`${String(mordeu)}/${String(DEFEITOS.length)} defesas são cobertas por teste.`);
process.exit(mordeu === DEFEITOS.length ? 0 : 1);
