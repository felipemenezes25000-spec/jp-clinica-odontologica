/**
 * Cadastro de equipe — o item 37 ("cada um deve enxergar somente o
 * necessário") só existe de verdade quando há mais de um usuário.
 *
 * POR QUE ISTO ERA A LACUNA MAIS GRAVE DO SISTEMA
 * A instalação criava UM usuário e não havia como criar o segundo. Um CRC com
 * um login só não é um CRC com pouca gente: é um CRC sem auditoria. Toda
 * tarefa concluída, toda mensagem enviada, toda oportunidade movida passaria a
 * ser assinada por "o login da clínica" — e o item 74, que exige saber QUEM
 * alterou o quê, viraria letra morta no primeiro dia de uso.
 *
 * AS CINCO REGRAS QUE ESTE ARQUIVO IMPÕE, e o motivo de cada uma:
 *
 *   NINGUÉM SE DESATIVA. Um administrador que se desativa sozinho fecha a
 *   porta com a chave do lado de dentro: não sobra quem reative. O servidor
 *   recusa, e não a tela — esconder o botão não impede uma requisição direta.
 *
 *   O ÚLTIMO ADMINISTRADOR ATIVO NÃO PODE SER REBAIXADO NEM DESATIVADO. Mesmo
 *   raciocínio, um passo além: dois administradores podem se desativar em
 *   sequência e produzir o mesmo beco sem saída.
 *
 *   DESATIVAR VALE NA REQUISIÇÃO SEGUINTE, sem nenhum trabalho extra: o cookie
 *   guarda só o id, e `carregarUsuario` relê a pessoa do banco a cada
 *   requisição filtrando por `ativo = true`. O mesmo vale para o papel. É o
 *   contrário de um cookie que carrega permissão dentro: aqui um rebaixamento
 *   não espera o próximo login.
 *
 *   TROCAR A SENHA NÃO DERRUBA QUEM JÁ ESTÁ DENTRO — e isso precisa ser dito em
 *   voz alta, porque o oposto é o que se costuma supor. O cookie não depende do
 *   hash. A troca serve para quem PERDEU o acesso; para cortar o acesso de
 *   alguém que saiu da clínica, o botão certo é DESATIVAR.
 *
 *   A SENHA NUNCA VOLTA PARA A TELA. Quem cria escolhe a senha e a entrega
 *   pessoalmente. Devolvê-la na resposta a colocaria no log do navegador, no
 *   histórico de rede e na tela de quem estiver olhando por cima do ombro.
 */
import { PAPEIS, type Papel, type Usuario } from "../dominio/tipos";
import { atualizar, selecionar, selecionarUm, type Linha } from "../servidor/banco";
import { auditar } from "../servidor/registro";
import { criarUsuario, embaralharSenha } from "../servidor/sessao";

import { linhaParaUsuario } from "./repositorios";

export type MembroEquipe = Usuario & {
  ultimoAcesso: string | null;
  /** Verdadeiro para quem está lendo — a tela usa para esconder as próprias ações. */
  souEu: boolean;
};

export function ehPapel(bruto: string): bruto is Papel {
  return (PAPEIS as readonly string[]).includes(bruto);
}

export const MIN_SENHA = 10;

/* -------------------------------------------------------------------------- */
/* Leitura                                                                    */
/* -------------------------------------------------------------------------- */

export async function listarEquipe(organizationId: string, euId: string): Promise<MembroEquipe[]> {
  const linhas = await selecionar("crc_users", {
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
    // Ativos primeiro, e depois por nome: quem está fora da operação não
    // disputa a atenção de quem está.
    ordenar: [
      { coluna: "ativo", ascendente: false },
      { coluna: "nome", ascendente: true },
    ],
    limite: 200,
  });

  return linhas.map((l) => {
    const u = linhaParaUsuario(l);
    const ultimo = l["ultimo_acesso"];
    return {
      ...u,
      ultimoAcesso: typeof ultimo === "string" && ultimo.length > 0 ? ultimo : null,
      souEu: u.id === euId,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Escrita                                                                    */
/* -------------------------------------------------------------------------- */

export type ResultadoEquipe = { ok: true } | { ok: false; motivo: string };

/**
 * Quantos administradores ATIVOS existem além deste.
 *
 * A consulta é por contagem e não por lista porque o número é a única coisa
 * que importa, e uma organização com trinta usuários não precisa trazer
 * trinta linhas para responder "sobra alguém?".
 */
async function outroAdminAtivo(organizationId: string, exceto: string): Promise<boolean> {
  const linhas = await selecionar("crc_users", {
    colunas: "id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "papel", op: "eq", valor: "admin" },
      { coluna: "ativo", op: "eq", valor: true },
      { coluna: "id", op: "neq", valor: exceto },
    ],
    limite: 1,
  });
  return linhas.length > 0;
}

async function buscarDaOrganizacao(organizationId: string, userId: string): Promise<Linha | null> {
  // O `organization_id` entra como FILTRO, e não como conferência depois de
  // ler pelo id: é o item 71 aplicado a usuário. Um id de outra organização
  // simplesmente não encontra ninguém.
  return selecionarUm("crc_users", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "id", op: "eq", valor: userId },
    ],
  });
}

