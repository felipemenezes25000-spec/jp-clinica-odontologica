/**
 * Clínicas e escopo de acesso — o serviço.
 *
 * ============================================================================
 *  ESTE ARQUIVO FECHA AS DUAS LACUNAS DE UI QUE O CRC CARREGAVA: não havia
 *  como criar uma segunda unidade nem como dizer quem atende qual.
 *
 *  As duas coisas EXISTIAM no banco desde o `02-crc-schema.sql`
 *  (`crc_clinics`, `crc_user_clinics`) e eram usadas em todo filtro de tenant.
 *  O que faltava era o caminho de volta: só a instalação criava clínica, e
 *  vínculo de usuário só nascia junto com o convite.
 *
 *  Na prática, o CRC era multi-clínica no schema e mono-clínica no uso.
 * ============================================================================
 *
 * TUDO AQUI É AUDITADO. Criar unidade, desativar unidade e mudar o escopo de
 * alguém são exatamente o tipo de ação que, meses depois, ninguém lembra quem
 * fez — e que muda o que uma pessoa enxerga.
 */
import {
  escopoEfetivo,
  gerarSlug,
  podeDesativarClinica,
  validarNomeDaClinica,
} from "../dominio/clinicas";
import { PAPEIS, type Papel } from "../dominio/tipos";
import {
  agoraIso,
  apagar,
  atualizar,
  contar,
  gravar,
  inserir,
  selecionar,
  selecionarUm,
  type Filtro,
} from "../servidor/banco";
import { auditar } from "../servidor/registro";

export type ResultadoClinica = { ok: true } | { ok: false; motivo: string };

export type ClinicaNaLista = {
  id: string;
  nome: string;
  slug: string;
  fuso: string;
  ativa: boolean;
  /** Ligada ao Dental Office? É `external_id` preenchido, nada além disso. */
  integrada: boolean;
  pacientes: number;
  pessoas: number;
};

/* -------------------------------------------------------------------------- */
/* Leitura                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * As unidades da organização, com o tamanho de cada uma.
 *
 * ============================================================================
 *  AS CONTAGENS SÃO `HEAD` COM `count=exact`, uma por unidade.
 *
 *  Trazer os pacientes para contá-los no TypeScript custaria milhares de linhas
 *  para produzir dois inteiros por clínica. Numa organização com cinco
 *  unidades são dez contagens — que o Postgres responde do índice.
 * ============================================================================
 */
