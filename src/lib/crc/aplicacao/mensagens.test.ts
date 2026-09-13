/**
 * A fiação de `mensagens.ts` — o que decide se o paciente recebe, e se para.
 *
 * ============================================================================
 *  POR QUE ESTE ARQUIVO, SE JÁ HAVIA TESTE TOCANDO `mensagens.ts`.
 *
 *  Havia — quatro arquivos exercitam `receberMensagem`, `enviarMensagem` e
 *  `assumirConversa`. Das catorze funções exportadas, ONZE não apareciam em
 *  teste nenhum. E entre as onze estavam justamente as duas que o produto
 *  vende como limite que não se negocia:
 *
 *    `registrarOptOut`            "quem pediu para parar nunca mais recebe"
 *    `avaliarPoliticaDeContato`   horário, teto do dia, intervalo mínimo
 *
 *  A REGRA PURA JÁ ERA TESTADA. `podeContatar` tem cobertura em
 *  `dominio/dominio.test.ts` e sempre passou. O que ninguém olhava era a
 *  CONSULTA que monta o contexto entregue a ela — e é exatamente a lição que
 *  `janela-envio.test.ts` deixou escrita neste repositório: regra pura testada
 *  + consulta não testada = sistema que não funciona com os dois verdes.
 *
 *  Uma regra correta alimentada com fatos errados produz um veredicto errado
 *  com toda a aparência de rigor.
 * ============================================================================
 *
 *  AS SEIS FAMÍLIAS DE DEFEITO QUE ESTE ARQUIVO PRENDE:
 *
 *   1. OPT-OUT QUE ESCORREGA. A data que vale é a do PRIMEIRO pedido. Sem o
 *      filtro `opt_out_em is null`, reprocessar a mesma mensagem empurra a data
 *      para frente e apaga há quanto tempo a pessoa pediu para sair.
 *
 *   2. MENSAGEM QUE SAI DEPOIS DO PEDIDO. As jornadas em voo precisam morrer no
 *      mesmo instante. Esperar a próxima varredura deixa sair o que já estava
 *      agendado — e é a única mensagem que o paciente vai lembrar.
 *
 *   3. A RECEPÇÃO BLOQUEANDO A AUTOMAÇÃO. O teto do dia conta só `automacao` e
 *      `ia`. Contar a atendente faria o trabalho humano derrubar a automação.
 *
 *   4. O TETO DA HORA VIRANDO POR PACIENTE. Ele é da CLÍNICA INTEIRA — é o que
 *      impede uma varredura de 800 inativos virar 800 mensagens em minutos.
 *
 *   5. A JORNADA BLOQUEANDO A SI MESMA. `temJornadaAtivaConcorrente` é
 *      `ativas > 1`, porque quem pergunta também se conta. Com `> 0`, nenhuma
 *      jornada jamais enviaria nada.
 *
 *   6. ESCOLHER O PACIENTE NO TELEFONE DE FAMÍLIA. Dois pacientes no mesmo
 *      número abrem revisão; nunca se escolhe um.
 *
 *  INJEÇÃO DE DEFEITO — cada reversão derruba o teste nomeado:
 *
 *    tirar `{ coluna: "opt_out_em", op: "is", valor: null }`
 *        → "não reescreve a data de um opt-out anterior" quebra;
 *    tirar a atualização de `crc_automation_enrollments`
 *        → "encerra na hora as jornadas em voo" quebra;
 *    trocar `remetente in (automacao, ia)` por qualquer remetente
 *        → "mensagem da recepção não gasta o teto da automação" quebra;
 *    acrescentar `patient_id` ao contador da última hora
 *        → "o teto da hora é da clínica, não do paciente" quebra;
 *    trocar `jornadasAtivas > 1` por `> 0`
 *        → "a própria jornada não conta como concorrente" quebra;
 *    devolver `candidatos[0]` quando há mais de um
 *        → "dois pacientes no mesmo telefone abrem revisão" quebra.
 *
 *  O QUE ESTE ARQUIVO NÃO COBRE: `enviarMensagem` e `receberMensagem`, que já
 *  têm arquivo próprio, e a camada HTTP.
 * ============================================================================
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

/*
 * `registrar` sai porque log em teste é ruído. `auditar` FICA: o registro de
 * que alguém pediu para sair é a prova que a clínica vai precisar apresentar,
 * e um teste que o silencia não notaria se ele sumisse.
 */
vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return { ...real, registrar: () => undefined };
});

import { CONFIGURACAO_PADRAO } from "../dominio/configuracao";
import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import {
  atualizarEntrega,
  avaliarPoliticaDeContato,
  avaliarPoliticaPorTelefone,
  buscarConversaDoPaciente,
  listarConversas,
  listarMensagens,
  marcarConversaLida,
  registrarNotaInterna,
  registrarOptOut,
  resolverConversa,
  vincularConversaAoPaciente,
} from "./mensagens";

const ORG_A = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLINICA_A = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA_B = "bbbb1111-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USUARIO = "cccc0000-cccc-4ccc-8ccc-cccccccccccc";

/* Quarta-feira, 14h — dentro do horário comercial da configuração padrão. */
const AGORA = new Date("2026-09-16T14:00:00.000Z");

/**
 * A configuração dos testes afrouxa o que não está sob exame.
 *
 * O padrão é `contatosPorDia: 1`, e com ele QUALQUER cenário com uma mensagem
 * anterior bate no teto diário — o veredicto sairia `LIMITE_DIARIO` e os testes
 * de cooldown, de teto da hora e de jornada concorrente nunca chegariam a ser
 * exercitados. Cada teste aperta de volta só o limite que ele investiga.
 */
const CFG = { ...CONFIGURACAO_PADRAO, contatosPorDia: 10, cooldownHoras: 0, envioPorHora: 100 };

let contador = 0;
function id(prefixo: string): string {
  contador += 1;
  return `${prefixo}${String(contador).padStart(4, "0")}-0000-4000-8000-000000000000`;
}

/** `-2` é duas horas atrás. Data literal aqui envelhece o teste. */
function horas(offset: number): string {
  return new Date(AGORA.getTime() + offset * 3_600_000).toISOString();
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
      external_id: p.externalId ?? `DO-${String(contador)}`,
      nome: p.nome ?? "Paciente de Teste",
      telefone: p.telefone === undefined ? "5511988887777" : p.telefone,
      opt_out_em: p.optOutEm ?? null,
    },
  ]);
  return pid;
}

type Conversa = {
  id?: string;
  organizationId?: string;
  clinicId?: string;
  patientId?: string | null;
  contatoExterno?: string;
  canal?: string;
  assignedTo?: string | null;
  naoLidas?: number;
  revisaoPendente?: boolean;
  ultimaMensagemEm?: string;
};

function semearConversa(c: Conversa = {}): string {
  const cid = c.id ?? id("c0");
  semear("crc_conversations", [
    {
      id: cid,
      organization_id: c.organizationId ?? ORG_A,
      clinic_id: c.clinicId ?? CLINICA_A,
      patient_id: c.patientId === undefined ? null : c.patientId,
      canal: c.canal ?? "whatsapp",
      contato_externo: c.contatoExterno ?? "5511988887777",
      status: "ABERTA",
      assigned_to: c.assignedTo ?? null,
      nao_lidas: c.naoLidas ?? 0,
      revisao_pendente: c.revisaoPendente ?? false,
      ultima_mensagem_em: c.ultimaMensagemEm ?? horas(-1),
    },
  ]);
  return cid;
}

type Msg = {
  organizationId?: string;
  conversationId?: string;
  patientId?: string | null;
  direcao?: "ENTRADA" | "SAIDA";
  remetente?: "paciente" | "atendente" | "automacao" | "ia";
  criadoEm?: string;
  providerMessageId?: string | null;
};

function semearMensagem(m: Msg = {}): string {
  const mid = id("11");
  semear("crc_messages", [
    {
      id: mid,
      organization_id: m.organizationId ?? ORG_A,
      conversation_id: m.conversationId ?? id("c9"),
      patient_id: m.patientId === undefined ? null : m.patientId,
      direcao: m.direcao ?? "SAIDA",
      remetente: m.remetente ?? "automacao",
      conteudo: "mensagem",
      criado_em: m.criadoEm ?? horas(-2),
      provider_message_id: m.providerMessageId ?? null,
    },
  ]);
  return mid;
}

function semearJornada(patientId: string, status: string, organizationId = ORG_A): string {
  const jid = id("77");
  semear("crc_automation_enrollments", [
    {
      id: jid,
      organization_id: organizationId,
      patient_id: patientId,
      automation_id: id("88"),
      status,
      passo_atual: 0,
    },
  ]);
  return jid;
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  contador = 0;
});

