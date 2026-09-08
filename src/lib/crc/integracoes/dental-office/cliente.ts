/**
 * O cliente do Dental Office e a porta que o resto do sistema enxerga.
 *
 * ARQUITETURA (item 35, aplicado aqui e não só ao WhatsApp): o domínio conversa
 * com `PortaDentalOffice`, uma interface. Quem implementa é o adapter real ou o
 * de sandbox. Nenhum componente React, nenhum serviço de domínio e nenhuma
 * automação sabem que existe HTTP do outro lado.
 *
 * O QUE ESTE ARQUIVO NÃO FAZ: não decide o que sincronizar, não persiste nada,
 * não emite evento. Ele lê e escreve no Dental Office e devolve modelo
 * normalizado. Isso é o que permite testá-lo trocando o adapter.
 *
 * ESTADO ATUAL: `BLOCKED_BY_EXTERNAL_CREDENTIAL` (item 248). As três variáveis
 * de ambiente não foram fornecidas. A implementação está completa e o adapter
 * de sandbox permite exercitar o fluxo inteiro; o que falta é exclusivamente a
 * credencial. Nada aqui finge funcionar: `criarClienteDentalOffice` recusa
 * subir sem credencial e a tela de integrações mostra o motivo.
 */
import { ErroHttp, caminhoParaLog, pedir, type EventoHttp } from "../../servidor/http";
import { registrarIntegracao } from "../../servidor/registro";
import type { SlotDisponivel, StatusAgendamento } from "../../dominio/tipos";
import { codigoDeStatusAgendamento } from "../../dominio/status";

import { lerCredenciais, invalidarToken, obterToken, type CredenciaisDentalOffice } from "./auth";
import { criarSandbox } from "./sandbox";
import {
  interpretarPagina,
  mapearAgendamento,
  mapearClinica,
  mapearDentista,
  mapearPaciente,
  mapearSlots,
  type AgendamentoExterno,
  type ClinicaExterna,
  type DentistaExterno,
  type PacienteExterno,
} from "./mapeadores";

/* -------------------------------------------------------------------------- */
/* A porta                                                                    */
/* -------------------------------------------------------------------------- */

/** Uma página de registros já mapeados, com as falhas individuais separadas. */
export type LoteMapeado<T> = {
  itens: T[];
  /** Item 16: um registro ruim entre 5.000 não cancela os outros 4.999. */
  falhas: { externalId: string | null; erro: string }[];
  proximaPagina: number | null;
  total: number | null;
};

export type PortaDentalOffice = {
  /** Item 133: autentica e faz um GET pequeno. Nunca altera dado. */
  testarConexao(): Promise<{ ok: boolean; detalhe: string }>;
  listarClinicas(): Promise<ClinicaExterna[]>;
  listarDentistas(clinicaExternaId: string): Promise<DentistaExterno[]>;
  listarPacientes(opcoes: {
    pagina: number;
    tamanho: number;
    atualizadosDesde?: string;
  }): Promise<LoteMapeado<PacienteExterno>>;
  listarAgendamentos(opcoes: {
    clinicaExternaId?: string;
    de: string;
    ate: string;
    pagina: number;
    tamanho: number;
  }): Promise<LoteMapeado<AgendamentoExterno>>;
  obterAgendamento(
    clinicaExternaId: string,
    externalId: string,
  ): Promise<AgendamentoExterno | null>;
  horariosDisponiveis(opcoes: {
    clinicaExternaId: string;
    dentistaExternoId: string;
    de: string;
    ate: string;
    clinicId: string;
  }): Promise<SlotDisponivel[]>;
  criarAgendamento(dados: {
    clinicaExternaId: string;
    pacienteExternoId: string;
    dentistaExternoId: string;
    inicioEm: string;
    duracaoMinutos: number;
    descricao?: string;
  }): Promise<
    | { ok: true; externalId: string }
    | { ok: false; codigo: "SLOT_OCUPADO" | "RECUSADO"; detalhe: string }
  >;
  atualizarStatusAgendamento(
    clinicaExternaId: string,
    externalId: string,
    status: StatusAgendamento,
  ): Promise<{ ok: boolean; detalhe: string }>;
  /** Identifica o adapter na UI e no log. `sandbox` nunca pode aparecer em produção. */
  readonly nome: "dental_office" | "sandbox";
};

/* -------------------------------------------------------------------------- */
/* Adapter real                                                               */
/* -------------------------------------------------------------------------- */

