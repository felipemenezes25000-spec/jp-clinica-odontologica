/**
 * Chaves da clínica e rotas de modelo — Fatia 8.
 *
 * A REGRA QUE ATRAVESSA O ARQUIVO: nada que sai daqui contém segredo.
 *
 * `listarCredenciais` devolve apelido, provedor, dica e status. O segredo entra
 * cifrado em `cadastrarCredencial` e sai de uma única função — o gateway, no
 * momento do uso. Nenhuma leitura de tela passa perto dele.
 *
 * Parece óbvio escrito assim, e é exatamente o tipo de coisa que deixa de ser
 * verdade quando alguém acrescenta um campo "para debugar" num DTO.
 */
import { ehFinalidade, type Finalidade } from "../dominio/orcamento";
import { agoraIso, apagar, atualizar, gravar, selecionar, selecionarUm } from "../servidor/banco";

/* -------------------------------------------------------------------------- */
/* Credenciais                                                                */
/* -------------------------------------------------------------------------- */

export const PROVEDORES = ["openai", "anthropic"] as const;
export type Provedor = (typeof PROVEDORES)[number];

export const ROTULO_PROVEDOR: Readonly<Record<Provedor, string>> = {
  openai: "OpenAI",
  anthropic: "Anthropic (Claude)",
};

export function ehProvedor(v: unknown): v is Provedor {
  return typeof v === "string" && (PROVEDORES as readonly string[]).includes(v);
}

/** O que a tela vê. Sem segredo — ver o cabeçalho. */
export type CredencialVisivel = {
  id: string;
  provedor: string;
  apelido: string;
  /** `sk-proj…4f2a`. Começo e fim, nunca o meio. */
  dica: string;
  status: string;
  criadoEm: string;
  ultimoUsoEm: string | null;
};

export async function listarCredenciais(organizationId: string): Promise<CredencialVisivel[]> {
  const linhas = await selecionar("crc_ai_credentials", {
    // As colunas são NOMEADAS uma a uma, e `segredo_cifrado` não está entre
    // elas. `select *` aqui funcionaria e traria o segredo cifrado para dentro do
    // processo da tela sem nenhuma razão.
    colunas: "id,provedor,apelido,dica,status,criado_em,ultimo_uso_em",
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
    ordenar: [{ coluna: "criado_em", ascendente: false }],
    limite: 20,
  });

  return linhas.map((l) => ({
    id: String(l["id"] ?? ""),
    provedor: String(l["provedor"] ?? ""),
    apelido: String(l["apelido"] ?? ""),
    dica: String(l["dica"] ?? ""),
    status: String(l["status"] ?? "ATIVA"),
    criadoEm: String(l["criado_em"] ?? ""),
    ultimoUsoEm: typeof l["ultimo_uso_em"] === "string" ? l["ultimo_uso_em"] : null,
  }));
}

export type ResultadoCadastro =
  { ok: true; id: string; dica: string } | { ok: false; codigo: string; motivo: string };

/**
 * Guarda a chave da clínica, cifrada.
 *
 * RECUSA SE A CIFRA NÃO ESTIVER CONFIGURADA. A alternativa — guardar em claro
 * "só por enquanto" — produz a chave da OpenAI de uma clínica em texto puro numa
 * tabela, e ninguém volta para consertar.
 *
 * A VALIDAÇÃO DE FORMATO É FROUXA de propósito: confere só que parece uma chave
 * (prefixo e tamanho). Recusar por regex apertado é como se quebra no dia em que
 * o provedor muda o formato do prefixo — e a mensagem de erro culpa a pessoa por
 * ter colado certo.
 */
export async function cadastrarCredencial(pedido: {
  organizationId: string;
  provedor: Provedor;
  apelido: string;
  segredo: string;
  userId?: string | null;
}): Promise<ResultadoCadastro> {
  const { cifraConfigurada, cifrar, dicaDoSegredo } = await import("../servidor/segredo");

  const estado = cifraConfigurada();
  if (!estado.ok) return { ok: false, codigo: "sem_cifra", motivo: estado.motivo };

  const segredo = pedido.segredo.trim();
  if (segredo.length < 20) {
    return {
      ok: false,
      codigo: "chave_curta",
      motivo: "Isso não parece uma chave de API. Cole a chave inteira.",
    };
  }
  const apelido = pedido.apelido.trim().slice(0, 80);
  if (apelido.length < 2) {
    return {
      ok: false,
      codigo: "sem_apelido",
      motivo: "Dê um nome a esta chave, para saber depois de quem ela é.",
    };
  }

  const dica = dicaDoSegredo(segredo);
  const linhas = await gravar(
    "crc_ai_credentials",
    {
      organization_id: pedido.organizationId,
      provedor: pedido.provedor,
      apelido,
      segredo_cifrado: cifrar(segredo),
      dica,
      status: "ATIVA",
      criado_por: pedido.userId ?? null,
    },
    "organization_id,provedor,apelido",
  );

  return { ok: true, id: String(linhas[0]?.["id"] ?? ""), dica };
}

/**
 * Revoga a chave. NÃO apaga a linha.
 *
 * As rotas que apontam para ela continuam apontando, e o gateway passa a devolver
 * "a chave configurada foi revogada" — que é uma mensagem que diz o que fazer.
 * Apagar faria a rota apontar para o nada e o erro sair como "credencial não
 * existe mais", o que soa a defeito do sistema.
 */
