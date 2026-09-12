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
import { registrar, registrarIntegracao } from "../../servidor/registro";
import type { SlotDisponivel, StatusAgendamento } from "../../dominio/tipos";
import { codigoDeStatusAgendamento } from "../../dominio/status";

import { invalidarToken, obterToken } from "./auth";
import { credenciaisDentalOffice, type CredenciaisDentalOffice } from "../credenciais";
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
  /**
   * As especialidades da clínica, do id para o nome.
   *
   * Existe porque `GET /customers` devolve `specialty_ids` — números — e sem
   * esta tabela o CRC guardaria "4" no lugar de "Endodontia". O filtro de
   * campanha por especialidade mostraria uma lista de números ao gestor.
   */
  listarEspecialidades(): Promise<Map<string, string>>;
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
  /**
   * Horários livres de um dentista.
   *
   * `diasAFrente` — e não um intervalo de datas. A API do Dental Office aceita
   * só `dentist_id` e `next` (quantidade de dias após hoje, padrão 9); não há
   * como pedir "de 10 a 20 de outubro". Manter um `de`/`ate` na assinatura
   * seria prometer um recorte que o adapter não consegue cumprir, e alguém
   * confiaria nele.
   */
  horariosDisponiveis(opcoes: {
    clinicaExternaId: string;
    dentistaExternoId: string;
    diasAFrente: number;
    clinicId: string;
  }): Promise<SlotDisponivel[]>;
  /**
   * Cria a consulta.
   *
   * `cadeiraExternaId` é OBRIGATÓRIO na API deles, e vem do próprio horário:
   * cada período devolvido por `available_hours` traz o `chair_id` em que ele
   * está livre. Não é um dado que o CRC escolhe — é parte do horário.
   */
  criarAgendamento(dados: {
    clinicaExternaId: string;
    pacienteExternoId: string;
    dentistaExternoId: string;
    cadeiraExternaId: string;
    inicioEm: string;
    duracaoMinutos: number;
    descricao?: string;
  }): Promise<
    | { ok: true; externalId: string }
    /**
     * `INCERTO`: o POST saiu e a resposta não voltou.
     *
     * NÃO É FALHA, e tratá-lo como falha é o que marca duas consultas. O
     * Dental Office pode ter criado o agendamento; a resposta é que se perdeu.
     * Quem chama precisa CONCILIAR antes de decidir — ver
     * `conciliarAgendamento`.
     */
    | { ok: false; codigo: "SLOT_OCUPADO" | "RECUSADO" | "INCERTO"; detalhe: string }
  >;

  /**
   * Procura um agendamento que PODEMOS ter criado.
   *
   * ========================================================================
   *  A PEÇA QUE FALTAVA PARA O `INCERTO` SER ÚTIL.
   *
   *  Sem reconciliação, "não sei se criou" só pode virar uma de duas
   *  escolhas ruins: repetir (e marcar duas consultas) ou desistir (e deixar o
   *  paciente sem a consulta que ele pediu).
   *
   *  Com ela, "não sei" vira uma pergunta que TEM resposta: basta olhar a
   *  agenda. Mesmo paciente, mesmo dentista, mesmo início, com a marca do CRC.
   *
   *  DUPLICAR TEXTO É CHATO; DUPLICAR CONSULTA É PROBLEMA OPERACIONAL — a
   *  cadeira fica bloqueada, outro paciente não consegue marcar, e alguém
   *  precisa ligar para desmarcar.
   * ========================================================================
   */
  conciliarAgendamento(dados: {
    clinicaExternaId: string;
    pacienteExternoId: string;
    dentistaExternoId: string;
    inicioEm: string;
  }): Promise<{ achou: true; externalId: string } | { achou: false }>;
  /**
   * Muda a situação da consulta no Dental Office.
   *
   * `situacaoExternaId` é o id da situação NAQUELA clínica, resolvido por
   * `GET /schedule_situations`. Sem ele o adapter cai no código numérico
   * padrão, que acerta na configuração de fábrica e pode errar numa clínica
   * que criou situações próprias — por isso quem tem o id deve passá-lo.
   */
  atualizarStatusAgendamento(
    clinicaExternaId: string,
    externalId: string,
    status: StatusAgendamento,
    situacaoExternaId?: number,
  ): Promise<{ ok: boolean; detalhe: string }>;
  /** Identifica o adapter na UI e no log. `sandbox` nunca pode aparecer em produção. */
  readonly nome: "dental_office" | "sandbox";
};

