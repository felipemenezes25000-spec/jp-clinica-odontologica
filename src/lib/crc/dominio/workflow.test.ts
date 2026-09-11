/**
 * Testes do Workflow Studio.
 *
 * O QUE ELES PROTEGEM não é a montagem da lista — é a captura das armadilhas
 * que **não dão erro em lugar nenhum**. Uma jornada mal montada não quebra: ela
 * roda, inscreve pacientes e não faz nada. O painel mostra centenas de
 * inscrições e zero mensagens, e a leitura de fora é "a automação não
 * funciona", sem uma linha de log dizendo por quê.
 *
 * As três que mais importam, e cada uma existe porque é invisível lendo a tela:
 *
 *   SAÍDA "SEMPRE" encerra antes do primeiro passo — porque as saídas são
 *   avaliadas ANTES de cada passo, inclusive o zero.
 *
 *   ENTRAR E SAIR PELA MESMA CONDIÇÃO faz todo mundo sair na entrada.
 *
 *   MODELO INEXISTENTE só falha no meio da jornada de um paciente de verdade.
 */
import { describe, expect, it } from "vitest";

import {
  descreverPasso,
  duracao,
  mover,
  passoNovo,
  podePublicar,
  resumir,
  validarDefinicao,
  type ContextoDeValidacao,
} from "./workflow";
import type { DefinicaoAutomacao } from "./tipos";

const CONTEXTO: ContextoDeValidacao = {
  templatesDisponiveis: ["falta_primeiro_contato", "falta_segundo_contato"],
  etapasDisponiveis: ["novo", "em_contato", "agendado"],
};

/** Uma jornada saudável, para servir de base e de controle. */
const BOA: DefinicaoAutomacao = {
  gatilho: { tipo: "EVENTO", evento: "appointment.missed" },
  condicoes: [{ tipo: "PACIENTE_ATIVO" }, { tipo: "TEM_TELEFONE" }],
  passos: [
    { tipo: "ESPERAR", minutos: 120 },
    { tipo: "ENVIAR_TEMPLATE", template: "falta_primeiro_contato" },
    { tipo: "ESPERAR", minutos: 1440 },
    { tipo: "ENVIAR_TEMPLATE", template: "falta_segundo_contato" },
  ],
  saidas: [{ condicao: { tipo: "TEM_CONSULTA_FUTURA" }, motivo: "paciente_agendou" }],
};

const com = (mudanca: Partial<DefinicaoAutomacao>): DefinicaoAutomacao => ({ ...BOA, ...mudanca });
const erros = (d: DefinicaoAutomacao) =>
  validarDefinicao(d, CONTEXTO).filter((a) => a.severidade === "erro");
const avisos = (d: DefinicaoAutomacao) =>
  validarDefinicao(d, CONTEXTO).filter((a) => a.severidade === "aviso");

/* -------------------------------------------------------------------------- */

describe("o controle", () => {
  it("a jornada boa não acusa nada", () => {
    // Sem este teste, um validador que reprova tudo passaria em todos os
    // outros — e seria pior que não ter validador.
    expect(validarDefinicao(BOA, CONTEXTO)).toEqual([]);
    expect(podePublicar(validarDefinicao(BOA, CONTEXTO))).toBe(true);
  });
});

describe("as armadilhas que não dão erro em lugar nenhum", () => {
  it('saída "sempre" encerra antes do primeiro passo', () => {
    /*
     * O MOTOR AVALIA AS SAÍDAS ANTES DE CADA PASSO, inclusive o primeiro. Com
     * uma saída "sempre", a jornada inscreve o paciente e o encerra na mesma
     * volta. Nada no log diz "sua saída está sempre verdadeira".
     */
    const d = com({ saidas: [{ condicao: { tipo: "SEMPRE" }, motivo: "x" }] });
    const e = erros(d);

    expect(e).toHaveLength(1);
    expect(e[0]?.mensagem).toContain("antes do primeiro passo");
    expect(podePublicar(validarDefinicao(d, CONTEXTO))).toBe(false);
  });

  it("entrar e sair pela MESMA condição faz todo mundo sair na entrada", () => {
    const d = com({
      condicoes: [{ tipo: "TEM_CONSULTA_FUTURA" }],
      saidas: [{ condicao: { tipo: "TEM_CONSULTA_FUTURA" }, motivo: "agendou" }],
    });

    const e = erros(d);
    expect(e).toHaveLength(1);
    expect(e[0]?.mensagem).toContain("sai pela mesma condição");
  });

  it("modelo inexistente é ERRO, e não aviso", () => {
    // Porque o envio falha no meio da jornada de um paciente de verdade — e
    // descobrir ali custa muito mais do que barrar aqui.
    const d = com({
      passos: [
        { tipo: "ESPERAR", minutos: 60 },
        { tipo: "ENVIAR_TEMPLATE", template: "modelo_que_nao_existe" },
      ],
    });

    const e = erros(d);
    expect(e).toHaveLength(1);
    expect(e[0]?.mensagem).toContain("não existe");
    expect(e[0]?.passo).toBe(1);
  });

  it("jornada sem passo nenhum não faz nada", () => {
    expect(erros(com({ passos: [] }))[0]?.mensagem).toContain("nenhum passo");
  });
});