export async function convidarMembro(dados: {
  organizationId: string;
  clinicIds: readonly string[];
  nome: string;
  email: string;
  senha: string;
  papel: Papel;
  autorId: string;
}): Promise<ResultadoEquipe & { userId?: string }> {
  const nome = dados.nome.trim().slice(0, 120);
  if (nome.length < 2) return { ok: false, motivo: "Informe o nome da pessoa." };

  if (dados.clinicIds.length === 0) {
    return { ok: false, motivo: "Nenhuma clínica ativa para associar." };
  }

  const r = await criarUsuario({
    organizationId: dados.organizationId,
    nome,
    email: dados.email,
    senha: dados.senha,
    papel: dados.papel,
    clinicIds: dados.clinicIds,
  });

  if (!r.ok) return { ok: false, motivo: r.motivo };

  await auditar({
    organizationId: dados.organizationId,
    userId: dados.autorId,
    ator: "humano",
    acao: "usuario.criado",
    entityType: "user",
    entityId: r.userId,
    // A senha NÃO entra na auditoria. O registro serve para saber quem criou
    // quem, e guardar a senha aqui a tornaria legível para sempre.
    depois: { nome, email: dados.email.trim().toLowerCase(), papel: dados.papel },
  });

  return { ok: true, userId: r.userId };
}

export async function mudarPapel(dados: {
  organizationId: string;
  userId: string;
  papel: Papel;
  autorId: string;
}): Promise<ResultadoEquipe> {
  const alvo = await buscarDaOrganizacao(dados.organizationId, dados.userId);
  if (alvo === null) return { ok: false, motivo: "Usuário não encontrado." };

  const papelAtual = String(alvo["papel"] ?? "");
  if (papelAtual === dados.papel) return { ok: true };

  if (
    papelAtual === "admin" &&
    alvo["ativo"] === true &&
    !(await outroAdminAtivo(dados.organizationId, dados.userId))
  ) {
    return {
      ok: false,
      motivo: "Este é o último administrador ativo. Promova outra pessoa antes de mudar o papel.",
    };
  }

  await atualizar(
    "crc_users",
    [
      { coluna: "organization_id", op: "eq", valor: dados.organizationId },
      { coluna: "id", op: "eq", valor: dados.userId },
    ],
    { papel: dados.papel, atualizado_em: new Date().toISOString() },
  );

  await auditar({
    organizationId: dados.organizationId,
    userId: dados.autorId,
    ator: "humano",
    acao: "usuario.papel_alterado",
    entityType: "user",
    entityId: dados.userId,
    antes: { papel: papelAtual },
    depois: { papel: dados.papel },
  });

  return { ok: true };
}

export async function mudarAtivacao(dados: {
  organizationId: string;
  userId: string;
  ativo: boolean;
  autorId: string;
}): Promise<ResultadoEquipe> {
  if (dados.userId === dados.autorId && !dados.ativo) {
    return { ok: false, motivo: "Você não pode desativar a própria conta." };
  }

  const alvo = await buscarDaOrganizacao(dados.organizationId, dados.userId);
  if (alvo === null) return { ok: false, motivo: "Usuário não encontrado." };

  if (
    !dados.ativo &&
    String(alvo["papel"] ?? "") === "admin" &&
    !(await outroAdminAtivo(dados.organizationId, dados.userId))
  ) {
    return {
      ok: false,
      motivo: "Este é o último administrador ativo. Promova outra pessoa antes de desativá-lo.",
    };
  }

  await atualizar(
    "crc_users",
    [
      { coluna: "organization_id", op: "eq", valor: dados.organizationId },
      { coluna: "id", op: "eq", valor: dados.userId },
    ],
    { ativo: dados.ativo, atualizado_em: new Date().toISOString() },
  );

  await auditar({
    organizationId: dados.organizationId,
    userId: dados.autorId,
    ator: "humano",
    acao: dados.ativo ? "usuario.reativado" : "usuario.desativado",
    entityType: "user",
    entityId: dados.userId,
    depois: { ativo: dados.ativo },
  });

  return { ok: true };
}

export async function redefinirSenha(dados: {
  organizationId: string;
  userId: string;
  senha: string;
  autorId: string;
}): Promise<ResultadoEquipe> {
  if (dados.senha.length < MIN_SENHA) {
    return { ok: false, motivo: `A senha precisa ter pelo menos ${String(MIN_SENHA)} caracteres.` };
  }

  const alvo = await buscarDaOrganizacao(dados.organizationId, dados.userId);
  if (alvo === null) return { ok: false, motivo: "Usuário não encontrado." };

  await atualizar(
    "crc_users",
    [
      { coluna: "organization_id", op: "eq", valor: dados.organizationId },
      { coluna: "id", op: "eq", valor: dados.userId },
    ],
    { senha_hash: await embaralharSenha(dados.senha), atualizado_em: new Date().toISOString() },
  );

  await auditar({
    organizationId: dados.organizationId,
    userId: dados.autorId,
    ator: "humano",
    acao: "usuario.senha_redefinida",
    entityType: "user",
    entityId: dados.userId,
    // Sem `antes` e sem `depois`: o QUE mudou é óbvio pelo nome da ação, e
    // qualquer detalhe aqui seria sobre uma senha.
  });

  return { ok: true };
}
