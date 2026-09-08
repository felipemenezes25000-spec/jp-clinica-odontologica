/**
 * Persistência em disco do Portal de RH.
 *
 * Só roda no servidor: é sempre carregado por `await import()` dentro do handler
 * de uma server function, nunca no topo de um módulo que a tela importa. Por isso
 * pode usar `node:` à vontade.
 *
 * Guardar JSON em disco é proposital: a clínica tem dezenas de candidaturas por
 * mês, não milhões. Um banco aqui seria mais infraestrutura para manter do que
 * problema resolvido — mas o formato de arquivo por candidatura deixa a migração
 * futura trivial (cada registro já é o objeto completo).
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { guiaSementeRecepcao, guiaVazio, type GuiaEntrevista } from "../guia";
import type { AnaliseIa, RankingSalvo } from "../ia/tipos";
import type { SenhaGuardada } from "../tipos";
import {
  candidaturaVazia,
  configuracoesPadrao,
  vagaVazia,
  type Candidatura,
  type ConfiguracoesRh,
  type Vaga,
} from "../tipos";
import { gerarSlug, vagasSemente } from "../vagas";
// Os helpers puros moram em comum.ts porque o driver do Supabase precisa gerar
// exatamente os mesmos nomes de arquivo — ver o cabeçalho de lá.
import { chaveRankingSegura, nomeArquivoSeguro, novoId, novoIdGuia, novoIdVaga } from "./comum";

export { chaveRankingSegura, nomeArquivoSeguro, novoId, novoIdGuia, novoIdVaga };

/**
 * Lido a cada chamada, e não uma vez no módulo, para que trocar `RH_DATA_DIR`
 * (testes, script de manutenção) tenha efeito sem reiniciar o processo.
 */
function raiz(): string {
  return process.env["RH_DATA_DIR"] ?? path.join(process.cwd(), ".data", "rh");
}

function pastaCandidaturas(): string {
  return path.join(raiz(), "candidaturas");
}

function pastaCurriculos(): string {
  return path.join(raiz(), "curriculos");
}

function pastaVagas(): string {
  return path.join(raiz(), "vagas");
}

function pastaRankings(): string {
  return path.join(raiz(), "rankings");
}

function pastaGuias(): string {
  return path.join(raiz(), "guias");
}

function arquivoContador(): string {
  return path.join(raiz(), "contador.json");
}

function arquivoConfiguracoes(): string {
  return path.join(raiz(), "configuracoes.json");
}

/* Arquivo separado do de configurações pelo mesmo motivo que o tipo é separado:
   `configuracoes.json` é lido e devolvido inteiro para a tela. */
function arquivoSenha(): string {
  return path.join(raiz(), "senha.json");
}

/* -------------------------------------------------------------------------- */
/* Segurança de caminho                                                       */
/* -------------------------------------------------------------------------- */

const SEGMENTO_VALIDO = /^[A-Za-z0-9._-]+$/;

/**
 * `id` e `nomeArquivo` viram pedaço de caminho, então nunca podem vir crus do
 * cliente. A regex já barra "/", "\" e "..", mas a checagem explícita de ".."
 * fica documentando a intenção.
 */
function exigirSegmento(valor: string, rotulo: string): string {
  if (!SEGMENTO_VALIDO.test(valor) || valor.includes("..")) {
    throw new Error(`${rotulo} inválido para uso em caminho de arquivo.`);
  }
  return valor;
}

/**
 * Defesa em profundidade: mesmo com os segmentos validados, o caminho final é
 * conferido contra a raiz. Se um dia alguém montar um caminho sem passar por
 * `exigirSegmento`, ainda assim não escapa da pasta de dados.
 */
function dentroDaRaiz(caminho: string): string {
  const base = path.resolve(raiz());
  const alvo = path.resolve(caminho);
  if (alvo !== base && !alvo.startsWith(base + path.sep)) {
    throw new Error("Caminho fora do diretório de dados do RH.");
  }
  return alvo;
}

