/**
 * Patient Brain e Opportunity Brain — Fase H.
 *
 * O QUE "BRAIN" SIGNIFICA AQUI, e o que ele explicitamente não significa.
 *
 * NÃO é um modelo, nem um resumo gerado por IA. É a leitura que uma pessoa
 * experiente da recepção faria olhando a ficha — se ela tivesse tempo de olhar
 * todas as fichas, todo dia, e lembrasse de tudo.
 *
 * A diferença entre isto e "pedir para a IA resumir o paciente" não é técnica, é
 * de responsabilidade: cada linha daqui tem uma conta por trás e uma frase que
 * a explica. Um resumo de modelo é convincente e não é auditável — e quando ele
 * diz "paciente em risco de abandono", ninguém consegue perguntar por quê.
 *
 * O QUE OS DOIS REÚNEM:
 *
 *   PATIENT BRAIN       risco de sumir (com os fatores), melhor horário para
 *                       falar, memórias confirmadas, valor em aberto.
 *
 *   OPPORTUNITY BRAIN   a negociação: etapa, tempo parado, objeções ditas nas
 *                       palavras da pessoa, e o que fazer agora.
 *
 * NENHUM DOS DOIS ESCREVE NADA. São leitura pura. Quem age é uma pessoa, ou uma
 * jornada que já tem os próprios portões — e essa separação é o que permite
 * mostrar os dois na tela sem medo.
 */
import { atribuirReceita, type Toque } from "../dominio/atribuicao";
import { calcularRiscoDeChurn, INTERVALO_PADRAO_DIAS, type RiscoDeChurn } from "../dominio/churn";
import { diasLocaisEntre, FUSO_PADRAO } from "../dominio/dia-local";
import { melhorHorarioDe, type MelhorHorario } from "../dominio/melhor-horario";
import { classificarObjecao, type ObjecaoClassificada } from "../dominio/objecoes";
/*
 * O BANCO ENTRA POR IMPORT ESTÁTICO, como no resto de `aplicacao/`.
 *
 * A primeira versão usava `await import()` dentro de cada função auxiliar, e
 * cinco dessas rodavam juntas num `Promise.all`. Sob concorrência, algumas
 * resolviam para o módulo REAL em vez do dublê — e o sintoma era uma ficha
 * silenciosamente vazia, porque cada função tem `catch` que devolve lista
 * vazia. O teste acusou; a leitura do erro levou um tempo justamente porque a
 * falha era engolida de propósito.
 *
 * `servidor/banco` não participa de ciclo de módulo com `aplicacao/`, então o
 * import dinâmico aqui nunca protegeu nada. Ele existia por hábito.
 */
import { contar, selecionar, selecionarUm } from "../servidor/banco";

/* ========================================================================== */
/* Patient Brain                                                              */
/* ========================================================================== */

export type CerebroDoPaciente = {
  patientId: string;
  nome: string;
  risco: RiscoDeChurn;
  melhorHorario: MelhorHorario;
  /** O que a clínica sabe porque alguém DISSE. Nunca o que o modelo concluiu. */
  memorias: string[];
  /** Orçamento aprovado e não iniciado, em reais. */
  valorEmAberto: number;
  /** Uma linha para o topo da ficha. */
  resumo: string;
};

