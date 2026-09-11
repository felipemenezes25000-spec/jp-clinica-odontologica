/**
 * Testes do corte e da reordenação.
 *
 * ESTES DOIS MECANISMOS DECIDEM A QUALIDADE DA RESPOSTA e não precisam de modelo
 * nem de banco para serem verificados — que é a razão de eles morarem no
 * domínio. Um pedaço cortado no meio da frase e uma reordenação que ignora a
 * palavra exata da pergunta produzem o mesmo sintoma em produção ("o agente não
 * acha o que está escrito"), e nenhum dos dois aparece num teste de integração.
 */
import { describe, expect, it } from "vitest";

import {
  MAX_CARACTERES_CHUNK,
  MAX_TRECHOS_POR_FONTE,
  partirEmChunks,
  reordenarTrechos,
  textoDosTrechos,
  type TrechoEncontrado,
} from "./conhecimento";

const FONTE = "f1";

describe("partir em pedaços", () => {
  it("um parágrafo curto é um pedaço", () => {
    const chunks = partirEmChunks("Aceitamos cartão em até 12 vezes sem juros.", FONTE);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.conteudo).toBe("Aceitamos cartão em até 12 vezes sem juros.");
  });

  it("parágrafos separados viram pedaços separados", () => {
    const texto = [
      "A clínica aceita cartão de crédito em até doze vezes sem juros, e também PIX com cinco por cento de desconto no pagamento à vista.",
      "O estacionamento é conveniado com o prédio ao lado e custa dez reais por hora, com duas horas grátis para quem tem consulta marcada.",
    ].join("\n\n");

    const chunks = partirEmChunks(texto, FONTE);
    expect(chunks).toHaveLength(2);
    expect(chunks[1]?.conteudo).toContain("estacionamento");
  });

  it("texto vazio não gera pedaço", () => {
    expect(partirEmChunks("   \n\n  ", FONTE)).toHaveLength(0);
  });

  it("nenhum pedaço passa do teto, com folga só para a sobreposição", () => {
    // Um parágrafo longo de frases inteiras: é o caso real de FAQ colada.
    const frase = "A clínica atende de segunda a sexta em horário comercial. ";
    const chunks = partirEmChunks(frase.repeat(40), FONTE);

    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.conteudo.length).toBeLessThanOrEqual(MAX_CARACTERES_CHUNK + 140);
    }
  });

  it("corta em fim de frase, e não no meio de palavra", () => {
    const frase = "Atendemos convênio Amil, Bradesco Saúde e SulAmérica sem carência. ";
    const chunks = partirEmChunks(frase.repeat(20), FONTE);

    // Cada pedaço, tirando a sobreposição do começo, termina em pontuação.
    for (const c of chunks) {
      expect(c.conteudo.trimEnd().endsWith(".")).toBe(true);
    }
  });

  it("o pedaço seguinte carrega o fim do anterior", () => {
    // É o que impede "…aceitamos cartão. / Em até 12 vezes." de virar duas
    // metades em que nenhuma responde "posso parcelar?".
    const frase = "Cada resposta desta lista tem tamanho parecido com a anterior. ";
    const chunks = partirEmChunks(frase.repeat(30), FONTE);
    expect(chunks.length).toBeGreaterThan(1);

    const primeiro = chunks[0]?.conteudo ?? "";
    const segundo = chunks[1]?.conteudo ?? "";
    const cauda = primeiro.slice(-40);
    // Alguma parte do fim do primeiro reaparece no começo do segundo.
    expect(segundo.slice(0, 160)).toContain(cauda.slice(cauda.indexOf(" ") + 1, cauda.length - 1));
  });

  it("parágrafo gigante sem pontuação nenhuma ainda é partido", () => {
    // O PDF colado sem ponto existe, e engolir o documento inteiro num pedaço
    // produziria um vetor que não se parece com nenhuma pergunta.
    const chunks = partirEmChunks("palavra ".repeat(400), FONTE);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("título solto é grudado no parágrafo seguinte", () => {
    const texto = [
      "Formas de pagamento",
      "Aceitamos dinheiro, PIX e cartão de crédito em até doze vezes sem juros para tratamentos acima de mil reais, com aprovação na hora.",
    ].join("\n\n");

    const chunks = partirEmChunks(texto, FONTE);
    // Um pedaço só com "Formas de pagamento" seria forte para a pergunta certa
    // e não responderia nada.
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.conteudo).toContain("Formas de pagamento");
    expect(chunks[0]?.conteudo).toContain("doze vezes");
  });
});

describe("a chave de dedupe do pedaço", () => {
  it("o mesmo texto reingerido produz as mesmas chaves", () => {
    const texto = "Primeiro parágrafo bem escrito.\n\nSegundo parágrafo, igualmente.";
    const a = partirEmChunks(texto, FONTE).map((c) => c.chaveDedupe);
    const b = partirEmChunks(texto, FONTE).map((c) => c.chaveDedupe);
    expect(a).toEqual(b);
  });

  it("parágrafo repetido em posições diferentes mantém os dois", () => {
    const p = "Este parágrafo aparece duas vezes no documento, de propósito, para o teste.";
    const chunks = partirEmChunks(`${p}\n\nOutra coisa no meio do caminho aqui.\n\n${p}`, FONTE);
    const chaves = new Set(chunks.map((c) => c.chaveDedupe));
    expect(chaves.size).toBe(chunks.length);
  });

  it("fontes diferentes nunca colidem", () => {
    const texto = "Mesmo conteúdo, fontes diferentes.";
    expect(partirEmChunks(texto, "a")[0]?.chaveDedupe).not.toBe(
      partirEmChunks(texto, "b")[0]?.chaveDedupe,
    );
  });
});

