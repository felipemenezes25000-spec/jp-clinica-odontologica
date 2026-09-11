/**
 * O supervisor — lê o turno DEPOIS que ele aconteceu, e não decide nada.
 *
 * O QUE ELE É: uma segunda leitura, estruturada, do que acabou de acontecer.
 * Resolveu? qual era a intenção? apareceu objeção? o agente violou alguma
 * política? A saída são colunas — não texto para alguém ler — porque o objetivo
 * é poder perguntar "me mostre os dez piores turnos da semana" sem ninguém
 * reler conversa.
 *
 * O QUE ELE NÃO PODE SER, NUNCA: um segundo agente com poder.
 *
 *   Não envia mensagem. Não tem porta de mensageria neste arquivo.
 *   Não chama ferramenta. Não importa `executor.ts` nem `ferramentas.ts`.
 *   Não muda dono de conversa, não cria tarefa, não mexe em agenda.
 *
 * Ele escreve em DUAS tabelas e em nenhuma outra: `crc_ai_supervisoes` e
 * `crc_ai_memories`. A restrição é estrutural, não uma promessa de comentário —
 * é a razão de ele poder rodar com um modelo barato sem isso ser assustador.
 *
 * POR QUE UMA CHAMADA SÓ, e não duas. A análise e a extração de memória leem
 * exatamente o mesmo material: a conversa e o desfecho. Separá-las dobraria o
 * custo de cada turno para produzir a mesma leitura duas vezes.
 *
 * POR QUE ELE NÃO RODA SEM `runId`. Sem a run gravada não há a que anexar a
 * supervisão — e a ausência da run significa justamente que este evento já foi
 * processado antes (o índice de dedupe recusou). Pular nesse caso é o que impede
 * um reprocessamento de pagar o supervisor de novo.
 */
import type { MemoriaCandidata } from "../dominio/memoria";
import type { PortaIa } from "../integracoes/ia/porta";

import type { MensagemDoTurno, ResultadoTurno } from "./tipos";

/* -------------------------------------------------------------------------- */
/* O contrato da leitura                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Os códigos de violação. Fechados de propósito.
 *
 * Texto livre aqui viraria quarenta grafias da mesma coisa em três meses, e
 * nenhum gráfico depois. Cada código corresponde a uma regra que o agente tem —
 * a maioria delas também vigiada por portão, o que torna a violação um sinal
 * duplo: ou o portão falhou, ou o portão barrou e o modelo tentou.
 */
export const VIOLACOES = [
  "prometeu_sem_acao",
  "conteudo_clinico",
  "citou_preco",
  "inventou_horario",
  "ignorou_a_pergunta",
  "tom_inadequado",
  "repetiu_se",
  "revelou_ser_maquina",
] as const;

export type CodigoViolacao = (typeof VIOLACOES)[number];

export type LeituraDoSupervisor = {
  resolvido: boolean;
  intencao: string | null;
  desfecho: string | null;
  objecao: string | null;
  sentimento: string | null;
  precisaHumano: boolean;
  precisaFollowup: boolean;
  /** 0 a 10. É o que permite achar os piores turnos sem ler todos. */
  notaQualidade: number | null;
  violacoes: readonly CodigoViolacao[];
  memorias: readonly { escopo: "paciente" | "organizacao"; conteudo: string; confianca: number }[];
};

export const PROMPT_SUPERVISOR = "agent_supervisor_v1";

export const ESQUEMA_SUPERVISAO: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "resolvido",
    "intencao",
    "desfecho",
    "objecao",
    "sentimento",
    "precisaHumano",
    "precisaFollowup",
    "notaQualidade",
    "violacoes",
    "memorias",
  ],
  properties: {
    resolvido: {
      type: "boolean",
      description: "A pessoa teve o que precisava neste turno.",
    },
    intencao: {
      type: ["string", "null"],
      description:
        "O que a pessoa queria, em até quatro palavras. Ex.: 'marcar avaliação', 'remarcar', 'saber preço'.",
    },
    desfecho: {
      type: ["string", "null"],
      description: "Como o turno terminou, em uma frase curta.",
    },
    objecao: {
      type: ["string", "null"],
      description:
        "A objeção que a pessoa levantou, se levantou. Ex.: 'horário não serve', 'achou caro'. Null quando não houve.",
    },
    sentimento: {
      type: ["string", "null"],
      enum: ["positivo", "neutro", "irritado", "preocupado", null],
      description: "O tom da pessoa, não o do agente.",
    },
    precisaHumano: {
      type: "boolean",
      description: "Uma pessoa da clínica precisa entrar nesta conversa.",
    },
    precisaFollowup: {
      type: "boolean",
      description: "A conversa ficou pendente e alguém precisa voltar nela depois.",
    },
    notaQualidade: {
      type: ["number", "null"],
      description: "De 0 a 10, o quanto a resposta do agente foi boa para esta pessoa.",
    },
    violacoes: {
      type: "array",
      items: { type: "string", enum: [...VIOLACOES] },
      description: "Regras que a resposta do agente violou. Vazio quando não violou nenhuma.",
    },
    memorias: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["escopo", "conteudo", "confianca"],
        properties: {
          escopo: { type: "string", enum: ["paciente", "organizacao"] },
          conteudo: {
            type: "string",
            description:
              "Um fato que a PESSOA DISSE e que muda o próximo atendimento. Uma frase curta, afirmativa.",
          },
          confianca: {
            type: "number",
            description: "0 a 1. Use acima de 0,8 só quando a pessoa disse com essas palavras.",
          },
        },
      },
      description: "Fatos ditos que valem guardar. Vazio é a resposta mais comum e está correta.",
    },
  },
};

