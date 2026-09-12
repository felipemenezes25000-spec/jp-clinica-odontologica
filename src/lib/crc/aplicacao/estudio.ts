/**
 * O Estúdio — as versões do texto do agente. Fatia 10.
 *
 * O CICLO QUE ESTE ARQUIVO FECHA, e que é o ponto da fatia inteira:
 *
 *   1. Alguém edita o texto do agente. Isso cria um RASCUNHO, e o rascunho não
 *      fala com paciente nenhum.
 *   2. A avaliação roda SOBRE O RASCUNHO. Os nove casos passam pelo texto novo,
 *      não pelo publicado.
 *   3. Só uma rodada que avaliou ESTE rascunho e passou libera publicá-lo.
 *   4. Publicado, ele passa a ser o texto do agente — e o anterior fica no
 *      histórico.
 *
 * O PASSO 2 É O QUE FAZ O CICLO VALER. Sem ele, a suíte aprovaria um texto e
 * alguém publicaria outro: o gate ficaria aprovando o passado, com a aparência de
 * estar funcionando. É o vínculo `crc_eval_rodadas.agent_version_id`.
 *
 * PUBLICADO NÃO SE EDITA NO LUGAR (ADR-09): editar cria rascunho, nunca altera a
 * versão publicada.
 */
import { INSTRUCOES_DO_AGENTE } from "../ia-platform/instrucoes";
import { agoraIso, atualizar, inserir, rpc, selecionar, selecionarUm } from "../servidor/banco";

/* -------------------------------------------------------------------------- */
/* Leitura                                                                    */
/* -------------------------------------------------------------------------- */

export type VersaoDoAgente = {
  id: string;
  versao: number;
  instrucoes: string;
  status: string;
  rodadaId: string | null;
  criadoEm: string;
  publicadoEm: string | null;
};

/**
 * A versão publicada, ou `null` quando a clínica nunca publicou.
 *
 * `null` NÃO é erro: significa "o agente está usando o texto que vem no código".
 * É o estado normal no primeiro dia, e a diferença entre `null` e uma versão
 * publicada é o que o gate usa para saber qual rodada olhar.
 */
export async function versaoPublicada(organizationId: string): Promise<VersaoDoAgente | null> {
  try {
    const l = await selecionarUm("crc_agent_versions", {
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "status", op: "eq", valor: "PUBLICADA" },
      ],
    });
    return l === null ? null : deLinha(l);
  } catch {
    // Tabela ainda não criada: o agente segue com o texto do código.
    return null;
  }
}

export async function rascunhoDoAgente(organizationId: string): Promise<VersaoDoAgente | null> {
  const l = await selecionarUm("crc_agent_versions", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "status", op: "eq", valor: "RASCUNHO" },
    ],
  });
  return l === null ? null : deLinha(l);
}

export async function listarVersoes(organizationId: string): Promise<VersaoDoAgente[]> {
  const linhas = await selecionar("crc_agent_versions", {
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
    ordenar: [{ coluna: "versao", ascendente: false }],
    limite: 30,
  });
  return linhas.map(deLinha);
}

function deLinha(l: Record<string, unknown>): VersaoDoAgente {
  return {
    id: String(l["id"] ?? ""),
    versao: Number(l["versao"] ?? 1),
    instrucoes: String(l["instrucoes"] ?? ""),
    status: String(l["status"] ?? "RASCUNHO"),
    rodadaId: typeof l["rodada_id"] === "string" ? l["rodada_id"] : null,
    criadoEm: String(l["criado_em"] ?? ""),
    publicadoEm: typeof l["publicado_em"] === "string" ? l["publicado_em"] : null,
  };
}

/**
 * O texto que o agente usa AGORA.
 *
 * É a única função que `turno.ts` chama, e o fallback é o que faz a Fatia 10 não
 * quebrar quem nunca abriu o Estúdio: sem versão publicada, vale a constante do
 * código.
 *
 * ============================================================================
 *  `{{clinica}}` É SUBSTITUÍDO AQUI, e isso conserta a primeira linha do prompt.
 *
 *  Ela era: "Você atende pelo WhatsApp da JP Clínica Integrada Odontológica." —
 *  escrita no runtime. Num SaaS é o agente de um cliente se apresentando como
 *  outro, na primeira frase que o paciente lê. E o modelo obedece: ele repete o
 *  nome errado com naturalidade, porque foi o que mandaram.
 *
 *  A SUBSTITUIÇÃO VALE TAMBÉM PARA A VERSÃO PUBLICADA, de propósito: quem
 *  reescreve o prompt na tela do Estúdio pode usar `{{clinica}}` em vez de
 *  digitar o próprio nome — e continua funcionando se a clínica for renomeada.
 * ============================================================================
 */
export async function instrucoesEmUso(organizationId: string): Promise<string> {
  const texto = await instrucoesBrutasEmUso(organizationId);

  const { nomeDaMarca } = await import("./marca");
  const { aplicarVariaveis } = await import("../automacao/templates");

  return aplicarVariaveis(texto, { clinica: await nomeDaMarca(organizationId) });
}

