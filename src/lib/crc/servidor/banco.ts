/**
 * Acesso ao Postgres do CRC, via REST do Supabase.
 *
 * MESMA ESCOLHA DO PORTAL DE RH, PELO MESMO MOTIVO: `@supabase/supabase-js`
 * resolveria isto com menos código, mas seria uma dependência de runtime a mais
 * num projeto que hoje só depende de React/TanStack. PostgREST é HTTP com
 * querystring, e `fetch` já existe em toda parte.
 *
 * DIFERENÇA EM RELAÇÃO AO DRIVER DO RH: lá as tabelas são `(id, dados jsonb)` e
 * o driver conhece cada uma. Aqui as tabelas têm colunas de verdade e são 36 —
 * um método por tabela seria 200 funções quase iguais. Este módulo expõe as
 * operações genéricas (selecionar, inserir, atualizar, upsert, rpc) e os
 * repositórios de `aplicacao/` colocam o significado por cima.
 *
 * SEGURANÇA: usa a SERVICE_ROLE, que ignora RLS. Só pode existir no servidor.
 * Este arquivo nunca é importado no topo de módulo que a tela carrega — sempre
 * por `await import()` dentro do handler.
 */

/* -------------------------------------------------------------------------- */
/* Configuração                                                               */
/* -------------------------------------------------------------------------- */

type Ambiente = { url: string; chave: string };

function ambiente(): Ambiente {
  const url = (process.env["SUPABASE_URL"] ?? "").replace(/\/+$/u, "");
  const chave = process.env["SUPABASE_SERVICE_ROLE"] ?? "";
  if (url.length === 0 || chave.length === 0) {
    throw new Error(
      "Supabase não configurado: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE no servidor.",
    );
  }
  return { url, chave };
}

export function bancoConfigurado(): { ok: boolean; motivo: string } {
  if ((process.env["SUPABASE_URL"] ?? "").length === 0) {
    return { ok: false, motivo: "Falta SUPABASE_URL no servidor." };
  }
  if ((process.env["SUPABASE_SERVICE_ROLE"] ?? "").length === 0) {
    return { ok: false, motivo: "Falta SUPABASE_SERVICE_ROLE no servidor." };
  }
  return { ok: true, motivo: "" };
}

/** Toda tabela do CRC. Union fechado: tabela inexistente não compila. */
export type Tabela =
  | "crc_organizations"
  | "crc_clinics"
  | "crc_users"
  | "crc_user_clinics"
  | "crc_patients"
  | "crc_patient_tags"
  | "crc_appointments"
  | "crc_leads"
  | "crc_opportunity_stages"
  | "crc_opportunities"
  | "crc_opportunity_history"
  | "crc_tasks"
  | "crc_conversations"
  | "crc_messages"
  | "crc_templates"
  | "crc_events"
  | "crc_automations"
  | "crc_automation_versions"
  | "crc_automation_enrollments"
  | "crc_automation_logs"
  | "crc_jobs"
  | "crc_sync_jobs"
  | "crc_sync_falhas"
  | "crc_sync_state"
  | "crc_scan_state"
  | "crc_settings_clinica"
  | "crc_runtime_heartbeats"
  | "crc_schema_migrations"
  | "crc_budgets"
  | "crc_budget_items"
  | "crc_charges"
  | "crc_payment_agreements"
  | "crc_revenue_events"
  | "crc_funnel_events"
  | "crc_ai_calls"
  | "crc_settings"
  | "crc_feature_flags"
  | "crc_audit_logs"
  | "crc_integration_logs"
  | "crc_dead_letters"
  | "crc_webhook_inbox"
  | "crc_canais_whatsapp"
  | "crc_mcp_tokens"
  | "crc_integracoes_clinica"
  | "crc_saved_views"
  | "crc_ad_spend"
  | "crc_campaigns"
  | "crc_campaign_targets"
  | "crc_dentists"
  | "crc_scheduling_offers"
  | "crc_ai_runs"
  | "crc_ai_spans"
  | "crc_human_cases"
  | "crc_ai_memories"
  | "crc_ai_supervisoes"
  | "crc_knowledge_sources"
  | "crc_knowledge_chunks"
  | "crc_ai_credentials"
  | "crc_ai_bindings"
  | "crc_ai_orcamentos"
  | "crc_ai_gastos"
  | "crc_eval_casos"
  | "crc_eval_rodadas"
  | "crc_eval_execucoes"
  | "crc_agent_versions"
  | "crc_agent_jobs";

