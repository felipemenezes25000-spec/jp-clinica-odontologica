/**
 * Testes dos portões e da janela de atendimento.
 *
 * O QUE ESTES TESTES PROTEGEM não é a regex — é a promessa de que existe um
 * lugar, fora do prompt, onde a máquina é impedida de dar diagnóstico, prometer
 * o que não fez e falar com quem pediu para sair.
 *
 * Cada caso passa entrada explícita e afirma o veredicto. Nenhum varre catálogo
 * nem depende de banco: se um destes quebrar, quebrou a regra, não o cenário.
 */
import { describe, expect, it } from "vitest";

import {
  avaliarAntesDeEnviar,
  portaoClinico,
  portaoPromessa,
  portaoRepeticao,
  portaoVazamento,
  type ContextoPortao,
} from "./guardrails";
import { comoEnviar, estadoDaJanela, JANELA_ATENDIMENTO_MS } from "./janela-whatsapp";

const BASE: ContextoPortao = {
  texto: "Oi, Maria! Consegui quinta às 14h. Serve para você?",
  temOptOut: false,
  ultimaEntrada: "Pode ser quinta?",
  dono: "ia",
  janelaAberta: true,
  enviadosRecentes: [],
  pediuHumano: false,
};

const ctx = (mudancas: Partial<ContextoPortao>): ContextoPortao => ({ ...BASE, ...mudancas });

describe("a cadeia de portões", () => {
  it("deixa passar uma resposta normal de recepção", () => {
    expect(avaliarAntesDeEnviar(BASE).passa).toBe(true);
  });

  it("para no primeiro veto, e o primeiro é o opt-out", () => {
    // Texto clínico E opt-out: quem pediu para sair nem deve ter o conteúdo
    // examinado, então o motivo tem de ser o opt-out.
    const r = avaliarAntesDeEnviar(
      ctx({ temOptOut: true, texto: "Tome amoxicilina 500mg de 8 em 8 horas." }),
    );
    expect(r.passa).toBe(false);
    if (!r.passa) {
      expect(r.codigo).toBe("opt_out");
      expect(r.destino).toBe("descartar");
    }
  });

  it("cala a IA quando um atendente assumiu a conversa", () => {
    const r = avaliarAntesDeEnviar(ctx({ dono: "humano" }));
    expect(r.passa).toBe(false);
    if (!r.passa) expect(r.codigo).toBe("conversa_com_humano");
  });

  it("respeita o agente quando ele pede humano", () => {
    const r = avaliarAntesDeEnviar(ctx({ pediuHumano: true }));
    expect(r.passa).toBe(false);
    if (!r.passa) expect(r.destino).toBe("humano");
  });

  it("recusa texto livre fora da janela, e manda para humano", () => {
    const r = avaliarAntesDeEnviar(ctx({ janelaAberta: false }));
    expect(r.passa).toBe(false);
    if (!r.passa) {
      expect(r.codigo).toBe("fora_da_janela");
      expect(r.destino).toBe("humano");
    }
  });
});

describe("nada clínico sai da máquina", () => {
  const proibidas = [
    "Tome amoxicilina 500mg de 8 em 8 horas.",
    "Você pode tomar dipirona até passar.",
    "Pelo que descreveu, você está com uma infecção.",
    "Vou receitar um anti-inflamatório para você.",
    "Tome 2 comprimidos a cada 6 horas.",
  ];
  for (const texto of proibidas) {
    it(`barra: ${texto.slice(0, 38)}…`, () => {
      const v = portaoClinico.avaliar(ctx({ texto }));
      expect(v.passa).toBe(false);
      if (!v.passa) expect(v.destino).toBe("humano");
    });
  }

  it("não confunde frase normal de recepção com orientação clínica", () => {
    // "dor" numa resposta não é prescrição. Se este teste quebrar, o portão
    // ficou largo demais e vai mandar conversa boa para a fila humana.
    const ok = [
      "Se sentir qualquer dor, me avise por aqui.",
      "A doutora vai avaliar isso na consulta.",
      "Sua consulta é quinta às 14h.",
    ];
    for (const texto of ok) {
      expect(portaoClinico.avaliar(ctx({ texto })).passa).toBe(true);
    }
  });
});

