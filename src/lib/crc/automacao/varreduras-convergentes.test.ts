/**
 * As varreduras precisam percorrer a base — e num prazo que sirva à operação.
 *
 * ============================================================================
 *  TRÊS DEFEITOS, EM CAMADAS, E CADA UM SÓ FICOU VISÍVEL DEPOIS DO ANTERIOR.
 *
 *  1. NÃO CONVERGIA. `order by ultima_consulta_em asc limit 200`, sem cursor: a
 *     execução seguinte lia as MESMAS 200 linhas. Os pacientes 201 em diante
 *     nunca eram avaliados. Com 8.000, 97,5% da base ficava de fora.
 *
 *  2. CONVERGIA DEVAGAR DEMAIS. Com o cursor, 200 por volta pesada — uma por
 *     dia — atravessa 8.000 pacientes em QUARENTA DIAS. Um paciente que sumiu
 *     há seis meses esperava mais um mês para alguém notar.
 *
 *  3. O ALERTA NÃO MEDIA ISSO. Ele olhava `atualizado_em`, que muda a cada
 *     página — então a varredura do item 2 tinha o campo sempre fresco e o
 *     painel dizia que estava tudo bem. O alarme criado para tornar a correção
 *     visível era tão cego quanto o defeito.
 *
 *  ANIVERSÁRIO. `limit 2000` sem `order by`, comparando mês/dia em memória.
 *  Quais 2.000 é decisão do planejador, e ela muda: com 8.000 pacientes, três em
 *  cada quatro aniversariantes não eram vistos, e quais três mudava a cada dia.
 *
 *  OS QUATRO FUNCIONAM PERFEITAMENTE COM 500 PACIENTES. O tamanho da base era o
 *  defeito.
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

function base(quantos: number): void {
  for (let i = 0; i < quantos; i += 1) semear("crc_patients", [sumido(i)]);
}

/** Quem já foi avaliado — o rastro é a oportunidade criada. */
function visitados(): Set<string> {
  return new Set(conteudo("crc_opportunities").map((o) => String(o["patient_id"] ?? "")));
}

const estado = (): Record<string, unknown> | undefined => conteudo("crc_scan_state")[0];

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  semear("crc_organizations", [{ id: ORG, nome: "JP", slug: "jp" }]);
  semear("crc_clinics", [
    { id: CLINICA, organization_id: ORG, nome: "Matriz", slug: "matriz", ativa: true },
  ]);
});

/* -------------------------------------------------------------------------- */
/* Recall — convergência                                                      */
/* -------------------------------------------------------------------------- */

