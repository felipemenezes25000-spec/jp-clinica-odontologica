/**
 * Server functions do JP CRC — o contrato entre a tela e o servidor.
 *
 * REGRA QUE VALE PARA O ARQUIVO INTEIRO, herdada do portal de RH: o topo daqui
 * precisa ser seguro no navegador. Nada de `node:`, nada de
 * `@tanstack/react-start/server`, nada dos módulos de `./servidor` ou
 * `./aplicacao` importado estaticamente. Tudo isso entra por `await import()`
 * DENTRO do handler, que o compilador do Start remove do bundle do cliente.
 *
 * Quebrar essa regra não dá erro de compilação — dá um bundle de cliente com a
 * chave de serviço do Supabase dentro. Ver `docs/INCIDENTE-BUILD-500.md` para o
 * que acontece quando o grafo de imports do servidor vaza para onde não deve.
 *
 * CONVENÇÃO DE RETORNO (item 139): tudo devolve
 * `{ ok: true, ... } | { ok: false, code, message }`. Nunca lança para o
 * cliente — lançar cairia no error boundary e mostraria tela de erro para quem
 * só precisa fazer login. O `code` é estável para o programa; a `message` é
 * humana para a pessoa (item 48).
 *
 * AUTORIZAÇÃO: toda função que lê ou escreve dado chama `comContexto`, que
 * valida a sessão E a permissão antes de o handler rodar. Item 70 — esconder o
 * botão é UX, isto é segurança.
 */
import { createServerFn } from "@tanstack/react-start";

import type { PanoramaDeBusca } from "./aplicacao/busca";
import type { Permissao } from "./dominio/rbac";
import type {
  Conversa,
  Jornada,
  Mensagem,
  Oportunidade,
  Paciente,
  StatusAgendamento,
  Tarefa,
  TipoTarefa,
  Usuario,
} from "./dominio/tipos";

/* -------------------------------------------------------------------------- */
/* Formatos de retorno                                                        */
/* -------------------------------------------------------------------------- */

export type Falha = { ok: false; code: string; message: string };
export type Sucesso<T> = { ok: true } & T;
export type Resposta<T> = Sucesso<T> | Falha;

/**
 * Resposta sem dado de volta — "deu certo" e nada mais.
 *
 * Precisa de tipo próprio porque `Resposta<Record<string, never>>` é
 * contraditório: a própria chave `ok` viola o index signature `never`.
 */
export type RespostaSimples = { ok: true } | Falha;

export type EstadoSessao = {
  autenticado: boolean;
  configurado: boolean;
  motivo: string;
  usuario: (Usuario & { permissoes: Permissao[] }) | null;
};

export type ResumoHome = {
  saudacao: string;
  precisamDeAtencao: number;
  emAutomacao: number;
  tarefasHoje: number;
  conversasEsperando: number;
  consultasRecuperadas: number;
  pacientesReativados: number;
  /** Item 63: potencial e confirmado NUNCA no mesmo número. */
  valorPotencialRecuperado: string;
  receitaConfirmada: string;
  prioridades: ItemPrioridade[];
  frescorDados: string | null;
  /**
   * A janela de atendimento de HOJE, no fuso da clínica. `null` nos dois
   * campos quando hoje é dia fechado.
   *
   * A tela usa isto para desenhar onde estamos no dia — e é o que explica,
   * sem ninguém precisar perguntar, por que a mensagem de alguém "ainda não
   * saiu": ela está esperando a janela abrir.
   */
  janelaDeHoje: { inicio: string | null; fim: string | null };
  /** A clínica está dentro da janela agora? O pulso da automação depende disto. */
  dentroDoHorario: boolean;
};

export type ItemPrioridade = {
  opportunityId: string;
  patientId: string | null;
  nome: string;
  tipo: string;
  tipoRotulo: string;
  motivo: string;
  score: number;
  faixa: "ALTA" | "MEDIA" | "BAIXA";
  fatores: { rotulo: string; pontos: number }[];
  valorPotencial: string | null;
  proximaAcao: string | null;
  ultimoContatoEm: string | null;
  temJornadaAtiva: boolean;
};

/* -------------------------------------------------------------------------- */
/* Apoio (só dentro dos handlers)                                             */
/* -------------------------------------------------------------------------- */

/**
 * O cookie de sessão devolve `Partial`, e com razão: ele pode ter sido
 * gravado por uma versão anterior do app, ou estar vazio. Esta função é o
 * único lugar que decide o que conta como sessão válida — sem ela, cada
 * chamador repetiria a checagem de campo e uma delas ficaria para trás.
 */
function montarSessao(
  dados: Partial<import("./servidor/sessao").DadosSessaoCrc>,
): import("./servidor/sessao").DadosSessaoCrc | null {
  const { userId, organizationId, entrouEm } = dados;
  if (typeof userId !== "string" || userId.length === 0) return null;
  if (typeof organizationId !== "string" || organizationId.length === 0) return null;
  return { userId, organizationId, entrouEm: entrouEm ?? "" };
}

/**
 * Abre a sessão, autoriza e roda o handler.
 *
 * Devolve `Falha` em vez de lançar quando não há sessão — ver a convenção no
 * cabeçalho. O `requestId` nasce aqui e atravessa tudo: log, auditoria e
 * resposta de erro (item 75 da observabilidade).
 */
async function comContexto<T>(
  permissao: Permissao | null,
  handler: (ctx: import("./servidor/sessao").ContextoCrc) => Promise<T>,
): Promise<T | Falha> {
  // Renomeado no destructuring, como em `lib/rh/api.ts`: `useSession` do Start
  // não é hook de React, mas o eslint-plugin-react-hooks julga pelo nome e
  // acusaria chamada de hook fora de componente.
  const { useSession: abrirSessao } = await import("@tanstack/react-start/server");
  const { autorizar, configuracaoSessao, sessaoConfigurada } = await import("./servidor/sessao");
  const { novoRequestId, registrar, descreverErro } = await import("./servidor/registro");

  const requestId = novoRequestId();

  const estado = sessaoConfigurada();
  if (!estado.ok) {
    return { ok: false, code: "INTEGRACAO_NAO_CONFIGURADA", message: estado.motivo };
  }

  const sessao =
    await abrirSessao<import("./servidor/sessao").DadosSessaoCrc>(configuracaoSessao());
  const dados = sessao.data;

  const autorizacao = await autorizar(montarSessao(dados), requestId, permissao ?? undefined);

  if (!autorizacao.ok) {
    return { ok: false, code: autorizacao.codigo, message: autorizacao.motivo };
  }

  try {
    return await handler(autorizacao.ctx);
  } catch (erro) {
    // Item 113: nada de catch vazio. O erro é registrado com correlação e o
    // usuário recebe uma frase humana — nunca o stack.
    registrar("erro", "Falha em server function do CRC.", {
      requestId,
      organizationId: autorizacao.ctx.organizationId,
      userId: autorizacao.ctx.usuario.id,
      detalhe: descreverErro(erro),
    });
    return {
      ok: false,
      code: "FALHA_INTERNA",
      message: "Algo deu errado do nosso lado. Já registramos o problema.",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Sessão                                                                     */
/* -------------------------------------------------------------------------- */

export const estadoSessaoCrc = createServerFn({ method: "GET" }).handler(
  async (): Promise<EstadoSessao> => {
    // Renomeado no destructuring, como em `lib/rh/api.ts`: `useSession` do Start
    // não é hook de React, mas o eslint-plugin-react-hooks julga pelo nome e
    // acusaria chamada de hook fora de componente.
    const { useSession: abrirSessao } = await import("@tanstack/react-start/server");
    const { autorizar, configuracaoSessao, sessaoConfigurada } = await import("./servidor/sessao");
    const { permissoesDe } = await import("./dominio/rbac");
    const { novoRequestId } = await import("./servidor/registro");

    const estado = sessaoConfigurada();
    if (!estado.ok) {
      return { autenticado: false, configurado: false, motivo: estado.motivo, usuario: null };
    }

    const sessao =
      await abrirSessao<import("./servidor/sessao").DadosSessaoCrc>(configuracaoSessao());
    const dados = sessao.data;

    const autorizacao = await autorizar(montarSessao(dados), novoRequestId());

    if (!autorizacao.ok) {
      return { autenticado: false, configurado: true, motivo: "", usuario: null };
    }

    return {
      autenticado: true,
      configurado: true,
      motivo: "",
      usuario: {
        ...autorizacao.ctx.usuario,
        permissoes: permissoesDe(autorizacao.ctx.usuario.papel),
      },
    };
  },
);

export const entrarNoCrc = createServerFn({ method: "POST" })
  .validator((entrada: { email: string; senha: string }) => ({
    email: String(entrada.email ?? "").slice(0, 200),
    senha: String(entrada.senha ?? "").slice(0, 200),
  }))
  .handler(async ({ data }): Promise<Resposta<{ usuario: Usuario }>> => {
    // Renomeado no destructuring, como em `lib/rh/api.ts`: `useSession` do Start
    // não é hook de React, mas o eslint-plugin-react-hooks julga pelo nome e
    // acusaria chamada de hook fora de componente.
    const { useSession: abrirSessao } = await import("@tanstack/react-start/server");
    const { configuracaoSessao, entrar, sessaoConfigurada } = await import("./servidor/sessao");
    const { registrar } = await import("./servidor/registro");

    const estado = sessaoConfigurada();
    if (!estado.ok) {
      return { ok: false, code: "INTEGRACAO_NAO_CONFIGURADA", message: estado.motivo };
    }

    const resultado = await entrar(data.email, data.senha);
    if (!resultado.ok) {
      // O e-mail NÃO entra no log em texto claro (item 75); o registro serve
      // para detectar tentativa em massa, e para isso a contagem basta.
      registrar("aviso", "Tentativa de login recusada no CRC.");
      return { ok: false, code: "ENTRADA_INVALIDA", message: resultado.erro };
    }

    const sessao =
      await abrirSessao<import("./servidor/sessao").DadosSessaoCrc>(configuracaoSessao());
    await sessao.update(resultado.sessao);

    return { ok: true, usuario: resultado.usuario };
  });

export const sairDoCrc = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true }> => {
    // Renomeado no destructuring, como em `lib/rh/api.ts`: `useSession` do Start
    // não é hook de React, mas o eslint-plugin-react-hooks julga pelo nome e
    // acusaria chamada de hook fora de componente.
    const { useSession: abrirSessao } = await import("@tanstack/react-start/server");
    const { configuracaoSessao, sessaoConfigurada } = await import("./servidor/sessao");

    if (sessaoConfigurada().ok) {
      const sessao =
        await abrirSessao<import("./servidor/sessao").DadosSessaoCrc>(configuracaoSessao());
      await sessao.clear();
    }
    return { ok: true };
  },
);

/* -------------------------------------------------------------------------- */
/* Home operacional (itens 15 do Mega Prompt, 106, 181)                       */
/* -------------------------------------------------------------------------- */

export const carregarHome = createServerFn({ method: "GET" }).handler(
  async (): Promise<Resposta<{ resumo: ResumoHome }>> =>
    comContexto("ver_oportunidade", async (ctx) => {
      const { contar, selecionar } = await import("./servidor/banco");
      const { listarOportunidades } = await import("./aplicacao/oportunidades");
      const { faixaDePrioridade } = await import("./dominio/prioridade");
      const { ROTULO_TIPO_OPORTUNIDADE } = await import("./dominio/rotulos");
      const { saudacao, somarDinheiro } = await import("./dominio/formatar");
      const { lerEstadoDeSincronizacao } = await import("./aplicacao/sincronizacao");
      const { lerConfiguracao } = await import("./servidor/configuracao");
      const { dentroDoHorario, partesLocais } = await import("./dominio/configuracao");

      const org = ctx.organizationId;
      const inicioDoMes = new Date();
      inicioDoMes.setUTCDate(1);
      inicioDoMes.setUTCHours(0, 0, 0, 0);

      // As oportunidades que competem por atenção humana HOJE: abertas, sem
      // jornada ativa cuidando delas. É o número que o item 15 do Mega Prompt
      // pede no topo da tela.
      const abertas = await listarOportunidades({
        organizationId: org,
        clinicIds: ctx.clinicIds,
        limite: 60,
      });

      const emJornada = await selecionar("crc_automation_enrollments", {
        colunas: "opportunity_id",
        filtros: [
          { coluna: "organization_id", op: "eq", valor: org },
          { coluna: "status", op: "in", valor: ["ACTIVE", "WAITING"] },
        ],
        limite: 1000,
      });
      const comJornada = new Set(
        emJornada.map((l) => String(l["opportunity_id"] ?? "")).filter((x) => x.length > 0),
      );

      const precisamDeAtencao = abertas.filter((o) => !comJornada.has(o.id));

      const nomes = await carregarNomes(
        org,
        precisamDeAtencao.map((o) => o.patientId).filter((p): p is string => p !== null),
      );

      const prioridades: ItemPrioridade[] = precisamDeAtencao.slice(0, 12).map((o) => ({
        opportunityId: o.id,
        patientId: o.patientId,
        nome: (o.patientId === null ? null : nomes.get(o.patientId)) ?? "Paciente sem nome",
        tipo: o.tipo,
        tipoRotulo: ROTULO_TIPO_OPORTUNIDADE[o.tipo],
        motivo: o.motivo ?? "",
        score: o.priorityScore,
        faixa: faixaDePrioridade(o.priorityScore),
        fatores: o.priorityFatores.map((f) => ({ rotulo: f.rotulo, pontos: f.pontos })),
        valorPotencial: o.potentialValue,
        proximaAcao: o.nextAction,
        ultimoContatoEm: null,
        temJornadaAtiva: false,
      }));

      const [tarefasHoje, conversasEsperando, jornadasAtivas] = await Promise.all([
        contar("crc_tasks", [
          { coluna: "organization_id", op: "eq", valor: org },
          { coluna: "assigned_to", op: "eq", valor: ctx.usuario.id },
          { coluna: "status", op: "in", valor: ["OPEN", "IN_PROGRESS"] },
        ]),
        contar("crc_conversations", [
          { coluna: "organization_id", op: "eq", valor: org },
          { coluna: "nao_lidas", op: "gt", valor: 0 },
        ]),
        contar("crc_automation_enrollments", [
          { coluna: "organization_id", op: "eq", valor: org },
          { coluna: "status", op: "in", valor: ["ACTIVE", "WAITING"] },
        ]),
      ]);

      // Recuperação do mês, medida pelos eventos de funil — que são gravados no
      // servidor no momento em que o fato acontece, e não recalculados aqui.
      const recuperadas = await selecionar("crc_funnel_events", {
        colunas: "etapa,valor,patient_id",
        filtros: [
          { coluna: "organization_id", op: "eq", valor: org },
          { coluna: "etapa", op: "eq", valor: "consulta_recuperada" },
          { coluna: "ocorrido_em", op: "gte", valor: inicioDoMes.toISOString() },
        ],
        limite: 2000,
      });

      const receita = await selecionar("crc_revenue_events", {
        colunas: "valor,natureza",
        filtros: [
          { coluna: "organization_id", op: "eq", valor: org },
          { coluna: "natureza", op: "eq", valor: "CONFIRMADA" },
          { coluna: "ocorrido_em", op: "gte", valor: inicioDoMes.toISOString() },
        ],
        limite: 2000,
      });

      const estadoSync = await lerEstadoDeSincronizacao(org);
      const maisRecente = estadoSync
        .map((e) => e.ultimaComSucessoEm)
        .filter((x): x is string => x !== null)
        .sort()
        .pop();

      /*
       * A janela de HOJE, e não a semana inteira.
       *
       * O índice do vetor `dias` é o dia da semana começando no domingo, e o
       * dia é lido no FUSO DA CLÍNICA — a Vercel roda em UTC, e às 21h de uma
       * terça em São Paulo o servidor já acha que é quarta. Ler o dia errado
       * aqui desenharia a janela de sábado num sábado que ainda não chegou.
       */
      const cfg = await lerConfiguracao(org);
      const horario = cfg.horarioComercial;
      const agoraNaClinica = new Date();
      const diaLocal = partesLocais(agoraNaClinica, horario.fuso).diaSemana;
      const doDia = horario.dias[diaLocal] ?? null;
      const janela = { inicio: doDia?.inicio ?? null, fim: doDia?.fim ?? null };
      const aberta = dentroDoHorario(agoraNaClinica, horario);

      const resumo: ResumoHome = {
        saudacao: saudacao(),
        precisamDeAtencao: precisamDeAtencao.length,
        emAutomacao: jornadasAtivas,
        tarefasHoje,
        conversasEsperando,
        consultasRecuperadas: recuperadas.length,
        pacientesReativados: new Set(
          recuperadas.map((r) => String(r["patient_id"] ?? "")).filter((x) => x.length > 0),
        ).size,
        // Item 63: enquanto não houver integração financeira, este número é
        // POTENCIAL e a tela precisa dizer isso. Ele não é somado ao confirmado.
        valorPotencialRecuperado: somarDinheiro(
          recuperadas.map((r) => (typeof r["valor"] === "string" ? r["valor"] : null)),
        ),
        receitaConfirmada: somarDinheiro(
          receita.map((r) => (typeof r["valor"] === "string" ? r["valor"] : null)),
        ),
        prioridades,
        frescorDados: maisRecente ?? null,
        janelaDeHoje: janela,
        dentroDoHorario: aberta,
      };

      return { ok: true as const, resumo };
    }),
);

async function carregarNomes(
  organizationId: string,
  patientIds: readonly string[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const unicos = [...new Set(patientIds)];
  if (unicos.length === 0) return mapa;

  const { selecionar } = await import("./servidor/banco");
  const linhas = await selecionar("crc_patients", {
    colunas: "id,nome",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "id", op: "in", valor: unicos },
    ],
    limite: unicos.length,
  });

  for (const l of linhas) mapa.set(String(l["id"] ?? ""), String(l["nome"] ?? ""));
  return mapa;
}

