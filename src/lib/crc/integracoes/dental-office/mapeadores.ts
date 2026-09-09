/**
 * A fronteira entre o payload do Dental Office e o modelo do CRC.
 *
 * Item 138: External DTO → Domain Model. Nada do formato bruto atravessa esta
 * linha. É o que permite trocar de fonte (API privada, CSV, outro sistema) sem
 * mexer em regra de negócio, e é onde o item 115 é cumprido — todo campo é
 * validado antes de virar dado nosso.
 *
 * A ASSIMETRIA DELIBERADA DESTE ARQUIVO: campo que sustenta REGRA é obrigatório
 * e sua ausência rejeita o registro; campo que é ROTULO é opcional e sua
 * ausência vira `null`. Um paciente sem gênero entra normalmente. Um
 * agendamento sem data não entra de jeito nenhum — ele alimentaria a detecção
 * de faltas com lixo.
 */
import {
  campo,
  dataHoraIso,
  dataIso,
  ehObjeto,
  lista,
  numeroOpcional,
  primeiroCampo,
  texto,
  textoOpcional,
  type Validacao,
} from "../../dominio/validar";
import { normalizarTelefone } from "../../dominio/telefone";
import {
  especialidadeDeCodigo,
  situacaoDeCodigo,
  statusAgendamentoDeCodigo,
  statusAgendamentoDeRotulo,
} from "../../dominio/status";
import type { SituacaoPaciente, SlotDisponivel, StatusAgendamento } from "../../dominio/tipos";

/* -------------------------------------------------------------------------- */
/* Paciente                                                                   */
/* -------------------------------------------------------------------------- */

export type PacienteExterno = {
  externalId: string;
  nome: string;
  nascimento: string | null;
  genero: string | null;
  situacao: SituacaoPaciente;
  especialidade: string | null;
  /**
   * O plano de saúde, quando o Dental Office informa.
   *
   * `null` é o caso esperado até a credencial chegar, e continua sendo o caso
   * se a API deles não devolver o campo — por isso nada no sistema exige que
   * ele exista.
   */
  convenio: string | null;
  ativo: boolean;
  telefone: string | null;
  telefoneBruto: string | null;
  email: string | null;
  clinicaExternaId: string | null;
};

export function mapearPaciente(bruto: unknown): Validacao<PacienteExterno> {
  if (!ehObjeto(bruto)) {
    return { ok: false, campo: "paciente", erro: "O registro não é um objeto." };
  }

  const id = texto(primeiroCampo(bruto, "id", "customer_id", "customerId", "codigo"), "id");
  if (!id.ok) return id;

  const nome = texto(primeiroCampo(bruto, "name", "nome", "full_name", "fullName"), "nome");
  if (!nome.ok) return nome;

  // Situação desconhecida NÃO rejeita o paciente: ele continua sendo um
  // paciente, só não entra em jornada que dependa da situação. Rejeitar aqui
  // faria a base do CRC ficar menor que a do Dental Office sem motivo.
  const situacao =
    situacaoDeCodigo(primeiroCampo(bruto, "situation", "customer_situation", "situacao")) ??
    "DESCONHECIDO";

  const { telefone, bruto: telefoneBruto } = extrairTelefone(bruto);

  return {
    ok: true,
    valor: {
      externalId: id.valor,
      nome: nome.valor,
      nascimento: dataIso(primeiroCampo(bruto, "birth_date", "birthDate", "nascimento")),
      genero: textoOpcional(primeiroCampo(bruto, "gender", "genero", "sexo")),
      situacao,
      especialidade: especialidadeDeCodigo(
        primeiroCampo(bruto, "specialty", "specialty_id", "especialidade"),
      ),
      // A lista de nomes é generosa de propósito, como no resto do mapper: não
      // sabemos como o Dental Office chama este campo, e descobrir custa uma
      // sincronização inteira. Tentar seis nomes custa nada.
      convenio: textoOpcional(
        primeiroCampo(
          bruto,
          "insurance",
          "health_plan",
          "healthPlan",
          "convenio",
          "convênio",
          "plano",
        ),
      ),
      // Item 114: a ausência do campo `active` não pode significar "inativo".
      // Um paciente marcado inativo por engano some da operação inteira.
      ativo: interpretarAtivo(primeiroCampo(bruto, "active", "ativo", "is_active")),
      telefone,
      telefoneBruto,
      email: normalizarEmail(primeiroCampo(bruto, "email", "e_mail", "mail")),
      clinicaExternaId: textoOpcional(primeiroCampo(bruto, "clinic_id", "clinicId", "clinica_id")),
    },
  };
}

