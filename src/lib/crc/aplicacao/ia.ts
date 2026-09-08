/**
 * A camada de inteligência — Milestone 6, itens 41 a 48 e 172 a 177.
 *
 * O item 12 do Mega Prompt é a régua deste arquivo: "a IA NÃO deve ser apenas
 * um gerador de textos; ela deve ser uma camada de inteligência operacional".
 * Concretamente, ela responde três perguntas sobre uma conversa — o que a
 * pessoa quer, quão quente isso é, e o que fazer agora — em formato de dado, e
 * nunca em prosa.
 *
 * QUATRO GUARDRAILS QUE NÃO PODEM SER CONTORNADOS:
 *
 *   1. O CONTEXTO É MÍNIMO (item 47). O modelo recebe as últimas mensagens, o
 *      estado comercial e as datas de consulta. Não recebe prontuário, não
 *      recebe CPF, não recebe endereço.
 *
 *   2. A SAÍDA É VALIDADA (itens 43, 114). Campo fora do enum não vira ação:
 *      vira fallback humano.
 *
 *   3. ESCALONAMENTO É OBRIGATÓRIO EM ALGUNS CASOS (item 48), e ele NÃO depende
 *      da confiança. Dor, medicamento, reclamação e questão financeira vão para
 *      humano mesmo que o modelo diga 0.99 de certeza — a decisão é da política
 *      da clínica, não do modelo.
 *
 *   4. FALHA DA IA NÃO QUEBRA A CONVERSA (itens 45, 117). Provedor fora do ar
 *      cria tarefa humana e o atendimento segue. A IA é acelerador; não é
 *      ponto único de falha.
 */
import { CONFIGURACAO_PADRAO, type ConfiguracaoCrc } from "../dominio/configuracao";
import { pedeDescadastro } from "../dominio/regras";
import { dataHora } from "../dominio/formatar";
import { ROTULO_SITUACAO } from "../dominio/rotulos";
import type {
  AcaoIa,
  ClassificacaoConversa,
  Intencao,
  MotivoEscalonamento,
  Temperatura,
} from "../dominio/tipos";
import { ACOES_IA, INTENCOES, TEMPERATURAS } from "../dominio/tipos";
import { numeroEntre, umDe } from "../dominio/validar";
import type { PortaIa } from "../integracoes/ia/porta";
import { atualizar, inserir, selecionar, selecionarUm } from "../servidor/banco";
import { descreverErro, registrar } from "../servidor/registro";

import { linhaParaMensagem, linhaParaPaciente } from "./repositorios";
import { criarTarefa } from "./tarefas";

/* -------------------------------------------------------------------------- */
/* Prompt (item 42: versionado)                                               */
/* -------------------------------------------------------------------------- */

export const PROMPT_CLASSIFICADOR = "conversation_classifier_v1";

/**
 * As instruções.
 *
 * Escritas em português porque a conversa é em português e o modelo classifica
 * melhor quando a instrução e o dado estão na mesma língua. Os guardrails do
 * item 14 aparecem aqui como proibições explícitas — mas nenhum deles DEPENDE
 * do modelo obedecer: a lista de ações é validada no código, e o escalonamento
 * obrigatório é reavaliado por regra depois da resposta.
 */
const INSTRUCOES = `Você classifica mensagens de pacientes de uma clínica odontológica para uma equipe de relacionamento.

Sua função é ORGANIZAR a conversa para um atendente humano, não conversar com o paciente.

REGRAS ABSOLUTAS:
- Nunca diagnostique, nunca sugira tratamento, nunca fale de medicamento.
- Nunca invente preço, horário disponível, prazo ou promessa de resultado.
- Se a mensagem tiver qualquer conteúdo clínico, dor, urgência, reclamação, conflito, cobrança ou pedido de desconto, marque exigeHumano = true.
- Na dúvida sobre a intenção, use OUTRO com confiança baixa. Chutar é pior do que admitir incerteza.

TEMPERATURA:
- HOT: quer marcar, remarcar ou confirmar agora.
- WARM: demonstrou interesse mas não decidiu.
- COLD: sem interesse, adiando, ou assunto administrativo.

O resumo deve ter no máximo duas frases, em português, descrevendo o que o paciente quer. Não inclua dado pessoal no resumo.`;

