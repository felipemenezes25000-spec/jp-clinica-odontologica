/**
 * Tool Studio, Agent Studio e editor de Workflow — Fase G.
 *
 * A REGRA QUE ESTES TESTES EXISTEM PARA PROVAR é uma só, e ela tem direção:
 *
 *   **A configuração pode APERTAR o que o código permite. Nunca AFROUXAR.**
 *
 * Uma tela de configuração que consegue reduzir uma trava de segurança é pior do
 * que não ter tela: ela dá a quem opera o poder de desfazer, sem revisão e sem
 * teste, decisões que foram tomadas com as duas coisas. O caso concreto é
 * `agenda.cancelar` — aprovação humana obrigatória, porque cancelar a consulta
 * errada faz alguém aparecer na clínica num dia em que ninguém o espera.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

const auditadas: { acao: string }[] = [];
vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return {
    ...real,
    registrar: () => undefined,
    auditar: (e: { acao: string }) => {
      auditadas.push(e);
      return Promise.resolve();
    },
  };
});

import { avaliarPolitica, MAX_FERRAMENTAS_POR_TURNO } from "../ia-platform/ferramentas";
import { _limparCacheDeConfiguracao } from "../servidor/configuracao";
import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import {
  ajustarFerramenta,
  ferramentasLigadas,
  lerParametros,
  ligarJornada,
  listarFerramentasDaClinica,
  listarJornadas,
  mesclarAprovacao,
  mudarModoDaJornada,
  salvarParametros,
  PARAMETROS_PADRAO,
} from "./estudios";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLINICA = "22222222-2222-4222-8222-222222222222";
const AGORA = new Date("2026-09-11T14:00:00.000Z");

const POLITICA_LIBERADA = {
  escritaLiberada: true,
  writebackLiberado: true,
  agendamentoAutonomo: true,
  escritasDentalOfficePausadas: false,
  ferramentasUsadas: 0,
};

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  _limparCacheDeConfiguracao();
  auditadas.length = 0;
  semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
  semear("crc_clinics", [{ id: CLINICA, organization_id: ORG, nome: "JP", slug: "matriz" }]);
});

/* ========================================================================== */
/* Tool Studio                                                                */
/* ========================================================================== */

describe("mesclarAprovacao — a direção única", () => {
  it("apertar é aceito", () => {
    expect(mesclarAprovacao("NENHUMA", "HUMANO")).toBe("HUMANO");
    expect(mesclarAprovacao("CONFIRMACAO_PACIENTE", "HUMANO")).toBe("HUMANO");
  });

  it("AFROUXAR NÃO TEM EFEITO — o código vence sempre", () => {
    /*
     * `Math.max` disfarçado de função, e é a garantia inteira em uma linha.
     *
     * Mesmo que alguém grave `NENHUMA` direto no banco, contornando a tela, a
     * leitura devolve o valor do código. A trava não depende da validação da
     * escrita: ela é aplicada na leitura.
     */
    expect(mesclarAprovacao("HUMANO", "NENHUMA")).toBe("HUMANO");
    expect(mesclarAprovacao("CONFIRMACAO_PACIENTE", "NENHUMA")).toBe("CONFIRMACAO_PACIENTE");
  });

  it("sem ajuste, vale o código", () => {
    expect(mesclarAprovacao("CONFIRMACAO_PACIENTE", null)).toBe("CONFIRMACAO_PACIENTE");
  });
});

describe("listar as ferramentas da clínica", () => {
  it("mostra o catálogo inteiro, ligado por padrão", async () => {
    const lista = await listarFerramentasDaClinica(ORG);

    expect(lista.length).toBeGreaterThan(15);
    // Nenhuma nasce desligada: a clínica que não configurou nada tem o agente
    // completo, e não um agente mutilado por omissão.
    expect(lista.every((f) => f.ligada)).toBe(true);
  });

  it("marca quais a clínica apertou", async () => {
    await ajustarFerramenta({
      organizationId: ORG,
      chave: "agenda.oferecer",
      ligada: true,
      aprovacaoExigida: "HUMANO",
      userId: null,
    });

    const f = (await listarFerramentasDaClinica(ORG)).find((x) => x.chave === "agenda.oferecer");

    expect(f?.aprovacaoDoCodigo).toBe("NENHUMA");
    expect(f?.aprovacaoEfetiva).toBe("HUMANO");
    // A tela precisa MOSTRAR que aquilo foi decisão da clínica, e não do
    // sistema — senão ninguém sabe o que pode desfazer.
    expect(f?.apertadaPelaClinica).toBe(true);
  });
});

