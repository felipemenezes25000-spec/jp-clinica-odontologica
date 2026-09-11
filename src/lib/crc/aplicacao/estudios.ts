/**
 * Tool Studio, Agent Studio e editor de Workflow — Fase G, itens 27 a 29.
 *
 * O QUE OS TRÊS TÊM EM COMUM, e por que moram no mesmo arquivo: todos deixam
 * uma pessoa da clínica mexer em como o agente se comporta, sem mexer em código.
 * E todos partem da mesma decisão de desenho, que é a coisa mais importante
 * aqui:
 *
 * ========================================================================
 *  O QUE É CONFIGURÁVEL É A POLÍTICA. O QUE É CÓDIGO CONTINUA CÓDIGO.
 * ========================================================================
 *
 * Uma pessoa pode DESLIGAR uma ferramenta, EXIGIR aprovação humana para ela,
 * apertar o teto de passos, mudar o texto do agente. Não pode criar uma
 * ferramenta nova, mudar o que uma ferramenta faz, nem afrouxar uma trava de
 * segurança abaixo do que o código define.
 *
 * A RAZÃO NÃO É DESCONFIANÇA DE QUEM USA. É que uma ferramenta é código que fala
 * com a agenda real de uma clínica, e "criar ferramenta pela tela" significaria
 * ou executar código digitado numa caixa de texto, ou um construtor visual que
 * reimplementa metade do TypeScript com um décimo do cuidado. As duas coisas
 * terminam com paciente na recepção sem consulta.
 *
 * A DIREÇÃO DAS TRAVAS É SÓ UMA: a configuração pode APERTAR o que o código
 * permite, nunca AFROUXAR. Quem configura consegue exigir aprovação humana para
 * `agenda.oferecer`; não consegue dispensar a aprovação de `agenda.cancelar`.
 */
import {
  acharFerramenta,
  MAX_FERRAMENTAS_POR_TURNO,
  TODAS_AS_FERRAMENTAS,
  type AprovacaoFerramenta,
} from "../ia-platform/ferramentas";

/* ========================================================================== */
/* 1. Tool Studio                                                             */
/* ========================================================================== */

export type AjusteDeFerramenta = {
  chave: string;
  /** Desligada some do catálogo que o modelo lê. */
  ligada: boolean;
  /**
   * A aprovação EXIGIDA pela clínica, quando ela quer mais do que o código pede.
   *
   * `null` significa "usa o que o código define". Um valor aqui só é aceito se
   * for MAIS restritivo — ver `mesclarAprovacao`.
   */
  aprovacaoExigida: AprovacaoFerramenta | null;
};

export type FerramentaNaTela = {
  chave: string;
  descricao: string;
  permissao: string;
  /** O que o código define. */
  aprovacaoDoCodigo: AprovacaoFerramenta;
  /** O que vale de fato, depois de mesclar com o ajuste da clínica. */
  aprovacaoEfetiva: AprovacaoFerramenta;
  ligada: boolean;
  /** `true` quando a clínica apertou além do código. Some na tela. */
  apertadaPelaClinica: boolean;
  /**
   * `true` quando esta ferramenta NÃO pode ser desligada.
   *
   * Ver `ESSENCIAIS`: desligar `conversa.passar_para_humano` deixaria o agente
   * sem porta de saída.
   */
  essencial: boolean;
};

/**
 * As ferramentas que ninguém pode desligar, e por quê.
 *
 * `conversa.passar_para_humano` é a porta de saída do agente. Sem ela, quando
 * ele percebe que não é com ele, não tem como dizer — e a alternativa é
 * responder assim mesmo.
 *
 * `paciente.marcar_opt_out` é o pedido de parar. Desligá-la significaria o
 * agente ouvir "não me mande mais mensagem" e não ter como registrar isso.
 */
const ESSENCIAIS: readonly string[] = ["conversa.passar_para_humano", "paciente.marcar_opt_out"];

