/**
 * Cobrança com banco — e os defeitos que este arquivo prende.
 *
 * ============================================================================
 *  POR QUE ESTE ARQUIVO É O MAIS IMPORTANTE DOS TESTES DE APLICAÇÃO.
 *
 *  Cobrança é o único módulo do CRC onde um defeito produz dano JURÍDICO, e não
 *  só desconforto: o art. 42 do CDC trata insistência como constrangimento. As
 *  travas que impedem isso são todas de código — teto de tentativas, cooldown,
 *  parada imediata quando o paciente responde — e nenhuma delas tinha um teste.
 *
 *  As oito famílias de defeito que este arquivo trava:
 *
 *   1. REIMPORTAÇÃO ZERAR O CONTADOR. `tentativas_contato` é o teto do art. 42.
 *      Uma importação que mande o objeto inteiro no upsert zera o contador toda
 *      manhã, e o teto vira decoração — sem nenhum erro, sem nenhum log.
 *
 *   2. REIMPORTAÇÃO CRIAR PARCELA NOVA. O fingerprint não pode incluir status
 *      nem valor pago, que são justamente os campos que mudam quando alguém
 *      paga. Incluí-los faz a mesma planilha duplicar a dívida a cada quitação.
 *
 *   3. DÍVIDA SUMIR NO TETO. Quando a automação não pode falar, tem que sobrar
 *      TAREFA. Sem isso, o teto de tentativas vira o buraco por onde dívidas
 *      antigas desaparecem da clínica.
 *
 *   4. COBRAR A PESSOA ERRADA. Telefone ou nome ambíguo tem que BLOQUEAR, e
 *      não escolher — é o dano que um pedido de desculpas não desfaz.
 *
 *   5. CONTINUAR COBRANDO QUEM JÁ PAGOU. "Já fiz o pix" precisa parar a
 *      automação NA HORA, e não na próxima importação do financeiro.
 *
 *   6. RECEITA CONTADA DUAS VEZES. `registrarPagamento` chamado de novo não
 *      pode somar receita outra vez.
 *
 *   7. PREVIEW QUE ESCREVE. O item 189 exige conferência antes de gravar; um
 *      preview com efeito colateral é pior que nenhum.
 *
 *   8. VAZAMENTO ENTRE CLÍNICAS. Toda leitura e toda escrita presas ao tenant.
 *
 *  INJEÇÃO DE DEFEITO — cada reversão abaixo derruba um teste nomeado:
 *
 *    mandar o objeto inteiro no `gravar` de `importarCobrancas`
 *        → "reimportar preserva as tentativas e a negociação humana" quebra;
 *    incluir `status` no `fingerprintDeCobranca`
 *        → "a mesma planilha reimportada depois de um pagamento não duplica" quebra;
 *    trocar `if (veredicto.exigeHumano)` por `continue` na varredura
 *        → "quando a automação não pode falar, sobra tarefa" quebra;
 *    devolver `encontrados[0]` quando o telefone casa com mais de um paciente
 *        → "telefone ambíguo bloqueia em vez de escolher" quebra;
 *    tirar a marcação de `negociacao_humana` em `reagirARespostaDeCobranca`
 *        → "depois de 'já paguei' a varredura não cobra mais" quebra;
 *    tirar `chave_dedupe` do evento de receita
 *        → "pagamento registrado duas vezes não duplica receita" quebra;
 *    fazer `gerarPreviewCobrancas` gravar
 *        → "não escreve nada — conferir vem antes de gravar" quebra;
 *    tirar `organization_id` do filtro de `registrarContatoDeCobranca`
 *        → "o contato não conta para a cobrança de outra clínica" quebra.
 *
 *  O QUE ESTE ARQUIVO NÃO COBRE: a camada HTTP (`api.ts`) e o envio da
 *  mensagem, que é do motor de automação — de propósito, porque cobrança não
 *  tem caminho de envio próprio.
 * ============================================================================
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

/*
 * `registrar` sai porque log em teste é ruído. `auditar` FICA: o registro de
 * quem importou, quem fez acordo e quem deu baixa é parte do contrato deste
 * módulo, e um teste que o silencia não teria como notar que ele sumiu.
 */
vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return { ...real, registrar: () => undefined };
});

import { MAX_CONTATOS_COBRANCA } from "../dominio/cobranca";
import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import {
  fingerprintDeCobranca,
  gerarPreviewCobrancas,
  importarCobrancas,
  lerCobrancasDeCsv,
  listarCobrancasDoPaciente,
  reagirARespostaDeCobranca,
  registrarAcordo,
  registrarContatoDeCobranca,
  registrarPagamento,
  statusDeTexto,
  varrerCobrancas,
} from "./cobrancas";

const ORG_A = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLINICA_A = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA_B = "bbbb1111-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USUARIO = "cccc0000-cccc-4ccc-8ccc-cccccccccccc";

/* Quarta-feira. Toda data deste arquivo é relativa a ela. */
const AGORA = new Date("2026-09-16T14:00:00.000Z");

let contador = 0;
function id(prefixo: string): string {
  contador += 1;
  return `${prefixo}${String(contador).padStart(4, "0")}-0000-4000-8000-000000000000`;
}

