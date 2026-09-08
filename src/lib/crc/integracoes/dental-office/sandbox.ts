/**
 * O Dental Office de mentira, para desenvolvimento e teste.
 *
 * POR QUE ELE EXISTE (item 239)
 * As credenciais do Dental Office ainda não foram fornecidas. Sem um adapter de
 * sandbox, o único jeito de exercitar o fluxo do item 49 — falta detectada →
 * evento → oportunidade → jornada → mensagem → resposta → agendamento — seria
 * esperar a credencial. Com ele, o motor inteiro roda hoje, e trocar de adapter
 * no dia em que a credencial chegar não muda uma linha do domínio.
 *
 * O QUE ELE NÃO É: não é mock de teste, e não é "entrega". O item 3 do contrato
 * é claro que mock não pode alimentar página de produção. Duas travas garantem
 * isso: `criarClienteDentalOffice` só o instancia com `DENTAL_OFFICE_SANDBOX=1`
 * **e** fora de produção, e o `nome` dele é `"sandbox"` — a tela de integrações
 * mostra esse rótulo em amarelo, e a sincronização o grava no log.
 *
 * DADOS DETERMINÍSTICOS, E NÃO ALEATÓRIOS. Um gerador com `Math.random` produz
 * um cenário diferente a cada execução, e teste que muda sozinho não prova nada.
 * As datas são relativas ao "agora" porque o que importa é a POSIÇÃO no tempo
 * (faltou ontem, sumiu há sete meses), não a data absoluta.
 */
import type { SlotDisponivel, StatusAgendamento } from "../../dominio/tipos";

import type { LoteMapeado, PortaDentalOffice } from "./cliente";
import type {
  AgendamentoExterno,
  ClinicaExterna,
  DentistaExterno,
  PacienteExterno,
} from "./mapeadores";

const DIA = 24 * 60 * 60 * 1000;

function diasAtras(dias: number, hora = 14): string {
  const d = new Date(Date.now() - dias * DIA);
  d.setUTCHours(hora, 0, 0, 0);
  return d.toISOString();
}

function diasAFrente(dias: number, hora = 14): string {
  return diasAtras(-dias, hora);
}

/**
 * A base fictícia.
 *
 * Cada paciente existe para exercitar UMA situação do contrato:
 *   1 faltou ontem e não remarcou       → item 49 (fluxo E2E do faltante)
 *   2 cancelou e não remarcou           → item 51
 *   3 sumiu há 7 meses                  → item 52 (recall)
 *   4 abandonou o tratamento            → situação 7 do Dental Office
 *   5 tem consulta amanhã por confirmar → item 50 (confirmação)
 *   6 faz aniversário hoje              → item 53
 *   7 sem telefone                      → a recusa por telefone ausente
 *   8 consulta futura marcada           → o caso que NÃO gera oportunidade
 */