/**
 * As instruções do supervisor.
 *
 * A REGRA DA MEMÓRIA ESTÁ AQUI TAMBÉM, apesar de `dominio/memoria.ts` já a
 * impor em código. Não por desconfiança do código — o código é quem garante —
 * mas porque um extrator que propõe dez rótulos e tem dez recusados gasta
 * tokens para produzir nada. A instrução economiza; o código protege.
 */
const INSTRUCOES = `Você revisa, DEPOIS DO FATO, um atendimento de WhatsApp de uma clínica
odontológica. Você não fala com ninguém e não executa nada: só produz a leitura.

Julgue a RESPOSTA DA CLÍNICA pela utilidade para a pessoa, não pela educação.
Uma resposta gentil que não resolve nada é nota baixa.

Sobre memórias — e esta é a parte em que errar tem custo real:

GUARDE o que a pessoa DISSE e que muda o próximo atendimento:
  "Prefere horários depois das 17h"
  "Vem sempre acompanhada da filha"
  "Trabalha em escala 12x36"

NÃO GUARDE conclusões suas sobre a pessoa, mesmo que pareçam óbvias:
  "Não tem dinheiro"            — ninguém disse isso
  "Parece ansiosa"              — diagnóstico com cara de fato
  "É difícil de lidar"          — rótulo, e ele fica anos
  "Tem cárie no molar"          — isso é prontuário, não memória

Nada de diagnóstico, remédio, sintoma, religião, política, orientação, origem,
deficiência, CPF, telefone ou endereço. Na dúvida, devolva memorias: [].`;

/* -------------------------------------------------------------------------- */
/* O pedido                                                                   */
/* -------------------------------------------------------------------------- */

export type PedidoSupervisao = {
  organizationId: string;
  conversationId: string;
  patientId: string | null;
  /** A run deste turno. Sem ela o supervisor não roda — ver o cabeçalho. */
  runId: string;
  agora: Date;
  porta: PortaIa;
  resultado: ResultadoTurno;
  /** O que o agente respondeu, ou teria respondido. */
  respostaDoAgente: string | null;
  mensagens: readonly MensagemDoTurno[];
};

export type ResultadoSupervisao =
  | { ok: true; leitura: LeituraDoSupervisor; memoriasGravadas: number; memoriasRecusadas: number }
  | { ok: false; motivo: string };

/* -------------------------------------------------------------------------- */
/* A execução                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Roda o supervisor. NUNCA LANÇA.
 *
 * Um supervisor que estoura derrubaria o turno que ele existe para observar —
 * e o turno já terminou bem. Observabilidade que quebra o observado é pior do
 * que não ter observabilidade.
 */
export async function supervisionarTurno(pedido: PedidoSupervisao): Promise<ResultadoSupervisao> {
  try {
    const r = await pedido.porta.gerarEstruturado({
      promptVersao: PROMPT_SUPERVISOR,
      instrucoes: INSTRUCOES,
      entrada: entradaDoSupervisor(pedido),
      esquema: { nome: "supervisao_do_turno", schema: ESQUEMA_SUPERVISAO },
      maxTokens: 500,
    });

    if (!r.ok) return { ok: false, motivo: `${r.motivo}: ${r.detalhe}`.slice(0, 200) };

    const leitura = interpretarLeitura(r.dados);

    // As memórias passam pelo domínio ANTES de existirem. O supervisor propõe;
    // `validarMemoria` decide.
    const { registrarMemorias } = await import("../aplicacao/memoria");
    const candidatas: MemoriaCandidata[] = leitura.memorias.map((m) => ({
      escopo: m.escopo,
      subjectId: m.escopo === "paciente" ? pedido.patientId : null,
      conteudo: m.conteudo,
      origem: "conversa",
      // A run, e não a conversa: é o que permite abrir o trace exato em que a
      // frase foi extraída, com o texto que o modelo viu.
      origemRef: `run:${pedido.runId}`,
      confianca: m.confianca,
    }));

    const registro = await registrarMemorias({
      organizationId: pedido.organizationId,
      agora: pedido.agora,
      candidatas,
    });

    await persistir(
      pedido,
      leitura,
      registro.gravadas + registro.renovadas,
      registro.recusadas.length,
    );

    return {
      ok: true,
      leitura,
      memoriasGravadas: registro.gravadas + registro.renovadas,
      memoriasRecusadas: registro.recusadas.length,
    };
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return { ok: false, motivo: detalhe.slice(0, 200) };
  }
}

