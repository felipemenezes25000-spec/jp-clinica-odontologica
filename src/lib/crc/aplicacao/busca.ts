/**
 * Busca global — uma caixa, quatro lugares.
 *
 * O QUE ELA RESOLVE: quem atende tem o telefone na tela e o nome no ouvido, e
 * não sabe (nem deveria precisar saber) se aquilo é um paciente da base, um
 * lead que chegou ontem pelo anúncio, uma oportunidade aberta ou uma conversa
 * em andamento. Uma busca por aba obriga a pessoa a adivinhar a resposta antes
 * de fazer a pergunta.
 *
 * O TERMO DECIDE ONDE PROCURAR, e isso é mais importante do que parece:
 *
 *   Digitou número? É telefone. Buscar "11 98765" pelo NOME não devolve nada
 *   útil, e ainda gasta uma consulta com `ilike` numa tabela grande.
 *
 *   Digitou letra? É nome. A busca vai a paciente e lead pelo nome, e à
 *   conversa por duas portas: o paciente ligado a ela e o trecho da última
 *   mensagem — porque às vezes se lembra do assunto, e não de quem falou.
 *
 * O RECORTE DE SEGURANÇA NÃO É OPCIONAL. Toda consulta filtra por organização,
 * e o resultado é filtrado por clínica alcançável antes de sair daqui — busca
 * é justamente onde um vazamento entre unidades passaria despercebido, porque
 * ninguém confere de qual unidade veio o nome que apareceu na lista.
 */
import { normalizarTelefone, variacoesDeTelefone } from "../dominio/telefone";
import { selecionar } from "../servidor/banco";

/* -------------------------------------------------------------------------- */

export type TipoResultado = "paciente" | "lead" | "oportunidade" | "conversa";

export type ResultadoBusca = {
  tipo: TipoResultado;
  id: string;
  /** O id do paciente, quando existe — é por ele que a tela abre a ficha. */
  patientId: string | null;
  clinicId: string | null;
  titulo: string;
  /** A linha de baixo: o que distingue este resultado dos outros. */
  detalhe: string;
  /** Para ordenar os grupos entre si: mais recente primeiro. */
  em: string | null;
};

export type PanoramaDeBusca = {
  termo: string;
  /** `true` quando o termo foi lido como telefone. A tela diz isso. */
  porTelefone: boolean;
  resultados: ResultadoBusca[];
  /** Houve mais do que o limite? A tela pede um termo mais específico. */
  truncado: boolean;
};

const LIMITE_POR_GRUPO = 8;

/**
 * O termo é um telefone?
 *
 * Só conta como telefone se, tirados os separadores comuns, sobrar APENAS
 * dígito — e pelo menos quatro. "João 2" tem dígito e não é telefone; "9876"
 * é o final que a recepção digita quando o paciente lê o número em voz alta.
 */