export async function cerebroDoPaciente(
  organizationId: string,
  patientId: string,
  agora = new Date(),
): Promise<CerebroDoPaciente | null> {
  const paciente = await selecionarUm("crc_patients", {
    colunas: "id,nome,ultima_consulta_em,proxima_consulta_em,opt_out_em",
    filtros: [
      { coluna: "id", op: "eq", valor: patientId },
      // O TENANT ENTRA MESMO SABENDO O ID. Id é chute possível; tenant é a
      // fronteira. É a regra do sistema inteiro, e uma leitura de painel não é
      // exceção a ela.
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
  });

  if (paciente === null) return null;

  const fuso = await lerFuso(organizationId);

  const [faltas, comparecimentos, orcamentos, respostas, memorias] = await Promise.all([
    contarConsultas(organizationId, patientId, "FALTOU", agora),
    contarConsultas(organizationId, patientId, "REALIZADO", agora),
    selecionar("crc_budgets", {
      colunas: "total_value,status",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "patient_id", op: "eq", valor: patientId },
        { coluna: "status", op: "eq", valor: "APROVADO" },
      ],
      limite: 20,
    }).catch(() => []),
    respostasDoPaciente(organizationId, patientId),
    memoriasConfirmadas(organizationId, patientId),
  ]);

  const valorEmAberto = orcamentos.reduce((t, o) => t + Number(o["total_value"] ?? 0), 0);
  const proxima = texto(paciente["proxima_consulta_em"]);

  const risco = calcularRiscoDeChurn(
    {
      ultimaConsultaEm: texto(paciente["ultima_consulta_em"]),
      proximaConsultaEm: proxima,
      faltasRecentes: faltas,
      comparecimentosRecentes: comparecimentos,
      /*
       * "INTERROMPIDO" É ORÇAMENTO APROVADO SEM CONSULTA MARCADA.
       *
       * A conjunção é o que dá sentido: orçamento aprovado COM consulta marcada
       * é tratamento em andamento, que é o oposto de interrompido. Olhar só o
       * orçamento poria metade dos pacientes ativos na lista de retenção.
       */
      tratamentoInterrompido: valorEmAberto > 0 && proxima === null,
      ultimaRespostaEm: respostas[0]?.em ?? null,
      intervaloEsperadoDias: INTERVALO_PADRAO_DIAS,
    },
    agora,
    fuso,
  );

  const nome = String(paciente["nome"] ?? "");

  return {
    patientId,
    nome,
    risco,
    melhorHorario: melhorHorarioDe(respostas, fuso),
    memorias,
    valorEmAberto,
    resumo: resumirPaciente(nome, risco, valorEmAberto, paciente["opt_out_em"] != null),
  };
}

/**
 * A linha do topo da ficha.
 *
 * O OPT-OUT VEM PRIMEIRO E SOZINHO, na frente de qualquer outra coisa. Quem
 * pediu para não ser contatado não deve ter um resumo que convide a contatar —
 * por mais alto que seja o valor em aberto, e é justamente quando o valor é alto
 * que alguém racionalizaria a ligação.
 */
function resumirPaciente(
  nome: string,
  risco: RiscoDeChurn,
  valorEmAberto: number,
  optOut: boolean,
): string {
  const primeiro = nome.split(/\s+/u)[0] ?? nome;

  if (optOut) return `${primeiro} pediu para não receber contato. Não ligue nem mande mensagem.`;

  if (risco.escore === 0) return `${primeiro} está com consulta marcada. Nada a fazer.`;

  const dinheiro =
    valorEmAberto > 0
      ? ` Tem ${valorEmAberto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em orçamento aprovado e não iniciado.`
      : "";

  return `${primeiro}: risco ${risco.nivel} de não voltar.${dinheiro} ${risco.acaoSugerida}`;
}

/* ========================================================================== */
/* Opportunity Brain                                                          */
/* ========================================================================== */

export type CerebroDaOportunidade = {
  opportunityId: string;
  etapa: string | null;
  valorPotencial: number;
  /** Há quantos dias parada na etapa atual. */
  diasParada: number;
  /** As objeções ditas, classificadas mas COM o texto original. */
  objecoes: ObjecaoClassificada[];
  /** De onde veio a pessoa, se houver toques registrados. */
  origem: string | null;
  resumo: string;
  acaoSugerida: string;
};

/** Além disto, uma negociação parada é uma negociação perdida que ninguém fechou. */
const PARADA_DEMAIS_DIAS = 14;

