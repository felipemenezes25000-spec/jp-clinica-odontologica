/**
 * Agenda Inteligente — a cadeira que vagou, e quem pode ocupá-la.
 *
 * ============================================================================
 *  DUAS FONTES DE BURACO, e a segunda é a que ninguém implementa.
 *
 *  CANCELAMENTO. Uma consulta futura que virou `CANCELLED` ou `MISSED` deixa
 *  uma janela livre com hora marcada. É a fonte óbvia, e é a mais valiosa:
 *  quase sempre sobra tempo de preencher.
 *
 *  VÃO ENTRE CONSULTAS. O dentista atende às 9h e às 14h. As quatro horas do
 *  meio são cadeira parada, e ninguém as chama de "buraco" porque nada foi
 *  cancelado — elas simplesmente nunca foram preenchidas.
 *
 *  A segunda é derivável das próprias consultas, sem precisar da grade horária
 *  configurada de cada dentista. É por isso que ela cabe aqui: o CRC não tem
 *  essa grade, e esperar por ela adiaria indefinidamente metade do valor.
 * ============================================================================
 *
 * O QUE ESTE ARQUIVO NÃO FAZ: não envia mensagem. Ele detecta, pontua e
 * REGISTRA a oferta. Quem fala com o paciente é a automação, e ela passa pelo
 * Centro de Autonomia antes.
 */
import {
  decidirLeva,
  pontuarCandidatos,
  valorDoBuraco,
  VALOR_HORA_PADRAO,
  type Candidato,
  type CandidatoPontuado,
} from "../dominio/encaixe";
import {
  calcularRiscoDeFalta,
  ehDiaDeRisco,
  ehHorarioExtremo,
  VERSAO_DO_RISCO,
  type ContextoDeFalta,
} from "../dominio/no-show";
import {
  agoraIso,
  atualizar,
  inserirIgnorandoDuplicata,
  rpc,
  selecionar,
  type Filtro,
} from "../servidor/banco";
import { descreverErro, registrar } from "../servidor/registro";

/* -------------------------------------------------------------------------- */
/* Detecção                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Vão mínimo para virar buraco.
 *
 * QUARENTA MINUTOS. Abaixo disso não cabe procedimento nenhum com preparo e
 * limpeza da sala — e criar buracos de 20 minutos encheria a tela de janelas
 * que ninguém consegue vender, fazendo a lista inteira perder credibilidade.
 */
export const VAO_MINIMO_MIN = 40;

/**
 * Até quando adiante procurar buraco.
 *
 * CATORZE DIAS. Além disso a agenda ainda vai mudar muito: consultas serão
 * marcadas nos vãos naturalmente, e um buraco detectado hoje para dali a um mês
 * seria preenchido pelo fluxo normal antes de qualquer oferta fazer sentido.
 */
export const HORIZONTE_DIAS = 14;

export type ResultadoDaDeteccao = {
  cancelamentos: number;
  vaos: number;
  criados: number;
};

type LinhaDeConsulta = {
  id: string;
  clinic_id: string;
  patient_id: string | null;
  dentista_externo_id: string | null;
  inicio_em: string;
  fim_em: string | null;
  status: string;
};

/**
 * Encontra os buracos e os registra.
 *
 * IDEMPOTENTE POR `chave_dedupe`. A varredura roda várias vezes por dia sobre a
 * mesma agenda; sem a chave, a terça das 14h teria um buraco por execução — e o
 * contador de `oferecidos` se dividiria entre eles, desarmando a proteção
 * contra broadcast exatamente como se ela não existisse.
 */
