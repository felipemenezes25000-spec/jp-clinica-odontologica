/**
 * Testes da camada de IA.
 *
 * O item 254 lista o que precisa estar provado para a IA ser considerada
 * pronta: classifica, schema válido, confiança, fallback, logging, escalonamento
 * humano, custo registrado, e falha do provedor não derrubar o sistema.
 *
 * Aqui ficam as partes puras — que são justamente as que protegem contra o
 * modelo. O resto (persistência, tarefa criada) depende de banco e é exercitado
 * pelo fluxo E2E.
 *
 * A PREMISSA DE TODO ESTE ARQUIVO: o modelo é uma fonte externa não confiável,
 * exatamente como a API do Dental Office. Ele pode devolver enum inventado,
 * confiança fora do intervalo, ou classificar dor de dente como pedido de
 * agendamento. O sistema tem que continuar correto quando isso acontece.
 */
import { describe, expect, it } from "vitest";

import { CONFIGURACAO_PADRAO } from "../dominio/configuracao";
import type { ClassificacaoConversa } from "../dominio/tipos";

import { decidirAutonomia, escalonamentoObrigatorio, validarClassificacao } from "./ia";

const BOA: Record<string, unknown> = {
  intencao: "AGENDAR",
  temperatura: "HOT",
  confianca: 0.92,
  exigeHumano: false,
  motivoEscalonamento: null,
  acaoSugerida: "SHOW_AVAILABLE_SLOTS",
  resumo: "Paciente quer marcar uma avaliação na próxima semana.",
};

/* ========================================================================== */
/* Validação da saída                                                         */
/* ========================================================================== */

