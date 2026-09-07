/**
 * Onde os dados do RH ficam guardados — disco local ou Supabase.
 *
 * Este arquivo não guarda nada: ele escolhe quem guarda. Todo o resto do sistema
 * continua importando "./servidor/armazenamento" e não sabe (nem precisa saber)
 * qual dos dois está atendendo.
 *
 * A ESCOLHA
 * `RH_STORAGE=supabase` usa o Supabase; qualquer outro valor, ou variável
 * ausente, usa o disco. O padrão é o disco de propósito: quem clona o projeto e
 * roda `npm run dev` tem tudo funcionando sem criar conta em lugar nenhum.
 *
 * POR QUE UM DESPACHANTE, E NÃO UM `if` DENTRO DE CADA FUNÇÃO
 * Os dois drivers são grandes e não têm nada em comum na implementação: um fala
 * `node:fs`, o outro fala HTTP. Misturar os dois num arquivo só produziria uma
 * função com dois corpos e um `if` no meio, trinta vezes. Aqui cada driver
 * continua inteiro e legível no seu arquivo, e a troca é uma variável de
 * ambiente — inclusive para voltar atrás.
 *
 * O import é dinâmico e memoizado: em modo Supabase, `node:fs` nunca chega a ser
 * carregado, e vice-versa.
 */
import type { AnaliseIa, RankingSalvo } from "../ia/tipos";
import type { GuiaEntrevista } from "../guia";
import type { Candidatura, ConfiguracoesRh, Vaga } from "../tipos";

// Puros e idênticos nos dois lados. Ficam fora do despacho porque são
// síncronos: quem chama `novoId()` não espera uma Promise de volta.
import {
  chaveRankingSegura as _chaveRankingSegura,
  nomeArquivoSeguro as _nomeArquivoSeguro,
  novoId as _novoId,
  novoIdGuia as _novoIdGuia,
  novoIdVaga as _novoIdVaga,
} from "./comum";

// Funções, e não `export ... from`. O re-export obriga o bundler a emitir o
// helper `__exportAll`, e foi ele que apareceu indefinido no ciclo de chunks que
// derrubou a produção. Declarar delegações custa cinco linhas e não gera helper.
export function novoId(): string {
  return _novoId();
}
export function novoIdVaga(): string {
  return _novoIdVaga();
}
export function novoIdGuia(): string {
  return _novoIdGuia();
}
export function nomeArquivoSeguro(nomeOriginal: string): string {
  return _nomeArquivoSeguro(nomeOriginal);
}
export function chaveRankingSegura(chave: string): string {
  return _chaveRankingSegura(chave);
}

type Driver = typeof import("./arquivo");

export function driverEmUso(): "arquivo" | "supabase" {
  return (process.env["RH_STORAGE"] ?? "").trim().toLowerCase() === "supabase"
    ? "supabase"
    : "arquivo";
}

let escolhido: Promise<Driver> | null = null;

function driver(): Promise<Driver> {
  if (escolhido === null) {
    escolhido =
      driverEmUso() === "supabase"
        ? // O cast existe porque os dois módulos têm a mesma superfície pública
          // mas nenhum "implements" para o TypeScript conferir. A garantia real
          // é o teste de contrato em scripts/conferir-drivers.mjs, que compara
          // os nomes exportados dos dois lados.
          (import("./supabase") as unknown as Promise<Driver>)
        : import("./arquivo");
  }
  return escolhido;
}

/* -------------------------------------------------------------------------- */
/* Candidaturas                                                               */
/* -------------------------------------------------------------------------- */

export async function garantirDiretorios(): Promise<void> {
  return (await driver()).garantirDiretorios();
}

export async function proximoProtocolo(ano: number): Promise<string> {
  return (await driver()).proximoProtocolo(ano);
}

export async function salvarCandidatura(c: Candidatura): Promise<void> {
  return (await driver()).salvarCandidatura(c);
}

export async function atualizarCandidaturaNoDisco(
  id: string,
  mutador: (atual: Candidatura) => Candidatura,
): Promise<Candidatura | null> {
  return (await driver()).atualizarCandidaturaNoDisco(id, mutador);
}

export async function lerCandidatura(id: string): Promise<Candidatura | null> {
  return (await driver()).lerCandidatura(id);
}

export async function listarTodas(): Promise<Candidatura[]> {
  return (await driver()).listarTodas();
}

export async function salvarAnalise(id: string, analise: AnaliseIa): Promise<Candidatura | null> {
  return (await driver()).salvarAnalise(id, analise);
}

export async function listarParaDeduplicacao(): Promise<
  { id: string; nome: string; telefone: string; hashArquivo: string }[]
> {
  return (await driver()).listarParaDeduplicacao();
}

export async function excluirTudo(id: string): Promise<void> {
  return (await driver()).excluirTudo(id);
}

/* -------------------------------------------------------------------------- */
/* Currículos                                                                 */
/* -------------------------------------------------------------------------- */

export async function salvarCurriculo(
  id: string,
  nomeArquivo: string,
  dados: Uint8Array,
  tipo?: string,
): Promise<void> {
  return (await driver()).salvarCurriculo(id, nomeArquivo, dados, tipo);
}

export async function lerCurriculo(id: string, nomeArquivo: string): Promise<Uint8Array | null> {
  return (await driver()).lerCurriculo(id, nomeArquivo);
}

/* -------------------------------------------------------------------------- */
/* Vagas                                                                      */
/* -------------------------------------------------------------------------- */

export async function salvarVaga(v: Vaga): Promise<void> {
  return (await driver()).salvarVaga(v);
}

export async function lerVaga(id: string): Promise<Vaga | null> {
  return (await driver()).lerVaga(id);
}

export async function lerVagaPorSlug(slug: string): Promise<Vaga | null> {
  return (await driver()).lerVagaPorSlug(slug);
}

export async function listarVagas(): Promise<Vaga[]> {
  return (await driver()).listarVagas();
}

export async function excluirVaga(id: string): Promise<void> {
  return (await driver()).excluirVaga(id);
}

export async function semearVagasSePreciso(): Promise<void> {
  return (await driver()).semearVagasSePreciso();
}

/* -------------------------------------------------------------------------- */
/* Guias de entrevista                                                        */
/* -------------------------------------------------------------------------- */

export async function salvarGuia(g: GuiaEntrevista): Promise<void> {
  return (await driver()).salvarGuia(g);
}

export async function lerGuia(id: string): Promise<GuiaEntrevista | null> {
  return (await driver()).lerGuia(id);
}

export async function listarGuias(): Promise<GuiaEntrevista[]> {
  return (await driver()).listarGuias();
}

export async function excluirGuia(id: string): Promise<void> {
  return (await driver()).excluirGuia(id);
}

export async function semearGuiasSePreciso(): Promise<void> {
  return (await driver()).semearGuiasSePreciso();
}

/* -------------------------------------------------------------------------- */
/* Configurações e rankings                                                   */
/* -------------------------------------------------------------------------- */

export async function lerConfiguracoes(): Promise<ConfiguracoesRh> {
  return (await driver()).lerConfiguracoes();
}

export async function salvarConfiguracoes(c: ConfiguracoesRh): Promise<void> {
  return (await driver()).salvarConfiguracoes(c);
}

export async function salvarRanking(chave: string, dados: RankingSalvo): Promise<void> {
  return (await driver()).salvarRanking(chave, dados);
}

export async function lerRanking(chave: string): Promise<RankingSalvo | null> {
  return (await driver()).lerRanking(chave);
}