export type ContextoCliente = {
  organizationId: string | null;
  requestId?: string;
  /** Deslocamento do fuso da clínica, para datas sem fuso na resposta. */
  fusoOffset?: string;
};

class ClienteDentalOffice implements PortaDentalOffice {
  readonly nome = "dental_office" as const;

  private readonly credenciais: CredenciaisDentalOffice;
  private readonly ctx: ContextoCliente;

  constructor(credenciais: CredenciaisDentalOffice, ctx: ContextoCliente) {
    this.credenciais = credenciais;
    this.ctx = ctx;
  }

  private get fuso(): string {
    return this.ctx.fusoOffset ?? "-03:00";
  }

  /**
   * Chamada autenticada, com UMA retentativa após 401.
   *
   * O item 10 pede exatamente isso: 401 invalida o cache e pede token novo. O
   * limite de uma retentativa é o que impede o laço infinito quando a
   * credencial está errada de verdade — nesse caso o segundo 401 sobe como
   * erro definitivo, e o admin vê "credenciais recusadas" em vez de o sync
   * ficar girando.
   */
  private async chamar(
    caminho: string,
    opcoes: {
      metodo?: "GET" | "POST" | "PUT" | "DELETE";
      corpo?: unknown;
      query?: Record<string, string | number | undefined>;
      operacao: string;
    },
  ): Promise<unknown> {
    const url = new URL(this.credenciais.baseUrl + caminho);
    for (const [chave, valor] of Object.entries(opcoes.query ?? {})) {
      if (valor !== undefined) url.searchParams.set(chave, String(valor));
    }

    const executar = async (token: string): ReturnType<typeof pedir> => {
      const eventos: EventoHttp[] = [];
      const init: Parameters<typeof pedir>[1] = {
        metodo: opcoes.metodo ?? "GET",
        cabecalhos: { Authorization: `Bearer ${token}` },
        aoRegistrar: (e) => eventos.push(e),
        ...(opcoes.corpo !== undefined ? { corpo: opcoes.corpo } : {}),
        ...(this.ctx.requestId !== undefined ? { requestId: this.ctx.requestId } : {}),
      };

      try {
        return await pedir(url.toString(), init);
      } finally {
        // O log de integração sai mesmo quando a chamada estoura — é
        // justamente aí que ele serve para alguma coisa (item 237).
        const ultimo = eventos[eventos.length - 1];
        if (ultimo !== undefined) {
          await registrarIntegracao({
            organizationId: this.ctx.organizationId,
            integracao: "dental_office",
            operacao: opcoes.operacao,
            metodo: ultimo.metodo,
            caminho: caminhoParaLog(url.toString()),
            statusHttp: ultimo.statusHttp,
            sucesso: ultimo.sucesso,
            erro: ultimo.erro,
            duracaoMs: ultimo.duracaoMs,
            ...(this.ctx.requestId !== undefined ? { requestId: this.ctx.requestId } : {}),
            resumo: { tentativas: eventos.length },
          });
        }
      }
    };

    let resposta = await executar(await obterToken(this.credenciais, this.ctx.requestId));

    if (resposta.status === 401) {
      invalidarToken();
      resposta = await executar(await obterToken(this.credenciais, this.ctx.requestId));
    }

    if (resposta.status === 404) return null;

    if (resposta.status >= 400) {
      throw new ErroHttp(
        `O Dental Office recusou ${opcoes.operacao} (${String(resposta.status)}).`,
        {
          status: resposta.status,
          // 401 depois do refresh e 4xx em geral não melhoram com repetição.
          transitorio: resposta.status === 429,
          corpo: resposta.texto.slice(0, 300),
        },
      );
    }

    return resposta.corpo;
  }

  async testarConexao(): Promise<{ ok: boolean; detalhe: string }> {
    try {
      // Item 133: GET pequeno e seguro. `limit=1` para não puxar a base.
      await this.chamar("/v1/clinics", { query: { limit: 1 }, operacao: "testar_conexao" });
      return { ok: true, detalhe: "Autenticação e leitura funcionando." };
    } catch (erro) {
      return { ok: false, detalhe: erro instanceof Error ? erro.message : String(erro) };
    }
  }

  async listarClinicas(): Promise<ClinicaExterna[]> {
    const corpo = await this.chamar("/v1/clinics", { operacao: "listar_clinicas" });
    const pagina = interpretarPagina(corpo, 1, 100);
    return pagina.itens
      .map((i) => mapearClinica(i))
      .filter((r): r is { ok: true; valor: ClinicaExterna } => r.ok)
      .map((r) => r.valor);
  }