export type Linha = Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/* Filtros                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Um filtro no vocabulário do PostgREST.
 *
 * O valor NUNCA é interpolado à mão na URL: `URLSearchParams` faz o escape.
 * Sem isso, um nome de paciente com vírgula quebraria a query — e um valor
 * escolhido de propósito poderia mudar o significado dela.
 */
export type Filtro = {
  coluna: string;
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "in" | "is" | "not.is" | "cs";
  valor: string | number | boolean | null | readonly (string | number)[];
};

export type OpcoesSelecao = {
  colunas?: string;
  filtros?: readonly Filtro[];
  ordenar?: { coluna: string; ascendente?: boolean; nullsPrimeiro?: boolean }[];
  limite?: number;
  deslocamento?: number;
  /** Pede o total ao PostgREST. Custa uma contagem no banco — use com critério. */
  contarTotal?: boolean;
  /** Filtros ligados por OU. Ex.: telefone em qualquer variação do nono dígito. */
  ou?: readonly Filtro[];
};

function formatarValor(valor: Filtro["valor"]): string {
  if (valor === null) return "null";
  if (Array.isArray(valor)) {
    // PostgREST espera in.(a,b,c). Valores com vírgula ou aspas precisam de
    // aspas duplas, com as internas escapadas.
    const itens = valor.map((v) => {
      const s = String(v);
      return /[,."\\()]/u.test(s) ? `"${s.replace(/(["\\])/gu, "\\$1")}"` : s;
    });
    return `(${itens.join(",")})`;
  }
  return String(valor);
}

function aplicarFiltros(params: URLSearchParams, filtros: readonly Filtro[]): void {
  for (const f of filtros) {
    params.append(f.coluna, `${f.op}.${formatarValor(f.valor)}`);
  }
}

function montarQuery(opcoes: OpcoesSelecao): URLSearchParams {
  const params = new URLSearchParams();
  params.set("select", opcoes.colunas ?? "*");

  if (opcoes.filtros !== undefined) aplicarFiltros(params, opcoes.filtros);

  if (opcoes.ou !== undefined && opcoes.ou.length > 0) {
    const partes = opcoes.ou.map((f) => `${f.coluna}.${f.op}.${formatarValor(f.valor)}`);
    params.append("or", `(${partes.join(",")})`);
  }

  if (opcoes.ordenar !== undefined) {
    const ordem = opcoes.ordenar
      .map((o) => {
        const dir = o.ascendente === false ? "desc" : "asc";
        const nulos = o.nullsPrimeiro === true ? ".nullsfirst" : ".nullslast";
        return `${o.coluna}.${dir}${nulos}`;
      })
      .join(",");
    params.set("order", ordem);
  }

  if (opcoes.limite !== undefined) params.set("limit", String(opcoes.limite));
  if (opcoes.deslocamento !== undefined) params.set("offset", String(opcoes.deslocamento));

  return params;
}

/* -------------------------------------------------------------------------- */
/* Chamada                                                                    */
/* -------------------------------------------------------------------------- */

function cabecalhos(extra: Record<string, string> = {}): Record<string, string> {
  const { chave } = ambiente();
  return { apikey: chave, Authorization: `Bearer ${chave}`, ...extra };
}

/**
 * Rede de segurança fina sobre o fetch, igual à do driver do RH: o Supabase
 * devolve 5xx esporádico em cold start do projeto, e repetir duas vezes com
 * espera curta resolve sem ninguém ver erro. 4xx é problema nosso e não se
 * repete — insistir só atrasaria a resposta.
 */
async function chamar(caminho: string, init: RequestInit, tentativas = 3): Promise<Response> {
  const { url } = ambiente();
  let ultimoErro = "";

  for (let i = 0; i < tentativas; i += 1) {
    try {
      const r = await fetch(url + caminho, {
        ...init,
        signal: AbortSignal.timeout(15_000),
      });
      if (r.status < 500) return r;
      ultimoErro = `${String(r.status)} ${(await r.clone().text()).slice(0, 200)}`;
    } catch (erro) {
      ultimoErro = String(erro);
    }
    if (i < tentativas - 1) await new Promise((r) => setTimeout(r, 250 * Math.pow(2, i)));
  }
  throw new Error(`Banco indisponível após ${String(tentativas)} tentativas: ${ultimoErro}`);
}

async function exigirOk(r: Response, oQue: string): Promise<void> {
  if (r.ok) return;
  const detalhe = (await r.text()).slice(0, 400);
  throw new ErroBanco(`${oQue} falhou (${String(r.status)}): ${detalhe}`, r.status, detalhe);
}

export class ErroBanco extends Error {
  readonly status: number;
  readonly detalhe: string;

  constructor(mensagem: string, status: number, detalhe: string) {
    super(mensagem);
    this.name = "ErroBanco";
    this.status = status;
    this.detalhe = detalhe;
  }

  /**
   * 23505 é violação de unique. Não é falha: é a idempotência funcionando.
   * Quem grava evento ou mensagem trata isto como "já existe, siga em frente".
   */
  get ehConflitoDeUnicidade(): boolean {
    return this.status === 409 || this.detalhe.includes("23505");
  }
}

/* -------------------------------------------------------------------------- */
/* Operações                                                                  */
/* -------------------------------------------------------------------------- */

export async function selecionar<T = Linha>(
  tabela: Tabela,
  opcoes: OpcoesSelecao = {},
): Promise<T[]> {
  const params = montarQuery(opcoes);
  const extra: Record<string, string> = {};
  if (opcoes.contarTotal === true) extra["Prefer"] = "count=exact";

  const r = await chamar(`/rest/v1/${tabela}?${params.toString()}`, {
    method: "GET",
    headers: cabecalhos(extra),
  });
  await exigirOk(r, `Leitura de ${tabela}`);
  return (await r.json()) as T[];
}

/** Uma linha ou `null`. Não estoura quando não encontra — ausência é resposta. */
export async function selecionarUm<T = Linha>(
  tabela: Tabela,
  opcoes: OpcoesSelecao = {},
): Promise<T | null> {
  const linhas = await selecionar<T>(tabela, { ...opcoes, limite: 1 });
  return linhas[0] ?? null;
}

/** Conta sem trazer as linhas. Usa `HEAD` + `Content-Range`, que é barato. */
export async function contar(tabela: Tabela, filtros: readonly Filtro[] = []): Promise<number> {
  const params = new URLSearchParams();
  params.set("select", "id");
  aplicarFiltros(params, filtros);

  const r = await chamar(`/rest/v1/${tabela}?${params.toString()}`, {
    method: "HEAD",
    headers: cabecalhos({ Prefer: "count=exact", Range: "0-0" }),
  });
  await exigirOk(r, `Contagem de ${tabela}`);

  // O total vem depois da barra: "0-0/1234".
  const range = r.headers.get("content-range") ?? "";
  const total = Number.parseInt(range.split("/")[1] ?? "0", 10);
  return Number.isFinite(total) ? total : 0;
}

export async function inserir<T = Linha>(tabela: Tabela, linhas: Linha | Linha[]): Promise<T[]> {
  const r = await chamar(`/rest/v1/${tabela}`, {
    method: "POST",
    headers: cabecalhos({ "content-type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify(Array.isArray(linhas) ? linhas : [linhas]),
  });
  await exigirOk(r, `Inserção em ${tabela}`);
  return (await r.json()) as T[];
}

/**
 * Inserção que ACEITA já existir.
 *
 * É o par natural das constraints de idempotência do item 13: gravar o mesmo
 * evento duas vezes não é erro, é o comportamento esperado quando o sync roda
 * de novo. Devolve `null` quando a linha já estava lá.
 */
export async function inserirIgnorandoDuplicata<T = Linha>(
  tabela: Tabela,
  linha: Linha,
): Promise<T | null> {
  try {
    const criadas = await inserir<T>(tabela, linha);
    return criadas[0] ?? null;
  } catch (erro) {
    if (erro instanceof ErroBanco && erro.ehConflitoDeUnicidade) return null;
    throw erro;
  }
}

/**
 * Upsert por conflito declarado.
 *
 * `conflito` precisa nomear as colunas de um índice único existente — é o que
 * transforma "grava" em "cria ou substitui". Sem ele o PostgREST recusa o
 * `resolution=merge-duplicates`.
 */
export async function gravar<T = Linha>(
  tabela: Tabela,
  linhas: Linha | Linha[],
  conflito: string,
): Promise<T[]> {
  const params = new URLSearchParams({ on_conflict: conflito });
  const r = await chamar(`/rest/v1/${tabela}?${params.toString()}`, {
    method: "POST",
    headers: cabecalhos({
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    }),
    body: JSON.stringify(Array.isArray(linhas) ? linhas : [linhas]),
  });
  await exigirOk(r, `Gravação em ${tabela}`);
  return (await r.json()) as T[];
}

export async function atualizar<T = Linha>(
  tabela: Tabela,
  filtros: readonly Filtro[],
  mudancas: Linha,
): Promise<T[]> {
  if (filtros.length === 0) {
    // Um UPDATE sem WHERE no PostgREST atinge a tabela inteira. Nenhuma
    // chamada legítima do CRC faz isso, e a que fizesse por engano seria
    // catastrófica e silenciosa.
    throw new Error(`Atualização em ${tabela} sem filtro foi recusada.`);
  }
  const params = new URLSearchParams();
  aplicarFiltros(params, filtros);

  const r = await chamar(`/rest/v1/${tabela}?${params.toString()}`, {
    method: "PATCH",
    headers: cabecalhos({ "content-type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify(mudancas),
  });
  await exigirOk(r, `Atualização de ${tabela}`);
  return (await r.json()) as T[];
}

export async function apagar(tabela: Tabela, filtros: readonly Filtro[]): Promise<void> {
  if (filtros.length === 0) {
    throw new Error(`Exclusão em ${tabela} sem filtro foi recusada.`);
  }
  const params = new URLSearchParams();
  aplicarFiltros(params, filtros);

  const r = await chamar(`/rest/v1/${tabela}?${params.toString()}`, {
    method: "DELETE",
    headers: cabecalhos(),
  });
  await exigirOk(r, `Exclusão em ${tabela}`);
}

/**
 * Chama uma função do banco.
 *
 * É por aqui que passam as reservas atômicas (`crc_reservar_jobs` e as irmãs).
 * Elas existem porque `FOR UPDATE SKIP LOCKED` não tem equivalente em REST — e
 * sem ele dois workers pegam o mesmo job.
 */
export async function rpc<T = Linha>(nome: string, argumentos: Linha = {}): Promise<T[]> {
  const r = await chamar(`/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: cabecalhos({ "content-type": "application/json" }),
    body: JSON.stringify(argumentos),
  });
  await exigirOk(r, `Função ${nome}`);
  const corpo: unknown = await r.json().catch(() => null);
  if (corpo === null) return [];
  return (Array.isArray(corpo) ? corpo : [corpo]) as T[];
}

/** `agora()` do servidor de aplicação, em ISO. Um lugar só, para os testes. */
export function agoraIso(): string {
  return new Date().toISOString();
}
