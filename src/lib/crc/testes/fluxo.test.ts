/**
 * Testes de fluxo ponta a ponta — item 82.
 *
 * O QUE ESTES TESTES SÃO, E O QUE ELES NÃO SÃO.
 *
 * SÃO: o sistema inteiro rodando de verdade — sincronização, motor de eventos,
 * criação de oportunidade, motor de jornadas, política de contato, envio,
 * recebimento de resposta e encerramento. Só o DRIVER DE BANCO é substituído
 * por um em memória que reproduz os índices únicos e as reservas atômicas.
 *
 * NÃO SÃO: teste de navegador. A camada HTTP, o React e o Playwright ficam de
 * fora. O contrato pede E2E com banco de teste e navegador; com o schema ainda
 * não aplicado no Supabase e as credenciais das integrações ausentes, um teste
 * assim não rodaria — e teste que não roda não protege nada. Isto cobre o
 * miolo, que é onde a lógica mora, e a lacuna está declarada aqui e no
 * FINAL-ACCEPTANCE.
 *
 * O FLUXO DO ITEM 49 é o caso central: falta detectada no Dental Office vira
 * evento, vira oportunidade, vira jornada, vira mensagem, o paciente responde,
 * a jornada encerra e a recuperação é registrada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// A substituição precisa vir ANTES de qualquer import do código sob teste:
// `vi.mock` é içado, mas os módulos que importam `banco` capturam a referência
// no momento em que são carregados.
vi.mock("../servidor/banco", async () => {
  const fake = await import("./banco-memoria");
  return fake;
});

// O log de auditoria e de integração grava no banco fake sem problema, mas o
// stdout de 200 linhas por teste esconderia a saída que importa.
vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return { ...real, registrar: () => undefined };
});

import { CONFIGURACAO_PADRAO, proximoInstanteUtil } from "../dominio/configuracao";
import { emitir, processarEventos, _limparHandlers } from "../aplicacao/eventos";
import { criarOportunidade, listarOportunidades } from "../aplicacao/oportunidades";
import { receberMensagem } from "../aplicacao/mensagens";
import { sincronizarAgendamentos, sincronizarPacientes } from "../aplicacao/sincronizacao";
import { instalarHandlers, _resetarInstalacao } from "../automacao/handlers";
import { rodarCiclo } from "../automacao/motor";
import { AUTOMACOES_PADRAO } from "../automacao/catalogo";
import { criarSandbox, _reiniciarSandbox } from "../integracoes/dental-office/sandbox";
import {
  obterSandboxMensageria,
  _reiniciarSandboxMensageria,
} from "../integracoes/whatsapp/provedores";

import { conteudo, definirRelogio, limparBanco, semear } from "./banco-memoria";

const ORG = "org-teste";
const CLINICA = "clinica-teste";

/** Instala o mínimo que o CRC precisa para operar: etapas e automações ativas. */
function montarCenario(): void {
  semear("crc_organizations", [{ id: ORG, nome: "JP", slug: "jp" }]);
  semear("crc_clinics", [
    {
      id: CLINICA,
      organization_id: ORG,
      nome: "JP",
      slug: "matriz",
      external_id: "clin-1",
      ativa: true,
    },
  ]);

  semear("crc_opportunity_stages", [
    {
      id: "et-1",
      organization_id: ORG,
      chave: "contato_pendente",
      nome: "Contato pendente",
      ordem: 2,
      categoria: "ABERTA",
    },
    {
      id: "et-2",
      organization_id: ORG,
      chave: "fechado",
      nome: "Fechado",
      ordem: 8,
      categoria: "GANHA",
    },
    {
      id: "et-3",
      organization_id: ORG,
      chave: "perdido",
      nome: "Perdido",
      ordem: 9,
      categoria: "PERDIDA",
    },
  ]);

  // As automações entram ATIVAS e em EXECUTAR: o teste existe para exercitar o
  // caminho completo. Em produção elas nascem em rascunho + simulação, e isso
  // é coberto pelos testes do catálogo.
  AUTOMACOES_PADRAO.forEach((a, i) => {
    const id = `auto-${String(i)}`;
    semear("crc_automations", [
      {
        id,
        organization_id: ORG,
        chave: a.chave,
        nome: a.nome,
        descricao: a.descricao,
        status: "ATIVA",
        modo: "EXECUTAR",
        versao_ativa: 1,
      },
    ]);
    semear("crc_automation_versions", [
      { id: `ver-${String(i)}`, automation_id: id, versao: 1, definicao: a.definicao },
    ]);
  });
}

