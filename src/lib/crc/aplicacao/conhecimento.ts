/**
 * Conhecimento — ingestão e busca. Fatia 7.
 *
 * A DECISÃO QUE GOVERNA ESTE ARQUIVO: **o conhecimento antigo só é apagado
 * depois de o novo estar pronto.**
 *
 * O caminho ingênuo é apagar os pedaços da fonte e ir gravando os novos à medida
 * que os vetores chegam. Ele falha do pior jeito possível: o provedor cai no
 * meio, a clínica fica com metade do documento indexado, e ninguém percebe —
 * porque a busca continua respondendo, só que errado e pela metade. Aqui os
 * vetores são todos calculados primeiro, em memória, e só então a troca acontece.
 * Se a chamada falhar, nada muda.
 *
 * A OUTRA: a dimensão é conferida ANTES de começar. `crc_knowledge_chunks.
 * embedding` é `vector(1536)`, fixo no schema. Um modelo de outra dimensão faria
 * o Postgres recusar o insert no meio da troca.
 */
import {
  MAX_TRECHOS_NO_CONTEXTO,
  partirEmChunks,
  reordenarTrechos,
  type TrechoEncontrado,
  type TrechoReordenado,
} from "../dominio/conhecimento";
import {
  DIMENSOES_EMBEDDING,
  type PortaEmbeddings,
  type UsoEmbeddings,
} from "../integracoes/ia/embeddings";
import {
  agoraIso,
  apagar,
  atualizar,
  gravar,
  inserir,
  rpc,
  selecionar,
  selecionarUm,
} from "../servidor/banco";

/**
 * Quantos textos por chamada de embedding.
 *
 * Um lote grande economiza ida e volta; um lote gigante estoura o limite de
 * tokens da chamada e devolve erro para o documento inteiro em vez de para uma
 * parte. 64 pedaços de 700 caracteres é folgado nos dois lados.
 */
const LOTE_EMBEDDINGS = 64;

/* -------------------------------------------------------------------------- */
/* A fonte                                                                    */
/* -------------------------------------------------------------------------- */

export type FonteDeConhecimento = {
  id: string;
  titulo: string;
  tipo: string;
  corpo: string;
  status: string;
  versao: number;
  pedacos: number;
  atualizadoEm: string;
};

/**
 * Cria ou atualiza uma fonte. SEMPRE volta para RASCUNHO quando o texto muda.
 *
 * Editar o texto de uma fonte publicada e deixá-la publicada significaria que a
 * versão nova já está respondendo paciente antes de alguém reler. Voltar para
 * rascunho é chato de propósito: publicar é um segundo clique.
 */
export async function salvarFonte(pedido: {
  organizationId: string;
  titulo: string;
  tipo: string;
  corpo: string;
  userId?: string | null;
}): Promise<{ id: string; mudou: boolean }> {
  const titulo = pedido.titulo.trim().slice(0, 160);
  const corpo = pedido.corpo.trim();

  const existente = await selecionarUm("crc_knowledge_sources", {
    colunas: "id,corpo,versao",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: pedido.organizationId },
      { coluna: "titulo", op: "eq", valor: titulo },
    ],
  });

  if (existente !== null) {
    const id = String(existente["id"] ?? "");
    const antes = String(existente["corpo"] ?? "");
    if (antes === corpo) return { id, mudou: false };

    const versao = Number(existente["versao"] ?? 1);
    await atualizar("crc_knowledge_sources", [{ coluna: "id", op: "eq", valor: id }], {
      corpo,
      tipo: pedido.tipo,
      // Ver o cabeçalho desta função.
      status: "RASCUNHO",
      versao: (Number.isFinite(versao) ? versao : 1) + 1,
      atualizado_em: agoraIso(),
    });
    return { id, mudou: true };
  }

  const criadas = await gravar(
    "crc_knowledge_sources",
    {
      organization_id: pedido.organizationId,
      titulo,
      tipo: pedido.tipo,
      corpo,
      status: "RASCUNHO",
      versao: 1,
      criado_por: pedido.userId ?? null,
      atualizado_em: agoraIso(),
    },
    "organization_id,titulo",
  );

  return { id: String(criadas[0]?.["id"] ?? ""), mudou: true };
}

/**
 * Publica a fonte. Daqui em diante ela responde paciente.
 *
 * RECUSA PUBLICAR FONTE SEM PEDAÇO INDEXADO. Uma fonte publicada e não indexada
 * é invisível para a busca — e produz o pior diagnóstico possível: "está
 * publicado e o agente não usa", sem nada na tela explicando por quê.
 */
