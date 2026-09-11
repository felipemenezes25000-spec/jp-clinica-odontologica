/**
 * Agendamento — do "quero marcar" ao horário ocupado na agenda.
 *
 * O QUE ESTES TESTES PROTEGEM é a promessa mais forte deste módulo: o sistema
 * **nunca marca sobre agenda ocupada e nunca inventa horário**. Um erro aqui
 * não aparece num log: aparece com dois pacientes na recepção às 10:40.
 *
 * Por isso o sandbox do Dental Office é usado de verdade, com o estado dele
 * mudando entre a oferta e o aceite — que é exatamente o que acontece quando a
 * recepção marca alguém por telefone no meio do caminho.
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

import { CONFIGURACAO_PADRAO, FLAGS, KILL_SWITCHES } from "../dominio/configuracao";
import { criarSandbox } from "../integracoes/dental-office/sandbox";
import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import { aceitarHorario, oferecerHorarios, type ContextoAgendamento } from "./agendamento";

const ORG = "org-1";
const CLINICA = "clinica-1";
const PACIENTE = "pac-1";
const CONVERSA = "conv-1";

/** Uma terça, 14h em São Paulo — dentro do horário comercial. */
const AGORA = new Date("2026-09-08T17:00:00.000Z");

function contexto(extras: Partial<ContextoAgendamento> = {}): ContextoAgendamento {
  return {
    organizationId: ORG,
    clinicId: CLINICA,
    clinicaExternaId: "clin-1",
    cliente: criarSandbox(),
    configuracao: CONFIGURACAO_PADRAO,
    // As duas travas ligadas: é o estado de uma clínica que já autorizou a
    // escrita. O teste do estado PADRÃO (desligado) está mais abaixo.
    flags: { [FLAGS.dentalOfficeWriteback]: true, [FLAGS.autoScheduling]: true },
    interruptores: {},
    agora: AGORA,
    ...extras,
  };
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  vi.setSystemTime(AGORA);

  semear("crc_organizations", [{ id: ORG, nome: "JP", slug: "jp" }]);
  semear("crc_clinics", [
    { id: CLINICA, organization_id: ORG, nome: "JP", slug: "matriz", external_id: "clin-1" },
  ]);
  semear("crc_patients", [
    {
      id: PACIENTE,
      organization_id: ORG,
      clinic_id: CLINICA,
      external_source: "dental_office",
      external_id: "pac-externo-1",
      nome: "Maria Souza Lima",
      telefone: "5511999990001",
      proxima_consulta_em: null,
    },
  ]);
  semear("crc_conversations", [
    {
      id: CONVERSA,
      organization_id: ORG,
      clinic_id: CLINICA,
      patient_id: PACIENTE,
      canal: "whatsapp",
      contato_externo: "5511999990001",
      status: "ABERTA",
    },
  ]);
  semear("crc_dentists", [
    {
      id: "d-1",
      organization_id: ORG,
      clinic_id: CLINICA,
      external_source: "dental_office",
      external_id: "dent-1",
      nome: "Dra. Juliana Pelisser",
      ativo: true,
    },
  ]);
});

/* ========================================================================== */

