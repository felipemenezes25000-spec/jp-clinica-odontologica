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

import { colunaExiste } from "./schema-real";

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
  /*
   * COM A CLÍNICA, desde `supabase/24`. O índice aqui ficou para trás quando a
   * chave mudou no banco — e um fake com a chave ANTIGA recusaria o cursor da
   * segunda unidade como duplicata, escondendo exatamente o comportamento que
   * a migração veio permitir.
   */
  crc_sync_state: [{ colunas: ["organization_id", "recurso", "clinic_id"] }],
  crc_scan_state: [{ colunas: ["organization_id", "varredura"] }],
  crc_runtime_heartbeats: [{ colunas: ["worker"] }],
  crc_schema_migrations: [{ colunas: ["nome"] }],
  crc_settings: [{ colunas: ["organization_id", "chave"] }],
  crc_settings_clinica: [{ colunas: ["organization_id", "clinic_id", "chave"] }],
  crc_feature_flags: [{ colunas: ["organization_id", "chave"] }],
  crc_clinics: [{ colunas: ["organization_id", "slug"] }],
  crc_organizations: [{ colunas: ["slug"] }],
  // O índice do 09: é ele que faz um evento reprocessado NÃO rodar o turno do
  // agente de novo — e, com ele, não pagar o modelo de novo.
  crc_ai_runs: [{ colunas: ["organization_id", "chave_dedupe"] }],
  // O índice PARCIAL do 10: uma conversa não acumula dois casos abertos. Sem
  // ele, duas mensagens em sequência colocariam a mesma pessoa duas vezes na
  // fila da recepção.
  crc_human_cases: [
    { colunas: ["organization_id", "chave_dedupe"] },
    {
      colunas: ["organization_id", "conversation_id"],
      onde: (l) => l["status"] === "ABERTO" || l["status"] === "ASSUMIDO",
    },
  ],
  // Os índices do 11. O primeiro é o que faz repetir uma preferência RENOVAR a
  // memória em vez de criar uma cópia dela; o segundo, um supervisor por turno.
  crc_ai_memories: [{ colunas: ["organization_id", "chave_dedupe"] }],
  crc_ai_supervisoes: [{ colunas: ["run_id"] }],
  // Os índices do 12. O do título é o que faz "salvar o mesmo texto de novo"
  // ATUALIZAR a fonte em vez de criar uma segunda homônima, que responderia
  // junto com a primeira.
  crc_knowledge_sources: [{ colunas: ["organization_id", "titulo"] }],
  crc_knowledge_chunks: [{ colunas: ["organization_id", "chave_dedupe"] }],
  // Os índices do 13. Uma rota por finalidade, e um balde de gasto por dia:
  // duas rotas para a mesma finalidade seria ambiguidade sobre qual o gateway
  // usa, e dois baldes do mesmo dia fariam o teto valer o dobro.
  crc_ai_credentials: [{ colunas: ["organization_id", "provedor", "apelido"] }],
  crc_ai_bindings: [{ colunas: ["organization_id", "finalidade"] }],
  crc_ai_gastos: [{ colunas: ["organization_id", "dia"] }],
  crc_ai_orcamentos: [{ colunas: ["organization_id"] }],
  // O índice do 14: dois casos de avaliação homônimos numa lista de quarenta é a
  // forma mais rápida de ninguém confiar no relatório.
  crc_eval_casos: [{ colunas: ["organization_id", "nome"] }],
  // Os índices do 15. Os dois PARCIAIS são o que faz "qual texto o agente usa?" e
  // "qual rascunho está aberto?" terem UMA resposta cada.
  // O indice do 17: um evento enfileira UM job. Sem ele, o motor reprocessando
  // poria o mesmo turno na fila duas vezes — duas chamadas de modelo pagas para
  // produzir a mesma resposta.
  crc_agent_jobs: [{ colunas: ["organization_id", "chave_dedupe"] }],
  crc_agent_versions: [
    { colunas: ["organization_id", "versao"] },
    { colunas: ["organization_id"], onde: (l) => l["status"] === "PUBLICADA" },
    { colunas: ["organization_id"], onde: (l) => l["status"] === "RASCUNHO" },
  ],
  crc_users: [{ colunas: ["organization_id", "email"] }],
  /*
   * Os índices do 30 e do 31 — o Radar.
   *
   * `crc_attribution_events` PRECISA do parcial: um elo sem `chave_dedupe` é
   * legítimo (um `PRODUCAO` lançado à mão não tem de onde tirar chave), e sem o
   * `onde` o segundo elo sem chave seria recusado como duplicata.
   */
  crc_attribution_events: [
    { colunas: ["organization_id", "chave_dedupe"], onde: (l) => !nulo(l["chave_dedupe"]) },
  ],
  crc_ai_activity: [
    { colunas: ["organization_id", "chave_dedupe"], onde: (l) => !nulo(l["chave_dedupe"]) },
  ],
  /*
   * OS DOIS ÍNDICES DA AUTONOMIA, e o fake precisa dos dois separados pelo
   * mesmo motivo que o Postgres: `clinic_id` nulo é o padrão da organização, e
   * em SQL dois NULL não são iguais. Um índice só, com `clinic_id` dentro,
   * deixaria passar quantas linhas de padrão alguém quisesse criar.
   */
  /*
   * Os indices do 32 — agenda inteligente.
   *
   * `crc_gap_offers` tem o unico NAO parcial: uma oferta por pessoa por buraco,
   * sempre. E ele que impede a segunda leva de reoferecer para quem ja recebeu.
   */
  crc_schedule_gaps: [{ colunas: ["organization_id", "chave_dedupe"] }],
  crc_gap_offers: [{ colunas: ["gap_id", "patient_id"] }],
  crc_waitlist_preferences: [{ colunas: ["organization_id", "patient_id"] }],
  crc_autonomia: [
    {
      colunas: ["organization_id", "clinic_id", "dominio"],
      onde: (l) => !nulo(l["clinic_id"]),
    },
    { colunas: ["organization_id", "dominio"], onde: (l) => nulo(l["clinic_id"]) },
  ],
  // O índice do 04: é ele que faz "salvar de novo com o mesmo nome" ser
  // ATUALIZAR em vez de criar uma segunda visão homônima.
  crc_saved_views: [{ colunas: ["organization_id", "user_id", "escopo", "nome"] }],
  // O índice do 05: lançar o mesmo mês e campanha de novo ATUALIZA, e não
  // soma uma segunda linha — senão corrigir um lançamento dobraria o gasto.
  crc_ad_spend: [{ colunas: ["organization_id", "mes", "campanha"] }],
  // Uma mensagem por pessoa por campanha, garantida por constraint — e não
  // pelo cuidado de quem chama.
  crc_campaign_targets: [{ colunas: ["campaign_id", "patient_id"] }],
  crc_dentists: [{ colunas: ["organization_id", "external_source", "external_id"] }],
  // O índice do 08. Duas ofertas abertas na mesma conversa fazem "pode ser as
  // 10:40" virar loteria entre dois conjuntos de opções — e o banco recusa a
  // segunda antes de qualquer código ter chance de errar.
  crc_scheduling_offers: [{ colunas: ["conversation_id"], onde: (l) => l["status"] === "ABERTA" }],
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
  crc_dentists: { ativo: true },
};

