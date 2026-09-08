/**
 * Sessão e autorização do CRC.
 *
 * DIFERENÇA DELIBERADA EM RELAÇÃO AO PORTAL DE RH: lá existe uma senha de
 * administração única, porque é uma pessoa cuidando do processo seletivo. Aqui
 * são vários usuários com papéis diferentes, e o item 74 exige saber QUEM
 * alterou o quê. Sem usuário identificado não há auditoria — só um log dizendo
 * que "alguém" mudou a oportunidade.
 *
 * O ITEM 70 É O QUE ORGANIZA O ARQUIVO: "toda rota de backend deve verificar
 * permissão; não confiar apenas em esconder botão". Por isso a função de
 * autorização (`exigir`) devolve um contexto TIPADO que as operações pedem — não
 * dá para chamar um serviço sem ter passado por ela, porque ela é quem produz o
 * `organizationId` de que ele precisa.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

import type { SessionConfig } from "@tanstack/react-start/server";

import { alcancaClinica, pode, type Permissao } from "../dominio/rbac";
import type { Papel, Usuario } from "../dominio/tipos";

import { atualizar, inserir, selecionar, selecionarUm } from "./banco";
import { linhaParaUsuario } from "../aplicacao/repositorios";

const NOME_COOKIE = "jp_crc";
const DURACAO_SESSAO = 60 * 60 * 10;

/** Mesma mecânica do RH: o dev sobe sem `.env`, produção nunca usa o padrão. */
const SEGREDO_DEV = "jp-crc-dev-segredo-local-nao-use-em-producao-000000";

function producao(): boolean {
  return process.env["NODE_ENV"] === "production";
}

let avisouSegredo = false;

function segredo(): string | null {
  const configurado = process.env["CRC_SESSION_SECRET"] ?? process.env["RH_SESSION_SECRET"];
  if (configurado !== undefined && configurado.length >= 32) return configurado;
  if (producao()) return null;

  if (!avisouSegredo) {
    avisouSegredo = true;
    console.warn(
      "[CRC] CRC_SESSION_SECRET ausente: usando segredo de desenvolvimento. Defina antes de publicar.",
    );
  }
  return SEGREDO_DEV;
}

export function sessaoConfigurada(): { ok: boolean; motivo: string } {
  if (segredo() === null) {
    // A mensagem NÃO nomeia a variável: ela é entregue a quem ainda não tem
    // sessão, e confirmaria a quem só estava sondando a URL que o painel
    // existe e em que estado está. Quem precisa do detalhe vê no log.
    return {
      ok: false,
      motivo: "Painel temporariamente indisponível. Fale com quem cuida do servidor.",
    };
  }
  return { ok: true, motivo: "" };
}

export function configuracaoSessao(): SessionConfig {
  const password = segredo();
  if (password === null) throw new Error("CRC_SESSION_SECRET não configurado.");

  return {
    name: NOME_COOKIE,
    password,
    maxAge: DURACAO_SESSAO,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: producao(),
    },
  };
}

export type DadosSessaoCrc = { userId: string; organizationId: string; entrouEm: string };

/* -------------------------------------------------------------------------- */
/* Senha                                                                      */
/* -------------------------------------------------------------------------- */

const TAMANHO_HASH = 64;

function derivar(senha: string, sal: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(senha, sal, TAMANHO_HASH, (erro, chave) => {
      if (erro) reject(erro);
      else resolve(chave);
    });
  });
}

export async function embaralharSenha(senha: string): Promise<string> {
  const sal = randomBytes(16).toString("hex");
  const hash = await derivar(senha, sal);
  return `${sal}:${hash.toString("hex")}`;
}

/**
 * Compara sem vazar pelo relógio.
 *
 * O `createHash` antes do `timingSafeEqual` é o que permite comparar buffers de
 * tamanhos diferentes sem que a própria diferença de tamanho vire o vazamento —
 * mesmo truque do portal de RH.
 */
export async function senhaConfere(senha: string, guardado: string | null): Promise<boolean> {
  if (guardado === null || !guardado.includes(":")) {
    // Usuário sem senha definida: ainda assim derivamos algo, para o tempo de
    // resposta não denunciar quais e-mails existem no sistema.
    await derivar(senha, "sal-inexistente");
    return false;
  }

  const [sal, hashHex] = guardado.split(":");
  if (sal === undefined || hashHex === undefined) return false;

  const calculado = await derivar(senha, sal);
  const a = createHash("sha256").update(calculado).digest();
  const b = createHash("sha256").update(Buffer.from(hashHex, "hex")).digest();
  return timingSafeEqual(a, b);
}

/* -------------------------------------------------------------------------- */
/* Contexto autorizado                                                        */
/* -------------------------------------------------------------------------- */

/**
 * O que toda operação de servidor recebe.
 *
 * Só existe depois de a sessão ser validada, e por isso carregar um
 * `ContextoCrc` já é prova de que houve autenticação. É o que impede uma
 * operação nova esquecer de verificar — ela não compila sem o contexto, e o
 * contexto não se produz sem passar pela verificação.
 */
export type ContextoCrc = {
  usuario: Usuario;
  organizationId: string;
  /** As clínicas que este usuário alcança. Vira filtro em toda leitura. */
  clinicIds: string[];
  requestId: string;
  pode(permissao: Permissao): boolean;
  alcanca(clinicId: string): boolean;
};

export type ResultadoAutorizacao =
  | { ok: true; ctx: ContextoCrc }
  | { ok: false; codigo: "NAO_AUTENTICADO" | "SEM_PERMISSAO"; motivo: string };