describe("a varredura de recall converge", () => {
  it("500 pacientes: UMA volta pesada avalia os 500 e fecha o ciclo", async () => {
    /*
     * O CONTRATO MUDOU, e este teste é onde isso fica explícito. Antes, uma
     * chamada = uma página de 200, e a volta pesada precisava de três dias para
     * cobrir 500. Agora a chamada percorre páginas até o teto ou até o tempo —
     * então 500 cabem numa volta só.
     */
    base(500);

    const r = await varrerRecall(ORG, CONFIGURACAO_PADRAO, 200, AGORA);

    expect(r.avaliados).toBe(500);
    expect(visitados().size).toBe(500);
    // Página incompleta = volta fechada.
    expect(estado()?.["ciclo"]).toBe(1);
    expect(estado()?.["cursor_data"]).toBeNull();
  });

  it("8.000 pacientes: o TETO por volta segura, e sete voltas cobrem a base", async () => {
    /*
     * ========================================================================
     *  ESTE É O NÚMERO QUE A OPERAÇÃO PRECISA. Com 200 por volta, 8.000
     *  pacientes levavam quarenta dias — e recall é justamente a rotina que não
     *  pode demorar um mês para notar alguém.
     *
     *  1.200 por volta fecha em sete dias. O teste roda as sete "voltas" para
     *  provar a conta inteira, e não só a primeira.
     * ========================================================================
     */
    base(8000);

    const primeira = await varrerRecall(ORG, CONFIGURACAO_PADRAO, 200, AGORA);
    expect(primeira.avaliados).toBe(1200);
    // O ciclo NÃO fechou: ainda há base pela frente.
    expect(estado()?.["ciclo"]).toBe(0);
    expect(estado()?.["cursor_data"]).not.toBeNull();

    let voltas = 1;
    while ((estado()?.["ciclo"] ?? 0) === 0 && voltas < 12) {
      await varrerRecall(ORG, CONFIGURACAO_PADRAO, 200, AGORA);
      voltas += 1;
    }

    expect(visitados().size).toBe(8000);
    // 8.000 / 1.200 = 6,67 → sete voltas. A asserção é uma FAIXA porque o
    // número exato depende do arredondamento da última página, e prender o
    // valor exato transformaria uma mudança de teto numa quebra de teste.
    expect(voltas).toBeGreaterThanOrEqual(6);
    expect(voltas).toBeLessThanOrEqual(8);
    expect(estado()?.["ciclo"]).toBe(1);

    /*
     * O TEMPO GENEROSO É DO FAKE, e não do sistema. O banco em memória filtra
     * varrendo arrays: 8.000 pacientes × sete voltas é O(n²) aqui e é um índice
     * no Postgres. Prender este teste ao default de 5s mediria o fake.
     */
  }, 120_000);

  it("2.500 pacientes: nenhum prefixo se repete entre as voltas", async () => {
    base(2500);

    const primeira = await varrerRecall(ORG, CONFIGURACAO_PADRAO, 200, AGORA);
    const depoisDaPrimeira = visitados();

    await varrerRecall(ORG, CONFIGURACAO_PADRAO, 200, AGORA);
    const depoisDaSegunda = visitados();

    expect(primeira.avaliados).toBe(1200);
    expect(depoisDaPrimeira.size).toBe(1200);
    /*
     * A SEGUNDA VOLTA TRAZ GENTE NOVA. Com o cursor quebrado, este número
     * ficaria em 1.200 — as mesmas pessoas, avaliadas de novo.
     */
    expect(depoisDaSegunda.size).toBeGreaterThan(depoisDaPrimeira.size);
  });

  it("o teto por TEMPO também corta, e o cursor guarda onde parou", async () => {
    /*
     * Os dois tetos precisam existir. Só por itens, uma base com handlers
     * lentos estoura o tempo da função; só por tempo, uma base rápida dispara
     * milhares de jornadas numa volta.
     */
    base(2000);

    // Orçamento zero: corta depois da primeira página, qualquer que seja o teto.
    const r = await varrerRecall(ORG, CONFIGURACAO_PADRAO, 200, AGORA, {
      tetoPorVolta: 100_000,
      orcamentoMs: 0,
    });

    expect(r.avaliados).toBe(200);
    expect(estado()?.["cursor_id"]).toBe("p-00199");
    expect(estado()?.["ciclo"]).toBe(0);
  });

  it("empate na data não faz a varredura travar nem pular", async () => {
    /*
     * A RAZÃO DE O CURSOR TER DUAS COLUNAS. Base importada traz a data truncada
     * no dia: dezenas de pacientes com o mesmo instante. Um cursor só por data
     * ou releria todos os empates para sempre, ou pularia todos menos o
     * primeiro.
     */
    const mesmaData = new Date(Date.UTC(2024, 0, 1)).toISOString();
    for (let i = 0; i < 10; i += 1) {
      semear("crc_patients", [{ ...sumido(i), ultima_consulta_em: mesmaData }]);
    }

    await varrerRecall(ORG, CONFIGURACAO_PADRAO, 3, AGORA);

    expect(visitados().size).toBe(10);
  });

  it("uma página que FALHA não pula ninguém: o cursor não avança", async () => {
    /*
     * ========================================================================
     *  O CURSOR AVANÇA DEPOIS DO TRABALHO, e antes avançava ANTES.
     *
     *  Com uma página por volta, avançar antes tinha lógica: um lote que
     *  estourasse o tempo seria relido para sempre. Com o laço, o corte
     *  acontece ENTRE páginas — então a página ou termina, e o cursor anda, ou
     *  a volta morre no meio dela, e ela é relida.
     *
     *  Reler é seguro: a chave de dedupe inclui o ciclo. Pular não seria.
     * ========================================================================
     */
    base(400);
    const { falharProximaEscrita } = await import("../testes/banco-memoria");

    // A primeira oportunidade da primeira página estoura.
    falharProximaEscrita("crc_opportunities", "banco indisponível");

    await expect(varrerRecall(ORG, CONFIGURACAO_PADRAO, 200, AGORA)).rejects.toThrow();

    // O CURSOR NÃO ANDOU: ninguém foi pulado.
    expect(conteudo("crc_scan_state")).toHaveLength(0);

    // E a volta seguinte cobre a base inteira, do começo.
    await varrerRecall(ORG, CONFIGURACAO_PADRAO, 200, AGORA);
    expect(visitados().size).toBe(400);
  });

  it("paciente novo no meio do ciclo não se perde — ele entra no ciclo seguinte", async () => {
    /*
     * O keyset ordena por `(ultima_consulta_em, id)`. Um paciente cadastrado
     * depois pode nascer ANTES do cursor e não ser visto nesta volta. Isso é
     * aceitável e precisa ser verdade: a volta seguinte o pega, porque o ciclo
     * recomeça do zero.
     */
    base(400);
    await varrerRecall(ORG, CONFIGURACAO_PADRAO, 200, AGORA, { tetoPorVolta: 200 });
    expect(estado()?.["ciclo"]).toBe(0);

    // Entra alguém muito antigo — atrás do cursor.
    semear("crc_patients", [
      { ...sumido(9999), ultima_consulta_em: new Date(Date.UTC(2020, 0, 1)).toISOString() },
    ]);

    // Fecha o ciclo atual…
    while ((estado()?.["ciclo"] ?? 0) === 0) {
      await varrerRecall(ORG, CONFIGURACAO_PADRAO, 200, AGORA);
    }
    // …e a volta seguinte, já no ciclo novo, encontra o retardatário.
    await varrerRecall(ORG, CONFIGURACAO_PADRAO, 200, AGORA);

    expect(visitados().has("p-09999")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Recall — o ciclo é observável                                              */
/* -------------------------------------------------------------------------- */

describe("o ciclo da varredura", () => {
  it("marca quando COMEÇOU, e a marca sobrevive às páginas seguintes", async () => {
    /*
     * ========================================================================
     *  É A COLUNA QUE FALTAVA PARA O ALERTA SIGNIFICAR ALGUMA COISA.
     *
     *  `atualizado_em` muda a cada página — então ele nunca denuncia uma
     *  varredura que avança devagar. `ciclo_iniciado_em` é gravado na primeira
     *  página da volta e PRESERVADO nas seguintes: é ele que mede há quanto
     *  tempo a volta está aberta.
     * ========================================================================
     */
    base(3000);

    await varrerRecall(ORG, CONFIGURACAO_PADRAO, 200, AGORA, { tetoPorVolta: 200 });
    const primeiro = String(estado()?.["ciclo_iniciado_em"] ?? "");
    expect(primeiro.length).toBeGreaterThan(0);

    definirRelogio(new Date(AGORA.getTime() + 86_400_000));
    await varrerRecall(ORG, CONFIGURACAO_PADRAO, 200, AGORA, { tetoPorVolta: 200 });

    // A MARCA NÃO SE MEXEU: o ciclo é o mesmo, só avançou.
    expect(String(estado()?.["ciclo_iniciado_em"] ?? "")).toBe(primeiro);
  });

  it("ao FECHAR, registra o fim e reinicia a marca para a volta seguinte", async () => {
    base(300);

    await varrerRecall(ORG, CONFIGURACAO_PADRAO, 200, AGORA);

    expect(estado()?.["ciclo"]).toBe(1);
    expect(estado()?.["ultimo_ciclo_completo_em"]).not.toBeNull();
    // O PRÓXIMO CICLO COMEÇA AGORA. Deixar nulo faria a volta seguinte parecer
    // que nunca começou, e o alerta de ciclo lento nunca dispararia.
    expect(estado()?.["ciclo_iniciado_em"]).not.toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Aniversário                                                                */
/* -------------------------------------------------------------------------- */

describe("a varredura de aniversários", () => {
  it("acha o aniversariante que está DEPOIS da linha 2.000", async () => {
    for (let i = 0; i < 2500; i += 1) {
      semear("crc_patients", [
        { ...sumido(i), nascimento: i === 2499 ? "1990-09-08" : "1990-01-15" },
      ]);
    }

    /*
     * SEM AUTOMAÇÃO CADASTRADA, de propósito. `elegiveis` é contado ANTES de a
     * automação ser consultada — então a asserção mede quem o BANCO encontrou,
     * que é o que este teste existe para provar.
     */
    const r = await varrerAniversarios(ORG, CONFIGURACAO_PADRAO, 500, AGORA);

    expect(r.elegiveis).toBe(1);
    expect(r.avaliados).toBe(1);
  });

  it("numa base de 8.000, acha os aniversariantes espalhados", async () => {
    for (let i = 0; i < 8000; i += 1) {
      // Um a cada mil faz aniversário hoje — e o último é o 7.000.
      const hoje = i % 1000 === 0;
      semear("crc_patients", [{ ...sumido(i), nascimento: hoje ? "1990-09-08" : "1990-01-15" }]);
    }

    const r = await varrerAniversarios(ORG, CONFIGURACAO_PADRAO, 500, AGORA);
    expect(r.elegiveis).toBe(8);
  });

  it("o 29 de fevereiro é felicitado no dia 28 em ano comum", async () => {
    semear("crc_patients", [{ ...sumido(1), nascimento: "1996-02-29" }]);

    // 2027 não é bissexto. 28/02, 12h UTC = 09h em São Paulo.
    const vinteOito = new Date("2027-02-28T12:00:00.000Z");
    definirRelogio(vinteOito);
    expect((await varrerAniversarios(ORG, CONFIGURACAO_PADRAO, 500, vinteOito)).elegiveis).toBe(1);

    // 2028 é bissexto: no dia 28 ele NÃO é felicitado — o dia dele existe.
    const bissexto = new Date("2028-02-28T12:00:00.000Z");
    definirRelogio(bissexto);
    expect((await varrerAniversarios(ORG, CONFIGURACAO_PADRAO, 500, bissexto)).elegiveis).toBe(0);
  });

  it("não devolve quem optou por não receber", async () => {
    semear("crc_patients", [
      { ...sumido(1), nascimento: "1990-09-08", opt_out_em: "2026-01-01T00:00:00.000Z" },
      { ...sumido(2), nascimento: "1990-09-08", arquivado: true },
      { ...sumido(3), nascimento: "1990-09-08", telefone: null },
    ]);

    expect((await varrerAniversarios(ORG, CONFIGURACAO_PADRAO, 500, AGORA)).avaliados).toBe(0);
  });
});