describe("a máquina não promete o que não fez", () => {
  const promessas = [
    "Vou verificar com o financeiro e te retorno.",
    "Já estou agendando para você.",
    "Alguém da recepção vai te ligar hoje.",
    "Te confirmo em breve.",
  ];
  for (const texto of promessas) {
    it(`barra: ${texto.slice(0, 34)}…`, () => {
      expect(portaoPromessa.avaliar(ctx({ texto })).passa).toBe(false);
    });
  }

  it("deixa passar a frase que RELATA o que já aconteceu", () => {
    expect(portaoPromessa.avaliar(ctx({ texto: "Marquei quinta às 14h para você." })).passa).toBe(
      true,
    );
  });
});

describe("o paciente não vê a cozinha", () => {
  const vazamentos = [
    "Como assistente de IA, não posso responder isso.",
    "Não consegui executar a ferramenta de agenda.",
    "Erro no payload da API.",
    "Segundo minhas instruções, devo encaminhar.",
  ];
  for (const texto of vazamentos) {
    it(`barra: ${texto.slice(0, 34)}…`, () => {
      const v = portaoVazamento.avaliar(ctx({ texto }));
      expect(v.passa).toBe(false);
      if (!v.passa) expect(v.destino).toBe("descartar");
    });
  }
});

describe("a mesma mensagem não sai duas vezes", () => {
  it("pega repetição mesmo com pontuação e emoji diferentes", () => {
    const v = portaoRepeticao.avaliar(
      ctx({
        texto: "Oi, Maria! Consegui quinta às 14h 😊",
        enviadosRecentes: ["Oi Maria, consegui quinta as 14h."],
      }),
    );
    expect(v.passa).toBe(false);
  });

  it("deixa passar mensagem diferente", () => {
    expect(
      portaoRepeticao.avaliar(
        ctx({ texto: "E sexta às 9h, serve?", enviadosRecentes: ["Consegui quinta às 14h."] }),
      ).passa,
    ).toBe(true);
  });
});

describe("a janela de 24 horas do WhatsApp", () => {
  const AGORA = new Date("2026-09-11T15:00:00.000Z");

  it("está aberta logo depois do paciente escrever", () => {
    const e = estadoDaJanela(new Date(AGORA.getTime() - 60 * 60 * 1000), AGORA);
    expect(e.aberta).toBe(true);
  });

  it("fecha depois de 24 horas", () => {
    const e = estadoDaJanela(new Date(AGORA.getTime() - 25 * 60 * 60 * 1000), AGORA);
    expect(e.aberta).toBe(false);
    if (!e.aberta) expect(e.motivo).toBe("expirou");
  });

  it("fecha ANTES do limite exato, por causa da margem", () => {
    // Faltando dois minutos para as 24h a janela já conta como fechada: a
    // mensagem ainda passa por fila e retry antes de chegar ao provedor.
    const quaseLa = new Date(AGORA.getTime() - (JANELA_ATENDIMENTO_MS - 2 * 60 * 1000));
    expect(estadoDaJanela(quaseLa, AGORA).aberta).toBe(false);
  });

  it("está fechada para quem nunca escreveu", () => {
    const e = estadoDaJanela(null, AGORA);
    expect(e.aberta).toBe(false);
    if (!e.aberta) expect(e.motivo).toBe("nunca_escreveu");
  });
});

describe("como a mensagem sai", () => {
  const AGORA = new Date("2026-09-11T15:00:00.000Z");
  const aberta = estadoDaJanela(new Date(AGORA.getTime() - 60_000), AGORA);
  const fechada = estadoDaJanela(null, AGORA);

  it("dentro da janela, texto livre — mesmo havendo template", () => {
    // Template dentro da janela gastaria tarifa de utilidade onde a resposta
    // é serviço. Ver docs/crc/CUSTO-DAS-MENSAGENS.md.
    expect(comoEnviar({ janela: aberta, providerNome: "confirmacao_v1" }).forma).toBe("texto");
  });

  it("fora da janela, template aprovado", () => {
    const f = comoEnviar({ janela: fechada, providerNome: "confirmacao_v1" });
    expect(f.forma).toBe("template");
    if (f.forma === "template") expect(f.providerNome).toBe("confirmacao_v1");
  });

  it("fora da janela e sem template aprovado, recusa com motivo", () => {
    // ESTE É O BUG QUE O CRC TINHA: ele mandava texto livre aqui, e a Meta
    // recusava com 131047 sem nada aparecer na tela.
    const f = comoEnviar({ janela: fechada, providerNome: null });
    expect(f.forma).toBe("recusado");
    if (f.forma === "recusado") expect(f.codigo).toBe("fora_da_janela_sem_template");
  });

  it("template só vale com nome aprovado no provedor, não com string vazia", () => {
    expect(comoEnviar({ janela: fechada, providerNome: "   " }).forma).toBe("recusado");
  });
});