function caminhoJson(id: string): string {
  return dentroDaRaiz(
    path.join(pastaCandidaturas(), `${exigirSegmento(id, "Identificador")}.json`),
  );
}

function caminhoVagaJson(id: string): string {
  return dentroDaRaiz(path.join(pastaVagas(), `${exigirSegmento(id, "Identificador")}.json`));
}

function caminhoGuiaJson(id: string): string {
  return dentroDaRaiz(path.join(pastaGuias(), `${exigirSegmento(id, "Identificador")}.json`));
}

function caminhoPastaCurriculo(id: string): string {
  return dentroDaRaiz(path.join(pastaCurriculos(), exigirSegmento(id, "Identificador")));
}

function caminhoCurriculo(id: string, nomeArquivo: string): string {
  return dentroDaRaiz(
    path.join(caminhoPastaCurriculo(id), exigirSegmento(nomeArquivo, "Nome de arquivo")),
  );
}

/* -------------------------------------------------------------------------- */
/* Escrita serializada e atômica                                              */
/* -------------------------------------------------------------------------- */

/**
 * Fila única do módulo: toda escrita (e o incremento do contador) entra aqui em
 * série. Sem isso, dois envios simultâneos leriam o mesmo número de protocolo
 * antes de qualquer um gravar, e sairiam dois "JP-RH-2026-0007".
 */
let fila: Promise<unknown> = Promise.resolve();

function enfileirar<T>(tarefa: () => Promise<T>): Promise<T> {
  const proxima = fila.then(tarefa, tarefa);
  // A fila continua depois de um erro: a falha vai para quem chamou, não
  // envenena as próximas escritas.
  fila = proxima.then(
    () => undefined,
    () => undefined,
  );
  return proxima;
}

/**
 * Grava num ".tmp" e renomeia. `rename` é atômico no mesmo volume, então um
 * crash no meio da escrita deixa o arquivo antigo intacto em vez de um JSON
 * truncado — e um JSON truncado derrubaria a listagem inteira do painel.
 */
async function escreverAtomico(arquivo: string, dados: string | Uint8Array): Promise<void> {
  const temporario = `${arquivo}.tmp`;
  await writeFile(temporario, dados);
  await rename(temporario, arquivo);
}

/* -------------------------------------------------------------------------- */
/* API                                                                        */
/* -------------------------------------------------------------------------- */

export async function garantirDiretorios(): Promise<void> {
  await mkdir(pastaCandidaturas(), { recursive: true });
  await mkdir(pastaCurriculos(), { recursive: true });
  // A semente vive aqui para que qualquer caminho de entrada no armazenamento
  // (um envio, o painel abrindo) já encontre a pasta de vagas pronta.
  await semearVagasSePreciso();
}

/** 16 hex de `randomBytes` — imprevisível, e o prefixo ajuda a ler log e pasta. */

/**
 * Maior número já usado no ano, lido das candidaturas gravadas. Só é chamado
 * quando o contador some ou está corrompido: reiniciar do 1 nesse caso repetiria
 * protocolo de candidato antigo, o que confundiria a clínica no atendimento.
 */
async function maiorProtocoloDoAno(ano: number): Promise<number> {
  const prefixo = `JP-RH-${ano}-`;
  let maior = 0;
  for (const item of await listarTodas()) {
    if (!item.protocolo.startsWith(prefixo)) continue;
    const numero = Number(item.protocolo.slice(prefixo.length));
    if (Number.isFinite(numero) && numero > maior) maior = numero;
  }
  return maior;
}

export async function proximoProtocolo(ano: number): Promise<string> {
  return enfileirar(async () => {
    await garantirDiretorios();
    const chave = String(ano);

    let contador: Record<string, number> = {};
    let contadorLido = false;
    try {
      const bruto: unknown = JSON.parse(await readFile(arquivoContador(), "utf8"));
      if (bruto !== null && typeof bruto === "object" && !Array.isArray(bruto)) {
        contador = bruto as Record<string, number>;
        contadorLido = true;
      }
    } catch {
      // Ausente na primeira execução, ou corrompido: o fallback abaixo resolve.
    }

    const atual = contador[chave];
    let anterior = typeof atual === "number" && Number.isFinite(atual) ? Math.trunc(atual) : 0;
    if (!contadorLido || anterior <= 0) {
      anterior = Math.max(anterior, await maiorProtocoloDoAno(ano));
    }

    const proximo = anterior + 1;
    contador[chave] = proximo;
    await escreverAtomico(arquivoContador(), `${JSON.stringify(contador, null, 2)}\n`);
    return `JP-RH-${chave}-${String(proximo).padStart(4, "0")}`;
  });
}