const PACIENTES: PacienteExterno[] = [
  {
    externalId: "do-1001",
    nome: "Maria Souza Lima",
    nascimento: "1985-04-12",
    genero: "F",
    situacao: "EM_TRATAMENTO",
    especialidade: "Implantodontia",
    ativo: true,
    telefone: "5511999990001",
    telefoneBruto: "(11) 99999-0001",
    email: "maria.exemplo@exemplo.test",
    clinicaExternaId: "clin-1",
  },
  {
    externalId: "do-1002",
    nome: "João Santos Oliveira",
    nascimento: "1979-11-30",
    genero: "M",
    situacao: "EM_TRATAMENTO",
    especialidade: "Ortodontia",
    ativo: true,
    telefone: "5511999990002",
    telefoneBruto: "(11) 99999-0002",
    email: null,
    clinicaExternaId: "clin-1",
  },
  {
    externalId: "do-1003",
    nome: "Ana Lima Ferreira",
    nascimento: "1992-07-08",
    genero: "F",
    situacao: "CONCLUIDO",
    especialidade: "Periodontia",
    ativo: true,
    telefone: "5511999990003",
    telefoneBruto: "(11) 99999-0003",
    email: null,
    clinicaExternaId: "clin-1",
  },
  {
    externalId: "do-1004",
    nome: "Carlos Eduardo Prado",
    nascimento: "1968-02-19",
    genero: "M",
    situacao: "ABANDONO",
    especialidade: "Prótese",
    ativo: true,
    telefone: "5511999990004",
    telefoneBruto: "(11) 99999-0004",
    email: null,
    clinicaExternaId: "clin-1",
  },
  {
    externalId: "do-1005",
    nome: "Beatriz Nogueira",
    nascimento: "1996-09-25",
    genero: "F",
    situacao: "PRIMEIRA_CONSULTA",
    especialidade: "Endodontia",
    ativo: true,
    telefone: "5511999990005",
    telefoneBruto: "(11) 99999-0005",
    email: null,
    clinicaExternaId: "clin-1",
  },
  {
    externalId: "do-1006",
    nome: "Roberto Almeida",
    // Aniversário hoje: a data é montada na criação do adapter.
    nascimento: null,
    genero: "M",
    situacao: "ALTA",
    especialidade: "Cirurgia",
    ativo: true,
    telefone: "5511999990006",
    telefoneBruto: "(11) 99999-0006",
    email: null,
    clinicaExternaId: "clin-1",
  },
  {
    externalId: "do-1007",
    nome: "Fernanda Costa",
    nascimento: "1988-01-15",
    genero: "F",
    situacao: "EM_TRATAMENTO",
    especialidade: null,
    ativo: true,
    // De propósito: exercita a recusa por telefone ausente.
    telefone: null,
    telefoneBruto: "não informado",
    email: null,
    clinicaExternaId: "clin-1",
  },
  {
    externalId: "do-1008",
    nome: "Paulo Henrique Dias",
    nascimento: "1975-06-03",
    genero: "M",
    situacao: "EM_TRATAMENTO",
    especialidade: "Implantodontia",
    ativo: true,
    telefone: "5511999990008",
    telefoneBruto: "(11) 99999-0008",
    email: null,
    clinicaExternaId: "clin-1",
  },
];

function montarAgendamentos(): AgendamentoExterno[] {
  const base = (
    id: string,
    paciente: string,
    inicioEm: string,
    status: StatusAgendamento,
    descricao: string,
  ): AgendamentoExterno => ({
    externalId: id,
    pacienteExternoId: paciente,
    clinicaExternaId: "clin-1",
    dentistaExternoId: "dent-1",
    dentistaNome: "Dra. Juliana Pelisser",
    cadeiraExternaId: "cad-1",
    inicioEm,
    fimEm: new Date(Date.parse(inicioEm) + 40 * 60000).toISOString(),
    descricao,
    status,
    statusExterno: null,
  });

  return [
    // Maria faltou ontem e não remarcou. É o caso do item 49.
    base("ag-2001", "do-1001", diasAtras(1, 13), "MISSED", "Retorno de implante"),
    base("ag-2002", "do-1001", diasAtras(35, 15), "COMPLETED", "Instalação de implante"),

    // João cancelou hoje de manhã e não remarcou. Item 51.
    base("ag-2003", "do-1002", diasAtras(0, 11), "CANCELLED", "Manutenção de aparelho"),
    base("ag-2004", "do-1002", diasAtras(60, 10), "COMPLETED", "Manutenção de aparelho"),

    // Ana sumiu há sete meses. Item 52.
    base("ag-2005", "do-1003", diasAtras(212, 9), "COMPLETED", "Limpeza"),

    // Carlos abandonou o tratamento há quatro meses.
    base("ag-2006", "do-1004", diasAtras(124, 16), "COMPLETED", "Moldagem de prótese"),

    // Beatriz tem consulta amanhã, ainda por confirmar. Item 50.
    base("ag-2007", "do-1005", diasAFrente(1, 12), "TO_CONFIRM", "Avaliação"),

    // Roberto teve alta há muito tempo. Só o aniversário o traz de volta.
    base("ag-2008", "do-1006", diasAtras(400, 14), "COMPLETED", "Extração"),

    // Fernanda: sem telefone, faltou. Nenhuma mensagem pode sair para ela.
    base("ag-2009", "do-1007", diasAtras(2, 10), "MISSED", "Consulta de rotina"),

    // Paulo já tem consulta marcada: NÃO deve virar oportunidade.
    base("ag-2010", "do-1008", diasAtras(20, 14), "COMPLETED", "Avaliação"),
    base("ag-2011", "do-1008", diasAFrente(9, 15), "CONFIRMED", "Cirurgia de implante"),
  ];
}