export async function carregarUsuario(
  organizationId: string,
  userId: string,
): Promise<Usuario | null> {
  const linha = await selecionarUm("crc_users", {
    filtros: [
      { coluna: "id", op: "eq", valor: userId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "ativo", op: "eq", valor: true },
    ],
  });
  if (linha === null) return null;

  const vinculos = await selecionar("crc_user_clinics", {
    colunas: "clinic_id",
    filtros: [{ coluna: "user_id", op: "eq", valor: userId }],
  });

  return linhaParaUsuario(
    linha,
    vinculos.map((v) => String(v["clinic_id"] ?? "")).filter((c) => c.length > 0),
  );
}

/**
 * Monta o contexto e confere a permissão pedida.
 *
 * O admin recebe TODAS as clínicas da organização em `clinicIds` — carregadas
 * do banco, e não deixadas vazias. Uma lista vazia num filtro `in` traria zero
 * resultados, e o admin veria um CRC vazio em vez do CRC inteiro.
 */
export async function autorizar(
  sessao: DadosSessaoCrc | null,
  requestId: string,
  permissao?: Permissao,
): Promise<ResultadoAutorizacao> {
  if (sessao === null || sessao.userId.length === 0) {
    return { ok: false, codigo: "NAO_AUTENTICADO", motivo: "Sua sessão terminou. Entre de novo." };
  }

  const usuario = await carregarUsuario(sessao.organizationId, sessao.userId);
  if (usuario === null) {
    return { ok: false, codigo: "NAO_AUTENTICADO", motivo: "Sua sessão terminou. Entre de novo." };
  }

  if (permissao !== undefined && !pode(usuario.papel, permissao)) {
    return { ok: false, codigo: "SEM_PERMISSAO", motivo: "Seu acesso não inclui esta ação." };
  }

  let clinicIds = usuario.clinicas;
  if (usuario.papel === "admin") {
    const todas = await selecionar("crc_clinics", {
      colunas: "id",
      filtros: [{ coluna: "organization_id", op: "eq", valor: usuario.organizationId }],
    });
    clinicIds = todas.map((c) => String(c["id"] ?? "")).filter((c) => c.length > 0);
  }

  return {
    ok: true,
    ctx: {
      usuario,
      organizationId: usuario.organizationId,
      clinicIds,
      requestId,
      pode: (p) => pode(usuario.papel, p),
      alcanca: (clinicId) => alcancaClinica(usuario, clinicId),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Login                                                                      */
/* -------------------------------------------------------------------------- */

export type ResultadoLogin =
  { ok: true; sessao: DadosSessaoCrc; usuario: Usuario } | { ok: false; erro: string };

/**
 * Autentica por e-mail e senha.
 *
 * A MENSAGEM DE ERRO É A MESMA para e-mail inexistente e senha errada, de
 * propósito: mensagens diferentes transformam a tela de login num verificador
 * de quais e-mails têm conta.
 */
export async function entrar(email: string, senha: string): Promise<ResultadoLogin> {
  const limpo = email.trim().toLowerCase();
  const generico = { ok: false as const, erro: "E-mail ou senha incorretos." };

  if (limpo.length === 0 || senha.length === 0) return generico;

  const linha = await selecionarUm("crc_users", {
    filtros: [
      { coluna: "email", op: "eq", valor: limpo },
      { coluna: "ativo", op: "eq", valor: true },
    ],
  });

  const guardado = typeof linha?.["senha_hash"] === "string" ? linha["senha_hash"] : null;
  // A verificação roda mesmo sem usuário encontrado: ver `senhaConfere`.
  const confere = await senhaConfere(senha, guardado);
  if (linha === null || !confere) return generico;

  const organizationId = String(linha["organization_id"] ?? "");
  const userId = String(linha["id"] ?? "");

  const usuario = await carregarUsuario(organizationId, userId);
  if (usuario === null) return generico;

  await atualizar("crc_users", [{ coluna: "id", op: "eq", valor: userId }], {
    ultimo_acesso: new Date().toISOString(),
  });

  return {
    ok: true,
    sessao: { userId, organizationId, entrouEm: new Date().toISOString() },
    usuario,
  };
}

/**
 * Cria um usuário. Usado pela semeadura e pela tela de administração.
 *
 * O e-mail é normalizado para minúsculas na gravação porque o login normaliza
 * na leitura — se só um dos lados normalizasse, "Maria@x.com" cadastrado nunca
 * conseguiria entrar digitando "maria@x.com".
 */
export async function criarUsuario(dados: {
  organizationId: string;
  nome: string;
  email: string;
  senha: string;
  papel: Papel;
  clinicIds: readonly string[];
}): Promise<{ ok: true; userId: string } | { ok: false; motivo: string }> {
  const email = dados.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    return { ok: false, motivo: "E-mail inválido." };
  }
  if (dados.senha.length < 10) {
    return { ok: false, motivo: "A senha precisa ter pelo menos 10 caracteres." };
  }

  const jaExiste = await selecionarUm("crc_users", {
    colunas: "id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: dados.organizationId },
      { coluna: "email", op: "eq", valor: email },
    ],
  });
  if (jaExiste !== null) return { ok: false, motivo: "Já existe um usuário com este e-mail." };

  const linhas = await inserir("crc_users", {
    organization_id: dados.organizationId,
    nome: dados.nome.trim(),
    email,
    senha_hash: await embaralharSenha(dados.senha),
    papel: dados.papel,
    ativo: true,
  });

  const userId = String(linhas[0]?.["id"] ?? "");
  if (userId.length === 0) return { ok: false, motivo: "Não foi possível criar o usuário." };

  for (const clinicId of dados.clinicIds) {
    await inserir("crc_user_clinics", { user_id: userId, clinic_id: clinicId });
  }

  return { ok: true, userId };
}