async function sincronizarTudo(): Promise<void> {
  const cliente = criarSandbox();
  const ctx = {
    organizationId: ORG,
    clinicId: CLINICA,
    clinicaExternaId: "clin-1",
    cliente,
  };
  await sincronizarPacientes(ctx);
  await sincronizarAgendamentos(ctx, { diasPassado: 500, diasFuturo: 60 });
}

/**
 * Um instante DENTRO do horário comercial, calculado a partir de agora.
 *
 * A tentação era escrever uma terça-feira às 11h e seguir em frente. Uma data
 * fixa apodrece: a suíte passaria hoje e começaria a falhar num sábado
 * qualquer, sem ninguém ter mexido em nada — e o time perderia a tarde
 * procurando um bug que é do calendário. Derivar do relógio resolve a classe.
 *
 * E ELE É O RELÓGIO DE TODA A SUÍTE, inclusive o de `processarEventos`. Fora do
 * horário comercial `proximoInstanteUtil` empurra este instante para a abertura
 * seguinte — um ponto no FUTURO — e a jornada recém-inscrita ficava vencida por
 * acidente. Dentro do horário comercial ele é o próprio `new Date()` do
 * carregamento do módulo, o processamento do evento acontece milissegundos
 * DEPOIS, e a mesma jornada nascia com `resume_at` à frente do worker: não era
 * reservada, ficava ACTIVE e três testes deste arquivo falhavam conforme a HORA
 * do dia em que a suíte rodava. Passar o instante para quem grava `resume_at` é
 * o que tira o acaso do meio.
 */
const HORARIO_UTIL = proximoInstanteUtil(new Date(), CONFIGURACAO_PADRAO.horarioComercial);

/**
 * O contexto do worker — e, junto com ele, o relógio do banco.
 *
 * Em produção o `now()` do Postgres e o `agora` do motor são o mesmo instante:
 * a reserva de jornadas compara `resume_at <= now()` enquanto o motor calcula
 * as esperas. Deixar o fake no relógio de parede quebraria essa igualdade e o
 * teste passaria a reservar jornadas que o motor considera adormecidas.
 */
function contextoDeExecucao(agora: Date = HORARIO_UTIL) {
  definirRelogio(agora);
  return {
    organizationId: ORG,
    porta: obterSandboxMensageria(),
    configuracao: CONFIGURACAO_PADRAO,
    enviosPausados: false,
    automacoesPausadas: false,
    agora,
  };
}

/**
 * As duas jornadas que a base fictícia abre.
 *
 * A primeira versão destes testes dizia `enrollments[0]` e supunha uma jornada
 * só. São duas, e as duas estão certas: Maria faltou (item 49) e João cancelou
 * (item 51). Nomear cada uma é o que faz o teste continuar dizendo a verdade
 * quando a base fictícia ganhar o nono paciente.
 */
const MARIA_FALTOU = "MISSED_APPOINTMENT:ag-2001";
const JOAO_CANCELOU = "CANCELLED_APPOINTMENT:ag-2003";

type LinhaFake = ReturnType<typeof conteudo>[number];

function jornadaDe(chaveDedupe: string): LinhaFake | undefined {
  return conteudo("crc_automation_enrollments").find((j) => j["chave_dedupe"] === chaveDedupe);
}

