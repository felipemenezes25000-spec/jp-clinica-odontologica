/**
 * A política por canal — §15, §17, §52.
 *
 * ============================================================================
 *  O DEFEITO QUE ESTES TESTES TRAVAM É O REUSO CEGO DA REGRA DO WHATSAPP, e
 *  ele erra nos DOIS sentidos:
 *
 *    TRADUZIR PARA TEMPLATE      recusaria toda resposta legítima de
 *                                recepcionista no dia seguinte — Instagram e
 *                                Messenger não TÊM template aprovado.
 *
 *    TRADUZIR PARA TEXTO LIVRE   a Meta recusaria, e a IA tentaria de novo
 *                                achando que o erro foi transitório.
 *
 *  E há um terceiro, que é o mais caro: usar `HUMAN_AGENT` na automação. A
 *  etiqueta AFIRMA à Meta que uma pessoa está atendendo; uma automação que a
 *  usa está declarando falso à plataforma, e a penalidade é a conta.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import {
  avaliarPoliticaDoCanal,
  decisaoEhPermanente,
  decisaoPermite,
  JANELA_HUMANA_MS,
  JANELA_PADRAO_MS,
  MARGEM_MS,
  type EntradaDaPolitica,
} from "./politica-de-canal";

const AGORA = new Date("2026-09-15T12:00:00.000Z");

function haMs(ms: number): string {
  return new Date(AGORA.getTime() - ms).toISOString();
}

function base(p: Partial<EntradaDaPolitica> = {}): EntradaDaPolitica {
  return {
    canal: "instagram",
    ultimaMensagemDoUsuario: haMs(60_000),
    agora: AGORA,
    tipo: "resposta",
    quem: "atendente",
    ...p,
  };
}

/* -------------------------------------------------------------------------- */

describe("dentro das 24 horas, texto livre sai em qualquer canal", () => {
  it("instagram", () => {
    const d = avaliarPoliticaDoCanal(base({ canal: "instagram" }));
    expect(d.forma).toBe("PERMITIDO_TEXTO");
    expect(decisaoPermite(d)).toBe(true);
  });

  it("messenger", () => {
    expect(avaliarPoliticaDoCanal(base({ canal: "messenger" })).forma).toBe("PERMITIDO_TEXTO");
  });

  it("whatsapp", () => {
    expect(avaliarPoliticaDoCanal(base({ canal: "whatsapp" })).forma).toBe("PERMITIDO_TEXTO");
  });

  it("a IA também responde dentro da janela", () => {
    // É O CAMINHO NORMAL DA IA: o paciente escreveu e ela responde. Recusar
    // aqui deixaria alguém falando sozinho.
    expect(avaliarPoliticaDoCanal(base({ quem: "ia" })).forma).toBe("PERMITIDO_TEXTO");
  });

  it("a MARGEM fecha a janela antes do fim exato", () => {
    /*
     * A CORRIDA CLÁSSICA: o código julga a janela aberta faltando dois
     * segundos, a mensagem entra na fila, e quando o provedor a processa a
     * janela fechou. Cinco minutos é a folga.
     */
    const quaseFim = JANELA_PADRAO_MS - MARGEM_MS + 1_000;
    const d = avaliarPoliticaDoCanal(base({ ultimaMensagemDoUsuario: haMs(quaseFim) }));
    expect(d.forma).not.toBe("PERMITIDO_TEXTO");
  });
});

/* -------------------------------------------------------------------------- */

describe("fora das 24 horas o WhatsApp exige template", () => {
  const fora = { canal: "whatsapp" as const, ultimaMensagemDoUsuario: haMs(30 * 3_600_000) };

  it("com modelo aprovado, sai como template", () => {
    const d = avaliarPoliticaDoCanal(base({ ...fora, providerNome: "recall_v3" }));
    expect(d.forma).toBe("PERMITIDO_TEMPLATE");
    if (d.forma === "PERMITIDO_TEMPLATE") expect(d.providerNome).toBe("recall_v3");
  });

  it("sem modelo, recusa com código próprio", () => {
    const d = avaliarPoliticaDoCanal(base(fora));
    expect(d.forma).toBe("FORA_DA_JANELA");
    if (d.forma === "FORA_DA_JANELA") expect(d.codigo).toBe("WHATSAPP_SEM_TEMPLATE");
  });

  it("quem nunca escreveu só recebe template", () => {
    const d = avaliarPoliticaDoCanal(
      base({ canal: "whatsapp", ultimaMensagemDoUsuario: null, providerNome: null }),
    );
    expect(d.forma).toBe("FORA_DA_JANELA");
    expect(d.porque).toContain("nunca escreveu");
  });
});

