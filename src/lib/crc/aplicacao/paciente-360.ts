/**
 * Patient 360 preditivo — a montagem.
 *
 * ============================================================================
 *  ESTE ARQUIVO É QUASE TODO REÚSO, e isso é o ponto.
 *
 *  Cada número aqui vem do módulo que já o produz: o risco de falta da agenda
 *  inteligente, a linha do tempo do omnichannel, o funil de aceitação, a
 *  próxima melhor ação do decisor da FASE A. Recalcular qualquer um deles
 *  criaria uma SEGUNDA versão do mesmo número — e no dia em que as duas
 *  divergissem, a ficha do paciente e a tela de origem discordariam sobre o
 *  mesmo paciente, na frente de quem está com ele na linha.
 *
 *  O que este arquivo calcula de novo são três coisas, e só três: LTV, risco
 *  de abandono e household.
 * ============================================================================
 */
import {
  calcularRiscoDeAbandono,
  faixaDeValor,
  inferirHousehold,
  type Familiar,
  type FaixaDeValor,
  type RiscoDeAbandono,
} from "../dominio/paciente-360";
import { contar, selecionar, type Filtro } from "../servidor/banco";

export type Ficha360 = {
  patientId: string;
  nome: string;

  /* --- o que este módulo acrescenta ------------------------------------- */
  ltv: number;
  faixaDeValor: FaixaDeValor;
  riscoDeAbandono: RiscoDeAbandono;
  household: Familiar[];

  /* --- o que vem de outros módulos -------------------------------------- */
  /** Da agenda inteligente (FASE B). */
  riscoDeFalta: string | null;
  /** Do Radar (FASE A): soma do valor esperado das oportunidades abertas. */
  valorPotencial: number;
  oportunidadesAbertas: number;
  /** Do funil de aceitação (FASE C). */
  tratamentosPendentes: number;
  valorEmTratamento: number;
  objecaoAtual: string | null;
  /** Das preferências de lista de espera (FASE B). */
  canaisPreferidos: string[];
  horariosPreferidos: string[];
  /** Da atividade da IA (FASE A). */
  acoesDoCrc: number;
  /** Da atribuição (FASE A). */
  receitaAtribuida: number;
  ultimaConsultaEm: string | null;
  optOut: boolean;
};

function escopo(organizationId: string, clinicIds: readonly string[] | null): Filtro[] {
  const f: Filtro[] = [{ coluna: "organization_id", op: "eq", valor: organizationId }];
  if (clinicIds !== null) f.push({ coluna: "clinic_id", op: "in", valor: [...clinicIds] });
  return f;
}

/**
 * A mediana de valor da clínica — a régua do LTV.
 *
 * ============================================================================
 *  MEDIANA, E NÃO MÉDIA.
 *
 *  Uma única reabilitação de R$ 60.000 puxa a média para cima e faria metade
 *  da base virar "valor baixo" da noite para o dia, sem nada ter mudado sobre
 *  esses pacientes.
 *
 *  A amostra é limitada a 2.000 pacientes: a mediana de uma amostra grande o
 *  bastante já é estável, e ler a base inteira a cada abertura de ficha
 *  transformaria uma consulta de recepção numa varredura.
 * ============================================================================
 */
async function medianaDaClinica(
  organizationId: string,
  clinicIds: readonly string[] | null,
): Promise<number> {
  const eventos = await selecionar<{ patient_id: string | null; valor: string | number }>(
    "crc_revenue_events",
    {
      colunas: "patient_id,valor",
      filtros: [
        ...escopo(organizationId, clinicIds),
        { coluna: "natureza", op: "eq", valor: "PRODUCAO" },
      ],
      limite: 2000,
    },
  );

  const porPaciente = new Map<string, number>();
  for (const e of eventos) {
    if (e.patient_id === null) continue;
    porPaciente.set(e.patient_id, (porPaciente.get(e.patient_id) ?? 0) + (Number(e.valor) || 0));
  }

  const valores = [...porPaciente.values()].sort((a, b) => a - b);
  if (valores.length === 0) return 0;

  const meio = Math.floor(valores.length / 2);
  return valores.length % 2 === 0
    ? ((valores[meio - 1] ?? 0) + (valores[meio] ?? 0)) / 2
    : (valores[meio] ?? 0);
}

/* -------------------------------------------------------------------------- */