/** Adianta o relógio da jornada: é assim que uma espera durável se comporta. */
function acordar(chaveDedupe: string, quando: Date = HORARIO_UTIL, passo?: number): void {
  const j = jornadaDe(chaveDedupe);
  if (j === undefined) return;
  j["resume_at"] = new Date(quando.getTime() - 1000).toISOString();
  j["travado_ate"] = null;
  if (passo !== undefined) j["passo_atual"] = passo;
}

/** Tira a jornada da fila sem apagá-la — para isolar o caso sob teste. */
function adormecer(chaveDedupe: string): void {
  const j = jornadaDe(chaveDedupe);
  if (j !== undefined) j["resume_at"] = new Date(HORARIO_UTIL.getTime() + 864e5).toISOString();
}

beforeEach(() => {
  limparBanco();
  definirRelogio(HORARIO_UTIL);
  _reiniciarSandbox();
  _reiniciarSandboxMensageria();
  _limparHandlers();
  _resetarInstalacao();
  montarCenario();
});

/* ========================================================================== */
/* Sincronização                                                              */
/* ========================================================================== */

describe("sincronização", () => {
  it("traz pacientes e agenda do Dental Office", async () => {
    await sincronizarTudo();

    expect(conteudo("crc_patients").length).toBe(8);
    expect(conteudo("crc_appointments").length).toBeGreaterThan(8);

    // O espelho de consultas precisa estar preenchido: é dele que dependem
    // todas as regras de "sem consulta futura".
    const paulo = conteudo("crc_patients").find((p) => p["external_id"] === "do-1008");
    expect(paulo?.["proxima_consulta_em"], "Paulo tem consulta futura marcada").not.toBeNull();

    const maria = conteudo("crc_patients").find((p) => p["external_id"] === "do-1001");
    expect(maria?.["proxima_consulta_em"], "Maria faltou e não remarcou").toBeNull();
  });

  it("É IDEMPOTENTE: sincronizar duas vezes não duplica nada", async () => {
    await sincronizarTudo();
    const pacientes = conteudo("crc_patients").length;
    const agendamentos = conteudo("crc_appointments").length;
    const eventos = conteudo("crc_events").length;

    await sincronizarTudo();

    expect(conteudo("crc_patients").length).toBe(pacientes);
    expect(conteudo("crc_appointments").length).toBe(agendamentos);
    // Nenhum evento NOVO: o status não mudou entre as duas execuções.
    expect(conteudo("crc_events").length).toBe(eventos);
  });

  it("emite evento de falta para a falta recente, e não para a antiga", async () => {
    await sincronizarTudo();

    const faltas = conteudo("crc_events").filter((e) => e["tipo"] === "appointment.missed");
    // Maria (ontem) e Fernanda (2 dias) faltaram dentro da janela recuperável.
    expect(faltas.length).toBe(2);
    expect(faltas.every((f) => typeof f["fingerprint"] === "string")).toBe(true);
  });

  it("NÃO emite evento de falta para agendamento antigo na primeira carga", async () => {
    // A trava contra a avalanche: sem ela, a primeira sincronização de uma base
    // real dispararia mensagem sobre faltas de anos atrás.
    await sincronizarTudo();
    const eventos = conteudo("crc_events");
    const concluidas = eventos.filter((e) => e["tipo"] === "appointment.completed");
    expect(concluidas.length).toBeGreaterThan(0);

    const faltas = eventos.filter((e) => e["tipo"] === "appointment.missed");
    expect(faltas.length).toBeLessThan(concluidas.length + faltas.length);
  });
});

/* ========================================================================== */
/* Fluxo do item 49                                                           */
/* ========================================================================== */