/**
 * O MESMO TEXTO, SEM SUBSTITUIR NADA — para o Estudio.
 *
 * A DIFERENCA IMPORTA numa linha so: o rascunho precisa nascer com
 * `{{clinica}}` dentro, e nao com o nome ja resolvido. Copiar o texto resolvido
 * congelaria o nome de hoje no prompt de amanha — e a clinica que se renomear
 * continuaria se apresentando pelo nome antigo, sem ninguem entender de onde
 * ele sai.
 */
export async function instrucoesBrutasEmUso(organizationId: string): Promise<string> {
  const publicada = await versaoPublicada(organizationId);
  return publicada === null ? INSTRUCOES_DO_AGENTE : publicada.instrucoes;
}

/* -------------------------------------------------------------------------- */
/* Escrita                                                                    */
/* -------------------------------------------------------------------------- */

/** Abaixo disso não é instrução de agente, é um recado. */
const MIN_CARACTERES = 120;

export type ResultadoRascunho =
  { ok: true; id: string; versao: number } | { ok: false; codigo: string; motivo: string };

/**
 * Salva o rascunho. Cria a versão seguinte quando não existe rascunho aberto.
 *
 * A NUMERAÇÃO PULA A PUBLICADA, e não continua de 1: a versão 4 é sempre depois da
 * 3, mesmo que a 3 tenha sido descartada. Reaproveitar número faria dois textos
 * diferentes atenderem pelo mesmo nome no histórico — e o histórico existe
 * justamente para responder "o que estava publicado na terça?".
 */
export async function salvarRascunho(pedido: {
  organizationId: string;
  instrucoes: string;
  userId?: string | null;
}): Promise<ResultadoRascunho> {
  const instrucoes = pedido.instrucoes.trim();
  if (instrucoes.length < MIN_CARACTERES) {
    return {
      ok: false,
      codigo: "curto",
      motivo: `O texto tem ${String(instrucoes.length)} caracteres. Instrução de agente com menos de ${String(MIN_CARACTERES)} deixa o modelo inventar o resto.`,
    };
  }

  const aberto = await rascunhoDoAgente(pedido.organizationId);
  if (aberto !== null) {
    await atualizar("crc_agent_versions", [{ coluna: "id", op: "eq", valor: aberto.id }], {
      instrucoes,
      // Mexer no texto invalida a avaliação que aprovou o texto anterior. Sem
      // isto, editar depois de avaliar liberaria publicar o que ninguém testou.
      rodada_id: null,
    });
    return { ok: true, id: aberto.id, versao: aberto.versao };
  }

  const todas = await listarVersoes(pedido.organizationId);
  const proxima = todas.reduce((maior, v) => Math.max(maior, v.versao), 0) + 1;

  const criadas = await inserir("crc_agent_versions", {
    organization_id: pedido.organizationId,
    versao: proxima,
    instrucoes,
    status: "RASCUNHO",
    criado_por: pedido.userId ?? null,
  });

  return { ok: true, id: String(criadas[0]?.["id"] ?? ""), versao: proxima };
}

export type ResultadoPublicacao = { ok: boolean; codigo: string; motivo: string };

/**
 * Publica o rascunho. Exige avaliação DESTE rascunho, aprovada e recente.
 *
 * AS TRÊS RECUSAS, e cada uma cobre um jeito diferente de publicar às cegas:
 *
 *   sem rascunho        não há o que publicar.
 *   sem avaliação dele  a suíte nunca viu este texto. Pode ter aprovado o
 *                       anterior, o que não diz nada sobre este.
 *   avaliação velha     mais de 72h. Modelo e material mudam.
 */