export async function cerebroDaOportunidade(
  organizationId: string,
  opportunityId: string,
  agora = new Date(),
): Promise<CerebroDaOportunidade | null> {
  const op = await selecionarUm("crc_opportunities", {
    colunas: "id,stage_id,potential_value,atualizado_em,patient_id",
    filtros: [
      { coluna: "id", op: "eq", valor: opportunityId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "fechada_em", op: "is", valor: null },
    ],
  });

  if (op === null) return null;

  const fuso = await lerFuso(organizationId);

  const [historico, etapa] = await Promise.all([
    selecionar("crc_opportunity_history", {
      colunas: "motivo,origem,criado_em",
      filtros: [{ coluna: "opportunity_id", op: "eq", valor: opportunityId }],
      ordenar: [{ coluna: "criado_em", ascendente: false }],
      limite: 20,
    }).catch(() => []),
    nomeDaEtapa(organizationId, op["stage_id"]),
  ]);

  const objecoes = historico
    .filter((h) => typeof h["motivo"] === "string" && String(h["motivo"]).trim().length > 0)
    .map((h) => classificarObjecao(String(h["motivo"])));

  const atualizado = texto(op["atualizado_em"]);
  const diasParada =
    atualizado === null ? 0 : diasLocaisEntre(new Date(Date.parse(atualizado)), agora, fuso);

  const valorPotencial = Number(op["potential_value"] ?? 0);

  return {
    opportunityId,
    etapa,
    valorPotencial,
    diasParada,
    objecoes,
    origem: null,
    resumo: resumirOportunidade(etapa, valorPotencial, diasParada, objecoes),
    acaoSugerida: acaoDaOportunidade(diasParada, objecoes),
  };
}

function resumirOportunidade(
  etapa: string | null,
  valor: number,
  diasParada: number,
  objecoes: readonly ObjecaoClassificada[],
): string {
  const partes: string[] = [];
  if (etapa !== null) partes.push(`Etapa: ${etapa}.`);
  if (valor > 0) {
    partes.push(`${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`);
  }
  partes.push(
    diasParada > PARADA_DEMAIS_DIAS
      ? `Parada há ${String(diasParada)} dias.`
      : `Movimentada há ${String(diasParada)} dias.`,
  );

  const ultima = objecoes[0];
  // A ÚLTIMA OBJEÇÃO VAI NO RESUMO COM AS PALAVRAS DA PESSOA. "Objeção: PREÇO"
  // não prepara ninguém para a ligação; a frase dela prepara.
  if (ultima !== undefined) partes.push(`Último motivo dado: “${ultima.texto.slice(0, 80)}”.`);

  return partes.join(" ");
}

function acaoDaOportunidade(diasParada: number, objecoes: readonly ObjecaoClassificada[]): string {
  const ultima = objecoes[0];

  if (ultima !== undefined) {
    switch (ultima.categoria) {
      case "PRECO":
        return "Ofereça o parcelamento ANTES de falar do valor de novo. Repetir o número cheio para quem já disse que está caro não muda nada.";
      case "TERCEIRO":
        return "Mande o orçamento por escrito, num formato que dê para mostrar em casa. A pessoa precisa apresentar, e não relembrar.";
      case "MEDO":
        return "Fale sobre a primeira consulta, e não sobre o tratamento inteiro. Medo se resolve reduzindo o tamanho do primeiro passo.";
      case "TEMPO":
        return "Ofereça dois horários concretos, um cedo e um no fim do dia. 'Quando puder' não resolve quem não tem tempo.";
      case "CONVENIO":
        return "Responda objetivamente sobre convênio antes de qualquer outra coisa. É a dúvida que trava tudo o mais.";
      case "CONFIANCA":
        return "Mande uma indicação ou avaliação real. Desconto não resolve desconfiança — às vezes até piora.";
      default:
        break;
    }
  }

  if (diasParada > PARADA_DEMAIS_DIAS) {
    /*
     * PARADA SEM OBJEÇÃO É O CASO MAIS COMUM E O MAIS MAL TRATADO.
     *
     * Ninguém disse não; simplesmente parou. A reação usual é insistir com a
     * mesma proposta, e a pergunta que falta é anterior: o que impediu? Sem
     * saber, toda insistência é chute.
     */
    return "Pergunte diretamente o que impediu de seguir. Ninguém disse não aqui — e insistir com a mesma proposta sem saber o motivo é chute.";
  }

  return "Siga o combinado. Esta negociação está andando.";
}