export async function publicarFonte(
  organizationId: string,
  sourceId: string,
): Promise<{ ok: boolean; motivo: string }> {
  const { contar } = await import("../servidor/banco");
  const pedacos = await contar("crc_knowledge_chunks", [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "source_id", op: "eq", valor: sourceId },
  ]);

  if (pedacos === 0) {
    return {
      ok: false,
      motivo: "Este texto ainda não foi indexado. Clique em “Indexar” antes de publicar.",
    };
  }

  await atualizar(
    "crc_knowledge_sources",
    [
      { coluna: "id", op: "eq", valor: sourceId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { status: "PUBLICADA", atualizado_em: agoraIso() },
  );
  return { ok: true, motivo: "" };
}

export async function arquivarFonte(organizationId: string, sourceId: string): Promise<void> {
  await atualizar(
    "crc_knowledge_sources",
    [
      { coluna: "id", op: "eq", valor: sourceId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { status: "ARQUIVADA", atualizado_em: agoraIso() },
  );
}

export async function listarFontes(organizationId: string): Promise<FonteDeConhecimento[]> {
  const fontes = await selecionar("crc_knowledge_sources", {
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
    ordenar: [{ coluna: "titulo", ascendente: true }],
    limite: 100,
  });

  // A contagem de pedaços em UMA leitura, e não uma por fonte.
  const pedacos = await selecionar("crc_knowledge_chunks", {
    colunas: "source_id",
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
    limite: 2000,
  });
  const porFonte = new Map<string, number>();
  for (const p of pedacos) {
    const id = String(p["source_id"] ?? "");
    porFonte.set(id, (porFonte.get(id) ?? 0) + 1);
  }

  return fontes.map((f) => {
    const id = String(f["id"] ?? "");
    return {
      id,
      titulo: String(f["titulo"] ?? ""),
      tipo: String(f["tipo"] ?? "texto"),
      corpo: String(f["corpo"] ?? ""),
      status: String(f["status"] ?? "RASCUNHO"),
      versao: Number(f["versao"] ?? 1),
      pedacos: porFonte.get(id) ?? 0,
      atualizadoEm: String(f["atualizado_em"] ?? f["criado_em"] ?? ""),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Ingestão                                                                   */
/* -------------------------------------------------------------------------- */

export type ResultadoIngestao =
  | { ok: true; pedacos: number; custoEstimado: number | null }
  | { ok: false; codigo: string; motivo: string };

/**
 * Parte o texto, calcula os vetores e TROCA os pedaços da fonte.
 *
 * A ordem das quatro etapas é a garantia: partir → embutir tudo → apagar o
 * antigo → gravar o novo. Ver o cabeçalho do arquivo.
 */
export async function ingerirFonte(pedido: {
  organizationId: string;
  sourceId: string;
  porta: PortaEmbeddings;
}): Promise<ResultadoIngestao> {
  if (pedido.porta.dimensoes !== DIMENSOES_EMBEDDING) {
    return {
      ok: false,
      codigo: "dimensao_incompativel",
      motivo: `O modelo de busca configurado produz ${String(pedido.porta.dimensoes)} dimensões, e o banco guarda ${String(DIMENSOES_EMBEDDING)}. Trocar de modelo exige migrar a coluna.`,
    };
  }

  const fonte = await selecionarUm("crc_knowledge_sources", {
    colunas: "id,corpo",
    filtros: [
      { coluna: "id", op: "eq", valor: pedido.sourceId },
      { coluna: "organization_id", op: "eq", valor: pedido.organizationId },
    ],
  });
  if (fonte === null) {
    return { ok: false, codigo: "fonte_inexistente", motivo: "Este texto não existe mais." };
  }

  const chunks = partirEmChunks(String(fonte["corpo"] ?? ""), pedido.sourceId);
  if (chunks.length === 0) {
    return { ok: false, codigo: "texto_vazio", motivo: "Não há texto para indexar." };
  }

  // --- todos os vetores primeiro, em memória ---------------------------------
  const vetores: number[][] = [];
  let custo: number | null = 0;

  for (let i = 0; i < chunks.length; i += LOTE_EMBEDDINGS) {
    const lote = chunks.slice(i, i + LOTE_EMBEDDINGS);
    const r = await pedido.porta.gerar(lote.map((c) => c.conteudo));
    if (!r.ok) {
      // Nada foi apagado ainda. O conhecimento que já respondia continua
      // respondendo, e a mensagem diz o que aconteceu.
      return { ok: false, codigo: r.motivo, motivo: r.detalhe };
    }
    for (const v of r.vetores) vetores.push([...v]);
    custo = somarCusto(custo, r.uso);
  }

  if (vetores.length !== chunks.length) {
    return {
      ok: false,
      codigo: "vetores_incompletos",
      motivo: "O provedor devolveu menos vetores do que pedaços.",
    };
  }

  /*
   * A TROCA, AGORA ATÔMICA — Fase D.
   *
   * O QUE HAVIA AQUI eram duas chamadas: `apagar` e depois `inserir`. Entre elas
   * a fonte fica com ZERO pedaços — e o agente não para de atender durante uma
   * reindexação.
   *
   * O efeito, na boca do paciente: ele pergunta "vocês aceitam meu convênio?" e
   * recebe "não tenho essa informação" de uma clínica que TEM a informação
   * cadastrada. Dura segundos, volta ao normal sozinho, e é irreprodutível — o
   * pior formato possível de defeito.
   *
   * E se o `inserir` falhasse, o buraco era permanente: o conhecimento antigo já
   * tinha ido embora.
   *
   * `crc_trocar_conhecimento` faz DELETE e INSERT na mesma transação. Quem lê no
   * meio vê o conteúdo ANTIGO, inteiro.
   */
  const gravados = await rpc("crc_trocar_conhecimento", {
    p_organization_id: pedido.organizationId,
    p_source_id: pedido.sourceId,
    p_pedacos: chunks.map((c, i) => ({
      ordem: c.ordem,
      conteudo: c.conteudo,
      tamanho: c.conteudo.length,
      // O vetor vai como texto no formato do pgvector: `[0.1,0.2,...]`. Mandar
      // array JSON faria o cast `::vector` falhar com uma mensagem que não
      // explica nada.
      embedding: vetores[i] === undefined ? null : `[${(vetores[i] ?? []).join(",")}]`,
      chave_dedupe: c.chaveDedupe,
    })),
  });
  void gravados;

  return { ok: true, pedacos: chunks.length, custoEstimado: custo };
}

const somarCusto = (antes: number | null, uso: UsoEmbeddings): number | null =>
  uso.custoEstimado === null ? antes : (antes ?? 0) + uso.custoEstimado;

/* -------------------------------------------------------------------------- */
/* Busca                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Quantos candidatos a busca vetorial devolve antes da reordenação.
 *
 * Cinco vezes o que chega ao modelo. Pedir só quatro tornaria a reordenação
 * decorativa: ela existe justamente para resgatar o trecho que o vetor colocou
 * em sétimo lugar e que tem a palavra exata da pergunta.
 */
export const CANDIDATOS_VETORIAIS = 20;

export type ResultadoBusca =
  | { ok: true; trechos: TrechoReordenado[]; custoEstimado: number | null }
  | { ok: false; codigo: string; motivo: string };

/**
 * Busca por significado, com reordenação por palavra.
 *
 * O FILTRO DE ORGANIZAÇÃO NÃO ESTÁ AQUI — está dentro de
 * `crc_buscar_conhecimento`, junto com a exigência de a fonte estar PUBLICADA.
 * É de propósito: busca vetorial filtrada depois da vizinhança é o defeito
 * clássico de RAG multi-tenant, e o único jeito de ele não poder acontecer é o
 * filtro não passar por aqui. Ver `supabase/12-crc-conhecimento.sql`.
 */
export async function buscarConhecimento(pedido: {
  organizationId: string;
  consulta: string;
  porta: PortaEmbeddings;
  maximo?: number;
}): Promise<ResultadoBusca> {
  const consulta = pedido.consulta.trim();
  if (consulta.length < 3) {
    return { ok: false, codigo: "consulta_curta", motivo: "A pergunta está curta demais." };
  }

  const r = await pedido.porta.gerar([consulta]);
  if (!r.ok) return { ok: false, codigo: r.motivo, motivo: r.detalhe };

  const vetor = r.vetores[0];
  if (vetor === undefined) {
    return {
      ok: false,
      codigo: "sem_vetor",
      motivo: "O provedor não devolveu o vetor da pergunta.",
    };
  }

  const linhas = await rpc("crc_buscar_conhecimento", {
    p_organization_id: pedido.organizationId,
    p_embedding: [...vetor],
    p_limite: CANDIDATOS_VETORIAIS,
    p_minimo: 0,
  });

  const candidatos: TrechoEncontrado[] = linhas.map((l) => ({
    id: String(l["id"] ?? ""),
    sourceId: String(l["source_id"] ?? ""),
    titulo: String(l["titulo"] ?? ""),
    tipo: String(l["tipo"] ?? "texto"),
    conteudo: String(l["conteudo"] ?? ""),
    similaridade: Number(l["similaridade"] ?? 0),
  }));

  return {
    ok: true,
    trechos: reordenarTrechos(consulta, candidatos, {
      maximo: pedido.maximo ?? MAX_TRECHOS_NO_CONTEXTO,
    }),
    custoEstimado: r.uso.custoEstimado,
  };
}