/** O JSON Schema que o provedor é obrigado a respeitar. */
const ESQUEMA = {
  nome: "classificacao_conversa",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "intencao",
      "temperatura",
      "confianca",
      "exigeHumano",
      "motivoEscalonamento",
      "acaoSugerida",
      "resumo",
    ],
    properties: {
      intencao: { type: "string", enum: [...INTENCOES] },
      temperatura: { type: "string", enum: [...TEMPERATURAS] },
      confianca: { type: "number", minimum: 0, maximum: 1 },
      exigeHumano: { type: "boolean" },
      motivoEscalonamento: {
        type: ["string", "null"],
        enum: [
          "clinical_question",
          "complaint",
          "legal_issue",
          "payment_dispute",
          "angry_patient",
          "uncertain_intent",
          "special_discount",
          "medication_question",
          "diagnosis_request",
          null,
        ],
      },
      acaoSugerida: { type: "string", enum: [...ACOES_IA] },
      resumo: { type: "string", maxLength: 400 },
    },
  },
} as const;

/* -------------------------------------------------------------------------- */
/* Escalonamento obrigatório (item 48)                                        */
/* -------------------------------------------------------------------------- */

/**
 * Detecta por REGRA o que precisa de humano, independentemente do modelo.
 *
 * POR QUE DUPLICAR O QUE A IA JÁ FAZ
 * Porque as consequências são clínicas. Um paciente escrevendo "está doendo
 * muito e inchou" precisa de gente, e "o modelo classificou como AGENDAR com
 * 0.93" não é defesa aceitável se ele receber uma lista de horários. A regra
 * aqui é grosseira e pega demais de propósito: errar mandando para humano custa
 * um minuto de atenção; errar deixando com a automação custa outra coisa.
 */
const GATILHOS_ESCALONAMENTO: readonly { padrao: RegExp; motivo: MotivoEscalonamento }[] = [
  {
    padrao: /\b(dor|dói|doi|doendo|inchad|inchou|sangra|sangrando|pus|abscesso|febre)\b/iu,
    motivo: "clinical_question",
  },
  {
    padrao: /\b(rem[ée]dio|antibi[óo]tico|analg[ée]sico|dipirona|amoxicilina|receita)\b/iu,
    motivo: "medication_question",
  },
  {
    padrao: /\b(diagn[óo]stico|é c[áa]rie|tenho c[áa]rie|preciso de canal|é grave)\b/iu,
    motivo: "diagnosis_request",
  },
  {
    padrao: /\b(reclama|p[ée]ssimo|absurdo|horr[íi]vel|descaso|mal atendid)\b/iu,
    motivo: "complaint",
  },
  {
    padrao: /\b(procon|advogad|processar|processo|justi[çc]a|c[óo]digo do consumidor)\b/iu,
    motivo: "legal_issue",
  },
  {
    padrao: /\b(estorn|cobran[çc]a indevida|cobrado a mais|n[ãa]o reconhe[çc]o.*cobran)\b/iu,
    motivo: "payment_dispute",
  },
  {
    padrao: /\b(desconto|abatimento|condi[çc][ãa]o especial|parcelar em mais)\b/iu,
    motivo: "special_discount",
  },
  { padrao: /\b(urgente|urg[êe]ncia|emerg[êe]ncia|socorro)\b/iu, motivo: "angry_patient" },
];

