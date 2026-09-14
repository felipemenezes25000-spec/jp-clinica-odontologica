/**
 * Devolve o teto de 3.000 linhas à analítica e confere que um teste NOMEADO
 * reprova em cada caso.
 *
 * ============================================================================
 *  POR QUE ISTO EXISTE, e não é preciosismo.
 *
 *  Um teste que passa não prova nada sozinho. Ele prova que o código atual
 *  satisfaz uma asserção — e uma asserção fraca é satisfeita por qualquer
 *  código, inclusive pelo defeituoso.
 *
 *  O defeito que estes testes existem para impedir é TRUNCAMENTO SILENCIOSO:
 *  a fonte devolve as 3.000 primeiras linhas, o código soma o que recebeu, e o
 *  painel mostra um número plausível e menor que a realidade.
 *
 *  Então a pergunta certa não é "os testes passam?". É: "se o truncamento
 *  voltar, ALGUM teste reprova, e é o teste que fala sobre escala?".
 *
 *  Este script responde isso executando, e não argumentando.
 * ============================================================================
 *
 *  O QUE ELE PATCHEIA, e a limitação honesta:
 *
 *  Ele trunca a FONTE dentro do banco em memória — que é exatamente o que o
 *  PostgREST fazia com `limite: 3000`: entregar as N primeiras linhas e calar.
 *
 *  A diferença técnica é que o PostgREST truncava DEPOIS de aplicar o filtro, e
 *  aqui o corte acontece ANTES. Nos testes alvejados isso dá no mesmo, porque
 *  eles semeiam uma clínica só — e é por isso que os alvos estão fixados por
 *  nome abaixo, em vez de "rode a suíte inteira e veja se algo quebra".
 *
 *  Uso:
 *    node scripts/injetar-defeitos-analytics.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const FAKE = "src/lib/crc/testes/banco-memoria.ts";
const TETO = 3000;

/**
 * Cada defeito: onde cortar, e qual teste TEM que reprovar por causa disso.
 *
 * O `alvo` é o nome exato do teste. Um script que só conferisse "a suíte ficou
 * vermelha" aceitaria que o truncamento fosse pego por acidente, num teste que
 * fala de outra coisa — e no dia em que esse teste fosse reescrito, a proteção
 * sumiria sem ninguém notar.
 */