/** `-3` é três dias ATRÁS. Escrever data literal aqui envelhece o teste. */
function dia(offset: number): string {
  return new Date(AGORA.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
}

type Paciente = {
  id?: string;
  organizationId?: string;
  clinicId?: string;
  nome?: string;
  telefone?: string | null;
  externalId?: string;
  optOutEm?: string | null;
};

function semearPaciente(p: Paciente = {}): string {
  const pid = p.id ?? id("9a");
  semear("crc_patients", [
    {
      id: pid,
      organization_id: p.organizationId ?? ORG_A,
      clinic_id: p.clinicId ?? CLINICA_A,
      external_id: p.externalId ?? `DO-${pid.slice(0, 6)}`,
      nome: p.nome ?? "Paciente de Teste",
      telefone: p.telefone === undefined ? "5511988887777" : p.telefone,
      opt_out_em: p.optOutEm ?? null,
    },
  ]);
  return pid;
}

type Cobranca = {
  id?: string;
  organizationId?: string;
  clinicId?: string;
  patientId?: string | null;
  fingerprint?: string;
  valor?: string;
  valorPago?: string;
  vencimentoEm?: string;
  status?: string;
  tentativas?: number;
  ultimoContatoEm?: string | null;
  negociacaoHumana?: boolean;
};

function semearCobranca(c: Cobranca = {}): string {
  const cid = c.id ?? id("c0");
  semear("crc_charges", [
    {
      id: cid,
      organization_id: c.organizationId ?? ORG_A,
      clinic_id: c.clinicId ?? CLINICA_A,
      patient_id: c.patientId === undefined ? null : c.patientId,
      provider: "CSV_IMPORT",
      fingerprint: c.fingerprint ?? `fp-${cid.slice(0, 8)}`,
      valor: c.valor ?? "500.00",
      valor_pago: c.valorPago ?? "0.00",
      vencimento_em: c.vencimentoEm ?? dia(-10),
      status: c.status ?? "ABERTA",
      tentativas_contato: c.tentativas ?? 0,
      ultimo_contato_em: c.ultimoContatoEm ?? null,
      negociacao_humana: c.negociacaoHumana ?? false,
    },
  ]);
  return cid;
}

/** O funil precisa existir para `criarOportunidade` ter etapa inicial. */
function semearFunil(organizationId = ORG_A): void {
  semear("crc_opportunity_stages", [
    {
      id: id("e0"),
      organization_id: organizationId,
      chave: "contato_pendente",
      nome: "Contato pendente",
      ordem: 1,
      categoria: "ABERTA",
    },
  ]);
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  contador = 0;
});

/* -------------------------------------------------------------------------- */
/* Leitura do CSV                                                             */
/* -------------------------------------------------------------------------- */

describe("leitura da planilha do financeiro", () => {
  it("entende o CSV como o financeiro brasileiro exporta", () => {
    const csv = [
      "Paciente;Telefone;Vencimento;Valor;Valor Pago;Parcela;Situação;Descrição",
      "Maria Souza;(11) 98888-7777;05/09/2026;R$ 1.234,56;R$ 234,56;2/6;Em aberto;Prótese",
    ].join("\n");

    const { itens, falhas } = lerCobrancasDeCsv(csv);

    expect(falhas).toEqual([]);
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({
      pacienteNome: "Maria Souza",
      pacienteTelefone: "5511988887777",
      vencimentoEm: "2026-09-05",
      valor: "1234.56",
      valorPago: "234.56",
      parcela: 2,
      status: "ABERTA",
      descricao: "Prótese",
    });
  });

  it('a parcela escrita como "2/6" dá o número 2 — e o total se perde', () => {
    /*
     * ACHADO, e está aqui preso de propósito em vez de corrigido em silêncio.
     *
     * `inteiroOuNulo` corta no "/" justamente porque o financeiro escreve "2/6"
     * numa coluna só. Ele aproveita o 2 e descarta o 6 — e o 6 só entraria se a
     * planilha trouxesse uma coluna "Total Parcelas" separada, que a maioria não
     * traz. O efeito é a recepção ver "parcela 2" onde o paciente ouviu
     * "parcela 2 de 6", que é o número pelo qual ele reconhece a dívida.
     *
     * Não é perda de dinheiro nem risco jurídico, então fica registrado como
     * comportamento atual. Se for corrigido, é este teste que muda.
     */
    const csv = ["Paciente;Vencimento;Valor;Parcela", "Maria;05/09/2026;100,00;2/6"].join("\n");
    const { itens } = lerCobrancasDeCsv(csv);

    expect(itens[0]?.parcela).toBe(2);
    expect(itens[0]?.totalParcelas).toBeNull();
  });

  it("com a coluna de total separada, a parcela fica completa", () => {
    const csv = [
      "Paciente;Vencimento;Valor;Parcela;Total Parcelas",
      "Maria;05/09/2026;100,00;2;6",
    ].join("\n");
    const { itens } = lerCobrancasDeCsv(csv);

    expect(itens[0]).toMatchObject({ parcela: 2, totalParcelas: 6 });
  });

  it("aponta a linha do Excel, e não o índice do array", () => {
    /*
     * O `+2` existe porque a linha 1 é o cabeçalho e a contagem que a pessoa vê
     * começa em 1. Sem ele, "erro na linha 2" manda alguém conferir a linha
     * errada — e num arquivo de 400 parcelas isso é uma tarde perdida.
     */
    const csv = [
      "Paciente;Vencimento;Valor",
      "Primeira OK;05/09/2026;100,00",
      "Segunda OK;06/09/2026;100,00",
      "Sem data;;100,00",
    ].join("\n");

    const { itens, falhas } = lerCobrancasDeCsv(csv);

    expect(itens).toHaveLength(2);
    expect(falhas).toHaveLength(1);
    expect(falhas[0]?.linha).toBe(4);
    expect(falhas[0]?.erro).toContain("vencimento");
  });

  it("recusa a linha sem vencimento em vez de chutar uma data", () => {
    const csv = ["Paciente;Vencimento;Valor", "Sem data;;300,00"].join("\n");
    const { itens, falhas } = lerCobrancasDeCsv(csv);

    // O vencimento decide a fase, e a fase decide o tom. Chutar aqui manda o
    // texto errado para uma pessoa de verdade.
    expect(itens).toHaveLength(0);
    expect(falhas[0]?.erro).toContain("data de vencimento");
  });

  it("recusa a linha que não identifica o paciente", () => {
    const csv = [";Vencimento;Valor", ";05/09/2026;300,00"].join("\n");
    const { falhas } = lerCobrancasDeCsv(csv);

    expect(falhas).toHaveLength(1);
    expect(falhas[0]?.erro).toContain("não identifica o paciente");
  });

  it("recusa valor não positivo", () => {
    const csv = [
      "Paciente;Vencimento;Valor",
      "Zerada;05/09/2026;0,00",
      "Negativa;05/09/2026;-50,00",
    ].join("\n");

    const { itens, falhas } = lerCobrancasDeCsv(csv);

    expect(itens).toHaveLength(0);
    expect(falhas).toHaveLength(2);
    expect(falhas.every((f) => f.erro.includes("não positivo"))).toBe(true);
  });

  it("o resumo da falha mostra o conteúdo da linha, para a pessoa reconhecer", () => {
    const csv = ["Paciente;Vencimento;Valor", "João Pereira;;300,00"].join("\n");
    const { falhas } = lerCobrancasDeCsv(csv);

    expect(falhas[0]?.conteudo).toContain("João Pereira");
  });
});