export class ErroBancoFake extends Error {
  readonly status = 409;
  readonly detalhe = "duplicate key value violates unique constraint (23505)";
  get ehConflitoDeUnicidade(): boolean {
    return true;
  }
}

/** `"[0.1,0.2]"` vira `[0.1, 0.2]`. Já-array passa direto. */
function comoVetor(v: unknown): number[] | null {
  if (Array.isArray(v)) return v.map(Number);
  if (typeof v !== "string") return null;
  const cru = v.trim().replace(/^\[/u, "").replace(/\]$/u, "");
  if (cru.length === 0) return [];
  return cru.split(",").map((n) => Number(n.trim()));
}

export function limparBanco(): void {
  tabelas = {};
  sequencia = 0;
  relogio = null;
  // Uma falha armada e não disparada vazaria para o teste seguinte, e quebraria
  // um teste que não tem nada a ver com ela. Ver `falharProximaEscrita`.
  falhasArmadas.clear();
}

export function conteudo(tabela: string): Linha[] {
  return tabelas[tabela] ?? [];
}

/** Insere sem passar pelas travas — para montar o cenário do teste. */
export function semear(tabela: string, linhas: Linha[]): void {
  const alvo = (tabelas[tabela] ??= []);
  for (const l of linhas) {
    conferirColunas(tabela, l, "Semeadura");
    alvo.push({ ...comPadroes(tabela, l) });
  }
}

/**
 * Recusa gravar coluna que o SQL não declara.
 *
 * ESTA FUNÇÃO É A CORREÇÃO DE UMA CLASSE INTEIRA DE BUG, e não de um bug.
 *
 * Este banco guarda objetos e não tem schema. Isso o torna rápido e o torna
 * cúmplice: um teste que semeia `{ telefone: "..." }` e um código que lê
 * `telefone` concordam perfeitamente entre si, e os dois estão errados porque a
 * coluna real é `contato_externo`. Foi assim que três consultas do runtime
 * passaram por 696 testes verdes sem nunca terem funcionado contra o Postgres.
 *
 * Com esta conferência, TODO teste que já existe vira também teste de schema,
 * sem que nenhum deles precise ser reescrito.
 *
 * CONFERE O QUE O CHAMADOR ESCREVEU, e não a linha depois dos padrões: o
 * `comPadroes` injeta `atualizado_em` em tudo, e nem toda tabela tem essa
 * coluna. Validar a saída acusaria o próprio fake.
 *
 * TABELA DESCONHECIDA PASSA. O portal de RH tem tabelas com outro estilo, e um
 * verificador que grita sem motivo é desligado na primeira semana.
 */
