/**
 * Testes de ingestão e busca.
 *
 * AS TRÊS COISAS QUE ESTE ARQUIVO EXISTE PARA IMPEDIR, em ordem de gravidade:
 *
 *   CONTEÚDO DE UMA CLÍNICA RESPONDENDO PELA OUTRA. É o defeito clássico de RAG
 *   multi-tenant, e ele acontece quando alguém pega os vizinhos mais próximos e
 *   filtra depois. O filtro mora dentro de `crc_buscar_conhecimento`, e o banco
 *   em memória reproduz essa trava para a regressão ser uma falha de teste e não
 *   uma descoberta em produção.
 *
 *   RASCUNHO RESPONDENDO PACIENTE. Texto que ninguém revisou não vira resposta.
 *
 *   INGESTÃO PELA METADE. O provedor cair no meio não pode deixar a clínica com
 *   metade do documento indexado e a busca respondendo errado — sem erro nenhum
 *   na tela.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

import { conteudo, definirRelogio, limparBanco } from "../testes/banco-memoria";
import {
  DIMENSOES_EMBEDDING,
  vetorDeHash,
  type PortaEmbeddings,
  type RespostaEmbeddings,
} from "../integracoes/ia/embeddings";
import {
  buscarConhecimento,
  ingerirFonte,
  listarFontes,
  publicarFonte,
  salvarFonte,
} from "./conhecimento";

const ORG = "11111111-1111-4111-8111-111111111111";
const OUTRA_ORG = "22222222-2222-4222-8222-222222222222";
const AGORA = new Date("2026-09-11T14:00:00.000Z");

/** A porta de sandbox, que é determinística por hash de palavra. */
function portaSandbox(): PortaEmbeddings & { chamadas: number } {
  const porta = {
    nome: "sandbox",
    modelo: "sandbox-hash",
    dimensoes: DIMENSOES_EMBEDDING,
    chamadas: 0,
    gerar(textos: readonly string[]): Promise<RespostaEmbeddings> {
      porta.chamadas += 1;
      return Promise.resolve({
        ok: true,
        vetores: textos.map((t) => vetorDeHash(t, DIMENSOES_EMBEDDING)),
        uso: { modelo: "sandbox-hash", inputTokens: 0, custoEstimado: 0, duracaoMs: 0 },
      });
    },
  };
  return porta;
}

const PAGAMENTO = [
  "Aceitamos dinheiro, PIX e cartão de crédito. No PIX à vista há cinco por cento de desconto sobre o valor total do tratamento.",
  "Tratamento acima de mil reais pode ser parcelado em até doze vezes sem juros no cartão, com aprovação na hora pela recepção.",
].join("\n\n");

const ESTACIONAMENTO =
  "O estacionamento é conveniado com o prédio ao lado. Duas horas são gratuitas para quem tem consulta marcada, e a validação é feita na recepção.";

async function semearFontePublicada(
  organizationId: string,
  titulo: string,
  corpo: string,
  porta: PortaEmbeddings,
): Promise<string> {
  const { id } = await salvarFonte({ organizationId, titulo, tipo: "faq", corpo });
  await ingerirFonte({ organizationId, sourceId: id, porta });
  await publicarFonte(organizationId, id);
  return id;
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
});

/* -------------------------------------------------------------------------- */