describe("reordenar", () => {
  const t = (
    id: string,
    conteudo: string,
    similaridade: number,
    sourceId = id,
  ): TrechoEncontrado => ({
    id,
    sourceId,
    titulo: `fonte ${sourceId}`,
    tipo: "faq",
    conteudo,
    similaridade,
  });

  it("resgata o trecho com a palavra exata de trás dos genéricos", () => {
    /*
     * O CASO QUE A REORDENAÇÃO EXISTE PARA CORRIGIR.
     *
     * Os dois primeiros falam de pagamento em geral e ganham no vetor. O
     * terceiro tem a palavra que a pessoa usou. Sem reordenação, a resposta
     * seria "falamos sobre formas de pagamento" em vez de responder.
     */
    const fora = reordenarTrechos(
      "posso pagar parcelado?",
      [
        t("a", "A clínica tem várias formas de pagamento disponíveis para os tratamentos.", 0.82),
        t("b", "O pagamento pode ser combinado na recepção antes do início do tratamento.", 0.8),
        t("c", "Tratamento acima de mil reais pode ser parcelado em até doze vezes.", 0.7),
      ],
      { maximo: 1 },
    );

    expect(fora[0]?.id).toBe("c");
  });

  it("não passa do teto por fonte", () => {
    const fora = reordenarTrechos(
      "convênio",
      [
        t("a1", "Atendemos convênio Amil sem carência nenhuma.", 0.9, "mesma"),
        t("a2", "O convênio Bradesco Saúde também é atendido aqui.", 0.89, "mesma"),
        t("a3", "SulAmérica é outro convênio aceito pela clínica.", 0.88, "mesma"),
        t("b1", "Convênio odontológico empresarial tem regra própria.", 0.5, "outra"),
      ],
      { maximo: 4 },
    );

    expect(fora.filter((x) => x.sourceId === "mesma")).toHaveLength(MAX_TRECHOS_POR_FONTE);
    // E a vaga que sobrou foi para a outra fonte: é o ponto do teto.
    expect(fora.map((x) => x.sourceId)).toContain("outra");
  });

  it("descarta o irrelevante em vez de completar a lista", () => {
    // Encher quatro vagas com o que sobrou ensina o modelo a responder com o
    // que não tem a ver.
    const fora = reordenarTrechos(
      "vocês fazem clareamento a laser?",
      [
        t("a", "O clareamento a laser é feito em duas sessões de quarenta minutos.", 0.85),
        t("b", "A recepção fica no térreo, ao lado da farmácia.", 0.05),
        t("c", "Estacionamento conveniado no prédio ao lado.", 0.03),
      ],
      { maximo: 4 },
    );

    expect(fora).toHaveLength(1);
    expect(fora[0]?.id).toBe("a");
  });

  it("saudação não desloca a pergunta", () => {
    // "bom dia" não pode fazer um trecho sobre horário de funcionamento ganhar
    // do trecho que responde o que foi perguntado.
    const fora = reordenarTrechos(
      "bom dia, vocês aceitam PIX?",
      [
        t("a", "Bom dia a todos: abrimos às oito da manhã todos os dias úteis.", 0.6),
        t("b", "Aceitamos PIX com cinco por cento de desconto à vista.", 0.6),
      ],
      { maximo: 1 },
    );

    expect(fora[0]?.id).toBe("b");
  });

  it("a flexão da palavra conta: “aceitam” acha “aceitamos”", () => {
    // Comparando token exato, a palavra mais importante da pergunta não contaria
    // — e a cobertura lexical, que existe para resgatar o trecho da palavra
    // exata, não resgataria nada.
    const fora = reordenarTrechos(
      "vocês aceitam convênio?",
      [
        t("a", "Qualquer dúvida, a recepção esclarece no balcão do térreo.", 0.7),
        t("b", "Aceitamos os principais convênios odontológicos do mercado.", 0.65),
      ],
      { maximo: 1 },
    );

    expect(fora[0]?.id).toBe("b");
    // Duas palavras da pergunta: "aceitam"→"aceitamos" e "convenio"→"convenios".
    expect(fora[0]?.termosEncontrados).toBe(2);
  });

  it("radical curto NÃO casa: “paga” não liga pagamento a pagode", () => {
    const fora = reordenarTrechos("pagar", [t("a", "Temos pagode ao vivo na sexta.", 0.3)], {
      maximo: 1,
      notaMinima: 0,
    });
    expect(fora[0]?.termosEncontrados).toBe(0);
  });

  it("lista vazia devolve lista vazia, e não estoura", () => {
    expect(reordenarTrechos("qualquer coisa", [])).toEqual([]);
  });
});

describe("o texto que vai ao modelo", () => {
  it("carrega a ordem de não extrapolar", () => {
    const texto = textoDosTrechos(
      reordenarTrechos("pix", [
        {
          id: "a",
          sourceId: "s",
          titulo: "Formas de pagamento",
          tipo: "faq",
          conteudo: "Aceitamos PIX com desconto.",
          similaridade: 0.9,
        },
      ]),
    );

    expect(texto).toContain("Formas de pagamento");
    // Sem esta linha, o modelo completa a lacuna com o que "sabe" sobre
    // clínicas em geral.
    expect(texto).toContain("USANDO SÓ o que está acima");
    expect(texto).toContain("confirmar com a equipe");
  });

  it("sem trecho, não inventa cabeçalho", () => {
    expect(textoDosTrechos([])).toBe("");
  });
});
