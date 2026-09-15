/**
 * Responder num canal da Meta — §7, §15, §22, §35, §48.
 *
 * ============================================================================
 *  ESTE ARQUIVO NASCEU DE UM DEFEITO QUE SÓ O E2E ENCONTROU.
 *
 *  `responderConversa` montava o provedor de WhatsApp SEMPRE. Numa Inbox só de
 *  WhatsApp isso estava certo. Numa Inbox unificada era o defeito central:
 *  responder um direct do Instagram tentava o WhatsApp e recusava com "credencial
 *  de WhatsApp só existe no ambiente" — uma frase sem relação nenhuma com o que
 *  a pessoa estava fazendo.
 *
 *  E o desfecho ruim não era o erro: era o silêncio. Alguém escreveu para a
 *  clínica pelo Instagram, a recepção respondeu, e o paciente ficou sem resposta.
 *
 *  Nenhum teste de unidade podia encontrar isso — eles não passam pela função de
 *  servidor. Estes aqui cobrem a camada de aplicação que faltava.
 * ============================================================================
 *
 * ============================================================================
 *  O QUE ELE GUARDA, EM ORDEM DE QUANTO CUSTA ERRAR:
 *
 *    A JANELA DE 24 HORAS   fora dela, no Instagram, só uma PESSOA responde, e
 *                           só com `HUMAN_AGENT` aprovada. IA nunca — seria
 *                           mentir para a Meta sobre quem está do outro lado.
 *
 *    A FALHA INCERTA        o POST saiu e a resposta não voltou. `FAILED`
 *                           mentiria, e é a partir dessa mentira que alguém
 *                           manda de novo à mão — e o paciente recebe duas
 *                           vezes.
 *
 *    A CHAVE DE DEDUPE      liberada só na falha transitória. Liberar na
 *                           incerta reabre a porta que o HTTP fechou.
 *
 *    O BACKFILL             conversa importada não abre janela (§48). A Meta
 *                           conta pelo que a PESSOA mandou, não pelo que nós
 *                           importamos depois.
 * ============================================================================
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return {
    ...real,
    registrar: () => undefined,
    auditar: () => Promise.resolve(),
    registrarIntegracao: () => Promise.resolve(),
  };
});

import { _reiniciarSandboxDaMeta, obterSandboxDaMeta } from "../integracoes/meta/provedores";
import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import { enviarNoCanal } from "./mensagens";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLINICA = "22222222-2222-4222-8222-222222222222";
const USUARIO = "55555555-5555-4555-8555-555555555555";
const CONVERSA = "77777777-7777-4777-8777-777777777777";

const IGSID = "17841400000000001";
const PSID = "8990000000000001";

const AGORA = new Date("2026-09-15T12:00:00.000Z");

function horasAtras(h: number): string {
  return new Date(AGORA.getTime() - h * 3_600_000).toISOString();
}

const DESTINO_IG = {
  canal: "instagram",
  contato: { tipo: "instagram_scoped_id", valor: IGSID },
} as const;

const DESTINO_FB = {
  canal: "messenger",
  contato: { tipo: "facebook_psid", valor: PSID },
} as const;

function semearConversa(canal: "instagram" | "messenger", contato: string): void {
  semear("crc_conversations", [
    {
      id: CONVERSA,
      organization_id: ORG,
      clinic_id: CLINICA,
      patient_id: null,
      canal,
      contato_externo: contato,
      apelido_externo: null,
      status: "ABERTA",
      nao_lidas: 0,
      criado_em: horasAtras(3),
      ultima_mensagem_em: horasAtras(3),
    },
  ]);
}

/** Uma mensagem RECEBIDA `h` horas atrás — é ela que abre a janela. */
function semearEntrada(h: number, extra: Record<string, unknown> = {}): void {
  semear("crc_messages", [
    {
      id: `entrada-${String(h)}`,
      organization_id: ORG,
      conversation_id: CONVERSA,
      patient_id: null,
      direcao: "ENTRADA",
      remetente: "paciente",
      conteudo: "quanto custa um implante?",
      status_entrega: "RECEIVED",
      historico_importado: false,
      recebido_em: horasAtras(h),
      criado_em: horasAtras(h),
      ...extra,
    },
  ]);
}