export async function listarClinicas(organizationId: string): Promise<ClinicaNaLista[]> {
  const linhas = await selecionar<{
    id: string;
    nome: string;
    slug: string;
    fuso: string | null;
    ativa: boolean | null;
    external_id: string | null;
  }>("crc_clinics", {
    colunas: "id,nome,slug,fuso,ativa,external_id",
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
    // Ativas primeiro, e depois por nome: a unidade fechada não disputa a
    // atenção de quem está operando as abertas.
    ordenar: [
      { coluna: "ativa", ascendente: false },
      { coluna: "nome", ascendente: true },
    ],
    limite: 200,
  });

  return Promise.all(
    linhas.map(async (c) => {
      const [pacientes, pessoas] = await Promise.all([
        contar("crc_patients", [
          { coluna: "organization_id", op: "eq", valor: organizationId },
          { coluna: "clinic_id", op: "eq", valor: c.id },
        ]),
        contar("crc_user_clinics", [{ coluna: "clinic_id", op: "eq", valor: c.id }]),
      ]);

      return {
        id: c.id,
        nome: c.nome,
        slug: c.slug,
        fuso: c.fuso ?? "America/Sao_Paulo",
        ativa: c.ativa !== false,
        integrada: typeof c.external_id === "string" && c.external_id.length > 0,
        pacientes,
        pessoas,
      };
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Criar                                                                      */
/* -------------------------------------------------------------------------- */

export async function criarClinica(p: {
  organizationId: string;
  nome: string;
  fuso: string;
  externalId: string | null;
  autorId: string;
}): Promise<ResultadoClinica & { id?: string }> {
  const critica = validarNomeDaClinica(p.nome);
  if (!critica.ok) return critica;

  const nome = p.nome.trim();
  const slug = gerarSlug(nome);

  /*
   * A COLISÃO É CONFERIDA ANTES, mesmo havendo `unique (organization_id, slug)`
   * no banco.
   *
   * A constraint é a garantia real e continua lá — duas requisições simultâneas
   * ainda batem nela, e é ela que decide. Esta conferência existe só para a
   * mensagem: um erro de constraint chega na tela como "erro ao salvar", e a
   * pessoa não descobre que já existe uma unidade com esse nome.
   */
  const existente = await selecionarUm("crc_clinics", {
    colunas: "id,nome",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: p.organizationId },
      { coluna: "slug", op: "eq", valor: slug },
    ],
  });

  if (existente !== null) {
    return {
      ok: false,
      motivo: `Já existe a unidade “${String(existente["nome"] ?? nome)}”, que usa o mesmo identificador (${slug}). Escolha um nome que as diferencie.`,
    };
  }

  const criadas = await gravar(
    "crc_clinics",
    {
      organization_id: p.organizationId,
      nome,
      slug,
      fuso: p.fuso,
      external_id: p.externalId,
      ativa: true,
    },
    "organization_id,slug",
  );

  const id = criadas[0]?.["id"];
  if (typeof id !== "string") {
    return { ok: false, motivo: "Não foi possível criar a unidade. Tente de novo." };
  }

  await auditar({
    organizationId: p.organizationId,
    userId: p.autorId,
    ator: "humano",
    acao: "clinica_criada",
    entityType: "crc_clinics",
    entityId: id,
    depois: { nome, slug, fuso: p.fuso },
  });

  return { ok: true, id };
}

/* -------------------------------------------------------------------------- */
/* Renomear                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Muda o nome, e NÃO o slug.
 *
 * ============================================================================
 *  O SLUG É ESTÁVEL DE PROPÓSITO.
 *
 *  Ele já entrou em link compartilhado, em log de auditoria e — quando a
 *  integração está ligada — na correspondência com o sistema da clínica.
 *  Regerá-lo a cada renome quebraria tudo isso sem nenhum erro visível.
 *
 *  Quem quiser um identificador novo cria uma unidade nova. O nome é o rótulo
 *  humano; o slug é a identidade.
 * ============================================================================
 */
export async function renomearClinica(p: {
  organizationId: string;
  clinicId: string;
  nome: string;
  fuso: string;
  autorId: string;
}): Promise<ResultadoClinica> {
  const critica = validarNomeDaClinica(p.nome);
  if (!critica.ok) return critica;

  const atual = await selecionarUm("crc_clinics", {
    colunas: "id,nome,fuso",
    filtros: [
      // O `organization_id` entra como FILTRO, e não como conferência depois de
      // ler pelo id: um id de outra organização simplesmente não encontra nada.
      { coluna: "organization_id", op: "eq", valor: p.organizationId },
      { coluna: "id", op: "eq", valor: p.clinicId },
    ],
  });

  if (atual === null) return { ok: false, motivo: "Unidade não encontrada." };

  const nome = p.nome.trim();

  await atualizar(
    "crc_clinics",
    [
      { coluna: "organization_id", op: "eq", valor: p.organizationId },
      { coluna: "id", op: "eq", valor: p.clinicId },
    ],
    { nome, fuso: p.fuso, atualizado_em: agoraIso() },
  );

  await auditar({
    organizationId: p.organizationId,
    userId: p.autorId,
    ator: "humano",
    acao: "clinica_renomeada",
    entityType: "crc_clinics",
    entityId: p.clinicId,
    antes: { nome: atual["nome"], fuso: atual["fuso"] },
    depois: { nome, fuso: p.fuso },
  });

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Ativar e desativar                                                         */
/* -------------------------------------------------------------------------- */

export async function mudarSituacaoDaClinica(p: {
  organizationId: string;
  clinicId: string;
  ativa: boolean;
  autorId: string;
}): Promise<ResultadoClinica> {
  const atual = await selecionarUm<{ id: string; ativa: boolean | null }>("crc_clinics", {
    colunas: "id,ativa",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: p.organizationId },
      { coluna: "id", op: "eq", valor: p.clinicId },
    ],
  });

  if (atual === null) return { ok: false, motivo: "Unidade não encontrada." };

  if (!p.ativa) {
    const ativasHoje = await contar("crc_clinics", [
      { coluna: "organization_id", op: "eq", valor: p.organizationId },
      { coluna: "ativa", op: "eq", valor: true },
    ]);

    const critica = podeDesativarClinica({
      ativasHoje,
      estaEstaAtiva: atual.ativa !== false,
    });
    if (!critica.ok) return critica;
  }

  await atualizar(
    "crc_clinics",
    [
      { coluna: "organization_id", op: "eq", valor: p.organizationId },
      { coluna: "id", op: "eq", valor: p.clinicId },
    ],
    { ativa: p.ativa, atualizado_em: agoraIso() },
  );

  /*
   * OS VÍNCULOS DE USUÁRIO NÃO SÃO APAGADOS ao desativar.
   *
   * Desativar é reversível; apagar o vínculo não é. Se a unidade reabrir em
   * março, quem atendia nela volta a atender — em vez de a organização ter de
   * redescobrir, pessoa por pessoa, quem estava onde.
   *
   * A unidade desativada some das telas de operação porque as consultas
   * filtram por `ativa = true`, e não porque o vínculo deixou de existir.
   */
  await auditar({
    organizationId: p.organizationId,
    userId: p.autorId,
    ator: "humano",
    acao: p.ativa ? "clinica_reativada" : "clinica_desativada",
    entityType: "crc_clinics",
    entityId: p.clinicId,
    antes: { ativa: atual.ativa !== false },
    depois: { ativa: p.ativa },
  });

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Escopo do usuário                                                          */
/* -------------------------------------------------------------------------- */

export type EscopoDoUsuario = {
  userId: string;
  papel: Papel;
  /** O que está GRAVADO em `crc_user_clinics`. */
  vinculadas: string[];
  /** O que a pessoa realmente alcança — para admin, todas. */
  efetivas: string[];
};

export async function lerEscopo(
  organizationId: string,
  userId: string,
): Promise<EscopoDoUsuario | null> {
  const usuario = await selecionarUm<{ id: string; papel: string }>("crc_users", {
    colunas: "id,papel",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "id", op: "eq", valor: userId },
    ],
  });
  if (usuario === null) return null;

  const [vinculos, todas] = await Promise.all([
    selecionar<{ clinic_id: string }>("crc_user_clinics", {
      colunas: "clinic_id",
      filtros: [{ coluna: "user_id", op: "eq", valor: userId }],
      limite: 200,
    }),
    selecionar<{ id: string }>("crc_clinics", {
      colunas: "id",
      filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
      limite: 200,
    }),
  ]);

  const papel = (PAPEIS as readonly string[]).includes(usuario.papel)
    ? (usuario.papel as Papel)
    : "crc";

  const vinculadas = vinculos.map((v) => v.clinic_id).filter((c) => c.length > 0);

  return {
    userId,
    papel,
    vinculadas,
    efetivas: escopoEfetivo(
      papel,
      vinculadas,
      todas.map((c) => c.id),
    ),
  };
}

