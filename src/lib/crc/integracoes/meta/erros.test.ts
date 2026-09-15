/**
 * A classificação de erro da Graph — §35, §38, §52.
 *
 * ============================================================================
 *  A CLASSIFICAÇÃO POR FAIXA DE HTTP ESTÁ ERRADA PARA A GRAPH API, e é o que
 *  estes testes travam.
 *
 *  `meta-cloud.ts` classifica por faixa — "4xx que não é 429 é permanente". É
 *  correto para envio de WhatsApp e errado para a Graph em geral, porque a Meta
 *  devolve 400 para coisas que se resolvem sozinhas:
 *
 *      (#4)   limite da aplicação   → TRANSITÓRIA. Tratar como permanente faria
 *                                     a integração desligar sozinha num pico de
 *                                     movimento — e ficar desligada.
 *
 *      (#190) token inválido        → PERMANENTE. Tratar como transitória faria
 *                                     o sistema martelar um token morto por
 *                                     cinco tentativas, em cada mensagem, para
 *                                     sempre.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import { classificarFalhaDeRede, classificarRespostaDaGraph } from "./erros";

function daMeta(codigo: number, status = 400, subcodigo?: number) {
  return classificarRespostaDaGraph({
    status,
    corpo: {
      error: {
        code: codigo,
        message: `mensagem do erro ${String(codigo)}`,
        ...(subcodigo === undefined ? {} : { error_subcode: subcodigo }),
      },
    },
    texto: "",
  });
}

describe("os códigos que se resolvem sozinhos são TRANSITÓRIOS", () => {
  it("(#4) limite da aplicação", () => {
    const e = daMeta(4);
    expect(e.classe).toBe("transitoria");
    expect(e.esperarMs).toBeGreaterThan(0);
    expect(e.exigeReconexao).toBe(false);
  });

  it("(#17) e (#32) — limite de usuário e de página", () => {
    expect(daMeta(17).classe).toBe("transitoria");
    expect(daMeta(32).classe).toBe("transitoria");
  });

  it("(#2) erro temporário do serviço", () => {
    expect(daMeta(2, 500).classe).toBe("transitoria");
  });

  it("toda transitória diz QUANTO esperar", () => {
    for (const c of [1, 2, 4, 17, 32]) {
      expect(daMeta(c).esperarMs).not.toBeNull();
    }
  });
});

describe("os códigos que exigem uma PESSOA são permanentes", () => {
  it("(#190) token inválido exige reconexão", () => {
    const e = daMeta(190);
    expect(e.classe).toBe("permanente");
    expect(e.exigeReconexao).toBe(true);
    // A tela usa isto para mostrar "Reconectar" em vez de "Tentar de novo".
    expect(e.esperarMs).toBeNull();
    expect(e.acao).toContain("reconectar");
  });

  it("(#10) falta permissão aponta para o App Review", () => {
    const e = daMeta(10);
    expect(e.classe).toBe("permanente");
    /*
     * "(#10) Application does not have permission for this action" não diz a
     * ninguém que falta pedir `instagram_business_manage_messages` no App
     * Review — e é essa a ação. Um erro sem próxima ação vira um chamado.
     */
    expect(e.acao).toContain("App Review");
  });

  it("(#368) bloqueio por política manda NÃO insistir", () => {
    const e = daMeta(368);
    expect(e.classe).toBe("permanente");
    expect(e.acao).toContain("NÃO insista");
  });

  it("(#10900) private reply já respondido", () => {
    /*
     * Sem este mapeado, a reserva do §17 ficaria `FALHOU` e a próxima volta
     * tentaria de novo — martelando um endpoint que nunca vai aceitar, e
     * gastando a cota de 750/hora.
     */
    expect(daMeta(10900).classe).toBe("permanente");
  });

  it("(#10903) comentário não elegível", () => {
    expect(daMeta(10903).classe).toBe("permanente");
  });
});

describe("o subcódigo vence o código", () => {
  it("(#190) com subcódigo mapeado usa o subcódigo", () => {
    /*
     * (#190) é "token inválido" genérico; o subcódigo diz se a pessoa trocou a
     * senha, se o app foi removido, ou se o token só venceu. Para o runbook, a
     * diferença é entre "renove" e "a clínica removeu o app do Facebook dela".
     */
    const e = daMeta(190, 400, 102);
    expect(e.classe).toBe("permanente");
    expect(e.exigeReconexao).toBe(true);
  });
});

