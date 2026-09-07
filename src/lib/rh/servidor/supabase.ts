/**
 * Driver de armazenamento no Supabase — a alternativa ao disco local.
 *
 * POR QUE ELE EXISTE
 * O driver de arquivo (`armazenamento.ts`) funciona perfeitamente numa máquina
 * com disco. Na Vercel, não: cada função roda numa instância efêmera, o disco é
 * apagado a cada deploy e duas instâncias não enxergam os arquivos uma da outra.
 * O acervo de currículos da clínica simplesmente sumiria.
 *
 * POR QUE VIA REST, E NÃO COM O SDK
 * `@supabase/supabase-js` resolveria o mesmo com menos código, mas seria a
 * primeira dependência de runtime do projeto fora do React/TanStack. A API REST
 * do Supabase (PostgREST + Storage) é HTTP simples, e `fetch` já existe em toda
 * parte — no Node do dev, na função da Vercel e no build. Zero dependência nova,
 * zero surpresa de bundle.
 *
 * SEGURANÇA
 * Tudo aqui usa a SERVICE_ROLE, que ignora RLS. Ela só pode existir no servidor.
 * Este módulo é importado exclusivamente por `await import()` dentro de handlers
 * de server function — nunca no topo de um arquivo que a tela carrega. As
 * tabelas têm RLS ligado e nenhuma policy, então a chave `anon` que vai para o
 * navegador não alcança nenhum dado de candidata.
 */
// Caminho relativo, e não "@/": o script de importação carrega estes módulos
// com `configFile: false`, ou seja, sem os aliases do vite.config.ts. Todo o
// resto da camada de servidor já segue essa regra — quebrá-la aqui derrubaria
// o importador em massa, que é justamente onde este driver mais é usado.
import type { AnaliseIa, RankingSalvo } from "../ia/tipos";
import type { Candidatura, ConfiguracoesRh, Vaga } from "../tipos";
import { candidaturaVazia, configuracoesPadrao, vagaVazia } from "../tipos";
import { guiaSementeRecepcao, guiaVazio, type GuiaEntrevista } from "../guia";
import { vagasSemente } from "../vagas";
// Mesma origem que o driver de disco usa: os dois PRECISAM gerar o mesmo nome
// de arquivo, senão um currículo salvo por um não é encontrado pelo outro.
import {
  chaveRankingSegura,
  comPadrao,
  nomeArquivoSeguro,
  novoId,
  novoIdGuia,
  novoIdVaga,
} from "./comum";

export { chaveRankingSegura, nomeArquivoSeguro, novoId, novoIdGuia, novoIdVaga };

/* -------------------------------------------------------------------------- */
/* Configuração                                                               */
/* -------------------------------------------------------------------------- */

type Ambiente = { url: string; chave: string; bucket: string };

function ambiente(): Ambiente {
  const url = (process.env["SUPABASE_URL"] ?? "").replace(/\/+$/, "");
  const chave = process.env["SUPABASE_SERVICE_ROLE"] ?? "";
  const bucket = process.env["SUPABASE_BUCKET"] ?? "curriculos";
  if (!url || !chave) {
    throw new Error(
      "Supabase não configurado: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE nas variáveis de ambiente.",
    );
  }
  return { url, chave, bucket };
}

export function supabaseConfigurado(): { ok: boolean; motivo: string } {
  const url = process.env["SUPABASE_URL"] ?? "";
  const chave = process.env["SUPABASE_SERVICE_ROLE"] ?? "";
  if (!url) return { ok: false, motivo: "Falta SUPABASE_URL no servidor." };
  if (!chave) return { ok: false, motivo: "Falta SUPABASE_SERVICE_ROLE no servidor." };
  return { ok: true, motivo: "" };
}

function cabecalhos(extra: Record<string, string> = {}): Record<string, string> {
  const { chave } = ambiente();
  return { apikey: chave, Authorization: "Bearer " + chave, ...extra };
}

/**
 * Uma rede de segurança fina em cima do fetch. A API do Supabase devolve 5xx
 * esporádico em cold start do projeto; repetir duas vezes com espera curta
 * resolve sem que ninguém veja erro na tela. Erro 4xx é problema nosso e não se
 * repete — insistir só atrasaria a resposta.
 */