class SandboxDentalOffice implements PortaDentalOffice {
  readonly nome = "sandbox" as const;

  private readonly pacientes: PacienteExterno[];
  private readonly agendamentos: AgendamentoExterno[];
  /** Agendamentos criados durante a sessão, para o fluxo E2E fechar o ciclo. */
  private proximoId = 9000;

  constructor() {
    const hoje = new Date();
    this.pacientes = PACIENTES.map((p) =>
      p.externalId === "do-1006"
        ? {
            ...p,
            // Aniversário HOJE, para a jornada do item 53 poder ser exercitada
            // em qualquer dia do ano em que alguém rodar o projeto.
            nascimento: `1970-${String(hoje.getUTCMonth() + 1).padStart(2, "0")}-${String(
              hoje.getUTCDate(),
            ).padStart(2, "0")}`,
          }
        : p,
    );
    this.agendamentos = montarAgendamentos();
  }

  testarConexao(): Promise<{ ok: boolean; detalhe: string }> {
    return Promise.resolve({
      ok: true,
      detalhe: "Sandbox local — nenhuma chamada externa foi feita.",
    });
  }

  listarClinicas(): Promise<ClinicaExterna[]> {
    return Promise.resolve([{ externalId: "clin-1", nome: "JP Clínica Integrada Odontológica" }]);
  }

  listarDentistas(): Promise<DentistaExterno[]> {
    return Promise.resolve([
      { externalId: "dent-1", nome: "Dra. Juliana Pelisser", ativo: true },
      { externalId: "dent-2", nome: "Dr. Hugo Leonardo", ativo: true },
    ]);
  }

  listarPacientes(opcoes: {
    pagina: number;
    tamanho: number;
  }): Promise<LoteMapeado<PacienteExterno>> {
    return Promise.resolve(this.paginar(this.pacientes, opcoes.pagina, opcoes.tamanho));
  }

  listarAgendamentos(opcoes: {
    de: string;
    ate: string;
    pagina: number;
    tamanho: number;
  }): Promise<LoteMapeado<AgendamentoExterno>> {
    const de = Date.parse(opcoes.de);
    const ate = Date.parse(opcoes.ate);
    const dentro = this.agendamentos.filter((a) => {
      const t = Date.parse(a.inicioEm);
      return t >= de && t <= ate;
    });
    return Promise.resolve(this.paginar(dentro, opcoes.pagina, opcoes.tamanho));
  }

  obterAgendamento(_clinica: string, externalId: string): Promise<AgendamentoExterno | null> {
    return Promise.resolve(this.agendamentos.find((a) => a.externalId === externalId) ?? null);
  }

  /**
   * Horários de exemplo em dias úteis, das 9h às 17h, de meia em meia hora.
   *
   * Remove o que já está ocupado nos agendamentos fictícios — sem isso o
   * sandbox ofereceria um horário e recusaria a criação nele, o que faria
   * parecer bug no fluxo de agendamento.
   */
  horariosDisponiveis(opcoes: {
    dentistaExternoId: string;
    de: string;
    ate: string;
    clinicId: string;
  }): Promise<SlotDisponivel[]> {
    const ocupados = new Set(
      this.agendamentos
        .filter((a) => a.status !== "CANCELLED" && a.dentistaExternoId === opcoes.dentistaExternoId)
        .map((a) => a.inicioEm),
    );

    const slots: SlotDisponivel[] = [];
    const de = new Date(Date.parse(opcoes.de));
    const ate = Date.parse(opcoes.ate);

    for (let d = new Date(de); d.getTime() <= ate; d = new Date(d.getTime() + DIA)) {
      const diaSemana = d.getUTCDay();
      if (diaSemana === 0) continue; // domingo fechado

      for (let h = 12; h <= 20; h += 1) {
        // 12h..20h UTC ≈ 9h..17h em São Paulo.
        for (const minuto of [0, 30]) {
          const inicio = new Date(d);
          inicio.setUTCHours(h, minuto, 0, 0);
          if (inicio.getTime() < Date.now()) continue;

          const iso = inicio.toISOString();
          if (ocupados.has(iso)) continue;

          slots.push({
            clinicId: opcoes.clinicId,
            dentistaExternoId: opcoes.dentistaExternoId,
            inicioEm: iso,
            fimEm: new Date(inicio.getTime() + 30 * 60000).toISOString(),
            duracaoMinutos: 30,
          });
        }
      }
    }

    return Promise.resolve(slots.slice(0, 40));
  }

