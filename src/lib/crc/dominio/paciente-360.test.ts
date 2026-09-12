/**
 * Patient 360 preditivo — as três regras que este módulo inventa.
 *
 * ============================================================================
 *  O TESTE QUE CARREGA ESTE ARQUIVO é o de que ABANDONO NÃO É FALTA.
 *
 *  Faltar é não vir numa consulta marcada; abandonar é parar de marcar. Quem
 *  falta muito mas sempre remarca é problema de agenda; quem nunca faltou e
 *  sumiu há oito meses é problema de relacionamento. Confundir os dois faz o
 *  sistema mandar confirmação para quem já foi embora.
 *
 *  INJEÇÃO DE DEFEITO:
 *    tratar consulta futura como desconto → "consulta marcada zera" quebra;
 *    pontuar opt-out como risco           → "opt-out não é abandono" quebra;
 *    medir atraso em dias fixos           → "a régua é o recall" quebra;
 *    faixa de valor em reais absolutos    → "a régua é a clínica" quebra.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import { calcularRiscoDeAbandono, faixaDeValor, inferirHousehold } from "./paciente-360";

const BASE = {
  diasDesdeUltimaConsulta: 30,
  recallDias: 180,
  contatosSemResposta: 0,
  faltouSemRemarcar: false,
  temOrcamentoParado: false,
  temConsultaFutura: false,
  optOut: false,
};

/* -------------------------------------------------------------------------- */

describe("a faixa de valor", () => {
  it("a régua é a CLÍNICA, e não um valor em reais", () => {
    /*
     * ============================================================================
     *  R$ 8.000 é um paciente excelente numa clínica de bairro e comum numa de
     *  implantes. Um limiar fixo classificaria a base inteira de uma delas como
     *  "alto" e a da outra como "baixo".
     * ============================================================================
     */
    expect(faixaDeValor(8000, 1000)).toBe("ALTO"); // clínica de bairro
    expect(faixaDeValor(8000, 20_000)).toBe("BAIXO"); // clínica de implantes
  });

  it("sem histórico é diferente de valor baixo", () => {
    // Zero não é "vale pouco": é "ainda não sabemos". A tela precisa distinguir
    // para não tratar um paciente novo como um paciente ruim.
    expect(faixaDeValor(0, 5000)).toBe("SEM_HISTORICO");
    expect(faixaDeValor(100, 5000)).toBe("BAIXO");
  });

  it("clínica sem histórico nenhum não classifica ninguém", () => {
    expect(faixaDeValor(5000, 0)).toBe("SEM_HISTORICO");
  });
});

/* -------------------------------------------------------------------------- */

describe("o risco de abandono", () => {
  it("consulta marcada ZERA o risco — não desconta pontos", () => {
    /*
     * Quem tem hora marcada não está abandonando, por definição, qualquer que
     * seja o histórico. Como desconto, um paciente com consulta na terça
     * apareceria como "risco médio" e a lista perderia o sentido.
     */
    const r = calcularRiscoDeAbandono({
      ...BASE,
      diasDesdeUltimaConsulta: 900,
      contatosSemResposta: 5,
      faltouSemRemarcar: true,
      temConsultaFutura: true,
    });

    expect(r.score).toBe(0);
    expect(r.faixa).toBe("BAIXO");
  });

  it("opt-out não é abandono — é uma decisão respeitada", () => {
    /*
     * Pontuá-lo como risco produziria uma lista de "recuperar" cheia de gente
     * que pediu para não ser incomodada, e alguém acabaria contatando.
     */
    const r = calcularRiscoDeAbandono({
      ...BASE,
      diasDesdeUltimaConsulta: 900,
      optOut: true,
    });

    expect(r.score).toBe(0);
    expect(r.sugestao).toContain("Não contatar");
  });

  it("a régua do atraso é o RECALL da clínica, e não um número de dias", () => {
    /*
     * ============================================================================
     *  Seis meses sem vir é normal numa clínica de limpeza semestral e é muito
     *  tempo numa de ortodontia com retorno mensal. A mesma ausência significa
     *  coisas opostas.
     * ============================================================================
     */
    const semestral = calcularRiscoDeAbandono({
      ...BASE,
      diasDesdeUltimaConsulta: 180,
      recallDias: 180,
    });
    const mensal = calcularRiscoDeAbandono({
      ...BASE,
      diasDesdeUltimaConsulta: 180,
      recallDias: 30,
    });

    expect(mensal.score).toBeGreaterThan(semestral.score);
  });

  it("o silêncio depois de tentativa cresce mais rápido que linear", () => {
    /*
     * Uma mensagem sem resposta é ruído — a pessoa estava ocupada. Três sem
     * resposta é uma decisão. O segundo e o terceiro contato precisam valer
     * mais que o primeiro, e não o contrário.
     */
    const um = calcularRiscoDeAbandono({ ...BASE, contatosSemResposta: 1 }).score;
    const dois = calcularRiscoDeAbandono({ ...BASE, contatosSemResposta: 2 }).score;
    const tres = calcularRiscoDeAbandono({ ...BASE, contatosSemResposta: 3 }).score;

    expect(dois - um).toBeGreaterThan(um);
    expect(tres - dois).toBeGreaterThan(0);
  });

  it("quem não responde 3 vezes NÃO recebe a quarta mensagem", () => {
    /*
     * Insistir é o caminho mais rápido para o opt-out — e perder o canal é
     * pior do que perder a consulta, porque fecha a porta para sempre.
     */
    const r = calcularRiscoDeAbandono({
      ...BASE,
      diasDesdeUltimaConsulta: 400,
      contatosSemResposta: 3,
    });

    expect(r.faixa).toBe("ALTO");
    expect(r.sugestao).toContain("Parar de mandar mensagem");
  });

  it("a sugestão nunca é “entrar em contato”", () => {
    // Uma sugestão que não diz COMO nem POR ONDE não é sugestão: é o problema
    // repetido em voz alta.
    for (const contatos of [0, 1, 2, 3]) {
      for (const dias of [10, 200, 900]) {
        const r = calcularRiscoDeAbandono({
          ...BASE,
          diasDesdeUltimaConsulta: dias,
          contatosSemResposta: contatos,
        });
        expect(r.sugestao.toLowerCase()).not.toBe("entrar em contato");
        expect(r.sugestao.length).toBeGreaterThan(20);
      }
    }
  });

  it("todo fator que pontua aparece na lista", () => {
    // Um score sem os fatores na frente é um número que ninguém pode
    // contestar — e discordar é como o critério melhora.
    const r = calcularRiscoDeAbandono({
      ...BASE,
      diasDesdeUltimaConsulta: 400,
      contatosSemResposta: 2,
      faltouSemRemarcar: true,
      temOrcamentoParado: true,
    });

    const somados = r.fatores.reduce((s, f) => s + f.pontos, 0);
    expect(somados).toBe(r.score);
    expect(r.fatores.length).toBe(4);
  });

  it("o score não passa de 100", () => {
    const r = calcularRiscoDeAbandono({
      ...BASE,
      diasDesdeUltimaConsulta: 5000,
      recallDias: 30,
      contatosSemResposta: 9,
      faltouSemRemarcar: true,
      temOrcamentoParado: true,
    });

    expect(r.score).toBeLessThanOrEqual(100);
  });
});