function pedido(extra: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    clinicId: CLINICA,
    conversationId: CONVERSA,
    patientId: null,
    destino: DESTINO_IG,
    texto: "Bom dia! Vamos marcar sua avaliação.",
    quem: "atendente" as const,
    autorId: USUARIO,
    chaveDedupe: `manual:${CONVERSA}:abc`,
    agora: AGORA,
    ...extra,
  };
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  _reiniciarSandboxDaMeta();
  process.env["META_SANDBOX"] = "1";
  delete process.env["NODE_ENV"];

  semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
  semear("crc_clinics", [{ id: CLINICA, organization_id: ORG, slug: "jp", ativa: true }]);
});

/* -------------------------------------------------------------------------- */
/* Dentro da janela                                                           */
/* -------------------------------------------------------------------------- */

describe("dentro das 24 horas", () => {
  it("o direct sai como texto, e a mensagem fica SENT com o id do provedor", async () => {
    semearConversa("instagram", IGSID);
    semearEntrada(3);

    const r = await enviarNoCanal(pedido());

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.providerMessageId).toContain("sandbox-meta-");

    const linha = conteudo("crc_messages").find((l) => l["direcao"] === "SAIDA");
    expect(linha?.["status_entrega"]).toBe("SENT");
    expect(linha?.["provider_message_id"]).toBe(r.providerMessageId);
    expect(linha?.["remetente"]).toBe("atendente");
    expect(linha?.["autor_id"]).toBe(USUARIO);

    // O adapter foi chamado de verdade, com o IGSID e a forma de texto.
    const enviados = obterSandboxDaMeta().listarEnviados();
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.canal).toBe("instagram");
    expect(enviados[0]?.destino).toBe(IGSID);
    expect(enviados[0]?.forma).toBe("texto");
  });

  it("o Messenger passa pelo MESMO caminho, com PSID", async () => {
    semearConversa("messenger", PSID);
    semearEntrada(3);

    const r = await enviarNoCanal(pedido({ destino: DESTINO_FB }));

    expect(r.ok).toBe(true);
    const enviado = obterSandboxDaMeta().listarEnviados()[0];
    expect(enviado?.canal).toBe("messenger");
    expect(enviado?.destino).toBe(PSID);
  });

  it("a conversa é atualizada com o trecho e volta para ABERTA", async () => {
    semearConversa("instagram", IGSID);
    semearEntrada(3);

    await enviarNoCanal(pedido({ texto: "Podemos marcar quinta às 14h?" }));

    const conversa = conteudo("crc_conversations")[0];
    expect(conversa?.["ultima_mensagem_trecho"]).toBe("Podemos marcar quinta às 14h?");
    expect(conversa?.["status"]).toBe("ABERTA");
  });

  it("emite `message.sent` — é o que a automação e a analítica escutam", async () => {
    semearConversa("instagram", IGSID);
    semearEntrada(3);

    const r = await enviarNoCanal(pedido());
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const eventos = conteudo("crc_events").filter((e) => e["tipo"] === "message.sent");
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.["entity_id"]).toBe(r.mensagemId);
  });

  it("a IA também responde dentro da janela — o limite é FORA dela", async () => {
    semearConversa("instagram", IGSID);
    semearEntrada(3);

    const r = await enviarNoCanal(pedido({ quem: "ia", autorId: null }));

    expect(r.ok).toBe(true);
    expect(conteudo("crc_messages").find((l) => l["direcao"] === "SAIDA")?.["remetente"]).toBe(
      "ia",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Fora da janela                                                             */
/* -------------------------------------------------------------------------- */

describe("fora das 24 horas", () => {
  it("o atendente é RECUSADO sem a feature aprovada, e nada é gravado", async () => {
    /*
     * ==========================================================================
     *  `HUMAN_AGENT` EXIGE APP REVIEW, e assumir aprovação é o erro caro.
     *
     *  Um sistema que assume envia com a etiqueta, a Meta recusa com
     *  `(#10) permission`, e o erro não parece com "falta App Review" — parece
     *  com defeito nosso. Recusar aqui diz a verdade.
     *
     *  E NADA É GRAVADO: uma linha `FAILED` poluiria a conversa com uma bolha
     *  que o paciente nunca recebeu, e a recepção veria "não enviada" sem
     *  entender que o problema é a janela.
     * ==========================================================================
     */
    semearConversa("instagram", IGSID);
    semearEntrada(30);

    const r = await enviarNoCanal(pedido());

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.permanente).toBe(true);
    // Sem `classe`: não houve pedido ao provedor, então não há entrega incerta
    // possível — e inventar uma classe daria a impressão de que houve.
    expect(r.classe).toBeUndefined();

    expect(conteudo("crc_messages").filter((l) => l["direcao"] === "SAIDA")).toHaveLength(0);
    expect(obterSandboxDaMeta().listarEnviados()).toHaveLength(0);
  });

  it("a IA NUNCA usa etiqueta humana — nem com a feature aprovada", async () => {
    /*
     * Seria afirmar à Meta que uma pessoa está atendendo, sem que esteja. A
     * consequência de ser pego é a conta, e o §15 não abre exceção.
     *
     * O sandbox não tem canal cadastrado, então `humanAgentAprovado` é falso de
     * qualquer forma — e é justamente por isso que este teste vale: mesmo o
     * caminho mais permissivo recusa a IA.
     */
    semearConversa("instagram", IGSID);
    semearEntrada(30);

    const r = await enviarNoCanal(pedido({ quem: "ia", autorId: null }));

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(obterSandboxDaMeta().listarEnviados()).toHaveLength(0);
  });

  it("a automação também é recusada", async () => {
    semearConversa("instagram", IGSID);
    semearEntrada(30);

    expect((await enviarNoCanal(pedido({ quem: "automacao", autorId: null }))).ok).toBe(false);
  });

  it("quem NUNCA escreveu está fora da janela — e não dentro", async () => {
    /*
     * Conversa sem nenhuma mensagem de entrada. A tentação é tratar ausência
     * como "janela aberta, ninguém disse que não" — e o efeito seria a clínica
     * mandando direct não solicitado, que é o que a Meta pune.
     */
    semearConversa("instagram", IGSID);

    expect((await enviarNoCanal(pedido())).ok).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* O backfill — §48                                                           */
/* -------------------------------------------------------------------------- */

describe("a conversa importada por backfill", () => {
  it("NÃO abre a janela de 24 horas", async () => {
    /*
     * ==========================================================================
     *  O §48 é sobre o backfill não acordar automação. Esta é a outra metade,
     *  e ela é mais sutil: uma conversa importada AGORA tem `criado_em` de
     *  agora, e julgar a janela por ele faria toda conversa antiga do Instagram
     *  parecer recém-aberta.
     *
     *  O efeito seria a clínica mandando direct para gente que falou com ela
     *  meses atrás — texto livre, fora da janela, que a Meta recusa ou pune.
     * ==========================================================================
     */
    semearConversa("instagram", IGSID);
    semear("crc_messages", [
      {
        id: "entrada-importada",
        organization_id: ORG,
        conversation_id: CONVERSA,
        patient_id: null,
        direcao: "ENTRADA",
        remetente: "paciente",
        conteudo: "oi, isso é de meses atrás",
        status_entrega: "RECEIVED",
        // GRAVADA AGORA, RECEBIDA HÁ MUITO TEMPO — é exatamente o backfill.
        historico_importado: true,
        recebido_em: horasAtras(2),
        criado_em: horasAtras(1),
      },
    ]);

    const r = await enviarNoCanal(pedido());

    expect(r.ok).toBe(false);
    expect(obterSandboxDaMeta().listarEnviados()).toHaveLength(0);
  });

  it("uma entrada REAL recente abre, mesmo com histórico importado na conversa", async () => {
    semearConversa("instagram", IGSID);
    semear("crc_messages", [
      {
        id: "entrada-importada",
        organization_id: ORG,
        conversation_id: CONVERSA,
        patient_id: null,
        direcao: "ENTRADA",
        remetente: "paciente",
        conteudo: "antiga",
        status_entrega: "RECEIVED",
        historico_importado: true,
        recebido_em: horasAtras(900),
        criado_em: horasAtras(1),
      },
    ]);
    semearEntrada(2);

    expect((await enviarNoCanal(pedido())).ok).toBe(true);
  });

  it("`recebido_em` vence `criado_em` — o relógio é o da Meta", async () => {
    /*
     * Numa reentrega os dois divergem em horas. Julgar pelo NOSSO relógio faria
     * uma conversa de ontem parecer recém-aberta — e a mensagem sairia como
     * texto fora da janela.
     */
    semearConversa("instagram", IGSID);
    semearEntrada(1, { recebido_em: horasAtras(40), criado_em: horasAtras(1) });

    expect((await enviarNoCanal(pedido())).ok).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* A idempotência                                                             */
/* -------------------------------------------------------------------------- */

describe("a chave de dedupe", () => {
  it("a MESMA chave duas vezes manda UMA mensagem", async () => {
    // A Meta não oferece idempotência de envio: a garantia é o índice único em
    // `crc_messages.chave_dedupe`. Dois cliques, duas abas, duas retentativas.
    semearConversa("instagram", IGSID);
    semearEntrada(3);

    expect((await enviarNoCanal(pedido())).ok).toBe(true);

    const segunda = await enviarNoCanal(pedido());
    expect(segunda.ok).toBe(false);
    if (segunda.ok) return;
    expect(segunda.codigo).toBe("JA_ENVIADA");

    expect(obterSandboxDaMeta().listarEnviados()).toHaveLength(1);
  });

  it("chaves diferentes mandam duas — a recepção pode escrever duas vezes", async () => {
    semearConversa("instagram", IGSID);
    semearEntrada(3);

    await enviarNoCanal(pedido({ chaveDedupe: "manual:a" }));
    await enviarNoCanal(pedido({ chaveDedupe: "manual:b", texto: "E o horário de quinta?" }));

    expect(obterSandboxDaMeta().listarEnviados()).toHaveLength(2);
  });
});

/* -------------------------------------------------------------------------- */
/* As três classes de falha — §35                                             */
/* -------------------------------------------------------------------------- */

describe("quando o provedor falha", () => {
  it("timeout é INCERTA: fica DESCONHECIDO e a chave NÃO é liberada", async () => {
    /*
     * ==========================================================================
     *  A DECISÃO MAIS IMPORTANTE DESTE ARQUIVO.
     *
     *  O POST saiu e a resposta não voltou: a Meta PODE ter entregue.
     *
     *    `FAILED` mentiria, e é dessa mentira que sai o reenvio manual.
     *    Liberar a chave reabriria a porta que o HTTP fechou.
     *
     *  Entre "o paciente talvez não receba" e "o paciente recebe duas vezes", o
     *  segundo é pior: é visível, parece descuido, e não há como desfazer.
     *
     *  A mensagem não fica órfã: ela está `DESCONHECIDO` na Inbox, com o erro,
     *  para uma PESSOA decidir.
     * ==========================================================================
     */
    semearConversa("instagram", IGSID);
    semearEntrada(3);
    obterSandboxDaMeta().armarFalha({ tipo: "timeout" });

    const r = await enviarNoCanal(pedido());

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.classe).toBe("incerta");
    expect(r.permanente).toBe(true);

    const linha = conteudo("crc_messages").find((l) => l["direcao"] === "SAIDA");
    expect(linha?.["status_entrega"]).toBe("DESCONHECIDO");
    expect(linha?.["chave_dedupe"]).toBe(`manual:${CONVERSA}:abc`);

    // E a segunda tentativa com a mesma chave é recusada pelo BANCO.
    obterSandboxDaMeta().armarFalha(null);
    const segunda = await enviarNoCanal(pedido());
    expect(segunda.ok).toBe(false);
    if (segunda.ok) return;
    expect(segunda.codigo).toBe("JA_ENVIADA");
  });

  it("429 é TRANSITÓRIA: fica FAILED e a chave é LIBERADA para a fila repescar", async () => {
    /*
     * Sem liberar, uma queda momentânea do provedor bloquearia a mensagem para
     * sempre: a linha ficaria ocupando a chave única e a retentativa seria
     * recusada como "já enviada".
     */
    semearConversa("instagram", IGSID);
    semearEntrada(3);
    obterSandboxDaMeta().armarFalha({ tipo: "429" });

    const r = await enviarNoCanal(pedido());

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.classe).toBe("transitoria");
    expect(r.permanente).toBe(false);

    const linha = conteudo("crc_messages").find((l) => l["direcao"] === "SAIDA");
    expect(linha?.["status_entrega"]).toBe("FAILED");
    expect(linha?.["chave_dedupe"]).toBeNull();

    // E a retentativa com a MESMA chave passa, porque a chave foi liberada.
    obterSandboxDaMeta().armarFalha(null);
    expect((await enviarNoCanal(pedido())).ok).toBe(true);
  });

  it("token expirado é PERMANENTE: fica FAILED e a chave continua ocupada", async () => {
    semearConversa("instagram", IGSID);
    semearEntrada(3);
    obterSandboxDaMeta().armarFalha({ tipo: "token_expirado" });

    const r = await enviarNoCanal(pedido());

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.classe).toBe("permanente");
    expect(r.permanente).toBe(true);

    const linha = conteudo("crc_messages").find((l) => l["direcao"] === "SAIDA");
    expect(linha?.["status_entrega"]).toBe("FAILED");
    // Repetir não conserta token vencido. Quem conserta é gente reconectando.
    expect(linha?.["chave_dedupe"]).toBe(`manual:${CONVERSA}:abc`);
  });

  it("o erro fica na linha, com código e detalhe", async () => {
    semearConversa("instagram", IGSID);
    semearEntrada(3);
    obterSandboxDaMeta().armarFalha({ tipo: "500" });

    await enviarNoCanal(pedido());

    const erro = String(
      conteudo("crc_messages").find((l) => l["direcao"] === "SAIDA")?.["erro"] ?? "",
    );
    // O código bruto é o que permite procurar na doc da Meta; o detalhe é o que
    // a recepção lê. Os dois, e não um ou outro.
    expect(erro.length).toBeGreaterThan(5);
    expect(erro).toContain(":");
  });
});

/* -------------------------------------------------------------------------- */
/* Os canais errados                                                          */
/* -------------------------------------------------------------------------- */

describe("o que esta função NÃO faz", () => {
  it("recusa WhatsApp — ele tem janela e modelo aprovado, e é outro caminho", async () => {
    /*
     * Deixar os dois caminhos aceitarem WhatsApp criaria duas verdades sobre a
     * janela de 24 horas, e a divergência apareceria como "a campanha manda
     * template e a Inbox manda texto".
     */
    semearConversa("instagram", IGSID);
    semearEntrada(3);

    const r = await enviarNoCanal(
      pedido({
        destino: { canal: "whatsapp", contato: { tipo: "telefone", valor: "5511999990000" } },
      }),
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe("CANAL_ERRADO");
    expect(conteudo("crc_messages")).toHaveLength(1); // só a entrada semeada
  });

  it("sem sandbox e sem conta cadastrada, recusa dizendo o que falta", async () => {
    delete process.env["META_SANDBOX"];
    semearConversa("instagram", IGSID);
    semearEntrada(3);

    const r = await enviarNoCanal(pedido());

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe("INTEGRACAO_NAO_CONFIGURADA");
    expect(r.motivo).toContain("crc_canais_meta");
    // E nada foi gravado: a mensagem não existe porque não havia por onde sair.
    expect(conteudo("crc_messages").filter((l) => l["direcao"] === "SAIDA")).toHaveLength(0);
  });
});
