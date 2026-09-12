#!/usr/bin/env node
/**
 * O banco tem o schema que este código espera? — `npm run schema:status`
 *
 * ============================================================================
 *  O PROBLEMA: "acho que alguém rodou esse SQL" não é estado de deploy.
 *
 *  Este projeto aplica schema à mão, por decisão. O custo apareceu no
 *  `supabase/23`: o código foi para produção esperando uma chave primária que o
 *  banco ainda não tinha. Nada quebrou por acidente — a integração que usaria
 *  aquele caminho estava desligada. Bastava configurá-la.
 * ============================================================================
 *
 * DUAS FONTES, E ELAS NÃO VALEM O MESMO:
 *
 *   REGISTRO  `crc_schema_migrations` diz o que alguém ANOTOU. É barato e
 *             cobre o caso comum ("esqueci de rodar"). E mente: uma linha não
 *             prova que a coluna existe — prova que a linha foi escrita.
 *
 *   SONDA     uma pergunta ao banco atrás do objeto que a migração cria. É
 *             EVIDÊNCIA. Quando as duas discordam, a sonda vence — e a
 *             discordância em si é o alarme.
 *
 * POR QUE AS SONDAS PASSAM PELO POSTGREST, e não por `psql`: é o que produção
 * expõe. `DATABASE_URL` do Supabase não sai de dentro da VPC deles; o que existe
 * é `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE`, que é exatamente o que a aplicação
 * usa. Uma verificação que só roda em desenvolvimento verifica o banco errado.
 *
 * USO:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... npm run schema:status
 *
 * SAI COM 1 quando alguma sonda falha, para poder entrar em CI e em script de
 * deploy sem alguém precisar ler a saída.
 */
import { readdirSync } from "node:fs";

const URL_BASE = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/u, "");
const CHAVE = (process.env.SUPABASE_SERVICE_ROLE ?? "").trim();

if (URL_BASE.length === 0 || CHAVE.length === 0) {
  console.error(
    [
      "Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE.",
      "",
      "  Produção:  pegue os dois no painel do Supabase (Project Settings > API).",
      "  Local:     SUPABASE_URL=http://localhost:3001 e o JWT de scripts/jwt-de-teste.mjs",
    ].join("\n"),
  );
  process.exit(2);
}

/**
 * O caminho do PostgREST muda entre Supabase e PostgREST puro.
 *
 * O adaptador da aplicação prefixa `/rest/v1/` — que é a rota do Supabase. O
 * PostgREST de teste serve na raiz. Foi essa diferença que impediu os testes de
 * integração de passarem pelo adaptador de produção (ver `testes/integracao/apoio.ts`),
 * e repeti-la aqui faria este script funcionar num ambiente e 404 no outro.
 */
const PREFIXO = URL_BASE.includes("supabase.co") ? "/rest/v1" : "";

const cabecalhos = {
  apikey: CHAVE,
  authorization: `Bearer ${CHAVE}`,
  "content-type": "application/json",
};

/* -------------------------------------------------------------------------- */
/* As sondas                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Uma sonda por migração que cria objeto que o CÓDIGO CHAMA.
 *
 * NÃO HÁ SONDA PARA TUDO, e isso está dito na saída em vez de escondido. Uma
 * migração que só acrescenta índice ou comentário não tem objeto observável pela
 * API — inventar uma sonda fraca ali daria uma confiança que ela não sustenta.
 *
 * `tabela` → a tabela existe? `rpc` → a função existe COM ESTES ARGUMENTOS?
 * O segundo é o que pega o caso do `supabase/25`, em que a função existia mas
 * com a assinatura antiga.
 */
