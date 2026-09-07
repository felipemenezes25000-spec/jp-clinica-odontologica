/**
 * Autenticação do painel de RH.
 *
 * Só roda no servidor (carregado por `await import()` dentro dos handlers). É um
 * login único de administração: a clínica tem uma pessoa cuidando do processo
 * seletivo, então usuário/senha por pessoa seria burocracia sem ganho real.
 */
import { createHash, timingSafeEqual } from "node:crypto";

import type { SessionConfig } from "@tanstack/react-start/server";

/**
 * Fallback de desenvolvimento. É literal no código de propósito: serve para
 * `npm run dev` funcionar sem `.env`. Em produção ele nunca é usado — se fosse,
 * qualquer pessoa com acesso ao repositório conseguiria forjar o cookie de admin
 * e entrar no painel.
 */
const SEGREDO_DEV = "jp-rh-dev-segredo-local-nao-use-em-producao-0000";
const SENHA_DEV = "jp-rh-dev";

const NOME_COOKIE = "jp_rh";
const DURACAO_SESSAO = 60 * 60 * 12;

function producao(): boolean {
  return process.env["NODE_ENV"] === "production";
}

// Avisos uma única vez por processo: repetir a cada requisição só esconderia o
// resto do log do servidor.
let avisouSegredo = false;
let avisouSenha = false;

function segredo(): string | null {
  const configurado = process.env["RH_SESSION_SECRET"];
  if (configurado !== undefined && configurado.length > 0) return configurado;
  if (producao()) return null;

  if (!avisouSegredo) {
    avisouSegredo = true;
    console.warn(
      "[RH] RH_SESSION_SECRET ausente: usando segredo de desenvolvimento. Defina a variável antes de publicar.",
    );
  }
  return SEGREDO_DEV;
}

function senhaEsperada(): string | null {
  const configurada = process.env["ADMIN_RH_PASSWORD"];
  if (configurada !== undefined && configurada.length > 0) return configurada;
  if (producao()) return null;

  if (!avisouSenha) {
    avisouSenha = true;
    console.warn(
      `[RH] ADMIN_RH_PASSWORD ausente: usando a senha de desenvolvimento "${SENHA_DEV}".`,
    );
  }
  return SENHA_DEV;
}

let avisouFaltando = "";

export function segredosConfigurados(): { ok: boolean; motivo: string } {
  const faltando: string[] = [];
  if (segredo() === null) faltando.push("RH_SESSION_SECRET");
  if (senhaEsperada() === null) faltando.push("ADMIN_RH_PASSWORD");

  if (faltando.length === 0) return { ok: true, motivo: "" };

  // O nome das variáveis vai só para o log: `motivo` é entregue no HTML de /rh
  // a qualquer visitante sem sessão, e ali ele confirmaria a quem só estava
  // sondando a URL que o painel existe e em que estado está a configuração.
  // Quem precisa do detalhe é quem tem acesso ao servidor.
  const lista = faltando.join(" e ");
  if (avisouFaltando !== lista) {
    avisouFaltando = lista;
    console.warn(`[RH] Painel desligado: falta configurar ${lista} no servidor.`);
  }

  return {
    ok: false,
    motivo: "Painel temporariamente indisponível. Fale com quem cuida do servidor.",
  };
}

/**
 * Lança quando o segredo não existe em produção. Quem chama deve consultar
 * `segredosConfigurados()` antes — cair num segredo padrão aqui seria abrir o
 * painel para quem conhece o código.
 */
export function configuracaoSessao(): SessionConfig {
  const password = segredo();
  if (password === null) {
    throw new Error("RH_SESSION_SECRET não configurado.");
  }

  return {
    name: NOME_COOKIE,
    password,
    maxAge: DURACAO_SESSAO,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      // Sem HTTPS no `vite dev` o cookie com `secure` simplesmente não é salvo.
      secure: producao(),
    },
  };
}

/**
 * Compara digests de tamanho fixo com `timingSafeEqual`. Comparar as strings com
 * `===` vazaria, pelo tempo de resposta, o tamanho e o prefixo acertado da senha.
 */
export function conferirSenha(tentativa: string): boolean {
  const esperada = senhaEsperada();
  if (esperada === null) return false;

  const a = createHash("sha256").update(tentativa, "utf8").digest();
  const b = createHash("sha256").update(esperada, "utf8").digest();
  return timingSafeEqual(a, b);
}

