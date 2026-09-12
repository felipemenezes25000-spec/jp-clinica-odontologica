/**
 * As varreduras precisam percorrer a base, e não reler o começo dela.
 *
 * ============================================================================
 *  DOIS DEFEITOS COM O MESMO SINTOMA: um número que parece saudável.
 *
 *  RECALL. `order by ultima_consulta_em asc limit 200`, sem cursor. A execução
 *  seguinte lê as MESMAS 200 linhas — são as mesmas 200 mais antigas, e elas
 *  continuam elegíveis porque quem não respondeu não mudou
 *  `ultima_consulta_em`. O dedupe por ciclo impede o efeito duplicado, então
 *  nada acontece duas vezes e nada dá erro. O relatório diz "avaliados: 200"
 *  todo dia. Os pacientes 201 em diante nunca são avaliados: com 8.000, 97,5%
 *  da base fica fora do recall.
 *
 *  ANIVERSÁRIO. `limit 2000` e comparação de mês/dia em memória, sem
 *  `order by`. Quais 2.000 é decisão do planejador, e ela muda. Com 8.000
 *  pacientes, três em cada quatro aniversariantes não eram vistos — e quais três
 *  mudava a cada execução.
 *
 *  OS DOIS FUNCIONAM PERFEITAMENTE COM 500 PACIENTES. É por isso que nenhum
 *  teste pegou: o tamanho da base era o defeito.
 *
 *  INJEÇÃO DE DEFEITO:
 *    ignorar o cursor (`p_cursor_data: null` fixo) quebra a convergência do
 *    recall — as mesmas 200 linhas voltam para sempre;
 *    voltar o aniversário para `selecionar(... limite: 2000)` quebra o teste do
 *    aniversariante que está depois da linha 2.000.
 * ============================================================================
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return { ...real, registrar: () => undefined, auditar: () => Promise.resolve() };
});

import { CONFIGURACAO_PADRAO } from "../dominio/configuracao";
import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import { varrerAniversarios, varrerRecall } from "./handlers";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLINICA = "22222222-2222-4222-8222-222222222222";
const AGORA = new Date("2026-09-08T12:00:00.000Z");

/** Um paciente sem consulta há muito tempo — elegível a recall. */
function sumido(i: number): Record<string, unknown> {
  // Datas distintas e crescentes: é o que dá ordem estável ao keyset e o que
  // uma base real tem.
  const quando = new Date(Date.UTC(2024, 0, 1) + i * 3_600_000).toISOString();
  return {
    id: `p-${String(i).padStart(5, "0")}`,
    organization_id: ORG,
    clinic_id: CLINICA,
    external_source: "do",
    external_id: `x-${String(i)}`,
    nome: `Paciente ${String(i)}`,
    telefone: `5511${String(900000000 + i)}`,
    situacao: "EM_TRATAMENTO",
    ativo: true,
    arquivado: false,
    ultima_consulta_em: quando,
  };
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  semear("crc_organizations", [{ id: ORG, nome: "JP", slug: "jp" }]);
  semear("crc_clinics", [
    { id: CLINICA, organization_id: ORG, nome: "Matriz", slug: "matriz", ativa: true },
  ]);
});

/* -------------------------------------------------------------------------- */
/* Recall                                                                     */
/* -------------------------------------------------------------------------- */

describe("a varredura de recall", () => {
  function base(quantos: number): void {
    for (let i = 0; i < quantos; i += 1) semear("crc_patients", [sumido(i)]);
  }

  it("TRÊS ciclos de 200 avaliam os 500, e não 200 três vezes", async () => {
    base(500);

    const vistos = new Set<string>();
    for (let volta = 0; volta < 3; volta += 1) {
      const r = await varrerRecall(ORG, CONFIGURACAO_PADRAO, 200, AGORA);
      expect(r.seletor).toBe("RECALL");
      // As oportunidades criadas são o rastro de quem foi avaliado. Contar o
      // retorno não serviria: ele diz quantos, e a pergunta é QUAIS.
      for (const o of conteudo("crc_opportunities")) vistos.add(String(o["patient_id"] ?? ""));
    }

    /*
     * 500 PACIENTES DISTINTOS. Com a versão sem cursor, este número seria 200 —
     * e as três execuções teriam relatado "avaliados: 200" cada uma, que é
     * exatamente o que fazia o defeito parecer saudável.
     */
    expect(vistos.size).toBe(500);
  });

  it("o cursor é PERSISTIDO: em serverless não existe 'a próxima invocação lembra'", async () => {
    base(500);
    await varrerRecall(ORG, CONFIGURACAO_PADRAO, 200, AGORA);

    const estado = conteudo("crc_scan_state");
    expect(estado).toHaveLength(1);
    expect(estado[0]?.["varredura"]).toBe("recall");
    expect(typeof estado[0]?.["cursor_data"]).toBe("string");
    expect(estado[0]?.["cursor_id"]).toBe("p-00199");
  });

  it("a volta FECHA e recomeça: cursor zerado, ciclo incrementado", async () => {
    /*
     * É o que transforma a varredura numa VOLTA em vez de num prefixo. Sem o
     * reinício, a base seria percorrida uma vez e o recall pararia para sempre
     * — um defeito pior que o original, porque começaria funcionando.
     */
    base(250);

    await varrerRecall(ORG, CONFIGURACAO_PADRAO, 200, AGORA);
    expect(conteudo("crc_scan_state")[0]?.["cursor_id"]).toBe("p-00199");

    // A segunda página tem 50 — incompleta, logo é o fim da volta.
    await varrerRecall(ORG, CONFIGURACAO_PADRAO, 200, AGORA);
    const estado = conteudo("crc_scan_state")[0];
    expect(estado?.["cursor_data"]).toBeNull();
    expect(estado?.["ciclo"]).toBe(1);
  });

  it("empate na data não faz a varredura travar nem pular", async () => {
    /*
     * A RAZÃO DE O CURSOR TER DUAS COLUNAS. Base importada traz a data truncada
     * no dia: dezenas de pacientes com o mesmo instante. Um cursor só por data
     * ou reliria todos os empates para sempre, ou pularia todos menos o primeiro.
     */
    const mesmaData = new Date(Date.UTC(2024, 0, 1)).toISOString();
    for (let i = 0; i < 10; i += 1) {
      semear("crc_patients", [{ ...sumido(i), ultima_consulta_em: mesmaData }]);
    }

    const vistos = new Set<string>();
    for (let volta = 0; volta < 4; volta += 1) {
      await varrerRecall(ORG, CONFIGURACAO_PADRAO, 3, AGORA);
      for (const o of conteudo("crc_opportunities")) vistos.add(String(o["patient_id"] ?? ""));
    }

    expect(vistos.size).toBe(10);
  });
});

