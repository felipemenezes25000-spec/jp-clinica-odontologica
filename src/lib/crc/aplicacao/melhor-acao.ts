/**
 * Próxima Melhor Ação — o serviço.
 *
 * ============================================================================
 *  O DOMÍNIO DECIDIA E NINGUÉM PERGUNTAVA. Este arquivo é quem pergunta.
 *
 *  `dominio/melhor-acao.ts` estava completo e testado desde a FASE A, e nada
 *  o chamava: a coluna `next_best_action` existia no schema e ficava nula para
 *  sempre. Um decisor que ninguém consulta é código morto com teste verde.
 * ============================================================================
 *
 * ESTE MÓDULO NÃO EXECUTA NADA. Ele decide e GRAVA a decisão. Quem executa é o
 * pulso, respeitando o Centro de Autonomia — e é essa separação que permite
 * rodar a decisão em sombra: o CRC pode calcular a melhor ação para a base
 * inteira sem enviar uma única mensagem, e alguém compara o que ele decidiria
 * com o que a recepção fez.
 */
import {
  decidir,
  podeSairSozinho,
  temEfeitoExterno,
  type Acao,
  type ContextoDaDecisao,
  type Decisao,
} from "../dominio/melhor-acao";
import { agoraIso, atualizar, contar, selecionar, type Filtro } from "../servidor/banco";

/*
 * ============================================================================
 *  O TEXTO HUMANO VEM DO DOMÍNIO (`decisao.rotulo`), e este arquivo não tem
 *  mapa de frases.
 *
 *  A primeira versão deste serviço trazia um `Record<Acao, string>` próprio —
 *  e isso seria uma SEGUNDA versão da mesma frase. No dia em que o domínio
 *  mudasse "Ligar" para "Ligar agora", a tela continuaria dizendo a antiga, e
 *  ninguém saberia qual das duas é a oficial.
 *
 *  O domínio também já devolve `porque` e `reasonCode`: o primeiro explica
 *  para gente, o segundo é estável e gravável para responder "por que a
 *  automação contatou este paciente?" seis meses depois (item 121).
 * ============================================================================
 */

export type DecisaoGravada = {
  opportunityId: string;
  acao: Acao;
  frase: string;
  automatizavel: boolean;
  porque: string;
  /** Estável e gravável — o texto em português muda, este não. */
  reasonCode: string;
};

/* -------------------------------------------------------------------------- */
/* Montar o contexto                                                          */
/* -------------------------------------------------------------------------- */

/*
 * ============================================================================
 *  AS COLUNAS SÃO AS QUE EXISTEM, e a primeira versão deste arquivo inventou
 *  quatro que não existiam: `expected_value`, `respondeu`, `tentativas` e
 *  `expira_em`.
 *
 *  O TypeScript não pega isso — para ele, `selecionar<T>()` devolve o que se
 *  prometer. O PostgREST devolveria 400 na primeira execução em produção, com
 *  a varredura inteira caindo.
 *
 *  O que existe de verdade:
 *    valor esperado  ->  `potential_value * probability` (o Radar não guarda
 *                        o produto: guardar derivada é ter duas verdades)
 *    respondeu       ->  há mensagem de ENTRADA deste paciente
 *    tentativas      ->  `crc_contact_log`, que a FASE D criou exatamente
 *                        para isto
 *    expira          ->  `expires_at`
 * ============================================================================
 */
type LinhaDeOportunidade = {
  id: string;
  clinic_id: string;
  patient_id: string | null;
  tipo: string | null;
  potential_value: string | number | null;
  probability: string | number | null;
  expires_at: string | null;
  fechada_em: string | null;
};

/**
 * Junta, para uma oportunidade, tudo que a decisão precisa saber.
 *
 * ============================================================================
 *  O QUE NÃO SE SABE VIRA A OPÇÃO CONSERVADORA, e nunca a otimista.
 *
 *  `temCanal` sem telefone é `false`; `janelaAberta` sem conversa é `false`;
 *  `dentroDoHorario` fora do expediente é `false`. Cada um desses empurra a
 *  decisão para AGUARDAR.
 *
 *  O contrário — assumir que dá para falar quando não se sabe — produz uma
 *  recomendação de mandar mensagem para quem não tem canal, e a recepção
 *  perde a confiança na lista na primeira vez que isso acontece.
 * ============================================================================
 */
