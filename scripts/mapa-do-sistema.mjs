/**
 * Gera `docs/crc/CRC-MAPA-DO-SISTEMA.md` a partir do código.
 *
 * ============================================================================
 *  POR QUE GERADO, E NÃO ESCRITO À MÃO.
 *
 *  O repositório tem vinte documentos em `docs/crc/`. Quase nenhum cita os
 *  módulos criados nas últimas semanas — não por desleixo, mas porque
 *  documentação escrita à mão desatualiza no primeiro módulo novo, e ninguém
 *  descobre até alguém tomar uma decisão com base nela.
 *
 *  Este mapa é derivado do que existe: cada módulo, com a primeira linha do
 *  próprio comentário de cabeçalho. Se o módulo some, ele some daqui. Se nasce,
 *  aparece. E a descrição é a que o autor escreveu no arquivo, não uma
 *  paráfrase que envelhece em paralelo.
 *
 *  USO:  node scripts/mapa-do-sistema.mjs
 * ============================================================================
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const RAIZ = process.cwd();
const SAIDA = resolve(RAIZ, "docs/crc/CRC-MAPA-DO-SISTEMA.md");

/**
 * A primeira frase do comentário de cabeçalho do arquivo.
 *
 * Quase todo módulo do CRC abre com `/** Nome — o que faz.` — essa linha é a
 * melhor descrição que existe, porque foi escrita por quem entendeu o problema
 * e vive ao lado do código que ela descreve.
 */
function descrever(caminho) {
  const fonte = readFileSync(caminho, "utf8");
  const bloco = /^\/\*\*\s*\n\s*\*\s*(.+?)\s*$/m.exec(fonte);
  if (bloco === null) return "—";

  return (
    bloco[1]
      .replace(/\.$/, "")
      // Referência a item do Prompt Mestre não ajuda quem lê o mapa.
      .replace(/\s*—?\s*§\d+.*$/, "")
      .trim()
  );
}

function listar(pasta, filtro = () => true) {
  const caminho = resolve(RAIZ, pasta);
  if (!existsSync(caminho)) return [];
  return readdirSync(caminho)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .filter((f) => !f.includes(".test."))
    .filter(filtro)
    .sort()
    .map((f) => ({
      nome: f.replace(/\.tsx?$/, ""),
      arquivo: `${pasta}/${f}`,
      descricao: descrever(resolve(caminho, f)),
      linhas: readFileSync(resolve(caminho, f), "utf8").split("\n").length,
      temTeste:
        existsSync(resolve(caminho, f.replace(/\.tsx?$/, ".test.ts"))) ||
        existsSync(resolve(caminho, f.replace(/\.tsx?$/, ".test.tsx"))),
    }));
}

function tabela(itens, comTeste = true) {
  const cabeca = comTeste
    ? "| Módulo | O que faz | Linhas | Teste |\n| --- | --- | ---: | :---: |"
    : "| Módulo | O que faz | Linhas |\n| --- | --- | ---: |";

  const linhas = itens.map((i) => {
    const base = `| \`${i.nome}\` | ${i.descricao} | ${String(i.linhas)} |`;
    return comTeste ? `${base} ${i.temTeste ? "sim" : "**não**"} |` : base;
  });

  return [cabeca, ...linhas].join("\n");
}

/* -------------------------------------------------------------------------- */

const dominio = listar("src/lib/crc/dominio");
const aplicacao = listar("src/lib/crc/aplicacao");
const automacao = listar("src/lib/crc/automacao");
const iaPlatform = listar("src/lib/crc/ia-platform");
const telas = listar("src/components/crc", (f) => f.endsWith(".tsx") && /^[A-Z]/.test(f));

/* As tabelas vêm do union `Tabela`, que é a fonte de verdade do código. */
const banco = readFileSync(resolve(RAIZ, "src/lib/crc/servidor/banco.ts"), "utf8");
const tabelas = [...banco.matchAll(/\|\s*"(crc_[a-z_]+)"/g)].map((m) => m[1]).sort();

/* As migrations, na ordem. */
const migrations = readdirSync(resolve(RAIZ, "supabase"))
  .filter((f) => f.endsWith(".sql"))
  .sort();

const semTeste = [...dominio, ...aplicacao].filter((m) => !m.temTeste);

const hoje = new Date().toISOString().slice(0, 10);

const doc = `# CRC — mapa do sistema

**Este arquivo é gerado.** Não edite à mão: rode \`node scripts/mapa-do-sistema.mjs\`.

Cada linha vem do próprio código — a descrição é a primeira frase do comentário
de cabeçalho do módulo, escrita por quem o construiu. Módulo que some, some
daqui; módulo que nasce, aparece sozinho.

\`\`\`
Gerado em          ${hoje}
Domínio            ${String(dominio.length)} módulos
Serviços           ${String(aplicacao.length)} módulos
Automação          ${String(automacao.length)} módulos
Plataforma de IA   ${String(iaPlatform.length)} módulos
Telas              ${String(telas.length)} componentes
Tabelas            ${String(tabelas.length)}
Migrations         ${String(migrations.length)}
\`\`\`

> A coluna **Teste** diz se existe um arquivo \`.test.ts\` ao lado do módulo.
> "não" não significa sem cobertura — vários são exercitados pelos testes de
> integração e pelos E2E. Significa que não há suíte dedicada, e é onde se olha
> primeiro quando algo quebra.

---

## 1. Domínio — as regras, sem banco nem rede

São funções puras: recebem o que já foi lido e devolvem decisão. É o que
permite testar a regra de encaixe ou de risco de falta sem subir nada.

${tabela(dominio)}

---

## 2. Serviços — o que lê o banco e executa

${tabela(aplicacao)}

---

## 3. Automação — o que roda sozinho

${tabela(automacao)}

---

## 4. Plataforma de IA

${tabela(iaPlatform)}

---

## 5. Telas

${tabela(telas, false)}

---

## 6. Banco

${String(tabelas.length)} tabelas, declaradas no union \`Tabela\` de
\`servidor/banco.ts\` — que é a fonte de verdade do código e é verificada
contra o SQL real pelo teste de schema.

${tabelas.map((t) => `\`${t}\``).join(" · ")}

### Migrations

${migrations.map((m) => `\`${m}\``).join(" · ")}

---

## 7. Onde não há suíte dedicada

${String(semTeste.length)} módulos de domínio e serviço não têm arquivo de teste
ao lado. A lista abaixo é o mapa da dívida — ordenada por tamanho, que é a
melhor aproximação de risco quando não se sabe mais nada.

${tabela(
  semTeste.sort((a, b) => b.linhas - a.linhas),
  false,
)}
`;

writeFileSync(SAIDA, doc, "utf8");

console.log("gerado:", SAIDA);
console.log(
  `  ${String(dominio.length)} domínio · ${String(aplicacao.length)} serviços · ` +
    `${String(telas.length)} telas · ${String(tabelas.length)} tabelas`,
);
console.log(`  sem suíte dedicada: ${String(semTeste.length)}`);
