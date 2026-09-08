/**
 * Leads — itens 33 (atribuição), 157/158 (speed to lead), 170 (distribuição).
 *
 * O QUE É UM LEAD AQUI: alguém que demonstrou interesse e ainda não é paciente.
 * Ele vira paciente quando aparece na base do Dental Office; até lá, vive em
 * `crc_leads` com a origem preservada.
 *
 * A COISA MAIS IMPORTANTE DESTE MÓDULO É O RELÓGIO.
 *
 * O item 158 chama isso de speed to lead, e em tráfego pago é a métrica que
 * mais move resultado: responder em cinco minutos e responder em duas horas são
 * negócios diferentes com o mesmo investimento de mídia. Por isso
 * `primeira_resposta_em` é gravado UMA vez, no primeiro contato humano ou
 * automático, e nunca sobrescrito — sobrescrever transformaria a métrica em
 * "tempo até a última mensagem", que não mede nada.
 *
 * A ATRIBUIÇÃO É GRAVADA NA ENTRADA (item 60), e não deduzida depois. UTM,
 * gclid e fbclid só existem no momento em que a pessoa chega; perder isso
 * significa nunca conseguir dizer qual campanha trouxe qual paciente.
 */
import { normalizarTelefone } from "../dominio/telefone";
import {
  atualizar,
  contar,
  inserirIgnorandoDuplicata,
  selecionar,
  selecionarUm,
  type Linha,
} from "../servidor/banco";
import { auditar, registrar } from "../servidor/registro";

import { emitir } from "./eventos";
import { criarOportunidade } from "./oportunidades";

/* -------------------------------------------------------------------------- */
/* Origem e atribuição                                                        */
/* -------------------------------------------------------------------------- */

export type OrigemLead =
  | "GOOGLE"
  | "META"
  | "INSTAGRAM"
  | "WHATSAPP"
  | "SITE"
  | "INDICACAO"
  | "ORGANICO"
  | "BASE_EXISTENTE"
  | "DESCONHECIDA";

export type Atribuicao = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  fbclid: string | null;
  landingPage: string | null;
};

/**
 * Deduz a origem a partir do que veio na URL.
 *
 * A ORDEM É DELIBERADA: o identificador de clique (`gclid`, `fbclid`) vence o
 * `utm_source`, porque ele é posto pela própria plataforma e não pode ser
 * digitado errado por quem montou a campanha. UTM é convenção humana, e humano
 * escreve "Google", "google" e "gogle".
 */
export function deduzirOrigem(a: Atribuicao): OrigemLead {
  if (a.gclid !== null && a.gclid.length > 0) return "GOOGLE";
  if (a.fbclid !== null && a.fbclid.length > 0) return "META";

  const fonte = (a.utmSource ?? "").toLowerCase();
  if (fonte.includes("google")) return "GOOGLE";
  if (fonte.includes("insta")) return "INSTAGRAM";
  if (fonte.includes("face") || fonte.includes("meta") || fonte.includes("fb")) return "META";
  if (fonte.includes("whats") || fonte.includes("wa")) return "WHATSAPP";
  if (fonte.includes("indic")) return "INDICACAO";

  // Veio do site sem parâmetro nenhum: é orgânico ou tráfego direto. Os dois
  // são "não pagou por este clique", que é a distinção que importa no
  // relatório.
  if (a.landingPage !== null && a.landingPage.length > 0) return "ORGANICO";

  return "DESCONHECIDA";
}

/**
 * Extrai a atribuição de uma URL.
 *
 * Usada pelo formulário do site: a página manda a própria URL, e daqui saem os
 * campos. Ela nunca lança — uma URL malformada produz atribuição vazia, e
 * perder a origem é muito melhor do que perder o lead.
 */
export function lerAtribuicao(url: string | null): Atribuicao {
  const vazia: Atribuicao = {
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    gclid: null,
    fbclid: null,
    landingPage: null,
  };
  if (url === null || url.length === 0) return vazia;

  try {
    const u = new URL(url);
    const p = (chave: string): string | null => {
      const v = u.searchParams.get(chave);
      return v !== null && v.trim().length > 0 ? v.trim().slice(0, 200) : null;
    };

    return {
      utmSource: p("utm_source"),
      utmMedium: p("utm_medium"),
      utmCampaign: p("utm_campaign"),
      utmContent: p("utm_content"),
      utmTerm: p("utm_term"),
      gclid: p("gclid"),
      fbclid: p("fbclid"),
      // Só caminho, sem querystring: a querystring já foi decomposta acima, e
      // guardá-la de novo duplicaria dado pessoal quando alguém puser o
      // telefone num parâmetro.
      landingPage: u.pathname.slice(0, 300),
    };
  } catch {
    return vazia;
  }
}