  async listarDentistas(clinicaExternaId: string): Promise<DentistaExterno[]> {
    const corpo = await this.chamar(
      `/v1/clinics/${encodeURIComponent(clinicaExternaId)}/dentists`,
      {
        operacao: "listar_dentistas",
      },
    );
    const pagina = interpretarPagina(corpo, 1, 200);
    return pagina.itens
      .map((i) => mapearDentista(i))
      .filter((r): r is { ok: true; valor: DentistaExterno } => r.ok)
      .map((r) => r.valor);
  }

  async listarPacientes(opcoes: {
    pagina: number;
    tamanho: number;
    atualizadosDesde?: string;
  }): Promise<LoteMapeado<PacienteExterno>> {
    const corpo = await this.chamar("/v1/customers", {
      operacao: "listar_pacientes",
      query: {
        page: opcoes.pagina,
        limit: opcoes.tamanho,
        // Item 7 do Mega Prompt: sincronização incremental quando a API
        // suporta. Se ela ignorar o parâmetro, cai no full sync — que é
        // correto, só mais caro.
        updated_since: opcoes.atualizadosDesde,
      },
    });

    const pagina = interpretarPagina(corpo, opcoes.pagina, opcoes.tamanho);
    return separarMapeados(pagina, (i) => mapearPaciente(i));
  }

  async listarAgendamentos(opcoes: {
    clinicaExternaId?: string;
    de: string;
    ate: string;
    pagina: number;
    tamanho: number;
  }): Promise<LoteMapeado<AgendamentoExterno>> {
    const corpo = await this.chamar("/v1/schedules", {
      operacao: "listar_agendamentos",
      query: {
        clinic_id: opcoes.clinicaExternaId,
        start_date: opcoes.de.slice(0, 10),
        end_date: opcoes.ate.slice(0, 10),
        page: opcoes.pagina,
        limit: opcoes.tamanho,
      },
    });

    const pagina = interpretarPagina(corpo, opcoes.pagina, opcoes.tamanho);
    return separarMapeados(pagina, (i) => mapearAgendamento(i, this.fuso));
  }

  async obterAgendamento(
    clinicaExternaId: string,
    externalId: string,
  ): Promise<AgendamentoExterno | null> {
    const corpo = await this.chamar(
      `/v1/clinics/${encodeURIComponent(clinicaExternaId)}/schedules/${encodeURIComponent(externalId)}`,
      { operacao: "obter_agendamento" },
    );
    if (corpo === null) return null;
    const r = mapearAgendamento(corpo, this.fuso);
    return r.ok ? r.valor : null;
  }

  async horariosDisponiveis(opcoes: {
    clinicaExternaId: string;
    dentistaExternoId: string;
    de: string;
    ate: string;
    clinicId: string;
  }): Promise<SlotDisponivel[]> {
    const corpo = await this.chamar(
      `/v1/clinics/${encodeURIComponent(opcoes.clinicaExternaId)}/dentists/${encodeURIComponent(
        opcoes.dentistaExternoId,
      )}/available_hours`,
      {
        operacao: "horarios_disponiveis",
        query: { start_date: opcoes.de.slice(0, 10), end_date: opcoes.ate.slice(0, 10) },
      },
    );

    return mapearSlots(corpo, {
      clinicId: opcoes.clinicId,
      dentistaExternoId: opcoes.dentistaExternoId,
      fusoOffset: this.fuso,
    });
  }