/** A ordem de rigor. Só se mescla para cima. */
const RIGOR: Record<AprovacaoFerramenta, number> = {
  NENHUMA: 0,
  CONFIRMACAO_PACIENTE: 1,
  HUMANO: 2,
};

/**
 * A aprovação que vale: a MAIS restritiva entre o código e a clínica.
 *
 * É AQUI QUE A DIREÇÃO ÚNICA É IMPOSTA, e é uma linha só de código para uma
 * garantia grande. Uma clínica pode exigir que `agenda.oferecer` passe por uma
 * pessoa; nenhuma configuração dispensa a aprovação humana de `agenda.cancelar`,
 * porque `Math.max` nunca desce.
 */
/**
 * O valor veio de um formulário? Então ele é `string`, e precisa ser conferido.
 *
 * A função de servidor recebe JSON do navegador: um `aprovacaoExigida:
 * "SUPER_ADMIN"` chegaria como string e passaria direto para `mesclarAprovacao`,
 * onde `RIGOR[daClinica]` seria `undefined` e a comparação `> RIGOR[doCodigo]`
 * daria `false` — afrouxando em silêncio, que é exatamente o que a direção única
 * existe para impedir.
 */
export function ehAprovacao(v: unknown): v is AprovacaoFerramenta {
  return v === "NENHUMA" || v === "CONFIRMACAO_PACIENTE" || v === "HUMANO";
}

export function mesclarAprovacao(
  doCodigo: AprovacaoFerramenta,
  daClinica: AprovacaoFerramenta | null,
): AprovacaoFerramenta {
  if (daClinica === null) return doCodigo;
  return RIGOR[daClinica] > RIGOR[doCodigo] ? daClinica : doCodigo;
}

export async function listarFerramentasDaClinica(
  organizationId: string,
): Promise<FerramentaNaTela[]> {
  const ajustes = await lerAjustes(organizationId);

  return TODAS_AS_FERRAMENTAS.map((f) => {
    const ajuste = ajustes.get(f.chave) ?? null;
    const essencial = ESSENCIAIS.includes(f.chave);
    const efetiva = mesclarAprovacao(f.aprovacao, ajuste?.aprovacaoExigida ?? null);

    return {
      chave: f.chave,
      descricao: f.descricao,
      permissao: f.permissao,
      aprovacaoDoCodigo: f.aprovacao,
      aprovacaoEfetiva: efetiva,
      // ESSENCIAL IGNORA O AJUSTE. Nem um `ligada: false` gravado à mão no banco
      // desliga a porta de saída do agente.
      ligada: essencial ? true : (ajuste?.ligada ?? true),
      apertadaPelaClinica: efetiva !== f.aprovacao,
      essencial,
    };
  });
}

export type ResultadoAjuste = { ok: true } | { ok: false; codigo: string; motivo: string };