export async function montarFicha(
  organizationId: string,
  clinicIds: readonly string[] | null,
  patientId: string,
  recallDias: number,
  agora: Date = new Date(),
): Promise<Ficha360 | null> {
  if (clinicIds !== null && clinicIds.length === 0) return null;

  const base = escopo(organizationId, clinicIds);

  const pacientes = await selecionar<{
    id: string;
    nome: string;
    opt_out_em: string | null;
    ultima_consulta_em: string | null;
  }>("crc_patients", {
    colunas: "id,nome,opt_out_em,ultima_consulta_em",
    filtros: [...base, { coluna: "id", op: "eq", valor: patientId }],
    limite: 1,
  });

  const p = pacientes[0];
  if (p === undefined) return null;

  const doPaciente: Filtro[] = [...base, { coluna: "patient_id", op: "eq", valor: patientId }];

  const [producao, oportunidades, orcamentos, consultas, identidades, acoesDoCrc, mediana] =
    await Promise.all([
      // LTV: só PRODUCAO. Potencial não é dinheiro que entrou (item 63).
      selecionar<{ valor: string | number; recuperada: boolean | null }>("crc_revenue_events", {
        colunas: "valor,recuperada",
        filtros: [...doPaciente, { coluna: "natureza", op: "eq", valor: "PRODUCAO" }],
        limite: 500,
      }),
      selecionar<{ potential_value: string | number | null; probability: string | number | null }>(
        "crc_opportunities",
        {
          colunas: "potential_value,probability",
          filtros: [...doPaciente, { coluna: "fechada_em", op: "is", valor: null }],
          limite: 100,
        },
      ),
      selecionar<{
        total_value: string | number | null;
        objecao_atual: string | null;
        aceito_em: string | null;
        perdido_em: string | null;
      }>("crc_budgets", {
        colunas: "total_value,objecao_atual,aceito_em,perdido_em",
        filtros: [...doPaciente],
        ordenar: [{ coluna: "atualizado_em", ascendente: false }],
        limite: 50,
      }),
      selecionar<{ inicio_em: string; status: string; risco_falta: string | null }>(
        "crc_appointments",
        {
          colunas: "inicio_em,status,risco_falta",
          filtros: [...doPaciente],
          ordenar: [{ coluna: "inicio_em", ascendente: false }],
          limite: 50,
        },
      ),
      /*
       * AS IDENTIDADES DA ORGANIZAÇÃO INTEIRA, e não só as deste paciente.
       *
       * Household é comparação: para saber quem divide o telefone com ele, é
       * preciso ver os telefones dos outros. Filtrar por `patient_id` aqui
       * devolveria só as dele e a inferência nunca encontraria ninguém.
       */
      selecionar<{
        patient_id: string;
        tipo: string;
        valor: string;
        compartilhada: boolean | null;
        confirmada_em: string | null;
      }>("crc_patient_identities", {
        colunas: "patient_id,tipo,valor,compartilhada,confirmada_em",
        filtros: [
          { coluna: "organization_id", op: "eq", valor: organizationId },
          { coluna: "compartilhada", op: "eq", valor: true },
        ],
        limite: 1000,
      }),
      contar("crc_ai_activity", doPaciente),
      medianaDaClinica(organizationId, clinicIds),
    ]);

  const ltv = producao.reduce((s, e) => s + (Number(e.valor) || 0), 0);
  const receitaAtribuida = producao
    .filter((e) => e.recuperada === true)
    .reduce((s, e) => s + (Number(e.valor) || 0), 0);

  const valorPotencial = oportunidades.reduce(
    (s, o) => s + Number(o.potential_value ?? 0) * Number(o.probability ?? 1),
    0,
  );

  const abertos = orcamentos.filter((o) => o.aceito_em === null && o.perdido_em === null);
  const objecaoAtual = abertos.find((o) => o.objecao_atual !== null)?.objecao_atual ?? null;

  const futuras = consultas.filter(
    (c) => Date.parse(c.inicio_em) > agora.getTime() && c.status !== "CANCELLED",
  );
  const realizadas = consultas.filter((c) => c.status === "COMPLETED");
  const ultima = realizadas[0]?.inicio_em ?? p.ultima_consulta_em ?? null;

  /*
   * "FALTOU SEM REMARCAR" É A ÚLTIMA CONSULTA TER SIDO FALTA **E** não haver
   * nenhuma marcada depois.
   *
   * Quem faltou em março e voltou em abril não abandonou nada — o histórico de
   * faltas é problema da agenda, e o módulo de no-show já cuida dele.
   */
  const maisRecente = consultas[0];
  const faltouSemRemarcar = maisRecente?.status === "MISSED" && futuras.length === 0;

  // Contatos sem resposta: os que saíram depois da última mensagem de entrada.
  const entradas = await selecionar<{ criado_em: string }>("crc_messages", {
    colunas: "criado_em",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "patient_id", op: "eq", valor: patientId },
      { coluna: "direcao", op: "eq", valor: "ENTRADA" },
    ],
    ordenar: [{ coluna: "criado_em", ascendente: false }],
    limite: 1,
  });
  const desde = entradas[0]?.criado_em ?? "1970-01-01T00:00:00.000Z";
  const contatosSemResposta = await contar("crc_contact_log", [
    ...doPaciente,
    { coluna: "ocorrido_em", op: "gt", valor: desde },
  ]);

  /*
   * ============================================================================
   *  HORÁRIO PREFERIDO É O QUE A PESSOA DECLAROU; CANAL PREFERIDO É O QUE ELA
   *  USA. São origens diferentes de propósito.
   *
   *  A lista de espera guarda `dias`, `hora_inicio` e `hora_fim` — uma
   *  declaração explícita ("posso de manhã"), e não há como inferir isso de
   *  comportamento.
   *
   *  Canal não tem campo declarado, e inventar um seria pedir à recepção que
   *  preenchesse mais um formulário. O canal por onde a pessoa efetivamente
   *  escreve é um fato melhor do que a declaração seria: quem diz preferir
   *  e-mail e responde tudo por WhatsApp prefere WhatsApp.
   * ============================================================================
   */
  const [preferencias, conversas] = await Promise.all([
    selecionar<{ dias: unknown; hora_inicio: string | null; hora_fim: string | null }>(
      "crc_waitlist_preferences",
      {
        colunas: "dias,hora_inicio,hora_fim",
        filtros: [...doPaciente, { coluna: "ativo", op: "eq", valor: true }],
        limite: 1,
      },
    ),
    /*
     * O CANAL ESTÁ NA CONVERSA, e não na mensagem: uma conversa é de um canal
     * só, e a mensagem herda o dela. Guardar o canal na mensagem duplicaria o
     * dado em cada linha.
     */
    selecionar<{ canal: string | null }>("crc_conversations", {
      colunas: "canal",
      filtros: [...doPaciente],
      ordenar: [{ coluna: "atualizado_em", ascendente: false }],
      limite: 50,
    }),
  ]);

  const porCanal = new Map<string, number>();
  for (const c of conversas) {
    if (c.canal === null) continue;
    porCanal.set(c.canal, (porCanal.get(c.canal) ?? 0) + 1);
  }
  const canaisPreferidos = [...porCanal.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([canal]) => canal);

  const pref = preferencias[0];
  const horariosPreferidos: string[] = [];
  if (pref !== undefined) {
    const dias = Array.isArray(pref.dias) ? pref.dias.map((d) => String(d)) : [];
    const faixa =
      pref.hora_inicio !== null && pref.hora_fim !== null
        ? `${pref.hora_inicio} às ${pref.hora_fim}`
        : null;
    if (dias.length > 0) horariosPreferidos.push(dias.join(", "));
    if (faixa !== null) horariosPreferidos.push(faixa);
  }

  const diasDesdeUltima =
    ultima === null ? null : Math.floor((agora.getTime() - Date.parse(ultima)) / 86_400_000);

  return {
    patientId: p.id,
    nome: p.nome,
    ltv,
    faixaDeValor: faixaDeValor(ltv, mediana),
    riscoDeAbandono: calcularRiscoDeAbandono({
      diasDesdeUltimaConsulta: diasDesdeUltima,
      recallDias,
      contatosSemResposta,
      faltouSemRemarcar,
      temOrcamentoParado: abertos.length > 0,
      temConsultaFutura: futuras.length > 0,
      optOut: p.opt_out_em !== null,
    }),
    household: inferirHousehold(
      identidades.map((i) => ({
        patientId: i.patient_id,
        // O nome do familiar é resolvido na API, que já lista pacientes. Aqui
        // o id basta para a inferência, e buscar N nomes por ficha seria uma
        // consulta por familiar.
        nome: i.patient_id,
        tipo: i.tipo,
        valor: i.valor,
        compartilhada: i.compartilhada === true,
        confirmadaEm: i.confirmada_em,
      })),
      patientId,
    ),
    riscoDeFalta: futuras[0]?.risco_falta ?? null,
    valorPotencial,
    oportunidadesAbertas: oportunidades.length,
    tratamentosPendentes: abertos.length,
    valorEmTratamento: abertos.reduce((s, o) => s + (Number(o.total_value) || 0), 0),
    objecaoAtual,
    canaisPreferidos,
    horariosPreferidos,
    acoesDoCrc,
    receitaAtribuida,
    ultimaConsultaEm: ultima,
    optOut: p.opt_out_em !== null,
  };
}