/* -------------------------------------------------------------------------- */
/* Pacientes                                                                  */
/* -------------------------------------------------------------------------- */

export const buscarPacientes = createServerFn({ method: "GET" })
  .validator((e: { termo: string }) => ({ termo: String(e.termo ?? "").slice(0, 120) }))
  .handler(async ({ data }): Promise<Resposta<{ itens: Paciente[] }>> =>
    comContexto("ver_paciente", async (ctx) => {
      const { procurarPacientes } = await import("./aplicacao/repositorios");
      const itens = await procurarPacientes(ctx.organizationId, data.termo);
      // Item 71: o filtro de clínica também vale para a busca. Sem ele, a
      // busca global vazaria paciente de outra unidade.
      return { ok: true as const, itens: itens.filter((p) => ctx.alcanca(p.clinicId)) };
    }),
  );

/**
 * Busca global — a caixa única do topo.
 *
 * A PERMISSÃO EXIGIDA É `ver_paciente`, a mais básica de quem opera. Pedir uma
 * permissão por tipo de resultado transformaria a busca num quebra-cabeça:
 * quem não pode ver oportunidade simplesmente não recebe as oportunidades, e o
 * filtro por clínica corta o resto. Recusar a busca inteira porque um dos
 * quatro grupos é restrito seria pior para todo mundo.
 */
export const buscarEmTodoLugar = createServerFn({ method: "GET" })
  .validator((e: { termo: string }) => ({ termo: String(e.termo ?? "").slice(0, 120) }))
  .handler(async ({ data }): Promise<Resposta<{ panorama: PanoramaDeBusca }>> =>
    comContexto("ver_paciente", async (ctx) => {
      const { buscarEmTudo } = await import("./aplicacao/busca");
      const panorama = await buscarEmTudo(ctx.organizationId, data.termo);

      // Item 71 outra vez, e aqui vale dobrado: numa lista misturada ninguém
      // confere de qual unidade veio cada linha.
      const podeVerOportunidade = ctx.pode("ver_oportunidade");
      const podeVerConversa = ctx.pode("ver_conversa");

      const resultados = panorama.resultados.filter((r) => {
        if (r.clinicId !== null && !ctx.alcanca(r.clinicId)) return false;
        if (r.tipo === "oportunidade" && !podeVerOportunidade) return false;
        if (r.tipo === "conversa" && !podeVerConversa) return false;
        return true;
      });

      return { ok: true as const, panorama: { ...panorama, resultados } };
    }),
  );

/* -------------------------------------------------------------------------- */
/* Configurações                                                              */
/* -------------------------------------------------------------------------- */

export type JanelaDoDia = { inicio: string; fim: string } | null;

export type ConfiguracoesDto = {
  recallDias: number;
  recallLongoDias: number;
  inatividadeDias: number;
  orcamentoParadoDias: number;
  faltaEsperaHoras: number;
  confirmacaoAntecedenciaHoras: number;
  contatosPorDia: number;
  cooldownHoras: number;
  tentativasPorJornada: number;
  envioPorHora: number;
  iaConfiancaAutomatica: number;
  iaConfiancaSugestao: number;
  /** Domingo a sábado, na ordem. `null` é dia fechado. */
  dias: JanelaDoDia[];
  fuso: string;
  feriados: string[];
  flags: Record<string, boolean>;
  /** Só admin e gestor mexem em flag. A tela desabilita para os demais. */
  podeMexerEmFlags: boolean;
};

export const carregarConfiguracoes = createServerFn({ method: "GET" }).handler(
  async (): Promise<Resposta<{ configuracoes: ConfiguracoesDto }>> =>
    comContexto("ver_integracoes", async (ctx) => {
      const { lerConfiguracao, lerFlags } = await import("./servidor/configuracao");
      const [cfg, flags] = await Promise.all([
        lerConfiguracao(ctx.organizationId),
        lerFlags(ctx.organizationId),
      ]);

      return {
        ok: true as const,
        configuracoes: {
          recallDias: cfg.recallDias,
          recallLongoDias: cfg.recallLongoDias,
          inatividadeDias: cfg.inatividadeDias,
          orcamentoParadoDias: cfg.orcamentoParadoDias,
          faltaEsperaHoras: cfg.faltaEsperaHoras,
          confirmacaoAntecedenciaHoras: cfg.confirmacaoAntecedenciaHoras,
          contatosPorDia: cfg.contatosPorDia,
          cooldownHoras: cfg.cooldownHoras,
          tentativasPorJornada: cfg.tentativasPorJornada,
          envioPorHora: cfg.envioPorHora,
          iaConfiancaAutomatica: cfg.iaConfiancaAutomatica,
          iaConfiancaSugestao: cfg.iaConfiancaSugestao,
          dias: cfg.horarioComercial.dias.map((d) =>
            d === null || d === undefined ? null : { inicio: d.inicio, fim: d.fim },
          ),
          fuso: cfg.horarioComercial.fuso,
          feriados: [...cfg.horarioComercial.feriados],
          flags,
          podeMexerEmFlags: ctx.pode("gerenciar_autopilot"),
        },
      };
    }),
);

/**
 * Os limites de cada número, e por que eles existem.
 *
 * O TETO IMPORTA MAIS QUE O PISO. Um `envioPorHora` de 50.000 não é
 * "configuração agressiva": é a conta de WhatsApp da clínica sendo bloqueada
 * numa tarde. Um `contatosPorDia` de 20 é assédio com aparência de campanha.
 * A tela mostra o intervalo, e o servidor recusa fora dele — porque a tela
 * pode ser contornada e o servidor não.
 */
const LIMITES: Readonly<Record<string, { min: number; max: number }>> = {
  recallDias: { min: 30, max: 1095 },
  recallLongoDias: { min: 60, max: 1825 },
  inatividadeDias: { min: 60, max: 1825 },
  orcamentoParadoDias: { min: 1, max: 365 },
  faltaEsperaHoras: { min: 1, max: 168 },
  confirmacaoAntecedenciaHoras: { min: 2, max: 168 },
  // Mais de três contatos no mesmo dia é perseguição, não relacionamento.
  contatosPorDia: { min: 1, max: 3 },
  cooldownHoras: { min: 1, max: 720 },
  tentativasPorJornada: { min: 1, max: 10 },
  envioPorHora: { min: 1, max: 1000 },
};

export const salvarConfiguracaoNumerica = createServerFn({ method: "POST" })
  .validator((e: { chave: string; valor: number }) => ({
    chave: String(e.chave ?? ""),
    valor: Number(e.valor ?? 0),
  }))
  .handler(async ({ data }): Promise<Resposta<{ salvo: true }>> =>
    comContexto("gerenciar_integracoes", async (ctx) => {
      const limite = LIMITES[data.chave];
      if (limite === undefined) {
        return { ok: false as const, code: "VALIDACAO", message: "Configuração desconhecida." };
      }
      if (!Number.isFinite(data.valor) || data.valor < limite.min || data.valor > limite.max) {
        return {
          ok: false as const,
          code: "VALIDACAO",
          message: `O valor precisa estar entre ${String(limite.min)} e ${String(limite.max)}.`,
        };
      }

      const { gravarConfiguracao } = await import("./servidor/configuracao");
      await gravarConfiguracao(
        ctx.organizationId,
        data.chave,
        Math.round(data.valor),
        ctx.usuario.id,
      );
      return { ok: true as const, salvo: true as const };
    }),
  );

/**
 * O horário comercial inteiro, de uma vez.
 *
 * SALVAR DIA A DIA SERIA PIOR: entre um `POST` e o seguinte, a clínica ficaria
 * com metade da semana nova e metade velha — e uma jornada rodando nesse
 * intervalo leria uma semana que ninguém configurou.
 */
export const salvarHorarioComercial = createServerFn({ method: "POST" })
  .validator((e: { dias: JanelaDoDia[] }) => ({
    dias: Array.isArray(e.dias) ? e.dias.slice(0, 7) : [],
  }))
  .handler(async ({ data }): Promise<Resposta<{ salvo: true }>> =>
    comContexto("gerenciar_integracoes", async (ctx) => {
      if (data.dias.length !== 7) {
        return { ok: false as const, code: "VALIDACAO", message: "A semana precisa ter 7 dias." };
      }

      const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/u;
      for (const dia of data.dias) {
        if (dia === null) continue;
        if (!hhmm.test(dia.inicio) || !hhmm.test(dia.fim)) {
          return { ok: false as const, code: "VALIDACAO", message: "Horário inválido." };
        }
        // Fim antes do início produz uma janela que nunca abre — e o efeito
        // não é erro, é silêncio: a automação reagenda para sempre.
        if (dia.fim <= dia.inicio) {
          return {
            ok: false as const,
            code: "VALIDACAO",
            message: "O fim do expediente precisa ser depois do início.",
          };
        }
      }

      const { lerConfiguracao, gravarConfiguracao } = await import("./servidor/configuracao");
      const cfg = await lerConfiguracao(ctx.organizationId);

      await gravarConfiguracao(
        ctx.organizationId,
        "horarioComercial",
        { ...cfg.horarioComercial, dias: data.dias },
        ctx.usuario.id,
      );
      return { ok: true as const, salvo: true as const };
    }),
  );