export async function ajustarFerramenta(pedido: {
  organizationId: string;
  chave: string;
  ligada: boolean;
  aprovacaoExigida: AprovacaoFerramenta | null;
  userId: string | null;
}): Promise<ResultadoAjuste> {
  const def = acharFerramenta(pedido.chave);
  if (def === null) {
    return { ok: false, codigo: "ferramenta_desconhecida", motivo: "Esta ferramenta não existe." };
  }

  if (ESSENCIAIS.includes(pedido.chave) && !pedido.ligada) {
    return {
      ok: false,
      codigo: "ferramenta_essencial",
      motivo:
        "Esta ferramenta não pode ser desligada: sem ela o agente fica sem como passar a conversa para uma pessoa ou registrar um pedido de parar.",
    };
  }

  /*
   * AFROUXAR É RECUSADO COM MENSAGEM, e não silenciosamente ignorado.
   *
   * `mesclarAprovacao` já garantiria a segurança sozinha — o valor mais fraco
   * seria descartado na leitura. Mas aceitar a gravação e ignorá-la faria a tela
   * mostrar "NENHUMA" enquanto o sistema aplica "HUMANO", e a pessoa passaria a
   * não confiar no que a tela diz. Recusar explicando é mais honesto.
   */
  if (pedido.aprovacaoExigida !== null && RIGOR[pedido.aprovacaoExigida] < RIGOR[def.aprovacao]) {
    return {
      ok: false,
      codigo: "afrouxaria",
      motivo: `Esta ferramenta exige “${def.aprovacao}” por definição do sistema. A configuração pode ser mais rigorosa, nunca menos.`,
    };
  }

  const { gravar, agoraIso } = await import("../servidor/banco");
  await gravar(
    "crc_settings",
    {
      organization_id: pedido.organizationId,
      chave: `ferramenta:${pedido.chave}`,
      valor: { ligada: pedido.ligada, aprovacaoExigida: pedido.aprovacaoExigida },
      atualizado_em: agoraIso(),
    },
    "organization_id,chave",
  );

  const { auditar } = await import("../servidor/registro");
  await auditar({
    organizationId: pedido.organizationId,
    userId: pedido.userId,
    ator: "humano",
    acao: "tool_studio.ajustar",
    entityType: "ferramenta",
    entityId: pedido.chave,
    depois: { ligada: pedido.ligada, aprovacaoExigida: pedido.aprovacaoExigida },
  });

  const { _limparCacheDeConfiguracao } = await import("../servidor/configuracao");
  _limparCacheDeConfiguracao();

  return { ok: true };
}

async function lerAjustes(organizationId: string): Promise<Map<string, AjusteDeFerramenta>> {
  const mapa = new Map<string, AjusteDeFerramenta>();

  try {
    const { selecionar } = await import("../servidor/banco");
    const linhas = await selecionar("crc_settings", {
      colunas: "chave,valor",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "chave", op: "like", valor: "ferramenta:*" },
      ],
      limite: 100,
    });

    for (const l of linhas) {
      const chave = String(l["chave"] ?? "").replace("ferramenta:", "");
      const v = l["valor"];
      if (chave.length === 0 || typeof v !== "object" || v === null) continue;

      const obj = v as Record<string, unknown>;
      mapa.set(chave, {
        chave,
        ligada: obj["ligada"] !== false,
        aprovacaoExigida: lerAprovacao(obj["aprovacaoExigida"]),
      });
    }
  } catch {
    /*
     * SEM AJUSTES, TUDO FICA COMO O CÓDIGO DEFINE — e não desligado.
     *
     * A direção do padrão importa: se uma falha de leitura desligasse as
     * ferramentas, uma oscilação do banco tiraria a agenda do agente e ele
     * passaria a inventar horário em vez de consultar. O padrão seguro aqui é o
     * comportamento do código, que já passou por política e portões.
     */
  }

  return mapa;
}

const lerAprovacao = (v: unknown): AprovacaoFerramenta | null =>
  v === "NENHUMA" || v === "CONFIRMACAO_PACIENTE" || v === "HUMANO" ? v : null;

/**
 * O catálogo que o modelo vê, já com os ajustes aplicados.
 *
 * É POR AQUI QUE O TOOL STUDIO TEM EFEITO. Desligar uma ferramenta na tela e ela
 * continuar aparecendo para o modelo seria a pior forma de configuração: a
 * pessoa acha que desligou, o agente continua usando.
 */
export async function ferramentasLigadas(organizationId: string): Promise<readonly string[]> {
  const lista = await listarFerramentasDaClinica(organizationId);
  return lista.filter((f) => f.ligada).map((f) => f.chave);
}

/* ========================================================================== */
/* 2. Agent Studio — os parâmetros do agente                                  */
/* ========================================================================== */

/**
 * O QUE JÁ EXISTIA e o que falta. `aplicacao/estudio.ts` cuida do TEXTO do
 * agente: rascunho, avaliação, publicação atômica. O que não existia é ajustar
 * o COMPORTAMENTO sem mexer no texto — e são coisas diferentes.
 *
 * Mudar o texto exige reavaliar (o gate da Fatia 10 existe para isso). Apertar o
 * teto de passos ou encurtar a resposta não muda o que o agente diz, muda quanto
 * ele pode fazer — e travar isso atrás do ciclo de avaliação faria a clínica
 * conviver com um agente caro demais por três dias.
 */