/* -------------------------------------------------------------------------- */

describe("fora das 24 horas a Meta NÃO tem template — §15", () => {
  const fora = { ultimaMensagemDoUsuario: haMs(30 * 3_600_000) };

  it("o nome de template é IGNORADO no Instagram", () => {
    /*
     * ESTE É O TESTE CENTRAL DO ARQUIVO.
     *
     * Passar `providerNome` num envio de Instagram é sinal de que quem chamou
     * acha que os canais são iguais. A política o ignora — e NÃO devolve
     * `PERMITIDO_TEMPLATE`, que é o que o reuso cego produziria.
     */
    const d = avaliarPoliticaDoCanal(
      base({ ...fora, providerNome: "recall_v3", quem: "atendente", humanAgentAprovado: true }),
    );
    expect(d.forma).toBe("PERMITIDO_ETIQUETA_HUMANA");
  });

  it("com pessoa atendendo e feature aprovada, sai com HUMAN_AGENT", () => {
    const d = avaliarPoliticaDoCanal(
      base({ ...fora, quem: "atendente", humanAgentAprovado: true }),
    );
    expect(d.forma).toBe("PERMITIDO_ETIQUETA_HUMANA");
    if (d.forma === "PERMITIDO_ETIQUETA_HUMANA") expect(d.etiqueta).toBe("HUMAN_AGENT");
  });

  it("a IA NÃO pode usar a etiqueta humana", () => {
    /*
     * A etiqueta afirma à Meta que uma PESSOA está atendendo. Uma automação que
     * a usa está declarando falso à plataforma — e a penalidade é a conta, não
     * a mensagem.
     */
    const d = avaliarPoliticaDoCanal(base({ ...fora, quem: "ia", humanAgentAprovado: true }));
    expect(d.forma).toBe("EXIGE_HANDOFF");
    if (d.forma === "EXIGE_HANDOFF") expect(d.codigo).toBe("META_EXIGE_HUMANO");
  });

  it("a automação também não pode", () => {
    const d = avaliarPoliticaDoCanal(
      base({ ...fora, quem: "automacao", humanAgentAprovado: true }),
    );
    expect(d.forma).toBe("EXIGE_HANDOFF");
  });

  it("sem App Review da feature, nem a pessoa consegue enviar", () => {
    /*
     * FALSO É O PADRÃO, e o padrão é o correto: a feature exige App Review. Um
     * sistema que assume aprovação envia com a etiqueta, a Meta recusa com
     * `(#10) permission`, e o erro não parece com "falta App Review".
     */
    const d = avaliarPoliticaDoCanal(base({ ...fora, quem: "atendente" }));
    expect(d.forma).toBe("EXIGE_HANDOFF");
    if (d.forma === "EXIGE_HANDOFF") expect(d.codigo).toBe("HUMAN_AGENT_NAO_APROVADO");
    expect(d.porque).toContain("App Review");
  });

  it("passados 7 dias, nem a etiqueta humana reabre", () => {
    const d = avaliarPoliticaDoCanal(
      base({
        ultimaMensagemDoUsuario: haMs(JANELA_HUMANA_MS + 3_600_000),
        quem: "atendente",
        humanAgentAprovado: true,
      }),
    );
    expect(d.forma).toBe("FORA_DA_JANELA");
    if (d.forma === "FORA_DA_JANELA") expect(d.codigo).toBe("META_7_DIAS");
  });

  it("a clínica NÃO pode iniciar conversa no Instagram", () => {
    /*
     * Quem nunca escreveu não pode ser abordado por direct — é política da
     * plataforma, e não conservadorismo nosso. O código é próprio para o
     * runbook poder distinguir disto de "a janela fechou".
     */
    const d = avaliarPoliticaDoCanal(
      base({ ultimaMensagemDoUsuario: null, tipo: "proativo", quem: "atendente" }),
    );
    expect(d.forma).toBe("BLOQUEADO_POR_POLITICA");
    if (d.forma === "BLOQUEADO_POR_POLITICA") expect(d.codigo).toBe("META_SEM_CONVERSA");
  });
});