/* -------------------------------------------------------------------------- */
/* Criação                                                                    */
/* -------------------------------------------------------------------------- */

export type NovoLead = {
  organizationId: string;
  clinicId: string | null;
  nome: string;
  telefone: string | null;
  email: string | null;
  atribuicao: Atribuicao;
  /** Texto livre do formulário, quando houver. */
  mensagem?: string | null;
};

export type ResultadoLead =
  | { criado: true; leadId: string; opportunityId: string | null }
  | { criado: false; motivo: "duplicado" | "sem_contato" };

/**
 * Registra um lead novo e abre a oportunidade.
 *
 * A DEDUPLICAÇÃO É POR TELEFONE + DIA. Quem preenche o formulário duas vezes em
 * dez minutos — porque não viu a confirmação — não pode virar dois leads e duas
 * ligações. Mas quem volta duas semanas depois É um lead novo: o interesse
 * ressurgiu, e tratar como duplicata perderia a segunda intenção.
 */
export async function registrarLead(dados: NovoLead): Promise<ResultadoLead> {
  const telefone = normalizarTelefone(dados.telefone);
  const email = (dados.email ?? "").trim().toLowerCase();

  if (telefone === null && email.length === 0) {
    // Sem forma de responder, não é lead — é um registro que nunca vira nada.
    return { criado: false, motivo: "sem_contato" };
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const chaveDedupe = `${telefone ?? email}:${hoje}`;

  const linha = await inserirIgnorandoDuplicata("crc_leads", {
    organization_id: dados.organizationId,
    clinic_id: dados.clinicId,
    nome: dados.nome.trim().slice(0, 200),
    telefone,
    email: email.length > 0 ? email : null,
    origem: deduzirOrigem(dados.atribuicao),
    utm_source: dados.atribuicao.utmSource,
    utm_medium: dados.atribuicao.utmMedium,
    utm_campaign: dados.atribuicao.utmCampaign,
    utm_content: dados.atribuicao.utmContent,
    utm_term: dados.atribuicao.utmTerm,
    gclid: dados.atribuicao.gclid,
    fbclid: dados.atribuicao.fbclid,
    landing_page: dados.atribuicao.landingPage,
    chave_dedupe: chaveDedupe,
  });

  if (linha === null) return { criado: false, motivo: "duplicado" };

  const leadId = String(linha["id"] ?? "");

  await emitir({
    organizationId: dados.organizationId,
    clinicId: dados.clinicId ?? null,
    tipo: "lead.created",
    entityType: "lead",
    entityId: leadId,
    payload: {
      leadId,
      nome: dados.nome,
      origem: deduzirOrigem(dados.atribuicao),
      mensagem: dados.mensagem ?? null,
    },
    fingerprint: `lead.created:${leadId}`,
  });

  // A oportunidade nasce junto: sem ela o lead não aparece na fila de ninguém,
  // e o item 10 do Mega Prompt é explícito que lead novo deve ser respondido
  // imediatamente.
  let opportunityId: string | null = null;
  if (dados.clinicId !== null) {
    const r = await criarOportunidade({
      organizationId: dados.organizationId,
      clinicId: dados.clinicId,
      patientId: null,
      leadId,
      tipo: "NEW_LEAD",
      motivo:
        dados.mensagem !== null && dados.mensagem !== undefined && dados.mensagem.length > 0
          ? `Lead novo: "${dados.mensagem.slice(0, 120)}"`
          : "Lead novo aguardando primeiro contato.",
      chaveDedupe: `NEW_LEAD:${leadId}`,
      origem: deduzirOrigem(dados.atribuicao),
      assignedTo: await proximoResponsavel(dados.organizationId),
      ator: "automacao",
    });
    opportunityId = r.oportunidade?.id ?? null;
  }

  registrar("info", "Lead registrado.", {
    organizationId: dados.organizationId,
    leadId,
    origem: deduzirOrigem(dados.atribuicao),
  });

  return { criado: true, leadId, opportunityId };
}

/* -------------------------------------------------------------------------- */
/* Distribuição (item 170)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Quem recebe o próximo lead.
 *
 * ESTRATÉGIA: menos carregado, e não round-robin puro. Round-robin distribui
 * igual e ignora que uma pessoa pode estar com quinze oportunidades abertas
 * enquanto outra tem duas — e lead que cai numa fila cheia demora a ser
 * respondido, que é exatamente o que o item 158 mede.
 *
 * Devolve `null` quando não há ninguém elegível. Nesse caso a oportunidade
 * nasce sem dono e aparece na fila de "sem responsável" de todo mundo — o que
 * é melhor do que atribuir a alguém inativo e ela sumir.
 */
export async function proximoResponsavel(organizationId: string): Promise<string | null> {
  const candidatos = await selecionar("crc_users", {
    colunas: "id,papel",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "ativo", op: "eq", valor: true },
      { coluna: "papel", op: "in", valor: ["crc", "recepcao"] },
    ],
    limite: 50,
  });

  if (candidatos.length === 0) return null;

  let escolhido: string | null = null;
  let menor = Number.POSITIVE_INFINITY;

  for (const c of candidatos) {
    const userId = String(c["id"] ?? "");
    if (userId.length === 0) continue;

    const carga = await contar("crc_opportunities", [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "assigned_to", op: "eq", valor: userId },
      { coluna: "fechada_em", op: "is", valor: null },
    ]);

    if (carga < menor) {
      menor = carga;
      escolhido = userId;
    }
  }

  return escolhido;
}