export async function detectarBuracos(
  organizationId: string,
  agora: Date = new Date(),
): Promise<ResultadoDaDeteccao> {
  const ate = new Date(agora.getTime() + HORIZONTE_DIAS * 86_400_000);

  const consultas = await selecionar<LinhaDeConsulta>("crc_appointments", {
    colunas: "id,clinic_id,patient_id,dentista_externo_id,inicio_em,fim_em,status",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "inicio_em", op: "gte", valor: agora.toISOString() },
      { coluna: "inicio_em", op: "lte", valor: ate.toISOString() },
    ],
    ordenar: [{ coluna: "inicio_em", ascendente: true }],
    // Catorze dias de agenda de uma clínica não passam disso. O teto existe
    // para o caso patológico não virar uma leitura da tabela inteira.
    limite: 3000,
  });

  const dentistas = await mapaDeDentistas(organizationId);

  let cancelamentos = 0;
  let vaos = 0;
  let criados = 0;

  /* --------------------------------------------------- 1. Cancelamentos --- */

  for (const c of consultas) {
    if (c.status !== "CANCELLED" && c.status !== "MISSED") continue;

    cancelamentos += 1;
    const fim = c.fim_em ?? new Date(Date.parse(c.inicio_em) + 60 * 60_000).toISOString();
    const duracao = Math.round((Date.parse(fim) - Date.parse(c.inicio_em)) / 60_000);
    if (duracao < VAO_MINIMO_MIN) continue;

    const dentistId =
      c.dentista_externo_id === null ? null : (dentistas.get(c.dentista_externo_id) ?? null);

    const entrou = await registrarBuraco({
      organizationId,
      clinicId: c.clinic_id,
      dentistId,
      appointmentId: c.id,
      inicioEm: c.inicio_em,
      fimEm: fim,
      duracao,
      // A chave inclui a CONSULTA: se a mesma janela for cancelada de novo
      // depois de remarcada, é outro fato e merece outro buraco.
      chaveDedupe: `cancelamento:${c.id}`,
    });
    if (entrou) criados += 1;
  }

  /* ---------------------------------------------------- 2. Vãos do dia --- */

  /*
   * Agrupado por DENTISTA e DIA. Sem o dentista, dois profissionais atendendo
   * em paralelo pareceriam uma agenda só, e o vão entre a consulta de um e a do
   * outro viraria um buraco que não existe.
   */
  const porDentistaEDia = new Map<string, LinhaDeConsulta[]>();

  for (const c of consultas) {
    if (c.status === "CANCELLED" || c.status === "MISSED") continue;
    if (c.dentista_externo_id === null) continue;

    const dia = c.inicio_em.slice(0, 10);
    const chave = `${c.dentista_externo_id}|${dia}|${c.clinic_id}`;
    const lista = porDentistaEDia.get(chave) ?? [];
    lista.push(c);
    porDentistaEDia.set(chave, lista);
  }

  for (const [chave, lista] of porDentistaEDia) {
    if (lista.length < 2) continue;

    lista.sort((a, b) => Date.parse(a.inicio_em) - Date.parse(b.inicio_em));

    for (let i = 0; i < lista.length - 1; i += 1) {
      const atual = lista[i];
      const proxima = lista[i + 1];
      if (atual === undefined || proxima === undefined) continue;

      const fimDaAtual =
        atual.fim_em ?? new Date(Date.parse(atual.inicio_em) + 60 * 60_000).toISOString();
      const vaoMin = Math.round((Date.parse(proxima.inicio_em) - Date.parse(fimDaAtual)) / 60_000);

      if (vaoMin < VAO_MINIMO_MIN) continue;

      /*
       * VÃO GRANDE DEMAIS NÃO É BURACO: é o almoço, ou o turno que não existe.
       * Quatro horas entre a consulta das 9h e a das 14h é a tarde começando,
       * não uma janela vaga. Tratá-la como buraco geraria convite para as 11h
       * num consultório que abre à uma.
       */
      if (vaoMin > 180) continue;

      vaos += 1;

      const dentistaExterno = chave.split("|")[0] ?? "";
      const entrou = await registrarBuraco({
        organizationId,
        clinicId: atual.clinic_id,
        dentistId: dentistas.get(dentistaExterno) ?? null,
        appointmentId: null,
        inicioEm: fimDaAtual,
        fimEm: proxima.inicio_em,
        duracao: vaoMin,
        // A chave é a JANELA, e não as consultas em volta: se a consulta
        // anterior for remarcada e o vão mudar de tamanho, é outro buraco.
        chaveDedupe: `vao:${dentistaExterno}:${fimDaAtual}`,
      });
      if (entrou) criados += 1;
    }
  }

  return { cancelamentos, vaos, criados };
}

async function mapaDeDentistas(organizationId: string): Promise<Map<string, string>> {
  const linhas = await selecionar<{ id: string; external_id: string }>("crc_dentists", {
    colunas: "id,external_id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "ativo", op: "eq", valor: true },
    ],
    limite: 500,
  });
  return new Map(linhas.map((d) => [d.external_id, d.id]));
}