export const definirFeatureFlag = createServerFn({ method: "POST" })
  .validator((e: { chave: string; ligada: boolean }) => ({
    chave: String(e.chave ?? ""),
    ligada: Boolean(e.ligada),
  }))
  .handler(async ({ data }): Promise<Resposta<{ salvo: true }>> =>
    comContexto("gerenciar_autopilot", async (ctx) => {
      const { FLAGS } = await import("./dominio/configuracao");
      const conhecidas = new Set<string>(Object.values(FLAGS));
      if (!conhecidas.has(data.chave)) {
        return { ok: false as const, code: "VALIDACAO", message: "Flag desconhecida." };
      }

      const { definirFlag } = await import("./servidor/configuracao");
      await definirFlag(
        ctx.organizationId,
        data.chave as import("./dominio/configuracao").ChaveFlag,
        data.ligada,
        ctx.usuario.id,
      );
      return { ok: true as const, salvo: true as const };
    }),
  );

/* -------------------------------------------------------------------------- */
/* Agenda                                                                     */
/* -------------------------------------------------------------------------- */

export type ItemDaAgenda = {
  id: string;
  patientId: string | null;
  pacienteNome: string;
  /** O telefone é o que a recepção usa quando precisa ligar antes da hora. */
  pacienteTelefone: string | null;
  dentistaNome: string | null;
  inicioEm: string;
  fimEm: string | null;
  status: StatusAgendamento;
  descricao: string | null;
  /** Marcado pelo CRC, e não digitado por alguém. A tela distingue. */
  peloCrc: boolean;
};

export type DiaDaAgenda = {
  /** "AAAA-MM-DD" no fuso da clínica. */
  dia: string;
  itens: ItemDaAgenda[];
};

export type PanoramaDaAgenda = {
  de: string;
  ate: string;
  dias: DiaDaAgenda[];
  /** Quantos ainda não confirmaram. É o número que vira trabalho hoje. */
  aConfirmar: number;
};

/**
 * A agenda da clínica, agrupada por dia.
 *
 * POR QUE ESTA TELA EXISTE, se o Dental Office já tem uma agenda: porque a
 * pergunta que ela responde é outra. A agenda do Dental Office responde "quem
 * vem"; esta responde "o que a agenda está pedindo de nós" — quem não
 * confirmou, quem faltou e ainda não foi procurado, quem o CRC marcou sozinho.
 * Ela é a agenda vista pelo lado do relacionamento.
 *
 * O AGRUPAMENTO É POR DIA LOCAL, e não por dia UTC. Uma consulta às 21h de
 * terça em São Paulo é quarta em UTC, e uma agenda que mostra o paciente no
 * dia errado é pior que agenda nenhuma.
 */