/**
 * Grava quais unidades uma pessoa atende.
 *
 * ============================================================================
 *  A GRAVAÇÃO É "APAGA E INSERE", e não um `upsert` da lista inteira.
 *
 *  `crc_user_clinics` é uma tabela de ligação sem colunas próprias: a linha ou
 *  existe ou não existe. Não há nada a preservar numa linha antiga, então o
 *  risco do upsert de linha inteira (item B-7 — coluna omitida volta ao
 *  DEFAULT) não se aplica aqui.
 *
 *  O que importa é a ORDEM: apagar o que saiu antes de inserir o que entrou
 *  deixaria uma janela em que a pessoa não alcança nada. Insere primeiro,
 *  apaga depois — e o estado intermediário é "alcança demais por um instante",
 *  que é infinitamente melhor do que "foi trancada do lado de fora".
 * ============================================================================
 */
export async function definirEscopo(p: {
  organizationId: string;
  userId: string;
  clinicIds: readonly string[];
  autorId: string;
}): Promise<ResultadoClinica> {
  const atual = await lerEscopo(p.organizationId, p.userId);
  if (atual === null) return { ok: false, motivo: "Pessoa não encontrada." };

  /*
   * AS UNIDADES SÃO CONFERIDAS CONTRA A ORGANIZAÇÃO.
   *
   * Sem isto, um id de clínica de OUTRA organização entraria em
   * `crc_user_clinics` — e o `in` do filtro de tenant passaria a alcançar dado
   * alheio. É o item 71 aplicado à tabela de ligação: nada entra sem provar
   * que pertence aqui.
   */
  const pedidas = [...new Set(p.clinicIds)].filter((c) => c.length > 0);

  const validas =
    pedidas.length === 0
      ? []
      : (
          await selecionar<{ id: string }>("crc_clinics", {
            colunas: "id",
            filtros: [
              { coluna: "organization_id", op: "eq", valor: p.organizationId },
              { coluna: "id", op: "in", valor: pedidas },
            ],
            limite: 200,
          })
        ).map((c) => c.id);

  if (validas.length !== pedidas.length) {
    return {
      ok: false,
      motivo: "Uma das unidades escolhidas não pertence a esta organização.",
    };
  }

  const antes = new Set(atual.vinculadas);
  const depois = new Set(validas);

  const entram = validas.filter((c) => !antes.has(c));
  const saem = atual.vinculadas.filter((c) => !depois.has(c));

  if (entram.length === 0 && saem.length === 0) return { ok: true };

  // INSERE PRIMEIRO. Ver o bloco acima: a ordem é o que evita a janela em que
  // a pessoa não alcança nada.
  for (const clinicId of entram) {
    await inserir("crc_user_clinics", { user_id: p.userId, clinic_id: clinicId });
  }

  if (saem.length > 0) {
    const filtros: Filtro[] = [
      { coluna: "user_id", op: "eq", valor: p.userId },
      { coluna: "clinic_id", op: "in", valor: saem },
    ];
    await apagar("crc_user_clinics", filtros);
  }

  await auditar({
    organizationId: p.organizationId,
    userId: p.autorId,
    ator: "humano",
    acao: "escopo_de_clinicas_alterado",
    entityType: "crc_users",
    entityId: p.userId,
    antes: { clinicas: atual.vinculadas },
    depois: { clinicas: validas },
  });

  return { ok: true };
}