export type ParametrosDoAgente = {
  /** Teto de ferramentas por turno. Nunca acima do que o código permite. */
  maxFerramentas: number;
  /** Teto de caracteres da resposta. Mensagem de clínica é curta. */
  maxCaracteres: number;
  /** Temperatura do modelo, de 0 a 1. */
  temperatura: number;
};

export const PARAMETROS_PADRAO: ParametrosDoAgente = {
  maxFerramentas: MAX_FERRAMENTAS_POR_TURNO,
  // Três linhas de WhatsApp. O limite existe porque um agente que escreve
  // parágrafos soa como folheto, e ninguém lê folheto no WhatsApp.
  maxCaracteres: 600,
  /*
   * ZERO VÍRGULA TRÊS, e não o 1.0 dos exemplos de tutorial.
   *
   * Este agente não escreve ficção: ele responde sobre horário, convênio e
   * orçamento de uma clínica. Criatividade aqui tem outro nome — é invenção, e
   * inventar convênio produz paciente na recepção com um plano que não é aceito.
   */
  temperatura: 0.3,
};

export async function lerParametros(organizationId: string): Promise<ParametrosDoAgente> {
  try {
    const { selecionarUm } = await import("../servidor/banco");
    const l = await selecionarUm("crc_settings", {
      colunas: "valor",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "chave", op: "eq", valor: "agente:parametros" },
      ],
    });

    const v = l?.["valor"];
    if (typeof v !== "object" || v === null) return PARAMETROS_PADRAO;

    const obj = v as Record<string, unknown>;
    return {
      // O TETO DO CÓDIGO É TETO DE VERDADE: `Math.min` impede a configuração de
      // subir acima dele. Um turno com dez ferramentas custa dez chamadas de
      // modelo, e a fila da Fase B multiplicaria isso por todos os pacientes.
      maxFerramentas: Math.min(
        inteiro(obj["maxFerramentas"], PARAMETROS_PADRAO.maxFerramentas),
        MAX_FERRAMENTAS_POR_TURNO,
      ),
      maxCaracteres: Math.min(inteiro(obj["maxCaracteres"], PARAMETROS_PADRAO.maxCaracteres), 2000),
      temperatura: Math.min(Math.max(numero(obj["temperatura"], 0.3), 0), 1),
    };
  } catch {
    return PARAMETROS_PADRAO;
  }
}

export async function salvarParametros(pedido: {
  organizationId: string;
  parametros: Partial<ParametrosDoAgente>;
  userId: string | null;
}): Promise<void> {
  const atuais = await lerParametros(pedido.organizationId);
  const novos: ParametrosDoAgente = { ...atuais, ...pedido.parametros };

  const { gravar, agoraIso } = await import("../servidor/banco");
  await gravar(
    "crc_settings",
    {
      organization_id: pedido.organizationId,
      chave: "agente:parametros",
      valor: novos,
      atualizado_em: agoraIso(),
    },
    "organization_id,chave",
  );

  const { auditar } = await import("../servidor/registro");
  await auditar({
    organizationId: pedido.organizationId,
    userId: pedido.userId,
    ator: "humano",
    acao: "agent_studio.parametros",
    entityType: "agente",
    entityId: null,
    antes: atuais,
    depois: novos,
  });
}

const inteiro = (v: unknown, padrao: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : padrao;
};

const numero = (v: unknown, padrao: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : padrao;
};

/* ========================================================================== */
/* 3. O editor de Workflow                                                    */
/* ========================================================================== */