describe("o que incomoda o paciente é AVISO, e não erro", () => {
  it("duas mensagens seguidas chegam no mesmo minuto", () => {
    const d = com({
      passos: [
        { tipo: "ESPERAR", minutos: 60 },
        { tipo: "ENVIAR_TEMPLATE", template: "falta_primeiro_contato" },
        { tipo: "ENVIAR_TEMPLATE", template: "falta_segundo_contato" },
      ],
    });

    const a = avisos(d);
    expect(a.some((x) => x.mensagem.includes("Duas mensagens seguidas"))).toBe(true);
    // Incomoda, mas roda — e às vezes é intencional. Proibir o incomum faz a
    // ferramenta ser contornada por fora.
    expect(podePublicar(validarDefinicao(d, CONTEXTO))).toBe(true);
  });

  it("a espera ZERA a contagem de mensagens seguidas", () => {
    // Senão o aviso dispararia na jornada boa, que tem duas mensagens com um
    // dia entre elas — e um aviso que aparece sempre deixa de ser lido.
    expect(avisos(BOA)).toEqual([]);
  });

  it("começar mandando mensagem sai no mesmo minuto do gatilho", () => {
    const d = com({
      passos: [{ tipo: "ENVIAR_TEMPLATE", template: "falta_primeiro_contato" }],
    });

    const a = avisos(d);
    expect(a.some((x) => x.passo === 0 && x.mensagem.includes("mandar mensagem"))).toBe(true);
  });

  it("esperar sem nenhuma saída persegue quem já resolveu", () => {
    const d = com({ saidas: [] });
    const a = avisos(d);

    // É o defeito clássico: "sentimos sua falta" para quem remarcou ontem.
    expect(a.some((x) => x.conserto.includes("já tem consulta marcada"))).toBe(true);
  });

  it("terminar numa espera é quase sempre passo faltando", () => {
    const d = com({
      passos: [
        { tipo: "ENVIAR_TEMPLATE", template: "falta_primeiro_contato" },
        { tipo: "ESPERAR", minutos: 60 },
      ],
    });
    expect(avisos(d).some((x) => x.mensagem.includes("termina numa espera"))).toBe(true);
  });

  it('"sair se" no fim não evita nada', () => {
    const d = com({
      passos: [
        { tipo: "ESPERAR", minutos: 60 },
        { tipo: "SAIR_SE", condicao: { tipo: "PACIENTE_RESPONDEU" }, motivo: "respondeu" },
      ],
    });
    expect(avisos(d).some((x) => x.mensagem.includes("último passo"))).toBe(true);
  });
});

describe("os campos de cada passo", () => {
  it("espera de zero minuto não existe", () => {
    expect(erros(com({ passos: [{ tipo: "ESPERAR", minutos: 0 }] }))[0]?.mensagem).toContain(
      "pelo menos um minuto",
    );
  });

  it("horário precisa ser HH:MM de 24 horas", () => {
    for (const hora of ["25:00", "9:00", "09:60", "manhã", ""]) {
      expect(
        erros(com({ passos: [{ tipo: "ESPERAR_ATE", hora }] })).length,
        `"${hora}" deveria ser recusado`,
      ).toBeGreaterThan(0);
    }
    expect(erros(com({ passos: [{ tipo: "ESPERAR_ATE", hora: "09:00" }] }))).toHaveLength(0);
    expect(erros(com({ passos: [{ tipo: "ESPERAR_ATE", hora: "23:59" }] }))).toHaveLength(0);
  });

  it("tarefa sem título e sem prazo é recusada nos dois campos", () => {
    const d = com({
      passos: [{ tipo: "CRIAR_TAREFA", titulo: "   ", tipoTarefa: "LIGAR", prazoHoras: 0 }],
    });
    expect(erros(d)).toHaveLength(2);
  });

  it("etapa fora do funil da clínica é recusada", () => {
    expect(
      erros(com({ passos: [{ tipo: "MOVER_ETAPA", etapa: "inventada" }] }))[0]?.mensagem,
    ).toContain("não existe no funil");
  });

  it("mas sem funil configurado a etapa passa", () => {
    /*
     * Uma clínica que ainda não configurou o funil não pode ficar impedida de
     * montar jornada. Validar contra lista vazia recusaria TUDO — e um
     * verificador que grita sem motivo é desligado na primeira semana.
     */
    const semFunil = { ...CONTEXTO, etapasDisponiveis: [] };
    const d = com({ passos: [{ tipo: "MOVER_ETAPA", etapa: "qualquer" }] });
    expect(validarDefinicao(d, semFunil).filter((a) => a.severidade === "erro")).toHaveLength(0);
  });

  it("saída sem motivo some do relatório", () => {
    const d = com({
      passos: [
        { tipo: "SAIR_SE", condicao: { tipo: "PACIENTE_RESPONDEU" }, motivo: "" },
        { tipo: "ENVIAR_TEMPLATE", template: "falta_primeiro_contato" },
      ],
    });
    expect(erros(d)[0]?.mensagem).toContain("não tem motivo");
  });

  it("todo achado traz o conserto junto", () => {
    // Um achado sem conserto é uma reclamação. Quem lê precisa saber o que
    // fazer sem abrir o código.
    const d = com({
      passos: [{ tipo: "ENVIAR_TEMPLATE", template: "nao_existe" }],
      saidas: [{ condicao: { tipo: "SEMPRE" }, motivo: "x" }],
    });

    for (const a of validarDefinicao(d, CONTEXTO)) {
      expect(a.conserto.length, a.mensagem).toBeGreaterThan(10);
    }
  });
});

