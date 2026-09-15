/**
 * Reintroduz cada defeito crítico da integração Meta e confere que o teste
 * correspondente REPROVA — §55.
 *
 * ============================================================================
 *  UM TESTE QUE NUNCA FOI VISTO REPROVANDO É UM COMENTÁRIO.
 *
 *  Ele passa hoje porque o código está certo. Passaria igual se a asserção
 *  estivesse num `it` com nome errado, ou comparando a coisa errada, ou dentro
 *  de um `if` que nunca é verdade — e essa é exatamente a falha que ninguém
 *  percebe, porque o sintoma é uma linha verde.
 *
 *  O §55 pede cinco provas nominalmente, e as cinco estão aqui:
 *
 *    1. remover dedupe                    → o teste precisa falhar
 *    2. trocar tenant pela primeira clínica → o teste precisa falhar
 *    3. ignorar assinatura                → o teste precisa falhar
 *    4. colidir namespace de EXTERNAL_ID  → o teste precisa falhar
 *    5. webhook histórico disparar automação → o teste precisa falhar
 * ============================================================================
 *
 *  CADA DEFEITO É APLICADO, TESTADO E DESFEITO — um por vez, e o `finally`
 *  restaura o arquivo mesmo se o vitest estourar. Rodar isto num repositório
 *  sujo é seguro; rodar com o processo morto no meio deixa UM arquivo alterado,
 *  e `git diff` mostra qual.
 *
 *  Uso:
 *    node scripts/injetar-defeitos-meta.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const DEFEITOS = [
  {
    nome: "1. a dedupe por mensagem é removida",
    arquivo: "src/lib/crc/testes/banco-memoria.ts",
    /*
     * ATACA O ÍNDICE, e não o código de aplicação — e é o ponto.
     *
     * A idempotência do CRC é CONSTRAINT DE BANCO, não cuidado de código: nada
     * em `receberMensagemDoCanal` compara ids. Remover o índice do fake é
     * reproduzir exatamente o que aconteceria se a migração não tivesse criado
     * o índice em produção.
     */
    aplicar: (fonte) =>
      fonte.replace(
        `    {
      colunas: ["organization_id", "provider_message_id"],
      onde: (l) => !nulo(l["provider_message_id"]),
    },`,
        "",
      ),
    teste: "src/lib/crc/aplicacao/meta.test.ts",
    alvo: "a garantia real é POR MENSAGEM, e não pela chave do envelope",
  },
  {
    nome: "2. o tenant passa a ser a primeira clínica ativa",
    arquivo: "src/lib/crc/integracoes/meta/canais.ts",
    /*
     * O DEFEITO HISTÓRICO DESTE REPOSITÓRIO, reencenado no caminho da Meta. É
     * literalmente o que `resolverEscopo()` fazia antes do `supabase/23`.
     */
    aplicar: (fonte) =>
      fonte.replace(
        "export async function resolverTenantDaMeta(contaExterna: string): Promise<TenantDaMeta | null> {\n  const conta = contaExterna.trim();\n  if (conta.length === 0) return null;",
        "export async function resolverTenantDaMeta(contaExterna: string): Promise<TenantDaMeta | null> {\n" +
          "  const conta = contaExterna.trim();\n" +
          "  if (conta.length === 0) return null;\n" +
          '  const primeira = await selecionarUm("crc_clinics", {\n' +
          '    colunas: "id,organization_id",\n' +
          '    filtros: [{ coluna: "ativa", op: "eq", valor: true }],\n' +
          "  });\n" +
          "  if (primeira !== null) {\n" +
          "    return {\n" +
          '      canalId: "injetado",\n' +
          '      organizationId: String(primeira["organization_id"] ?? ""),\n' +
          '      clinicId: String(primeira["id"] ?? ""),\n' +
          "    };\n" +
          "  }",
      ),
    teste: "src/lib/crc/aplicacao/meta.test.ts",
    alvo: "o evento da clínica B NUNCA aparece na clínica A",
  },
  {
    nome: "3. a assinatura do webhook é ignorada",
    arquivo: "src/lib/crc/integracoes/meta/assinatura.ts",
    aplicar: (fonte) =>
      fonte.replace(
        '  if (appSecret.trim().length === 0) return { valida: false, motivo: "sem_segredo" };',
        "  return { valida: true };\n" +
          '  if (appSecret.trim().length === 0) return { valida: false, motivo: "sem_segredo" };',
      ),
    teste: "src/lib/crc/integracoes/meta/assinatura.test.ts",
    alvo: "recusa quando o corpo mudou UM byte",
  },
  {
    nome: "4. o namespace sai da chave de identidade",
    arquivo: "src/lib/crc/aplicacao/omnichannel.ts",
    /*
     * O FILTRO É O QUE IMPORTA, e não a coluna: sem o namespace no `where`, a
     * segunda gravação acha a primeira como "de outra pessoa" e marca as duas
     * como compartilhadas — e a resolução das duas para de funcionar.
     */
    aplicar: (fonte) =>
      fonte.replace(
        '    { coluna: "namespace", op: "eq", valor: namespace },\n    { coluna: "valor", op: "eq", valor },\n  ];',
        '    { coluna: "valor", op: "eq", valor },\n  ];',
      ),
    teste: "src/lib/crc/aplicacao/identidade-namespace.test.ts",
    alvo: "o MESMO valor em namespaces diferentes são DUAS identidades",
  },
  {
    nome: "5. o histórico importado passa a disparar automação",
    arquivo: "src/lib/crc/aplicacao/mensagens.ts",
    /*
     * É O §48 LITERAL: "backfill não pode mandar 'Oi, vi sua mensagem' para
     * conversa de seis meses atrás". A flag é o que impede, e apagá-la da
     * condição reintroduz o defeito inteiro.
     */
    aplicar: (fonte) => fonte.replace("  if (!ehSaida && !ehHistorico) {", "  if (!ehSaida) {"),
    teste: "src/lib/crc/aplicacao/meta-historico.test.ts",
    alvo: "o backfill NÃO emite `message.received`",
  },
  {
    nome: "6. a trava de sandbox volta a ser resolvida em tempo de build",
    arquivo: "src/lib/crc/servidor/ambiente.ts",
    /*
     * ========================================================================
     *  ESTE DEFEITO É UMA "LIMPEZA" QUE JÁ ACONTECEU DUAS VEZES.
     *
     *  `globalThis.process?.env?.["NODE_ENV"]` parece rebuscado, e a forma
     *  direta parece equivalente. Ela não é: o bundler substitui o caminho a
     *  partir do identificador `process` por um literal, e `sandboxLigado()` é
     *  compilada para `return false` no artefato do servidor.
     *
     *  O sintoma não é erro nenhum — é envio que nunca acontece, com uma
     *  mensagem sobre credencial faltando três camadas acima. Foi assim que o
     *  E2E ficou incapaz de provar qualquer envio, do Instagram e do WhatsApp.
     * ========================================================================
     */
    aplicar: (fonte) =>
      fonte.replace(
        'return (raiz.process?.env?.["NODE_ENV"] ?? "").trim();',
        'return (process.env["NODE_ENV"] ?? "").trim();',
      ),
    teste: "src/lib/crc/testes/invariantes-arquiteturais.test.ts",
    alvo: "`ehProducao` chega em `process` por `globalThis`",
  },
  {
    nome: "7. a Inbox volta a responder tudo pelo WhatsApp",
    arquivo: "src/lib/crc/aplicacao/mensagens.ts",
    /*
     * ========================================================================
     *  O DEFEITO QUE SÓ O E2E ENCONTROU, E QUE AGORA TEM GUARDA DE UNIDADE.
     *
     *  Antes de `enviarNoCanal` existir, responder um direct do Instagram
     *  tentava o WhatsApp e recusava com "credencial de WhatsApp só existe no
     *  ambiente". O paciente ficava sem resposta.
     *
     *  Trocar `canal` por `"whatsapp"` na resolução da porta reproduz a
     *  essência: a saída passa a ignorar de qual canal é a conversa.
     * ========================================================================
     */
    aplicar: (fonte) =>
      fonte.replace(
        "const estado = await criarPortaDaMeta(canal, pedido.organizationId, pedido.clinicId);",
        'const estado = await criarPortaDaMeta("messenger", pedido.organizationId, pedido.clinicId);',
      ),
    teste: "src/lib/crc/aplicacao/enviar-no-canal.test.ts",
    alvo: "o direct sai como texto, e a mensagem fica SENT com o id do provedor",
  },
];