/**
 * O QUE ESTE "EDITOR" É, e por que ele não é um construtor visual.
 *
 * A matriz de aceite marcava o item 29 como `NOT_APPLICABLE`: "editor não
 * entregue — recorte declarado no roadmap". A decisão continua valendo, e vale
 * escrever o porquê em vez de deixar a linha como omissão.
 *
 * UM CONSTRUTOR VISUAL DE WORKFLOW, do tipo que se arrasta caixinhas, é uma
 * linguagem de programação com interface gráfica. Quem o constrói acaba
 * reimplementando condicional, laço, tratamento de erro e tipos — com um décimo
 * do cuidado de uma linguagem de verdade, e sem revisão de código, sem teste,
 * sem histórico. Num sistema que marca consulta na agenda real de uma clínica,
 * isso é um jeito elaborado de produzir estrago.
 *
 * O QUE ESTE MÓDULO ENTREGA NO LUGAR: as automações já existem em
 * `crc_automations`, definidas em código e versionadas em
 * `crc_automation_versions`. O que faltava era a pessoa da clínica poder LIGAR,
 * DESLIGAR e AJUSTAR PARÂMETROS de cada uma sem um deploy.
 *
 * É menos do que um construtor visual. É também o que resolve o problema real:
 * ninguém na clínica quer inventar uma jornada nova — querem que o lembrete de
 * consulta saia 48 horas antes em vez de 24.
 */
/**
 * O MODO É A ESCADA DE SEGURANÇA, e é o que esta tela existe para operar.
 *
 * O schema já previa os três degraus, e eles são o desenho mais importante do
 * motor de automação:
 *
 *   SHADOW      calcula tudo e NÃO executa nada. É como toda automação nova
 *               nasce. Serve para a clínica ver o que ELA faria antes de deixar.
 *
 *   RECOMENDAR  em vez de agir, cria tarefa para uma pessoa. O passo do meio, e
 *               o mais subestimado: é onde se descobre que a jornada dispara
 *               para o paciente errado, sem que o paciente errado receba nada.
 *
 *   EXECUTAR    age sozinha.
 *
 * O QUE ESTE MÓDULO IMPEDE: pular degraus. Ir de SHADOW direto para EXECUTAR é
 * ligar uma automação que nunca teve um único caso conferido por gente.
 */
export type ModoDaJornada = "SHADOW" | "RECOMENDAR" | "EXECUTAR";

const DEGRAUS: readonly ModoDaJornada[] = ["SHADOW", "RECOMENDAR", "EXECUTAR"];

export type JornadaNaTela = {
  id: string;
  chave: string;
  nome: string;
  descricao: string;
  /** ATIVA | PAUSADA | RASCUNHO. */
  status: string;
  modo: ModoDaJornada;
  versaoAtiva: number;
  /** Quantas pessoas estão dentro dela agora. */
  inscritos: number;
  /** O próximo degrau, quando existe. `null` quando já está em EXECUTAR. */
  proximoModo: ModoDaJornada | null;
};

export async function listarJornadas(organizationId: string): Promise<JornadaNaTela[]> {
  const { selecionar, contar } = await import("../servidor/banco");

  const linhas = await selecionar("crc_automations", {
    colunas: "id,chave,nome,descricao,status,modo,versao_ativa",
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
    ordenar: [{ coluna: "nome", ascendente: true }],
    limite: 100,
  });

  const saida: JornadaNaTela[] = [];
  for (const l of linhas) {
    const id = String(l["id"] ?? "");
    /*
     * A CONTAGEM DE INSCRITOS É O QUE TORNA A TELA ÚTIL.
     *
     * "Desligar esta jornada" e "desligar esta jornada com 340 pessoas dentro"
     * são decisões diferentes, e a segunda merece hesitação. Sem o número, as
     * duas parecem iguais — e quem desliga descobre o tamanho do estrago depois.
     */
    const inscritos = await contar("crc_automation_enrollments", [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "automation_id", op: "eq", valor: id },
      { coluna: "status", op: "in", valor: ["ACTIVE", "WAITING"] },
    ]).catch(() => 0);

    const modo = lerModo(l["modo"]);
    const i = DEGRAUS.indexOf(modo);

    saida.push({
      id,
      chave: String(l["chave"] ?? ""),
      nome: String(l["nome"] ?? ""),
      descricao: String(l["descricao"] ?? ""),
      status: String(l["status"] ?? "RASCUNHO"),
      modo,
      versaoAtiva: Number(l["versao_ativa"] ?? 1),
      inscritos,
      proximoModo: DEGRAUS[i + 1] ?? null,
    });
  }

  return saida;
}

