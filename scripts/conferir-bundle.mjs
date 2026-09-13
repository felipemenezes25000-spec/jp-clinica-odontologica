#!/usr/bin/env node
/**
 * O que foi realmente parar no navegador — varredura do bundle construído.
 *
 * ============================================================================
 *  POR QUE UM SCRIPT, E NÃO UM TESTE.
 *
 *  Esta verificação precisa do BUILD. Um teste de unidade que rodasse `vite
 *  build` levaria minutos em cada `npm test`, e um teste que PULASSE quando o
 *  build não existe seria a pior linha verde do repositório — um "tudo certo"
 *  permanente que ninguém confere.
 *
 *  Então isto é um passo de CI, depois do build, e falha alto.
 * ============================================================================
 *
 *  O QUE ELE PROCURA, e por que cada coisa:
 *
 *  SEGREDO NO CLIENTE. O regime deste projeto é: nenhum segredo com prefixo
 *  `VITE_`, nenhum segredo no código. Isso é disciplina até virar verificação.
 *  O Vite substitui `import.meta.env.X` por um LITERAL em tempo de build — se
 *  alguém renomear uma variável para `VITE_...`, o valor viaja para dentro do
 *  JavaScript que o navegador baixa, e nada na tela muda.
 *
 *  MÓDULO DE SERVIDOR NO CLIENTE. `servidor/banco.ts` lê a chave de serviço.
 *  Ele nunca deve entrar no grafo do bundle do navegador — nem "vazio", nem
 *  "tree-shaken": a presença dele é o sinal de que o import estático existe.
 *
 *  Uso:
 *    npm run build && node scripts/conferir-bundle.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A pasta que o navegador baixa.
 *
 * `.vercel/output/static` é o que o preset da Vercel publica. `dist/client` é
 * o caminho do `vite build` puro — os dois existem dependendo de como foi
 * construído, e olhar só um faria a varredura passar sem varrer nada.
 */
const CANDIDATOS = [".vercel/output/static", "dist/client", "dist"];

function arquivos(raiz) {
  const saida = [];
  for (const nome of readdirSync(raiz)) {
    const caminho = join(raiz, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho));
    else saida.push(caminho);
  }
  return saida;
}

/**
 * Os padrões de segredo.
 *
 * Cada um é o FORMATO de uma credencial real deste sistema, e não o valor de
 * nenhuma — o arquivo é versionado, e uma varredura que carregasse o segredo
 * para procurá-lo seria o próprio vazamento.
 */
const PADROES = [
  { nome: "JWT do Supabase (service_role ou anon)", regex: /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\./u },
  { nome: "chave da OpenAI", regex: /\bsk-[A-Za-z0-9_-]{20,}/u },
  { nome: "chave da Anthropic", regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/u },
  { nome: "token do WhatsApp Cloud API", regex: /\bEAA[A-Za-z0-9]{40,}/u },
  { nome: "chave de serviço do Google", regex: /-----BEGIN (?:RSA )?PRIVATE KEY-----/u },
  { nome: "URL de Postgres com senha", regex: /postgres(?:ql)?:\/\/[^\s:@"']+:[^\s:@"']+@/u },
  {
    nome: "variável de ambiente de segredo exposta com valor",
    // `SUPABASE_SERVICE_ROLE:"..."` — o nome seguido de um literal não vazio.
    regex: /(?:SERVICE_ROLE|CRON_SECRET|WHATSAPP_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY)["']?\s*[:=]\s*["'][^"']{16,}/u,
  },
];

/** Marcas de que um módulo de servidor foi para o grafo do cliente. */
const MARCAS_DE_SERVIDOR = [
  "SUPABASE_SERVICE_ROLE",
  "Supabase não configurado: defina SUPABASE_URL",
];

const raiz = CANDIDATOS.find((c) => existsSync(c));

if (raiz === undefined) {
  console.error("Nenhuma pasta de build encontrada. Rode `npm run build` antes.");
  console.error(`Procurei em: ${CANDIDATOS.join(", ")}`);
  process.exit(1);
}

const todos = arquivos(raiz);
const doNavegador = todos.filter((c) => /\.(?:js|mjs|css|html|json|map)$/u.test(c));

if (doNavegador.length === 0) {
  console.error(`\`${raiz}\` não tem nenhum arquivo servível. O build saiu vazio?`);
  process.exit(1);
}

console.log(`Varrendo ${String(doNavegador.length)} arquivos em ${raiz}\n`);

const problemas = [];

for (const caminho of doNavegador) {
  const texto = readFileSync(caminho, "utf8");

  for (const p of PADROES) {
    const achado = p.regex.exec(texto);
    if (achado === null) continue;
    /*
     * O TRECHO ENCONTRADO NÃO É IMPRESSO. Imprimir o segredo no log do CI o
     * publicaria num lugar novo — e logs de CI são lidos por mais gente e
     * guardados por mais tempo do que qualquer um imagina.
     */
    problemas.push(
      `${caminho}: ${p.nome} (posição ${String(achado.index)}, ${String(achado[0].length)} caracteres)`,
    );
  }

  for (const marca of MARCAS_DE_SERVIDOR) {
    if (texto.includes(marca)) {
      problemas.push(`${caminho}: módulo de servidor no grafo do cliente — achei "${marca}"`);
    }
  }
}

if (problemas.length === 0) {
  console.log("✓ Nenhum segredo e nenhum módulo de servidor no bundle do navegador.");
  process.exit(0);
}

console.error("✗ O bundle do navegador contém o que não podia:\n");
for (const p of problemas) console.error(`  ${p}`);
console.error(
  [
    "",
    "SE FOR SEGREDO: ele já pode ter sido publicado. Rode a chave nova antes de",
    "qualquer outra coisa — corrigir o código não invalida o que foi ao ar.",
    "",
    "SE FOR MÓDULO DE SERVIDOR: alguém importou `servidor/` estaticamente numa",
    "tela. Troque por `await import()` dentro do handler.",
  ].join("\n"),
);
process.exit(1);