describe("a fonte", () => {
  it("salvar duas vezes o mesmo título ATUALIZA, não cria uma segunda", async () => {
    // Duas fontes homônimas responderiam juntas, com textos diferentes.
    const a = await salvarFonte({
      organizationId: ORG,
      titulo: "Pagamento",
      tipo: "faq",
      corpo: "Aceitamos PIX.",
    });
    const b = await salvarFonte({
      organizationId: ORG,
      titulo: "Pagamento",
      tipo: "faq",
      corpo: "Aceitamos PIX e cartão.",
    });

    expect(b.id).toBe(a.id);
    expect(conteudo("crc_knowledge_sources")).toHaveLength(1);
  });

  it("salvar o texto IGUAL não mexe na versão", async () => {
    await salvarFonte({ organizationId: ORG, titulo: "P", tipo: "faq", corpo: "Aceitamos PIX." });
    const r = await salvarFonte({
      organizationId: ORG,
      titulo: "P",
      tipo: "faq",
      corpo: "Aceitamos PIX.",
    });

    expect(r.mudou).toBe(false);
    expect(Number(conteudo("crc_knowledge_sources")[0]?.["versao"])).toBe(1);
  });

  it("editar o texto de uma fonte PUBLICADA a devolve para rascunho", async () => {
    const porta = portaSandbox();
    const id = await semearFontePublicada(ORG, "Pagamento", PAGAMENTO, porta);
    expect(conteudo("crc_knowledge_sources")[0]?.["status"]).toBe("PUBLICADA");

    await salvarFonte({
      organizationId: ORG,
      titulo: "Pagamento",
      tipo: "faq",
      corpo: `${PAGAMENTO}\n\nParágrafo novo que ninguém revisou ainda, com bastante texto para virar pedaço.`,
    });

    // Deixá-la publicada faria a versão nova responder paciente antes de alguém
    // reler. Publicar de novo é um segundo clique, de propósito.
    const fonte = conteudo("crc_knowledge_sources").find((f) => f["id"] === id);
    expect(fonte?.["status"]).toBe("RASCUNHO");
    expect(Number(fonte?.["versao"])).toBe(2);
  });

  it("não publica fonte sem pedaço indexado", async () => {
    const { id } = await salvarFonte({
      organizationId: ORG,
      titulo: "Pagamento",
      tipo: "faq",
      corpo: PAGAMENTO,
    });

    const r = await publicarFonte(ORG, id);

    // Publicada e não indexada é invisível para a busca, e produz o pior
    // diagnóstico possível: "está publicado e o agente não usa".
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("Indexar");
  });
});

/* -------------------------------------------------------------------------- */

