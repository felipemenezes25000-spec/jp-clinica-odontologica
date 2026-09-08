/**
 * Testes das regras de cobrança.
 *
 * A PARTE QUE MAIS IMPORTA está no fim: a guarda do art. 42 do CDC. Ela é
 * testada com textos EXPLÍCITOS passados na chamada, e não varrendo o catálogo
 * de templates — uma versão anterior deste arquivo fazia isso e passava sem
 * detectar violação, porque provar que um teste que varre objeto global
 * realmente falha exige injetar defeito no objeto, e isso é frágil de verificar.
 *
 * Com função pura e entrada explícita, cada caso é auto-evidente: passo um
 * texto que ameaça e afirmo que ele é recusado.
 *
 * A mesma função roda em produção quando alguém salva um template pela tela —
 * então estes testes não protegem só a suíte, protegem o que a clínica escrever
 * depois do deploy.
 */
import { describe, expect, it } from "vitest";

import {
  COOLDOWN_COBRANCA_HORAS,
  MAX_CONTATOS_COBRANCA,
  afirmaQueJaPagou,
  diasDeAtraso,
  faseDaCobranca,
  ofereceSaida,
  pedeNegociacao,
  podeCobrar,
  saldoDevedor,
  templateDaFase,
  violacoesDeCobranca,
  type ContextoCobranca,
} from "./cobranca";
import { TEMPLATES_PADRAO } from "../automacao/templates";

const AGORA = new Date("2026-09-08T15:00:00.000Z");

const BASE: ContextoCobranca = {
  status: "ABERTA",
  vencimentoEm: "2026-09-01",
  valor: "1200.00",
  valorPago: "0.00",
  tentativasContato: 0,
  ultimoContatoEm: null,
  negociacaoHumana: false,
  optOut: false,
  temTelefone: true,
};

/* ========================================================================== */
/* Fases e prazos                                                             */
/* ========================================================================== */

describe("fases da cobrança", () => {
  it("conta os dias de atraso sem errar por causa de fuso", () => {
    // Vencida hoje é ZERO dia de atraso, não um. A comparação ao meio-dia
    // existe para isso.
    expect(diasDeAtraso("2026-09-08", AGORA)).toBe(0);
    expect(diasDeAtraso("2026-09-01", AGORA)).toBe(7);
    expect(diasDeAtraso("2026-09-15", AGORA)).toBe(-7);
  });

  it("separa as quatro fases", () => {
    expect(faseDaCobranca("2026-09-15", AGORA)).toBe("A_VENCER");
    expect(faseDaCobranca("2026-09-08", AGORA)).toBe("RECENTE");
    expect(faseDaCobranca("2026-09-01", AGORA)).toBe("RECENTE"); // 7 dias
    expect(faseDaCobranca("2026-08-31", AGORA)).toBe("ATRASADA"); // 8 dias
    expect(faseDaCobranca("2026-07-10", AGORA)).toBe("ATRASADA"); // 60 dias
    expect(faseDaCobranca("2026-07-09", AGORA)).toBe("ANTIGA"); // 61 dias
  });

  it("cada fase tem o seu template", () => {
    expect(templateDaFase("A_VENCER")).toBe("cobranca_lembrete");
    expect(templateDaFase("RECENTE")).toBe("cobranca_recente");
    expect(templateDaFase("ATRASADA")).toBe("cobranca_atrasada");
  });

  it("data inválida não vira atraso inventado", () => {
    expect(diasDeAtraso("não é data", AGORA)).toBe(0);
  });
});

describe("saldo devedor", () => {
  it("subtrai sem erro de ponto flutuante", () => {
    expect(saldoDevedor("1200.00", "400.00")).toBe("800.00");
    expect(saldoDevedor("0.30", "0.10")).toBe("0.20");
    expect(saldoDevedor("1200.00", "1200.00")).toBe("0.00");
  });

  it("nunca fica negativo — pagamento a maior não vira crédito aqui", () => {
    expect(saldoDevedor("100.00", "150.00")).toBe("0.00");
  });
});

/* ========================================================================== */
/* Quando a automação PODE cobrar                                             */
/* ========================================================================== */

