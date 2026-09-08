/**
 * Um Postgres de mentira, em memória, com o comportamento que o CRC depende.
 *
 * POR QUE ISTO EXISTE
 * O item 82 do contrato pede testes E2E dos fluxos principais. A leitura fácil
 * seria Playwright contra um ambiente de verdade — e ela é inviável hoje: o
 * schema não está aplicado no Supabase e as credenciais das integrações não
 * chegaram. Um teste que não roda não protege nada.
 *
 * A leitura útil é esta: substituir SÓ o driver de banco e deixar TODO o resto
 * rodar de verdade — sincronização, motor de eventos, criação de oportunidade,
 * motor de jornadas, política de contato, envio. O que se ganha é a garantia de
 * que as peças se encaixam; o que não se cobre é a camada HTTP e o navegador, e
 * o arquivo de teste diz isso explicitamente.
 *
 * O QUE ESTE FAKE PRECISA ACERTAR PARA O TESTE VALER ALGUMA COISA:
 *
 *   ÍNDICES ÚNICOS. A idempotência inteira do CRC é constraint de banco, não
 *   cuidado de código. Um fake que aceita tudo faria os testes passarem
 *   exatamente onde a produção quebraria — e daria uma falsa sensação de
 *   cobertura sobre a parte mais importante do sistema.
 *
 *   ÍNDICE PARCIAL. `unique(chave_dedupe) where fechada_em is null` é o que
 *   permite uma oportunidade fechada e reaberta no mês seguinte. Sem a
 *   condição, o segundo faltante do mesmo paciente seria recusado.
 *
 *   `FOR UPDATE SKIP LOCKED`. As três funções de reserva são o que impede dois
 *   workers pegarem a mesma jornada.
 *
 * NÃO É UM POSTGRES. Não há transação, não há tipo, e a ordenação é a que o
 * `Array.sort` dá. Ele é fiel onde o CRC depende de fidelidade.
 */
import type { Linha, OpcoesSelecao, Filtro } from "../servidor/banco";

/* -------------------------------------------------------------------------- */
/* Estado                                                                     */
/* -------------------------------------------------------------------------- */

type Tabelas = Record<string, Linha[]>;

let tabelas: Tabelas = {};
let sequencia = 0;

/**
 * O relógio do "banco".
 *
 * Em produção o `now()` do Postgres e o `agora` do worker são o MESMO instante:
 * a reserva de jornadas compara `resume_at <= now()` no mesmo segundo em que o
 * motor calcula as esperas. Um fake preso ao relógio de parede quebraria essa
 * igualdade — o teste injetaria 11h no motor e o fake reservaria como se
 * fossem 20h, liberando jornadas que ainda deveriam estar esperando.
 *
 * `null` significa relógio de parede, que é o comportamento normal.
 */
let relogio: Date | null = null;

export function definirRelogio(quando: Date | null): void {
  relogio = quando;
}

function agoraMs(): number {
  return relogio === null ? Date.now() : relogio.getTime();
}

/**
 * Os índices únicos que o schema declara e que o comportamento do CRC exige.
 *
 * `onde` reproduz o índice PARCIAL: a linha só participa da unicidade quando a
 * condição vale. É o que diferencia "não pode haver duas oportunidades abertas
 * para a mesma falta" de "não pode haver duas oportunidades, nunca".
 */
type IndiceUnico = { colunas: string[]; onde?: (l: Linha) => boolean };

/**
 * Coluna AUSENTE é nula.
 *
 * No Postgres, uma coluna que a linha nunca preencheu vale NULL. No objeto
 * JavaScript ela é `undefined`. Comparar com `=== null` faria o índice parcial
 * simplesmente não se aplicar às linhas recém-inseridas — e o fake aceitaria
 * duplicata exatamente onde a produção recusa, que é o pior defeito possível
 * num banco de teste.
 */
function nulo(v: unknown): boolean {
  return v === null || v === undefined;
}