  async criarAgendamento(dados: {
    clinicaExternaId: string;
    pacienteExternoId: string;
    dentistaExternoId: string;
    inicioEm: string;
    duracaoMinutos: number;
    descricao?: string;
  }): Promise<
    | { ok: true; externalId: string }
    | { ok: false; codigo: "SLOT_OCUPADO" | "RECUSADO"; detalhe: string }
  > {
    try {
      const corpo = await this.chamar("/v1/schedules", {
        metodo: "POST",
        operacao: "criar_agendamento",
        corpo: {
          clinic_id: dados.clinicaExternaId,
          customer_id: dados.pacienteExternoId,
          dentist_id: dados.dentistaExternoId,
          start: dados.inicioEm,
          end: new Date(Date.parse(dados.inicioEm) + dados.duracaoMinutos * 60000).toISOString(),
          description: dados.descricao ?? "Agendado pelo JP CRC",
          // 1 = Confirmar. Nasce pendente de confirmação, como qualquer
          // agendamento feito pela recepção.
          status: codigoDeStatusAgendamento("TO_CONFIRM"),
        },
      });

      const id =
        typeof corpo === "object" && corpo !== null && "id" in corpo
          ? String((corpo as { id: unknown }).id)
          : null;

      if (id === null) {
        return { ok: false, codigo: "RECUSADO", detalhe: "A API aceitou mas não devolveu o ID." };
      }
      return { ok: true, externalId: id };
    } catch (erro) {
      if (erro instanceof ErroHttp && (erro.status === 409 || erro.status === 422)) {
        // Item 21: horário tomado entre a consulta e a confirmação. É o caso
        // esperado, não uma falha de integração.
        return {
          ok: false,
          codigo: "SLOT_OCUPADO",
          detalhe: "Este horário acabou de ser ocupado.",
        };
      }
      throw erro;
    }
  }

  async atualizarStatusAgendamento(
    clinicaExternaId: string,
    externalId: string,
    status: StatusAgendamento,
  ): Promise<{ ok: boolean; detalhe: string }> {
    try {
      await this.chamar(
        `/v1/clinics/${encodeURIComponent(clinicaExternaId)}/schedules/${encodeURIComponent(externalId)}`,
        {
          metodo: "PUT",
          operacao: "atualizar_status_agendamento",
          corpo: { status: codigoDeStatusAgendamento(status) },
        },
      );
      return { ok: true, detalhe: "Status atualizado no Dental Office." };
    } catch (erro) {
      return { ok: false, detalhe: erro instanceof Error ? erro.message : String(erro) };
    }
  }
}

/**
 * Aplica o mapper a cada item e separa o que passou do que falhou.
 *
 * A falha carrega o `external_id` quando dá para extraí-lo: sem isso a linha em
 * `crc_sync_falhas` diria "um registro falhou" e ninguém saberia qual paciente
 * conferir no Dental Office.
 */
function separarMapeados<T>(
  pagina: { itens: unknown[]; proximaPagina: number | null; total: number | null },
  mapear: (item: unknown) => { ok: true; valor: T } | { ok: false; campo: string; erro: string },
): LoteMapeado<T> {
  const itens: T[] = [];
  const falhas: { externalId: string | null; erro: string }[] = [];

  for (const bruto of pagina.itens) {
    const r = mapear(bruto);
    if (r.ok) {
      itens.push(r.valor);
    } else {
      const id =
        typeof bruto === "object" && bruto !== null && "id" in bruto
          ? String((bruto as { id: unknown }).id)
          : null;
      falhas.push({ externalId: id, erro: `${r.campo}: ${r.erro}` });
    }
  }

  return { itens, falhas, proximaPagina: pagina.proximaPagina, total: pagina.total };
}

/* -------------------------------------------------------------------------- */
/* Fábrica                                                                    */
/* -------------------------------------------------------------------------- */

export type ResultadoCliente =
  { ok: true; cliente: PortaDentalOffice } | { ok: false; motivo: string; faltando: string[] };

/**
 * Monta o cliente, ou explica exatamente o que falta.
 *
 * O ITEM 239 ESTÁ AQUI: o adapter de sandbox só é usado quando
 * `DENTAL_OFFICE_SANDBOX=1` **e** o ambiente não é produção. Em produção a
 * variável é ignorada e a função recusa — "produção nunca deve usar sandbox por
 * engano" não pode depender de alguém lembrar de apagar uma variável.
 */
export function criarClienteDentalOffice(ctx: ContextoCliente): ResultadoCliente {
  const producao = process.env["NODE_ENV"] === "production";
  const pediuSandbox = (process.env["DENTAL_OFFICE_SANDBOX"] ?? "").trim() === "1";

  if (pediuSandbox && !producao) {
    // Import estático, e não dinâmico: o módulo de sandbox é pequeno e não
    // arrasta nada. O que impede ele de rodar em produção é a condição acima.
    return { ok: true, cliente: criarSandbox() };
  }

  const estado = lerCredenciais();
  if (!estado.configurado) {
    return {
      ok: false,
      motivo: "A integração com o Dental Office ainda não foi configurada.",
      faltando: estado.faltando,
    };
  }

  return { ok: true, cliente: new ClienteDentalOffice(estado.credenciais, ctx) };
}