describe("statusDeTexto", () => {
  it("normaliza acento, caixa e sinônimos do financeiro", () => {
    expect(statusDeTexto("Quitado")).toBe("PAGA");
    expect(statusDeTexto("EM ABERTO")).toBe("ABERTA");
    expect(statusDeTexto("Atrasada")).toBe("ABERTA");
    expect(statusDeTexto("Renegociada")).toBe("RENEGOCIADA");
    expect(statusDeTexto("Incobrável")).toBe("INCOBRAVEL");
    expect(statusDeTexto("Parcialmente paga")).toBe("PARCIAL");
  });

  it("status estranho vira ABERTA, e não uma categoria que some da conferência", () => {
    /*
     * O padrão não é "desconhecida" de propósito: quem exporta contas a receber
     * está exportando o que está em aberto. Um status novo do financeiro não
     * pode fazer a parcela evaporar — ela evapora justamente da conferência
     * humana, que é onde alguém notaria.
     */
    expect(statusDeTexto("Aguardando boleto")).toBe("ABERTA");
    expect(statusDeTexto(null)).toBe("ABERTA");
  });
});

describe("fingerprintDeCobranca", () => {
  const base = {
    externalId: null,
    pacienteExternoId: "DO-77",
    pacienteNome: "Maria",
    pacienteTelefone: "5511988887777",
    valor: "500.00",
    valorPago: "0.00",
    vencimentoEm: "2026-09-05",
    parcela: 1,
    totalParcelas: 3,
    status: "ABERTA" as const,
    descricao: null,
  };

  it("usa o ID externo quando ele existe", () => {
    expect(fingerprintDeCobranca({ ...base, externalId: "LANC-991" })).toBe("id:LANC-991");
  });

  it("não muda quando o pagamento muda — é o que impede duplicar a dívida", () => {
    /*
     * ESTE É O TESTE QUE PROTEGE A REIMPORTAÇÃO. Status e valor pago são
     * exatamente os campos que mudam quando alguém paga. Se entrarem na
     * identidade, a mesma planilha exportada de novo cria uma parcela nova
     * toda vez que uma for quitada — e a dívida da clínica cresce sozinha.
     */
    const antes = fingerprintDeCobranca(base);
    const depois = fingerprintDeCobranca({ ...base, valorPago: "500.00", status: "PAGA" });

    expect(depois).toBe(antes);
  });

  it("muda quando o vencimento ou o valor mudam — são parcelas diferentes", () => {
    expect(fingerprintDeCobranca({ ...base, vencimentoEm: "2026-10-05" })).not.toBe(
      fingerprintDeCobranca(base),
    );
    expect(fingerprintDeCobranca({ ...base, valor: "600.00" })).not.toBe(
      fingerprintDeCobranca(base),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Preview                                                                    */
/* -------------------------------------------------------------------------- */

describe("gerarPreviewCobrancas", () => {
  it("não escreve nada — conferir vem antes de gravar", async () => {
    semearPaciente({ externalId: "DO-1" });
    const csv = ["Codigo Paciente;Vencimento;Valor", "DO-1;05/09/2026;400,00"].join("\n");

    const preview = await gerarPreviewCobrancas(ORG_A, csv, AGORA);

    expect(preview.validos).toHaveLength(1);
    // O item 189 existe porque importação cega de planilha é como se cria dívida
    // fantasma em produção. Um preview com efeito colateral não é preview.
    expect(conteudo("crc_charges")).toHaveLength(0);
  });

  it("separa o que entra do que atualiza", async () => {
    semearPaciente({ externalId: "DO-1" });
    semearCobranca({ fingerprint: "fp:do-1|2026-09-05|400.00" });

    const csv = [
      "Codigo Paciente;Vencimento;Valor",
      "DO-1;05/09/2026;400,00",
      "DO-1;05/10/2026;400,00",
    ].join("\n");

    const { resumo } = await gerarPreviewCobrancas(ORG_A, csv, AGORA);

    expect(resumo.total).toBe(2);
    expect(resumo.atualizados).toBe(1);
    expect(resumo.novos).toBe(1);
  });

  it("a parcela de outra clínica não conta como atualização", async () => {
    semearPaciente({ externalId: "DO-1" });
    semearCobranca({
      organizationId: ORG_B,
      clinicId: CLINICA_B,
      fingerprint: "fp:do-1|2026-09-05|400.00",
    });

    const csv = ["Codigo Paciente;Vencimento;Valor", "DO-1;05/09/2026;400,00"].join("\n");
    const { resumo } = await gerarPreviewCobrancas(ORG_A, csv, AGORA);

    expect(resumo.novos).toBe(1);
    expect(resumo.atualizados).toBe(0);
  });

  it("telefone ambíguo bloqueia em vez de escolher", async () => {
    /*
     * Dois pacientes no mesmo telefone é o caso normal numa família. Escolher
     * um deles liga a dívida à pessoa errada — e cobrar a pessoa errada é o
     * dano que um pedido de desculpas não desfaz.
     */
    semearPaciente({ nome: "Mãe", telefone: "5511988887777", externalId: "DO-1" });
    semearPaciente({ nome: "Filho", telefone: "5511988887777", externalId: "DO-2" });

    const csv = ["Paciente;Telefone;Vencimento;Valor", "Alguem;11988887777;05/09/2026;400,00"].join(
      "\n",
    );

    const { validos, resumo } = await gerarPreviewCobrancas(ORG_A, csv, AGORA);

    expect(validos[0]?.patientId).toBeNull();
    expect(validos[0]?.avisoPaciente).toContain("mais de um paciente");
    expect(resumo.semPaciente).toBe(1);
  });

  it("nome ambíguo também bloqueia", async () => {
    semearPaciente({ nome: "Maria Silva", telefone: null, externalId: "DO-1" });
    semearPaciente({ nome: "Maria Silva", telefone: null, externalId: "DO-2" });

    const csv = ["Paciente;Vencimento;Valor", "Maria Silva;05/09/2026;400,00"].join("\n");
    const { validos } = await gerarPreviewCobrancas(ORG_A, csv, AGORA);

    expect(validos[0]?.patientId).toBeNull();
    expect(validos[0]?.avisoPaciente).toContain("Mais de um paciente");
  });

  it("o código do paciente resolve mesmo com nome diferente na planilha", async () => {
    const pid = semearPaciente({ nome: "Maria Souza", externalId: "DO-77" });

    const csv = [
      "Codigo Paciente;Paciente;Vencimento;Valor",
      "DO-77;MARIA S. (cadastro antigo);05/09/2026;400,00",
    ].join("\n");

    const { validos } = await gerarPreviewCobrancas(ORG_A, csv, AGORA);

    expect(validos[0]?.patientId).toBe(pid);
    expect(validos[0]?.avisoPaciente).toBeNull();
  });

  it("o saldo total soma o que falta, e não o valor de face", async () => {
    semearPaciente({ externalId: "DO-1" });

    const csv = [
      "Codigo Paciente;Vencimento;Valor;Valor Pago",
      "DO-1;05/09/2026;400,00;100,00",
      "DO-1;05/10/2026;600,00;0,00",
    ].join("\n");

    const { resumo, validos } = await gerarPreviewCobrancas(ORG_A, csv, AGORA);

    expect(validos[0]?.saldo).toBe("300.00");
    expect(resumo.saldoTotal).toBe("900.00");
  });

  it("marca quantas já passaram de sessenta dias", async () => {
    semearPaciente({ externalId: "DO-1" });

    const csv = [
      "Codigo Paciente;Vencimento;Valor",
      `DO-1;${dia(-90)};400,00`,
      `DO-1;${dia(-3)};400,00`,
    ].join("\n");

    const { resumo, validos } = await gerarPreviewCobrancas(ORG_A, csv, AGORA);

    expect(resumo.antigas).toBe(1);
    expect(validos.map((v) => v.fase)).toEqual(["ANTIGA", "RECENTE"]);
  });

  it("as linhas quebradas chegam no preview em vez de sumirem", async () => {
    semearPaciente({ externalId: "DO-1" });

    const csv = ["Codigo Paciente;Vencimento;Valor", "DO-1;05/09/2026;400,00", "DO-1;;400,00"].join(
      "\n",
    );

    const { resumo, falhas } = await gerarPreviewCobrancas(ORG_A, csv, AGORA);

    expect(falhas).toHaveLength(1);
    expect(resumo.comErro).toBe(1);
    expect(resumo.total).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Importação                                                                 */
/* -------------------------------------------------------------------------- */

describe("importarCobrancas", () => {
  it("cria as parcelas e liga ao paciente", async () => {
    const pid = semearPaciente({ externalId: "DO-1" });
    const csv = ["Codigo Paciente;Vencimento;Valor", "DO-1;05/09/2026;400,00"].join("\n");

    const r = await importarCobrancas(ORG_A, CLINICA_A, csv, USUARIO);

    expect(r).toMatchObject({ criados: 1, atualizados: 0, falhados: 0, semPaciente: 0 });

    const gravadas = conteudo("crc_charges");
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]).toMatchObject({
      organization_id: ORG_A,
      clinic_id: CLINICA_A,
      patient_id: pid,
      valor: "400.00",
      vencimento_em: "2026-09-05",
      status: "ABERTA",
      provider: "CSV_IMPORT",
    });
  });

  it("reimportar atualiza em vez de duplicar", async () => {
    semearPaciente({ externalId: "DO-1" });
    const csv = ["Codigo Paciente;Vencimento;Valor", "DO-1;05/09/2026;400,00"].join("\n");

    await importarCobrancas(ORG_A, CLINICA_A, csv, USUARIO);
    const segunda = await importarCobrancas(ORG_A, CLINICA_A, csv, USUARIO);

    expect(segunda.criados).toBe(0);
    expect(segunda.atualizados).toBe(1);
    expect(conteudo("crc_charges")).toHaveLength(1);
  });

  it("reimportar preserva as tentativas e a negociação humana", async () => {
    /*
     * ESTE É O TESTE MAIS IMPORTANTE DO ARQUIVO.
     *
     * O upsert lista os campos que sobrescreve um a um. Mandar o objeto inteiro
     * — que é o que qualquer um escreveria — zera `tentativas_contato` a cada
     * importação. O teto do art. 42 passaria a ser reiniciado toda manhã, sem
     * erro nenhum, e a clínica cobraria a mesma pessoa indefinidamente achando
     * que estava dentro do limite.
     *
     * E `negociacao_humana` é pior ainda: zerá-la devolve para a automação uma
     * dívida que um atendente já estava negociando.
     */
    semearPaciente({ externalId: "DO-1" });
    const csv = ["Codigo Paciente;Vencimento;Valor", "DO-1;05/09/2026;400,00"].join("\n");

    await importarCobrancas(ORG_A, CLINICA_A, csv, USUARIO);

    const cobranca = conteudo("crc_charges")[0];
    expect(cobranca).toBeDefined();
    Object.assign(cobranca ?? {}, { tentativas_contato: 2, negociacao_humana: true });

    await importarCobrancas(ORG_A, CLINICA_A, csv, USUARIO);

    const depois = conteudo("crc_charges")[0];
    expect(depois?.["tentativas_contato"]).toBe(2);
    expect(depois?.["negociacao_humana"]).toBe(true);
  });

  it("a mesma planilha reimportada depois de um pagamento não duplica", async () => {
    semearPaciente({ externalId: "DO-1" });

    const antes = [
      "Codigo Paciente;Vencimento;Valor;Valor Pago;Situacao",
      "DO-1;05/09/2026;400,00;0,00;Em aberto",
    ].join("\n");
    const depois = [
      "Codigo Paciente;Vencimento;Valor;Valor Pago;Situacao",
      "DO-1;05/09/2026;400,00;400,00;Quitado",
    ].join("\n");

    await importarCobrancas(ORG_A, CLINICA_A, antes, USUARIO);
    await importarCobrancas(ORG_A, CLINICA_A, depois, USUARIO);

    const linhas = conteudo("crc_charges");
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.["status"]).toBe("PAGA");
    expect(linhas[0]?.["valor_pago"]).toBe("400.00");
  });

  it("carimba a data do pagamento quando a planilha diz que foi paga", async () => {
    semearPaciente({ externalId: "DO-1" });
    const csv = [
      "Codigo Paciente;Vencimento;Valor;Situacao",
      "DO-1;05/09/2026;400,00;Quitado",
    ].join("\n");

    await importarCobrancas(ORG_A, CLINICA_A, csv, USUARIO);

    expect(conteudo("crc_charges")[0]?.["pago_em"]).toEqual(expect.any(String));
  });

  it("importa a parcela sem paciente e conta quantas ficaram órfãs", async () => {
    /*
     * A parcela entra mesmo sem paciente resolvido — a dívida existe. O que ela
     * não faz é virar automação: a varredura exige `patient_id`.
     */
    const csv = ["Paciente;Vencimento;Valor", "Fulano Desconhecido;05/09/2026;400,00"].join("\n");

    const r = await importarCobrancas(ORG_A, CLINICA_A, csv, USUARIO);

    expect(r.criados).toBe(1);
    expect(r.semPaciente).toBe(1);
    expect(conteudo("crc_charges")[0]?.["patient_id"]).toBeNull();
  });

  it("uma linha quebrada não derruba o arquivo inteiro", async () => {
    semearPaciente({ externalId: "DO-1" });
    const csv = [
      "Codigo Paciente;Vencimento;Valor",
      "DO-1;05/09/2026;400,00",
      "DO-1;;400,00",
      "DO-1;05/11/2026;400,00",
    ].join("\n");

    const r = await importarCobrancas(ORG_A, CLINICA_A, csv, USUARIO);

    expect(r.criados).toBe(2);
    expect(r.falhas).toHaveLength(1);
    expect(conteudo("crc_charges")).toHaveLength(2);
  });

  it("registra quem importou", async () => {
    semearPaciente({ externalId: "DO-1" });
    const csv = ["Codigo Paciente;Vencimento;Valor", "DO-1;05/09/2026;400,00"].join("\n");

    await importarCobrancas(ORG_A, CLINICA_A, csv, USUARIO);

    const auditoria = conteudo("crc_audit_logs").filter(
      (l) => l["acao"] === "cobrancas.importadas",
    );
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]).toMatchObject({
      organization_id: ORG_A,
      user_id: USUARIO,
      ator: "humano",
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Varredura                                                                  */
/* -------------------------------------------------------------------------- */

describe("varrerCobrancas", () => {
  it("transforma parcela vencida em oportunidade com o saldo em aberto", async () => {
    semearFunil();
    const pid = semearPaciente();
    const cid = semearCobranca({ patientId: pid, valor: "500.00", valorPago: "100.00" });

    const r = await varrerCobrancas(ORG_A, 200, AGORA);

    expect(r).toMatchObject({ avaliadas: 1, elegiveis: 1, oportunidadesCriadas: 1 });

    const op = conteudo("crc_opportunities")[0];
    expect(op).toMatchObject({
      organization_id: ORG_A,
      patient_id: pid,
      chave_dedupe: `COBRANCA:${cid}`,
      potential_value: "400.00",
    });
  });

  it("duas parcelas do mesmo paciente viram duas oportunidades", async () => {
    /*
     * Por PARCELA, e não por paciente: quem tem duas vencidas tem duas
     * conversas, e resolver uma não resolve a outra. Deduplicar por paciente
     * esconderia metade da dívida.
     */
    semearFunil();
    const pid = semearPaciente();
    semearCobranca({ patientId: pid, vencimentoEm: dia(-10) });
    semearCobranca({ patientId: pid, vencimentoEm: dia(-40) });

    const r = await varrerCobrancas(ORG_A, 200, AGORA);

    expect(r.oportunidadesCriadas).toBe(2);
  });

  it("rodar duas vezes não cria oportunidade repetida", async () => {
    semearFunil();
    const pid = semearPaciente();
    semearCobranca({ patientId: pid });

    await varrerCobrancas(ORG_A, 200, AGORA);
    const segunda = await varrerCobrancas(ORG_A, 200, AGORA);

    expect(segunda.oportunidadesCriadas).toBe(0);
    expect(conteudo("crc_opportunities")).toHaveLength(1);
  });

  it("quando a automação não pode falar, sobra tarefa", async () => {
    /*
     * O CAMINHO QUE IMPEDE A DÍVIDA DE SUMIR. Opt-out tira o direito de mandar
     * mensagem; não tira o direito da clínica de receber. Sem a tarefa, o teto
     * do art. 42 vira o buraco por onde a dívida desaparece.
     */
    semearFunil();
    const pid = semearPaciente({ optOutEm: AGORA.toISOString() });
    semearCobranca({ patientId: pid });

    const r = await varrerCobrancas(ORG_A, 200, AGORA);

    expect(r.elegiveis).toBe(0);
    expect(r.oportunidadesCriadas).toBe(0);
    expect(r.tarefasCriadas).toBe(1);

    const tarefa = conteudo("crc_tasks")[0];
    expect(tarefa).toMatchObject({ tipo: "LIGAR", patient_id: pid });
    expect(String(tarefa?.["motivo"] ?? "")).toContain("outro canal");
  });

  it("atraso longo demais também vira tarefa, e não mensagem", async () => {
    semearFunil();
    const pid = semearPaciente();
    semearCobranca({ patientId: pid, vencimentoEm: dia(-120) });

    const r = await varrerCobrancas(ORG_A, 200, AGORA);

    expect(r.oportunidadesCriadas).toBe(0);
    expect(r.tarefasCriadas).toBe(1);
  });

  it("atingido o teto de contatos, vira tarefa", async () => {
    semearFunil();
    const pid = semearPaciente();
    semearCobranca({ patientId: pid, tentativas: MAX_CONTATOS_COBRANCA });

    const r = await varrerCobrancas(ORG_A, 200, AGORA);

    expect(r.oportunidadesCriadas).toBe(0);
    expect(r.tarefasCriadas).toBe(1);
    expect(String(conteudo("crc_tasks")[0]?.["motivo"] ?? "")).toContain("contatos automáticos");
  });

  it("paciente sem telefone vira tarefa", async () => {
    semearFunil();
    const pid = semearPaciente({ telefone: null });
    semearCobranca({ patientId: pid });

    const r = await varrerCobrancas(ORG_A, 200, AGORA);

    expect(r.tarefasCriadas).toBe(1);
    expect(r.oportunidadesCriadas).toBe(0);
  });

  it("dentro do cooldown não faz nada — nem mensagem, nem tarefa", async () => {
    /*
     * Falamos há pouco: esperar é o comportamento certo, e criar tarefa aqui
     * encheria a fila da recepção de trabalho que vai se resolver sozinho.
     */
    semearFunil();
    const pid = semearPaciente();
    semearCobranca({
      patientId: pid,
      tentativas: 1,
      ultimoContatoEm: new Date(AGORA.getTime() - 2 * 3_600_000).toISOString(),
    });

    const r = await varrerCobrancas(ORG_A, 200, AGORA);

    expect(r).toMatchObject({
      avaliadas: 1,
      elegiveis: 0,
      oportunidadesCriadas: 0,
      tarefasCriadas: 0,
    });
  });

  it("cobrança em negociação humana nem é lida", async () => {
    semearFunil();
    const pid = semearPaciente();
    semearCobranca({ patientId: pid, negociacaoHumana: true });

    const r = await varrerCobrancas(ORG_A, 200, AGORA);

    expect(r.avaliadas).toBe(0);
  });

  it("cobrança sem paciente nem é lida", async () => {
    semearFunil();
    semearCobranca({ patientId: null });

    const r = await varrerCobrancas(ORG_A, 200, AGORA);

    expect(r.avaliadas).toBe(0);
  });

  it("parcela paga ou cancelada nem é lida", async () => {
    semearFunil();
    const pid = semearPaciente();
    semearCobranca({ patientId: pid, status: "PAGA" });
    semearCobranca({ patientId: pid, status: "CANCELADA" });
    semearCobranca({ patientId: pid, status: "RENEGOCIADA" });

    const r = await varrerCobrancas(ORG_A, 200, AGORA);

    expect(r.avaliadas).toBe(0);
  });

  it("avisa antes do vencimento, mas só na janela curta", async () => {
    semearFunil();
    const pid = semearPaciente();
    semearCobranca({ patientId: pid, vencimentoEm: dia(2) });
    semearCobranca({ patientId: pid, vencimentoEm: dia(20) });

    const r = await varrerCobrancas(ORG_A, 200, AGORA);

    // Avisar com vinte dias de antecedência não ajuda ninguém a se organizar.
    expect(r.avaliadas).toBe(1);
    expect(r.oportunidadesCriadas).toBe(1);
    expect(String(conteudo("crc_opportunities")[0]?.["motivo"] ?? "")).toContain("a vencer");
  });

  it("a cobrança de outra clínica não entra na varredura desta", async () => {
    semearFunil(ORG_A);
    semearFunil(ORG_B);
    const pa = semearPaciente();
    const pb = semearPaciente({ organizationId: ORG_B, clinicId: CLINICA_B });
    semearCobranca({ patientId: pa });
    semearCobranca({ patientId: pb, organizationId: ORG_B, clinicId: CLINICA_B });

    const r = await varrerCobrancas(ORG_A, 200, AGORA);

    expect(r.avaliadas).toBe(1);
    expect(conteudo("crc_opportunities").every((o) => o["organization_id"] === ORG_A)).toBe(true);
  });

  it("respeita o limite de linhas por rodada", async () => {
    semearFunil();
    const pid = semearPaciente();
    semearCobranca({ patientId: pid, vencimentoEm: dia(-5) });
    semearCobranca({ patientId: pid, vencimentoEm: dia(-6) });
    semearCobranca({ patientId: pid, vencimentoEm: dia(-7) });

    const r = await varrerCobrancas(ORG_A, 2, AGORA);

    expect(r.avaliadas).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Resposta do paciente                                                       */
/* -------------------------------------------------------------------------- */

describe("reagirARespostaDeCobranca", () => {
  it("'já fiz o pix' para a automação e abre conferência urgente", async () => {
    const pid = semearPaciente();
    semearCobranca({ patientId: pid });
    semearCobranca({ patientId: pid, vencimentoEm: dia(-30) });

    const r = await reagirARespostaDeCobranca(
      ORG_A,
      pid,
      "oi, ja paguei essa parcela semana passada",
    );

    expect(r).toEqual({ tipo: "ja_pagou", cobrancas: 2 });
    expect(conteudo("crc_charges").every((c) => c["negociacao_humana"] === true)).toBe(true);

    const tarefa = conteudo("crc_tasks")[0];
    expect(tarefa).toMatchObject({ tipo: "REVISAR", prioridade: 10 });
    // Quatro horas: se for verdade, cada hora a mais é uma chance de o paciente
    // receber outra cobrança indevida.
    const prazoHoras = (Date.parse(String(tarefa?.["due_at"] ?? "")) - Date.now()) / 3_600_000;
    expect(prazoHoras).toBeGreaterThan(3);
    expect(prazoHoras).toBeLessThanOrEqual(4);
  });

  it("'consigo parcelar?' tira da automação e chama um humano", async () => {
    const pid = semearPaciente();
    semearCobranca({ patientId: pid });

    const r = await reagirARespostaDeCobranca(ORG_A, pid, "consigo parcelar esse valor?");

    expect(r).toEqual({ tipo: "quer_negociar", cobrancas: 1 });
    expect(conteudo("crc_tasks")[0]).toMatchObject({ tipo: "NEGOCIAR", prioridade: 6 });
  });

  it("depois de 'já paguei' a varredura não cobra mais", async () => {
    /*
     * A PARADA PRECISA SER REAL, e não um rótulo na tela. Este teste liga os
     * dois módulos: a resposta marca, e a varredura — que é quem manda — deixa
     * de enxergar a parcela.
     */
    semearFunil();
    const pid = semearPaciente();
    semearCobranca({ patientId: pid });

    await reagirARespostaDeCobranca(ORG_A, pid, "ja paguei, mandei o pix ontem");
    const r = await varrerCobrancas(ORG_A, 200, AGORA);

    expect(r.avaliadas).toBe(0);
    expect(r.oportunidadesCriadas).toBe(0);
  });

  it("texto sem relação não mexe em nada", async () => {
    const pid = semearPaciente();
    semearCobranca({ patientId: pid });

    const r = await reagirARespostaDeCobranca(ORG_A, pid, "bom dia, que horas vocês abrem?");

    expect(r).toEqual({ tipo: "nenhuma" });
    expect(conteudo("crc_charges")[0]?.["negociacao_humana"]).toBe(false);
    expect(conteudo("crc_tasks")).toHaveLength(0);
  });

  it("sem dívida em aberto não cria tarefa sobre coisa nenhuma", async () => {
    const pid = semearPaciente();
    semearCobranca({ patientId: pid, status: "PAGA" });

    const r = await reagirARespostaDeCobranca(ORG_A, pid, "ja paguei isso");

    expect(r).toEqual({ tipo: "nenhuma" });
    expect(conteudo("crc_tasks")).toHaveLength(0);
  });

  it("não encosta na cobrança de outro paciente nem de outra clínica", async () => {
    const pid = semearPaciente();
    const outro = semearPaciente();
    const daOutraClinica = semearPaciente({ organizationId: ORG_B, clinicId: CLINICA_B });

    semearCobranca({ patientId: pid });
    const doOutro = semearCobranca({ patientId: outro });
    const deOutraClinica = semearCobranca({
      patientId: daOutraClinica,
      organizationId: ORG_B,
      clinicId: CLINICA_B,
    });

    await reagirARespostaDeCobranca(ORG_A, pid, "ja paguei");

    const porId = (alvo: string): boolean =>
      conteudo("crc_charges").find((c) => c["id"] === alvo)?.["negociacao_humana"] === true;

    expect(porId(doOutro)).toBe(false);
    expect(porId(deOutraClinica)).toBe(false);
  });

  it("duas respostas no mesmo dia não criam duas tarefas iguais", async () => {
    const pid = semearPaciente();
    semearCobranca({ patientId: pid });

    await reagirARespostaDeCobranca(ORG_A, pid, "ja paguei");
    await reagirARespostaDeCobranca(ORG_A, pid, "ja paguei mesmo, ta pago");

    expect(conteudo("crc_tasks")).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Contador de contatos                                                       */
/* -------------------------------------------------------------------------- */

describe("registrarContatoDeCobranca", () => {
  it("conta e carimba a hora", async () => {
    const pid = semearPaciente();
    const cid = semearCobranca({ patientId: pid });

    await registrarContatoDeCobranca(ORG_A, cid);

    const linha = conteudo("crc_charges")[0];
    expect(linha?.["tentativas_contato"]).toBe(1);
    expect(linha?.["ultimo_contato_em"]).toEqual(expect.any(String));
  });

  it("soma sobre o que já existia", async () => {
    const pid = semearPaciente();
    const cid = semearCobranca({ patientId: pid, tentativas: 2 });

    await registrarContatoDeCobranca(ORG_A, cid);

    expect(conteudo("crc_charges")[0]?.["tentativas_contato"]).toBe(3);
  });

  it("o contato não conta para a cobrança de outra clínica", async () => {
    const pb = semearPaciente({ organizationId: ORG_B, clinicId: CLINICA_B });
    const cid = semearCobranca({ patientId: pb, organizationId: ORG_B, clinicId: CLINICA_B });

    await registrarContatoDeCobranca(ORG_A, cid);

    expect(conteudo("crc_charges")[0]?.["tentativas_contato"]).toBe(0);
  });

  it("o contador é o que faz o teto do art. 42 existir de verdade", async () => {
    /*
     * Sem este contador, `MAX_CONTATOS_COBRANCA` seria decorativo. Aqui o teste
     * percorre o ciclo inteiro: contata até o teto e confere que a varredura
     * seguinte para de mandar mensagem e passa para uma pessoa.
     */
    semearFunil();
    const pid = semearPaciente();
    const cid = semearCobranca({ patientId: pid });

    for (let i = 0; i < MAX_CONTATOS_COBRANCA; i += 1) {
      await registrarContatoDeCobranca(ORG_A, cid);
    }
    // O último contato acabou de acontecer; o cooldown esconderia o teto.
    Object.assign(conteudo("crc_charges")[0] ?? {}, { ultimo_contato_em: null });

    const r = await varrerCobrancas(ORG_A, 200, AGORA);

    expect(r.oportunidadesCriadas).toBe(0);
    expect(r.tarefasCriadas).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Acordo                                                                     */
/* -------------------------------------------------------------------------- */

describe("registrarAcordo", () => {
  const base = {
    valorAcordado: "800.00",
    parcelas: 4,
    primeiraEm: dia(7),
    observacao: null,
  };

  it("recusa acordo sem parcela selecionada", async () => {
    const pid = semearPaciente();

    const r = await registrarAcordo(ORG_A, { ...base, patientId: pid, chargeIds: [] }, USUARIO);

    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("Selecione") });
    expect(conteudo("crc_payment_agreements")).toHaveLength(0);
  });

  it("o valor original é a soma dos SALDOS, e não dos valores de face", async () => {
    /*
     * Quem já pagou metade de uma parcela não deve essa metade de novo. Somar
     * `valor` em vez de saldo infla a dívida no papel do acordo — e é o papel
     * que a pessoa assina.
     */
    const pid = semearPaciente();
    const c1 = semearCobranca({ patientId: pid, valor: "500.00", valorPago: "200.00" });
    const c2 = semearCobranca({ patientId: pid, valor: "600.00", valorPago: "0.00" });

    const r = await registrarAcordo(
      ORG_A,
      { ...base, patientId: pid, chargeIds: [c1, c2] },
      USUARIO,
    );

    expect(r.ok).toBe(true);
    expect(conteudo("crc_payment_agreements")[0]).toMatchObject({
      valor_original: "900.00",
      valor_acordado: "800.00",
      parcelas: 4,
      status: "ATIVO",
      criado_por: USUARIO,
    });
  });

  it("as parcelas originais saem da automação sem serem apagadas", async () => {
    /*
     * RENEGOCIADA em vez de delete: o histórico precisa continuar respondendo
     * "o que aconteceu com essa dívida" — que é exatamente o que alguém vai
     * consultar quando o acordo também não for cumprido.
     */
    semearFunil();
    const pid = semearPaciente();
    const cid = semearCobranca({ patientId: pid });

    await registrarAcordo(ORG_A, { ...base, patientId: pid, chargeIds: [cid] }, USUARIO);

    const linha = conteudo("crc_charges")[0];
    expect(linha).toMatchObject({ status: "RENEGOCIADA", negociacao_humana: true });

    const varredura = await varrerCobrancas(ORG_A, 200, AGORA);
    expect(varredura.avaliadas).toBe(0);
  });

  it("a parcela de outra clínica não entra na conta do acordo", async () => {
    const pid = semearPaciente();
    const daCasa = semearCobranca({ patientId: pid, valor: "300.00" });
    const deFora = semearCobranca({
      organizationId: ORG_B,
      clinicId: CLINICA_B,
      valor: "9000.00",
    });

    await registrarAcordo(ORG_A, { ...base, patientId: pid, chargeIds: [daCasa, deFora] }, USUARIO);

    expect(conteudo("crc_payment_agreements")[0]?.["valor_original"]).toBe("300.00");
  });

  it("registra quem fez o acordo", async () => {
    const pid = semearPaciente();
    const cid = semearCobranca({ patientId: pid });

    await registrarAcordo(ORG_A, { ...base, patientId: pid, chargeIds: [cid] }, USUARIO);

    const log = conteudo("crc_audit_logs").find((l) => l["acao"] === "cobranca.acordo_registrado");
    expect(log).toMatchObject({ organization_id: ORG_A, user_id: USUARIO, ator: "humano" });
  });
});

/* -------------------------------------------------------------------------- */
/* Pagamento                                                                  */
/* -------------------------------------------------------------------------- */

describe("registrarPagamento", () => {
  it("dá baixa e registra a receita como CONFIRMADA", async () => {
    const pid = semearPaciente();
    const cid = semearCobranca({ patientId: pid, valor: "400.00" });

    await registrarPagamento(ORG_A, cid, "400.00", USUARIO);

    expect(conteudo("crc_charges")[0]).toMatchObject({
      status: "PAGA",
      valor_pago: "400.00",
      pago_em: expect.any(String),
    });

    const receita = conteudo("crc_revenue_events");
    expect(receita).toHaveLength(1);
    expect(receita[0]).toMatchObject({
      organization_id: ORG_A,
      patient_id: pid,
      // Item 61: receita só entra quando existe evento financeiro confiável.
      // Um humano registrando o pagamento é esse evento — o sistema nunca infere.
      natureza: "CONFIRMADA",
      valor: "400.00",
      recuperada: true,
      chave_dedupe: `cobranca_paga:${cid}`,
    });
  });

  it("pagamento registrado duas vezes não duplica receita", async () => {
    /*
     * Dois cliques no botão, ou dois atendentes dando baixa da mesma parcela,
     * inflariam o faturamento do mês. A trava é a chave de deduplicação — e ela
     * é constraint de banco, não cuidado de código.
     */
    const pid = semearPaciente();
    const cid = semearCobranca({ patientId: pid, valor: "400.00" });

    await registrarPagamento(ORG_A, cid, "400.00", USUARIO);
    await expect(registrarPagamento(ORG_A, cid, "400.00", USUARIO)).rejects.toThrow();

    expect(conteudo("crc_revenue_events")).toHaveLength(1);
  });

  it("a parcela de outra clínica não é baixada nem gera receita", async () => {
    const pb = semearPaciente({ organizationId: ORG_B, clinicId: CLINICA_B });
    const cid = semearCobranca({ patientId: pb, organizationId: ORG_B, clinicId: CLINICA_B });

    await registrarPagamento(ORG_A, cid, "400.00", USUARIO);

    expect(conteudo("crc_charges")[0]?.["status"]).toBe("ABERTA");
    expect(conteudo("crc_revenue_events")).toHaveLength(0);
  });

  it("registra quem deu a baixa", async () => {
    const pid = semearPaciente();
    const cid = semearCobranca({ patientId: pid });

    await registrarPagamento(ORG_A, cid, "500.00", USUARIO);

    const log = conteudo("crc_audit_logs").find(
      (l) => l["acao"] === "cobranca.pagamento_registrado",
    );
    expect(log).toMatchObject({ entity_id: cid, user_id: USUARIO });
  });

  it("pagar tira a parcela da varredura", async () => {
    semearFunil();
    const pid = semearPaciente();
    const cid = semearCobranca({ patientId: pid });

    await registrarPagamento(ORG_A, cid, "500.00", USUARIO);
    const r = await varrerCobrancas(ORG_A, 200, AGORA);

    expect(r.avaliadas).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Ficha do paciente                                                          */
/* -------------------------------------------------------------------------- */

describe("listarCobrancasDoPaciente", () => {
  it("traz da mais recente para a mais antiga", async () => {
    const pid = semearPaciente();
    semearCobranca({ patientId: pid, vencimentoEm: dia(-30) });
    semearCobranca({ patientId: pid, vencimentoEm: dia(-5) });

    const linhas = await listarCobrancasDoPaciente(ORG_A, pid);

    expect(linhas.map((l) => l["vencimento_em"])).toEqual([dia(-5), dia(-30)]);
  });

  it("não mostra a cobrança de outro paciente nem de outra clínica", async () => {
    const pid = semearPaciente();
    const outro = semearPaciente();
    const daOutra = semearPaciente({ organizationId: ORG_B, clinicId: CLINICA_B });

    semearCobranca({ patientId: pid });
    semearCobranca({ patientId: outro });
    semearCobranca({ patientId: daOutra, organizationId: ORG_B, clinicId: CLINICA_B });

    const linhas = await listarCobrancasDoPaciente(ORG_A, pid);

    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.["patient_id"]).toBe(pid);
  });
});