function pareceTelefone(termo: string): boolean {
  const semSeparadores = termo.replace(/[\s()+.-]/gu, "");
  return semSeparadores.length >= 4 && /^\d+$/u.test(semSeparadores);
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function iso(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/* -------------------------------------------------------------------------- */

/**
 * Procura em pacientes, leads, oportunidades e conversas.
 *
 * DUAS ONDAS, e não quatro consultas soltas. Os pacientes vêm primeiro porque
 * oportunidade e conversa são encontradas ATRAVÉS deles; o resto vai em
 * paralelo, já que a busca é digitada e somar viagens em série é a diferença
 * entre uma caixa que responde enquanto se digita e uma que faz esperar.
 */
export async function buscarEmTudo(
  organizationId: string,
  termoBruto: string,
): Promise<PanoramaDeBusca> {
  const termo = termoBruto.trim().slice(0, 120);
  if (termo.length < 2) {
    return { termo, porTelefone: false, resultados: [], truncado: false };
  }

  const porTelefone = pareceTelefone(termo);
  const daOrg = { coluna: "organization_id", op: "eq" as const, valor: organizationId };

  // Os pacientes que casam saem PRIMEIRO e sozinhos, porque oportunidade e
  // conversa não têm nome próprio: as duas são encontradas pelo paciente.
  // Repetir essa consulta dentro de cada uma seria três vezes o mesmo trabalho.
  const pacientes = await buscarPacientes(daOrg, termo, porTelefone);
  const idsDePacientes = new Map(pacientes.map((r) => [r.id, r.titulo]));

  const [leads, oportunidades, conversas] = await Promise.all([
    buscarLeads(daOrg, termo, porTelefone),
    buscarOportunidades(daOrg, idsDePacientes),
    buscarConversas(daOrg, termo, porTelefone, idsDePacientes),
  ]);

  const resultados = [...pacientes, ...leads, ...oportunidades, ...conversas];

  // Paciente primeiro, sempre: é o que quem digita quase sempre quer. Dentro de
  // cada grupo, o mais recente na frente.
  const ordem: Readonly<Record<TipoResultado, number>> = {
    paciente: 0,
    conversa: 1,
    oportunidade: 2,
    lead: 3,
  };
  resultados.sort((a, b) => {
    const g = ordem[a.tipo] - ordem[b.tipo];
    if (g !== 0) return g;
    return (b.em ?? "").localeCompare(a.em ?? "");
  });

  return {
    termo,
    porTelefone,
    resultados,
    truncado: [pacientes, leads, oportunidades, conversas].some(
      (g) => g.length >= LIMITE_POR_GRUPO,
    ),
  };
}

/* -------------------------------------------------------------------------- */

type FiltroOrg = { coluna: string; op: "eq"; valor: string };

async function buscarPacientes(
  daOrg: FiltroOrg,
  termo: string,
  porTelefone: boolean,
): Promise<ResultadoBusca[]> {
  const filtros = porTelefone
    ? [daOrg, { coluna: "telefone", op: "like" as const, valor: `*${somenteDigitos(termo)}*` }]
    : [daOrg, { coluna: "nome", op: "ilike" as const, valor: `*${termo}*` }];

  const linhas = await selecionar("crc_patients", {
    colunas: "id,clinic_id,nome,telefone,situacao,ultima_consulta_em,proxima_consulta_em",
    filtros,
    limite: LIMITE_POR_GRUPO,
  });

  return linhas.map((l) => ({
    tipo: "paciente" as const,
    id: texto(l["id"]),
    patientId: texto(l["id"]),
    clinicId: iso(l["clinic_id"]),
    titulo: texto(l["nome"]),
    detalhe: detalheDoPaciente(l),
    em: iso(l["ultima_consulta_em"]),
  }));
}

function detalheDoPaciente(l: Record<string, unknown>): string {
  const partes: string[] = [];
  const situacao = texto(l["situacao"]);
  if (situacao.length > 0) partes.push(situacao.toLowerCase().replace(/_/gu, " "));
  if (iso(l["proxima_consulta_em"]) !== null) partes.push("tem consulta marcada");
  else if (iso(l["ultima_consulta_em"]) === null) partes.push("sem consulta registrada");
  return partes.join(" · ");
}

async function buscarLeads(
  daOrg: FiltroOrg,
  termo: string,
  porTelefone: boolean,
): Promise<ResultadoBusca[]> {
  const filtros = porTelefone
    ? [daOrg, { coluna: "telefone", op: "like" as const, valor: `*${somenteDigitos(termo)}*` }]
    : [daOrg, { coluna: "nome", op: "ilike" as const, valor: `*${termo}*` }];

  const linhas = await selecionar("crc_leads", {
    colunas: "id,clinic_id,patient_id,nome,telefone,origem,utm_campaign,criado_em",
    filtros,
    ordenar: [{ coluna: "criado_em", ascendente: false }],
    limite: LIMITE_POR_GRUPO,
  });

  return linhas.map((l) => {
    const campanha = texto(l["utm_campaign"]);
    const origem = texto(l["origem"]) || "origem desconhecida";
    return {
      tipo: "lead" as const,
      id: texto(l["id"]),
      // Um lead pode já ter virado paciente. Quando virou, a tela abre a ficha.
      patientId: iso(l["patient_id"]),
      clinicId: iso(l["clinic_id"]),
      titulo: texto(l["nome"]) || texto(l["telefone"]),
      detalhe: campanha.length > 0 ? `${origem.toLowerCase()} · ${campanha}` : origem.toLowerCase(),
      em: iso(l["criado_em"]),
    };
  });
}

/**
 * Oportunidades, encontradas pelos pacientes cujo nome casa.
 *
 * Recebe os pacientes já resolvidos em vez de procurá-los de novo: a mesma
 * consulta rodando três vezes por tecla digitada é o tipo de desperdício que
 * só aparece quando a base cresce.
 */
async function buscarOportunidades(
  daOrg: FiltroOrg,
  pacientes: ReadonlyMap<string, string>,
): Promise<ResultadoBusca[]> {
  if (pacientes.size === 0) return [];

  const linhas = await selecionar("crc_opportunities", {
    colunas: "id,clinic_id,patient_id,tipo,prioridade,fechada_em,motivo,criado_em",
    filtros: [
      daOrg,
      { coluna: "patient_id", op: "in", valor: [...pacientes.keys()] },
      // Oportunidade fechada não interessa a quem está buscando alguém para
      // atender agora. O histórico dela vive na ficha do paciente.
      { coluna: "fechada_em", op: "is", valor: null },
    ],
    ordenar: [{ coluna: "prioridade", ascendente: false }],
    limite: LIMITE_POR_GRUPO,
  });

  return linhas.map((l) => ({
    tipo: "oportunidade" as const,
    id: texto(l["id"]),
    patientId: iso(l["patient_id"]),
    clinicId: iso(l["clinic_id"]),
    titulo: pacientes.get(texto(l["patient_id"])) ?? "Paciente",
    detalhe: `${texto(l["tipo"]).toLowerCase().replace(/_/gu, " ")} · prioridade ${String(l["prioridade"] ?? 0)}`,
    em: iso(l["criado_em"]),
  }));
}

async function buscarConversas(
  daOrg: FiltroOrg,
  termo: string,
  porTelefone: boolean,
  pacientes: ReadonlyMap<string, string>,
): Promise<ResultadoBusca[]> {
  const colunas =
    "id,clinic_id,patient_id,contato_externo,status,resumo_ia,ultima_mensagem_em," +
    "ultima_mensagem_trecho,nao_lidas";

  // Por telefone, o casamento é EXATO sobre as variações normalizadas. `like`
  // num contato faria "5511988887777" casar com quem digitou "8888" — que é
  // outro paciente, e abrir a conversa errada é pior que não achar nenhuma.
  if (porTelefone) {
    const linhas = await selecionar("crc_conversations", {
      colunas,
      filtros: [daOrg, { coluna: "contato_externo", op: "in", valor: variacoes(termo) }],
      ordenar: [{ coluna: "ultima_mensagem_em", ascendente: false }],
      limite: LIMITE_POR_GRUPO,
    });
    return linhas.map((l) => converterConversa(l, pacientes));
  }

  // Por texto, duas portas de entrada, e a segunda é a que as pessoas usam
  // quando lembram do ASSUNTO e não do nome: "aquele que perguntou de
  // clareamento". O trecho da última mensagem é o que temos sem varrer a
  // tabela de mensagens inteira a cada tecla.
  const [porPaciente, porTrecho] = await Promise.all([
    pacientes.size === 0
      ? Promise.resolve([])
      : selecionar("crc_conversations", {
          colunas,
          filtros: [daOrg, { coluna: "patient_id", op: "in", valor: [...pacientes.keys()] }],
          ordenar: [{ coluna: "ultima_mensagem_em", ascendente: false }],
          limite: LIMITE_POR_GRUPO,
        }),
    selecionar("crc_conversations", {
      colunas,
      filtros: [daOrg, { coluna: "ultima_mensagem_trecho", op: "ilike", valor: `*${termo}*` }],
      ordenar: [{ coluna: "ultima_mensagem_em", ascendente: false }],
      limite: LIMITE_POR_GRUPO,
    }),
  ]);

  // A mesma conversa pode vir pelas duas portas.
  const vistas = new Set<string>();
  const saida: ResultadoBusca[] = [];
  for (const l of [...porPaciente, ...porTrecho]) {
    const id = texto(l["id"]);
    if (id.length === 0 || vistas.has(id)) continue;
    vistas.add(id);
    saida.push(converterConversa(l, pacientes));
  }
  return saida.slice(0, LIMITE_POR_GRUPO);
}

function converterConversa(
  l: Record<string, unknown>,
  pacientes: ReadonlyMap<string, string>,
): ResultadoBusca {
  const patientId = iso(l["patient_id"]);
  const nao = Number(l["nao_lidas"] ?? 0);
  const resumo = texto(l["resumo_ia"]) || texto(l["ultima_mensagem_trecho"]);

  return {
    tipo: "conversa",
    id: texto(l["id"]),
    patientId,
    clinicId: iso(l["clinic_id"]),
    // Conversa sem paciente ligado é justamente a que mais precisa aparecer na
    // busca: é alguém que escreveu e ainda não virou ficha.
    titulo:
      (patientId === null ? null : (pacientes.get(patientId) ?? null)) ??
      texto(l["contato_externo"]),
    detalhe: nao > 0 ? `${String(nao)} não lida(s) · ${resumo}` : resumo,
    em: iso(l["ultima_mensagem_em"]),
  };
}

function somenteDigitos(termo: string): string {
  return termo.replace(/\D+/gu, "");
}

function variacoes(termo: string): string[] {
  const normalizado = normalizarTelefone(termo);
  return normalizado === null ? [somenteDigitos(termo)] : [...variacoesDeTelefone(normalizado)];
}