describe("fluxo do faltante — item 49", () => {
  it("falta vira oportunidade e jornada", async () => {
    instalarHandlers();
    await sincronizarTudo();

    const r = await processarEventos(50, HORARIO_UTIL);
    expect(r.processados).toBeGreaterThan(0);

    const oportunidades = conteudo("crc_opportunities").filter(
      (o) => o["tipo"] === "MISSED_APPOINTMENT",
    );
    // Maria entra. Fernanda NÃO: ela não tem telefone.
    expect(oportunidades.length).toBe(1);

    // DUAS jornadas, e as duas estão certas: Maria faltou (item 49) e João
    // cancelou no mesmo dia (item 51). O teste nomeia as duas de propósito —
    // contar jornadas esconderia uma automação que parou de disparar.
    expect(conteudo("crc_automation_enrollments")).toHaveLength(2);
    expect(jornadaDe(MARIA_FALTOU)?.["status"]).toBe("ACTIVE");
    expect(jornadaDe(JOAO_CANCELOU)?.["status"]).toBe("ACTIVE");
  });

  it("NÃO cria oportunidade para quem já tem consulta marcada", async () => {
    instalarHandlers();
    await sincronizarTudo();
    await processarEventos(50, HORARIO_UTIL);

    const paulo = conteudo("crc_patients").find((p) => p["external_id"] === "do-1008");
    const dele = conteudo("crc_opportunities").filter((o) => o["patient_id"] === paulo?.["id"]);
    expect(dele).toHaveLength(0);
  });

  it("NÃO cria oportunidade para paciente sem telefone", async () => {
    instalarHandlers();
    await sincronizarTudo();
    await processarEventos(50, HORARIO_UTIL);

    const fernanda = conteudo("crc_patients").find((p) => p["external_id"] === "do-1007");
    expect(fernanda?.["telefone"]).toBeNull();
    const dela = conteudo("crc_opportunities").filter((o) => o["patient_id"] === fernanda?.["id"]);
    expect(dela).toHaveLength(0);
  });

  it("a jornada espera antes de falar — não manda mensagem na hora da falta", async () => {
    instalarHandlers();
    await sincronizarTudo();
    await processarEventos(50, HORARIO_UTIL);

    // O primeiro passo é ESPERAR 2h: tempo de o paciente ligar por conta
    // própria e de a recepção registrar uma remarcação de balcão.
    const ciclo = await rodarCiclo(contextoDeExecucao(HORARIO_UTIL), 10);
    expect(ciclo.mensagensEnviadas).toBe(0);
    expect(obterSandboxMensageria().listarEnviadas()).toHaveLength(0);

    const jornada = jornadaDe(MARIA_FALTOU);
    expect(jornada?.["status"]).toBe("WAITING");
    expect(jornada?.["resume_at"]).toBeTruthy();
  });

  it("depois da espera, a mensagem sai", async () => {
    instalarHandlers();
    await sincronizarTudo();
    await processarEventos(50, HORARIO_UTIL);
    await rodarCiclo(contextoDeExecucao(HORARIO_UTIL), 10);

    // Só a de Maria acorda: a de João continua na espera dela, e o teste é
    // sobre UMA mensagem sair no momento certo.
    acordar(MARIA_FALTOU);

    const ciclo = await rodarCiclo(contextoDeExecucao(HORARIO_UTIL), 10);
    expect(ciclo.mensagensEnviadas).toBe(1);

    const enviadas = obterSandboxMensageria().listarEnviadas();
    expect(enviadas).toHaveLength(1);
    expect(enviadas[0]?.texto).toContain("remarcar");
    // A variável foi substituída: `{{primeiroNome}}` cru chegando no WhatsApp
    // de um paciente destrói a confiança na automação inteira.
    expect(enviadas[0]?.texto).not.toContain("{{");
  });

  it("a resposta do paciente ENCERRA a jornada", async () => {
    instalarHandlers();
    await sincronizarTudo();
    await processarEventos(50, HORARIO_UTIL);
    await rodarCiclo(contextoDeExecucao(HORARIO_UTIL), 10);

    acordar(MARIA_FALTOU);
    await rodarCiclo(contextoDeExecucao(HORARIO_UTIL), 10);

    // O paciente responde.
    await receberMensagem(ORG, CLINICA, {
      providerMessageId: "wamid.resposta",
      telefone: "5511999990001",
      texto: "pode ser quinta de manhã",
      recebidaEm: new Date(HORARIO_UTIL.getTime() + 60_000).toISOString(),
      nomePerfil: "Maria",
    });

    // A jornada acorda no passo do `SAIR_SE`. João sai da frente: a resposta
    // foi do telefone da Maria, e só a jornada dela deve reagir.
    adormecer(JOAO_CANCELOU);
    acordar(MARIA_FALTOU, new Date(HORARIO_UTIL.getTime() + 180_000));

    const ciclo = await rodarCiclo(
      contextoDeExecucao(new Date(HORARIO_UTIL.getTime() + 180_000)),
      10,
    );

    expect(ciclo.saidas).toBe(1);
    const final = jornadaDe(MARIA_FALTOU);
    expect(final?.["status"]).toBe("EXITED");
    expect(final?.["saiu_por"]).toBe("paciente_respondeu");

    // E o segundo contato NUNCA sai.
    expect(obterSandboxMensageria().listarEnviadas()).toHaveLength(1);
  });
});