const INDICES: Readonly<Record<string, IndiceUnico[]>> = {
  crc_patients: [{ colunas: ["organization_id", "external_source", "external_id"] }],
  crc_appointments: [{ colunas: ["organization_id", "external_source", "external_id"] }],
  crc_events: [{ colunas: ["organization_id", "fingerprint"] }],
  crc_opportunities: [
    {
      colunas: ["organization_id", "chave_dedupe"],
      onde: (l) => !nulo(l["chave_dedupe"]) && nulo(l["fechada_em"]),
    },
  ],
  crc_tasks: [
    {
      colunas: ["organization_id", "chave_dedupe"],
      onde: (l) =>
        !nulo(l["chave_dedupe"]) && (l["status"] === "OPEN" || l["status"] === "IN_PROGRESS"),
    },
  ],
  crc_messages: [
    {
      colunas: ["organization_id", "provider_message_id"],
      onde: (l) => !nulo(l["provider_message_id"]),
    },
    { colunas: ["organization_id", "chave_dedupe"], onde: (l) => !nulo(l["chave_dedupe"]) },
  ],
  crc_automation_enrollments: [
    {
      colunas: ["organization_id", "automation_id", "chave_dedupe"],
      onde: (l) => !nulo(l["chave_dedupe"]),
    },
  ],
  crc_conversations: [{ colunas: ["organization_id", "canal", "contato_externo"] }],
  crc_funnel_events: [
    { colunas: ["organization_id", "chave_dedupe"], onde: (l) => !nulo(l["chave_dedupe"]) },
  ],
  crc_revenue_events: [
    { colunas: ["organization_id", "chave_dedupe"], onde: (l) => !nulo(l["chave_dedupe"]) },
  ],
  crc_leads: [
    { colunas: ["organization_id", "chave_dedupe"], onde: (l) => !nulo(l["chave_dedupe"]) },
  ],
  crc_budgets: [{ colunas: ["organization_id", "fingerprint"] }],
  crc_charges: [{ colunas: ["organization_id", "fingerprint"] }],
  crc_webhook_inbox: [{ colunas: ["provedor", "external_id"] }],
  crc_templates: [{ colunas: ["organization_id", "chave", "versao"] }],
  crc_automations: [{ colunas: ["organization_id", "chave"] }],
  crc_automation_versions: [{ colunas: ["automation_id", "versao"] }],
  crc_opportunity_stages: [{ colunas: ["organization_id", "chave"] }],
  crc_sync_state: [{ colunas: ["organization_id", "recurso"] }],
  crc_settings: [{ colunas: ["organization_id", "chave"] }],
  crc_feature_flags: [{ colunas: ["organization_id", "chave"] }],
  crc_clinics: [{ colunas: ["organization_id", "slug"] }],
  crc_organizations: [{ colunas: ["slug"] }],
  crc_users: [{ colunas: ["organization_id", "email"] }],
};

/**
 * Os DEFAULTs de coluna que o schema declara.
 *
 * Espelham `boolean not null default ...` do 02/03. Parecem detalhe e não são:
 * `buscarPacientesPorTelefone` filtra por `arquivado = false`, e um fake que
 * deixa a coluna ausente devolve zero pacientes — a conversa nasce sem
 * paciente, o opt-out por mensagem não registra, e o teste acusa uma regra que
 * está certa. Fidelidade aqui é o que separa "o teste falhou" de "o teste
 * mentiu".
 */
const PADRAO_DE_COLUNA: Readonly<Record<string, Readonly<Record<string, boolean>>>> = {
  crc_clinics: { ativa: true },
  crc_users: { ativo: true },
  crc_patients: { ativo: true, arquivado: false },
  crc_conversations: { revisao_pendente: false },
  crc_messages: { nota_interna: false },
  crc_templates: { ativo: true },
  crc_revenue_events: { recuperada: false },
  crc_ai_calls: { sucesso: true },
  crc_feature_flags: { ligada: false },
  crc_integration_logs: { sucesso: true },
  crc_saved_views: { compartilhada: false },
  crc_charges: { negociacao_humana: false },
};

export class ErroBancoFake extends Error {
  readonly status = 409;
  readonly detalhe = "duplicate key value violates unique constraint (23505)";
  get ehConflitoDeUnicidade(): boolean {
    return true;
  }
}