async function montarContexto(
  organizationId: string,
  o: LinhaDeOportunidade,
  config: { cooldownHoras: number; contatosPorDia: number; tentativasMaximas: number },
  agora: Date,
): Promise<ContextoDaDecisao> {
  const escopo: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "clinic_id", op: "eq", valor: o.clinic_id },
  ];

  let optOut = false;
  let temCanal = false;
  let contatosHoje = 0;
  let janelaAberta = false;
  let temConsultaFutura = false;
  let respondeu = false;
  let tentativas = 0;

  if (o.patient_id !== null) {
    const paciente = await selecionar<{
      opt_out_em: string | null;
      telefone: string | null;
    }>("crc_patients", {
      colunas: "opt_out_em,telefone",
      filtros: [...escopo, { coluna: "id", op: "eq", valor: o.patient_id }],
      limite: 1,
    });

    const p = paciente[0];
    optOut = p?.opt_out_em !== null && p?.opt_out_em !== undefined;
    temCanal = typeof p?.telefone === "string" && p.telefone.length >= 8;

    const inicioDoDia = new Date(agora);
    inicioDoDia.setUTCHours(0, 0, 0, 0);

    [contatosHoje, temConsultaFutura] = await Promise.all([
      /*
       * O TETO DE CONTATOS É POR PACIENTE, e o filtro precisa dizer isso.
       *
       * Sem `patient_id`, esta contagem devolveria as mensagens da
       * ORGANIZAÇÃO no dia — e numa clínica movimentada o teto de 3 estouraria
       * antes do meio-dia para todo mundo, travando a operação inteira.
       */
      contar("crc_messages", [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "patient_id", op: "eq", valor: o.patient_id },
        { coluna: "direcao", op: "eq", valor: "SAIDA" },
        { coluna: "criado_em", op: "gte", valor: inicioDoDia.toISOString() },
      ]),
      contar("crc_appointments", [
        ...escopo,
        { coluna: "patient_id", op: "eq", valor: o.patient_id },
        { coluna: "inicio_em", op: "gt", valor: agora.toISOString() },
        { coluna: "status", op: "neq", valor: "CANCELLED" },
      ]).then((n) => n > 0),
    ]);

    /*
     * A JANELA DE 24H DO WHATSAPP é a última mensagem DE ENTRADA.
     *
     * Fora dela, o provedor só aceita template aprovado — mandar texto livre
     * falha silenciosamente do lado deles, e o CRC registraria "enviado" para
     * uma mensagem que ninguém recebeu.
     */
    /*
     * DESTE PACIENTE, e não da organização.
     *
     * Sem o filtro, a janela de 24h e o "respondeu" se abririam para TODA a
     * base assim que uma pessoa qualquer escrevesse — e o CRC mandaria texto
     * livre para quem está fora da janela, que o provedor recusa em silêncio.
     */
    const entradas = await selecionar<{ criado_em: string }>("crc_messages", {
      colunas: "criado_em",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "patient_id", op: "eq", valor: o.patient_id },
        { coluna: "direcao", op: "eq", valor: "ENTRADA" },
      ],
      ordenar: [{ coluna: "criado_em", ascendente: false }],
      limite: 1,
    });
    const ultima = entradas[0]?.criado_em;
    janelaAberta =
      typeof ultima === "string" && agora.getTime() - Date.parse(ultima) < 24 * 3_600_000;

    /*
     * "RESPONDEU" É A EXISTÊNCIA DE UMA MENSAGEM DE ENTRADA, e não um campo.
     *
     * Um booleano guardado envelheceria: quem respondeu em março continuaria
     * marcado como tendo respondido em dezembro, e a decisão trataria um
     * silêncio de nove meses como conversa em andamento.
     */
    respondeu = typeof ultima === "string";

    /*
     * TENTATIVAS VÊM DO `crc_contact_log`, que a FASE D criou para isto.
     *
     * São os contatos que o CRC fez DESDE a última resposta. Contar desde
     * sempre faria um paciente de dois anos de história nascer "esgotado", e o
     * sistema desistiria dele sem nunca ter tentado de verdade.
     */
    const desde = typeof ultima === "string" ? ultima : "1970-01-01T00:00:00.000Z";
    tentativas = await contar("crc_contact_log", [
      ...escopo,
      { coluna: "patient_id", op: "eq", valor: o.patient_id },
      { coluna: "ocorrido_em", op: "gt", valor: desde },
    ]);
  }

  /*
   * O ÚLTIMO CONTATO SAI DO LOG, e não de uma coluna na oportunidade.
   *
   * O cooldown é por PESSOA, e não por oportunidade: três oportunidades do
   * mesmo paciente, cada uma com seu próprio "último contato", autorizariam
   * três mensagens no mesmo dia — cada uma achando que foi a primeira.
   */
  let horasDesde: number | null = null;
  if (o.patient_id !== null) {
    const ultimos = await selecionar<{ ocorrido_em: string }>("crc_contact_log", {
      colunas: "ocorrido_em",
      filtros: [...escopo, { coluna: "patient_id", op: "eq", valor: o.patient_id }],
      ordenar: [{ coluna: "ocorrido_em", ascendente: false }],
      limite: 1,
    });
    const quando = ultimos[0]?.ocorrido_em;
    if (typeof quando === "string") {
      horasDesde = (agora.getTime() - Date.parse(quando)) / 3_600_000;
    }
  }

  /*
   * A OBJEÇÃO VEM DO ORÇAMENTO DO MESMO PACIENTE, quando existe.
   *
   * É a ligação entre a FASE C e a FASE A: sem ela, a próxima melhor ação de
   * alguém que disse "está caro" seria "mandar mensagem" em vez de "tratar a
   * objeção" — e o CRC repetiria a oferta que já foi recusada.
   */
  let objecao: ContextoDaDecisao["objecao"] = null;
  if (o.patient_id !== null) {
    const orcamentos = await selecionar<{ objecao_atual: string | null }>("crc_budgets", {
      colunas: "objecao_atual",
      filtros: [
        ...escopo,
        { coluna: "patient_id", op: "eq", valor: o.patient_id },
        { coluna: "objecao_atual", op: "not.is", valor: null },
      ],
      ordenar: [{ coluna: "atualizado_em", ascendente: false }],
      limite: 1,
    });
    const bruta = orcamentos[0]?.objecao_atual ?? null;
    const conhecidas = ["PRECO", "TEMPO", "MEDO", "TERCEIRO", "CONVENIO", "CONFIANCA", "OUTRO"];
    if (bruta !== null && conhecidas.includes(bruta)) {
      objecao = bruta as ContextoDaDecisao["objecao"];
    }
  }

  // Há hora vaga compatível? Uma janela aberta na agenda é o que separa
  // "oferecer horários" de "mandar mensagem genérica".
  const vagas = await contar("crc_schedule_gaps", [
    ...escopo,
    { coluna: "status", op: "in", valor: ["ABERTO", "OFERECENDO"] },
    { coluna: "inicio_em", op: "gt", valor: agora.toISOString() },
  ]);

  const hora = agora.getUTCHours() - 3; // America/Sao_Paulo, sem DST desde 2019
  const diaDaSemana = agora.getUTCDay();

  return {
    tipo: (o.tipo ?? "RECALL") as ContextoDaDecisao["tipo"],
    optOut,
    horasDesdeUltimoContato: horasDesde,
    cooldownHoras: config.cooldownHoras,
    dentroDoHorario: diaDaSemana >= 1 && diaDaSemana <= 5 && hora >= 8 && hora < 18,
    contatosHoje,
    contatosPorDia: config.contatosPorDia,
    temCanal,
    janelaAberta,
    tentativasSemResposta: tentativas,
    tentativasMaximas: config.tentativasMaximas,
    respondeu,
    // Sem sinal explícito de intenção guardado hoje: quem respondeu pedindo
    // horário cai em `respondeu`, e a decisão trata isso.
    intencaoAgendar: false,
    temConsultaFutura,
    objecao,
    exigeJulgamentoClinico: false,
    temHorarioDisponivel: vagas > 0,
    dadoFaltante: temCanal ? null : "telefone",
    /*
     * O VALOR ESPERADO É CALCULADO, e não lido.
     *
     * O Radar guarda `potential_value` e `probability` separados de propósito:
     * guardar o produto criaria uma terceira coluna que envelhece sozinha toda
     * vez que uma das duas mudar.
     */
    valorEsperado: Number(o.potential_value ?? 0) * Number(o.probability ?? 1),
    expirada: o.expires_at !== null && Date.parse(o.expires_at) < agora.getTime(),
  };
}