/* -------------------------------------------------------------------------- */
/* Opt-out                                                                    */
/* -------------------------------------------------------------------------- */

describe("registrarOptOut", () => {
  it("marca o paciente com a data e o motivo", async () => {
    const pid = semearPaciente();

    await registrarOptOut(ORG_A, pid, "respondeu SAIR");

    const paciente = conteudo("crc_patients")[0];
    expect(paciente?.["opt_out_em"]).toEqual(expect.any(String));
    expect(paciente?.["opt_out_motivo"]).toBe("respondeu SAIR");
  });

  it("não reescreve a data de um opt-out anterior", async () => {
    /*
     * A DATA QUE VALE É A DO PRIMEIRO PEDIDO. Ela é o que responde "há quanto
     * tempo essa pessoa pediu para sair" — pergunta que aparece quando alguém
     * reclama de ter recebido mensagem depois. Deixar a data escorregar para
     * frente a cada reprocessamento apaga exatamente essa prova.
     */
    const antes = "2026-01-05T10:00:00.000Z";
    const pid = semearPaciente({ optOutEm: antes });

    await registrarOptOut(ORG_A, pid, "pediu de novo");

    expect(conteudo("crc_patients")[0]?.["opt_out_em"]).toBe(antes);
  });

  it("encerra na hora as jornadas em voo", async () => {
    /*
     * Esperar a próxima varredura deixaria sair a mensagem que já estava
     * agendada — depois do pedido. É a única mensagem que o paciente lembra.
     */
    const pid = semearPaciente();
    semearJornada(pid, "ACTIVE");
    semearJornada(pid, "WAITING");

    await registrarOptOut(ORG_A, pid, "SAIR");

    const jornadas = conteudo("crc_automation_enrollments");
    expect(jornadas).toHaveLength(2);
    expect(jornadas.every((j) => j["status"] === "EXITED")).toBe(true);
    expect(jornadas.every((j) => j["saiu_por"] === "opt_out")).toBe(true);
    expect(jornadas.every((j) => j["resume_at"] === null)).toBe(true);
  });

  it("não mexe em jornada que já tinha terminado", async () => {
    const pid = semearPaciente();
    semearJornada(pid, "COMPLETED");

    await registrarOptOut(ORG_A, pid, "SAIR");

    expect(conteudo("crc_automation_enrollments")[0]?.["status"]).toBe("COMPLETED");
  });

  it("não encosta no paciente nem na jornada de outra clínica", async () => {
    const daCasa = semearPaciente();
    const deFora = semearPaciente({ organizationId: ORG_B, clinicId: CLINICA_B });
    semearJornada(deFora, "ACTIVE", ORG_B);

    await registrarOptOut(ORG_A, daCasa, "SAIR");

    const outro = conteudo("crc_patients").find((p) => p["id"] === deFora);
    expect(outro?.["opt_out_em"]).toBeNull();
    expect(conteudo("crc_automation_enrollments")[0]?.["status"]).toBe("ACTIVE");
  });

  it("deixa registrado que a pessoa pediu para sair", async () => {
    const pid = semearPaciente();

    await registrarOptOut(ORG_A, pid, "respondeu PARAR");

    const log = conteudo("crc_audit_logs").find((l) => l["acao"] === "paciente.opt_out");
    expect(log).toMatchObject({ organization_id: ORG_A, entity_id: pid, ator: "automacao" });
  });
});

/* -------------------------------------------------------------------------- */
/* Política de contato                                                        */
/* -------------------------------------------------------------------------- */