export function limparBanco(): void {
  tabelas = {};
  sequencia = 0;
  relogio = null;
}

export function conteudo(tabela: string): Linha[] {
  return tabelas[tabela] ?? [];
}

/** Insere sem passar pelas travas — para montar o cenário do teste. */
export function semear(tabela: string, linhas: Linha[]): void {
  const alvo = (tabelas[tabela] ??= []);
  for (const l of linhas) alvo.push({ ...comPadroes(tabela, l) });
}

function comPadroes(tabela: string, linha: Linha): Linha {
  sequencia += 1;
  const agora = new Date(agoraMs()).toISOString();
  return {
    id: linha["id"] ?? `id-${String(sequencia)}`,
    criado_em: linha["criado_em"] ?? agora,
    atualizado_em: linha["atualizado_em"] ?? agora,
    ...(PADRAO_DE_COLUNA[tabela] ?? {}),
    ...linha,
  };
}

/* -------------------------------------------------------------------------- */
/* Filtros                                                                    */
/* -------------------------------------------------------------------------- */

function casa(linha: Linha, f: Filtro): boolean {
  const v = linha[f.coluna];

  switch (f.op) {
    case "eq":
      return v === f.valor;
    case "neq":
      return v !== f.valor;
    case "is":
      // `is null` também aceita a chave AUSENTE: no Postgres uma coluna nunca
      // preenchida é nula, e o fake precisa concordar com isso, senão metade
      // dos filtros de "sem responsável" falha por motivo errado.
      return f.valor === null ? v === null || v === undefined : v === f.valor;
    case "not.is":
      return f.valor === null ? v !== null && v !== undefined : v !== f.valor;
    case "in":
      return Array.isArray(f.valor) && (f.valor as unknown[]).includes(v);
    case "gt":
      return comparavel(v) && comparavel(f.valor) && v > f.valor;
    case "gte":
      return comparavel(v) && comparavel(f.valor) && v >= f.valor;
    case "lt":
      return comparavel(v) && comparavel(f.valor) && v < f.valor;
    case "lte":
      return comparavel(v) && comparavel(f.valor) && v <= f.valor;
    case "like":
    case "ilike": {
      if (typeof v !== "string" || typeof f.valor !== "string") return false;
      // PostgREST usa `*` como curinga na querystring.
      const padrao = f.valor.replace(/[.+?^${}()|[\]\\]/gu, "\\$&").replace(/\*/gu, ".*");
      return new RegExp(`^${padrao}$`, "iu").test(v);
    }
    case "cs":
      return Array.isArray(v) && Array.isArray(f.valor);
    default:
      return false;
  }
}

function comparavel(v: unknown): v is string | number {
  return typeof v === "string" || typeof v === "number";
}

function aplicar(linhas: Linha[], opcoes: OpcoesSelecao): Linha[] {
  let saida = linhas.filter((l) => (opcoes.filtros ?? []).every((f) => casa(l, f)));

  if (opcoes.ou !== undefined && opcoes.ou.length > 0) {
    saida = saida.filter((l) => (opcoes.ou ?? []).some((f) => casa(l, f)));
  }

  for (const ordem of [...(opcoes.ordenar ?? [])].reverse()) {
    saida = [...saida].sort((a, b) => {
      const x = a[ordem.coluna];
      const y = b[ordem.coluna];
      // Nulo sempre por último, como `nullslast` — que é o padrão que o CRC
      // usa em toda ordenação por data.
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      const cmp = String(x).localeCompare(String(y));
      return ordem.ascendente === false ? -cmp : cmp;
    });
  }

  const inicio = opcoes.deslocamento ?? 0;
  return saida.slice(inicio, inicio + (opcoes.limite ?? saida.length));
}

/* -------------------------------------------------------------------------- */
/* Unicidade                                                                  */
/* -------------------------------------------------------------------------- */

function chaveDe(linha: Linha, indice: IndiceUnico): string | null {
  const partes: string[] = [];
  for (const coluna of indice.colunas) {
    const v = linha[coluna];
    // Nulo não participa de índice único no Postgres: duas linhas com
    // `chave_dedupe` nula convivem.
    if (nulo(v)) return null;
    partes.push(String(v));
  }
  return partes.join("|");
}