export function escalonamentoObrigatorio(texto: string): MotivoEscalonamento | null {
  for (const g of GATILHOS_ESCALONAMENTO) {
    if (g.padrao.test(texto)) return g.motivo;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Validação da resposta (itens 43, 114, 174)                                 */
/* -------------------------------------------------------------------------- */

export type ValidacaoClassificacao =
  { ok: true; classificacao: ClassificacaoConversa } | { ok: false; erro: string };

/**
 * Converte a saída crua numa classificação, ou explica por que não dá.
 *
 * Exportada para o teste: é a parte que precisa aguentar o modelo inventando
 * `"acao": "APAGAR_TUDO"`, e testar isso sem chamar a API é o único jeito
 * barato de garantir.
 */
export function validarClassificacao(dados: Record<string, unknown>): ValidacaoClassificacao {
  const intencao = umDe<Intencao>(dados["intencao"], INTENCOES, "intencao");
  if (!intencao.ok) return { ok: false, erro: intencao.erro };

  const temperatura = umDe<Temperatura>(dados["temperatura"], TEMPERATURAS, "temperatura");
  if (!temperatura.ok) return { ok: false, erro: temperatura.erro };

  const confianca = numeroEntre(dados["confianca"], 0, 1, "confianca");
  if (!confianca.ok) return { ok: false, erro: confianca.erro };

  // Item 174: ação fora da lista permitida NÃO vira ação.
  const acao = umDe<AcaoIa>(dados["acaoSugerida"], ACOES_IA, "acaoSugerida");
  if (!acao.ok) return { ok: false, erro: acao.erro };

  const motivoBruto = dados["motivoEscalonamento"];
  let motivo: MotivoEscalonamento | null = null;
  if (typeof motivoBruto === "string" && motivoBruto.length > 0) {
    const permitidos: MotivoEscalonamento[] = [
      "clinical_question",
      "complaint",
      "legal_issue",
      "payment_dispute",
      "angry_patient",
      "uncertain_intent",
      "special_discount",
      "medication_question",
      "diagnosis_request",
    ];
    const r = umDe<MotivoEscalonamento>(motivoBruto, permitidos, "motivoEscalonamento");
    // Motivo desconhecido não invalida a classificação inteira — ele vira
    // `uncertain_intent`, que já manda para humano. Recusar tudo por causa de
    // um rótulo estranho seria perder a intenção, que estava certa.
    motivo = r.ok ? r.valor : "uncertain_intent";
  }

  const resumo = typeof dados["resumo"] === "string" ? dados["resumo"].slice(0, 400) : "";

  return {
    ok: true,
    classificacao: {
      intencao: intencao.valor,
      temperatura: temperatura.valor,
      confianca: confianca.valor,
      exigeHumano: dados["exigeHumano"] === true || motivo !== null,
      motivoEscalonamento: motivo,
      acaoSugerida: acao.valor,
      resumo,
    },
  };
}

/**
 * Aplica os limiares do item 44.
 *
 * `>= automatica` a IA pode agir; entre os dois, ela sugere; abaixo, humano
 * obrigatório. Os valores vêm da configuração, e não do código — o item 44 diz
 * "os valores devem ser configuráveis".
 */
export type Autonomia = "AUTOMATICA" | "SUGESTAO" | "HUMANO";

export function decidirAutonomia(
  classificacao: ClassificacaoConversa,
  cfg: ConfiguracaoCrc,
): Autonomia {
  // Escalonamento obrigatório ignora a confiança. Item 48.
  if (classificacao.exigeHumano || classificacao.motivoEscalonamento !== null) return "HUMANO";
  if (classificacao.confianca >= cfg.iaConfiancaAutomatica) return "AUTOMATICA";
  if (classificacao.confianca >= cfg.iaConfiancaSugestao) return "SUGESTAO";
  return "HUMANO";
}

/* -------------------------------------------------------------------------- */
/* Contexto (item 47)                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Monta o que o modelo vai ler.
 *
 * O QUE ENTRA: as últimas mensagens da conversa, o primeiro nome, a situação
 * comercial, as datas de consulta, e a oportunidade aberta.
 *
 * O QUE NÃO ENTRA, E POR QUÊ: telefone (o modelo não precisa saber para
 * classificar, e é dado de contato), e-mail, nascimento, endereço, documento e
 * qualquer conteúdo clínico. O item 14 é explícito — "não enviar prontuário
 * completo para LLM" — e a leitura estrita disso é enviar só o necessário para
 * o objetivo COMERCIAL.
 *
 * O nome vai porque sem ele o resumo fica impessoal e inútil na Inbox; vai
 * apenas o primeiro nome, que é o que aparece na tela de qualquer jeito.
 */
export async function construirContexto(
  organizationId: string,
  conversationId: string,
  limiteMensagens = 12,
): Promise<{ texto: string; patientId: string | null }> {
  const conversa = await selecionarUm("crc_conversations", {
    colunas: "patient_id,clinic_id",
    filtros: [
      { coluna: "id", op: "eq", valor: conversationId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
  });

  const patientId = typeof conversa?.["patient_id"] === "string" ? conversa["patient_id"] : null;

  const linhas = await selecionar("crc_messages", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "conversation_id", op: "eq", valor: conversationId },
      // Nota interna NUNCA vai para o modelo: ela pode conter avaliação da
      // equipe sobre o paciente, e não é conteúdo da conversa.
      { coluna: "nota_interna", op: "eq", valor: false },
    ],
    ordenar: [{ coluna: "criado_em", ascendente: false }],
    limite: limiteMensagens,
  });

  const mensagens = linhas.map(linhaParaMensagem).reverse();
  const partes: string[] = [];

  if (patientId !== null) {
    const linhaPaciente = await selecionarUm("crc_patients", {
      colunas: "nome,situacao,ultima_consulta_em,proxima_consulta_em",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "id", op: "eq", valor: patientId },
      ],
    });

    if (linhaPaciente !== null) {
      const p = linhaParaPaciente(linhaPaciente);
      partes.push(
        [
          `Paciente: ${p.nome.split(/\s+/u)[0] ?? "não informado"}`,
          `Situação: ${ROTULO_SITUACAO[p.situacao]}`,
          `Última consulta: ${p.ultimaConsultaEm === null ? "nenhuma registrada" : dataHora(p.ultimaConsultaEm)}`,
          `Próxima consulta: ${p.proximaConsultaEm === null ? "nenhuma marcada" : dataHora(p.proximaConsultaEm)}`,
        ].join("\n"),
      );
    }

    const oportunidade = await selecionarUm("crc_opportunities", {
      colunas: "tipo,motivo",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "patient_id", op: "eq", valor: patientId },
        { coluna: "fechada_em", op: "is", valor: null },
      ],
      ordenar: [{ coluna: "priority_score", ascendente: false }],
    });

    if (oportunidade !== null) {
      partes.push(`Motivo do contato: ${String(oportunidade["motivo"] ?? "")}`);
    }
  }

  partes.push(
    "Conversa (mais antiga primeiro):\n" +
      mensagens
        .map((m) => `${m.direcao === "ENTRADA" ? "Paciente" : "Clínica"}: ${m.conteudo}`)
        .join("\n"),
  );

  return { texto: partes.join("\n\n"), patientId };
}