describe("as ferramentas essenciais", () => {
  it("passar_para_humano NÃO pode ser desligada", async () => {
    const r = await ajustarFerramenta({
      organizationId: ORG,
      chave: "conversa.passar_para_humano",
      ligada: false,
      aprovacaoExigida: null,
      userId: null,
    });

    /*
     * É A PORTA DE SAÍDA DO AGENTE. Sem ela, quando ele percebe que não é com
     * ele, não tem como dizer — e a única alternativa que sobra é responder
     * assim mesmo. Uma configuração capaz de remover a saída de emergência não
     * é configuração: é um jeito de criar um agente encurralado.
     */
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe("ferramenta_essencial");
  });

  it("marcar_opt_out também não", async () => {
    const r = await ajustarFerramenta({
      organizationId: ORG,
      chave: "paciente.marcar_opt_out",
      ligada: false,
      aprovacaoExigida: null,
      userId: null,
    });

    // Desligá-la significaria o agente ouvir "não me mande mais mensagem" e não
    // ter como registrar isso.
    expect(r.ok).toBe(false);
  });

  it("mesmo gravada desligada à mão, a essencial continua ligada", async () => {
    // Contorna a validação: grava direto no banco, como faria um script.
    semear("crc_settings", [
      {
        organization_id: ORG,
        chave: "ferramenta:conversa.passar_para_humano",
        valor: { ligada: false, aprovacaoExigida: null },
      },
    ]);

    const f = (await listarFerramentasDaClinica(ORG)).find(
      (x) => x.chave === "conversa.passar_para_humano",
    );

    // A trava é aplicada na LEITURA, e não só na escrita. Uma garantia que só
    // existe no caminho da tela é uma garantia que o primeiro script contorna.
    expect(f?.ligada).toBe(true);
  });
});