const DEFEITOS = [
  {
    nome: "motivos de perda lê 3.000 oportunidades",
    de: `      for (const l of tabelas["crc_opportunities"] ?? []) {
        if (l["organization_id"] !== org) continue;
        const motivo = l["lost_reason"];`,
    para: `      for (const l of (tabelas["crc_opportunities"] ?? []).slice(0, ${TETO})) {
        if (l["organization_id"] !== org) continue;
        const motivo = l["lost_reason"];`,
    alvo: "10.000 perdas: o valor sai inteiro, e não 30% dele",
  },
  {
    nome: "motivos de perda perde um motivo inteiro depois do corte",
    de: `      for (const l of tabelas["crc_opportunities"] ?? []) {
        if (l["organization_id"] !== org) continue;
        const motivo = l["lost_reason"];`,
    para: `      for (const l of (tabelas["crc_opportunities"] ?? []).slice(0, ${TETO})) {
        if (l["organization_id"] !== org) continue;
        const motivo = l["lost_reason"];`,
    alvo: "um motivo inteiro não some por estar depois do corte",
  },
  {
    nome: "speed to lead lê 3.000 leads",
    /*
     * A ÂNCORA INCLUI AS DUAS LINHAS SEGUINTES porque `crc_leads` passou a ser
     * varrido em DOIS lugares do fake: aqui e em `crc_leads_por_campanha`.
     *
     * O script se RECUSOU a patchear — "âncora ambígua" — em vez de acertar o
     * lugar errado. É o comportamento certo, e foi ele que denunciou: o
     * resultado caiu de 6/6 para 4/6 e disse exatamente por quê.
     */
    de: `      for (const l of tabelas["crc_leads"] ?? []) {
        if (l["organization_id"] !== org) continue;
        const criado = l["criado_em"];`,
    para: `      for (const l of (tabelas["crc_leads"] ?? []).slice(0, ${TETO})) {
        if (l["organization_id"] !== org) continue;
        const criado = l["criado_em"];`,
    alvo: 'a mediana truncada não é "quase a mediana" — 10.000 leads provam',
  },
  {
    nome: "speed to lead: a mediana passa a descrever os primeiros 3.000",
    /*
     * A ÂNCORA INCLUI AS DUAS LINHAS SEGUINTES porque `crc_leads` passou a ser
     * varrido em DOIS lugares do fake: aqui e em `crc_leads_por_campanha`.
     *
     * O script se RECUSOU a patchear — "âncora ambígua" — em vez de acertar o
     * lugar errado. É o comportamento certo, e foi ele que denunciou: o
     * resultado caiu de 6/6 para 4/6 e disse exatamente por quê.
     */
    de: `      for (const l of tabelas["crc_leads"] ?? []) {
        if (l["organization_id"] !== org) continue;
        const criado = l["criado_em"];`,
    para: `      for (const l of (tabelas["crc_leads"] ?? []).slice(0, ${TETO})) {
        if (l["organization_id"] !== org) continue;
        const criado = l["criado_em"];`,
    alvo: "25.000 leads: nada depende do tamanho da base",
  },
  {
    nome: "panorama lê 3.000 oportunidades abertas",
    de: `      const abertas = (tabelas["crc_opportunities"] ?? []).filter(`,
    para: `      const abertas = (tabelas["crc_opportunities"] ?? []).slice(0, ${TETO}).filter(`,
    alvo: "10.000 oportunidades abertas: o valor parado sai inteiro",
  },
  {
    nome: "panorama lê 3.000 recuperações",
    de: `      const recuperadas = (tabelas["crc_funnel_events"] ?? []).filter((l) => {`,
    para: `      const recuperadas = (tabelas["crc_funnel_events"] ?? []).slice(0, ${TETO}).filter((l) => {`,
    alvo: "5.000 recuperações no mês: a contagem e os pacientes distintos batem",
  },
];

const original = readFileSync(FAKE, "utf8");
let mordeu = 0;

for (const d of DEFEITOS) {
  const ocorrencias = original.split(d.de).length - 1;
  if (ocorrencias !== 1) {
    console.log(`  ?  ${d.nome}`);
    console.log(`     ÂNCORA AMBÍGUA: ${String(ocorrencias)} ocorrências. O script precisa ser`);
    console.log(`     corrigido — sem âncora única ele patcheia o lugar errado.\n`);
    continue;
  }

  writeFileSync(FAKE, original.split(d.de).join(d.para), "utf8");

  let reprovou = false;
  let saida = "";
  try {
    saida = execFileSync(
      "npx",
      ["vitest", "run", "src/lib/crc/aplicacao/analytics.test.ts", "-t", d.alvo],
      { encoding: "utf8", stdio: "pipe", shell: process.platform === "win32" },
    );
  } catch (erro) {
    reprovou = true;
    saida = `${String(erro.stdout ?? "")}${String(erro.stderr ?? "")}`;
  } finally {
    writeFileSync(FAKE, original, "utf8");
  }

  /*
   * CONFERE QUE O TESTE ALVO RODOU, e não só que a suíte ficou vermelha.
   *
   * Sem isto, um `-t` com o nome errado faria o vitest rodar ZERO teste, e
   * "zero testes" é sucesso — o script sairia dizendo que o defeito não foi
   * pego quando na verdade nunca foi testado. A primeira versão deste arquivo
   * tinha exatamente esse buraco.
   */
  const limpo = saida
    .split(String.fromCharCode(27))
    .join(" ")
    .replace(/\[[0-9;]*m/gu, "");
  const rodouAlgum = /Tests\s+\d+\s+(failed|passed)/u.test(limpo);

  if (!rodouAlgum) {
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
    console.log(`     O TESTE PASSOU COM O DEFEITO DENTRO. A asserção não mede escala.`);
    console.log(`     alvo: "${d.alvo}"\n`);
  }
}

console.log(`${String(mordeu)}/${String(DEFEITOS.length)} defeitos foram pegos.`);
process.exit(mordeu === DEFEITOS.length ? 0 : 1);