describe("permissão de cobrança", () => {
  it("libera uma parcela em aberto, recém-vencida", () => {
    const r = podeCobrar(BASE, AGORA);
    expect(r.pode).toBe(true);
    if (r.pode) {
      expect(r.fase).toBe("RECENTE");
      expect(r.saldo).toBe("1200.00");
    }
  });

  it("não cobra o que já foi pago", () => {
    expect(podeCobrar({ ...BASE, status: "PAGA" }, AGORA).pode).toBe(false);
  });

  it("o SALDO manda sobre o status desatualizado", () => {
    // O arquivo do financeiro nem sempre chega junto: a parcela pode constar
    // ABERTA e já ter sido paga. Continuar cobrando quem pagou é o erro que
    // mais destrói confiança.
    const r = podeCobrar({ ...BASE, valorPago: "1200.00" }, AGORA);
    expect(r.pode).toBe(false);
  });

  it("não cobra o que foi renegociado ou cancelado", () => {
    for (const status of ["RENEGOCIADA", "CANCELADA", "INCOBRAVEL"] as const) {
      expect(podeCobrar({ ...BASE, status }, AGORA).pode, status).toBe(false);
    }
  });

  it("cala a automação quando um atendente está negociando", () => {
    const r = podeCobrar({ ...BASE, negociacaoHumana: true }, AGORA);
    expect(r.pode).toBe(false);
    if (!r.pode) expect(r.exigeHumano).toBe(false);
  });

  it("PARA no teto de tentativas e passa para humano — art. 42", () => {
    const r = podeCobrar({ ...BASE, tentativasContato: MAX_CONTATOS_COBRANCA }, AGORA);
    expect(r.pode).toBe(false);
    // `exigeHumano` é o que impede a dívida ser simplesmente esquecida por
    // ninguém poder mandar mensagem sobre ela.
    if (!r.pode) expect(r.exigeHumano).toBe(true);
  });

  it("respeita um cooldown MAIOR que o das outras jornadas", () => {
    const recente = new Date(AGORA.getTime() - (COOLDOWN_COBRANCA_HORAS - 1) * 3_600_000);
    const r = podeCobrar({ ...BASE, ultimoContatoEm: recente.toISOString() }, AGORA);
    expect(r.pode).toBe(false);

    const antigo = new Date(AGORA.getTime() - (COOLDOWN_COBRANCA_HORAS + 1) * 3_600_000);
    expect(podeCobrar({ ...BASE, ultimoContatoEm: antigo.toISOString() }, AGORA).pode).toBe(true);
  });

  it("cooldown de cobrança é mais largo que 24h — uma por dia é assédio", () => {
    expect(COOLDOWN_COBRANCA_HORAS).toBeGreaterThan(24);
    expect(MAX_CONTATOS_COBRANCA).toBeLessThanOrEqual(3);
  });

  it("atraso antigo NÃO vira mensagem automática — vira negociação humana", () => {
    const r = podeCobrar({ ...BASE, vencimentoEm: "2026-05-01" }, AGORA);
    expect(r.pode).toBe(false);
    if (!r.pode) expect(r.exigeHumano).toBe(true);
  });

  it("opt-out bloqueia a MENSAGEM, e não a cobrança", () => {
    // O paciente tem direito de não receber mensagem; a clínica tem direito de
    // receber. As duas coisas convivem por telefone. Por isso aqui o veredicto
    // é "exige humano", e não "encerra".
    const r = podeCobrar({ ...BASE, optOut: true }, AGORA);
    expect(r.pode).toBe(false);
    if (!r.pode) {
      expect(r.exigeHumano).toBe(true);
      expect(r.motivo).toMatch(/outro canal/iu);
    }
  });

  it("sem telefone, exige humano", () => {
    const r = podeCobrar({ ...BASE, temTelefone: false }, AGORA);
    expect(r.pode).toBe(false);
    if (!r.pode) expect(r.exigeHumano).toBe(true);
  });

  it("lembrete antes do vencimento é permitido", () => {
    const r = podeCobrar({ ...BASE, vencimentoEm: "2026-09-11" }, AGORA);
    expect(r.pode).toBe(true);
    if (r.pode) expect(r.fase).toBe("A_VENCER");
  });
});

/* ========================================================================== */
/* Leitura da resposta do paciente                                            */
/* ========================================================================== */

describe("pedido de negociação", () => {
  it("reconhece os pedidos comuns", () => {
    for (const texto of [
      "consigo parcelar?",
      "dá para dividir em duas vezes?",
      "queria negociar",
      "podemos fazer um acordo",
      "não tenho como pagar agora",
      "não consigo pagar esse mês",
      "estou desempregado",
      "está apertado agora",
      "posso pagar semana que vem",
      "quero falar com vocês",
      "tem algum desconto?",
    ]) {
      expect(pedeNegociacao(texto), `não reconheceu: ${texto}`).toBe(true);
    }
  });

  it("não confunde com conversa comum", () => {
    for (const texto of ["ok, obrigado", "recebi sim", "qual o endereço?", "bom dia"]) {
      expect(pedeNegociacao(texto), `falso positivo: ${texto}`).toBe(false);
    }
  });
});

describe("paciente afirma que já pagou", () => {
  it("reconhece a afirmação", () => {
    for (const texto of [
      "já paguei",
      "já foi pago",
      "paguei ontem",
      "já quitei isso",
      "tá pago",
      "mandei o pix",
      "posso mandar o comprovante",
    ]) {
      expect(afirmaQueJaPagou(texto), `não reconheceu: ${texto}`).toBe(true);
    }
  });

  it("não dispara em conversa comum", () => {
    for (const texto of ["vou pagar amanhã", "quando vence?", "oi"]) {
      expect(afirmaQueJaPagou(texto), `falso positivo: ${texto}`).toBe(false);
    }
  });
});

