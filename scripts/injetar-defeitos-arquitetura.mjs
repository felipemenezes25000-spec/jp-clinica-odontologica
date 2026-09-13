/**
 * Reintroduz cada classe de defeito e confere que a invariante correspondente
 * REPROVA — uma por uma, com o nome do teste alvo fixado.
 *
 * ============================================================================
 *  UMA FITNESS FUNCTION QUE NUNCA FOI VISTA REPROVANDO É UM COMENTÁRIO.
 *
 *  Ela passa hoje porque o código está certo. Passaria igual se a varredura
 *  tivesse um erro de regex e devolvesse lista vazia para sempre — e essa é
 *  exatamente a falha que ninguém percebe, porque o sintoma é uma linha verde.
 *
 *  Os controles positivos dentro do teste cobrem metade do problema ("a
 *  varredura está lendo arquivos?"). Este script cobre a outra metade ("a
 *  varredura RECONHECE o defeito quando ele está lá?").
 * ============================================================================
 *
 *  Uso:
 *    node scripts/injetar-defeitos-arquitetura.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const TESTE = "src/lib/crc/testes/invariantes-arquiteturais.test.ts";

const DEFEITOS = [
  {
    nome: "leitura com teto grande usada como total, em arquivo fora da lista",
    arquivo: "src/lib/crc/aplicacao/leads.ts",
    aplicar: (fonte) =>
      `${fonte}\n` +
      "async function totalInventadoParaInjecao(organizationId: string) {\n" +
      '  const linhas = await selecionar("crc_leads", {\n' +
      '    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],\n' +
      "    limite: 4000,\n" +
      "  });\n" +
      "  return linhas.length;\n" +
      "}\n",
    alvo: "toda leitura com teto grande que vira total está na lista auditada",
  },
  {
    nome: "domínio lendo o relógio global",
    arquivo: "src/lib/crc/dominio/dia-local.ts",
    aplicar: (fonte) =>
      `${fonte}\nexport const agoraInjetado = new Date().toISOString();\n`,
    alvo: "nenhum `new Date()` ou `Date.now()` fora de parâmetro com padrão",
  },
  {
    nome: "soma de receita sem separar confirmada de potencial",
    arquivo: "supabase/42-crc-analitica-sem-teto.sql",
    aplicar: (fonte) =>
      `${fonte}\n` +
      "create or replace function public.crc_receita_injetada(p_organization_id uuid)\n" +
      "returns numeric language sql stable as $x$\n" +
      "  select coalesce(sum(v.valor), 0)\n" +
      "    from public.crc_revenue_events v\n" +
      "   where v.organization_id = p_organization_id;\n" +
      "$x$;\n",
    alvo: "todo `sum` sobre crc_revenue_events fala de `natureza`",
  },
  {
    nome: "tela importando o servidor estaticamente",
    arquivo: "src/components/crc/base.tsx",
    aplicar: (fonte) => `import { selecionar } from "@/lib/crc/servidor/banco";\n${fonte}`,
    alvo: "`servidor/` só entra por `await import()`",
  },
];

let mordeu = 0;

for (const d of DEFEITOS) {
  const original = readFileSync(d.arquivo, "utf8");
  writeFileSync(d.arquivo, d.aplicar(original), "utf8");

  let reprovou = false;
  let saida = "";
  try {
    saida = execFileSync("npx", ["vitest", "run", TESTE, "-t", d.alvo], {
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

  /*
   * CONFERE QUE O TESTE ALVO RODOU. Um `-t` com nome errado faz o vitest rodar
   * ZERO teste, e zero testes é sucesso — o script diria "não pegou" quando na
   * verdade nunca testou.
   */
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
    console.log(`     A INVARIANTE NÃO VIU O DEFEITO. alvo: "${d.alvo}"\n`);
  }
}

console.log(`${String(mordeu)}/${String(DEFEITOS.length)} invariantes morderam.`);
process.exit(mordeu === DEFEITOS.length ? 0 : 1);