/**
 * O material que o supervisor lê.
 *
 * A conversa vai inteira como ela está no contexto do turno — que já é a versão
 * sem nota interna, sem CPF e sem prontuário. O supervisor não recebe UM campo
 * a mais do que o agente recebeu: se ele precisasse de mais, seria um segundo
 * lugar por onde dado de paciente sai do banco.
 */
function entradaDoSupervisor(pedido: PedidoSupervisao): string {
  const conversa = pedido.mensagens
    .map((m) => `${m.direcao === "recebida" ? "Pessoa" : "Clínica"}: ${m.texto}`)
    .join("\n");

  const desfecho =
    pedido.resultado.tipo === "enviado"
      ? "A resposta foi enviada."
      : pedido.resultado.tipo === "candidato"
        ? "A resposta NÃO foi enviada (agente em modo sombra)."
        : `O turno terminou em "${pedido.resultado.tipo}": ${"motivo" in pedido.resultado ? pedido.resultado.motivo : ""}`;

  const partes = [`## Conversa\n${conversa}`, `## Desfecho do turno\n${desfecho}`];
  if (pedido.respostaDoAgente !== null) {
    partes.push(`## O que o agente escreveu\n${pedido.respostaDoAgente}`);
  }
  return partes.join("\n\n");
}

/**
 * Traduz o que o modelo devolveu, campo por campo, sem confiar em nenhum.
 *
 * Nada aqui lança: um campo ausente vira null, um número fora de faixa vira
 * null, uma violação desconhecida é descartada. A alternativa — recusar a
 * leitura inteira por causa de um campo — perderia a análise boa junto com o
 * campo ruim.
 */
export function interpretarLeitura(dados: Record<string, unknown>): LeituraDoSupervisor {
  const t = (chave: string): string | null => {
    const v = dados[chave];
    return typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, 160) : null;
  };

  const nota = Number(dados["notaQualidade"]);
  const violacoesCruas = Array.isArray(dados["violacoes"]) ? dados["violacoes"] : [];
  const memoriasCruas = Array.isArray(dados["memorias"]) ? dados["memorias"] : [];

  return {
    resolvido: dados["resolvido"] === true,
    intencao: t("intencao"),
    desfecho: t("desfecho"),
    objecao: t("objecao"),
    sentimento: t("sentimento"),
    precisaHumano: dados["precisaHumano"] === true,
    precisaFollowup: dados["precisaFollowup"] === true,
    notaQualidade: Number.isFinite(nota) && nota >= 0 && nota <= 10 ? nota : null,
    violacoes: violacoesCruas.filter((v): v is CodigoViolacao =>
      VIOLACOES.includes(v as CodigoViolacao),
    ),
    memorias: memoriasCruas
      .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
      .map((m) => {
        const confianca = Number(m["confianca"]);
        return {
          escopo: m["escopo"] === "organizacao" ? ("organizacao" as const) : ("paciente" as const),
          conteudo: typeof m["conteudo"] === "string" ? m["conteudo"] : "",
          confianca: Number.isFinite(confianca) ? Math.min(Math.max(confianca, 0), 1) : 0,
        };
      })
      .filter((m) => m.conteudo.length > 0),
  };
}

/** Grava a supervisão. `unique (run_id)` faz a idempotência. */
async function persistir(
  pedido: PedidoSupervisao,
  leitura: LeituraDoSupervisor,
  gravadas: number,
  recusadas: number,
): Promise<void> {
  const { inserirIgnorandoDuplicata } = await import("../servidor/banco");
  await inserirIgnorandoDuplicata("crc_ai_supervisoes", {
    organization_id: pedido.organizationId,
    run_id: pedido.runId,
    conversation_id: pedido.conversationId,
    resolvido: leitura.resolvido,
    intencao: leitura.intencao,
    desfecho: leitura.desfecho,
    objecao: leitura.objecao,
    sentimento: leitura.sentimento,
    precisa_humano: leitura.precisaHumano,
    precisa_followup: leitura.precisaFollowup,
    nota_qualidade: leitura.notaQualidade,
    violacoes: leitura.violacoes,
    memorias_gravadas: gravadas,
    memorias_recusadas: recusadas,
  });
}