/* -------------------------------------------------------------------------- */

describe("o private reply tem janela própria — §17", () => {
  it("comentário de hoje libera UMA resposta", () => {
    const d = avaliarPoliticaDoCanal(
      base({
        tipo: "private_reply",
        // NÃO HÁ MENSAGEM DO USUÁRIO, e é o ponto: a pessoa nunca mandou
        // direct. O que autoriza é o comentário público.
        ultimaMensagemDoUsuario: null,
        comentarioEm: haMs(2 * 3_600_000),
        quem: "automacao",
      }),
    );
    expect(d.forma).toBe("PERMITIDO_PRIVATE_REPLY");
  });

  it("a ordem das perguntas importa: private reply não cai na regra de janela", () => {
    /*
     * ESTE TESTE EXISTE POR CAUSA DE UM ERRO DE ORDEM.
     *
     * Se a janela de 24h fosse avaliada antes, o private reply — que não tem
     * mensagem do usuário — seria SEMPRE recusado como "fora da janela", e a
     * capacidade inteira do §17 morreria em silêncio.
     */
    const d = avaliarPoliticaDoCanal(
      base({ tipo: "private_reply", ultimaMensagemDoUsuario: null, comentarioEm: haMs(1_000) }),
    );
    expect(d.forma).not.toBe("BLOQUEADO_POR_POLITICA");
    expect(d.forma).not.toBe("FORA_DA_JANELA");
  });

  it("comentário de 8 dias já expirou", () => {
    const d = avaliarPoliticaDoCanal(
      base({ tipo: "private_reply", comentarioEm: haMs(8 * 24 * 3_600_000) }),
    );
    expect(d.forma).toBe("FORA_DA_JANELA");
    if (d.forma === "FORA_DA_JANELA") expect(d.codigo).toBe("PRIVATE_REPLY_EXPIRADO");
  });

  it("sem instante do comentário, recusa em vez de chutar", () => {
    const d = avaliarPoliticaDoCanal(base({ tipo: "private_reply", comentarioEm: null }));
    expect(d.forma).toBe("BLOQUEADO_POR_POLITICA");
    if (d.forma === "BLOQUEADO_POR_POLITICA") expect(d.codigo).toBe("PRIVATE_REPLY_SEM_COMENTARIO");
  });

  it("private reply não existe no WhatsApp", () => {
    const d = avaliarPoliticaDoCanal(
      base({ canal: "whatsapp", tipo: "private_reply", comentarioEm: haMs(1_000) }),
    );
    expect(d.forma).toBe("BLOQUEADO_POR_POLITICA");
    if (d.forma === "BLOQUEADO_POR_POLITICA") expect(d.codigo).toBe("PRIVATE_REPLY_SO_META");
  });
});

/* -------------------------------------------------------------------------- */

describe("toda decisão é explicável e classificável", () => {
  const cenarios: EntradaDaPolitica[] = [
    base(),
    base({ ultimaMensagemDoUsuario: haMs(30 * 3_600_000) }),
    base({ canal: "whatsapp", ultimaMensagemDoUsuario: haMs(30 * 3_600_000) }),
    base({ ultimaMensagemDoUsuario: null, tipo: "proativo" }),
    base({ tipo: "private_reply", comentarioEm: haMs(1_000) }),
    base({ tipo: "private_reply", comentarioEm: haMs(9 * 24 * 3_600_000) }),
  ];

  it("nenhum motivo é vago", () => {
    /*
     * A FRASE VAI PARA A TELA E PARA O LOG. "Não permitido" não diz a ninguém o
     * que fazer, e o §48 do CRC — mensagem humana, código estável — vale aqui
     * também.
     */
    for (const c of cenarios) {
      expect(avaliarPoliticaDoCanal(c).porque.length).toBeGreaterThan(30);
    }
  });

  it("permitir e ser permanente são opostos exatos", () => {
    for (const c of cenarios) {
      const d = avaliarPoliticaDoCanal(c);
      expect(decisaoEhPermanente(d)).toBe(!decisaoPermite(d));
    }
  });
});