export async function publicarRascunho(pedido: {
  organizationId: string;
  userId?: string | null;
  agora?: Date;
}): Promise<ResultadoPublicacao> {
  const agora = pedido.agora ?? new Date();
  const rascunho = await rascunhoDoAgente(pedido.organizationId);

  if (rascunho === null) {
    return { ok: false, codigo: "sem_rascunho", motivo: "Não há rascunho para publicar." };
  }

  const { rodadaPorId } = await import("./avaliacao");
  const { aprovacaoAindaVale } = await import("../dominio/avaliacao");

  /*
   * A APROVAÇÃO É LIDA DE `rascunho.rodadaId`, E NÃO "a última rodada desta
   * versão".
   *
   * A diferença aparece num caso que acontece todo dia: a pessoa avalia, o texto
   * passa, ela lê a resposta e ajusta uma frase. `salvarRascunho` limpa
   * `rodada_id` nessa hora — é o texto novo, e ninguém o avaliou. Procurando "a
   * última rodada desta versão" a aprovação do texto ANTERIOR continuaria valendo,
   * e a edição de última hora entraria no ar sem prova.
   */
  const rodada =
    rascunho.rodadaId === null ? null : await rodadaPorId(pedido.organizationId, rascunho.rodadaId);

  if (rodada === null) {
    return {
      ok: false,
      codigo: "sem_avaliacao",
      motivo:
        "Este texto ainda não foi avaliado. Rode a avaliação sobre o rascunho antes de publicar.",
    };
  }
  if (!rodada.liberado) {
    const primeiro = rodada.bloqueios[0];
    return {
      ok: false,
      codigo: "avaliacao_reprovada",
      motivo:
        primeiro === undefined
          ? "A avaliação deste texto não liberou a publicação."
          : `A avaliação deste texto falhou em “${primeiro.caso}”. Corrija o texto e rode de novo.`,
    };
  }
  if (!aprovacaoAindaVale(rodada.criadoEm, agora)) {
    return {
      ok: false,
      codigo: "avaliacao_velha",
      motivo: "A avaliação deste texto tem mais de 72 horas. Rode de novo antes de publicar.",
    };
  }

  /*
   * AS DUAS ESCRITAS VIRARAM UMA — Fase D.
   *
   * Arquivar a publicada e publicar o rascunho eram dois `update` separados, e
   * cada chamada ao PostgREST é uma transação própria. Morrer entre as duas
   * deixava a clínica SEM VERSÃO PUBLICADA.
   *
   * E o modo como isso aparece é o problema: `turno.ts` não quebra sem versão
   * publicada — ele cai no texto que vem no código. O agente simplesmente passa
   * a falar com a personalidade padrão, e a única pista é alguém estranhar que
   * as respostas mudaram.
   *
   * A ORDEM CONTINUA SENDO ARQUIVAR PRIMEIRO, por causa do índice parcial
   * `uq_crc_agent_versions_publicada`. O que mudou é que agora as duas coisas
   * acontecem ou nenhuma acontece.
   *
   * AS RECUSAS CONTINUAM AQUI EM CIMA, em TypeScript, de propósito: o gate de
   * avaliação é regra de produto, e regra de produto em PL/pgSQL é regra que
   * ninguém revisa. No SQL mora só a atomicidade.
   */
  try {
    await rpc("crc_publicar_versao_agente", {
      p_organization_id: pedido.organizationId,
      p_versao_id: rascunho.id,
      p_rodada_id: rodada.id,
      p_user_id: pedido.userId ?? null,
    });
  } catch (erro) {
    // `rascunho_indisponivel` é a corrida: outra aba publicou, ou o rascunho
    // virou outra coisa entre a checagem e a gravação. Nada foi alterado — o
    // rollback da transação incluiu o arquivamento.
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return detalhe.includes("rascunho_indisponivel")
      ? {
          ok: false,
          codigo: "rascunho_mudou",
          motivo: "Este rascunho mudou enquanto você publicava. Recarregue e tente de novo.",
        }
      : { ok: false, codigo: "falha_ao_publicar", motivo: detalhe.slice(0, 200) };
  }

  return { ok: true, codigo: "", motivo: "" };
}

/**
 * Anota, na versão, qual rodada a avaliou.
 *
 * É O PAR DA LIMPEZA FEITA EM `salvarRascunho`: editar apaga a aprovação, avaliar
 * a devolve. Sem esta função, o `rodada_id` do rascunho nunca seria preenchido e
 * publicar seria impossível — o que é seguro e inútil.
 */
export async function registrarAvaliacaoDaVersao(
  organizationId: string,
  versaoId: string,
  rodadaId: string,
): Promise<void> {
  await atualizar(
    "crc_agent_versions",
    [
      { coluna: "id", op: "eq", valor: versaoId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { rodada_id: rodadaId },
  );
}

/** Descarta o rascunho. O histórico das publicadas não é tocado. */
export async function descartarRascunho(organizationId: string): Promise<void> {
  const rascunho = await rascunhoDoAgente(organizationId);
  if (rascunho === null) return;
  await atualizar("crc_agent_versions", [{ coluna: "id", op: "eq", valor: rascunho.id }], {
    status: "ARQUIVADA",
  });
}

/**
 * Abre um rascunho a partir do texto em uso.
 *
 * Existe porque a alternativa — a tela mandar o texto atual de volta no primeiro
 * "salvar" — faria o rascunho nascer com o que estava na caixa do navegador, e não
 * com o que está publicado. A diferença aparece quando duas pessoas abrem a tela.
 */
export async function rascunhoAPartirDoAtual(pedido: {
  organizationId: string;
  userId?: string | null;
}): Promise<ResultadoRascunho> {
  const aberto = await rascunhoDoAgente(pedido.organizationId);
  if (aberto !== null) return { ok: true, id: aberto.id, versao: aberto.versao };

  return salvarRascunho({
    organizationId: pedido.organizationId,
    // BRUTAS: o rascunho guarda `{{clinica}}`, e nao o nome de hoje.
    instrucoes: await instrucoesBrutasEmUso(pedido.organizationId),
    userId: pedido.userId ?? null,
  });
}