describe("validação da saída da IA", () => {
  it("aceita a resposta bem formada", () => {
    const r = validarClassificacao(BOA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.classificacao.intencao).toBe("AGENDAR");
    expect(r.classificacao.acaoSugerida).toBe("SHOW_AVAILABLE_SLOTS");
    expect(r.classificacao.confianca).toBeCloseTo(0.92);
  });

  it("RECUSA ação inventada pelo modelo — item 174", () => {
    // Este é o teste mais importante do arquivo. Sem ele, um modelo que
    // devolvesse `"acaoSugerida": "APAGAR_PACIENTE"` chegaria ao executor.
    for (const acao of ["APAGAR_TUDO", "DELETE_PATIENT", "RUN_SQL", "", "SEND", null, 7]) {
      const r = validarClassificacao({ ...BOA, acaoSugerida: acao });
      expect(r.ok, `aceitou a ação inválida: ${String(acao)}`).toBe(false);
    }
  });

  it("tolera espaço e caixa na ação — é sujeira, não invenção", () => {
    // `" send_template "` é a ação certa mal formatada. Recusar por isso
    // jogaria fora uma classificação correta e mandaria para humano sem
    // necessidade, que é o oposto do que a IA existe para fazer.
    const r = validarClassificacao({ ...BOA, acaoSugerida: " send_template " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.classificacao.acaoSugerida).toBe("SEND_TEMPLATE");
  });

  it("recusa intenção fora do vocabulário", () => {
    expect(validarClassificacao({ ...BOA, intencao: "COMPRAR_CASA" }).ok).toBe(false);
    expect(validarClassificacao({ ...BOA, intencao: 42 }).ok).toBe(false);
    expect(validarClassificacao({ ...BOA, intencao: null }).ok).toBe(false);
  });

  it("recusa temperatura fora do vocabulário", () => {
    expect(validarClassificacao({ ...BOA, temperatura: "MORNO" }).ok).toBe(false);
  });

  it("recusa confiança fora de 0..1", () => {
    expect(validarClassificacao({ ...BOA, confianca: 1.5 }).ok).toBe(false);
    expect(validarClassificacao({ ...BOA, confianca: -0.1 }).ok).toBe(false);
    expect(validarClassificacao({ ...BOA, confianca: "muito alta" }).ok).toBe(false);
    expect(validarClassificacao({ ...BOA, confianca: null }).ok).toBe(false);
  });

  it("aceita maiúsculas/minúsculas diferentes nos enums", () => {
    // O modelo às vezes devolve `agendar`. Recusar por causa disso seria
    // desperdiçar uma classificação correta.
    const r = validarClassificacao({ ...BOA, intencao: "agendar", temperatura: "hot" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.classificacao.intencao).toBe("AGENDAR");
      expect(r.classificacao.temperatura).toBe("HOT");
    }
  });

  it("motivo de escalonamento desconhecido vira incerteza, e não recusa tudo", () => {
    // A intenção estava certa; só o rótulo do motivo veio estranho. Jogar a
    // classificação fora perderia informação boa — e `uncertain_intent` já
    // manda para humano de qualquer forma.
    const r = validarClassificacao({ ...BOA, motivoEscalonamento: "coisa_esquisita" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.classificacao.motivoEscalonamento).toBe("uncertain_intent");
      expect(r.classificacao.exigeHumano).toBe(true);
    }
  });

  it("motivo de escalonamento presente força exigeHumano, mesmo se o modelo disser que não", () => {
    const r = validarClassificacao({
      ...BOA,
      exigeHumano: false,
      motivoEscalonamento: "clinical_question",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.classificacao.exigeHumano).toBe(true);
  });

  it("resumo é truncado, e resumo ausente não quebra", () => {
    const longo = validarClassificacao({ ...BOA, resumo: "x".repeat(1000) });
    expect(longo.ok).toBe(true);
    if (longo.ok) expect(longo.classificacao.resumo.length).toBeLessThanOrEqual(400);

    const semResumo = validarClassificacao({ ...BOA, resumo: null });
    expect(semResumo.ok).toBe(true);
    if (semResumo.ok) expect(semResumo.classificacao.resumo).toBe("");
  });

  it("objeto vazio é recusado", () => {
    expect(validarClassificacao({}).ok).toBe(false);
  });
});

/* ========================================================================== */
/* Escalonamento obrigatório (item 48)                                        */
/* ========================================================================== */

describe("escalonamento obrigatório", () => {
  it("pega conteúdo clínico", () => {
    expect(escalonamentoObrigatorio("está doendo muito desde ontem")).toBe("clinical_question");
    expect(escalonamentoObrigatorio("minha gengiva está sangrando")).toBe("clinical_question");
    expect(escalonamentoObrigatorio("inchou o rosto")).toBe("clinical_question");
    expect(escalonamentoObrigatorio("estou com febre")).toBe("clinical_question");
  });

  it("pega pergunta sobre medicamento", () => {
    expect(escalonamentoObrigatorio("posso tomar dipirona?")).toBe("medication_question");
    expect(escalonamentoObrigatorio("preciso de receita do antibiótico")).toBe(
      "medication_question",
    );
  });

  it("pega reclamação e questão legal", () => {
    expect(escalonamentoObrigatorio("atendimento péssimo")).toBe("complaint");
    expect(escalonamentoObrigatorio("vou acionar o Procon")).toBe("legal_issue");
    expect(escalonamentoObrigatorio("vou processar a clínica")).toBe("legal_issue");
  });

  it("pega disputa financeira e pedido de desconto", () => {
    expect(escalonamentoObrigatorio("fui cobrado a mais")).toBe("payment_dispute");
    expect(escalonamentoObrigatorio("tem algum desconto?")).toBe("special_discount");
  });

  it("pega urgência", () => {
    expect(escalonamentoObrigatorio("é urgente")).toBe("angry_patient");
  });

  it("NÃO escala mensagem comercial comum", () => {
    // Escalar demais afogaria a equipe e faria a automação perder o sentido.
    for (const texto of [
      "quero marcar uma consulta",
      "pode ser na quinta de manhã?",
      "confirmo minha consulta",
      "obrigada!",
      "qual o endereço da clínica?",
    ]) {
      expect(escalonamentoObrigatorio(texto), `escalou sem motivo: ${texto}`).toBeNull();
    }
  });

  it("funciona sem acento, como as pessoas escrevem no WhatsApp", () => {
    expect(escalonamentoObrigatorio("esta doendo")).toBe("clinical_question");
    expect(escalonamentoObrigatorio("atendimento pessimo")).toBe("complaint");
    expect(escalonamentoObrigatorio("e urgencia")).toBe("angry_patient");
  });
});

/* ========================================================================== */
/* Limiares de confiança (item 44)                                            */
/* ========================================================================== */

const base: ClassificacaoConversa = {
  intencao: "AGENDAR",
  temperatura: "HOT",
  confianca: 0.9,
  exigeHumano: false,
  motivoEscalonamento: null,
  acaoSugerida: "SHOW_AVAILABLE_SLOTS",
  resumo: "",
};

describe("limiares de confiança", () => {
  it("acima do limiar alto, a IA pode agir", () => {
    expect(decidirAutonomia({ ...base, confianca: 0.9 }, CONFIGURACAO_PADRAO)).toBe("AUTOMATICA");
    expect(decidirAutonomia({ ...base, confianca: 0.85 }, CONFIGURACAO_PADRAO)).toBe("AUTOMATICA");
  });

  it("na faixa do meio, ela só sugere", () => {
    expect(decidirAutonomia({ ...base, confianca: 0.84 }, CONFIGURACAO_PADRAO)).toBe("SUGESTAO");
    expect(decidirAutonomia({ ...base, confianca: 0.6 }, CONFIGURACAO_PADRAO)).toBe("SUGESTAO");
  });

  it("abaixo do limiar baixo, humano obrigatório", () => {
    expect(decidirAutonomia({ ...base, confianca: 0.59 }, CONFIGURACAO_PADRAO)).toBe("HUMANO");
    expect(decidirAutonomia({ ...base, confianca: 0 }, CONFIGURACAO_PADRAO)).toBe("HUMANO");
  });

  it("escalonamento IGNORA a confiança — item 48", () => {
    // "O modelo tinha 0.99 de certeza" não é defesa aceitável quando o
    // paciente escreveu que está com dor.
    expect(
      decidirAutonomia(
        { ...base, confianca: 0.99, motivoEscalonamento: "clinical_question" },
        CONFIGURACAO_PADRAO,
      ),
    ).toBe("HUMANO");

    expect(
      decidirAutonomia({ ...base, confianca: 1, exigeHumano: true }, CONFIGURACAO_PADRAO),
    ).toBe("HUMANO");
  });

  it("os limiares vêm da configuração, e não do código — item 44", () => {
    const conservador = {
      ...CONFIGURACAO_PADRAO,
      iaConfiancaAutomatica: 0.95,
      iaConfiancaSugestao: 0.8,
    };
    expect(decidirAutonomia({ ...base, confianca: 0.9 }, conservador)).toBe("SUGESTAO");
    expect(decidirAutonomia({ ...base, confianca: 0.7 }, conservador)).toBe("HUMANO");
  });
});