/* -------------------------------------------------------------------------- */
/* Aniversário                                                                */
/* -------------------------------------------------------------------------- */

describe("a varredura de aniversários", () => {
  it("acha o aniversariante que está DEPOIS da linha 2.000", async () => {
    /*
     * O antigo `limit 2000` lia as duas mil primeiras e comparava em memória.
     * Aqui o aniversariante é o paciente 2.500 — dentro de uma base de 8.000
     * ele seria simplesmente invisível, sem erro nenhum.
     */
    for (let i = 0; i < 2500; i += 1) {
      semear("crc_patients", [
        {
          ...sumido(i),
          // Todo mundo faz aniversário em janeiro, menos o 2.500.
          nascimento: i === 2499 ? "1990-09-08" : "1990-01-15",
        },
      ]);
    }

    /*
     * SEM AUTOMAÇÃO CADASTRADA, de propósito. `elegiveis` é contado ANTES de a
     * automação ser consultada — então a asserção mede quem o BANCO encontrou,
     * que é o que estes testes existem para provar. Semear a automação aqui
     * misturaria "achou o aniversariante" com "inscreveu na jornada".
     */
    const r = await varrerAniversarios(ORG, CONFIGURACAO_PADRAO, 500, AGORA);

    expect(r.elegiveis).toBe(1);
    expect(r.avaliados).toBe(1);
  });

  it("o 29 de fevereiro é felicitado no dia 28 em ano comum", async () => {
    /*
     * A regra é de DOMÍNIO e continua em `fazAniversarioHoje` — o SQL só recebe
     * a lista de datas que contam como hoje. Ensinar o banco o que é ano
     * bissexto seria ter a regra em dois lugares, e um deles sem teste.
     */
    semear("crc_patients", [{ ...sumido(1), nascimento: "1996-02-29" }]);
    /*
     * SEM AUTOMAÇÃO CADASTRADA, de propósito. `elegiveis` é contado ANTES de a
     * automação ser consultada — então a asserção mede quem o BANCO encontrou,
     * que é o que estes testes existem para provar. Semear a automação aqui
     * misturaria "achou o aniversariante" com "inscreveu na jornada".
     */
    // 2027 não é bissexto. 28/02, 12h UTC = 09h em São Paulo.
    const vinteOito = new Date("2027-02-28T12:00:00.000Z");
    definirRelogio(vinteOito);
    const comum = await varrerAniversarios(ORG, CONFIGURACAO_PADRAO, 500, vinteOito);
    expect(comum.elegiveis).toBe(1);

    // 2028 é bissexto: no dia 28 ele NÃO é felicitado — o dia dele existe.
    const bissexto = new Date("2028-02-28T12:00:00.000Z");
    definirRelogio(bissexto);
    const noBissexto = await varrerAniversarios(ORG, CONFIGURACAO_PADRAO, 500, bissexto);
    expect(noBissexto.elegiveis).toBe(0);
  });

  it("não devolve quem optou por não receber", async () => {
    semear("crc_patients", [
      { ...sumido(1), nascimento: "1990-09-08", opt_out_em: "2026-01-01T00:00:00.000Z" },
      { ...sumido(2), nascimento: "1990-09-08", arquivado: true },
      { ...sumido(3), nascimento: "1990-09-08", telefone: null },
    ]);

    const r = await varrerAniversarios(ORG, CONFIGURACAO_PADRAO, 500, AGORA);
    expect(r.avaliados).toBe(0);
  });
});