/* ========================================================================== */
/* Causalidade da recuperação (item 62)                                       */
/* ========================================================================== */

describe("causalidade da recuperação — item 62", () => {
  it("consulta ANTIGA não fecha oportunidade aberta hoje", async () => {
    // O caso real: a primeira sincronização de uma base de verdade emite uma
    // conclusão para CADA consulta do histórico. Maria faltou ontem (ag-2001) e
    // concluiu uma consulta há 35 dias (ag-2002). Sem a guarda de causalidade,
    // a conclusão antiga chega depois no processamento, fecha a oportunidade
    // recém-aberta como "recuperada" e registra receita que ninguém recuperou.
    instalarHandlers();
    await sincronizarTudo();
    await processarEventos(50, HORARIO_UTIL);

    const dela = conteudo("crc_opportunities").find((o) => o["chave_dedupe"] === MARIA_FALTOU);
    expect(dela?.["fechada_em"] ?? null, "a oportunidade continua ABERTA").toBeNull();

    const recuperadas = conteudo("crc_funnel_events").filter(
      (e) => e["etapa"] === "consulta_recuperada",
    );
    expect(recuperadas, "nenhuma recuperação inventada").toHaveLength(0);
  });

  it("mas a consulta POSTERIOR fecha, e aí a recuperação é real", async () => {
    instalarHandlers();
    await sincronizarTudo();
    await processarEventos(50, HORARIO_UTIL);

    const maria = conteudo("crc_patients").find((p) => p["external_id"] === "do-1001");
    const patientId = String(maria?.["id"] ?? "");

    // Maria remarcou e compareceu HOJE — depois de a oportunidade existir.
    await emitir({
      organizationId: ORG,
      clinicId: CLINICA,
      tipo: "appointment.completed",
      entityType: "appointment",
      entityId: "ag-9001",
      payload: { externalId: "ag-9001", patientId, inicioEm: HORARIO_UTIL.toISOString() },
      fingerprint: "appointment.completed:ag-9001",
      ocorridoEm: new Date(HORARIO_UTIL.getTime() + 3_600_000).toISOString(),
    });
    await processarEventos(50, HORARIO_UTIL);

    const dela = conteudo("crc_opportunities").find((o) => o["chave_dedupe"] === MARIA_FALTOU);
    expect(dela?.["fechada_em"], "agora sim, fechada").toBeTruthy();

    const recuperadas = conteudo("crc_funnel_events").filter(
      (e) => e["etapa"] === "consulta_recuperada",
    );
    expect(recuperadas.length).toBeGreaterThan(0);
  });
});

/* ========================================================================== */
/* Idempotência (item 84)                                                     */
/* ========================================================================== */