export async function salvarCandidatura(c: Candidatura): Promise<void> {
  const arquivo = caminhoJson(c.id);
  await enfileirar(async () => {
    await garantirDiretorios();
    await escreverAtomico(arquivo, `${JSON.stringify(c, null, 2)}\n`);
  });
}

/**
 * Ciclo ler -> mesclar -> gravar inteiro DENTRO da fila. Devolve o registro já
 * gravado, ou `null` quando a candidatura não existe.
 *
 * `enfileirar` serializa só a escrita, e isso não basta para um
 * read-modify-write: dar a nota 5 na gaveta e trocar o status no mesmo segundo
 * faz os dois handlers lerem o MESMO registro antes de qualquer um gravar, e o
 * segundo grava `{...estadoVelho, status}` — a nota some do disco (e da tela,
 * que adota o item da última resposta). `proximoProtocolo` já lê o contador
 * dentro da fila, e é por isso que protocolo duplicado nunca aconteceu; aqui
 * vale o mesmo padrão.
 *
 * `mutador` é síncrono de propósito: qualquer `await` lá dentro reabriria a
 * janela que esta função existe para fechar.
 */
export async function atualizarCandidaturaNoDisco(
  id: string,
  mutador: (atual: Candidatura) => Candidatura,
): Promise<Candidatura | null> {
  let arquivo: string;
  try {
    arquivo = caminhoJson(id);
  } catch {
    // Id fora do formato: mesmo tratamento de `lerCandidatura`, "não existe".
    return null;
  }

  return enfileirar(async () => {
    const atual = await lerCandidatura(id);
    if (atual === null) return null;

    const item = mutador(atual);
    await garantirDiretorios();
    await escreverAtomico(arquivo, `${JSON.stringify(item, null, 2)}\n`);
    return item;
  });
}

/**
 * Completa o que faltar com o objeto vazio do domínio e descarta campo com tipo
 * trocado. Um registro gravado por uma versão antiga do formulário — ou editado
 * à mão no disco — não pode quebrar o painel no primeiro `.map`.
 *
 * Genérico porque candidatura, vaga e configurações têm exatamente o mesmo
 * problema: são JSON antigo que precisa continuar carregando.
 */
function comPadrao<T extends object>(vazio: T, bruto: Record<string, unknown>): T {
  // O `as` é necessário porque `T extends object` não promete índice por string;
  // as chaves vêm de `Object.keys(vazio)`, então a leitura é sempre válida.
  const mesclada = { ...vazio } as Record<string, unknown>;

  for (const chave of Object.keys(vazio)) {
    const valor = bruto[chave];
    if (valor === undefined) continue;

    const padrao = mesclada[chave];
    if (Array.isArray(padrao)) {
      if (Array.isArray(valor)) mesclada[chave] = valor;
      continue;
    }
    // `curriculo` nasce null: aí qualquer objeto (ou null) serve.
    if (padrao === null || typeof padrao === typeof valor) mesclada[chave] = valor;
  }

  return mesclada as T;
}

function comCamposFaltantes(bruto: Record<string, unknown>): Candidatura {
  return comPadrao(candidaturaVazia(), bruto);
}