const SONDAS = {
  "02-crc-schema.sql": { tipo: "tabela", nome: "crc_patients" },
  "09-crc-ia-platform.sql": { tipo: "tabela", nome: "crc_ai_runs" },
  "14-crc-avaliacao.sql": { tipo: "tabela", nome: "crc_eval_casos" },
  "17-crc-agent-jobs.sql": { tipo: "tabela", nome: "crc_agent_jobs" },
  "20-crc-reclaim-da-run.sql": {
    tipo: "rpc",
    nome: "crc_reivindicar_ai_run",
    argumentos: {
      p_organization_id: null,
      p_conversation_id: null,
      p_chave_dedupe: null,
      p_job_id: null,
      p_lease_segundos: 1,
      p_quem: null,
    },
  },
  "21-crc-webhook-inbox.sql": {
    tipo: "rpc",
    nome: "crc_reservar_webhooks",
    argumentos: { limite: 0, lock_segundos: 1, quem: null, max_tentativas: 5 },
  },
  "22-crc-heartbeat.sql": {
    tipo: "rpc",
    nome: "crc_renovar_lease",
    argumentos: { p_job_id: null, p_lease_token: null, p_segundos: 1 },
  },
  "23-crc-canais-whatsapp.sql": { tipo: "tabela", nome: "crc_canais_whatsapp" },
  "24-crc-cursor-por-clinica.sql": { tipo: "coluna", nome: "crc_sync_state", coluna: "clinic_id" },
  "25-crc-retry-atomico-e-tenant-no-inbox.sql": {
    tipo: "rpc",
    nome: "crc_encerrar_agent_job",
    // O `p_disponivel_em` É a migração. Sem ele, a função antiga responde e o
    // retry volta a ter janela — que é justamente o defeito invisível.
    argumentos: {
      p_job_id: null,
      p_lease_token: null,
      p_status: "REPETIR",
      p_erro: null,
      p_duracao_ms: null,
      p_disponivel_em: null,
    },
  },
  "26-crc-varreduras-convergentes.sql": {
    tipo: "rpc",
    nome: "crc_aniversariantes",
    argumentos: { p_organization_id: null, p_datas: [], p_limite: 0 },
  },
  "27-crc-observabilidade.sql": { tipo: "tabela", nome: "crc_runtime_heartbeats" },
  "28-crc-configuracao-por-clinica.sql": { tipo: "tabela", nome: "crc_settings_clinica" },
  "29-crc-publico-e-ciclo.sql": {
    tipo: "rpc",
    nome: "crc_opcoes_de_publico",
    argumentos: { p_organization_id: null, p_clinic_id: null },
  },
  /*
   * A 30 PRECISA DE QUATRO SONDAS, e não de uma.
   *
   * Ela faz duas coisas de natureza diferente: cria tabelas novas E acrescenta
   * dezessete colunas a uma tabela que já existia. Uma sonda só na RPC passaria
   * com as colunas ausentes — e o Radar quebraria na primeira gravação, não na
   * verificação.
   *
   * `probability` é a coluna sondada porque é a que o Radar escreve em toda
   * oportunidade que pontua; se ela existe, o `alter table` inteiro rodou.
   */
  "30-crc-radar-de-receita.sql": [
    { tipo: "coluna", nome: "crc_opportunities", coluna: "probability" },
    { tipo: "tabela", nome: "crc_ai_activity" },
    { tipo: "tabela", nome: "crc_autonomia" },
    {
      tipo: "rpc",
      nome: "crc_radar_resumo",
      argumentos: { p_organization_id: null, p_clinic_id: null },
    },
  ],
  /*
   * A 31 TROCA O `returns table` DA MESMA FUNÇÃO, e a assinatura de ARGUMENTOS
   * não muda — então uma sonda de RPC passaria com a versão antiga no banco.
   *
   * A sonda precisa olhar para o que a 31 acrescenta: a coluna `valor_esperado`
   * no retorno. `select=valor_esperado` sobre a RPC só resolve se a função nova
   * estiver lá; com a antiga, o PostgREST devolve 400 por coluna inexistente.
   */
  "31-crc-radar-valor-esperado.sql": {
    tipo: "rpc",
    nome: "crc_radar_resumo?select=valor_esperado",
    argumentos: { p_organization_id: null, p_clinic_id: null },
    exigeOk: true,
  },
};