/* -------------------------------------------------------------------------- */
/* A varredura                                                                */
/* -------------------------------------------------------------------------- */

export const TAMANHO_DA_PAGINA = 200;

/**
 * Decide a próxima melhor ação das oportunidades abertas, e grava.
 *
 * ============================================================================
 *  GRAVA O CÓDIGO **E** A FRASE, em colunas diferentes.
 *
 *  São dois destinatários: a recepcionista lê "Oferecer horários disponíveis";
 *  o motor precisa de `OFERECER_HORARIOS` para saber qual ferramenta chamar.
 *  Guardar só o texto obrigaria o motor a interpretar português; guardar só o
 *  código obrigaria a tela a traduzir de volta.
 * ============================================================================
 */
export async function decidirProximasAcoes(
  organizationId: string,
  clinicIds: readonly string[] | null,
  config: {
    cooldownHoras: number;
    contatosPorDia: number;
    tentativasMaximas: number;
  },
  agora: Date = new Date(),
): Promise<{ decididas: number; automatizaveis: number }> {
  if (clinicIds !== null && clinicIds.length === 0) return { decididas: 0, automatizaveis: 0 };

  const filtros: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "fechada_em", op: "is", valor: null },
  ];
  if (clinicIds !== null) filtros.push({ coluna: "clinic_id", op: "in", valor: [...clinicIds] });

  const abertas = await selecionar<LinhaDeOportunidade>("crc_opportunities", {
    colunas: "id,clinic_id,patient_id,tipo,potential_value,probability,expires_at,fechada_em",
    filtros,
    /*
     * AS MAIS VALIOSAS PRIMEIRO — por `potential_value`, e não pelo valor
     * esperado.
     *
     * O esperado seria melhor, mas ele é derivado (`potential_value *
     * probability`) e o Postgres não ordena por expressão através do
     * PostgREST sem uma view. O potencial é uma boa aproximação para o único
     * fim desta ordem: decidir quem entra na página quando a base não cabe.
     *
     * A página é limitada, e o limite existe para a varredura não estourar o
     * tempo da função serverless. Se a ordem fosse arbitrária, o corte cairia
     * sobre oportunidades ao acaso — e as de R$ 20.000 poderiam ficar sem
     * decisão por dias enquanto as de R$ 200 são decididas todo dia.
     */
    ordenar: [{ coluna: "potential_value", ascendente: false }],
    limite: TAMANHO_DA_PAGINA,
  });

  let decididas = 0;
  let automatizaveis = 0;

  for (const o of abertas) {
    const ctx = await montarContexto(organizationId, o, config, agora);
    const decisao: Decisao = decidir(ctx);

    await atualizar(
      "crc_opportunities",
      [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "id", op: "eq", valor: o.id },
      ],
      {
        next_best_action: decisao.acao,
        next_action: decisao.rotulo,
        atualizado_em: agoraIso(),
      },
    );

    decididas += 1;
    if (podeSairSozinho(decisao)) automatizaveis += 1;
  }

  return { decididas, automatizaveis };
}

/**
 * A decisão de UMA oportunidade, sem gravar. É o que a ficha do paciente usa.
 *
 * Não grava de propósito: abrir uma ficha não deve mudar o banco. Uma leitura
 * que escreve transforma "alguém olhou" em "algo aconteceu", e o histórico
 * passa a registrar curiosidade como decisão.
 */
export async function proximaAcaoDe(
  organizationId: string,
  opportunityId: string,
  config: { cooldownHoras: number; contatosPorDia: number; tentativasMaximas: number },
  agora: Date = new Date(),
): Promise<DecisaoGravada | null> {
  const linhas = await selecionar<LinhaDeOportunidade>("crc_opportunities", {
    colunas: "id,clinic_id,patient_id,tipo,potential_value,probability,expires_at,fechada_em",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "id", op: "eq", valor: opportunityId },
    ],
    limite: 1,
  });

  const o = linhas[0];
  if (o === undefined) return null;

  const decisao = decidir(await montarContexto(organizationId, o, config, agora));

  return {
    opportunityId: o.id,
    acao: decisao.acao,
    frase: decisao.rotulo,
    automatizavel: podeSairSozinho(decisao),
    porque: decisao.porque,
    reasonCode: decisao.reasonCode,
  };
}

export { temEfeitoExterno };