export type ResultadoJornada = { ok: true } | { ok: false; codigo: string; motivo: string };

/**
 * Sobe a jornada UM degrau. Nunca dois.
 *
 * A RESTRIÇÃO É O PONTO DA FUNÇÃO. Pular de SHADOW direto para EXECUTAR é ligar
 * uma automação que nunca teve um único caso conferido por gente — e automação
 * de clínica manda mensagem para paciente. O degrau do meio, RECOMENDAR, é onde
 * se descobre que ela dispara para a pessoa errada, sem que a pessoa errada
 * receba nada.
 *
 * DESCER É SEMPRE PERMITIDO, em qualquer distância. Quem está voltando atrás
 * está reduzindo o que o sistema faz sozinho, e nunca se deve pôr atrito no
 * caminho de quem quer que o sistema faça menos.
 */
export async function mudarModoDaJornada(pedido: {
  organizationId: string;
  automationId: string;
  modo: ModoDaJornada;
  userId: string | null;
}): Promise<ResultadoJornada> {
  const atuais = await listarJornadas(pedido.organizationId);
  const jornada = atuais.find((j) => j.id === pedido.automationId);

  if (jornada === undefined) {
    return { ok: false, codigo: "jornada_desconhecida", motivo: "Esta jornada não existe." };
  }

  const de = DEGRAUS.indexOf(jornada.modo);
  const para = DEGRAUS.indexOf(pedido.modo);

  if (para > de + 1) {
    return {
      ok: false,
      codigo: "pulou_degrau",
      motivo: `Esta jornada está em ${jornada.modo}. Passe primeiro por ${String(DEGRAUS[de + 1])}: é lá que se descobre se ela dispara para a pessoa certa, sem ninguém receber nada.`,
    };
  }

  const { atualizar, agoraIso } = await import("../servidor/banco");
  await atualizar(
    "crc_automations",
    [
      { coluna: "id", op: "eq", valor: pedido.automationId },
      { coluna: "organization_id", op: "eq", valor: pedido.organizationId },
    ],
    { modo: pedido.modo, atualizado_em: agoraIso() },
  );

  const { auditar } = await import("../servidor/registro");
  await auditar({
    organizationId: pedido.organizationId,
    userId: pedido.userId,
    ator: "humano",
    acao: para > de ? "workflow.subir_degrau" : "workflow.descer_degrau",
    entityType: "automacao",
    entityId: pedido.automationId,
    antes: { modo: jornada.modo },
    depois: { modo: pedido.modo, inscritosNoMomento: jornada.inscritos },
  });

  return { ok: true };
}

export async function ligarJornada(pedido: {
  organizationId: string;
  automationId: string;
  ativa: boolean;
  userId: string | null;
}): Promise<void> {
  const { atualizar, agoraIso } = await import("../servidor/banco");
  await atualizar(
    "crc_automations",
    [
      { coluna: "id", op: "eq", valor: pedido.automationId },
      { coluna: "organization_id", op: "eq", valor: pedido.organizationId },
    ],
    { status: pedido.ativa ? "ATIVA" : "PAUSADA", atualizado_em: agoraIso() },
  );

  const { auditar } = await import("../servidor/registro");
  await auditar({
    organizationId: pedido.organizationId,
    userId: pedido.userId,
    ator: "humano",
    acao: pedido.ativa ? "workflow.ligar" : "workflow.desligar",
    entityType: "automacao",
    entityId: pedido.automationId,
    depois: { status: pedido.ativa ? "ATIVA" : "PAUSADA" },
  });
}

const lerModo = (v: unknown): ModoDaJornada =>
  v === "RECOMENDAR" || v === "EXECUTAR" ? v : "SHADOW";