describe("avaliarPoliticaDeContato", () => {
  it("libera quando não há nada contra", async () => {
    const pid = semearPaciente();

    const v = await avaliarPoliticaDeContato(ORG_A, pid, CFG, AGORA);

    expect(v.pode).toBe(true);
  });

  it("quem pediu para sair não passa", async () => {
    const pid = semearPaciente({ optOutEm: horas(-48) });

    const v = await avaliarPoliticaDeContato(ORG_A, pid, CFG, AGORA);

    expect(v).toMatchObject({ pode: false, codigo: "OPT_OUT" });
  });

  it("paciente que não existe naquela clínica não vira permissão", async () => {
    // Falhar fechado: um id desconhecido não pode devolver "pode".
    const v = await avaliarPoliticaDeContato(ORG_A, id("ff"), CFG, AGORA);

    expect(v).toMatchObject({ pode: false, codigo: "SEM_TELEFONE" });
  });

  it("paciente sem telefone não passa", async () => {
    const pid = semearPaciente({ telefone: null });

    const v = await avaliarPoliticaDeContato(ORG_A, pid, CFG, AGORA);

    expect(v).toMatchObject({ pode: false, codigo: "SEM_TELEFONE" });
  });

  it("mensagem da recepção não gasta o teto da automação", async () => {
    /*
     * O teto do dia existe para limitar o que a MÁQUINA faz. Contar a mensagem
     * que a atendente escreveu faria o trabalho humano derrubar a automação —
     * e o efeito seria invisível: quanto melhor a recepção atende, menos o
     * sistema funciona.
     */
    const pid = semearPaciente();
    const conv = semearConversa({ patientId: pid });
    const apertado = { ...CFG, contatosPorDia: 1 };

    semearMensagem({ conversationId: conv, patientId: pid, remetente: "atendente" });

    const v = await avaliarPoliticaDeContato(ORG_A, pid, apertado, AGORA);

    expect(v.pode).toBe(true);
  });

  it("mensagem que o paciente mandou também não gasta o teto", async () => {
    const pid = semearPaciente();
    const conv = semearConversa({ patientId: pid });
    const apertado = { ...CFG, contatosPorDia: 1 };

    semearMensagem({
      conversationId: conv,
      patientId: pid,
      direcao: "ENTRADA",
      remetente: "paciente",
    });

    const v = await avaliarPoliticaDeContato(ORG_A, pid, apertado, AGORA);

    expect(v.pode).toBe(true);
  });

  it("o teto do dia barra quando a automação já falou", async () => {
    const pid = semearPaciente();
    const conv = semearConversa({ patientId: pid });
    const apertado = { ...CFG, contatosPorDia: 1 };

    semearMensagem({ conversationId: conv, patientId: pid, remetente: "automacao" });

    const v = await avaliarPoliticaDeContato(ORG_A, pid, apertado, AGORA);

    expect(v).toMatchObject({ pode: false, codigo: "LIMITE_DIARIO" });
  });

  it("o intervalo mínimo barra quem foi contatado há pouco", async () => {
    const pid = semearPaciente();
    const conv = semearConversa({ patientId: pid });
    const comCooldown = { ...CFG, contatosPorDia: 10, cooldownHoras: 24 };

    semearMensagem({ conversationId: conv, patientId: pid, criadoEm: horas(-2) });

    const v = await avaliarPoliticaDeContato(ORG_A, pid, comCooldown, AGORA);

    expect(v).toMatchObject({ pode: false, codigo: "COOLDOWN" });
  });

  it("o teto da hora é da clínica, não do paciente", async () => {
    /*
     * ESTE É O FREIO QUE IMPEDE O DESASTRE DE ESCALA: uma varredura de 800
     * inativos virando 800 mensagens em minutos. Ele conta a organização
     * INTEIRA — mensagem mandada para OUTRO paciente também gasta.
     *
     * Se alguém acrescentar `patient_id` a esse contador, cada paciente passa a
     * ter o próprio teto de cem por hora, o número da clínica é denunciado, e
     * nenhum teste acusaria.
     */
    const alvo = semearPaciente();
    const outro = semearPaciente();
    const conv = semearConversa({ patientId: outro });
    const apertado = { ...CFG, envioPorHora: 2 };

    semearMensagem({ conversationId: conv, patientId: outro, criadoEm: horas(-0.2) });
    semearMensagem({ conversationId: conv, patientId: outro, criadoEm: horas(-0.1) });

    const v = await avaliarPoliticaDeContato(ORG_A, alvo, apertado, AGORA);

    expect(v).toMatchObject({ pode: false, codigo: "TETO_POR_HORA" });
  });

  it("mensagem de mais de uma hora atrás não conta para o teto da hora", async () => {
    const alvo = semearPaciente();
    const outro = semearPaciente();
    const conv = semearConversa({ patientId: outro });
    const apertado = { ...CFG, envioPorHora: 1 };

    semearMensagem({ conversationId: conv, patientId: outro, criadoEm: horas(-3) });

    const v = await avaliarPoliticaDeContato(ORG_A, alvo, apertado, AGORA);

    expect(v.pode).toBe(true);
  });

  it("a própria jornada não conta como concorrente", async () => {
    /*
     * `temJornadaAtivaConcorrente` é `ativas > 1` porque quem está PERGUNTANDO
     * também aparece na contagem. Com `> 0`, nenhuma jornada jamais enviaria
     * nada — e o sintoma seria "o sistema não faz nada", sem erro nenhum.
     */
    const pid = semearPaciente();
    semearJornada(pid, "ACTIVE");

    const v = await avaliarPoliticaDeContato(ORG_A, pid, CFG, AGORA);

    expect(v.pode).toBe(true);
  });

  it("duas jornadas ativas param uma à outra", async () => {
    const pid = semearPaciente();
    semearJornada(pid, "ACTIVE");
    semearJornada(pid, "WAITING");

    const v = await avaliarPoliticaDeContato(ORG_A, pid, CFG, AGORA);

    expect(v).toMatchObject({ pode: false, codigo: "OUTRA_JORNADA" });
  });

  it("conversa com atendente assumido tira a automação do caminho", async () => {
    const pid = semearPaciente();
    semearConversa({ patientId: pid, assignedTo: USUARIO });

    const v = await avaliarPoliticaDeContato(ORG_A, pid, CFG, AGORA);

    expect(v).toMatchObject({ pode: false, codigo: "ATENDIMENTO_HUMANO" });
  });

  it("a mensagem de outra clínica não entra em nenhum contador", async () => {
    const pid = semearPaciente();
    const deFora = semearPaciente({ organizationId: ORG_B, clinicId: CLINICA_B });
    const conv = semearConversa({
      organizationId: ORG_B,
      clinicId: CLINICA_B,
      patientId: deFora,
    });
    const apertado = { ...CFG, contatosPorDia: 1, envioPorHora: 1 };

    semearMensagem({
      organizationId: ORG_B,
      conversationId: conv,
      patientId: deFora,
      criadoEm: horas(-0.1),
    });

    const v = await avaliarPoliticaDeContato(ORG_A, pid, apertado, AGORA);

    expect(v.pode).toBe(true);
  });
});