export const carregarAgenda = createServerFn({ method: "GET" })
  .validator((e: { de?: string; ate?: string }) => ({
    de: String(e.de ?? "").slice(0, 10),
    ate: String(e.ate ?? "").slice(0, 10),
  }))
  .handler(async ({ data }): Promise<Resposta<{ panorama: PanoramaDaAgenda }>> =>
    comContexto("ver_paciente", async (ctx) => {
      const { selecionar } = await import("./servidor/banco");
      const { lerConfiguracao } = await import("./servidor/configuracao");
      const { partesLocais } = await import("./dominio/configuracao");
      const { linhaParaAgendamento } = await import("./aplicacao/repositorios");

      const cfg = await lerConfiguracao(ctx.organizationId);
      const fuso = cfg.horarioComercial.fuso;

      // A janela padrão são catorze dias a partir de hoje: cobre a semana que
      // vem inteira, que é o horizonte em que a recepção age.
      const hoje = new Date();
      const de = data.de.length === 10 ? `${data.de}T00:00:00.000Z` : hoje.toISOString();
      const ate =
        data.ate.length === 10
          ? `${data.ate}T23:59:59.999Z`
          : new Date(hoje.getTime() + 14 * 86_400_000).toISOString();

      const linhas = await selecionar("crc_appointments", {
        filtros: [
          { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
          { coluna: "inicio_em", op: "gte", valor: de },
          { coluna: "inicio_em", op: "lte", valor: ate },
        ],
        ordenar: [{ coluna: "inicio_em", ascendente: true }],
        limite: 500,
      });

      const agendamentos = linhas.map(linhaParaAgendamento).filter((a) => ctx.alcanca(a.clinicId));

      // Os nomes numa consulta só. Um `select` por agendamento seria 200
      // viagens ao banco para desenhar duas semanas.
      const ids = [...new Set(agendamentos.map((a) => a.patientId).filter((v) => v !== null))];
      const pacientes =
        ids.length === 0
          ? []
          : await selecionar("crc_patients", {
              colunas: "id,nome,telefone",
              filtros: [
                { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
                { coluna: "id", op: "in", valor: ids },
              ],
              limite: 500,
            });

      const porId = new Map(
        pacientes.map((p) => [
          String(p["id"] ?? ""),
          {
            nome: typeof p["nome"] === "string" ? p["nome"] : "Paciente",
            telefone: typeof p["telefone"] === "string" ? p["telefone"] : null,
          },
        ]),
      );

      const porDia = new Map<string, ItemDaAgenda[]>();
      let aConfirmar = 0;

      for (const a of agendamentos) {
        const p = partesLocais(new Date(a.inicioEm), fuso);
        const dia = `${String(p.ano)}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
        const ficha = a.patientId === null ? undefined : porId.get(a.patientId);

        if (a.status === "TO_CONFIRM") aConfirmar += 1;

        const lista = porDia.get(dia) ?? [];
        lista.push({
          id: a.id,
          patientId: a.patientId,
          // Agendamento sem paciente ligado acontece: é a consulta de alguém
          // que ainda não foi sincronizado. Esconder seria pior — o horário
          // está ocupado de qualquer jeito.
          pacienteNome: ficha?.nome ?? "Sem paciente vinculado",
          pacienteTelefone: ficha?.telefone ?? null,
          dentistaNome: a.dentistaNome,
          inicioEm: a.inicioEm,
          fimEm: a.fimEm,
          status: a.status,
          descricao: a.descricao,
          peloCrc: (a.descricao ?? "").includes("JP CRC"),
        });
        porDia.set(dia, lista);
      }

      const dias = [...porDia.entries()]
        .map(([dia, itens]) => ({ dia, itens }))
        .sort((x, y) => x.dia.localeCompare(y.dia));

      return { ok: true as const, panorama: { de, ate, dias, aConfirmar } };
    }),
  );

/**
 * O resumo de jornada que a ficha mostra.
 *
 * NÃO é a `Jornada` do domínio, de propósito (item 138: Domain Model ≠ API
 * DTO). O modelo carrega `contexto: Record<string, unknown>`, que o validador
 * de serialização do Start recusa — e com razão, porque `unknown` não tem
 * garantia de atravessar a fronteira. A tela também não precisa dele: ela
 * mostra em que pé está a jornada e por que ela terminou.
 */
export type JornadaResumo = {
  id: string;
  automationId: string;
  status: Jornada["status"];
  passoAtual: number;
  resumeAt: string | null;
  saiuPor: string | null;
  criadoEm: string;
};

export type FichaPaciente = {
  paciente: Paciente;
  oportunidades: Oportunidade[];
  tarefas: Tarefa[];
  conversa: Conversa | null;
  jornadas: JornadaResumo[];
  timeline: ItemTimeline[];
};

/** Item 24: uma linha do tempo unificada, em ordem cronológica. */
export type ItemTimeline = {
  em: string;
  tipo: "consulta" | "mensagem" | "tarefa" | "oportunidade" | "automacao";
  titulo: string;
  detalhe: string;
};

export const carregarFichaPaciente = createServerFn({ method: "GET" })
  .validator((e: { patientId: string }) => ({ patientId: String(e.patientId ?? "") }))
  .handler(async ({ data }): Promise<Resposta<{ ficha: FichaPaciente }>> =>
    comContexto("ver_paciente", async (ctx) => {
      const { buscarPacientePorId, linhaParaAgendamento } =
        await import("./aplicacao/repositorios");
      const { listarOportunidades } = await import("./aplicacao/oportunidades");
      const { listarTarefas } = await import("./aplicacao/tarefas");
      const { buscarConversaDoPaciente, listarMensagens } = await import("./aplicacao/mensagens");
      const { jornadasDoPaciente } = await import("./automacao/motor");
      const { selecionar } = await import("./servidor/banco");
      const { ROTULO_STATUS_AGENDA, ROTULO_TIPO_OPORTUNIDADE, ROTULO_STATUS_JORNADA } =
        await import("./dominio/rotulos");

      const paciente = await buscarPacientePorId(ctx.organizationId, data.patientId);
      if (paciente === null) {
        return {
          ok: false as const,
          code: "NAO_ENCONTRADO",
          message: "Não encontramos este paciente.",
        };
      }
      if (!ctx.alcanca(paciente.clinicId)) {
        return {
          ok: false as const,
          code: "SEM_PERMISSAO",
          message: "Seu acesso não inclui esta unidade.",
        };
      }

      const [oportunidades, tarefas, conversa, jornadas, agendamentos] = await Promise.all([
        listarOportunidades({
          organizationId: ctx.organizationId,
          limite: 20,
          apenasAbertas: false,
        }).then((os) => os.filter((o) => o.patientId === paciente.id)),
        listarTarefas({
          organizationId: ctx.organizationId,
          patientId: paciente.id,
          status: ["OPEN", "IN_PROGRESS", "COMPLETED"],
          limite: 20,
        }),
        buscarConversaDoPaciente(ctx.organizationId, paciente),
        jornadasDoPaciente(ctx.organizationId, paciente.id),
        selecionar("crc_appointments", {
          filtros: [
            { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
            { coluna: "patient_id", op: "eq", valor: paciente.id },
          ],
          ordenar: [{ coluna: "inicio_em", ascendente: false }],
          limite: 30,
        }),
      ]);

      const mensagens =
        conversa === null ? [] : await listarMensagens(ctx.organizationId, conversa.id, 40);

      const timeline: ItemTimeline[] = [
        ...agendamentos.map(linhaParaAgendamento).map((a) => ({
          em: a.inicioEm,
          tipo: "consulta" as const,
          titulo: ROTULO_STATUS_AGENDA[a.status],
          detalhe: a.descricao ?? a.dentistaNome ?? "",
        })),
        ...mensagens.map((m) => ({
          em: m.criadoEm,
          tipo: "mensagem" as const,
          titulo: m.direcao === "ENTRADA" ? "Paciente escreveu" : "Enviamos uma mensagem",
          detalhe: m.conteudo.slice(0, 160),
        })),
        ...tarefas.map((t) => ({
          em: t.criadoEm,
          tipo: "tarefa" as const,
          titulo: t.titulo,
          detalhe: t.motivo ?? "",
        })),
        ...oportunidades.map((o) => ({
          em: o.criadoEm,
          tipo: "oportunidade" as const,
          titulo: ROTULO_TIPO_OPORTUNIDADE[o.tipo],
          detalhe: o.motivo ?? "",
        })),
        ...jornadas.map((j) => ({
          em: j.criadoEm,
          tipo: "automacao" as const,
          titulo: `Automação — ${ROTULO_STATUS_JORNADA[j.status]}`,
          detalhe: j.saiuPor ?? "",
        })),
      ].sort((a, b) => b.em.localeCompare(a.em));

      return {
        ok: true as const,
        ficha: {
          paciente,
          oportunidades,
          tarefas,
          conversa,
          jornadas: jornadas.map((j) => ({
            id: j.id,
            automationId: j.automationId,
            status: j.status,
            passoAtual: j.passoAtual,
            resumeAt: j.resumeAt,
            saiuPor: j.saiuPor,
            criadoEm: j.criadoEm,
          })),
          timeline,
        },
      };
    }),
  );

/* -------------------------------------------------------------------------- */
/* Oportunidades                                                              */
/* -------------------------------------------------------------------------- */

export const carregarFunil = createServerFn({ method: "GET" })
  // O filtro chega SEMPRE pelo mesmo validador que as visões salvas usam. Uma
  // visão salva é exatamente este objeto guardado com nome; validar nos dois
  // lugares com códigos diferentes seria criar duas verdades sobre o que é um
  // filtro válido.
  .validator((e: { filtros?: unknown }) => ({ filtros: e.filtros }))
  .handler(
    async ({
      data,
    }): Promise<
      Resposta<{
        etapas: { id: string; chave: string; nome: string; ordem: number; categoria: string }[];
        cartoes: (ItemPrioridade & { stageId: string | null })[];
      }>
    > =>
      comContexto("ver_oportunidade", async (ctx) => {
        const { listarEtapas } = await import("./aplicacao/repositorios");
        const { listarOportunidades } = await import("./aplicacao/oportunidades");
        const { faixaDePrioridade } = await import("./dominio/prioridade");
        const { ROTULO_TIPO_OPORTUNIDADE } = await import("./dominio/rotulos");
        const { lerFiltroFunil } = await import("./aplicacao/visoes");

        const filtro = lerFiltroFunil(data.filtros);

        const etapasTodas = await listarEtapas(ctx.organizationId);
        // A etapa vem por CHAVE e vira id aqui. Guardar o id na visão salva
        // amarraria o filtro a uma linha que pode ser recriada; a chave
        // sobrevive a uma reinstalação do funil.
        const etapaId =
          filtro.etapaChave === null
            ? undefined
            : etapasTodas.find((e) => e.chave === filtro.etapaChave)?.id;

        const [etapas, oportunidades] = await Promise.all([
          Promise.resolve(etapasTodas),
          listarOportunidades({
            organizationId: ctx.organizationId,
            clinicIds: ctx.clinicIds,
            ...(filtro.tipos.length > 0 ? { tipos: filtro.tipos } : {}),
            ...(etapaId === undefined ? {} : { etapaId }),
            ...(filtro.apenasMinhas ? { assignedTo: ctx.usuario.id } : {}),
            limite: 200,
          }),
        ]);

        const nomes = await carregarNomes(
          ctx.organizationId,
          oportunidades.map((o) => o.patientId).filter((p): p is string => p !== null),
        );

        return {
          ok: true as const,
          etapas: etapas.map((e) => ({ ...e, categoria: e.categoria })),
          cartoes: oportunidades.map((o) => ({
            opportunityId: o.id,
            patientId: o.patientId,
            nome: (o.patientId === null ? null : nomes.get(o.patientId)) ?? "Paciente sem nome",
            tipo: o.tipo,
            tipoRotulo: ROTULO_TIPO_OPORTUNIDADE[o.tipo],
            motivo: o.motivo ?? "",
            score: o.priorityScore,
            faixa: faixaDePrioridade(o.priorityScore),
            fatores: o.priorityFatores.map((f) => ({ rotulo: f.rotulo, pontos: f.pontos })),
            valorPotencial: o.potentialValue,
            proximaAcao: o.nextAction,
            ultimoContatoEm: null,
            temJornadaAtiva: false,
            stageId: o.stageId,
          })),
        };
      }),
  );

/* -------------------------------------------------------------------------- */
/* Equipe — item 37 e a auditoria do item 74                                  */
/* -------------------------------------------------------------------------- */

export type MembroDto = {
  id: string;
  nome: string;
  email: string;
  papel: string;
  papelRotulo: string;
  ativo: boolean;
  ultimoAcesso: string | null;
  souEu: boolean;
};

/**
 * Toda ação de equipe exige `gerenciar_usuarios`, que hoje só o admin tem.
 *
 * Item 70: a verificação é no servidor. A aba nem aparece para quem não pode,
 * mas esconder o botão é UX — quem chamar a rota direto leva o mesmo não.
 */
export const carregarEquipe = createServerFn({ method: "GET" }).handler(
  async (): Promise<Resposta<{ membros: MembroDto[] }>> =>
    comContexto("gerenciar_usuarios", async (ctx) => {
      const { listarEquipe } = await import("./aplicacao/equipe");
      const { ROTULO_PAPEL } = await import("./dominio/rotulos");

      const membros = await listarEquipe(ctx.organizationId, ctx.usuario.id);
      return {
        ok: true as const,
        membros: membros.map((m) => ({
          id: m.id,
          nome: m.nome,
          email: m.email,
          papel: m.papel,
          papelRotulo: ROTULO_PAPEL[m.papel],
          ativo: m.ativo,
          ultimoAcesso: m.ultimoAcesso,
          souEu: m.souEu,
        })),
      };
    }),
);

export const convidarMembroDaEquipe = createServerFn({ method: "POST" })
  .validator((e: { nome: string; email: string; senha: string; papel: string }) => ({
    nome: String(e.nome ?? ""),
    email: String(e.email ?? ""),
    // A senha NÃO é cortada nem normalizada: qualquer transformação aqui faria
    // a pessoa digitar uma senha e o sistema guardar outra.
    senha: String(e.senha ?? ""),
    papel: String(e.papel ?? ""),
  }))
  .handler(async ({ data }): Promise<RespostaSimples> =>
    comContexto("gerenciar_usuarios", async (ctx) => {
      const { convidarMembro, ehPapel } = await import("./aplicacao/equipe");

      if (!ehPapel(data.papel)) {
        return { ok: false as const, code: "ENTRADA_INVALIDA", message: "Papel desconhecido." };
      }

      const r = await convidarMembro({
        organizationId: ctx.organizationId,
        // As clínicas são as de quem convida. Um admin alcança todas; um dia,
        // um gestor de unidade convidaria só para a dele — e a regra já está
        // certa para esse dia.
        clinicIds: ctx.clinicIds,
        nome: data.nome,
        email: data.email,
        senha: data.senha,
        papel: data.papel,
        autorId: ctx.usuario.id,
      });

      if (!r.ok) return { ok: false as const, code: "ENTRADA_INVALIDA", message: r.motivo };
      return { ok: true as const };
    }),
  );

export const mudarPapelDoMembro = createServerFn({ method: "POST" })
  .validator((e: { userId: string; papel: string }) => ({
    userId: String(e.userId ?? ""),
    papel: String(e.papel ?? ""),
  }))
  .handler(async ({ data }): Promise<RespostaSimples> =>
    comContexto("gerenciar_usuarios", async (ctx) => {
      const { mudarPapel, ehPapel } = await import("./aplicacao/equipe");

      if (!ehPapel(data.papel)) {
        return { ok: false as const, code: "ENTRADA_INVALIDA", message: "Papel desconhecido." };
      }

      const r = await mudarPapel({
        organizationId: ctx.organizationId,
        userId: data.userId,
        papel: data.papel,
        autorId: ctx.usuario.id,
      });

      if (!r.ok) return { ok: false as const, code: "ENTRADA_INVALIDA", message: r.motivo };
      return { ok: true as const };
    }),
  );

/**
 * Troca a foto de perfil de QUEM ESTÁ PEDINDO. Sempre.
 *
 * Não recebe `userId` de propósito: se recebesse, viraria "trocar a foto de
 * alguém" e precisaria de permissão, de auditoria de quem mexeu em quem, e de
 * uma regra sobre o gestor poder editar o admin. Nada disso é necessário para
 * o caso real — cada pessoa põe a própria foto — e cada uma dessas regras é
 * uma chance de errar para o lado de expor.
 *
 * Por isso a permissão é `null`: qualquer pessoa autenticada mexe na sua, e em
 * nenhuma outra. O filtro do UPDATE carrega o id da sessão, não o do corpo.
 *
 * `dataUrl: null` remove a foto e volta às iniciais.
 */
export const salvarMinhaFoto = createServerFn({ method: "POST" })
  .validator((e: { dataUrl: string | null }) => ({
    dataUrl: typeof e.dataUrl === "string" ? e.dataUrl : null,
  }))
  .handler(async ({ data }): Promise<RespostaSimples> =>
    comContexto(null, async (ctx) => {
      const { atualizar, agoraIso } = await import("./servidor/banco");
      const { fotoValida } = await import("./aplicacao/repositorios");
      const { auditar } = await import("./servidor/registro");

      // A tela já reduz a imagem antes de enviar. Esta checagem existe porque
      // a tela pode ser contornada — é o mesmo raciocínio dos limites de
      // Configurações, que a tela mostra e o servidor repete.
      if (data.dataUrl !== null && !fotoValida(data.dataUrl)) {
        return {
          ok: false as const,
          code: "ENTRADA_INVALIDA",
          message:
            "A imagem precisa ser PNG, JPEG ou WebP e ter menos de 60 KB depois de reduzida.",
        };
      }

      await atualizar(
        "crc_users",
        [
          { coluna: "id", op: "eq", valor: ctx.usuario.id },
          { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
        ],
        { foto_url: data.dataUrl, atualizado_em: agoraIso() },
      );

      // O conteúdo da imagem não vai para a auditoria: interessa QUE mudou e
      // quem mudou, não 20 KB de base64 em cada linha do log.
      await auditar({
        organizationId: ctx.organizationId,
        userId: ctx.usuario.id,
        ator: "humano",
        acao: data.dataUrl === null ? "foto_removida" : "foto_alterada",
        entityType: "crc_users",
        entityId: ctx.usuario.id,
      });

      return { ok: true as const };
    }),
  );

/* -------------------------------------------------------------------------- */
/* Inbox 2.0 — dono da conversa e casos humanos (Fatia 5)                     */
/* -------------------------------------------------------------------------- */

export type CasoHumanoDto = {
  id: string;
  conversationId: string;
  patientId: string | null;
  status: string;
  motivo: string;
  motivoCodigo: string;
  prioridade: string;
  resumo: string | null;
  respostaBarrada: string | null;
  criadoEm: string;
  assumidoPor: string | null;
};

export const carregarCasosHumanos = createServerFn({ method: "GET" }).handler(
  async (): Promise<Resposta<{ casos: CasoHumanoDto[] }>> =>
    comContexto("ver_conversa", async (ctx) => {
      const { listarCasosAbertos } = await import("./aplicacao/casos");
      const casos = await listarCasosAbertos(ctx.organizationId);
      return { ok: true as const, casos };
    }),
);

/**
 * Assume a conversa. A IA cala a partir daqui.
 *
 * NÃO RECEBE `userId`: quem assume é quem está na sessão. Aceitar o id por
 * parâmetro criaria um jeito de assumir a conversa em nome de outra pessoa, e
 * a auditoria registraria a mentira sem saber.
 */
export const assumirConversaDaIa = createServerFn({ method: "POST" })
  .validator((e: { conversationId: string }) => ({
    conversationId: String(e.conversationId ?? ""),
  }))
  .handler(async ({ data }): Promise<RespostaSimples> =>
    comContexto("enviar_mensagem", async (ctx) => {
      const { assumirConversa } = await import("./aplicacao/casos");
      const { auditar } = await import("./servidor/registro");

      await assumirConversa(ctx.organizationId, data.conversationId, ctx.usuario.id);
      await auditar({
        organizationId: ctx.organizationId,
        userId: ctx.usuario.id,
        ator: "humano",
        acao: "conversa_assumida",
        entityType: "crc_conversations",
        entityId: data.conversationId,
      });
      return { ok: true as const };
    }),
  );

export const devolverConversaParaIa = createServerFn({ method: "POST" })
  .validator((e: { conversationId: string }) => ({
    conversationId: String(e.conversationId ?? ""),
  }))
  .handler(async ({ data }): Promise<RespostaSimples> =>
    comContexto("enviar_mensagem", async (ctx) => {
      const { devolverParaIa } = await import("./aplicacao/casos");
      const { auditar } = await import("./servidor/registro");

      await devolverParaIa(ctx.organizationId, data.conversationId);
      await auditar({
        organizationId: ctx.organizationId,
        userId: ctx.usuario.id,
        ator: "humano",
        acao: "conversa_devolvida_para_ia",
        entityType: "crc_conversations",
        entityId: data.conversationId,
      });
      return { ok: true as const };
    }),
  );

export const pausarIaDaConversa = createServerFn({ method: "POST" })
  .validator((e: { conversationId: string }) => ({
    conversationId: String(e.conversationId ?? ""),
  }))
  .handler(async ({ data }): Promise<RespostaSimples> =>
    comContexto("enviar_mensagem", async (ctx) => {
      const { pausarIaNaConversa } = await import("./aplicacao/casos");
      await pausarIaNaConversa(ctx.organizationId, data.conversationId);
      return { ok: true as const };
    }),
  );

export const assumirCasoHumano = createServerFn({ method: "POST" })
  .validator((e: { casoId: string }) => ({ casoId: String(e.casoId ?? "") }))
  .handler(async ({ data }): Promise<RespostaSimples> =>
    comContexto("enviar_mensagem", async (ctx) => {
      const { assumirCaso } = await import("./aplicacao/casos");
      await assumirCaso(ctx.organizationId, data.casoId, ctx.usuario.id);
      return { ok: true as const };
    }),
  );

export const resolverCasoHumano = createServerFn({ method: "POST" })
  .validator((e: { casoId: string; resolucao: string }) => ({
    casoId: String(e.casoId ?? ""),
    resolucao: String(e.resolucao ?? ""),
  }))
  .handler(async ({ data }): Promise<RespostaSimples> =>
    comContexto("enviar_mensagem", async (ctx) => {
      const { resolverCaso } = await import("./aplicacao/casos");
      await resolverCaso(ctx.organizationId, data.casoId, data.resolucao);
      return { ok: true as const };
    }),
  );

export const mudarAtivacaoDoMembro = createServerFn({ method: "POST" })
  .validator((e: { userId: string; ativo: boolean }) => ({
    userId: String(e.userId ?? ""),
    ativo: e.ativo === true,
  }))
  .handler(async ({ data }): Promise<RespostaSimples> =>
    comContexto("gerenciar_usuarios", async (ctx) => {
      const { mudarAtivacao } = await import("./aplicacao/equipe");

      const r = await mudarAtivacao({
        organizationId: ctx.organizationId,
        userId: data.userId,
        ativo: data.ativo,
        autorId: ctx.usuario.id,
      });

      if (!r.ok) return { ok: false as const, code: "ENTRADA_INVALIDA", message: r.motivo };
      return { ok: true as const };
    }),
  );

export const redefinirSenhaDoMembro = createServerFn({ method: "POST" })
  .validator((e: { userId: string; senha: string }) => ({
    userId: String(e.userId ?? ""),
    senha: String(e.senha ?? ""),
  }))
  .handler(async ({ data }): Promise<RespostaSimples> =>
    comContexto("gerenciar_usuarios", async (ctx) => {
      const { redefinirSenha } = await import("./aplicacao/equipe");

      const r = await redefinirSenha({
        organizationId: ctx.organizationId,
        userId: data.userId,
        senha: data.senha,
        autorId: ctx.usuario.id,
      });

      if (!r.ok) return { ok: false as const, code: "ENTRADA_INVALIDA", message: r.motivo };
      return { ok: true as const };
    }),
  );

/* -------------------------------------------------------------------------- */
/* Visões salvas — item 147                                                   */
/* -------------------------------------------------------------------------- */

export type VisaoDto = {
  id: string;
  nome: string;
  compartilhada: boolean;
  minha: boolean;
  tipos: string[];
  etapaChave: string | null;
  apenasMinhas: boolean;
};

/**
 * A visão vai para o cliente ACHATADA.
 *
 * O TanStack Start serializa o retorno, e um objeto aninhado dentro de outro
 * com união de tipos custa uma rodada de erro de serialização para cada campo
 * novo. Achatar aqui é o mesmo remédio do item 138.
 */
function paraDto(v: import("./aplicacao/visoes").VisaoSalva): VisaoDto {
  return {
    id: v.id,
    nome: v.nome,
    compartilhada: v.compartilhada,
    minha: v.minha,
    tipos: [...v.filtros.tipos],
    etapaChave: v.filtros.etapaChave,
    apenasMinhas: v.filtros.apenasMinhas,
  };
}

export const listarVisoesSalvas = createServerFn({ method: "GET" }).handler(
  async (): Promise<Resposta<{ visoes: VisaoDto[] }>> =>
    comContexto("ver_oportunidade", async (ctx) => {
      const { listarVisoes } = await import("./aplicacao/visoes");
      const visoes = await listarVisoes(ctx.organizationId, ctx.usuario.id, "funil");
      return { ok: true as const, visoes: visoes.map(paraDto) };
    }),
);

export const salvarVisaoSalva = createServerFn({ method: "POST" })
  .validator((e: { nome: string; compartilhada?: boolean; filtros?: unknown }) => ({
    nome: String(e.nome ?? ""),
    compartilhada: e.compartilhada === true,
    filtros: e.filtros,
  }))
  .handler(async ({ data }): Promise<Resposta<{ visao: VisaoDto }>> =>
    comContexto("ver_oportunidade", async (ctx) => {
      const { lerFiltroFunil, salvarVisao } = await import("./aplicacao/visoes");

      const r = await salvarVisao({
        organizationId: ctx.organizationId,
        userId: ctx.usuario.id,
        escopo: "funil",
        nome: data.nome,
        filtros: lerFiltroFunil(data.filtros),
        compartilhada: data.compartilhada,
      });

      if (!r.ok) return { ok: false as const, code: "ENTRADA_INVALIDA", message: r.motivo };
      return { ok: true as const, visao: paraDto(r.visao) };
    }),
  );

export const apagarVisaoSalva = createServerFn({ method: "POST" })
  .validator((e: { id: string }) => ({ id: String(e.id ?? "") }))
  .handler(async ({ data }): Promise<Resposta<{ apagada: true }>> =>
    comContexto("ver_oportunidade", async (ctx) => {
      const { apagarVisao } = await import("./aplicacao/visoes");
      // A exclusão filtra por autor no próprio DELETE. Uma visão compartilhada
      // por outra pessoa simplesmente não é atingida — sem erro, porque não
      // há nada a informar: a lista some do lado de quem apagou a sua.
      await apagarVisao(ctx.organizationId, ctx.usuario.id, data.id);
      return { ok: true as const, apagada: true as const };
    }),
  );

/* -------------------------------------------------------------------------- */
/* Importação de planilha — itens 55, 189 (orçamentos) e a cobrança           */
/* -------------------------------------------------------------------------- */

export type EscopoImportacao = "orcamentos" | "cobrancas";

/** O preview vai achatado: o item 138 de novo. */
export type LinhaPreviewDto = {
  paciente: string;
  identificado: boolean;
  aviso: string | null;
  valor: string;
  situacao: string;
  jaExiste: boolean;
};

export type PreviewDto = {
  linhas: LinhaPreviewDto[];
  falhas: { linha: number; erro: string; conteudo: string }[];
  total: number;
  novos: number;
  atualizados: number;
  semPaciente: number;
  comErro: number;
  valorTotal: string;
  /** Só na cobrança: quantas já passaram do limite da automação. */
  antigas: number | null;
};

/** Quantas linhas o preview manda para a tela. O resumo conta TODAS. */
const LINHAS_NO_PREVIEW = 50;

function escopoValido(bruto: string): EscopoImportacao {
  return bruto === "cobrancas" ? "cobrancas" : "orcamentos";
}

/**
 * O preview NUNCA grava.
 *
 * É a diferença entre uma importação que a pessoa confere e uma que ela
 * descobre depois. Item 189: "mostre 1.523 válidos, 41 avisos, 7 erros ANTES
 * de gravar". Um preview que grava é só um relatório tardio.
 */
export const previewDeImportacao = createServerFn({ method: "POST" })
  .validator((e: { escopo: string; conteudo: string }) => ({
    escopo: escopoValido(String(e.escopo ?? "")),
    conteudo: String(e.conteudo ?? ""),
  }))
  .handler(async ({ data }): Promise<Resposta<{ preview: PreviewDto }>> =>
    comContexto("importar_dados", async (ctx) => {
      if (data.conteudo.trim().length === 0) {
        return {
          ok: false as const,
          code: "ENTRADA_INVALIDA",
          message: "O arquivo está vazio.",
        };
      }

      if (data.escopo === "cobrancas") {
        const { gerarPreviewCobrancas } = await import("./aplicacao/cobrancas");
        const p = await gerarPreviewCobrancas(ctx.organizationId, data.conteudo);
        return {
          ok: true as const,
          preview: {
            linhas: p.validos.slice(0, LINHAS_NO_PREVIEW).map((l) => ({
              paciente: l.paciente,
              identificado: l.patientId !== null,
              aviso: l.avisoPaciente,
              valor: l.saldo,
              situacao: l.fase,
              jaExiste: l.jaExiste,
            })),
            falhas: p.falhas.slice(0, LINHAS_NO_PREVIEW),
            total: p.resumo.total,
            novos: p.resumo.novos,
            atualizados: p.resumo.atualizados,
            semPaciente: p.resumo.semPaciente,
            comErro: p.resumo.comErro,
            valorTotal: p.resumo.saldoTotal,
            antigas: p.resumo.antigas,
          },
        };
      }

      const { gerarPreview, provedorCsv } = await import("./aplicacao/orcamentos");
      const p = await gerarPreview(ctx.organizationId, provedorCsv(data.conteudo));
      return {
        ok: true as const,
        preview: {
          linhas: p.validos.slice(0, LINHAS_NO_PREVIEW).map((l) => ({
            paciente: l.paciente,
            identificado: l.patientId !== null,
            aviso: l.avisoPaciente,
            valor: l.totalValue,
            situacao: l.status,
            jaExiste: l.jaExiste,
          })),
          falhas: p.falhas.slice(0, LINHAS_NO_PREVIEW),
          total: p.resumo.total,
          novos: p.resumo.novos,
          atualizados: p.resumo.atualizados,
          semPaciente: p.resumo.semPaciente,
          comErro: p.resumo.comErro,
          valorTotal: p.resumo.valorTotal,
          antigas: null,
        },
      };
    }),
  );

export const confirmarImportacao = createServerFn({ method: "POST" })
  .validator((e: { escopo: string; conteudo: string }) => ({
    escopo: escopoValido(String(e.escopo ?? "")),
    conteudo: String(e.conteudo ?? ""),
  }))
  .handler(
    async ({
      data,
    }): Promise<
      Resposta<{
        criados: number;
        atualizados: number;
        falhados: number;
        semPaciente: number;
      }>
    > =>
      comContexto("importar_dados", async (ctx) => {
        // A clínica da importação é a PRIMEIRA do escopo de quem importa, e não
        // um parâmetro da tela: aceitar um `clinicId` do cliente abriria a porta
        // para gravar na unidade de outra pessoa (item 71).
        const clinicId = ctx.clinicIds[0];
        if (clinicId === undefined) {
          return {
            ok: false as const,
            code: "ENTRADA_INVALIDA",
            message: "Você não está associado a nenhuma clínica.",
          };
        }

        if (data.escopo === "cobrancas") {
          const { importarCobrancas } = await import("./aplicacao/cobrancas");
          const r = await importarCobrancas(
            ctx.organizationId,
            clinicId,
            data.conteudo,
            ctx.usuario.id,
          );
          return { ok: true as const, ...r };
        }

        const { importar, provedorCsv } = await import("./aplicacao/orcamentos");
        const r = await importar(
          ctx.organizationId,
          clinicId,
          provedorCsv(data.conteudo),
          ctx.usuario.id,
        );
        return { ok: true as const, ...r };
      }),
  );

export const moverOportunidade = createServerFn({ method: "POST" })
  .validator((e: { opportunityId: string; etapa: string; lostReason?: string }) => ({
    opportunityId: String(e.opportunityId ?? ""),
    etapa: String(e.etapa ?? ""),
    lostReason: e.lostReason === undefined ? undefined : String(e.lostReason).slice(0, 200),
  }))
  .handler(async ({ data }): Promise<Resposta<{ oportunidade: Oportunidade }>> =>
    comContexto("editar_oportunidade", async (ctx) => {
      const { moverEtapa } = await import("./aplicacao/oportunidades");

      const r = await moverEtapa({
        organizationId: ctx.organizationId,
        opportunityId: data.opportunityId,
        paraEtapaChave: data.etapa,
        ator: "humano",
        userId: ctx.usuario.id,
        requestId: ctx.requestId,
        ...(data.lostReason !== undefined ? { lostReason: data.lostReason } : {}),
      });

      if (!r.ok) {
        // Item 159: fechar como perdida SEM motivo é recusado, e a tela precisa
        // saber por quê para pedir o motivo em vez de mostrar "erro".
        const mensagens: Record<string, string> = {
          nao_encontrada: "Não encontramos esta oportunidade.",
          etapa_invalida: "Esta etapa não existe.",
          motivo_obrigatorio: "Informe o motivo da perda antes de fechar.",
        };
        return {
          ok: false as const,
          code: r.motivo.toUpperCase(),
          message: mensagens[r.motivo] ?? "Não foi possível mover a oportunidade.",
        };
      }

      return { ok: true as const, oportunidade: r.oportunidade };
    }),
  );

/* -------------------------------------------------------------------------- */
/* Tarefas                                                                    */
/* -------------------------------------------------------------------------- */

export const carregarMeuTrabalho = createServerFn({ method: "GET" }).handler(
  async (): Promise<Resposta<{ tarefas: Tarefa[]; nomes: Record<string, string> }>> =>
    comContexto("ver_tarefa", async (ctx) => {
      const { listarTarefas } = await import("./aplicacao/tarefas");

      const minhas = await listarTarefas({
        organizationId: ctx.organizationId,
        clinicIds: ctx.clinicIds,
        assignedTo: ctx.usuario.id,
        limite: 50,
      });

      // Item 187: tarefa sem responsável não pode ficar invisível. Ela aparece
      // na fila de todo mundo até alguém assumir.
      const semDono = await listarTarefas({
        organizationId: ctx.organizationId,
        clinicIds: ctx.clinicIds,
        assignedTo: null,
        limite: 30,
      });

      const tarefas = [...minhas, ...semDono];
      const nomes = await carregarNomes(
        ctx.organizationId,
        tarefas.map((t) => t.patientId).filter((p): p is string => p !== null),
      );

      return { ok: true as const, tarefas, nomes: Object.fromEntries(nomes) };
    }),
);

export const concluirTarefa = createServerFn({ method: "POST" })
  .validator((e: { taskId: string; notas?: string }) => ({
    taskId: String(e.taskId ?? ""),
    notas: e.notas === undefined ? undefined : String(e.notas).slice(0, 2000),
  }))
  .handler(async ({ data }): Promise<Resposta<{ tarefa: Tarefa }>> =>
    comContexto("editar_tarefa", async (ctx) => {
      const { mudarStatusTarefa } = await import("./aplicacao/tarefas");

      const tarefa = await mudarStatusTarefa({
        organizationId: ctx.organizationId,
        taskId: data.taskId,
        status: "COMPLETED",
        userId: ctx.usuario.id,
        ator: "humano",
        requestId: ctx.requestId,
        ...(data.notas !== undefined ? { notas: data.notas } : {}),
      });

      if (tarefa === null) {
        return {
          ok: false as const,
          code: "NAO_ENCONTRADO",
          message: "Não encontramos esta tarefa.",
        };
      }
      return { ok: true as const, tarefa };
    }),
  );

export const assumirTarefa = createServerFn({ method: "POST" })
  .validator((e: { taskId: string }) => ({ taskId: String(e.taskId ?? "") }))
  .handler(async ({ data }): Promise<RespostaSimples> =>
    comContexto("editar_tarefa", async (ctx) => {
      const { atribuirTarefa } = await import("./aplicacao/tarefas");
      await atribuirTarefa(ctx.organizationId, data.taskId, ctx.usuario.id, ctx.usuario.id);
      return { ok: true as const };
    }),
  );

export const criarTarefaManual = createServerFn({ method: "POST" })
  .validator((e: { patientId: string; titulo: string; tipo: string; prazoHoras: number }) => ({
    patientId: String(e.patientId ?? ""),
    titulo: String(e.titulo ?? "").slice(0, 200),
    tipo: String(e.tipo ?? "LIGAR"),
    prazoHoras: Number.isFinite(e.prazoHoras) ? Math.min(24 * 30, Math.max(1, e.prazoHoras)) : 24,
  }))
  .handler(async ({ data }): Promise<Resposta<{ tarefa: Tarefa | null }>> =>
    comContexto("editar_tarefa", async (ctx) => {
      const { criarTarefa } = await import("./aplicacao/tarefas");
      const { buscarPacientePorId } = await import("./aplicacao/repositorios");
      const { TIPOS_TAREFA } = await import("./dominio/tipos");

      if (data.titulo.trim().length < 3) {
        return { ok: false as const, code: "ENTRADA_INVALIDA", message: "Descreva a tarefa." };
      }

      const paciente = await buscarPacientePorId(ctx.organizationId, data.patientId);
      if (paciente === null || !ctx.alcanca(paciente.clinicId)) {
        return {
          ok: false as const,
          code: "NAO_ENCONTRADO",
          message: "Não encontramos este paciente.",
        };
      }

      const tipo = (TIPOS_TAREFA as readonly string[]).includes(data.tipo)
        ? (data.tipo as TipoTarefa)
        : "LIGAR";

      const tarefa = await criarTarefa({
        organizationId: ctx.organizationId,
        clinicId: paciente.clinicId,
        patientId: paciente.id,
        titulo: data.titulo.trim(),
        tipo,
        prazoHoras: data.prazoHoras,
        assignedTo: ctx.usuario.id,
        // O instante entra na chave: uma tarefa criada à mão é sempre nova, e
        // deduplicar por título impediria a equipe de registrar duas ligações.
        chaveDedupe: `manual:${paciente.id}:${Date.now().toString(36)}`,
        ator: "humano",
        userId: ctx.usuario.id,
        requestId: ctx.requestId,
      });

      return { ok: true as const, tarefa };
    }),
  );

/* -------------------------------------------------------------------------- */
/* Inbox                                                                      */
/* -------------------------------------------------------------------------- */

export const carregarInbox = createServerFn({ method: "GET" })
  .validator((e: { apenasNaoLidas?: boolean; apenasMinhas?: boolean }) => ({
    apenasNaoLidas: e.apenasNaoLidas === true,
    apenasMinhas: e.apenasMinhas === true,
  }))
  .handler(
    async ({ data }): Promise<Resposta<{ conversas: Conversa[]; nomes: Record<string, string> }>> =>
      comContexto("ver_conversa", async (ctx) => {
        const { listarConversas } = await import("./aplicacao/mensagens");

        const conversas = await listarConversas({
          organizationId: ctx.organizationId,
          clinicIds: ctx.clinicIds,
          apenasNaoLidas: data.apenasNaoLidas,
          ...(data.apenasMinhas ? { assignedTo: ctx.usuario.id } : {}),
          limite: 50,
        });

        const nomes = await carregarNomes(
          ctx.organizationId,
          conversas.map((c) => c.patientId).filter((p): p is string => p !== null),
        );

        return { ok: true as const, conversas, nomes: Object.fromEntries(nomes) };
      }),
  );

export const abrirConversa = createServerFn({ method: "POST" })
  .validator((e: { conversationId: string }) => ({
    conversationId: String(e.conversationId ?? ""),
  }))
  .handler(
    async ({ data }): Promise<Resposta<{ mensagens: Mensagem[]; bloqueadaPor: string | null }>> =>
      comContexto("ver_conversa", async (ctx) => {
        const { assumirConversa, listarMensagens, marcarConversaLida } =
          await import("./aplicacao/mensagens");

        const mensagens = await listarMensagens(ctx.organizationId, data.conversationId);
        await marcarConversaLida(ctx.organizationId, data.conversationId);

        // Item 41: quem abre assume, e o outro atendente vê que já tem dono.
        const lock = await assumirConversa(ctx.organizationId, data.conversationId, ctx.usuario.id);

        return { ok: true as const, mensagens, bloqueadaPor: lock.ok ? null : lock.bloqueadaPor };
      }),
  );

export const responderConversa = createServerFn({ method: "POST" })
  .validator((e: { conversationId: string; texto: string; notaInterna?: boolean }) => ({
    conversationId: String(e.conversationId ?? ""),
    texto: String(e.texto ?? "").slice(0, 4000),
    notaInterna: e.notaInterna === true,
  }))
  .handler(async ({ data }): Promise<Resposta<{ mensagem: Mensagem | null }>> =>
    comContexto("enviar_mensagem", async (ctx) => {
      const { enviarMensagem, registrarNotaInterna } = await import("./aplicacao/mensagens");
      const { criarProvedorMensageria } = await import("./integracoes/whatsapp/provedores");
      const { lerConfiguracao, lerKillSwitches } = await import("./servidor/configuracao");
      const { selecionarUm } = await import("./servidor/banco");
      const { linhaParaConversa, linhaParaMensagem } = await import("./aplicacao/repositorios");

      if (data.texto.trim().length === 0) {
        return { ok: false as const, code: "ENTRADA_INVALIDA", message: "Escreva a mensagem." };
      }

      const linha = await selecionarUm("crc_conversations", {
        filtros: [
          { coluna: "id", op: "eq", valor: data.conversationId },
          { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
        ],
      });
      if (linha === null) {
        return {
          ok: false as const,
          code: "NAO_ENCONTRADO",
          message: "Não encontramos esta conversa.",
        };
      }
      const conversa = linhaParaConversa(linha);
      if (!ctx.alcanca(conversa.clinicId)) {
        return {
          ok: false as const,
          code: "SEM_PERMISSAO",
          message: "Seu acesso não inclui esta unidade.",
        };
      }

      // Item 163: nota interna NUNCA toca o provedor.
      if (data.notaInterna) {
        const mensagem = await registrarNotaInterna(
          ctx.organizationId,
          conversa.id,
          conversa.patientId,
          data.texto.trim(),
          ctx.usuario.id,
        );
        return { ok: true as const, mensagem };
      }

      const switches = await lerKillSwitches(ctx.organizationId);
      if (switches["kill_envios"] === true) {
        return {
          ok: false as const,
          code: "INTEGRACAO_INDISPONIVEL",
          message: "Os envios estão pausados por um administrador.",
        };
      }

      const provedor = criarProvedorMensageria(ctx.organizationId);
      if (!provedor.configurado) {
        return {
          ok: false as const,
          code: "INTEGRACAO_NAO_CONFIGURADA",
          message: `${provedor.motivo} Falta configurar: ${provedor.faltando.join(", ")}.`,
        };
      }

      const envio = await enviarMensagem({
        organizationId: ctx.organizationId,
        clinicId: conversa.clinicId,
        patientId: conversa.patientId,
        conversationId: conversa.id,
        telefone: conversa.contatoExterno,
        texto: data.texto.trim(),
        // O atendente respondendo NÃO é envio proativo: ele está numa conversa
        // em andamento, e recusar por horário comercial deixaria o paciente
        // falando sozinho.
        proativo: false,
        chaveDedupe: `manual:${conversa.id}:${Date.now().toString(36)}`,
        remetente: "atendente",
        autorId: ctx.usuario.id,
        porta: provedor.porta,
        configuracao: await lerConfiguracao(ctx.organizationId),
      });

      if (!envio.ok) {
        return { ok: false as const, code: envio.codigo, message: envio.motivo };
      }

      const gravada = await selecionarUm("crc_messages", {
        filtros: [{ coluna: "id", op: "eq", valor: envio.mensagemId }],
      });

      return { ok: true as const, mensagem: gravada === null ? null : linhaParaMensagem(gravada) };
    }),
  );

/* -------------------------------------------------------------------------- */
/* Automações                                                                 */
/* -------------------------------------------------------------------------- */

export type ResumoAutomacao = {
  id: string;
  chave: string;
  nome: string;
  descricao: string | null;
  status: string;
  modo: string;
  emJornada: number;
  concluidasNoMes: number;
  saidasPorConversao: number;
  /**
   * O que a jornada pode gastar de WhatsApp por paciente.
   *
   * Vem do servidor, e não do cliente, porque depende da DEFINIÇÃO ATIVA da
   * automação — que o gestor pode ter editado. Calcular no cliente a partir do
   * catálogo embutido mostraria o custo do que o sistema veio de fábrica, e não
   * o do que ele está fazendo hoje.
   */
  custo: {
    mensagens: number;
    /** Quantas de cada categoria — a jornada pode misturar, e quase sempre mistura. */
    porCategoria: Record<string, number>;
    atePorPaciente: number;
  };
};

export const carregarAutomacoes = createServerFn({ method: "GET" }).handler(
  async (): Promise<Resposta<{ automacoes: ResumoAutomacao[] }>> =>
    comContexto("ver_automacao", async (ctx) => {
      const { listarAutomacoes } = await import("./automacao/catalogo");
      const { contar, selecionar } = await import("./servidor/banco");
      const { perfilDeCustoDaJornada } = await import("./dominio/custo");

      const agora = new Date();
      const inicioDoMes = new Date(agora);
      inicioDoMes.setUTCDate(1);
      inicioDoMes.setUTCHours(0, 0, 0, 0);

      const automacoes = await listarAutomacoes(ctx.organizationId);

      // As definições ativas em UMA consulta, e não uma por automação: são
      // dez automações, e dez idas ao banco dentro de um laço que já faz três
      // contagens cada é como uma tela de listagem vira lenta.
      const versoes =
        automacoes.length === 0
          ? []
          : await selecionar("crc_automation_versions", {
              colunas: "automation_id,versao,definicao",
              filtros: [{ coluna: "automation_id", op: "in", valor: automacoes.map((a) => a.id) }],
              limite: 500,
            });

      const modelosPorAutomacao = new Map<string, string[]>();
      for (const a of automacoes) {
        const linha = versoes.find(
          (v) => String(v["automation_id"] ?? "") === a.id && v["versao"] === a.versaoAtiva,
        );
        const definicao = linha?.["definicao"];
        const passos =
          typeof definicao === "object" && definicao !== null
            ? (definicao as { passos?: unknown }).passos
            : null;

        const chaves: string[] = [];
        if (Array.isArray(passos)) {
          for (const p of passos) {
            if (typeof p !== "object" || p === null) continue;
            const passo = p as { tipo?: unknown; template?: unknown };
            if (passo.tipo !== "ENVIAR_TEMPLATE") continue;
            if (typeof passo.template === "string") chaves.push(passo.template);
          }
        }
        modelosPorAutomacao.set(a.id, chaves);
      }

      const resumos: ResumoAutomacao[] = [];
      for (const a of automacoes) {
        const [emJornada, concluidas, convertidas] = await Promise.all([
          contar("crc_automation_enrollments", [
            { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
            { coluna: "automation_id", op: "eq", valor: a.id },
            { coluna: "status", op: "in", valor: ["ACTIVE", "WAITING"] },
          ]),
          contar("crc_automation_enrollments", [
            { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
            { coluna: "automation_id", op: "eq", valor: a.id },
            { coluna: "concluido_em", op: "gte", valor: inicioDoMes.toISOString() },
          ]),
          // A métrica que importa (item 261): não "mensagens enviadas", mas
          // pacientes que saíram porque agendaram.
          contar("crc_automation_enrollments", [
            { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
            { coluna: "automation_id", op: "eq", valor: a.id },
            { coluna: "saiu_por", op: "eq", valor: "paciente_agendou" },
            { coluna: "concluido_em", op: "gte", valor: inicioDoMes.toISOString() },
          ]),
        ]);

        const perfil = perfilDeCustoDaJornada(modelosPorAutomacao.get(a.id) ?? [], agora);

        resumos.push({
          ...a,
          emJornada,
          concluidasNoMes: concluidas,
          saidasPorConversao: convertidas,
          custo: {
            mensagens: perfil.mensagens,
            porCategoria: { ...perfil.porCategoria },
            atePorPaciente: perfil.custoMaximoPorPaciente,
          },
        });
      }

      return { ok: true as const, automacoes: resumos };
    }),
);

export const mudarEstadoAutomacao = createServerFn({ method: "POST" })
  .validator((e: { automationId: string; status?: string; modo?: string }) => ({
    automationId: String(e.automationId ?? ""),
    status: e.status === undefined ? undefined : String(e.status),
    modo: e.modo === undefined ? undefined : String(e.modo),
  }))
  .handler(async ({ data }): Promise<RespostaSimples> =>
    comContexto("gerenciar_automacao", async (ctx) => {
      const { atualizar, selecionarUm } = await import("./servidor/banco");
      const { auditar } = await import("./servidor/registro");
      const { pode } = await import("./dominio/rbac");

      const STATUS = ["RASCUNHO", "ATIVA", "PAUSADA"];
      const MODOS = ["SHADOW", "RECOMENDAR", "EXECUTAR"];

      if (data.status !== undefined && !STATUS.includes(data.status)) {
        return { ok: false as const, code: "ENTRADA_INVALIDA", message: "Estado inválido." };
      }
      if (data.modo !== undefined && !MODOS.includes(data.modo)) {
        return { ok: false as const, code: "ENTRADA_INVALIDA", message: "Modo inválido." };
      }

      // Item 227: só admin e gestor sobem o nível de autonomia. `gerenciar_
      // automacao` deixa pausar e ativar; ligar o EXECUTAR é outra decisão.
      if (data.modo === "EXECUTAR" && !pode(ctx.usuario.papel, "gerenciar_autopilot")) {
        return {
          ok: false as const,
          code: "SEM_PERMISSAO",
          message: "Só um gestor pode colocar a automação para enviar mensagens.",
        };
      }

      const antes = await selecionarUm("crc_automations", {
        colunas: "status,modo,nome",
        filtros: [
          { coluna: "id", op: "eq", valor: data.automationId },
          { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
        ],
      });
      if (antes === null) {
        return {
          ok: false as const,
          code: "NAO_ENCONTRADO",
          message: "Não encontramos esta automação.",
        };
      }

      await atualizar(
        "crc_automations",
        [
          { coluna: "id", op: "eq", valor: data.automationId },
          { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
        ],
        {
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.modo !== undefined ? { modo: data.modo } : {}),
          atualizado_em: new Date().toISOString(),
        },
      );

      await auditar({
        organizationId: ctx.organizationId,
        userId: ctx.usuario.id,
        ator: "humano",
        acao: "automacao.estado_alterado",
        entityType: "automation",
        entityId: data.automationId,
        antes: { status: antes["status"], modo: antes["modo"] },
        depois: { status: data.status ?? antes["status"], modo: data.modo ?? antes["modo"] },
        requestId: ctx.requestId,
      });

      return { ok: true as const };
    }),
  );

/* -------------------------------------------------------------------------- */
/* Integrações e administração                                                */
/* -------------------------------------------------------------------------- */

/**
 * O que a tela de sincronização mostra (item 135).
 *
 * Campos concretos, e não o `ResumoSync` do domínio: aquele carrega tipos que
 * o validador de serialização do Start recusa atravessar. Além disso, é este
 * DTO que define o que a tela precisa — e ele não precisa do `cursor`.
 */
export type ResumoSyncDto = {
  recurso: string;
  paginas: number;
  processados: number;
  criados: number;
  atualizados: number;
  falhados: number;
  duracaoMs: number;
  erro: string | null;
};

/** Uma linha do debugger de jornada (item 179). */
export type PassoJornadaDto = {
  passo: number | null;
  tipo: string;
  descricao: string;
  em: string;
  /**
   * O TEXTO que saiu — ou que teria saído, no modo simulação.
   *
   * É o campo que dá sentido ao item 96. Sem ele o histórico diz "teria
   * enviado (automação em modo SHADOW)" e a pessoa que precisa decidir se liga
   * o envio não consegue ler a mensagem que estaria decidindo liberar.
   */
  texto: string | null;
  /** O nome do template, quando o passo foi de mensagem. */
  template: string | null;
};

/** Uma jornada na lista de uma automação. */
export type JornadaDaAutomacaoDto = {
  id: string;
  paciente: string;
  status: string;
  statusRotulo: string;
  passoAtual: number;
  saiuPor: string | null;
  criadoEm: string;
};

export type EstadoIntegracoes = {
  dentalOffice: { conectado: boolean; adapter: string; detalhe: string; faltando: string[] };
  whatsapp: { conectado: boolean; adapter: string; detalhe: string; faltando: string[] };
  ia: { conectado: boolean; adapter: string; detalhe: string; faltando: string[] };
  sincronizacao: {
    recurso: string;
    ultimaEm: string | null;
    ultimaComSucessoEm: string | null;
    status: string;
  }[];
  killSwitches: Record<string, boolean>;
  flags: Record<string, boolean>;
};

export const carregarIntegracoes = createServerFn({ method: "GET" }).handler(
  async (): Promise<Resposta<{ estado: EstadoIntegracoes }>> =>
    comContexto("ver_integracoes", async (ctx) => {
      const { criarClienteDentalOffice } = await import("./integracoes/dental-office/cliente");
      const { criarProvedorMensageria } = await import("./integracoes/whatsapp/provedores");
      const { criarProvedorIa } = await import("./integracoes/ia/provedor");
      const { lerEstadoDeSincronizacao } = await import("./aplicacao/sincronizacao");
      const { lerFlags, lerKillSwitches } = await import("./servidor/configuracao");

      const dental = criarClienteDentalOffice({ organizationId: ctx.organizationId });
      const zap = criarProvedorMensageria(ctx.organizationId);
      const ia = criarProvedorIa(ctx.organizationId);

      return {
        ok: true as const,
        estado: {
          dentalOffice: dental.ok
            ? {
                conectado: true,
                adapter: dental.cliente.nome,
                detalhe:
                  dental.cliente.nome === "sandbox"
                    ? "Rodando com dados de exemplo — nenhuma chamada real."
                    : "Credenciais configuradas.",
                faltando: [],
              }
            : { conectado: false, adapter: "—", detalhe: dental.motivo, faltando: dental.faltando },
          whatsapp: zap.configurado
            ? {
                conectado: true,
                adapter: zap.porta.nome,
                detalhe:
                  zap.porta.nome === "sandbox"
                    ? "Registrando mensagens sem enviar."
                    : zap.porta.nome === "twilio"
                      ? "Twilio configurado."
                      : "Meta Cloud API configurada.",
                faltando: [],
              }
            : { conectado: false, adapter: "—", detalhe: zap.motivo, faltando: zap.faltando },
          ia: ia.configurado
            ? {
                conectado: true,
                adapter: ia.porta.nome,
                detalhe: `Modelo ${ia.porta.modelo}.`,
                faltando: [],
              }
            : { conectado: false, adapter: "—", detalhe: ia.motivo, faltando: ia.faltando },
          sincronizacao: await lerEstadoDeSincronizacao(ctx.organizationId),
          killSwitches: await lerKillSwitches(ctx.organizationId),
          flags: await lerFlags(ctx.organizationId),
        },
      };
    }),
);

/** Item 133: autentica e faz um GET pequeno. Nunca altera dado. */
export const testarConexaoDentalOffice = createServerFn({ method: "POST" }).handler(
  async (): Promise<Resposta<{ detalhe: string }>> =>
    comContexto("gerenciar_integracoes", async (ctx) => {
      const { criarClienteDentalOffice } = await import("./integracoes/dental-office/cliente");

      const cliente = criarClienteDentalOffice({
        organizationId: ctx.organizationId,
        requestId: ctx.requestId,
      });
      if (!cliente.ok) {
        return {
          ok: false as const,
          code: "INTEGRACAO_NAO_CONFIGURADA",
          message: `${cliente.motivo} Falta configurar: ${cliente.faltando.join(", ")}.`,
        };
      }

      const r = await cliente.cliente.testarConexao();
      if (!r.ok) {
        return { ok: false as const, code: "INTEGRACAO_INDISPONIVEL", message: r.detalhe };
      }
      return { ok: true as const, detalhe: r.detalhe };
    }),
);

/** Item 134: o botão "Sincronizar agora" inicia um job REAL. */
export const sincronizarAgora = createServerFn({ method: "POST" }).handler(
  async (): Promise<Resposta<{ pacientes: ResumoSyncDto; agenda: ResumoSyncDto }>> =>
    comContexto("gerenciar_integracoes", async (ctx) => {
      const { criarClienteDentalOffice } = await import("./integracoes/dental-office/cliente");
      const { sincronizarAgendamentos, sincronizarDentistas, sincronizarPacientes } =
        await import("./aplicacao/sincronizacao");
      const { selecionarUm } = await import("./servidor/banco");

      const cliente = criarClienteDentalOffice({
        organizationId: ctx.organizationId,
        requestId: ctx.requestId,
      });
      if (!cliente.ok) {
        return {
          ok: false as const,
          code: "INTEGRACAO_NAO_CONFIGURADA",
          message: `${cliente.motivo} Falta configurar: ${cliente.faltando.join(", ")}.`,
        };
      }

      const clinica = await selecionarUm("crc_clinics", {
        colunas: "id,external_id",
        filtros: [
          { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
          { coluna: "ativa", op: "eq", valor: true },
        ],
      });
      if (clinica === null) {
        return {
          ok: false as const,
          code: "NAO_ENCONTRADO",
          message: "Nenhuma clínica cadastrada.",
        };
      }

      const contexto = {
        organizationId: ctx.organizationId,
        clinicId: String(clinica["id"] ?? ""),
        clinicaExternaId: String(clinica["external_id"] ?? ""),
        cliente: cliente.cliente,
        requestId: ctx.requestId,
      };

      // Pacientes ANTES da agenda, sempre: o agendamento precisa do paciente
      // para ligar `patient_id`. Na ordem inversa, a primeira sincronização
      // gravaria a agenda inteira sem dono.
      const pacientes = await sincronizarPacientes(contexto);
      // Dentistas ANTES da agenda, pelo mesmo motivo do cron: sem eles, não há
      // por quem perguntar horário livre.
      await sincronizarDentistas(contexto);
      const agenda = await sincronizarAgendamentos(contexto);

      const paraDto = (r: Awaited<ReturnType<typeof sincronizarPacientes>>): ResumoSyncDto => ({
        recurso: r.recurso,
        paginas: r.paginas,
        processados: r.processados,
        criados: r.criados,
        atualizados: r.atualizados,
        falhados: r.falhados,
        duracaoMs: r.duracaoMs,
        erro: r.erro,
      });

      return { ok: true as const, pacientes: paraDto(pacientes), agenda: paraDto(agenda) };
    }),
);

export const acionarInterruptor = createServerFn({ method: "POST" })
  .validator((e: { chave: string; ligado: boolean }) => ({
    chave: String(e.chave ?? ""),
    ligado: e.ligado === true,
  }))
  .handler(async ({ data }): Promise<RespostaSimples> =>
    comContexto("gerenciar_integracoes", async (ctx) => {
      const { KILL_SWITCHES } = await import("./dominio/configuracao");
      const { acionarKillSwitch } = await import("./servidor/configuracao");

      const validas = Object.values(KILL_SWITCHES) as string[];
      if (!validas.includes(data.chave)) {
        return {
          ok: false as const,
          code: "ENTRADA_INVALIDA",
          message: "Interruptor desconhecido.",
        };
      }

      await acionarKillSwitch(
        ctx.organizationId,
        data.chave as (typeof KILL_SWITCHES)[keyof typeof KILL_SWITCHES],
        data.ligado,
        ctx.usuario.id,
      );
      return { ok: true as const };
    }),
  );

/* -------------------------------------------------------------------------- */
/* Dashboard do gestor (Milestone 9)                                          */
/* -------------------------------------------------------------------------- */

export type PanoramaDto = import("./aplicacao/analytics").PanoramaGestor;

/**
 * O painel executivo.
 *
 * Exige `ver_analytics_gerencial`, que o papel `crc` NÃO tem — item 182: o
 * atendente nao precisa ver ROAS na tela principal, e o gestor nao precisa
 * ver todas as conversas abertas de imediato. Sao dois trabalhos diferentes.
 */
export const carregarPanorama = createServerFn({ method: "GET" }).handler(
  async (): Promise<Resposta<{ panorama: PanoramaDto }>> =>
    comContexto("ver_analytics_gerencial", async (ctx) => {
      const { panoramaDoGestor } = await import("./aplicacao/analytics");
      return { ok: true as const, panorama: await panoramaDoGestor(ctx.organizationId) };
    }),
);

/* -------------------------------------------------------------------------- */
/* Campanhas                                                                  */
/* -------------------------------------------------------------------------- */

export type CampanhaDto = {
  id: string;
  nome: string;
  mensagem: string;
  status: string;
  porDia: number;
  publico: number;
  enviadas: number;
  puladas: number;
  pendentes: number;
  diasSemVoltar: number | null;
  diasSemVoltarAte: number | null;
  semConsultaFutura: boolean;
  especialidade: string | null;
  convenio: string | null;
  situacao: string | null;
};

/**
 * Campanha exige `gerenciar_automacao`, e não `enviar_mensagem`.
 *
 * Responder um paciente é atendimento; falar com novecentos de uma vez é
 * decisão de operação. São coisas de tamanho diferente e não deviam caber na
 * mesma permissão — a recepção responde conversa e não dispara campanha.
 */
export const carregarCampanhas = createServerFn({ method: "GET" }).handler(
  async (): Promise<Resposta<{ campanhas: CampanhaDto[] }>> =>
    comContexto("gerenciar_automacao", async (ctx) => {
      const { listarCampanhas } = await import("./aplicacao/campanhas");
      const campanhas = await listarCampanhas(ctx.organizationId);
      return {
        ok: true as const,
        campanhas: campanhas.map((c) => ({
          id: c.id,
          nome: c.nome,
          mensagem: c.mensagem,
          status: c.status,
          porDia: c.porDia,
          publico: c.publico,
          enviadas: c.enviadas,
          puladas: c.puladas,
          pendentes: c.pendentes,
          diasSemVoltar: c.filtros.diasSemVoltar,
          diasSemVoltarAte: c.filtros.diasSemVoltarAte,
          semConsultaFutura: c.filtros.semConsultaFutura,
          especialidade: c.filtros.especialidade,
          convenio: c.filtros.convenio,
          situacao: c.filtros.situacao,
        })),
      };
    }),
);

/**
 * As opções de filtro que existem na base.
 *
 * Vem do banco, e não de uma lista fixa: é o que impede um filtro digitado
 * errado casar com ninguém, e o que faz o campo de convênio sumir da tela
 * enquanto o Dental Office não informar o campo.
 */
export const carregarOpcoesDePublico = createServerFn({ method: "GET" }).handler(
  async (): Promise<Resposta<{ especialidades: string[]; convenios: string[] }>> =>
    comContexto("gerenciar_automacao", async (ctx) => {
      const { opcoesDoPublico } = await import("./aplicacao/campanhas");
      return { ok: true as const, ...(await opcoesDoPublico(ctx.organizationId)) };
    }),
);

/** O número que a tela mostra ANTES de qualquer envio, e que muda com o filtro. */
export const contarPublicoDaCampanha = createServerFn({ method: "POST" })
  .validator((e: { filtros?: unknown }) => ({ filtros: e.filtros }))
  .handler(async ({ data }): Promise<Resposta<{ quantidade: number }>> =>
    comContexto("gerenciar_automacao", async (ctx) => {
      const { contarPublico, lerFiltroPublico } = await import("./aplicacao/campanhas");
      const quantidade = await contarPublico(ctx.organizationId, lerFiltroPublico(data.filtros));
      return { ok: true as const, quantidade };
    }),
  );

export const criarCampanhaNova = createServerFn({ method: "POST" })
  .validator((e: { nome: string; mensagem: string; porDia: number; filtros?: unknown }) => ({
    nome: String(e.nome ?? ""),
    mensagem: String(e.mensagem ?? ""),
    porDia: Number.isFinite(e.porDia) ? e.porDia : 120,
    filtros: e.filtros,
  }))
  .handler(async ({ data }): Promise<RespostaSimples> =>
    comContexto("gerenciar_automacao", async (ctx) => {
      const { criarCampanha, lerFiltroPublico } = await import("./aplicacao/campanhas");
      const r = await criarCampanha({
        organizationId: ctx.organizationId,
        clinicId: ctx.clinicIds[0] ?? null,
        nome: data.nome,
        mensagem: data.mensagem,
        filtros: lerFiltroPublico(data.filtros),
        porDia: data.porDia,
        autorId: ctx.usuario.id,
      });
      if (!r.ok) return { ok: false as const, code: "ENTRADA_INVALIDA", message: r.motivo };
      return { ok: true as const };
    }),
  );

/** O "Revisar e agendar": congela o público e põe a campanha na fila. */
export const agendarCampanhaExistente = createServerFn({ method: "POST" })
  .validator((e: { campaignId: string }) => ({ campaignId: String(e.campaignId ?? "") }))
  .handler(async ({ data }): Promise<RespostaSimples> =>
    comContexto("gerenciar_automacao", async (ctx) => {
      const { agendarCampanha } = await import("./aplicacao/campanhas");
      const r = await agendarCampanha({
        organizationId: ctx.organizationId,
        campaignId: data.campaignId,
        autorId: ctx.usuario.id,
      });
      if (!r.ok) return { ok: false as const, code: "ENTRADA_INVALIDA", message: r.motivo };
      return { ok: true as const };
    }),
  );

export const pausarOuRetomarCampanha = createServerFn({ method: "POST" })
  .validator((e: { campaignId: string; pausar: boolean }) => ({
    campaignId: String(e.campaignId ?? ""),
    pausar: e.pausar === true,
  }))
  .handler(async ({ data }): Promise<RespostaSimples> =>
    comContexto("gerenciar_automacao", async (ctx) => {
      const { mudarStatusCampanha } = await import("./aplicacao/campanhas");
      await mudarStatusCampanha({
        organizationId: ctx.organizationId,
        campaignId: data.campaignId,
        status: data.pausar ? "PAUSADA" : "RODANDO",
        autorId: ctx.usuario.id,
      });
      return { ok: true as const };
    }),
  );

/* -------------------------------------------------------------------------- */
/* Investimento em anúncios e custo por paciente                              */
/* -------------------------------------------------------------------------- */

export type LancamentoDto = {
  id: string;
  mes: string;
  campanha: string;
  canal: string;
  valor: string;
  observacao: string | null;
};

export type InvestimentoDto = {
  periodo: string;
  investido: string;
  temInvestimento: boolean;
  etapas: { chave: string; rotulo: string; quantidade: number; custoUnitario: string | null }[];
  campanhas: {
    campanha: string;
    investido: string;
    leads: number;
    compareceram: number;
    custoPorPaciente: string | null;
  }[];
  lancamentos: LancamentoDto[];
};

/**
 * O gasto é dado FINANCEIRO, e a permissão é a do item 229.
 *
 * `ver_analytics_gerencial` não basta: marketing enxerga campanha e funil sem
 * enxergar valor de orçamento, e faria pouco sentido esconder o valor do
 * tratamento e mostrar o quanto a clínica gasta por mês.
 */
export const carregarInvestimento = createServerFn({ method: "GET" })
  .validator((e: { mes?: string }) => ({ mes: String(e.mes ?? "") }))
  .handler(async ({ data }): Promise<Resposta<{ investimento: InvestimentoDto }>> =>
    comContexto("ver_financeiro", async (ctx) => {
      const { panoramaDeInvestimento, listarLancamentos, primeiroDiaDoMes } =
        await import("./aplicacao/investimento");
      const { ultimosMeses } = await import("./aplicacao/analytics");

      const meses = ultimosMeses(1);
      const corrente = meses[0];
      if (corrente === undefined) {
        return { ok: false as const, code: "ERRO_INTERNO", message: "Período inválido." };
      }

      // O mês pedido pela tela, ou o corrente. `primeiroDiaDoMes` recusa
      // qualquer coisa que não seja AAAA-MM, então texto solto não vira filtro.
      const escolhido = data.mes.length > 0 ? primeiroDiaDoMes(data.mes) : null;
      const periodo =
        escolhido === null
          ? corrente
          : {
              de: `${escolhido}T00:00:00.000Z`,
              ate: new Date(
                Date.UTC(
                  Number.parseInt(escolhido.slice(0, 4), 10),
                  Number.parseInt(escolhido.slice(5, 7), 10),
                  1,
                ),
              ).toISOString(),
              rotulo: escolhido.slice(0, 7),
            };

      const [panorama, lancamentos] = await Promise.all([
        panoramaDeInvestimento(ctx.organizationId, periodo),
        listarLancamentos(ctx.organizationId),
      ]);

      // O MÊS EM ISO, e não `periodo.rotulo`. O rótulo é "set. de 26" — texto
      // para humano. Mandar ele como se fosse data fez a tela escrever
      // "set. de 26-01", que é o tipo de erro que sobrevive a uma revisão
      // inteira porque ninguém lê o rótulo com atenção.
      const mesIso = primeiroDiaDoMes(periodo.de) ?? periodo.de.slice(0, 10);

      return {
        ok: true as const,
        investimento: { periodo: mesIso, ...panorama, lancamentos },
      };
    }),
  );

export const lancarInvestimentoDoMes = createServerFn({ method: "POST" })
  .validator(
    (e: { mes: string; campanha: string; canal: string; valor: number; observacao?: string }) => ({
      mes: String(e.mes ?? ""),
      campanha: String(e.campanha ?? ""),
      canal: String(e.canal ?? "OUTRO"),
      valor: Number.isFinite(e.valor) ? e.valor : Number.NaN,
      observacao: String(e.observacao ?? ""),
    }),
  )
  .handler(async ({ data }): Promise<RespostaSimples> =>
    // Lançar gasto é escrita gerencial: exige o mesmo nível de quem configura a
    // operação, e não só de quem lê os números.
    comContexto("gerenciar_integracoes", async (ctx) => {
      const { lancarInvestimento } = await import("./aplicacao/investimento");
      const r = await lancarInvestimento({
        organizationId: ctx.organizationId,
        mes: data.mes,
        campanha: data.campanha,
        canal: data.canal,
        valor: data.valor,
        observacao: data.observacao,
        autorId: ctx.usuario.id,
      });
      if (!r.ok) return { ok: false as const, code: "ENTRADA_INVALIDA", message: r.motivo };
      return { ok: true as const };
    }),
  );

/* -------------------------------------------------------------------------- */
/* Exportação (item 129)                                                      */
/* -------------------------------------------------------------------------- */

export type EscopoExportacao = "pacientes" | "oportunidades" | "tarefas";

/**
 * Exporta dados administrativos em CSV.
 *
 * O ITEM 129 TEM UMA SEGUNDA METADE que é a que importa: "nunca expor mais
 * dados que o usuário pode visualizar". Por isso a exportação NÃO é um dump —
 * ela passa pelos mesmos filtros de clínica das telas, e o valor de orçamento
 * só sai para quem tem `ver_financeiro`. Um CSV que ignora RBAC é a forma mais
 * fácil de vazar o que a interface protege.
 *
 * O separador é ";" e o decimal é vírgula: o arquivo será aberto no Excel em
 * português, e vírgula como separador transformaria "1,50" em duas colunas.
 */
export const exportarCsv = createServerFn({ method: "POST" })
  .validator((e: { escopo: string }) => ({ escopo: String(e.escopo ?? "pacientes") }))
  .handler(async ({ data }): Promise<Resposta<{ nomeArquivo: string; conteudo: string }>> =>
    comContexto("exportar_dados", async (ctx) => {
      const escopos: EscopoExportacao[] = ["pacientes", "oportunidades", "tarefas"];
      if (!escopos.includes(data.escopo as EscopoExportacao)) {
        return { ok: false as const, code: "ENTRADA_INVALIDA", message: "Escopo desconhecido." };
      }

      const { montarCsvDeExportacao } = await import("./aplicacao/exportacao");
      const r = await montarCsvDeExportacao(
        ctx.organizationId,
        ctx.clinicIds,
        data.escopo as EscopoExportacao,
        ctx.pode("ver_financeiro"),
      );

      await (
        await import("./servidor/registro")
      ).auditar({
        organizationId: ctx.organizationId,
        userId: ctx.usuario.id,
        ator: "humano",
        acao: "dados.exportados",
        entityType: escopoParaEntidade(data.escopo as EscopoExportacao),
        entityId: null,
        depois: {
          escopo: data.escopo,
          linhas: r.linhas,
          comFinanceiro: ctx.pode("ver_financeiro"),
        },
        requestId: ctx.requestId,
      });

      return { ok: true as const, nomeArquivo: r.nomeArquivo, conteudo: r.conteudo };
    }),
  );

function escopoParaEntidade(escopo: EscopoExportacao): string {
  return escopo === "pacientes" ? "patient" : escopo === "tarefas" ? "task" : "opportunity";
}

/** Item 179: o debugger de jornada. */
/**
 * As jornadas recentes de UMA automação.
 *
 * É a porta que faltava para o item 95 ("observe a simulação antes de ligar o
 * envio") ser algo que se faz na tela. As mais recentes primeiro: quem está
 * avaliando uma automação quer ver o que ela fez hoje, não no primeiro dia.
 */
export const carregarJornadasDaAutomacao = createServerFn({ method: "GET" })
  .validator((e: { automationId: string }) => ({ automationId: String(e.automationId ?? "") }))
  .handler(async ({ data }): Promise<Resposta<{ jornadas: JornadaDaAutomacaoDto[] }>> =>
    comContexto("ver_automacao", async (ctx) => {
      const { selecionar } = await import("./servidor/banco");
      const { ROTULO_STATUS_JORNADA } = await import("./dominio/rotulos");

      const linhas = await selecionar("crc_automation_enrollments", {
        filtros: [
          { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
          { coluna: "automation_id", op: "eq", valor: data.automationId },
        ],
        ordenar: [{ coluna: "criado_em", ascendente: false }],
        limite: 25,
      });

      const nomes = await carregarNomes(
        ctx.organizationId,
        linhas
          .map((l) => (typeof l["patient_id"] === "string" ? l["patient_id"] : null))
          .filter((p): p is string => p !== null),
      );

      return {
        ok: true as const,
        jornadas: linhas.map((l) => {
          const status = String(l["status"] ?? "");
          const patientId = typeof l["patient_id"] === "string" ? l["patient_id"] : null;
          const saiu = l["saiu_por"];
          return {
            id: String(l["id"] ?? ""),
            paciente: (patientId === null ? null : nomes.get(patientId)) ?? "Paciente sem nome",
            status,
            statusRotulo:
              ROTULO_STATUS_JORNADA[status as keyof typeof ROTULO_STATUS_JORNADA] ?? status,
            passoAtual: typeof l["passo_atual"] === "number" ? l["passo_atual"] : 0,
            saiuPor: typeof saiu === "string" && saiu.length > 0 ? saiu : null,
            criadoEm: String(l["criado_em"] ?? ""),
          };
        }),
      };
    }),
  );

export const carregarHistoricoJornada = createServerFn({ method: "GET" })
  .validator((e: { enrollmentId: string }) => ({ enrollmentId: String(e.enrollmentId ?? "") }))
  .handler(async ({ data }): Promise<Resposta<{ passos: PassoJornadaDto[] }>> =>
    comContexto("ver_automacao", async (ctx) => {
      const { historicoDaJornada } = await import("./automacao/motor");
      const { selecionarUm } = await import("./servidor/banco");

      // Item 71: confere que a jornada é DESTA organização antes de mostrar.
      const dona = await selecionarUm("crc_automation_enrollments", {
        colunas: "id",
        filtros: [
          { coluna: "id", op: "eq", valor: data.enrollmentId },
          { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
        ],
      });
      if (dona === null) {
        return {
          ok: false as const,
          code: "NAO_ENCONTRADO",
          message: "Não encontramos esta jornada.",
        };
      }

      const linhas = await historicoDaJornada(data.enrollmentId);

      // `detalhe` é jsonb e vai ACHATADO para o cliente — item 138. Mandar o
      // objeto cru custaria uma rodada de erro de serialização a cada campo
      // novo que o motor resolvesse gravar lá dentro.
      const campo = (bruto: unknown, chave: string): string | null => {
        if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return null;
        const v = (bruto as Record<string, unknown>)[chave];
        return typeof v === "string" && v.length > 0 ? v : null;
      };

      return {
        ok: true as const,
        passos: linhas.map((l) => ({
          passo: typeof l["passo"] === "number" ? l["passo"] : null,
          tipo: String(l["tipo"] ?? ""),
          descricao: String(l["descricao"] ?? ""),
          em: String(l["criado_em"] ?? ""),
          texto: campo(l["detalhe"], "texto"),
          template: campo(l["detalhe"], "template"),
        })),
      };
    }),
  );