async function registrarBuraco(b: {
  organizationId: string;
  clinicId: string;
  dentistId: string | null;
  appointmentId: string | null;
  inicioEm: string;
  fimEm: string;
  duracao: number;
  chaveDedupe: string;
}): Promise<boolean> {
  const linha = await inserirIgnorandoDuplicata("crc_schedule_gaps", {
    organization_id: b.organizationId,
    clinic_id: b.clinicId,
    dentist_id: b.dentistId,
    appointment_id: b.appointmentId,
    inicio_em: b.inicioEm,
    fim_em: b.fimEm,
    duracao_min: b.duracao,
    procedimentos: [],
    valor_estimado: valorDoBuraco(b.duracao, VALOR_HORA_PADRAO),
    status: "ABERTO",
    oferecidos: 0,
    chave_dedupe: b.chaveDedupe,
  });

  return linha !== null;
}

/* -------------------------------------------------------------------------- */
/* O trabalho do buraco                                                       */
/* -------------------------------------------------------------------------- */

export type ResultadoDoBuraco = {
  gapId: string;
  /** `true` quando saiu uma leva de convites. */
  ofertou: boolean;
  convidados: number;
  motivo: string;
};

type LinhaDeBuraco = {
  id: string;
  clinic_id: string;
  inicio_em: string;
  duracao_min: number;
  status: string;
  oferecidos: number;
  ofertado_em: string | null;
};

type LinhaDeCandidato = {
  patient_id: string;
  nome: string;
  telefone: string | null;
  tem_waitlist: boolean;
  aceita_encaixe: boolean;
  dia_bate: boolean;
  hora_bate: boolean;
  dentista_bate: boolean;
  ultima_consulta: string | null;
  consultas_feitas: number | string;
};

/**
 * Trabalha os buracos abertos: decide a leva, escolhe quem, registra a oferta.
 *
 * ============================================================================
 *  A OFERTA É REGISTRADA ANTES DE QUALQUER MENSAGEM SAIR, e a ordem é a
 *  proteção inteira contra o broadcast.
 *
 *  Se a mensagem saísse primeiro e a linha depois, uma falha no meio deixaria
 *  três pessoas convidadas e nenhum registro — e a próxima execução, vendo
 *  `oferecidos = 0`, convidaria outras três. Em seis execuções, dezoito
 *  pessoas convidadas para uma vaga.
 *
 *  Com o registro primeiro, o pior caso é o oposto: alguém registrado e não
 *  convidado. Isso custa uma vaga desperdiçada no lote, e não a lista inteira.
 * ============================================================================
 */
export async function trabalharBuracos(
  organizationId: string,
  opcoes: { cooldownHoras: number; limite?: number },
  agora: Date = new Date(),
): Promise<ResultadoDoBuraco[]> {
  const buracos = await selecionar<LinhaDeBuraco>("crc_schedule_gaps", {
    colunas: "id,clinic_id,inicio_em,duracao_min,status,oferecidos,ofertado_em",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "status", op: "in", valor: ["ABERTO", "OFERECENDO"] },
      { coluna: "inicio_em", op: "gt", valor: agora.toISOString() },
    ],
    // Os mais próximos primeiro: são os que têm menos tempo de sobra.
    ordenar: [{ coluna: "inicio_em", ascendente: true }],
    limite: Math.min(opcoes.limite ?? 20, 50),
  });

  const resultados: ResultadoDoBuraco[] = [];

  for (const b of buracos) {
    try {
      resultados.push(await trabalharUm(organizationId, b, opcoes.cooldownHoras, agora));
    } catch (erro) {
      /*
       * UM BURACO QUE FALHA NÃO DERRUBA OS OUTROS. A varredura roda sobre
       * vários, e um erro de dados num deles — um `inicio_em` corrompido, um
       * paciente apagado no meio — não pode custar a agenda do dia inteiro.
       */
      registrar("erro", "Falha ao trabalhar buraco de agenda.", {
        organizationId,
        gapId: b.id,
        detalhe: descreverErro(erro),
      });
      resultados.push({ gapId: b.id, ofertou: false, convidados: 0, motivo: "Falhou." });
    }
  }

  return resultados;
}