async function sondar(sonda) {
  if (sonda.tipo === "tabela" || sonda.tipo === "coluna") {
    const colunas = sonda.tipo === "coluna" ? `?select=${sonda.coluna}&limit=1` : "?limit=1";
    const r = await fetch(`${URL_BASE}${PREFIXO}/${sonda.nome}${colunas}`, { headers: cabecalhos });
    if (r.ok) return { ok: true };
    return { ok: false, detalhe: `HTTP ${String(r.status)}: ${(await r.text()).slice(0, 160)}` };
  }

  /*
   * A RPC É CHAMADA DE VERDADE, com argumentos inertes.
   *
   * `PGRST202` (404) significa "nenhuma função casa com estes nomes" — é o
   * sinal de assinatura ausente ou diferente. Qualquer outra resposta, inclusive
   * erro de execução, prova que a função EXISTE com esta assinatura, que é a
   * pergunta. Por isso os argumentos são nulos: queremos a resolução de
   * assinatura, não o efeito.
   */
  const r = await fetch(`${URL_BASE}${PREFIXO}/rpc/${sonda.nome}`, {
    method: "POST",
    headers: cabecalhos,
    body: JSON.stringify(sonda.argumentos ?? {}),
  });

  if (r.status === 404) {
    return {
      ok: false,
      detalhe: `função ausente ou com outra assinatura: ${(await r.text()).slice(0, 160)}`,
    };
  }

  /*
   * `exigeOk` PARA QUANDO A ASSINATURA DE ARGUMENTOS NÃO MUDOU.
   *
   * O caso é o da `supabase/31`: ela troca o `returns table` de uma função que
   * já existia, mantendo os mesmos parâmetros. A resolução de assinatura passa
   * com a versão ANTIGA no banco — a sonda precisa pedir uma coluna que só a
   * nova devolve, e aí qualquer resposta que não seja 2xx é a prova de que a
   * migração não rodou.
   */
  if (sonda.exigeOk === true && !r.ok) {
    return {
      ok: false,
      detalhe: `função existe, mas com o retorno antigo: HTTP ${String(r.status)} ${(await r.text()).slice(0, 120)}`,
    };
  }

  return { ok: true };
}

/* -------------------------------------------------------------------------- */

async function registradas() {
  const r = await fetch(`${URL_BASE}${PREFIXO}/crc_schema_migrations?select=nome,presumido`, {
    headers: cabecalhos,
  });
  if (!r.ok) return null;
  const linhas = await r.json();
  return new Map(linhas.map((l) => [l.nome, l.presumido === true]));
}

const arquivos = readdirSync("supabase")
  .filter((n) => n.endsWith(".sql") && !/^9[0-9]-/u.test(n))
  .sort((a, b) => a.localeCompare(b, "en"));

const registro = await registradas();

console.log("");
console.log(`Banco: ${URL_BASE}`);
console.log(
  registro === null
    ? "Registro: AUSENTE — crc_schema_migrations não existe (rode supabase/27)."
    : `Registro: ${String(registro.size)} migrações anotadas.`,
);
console.log("");
console.log("arquivo".padEnd(46) + "registro".padEnd(14) + "sonda");
console.log("-".repeat(78));

let falhas = 0;
let semSonda = 0;

for (const arquivo of arquivos) {
  const anotado =
    registro === null
      ? "—"
      : registro.has(arquivo)
        ? registro.get(arquivo)
          ? "presumido"
          : "sim"
        : "NÃO";

  const sonda = SONDAS[arquivo];
  let coluna = "sem sonda";

  if (sonda !== undefined) {
    // Uma migração pode precisar de várias sondas — ver o comentário na 30.
    // A entrada continua aceitando o objeto solto: era o formato de todas as
    // outras, e reescrevê-las não provaria nada a mais.
    const lista = Array.isArray(sonda) ? sonda : [sonda];
    const resultados = [];
    for (const s of lista) resultados.push({ s, r: await sondar(s) });

    const ruins = resultados.filter((x) => !x.r.ok);
    if (ruins.length === 0) {
      coluna = lista.length === 1 ? "OK" : `OK (${String(lista.length)} sondas)`;
    } else {
      coluna = `FALHOU — ${ruins[0].s.nome}: ${ruins[0].r.detalhe}`;
      falhas += 1;
    }
  } else {
    semSonda += 1;
  }

  console.log(arquivo.padEnd(46) + anotado.padEnd(14) + coluna);
}

console.log("");
console.log(
  `${String(arquivos.length)} arquivos · ${String(arquivos.length - semSonda)} sondados · ${String(falhas)} falha(s)`,
);

if (falhas > 0) {
  console.log("");
  console.log("A SONDA VENCE O REGISTRO. Uma linha em crc_schema_migrations diz que alguém");
  console.log("anotou; a sonda diz o que está no banco. Rode o SQL que falhou.");
  process.exit(1);
}

if (semSonda > 0) {
  console.log("");
  console.log(
    `${String(semSonda)} arquivos sem sonda: só criam índice, comentário ou tabela que a API não expõe.`,
  );
  console.log("Para esses, o registro é a única evidência — e ele é bookkeeping, não prova.");
}