export async function lerCandidatura(id: string): Promise<Candidatura | null> {
  let arquivo: string;
  try {
    arquivo = caminhoJson(id);
  } catch {
    // Id fora do formato: trata como "não existe" em vez de estourar para a tela.
    return null;
  }

  try {
    const bruto: unknown = JSON.parse(await readFile(arquivo, "utf8"));
    if (bruto === null || typeof bruto !== "object" || Array.isArray(bruto)) return null;
    return comCamposFaltantes(bruto as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function listarTodas(): Promise<Candidatura[]> {
  let nomes: string[];
  try {
    nomes = await readdir(pastaCandidaturas());
  } catch {
    // Ainda não houve nenhum envio: pasta inexistente é lista vazia.
    return [];
  }

  const itens: Candidatura[] = [];
  for (const nome of nomes) {
    if (!nome.endsWith(".json")) continue;
    // try/catch por arquivo: um JSON corrompido some da lista em vez de derrubar
    // o painel inteiro.
    const item = await lerCandidatura(nome.slice(0, -".json".length));
    if (item !== null) itens.push(item);
  }

  itens.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  return itens;
}

/**
 * Grava só o resultado da triagem por IA, preservando tudo o mais.
 *
 * Passa pelo mesmo `atualizarCandidaturaNoDisco` das outras escritas, e não por
 * um `salvarCandidatura` com o objeto que a análise tinha em mãos: a análise de
 * um currículo leva dezenas de segundos, e nesse intervalo o RH pode ter mudado
 * o status ou escrito uma anotação na tela. Gravar o retrato antigo por cima
 * apagaria esse trabalho.
 */
export async function salvarAnalise(id: string, analise: AnaliseIa): Promise<Candidatura | null> {
  return atualizarCandidaturaNoDisco(id, (atual) => ({
    ...atual,
    analise,
    // `atualizadoEm` NÃO muda aqui de propósito: ele ordena o que a clínica
    // mexeu, e uma reanálise em lote de 300 currículos jogaria todos para o topo
    // como se alguém tivesse acabado de cuidar de cada um deles.
  }));
}

/**
 * O mínimo para detectar reenvio: nome e telefone (mesma pessoa) e o hash do
 * arquivo (mesmo PDF). Devolve só estes campos porque a importação chama isso a
 * cada arquivo, e carregar a lista inteira de candidaturas completas a cada
 * iteração transformaria uma pasta de 300 currículos em muita leitura de disco.
 */
export async function listarParaDeduplicacao(): Promise<
  { id: string; nome: string; telefone: string; hashArquivo: string }[]
> {
  const todas = await listarTodas();
  return todas.map((c) => ({
    id: c.id,
    nome: c.nome,
    telefone: c.telefone,
    hashArquivo: c.hashArquivo,
  }));
}

export async function excluirTudo(id: string): Promise<void> {
  const arquivo = caminhoJson(id);
  const pasta = caminhoPastaCurriculo(id);
  await enfileirar(async () => {
    await rm(arquivo, { force: true });
    await rm(pasta, { force: true, recursive: true });
  });
}

export async function salvarCurriculo(
  id: string,
  nomeArquivo: string,
  dados: Uint8Array,
  // Ignorado aqui de propósito: no disco o tipo do arquivo é deduzido da
  // extensão na hora de servir. O parâmetro existe porque o driver do Supabase
  // precisa dele (o bucket exige content-type no upload) e os dois têm de ter a
  // mesma assinatura para o despachante poder trocar um pelo outro.
  _tipo?: string,
): Promise<void> {
  const pasta = caminhoPastaCurriculo(id);
  const arquivo = caminhoCurriculo(id, nomeArquivo);
  await enfileirar(async () => {
    await mkdir(pasta, { recursive: true });
    await escreverAtomico(arquivo, dados);
  });
}

export async function lerCurriculo(id: string, nomeArquivo: string): Promise<Uint8Array | null> {
  let arquivo: string;
  try {
    arquivo = caminhoCurriculo(id, nomeArquivo);
  } catch {
    return null;
  }

  try {
    const bytes = await readFile(arquivo);
    // Vista como Uint8Array sem cópia: quem chama só precisa dos bytes para a
    // resposta HTTP, e o Buffer do Node é uma view sobre um pool compartilhado.
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  } catch {
    return null;
  }
}

/**
 * Reduz o nome enviado pelo navegador a algo que sirva de nome de arquivo:
 * ASCII, minúsculo, sem acento e sem separador de caminho. A extensão é
 * preservada porque é ela que faz o navegador abrir o PDF em vez de baixar um
 * arquivo sem tipo.
 */

/* -------------------------------------------------------------------------- */
/* Vagas                                                                      */
/* -------------------------------------------------------------------------- */

/** Mesmo formato de `novoId()`; o prefixo diferente evita confundir as pastas. */

export async function salvarVaga(v: Vaga): Promise<void> {
  const arquivo = caminhoVagaJson(v.id);
  await enfileirar(async () => {
    await garantirDiretorios();
    await escreverAtomico(arquivo, `${JSON.stringify(v, null, 2)}\n`);
  });
}

export async function lerVaga(id: string): Promise<Vaga | null> {
  let arquivo: string;
  try {
    arquivo = caminhoVagaJson(id);
  } catch {
    // Id fora do formato: trata como "não existe" em vez de estourar para a tela.
    return null;
  }

  try {
    const bruto: unknown = JSON.parse(await readFile(arquivo, "utf8"));
    if (bruto === null || typeof bruto !== "object" || Array.isArray(bruto)) return null;
    return comPadrao(vagaVazia(), bruto as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function listarVagas(): Promise<Vaga[]> {
  await semearVagasSePreciso();

  let nomes: string[];
  try {
    nomes = await readdir(pastaVagas());
  } catch {
    return [];
  }

  const itens: Vaga[] = [];
  for (const nome of nomes) {
    if (!nome.endsWith(".json")) continue;
    // O try/catch mora dentro de `lerVaga`: um JSON corrompido some da lista em
    // vez de derrubar o portal inteiro.
    const item = await lerVaga(nome.slice(0, -".json".length));
    if (item !== null) itens.push(item);
  }

  itens.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  return itens;
}

/**
 * O slug não é nome de arquivo: a busca varre a lista. São dezenas de vagas na
 * vida inteira da clínica, então um índice em disco seria estado a mais para
 * manter sincronizado — e índice desincronizado é vaga que some do site.
 */
export async function lerVagaPorSlug(slug: string): Promise<Vaga | null> {
  const alvo = slug.trim().toLowerCase();
  if (alvo.length === 0) return null;
  return (await listarVagas()).find((v) => v.slug === alvo) ?? null;
}

export async function excluirVaga(id: string): Promise<void> {
  const arquivo = caminhoVagaJson(id);
  await enfileirar(async () => {
    await rm(arquivo, { force: true });
  });
}

/* -------------------------------------------------------------------------- */
/* Guias de entrevista                                                        */
/* -------------------------------------------------------------------------- */

/** Mesmo formato de `novoId()`; o prefixo diferente evita confundir as pastas. */

export async function salvarGuia(g: GuiaEntrevista): Promise<void> {
  const arquivo = caminhoGuiaJson(g.id);
  await enfileirar(async () => {
    await mkdir(pastaGuias(), { recursive: true });
    await escreverAtomico(
      arquivo,
      `${JSON.stringify(g, null, 2)}
`,
    );
  });
}

export async function lerGuia(id: string): Promise<GuiaEntrevista | null> {
  let arquivo: string;
  try {
    arquivo = caminhoGuiaJson(id);
  } catch {
    // Id fora do formato: trata como "não existe" em vez de estourar para a tela.
    return null;
  }

  try {
    const bruto: unknown = JSON.parse(await readFile(arquivo, "utf8"));
    if (bruto === null || typeof bruto !== "object" || Array.isArray(bruto)) return null;
    return comPadrao(guiaVazio(), bruto as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function listarGuias(): Promise<GuiaEntrevista[]> {
  await semearGuiasSePreciso();

  let nomes: string[];
  try {
    nomes = await readdir(pastaGuias());
  } catch {
    return [];
  }

  const itens: GuiaEntrevista[] = [];
  for (const nome of nomes) {
    if (!nome.endsWith(".json")) continue;
    const item = await lerGuia(nome.slice(0, -".json".length));
    if (item !== null) itens.push(item);
  }

  // Padrão primeiro, depois por título: a tela abre no guia que a clínica usa
  // todo dia, e não no último que alguém salvou.
  itens.sort((a, b) => {
    if (a.padrao !== b.padrao) return a.padrao ? -1 : 1;
    return a.titulo.localeCompare(b.titulo, "pt-BR");
  });
  return itens;
}

export async function excluirGuia(id: string): Promise<void> {
  const arquivo = caminhoGuiaJson(id);
  await enfileirar(async () => {
    await rm(arquivo, { force: true });
  });
}

/**
 * Guardada em promessa pelo mesmo motivo de `semeadura`: duas chamadas
 * concorrentes esperam a MESMA semeadura em vez de a segunda seguir com a pasta
 * pela metade.
 */
let semeaduraGuias: Promise<void> | null = null;

export function semearGuiasSePreciso(): Promise<void> {
  if (semeaduraGuias === null) {
    semeaduraGuias = semearGuias().catch(() => {
      semeaduraGuias = null;
    });
  }
  return semeaduraGuias;
}

/**
 * Semeia o guia de recepção que a clínica entregou.
 *
 * Ao contrário das vagas de exemplo, este guia nasce pronto para uso (é o
 * método REAL da JP, não um rascunho para alguém revisar), e por isso já vem
 * marcado como padrão da área de recepção. A trava é a mesma: `recursive:
 * false` faz só quem CRIOU a pasta semear — se ela já existe, o RH mexeu nos
 * guias e repovoar ressuscitaria o que ele acabou de excluir.
 */
async function semearGuias(): Promise<void> {
  await mkdir(raiz(), { recursive: true });

  try {
    await mkdir(pastaGuias(), { recursive: false });
  } catch {
    return;
  }

  const agoraIso = new Date().toISOString();
  const semente = guiaSementeRecepcao();
  const guia: GuiaEntrevista = {
    ...semente,
    id: novoIdGuia(),
    slug: gerarSlug(semente.titulo),
    criadoEm: agoraIso,
    atualizadoEm: agoraIso,
  };
  // Escrita direta, sem `enfileirar`: `listarGuias` chama isto de fora da fila,
  // e entrar nela aqui não traria garantia nenhuma que o `rename` atômico já
  // não dê para um arquivo único.
  await escreverAtomico(
    caminhoGuiaJson(guia.id),
    `${JSON.stringify(guia, null, 2)}
`,
  );
}

/* -------------------------------------------------------------------------- */
/* Rankings                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A chave vira nome de arquivo, então passa pelo mesmo filtro dos ids — mas em
 * vez de recusar, ela é reduzida: quem monta a chave é o painel, a partir de
 * área e vaga ("recepcao", "recepcao__vaga_9f2c"), e uma vaga com título
 * esquisito não pode fazer a geração do ranking estourar na cara do RH.
 */

function caminhoRankingJson(chave: string): string {
  return dentroDaRaiz(path.join(pastaRankings(), `${chaveRankingSegura(chave)}.json`));
}

/** Um arquivo por área/vaga: gerar o ranking de recepção não apaga o de ASB. */
export async function salvarRanking(chave: string, dados: RankingSalvo): Promise<void> {
  const arquivo = caminhoRankingJson(chave);
  await enfileirar(async () => {
    await mkdir(pastaRankings(), { recursive: true });
    await escreverAtomico(arquivo, `${JSON.stringify(dados, null, 2)}\n`);
  });
}

export async function lerRanking(chave: string): Promise<RankingSalvo | null> {
  try {
    const bruto: unknown = JSON.parse(await readFile(caminhoRankingJson(chave), "utf8"));
    if (bruto === null || typeof bruto !== "object" || Array.isArray(bruto)) return null;

    // Sem `comPadrao` aqui: o ranking é um retrato descartável (basta gerar de
    // novo), e um arquivo antigo com formato diferente vale menos que a
    // honestidade de dizer "não há ranking salvo".
    const dados = bruto as Partial<RankingSalvo>;
    if (!Array.isArray(dados.ordem)) return null;
    return dados as RankingSalvo;
  } catch {
    // Nunca foi gerado, ou o arquivo sumiu: a tela mostra o botão de gerar.
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Configurações do portal                                                    */
/* -------------------------------------------------------------------------- */

export async function lerConfiguracoes(): Promise<ConfiguracoesRh> {
  try {
    const bruto: unknown = JSON.parse(await readFile(arquivoConfiguracoes(), "utf8"));
    if (bruto === null || typeof bruto !== "object" || Array.isArray(bruto)) {
      return configuracoesPadrao();
    }
    return comPadrao(configuracoesPadrao(), bruto as Record<string, unknown>);
  } catch {
    // Arquivo ausente (instalação nova) ou corrompido: o portal sobe com os
    // textos padrão em vez de mostrar tela vazia para o candidato.
    return configuracoesPadrao();
  }
}

export async function salvarConfiguracoes(c: ConfiguracoesRh): Promise<void> {
  await enfileirar(async () => {
    await mkdir(raiz(), { recursive: true });
    await escreverAtomico(arquivoConfiguracoes(), `${JSON.stringify(c, null, 2)}\n`);
  });
}

export async function lerSenhaGuardada(): Promise<SenhaGuardada | null> {
  try {
    const bruto: unknown = JSON.parse(await readFile(arquivoSenha(), "utf8"));
    if (bruto === null || typeof bruto !== "object" || Array.isArray(bruto)) return null;
    const dados = bruto as Partial<SenhaGuardada>;
    /* Sem `comPadrao`: registro pela metade não vira senha meia-boca, vira
       "não há senha guardada" — e aí vale a do ambiente, que é o caminho de
       volta para quem estragou o arquivo. */
    if (dados.algoritmo !== "scrypt") return null;
    if (typeof dados.sal !== "string" || dados.sal === "") return null;
    if (typeof dados.hash !== "string" || dados.hash === "") return null;
    return {
      algoritmo: "scrypt",
      sal: dados.sal,
      hash: dados.hash,
      atualizadoEm: typeof dados.atualizadoEm === "string" ? dados.atualizadoEm : "",
    };
  } catch {
    return null;
  }
}

export async function salvarSenhaGuardada(s: SenhaGuardada): Promise<void> {
  await enfileirar(async () => {
    await mkdir(raiz(), { recursive: true });
    await escreverAtomico(arquivoSenha(), `${JSON.stringify(s, null, 2)}\n`);
  });
}

/* -------------------------------------------------------------------------- */
/* Semente de vagas                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Guardada em uma promessa (e não em um booleano) para que duas chamadas
 * concorrentes esperem a MESMA semeadura, em vez de a segunda seguir adiante com
 * a pasta ainda pela metade. Em caso de falha o cache é limpo, então a próxima
 * chamada tenta de novo.
 */
let semeadura: Promise<void> | null = null;

export function semearVagasSePreciso(): Promise<void> {
  if (semeadura === null) {
    semeadura = semear().catch(() => {
      semeadura = null;
    });
  }
  return semeadura;
}

async function semear(): Promise<void> {
  await mkdir(raiz(), { recursive: true });

  // `recursive: false` é a trava: só semeia quem CRIOU a pasta. Se ela já
  // existia, o RH já mexeu nas vagas (talvez apagando todas de propósito) e
  // repovoar seria ressuscitar exatamente o que ele acabou de excluir.
  try {
    await mkdir(pastaVagas(), { recursive: false });
  } catch {
    return;
  }

  // Escrita direta, sem `enfileirar`: esta função é chamada de dentro de
  // `garantirDiretorios()`, que por sua vez já roda dentro de uma tarefa da
  // fila — entrar na fila aqui seria esperar a tarefa que espera por nós.
  const agoraIso = new Date().toISOString();
  for (const vaga of vagasSemente(agoraIso, novoIdVaga)) {
    await escreverAtomico(caminhoVagaJson(vaga.id), `${JSON.stringify(vaga, null, 2)}\n`);
  }
}