/* -------------------------------------------------------------------------- */
/* Cota da API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * O último valor de `RateLimit-Remaining` que vimos, por organização.
 *
 * Vive em memória do processo de propósito: isto é diagnóstico, não estado de
 * negócio. Perder na reinicialização não custa nada — a próxima resposta traz
 * o número de novo.
 */
const cotaVista = new Map<string, { restantes: number; em: number }>();

/**
 * Registra a cota e avisa quando ela vira.
 *
 * POR QUE ISTO EXISTE: a especificação do Dental Office diz "limite de 5.000
 * requisições por período" e NUNCA diz qual é o período. Não há
 * `RateLimit-Reset` documentado. A diferença decide a arquitetura — 5.000 por
 * hora é folga enorme, por dia cabe apertado, por mês torna impossível um
 * motor de minuto em minuto.
 *
 * Perguntar ao suporte é o caminho certo e leva dias. Enquanto isso, o número
 * já chega em toda resposta: quando `Remaining` SOBE em vez de descer, a
 * janela virou — e o intervalo entre duas subidas é a resposta.
 *
 * Dois avisos, e os dois são acionáveis:
 *   a virada da janela, que ensina o período;
 *   o consumo acima de 80%, que dá tempo de reagir antes do 429.
 */
function anotarCota(cabecalhos: Headers, operacao: string, organizationId: string | null): void {
  const restantesBruto = cabecalhos.get("ratelimit-remaining");
  if (restantesBruto === null) return;

  const restantes = Number.parseInt(restantesBruto, 10);
  if (!Number.isFinite(restantes)) return;

  const limite = Number.parseInt(cabecalhos.get("ratelimit-limit") ?? "", 10);
  const chave = organizationId ?? "sem-organizacao";
  const anterior = cotaVista.get(chave);
  const agora = Date.now();

  if (anterior !== undefined && restantes > anterior.restantes) {
    registrar("info", "A cota da API do Dental Office virou — a janela recomeçou.", {
      ...(organizationId !== null ? { organizationId } : {}),
      restantesAntes: anterior.restantes,
      restantesAgora: restantes,
      // É este número que responde "o período é de quanto tempo?".
      minutosDesdeAUltimaLeitura: Math.round((agora - anterior.em) / 60_000),
    });
  }

  cotaVista.set(chave, { restantes, em: agora });

  if (Number.isFinite(limite) && limite > 0 && restantes <= limite * 0.2) {
    registrar("aviso", "A cota da API do Dental Office está acabando.", {
      ...(organizationId !== null ? { organizationId } : {}),
      operacao,
      restantes,
      limite,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Adapter real                                                               */
/* -------------------------------------------------------------------------- */

export type ContextoCliente = {
  organizationId: string | null;
  /**
   * A unidade de quem é este trabalho.
   *
   * NULO SIGNIFICA "da organização inteira" — a sincronização de pacientes, por
   * exemplo, que não tem unidade. Não significa "tanto faz": com mais de uma
   * conta cadastrada na organização, a resolução recusa em vez de escolher.
   */
  clinicId?: string | null;
  requestId?: string;
  /** Deslocamento do fuso da clínica, para datas sem fuso na resposta. */
  fusoOffset?: string;
};

class ClienteDentalOffice implements PortaDentalOffice {
  readonly nome = "dental_office" as const;

  private readonly credenciais: CredenciaisDentalOffice;
  private readonly ctx: ContextoCliente;
  /** A identidade da credencial, para o cache de token. Nunca o segredo. */
  private readonly chaveDaCredencial: string;

  constructor(credenciais: CredenciaisDentalOffice, chave: string, ctx: ContextoCliente) {
    this.credenciais = credenciais;
    this.chaveDaCredencial = chave;
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
      metodo?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      corpo?: unknown;
      query?: Record<string, string | number | undefined>;
      operacao: string;
    },
  ): Promise<unknown> {
    /*
     * A URL BASE JÁ TERMINA EM /v1.
     *
     * O Dental Office entrega, junto do client_id e do secret, uma URL
     * exclusiva do cliente — e ela vem com o /v1 no fim
     * (`https://SEU.api.app.dentaloffice.com.br/v1`). Concatenar "/v1/..." aqui
     * produzia `/v1/v1/customers` e um 404 em toda chamada.
     *
     * Tolerar as duas formas é deliberado: quem cadastrar a variável sem o /v1
     * também funciona. Uma integração que só aceita uma grafia da URL vira
     * chamado de suporte no dia da ativação.
     */
    const base = this.credenciais.baseUrl.replace(/\/+$/u, "").replace(/\/v1$/u, "");
    const url = new URL(`${base}/v1${caminho}`);
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

    /*
     * O TOKEN VEM PELA CHAVE DESTA CREDENCIAL, e o 401 invalida SÓ ELA.
     *
     * A versão anterior chamava `invalidarToken()` sem argumento e zerava o
     * cache do processo inteiro. Com credencial por clínica isso é uma clínica
     * com segredo vencido derrubando o token de todas as vizinhas — cada uma
     * reautenticando na chamada seguinte, de graça.
     */
    let resposta = await executar(
      await obterToken(this.chaveDaCredencial, this.credenciais, this.ctx.requestId),
    );

    if (resposta.status === 401) {
      invalidarToken(this.chaveDaCredencial);
      resposta = await executar(
        await obterToken(this.chaveDaCredencial, this.credenciais, this.ctx.requestId),
      );
    }

    anotarCota(resposta.cabecalhos, opcoes.operacao, this.ctx.organizationId);

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
      // `/status` é o endpoint de saúde da API deles: não devolve dado de
      // paciente nenhum e serve exatamente para isto. Antes aqui havia
      // `/clinics`, que não existe na API — o teste de conexão dava 404 e
      // dizia "credenciais recusadas" mesmo com credencial correta.
      await this.chamar("/status", { operacao: "testar_conexao" });
      return { ok: true, detalhe: "Autenticação e leitura funcionando." };
    } catch (erro) {
      return { ok: false, detalhe: erro instanceof Error ? erro.message : String(erro) };
    }
  }

  /**
   * A API do Dental Office NÃO tem endpoint de clínicas.
   *
   * O `clinic_id` é parâmetro de caminho em agenda e cadeiras, e vem da
   * configuração (`DENTAL_OFFICE_CLINIC_ID`) — não de uma listagem. Este método
   * existe porque a porta o declara e a instalação o usa para descobrir a
   * unidade; ele devolve a clínica configurada, e lista vazia quando ela não
   * foi informada.
   *
   * Devolver vazio é melhor que inventar: a tela de Integrações mostra "nenhuma
   * clínica" e o admin sabe qual variável falta, em vez de o sync rodar contra
   * um id que não existe.
   */
  listarClinicas(): Promise<ClinicaExterna[]> {
    const id = (process.env["DENTAL_OFFICE_CLINIC_ID"] ?? "").trim();
    if (id.length === 0) return Promise.resolve([]);
    return Promise.resolve([{ externalId: id, nome: "Clínica configurada" }]);
  }

  /**
   * `GET /dentists` — na RAIZ, e não sob a clínica.
   *
   * O parâmetro `clinicaExternaId` continua na assinatura porque a porta o
   * declara e o sandbox o usa; a API real não o aceita, e ignorá-lo aqui é
   * mais honesto que mudar a interface inteira por um endpoint.
   */
  async listarDentistas(_clinicaExternaId: string): Promise<DentistaExterno[]> {
    const corpo = await this.chamar("/dentists", { operacao: "listar_dentistas" });
    const pagina = interpretarPagina(corpo, 1, 200);
    return pagina.itens
      .map((i) => mapearDentista(i))
      .filter((r): r is { ok: true; valor: DentistaExterno } => r.ok)
      .map((r) => r.valor);
  }

  /**
   * `GET /disciplines` — a tabela de especialidades da clínica.
   *
   * Chamada UMA VEZ por sincronização, e não por paciente: são dezenas de
   * especialidades contra milhares de pacientes, e uma consulta por paciente
   * consumiria a cota inteira da API para traduzir uma palavra.
   */
  async listarEspecialidades(): Promise<Map<string, string>> {
    const corpo = await this.chamar("/disciplines", { operacao: "listar_especialidades" });
    const pagina = interpretarPagina(corpo, 1, 200);

    const mapa = new Map<string, string>();
    for (const item of pagina.itens) {
      if (typeof item !== "object" || item === null) continue;
      const o = item as Record<string, unknown>;
      const id = o["id"];
      const nome = o["name"];
      if (id === null || id === undefined) continue;
      if (typeof nome !== "string" || nome.trim().length === 0) continue;
      mapa.set(String(id), nome.trim());
    }
    return mapa;
  }

  async listarPacientes(opcoes: {
    pagina: number;
    tamanho: number;
    atualizadosDesde?: string;
  }): Promise<LoteMapeado<PacienteExterno>> {
    /*
     * NÃO EXISTE SINCRONIZAÇÃO INCREMENTAL DE PACIENTES.
     *
     * `GET /customers` aceita `q`, `page`, `clinic_id`, `active` e filtros de
     * EXCLUSÃO — e nada de "atualizado desde". Conferido na especificação.
     *
     * A consequência é operacional e precisa ficar escrita: toda varredura de
     * pacientes é completa. Com o teto de 5.000 requisições da API, isso manda
     * o sync de pacientes ser RARO (uma vez ao dia) enquanto o de agenda pode
     * ser frequente — porque a agenda, essa sim, filtra por `start` e `end`.
     *
     * O `atualizadosDesde` continua na assinatura para o dia em que eles
     * adicionarem o filtro. Enviá-lo hoje seria só ruído na query.
     */
    const corpo = await this.chamar("/customers", {
      operacao: "listar_pacientes",
      query: {
        page: opcoes.pagina,
        per_page: opcoes.tamanho,
        // "both" traz ativos e inativos: o CRC precisa do inativo para não
        // recriá-lo como novo a cada varredura, e as regras já filtram por
        // `ativo` do lado de cá.
        active: "both",
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
    /*
     * A agenda fica SOB a clínica, e filtra por `start`/`end` — não por
     * `start_date`/`end_date`. É este filtro que permite sincronizar a agenda
     * com frequência sem estourar o teto de requisições, já que os pacientes
     * não têm filtro incremental.
     */
    const clinica = (opcoes.clinicaExternaId ?? "").trim();
    if (clinica.length === 0) {
      throw new ErroHttp("Falta o identificador da clínica para listar a agenda.", {
        status: 400,
        transitorio: false,
        corpo: "DENTAL_OFFICE_CLINIC_ID ausente.",
      });
    }

    const corpo = await this.chamar(`/clinics/${encodeURIComponent(clinica)}/schedules`, {
      operacao: "listar_agendamentos",
      query: {
        start: opcoes.de.slice(0, 10),
        end: opcoes.ate.slice(0, 10),
        page: opcoes.pagina,
        per_page: opcoes.tamanho,
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
      `/clinics/${encodeURIComponent(clinicaExternaId)}/schedules/${encodeURIComponent(externalId)}`,
      { operacao: "obter_agendamento" },
    );
    if (corpo === null) return null;
    const r = mapearAgendamento(corpo, this.fuso);
    return r.ok ? r.valor : null;
  }

  async horariosDisponiveis(opcoes: {
    clinicaExternaId: string;
    dentistaExternoId: string;
    diasAFrente: number;
    clinicId: string;
  }): Promise<SlotDisponivel[]> {
    /*
     * `next` é a QUANTIDADE DE DIAS após hoje, e não uma data.
     *
     * O padrão da API é 9. O teto de 60 aqui é nosso: pedir "os próximos 365
     * dias" devolveria uma resposta enorme para um caso que não existe — quem
     * marca consulta escolhe entre horários das próximas semanas, não do ano
     * que vem.
     */
    const dias = Math.max(1, Math.min(60, Math.floor(opcoes.diasAFrente)));

    const corpo = await this.chamar(
      `/clinics/${encodeURIComponent(opcoes.clinicaExternaId)}/schedules/available_hours`,
      {
        operacao: "horarios_disponiveis",
        query: { dentist_id: opcoes.dentistaExternoId, next: dias },
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
    cadeiraExternaId: string;
    inicioEm: string;
    duracaoMinutos: number;
    descricao?: string;
  }): Promise<
    | { ok: true; externalId: string }
    | { ok: false; codigo: "SLOT_OCUPADO" | "RECUSADO" | "INCERTO"; detalhe: string }
  > {
    try {
      /*
       * O CORPO É ANINHADO EM `schedule`, e a cadeira é obrigatória.
       *
       * `schedule_situation_id` fica de FORA de propósito: o id da situação é
       * criado por clínica (a API expõe `POST /schedule_situations`), então
       * mandar um número fixo daqui acertaria numa clínica e erraria em outra.
       * Sem ele, a consulta nasce na situação padrão do Dental Office — que é
       * exatamente o que a recepção veria ao marcar pela tela deles.
       */
      const corpo = await this.chamar(
        `/clinics/${encodeURIComponent(dados.clinicaExternaId)}/schedules`,
        {
          metodo: "POST",
          operacao: "criar_agendamento",
          corpo: {
            schedule: {
              customer_id: dados.pacienteExternoId,
              dentist_id: dados.dentistaExternoId,
              chair_id: dados.cadeiraExternaId,
              start: dados.inicioEm,
              end: new Date(
                Date.parse(dados.inicioEm) + dados.duracaoMinutos * 60000,
              ).toISOString(),
              /*
               * A MARCA VAI NOS DOIS CAMPOS DE ANOTAÇÃO.
               *
               * A API aceita `obs` e `note`; a resposta devolve `notes`. Qual
               * dos dois alimenta `notes` não está escrito na especificação, e
               * a marca é o que permite a tela de Agenda distinguir "o CRC
               * marcou" de "a recepção marcou". Escrever nos dois custa alguns
               * bytes e remove o palpite.
               *
               * `description` NÃO é usado: lá o Dental Office põe o nome do
               * paciente, para o calendário deles.
               */
              obs: dados.descricao ?? "Agendado pelo JP CRC",
              note: dados.descricao ?? "Agendado pelo JP CRC",
            },
          },
        },
      );

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

      /*
       * O POST SAIU E A RESPOSTA NÃO VOLTOU.
       *
       * Antes isto era relançado como erro qualquer — e o turno, ao repetir,
       * chegava de novo em `aceitarHorario` e mandava um SEGUNDO POST. O
       * Dental Office podia já ter criado a consulta, e a cadeira ficava
       * bloqueada duas vezes.
       *
       * Devolver `INCERTO` em vez de lançar é o que permite a quem chama
       * CONCILIAR antes de decidir.
       */
      if (erro instanceof ErroHttp && erro.entregaIncerta) {
        return {
          ok: false,
          codigo: "INCERTO",
          detalhe: `A chamada não teve resposta: ${erro.message}`,
        };
      }

      throw erro;
    }
  }

  async conciliarAgendamento(dados: {
    clinicaExternaId: string;
    pacienteExternoId: string;
    dentistaExternoId: string;
    inicioEm: string;
  }): Promise<{ achou: true; externalId: string } | { achou: false }> {
    /*
     * A JANELA É ESTREITA, e de propósito: um minuto para cada lado do início
     * pedido. O que se procura é a consulta que NÓS acabamos de tentar criar, e
     * ela tem exatamente o horário que pedimos. Uma janela larga acharia a
     * consulta das 15h quando a nossa era das 14h30 e a adotaria como sucesso —
     * transformando uma incerteza numa resposta errada com cara de certeza.
     */
    const inicio = Date.parse(dados.inicioEm);
    if (!Number.isFinite(inicio)) return { achou: false };

    const lote = await this.listarAgendamentos({
      clinicaExternaId: dados.clinicaExternaId,
      de: new Date(inicio - 60_000).toISOString(),
      ate: new Date(inicio + 60_000).toISOString(),
      pagina: 1,
      tamanho: 50,
    });

    const nosso = lote.itens.find(
      (a) =>
        a.pacienteExternoId === dados.pacienteExternoId &&
        a.dentistaExternoId === dados.dentistaExternoId &&
        Date.parse(a.inicioEm) === inicio &&
        /*
         * A MARCA É O QUE SEPARA "nós criamos" de "a recepção criou".
         *
         * Sem ela, uma consulta que a recepção marcou por telefone no mesmo
         * minuto seria adotada como nossa — e o paciente ficaria sem a segunda
         * que ele pediu ao agente, com o CRC achando que tinha marcado.
         */
        (a.descricao ?? "").includes("JP CRC"),
    );

    return nosso === undefined ? { achou: false } : { achou: true, externalId: nosso.externalId };
  }

  async atualizarStatusAgendamento(
    clinicaExternaId: string,
    externalId: string,
    status: StatusAgendamento,
    situacaoExternaId?: number,
  ): Promise<{ ok: boolean; detalhe: string }> {
    try {
      /*
       * PATCH, e não PUT — a API diz "envie apenas os atributos a serem
       * alterados". Um PUT trocaria o registro inteiro e apagaria o que o CRC
       * não conhece (cadeira, motivo, observação da recepção).
       *
       * NÃO PADRONIZE O VERBO DESTE ARQUIVO. A API do Dental Office mistura os
       * dois de propósito, e conferimos recurso por recurso na especificação:
       *
       *   PUT    cadeiras, disciplinas, motivos, situações
       *   PATCH  pacientes, dentistas, usuários, imagens, documentos, AGENDA
       *
       * O CRC só escreve em agenda, então aqui é PATCH. Trocar por PUT
       * "para ficar igual ao resto" é o tipo de arrumação que parece limpeza e
       * apaga dado da recepção.
       *
       * A situação vai pelo id numérico porque não há outro caminho de
       * escrita: o `label` é só de leitura. Quem chama precisa ter resolvido o
       * id via `GET /schedule_situations` — e é por isso que
       * `situacaoExternaId` existe na assinatura.
       */
      await this.chamar(
        `/clinics/${encodeURIComponent(clinicaExternaId)}/schedules/${encodeURIComponent(externalId)}`,
        {
          metodo: "PATCH",
          operacao: "atualizar_status_agendamento",
          corpo: {
            schedule: {
              schedule_situation_id: situacaoExternaId ?? codigoDeStatusAgendamento(status),
            },
          },
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
export async function criarClienteDentalOffice(ctx: ContextoCliente): Promise<ResultadoCliente> {
  const producao = process.env["NODE_ENV"] === "production";
  const pediuSandbox = (process.env["DENTAL_OFFICE_SANDBOX"] ?? "").trim() === "1";

  if (pediuSandbox && !producao) {
    // Import estático, e não dinâmico: o módulo de sandbox é pequeno e não
    // arrasta nada. O que impede ele de rodar em produção é a condição acima.
    return { ok: true, cliente: criarSandbox() };
  }

  /*
   * ASSÍNCRONA AGORA, E A MUDANÇA É O PONTO. Antes, as credenciais saíam de
   * `process.env` — uma leitura síncrona, e uma conta para a instalação
   * inteira. Agora elas saem do banco, por organização e clínica, com o
   * ambiente como último degrau. Ver `integracoes/credenciais.ts`.
   */
  const r = await credenciaisDentalOffice(ctx.organizationId ?? "", ctx.clinicId ?? null);
  if (!r.ok) return { ok: false, motivo: r.motivo, faltando: r.faltando };

  return { ok: true, cliente: new ClienteDentalOffice(r.credenciais, r.chave, ctx) };
}