async function trabalharUm(
  organizationId: string,
  b: LinhaDeBuraco,
  cooldownHoras: number,
  agora: Date,
): Promise<ResultadoDoBuraco> {
  const horasAte = (Date.parse(b.inicio_em) - agora.getTime()) / 3_600_000;

  /*
   * A DECISÃO VEM ANTES DA BUSCA, de propósito.
   *
   * Buscar candidatos custa uma RPC com quatro junções sobre a base de
   * pacientes. Decidir primeiro evita esse custo em todos os casos em que a
   * resposta já é "não" — que são a maioria: o buraco cuja leva saiu há vinte
   * minutos, o que já estourou o teto, o que é daqui a meia hora.
   */
  const previa = decidirLeva(
    { oferecidos: b.oferecidos, ofertadoEm: b.ofertado_em, horasAteOHorario: horasAte },
    // Otimista aqui: só quer saber se as travas de tempo e teto deixam passar.
    Number.MAX_SAFE_INTEGER,
    agora,
  );

  if (!previa.chamar) {
    if (horasAte <= 0) await fecharBuraco(organizationId, b.id, "EXPIRADO", agora);
    return { gapId: b.id, ofertou: false, convidados: 0, motivo: previa.motivo };
  }

  const brutos = await rpc<LinhaDeCandidato>("crc_candidatos_para_buraco", {
    p_organization_id: organizationId,
    p_gap_id: b.id,
    p_limite: 20,
  });

  const candidatos: Candidato[] = brutos
    .filter((c) => typeof c.telefone === "string" && c.telefone.length > 0)
    .map((c) => ({
      patientId: c.patient_id,
      nome: c.nome,
      temWaitlist: c.tem_waitlist,
      aceitaEncaixe: c.aceita_encaixe,
      diaBate: c.dia_bate,
      horaBate: c.hora_bate,
      dentistaBate: c.dentista_bate,
      diasDesdeUltimaConsulta:
        c.ultima_consulta === null
          ? null
          : Math.floor((agora.getTime() - Date.parse(c.ultima_consulta)) / 86_400_000),
      consultasConcluidas: Number(c.consultas_feitas) || 0,
      // O cooldown por paciente exigiria uma leitura a mais por candidato. A
      // RPC ainda não o traz; até lá, o que protege é o teto diário global e a
      // regra de uma oferta por pessoa por buraco.
      horasDesdeUltimoContato: null,
    }));

  const pontuados = pontuarCandidatos(candidatos, {
    horasAteOHorario: horasAte,
    cooldownHoras,
  });

  const elegiveis = pontuados.filter((p) => p.bloqueio === null);

  const decisao = decidirLeva(
    { oferecidos: b.oferecidos, ofertadoEm: b.ofertado_em, horasAteOHorario: horasAte },
    elegiveis.length,
    agora,
  );

  if (!decisao.chamar) {
    return { gapId: b.id, ofertou: false, convidados: 0, motivo: decisao.motivo };
  }

  const leva = elegiveis.slice(0, decisao.quantos);
  const convidados = await registrarOfertas(organizationId, b.id, leva);

  await atualizar(
    "crc_schedule_gaps",
    [
      { coluna: "id", op: "eq", valor: b.id },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    {
      status: "OFERECENDO",
      oferecidos: b.oferecidos + convidados,
      ofertado_em: agora.toISOString(),
      atualizado_em: agora.toISOString(),
    },
  );

  return { gapId: b.id, ofertou: convidados > 0, convidados, motivo: decisao.motivo };
}

/**
 * Registra as ofertas. Devolve quantas ENTRARAM de fato.
 *
 * O índice único `(gap_id, patient_id)` faz a duplicata virar `null` em vez de
 * exceção — e o contador precisa refletir o que entrou, não o que foi tentado.
 * Somar o tamanho do lote inflaria `oferecidos` e faria o teto de levas
 * disparar cedo demais.
 */
async function registrarOfertas(
  organizationId: string,
  gapId: string,
  leva: readonly CandidatoPontuado[],
): Promise<number> {
  let entraram = 0;

  for (const c of leva) {
    const linha = await inserirIgnorandoDuplicata("crc_gap_offers", {
      organization_id: organizationId,
      gap_id: gapId,
      patient_id: c.patientId,
      status: "ENVIADA",
      escore: c.escore,
      fatores: c.fatores,
      enviada_em: agoraIso(),
    });
    if (linha !== null) entraram += 1;
  }

  return entraram;
}

async function fecharBuraco(
  organizationId: string,
  gapId: string,
  status: string,
  agora: Date,
): Promise<void> {
  await atualizar(
    "crc_schedule_gaps",
    [
      { coluna: "id", op: "eq", valor: gapId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    {
      status,
      atualizado_em: agora.toISOString(),
    },
  );
}

/**
 * Alguém aceitou: fecha o buraco e CANCELA as outras ofertas.
 *
 * ============================================================================
 *  O "STOP OTHERS" DO §15, e ele é a metade do desenho que evita o pior caso.
 *
 *  Sem ele, a segunda pessoa que responder "pode ser!" recebe um sim, e duas
 *  pessoas aparecem para a mesma cadeira. Com ele, a segunda recebe "esse
 *  horário acabou de ser preenchido, me avisa que eu te chamo no próximo" — que
 *  é uma frase que preserva a relação.
 * ============================================================================
 */
export async function aceitarEncaixe(
  organizationId: string,
  gapId: string,
  patientId: string,
  appointmentId: string | null,
  agora: Date = new Date(),
): Promise<void> {
  const iso = agora.toISOString();

  await atualizar(
    "crc_gap_offers",
    [
      { coluna: "gap_id", op: "eq", valor: gapId },
      { coluna: "patient_id", op: "eq", valor: patientId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { status: "ACEITOU", respondida_em: iso },
  );

  // As demais ofertas ABERTAS deste buraco morrem. `neq` no paciente para não
  // desfazer a que acabou de ser aceita.
  await atualizar(
    "crc_gap_offers",
    [
      { coluna: "gap_id", op: "eq", valor: gapId },
      { coluna: "patient_id", op: "neq", valor: patientId },
      { coluna: "status", op: "eq", valor: "ENVIADA" },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { status: "CANCELADA", respondida_em: iso },
  );

  await atualizar(
    "crc_schedule_gaps",
    [
      { coluna: "id", op: "eq", valor: gapId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    {
      status: "PREENCHIDO",
      preenchido_em: iso,
      preenchido_por: appointmentId,
      atualizado_em: iso,
    },
  );
}

/* -------------------------------------------------------------------------- */
/* Risco de falta                                                             */
/* -------------------------------------------------------------------------- */

export type ResultadoDoRisco = { avaliadas: number; altos: number };

/**
 * Calcula o risco das consultas futuras.
 *
 * ============================================================================
 *  OS SINAIS SÃO LIDOS EM LOTE, e não por consulta.
 *
 *  O risco depende do histórico do paciente: quantas concluiu, quantas faltou,
 *  se faltou na última. Ler isso por consulta seria três consultas por linha —
 *  600 idas ao banco numa agenda de 200.
 *
 *  Aqui: uma leitura das consultas futuras, uma do histórico de TODOS os
 *  pacientes envolvidos, e o cruzamento em memória.
 * ============================================================================
 */
export async function calcularRiscos(
  organizationId: string,
  agora: Date = new Date(),
  limite = 500,
): Promise<ResultadoDoRisco> {
  const futuras = await selecionar<{
    id: string;
    patient_id: string | null;
    inicio_em: string;
    status: string;
    criado_em: string;
    risco_calculado_em: string | null;
  }>("crc_appointments", {
    colunas: "id,patient_id,inicio_em,status,criado_em,risco_calculado_em",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "inicio_em", op: "gt", valor: agora.toISOString() },
      { coluna: "status", op: "in", valor: ["TO_CONFIRM", "CONFIRMED"] },
    ],
    ordenar: [{ coluna: "inicio_em", ascendente: true }],
    limite,
  });

  const ids = [...new Set(futuras.map((f) => f.patient_id).filter((p): p is string => p !== null))];
  if (ids.length === 0) return { avaliadas: 0, altos: 0 };

  const historico = await lerHistorico(organizationId, ids);

  let avaliadas = 0;
  let altos = 0;

  for (const f of futuras) {
    if (f.patient_id === null) continue;
    const h = historico.get(f.patient_id) ?? { concluidas: 0, faltas: 0, faltouNaUltima: false };

    const inicio = new Date(f.inicio_em);
    // A hora e o dia LOCAIS. `America/Sao_Paulo` está explícito em vez de
    // implícito — o servidor roda em UTC, e usar a hora do processo faria
    // "horário extremo" apontar para as 6h da manhã.
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      weekday: "short",
      hour12: false,
    }).formatToParts(inicio);

    const horaLocal = Number.parseInt(partes.find((p) => p.type === "hour")?.value ?? "12", 10);
    const diaSemana = DIAS.indexOf(partes.find((p) => p.type === "weekday")?.value ?? "");

    const ctx: ContextoDeFalta = {
      consultasConcluidas: h.concluidas,
      faltas: h.faltas,
      faltouNaUltima: h.faltouNaUltima,
      // Remarcação ainda não é rastreada no CRC — a sincronização traz o estado
      // final, não o caminho. Zero aqui é honesto: o fator simplesmente não
      // participa até existir o dado.
      remarcacoes: 0,
      horasDeAntecedencia: (Date.parse(f.inicio_em) - Date.parse(f.criado_em)) / 3_600_000,
      confirmada: f.status === "CONFIRMED",
      horasAteAConsulta: (Date.parse(f.inicio_em) - agora.getTime()) / 3_600_000,
      primeiraVez: h.concluidas === 0 && h.faltas === 0,
      // Idem: exigiria ler mensagens por paciente. `true` é o padrão que NÃO
      // agrava — um sinal ausente não pode aumentar o risco de ninguém.
      respondeMensagens: true,
      horarioExtremo: ehHorarioExtremo(horaLocal),
      diaDeRisco: diaSemana >= 0 && ehDiaDeRisco(diaSemana, horaLocal),
    };

    const r = calcularRiscoDeFalta(ctx, agora);

    await atualizar(
      "crc_appointments",
      [
        { coluna: "id", op: "eq", valor: f.id },
        { coluna: "organization_id", op: "eq", valor: organizationId },
      ],
      {
        risco_falta: r.nivel,
        risco_fatores: r.fatores,
        risco_calculado_em: agora.toISOString(),
      },
    );

    avaliadas += 1;
    if (r.nivel === "ALTO") altos += 1;
  }

  registrar("info", "Risco de falta recalculado.", {
    organizationId,
    avaliadas,
    altos,
    versao: VERSAO_DO_RISCO,
  });

  return { avaliadas, altos };
}

const DIAS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Historico = { concluidas: number; faltas: number; faltouNaUltima: boolean };

async function lerHistorico(
  organizationId: string,
  patientIds: readonly string[],
): Promise<Map<string, Historico>> {
  const mapa = new Map<string, Historico>();

  const linhas = await selecionar<{ patient_id: string; status: string; inicio_em: string }>(
    "crc_appointments",
    {
      colunas: "patient_id,status,inicio_em",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "patient_id", op: "in", valor: [...patientIds] },
        { coluna: "status", op: "in", valor: ["COMPLETED", "MISSED"] },
      ],
      ordenar: [{ coluna: "inicio_em", ascendente: false }],
      limite: patientIds.length * 40,
    },
  );

  // Como vem ordenado do mais recente, a PRIMEIRA linha de cada paciente é a
  // última consulta dele — e é ela que decide `faltouNaUltima`.
  const jaViu = new Set<string>();

  for (const l of linhas) {
    const h = mapa.get(l.patient_id) ?? { concluidas: 0, faltas: 0, faltouNaUltima: false };

    if (!jaViu.has(l.patient_id)) {
      h.faltouNaUltima = l.status === "MISSED";
      jaViu.add(l.patient_id);
    }

    if (l.status === "COMPLETED") h.concluidas += 1;
    else h.faltas += 1;

    mapa.set(l.patient_id, h);
  }

  return mapa;
}

/* -------------------------------------------------------------------------- */
/* Lista de espera                                                            */
/* -------------------------------------------------------------------------- */

export type PreferenciaDeEspera = {
  patientId: string;
  clinicId: string | null;
  dias: number[];
  horaInicio: string | null;
  horaFim: string | null;
  dentistId: string | null;
  procedimento: string | null;
  aceitaEncaixe: boolean;
  antecedenciaH: number;
  outraUnidade: boolean;
  ativo: boolean;
  observacao: string | null;
};

export async function salvarPreferencia(
  organizationId: string,
  p: PreferenciaDeEspera,
): Promise<void> {
  const { gravar } = await import("../servidor/banco");

  /*
   * TODAS AS COLUNAS, SEMPRE. `gravar` é upsert de linha inteira no PostgREST:
   * coluna omitida volta ao DEFAULT. Omitir `aceita_encaixe` ao editar só o
   * horário religaria o encaixe de última hora para quem tinha pedido para não
   * receber — em silêncio. É a mesma armadilha do achado B-7.
   */
  await gravar(
    "crc_waitlist_preferences",
    {
      organization_id: organizationId,
      clinic_id: p.clinicId,
      patient_id: p.patientId,
      dias: p.dias,
      hora_inicio: p.horaInicio,
      hora_fim: p.horaFim,
      dentist_id: p.dentistId,
      procedimento: p.procedimento,
      aceita_encaixe: p.aceitaEncaixe,
      antecedencia_h: p.antecedenciaH,
      outra_unidade: p.outraUnidade,
      ativo: p.ativo,
      observacao: p.observacao,
      atualizado_em: agoraIso(),
    },
    "organization_id,patient_id",
  );
}

export async function lerPreferencia(
  organizationId: string,
  patientId: string,
): Promise<PreferenciaDeEspera | null> {
  const { selecionarUm } = await import("../servidor/banco");

  const l = await selecionarUm("crc_waitlist_preferences", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "patient_id", op: "eq", valor: patientId },
    ],
  });
  if (l === null) return null;

  return {
    patientId,
    clinicId: typeof l["clinic_id"] === "string" ? l["clinic_id"] : null,
    dias: Array.isArray(l["dias"]) ? (l["dias"] as number[]) : [],
    horaInicio: typeof l["hora_inicio"] === "string" ? l["hora_inicio"] : null,
    horaFim: typeof l["hora_fim"] === "string" ? l["hora_fim"] : null,
    dentistId: typeof l["dentist_id"] === "string" ? l["dentist_id"] : null,
    procedimento: typeof l["procedimento"] === "string" ? l["procedimento"] : null,
    aceitaEncaixe: l["aceita_encaixe"] !== false,
    antecedenciaH: typeof l["antecedencia_h"] === "number" ? l["antecedencia_h"] : 0,
    outraUnidade: l["outra_unidade"] === true,
    ativo: l["ativo"] !== false,
    observacao: typeof l["observacao"] === "string" ? l["observacao"] : null,
  };
}