function interpretarAtivo(valor: unknown): boolean {
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "number") return valor !== 0;
  if (typeof valor === "string") {
    const v = valor.trim().toLowerCase();
    if (v === "false" || v === "0" || v === "n" || v === "nao" || v === "não") return false;
    if (v === "true" || v === "1" || v === "s" || v === "sim") return true;
  }
  // Campo ausente: assume ativo. Ver o comentário na chamada.
  return true;
}

/**
 * O telefone pode estar em `phone`, em `contacts[]`, ou nos dois.
 *
 * A preferência é por CELULAR, porque é ele que recebe WhatsApp — mandar
 * mensagem para o telefone fixo da casa não falha com erro, simplesmente
 * nunca chega. Na dúvida entre dois celulares, vence o primeiro: escolher por
 * critério inventado seria pior do que escolher por ordem.
 */
function extrairTelefone(bruto: Record<string, unknown>): {
  telefone: string | null;
  bruto: string | null;
} {
  const candidatos: string[] = [];

  for (const chave of [
    "cell_phone",
    "cellPhone",
    "celular",
    "mobile",
    "whatsapp",
    "phone",
    "telefone",
  ]) {
    const v = textoOpcional(bruto[chave]);
    if (v !== null) candidatos.push(v);
  }

  // `contacts_attributes` é o nome real no Dental Office — ele aparece no
  // paciente aninhado dentro do agendamento. No paciente de topo os telefones
  // vêm soltos (`phone`, `cellphone`), e a varredura acima já os pega.
  for (const contato of lista(
    primeiroCampo(bruto, "contacts_attributes", "contacts", "contatos", "phones"),
  )) {
    if (!ehObjeto(contato)) {
      const direto = textoOpcional(contato);
      if (direto !== null) candidatos.push(direto);
      continue;
    }
    const v = textoOpcional(
      primeiroCampo(contato, "value", "number", "phone", "numero", "telefone", "contato"),
    );
    if (v !== null) candidatos.push(v);
  }

  // Celular primeiro: 13 dígitos canônicos com o 9 na frente do assinante.
  const normalizados = candidatos
    .map((c) => ({ bruto: c, canonico: normalizarTelefone(c) }))
    .filter((c): c is { bruto: string; canonico: string } => c.canonico !== null);

  const celular = normalizados.find((c) => c.canonico.length === 13);
  const escolhido = celular ?? normalizados[0];

  if (escolhido === undefined) {
    return { telefone: null, bruto: candidatos[0] ?? null };
  }
  return { telefone: escolhido.canonico, bruto: escolhido.bruto };
}

function normalizarEmail(valor: unknown): string | null {
  const v = textoOpcional(valor);
  if (v === null) return null;
  const limpo = v.toLowerCase();
  // Validação mínima de propósito: recusar e-mail estranho perderia contato
  // real, e o e-mail aqui não autentica ninguém — só serve para localizar.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(limpo) ? limpo : null;
}

/* -------------------------------------------------------------------------- */
/* Agendamento                                                                */
/* -------------------------------------------------------------------------- */

export type AgendamentoExterno = {
  externalId: string;
  pacienteExternoId: string | null;
  clinicaExternaId: string | null;
  dentistaExternoId: string | null;
  dentistaNome: string | null;
  cadeiraExternaId: string | null;
  inicioEm: string;
  fimEm: string | null;
  descricao: string | null;
  status: StatusAgendamento;
  statusExterno: string | null;
};