describe("ingestão", () => {
  it("indexa o texto em pedaços", async () => {
    const porta = portaSandbox();
    const { id } = await salvarFonte({
      organizationId: ORG,
      titulo: "Pagamento",
      tipo: "faq",
      corpo: PAGAMENTO,
    });

    const r = await ingerirFonte({ organizationId: ORG, sourceId: id, porta });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pedacos).toBeGreaterThan(0);
    expect(conteudo("crc_knowledge_chunks")).toHaveLength(r.pedacos);
    // Todo pedaço saiu com vetor: um pedaço sem vetor é conteúdo invisível.
    for (const c of conteudo("crc_knowledge_chunks")) {
      expect(Array.isArray(c["embedding"])).toBe(true);
    }
  });

  it("reindexar não duplica pedaço", async () => {
    const porta = portaSandbox();
    const { id } = await salvarFonte({
      organizationId: ORG,
      titulo: "Pagamento",
      tipo: "faq",
      corpo: PAGAMENTO,
    });

    const primeira = await ingerirFonte({ organizationId: ORG, sourceId: id, porta });
    await ingerirFonte({ organizationId: ORG, sourceId: id, porta });

    expect(primeira.ok).toBe(true);
    if (!primeira.ok) return;
    expect(conteudo("crc_knowledge_chunks")).toHaveLength(primeira.pedacos);
  });

  it("provedor fora do ar NÃO apaga o que já respondia", async () => {
    /*
     * O TESTE MAIS IMPORTANTE DESTE ARQUIVO.
     *
     * O caminho ingênuo — apagar os pedaços e ir gravando os novos — falha
     * exatamente aqui, e falha calado: a clínica fica com metade do documento
     * indexado e a busca continua respondendo, só que errado.
     */
    const porta = portaSandbox();
    const { id } = await salvarFonte({
      organizationId: ORG,
      titulo: "Pagamento",
      tipo: "faq",
      corpo: PAGAMENTO,
    });
    const antes = await ingerirFonte({ organizationId: ORG, sourceId: id, porta });
    expect(antes.ok).toBe(true);
    const quantos = conteudo("crc_knowledge_chunks").length;

    const quebrada: PortaEmbeddings = {
      nome: "quebrada",
      modelo: "x",
      dimensoes: DIMENSOES_EMBEDDING,
      gerar: () =>
        Promise.resolve({ ok: false, motivo: "indisponivel", detalhe: "504 gateway timeout" }),
    };

    const r = await ingerirFonte({ organizationId: ORG, sourceId: id, porta: quebrada });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("504");
    // Nada foi apagado. O conhecimento que respondia continua respondendo.
    expect(conteudo("crc_knowledge_chunks")).toHaveLength(quantos);
  });

  it("modelo de outra dimensão é recusado ANTES de tocar no banco", async () => {
    const porta = portaSandbox();
    const { id } = await salvarFonte({
      organizationId: ORG,
      titulo: "Pagamento",
      tipo: "faq",
      corpo: PAGAMENTO,
    });
    await ingerirFonte({ organizationId: ORG, sourceId: id, porta });
    const quantos = conteudo("crc_knowledge_chunks").length;

    const outraDimensao: PortaEmbeddings = {
      nome: "grande",
      modelo: "text-embedding-3-large",
      dimensoes: 3072,
      gerar: () => Promise.reject(new Error("não deveria ser chamada")),
    };

    const r = await ingerirFonte({ organizationId: ORG, sourceId: id, porta: outraDimensao });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("dimensao_incompativel");
    // Descobrir isso por erro do Postgres no meio da troca deixaria metade
    // gravada.
    expect(conteudo("crc_knowledge_chunks")).toHaveLength(quantos);
  });

  it("texto vazio é recusado com motivo, e não com sucesso de zero pedaços", async () => {
    const porta = portaSandbox();
    const { id } = await salvarFonte({
      organizationId: ORG,
      titulo: "Vazia",
      tipo: "faq",
      corpo: "",
    });
    const r = await ingerirFonte({ organizationId: ORG, sourceId: id, porta });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("texto_vazio");
  });

  it("a lista mostra quantos pedaços cada fonte tem", async () => {
    const porta = portaSandbox();
    await semearFontePublicada(ORG, "Pagamento", PAGAMENTO, porta);
    await salvarFonte({
      organizationId: ORG,
      titulo: "Estacionamento",
      tipo: "faq",
      corpo: ESTACIONAMENTO,
    });

    const fontes = await listarFontes(ORG);
    expect(fontes).toHaveLength(2);
    expect(fontes.find((f) => f.titulo === "Pagamento")?.pedacos).toBeGreaterThan(0);
    // A que não foi indexada mostra zero — é o que explica "publiquei e o agente
    // não usa".
    expect(fontes.find((f) => f.titulo === "Estacionamento")?.pedacos).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("busca", () => {
  it("acha o trecho que fala do assunto", async () => {
    const porta = portaSandbox();
    await semearFontePublicada(ORG, "Pagamento", PAGAMENTO, porta);
    await semearFontePublicada(ORG, "Estacionamento", ESTACIONAMENTO, porta);

    const r = await buscarConhecimento({
      organizationId: ORG,
      consulta: "posso parcelar o tratamento no cartão?",
      porta,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.trechos.length).toBeGreaterThan(0);
    expect(r.trechos[0]?.conteudo).toContain("parcelado");
  });

  it("conteúdo de OUTRA clínica nunca aparece", async () => {
    const porta = portaSandbox();
    // A outra organização tem o texto publicado e indexado — tudo em ordem lá.
    await semearFontePublicada(OUTRA_ORG, "Pagamento", PAGAMENTO, porta);

    const r = await buscarConhecimento({
      organizationId: ORG,
      consulta: "posso parcelar o tratamento no cartão?",
      porta,
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.trechos).toHaveLength(0);
  });

  it("rascunho não responde paciente", async () => {
    const porta = portaSandbox();
    const { id } = await salvarFonte({
      organizationId: ORG,
      titulo: "Pagamento",
      tipo: "faq",
      corpo: PAGAMENTO,
    });
    // Indexado, mas NÃO publicado: existe pedaço com vetor no banco.
    await ingerirFonte({ organizationId: ORG, sourceId: id, porta });

    const r = await buscarConhecimento({
      organizationId: ORG,
      consulta: "posso parcelar o tratamento no cartão?",
      porta,
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.trechos).toHaveLength(0);
  });

  it("arquivar tira da busca sem apagar o texto", async () => {
    const porta = portaSandbox();
    const id = await semearFontePublicada(ORG, "Pagamento", PAGAMENTO, porta);

    const { arquivarFonte } = await import("./conhecimento");
    await arquivarFonte(ORG, id);

    const r = await buscarConhecimento({
      organizationId: ORG,
      consulta: "posso parcelar o tratamento no cartão?",
      porta,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.trechos).toHaveLength(0);
    // O texto continua lá para ser republicado depois.
    expect(conteudo("crc_knowledge_sources")).toHaveLength(1);
  });

  it("pergunta curta é recusada antes de gastar embedding", async () => {
    const porta = portaSandbox();
    const r = await buscarConhecimento({ organizationId: ORG, consulta: "oi", porta });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("consulta_curta");
    expect(porta.chamadas).toBe(0);
  });

  it("busca sem nada indexado devolve lista vazia, e não erro", async () => {
    // "Não há nada escrito sobre isso" é resposta, e o agente sabe o que fazer
    // com ela. Erro faria o modelo tentar de novo com outras palavras.
    const porta = portaSandbox();
    const r = await buscarConhecimento({
      organizationId: ORG,
      consulta: "vocês fazem clareamento?",
      porta,
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.trechos).toEqual([]);
  });
});

/* ========================================================================== */
/* A troca atômica — Fase D                                                   */
/* ========================================================================== */

describe("reindexar não deixa a clínica sem conhecimento", () => {
  /**
   * O DEFEITO QUE ISTO FECHA não aparece em nenhuma tela: aparece na boca do
   * paciente.
   *
   * `ingerirFonte` apagava os pedaços antigos e depois inseria os novos, em duas
   * chamadas ao PostgREST — duas transações. Entre elas, a fonte tem ZERO
   * pedaços, e o agente não para de atender durante uma reindexação.
   *
   * O paciente pergunta "vocês aceitam meu convênio?" e ouve "não tenho essa
   * informação" de uma clínica que TEM a informação cadastrada. Dura segundos,
   * se resolve sozinho, e é irreprodutível — o pior formato possível de defeito.
   */
  it("a contagem de pedaços nunca passa por zero", async () => {
    const porta = portaSandbox();
    const id = await semearFontePublicada(ORG, "Pagamento", PAGAMENTO, porta);

    const antes = conteudo("crc_knowledge_chunks").length;
    expect(antes).toBeGreaterThan(0);

    await ingerirFonte({ organizationId: ORG, sourceId: id, porta });

    // Depois da troca, a fonte tem pedaços — e o teste do buraco é o de baixo.
    expect(conteudo("crc_knowledge_chunks").length).toBeGreaterThan(0);
  });

  it("a troca é UMA chamada ao banco, e não duas", async () => {
    // É a asserção estrutural que impede a regressão. Se alguém voltar a
    // escrever `apagar` seguido de `inserir`, o buraco volta — e nenhum teste de
    // conteúdo acusaria, porque o resultado FINAL é o mesmo.
    const porta = portaSandbox();
    const id = await semearFontePublicada(ORG, "Pagamento", PAGAMENTO, porta);

    const fonte = await import("./conhecimento");
    const codigo = fonte.ingerirFonte.toString();

    expect(codigo).toContain("crc_trocar_conhecimento");
    expect(codigo).not.toContain('apagar("crc_knowledge_chunks"');
    void id;
  });

  it("falha do provedor de vetores não apaga o que já respondia", async () => {
    const boa = portaSandbox();
    const id = await semearFontePublicada(ORG, "Pagamento", PAGAMENTO, boa);
    const antes = conteudo("crc_knowledge_chunks").length;

    const quebrada: PortaEmbeddings = {
      nome: "sandbox",
      modelo: "sandbox-hash",
      dimensoes: DIMENSOES_EMBEDDING,
      gerar: () =>
        Promise.resolve({ ok: false, motivo: "indisponivel", detalhe: "504", uso: null }),
    };

    const r = await ingerirFonte({ organizationId: ORG, sourceId: id, porta: quebrada });

    expect(r.ok).toBe(false);
    // O conhecimento antigo continua respondendo. É a ordem das quatro etapas:
    // partir, embutir TUDO, e só então trocar.
    expect(conteudo("crc_knowledge_chunks")).toHaveLength(antes);
  });

  it("a troca substitui, e não acumula", async () => {
    const porta = portaSandbox();
    const id = await semearFontePublicada(ORG, "Pagamento", PAGAMENTO, porta);
    const antes = conteudo("crc_knowledge_chunks").length;

    await ingerirFonte({ organizationId: ORG, sourceId: id, porta });

    expect(conteudo("crc_knowledge_chunks")).toHaveLength(antes);
  });

  it("reindexar uma fonte não toca no conhecimento de outra clínica", async () => {
    const porta = portaSandbox();
    const meu = await semearFontePublicada(ORG, "Pagamento", PAGAMENTO, porta);
    await semearFontePublicada(OUTRA_ORG, "Pagamento", PAGAMENTO, porta);

    const deles = conteudo("crc_knowledge_chunks").filter(
      (c) => c["organization_id"] === OUTRA_ORG,
    ).length;

    await ingerirFonte({ organizationId: ORG, sourceId: meu, porta });

    // O `delete` da função SQL filtra por tenant além do `source_id`. Sem isso,
    // um id vazado apagaria o conhecimento da clínica vizinha.
    expect(
      conteudo("crc_knowledge_chunks").filter((c) => c["organization_id"] === OUTRA_ORG),
    ).toHaveLength(deles);
  });
});