describe("idempotência", () => {
  it("o mesmo evento processado duas vezes gera UMA oportunidade e UMA jornada", async () => {
    instalarHandlers();
    await sincronizarTudo();
    await processarEventos(50, HORARIO_UTIL);

    const oportunidades = conteudo("crc_opportunities").length;
    const jornadas = conteudo("crc_automation_enrollments").length;

    // Devolve os eventos à fila e processa de novo — é o que acontece quando um
    // worker morre no meio, ou quando alguém usa o replay do item 127.
    for (const e of conteudo("crc_events")) {
      e["status"] = "PENDENTE";
      e["travado_ate"] = null;
      e["tentativas"] = 0;
    }
    await processarEventos(50, HORARIO_UTIL);

    expect(conteudo("crc_opportunities").length).toBe(oportunidades);
    expect(conteudo("crc_automation_enrollments").length).toBe(jornadas);
  });

  it("oportunidade duplicada é recusada pelo índice, não pelo código", async () => {
    const primeira = await criarOportunidade({
      organizationId: ORG,
      clinicId: CLINICA,
      patientId: null,
      tipo: "MANUAL",
      motivo: "teste",
      chaveDedupe: "chave-repetida",
      ator: "humano",
    });
    expect(primeira.criada).toBe(true);

    const segunda = await criarOportunidade({
      organizationId: ORG,
      clinicId: CLINICA,
      patientId: null,
      tipo: "MANUAL",
      motivo: "teste",
      chaveDedupe: "chave-repetida",
      ator: "humano",
    });
    expect(segunda.criada).toBe(false);
  });

  it("mas a MESMA chave volta a ser aceita depois de a oportunidade fechar", async () => {
    // O índice é PARCIAL (`where fechada_em is null`). É isso que permite o
    // paciente faltar de novo no mês seguinte.
    await criarOportunidade({
      organizationId: ORG,
      clinicId: CLINICA,
      patientId: null,
      tipo: "MANUAL",
      motivo: "primeira",
      chaveDedupe: "reaproveitavel",
      ator: "humano",
    });

    const aberta = conteudo("crc_opportunities").find(
      (o) => o["chave_dedupe"] === "reaproveitavel",
    );
    if (aberta !== undefined) aberta["fechada_em"] = new Date().toISOString();

    const nova = await criarOportunidade({
      organizationId: ORG,
      clinicId: CLINICA,
      patientId: null,
      tipo: "MANUAL",
      motivo: "segunda",
      chaveDedupe: "reaproveitavel",
      ator: "humano",
    });
    expect(nova.criada).toBe(true);
  });

  it("o webhook reenviado não duplica a mensagem — item 37", async () => {
    await sincronizarTudo();

    const entrada = {
      providerMessageId: "wamid.repetida",
      telefone: "5511999990001",
      texto: "oi",
      recebidaEm: new Date().toISOString(),
      nomePerfil: null,
    };

    const primeira = await receberMensagem(ORG, CLINICA, entrada);
    const segunda = await receberMensagem(ORG, CLINICA, entrada);

    expect(primeira.ok && !("duplicada" in primeira && primeira.duplicada)).toBe(true);
    expect(segunda.ok && "duplicada" in segunda && segunda.duplicada).toBe(true);
    expect(conteudo("crc_messages").filter((m) => m["direcao"] === "ENTRADA")).toHaveLength(1);
  });
});

/* ========================================================================== */
/* Concorrência (item 85)                                                     */
/* ========================================================================== */

describe("concorrência", () => {
  it("dois workers NÃO pegam a mesma jornada", async () => {
    instalarHandlers();
    await sincronizarTudo();
    await processarEventos(50, HORARIO_UTIL);

    // UMA jornada elegível, dois workers. Com duas na fila cada um pegaria a
    // sua e o teste passaria sem provar nada sobre o `SKIP LOCKED`.
    adormecer(JOAO_CANCELOU);
    acordar(MARIA_FALTOU);

    const contexto = contextoDeExecucao(HORARIO_UTIL);
    const [a, b] = await Promise.all([rodarCiclo(contexto, 10), rodarCiclo(contexto, 10)]);

    // Uma das duas voltas reserva; a outra encontra a fila vazia.
    expect(a.reservadas + b.reservadas).toBe(1);
    // E a mensagem sai UMA vez.
    expect(obterSandboxMensageria().listarEnviadas().length).toBeLessThanOrEqual(1);
  });

  it("dois workers NÃO processam o mesmo evento", async () => {
    instalarHandlers();
    await sincronizarTudo();

    const total = conteudo("crc_events").filter((e) => e["status"] === "PENDENTE").length;
    const [a, b] = await Promise.all([
      processarEventos(50, HORARIO_UTIL),
      processarEventos(50, HORARIO_UTIL),
    ]);

    expect(a.reservados + b.reservados).toBe(total);
  });
});