function conflita(tabela: string, nova: Linha, ignorarId?: unknown): boolean {
  const indices = INDICES[tabela] ?? [];
  const existentes = tabelas[tabela] ?? [];

  for (const indice of indices) {
    if (indice.onde !== undefined && !indice.onde(nova)) continue;
    const chave = chaveDe(nova, indice);
    if (chave === null) continue;

    for (const l of existentes) {
      if (ignorarId !== undefined && l["id"] === ignorarId) continue;
      if (indice.onde !== undefined && !indice.onde(l)) continue;
      if (chaveDe(l, indice) === chave) return true;
    }
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* A API que substitui `servidor/banco`                                       */
/* -------------------------------------------------------------------------- */

export function bancoConfigurado(): { ok: boolean; motivo: string } {
  return { ok: true, motivo: "" };
}

export function agoraIso(): string {
  return new Date(agoraMs()).toISOString();
}

export function selecionar<T = Linha>(tabela: string, opcoes: OpcoesSelecao = {}): Promise<T[]> {
  return Promise.resolve(aplicar(tabelas[tabela] ?? [], opcoes).map((l) => ({ ...l })) as T[]);
}

export async function selecionarUm<T = Linha>(
  tabela: string,
  opcoes: OpcoesSelecao = {},
): Promise<T | null> {
  const linhas = await selecionar<T>(tabela, { ...opcoes, limite: 1 });
  return linhas[0] ?? null;
}

export function contar(tabela: string, filtros: readonly Filtro[] = []): Promise<number> {
  return Promise.resolve(aplicar(tabelas[tabela] ?? [], { filtros }).length);
}

export function inserir<T = Linha>(tabela: string, linhas: Linha | Linha[]): Promise<T[]> {
  const lista = Array.isArray(linhas) ? linhas : [linhas];
  const alvo = (tabelas[tabela] ??= []);
  const criadas: Linha[] = [];

  for (const bruta of lista) {
    const nova = comPadroes(tabela, bruta);
    if (conflita(tabela, nova)) throw new ErroBancoFake("unique violation");
    alvo.push(nova);
    criadas.push({ ...nova });
  }

  return Promise.resolve(criadas as T[]);
}

export async function inserirIgnorandoDuplicata<T = Linha>(
  tabela: string,
  linha: Linha,
): Promise<T | null> {
  try {
    const criadas = await inserir<T>(tabela, linha);
    return criadas[0] ?? null;
  } catch (erro) {
    if (erro instanceof ErroBancoFake) return null;
    throw erro;
  }
}

/** Upsert por conflito: substitui quando a chave já existe. */
export function gravar<T = Linha>(
  tabela: string,
  linhas: Linha | Linha[],
  conflito: string,
): Promise<T[]> {
  const colunas = conflito.split(",").map((c) => c.trim());
  const lista = Array.isArray(linhas) ? linhas : [linhas];
  const alvo = (tabelas[tabela] ??= []);
  const saida: Linha[] = [];

  for (const bruta of lista) {
    const chave = colunas.map((c) => String(bruta[c] ?? "")).join("|");
    const existente = alvo.find((l) => colunas.map((c) => String(l[c] ?? "")).join("|") === chave);

    if (existente === undefined) {
      const nova = comPadroes(tabela, bruta);
      alvo.push(nova);
      saida.push({ ...nova });
    } else {
      // MESCLA, e não substitui: é o comportamento do `merge-duplicates` do
      // PostgREST, e é o que faz o sync preservar `opt_out_em` ao regravar o
      // paciente. Substituir apagaria o opt-out a cada sincronização.
      Object.assign(existente, bruta);
      saida.push({ ...existente });
    }
  }

  return Promise.resolve(saida as T[]);
}

export function atualizar<T = Linha>(
  tabela: string,
  filtros: readonly Filtro[],
  mudancas: Linha,
): Promise<T[]> {
  if (filtros.length === 0) throw new Error(`Atualização em ${tabela} sem filtro foi recusada.`);

  const alvo = tabelas[tabela] ?? [];
  const atingidas = alvo.filter((l) => filtros.every((f) => casa(l, f)));
  for (const l of atingidas) Object.assign(l, mudancas);

  return Promise.resolve(atingidas.map((l) => ({ ...l })) as T[]);
}

export function apagar(tabela: string, filtros: readonly Filtro[]): Promise<void> {
  if (filtros.length === 0) throw new Error(`Exclusão em ${tabela} sem filtro foi recusada.`);
  tabelas[tabela] = (tabelas[tabela] ?? []).filter((l) => !filtros.every((f) => casa(l, f)));
  return Promise.resolve();
}

/**
 * As funções de reserva atômica.
 *
 * Reproduzem o essencial do `FOR UPDATE SKIP LOCKED`: a linha reservada ganha
 * `travado_ate` no futuro e some das reservas seguintes. É o que o teste de
 * concorrência exercita — duas chamadas seguidas NÃO devolvem a mesma linha.
 */
export function rpc<T = Linha>(nome: string, argumentos: Linha = {}): Promise<T[]> {
  const agora = agoraMs();
  const limite = typeof argumentos["limite"] === "number" ? argumentos["limite"] : 10;
  const lockSegundos =
    typeof argumentos["lock_segundos"] === "number" ? argumentos["lock_segundos"] : 120;
  const ate = new Date(agora + lockSegundos * 1000).toISOString();

  const livre = (l: Linha): boolean => {
    const travado = l["travado_ate"];
    return typeof travado !== "string" || Date.parse(travado) < agora;
  };

  const vencida =
    (coluna: string) =>
    (l: Linha): boolean => {
      const quando = l[coluna];
      return typeof quando === "string" && Date.parse(quando) <= agora;
    };

  switch (nome) {
    case "crc_reservar_eventos": {
      const alvo = (tabelas["crc_events"] ?? [])
        .filter((l) => (l["status"] === "PENDENTE" || l["status"] === "FALHOU") && livre(l))
        .filter((l) => (typeof l["tentativas"] === "number" ? l["tentativas"] : 0) < 5)
        .slice(0, limite);

      for (const l of alvo) {
        l["status"] = "PROCESSANDO";
        l["travado_ate"] = ate;
        l["tentativas"] = (typeof l["tentativas"] === "number" ? l["tentativas"] : 0) + 1;
      }
      return Promise.resolve(alvo.map((l) => ({ ...l })) as T[]);
    }

    case "crc_reservar_jornadas": {
      const alvo = (tabelas["crc_automation_enrollments"] ?? [])
        .filter((l) => l["status"] === "ACTIVE" || l["status"] === "WAITING")
        .filter(vencida("resume_at"))
        .filter(livre)
        .slice(0, limite);

      for (const l of alvo) l["travado_ate"] = ate;
      return Promise.resolve(alvo.map((l) => ({ ...l })) as T[]);
    }

    case "crc_reservar_jobs": {
      const alvo = (tabelas["crc_jobs"] ?? [])
        .filter((l) => (l["status"] === "PENDENTE" || l["status"] === "FALHOU") && livre(l))
        .filter(vencida("run_at"))
        .slice(0, limite);

      for (const l of alvo) {
        l["status"] = "RODANDO";
        l["travado_ate"] = ate;
        l["tentativas"] = (typeof l["tentativas"] === "number" ? l["tentativas"] : 0) + 1;
      }
      return Promise.resolve(alvo.map((l) => ({ ...l })) as T[]);
    }

    case "crc_marcar_nao_lida": {
      const conversa = (tabelas["crc_conversations"] ?? []).find(
        (l) => l["id"] === argumentos["conversa"],
      );
      if (conversa !== undefined) {
        conversa["nao_lidas"] =
          (typeof conversa["nao_lidas"] === "number" ? conversa["nao_lidas"] : 0) + 1;
        conversa["ultima_mensagem_em"] = argumentos["quando"];
        conversa["ultima_mensagem_trecho"] = argumentos["trecho"];
      }
      return Promise.resolve([] as T[]);
    }

    default:
      return Promise.resolve([] as T[]);
  }
}

export { ErroBancoFake as ErroBanco };