/* -------------------------------------------------------------------------- */
/* Leituras auxiliares                                                        */
/* -------------------------------------------------------------------------- */

const texto = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

async function lerFuso(organizationId: string): Promise<string> {
  try {
    const { lerFusoDaOrganizacao } = await import("./orcamento");
    return await lerFusoDaOrganizacao(organizationId);
  } catch {
    return FUSO_PADRAO;
  }
}

async function contarConsultas(
  organizationId: string,
  patientId: string,
  status: string,
  agora: Date,
): Promise<number> {
  try {
    // DOZE MESES, e não "sempre". Uma falta de três anos atrás não diz nada
    // sobre a pessoa de hoje, e somá-la faria o risco de quem é paciente antigo
    // crescer só por ser antigo.
    const corte = new Date(agora.getTime() - 365 * 86_400_000).toISOString();
    return await contar("crc_appointments", [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "patient_id", op: "eq", valor: patientId },
      { coluna: "status", op: "eq", valor: status },
      { coluna: "inicio_em", op: "gte", valor: corte },
    ]);
  } catch {
    return 0;
  }
}

/**
 * As respostas DO PACIENTE, e não as mensagens da clínica.
 *
 * `direcao = ENTRADA` é o filtro inteiro, e errá-lo mediria o hábito de quem
 * configurou a jornada em vez do hábito de quem responde. (É o mesmo filtro que
 * já quebrou uma vez neste projeto, escrito como `IN` em vez de `ENTRADA`.)
 */
async function respostasDoPaciente(
  organizationId: string,
  patientId: string,
): Promise<{ em: string }[]> {
  try {
    const linhas = await selecionar("crc_messages", {
      colunas: "criado_em",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "patient_id", op: "eq", valor: patientId },
        { coluna: "direcao", op: "eq", valor: "ENTRADA" },
      ],
      ordenar: [{ coluna: "criado_em", ascendente: false }],
      limite: 100,
    });
    return linhas.map((l) => ({ em: String(l["criado_em"] ?? "") })).filter((r) => r.em.length > 0);
  } catch {
    return [];
  }
}

async function memoriasConfirmadas(organizationId: string, patientId: string): Promise<string[]> {
  try {
    const linhas = await selecionar("crc_ai_memories", {
      colunas: "conteudo,status",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "subject_id", op: "eq", valor: patientId },
        /*
         * SÓ AS CONFIRMADAS. As pendentes existem justamente para NÃO
         * influenciar decisão antes de alguém conferir — mostrá-las numa ficha
         * que a recepção lê antes de ligar faria a conferência acontecer depois
         * de a informação já ter sido usada.
         */
        { coluna: "status", op: "eq", valor: "CONFIRMADA" },
      ],
      limite: 10,
    });
    return linhas.map((l) => String(l["conteudo"] ?? "")).filter((c) => c.length > 0);
  } catch {
    return [];
  }
}

async function nomeDaEtapa(organizationId: string, stageId: unknown): Promise<string | null> {
  if (typeof stageId !== "string") return null;
  try {
    const l = await selecionarUm("crc_opportunity_stages", {
      colunas: "nome",
      filtros: [
        { coluna: "id", op: "eq", valor: stageId },
        { coluna: "organization_id", op: "eq", valor: organizationId },
      ],
    });
    return texto(l?.["nome"]);
  } catch {
    return null;
  }
}

/** Exposto para o painel de atribuição, que monta os toques de outra fonte. */
export { atribuirReceita, type Toque };