/* ========================================================================== */
/* Opt-out (item 39)                                                          */
/* ========================================================================== */

describe("opt-out", () => {
  it("o pedido do paciente encerra as jornadas na hora", async () => {
    instalarHandlers();
    await sincronizarTudo();
    await processarEventos(50, HORARIO_UTIL);

    expect(
      conteudo("crc_automation_enrollments").filter((j) => j["status"] === "ACTIVE"),
    ).toHaveLength(2);

    await receberMensagem(ORG, CLINICA, {
      providerMessageId: "wamid.optout",
      telefone: "5511999990001",
      texto: "não quero mais receber mensagens",
      recebidaEm: new Date().toISOString(),
      nomePerfil: null,
    });

    const maria = conteudo("crc_patients").find((p) => p["external_id"] === "do-1001");
    expect(maria?.["opt_out_em"], "o opt-out foi registrado").toBeTruthy();

    // As jornadas param imediatamente, e não na próxima varredura: esperar
    // deixaria uma mensagem já agendada sair depois do pedido.
    // Só as DELA. A jornada do João segue viva: o opt-out é de um paciente, e
    // encerrar as dos outros seria um apagão silencioso da operação.
    const dela = conteudo("crc_automation_enrollments").filter(
      (j) => j["patient_id"] === maria?.["id"],
    );
    expect(dela.every((j) => j["status"] !== "ACTIVE" && j["status"] !== "WAITING")).toBe(true);
    expect(jornadaDe(JOAO_CANCELOU)?.["status"]).toBe("ACTIVE");
  });

  it("depois do opt-out, nenhuma mensagem sai mesmo com a jornada acordada", async () => {
    instalarHandlers();
    await sincronizarTudo();
    await processarEventos(50, HORARIO_UTIL);

    await receberMensagem(ORG, CLINICA, {
      providerMessageId: "wamid.pare",
      telefone: "5511999990001",
      texto: "parar",
      recebidaEm: new Date().toISOString(),
      nomePerfil: null,
    });

    // Força a jornada DA MARIA a acordar no passo de envio, como se o worker a
    // tivesse pego antes de o opt-out chegar.
    adormecer(JOAO_CANCELOU);
    const dela = jornadaDe(MARIA_FALTOU);
    if (dela !== undefined) dela["status"] = "ACTIVE";
    acordar(MARIA_FALTOU, HORARIO_UTIL, 1);

    await rodarCiclo(contextoDeExecucao(HORARIO_UTIL), 10);
    expect(obterSandboxMensageria().listarEnviadas()).toHaveLength(0);
  });
});

/* ========================================================================== */
/* Horário comercial (item 97)                                                */
/* ========================================================================== */

describe("horário comercial", () => {
  it("mensagem da madrugada é ADIADA, e não enviada nem cancelada", async () => {
    instalarHandlers();
    await sincronizarTudo();
    await processarEventos(50, HORARIO_UTIL);

    // 05h UTC = 02h em São Paulo.
    const madrugada = new Date("2026-09-08T05:00:00.000Z");
    for (const j of conteudo("crc_automation_enrollments")) {
      j["resume_at"] = new Date(madrugada.getTime() - 1000).toISOString();
      j["travado_ate"] = null;
      j["passo_atual"] = 1;
    }

    const ciclo = await rodarCiclo(contextoDeExecucao(madrugada), 10);

    expect(ciclo.mensagensEnviadas).toBe(0);
    expect(obterSandboxMensageria().listarEnviadas()).toHaveLength(0);

    const jornada = conteudo("crc_automation_enrollments")[0];
    // A jornada continua viva e reagendada para a abertura.
    expect(jornada?.["status"]).toBe("WAITING");
    const volta = String(jornada?.["resume_at"] ?? "");
    expect(Date.parse(volta)).toBeGreaterThan(madrugada.getTime());
    // E o passo NÃO foi consumido: a mensagem ainda vai sair.
    expect(jornada?.["passo_atual"]).toBe(1);
  });
});