function conferirColunas(tabela: string, linha: Linha, operacao: string): void {
  const invalidas = Object.keys(linha).filter((c) => !colunaExiste(tabela, c));
  if (invalidas.length === 0) return;

  throw new Error(
    `${operacao} em ${tabela} usou coluna que não existe no SQL: ${invalidas.join(", ")}. ` +
      `A fonte de verdade é supabase/*.sql — confira o nome lá antes de mudar o teste.`,
  );
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

/* -------------------------------------------------------------------------- */
/* Injeção de falha                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Faz a PRÓXIMA operação numa tabela explodir.
 *
 * POR QUE ISTO PRECISA EXISTIR. Uma classe inteira de defeito só aparece quando
 * o banco falha na hora exata: o turno que seguia sem reserva de idempotência, o
 * evento que era marcado PROCESSADO sem job nenhum. Nenhum dos dois quebra
 * nenhum teste com o banco de pé — os dois são caminhos de `catch`, e um `catch`
 * que ninguém exercita é uma decisão que ninguém revisou.
 *
 * O CONTRATO É "UMA VEZ", de propósito. Um modo "falhe sempre" faria o teste
 * passar por motivo errado: a chamada seguinte — a que verifica a recuperação —
 * também falharia, e o teste confirmaria o erro em vez do conserto.
 *
 * `limparBanco` zera isto, então um teste que arma e não dispara não contamina o
 * seguinte.
 */
const falhasArmadas = new Map<string, string>();

export function falharProximaEscrita(tabela: string, mensagem = "banco indisponível"): void {
  falhasArmadas.set(`escrita:${tabela}`, mensagem);
}

/**
 * A irmã da de cima, para o caminho de LEITURA.
 *
 * PRECISOU EXISTIR DEPOIS DE UM TESTE QUE PASSOU PELO MOTIVO ERRADO. O teste do
 * pulso — "uma organização que falha não derruba as outras" — armava falha de
 * ESCRITA em `crc_settings`, e o caminho que ele queria derrubar é
 * `lerConfiguracao`, que só LÊ. A falha nunca disparava, o `catch` nunca era
 * exercitado, e o teste ficava verde mesmo com a rede de segurança removida.
 *
 * Escrita e leitura são armadas separadamente de propósito: quase todo caminho
 * faz as duas, e uma armadilha que pega qualquer uma das duas explodiria no
 * lugar errado — dando de novo um teste que passa por acidente.
 */
export function falharProximaLeitura(tabela: string, mensagem = "banco indisponível"): void {
  falhasArmadas.set(`leitura:${tabela}`, mensagem);
}

/** Dispara e DESARMA. Chamada no começo de toda escrita, leitura e RPC. */
function dispararFalhaArmada(chave: string): void {
  const mensagem = falhasArmadas.get(chave);
  if (mensagem === undefined) return;
  falhasArmadas.delete(chave);
  throw new Error(mensagem);
}

export function agoraIso(): string {
  return new Date(agoraMs()).toISOString();
}

export function selecionar<T = Linha>(tabela: string, opcoes: OpcoesSelecao = {}): Promise<T[]> {
  dispararFalhaArmada(`leitura:${tabela}`);
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
  dispararFalhaArmada(`escrita:${tabela}`);
  const lista = Array.isArray(linhas) ? linhas : [linhas];
  const alvo = (tabelas[tabela] ??= []);
  const criadas: Linha[] = [];

  for (const bruta of lista) {
    conferirColunas(tabela, bruta, "Inserção");
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

/**
 * Inserção em LOTE que pula quem já existe — `on conflict do nothing`.
 *
 * A DIFERENÇA EM RELAÇÃO A `inserir` É O QUE IMPORTA AQUI: lá, uma duplicata no
 * meio derruba o lote inteiro e as linhas boas não entram. Reproduzir isso
 * errado no fake faria o congelamento de campanha parecer completo num teste e
 * perder gente em produção — que é exatamente a classe de defeito que a
 * paginação veio consertar.
 *
 * Devolve QUANTAS entraram, e não o tamanho do lote.
 */
export function inserirLoteIgnorandoDuplicatas(
  tabela: string,
  linhas: readonly Linha[],
  _conflito: string,
): Promise<number> {
  dispararFalhaArmada(`escrita:${tabela}`);
  const alvo = (tabelas[tabela] ??= []);
  let gravadas = 0;

  for (const bruta of linhas) {
    conferirColunas(tabela, bruta, "Inserção");
    const nova = comPadroes(tabela, bruta);
    // PULA, e não lança: é a semântica do `ignore-duplicates`.
    if (conflita(tabela, nova)) continue;
    alvo.push(nova);
    gravadas += 1;
  }

  return Promise.resolve(gravadas);
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
    conferirColunas(tabela, bruta, "Gravação");
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
  conferirColunas(tabela, mudancas, "Atualização");

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
/**
 * Registra na dead letter, sem duplicar.
 *
 * A GUARDA DE DUPLICATA E O PONTO: a limpeza roda a cada volta do worker, e sem
 * ela um item preso viraria uma linha nova por volta — ate a fila de falhas ter
 * mais ruido que sinal, que e como ela deixa de ser lida.
 */
function anotarMorte(
  tabelas: Tabelas,
  origem: string,
  referencia: unknown,
  erro: string,
  organizationId: unknown,
  payload: Linha,
): void {
  const mortas = (tabelas["crc_dead_letters"] ??= []);
  const jaTem = mortas.some((d) => d["origem"] === origem && d["referencia"] === referencia);
  if (jaTem) return;

  mortas.push(
    comPadroes("crc_dead_letters", {
      organization_id: organizationId ?? null,
      origem,
      referencia,
      erro: erro.length > 0 ? erro : "Esgotou as tentativas com o worker morto.",
      payload,
      status: "PENDENTE",
    }),
  );
}

export function rpc<T = Linha>(nome: string, argumentos: Linha = {}): Promise<T[]> {
  // A RPC arma pelo NOME dela, e não pela tabela que toca: do lado de fora é a
  // RPC que falha, e é ela que quem chama tem de saber tratar.
  dispararFalhaArmada(`escrita:${nome}`);
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
    /*
     * O BATIMENTO DO WORKER — `supabase/27`.
     *
     * O `coalesce` de cada campo e o ponto: um erro NAO pode apagar
     * `ultimo_sucesso_em`, que e justamente o campo que diz ha quanto tempo o
     * sistema funciona. Um fake que sobrescrevesse tudo concordaria com um
     * codigo que perde essa informacao.
     */
    /*
     * AS OPCOES DO FILTRO DE CAMPANHA — `supabase/29`.
     *
     * O fake faz o mesmo `distinct` que o SQL, e respeita o `p_clinic_id`
     * opcional. Sem isso, um teste de duas unidades concordaria com um codigo
     * que mistura as especialidades das duas na mesma tela.
     */
    /*
     * O RESUMO DO RADAR — `supabase/30` e `supabase/31`.
     *
     * ESTE FAKE PRECISA REPETIR AS TRES EXCLUSOES DO SQL: fechada, descartada
     * e vencida. Um fake que somasse tudo concordaria com um codigo que enche a
     * Home de dinheiro que nao existe mais — e o teste que verifica "vencida
     * nao entra no total" passaria contra o fake e falharia contra o Postgres.
     *
     * E `valor_esperado` e `potential_value * coalesce(probability, 0)` LINHA A
     * LINHA, como no SQL. Multiplicar o total por uma media daria outro numero.
     */
    /*
     * OS CANDIDATOS A UM BURACO — `supabase/32`.
     *
     * ESTE FAKE PRECISA REPETIR AS QUATRO EXCLUSOES DO SQL, e cada uma protege
     * uma coisa diferente:
     *
     *   opt_out          quem pediu silencio nao entra nem no fim da lista;
     *   consulta futura  quem ja tem hora marcada nao precisa de encaixe;
     *   ja oferecido     a segunda leva nao reoferece para os mesmos;
     *   telefone         sem canal nao adianta convidar.
     *
     * Um fake que esquecesse qualquer uma concordaria com um codigo que a
     * esquece — e a primeira seria a que aparece como reclamacao.
     */
    case "crc_candidatos_para_buraco": {
      const org = argumentos["p_organization_id"];
      const gapId = argumentos["p_gap_id"];
      const limite = typeof argumentos["p_limite"] === "number" ? argumentos["p_limite"] : 20;

      const buraco = (tabelas["crc_schedule_gaps"] ?? []).find(
        (g) => g["id"] === gapId && g["organization_id"] === org,
      );
      if (buraco === undefined) return Promise.resolve([] as T[]);

      const inicio = new Date(String(buraco["inicio_em"]));
      // O mesmo `at time zone 'America/Sao_Paulo'` do SQL.
      const partes = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(inicio);
      const nomeDia = partes.find((x) => x.type === "weekday")?.value ?? "";
      const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(nomeDia);
      const hora = `${partes.find((x) => x.type === "hour")?.value ?? "00"}:${partes.find((x) => x.type === "minute")?.value ?? "00"}`;

      const jaOferecidos = new Set(
        (tabelas["crc_gap_offers"] ?? [])
          .filter((o) => o["gap_id"] === gapId)
          .map((o) => String(o["patient_id"])),
      );

      const saida: Linha[] = [];

      for (const pac of tabelas["crc_patients"] ?? []) {
        if (pac["organization_id"] !== org) continue;
        if (pac["clinic_id"] !== buraco["clinic_id"]) continue;
        if (pac["arquivado"] === true) continue;
        if (pac["ativo"] === false) continue;
        if (pac["opt_out_em"] !== null && pac["opt_out_em"] !== undefined) continue;
        if (typeof pac["telefone"] !== "string" || pac["telefone"].length === 0) continue;
        if (jaOferecidos.has(String(pac["id"]))) continue;

        const temFutura = (tabelas["crc_appointments"] ?? []).some(
          (a) =>
            a["patient_id"] === pac["id"] &&
            typeof a["inicio_em"] === "string" &&
            Date.parse(a["inicio_em"]) > agora &&
            (a["status"] === "TO_CONFIRM" || a["status"] === "CONFIRMED"),
        );
        if (temFutura) continue;

        const w = (tabelas["crc_waitlist_preferences"] ?? []).find(
          (x) => x["patient_id"] === pac["id"] && x["ativo"] !== false,
        );

        const dias = Array.isArray(w?.["dias"]) ? (w["dias"] as number[]) : [];
        const horaInicio = typeof w?.["hora_inicio"] === "string" ? w["hora_inicio"] : null;
        const horaFim = typeof w?.["hora_fim"] === "string" ? w["hora_fim"] : null;

        saida.push({
          patient_id: pac["id"],
          nome: pac["nome"],
          telefone: pac["telefone"],
          tem_waitlist: w !== undefined,
          aceita_encaixe: w === undefined ? true : w["aceita_encaixe"] !== false,
          dia_bate: w === undefined || dias.length === 0 || dias.includes(dow),
          hora_bate:
            w === undefined ||
            horaInicio === null ||
            (hora >= horaInicio && hora <= (horaFim ?? "23:59")),
          dentista_bate:
            w === undefined ||
            w["dentist_id"] === null ||
            w["dentist_id"] === undefined ||
            w["dentist_id"] === buraco["dentist_id"],
          ultima_consulta: pac["ultima_consulta_em"] ?? null,
          consultas_feitas: (tabelas["crc_appointments"] ?? []).filter(
            (a) => a["patient_id"] === pac["id"] && a["status"] === "COMPLETED",
          ).length,
        });
      }

      // A mesma ordem do SQL: waitlist primeiro, depois quem veio mais recente.
      saida.sort((a, b) => {
        if (a["tem_waitlist"] !== b["tem_waitlist"]) return a["tem_waitlist"] === true ? -1 : 1;
        const ua = typeof a["ultima_consulta"] === "string" ? Date.parse(a["ultima_consulta"]) : -1;
        const ub = typeof b["ultima_consulta"] === "string" ? Date.parse(b["ultima_consulta"]) : -1;
        return ub - ua;
      });

      return Promise.resolve(saida.slice(0, Math.max(1, Math.min(limite, 100))) as T[]);
    }

    case "crc_radar_resumo": {
      const org = argumentos["p_organization_id"];
      const clinica =
        typeof argumentos["p_clinic_id"] === "string" ? argumentos["p_clinic_id"] : null;

      type Acc = {
        abertas: number;
        potencial: number;
        confirmado: number;
        esperado: number;
        somaConfianca: number;
        scoreMax: number;
        aguardandoHumano: number;
      };
      const porTipo = new Map<string, Acc>();

      for (const l of tabelas["crc_opportunities"] ?? []) {
        if (l["organization_id"] !== org) continue;
        if (clinica !== null && l["clinic_id"] !== clinica) continue;
        if (l["fechada_em"] !== null && l["fechada_em"] !== undefined) continue;
        if (l["dismissed_em"] !== null && l["dismissed_em"] !== undefined) continue;

        const expira = l["expires_at"];
        if (typeof expira === "string" && Date.parse(expira) <= agora) continue;

        const tipo = String(l["tipo"] ?? "MANUAL");
        const a = porTipo.get(tipo) ?? {
          abertas: 0,
          potencial: 0,
          confirmado: 0,
          esperado: 0,
          somaConfianca: 0,
          scoreMax: 0,
          aguardandoHumano: 0,
        };

        const potencial = Number(l["potential_value"] ?? 0) || 0;
        const prob = Number(l["probability"] ?? 0) || 0;
        const conf = Number(l["confidence"] ?? 0) || 0;
        const score = Number(l["priority_score"] ?? 0) || 0;

        a.abertas += 1;
        a.potencial += potencial;
        a.confirmado += Number(l["confirmed_value"] ?? 0) || 0;
        a.esperado += potencial * prob;
        a.somaConfianca += conf;
        a.scoreMax = Math.max(a.scoreMax, score);
        if (l["aguardando"] === "HUMANO") a.aguardandoHumano += 1;

        porTipo.set(tipo, a);
      }

      const saida = [...porTipo.entries()]
        .map(([tipo, a]) => ({
          tipo,
          abertas: a.abertas,
          valor_potencial: a.potencial,
          valor_confirmado: a.confirmado,
          valor_esperado: a.esperado,
          confianca_media: a.abertas === 0 ? 0 : a.somaConfianca / a.abertas,
          score_maximo: a.scoreMax,
          aguardando_humano: a.aguardandoHumano,
        }))
        .sort((x, y) => y.valor_esperado - x.valor_esperado);

      return Promise.resolve(saida as T[]);
    }

    case "crc_opcoes_de_publico": {
      const org = argumentos["p_organization_id"];
      const clinica =
        typeof argumentos["p_clinic_id"] === "string" ? argumentos["p_clinic_id"] : null;

      const especialidades = new Set<string>();
      const convenios = new Set<string>();

      for (const l of tabelas["crc_patients"] ?? []) {
        if (l["organization_id"] !== org) continue;
        if (l["arquivado"] === true) continue;
        if (clinica !== null && l["clinic_id"] !== clinica) continue;

        const e = typeof l["especialidade"] === "string" ? l["especialidade"].trim() : "";
        const c = typeof l["convenio"] === "string" ? l["convenio"].trim() : "";
        if (e.length > 0) especialidades.add(e);
        if (c.length > 0) convenios.add(c);
      }

      const saida = [
        ...[...especialidades].sort().map((valor) => ({ tipo: "especialidade", valor })),
        ...[...convenios].sort().map((valor) => ({ tipo: "convenio", valor })),
      ];
      return Promise.resolve(saida as T[]);
    }

    case "crc_bater_heartbeat": {
      const worker = String(argumentos["p_worker"] ?? "");
      const fase = String(argumentos["p_fase"] ?? "");
      const agoraIso = new Date(agora).toISOString();

      const linhas = (tabelas["crc_runtime_heartbeats"] ??= []);
      let linha = linhas.find((l) => l["worker"] === worker);
      if (linha === undefined) {
        linha = comPadroes("crc_runtime_heartbeats", { worker, metricas: {} });
        linhas.push(linha);
      }

      if (fase === "inicio") linha["ultimo_inicio_em"] = agoraIso;
      if (fase === "sucesso") linha["ultimo_sucesso_em"] = agoraIso;
      if (fase === "erro") {
        linha["ultimo_erro_em"] = agoraIso;
        linha["ultimo_erro"] = String(argumentos["p_erro"] ?? "").slice(0, 500);
      }
      if (argumentos["p_duracao_ms"] != null) linha["duracao_ms"] = argumentos["p_duracao_ms"];
      if (argumentos["p_metricas"] != null) linha["metricas"] = argumentos["p_metricas"];
      linha["atualizado_em"] = agoraIso;

      return Promise.resolve([] as T[]);
    }

    /*
     * A PAGINA DO RECALL, com keyset — `supabase/26`.
     *
     * A COMPARACAO DE TUPLA E O PONTO DESTE CASO. Reproduzi-la como
     * `data > cursor` sozinho faria o fake pular todos os pacientes que
     * compartilham o mesmo instante depois do primeiro — e base importada tem
     * dezenas deles, com a data truncada no dia. O fake concordaria com um
     * codigo errado, que e o unico jeito de um banco de mentira fazer mal.
     */
    case "crc_pagina_de_recall": {
      const org = argumentos["p_organization_id"];
      const limiteData = String(argumentos["p_limite_data"] ?? "");
      const cursorData =
        typeof argumentos["p_cursor_data"] === "string" ? argumentos["p_cursor_data"] : null;
      const cursorId =
        typeof argumentos["p_cursor_id"] === "string" ? argumentos["p_cursor_id"] : "";
      const teto = typeof argumentos["p_limite"] === "number" ? argumentos["p_limite"] : 200;

      const chave = (l: Linha): string =>
        `${String(l["ultima_consulta_em"] ?? "")}|${String(l["id"] ?? "")}`;

      const elegiveis = (tabelas["crc_patients"] ?? [])
        .filter(
          (l) =>
            l["organization_id"] === org &&
            l["arquivado"] !== true &&
            l["ativo"] !== false &&
            nulo(l["opt_out_em"]) &&
            !nulo(l["telefone"]) &&
            typeof l["ultima_consulta_em"] === "string" &&
            l["ultima_consulta_em"] < limiteData,
        )
        .sort((a, b) => (chave(a) < chave(b) ? -1 : chave(a) > chave(b) ? 1 : 0));

      const depoisDoCursor =
        cursorData === null
          ? elegiveis
          : elegiveis.filter((l) => chave(l) > `${cursorData}|${cursorId}`);

      return Promise.resolve(depoisDoCursor.slice(0, teto).map((l) => ({ ...l })) as T[]);
    }

    /*
     * OS ANIVERSARIANTES, pelo inteiro `MMDD` — `supabase/26`.
     *
     * O fake faz a mesma aritmetica que o indice de expressao do banco. Nao
     * reproduz o `to_char`, porque o banco tambem nao usa: `to_char` de date e
     * STABLE e o Postgres recusa em indice.
     */
    case "crc_aniversariantes": {
      const org = argumentos["p_organization_id"];
      const datas = Array.isArray(argumentos["p_datas"]) ? (argumentos["p_datas"] as number[]) : [];
      const teto = typeof argumentos["p_limite"] === "number" ? argumentos["p_limite"] : 500;

      const achados = (tabelas["crc_patients"] ?? [])
        .filter((l) => {
          if (l["organization_id"] !== org) return false;
          if (l["arquivado"] === true || l["ativo"] === false) return false;
          if (!nulo(l["opt_out_em"]) || nulo(l["telefone"])) return false;

          const nascimento = typeof l["nascimento"] === "string" ? l["nascimento"] : "";
          if (nascimento.length < 10) return false;

          const mmdd =
            Number.parseInt(nascimento.slice(5, 7), 10) * 100 +
            Number.parseInt(nascimento.slice(8, 10), 10);
          return datas.includes(mmdd);
        })
        .slice(0, teto);

      return Promise.resolve(achados.map((l) => ({ ...l })) as T[]);
    }

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

    /*
     * A busca vetorial do 12, em JavaScript.
     *
     * ELA REPRODUZ AS DUAS TRAVAS QUE IMPORTAM, e não a performance: o filtro de
     * organização e a exigência de a fonte estar PUBLICADA. São as duas coisas
     * que, se sumirem da função SQL algum dia, fazem o conteúdo de uma clínica
     * responder pela outra ou um rascunho responder paciente — e um fake que não
     * as reproduzisse aceitaria essa regressão sem uma falha de teste.
     *
     * O cosseno aqui é exato; no Postgres o HNSW é aproximado. A diferença não
     * muda nenhuma asserção destes testes, que têm dezenas de pedaços e não
     * milhares.
     */
    case "crc_buscar_conhecimento": {
      const org = argumentos["p_organization_id"];
      const consulta = Array.isArray(argumentos["p_embedding"])
        ? (argumentos["p_embedding"] as number[])
        : [];
      const teto = typeof argumentos["p_limite"] === "number" ? argumentos["p_limite"] : 20;
      const minimo = typeof argumentos["p_minimo"] === "number" ? argumentos["p_minimo"] : 0;

      const fontes = new Map<string, Linha>();
      for (const f of tabelas["crc_knowledge_sources"] ?? []) {
        fontes.set(String(f["id"] ?? ""), f);
      }

      const achados = (tabelas["crc_knowledge_chunks"] ?? [])
        .filter((c) => c["organization_id"] === org && Array.isArray(c["embedding"]))
        .map((c) => {
          const fonte = fontes.get(String(c["source_id"] ?? ""));
          return { c, fonte };
        })
        .filter(
          (x) =>
            x.fonte !== undefined &&
            x.fonte["organization_id"] === org &&
            x.fonte["status"] === "PUBLICADA",
        )
        .map((x) => ({
          id: x.c["id"],
          source_id: x.c["source_id"],
          titulo: x.fonte?.["titulo"] ?? "",
          tipo: x.fonte?.["tipo"] ?? "texto",
          ordem: x.c["ordem"],
          conteudo: x.c["conteudo"],
          similaridade: cosseno(consulta, x.c["embedding"] as number[]),
        }))
        .filter((x) => x.similaridade >= minimo)
        .sort((a, b) => b.similaridade - a.similaridade)
        .slice(0, teto);

      return Promise.resolve(achados as T[]);
    }

    /*
     * A soma de gasto do 13.
     *
     * ELA É ATÔMICA NO POSTGRES e sequencial aqui, o que basta: o que o teste
     * precisa provar é que somar duas chamadas dá a soma das duas, e que o
     * balde é por dia. A corrida de verdade — dois turnos terminando no mesmo
     * milissegundo — é o que a função SQL resolve com `on conflict do update`, e
     * um fake de processo único não consegue reproduzi-la de qualquer forma.
     */
    /*
     * A RESERVA DE ORÇAMENTO — Fase D.
     *
     * O QUE O FAKE PODE E NÃO PODE PROVAR, dito antes de qualquer asserção.
     *
     * PODE: que a decisão e o incremento acontecem no mesmo passo, que o teto do
     * dia e o do mês são ambos respeitados, que teto zero significa sem teto, e
     * que a chamada seguinte enxerga o que a anterior reservou.
     *
     * NÃO PODE: que duas transações CONCORRENTES no Postgres não se atropelam.
     * Isso é `for update` de verdade, e só o item 20 — Postgres no CI — prova.
     * JavaScript é uma thread só: aqui a concorrência é simulada, não sofrida.
     */
    case "crc_reservar_orcamento": {
      const org = argumentos["p_organization_id"];
      const dia = String(argumentos["p_dia"] ?? "");
      const micro = Number(argumentos["p_micro"] ?? 0);
      const tetoDia = Number(argumentos["p_teto_dia_micro"] ?? 0);
      const tetoMes = Number(argumentos["p_teto_mes_micro"] ?? 0);
      const primeiro = `${dia.slice(0, 7)}-01`;

      const baldes = tabelas["crc_ai_gastos"] ?? [];
      let balde = baldes.find((b) => b["organization_id"] === org && b["dia"] === dia);
      if (balde === undefined) {
        balde = { organization_id: org, dia, micro_reais: 0, chamadas: 0 };
        baldes.push(balde);
        tabelas["crc_ai_gastos"] = baldes;
      }

      const doDia = Number(balde["micro_reais"] ?? 0);
      const doMes = baldes
        .filter((b) => b["organization_id"] === org && String(b["dia"] ?? "") >= primeiro)
        .reduce((t, b) => t + Number(b["micro_reais"] ?? 0), 0);

      // Teto <= 0 é SEM TETO, igual ao SQL. Divergir aqui faria o fake aprovar
      // o que o banco recusa, que é o pior tipo de dublê.
      const estourou =
        (tetoDia > 0 && doDia + micro > tetoDia) || (tetoMes > 0 && doMes + micro > tetoMes);

      if (estourou) {
        return Promise.resolve([{ reservou: false, dia_micro: doDia, mes_micro: doMes }] as T[]);
      }

      balde["micro_reais"] = doDia + micro;
      balde["chamadas"] = Number(balde["chamadas"] ?? 0) + 1;
      balde["atualizado_em"] = new Date(agoraMs()).toISOString();

      return Promise.resolve([
        { reservou: true, dia_micro: doDia + micro, mes_micro: doMes + micro },
      ] as T[]);
    }

    case "crc_ajustar_gasto": {
      const org = argumentos["p_organization_id"];
      const dia = String(argumentos["p_dia"] ?? "");
      const delta = Number(argumentos["p_delta_micro"] ?? 0);

      const balde = (tabelas["crc_ai_gastos"] ?? []).find(
        (b) => b["organization_id"] === org && b["dia"] === dia,
      );
      if (balde !== undefined) {
        // `max(...,0)` igual ao SQL: contador negativo é pior do que impreciso.
        balde["micro_reais"] = Math.max(Number(balde["micro_reais"] ?? 0) + delta, 0);
        balde["atualizado_em"] = new Date(agoraMs()).toISOString();
      }
      return Promise.resolve([] as T[]);
    }

    /*
     * A TROCA DO CONHECIMENTO — Fase D.
     *
     * O fake apaga e insere em sequência, que é justamente o que o SQL deixou de
     * fazer. A diferença é invisível aqui e é o ponto todo lá: em JavaScript não
     * existe "outra requisição no meio". O que ESTE dublê prova é o contrato —
     * quais pedaços sobram e com que conteúdo —, não a atomicidade.
     */
    case "crc_trocar_conhecimento": {
      const org = argumentos["p_organization_id"];
      const fonte = argumentos["p_source_id"];
      const pedacos = Array.isArray(argumentos["p_pedacos"])
        ? (argumentos["p_pedacos"] as Record<string, unknown>[])
        : [];

      const restantes = (tabelas["crc_knowledge_chunks"] ?? []).filter(
        (c) => !(c["organization_id"] === org && c["source_id"] === fonte),
      );

      for (const p of pedacos) {
        restantes.push(
          comPadroes("crc_knowledge_chunks", {
            organization_id: org,
            source_id: fonte,
            ordem: p["ordem"],
            conteudo: p["conteudo"],
            tamanho: p["tamanho"],
            // O CHAMADOR MANDA O FORMATO DE FIO do pgvector — `[0.1,0.2]` como
            // texto, porque é o que o cast `::vector` aceita. A COLUNA, porém, é
            // um vetor, e o resto do fake (a busca por similaridade) trabalha
            // com números. Desfazer a serialização aqui é o que mantém o dublê
            // modelando a coluna, e não o protocolo.
            embedding: comoVetor(p["embedding"]),
            chave_dedupe: p["chave_dedupe"],
          }),
        );
      }

      tabelas["crc_knowledge_chunks"] = restantes;
      return Promise.resolve([{ quantos: pedacos.length }] as T[]);
    }

    /*
     * A PUBLICAÇÃO — Fase D.
     *
     * `rascunho_indisponivel` é lançado com a MESMA string do SQL, porque o
     * chamador reconhece a corrida por ela. Um fake que lançasse outra mensagem
     * deixaria o caminho de recuperação sem teste.
     */
    case "crc_publicar_versao_agente": {
      const org = argumentos["p_organization_id"];
      const versaoId = argumentos["p_versao_id"];
      const versoes = tabelas["crc_agent_versions"] ?? [];

      const alvo = versoes.find((v) => v["organization_id"] === org && v["id"] === versaoId);
      if (alvo === undefined || alvo["status"] !== "RASCUNHO") {
        return Promise.reject(new Error("rascunho_indisponivel"));
      }

      for (const v of versoes) {
        if (v["organization_id"] === org && v["status"] === "PUBLICADA" && v["id"] !== versaoId) {
          v["status"] = "ARQUIVADA";
        }
      }

      alvo["status"] = "PUBLICADA";
      alvo["rodada_id"] = argumentos["p_rodada_id"] ?? null;
      alvo["publicado_por"] = argumentos["p_user_id"] ?? null;
      alvo["publicado_em"] = new Date(agoraMs()).toISOString();

      return Promise.resolve([{ ok: true }] as T[]);
    }

    case "crc_somar_gasto": {
      const org = argumentos["p_organization_id"];
      const dia = String(argumentos["p_dia"] ?? "");
      const micro =
        typeof argumentos["p_micro"] === "number" ? Math.max(argumentos["p_micro"], 0) : 0;

      const baldes = tabelas["crc_ai_gastos"] ?? [];
      let balde = baldes.find((b) => b["organization_id"] === org && b["dia"] === dia);
      if (balde === undefined) {
        balde = { organization_id: org, dia, micro_reais: 0, chamadas: 0 };
        baldes.push(balde);
        tabelas["crc_ai_gastos"] = baldes;
      }

      balde["micro_reais"] =
        (typeof balde["micro_reais"] === "number" ? balde["micro_reais"] : 0) + micro;
      balde["chamadas"] = (typeof balde["chamadas"] === "number" ? balde["chamadas"] : 0) + 1;
      balde["atualizado_em"] = new Date(agoraMs()).toISOString();

      return Promise.resolve([
        { dia_micro: balde["micro_reais"], chamadas_dia: balde["chamadas"] },
      ] as T[]);
    }

    /*
     * A reserva de jobs do agente — Fase B.
     *
     * Reproduz as tres condicoes que importam da RPC de verdade: so pega o que
     * esta disponivel, so pega o que nao esta travado por outro worker, e
     * incrementa a tentativa NA RESERVA. A terceira e a que impede um job que
     * derruba o worker de tentar para sempre.
     */
    case "crc_reservar_agent_jobs": {
      const teto = typeof argumentos["limite"] === "number" ? argumentos["limite"] : 5;
      const lockSeg =
        typeof argumentos["lock_segundos"] === "number" ? argumentos["lock_segundos"] : 180;
      const quem = argumentos["quem"] ?? null;
      const ateQuando = new Date(agora + lockSeg * 1000).toISOString();

      const disponivel = (l: Linha): boolean => {
        const q = l["disponivel_em"];
        return typeof q !== "string" || Date.parse(q) <= agora;
      };

      const alvo = (tabelas["crc_agent_jobs"] ?? [])
        .filter(
          (l) =>
            l["status"] === "PENDENTE" ||
            l["status"] === "REPETIR" ||
            // Lease vencido: o worker morreu e o trabalho volta a ser de quem
            // pegar. Ver o comentario da RPC no 17.
            (l["status"] === "RODANDO" && livre(l)),
        )
        .filter(disponivel)
        .filter(livre)
        .filter((l) => (typeof l["tentativas"] === "number" ? l["tentativas"] : 0) < 5)
        .slice(0, teto);

      for (const l of alvo) {
        sequencia += 1;
        l["status"] = "RODANDO";
        l["travado_ate"] = ateQuando;
        l["travado_por"] = quem;
        // UM TOKEN NOVO A CADA RESERVA. É o que faz o fencing funcionar: o
        // `travado_por` se repete entre invocações, o token não.
        l["lease_token"] = `lease-${String(sequencia)}`;
        l["comecou_em"] = new Date(agora).toISOString();
        l["tentativas"] = (typeof l["tentativas"] === "number" ? l["tentativas"] : 0) + 1;
      }

      return Promise.resolve(alvo.map((l) => ({ ...l })) as T[]);
    }

    /*
     * O heartbeat. Renova o lease do job E da run, e SÓ se o token bater.
     *
     * O `false` e o que avisa quem chama que a posse foi perdida — e parar ali
     * e obrigatorio, senao dois workers respondem o mesmo paciente.
     */
    case "crc_renovar_lease": {
      const jobId = argumentos["p_job_id"];
      const token = argumentos["p_lease_token"];
      const segundos =
        typeof argumentos["p_segundos"] === "number" ? argumentos["p_segundos"] : 180;
      const ateQuando = new Date(agora + segundos * 1000).toISOString();

      const job = (tabelas["crc_agent_jobs"] ?? []).find(
        (l) => l["id"] === jobId && l["lease_token"] === token && l["status"] === "RODANDO",
      );

      if (job === undefined) return Promise.resolve([{ crc_renovar_lease: false }] as T[]);

      job["travado_ate"] = ateQuando;

      // A run acompanha o job: os dois leases precisam vencer juntos.
      for (const r of tabelas["crc_ai_runs"] ?? []) {
        if (r["job_id"] === jobId && r["resultado"] === "RODANDO") r["travado_ate"] = ateQuando;
      }

      return Promise.resolve([{ crc_renovar_lease: true }] as T[]);
    }

    /*
     * O fencing do encerramento: quem perdeu a posse nao grava o desfecho.
     *
     * Sem isto, o worker antigo acorda depois do reclaim e escreve por cima do
     * trabalho de quem assumiu — e o ultimo a escrever vence.
     */
    case "crc_encerrar_agent_job": {
      const job = (tabelas["crc_agent_jobs"] ?? []).find(
        (l) =>
          l["id"] === argumentos["p_job_id"] &&
          l["lease_token"] === argumentos["p_lease_token"] &&
          l["status"] === "RODANDO",
      );

      if (job === undefined) {
        return Promise.resolve([{ crc_encerrar_agent_job: false }] as T[]);
      }

      job["status"] = argumentos["p_status"];
      if (argumentos["p_erro"] != null) job["ultimo_erro"] = argumentos["p_erro"];
      if (argumentos["p_duracao_ms"] != null) job["duracao_ms"] = argumentos["p_duracao_ms"];
      /*
       * O BACKOFF SAI NA MESMA CHAMADA — `supabase/25`.
       *
       * Antes ele vinha num `update` separado, e entre as duas instruções a
       * linha ficava REPETIR com o `disponivel_em` velho: elegível. Reproduzir
       * o parâmetro aqui é o que permite ao teste do fake notar se o código
       * voltar a fazer em dois passos — sem isto, a asserção passaria pelo
       * segundo `update` e não provaria a atomicidade.
       */
      if (argumentos["p_disponivel_em"] != null) {
        job["disponivel_em"] = argumentos["p_disponivel_em"];
      }
      job["terminou_em"] = new Date(agora).toISOString();
      job["travado_ate"] = null;

      return Promise.resolve([{ crc_encerrar_agent_job: true }] as T[]);
    }

    /*
     * A reivindicação da run — o reclaim.
     *
     * Reproduz as QUATRO situações da RPC de verdade, porque são quatro decisões
     * diferentes de quem chama e reduzi-las a "consegui / não consegui" foi
     * exatamente o defeito que esta função conserta:
     *
     *   nova     não existia. Cria e executa.
     *   reclaim  existia RODANDO com o lease VENCIDO — o dono morreu. Assume.
     *   ocupada  existia RODANDO com o lease VIVO. Outro está nela agora.
     *   terminal já tem desfecho. O trabalho aconteceu.
     */
    case "crc_reivindicar_ai_run": {
      const org = argumentos["p_organization_id"];
      const chave = argumentos["p_chave_dedupe"];
      const leaseSeg =
        typeof argumentos["p_lease_segundos"] === "number" ? argumentos["p_lease_segundos"] : 180;
      const ateQuando = new Date(agora + leaseSeg * 1000).toISOString();

      const runs = tabelas["crc_ai_runs"] ?? [];
      const existente = runs.find(
        (l) => l["organization_id"] === org && l["chave_dedupe"] === chave,
      );

      if (existente === undefined) {
        const nova = comPadroes("crc_ai_runs", {
          organization_id: org,
          conversation_id: argumentos["p_conversation_id"],
          chave_dedupe: chave,
          resultado: "RODANDO",
          iniciado_em: new Date(agora).toISOString(),
          job_id: argumentos["p_job_id"] ?? null,
          travado_ate: ateQuando,
          travado_por: argumentos["p_quem"] ?? null,
          tentativa: 1,
          prompt_versao: "agent_shadow_turn_v1",
        });
        runs.push(nova);
        tabelas["crc_ai_runs"] = runs;
        return Promise.resolve([
          { situacao: "nova", run_id: nova["id"], numero_tentativa: 1 },
        ] as T[]);
      }

      if (existente["resultado"] !== "RODANDO") {
        return Promise.resolve([
          { situacao: "terminal", run_id: existente["id"], numero_tentativa: 0 },
        ] as T[]);
      }

      // `livre` é o mesmo predicado do lease do job: sem `travado_ate`, ou com
      // ele no passado. Uma run RODANDO sem lease é de antes desta migração —
      // e tratá-la como assumível é o certo: ninguém pode estar nela.
      if (!livre(existente)) {
        return Promise.resolve([
          { situacao: "ocupada", run_id: existente["id"], numero_tentativa: 0 },
        ] as T[]);
      }

      const tentativa =
        (typeof existente["tentativa"] === "number" ? existente["tentativa"] : 1) + 1;
      existente["travado_ate"] = ateQuando;
      existente["travado_por"] = argumentos["p_quem"] ?? null;
      existente["tentativa"] = tentativa;
      existente["iniciado_em"] = new Date(agora).toISOString();
      if (argumentos["p_job_id"] != null) existente["job_id"] = argumentos["p_job_id"];

      return Promise.resolve([
        { situacao: "reclaim", run_id: existente["id"], numero_tentativa: tentativa },
      ] as T[]);
    }

    /*
     * Fecha as runs que começaram e cujo job já saiu da fila — ninguém vai
     * retomá-las. Sem isto, o painel de saúde contaria "turnos abertos" para
     * sempre, e o número pararia de significar alguma coisa.
     */
    case "crc_fechar_ai_runs_abandonadas": {
      const minutos = typeof argumentos["p_minutos"] === "number" ? argumentos["p_minutos"] : 30;
      const corte = agora - minutos * 60_000;
      const jobs = tabelas["crc_agent_jobs"] ?? [];

      const abandonadas = (tabelas["crc_ai_runs"] ?? []).filter((l) => {
        if (l["resultado"] !== "RODANDO") return false;
        const inicio = l["iniciado_em"];
        if (typeof inicio !== "string" || Date.parse(inicio) >= corte) return false;

        const jobId = l["job_id"];
        if (jobId == null) return true;
        const job = jobs.find((j) => j["id"] === jobId);
        return (
          job !== undefined &&
          (job["status"] === "CONCLUIDO" ||
            job["status"] === "FALHOU" ||
            job["status"] === "DESCARTADO")
        );
      });

      for (const l of abandonadas) {
        l["resultado"] = "falha_segura";
        l["motivo"] = l["motivo"] ?? "O turno começou e o processo não voltou.";
      }

      return Promise.resolve([{ crc_fechar_ai_runs_abandonadas: abandonadas.length }] as T[]);
    }

    /*
     * A reserva de webhooks — o consumidor que nunca existiu.
     *
     * Reproduz as quatro condicoes que importam da RPC de verdade: pega
     * PENDENTE e FALHOU, pega tambem PROCESSANDO com lease vencido, respeita o
     * backoff de `disponivel_em`, e ignora quem passou do teto de tentativas.
     * A tentativa e incrementada NA RESERVA — um envelope que derruba o worker
     * toda vez nunca chegaria ao teto se o incremento fosse no fim.
     */
    case "crc_reservar_webhooks": {
      const teto = typeof argumentos["limite"] === "number" ? argumentos["limite"] : 10;
      const lockSeg =
        typeof argumentos["lock_segundos"] === "number" ? argumentos["lock_segundos"] : 120;
      const maxTentativas =
        typeof argumentos["max_tentativas"] === "number" ? argumentos["max_tentativas"] : 5;
      const ateQuando = new Date(agora + lockSeg * 1000).toISOString();

      const disponivel = (l: Linha): boolean => {
        const q = l["disponivel_em"];
        return typeof q !== "string" || Date.parse(q) <= agora;
      };

      const alvo = (tabelas["crc_webhook_inbox"] ?? [])
        .filter(
          (l) =>
            l["status"] === "PENDENTE" ||
            l["status"] === "FALHOU" ||
            (l["status"] === "PROCESSANDO" && !livre(l)),
        )
        .filter(disponivel)
        .filter((l) => (typeof l["tentativas"] === "number" ? l["tentativas"] : 0) < maxTentativas)
        .slice(0, teto);

      for (const l of alvo) {
        l["status"] = "PROCESSANDO";
        l["travado_ate"] = ateQuando;
        l["travado_por"] = argumentos["quem"] ?? null;
        l["tentativas"] = (typeof l["tentativas"] === "number" ? l["tentativas"] : 0) + 1;
      }

      return Promise.resolve(alvo.map((l) => ({ ...l })) as T[]);
    }

    case "crc_liberar_webhooks_presos": {
      const maxTentativas =
        typeof argumentos["max_tentativas"] === "number" ? argumentos["max_tentativas"] : 5;

      const presos = (tabelas["crc_webhook_inbox"] ?? []).filter(
        (l) =>
          l["status"] === "PROCESSANDO" &&
          typeof l["travado_ate"] === "string" &&
          Date.parse(l["travado_ate"]) < agora &&
          (typeof l["tentativas"] === "number" ? l["tentativas"] : 0) >= maxTentativas,
      );

      for (const l of presos) {
        l["status"] = "FALHOU";
        l["travado_ate"] = null;
        l["ultimo_erro"] = l["ultimo_erro"] ?? "O worker nao terminou o webhook e o lease venceu.";

        /*
         * A DEAD LETTER SAI DAQUI, e nao do worker — porque o worker e
         * justamente quem nao estava la. Um envelope que esgota as tentativas
         * com o processo morto nunca passa pelo `catch` que escreveria o
         * registro, e some: FALHOU, fora da fila, sem nada que alguem leia.
         */
        anotarMorte(tabelas, "webhook", l["id"], String(l["ultimo_erro"] ?? ""), null, {
          provedor: l["provedor"],
          externalId: l["external_id"],
          tentativas: l["tentativas"],
        });
      }

      return Promise.resolve([{ crc_liberar_webhooks_presos: presos.length }] as T[]);
    }

    /*
     * Fecha o job que ficou RODANDO com o lease vencido E o teto estourado.
     *
     * Sem isto ele nao aparece na fila de trabalho (a reserva ignora quem passou
     * de cinco tentativas) nem na de falhas (o status e RODANDO). Some.
     */
    case "crc_liberar_agent_jobs_presos": {
      const presos = (tabelas["crc_agent_jobs"] ?? []).filter(
        (l) =>
          l["status"] === "RODANDO" &&
          typeof l["travado_ate"] === "string" &&
          Date.parse(l["travado_ate"]) < agora &&
          (typeof l["tentativas"] === "number" ? l["tentativas"] : 0) >= 5,
      );

      for (const l of presos) {
        l["status"] = "FALHOU";
        l["terminou_em"] = new Date(agora).toISOString();
        l["travado_ate"] = null;
        l["ultimo_erro"] = l["ultimo_erro"] ?? "O worker nao terminou o job e o lease venceu.";

        // Mesma razao do webhook: quem morreu nao escreve o proprio obituario.
        anotarMorte(
          tabelas,
          "agent_job",
          l["id"],
          String(l["ultimo_erro"] ?? ""),
          l["organization_id"],
          {
            conversationId: l["conversation_id"],
            eventId: l["event_id"],
            tentativas: l["tentativas"],
          },
        );
      }

      return Promise.resolve([{ crc_liberar_agent_jobs_presos: presos.length }] as T[]);
    }

    default:
      return Promise.resolve([] as T[]);
  }
}

function cosseno(a: readonly number[], b: readonly number[]): number {
  let produto = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    produto += x * y;
    na += x * x;
    nb += y * y;
  }
  return na === 0 || nb === 0 ? 0 : produto / (Math.sqrt(na) * Math.sqrt(nb));
}

export { ErroBancoFake as ErroBanco };