export async function revogarCredencial(organizationId: string, id: string): Promise<void> {
  await atualizar(
    "crc_ai_credentials",
    [
      { coluna: "id", op: "eq", valor: id },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { status: "REVOGADA" },
  );
}

/** Apaga de vez. Só depois de revogada, e só quando ninguém usa. */
export async function removerCredencial(
  organizationId: string,
  id: string,
): Promise<{ ok: boolean; motivo: string }> {
  const emUso = await selecionarUm("crc_ai_bindings", {
    colunas: "finalidade",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "credential_id", op: "eq", valor: id },
    ],
  });

  if (emUso !== null) {
    return {
      ok: false,
      motivo: `Esta chave ainda é usada em “${String(emUso["finalidade"] ?? "")}”. Troque a rota antes de apagar.`,
    };
  }

  await apagar("crc_ai_credentials", [
    { coluna: "id", op: "eq", valor: id },
    { coluna: "organization_id", op: "eq", valor: organizationId },
  ]);
  return { ok: true, motivo: "" };
}

/* -------------------------------------------------------------------------- */
/* Rotas                                                                      */
/* -------------------------------------------------------------------------- */

export type RotaVisivel = {
  finalidade: Finalidade;
  provedor: string;
  modelo: string;
  credentialId: string | null;
  maxTokens: number | null;
  /** `true` quando não existe linha: a rota está no padrão do código. */
  padrao: boolean;
};

export async function listarRotas(organizationId: string): Promise<RotaVisivel[]> {
  const linhas = await selecionar("crc_ai_bindings", {
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
    limite: 20,
  });

  const { FINALIDADES } = await import("../dominio/orcamento");
  const { lerRota } = await import("../integracoes/ia/gateway");

  const porFinalidade = new Map<string, Record<string, unknown>>();
  for (const l of linhas) porFinalidade.set(String(l["finalidade"] ?? ""), l);

  const fora: RotaVisivel[] = [];
  for (const finalidade of FINALIDADES) {
    const l = porFinalidade.get(finalidade);
    // O padrão vem do MESMO lugar que o gateway usa, e não de uma segunda
    // tabela de padrões nesta tela. Duas listas de padrão divergem no primeiro
    // ajuste.
    const rota = await lerRota(organizationId, finalidade);
    fora.push({
      finalidade,
      provedor: rota.provedor,
      modelo: rota.modelo,
      credentialId: rota.credentialId,
      maxTokens: rota.maxTokens,
      padrao: l === undefined,
    });
  }
  return fora;
}

export async function salvarRota(pedido: {
  organizationId: string;
  finalidade: string;
  provedor: string;
  modelo: string;
  credentialId: string | null;
}): Promise<{ ok: boolean; motivo: string }> {
  if (!ehFinalidade(pedido.finalidade)) {
    return { ok: false, motivo: "Finalidade desconhecida." };
  }
  if (!ehProvedor(pedido.provedor)) {
    return { ok: false, motivo: "Provedor desconhecido." };
  }
  const modelo = pedido.modelo.trim();
  if (modelo.length < 3) return { ok: false, motivo: "Informe o nome do modelo." };

  /*
   * EMBEDDINGS SÓ TEM ROTA PARA OPENAI, e recusar aqui é melhor do que aceitar.
   *
   * A coluna `embedding` é `vector(1536)`, e a porta de embeddings tem um adapter
   * só. Aceitar `anthropic` aqui gravaria uma rota que o gateway ignora em
   * silêncio — e a pessoa passaria a acreditar que configurou algo.
   */
  if (pedido.finalidade === "embeddings" && pedido.provedor !== "openai") {
    return {
      ok: false,
      motivo: "A busca por significado hoje só funciona com OpenAI. Ainda não há outro adapter.",
    };
  }

  await gravar(
    "crc_ai_bindings",
    {
      organization_id: pedido.organizationId,
      finalidade: pedido.finalidade,
      provedor: pedido.provedor,
      modelo,
      credential_id: pedido.credentialId,
      atualizado_em: agoraIso(),
    },
    "organization_id,finalidade",
  );
  return { ok: true, motivo: "" };
}

/** Volta a finalidade ao padrão do código, apagando a linha. */
export async function limparRota(organizationId: string, finalidade: string): Promise<void> {
  if (!ehFinalidade(finalidade)) return;
  await apagar("crc_ai_bindings", [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "finalidade", op: "eq", valor: finalidade },
  ]);
}

/**
 * Marca que a chave foi usada agora.
 *
 * Serve para uma pergunta concreta da tela: "esta chave ainda está em uso?".
 * Sem isso, uma chave esquecida e uma chave ativa têm a mesma aparência, e
 * ninguém revoga nenhuma das duas por medo de quebrar algo.
 */
export async function marcarUsoDaCredencial(
  organizationId: string,
  credentialId: string,
): Promise<void> {
  try {
    await atualizar(
      "crc_ai_credentials",
      [
        { coluna: "id", op: "eq", valor: credentialId },
        { coluna: "organization_id", op: "eq", valor: organizationId },
      ],
      { ultimo_uso_em: agoraIso() },
    );
  } catch {
    // Marcar uso é conveniência. Nunca vale derrubar um turno por causa dela.
  }
}

/** Exposto para o teste conferir que o segredo nunca sai em leitura de tela. */
export async function _lerSegredoCifrado(
  organizationId: string,
  id: string,
): Promise<string | null> {
  const l = await selecionarUm("crc_ai_credentials", {
    colunas: "segredo_cifrado",
    filtros: [
      { coluna: "id", op: "eq", valor: id },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
  });
  return l === null ? null : String(l["segredo_cifrado"] ?? "");
}