let mordeu = 0;

for (const d of DEFEITOS) {
  const original = readFileSync(d.arquivo, "utf8");
  const comDefeito = d.aplicar(original);

  /*
   * CONFERE QUE O DEFEITO FOI APLICADO DE FATO.
   *
   * Um `replace` cujo alvo não existe mais — porque alguém reformatou o arquivo
   * — devolve a fonte INTACTA, o teste passa, e o script diria "a invariante
   * não viu o defeito". Estaria acusando o inocente.
   */
  if (comDefeito === original) {
    console.log(`  ?  ${d.nome}`);
    console.log(`     O DEFEITO NÃO FOI APLICADO: o trecho alvo não existe mais em ${d.arquivo}.`);
    console.log("     Atualize o `aplicar` deste defeito.\n");
    continue;
  }

  writeFileSync(d.arquivo, comDefeito, "utf8");

  let reprovou = false;
  let saida = "";
  try {
    saida = execFileSync("npx", ["vitest", "run", d.teste, "-t", d.alvo], {
      encoding: "utf8",
      stdio: "pipe",
      shell: process.platform === "win32",
    });
  } catch (erro) {
    reprovou = true;
    saida = `${String(erro.stdout ?? "")}${String(erro.stderr ?? "")}`;
  } finally {
    // RESTAURA SEMPRE. Ver o cabeçalho.
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
    console.log(`     O TESTE NÃO VIU O DEFEITO. alvo: "${d.alvo}"\n`);
  }
}

console.log(`${String(mordeu)}/${String(DEFEITOS.length)} testes morderam.`);
process.exit(mordeu === DEFEITOS.length ? 0 : 1);