export function mapearAgendamento(
  bruto: unknown,
  fusoOffset = "-03:00",
): Validacao<AgendamentoExterno> {
  if (!ehObjeto(bruto)) {
    return { ok: false, campo: "agendamento", erro: "O registro não é um objeto." };
  }

  const id = texto(primeiroCampo(bruto, "id", "schedule_id", "scheduleId"), "id");
  if (!id.ok) return id;

  const inicio = dataHoraIso(
    primeiroCampo(
      bruto,
      // `schedule_start` primeiro: é o nome canônico na resposta do Dental
      // Office. O `start` também vem, como espelho para o calendário do front
      // deles — ler o canônico protege de o espelho sumir numa versão futura.
      "schedule_start",
      "start",
      "start_at",
      "startAt",
      "date_time",
      "dateTime",
      "data_hora",
      "inicio",
    ),
    fusoOffset,
  );
  if (inicio === null) {
    // Sem data não há agendamento. Este é o campo que sustenta a detecção de
    // falta, a confirmação e o cálculo de próxima consulta.
    return { ok: false, campo: "inicio", erro: "O agendamento veio sem data/hora reconhecível." };
  }

  /*
   * O RÓTULO PRIMEIRO, o número só como último recurso.
   *
   * A API deixa cada clínica CRIAR situações (`POST /schedule_situations`), o
   * que torna o `schedule_situation_id` instável entre clínicas — o "4" de uma
   * pode ser "Faltou" e o de outra, "Atendido". O `label` dentro de
   * `schedule_situation` é a categoria semântica do sistema deles, e essa não
   * muda.
   */
  const situacao = primeiroCampo(bruto, "schedule_situation", "situation_object");
  const rotulo = ehObjeto(situacao)
    ? primeiroCampo(situacao, "label", "slug")
    : primeiroCampo(bruto, "schedule_situation_label", "label");

  const codigoStatus = primeiroCampo(
    bruto,
    "schedule_situation_id",
    "status",
    "situation",
    "status_id",
    "situacao",
  );

  const status = statusAgendamentoDeRotulo(rotulo) ?? statusAgendamentoDeCodigo(codigoStatus);
  if (status === null) {
    // Aqui rejeitar É o certo. Chutar `TO_CONFIRM` num status desconhecido
    // colocaria o agendamento na fila de confirmação; chutar `MISSED` mandaria
    // mensagem de falta para quem compareceu.
    return {
      ok: false,
      campo: "status",
      erro: `Status de agenda desconhecido: ${JSON.stringify(rotulo ?? codigoStatus)}.`,
    };
  }

  return {
    ok: true,
    valor: {
      externalId: id.valor,
      pacienteExternoId: textoOpcional(
        primeiroCampo(
          bruto,
          "customer_id",
          "customerId",
          "patient_id",
          "paciente_id",
          "customer.id",
        ),
      ),
      clinicaExternaId: textoOpcional(primeiroCampo(bruto, "clinic_id", "clinicId", "clinica_id")),
      dentistaExternoId: textoOpcional(
        primeiroCampo(bruto, "dentist_id", "dentistId", "professional_id", "dentista_id"),
      ),
      // O Dental Office devolve o dentista aninhado (`dentist: { name }`); o
      // campo plano existe em algumas respostas. Os dois caminhos entram.
      dentistaNome: textoOpcional(
        primeiroCampo(bruto, "dentist_name", "dentistName", "dentista", "dentist.name"),
      ),
      cadeiraExternaId: textoOpcional(primeiroCampo(bruto, "chair_id", "chairId", "cadeira_id")),
      inicioEm: inicio,
      fimEm: dataHoraIso(
        primeiroCampo(bruto, "schedule_end", "end", "end_at", "endAt", "fim"),
        fusoOffset,
      ),
      descricao: textoOpcional(
        primeiroCampo(bruto, "description", "descricao", "observation", "observacao"),
      ),
      status,
      statusExterno: codigoStatus === undefined ? null : String(codigoStatus),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Horários disponíveis                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Normaliza a resposta de `available_hours` (item 19).
 *
 * O endpoint pode devolver instantes ou intervalos. Quando não há duração, os
 * 30 minutos assumidos ficam explícitos no modelo — a UI mostra o que assumiu,
 * em vez de exibir um horário de fim inventado como se fosse informação da
 * clínica.
 */
/**
 * Os horários livres, no formato REAL do Dental Office.
 *
 * A resposta vem AGRUPADA POR DIA, e não como uma lista plana:
 *
 *   [ { date: "2026-09-10",
 *       periods: [ { start_time, end_time, chair_id }, ... ] } ]
 *
 * A versão anterior deste mapeador procurava uma lista plana de `start`/`end`
 * e teria devolvido zero horários contra a API de verdade — sem erro, sem log,
 * só uma agenda que parecia sempre lotada. O formato plano continua aceito
 * porque o sandbox e eventuais respostas antigas o usam.
 *
 * A CADEIRA É O QUE MUDA A REGRA: cada período diz em qual cadeira ele está
 * livre, e criar a consulta exige esse id. Período sem cadeira é descartado —
 * ele não é agendável, e oferecê-lo ao paciente produziria uma recusa na hora
 * de confirmar.
 */
export function mapearSlots(
  corpo: unknown,
  contexto: { clinicId: string; dentistaExternoId: string; fusoOffset?: string },
): SlotDisponivel[] {
  const fuso = contexto.fusoOffset ?? "-03:00";

  const raiz = Array.isArray(corpo)
    ? corpo
    : lista(primeiroCampo(corpo, "data", "hours", "slots", "available_hours"));

  // Achata os dias em períodos. Um item sem `periods` é tratado como o próprio
  // período, que é o formato plano.
  const cruas: unknown[] = [];
  for (const item of raiz) {
    const periodos = ehObjeto(item) ? primeiroCampo(item, "periods", "hours", "periodos") : null;
    if (Array.isArray(periodos)) cruas.push(...periodos);
    else cruas.push(item);
  }

  const slots: SlotDisponivel[] = [];
  for (const item of cruas) {
    const inicioBruto = ehObjeto(item)
      ? primeiroCampo(item, "start_time", "start", "start_at", "hour", "time", "inicio", "datetime")
      : item;

    const inicio = dataHoraIso(inicioBruto, fuso);
    if (inicio === null) continue;

    const fimBruto = ehObjeto(item)
      ? primeiroCampo(item, "end_time", "end", "end_at", "fim")
      : undefined;
    const fim = dataHoraIso(fimBruto, fuso);

    const duracaoInformada = ehObjeto(item)
      ? numeroOpcional(primeiroCampo(item, "duration", "duration_minutes", "duracao"))
      : null;

    const duracaoMinutos =
      fim !== null
        ? Math.max(1, Math.round((Date.parse(fim) - Date.parse(inicio)) / 60000))
        : (duracaoInformada ?? 30);

    const cadeira = ehObjeto(item)
      ? textoOpcional(primeiroCampo(item, "chair_id", "chairId", "cadeira_id"))
      : null;
    // Sem cadeira o horário não pode virar consulta: a API exige o id no POST.
    if (cadeira === null) continue;

    slots.push({
      clinicId: contexto.clinicId,
      dentistaExternoId: contexto.dentistaExternoId,
      cadeiraExternaId: cadeira,
      inicioEm: inicio,
      fimEm: fim ?? new Date(Date.parse(inicio) + duracaoMinutos * 60000).toISOString(),
      duracaoMinutos,
    });
  }

  // Ordenados e sem repetição: a API devolve o mesmo horário uma vez por
  // cadeira livre, e mostrar "14:00" três vezes ao paciente parece defeito.
  // Fica a PRIMEIRA cadeira de cada horário — qualquer uma serve, e escolher
  // sempre a mesma torna o comportamento reproduzível.
  const vistos = new Set<string>();
  return slots
    .filter((s) => {
      if (vistos.has(s.inicioEm)) return false;
      vistos.add(s.inicioEm);
      return true;
    })
    .sort((a, b) => a.inicioEm.localeCompare(b.inicioEm));
}

/* -------------------------------------------------------------------------- */
/* Dentista e clínica                                                         */
/* -------------------------------------------------------------------------- */

export type DentistaExterno = { externalId: string; nome: string; ativo: boolean };

export function mapearDentista(bruto: unknown): Validacao<DentistaExterno> {
  if (!ehObjeto(bruto))
    return { ok: false, campo: "dentista", erro: "O registro não é um objeto." };

  const id = texto(primeiroCampo(bruto, "id", "dentist_id", "dentistId"), "id");
  if (!id.ok) return id;

  const nome = texto(primeiroCampo(bruto, "name", "nome", "full_name"), "nome");
  if (!nome.ok) return nome;

  return {
    ok: true,
    valor: {
      externalId: id.valor,
      nome: nome.valor,
      ativo: interpretarAtivo(primeiroCampo(bruto, "active", "ativo")),
    },
  };
}

export type ClinicaExterna = { externalId: string; nome: string };

export function mapearClinica(bruto: unknown): Validacao<ClinicaExterna> {
  if (!ehObjeto(bruto)) return { ok: false, campo: "clinica", erro: "O registro não é um objeto." };

  const id = texto(primeiroCampo(bruto, "id", "clinic_id", "clinicId"), "id");
  if (!id.ok) return id;

  const nome = texto(primeiroCampo(bruto, "name", "nome", "fantasy_name"), "nome");
  if (!nome.ok) return nome;

  return { ok: true, valor: { externalId: id.valor, nome: nome.valor } };
}

/* -------------------------------------------------------------------------- */
/* Paginação                                                                  */
/* -------------------------------------------------------------------------- */

export type Pagina = { itens: unknown[]; proximaPagina: number | null; total: number | null };

/**
 * Descobre se há mais páginas.
 *
 * O item 15 proíbe puxar a página 1 e declarar sincronização concluída. O
 * problema é que a API pode sinalizar continuação de três jeitos, e nenhum é
 * garantido. A regra de decisão, em ordem:
 *
 *   1. Metadados explícitos (`total_pages`, `last_page`, `has_more`).
 *   2. Total de registros comparado ao que já foi lido.
 *   3. Heurística: veio página cheia, então provavelmente há mais.
 *
 * A heurística sozinha é o que evita o pior caso — parar cedo e deixar
 * pacientes fora do CRC sem ninguém perceber. Ela custa uma requisição a mais
 * no fim de cada sincronização, que é barato perto disso.
 */
export function interpretarPagina(
  corpo: unknown,
  paginaAtual: number,
  tamanhoPagina: number,
): Pagina {
  const itens = Array.isArray(corpo)
    ? corpo
    : lista(primeiroCampo(corpo, "data", "items", "results", "content", "records"));

  const total = numeroOpcional(
    primeiroCampo(corpo, "total", "total_count", "totalCount", "meta.total", "pagination.total"),
  );

  const totalPaginas = numeroOpcional(
    primeiroCampo(
      corpo,
      "total_pages",
      "totalPages",
      "last_page",
      "meta.last_page",
      "pagination.total_pages",
    ),
  );

  if (totalPaginas !== null) {
    return { itens, proximaPagina: paginaAtual < totalPaginas ? paginaAtual + 1 : null, total };
  }

  const temMais =
    campo(corpo, "has_more") ?? campo(corpo, "hasMore") ?? campo(corpo, "has_next_page");
  if (typeof temMais === "boolean") {
    return { itens, proximaPagina: temMais ? paginaAtual + 1 : null, total };
  }

  if (total !== null) {
    const lidos = paginaAtual * tamanhoPagina;
    return { itens, proximaPagina: lidos < total ? paginaAtual + 1 : null, total };
  }

  return {
    itens,
    proximaPagina: itens.length >= tamanhoPagina ? paginaAtual + 1 : null,
    total: null,
  };
}