/* -------------------------------------------------------------------------- */
/* Identidade de quem pediu                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Quantos proxies confiáveis existem entre a internet e este processo. Zero
 * (o padrão) significa "recebo a conexão direto".
 */
function proxiesConfiaveis(): number {
  const bruto = Number(process.env["RH_PROXIES_CONFIAVEIS"] ?? "0");
  if (!Number.isFinite(bruto) || bruto <= 0) return 0;
  return Math.min(10, Math.trunc(bruto));
}

/**
 * Chave dos limitadores por IP (login e envio de candidatura).
 *
 * `getRequestIP({ xForwardedFor: true })` devolve a PRIMEIRA entrada de
 * `x-forwarded-for` — justamente a posição que o cliente escreve. Com ela como
 * chave, quem manda um `X-Forwarded-For` diferente a cada tentativa ganha um
 * balde novo por tentativa e o bloqueio de 5 falhas nunca fecha: dá para testar
 * senha sem limite. Por isso a base é o endereço da conexão, que o cliente não
 * escolhe.
 *
 * Atrás de proxy o endereço da conexão é o do proxy, e aí todo mundo viraria o
 * mesmo IP. `RH_PROXIES_CONFIAVEIS` diz quantos saltos confiáveis existem: a
 * entrada contada a partir da DIREITA é a última que um deles escreveu, ou
 * seja, a primeira que o cliente não conseguiu forjar.
 */
export function chaveDeLimitePorIp(
  enderecoConexao: string | undefined,
  xForwardedFor: string | undefined,
): string {
  const confiaveis = proxiesConfiaveis();
  const entradas = (xForwardedFor ?? "")
    .split(",")
    .map((parte) => parte.trim())
    .filter((parte) => parte.length > 0);

  if (confiaveis > 0) {
    const escolhida = entradas[Math.max(0, entradas.length - confiaveis)];
    if (escolhida !== undefined) return escolhida;
  }

  if (enderecoConexao !== undefined && enderecoConexao.length > 0) return enderecoConexao;

  // Serverless sem endereço de conexão e sem proxy declarado. Cair numa chave
  // fixa aqui juntaria o mundo inteiro num balde só e as 5 falhas de qualquer
  // um trancariam o painel para a clínica — remédio pior que a doença. Volta
  // então ao header, sabendo que ele é forjável: é o comportamento de antes,
  // não uma regressão, e o `RH_PROXIES_CONFIAVEIS` do .env.example é o caminho
  // para sair dele.
  return entradas[0] ?? "desconhecido";
}

/* -------------------------------------------------------------------------- */
/* Limitador de tentativas                                                    */
/* -------------------------------------------------------------------------- */

const MAX_FALHAS = 5;
const BLOQUEIO_MS = 15 * 60 * 1000;
const MAX_IPS_MONITORADOS = 1000;

/**
 * Estado em memória, por instância do servidor: some no restart e não é
 * compartilhado entre réplicas. Para uma clínica com um painel só isso basta —
 * o alternativo seria subir Redis ou tabela de tentativas, infraestrutura demais
 * para o problema. O que ele resolve de fato é força bruta simples.
 */
const tentativas = new Map<string, { falhas: number; bloqueadoAte: number }>();

/** Impede que uma enxurrada de IPs diferentes faça o Map crescer sem limite. */
function podar(agora: number): void {
  if (tentativas.size <= MAX_IPS_MONITORADOS) return;
  for (const [ip, registro] of tentativas) {
    if (registro.bloqueadoAte <= agora) tentativas.delete(ip);
  }
}

export function estadoBloqueio(
  ip: string,
  agora: number,
): { bloqueado: boolean; segundos: number } {
  const registro = tentativas.get(ip);
  if (registro === undefined || registro.bloqueadoAte <= agora) {
    return { bloqueado: false, segundos: 0 };
  }
  return { bloqueado: true, segundos: Math.ceil((registro.bloqueadoAte - agora) / 1000) };
}

export function registrarFalha(ip: string, agora: number): void {
  const registro = tentativas.get(ip) ?? { falhas: 0, bloqueadoAte: 0 };
  registro.falhas += 1;

  if (registro.falhas >= MAX_FALHAS) {
    registro.falhas = 0;
    registro.bloqueadoAte = agora + BLOQUEIO_MS;
  }

  tentativas.set(ip, registro);
  podar(agora);
}

export function limparFalhas(ip: string): void {
  tentativas.delete(ip);
}