/* -------------------------------------------------------------------------- */
/* A tela                                                                     */
/* -------------------------------------------------------------------------- */

export type BuracoNaTela = {
  id: string;
  inicioEm: string;
  duracaoMin: number;
  status: string;
  valorEstimado: number;
  oferecidos: number;
  dentista: string | null;
};

export async function listarBuracos(
  organizationId: string,
  clinicIds: readonly string[] | null,
  agora: Date = new Date(),
): Promise<BuracoNaTela[]> {
  if (clinicIds !== null && clinicIds.length === 0) return [];

  const filtros: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "status", op: "in", valor: ["ABERTO", "OFERECENDO"] },
    { coluna: "inicio_em", op: "gt", valor: agora.toISOString() },
  ];
  if (clinicIds !== null) filtros.push({ coluna: "clinic_id", op: "in", valor: [...clinicIds] });

  const linhas = await selecionar("crc_schedule_gaps", {
    colunas: "id,inicio_em,duracao_min,status,valor_estimado,oferecidos,dentist_id",
    filtros,
    ordenar: [{ coluna: "inicio_em", ascendente: true }],
    limite: 60,
  });

  const nomes = await nomesDeDentistas(
    organizationId,
    linhas.map((l) => l["dentist_id"]).filter((d): d is string => typeof d === "string"),
  );

  return linhas.map((l) => ({
    id: String(l["id"] ?? ""),
    inicioEm: String(l["inicio_em"] ?? ""),
    duracaoMin: Number(l["duracao_min"] ?? 0),
    status: String(l["status"] ?? "ABERTO"),
    valorEstimado: Number(l["valor_estimado"] ?? 0),
    oferecidos: Number(l["oferecidos"] ?? 0),
    dentista: typeof l["dentist_id"] === "string" ? (nomes.get(l["dentist_id"]) ?? null) : null,
  }));
}

async function nomesDeDentistas(
  organizationId: string,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const linhas = await selecionar<{ id: string; nome: string }>("crc_dentists", {
    colunas: "id,nome",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "id", op: "in", valor: [...new Set(ids)] },
    ],
    limite: 200,
  });
  return new Map(linhas.map((d) => [d.id, d.nome]));
}