describe("a faixa de HTTP é o último recurso", () => {
  it("429 sem `Retry-After` espera o padrão ALTO", () => {
    const e = classificarRespostaDaGraph({ status: 429, corpo: {}, texto: "" });
    expect(e.classe).toBe("transitoria");
    /*
     * A cota da Meta é por HORA. Reintentar em dois segundos não restaura cota:
     * consome mais uma chamada do balde que acabou de estourar, e a Meta conta
     * a recusa como uso.
     */
    expect(e.esperarMs).toBeGreaterThanOrEqual(30_000);
  });

  it("429 COM `Retry-After` respeita o provedor", () => {
    const h = new Headers({ "retry-after": "12" });
    const e = classificarRespostaDaGraph({ status: 429, corpo: {}, texto: "", cabecalhos: h });
    expect(e.esperarMs).toBe(12_000);
  });

  it("`Retry-After` absurdo é limitado", () => {
    const h = new Headers({ "retry-after": "999999" });
    const e = classificarRespostaDaGraph({ status: 429, corpo: {}, texto: "", cabecalhos: h });
    expect(e.esperarMs).toBeLessThanOrEqual(15 * 60_000);
  });

  it("5xx é transitória", () => {
    expect(classificarRespostaDaGraph({ status: 503, corpo: {}, texto: "" }).classe).toBe(
      "transitoria",
    );
  });

  it("401 exige reconexão; 403 não", () => {
    expect(classificarRespostaDaGraph({ status: 401, corpo: {}, texto: "" }).exigeReconexao).toBe(
      true,
    );
    expect(classificarRespostaDaGraph({ status: 403, corpo: {}, texto: "" }).exigeReconexao).toBe(
      false,
    );
  });

  it("200 com `error` dentro NÃO é sucesso", () => {
    /*
     * A GRAPH FAZ ISSO em chamadas em lote e em alguns endpoints de leitura.
     * Um cliente que só olha o status trata como sucesso e devolve um objeto
     * sem os campos esperados — e o defeito aparece três camadas acima, como
     * "o lead veio sem telefone".
     */
    const e = classificarRespostaDaGraph({
      status: 200,
      corpo: { error: { code: 190, message: "expired" } },
      texto: "",
    });
    expect(e.classe).toBe("permanente");
  });

  it("2xx sem o campo esperado é permanente", () => {
    const e = classificarRespostaDaGraph({ status: 200, corpo: { data: [] }, texto: "" });
    expect(e.classe).toBe("permanente");
    expect(e.esperarMs).toBeNull();
  });
});

describe("a falha de rede é onde vive a entrega INCERTA — §35", () => {
  it("timeout depois de o pedido sair é INCERTA", () => {
    /*
     * ==========================================================================
     *  O ESTADO QUE MANDA MENSAGEM DUPLICADA.
     *
     *  O POST saiu e a resposta não voltou: a Meta PODE ter aceitado. Repetir
     *  manda a segunda mensagem — e não há como desfazer.
     * ==========================================================================
     */
    const erro = Object.assign(new Error("tempo esgotado"), { name: "TimeoutError" });
    const e = classificarFalhaDeRede(erro);
    expect(e.classe).toBe("incerta");
    // INCERTA NÃO TEM ESPERA: ela não volta para a fila sozinha.
    expect(e.esperarMs).toBeNull();
    expect(e.acao).toContain("não reenvie automaticamente");
  });

  it("conexão recusada é TRANSITÓRIA — o pedido não saiu", () => {
    /*
     * O CÓDIGO VEM EM `cause`, e não na raiz do erro: é onde o undici — o
     * cliente HTTP do Node — o coloca. `entregaFicouIncerta` lê de lá, e este
     * teste monta o erro na FORMA REAL de propósito.
     *
     * Montá-lo com `code` na raiz faria o teste passar por acidente (o default
     * conservador é "incerta") e não provar nada sobre a lista de códigos.
     */
    const erro = Object.assign(new Error("fetch failed"), {
      cause: { code: "ECONNREFUSED" },
    });
    const e = classificarFalhaDeRede(erro);
    expect(e.classe).toBe("transitoria");
    expect(e.esperarMs).not.toBeNull();
  });

  it("um código de rede DESCONHECIDO cai em INCERTA", () => {
    /*
     * O DEFAULT CONSERVADOR, e ele é do `servidor/http.ts`: errar para o lado
     * de "pode ter chegado" custa uma mensagem não reenviada; errar para o
     * outro custa o paciente recebendo a mesma mensagem duas vezes.
     */
    const erro = Object.assign(new Error("fetch failed"), {
      cause: { code: "UND_ERR_SOCKET" },
    });
    expect(classificarFalhaDeRede(erro).classe).toBe("incerta");
  });
});

describe("todo erro diz o que fazer", () => {
  it("nenhuma ação é vaga", () => {
    const todos = [
      daMeta(1),
      daMeta(4),
      daMeta(10),
      daMeta(100),
      daMeta(190),
      daMeta(200),
      daMeta(368),
      daMeta(551),
      daMeta(10900),
      classificarRespostaDaGraph({ status: 429, corpo: {}, texto: "" }),
      classificarRespostaDaGraph({ status: 503, corpo: {}, texto: "" }),
      classificarFalhaDeRede(new Error("x")),
    ];

    for (const e of todos) {
      expect(e.acao.length).toBeGreaterThan(20);
      expect(e.codigo.length).toBeGreaterThan(0);
    }
  });
});
