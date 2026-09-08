/**
 * Instalação inicial e semente de desenvolvimento — item 92.
 *
 * DUAS COISAS DIFERENTES, E A SEPARAÇÃO IMPORTA:
 *
 *   `instalar()` cria o que TODA organização precisa para funcionar:
 *   organização, clínica, etapas do funil, templates e as oito automações (em
 *   rascunho + simulação). Roda em produção, é idempotente, e não cria nenhum
 *   dado fictício.
 *
 *   `semearDesenvolvimento()` acrescenta pacientes e agendamentos de exemplo.
 *   NUNCA roda em produção — a trava está na função, e não em quem chama.
 *
 * O item 92 pede "nenhum dado real de paciente" na semente, e o inverso também
 * vale: nenhum dado FICTÍCIO na base real. Um paciente de teste no meio de 20
 * mil reais é o tipo de coisa que ninguém encontra depois, e que uma automação
 * eventualmente contata.
 *
 * A SENHA DO ADMIN NÃO É INVENTADA AQUI. Ela vem de `CRC_ADMIN_SENHA`, e sem
 * essa variável o usuário não é criado. Uma senha padrão em código seria uma
 * porta conhecida por qualquer pessoa que leia o repositório.
 */
import { ETAPAS_PADRAO } from "../dominio/rotulos";
import { semearAutomacoes } from "../automacao/catalogo";
import { semearTemplates } from "../automacao/templates";
import { gravar, inserirIgnorandoDuplicata, selecionarUm } from "./banco";
import { registrar } from "./registro";
import { criarUsuario } from "./sessao";

export type ResultadoInstalacao = {
  organizationId: string;
  clinicId: string;
  etapas: number;
  templates: number;
  automacoes: { criadas: number; existentes: number };
  usuarioAdmin: string;
  avisos: string[];
};

export async function instalar(opcoes: {
  nomeOrganizacao?: string;
  nomeClinica?: string;
  clinicaExternaId?: string;
}): Promise<ResultadoInstalacao> {
  const avisos: string[] = [];

  const slugOrg = "jp";
  const organizationId = await garantirOrganizacao(
    slugOrg,
    opcoes.nomeOrganizacao ?? "JP Clínica Integrada Odontológica",
  );

  const clinicId = await garantirClinica(
    organizationId,
    opcoes.nomeClinica ?? "JP Clínica Integrada Odontológica",
    opcoes.clinicaExternaId ?? null,
  );

  // As etapas do funil precisam existir antes de qualquer oportunidade: o
  // serviço de oportunidade procura "contato_pendente" para posicionar a nova.
  let etapas = 0;
  for (const e of ETAPAS_PADRAO) {
    await gravar(
      "crc_opportunity_stages",
      {
        organization_id: organizationId,
        chave: e.chave,
        nome: e.nome,
        ordem: e.ordem,
        categoria: e.categoria,
      },
      "organization_id,chave",
    );
    etapas += 1;
  }

  const templates = await semearTemplates(organizationId);
  const automacoes = await semearAutomacoes(organizationId);

  let usuarioAdmin = "";
  const email = (process.env["CRC_ADMIN_EMAIL"] ?? "").trim().toLowerCase();
  const senha = process.env["CRC_ADMIN_SENHA"] ?? "";

  if (email.length === 0 || senha.length === 0) {
    // Não é falha da instalação: o resto está pronto e o usuário pode ser
    // criado depois. Mas precisa aparecer, porque sem usuário ninguém entra.
    avisos.push(
      "Nenhum usuário administrador foi criado: defina CRC_ADMIN_EMAIL e CRC_ADMIN_SENHA no servidor e rode a instalação de novo.",
    );
  } else {
    const r = await criarUsuario({
      organizationId,
      nome: (process.env["CRC_ADMIN_NOME"] ?? "Administração").trim(),
      email,
      senha,
      papel: "admin",
      clinicIds: [clinicId],
    });
    if (r.ok) usuarioAdmin = email;
    else avisos.push(`Usuário administrador não criado: ${r.motivo}`);
  }

  registrar("info", "Instalação do CRC concluída.", {
    organizationId,
    clinicId,
    etapas,
    templates,
    automacoesCriadas: automacoes.criadas,
  });

  return { organizationId, clinicId, etapas, templates, automacoes, usuarioAdmin, avisos };
}

async function garantirOrganizacao(slug: string, nome: string): Promise<string> {
  const existente = await selecionarUm("crc_organizations", {
    colunas: "id",
    filtros: [{ coluna: "slug", op: "eq", valor: slug }],
  });
  if (existente !== null) return String(existente["id"] ?? "");

  const criadas = await gravar("crc_organizations", { nome, slug }, "slug");
  const id = criadas[0]?.["id"];
  if (typeof id !== "string") throw new Error("Não foi possível criar a organização.");
  return id;
}

async function garantirClinica(
  organizationId: string,
  nome: string,
  externalId: string | null,
): Promise<string> {
  const existente = await selecionarUm("crc_clinics", {
    colunas: "id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "slug", op: "eq", valor: "matriz" },
    ],
  });
  if (existente !== null) return String(existente["id"] ?? "");

  const criadas = await gravar(
    "crc_clinics",
    { organization_id: organizationId, nome, slug: "matriz", external_id: externalId, ativa: true },
    "organization_id,slug",
  );
  const id = criadas[0]?.["id"];
  if (typeof id !== "string") throw new Error("Não foi possível criar a clínica.");
  return id;
}