/* -------------------------------------------------------------------------- */
/* Speed to lead (itens 157, 158)                                             */
/* -------------------------------------------------------------------------- */

/**
 * Marca o instante da PRIMEIRA resposta ao lead.
 *
 * O filtro `primeira_resposta_em is null` no UPDATE é o que torna isto correto
 * e barato ao mesmo tempo: só a primeira gravação passa, e não é preciso ler
 * antes de escrever. Sem ele, cada mensagem enviada reescreveria o carimbo e a
 * métrica viraria "tempo até a última mensagem" — que não mede nada.
 *
 * Chamado pelo serviço de mensagens em todo envio para um lead.
 */
export async function marcarPrimeiraResposta(
  organizationId: string,
  leadId: string,
  quando = new Date(),
): Promise<void> {
  await atualizar(
    "crc_leads",
    [
      { coluna: "id", op: "eq", valor: leadId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "primeira_resposta_em", op: "is", valor: null },
    ],
    { primeira_resposta_em: quando.toISOString(), atualizado_em: quando.toISOString() },
  );
}

/**
 * Encontra o lead ainda não respondido de um telefone.
 *
 * Usado quando alguém responde por WhatsApp: a conversa pode não ter paciente
 * ligado ainda, mas ter um lead esperando — e é esse lead que precisa do
 * carimbo de primeira resposta.
 */
export async function leadPendentePorTelefone(
  organizationId: string,
  telefone: string,
): Promise<string | null> {
  const linha = await selecionarUm("crc_leads", {
    colunas: "id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "telefone", op: "eq", valor: telefone },
      { coluna: "primeira_resposta_em", op: "is", valor: null },
    ],
    ordenar: [{ coluna: "criado_em", ascendente: false }],
  });

  const id = linha?.["id"];
  return typeof id === "string" ? id : null;
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                    */
/* -------------------------------------------------------------------------- */

export async function listarLeads(organizationId: string, limite = 50): Promise<Linha[]> {
  return selecionar("crc_leads", {
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
    ordenar: [{ coluna: "criado_em", ascendente: false }],
    limite,
  });
}

/**
 * Liga um lead a um paciente que apareceu na base.
 *
 * Acontece quando o lead vira paciente de verdade: a sincronização traz o
 * cadastro e alguém (ou o casamento por telefone) faz a ligação. Preserva o
 * lead em vez de apagá-lo — é ele que carrega a origem, e sem ela a atribuição
 * de receita fica sem de onde vir.
 */
export async function vincularLeadAoPaciente(
  organizationId: string,
  leadId: string,
  patientId: string,
  userId: string | null,
): Promise<void> {
  await atualizar(
    "crc_leads",
    [
      { coluna: "id", op: "eq", valor: leadId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { patient_id: patientId, atualizado_em: new Date().toISOString() },
  );

  await auditar({
    organizationId,
    userId,
    ator: userId === null ? "automacao" : "humano",
    acao: "lead.vinculado_ao_paciente",
    entityType: "lead",
    entityId: leadId,
    depois: { patientId },
  });
}
