/**
 * A memória, persistida — Fatia 6.
 *
 * O DOMÍNIO DECIDE O QUE PODE SER MEMÓRIA; este arquivo decide o que acontece
 * com a memória depois de existir. As duas regras que moram aqui, e não lá, são
 * as que dependem do que JÁ está no banco:
 *
 *   REPETIR RENOVA, NÃO DUPLICA. A pessoa dizer "prefiro de tarde" pela terceira
 *   vez é evidência a favor da mesma memória — não uma terceira memória. O
 *   prazo estica e a confiança sobe.
 *
 *   MEMÓRIA INVALIDADA POR UMA PESSOA NÃO RESSUSCITA. Alguém da clínica olhou a
 *   frase e disse "isso está errado". Se a extração seguinte pudesse recriá-la,
 *   o botão de corrigir seria decorativo — e é justamente esse botão que faz a
 *   memória ser corrigível em vez de definitiva.
 */
import {
  agoraIso,
  atualizar,
  inserirIgnorandoDuplicata,
  selecionar,
  selecionarUm,
} from "../servidor/banco";
import {
  chaveDeMemoria,
  memoriasParaContexto,
  validarMemoria,
  type EscopoMemoria,
  type MemoriaCandidata,
  type MemoriaGravada,
  type OrigemMemoria,
  type StatusMemoria,
  VALIDADE_DIAS_CONVERSA,
} from "../dominio/memoria";

/* -------------------------------------------------------------------------- */
/* Gravação                                                                   */
/* -------------------------------------------------------------------------- */

export type RecusaDeMemoria = {
  conteudo: string;
  codigo: string;
  motivo: string;
};

export type ResultadoRegistro = {
  gravadas: number;
  renovadas: number;
  recusadas: readonly RecusaDeMemoria[];
};

/**
 * Registra um lote de candidatas. Nunca lança por causa de UMA candidata ruim.
 *
 * O retorno conta as recusas com o motivo de cada uma, porque o extrator é um
 * modelo: saber QUANTAS frases ele tentou empurrar e por que foram barradas é a
 * única forma de descobrir que o prompt de extração degradou.
 */
export async function registrarMemorias(pedido: {
  organizationId: string;
  agora: Date;
  candidatas: readonly MemoriaCandidata[];
  /** Quem digitou, quando a origem é `operador`. */
  criadoPor?: string | null;
}): Promise<ResultadoRegistro> {
  const recusadas: RecusaDeMemoria[] = [];
  let gravadas = 0;
  let renovadas = 0;

  for (const candidata of pedido.candidatas) {
    const veredicto = validarMemoria(candidata, pedido.agora);
    if (!veredicto.ok) {
      recusadas.push({
        conteudo: candidata.conteudo.slice(0, 120),
        codigo: veredicto.codigo,
        motivo: veredicto.motivo,
      });
      continue;
    }

    const m = veredicto.memoria;
    const existente = await selecionarUm("crc_ai_memories", {
      colunas: "id,status,confianca",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: pedido.organizationId },
        { coluna: "chave_dedupe", op: "eq", valor: m.chaveDedupe },
      ],
    });

    if (existente !== null) {
      const status = String(existente["status"] ?? "");
      if (status === "INVALIDADA") {
        // Ver o cabeçalho: o botão de corrigir tem que valer mais do que a
        // próxima extração.
        recusadas.push({
          conteudo: m.conteudo,
          codigo: "invalidada_por_pessoa",
          motivo: "Alguém da clínica já invalidou esta memória. Ela não volta sozinha.",
        });
        continue;
      }

      const antes = Number(existente["confianca"] ?? 0);
      const confianca = Math.max(Number.isFinite(antes) ? antes : 0, m.confianca);
      await atualizar(
        "crc_ai_memories",
        [{ coluna: "id", op: "eq", valor: String(existente["id"] ?? "") }],
        {
          confianca,
          // Repetir estica o prazo. Uma preferência confirmada de novo hoje não
          // tem por que expirar na data da primeira vez que foi dita.
          expira_em: new Date(
            pedido.agora.getTime() + VALIDADE_DIAS_CONVERSA * 86_400_000,
          ).toISOString(),
          // Promoção, nunca rebaixamento: a repetição pode tirar do PENDENTE,
          // mas nada aqui devolve uma ATIVA para pendente.
          status: status === "PENDENTE" && confianca >= 0.8 ? "ATIVA" : status,
        },
      );
      renovadas += 1;
      continue;
    }

    const linha = await inserirIgnorandoDuplicata("crc_ai_memories", {
      organization_id: pedido.organizationId,
      escopo: m.escopo,
      subject_id: m.subjectId,
      conteudo: m.conteudo,
      origem: m.origem,
      origem_ref: m.origemRef,
      confianca: m.confianca,
      status: m.status,
      valido_de: m.validoDe,
      expira_em: m.expiraEm,
      criado_por: pedido.criadoPor ?? null,
      chave_dedupe: m.chaveDedupe,
    });
    if (linha !== null) gravadas += 1;
  }

  return { gravadas, renovadas, recusadas };
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * As memórias que o agente pode ver neste turno.
 *
 * Traz as do paciente E as da clínica, porque as duas mudam a resposta: "prefere
 * depois das 17h" é do paciente; "não atendemos aos sábados em janeiro" é da
 * clínica e vale para todos.
 *
 * O FILTRO DE VIGÊNCIA É REFEITO EM MEMÓRIA depois do banco. Ver
 * `memoriaVigente`: uma linha expirada continua com `status = 'ATIVA'`, e
 * confiar só no filtro da query deixaria a garantia dependendo de nenhuma query
 * futura esquecer a cláusula.
 */