/* -------------------------------------------------------------------------- */
/* Classificação                                                              */
/* -------------------------------------------------------------------------- */

export type ResultadoClassificacao =
  | { ok: true; classificacao: ClassificacaoConversa; autonomia: Autonomia }
  | { ok: false; motivo: string; tarefaCriada: boolean };

/**
 * Classifica a conversa e persiste o resultado.
 *
 * O CAMINHO DE FALHA É TÃO IMPORTANTE QUANTO O DE SUCESSO (item 45): quando a
 * IA não responde ou responde errado, isto NÃO lança. Ele registra, cria uma
 * tarefa humana e devolve `ok: false`. A conversa continua na Inbox, o
 * atendente continua trabalhando, e a única diferença é que ninguém pré-leu
 * para ele.
 */
export async function classificarConversa(
  organizationId: string,
  conversationId: string,
  porta: PortaIa | null,
  cfg: ConfiguracaoCrc = CONFIGURACAO_PADRAO,
): Promise<ResultadoClassificacao> {
  const { texto, patientId } = await construirContexto(organizationId, conversationId);

  // A última mensagem do paciente, para as regras que não dependem do modelo.
  const ultima = await selecionarUm("crc_messages", {
    colunas: "conteudo",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "conversation_id", op: "eq", valor: conversationId },
      { coluna: "direcao", op: "eq", valor: "ENTRADA" },
    ],
    ordenar: [{ coluna: "criado_em", ascendente: false }],
  });
  const textoUltima = typeof ultima?.["conteudo"] === "string" ? ultima["conteudo"] : "";

  // Duas regras acontecem ANTES do modelo, e valem mesmo se ele estiver fora.
  const motivoObrigatorio = escalonamentoObrigatorio(textoUltima);
  const querSair = pedeDescadastro(textoUltima);

  if (porta === null) {
    return finalizarSemIa(
      organizationId,
      conversationId,
      patientId,
      "A leitura automática não está configurada.",
      motivoObrigatorio,
    );
  }

  const comecou = Date.now();
  const resposta = await porta.gerarEstruturado({
    promptVersao: PROMPT_CLASSIFICADOR,
    instrucoes: INSTRUCOES,
    entrada: texto,
    esquema: ESQUEMA as unknown as { nome: string; schema: Record<string, unknown> },
    maxTokens: 400,
  });

  if (!resposta.ok) {
    await registrarChamada(organizationId, {
      conversationId,
      modelo: porta.modelo,
      sucesso: false,
      erro: resposta.detalhe,
      duracaoMs: Date.now() - comecou,
      uso: resposta.uso,
    });
    return finalizarSemIa(
      organizationId,
      conversationId,
      patientId,
      `A leitura automática falhou: ${resposta.detalhe}`,
      motivoObrigatorio,
    );
  }

  const validacao = validarClassificacao(resposta.dados);
  if (!validacao.ok) {
    await registrarChamada(organizationId, {
      conversationId,
      modelo: porta.modelo,
      sucesso: false,
      erro: validacao.erro,
      duracaoMs: Date.now() - comecou,
      uso: resposta.uso,
    });
    return finalizarSemIa(
      organizationId,
      conversationId,
      patientId,
      `A leitura automática devolveu um formato inesperado: ${validacao.erro}`,
      motivoObrigatorio,
    );
  }

  // AS REGRAS SOBREPÕEM O MODELO, e não o contrário.
  const classificacao: ClassificacaoConversa = {
    ...validacao.classificacao,
    ...(querSair ? { intencao: "DESCADASTRO" as Intencao } : {}),
    ...(motivoObrigatorio !== null
      ? {
          exigeHumano: true,
          motivoEscalonamento: motivoObrigatorio,
          acaoSugerida: "ASSIGN_HUMAN" as AcaoIa,
        }
      : {}),
  };

  const autonomia = decidirAutonomia(classificacao, cfg);

  await atualizar(
    "crc_conversations",
    [
      { coluna: "id", op: "eq", valor: conversationId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    {
      temperatura: classificacao.temperatura,
      intencao: classificacao.intencao,
      resumo_ia: classificacao.resumo,
      resumo_ia_em: new Date().toISOString(),
    },
  );

  await registrarChamada(organizationId, {
    conversationId,
    modelo: porta.modelo,
    sucesso: true,
    saida: classificacao,
    confianca: classificacao.confianca,
    acaoTomada: autonomia,
    duracaoMs: Date.now() - comecou,
    uso: resposta.uso,
  });

  // Item 48: escalonamento cria trabalho humano de verdade, e não só um
  // rótulo na tela.
  if (autonomia === "HUMANO" && patientId !== null) {
    await criarTarefa({
      organizationId,
      clinicId: await clinicaDaConversa(organizationId, conversationId),
      patientId,
      titulo:
        classificacao.motivoEscalonamento === null
          ? "Ler e responder esta conversa"
          : "Conversa precisa de atendimento humano",
      tipo: "REVISAR",
      prazoHoras: 4,
      prioridade: classificacao.motivoEscalonamento === null ? 0 : 10,
      motivo: classificacao.resumo,
      chaveDedupe: `escalonamento:${conversationId}:${classificacao.motivoEscalonamento ?? "baixa_confianca"}`,
      ator: "ia",
    });
  }

  return { ok: true, classificacao, autonomia };
}

/**
 * O caminho quando a IA não pode ajudar.
 *
 * Cria a tarefa e devolve `ok: false`. A conversa NÃO é bloqueada, NÃO é
 * marcada como erro, e nada some da Inbox. Item 117: sem IA, o CRC continua
 * permitindo operação humana.
 */
async function finalizarSemIa(
  organizationId: string,
  conversationId: string,
  patientId: string | null,
  motivo: string,
  motivoObrigatorio: MotivoEscalonamento | null,
): Promise<ResultadoClassificacao> {
  registrar("aviso", "Conversa seguirá sem leitura automática.", {
    organizationId,
    conversationId,
    motivo,
  });

  let tarefaCriada = false;
  if (patientId !== null) {
    const tarefa = await criarTarefa({
      organizationId,
      clinicId: await clinicaDaConversa(organizationId, conversationId),
      patientId,
      titulo:
        motivoObrigatorio === null
          ? "Ler e responder esta conversa"
          : "Conversa precisa de atendimento humano",
      tipo: "REVISAR",
      prazoHoras: 4,
      prioridade: motivoObrigatorio === null ? 0 : 10,
      motivo,
      chaveDedupe: `sem_ia:${conversationId}`,
      ator: "sistema",
    });
    tarefaCriada = tarefa !== null;
  }

  return { ok: false, motivo, tarefaCriada };
}

async function clinicaDaConversa(organizationId: string, conversationId: string): Promise<string> {
  const linha = await selecionarUm("crc_conversations", {
    colunas: "clinic_id",
    filtros: [
      { coluna: "id", op: "eq", valor: conversationId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
  });
  return String(linha?.["clinic_id"] ?? "");
}

/* -------------------------------------------------------------------------- */
/* Custo e auditoria (itens 46, 172)                                          */
/* -------------------------------------------------------------------------- */

/**
 * Registra a chamada.
 *
 * GUARDA A SAÍDA, E NÃO A ENTRADA. O item 172 pede "input context reference",
 * e a referência aqui é o `conversation_id`: quem investigar uma decisão lê a
 * conversa na Inbox. Copiar o contexto para cá criaria uma segunda cópia de
 * dado de paciente numa tabela de log — que é exatamente o que o item 75
 * evita. E, como o item 172 também diz, chain-of-thought não é armazenado.
 */
async function registrarChamada(
  organizationId: string,
  dados: {
    conversationId: string;
    modelo: string;
    sucesso: boolean;
    saida?: unknown;
    confianca?: number;
    acaoTomada?: string;
    erro?: string;
    duracaoMs: number;
    uso: {
      inputTokens: number | null;
      outputTokens: number | null;
      custoEstimado: number | null;
    } | null;
  },
): Promise<void> {
  try {
    await inserir("crc_ai_calls", {
      organization_id: organizationId,
      feature: "classificacao_conversa",
      prompt_versao: PROMPT_CLASSIFICADOR,
      modelo: dados.modelo,
      entity_type: "conversation",
      entity_id: dados.conversationId,
      saida: dados.saida ?? null,
      confianca: dados.confianca ?? null,
      acao_tomada: dados.acaoTomada ?? null,
      input_tokens: dados.uso?.inputTokens ?? null,
      output_tokens: dados.uso?.outputTokens ?? null,
      custo_estimado: dados.uso?.custoEstimado ?? null,
      sucesso: dados.sucesso,
      erro: dados.erro ?? null,
      duracao_ms: dados.duracaoMs,
    });
  } catch (erro) {
    registrar("aviso", "Falha ao registrar chamada de IA.", { detalhe: descreverErro(erro) });
  }
}

/** O que a tela de custos do admin lê. */
export async function resumoDeCustoIa(
  organizationId: string,
  desde: Date,
): Promise<{
  chamadas: number;
  falhas: number;
  custoTotal: number;
  tokensEntrada: number;
  tokensSaida: number;
}> {
  const linhas = await selecionar("crc_ai_calls", {
    colunas: "sucesso,custo_estimado,input_tokens,output_tokens",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "criado_em", op: "gte", valor: desde.toISOString() },
    ],
    limite: 5000,
  });

  let custoTotal = 0;
  let tokensEntrada = 0;
  let tokensSaida = 0;
  let falhas = 0;

  for (const l of linhas) {
    if (l["sucesso"] === false) falhas += 1;
    const custo = l["custo_estimado"];
    if (typeof custo === "string") custoTotal += Number.parseFloat(custo) || 0;
    else if (typeof custo === "number") custoTotal += custo;
    if (typeof l["input_tokens"] === "number") tokensEntrada += l["input_tokens"];
    if (typeof l["output_tokens"] === "number") tokensSaida += l["output_tokens"];
  }

  return {
    chamadas: linhas.length,
    falhas,
    custoTotal: Number(custoTotal.toFixed(4)),
    tokensEntrada,
    tokensSaida,
  };
}