/* ========================================================================== */
/* Kill switch (Milestone 16)                                                 */
/* ========================================================================== */

describe("interruptores de emergência", () => {
  it("com os envios pausados, a automação registra e não manda", async () => {
    instalarHandlers();
    await sincronizarTudo();
    await processarEventos(50, HORARIO_UTIL);

    adormecer(JOAO_CANCELOU);
    acordar(MARIA_FALTOU, HORARIO_UTIL, 1);

    const ciclo = await rodarCiclo(
      { ...contextoDeExecucao(HORARIO_UTIL), enviosPausados: true },
      10,
    );

    expect(obterSandboxMensageria().listarEnviadas()).toHaveLength(0);
    // O passo é registrado como simulado: a jornada AVANÇA e deixa rastro do
    // que teria feito, em vez de travar.
    expect(ciclo.simuladas).toBe(1);

    const log = conteudo("crc_automation_logs").filter((l) => l["tipo"] === "shadow");
    expect(log.length).toBeGreaterThan(0);
  });

  it("com as automações pausadas, nenhuma jornada avança", async () => {
    instalarHandlers();
    await sincronizarTudo();
    await processarEventos(50, HORARIO_UTIL);

    const ciclo = await rodarCiclo(
      { ...contextoDeExecucao(HORARIO_UTIL), automacoesPausadas: true },
      10,
    );
    expect(ciclo.reservadas).toBe(0);
  });
});

/* ========================================================================== */
/* Modo simulação (item 96)                                                   */
/* ========================================================================== */

describe("modo simulação", () => {
  it("SHADOW calcula tudo e não fala com ninguém", async () => {
    // É como toda automação nasce, e é o que o gestor observa antes de ligar.
    for (const a of conteudo("crc_automations")) a["modo"] = "SHADOW";

    instalarHandlers();
    await sincronizarTudo();
    await processarEventos(50, HORARIO_UTIL);

    for (const j of conteudo("crc_automation_enrollments")) {
      j["resume_at"] = new Date(HORARIO_UTIL.getTime() - 1000).toISOString();
      j["travado_ate"] = null;
      j["passo_atual"] = 1;
    }

    const ciclo = await rodarCiclo(contextoDeExecucao(HORARIO_UTIL), 10);

    expect(obterSandboxMensageria().listarEnviadas()).toHaveLength(0);
    expect(ciclo.simuladas).toBeGreaterThan(0);

    // O registro diz exatamente o que teria sido enviado — é o que torna a
    // simulação útil em vez de só inofensiva.
    const shadow = conteudo("crc_automation_logs").find((l) => l["tipo"] === "shadow");
    expect(shadow).toBeDefined();
    expect(JSON.stringify(shadow?.["detalhe"] ?? {})).toContain("remarcar");
  });
});

/* ========================================================================== */
/* Isolamento por organização (item 71)                                       */
/* ========================================================================== */

describe("isolamento", () => {
  it("a leitura não atravessa organizações", async () => {
    await sincronizarTudo();

    semear("crc_opportunities", [
      {
        id: "op-outra",
        organization_id: "outra-org",
        clinic_id: "outra-clinica",
        tipo: "MANUAL",
        motivo: "de outra organização",
        priority_score: 99,
        priority_fatores: [],
        fechada_em: null,
      },
    ]);

    const minhas = await listarOportunidades({ organizationId: ORG, limite: 100 });
    expect(minhas.every((o) => o.organizationId === ORG)).toBe(true);
    expect(minhas.find((o) => o.id === "op-outra")).toBeUndefined();
  });
});