/* ========================================================================== */
/* A guarda do art. 42 — a parte que mais importa                             */
/* ========================================================================== */

describe("guarda de linguagem do art. 42 do CDC", () => {
  it("RECUSA ameaça de protesto e negativação", () => {
    expect(violacoesDeCobranca("Regularize ou seu nome será enviado a protesto.")).not.toHaveLength(
      0,
    );
    expect(violacoesDeCobranca("Sujeito a negativação nos órgãos de proteção.")).not.toHaveLength(
      0,
    );
    expect(violacoesDeCobranca("Seu CPF será enviado ao SPC.")).not.toHaveLength(0);
    expect(violacoesDeCobranca("Vamos encaminhar ao Serasa.")).not.toHaveLength(0);
    expect(violacoesDeCobranca("O caso irá para cartório.")).not.toHaveLength(0);
    expect(violacoesDeCobranca("Encaminhado ao setor jurídico.")).not.toHaveLength(0);
  });

  it("RECUSA pressão com prazo inventado", () => {
    expect(violacoesDeCobranca("Este é o último aviso.")).not.toHaveLength(0);
    expect(violacoesDeCobranca("O prazo final é amanhã.")).not.toHaveLength(0);
  });

  it("RECUSA rótulo que carimba o paciente", () => {
    expect(violacoesDeCobranca("Consta uma dívida em seu nome.")).not.toHaveLength(0);
    expect(violacoesDeCobranca("Você está inadimplente.")).not.toHaveLength(0);
    expect(violacoesDeCobranca("Prezado devedor,")).not.toHaveLength(0);
  });

  it("RECUSA valor exposto na mensagem", () => {
    // O WhatsApp pode ser lido por outra pessoa na tela de bloqueio. Dizer
    // quanto alguém deve ali é exposição — e quem deve já sabe quanto deve.
    expect(violacoesDeCobranca("Você tem R$ 1.240,00 em aberto.")).not.toHaveLength(0);
  });

  it("RECUSA juros e multa — isso é assunto para humano com contrato à mão", () => {
    expect(violacoesDeCobranca("Haverá juros de 2% ao mês.")).not.toHaveLength(0);
    expect(violacoesDeCobranca("Será cobrada multa por atraso.")).not.toHaveLength(0);
  });

  it("ACEITA a mensagem cuidadosa", () => {
    const boa =
      "Olá, Maria! Aqui é da JP. Notamos que a parcela do seu tratamento que venceu " +
      "em 01/09 ainda não foi identificada. Se já pagou, me avisa que eu confiro. " +
      "Se preferir outra forma de pagamento, podemos conversar.";
    expect(violacoesDeCobranca(boa)).toHaveLength(0);
  });

  it("diz O QUE está errado, e não só que está", () => {
    // Quem escreveu precisa saber o que corrigir. Uma resposta booleana
    // deixaria a pessoa adivinhando.
    const motivos = violacoesDeCobranca("Último aviso antes do protesto: sua dívida de R$ 500.");
    expect(motivos.length).toBeGreaterThan(2);
    expect(motivos.join(" ")).toMatch(/protesto/iu);
  });

  it("exige caminho de resposta", () => {
    expect(ofereceSaida("Se precisar, podemos conversar.")).toBe(true);
    expect(ofereceSaida("Me avisa que eu confiro.")).toBe(true);
    expect(ofereceSaida("Regularize até sexta.")).toBe(false);
  });
});

/* ========================================================================== */
/* Os templates do catálogo passam pela própria guarda                        */
/* ========================================================================== */

describe("templates de cobrança do catálogo", () => {
  const cobranca = Object.entries(TEMPLATES_PADRAO).filter(([chave]) =>
    chave.startsWith("cobranca_"),
  );

  it("o catálogo tem os quatro textos de cobrança", () => {
    expect(cobranca.map(([c]) => c).sort()).toEqual([
      "cobranca_atrasada",
      "cobranca_ja_pago",
      "cobranca_lembrete",
      "cobranca_recente",
    ]);
  });

  it("nenhum viola o art. 42", () => {
    for (const [chave, texto] of cobranca) {
      const motivos = violacoesDeCobranca(texto);
      expect(motivos, `${chave}: ${motivos.join("; ")}`).toHaveLength(0);
    }
  });

  it("os que iniciam contato oferecem saída", () => {
    for (const [chave, texto] of cobranca) {
      if (chave === "cobranca_ja_pago") continue; // é resposta, não cobrança
      expect(ofereceSaida(texto), `${chave} não oferece saída`).toBe(true);
    }
  });
});