  criarAgendamento(dados: {
    pacienteExternoId: string;
    dentistaExternoId: string;
    inicioEm: string;
    duracaoMinutos: number;
    descricao?: string;
  }): Promise<
    | { ok: true; externalId: string }
    | { ok: false; codigo: "SLOT_OCUPADO" | "RECUSADO"; detalhe: string }
  > {
    // Item 21: revalidação de verdade, inclusive no sandbox. Se o fluxo de
    // agendamento tem um bug de concorrência, ele precisa aparecer aqui.
    const ocupado = this.agendamentos.some(
      (a) =>
        a.inicioEm === dados.inicioEm &&
        a.dentistaExternoId === dados.dentistaExternoId &&
        a.status !== "CANCELLED",
    );
    if (ocupado) {
      return Promise.resolve({
        ok: false,
        codigo: "SLOT_OCUPADO",
        detalhe: "Este horário acabou de ser ocupado.",
      });
    }

    this.proximoId += 1;
    const externalId = `ag-${String(this.proximoId)}`;
    this.agendamentos.push({
      externalId,
      pacienteExternoId: dados.pacienteExternoId,
      clinicaExternaId: "clin-1",
      dentistaExternoId: dados.dentistaExternoId,
      dentistaNome: "Dra. Juliana Pelisser",
      cadeiraExternaId: "cad-1",
      inicioEm: dados.inicioEm,
      fimEm: new Date(Date.parse(dados.inicioEm) + dados.duracaoMinutos * 60000).toISOString(),
      descricao: dados.descricao ?? "Agendado pelo JP CRC (sandbox)",
      status: "TO_CONFIRM",
      statusExterno: "1",
    });

    return Promise.resolve({ ok: true, externalId });
  }

  atualizarStatusAgendamento(
    _clinica: string,
    externalId: string,
    status: StatusAgendamento,
  ): Promise<{ ok: boolean; detalhe: string }> {
    const alvo = this.agendamentos.find((a) => a.externalId === externalId);
    if (alvo === undefined) {
      return Promise.resolve({ ok: false, detalhe: "Agendamento não encontrado no sandbox." });
    }
    alvo.status = status;
    return Promise.resolve({ ok: true, detalhe: "Status atualizado no sandbox." });
  }

  private paginar<T>(todos: T[], pagina: number, tamanho: number): LoteMapeado<T> {
    const inicio = (pagina - 1) * tamanho;
    const fatia = todos.slice(inicio, inicio + tamanho);
    return {
      itens: fatia,
      falhas: [],
      proximaPagina: inicio + tamanho < todos.length ? pagina + 1 : null,
      total: todos.length,
    };
  }
}

/**
 * Instância única por processo.
 *
 * Precisa ser única para o fluxo E2E fechar: a jornada cria um agendamento e o
 * sync seguinte tem que enxergá-lo. Com uma instância nova a cada chamada, o
 * agendamento criado desapareceria e o teste do item 49 nunca chegaria ao fim.
 */
let instancia: SandboxDentalOffice | null = null;

export function criarSandbox(): PortaDentalOffice {
  instancia ??= new SandboxDentalOffice();
  return instancia;
}

/** Só para teste: devolve o sandbox a um estado limpo entre casos. */
export function _reiniciarSandbox(): void {
  instancia = null;
}