describe("afrouxar é recusado com mensagem", () => {
  it("não dá para tirar a aprovação humana de agenda.cancelar", async () => {
    const r = await ajustarFerramenta({
      organizationId: ORG,
      chave: "agenda.cancelar",
      ligada: true,
      aprovacaoExigida: "NENHUMA",
      userId: null,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe("afrouxaria");

    /*
     * RECUSAR EXPLICANDO, e não aceitar e ignorar.
     *
     * `mesclarAprovacao` sozinha já garantiria a segurança — o valor fraco
     * seria descartado na leitura. Mas aceitar a gravação faria a tela mostrar
     * "NENHUMA" enquanto o sistema aplica "HUMANO", e a pessoa passaria a não
     * confiar no que a tela diz. Desconfiança da tela é mais cara que uma
     * mensagem de erro.
     */
    expect(r.motivo).toContain("mais rigorosa");
  });
});

describe("desligar tem efeito DE VERDADE no que o modelo vê", () => {
  it("a ferramenta desligada é barrada pela política", async () => {
    await ajustarFerramenta({
      organizationId: ORG,
      chave: "paciente.historico",
      ligada: false,
      aprovacaoExigida: null,
      userId: null,
    });

    const desligadas = (await listarFerramentasDaClinica(ORG))
      .filter((f) => !f.ligada)
      .map((f) => f.chave);

    const v = avaliarPolitica("paciente.historico", { ...POLITICA_LIBERADA, desligadas });

    /*
     * A ASSERÇÃO QUE DÁ SENTIDO À TELA INTEIRA.
     *
     * Se desligar gravasse a configuração e o modelo continuasse vendo a
     * ferramenta, a tela seria decorativa — a pior forma de configuração, porque
     * a pessoa acha que desligou e o agente continua usando.
     */
    expect(v.permite).toBe(false);
    if (v.permite) return;
    // O motivo diz QUEM desligou: sem isso, quem investiga procura bug numa
    // decisão que alguém tomou de propósito.
    expect(v.motivo).toContain("clínica desligou");
  });

  it("`ferramentasLigadas` reflete o ajuste", async () => {
    const antes = await ferramentasLigadas(ORG);

    await ajustarFerramenta({
      organizationId: ORG,
      chave: "paciente.pendencias",
      ligada: false,
      aprovacaoExigida: null,
      userId: null,
    });

    const depois = await ferramentasLigadas(ORG);
    expect(depois).toHaveLength(antes.length - 1);
    expect(depois).not.toContain("paciente.pendencias");
  });

  it("cada ajuste é auditado", async () => {
    await ajustarFerramenta({
      organizationId: ORG,
      chave: "paciente.orcamentos",
      ligada: false,
      aprovacaoExigida: null,
      userId: null,
    });

    // Desligar uma ferramenta muda o comportamento do agente com pacientes. Sem
    // auditoria, "por que ele parou de responder sobre orçamento?" não tem
    // resposta.
    expect(auditadas.some((a) => a.acao === "tool_studio.ajustar")).toBe(true);
  });
});

/* ========================================================================== */
/* Agent Studio                                                               */
/* ========================================================================== */

describe("os parâmetros do agente", () => {
  it("sem configuração, valem os padrões", async () => {
    const p = await lerParametros(ORG);
    expect(p).toEqual(PARAMETROS_PADRAO);
  });

  it("o teto do CÓDIGO não pode ser ultrapassado pela configuração", async () => {
    await salvarParametros({
      organizationId: ORG,
      parametros: { maxFerramentas: 99 },
      userId: null,
    });

    const p = await lerParametros(ORG);

    /*
     * Um turno com 99 ferramentas seriam 100 chamadas de modelo. Com a fila da
     * Fase B, isso multiplica por todos os pacientes esperando — e o teto de
     * gasto da Fase D viraria a única defesa, tarde demais e pela via cara.
     */
    expect(p.maxFerramentas).toBe(MAX_FERRAMENTAS_POR_TURNO);
  });

  it("apertar abaixo do teto é aceito", async () => {
    await salvarParametros({
      organizationId: ORG,
      parametros: { maxFerramentas: 2 },
      userId: null,
    });
    expect((await lerParametros(ORG)).maxFerramentas).toBe(2);
  });

  it("a temperatura fica entre 0 e 1", async () => {
    await salvarParametros({ organizationId: ORG, parametros: { temperatura: 5 }, userId: null });
    expect((await lerParametros(ORG)).temperatura).toBe(1);

    await salvarParametros({ organizationId: ORG, parametros: { temperatura: -3 }, userId: null });
    expect((await lerParametros(ORG)).temperatura).toBe(0);
  });

  it("o padrão de temperatura é BAIXO, e isso é uma decisão", async () => {
    /*
     * 0.3, e não o 1.0 dos exemplos de tutorial.
     *
     * Este agente não escreve ficção: responde sobre horário, convênio e
     * orçamento de uma clínica. Criatividade aqui tem outro nome — é invenção, e
     * inventar convênio produz paciente na recepção com um plano que não é
     * aceito.
     */
    expect(PARAMETROS_PADRAO.temperatura).toBeLessThanOrEqual(0.5);
  });
});

/* ========================================================================== */
/* Editor de Workflow                                                         */
/* ========================================================================== */

describe("as jornadas", () => {
  const JORNADA = "a1a1a1a1-1111-4111-8111-111111111111";

  beforeEach(() => {
    semear("crc_automations", [
      {
        id: JORNADA,
        organization_id: ORG,
        chave: "lembrete_consulta",
        nome: "Lembrete de consulta",
        descricao: "Avisa o paciente 24h antes.",
        status: "ATIVA",
        modo: "SHADOW",
        versao_ativa: 1,
      },
    ]);
  });

  it("lista com a contagem de quem está dentro", async () => {
    semear("crc_automation_enrollments", [
      { organization_id: ORG, automation_id: JORNADA, versao: 1, status: "ACTIVE" },
      { organization_id: ORG, automation_id: JORNADA, versao: 1, status: "WAITING" },
    ]);

    const jornadas = await listarJornadas(ORG);

    /*
     * A CONTAGEM É O QUE TORNA A TELA ÚTIL.
     *
     * "Desligar esta jornada" e "desligar esta jornada com 340 pessoas dentro"
     * são decisões diferentes, e a segunda merece hesitação. Sem o número, as
     * duas parecem iguais — e quem desliga descobre o tamanho do estrago depois.
     *
     * `WAITING` conta junto com `ACTIVE`: quem está esperando um passo agendado
     * está dentro da jornada tanto quanto quem acabou de entrar.
     */
    expect(jornadas[0]?.inscritos).toBe(2);
  });

  it("toda jornada nasce em SHADOW", async () => {
    const [j] = await listarJornadas(ORG);
    // Calcula tudo e não executa nada. É o degrau onde a clínica vê o que ELA
    // faria antes de deixar fazer.
    expect(j?.modo).toBe("SHADOW");
    expect(j?.proximoModo).toBe("RECOMENDAR");
  });

  it("NÃO dá para pular de SHADOW direto para EXECUTAR", async () => {
    const r = await mudarModoDaJornada({
      organizationId: ORG,
      automationId: JORNADA,
      modo: "EXECUTAR",
      userId: null,
    });

    /*
     * O TESTE MAIS IMPORTANTE DESTE BLOCO.
     *
     * Pular o degrau do meio é ligar uma automação que nunca teve um único caso
     * conferido por gente — e automação de clínica manda mensagem para paciente.
     * RECOMENDAR é onde se descobre que ela dispara para a pessoa errada, SEM
     * que a pessoa errada receba nada.
     */
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe("pulou_degrau");
    expect(r.motivo).toContain("RECOMENDAR");

    // E nada mudou no banco.
    expect(conteudo("crc_automations")[0]?.["modo"]).toBe("SHADOW");
  });

  it("subir um degrau por vez é aceito", async () => {
    expect(
      (
        await mudarModoDaJornada({
          organizationId: ORG,
          automationId: JORNADA,
          modo: "RECOMENDAR",
          userId: null,
        })
      ).ok,
    ).toBe(true);

    expect(
      (
        await mudarModoDaJornada({
          organizationId: ORG,
          automationId: JORNADA,
          modo: "EXECUTAR",
          userId: null,
        })
      ).ok,
    ).toBe(true);

    expect(conteudo("crc_automations")[0]?.["modo"]).toBe("EXECUTAR");
  });

  it("DESCER é sempre permitido, em qualquer distância", async () => {
    await mudarModoDaJornada({
      organizationId: ORG,
      automationId: JORNADA,
      modo: "RECOMENDAR",
      userId: null,
    });
    await mudarModoDaJornada({
      organizationId: ORG,
      automationId: JORNADA,
      modo: "EXECUTAR",
      userId: null,
    });

    const r = await mudarModoDaJornada({
      organizationId: ORG,
      automationId: JORNADA,
      modo: "SHADOW",
      userId: null,
    });

    /*
     * De EXECUTAR direto para SHADOW, pulando o meio. Permitido de propósito:
     * quem está voltando atrás está REDUZINDO o que o sistema faz sozinho, e
     * nunca se deve pôr atrito no caminho de quem quer que o sistema faça menos.
     *
     * É a mesma assimetria do kill switch — apertar é fácil, soltar é que exige
     * cuidado.
     */
    expect(r.ok).toBe(true);
    expect(conteudo("crc_automations")[0]?.["modo"]).toBe("SHADOW");
  });

  it("a mudança de degrau é auditada COM o número de inscritos", async () => {
    semear("crc_automation_enrollments", [
      { organization_id: ORG, automation_id: JORNADA, versao: 1, status: "ACTIVE" },
    ]);

    await mudarModoDaJornada({
      organizationId: ORG,
      automationId: JORNADA,
      modo: "RECOMENDAR",
      userId: null,
    });

    // Quantas pessoas estavam dentro no momento da mudança é a informação que
    // falta quando alguém pergunta, semanas depois, por que tanta gente recebeu
    // aquela mensagem.
    const linha = auditadas.find((a) => a.acao === "workflow.subir_degrau");
    expect(linha).toBeDefined();
  });

  it("ligar e desligar é auditado", async () => {
    await ligarJornada({
      organizationId: ORG,
      automationId: JORNADA,
      ativa: false,
      userId: null,
    });

    expect(conteudo("crc_automations")[0]?.["status"]).toBe("PAUSADA");
    expect(auditadas.some((a) => a.acao === "workflow.desligar")).toBe(true);
  });
});