/* -------------------------------------------------------------------------- */
/* Semente de desenvolvimento                                                 */
/* -------------------------------------------------------------------------- */

const DIA = 86400_000;

/**
 * Pacientes e agenda fictícios, para exercitar as telas sem Dental Office.
 *
 * A TRAVA CONTRA PRODUÇÃO ESTÁ AQUI DENTRO, e não em quem chama. Se a decisão
 * dependesse do chamador, bastaria um endpoint novo esquecer a checagem para
 * dado fictício entrar na base real — e ele conviveria com pacientes de verdade
 * até alguém notar que "Maria Souza Lima" recebeu uma mensagem.
 *
 * Os nomes são obviamente fictícios e os telefones usam o prefixo 99999-000X,
 * que não existe. Mesmo assim, `opt_out_em` é preenchido em todos: nenhuma
 * automação pode contatá-los nem por engano.
 */
export async function semearDesenvolvimento(
  organizationId: string,
  clinicId: string,
): Promise<{ pacientes: number; agendamentos: number } | { recusado: string }> {
  if (process.env["NODE_ENV"] === "production") {
    return { recusado: "A semente de exemplo não roda em produção." };
  }

  const { criarSandbox } = await import("../integracoes/dental-office/sandbox");
  const cliente = criarSandbox();

  const lotePacientes = await cliente.listarPacientes({ pagina: 1, tamanho: 100 });
  let pacientes = 0;

  for (const p of lotePacientes.itens) {
    await gravar(
      "crc_patients",
      {
        organization_id: organizationId,
        clinic_id: clinicId,
        external_source: "sandbox",
        external_id: p.externalId,
        nome: p.nome,
        nascimento: p.nascimento,
        genero: p.genero,
        situacao: p.situacao,
        especialidade: p.especialidade,
        ativo: p.ativo,
        telefone: p.telefone,
        telefone_bruto: p.telefoneBruto,
        email: p.email,
        // Ver o comentário acima: exemplo NÃO recebe mensagem, nem por engano.
        opt_out_em: new Date().toISOString(),
        opt_out_motivo: "Paciente de exemplo — não contatar.",
        sincronizado_em: new Date().toISOString(),
      },
      "organization_id,external_source,external_id",
    );
    pacientes += 1;
  }

  const loteAgenda = await cliente.listarAgendamentos({
    de: new Date(Date.now() - 500 * DIA).toISOString(),
    ate: new Date(Date.now() + 60 * DIA).toISOString(),
    pagina: 1,
    tamanho: 200,
  });

  let agendamentos = 0;
  for (const a of loteAgenda.itens) {
    const paciente =
      a.pacienteExternoId === null
        ? null
        : await selecionarUm("crc_patients", {
            colunas: "id",
            filtros: [
              { coluna: "organization_id", op: "eq", valor: organizationId },
              { coluna: "external_source", op: "eq", valor: "sandbox" },
              { coluna: "external_id", op: "eq", valor: a.pacienteExternoId },
            ],
          });

    await gravar(
      "crc_appointments",
      {
        organization_id: organizationId,
        clinic_id: clinicId,
        patient_id: paciente === null ? null : String(paciente["id"] ?? ""),
        external_source: "sandbox",
        external_id: a.externalId,
        dentista_externo_id: a.dentistaExternoId,
        dentista_nome: a.dentistaNome,
        inicio_em: a.inicioEm,
        fim_em: a.fimEm,
        descricao: a.descricao,
        status: a.status,
        sincronizado_em: new Date().toISOString(),
      },
      "organization_id,external_source,external_id",
    );
    agendamentos += 1;
  }

  // O espelho de consultas precisa ser recalculado, senão a Home mostra todo
  // mundo "sem consulta futura" e o Paulo (que tem uma marcada) apareceria na
  // fila indevidamente.
  const { atualizarEspelhoDeConsultas } = await import("../aplicacao/sincronizacao");
  const { selecionar } = await import("./banco");
  const todos = await selecionar("crc_patients", {
    colunas: "id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "external_source", op: "eq", valor: "sandbox" },
    ],
  });

  for (const linha of todos) {
    await atualizarEspelhoDeConsultas(organizationId, String(linha["id"] ?? ""), new Date());
  }

  registrar("aviso", "Semente de EXEMPLO instalada. Estes pacientes não são reais.", {
    organizationId,
    pacientes,
    agendamentos,
  });

  return { pacientes, agendamentos };
}

/** Marca a instalação como feita, para a rota não repetir trabalho à toa. */
export async function jaInstalado(): Promise<boolean> {
  const org = await selecionarIgnorandoErro();
  return org;
}

async function selecionarIgnorandoErro(): Promise<boolean> {
  try {
    const linha = await selecionarUm("crc_organizations", { colunas: "id", limite: 1 });
    return linha !== null;
  } catch {
    // Banco sem o schema aplicado ainda. Não é erro da instalação — é o
    // estado esperado antes de rodar `02-crc-schema.sql`.
    return false;
  }
}

export { inserirIgnorandoDuplicata };