describe("oferecer", () => {
  it("só oferece horário que a agenda devolveu, dentro do horário comercial", async () => {
    const ctx = contexto();
    const r = await oferecerHorarios(ctx, { conversationId: CONVERSA, patientId: PACIENTE });

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.opcoes.length).toBeGreaterThan(0);
    expect(r.opcoes.length).toBeLessThanOrEqual(3);

    // Cada opção precisa existir de fato na agenda do sandbox — nenhuma pode
    // ter sido montada por aritmética nossa.
    const daAgenda = await ctx.cliente.horariosDisponiveis({
      clinicaExternaId: "clin-1",
      dentistaExternoId: "dent-1",
      diasAFrente: 14,
      clinicId: CLINICA,
    });
    const reais = new Set(daAgenda.map((s) => s.inicioEm));
    for (const o of r.opcoes) expect(reais.has(o.inicioEm)).toBe(true);
  });

  it("nunca oferece dois horários no mesmo dia", async () => {
    const r = await oferecerHorarios(contexto(), {
      conversationId: CONVERSA,
      patientId: PACIENTE,
    });
    if (!r.ok) throw new Error(r.motivo);

    // Três variações da mesma terça não são três opções — são uma.
    const dias = new Set(r.opcoes.map((o) => o.diaLocal));
    expect(dias.size).toBe(r.opcoes.length);
  });

  it("não oferece a quem já tem consulta marcada", async () => {
    semear("crc_appointments", [
      {
        id: "ag-existente",
        organization_id: ORG,
        clinic_id: CLINICA,
        patient_id: PACIENTE,
        external_source: "dental_office",
        external_id: "ext-9",
        inicio_em: new Date(AGORA.getTime() + 3 * 86_400_000).toISOString(),
        status: "CONFIRMED",
      },
    ]);

    const r = await oferecerHorarios(contexto(), {
      conversationId: CONVERSA,
      patientId: PACIENTE,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe("JA_TEM_CONSULTA");
  });

  it("sem dentista sincronizado, não há por quem perguntar", async () => {
    limparBanco();
    definirRelogio(AGORA);
    semear("crc_organizations", [{ id: ORG, nome: "JP", slug: "jp" }]);
    semear("crc_clinics", [
      { id: CLINICA, organization_id: ORG, nome: "JP", slug: "matriz", external_id: "clin-1" },
    ]);

    const r = await oferecerHorarios(contexto(), {
      conversationId: CONVERSA,
      patientId: PACIENTE,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe("SEM_DENTISTA");
  });

  it("duas ofertas abertas na mesma conversa: o banco recusa a segunda", async () => {
    const ctx = contexto();
    const primeira = await oferecerHorarios(ctx, {
      conversationId: CONVERSA,
      patientId: PACIENTE,
    });
    expect(primeira.ok).toBe(true);

    const segunda = await oferecerHorarios(ctx, {
      conversationId: CONVERSA,
      patientId: PACIENTE,
    });
    expect(segunda.ok).toBe(false);
    if (segunda.ok) return;
    expect(segunda.codigo).toBe("OFERTA_ABERTA");
    expect(conteudo("crc_scheduling_offers")).toHaveLength(1);
  });
});

/* ========================================================================== */

describe("aceitar", () => {
  async function comOferta(ctx: ContextoAgendamento) {
    const r = await oferecerHorarios(ctx, { conversationId: CONVERSA, patientId: PACIENTE });
    if (!r.ok) throw new Error(r.motivo);
    return r;
  }

  it("marca de verdade, e a consulta aparece na agenda do Dental Office", async () => {
    const ctx = contexto();
    const oferta = await comOferta(ctx);
    const escolhido = oferta.opcoes[0];
    if (escolhido === undefined) throw new Error("sem opção");

    const r = await aceitarHorario(ctx, {
      conversationId: CONVERSA,
      texto: `${escolhido.horaLocal} tá ótimo`,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.opcao.inicioEm).toBe(escolhido.inicioEm);

    // O horário saiu da lista de livres — foi ocupado no sistema da clínica.
    const livres = await ctx.cliente.horariosDisponiveis({
      clinicaExternaId: "clin-1",
      dentistaExternoId: escolhido.dentistaExternoId,
      diasAFrente: 14,
      clinicId: CLINICA,
    });
    expect(livres.some((s) => s.inicioEm === escolhido.inicioEm)).toBe(false);

    // E o espelho local sabe: é isso que sustenta o peso −20 da fila.
    const paciente = conteudo("crc_patients")[0];
    expect(paciente?.["proxima_consulta_em"]).toBe(escolhido.inicioEm);
    expect(conteudo("crc_appointments")).toHaveLength(1);
    expect(conteudo("crc_scheduling_offers")[0]?.["status"]).toBe("ACEITA");
  });

  it("REVALIDA: horário ocupado entre a oferta e a resposta não é marcado", async () => {
    const ctx = contexto();
    const oferta = await comOferta(ctx);
    const escolhido = oferta.opcoes[0];
    if (escolhido === undefined) throw new Error("sem opção");

    // A recepção marca outra pessoa nesse horário, por telefone.
    await ctx.cliente.criarAgendamento({
      clinicaExternaId: "clin-1",
      pacienteExternoId: "outro-paciente",
      dentistaExternoId: escolhido.dentistaExternoId,
      cadeiraExternaId: "cad-1",
      inicioEm: escolhido.inicioEm,
      duracaoMinutos: 30,
    });

    const r = await aceitarHorario(ctx, {
      conversationId: CONVERSA,
      texto: escolhido.horaLocal,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe("SLOT_SUMIU");

    // O paciente NÃO ficou com uma consulta fantasma.
    expect(conteudo("crc_appointments")).toHaveLength(0);
    expect(conteudo("crc_patients")[0]?.["proxima_consulta_em"]).toBeNull();
    // E a oferta foi encerrada, liberando a conversa para uma nova.
    expect(conteudo("crc_scheduling_offers")[0]?.["status"]).toBe("CANCELADA");
  });

  it("com a escrita desligada, não marca — e deixa tarefa para a recepção", async () => {
    // O ESTADO PADRÃO do sistema: `dental_office_writeback` nasce desligada.
    const ctx = contexto({ flags: { [FLAGS.autoScheduling]: true } });
    const oferta = await comOferta(ctx);
    const escolhido = oferta.opcoes[0];
    if (escolhido === undefined) throw new Error("sem opção");

    const r = await aceitarHorario(ctx, {
      conversationId: CONVERSA,
      texto: escolhido.horaLocal,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe("ESCRITA_DESLIGADA");
    expect(conteudo("crc_appointments")).toHaveLength(0);

    // O desfecho não é silêncio: alguém foi avisado de que há um horário
    // aceito esperando ser digitado.
    const tarefas = conteudo("crc_tasks");
    expect(tarefas).toHaveLength(1);
    expect(String(tarefas[0]?.["titulo"])).toContain(escolhido.rotulo);
  });

  it("o kill switch de escrita barra mesmo com a flag ligada", async () => {
    const ctx = contexto({
      interruptores: { [KILL_SWITCHES.escritasDentalOffice]: true },
    });
    const oferta = await comOferta(ctx);
    const escolhido = oferta.opcoes[0];
    if (escolhido === undefined) throw new Error("sem opção");

    const r = await aceitarHorario(ctx, {
      conversationId: CONVERSA,
      texto: escolhido.horaLocal,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe("ESCRITA_DESLIGADA");
    expect(conteudo("crc_appointments")).toHaveLength(0);
  });

  it("resposta ambígua não marca nada e mantém a oferta de pé", async () => {
    const ctx = contexto();
    await comOferta(ctx);

    const r = await aceitarHorario(ctx, {
      conversationId: CONVERSA,
      texto: "qualquer um serve",
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe("NAO_ESCOLHEU");
    expect(conteudo("crc_appointments")).toHaveLength(0);
    // A oferta continua ABERTA: o paciente ainda pode escolher na próxima
    // mensagem, e recomeçar do zero seria perder o contexto dele.
    expect(conteudo("crc_scheduling_offers")[0]?.["status"]).toBe("ABERTA");
  });

  it("recusa encerra a oferta em vez de insistir", async () => {
    const ctx = contexto();
    await comOferta(ctx);

    const r = await aceitarHorario(ctx, {
      conversationId: CONVERSA,
      texto: "nenhum desses dá pra mim",
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe("ESCOLHA_RECUSADA");
    expect(conteudo("crc_scheduling_offers")[0]?.["status"]).toBe("CANCELADA");
  });

  it("oferta vencida não é aceita", async () => {
    const ctx = contexto();
    await comOferta(ctx);

    // Três dias depois: o horário oferecido já não vale nada.
    const depois = new Date(AGORA.getTime() + 3 * 86_400_000);
    const r = await aceitarHorario(
      { ...ctx, agora: depois },
      {
        conversationId: CONVERSA,
        texto: "pode ser o primeiro",
      },
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe("OFERTA_VENCIDA");
    expect(conteudo("crc_scheduling_offers")[0]?.["status"]).toBe("EXPIRADA");
  });

  it("sem oferta aberta, uma resposta qualquer não vira agendamento", async () => {
    const r = await aceitarHorario(contexto(), {
      conversationId: CONVERSA,
      texto: "10:40",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe("SEM_OFERTA");
  });
});