async function chamar(caminho: string, opcoes: RequestInit, tentativas = 3): Promise<Response> {
  const { url } = ambiente();
  let ultimoErro = "";
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url + caminho, opcoes);
      if (r.status < 500) return r;
      ultimoErro = r.status + " " + (await r.clone().text()).slice(0, 200);
    } catch (erro) {
      ultimoErro = String(erro);
    }
    if (i < tentativas - 1) await esperar(250 * Math.pow(2, i));
  }
  throw new Error("Supabase indisponível após " + tentativas + " tentativas: " + ultimoErro);
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

async function exigirOk(r: Response, oQue: string): Promise<void> {
  if (r.ok) return;
  throw new Error(oQue + " falhou (" + r.status + "): " + (await r.text()).slice(0, 300));
}

/* -------------------------------------------------------------------------- */
/* Linhas genéricas: toda tabela é (id, dados jsonb)                          */
/* -------------------------------------------------------------------------- */

type Tabela = "rh_candidaturas" | "rh_vagas" | "rh_guias";

async function gravarLinha(tabela: Tabela, id: string, dados: unknown): Promise<void> {
  const r = await chamar("/rest/v1/" + tabela, {
    method: "POST",
    headers: cabecalhos({
      "content-type": "application/json",
      // merge-duplicates transforma o POST em upsert pela chave primária, que é
      // o que "salvar" significa aqui: cria se não existe, substitui se existe.
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify([{ id, dados }]),
  });
  await exigirOk(r, "Gravar em " + tabela);
}

async function lerLinha(tabela: Tabela, id: string): Promise<unknown | null> {
  const r = await chamar(
    "/rest/v1/" + tabela + "?id=eq." + encodeURIComponent(id) + "&select=dados&limit=1",
    { method: "GET", headers: cabecalhos() },
  );
  await exigirOk(r, "Ler de " + tabela);
  const linhas = (await r.json()) as { dados: unknown }[];
  return linhas[0]?.dados ?? null;
}

async function listarLinhas(tabela: Tabela, consulta: string): Promise<unknown[]> {
  const r = await chamar("/rest/v1/" + tabela + "?select=dados&" + consulta, {
    method: "GET",
    headers: cabecalhos(),
  });
  await exigirOk(r, "Listar " + tabela);
  const linhas = (await r.json()) as { dados: unknown }[];
  return linhas.map((l) => l.dados);
}

async function apagarLinha(tabela: Tabela, id: string): Promise<void> {
  const r = await chamar("/rest/v1/" + tabela + "?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: cabecalhos({ Prefer: "return=minimal" }),
  });
  await exigirOk(r, "Excluir de " + tabela);
}

/* -------------------------------------------------------------------------- */
/* Identificadores e protocolo                                                */
/* -------------------------------------------------------------------------- */

/**
 * O número que a candidata guarda para falar com a clínica. Quem garante que
 * dois envios simultâneos não recebem o mesmo é o Postgres, num UPDATE atômico
 * dentro da função `rh_proximo_protocolo`. A fila em memória do driver de
 * arquivo não serviria aqui: na Vercel há várias instâncias, e cada uma teria a
 * sua própria fila achando que é a única.
 */
export async function proximoProtocolo(ano: number): Promise<string> {
  const r = await chamar("/rest/v1/rpc/rh_proximo_protocolo", {
    method: "POST",
    headers: cabecalhos({ "content-type": "application/json" }),
    body: JSON.stringify({ p_ano: ano }),
  });
  await exigirOk(r, "Gerar protocolo");
  const numero = (await r.json()) as number;
  return "JP-RH-" + ano + "-" + String(numero).padStart(4, "0");
}

/* -------------------------------------------------------------------------- */
/* Candidaturas                                                               */
/* -------------------------------------------------------------------------- */

export async function salvarCandidatura(c: Candidatura): Promise<void> {
  await gravarLinha("rh_candidaturas", c.id, c);
}

export async function lerCandidatura(id: string): Promise<Candidatura | null> {
  const bruto = await lerLinha("rh_candidaturas", id);
  return bruto === null ? null : comPadrao(candidaturaVazia(), bruto);
}

export async function listarTodas(): Promise<Candidatura[]> {
  const brutos = await listarLinhas("rh_candidaturas", "order=criado_em.desc");
  return brutos.map((b) => comPadrao(candidaturaVazia(), b));
}

export async function listarParaDeduplicacao(): Promise<
  { id: string; nome: string; telefone: string; hashArquivo: string }[]
> {
  const r = await chamar("/rest/v1/rh_candidaturas?select=id,hash_arquivo,dados", {
    method: "GET",
    headers: cabecalhos(),
  });
  await exigirOk(r, "Listar para deduplicação");
  const linhas = (await r.json()) as { id: string; hash_arquivo: string | null; dados: unknown }[];
  return linhas.map((l) => {
    const d = (l.dados ?? {}) as Record<string, unknown>;
    return {
      id: l.id,
      nome: typeof d["nome"] === "string" ? d["nome"] : "",
      telefone: typeof d["telefone"] === "string" ? d["telefone"] : "",
      hashArquivo: l.hash_arquivo ?? "",
    };
  });
}

/**
 * Ler, alterar e gravar sem perder a alteração de outra pessoa.
 *
 * No disco isso era resolvido com uma fila dentro do processo. Aqui, com várias
 * instâncias em paralelo, a fila não existe — então usamos trava otimista: a
 * gravação só vale se `atualizado_em` ainda for o mesmo que foi lido. Se outra
 * instância gravou nesse meio-tempo, o UPDATE não pega nenhuma linha e a gente
 * lê de novo e refaz. É o mesmo bug que os revisores acharam no driver de
 * arquivo (nota e status salvos juntos, um apagando o outro), resolvido de vez.
 */
export async function atualizarCandidaturaNoDisco(
  id: string,
  mutador: (atual: Candidatura) => Candidatura,
  tentativas = 5,
): Promise<Candidatura | null> {
  for (let i = 0; i < tentativas; i++) {
    const r = await chamar(
      "/rest/v1/rh_candidaturas?id=eq." +
        encodeURIComponent(id) +
        "&select=dados,atualizado_em&limit=1",
      { method: "GET", headers: cabecalhos() },
    );
    await exigirOk(r, "Ler candidatura para atualizar");
    const linhas = (await r.json()) as { dados: unknown; atualizado_em: string }[];
    const linha = linhas[0];
    if (!linha) return null;

    const atual = comPadrao(candidaturaVazia(), linha.dados);
    const novo = mutador(atual);

    const g = await chamar(
      "/rest/v1/rh_candidaturas?id=eq." +
        encodeURIComponent(id) +
        "&atualizado_em=eq." +
        encodeURIComponent(linha.atualizado_em),
      {
        method: "PATCH",
        headers: cabecalhos({
          "content-type": "application/json",
          Prefer: "return=representation",
        }),
        body: JSON.stringify({ dados: novo }),
      },
    );
    await exigirOk(g, "Atualizar candidatura");
    const gravadas = (await g.json()) as unknown[];
    if (gravadas.length > 0) return novo;
    // Alguém gravou entre a leitura e a escrita. Lê de novo e refaz a alteração
    // por cima do valor novo, em vez de sobrescrever cegamente.
    await esperar(60 * (i + 1));
  }
  throw new Error("Não foi possível atualizar a candidatura " + id + ": disputa de escrita.");
}

export async function salvarAnalise(id: string, analise: AnaliseIa): Promise<Candidatura | null> {
  return atualizarCandidaturaNoDisco(id, (atual) => ({
    ...atual,
    analise,
    atualizadoEm: new Date().toISOString(),
  }));
}

export async function excluirTudo(id: string): Promise<void> {
  await apagarPastaCurriculo(id);
  await apagarLinha("rh_candidaturas", id);
}

/* -------------------------------------------------------------------------- */
/* Vagas                                                                      */
/* -------------------------------------------------------------------------- */

export async function salvarVaga(v: Vaga): Promise<void> {
  await gravarLinha("rh_vagas", v.id, v);
}

export async function lerVaga(id: string): Promise<Vaga | null> {
  const bruto = await lerLinha("rh_vagas", id);
  return bruto === null ? null : comPadrao(vagaVazia(), bruto);
}

export async function lerVagaPorSlug(slug: string): Promise<Vaga | null> {
  const brutos = await listarLinhas("rh_vagas", "slug=eq." + encodeURIComponent(slug) + "&limit=1");
  const primeiro = brutos[0];
  return primeiro === undefined ? null : comPadrao(vagaVazia(), primeiro);
}

export async function listarVagas(): Promise<Vaga[]> {
  const brutos = await listarLinhas("rh_vagas", "order=criado_em.desc");
  return brutos.map((b) => comPadrao(vagaVazia(), b));
}

export async function excluirVaga(id: string): Promise<void> {
  await apagarLinha("rh_vagas", id);
}

/* -------------------------------------------------------------------------- */
/* Chave–valor: configurações e rankings                                      */
/* -------------------------------------------------------------------------- */

async function gravarChave(chave: string, dados: unknown): Promise<void> {
  const r = await chamar("/rest/v1/rh_chave_valor", {
    method: "POST",
    headers: cabecalhos({
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify([{ chave, dados }]),
  });
  await exigirOk(r, "Gravar " + chave);
}

async function lerChave(chave: string): Promise<unknown | null> {
  const r = await chamar(
    "/rest/v1/rh_chave_valor?chave=eq." + encodeURIComponent(chave) + "&select=dados&limit=1",
    { method: "GET", headers: cabecalhos() },
  );
  await exigirOk(r, "Ler " + chave);
  const linhas = (await r.json()) as { dados: unknown }[];
  return linhas[0]?.dados ?? null;
}

export async function lerConfiguracoes(): Promise<ConfiguracoesRh> {
  const bruto = await lerChave("configuracoes");
  return bruto === null ? configuracoesPadrao() : comPadrao(configuracoesPadrao(), bruto);
}

export async function salvarConfiguracoes(c: ConfiguracoesRh): Promise<void> {
  await gravarChave("configuracoes", c);
}

export async function salvarRanking(chave: string, dados: RankingSalvo): Promise<void> {
  await gravarChave("ranking:" + chave, dados);
}

export async function lerRanking(chave: string): Promise<RankingSalvo | null> {
  return (await lerChave("ranking:" + chave)) as RankingSalvo | null;
}

/* -------------------------------------------------------------------------- */
/* Currículos no Storage                                                      */
/* -------------------------------------------------------------------------- */

/**
 * O mesmo saneamento do driver de arquivo, e pelo mesmo motivo: o nome vira
 * parte de um caminho. Aqui não há `..` que escape para o sistema de arquivos,
 * mas um nome com barra criaria uma pasta fantasma dentro do bucket e o arquivo
 * sumiria da vista de quem for procurar depois.
 */
function caminhoSeguro(id: string, nomeArquivo: string): string {
  const valido = /^[A-Za-z0-9._-]+$/;
  if (!valido.test(id) || !valido.test(nomeArquivo)) {
    throw new Error("Identificador inválido para o currículo.");
  }
  if (id.includes("..") || nomeArquivo.includes("..")) {
    throw new Error("Identificador inválido para o currículo.");
  }
  return id + "/" + nomeArquivo;
}

export async function salvarCurriculo(
  id: string,
  nomeArquivo: string,
  dados: Uint8Array,
  // Opcional sem valor padrão na assinatura, e não `tipo = "..."`: parâmetro com
  // padrão não conta em Function.length, e é assim que o teste de contrato entre
  // os dois drivers compara as assinaturas. O padrão fica no corpo.
  tipo?: string,
): Promise<void> {
  const { bucket } = ambiente();
  const contentType = tipo ?? "application/octet-stream";
  const caminho = caminhoSeguro(id, nomeArquivo);
  const r = await chamar("/storage/v1/object/" + bucket + "/" + caminho, {
    method: "POST",
    headers: cabecalhos({ "content-type": contentType, "x-upsert": "true" }),
    body: dados as unknown as BodyInit,
  });
  await exigirOk(r, "Enviar currículo");
}

export async function lerCurriculo(id: string, nomeArquivo: string): Promise<Uint8Array | null> {
  const { bucket } = ambiente();
  const caminho = caminhoSeguro(id, nomeArquivo);
  const r = await chamar("/storage/v1/object/" + bucket + "/" + caminho, {
    method: "GET",
    headers: cabecalhos(),
  });
  if (r.status === 404 || r.status === 400) return null;
  await exigirOk(r, "Baixar currículo");
  return new Uint8Array(await r.arrayBuffer());
}

async function apagarPastaCurriculo(id: string): Promise<void> {
  const { bucket } = ambiente();
  const lista = await chamar("/storage/v1/object/list/" + bucket, {
    method: "POST",
    headers: cabecalhos({ "content-type": "application/json" }),
    body: JSON.stringify({ prefix: id, limit: 100 }),
  });
  if (!lista.ok) return;
  const arquivos = (await lista.json()) as { name: string }[];
  if (!arquivos.length) return;
  const r = await chamar("/storage/v1/object/" + bucket, {
    method: "DELETE",
    headers: cabecalhos({ "content-type": "application/json" }),
    body: JSON.stringify({ prefixes: arquivos.map((a) => id + "/" + a.name) }),
  });
  // Falha ao limpar o arquivo não pode impedir a exclusão do registro: um PDF
  // órfão no bucket é um problema menor do que uma ficha que não some quando a
  // pessoa pede exclusão dos dados dela.
  if (!r.ok) console.error("Não foi possível apagar o currículo de " + id);
}

/* -------------------------------------------------------------------------- */
/* Compatibilidade com a interface do driver de arquivo                       */
/* -------------------------------------------------------------------------- */

/** No Supabase não há diretório para criar. Existe para a interface bater. */
export async function garantirDiretorios(): Promise<void> {
  // No Supabase não há diretório para criar, mas a semeadura precisa acontecer
  // no mesmo ponto em que acontece no disco — senão o painel abriria vazio na
  // primeira vez em que a clínica rodasse contra a nuvem.
  await Promise.all([semearVagasSePreciso(), semearGuiasSePreciso()]);
}

/* -------------------------------------------------------------------------- */
/* Guias de entrevista                                                        */
/* -------------------------------------------------------------------------- */

export async function salvarGuia(g: GuiaEntrevista): Promise<void> {
  await gravarLinha("rh_guias", g.id, g);
}

export async function lerGuia(id: string): Promise<GuiaEntrevista | null> {
  const bruto = await lerLinha("rh_guias", id);
  return bruto === null ? null : comPadrao(guiaVazio(), bruto);
}

export async function listarGuias(): Promise<GuiaEntrevista[]> {
  const brutos = await listarLinhas("rh_guias", "order=criado_em.asc");
  return brutos.map((b) => comPadrao(guiaVazio(), b));
}

export async function excluirGuia(id: string): Promise<void> {
  await apagarLinha("rh_guias", id);
}

/* -------------------------------------------------------------------------- */
/* Sementes                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A trava de semeadura, traduzida para o banco.
 *
 * No disco, quem semeia é quem CONSEGUIU criar a pasta (`mkdir` com
 * `recursive: false`): se ela já existe, alguém mexeu ali e repovoar
 * ressuscitaria o que o RH acabou de excluir. Aqui o equivalente é inserir uma
 * linha marcadora com a chave primária: quem consegue inserir foi o primeiro, e
 * quem colide desiste. É atômico no Postgres, então duas instâncias subindo ao
 * mesmo tempo não semeiam em dobro — coisa que a trava de pasta não garantia.
 */
async function reivindicarSemeadura(marca: string): Promise<boolean> {
  const r = await chamar("/rest/v1/rh_chave_valor", {
    method: "POST",
    headers: cabecalhos({
      "content-type": "application/json",
      // Sem `resolution=merge-duplicates` de propósito: aqui a colisão é a
      // resposta que interessa, não um problema a contornar.
      Prefer: "return=minimal",
    }),
    body: JSON.stringify([{ chave: marca, dados: { semeadoEm: new Date().toISOString() } }]),
  });
  if (r.status === 409) return false;
  await exigirOk(r, "Reivindicar semeadura de " + marca);
  return true;
}

let semeaduraVagas: Promise<void> | null = null;

export function semearVagasSePreciso(): Promise<void> {
  if (semeaduraVagas === null) {
    semeaduraVagas = (async () => {
      if (!(await reivindicarSemeadura("semente:vagas"))) return;
      const agoraIso = new Date().toISOString();
      for (const vaga of vagasSemente(agoraIso, novoIdVaga)) {
        await salvarVaga(vaga);
      }
    })().catch(() => {
      // Falhar a semeadura não pode derrubar o painel: sem vaga de exemplo o RH
      // cria a dele. Zerar a memória deixa a próxima chamada tentar de novo.
      semeaduraVagas = null;
    });
  }
  return semeaduraVagas;
}

let semeaduraGuias: Promise<void> | null = null;

export function semearGuiasSePreciso(): Promise<void> {
  if (semeaduraGuias === null) {
    semeaduraGuias = (async () => {
      if (!(await reivindicarSemeadura("semente:guias"))) return;
      const agoraIso = new Date().toISOString();
      const semente = guiaSementeRecepcao();
      await salvarGuia({
        ...semente,
        id: novoIdGuia(),
        criadoEm: agoraIso,
        atualizadoEm: agoraIso,
      });
    })().catch(() => {
      semeaduraGuias = null;
    });
  }
  return semeaduraGuias;
}