describe("a leitura em português", () => {
  it("descreve o passo a partir do DADO, e não do rótulo escrito à mão", () => {
    /*
     * O `rotulo` da definição é opcional e mente assim que alguém muda o número
     * e esquece o texto. Aqui um passo rotulado errado é descrito certo.
     */
    const p = { tipo: "ESPERAR" as const, minutos: 1440, rotulo: "Esperar 2 horas" };
    expect(descreverPasso(p)).toBe("Esperar 1 dia");
  });

  it("traduz minutos para a unidade que a pessoa pensa", () => {
    expect(duracao(30)).toBe("30 min");
    expect(duracao(60)).toBe("1 hora");
    expect(duracao(120)).toBe("2 horas");
    expect(duracao(1440)).toBe("1 dia");
    expect(duracao(2880)).toBe("2 dias");
    expect(duracao(0)).toBe("sem espera");
  });
});

describe("o resumo", () => {
  it("conta mensagens e soma a duração do pior caso", () => {
    const r = resumir(BOA);
    expect(r.passos).toBe(4);
    expect(r.mensagens).toBe(2);
    // 120 + 1440: quanto tempo a jornada persegue alguém que nunca responde.
    expect(r.duracaoTotalMinutos).toBe(1560);
  });

  it("ESPERAR_ATE fica FORA da soma", () => {
    /*
     * Quanto ela dura depende da hora em que a jornada chegou nela. Chutar um
     * número daria precisão aparente sem conteúdo — pior do que omitir.
     */
    const d = com({ passos: [{ tipo: "ESPERAR_ATE", hora: "09:00" }] });
    expect(resumir(d).duracaoTotalMinutos).toBe(0);
  });
});

describe("montar e reordenar", () => {
  it("todo tipo da paleta produz um passo já válido", () => {
    // Um passo novo em branco obriga a preencher tudo antes de ver a forma da
    // jornada — e a forma é o que a pessoa veio ver.
    for (const tipo of [
      "ESPERAR",
      "ESPERAR_ATE",
      "CRIAR_TAREFA",
      "DEFINIR_PROXIMA_ACAO",
      "SAIR_SE",
    ] as const) {
      const d = com({
        passos: [{ tipo: "ESPERAR", minutos: 60 }, passoNovo(tipo)],
      });
      expect(erros(d), `${tipo} nasceu inválido`).toHaveLength(0);
    }
  });

  it("ENVIAR_TEMPLATE e MOVER_ETAPA nascem pedindo escolha", () => {
    // Os dois únicos que não têm padrão possível: o modelo e a etapa são da
    // clínica, e inventar um válido seria escolher por ela.
    expect(erros(com({ passos: [passoNovo("ENVIAR_TEMPLATE")] })).length).toBeGreaterThan(0);
    expect(erros(com({ passos: [passoNovo("MOVER_ETAPA")] })).length).toBeGreaterThan(0);
  });

  it("mover reordena sem perder nem duplicar", () => {
    expect(mover(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(mover(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("drop fora da lista devolve a lista intacta, sem lançar", () => {
    // Quem chama é um `onDragEnd`: soltar fora é gesto normal de usuário, e não
    // erro de programa.
    const l = ["a", "b", "c"];
    expect(mover(l, 0, 9)).toEqual(l);
    expect(mover(l, -1, 1)).toEqual(l);
    expect(mover(l, 1, 1)).toEqual(l);
  });
});