export async function memoriasDoContexto(
  organizationId: string,
  patientId: string | null,
  agora: Date,
): Promise<MemoriaGravada[]> {
  const linhas = await selecionar("crc_ai_memories", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "status", op: "eq", valor: "ATIVA" },
    ],
    ordenar: [{ coluna: "criado_em", ascendente: false }],
    limite: 80,
  });

  const minhas = linhas
    .map(deLinha)
    .filter((m) =>
      m.escopo === "organizacao" ? true : patientId !== null && m.subjectId === patientId,
    );

  return memoriasParaContexto(minhas, agora);
}

/** Tudo que existe, para a tela de revisão — inclusive pendente e invalidada. */
export async function listarMemorias(
  organizationId: string,
  opcoes: { subjectId?: string | null; status?: StatusMemoria; limite?: number } = {},
): Promise<MemoriaGravada[]> {
  const filtros = [{ coluna: "organization_id", op: "eq" as const, valor: organizationId }];
  if (opcoes.status !== undefined) {
    filtros.push({ coluna: "status", op: "eq" as const, valor: opcoes.status });
  }
  if (opcoes.subjectId !== undefined && opcoes.subjectId !== null) {
    filtros.push({ coluna: "subject_id", op: "eq" as const, valor: opcoes.subjectId });
  }

  const linhas = await selecionar("crc_ai_memories", {
    filtros,
    ordenar: [{ coluna: "criado_em", ascendente: false }],
    limite: opcoes.limite ?? 60,
  });
  return linhas.map(deLinha);
}

function deLinha(l: Record<string, unknown>): MemoriaGravada {
  const t = (c: string): string | null =>
    typeof l[c] === "string" && (l[c] as string).length > 0 ? (l[c] as string) : null;
  const escopo = l["escopo"] === "organizacao" ? "organizacao" : "paciente";
  const origemCrua = String(l["origem"] ?? "conversa");
  const origem: OrigemMemoria =
    origemCrua === "operador" || origemCrua === "sistema" ? origemCrua : "conversa";
  const statusCru = String(l["status"] ?? "PENDENTE");
  const status: StatusMemoria =
    statusCru === "ATIVA" || statusCru === "INVALIDADA" ? statusCru : "PENDENTE";
  const confianca = Number(l["confianca"] ?? 0);

  return {
    id: String(l["id"] ?? ""),
    escopo: escopo as EscopoMemoria,
    subjectId: t("subject_id"),
    conteudo: String(l["conteudo"] ?? ""),
    origem,
    origemRef: t("origem_ref"),
    confianca: Number.isFinite(confianca) ? confianca : 0,
    status,
    validoDe: String(l["valido_de"] ?? ""),
    expiraEm: t("expira_em"),
    criadoEm: String(l["criado_em"] ?? ""),
  };
}

/* -------------------------------------------------------------------------- */
/* Direito de correção                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Uma pessoa diz que a memória está errada.
 *
 * NÃO APAGA A LINHA. Apagar tiraria a frase do contexto e também a prova de que
 * ela existiu — e quando alguém perguntar "por que o agente disse aquilo em
 * março?", a resposta precisa continuar disponível. `INVALIDADA` tira do modelo
 * e mantém o registro.
 */
export async function invalidarMemoria(
  organizationId: string,
  memoriaId: string,
  userId: string | null,
): Promise<void> {
  await atualizar(
    "crc_ai_memories",
    [
      { coluna: "id", op: "eq", valor: memoriaId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { status: "INVALIDADA", invalidado_por: userId, invalidado_em: agoraIso() },
  );
}

/** Uma pessoa confirma uma pendente. Ela passa a valer para o agente. */
export async function confirmarMemoria(organizationId: string, memoriaId: string): Promise<void> {
  await atualizar(
    "crc_ai_memories",
    [
      { coluna: "id", op: "eq", valor: memoriaId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
      // Confirmar não é ressuscitar: uma INVALIDADA não volta por este caminho.
      { coluna: "status", op: "eq", valor: "PENDENTE" },
    ],
    { status: "ATIVA", confianca: 1 },
  );
}

/** Uma pessoa da clínica escreve uma memória à mão. Nasce ATIVA. */
export async function registrarMemoriaDeOperador(pedido: {
  organizationId: string;
  escopo: EscopoMemoria;
  subjectId: string | null;
  conteudo: string;
  userId: string;
  agora?: Date;
}): Promise<ResultadoRegistro> {
  return registrarMemorias({
    organizationId: pedido.organizationId,
    agora: pedido.agora ?? new Date(),
    criadoPor: pedido.userId,
    candidatas: [
      {
        escopo: pedido.escopo,
        subjectId: pedido.subjectId,
        conteudo: pedido.conteudo,
        origem: "operador",
        origemRef: `usuario:${pedido.userId}`,
        confianca: 1,
      },
    ],
  });
}

/** Exposta para o teste e para quem precisa conferir dedupe sem gravar. */
export { chaveDeMemoria };
