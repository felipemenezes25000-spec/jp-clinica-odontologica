/**
 * A tela Saúde não fala de infraestrutura com quem atende paciente.
 *
 * ============================================================================
 *  POR QUE ISTO É UM TESTE, E NÃO UMA COMBINAÇÃO.
 *
 *  A Saúde tem dois campos por sinal: `acao`, que a tela mostra a QUALQUER
 *  pessoa logada, e `detalhe`, que só quem administra integração enxerga.
 *
 *  Durante meses o `acao` disse coisas como:
 *
 *      "Configure CRON_SECRET no repositório e CRC_URL_PUBLICA no servidor."
 *      "Veja o workflow 'CRC Pulso' no GitHub Actions."
 *      "Para destravar agora: POST /api/crc/pulso com o CRON_SECRET."
 *      "Falta: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID."
 *
 *  Nenhum VALOR de segredo vazou — eram nomes. Mas é a recepcionista lendo o
 *  nome das nossas variáveis de ambiente e dos nossos endpoints internos, numa
 *  tela que fica aberta no balcão. Não ajuda quem lê, e descreve a nossa
 *  infraestrutura para quem passar por trás.
 *
 *  Isso volta sozinho. Quem escrever o próximo sinal vai querer ser prestativo
 *  e escrever exatamente o comando que resolve — é a coisa natural a fazer, e
 *  é por isso que a proibição precisa de um teste em vez de um combinado.
 *
 *  O DETALHE CONTINUA TÉCNICO, de propósito: é para ele que o comando vai.
 * ============================================================================
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FONTE = readFileSync("src/lib/crc/aplicacao/saude.ts", "utf8");

/**
 * Os literais de `acao:` do arquivo.
 *
 * Lê a FONTE em vez de chamar as funções porque cada sinal exige um estado de
 * banco diferente — pulso morto, fila entupida, credencial ausente. Montar os
 * seis estados custaria mais do que o teste vale, e ainda deixaria de fora o
 * sinal que alguém adicionar amanhã sem escrever o estado dele.
 *
 * Lendo a fonte, sinal novo entra na varredura sozinho.
 */
function acoes(): string[] {
  const achados: string[] = [];
  // `acao: "..."` e `acao: \`...\`` — os dois aparecem no arquivo.
  for (const m of FONTE.matchAll(/acao:\s*(["`])([\s\S]*?)\1/gu)) {
    const texto = m[2];
    if (texto !== undefined) achados.push(texto);
  }
  return achados;
}

/**
 * O que não pode aparecer.
 *
 * Cada padrão é uma FAMÍLIA, e não uma string: proibir literalmente
 * "CRON_SECRET" deixaria passar "WHATSAPP_TOKEN" no dia seguinte.
 */
const PROIBIDO: readonly { nome: string; regex: RegExp }[] = [
  {
    nome: "nome de variável de ambiente (MAIÚSCULA_COM_SUBLINHADO)",
    regex: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,}\b/u,
  },
  { nome: "endpoint interno", regex: /\/api\//u },
  { nome: "arquivo de workflow do CI", regex: /\.ya?ml\b/u },
  { nome: "nome de workflow do GitHub Actions", regex: /GitHub Actions/iu },
  { nome: "verbo HTTP + caminho", regex: /\b(?:GET|POST|PATCH|PUT|DELETE)\s+\//u },
  { nome: "nome de tabela do banco", regex: /\bcrc_[a-z_]+\b/u },
];

describe("a ação mostrada na Saúde é escrita para quem opera a clínica", () => {
  it("existem ações para varrer — senão este teste passa por vazio", () => {
    /*
     * O CONTROLE POSITIVO. Se um refactor trocar `acao:` por outro nome, o
     * `matchAll` devolve zero e todos os casos abaixo passam sem olhar nada.
     * Um teste que não consegue falhar é pior que teste nenhum.
     */
    expect(acoes().length).toBeGreaterThanOrEqual(5);
  });

  for (const { nome, regex } of PROIBIDO) {
    it(`nenhuma ação contém ${nome}`, () => {
      const culpadas = acoes().filter((a) => regex.test(a));
      expect(culpadas, `a ação precisa ir para \`detalhe\`, e não para \`acao\``).toEqual([]);
    });
  }

  it("o campo `detalhe` continua podendo ser técnico", () => {
    /*
     * A CONTRAPARTIDA. Sem esta afirmação, a maneira mais fácil de fazer os
     * testes acima passarem seria apagar a informação técnica do arquivo —
     * e aí quem administra perderia o que precisa para consertar.
     */
    expect(FONTE).toMatch(/detalhe:[\s\S]{0,400}CRON_SECRET/u);
  });
});