describe("avaliarPoliticaPorTelefone", () => {
  it("telefone inválido não passa", async () => {
    const v = await avaliarPoliticaPorTelefone(ORG_A, "123", CFG, AGORA);

    expect(v).toMatchObject({ pode: false, codigo: "SEM_TELEFONE" });
  });

  it("opt-out de QUALQUER paciente daquele número bloqueia", async () => {
    /*
     * Mãe e filho no mesmo telefone é o caso normal. Se um dos dois pediu para
     * sair, o número não recebe — porque a mensagem chega no aparelho, e o
     * aparelho é de quem pediu para parar.
     */
    semearPaciente({ nome: "Mãe", telefone: "5511988887777" });
    semearPaciente({ nome: "Filho", telefone: "5511988887777", optOutEm: horas(-48) });

    const v = await avaliarPoliticaPorTelefone(ORG_A, "11988887777", CFG, AGORA);

    expect(v).toMatchObject({ pode: false, codigo: "OPT_OUT" });
  });

  it("o opt-out de outra clínica não bloqueia esta", async () => {
    semearPaciente({ telefone: "5511988887777" });
    semearPaciente({
      organizationId: ORG_B,
      clinicId: CLINICA_B,
      telefone: "5511988887777",
      optOutEm: horas(-48),
    });

    const v = await avaliarPoliticaPorTelefone(ORG_A, "11988887777", CFG, AGORA);

    expect(v.pode).toBe(true);
  });

  it("número sem paciente nenhum ainda pode receber", async () => {
    // É o lead que escreveu pela primeira vez: não há cadastro, e não há
    // motivo para recusar.
    const v = await avaliarPoliticaPorTelefone(ORG_A, "11977776666", CFG, AGORA);

    expect(v.pode).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Entrega                                                                    */
/* -------------------------------------------------------------------------- */

describe("atualizarEntrega", () => {
  it("carimba o status que o provedor devolveu", async () => {
    semearMensagem({ providerMessageId: "wamid.ABC" });

    await atualizarEntrega(ORG_A, "wamid.ABC", "DELIVERED", null);

    expect(conteudo("crc_messages")[0]).toMatchObject({
      status_entrega: "DELIVERED",
      erro: null,
    });
  });

  it("guarda o erro quando o provedor recusou", async () => {
    semearMensagem({ providerMessageId: "wamid.XYZ" });

    await atualizarEntrega(ORG_A, "wamid.XYZ", "FAILED", "número inválido");

    expect(conteudo("crc_messages")[0]).toMatchObject({
      status_entrega: "FAILED",
      erro: "número inválido",
    });
  });

  it("não carimba a mensagem de outra clínica com o mesmo id do provedor", async () => {
    semearMensagem({ organizationId: ORG_B, providerMessageId: "wamid.ABC" });

    await atualizarEntrega(ORG_A, "wamid.ABC", "READ", null);

    expect(conteudo("crc_messages")[0]?.["status_entrega"]).not.toBe("READ");
  });
});

/* -------------------------------------------------------------------------- */
/* Conversa                                                                   */
/* -------------------------------------------------------------------------- */

describe("resolverConversa", () => {
  it("reaproveita a conversa que já existe para aquele número", async () => {
    const cid = semearConversa({ contatoExterno: "5511988887777" });

    const r = await resolverConversa(ORG_A, CLINICA_A, "11988887777");

    expect(r.conversa.id).toBe(cid);
    expect(conteudo("crc_conversations")).toHaveLength(1);
  });

  it("liga ao paciente quando só um casa com o número", async () => {
    const pid = semearPaciente({ telefone: "5511988887777" });

    const r = await resolverConversa(ORG_A, CLINICA_A, "11988887777");

    expect(r.conversa.patientId).toBe(pid);
    expect(r.precisaRevisao).toBe(false);
  });

  it("dois pacientes no mesmo telefone abrem revisão", async () => {
    /*
     * NUNCA ESCOLHER. Ligar a conversa ao paciente errado escreve a mensagem de
     * um no prontuário do outro — e no caso de mãe e filho isso é conteúdo
     * clínico de uma criança no registro de um adulto.
     */
    semearPaciente({ nome: "Mãe", telefone: "5511988887777" });
    semearPaciente({ nome: "Filho", telefone: "5511988887777" });

    const r = await resolverConversa(ORG_A, CLINICA_A, "11988887777");

    expect(r.precisaRevisao).toBe(true);
    expect(r.conversa.patientId).toBeNull();
  });

  it("canal diferente é conversa diferente", async () => {
    semearConversa({ contatoExterno: "5511988887777", canal: "whatsapp" });

    await resolverConversa(ORG_A, CLINICA_A, "11988887777", "instagram");

    expect(conteudo("crc_conversations")).toHaveLength(2);
  });

  it("a conversa de outra clínica com o mesmo número não é reaproveitada", async () => {
    semearConversa({
      organizationId: ORG_B,
      clinicId: CLINICA_B,
      contatoExterno: "5511988887777",
    });

    await resolverConversa(ORG_A, CLINICA_A, "11988887777");

    expect(conteudo("crc_conversations")).toHaveLength(2);
    expect(conteudo("crc_conversations")[1]?.["organization_id"]).toBe(ORG_A);
  });
});

describe("vincularConversaAoPaciente", () => {
  it("liga e fecha a revisão", async () => {
    const pid = semearPaciente();
    const cid = semearConversa({ revisaoPendente: true });

    await vincularConversaAoPaciente(ORG_A, cid, pid, USUARIO);

    expect(conteudo("crc_conversations")[0]).toMatchObject({
      patient_id: pid,
      revisao_pendente: false,
      candidatos: null,
    });
  });

  it("não liga a conversa de outra clínica", async () => {
    const pid = semearPaciente();
    const cid = semearConversa({ organizationId: ORG_B, clinicId: CLINICA_B });

    await vincularConversaAoPaciente(ORG_A, cid, pid, USUARIO);

    expect(conteudo("crc_conversations")[0]?.["patient_id"]).toBeNull();
  });
});

describe("marcarConversaLida", () => {
  it("zera o contador de não lidas", async () => {
    const cid = semearConversa({ naoLidas: 4 });

    await marcarConversaLida(ORG_A, cid);

    expect(conteudo("crc_conversations")[0]?.["nao_lidas"]).toBe(0);
  });

  it("não zera a de outra clínica", async () => {
    const cid = semearConversa({ organizationId: ORG_B, clinicId: CLINICA_B, naoLidas: 4 });

    await marcarConversaLida(ORG_A, cid);

    expect(conteudo("crc_conversations")[0]?.["nao_lidas"]).toBe(4);
  });
});

describe("buscarConversaDoPaciente", () => {
  it("traz a mais recente quando há mais de uma", async () => {
    const pid = semearPaciente();
    semearConversa({ patientId: pid, ultimaMensagemEm: horas(-50) });
    const nova = semearConversa({ patientId: pid, ultimaMensagemEm: horas(-1) });

    const c = await buscarConversaDoPaciente(ORG_A, { id: pid });

    expect(c?.id).toBe(nova);
  });

  it("não enxerga a conversa de outra clínica", async () => {
    const pid = semearPaciente();
    semearConversa({ organizationId: ORG_B, clinicId: CLINICA_B, patientId: pid });

    expect(await buscarConversaDoPaciente(ORG_A, { id: pid })).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Nota interna                                                               */
/* -------------------------------------------------------------------------- */

describe("registrarNotaInterna", () => {
  it("grava marcada como interna", async () => {
    const cid = semearConversa();

    const nota = await registrarNotaInterna(ORG_A, cid, null, "paciente é irmão da Dra.", USUARIO);

    expect(nota.notaInterna).toBe(true);
    expect(conteudo("crc_messages")[0]).toMatchObject({
      nota_interna: true,
      remetente: "atendente",
    });
  });

  it("não tem id de provedor — ela nunca passou por um", async () => {
    /*
     * A separação não é só um campo booleano: esta função não toca o provedor
     * de jeito nenhum. Se a nota fosse "mensagem com flag", bastaria um `if`
     * esquecido no caminho de envio para o comentário da equipe sobre o
     * paciente chegar no WhatsApp dele.
     *
     * A PROVA É A AUSÊNCIA DO `provider_message_id`, e não a de `enviado_em`.
     * A nota nasce de propósito com `status_entrega: "SENT"` e com carimbo de
     * hora — senão ela ficaria para sempre como "na fila" na tela, e a equipe
     * acharia que o próprio comentário dela não saiu. Só o provedor emite um
     * id; ele não existir é o que prova que ninguém do lado de fora viu isto.
     */
    const cid = semearConversa();

    await registrarNotaInterna(ORG_A, cid, null, "cuidado com esse caso", USUARIO);

    const m = conteudo("crc_messages")[0];
    expect(m?.["provider_message_id"] ?? null).toBeNull();
    expect(m?.["nota_interna"]).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Listagens                                                                  */
/* -------------------------------------------------------------------------- */

describe("listarConversas", () => {
  it("só traz as da clínica pedida", async () => {
    semearConversa();
    semearConversa({ organizationId: ORG_B, clinicId: CLINICA_B });

    const lista = await listarConversas({ organizationId: ORG_A });

    expect(lista).toHaveLength(1);
  });

  it("`assignedTo: null` é 'sem responsável', e não 'qualquer um'", async () => {
    semearConversa({ assignedTo: null });
    semearConversa({ assignedTo: USUARIO });

    const semDono = await listarConversas({ organizationId: ORG_A, assignedTo: null });
    const todas = await listarConversas({ organizationId: ORG_A });

    expect(semDono).toHaveLength(1);
    expect(todas).toHaveLength(2);
  });

  it("filtra as que esperam revisão de identidade", async () => {
    semearConversa({ revisaoPendente: true });
    semearConversa({ revisaoPendente: false });

    const lista = await listarConversas({ organizationId: ORG_A, apenasRevisao: true });

    expect(lista).toHaveLength(1);
  });
});

describe("listarMensagens", () => {
  it("traz em ordem cronológica", async () => {
    const cid = semearConversa();
    semearMensagem({ conversationId: cid, criadoEm: horas(-1) });
    semearMensagem({ conversationId: cid, criadoEm: horas(-5) });

    const lista = await listarMensagens(ORG_A, cid);

    expect(lista.map((m) => m.criadoEm)).toEqual([horas(-5), horas(-1)]);
  });

  it("não mistura mensagem de outra clínica na mesma conversa", async () => {
    const cid = semearConversa();
    semearMensagem({ conversationId: cid });
    semearMensagem({ conversationId: cid, organizationId: ORG_B });

    expect(await listarMensagens(ORG_A, cid)).toHaveLength(1);
  });
});