/* -------------------------------------------------------------------------- */

describe("o household", () => {
  const identidades = [
    {
      patientId: "mae",
      nome: "Ana",
      tipo: "TELEFONE",
      valor: "11999990000",
      compartilhada: true,
      confirmadaEm: null,
    },
    {
      patientId: "filho",
      nome: "Bruno",
      tipo: "TELEFONE",
      valor: "11999990000",
      compartilhada: true,
      confirmadaEm: null,
    },
    {
      patientId: "estranho",
      nome: "Carlos",
      tipo: "TELEFONE",
      valor: "11888880000",
      compartilhada: false,
      confirmadaEm: null,
    },
  ];

  it("quem divide telefone aparece; quem não divide, não", () => {
    const casa = inferirHousehold(identidades, "mae");

    expect(casa.map((f) => f.patientId)).toEqual(["filho"]);
    expect(casa[0]?.porque).toBe("Mesmo telefone");
  });

  it("a inferência vem marcada como NÃO confirmada", () => {
    /*
     * ============================================================================
     *  Dois irmãos que dividem telefone aparecem juntos — e também o casal que
     *  se separou e ninguém atualizou o cadastro.
     *
     *  Uma suspeita apresentada como fato é como um sistema começa a dizer à
     *  recepção coisas que ela sabe que são falsas.
     * ============================================================================
     */
    expect(inferirHousehold(identidades, "mae")[0]?.confirmado).toBe(false);
  });

  it("confirmação humana não é rebaixada por um segundo identificador suspeito", () => {
    const comConfirmacao = [
      ...identidades,
      {
        patientId: "filho",
        nome: "Bruno",
        tipo: "ENDERECO",
        valor: "rua x, 10",
        compartilhada: true,
        confirmadaEm: "2026-05-01T10:00:00.000Z",
      },
      {
        patientId: "mae",
        nome: "Ana",
        tipo: "ENDERECO",
        valor: "rua x, 10",
        compartilhada: true,
        confirmadaEm: "2026-05-01T10:00:00.000Z",
      },
    ];

    expect(inferirHousehold(comConfirmacao, "mae")[0]?.confirmado).toBe(true);
  });

  it("identidade NÃO compartilhada não forma casa", () => {
    // Todo mundo tem um telefone. Só o marcado como compartilhado é sinal.
    const soPropria = identidades.map((i) => ({ ...i, compartilhada: false }));
    expect(inferirHousehold(soPropria, "mae")).toHaveLength(0);
  });

  it("o próprio paciente nunca aparece na própria casa", () => {
    const casa = inferirHousehold(identidades, "mae");
    expect(casa.some((f) => f.patientId === "mae")).toBe(false);
  });
});
