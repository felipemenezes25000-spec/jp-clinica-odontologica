/**
 * O Playground — Fase G, item 30.
 *
 * O QUE ESTES TESTES PRECISAM PROVAR é uma coisa só, e ela é negativa: **nada
 * sai e nada é gravado.**
 *
 * Um playground que testa o agente é útil. Um playground que, ao testar, marca
 * consulta na agenda real, cria tarefa na fila de alguém e grava opt-out de um
 * paciente que não pediu nada é um sabotador com interface amigável — e o
 * estrago aparece dias depois, sem ninguém ligar as duas coisas.
 *
 * Por isso quase todo teste aqui é uma asserção de AUSÊNCIA.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return { ...real, registrar: () => undefined, auditar: () => Promise.resolve() };
});

import type { PortaIa, RespostaIa } from "../integracoes/ia/porta";
import { _limparCacheDeConfiguracao } from "../servidor/configuracao";
import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import { rodarPlayground } from "./playground";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLINICA = "22222222-2222-4222-8222-222222222222";
const PACIENTE = "33333333-3333-4333-8333-333333333333";
const CONVERSA = "44444444-4444-4444-8444-444444444444";
const AGORA = new Date("2026-09-11T14:00:00.000Z");

/** A porta de IA que o gateway devolve, controlada pelo teste. */
let resposta: RespostaIa = {
  ok: true,
  dados: { acao: "responder", texto: "Oi! Claro, consigo sim.", precisaHumano: false },
  uso: { modelo: "teste", inputTokens: 10, outputTokens: 10, custoEstimado: 0, duracaoMs: 1 },
};

const portaFalsa: PortaIa = {
  nome: "teste",
  modelo: "teste-1",
  gerarEstruturado: () => Promise.resolve(resposta),
};

vi.mock("../integracoes/ia/gateway", () => ({
  portaParaFinalidade: () => Promise.resolve({ configurado: true, porta: portaFalsa }),
  portaDeEmbeddingsDaOrganizacao: () => Promise.resolve({ configurado: false }),
}));

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  _limparCacheDeConfiguracao();
  resposta = {
    ok: true,
    dados: { acao: "responder", texto: "Oi! Claro, consigo sim.", precisaHumano: false },
    uso: { modelo: "teste", inputTokens: 10, outputTokens: 10, custoEstimado: 0, duracaoMs: 1 },
  };

  semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
  semear("crc_clinics", [{ id: CLINICA, organization_id: ORG, nome: "JP", slug: "matriz" }]);
  semear("crc_patients", [
    {
      id: PACIENTE,
      organization_id: ORG,
      clinic_id: CLINICA,
      external_id: "pac-1",
      nome: "Maria Souza",
      telefone: "5511999998888",
    },
  ]);
  semear("crc_conversations", [
    {
      id: CONVERSA,
      organization_id: ORG,
      clinic_id: CLINICA,
      patient_id: PACIENTE,
      canal: "whatsapp",
      contato_externo: "5511999998888",
      status: "ABERTA",
      dono: "ia",
    },
  ]);
  semear("crc_messages", [
    {
      organization_id: ORG,
      conversation_id: CONVERSA,
      direcao: "ENTRADA",
      remetente: "paciente",
      conteudo: "Oi",
      chave_dedupe: "entrada:1",
    },
  ]);
});

const rodar = (mensagem = "Consigo remarcar para quinta?") =>
  rodarPlayground({ organizationId: ORG, conversationId: CONVERSA, mensagem, agora: AGORA });

describe("o playground roda o turno de verdade", () => {
  it("devolve a resposta que o agente daria", async () => {
    const r = await rodar();

    // O desfecho é `candidato`: o turno rodou inteiro e parou antes do envio,
    // que é exatamente o comportamento da Fatia 1 com a flag desligada.
    expect(r.desfecho).toBe("candidato");
    expect(r.resposta).toContain("consigo");
  });

  it("registra os passos, para dar para ver POR QUE respondeu aquilo", async () => {
    const r = await rodar();

    // Sem os passos, o playground mostraria só a resposta — e ajustar um prompt
    // olhando só a saída é tentativa e erro caro.
    expect(r.passos.some((p) => p.tipo === "modelo")).toBe(true);
  });
});

describe("NADA SAI E NADA É GRAVADO", () => {
  it("nenhuma mensagem é criada", async () => {
    const antes = conteudo("crc_messages").length;
    await rodar();

    // A asserção mais importante do arquivo. Uma mensagem gravada aqui
    // apareceria na Inbox como se o paciente tivesse recebido.
    expect(conteudo("crc_messages")).toHaveLength(antes);
  });

  it("a run NÃO é gravada — o teste não polui a métrica do agente", async () => {
    await rodar();

    /*
     * Se a run fosse gravada, cada ajuste de prompt entraria na contagem de
     * turnos e na taxa de acerto do agente. Alguém testando vinte variações de
     * texto derrubaria a métrica de qualidade sem ter falado com paciente
     * nenhum — e a métrica é justamente o que decide se a flag pode ser ligada.
     */
    expect(conteudo("crc_ai_runs")).toHaveLength(0);
  });

  it("uma ferramenta de ESCRITA não escreve: ela é descrita", async () => {
    /*
     * A CLÍNICA PRECISA TER A ESCRITA LIBERADA para este teste morder.
     *
     * Sem a flag, a política barra a ferramenta ANTES do dublê, e o teste
     * passaria sem exercitar a trava que ele existe para provar — a pior
     * espécie de verde. O Playground usa as flags REAIS de propósito: mostrar
     * um agente com mais permissões do que ele tem faria a pessoa ajustar o
     * texto contra um comportamento que não existe.
     */
    semear("crc_feature_flags", [
      { organization_id: ORG, chave: "ai_agente_escrita", ligada: true },
    ]);
    _limparCacheDeConfiguracao();

    // O modelo decide criar uma tarefa.
    let primeira = true;
    const portaComFerramenta: PortaIa = {
      nome: "teste",
      modelo: "teste-1",
      gerarEstruturado: () => {
        if (primeira) {
          primeira = false;
          return Promise.resolve({
            ok: true,
            dados: {
              // `usar_ferramenta` é o valor do enum. Escrever "ferramenta" aqui
              // fazia o laço tratar a decisão como desconhecida e seguir em
              // frente — e o teste passava sem exercitar nada.
              acao: "usar_ferramenta",
              ferramenta: "conversa.criar_tarefa",
              pergunta: "Ligar para a Maria",
              precisaHumano: false,
            },
            uso: {
              modelo: "teste",
              inputTokens: 1,
              outputTokens: 1,
              custoEstimado: 0,
              duracaoMs: 1,
            },
          } as RespostaIa);
        }
        return Promise.resolve(resposta);
      },
    };

    const gateway = await import("../integracoes/ia/gateway");
    vi.spyOn(gateway, "portaParaFinalidade").mockResolvedValue({
      configurado: true,
      porta: portaComFerramenta,
    } as never);

    const r = await rodar();

    // NENHUMA TAREFA NA FILA DE NINGUÉM. É a trava que precisou ser construída:
    // `podeEnviar: false` protege só o envio, não a escrita de ferramenta.
    expect(conteudo("crc_tasks")).toHaveLength(0);
    // Mas o que TERIA acontecido aparece, que é a informação útil.
    expect(r.escritasSimuladas.some((e) => e.includes("conversa.criar_tarefa"))).toBe(true);
    expect(r.passos.some((p) => p.teriaEscrito)).toBe(true);

    vi.restoreAllMocks();
  });
});

describe("as instruções alternativas", () => {
  it("o texto de teste chega ao modelo no lugar do publicado", async () => {
    let instrucoesVistas = "";
    const espia: PortaIa = {
      nome: "teste",
      modelo: "teste-1",
      gerarEstruturado: (p) => {
        instrucoesVistas = p.instrucoes;
        return Promise.resolve(resposta);
      },
    };

    const gateway = await import("../integracoes/ia/gateway");
    vi.spyOn(gateway, "portaParaFinalidade").mockResolvedValue({
      configurado: true,
      porta: espia,
    } as never);

    await rodarPlayground({
      organizationId: ORG,
      conversationId: CONVERSA,
      mensagem: "oi",
      instrucoes: "VOCÊ É UM TESTE. Responda sempre em maiúsculas.",
      agora: AGORA,
    });

    /*
     * É O PONTO DO PLAYGROUND. Sem isto, testar uma mudança de instruções
     * exigiria PUBLICAR a mudança — ou seja, soltá-la em cima de paciente de
     * verdade para descobrir se ficou boa.
     */
    expect(instrucoesVistas).toContain("VOCÊ É UM TESTE");

    vi.restoreAllMocks();
  });

  it("a mensagem de teste chega ao modelo, sem ser gravada", async () => {
    let entradaVista = "";
    const espia: PortaIa = {
      nome: "teste",
      modelo: "teste-1",
      gerarEstruturado: (p) => {
        entradaVista = p.entrada;
        return Promise.resolve(resposta);
      },
    };

    const gateway = await import("../integracoes/ia/gateway");
    vi.spyOn(gateway, "portaParaFinalidade").mockResolvedValue({
      configurado: true,
      porta: espia,
    } as never);

    const antes = conteudo("crc_messages").length;
    await rodar("Vocês aceitam Amil?");

    expect(entradaVista).toContain("Vocês aceitam Amil?");
    // O histórico é REAL, a mensagem é nova — e ela não entra no banco.
    expect(conteudo("crc_messages")).toHaveLength(antes);

    vi.restoreAllMocks();
  });
});

describe("quando dá errado", () => {
  it("provedor não configurado devolve desfecho nomeado, e não exceção", async () => {
    const gateway = await import("../integracoes/ia/gateway");
    vi.spyOn(gateway, "portaParaFinalidade").mockResolvedValue({
      configurado: false,
      motivo: "Falta a chave.",
      faltando: ["OPENAI_API_KEY"],
    } as never);

    const r = await rodar();

    // Um playground que explode não ensina nada sobre o agente: ensina sobre o
    // playground.
    expect(r.desfecho).toBe("sem_provedor");
    expect(r.motivo).toContain("chave");

    vi.restoreAllMocks();
  });

  it("cada execução roda de novo — a dedupe não bloqueia o teste", async () => {
    const a = await rodar();
    const b = await rodar();

    /*
     * Em produção a chave de dedupe é estável para o mesmo evento produzir um
     * turno só. Aqui, rodar de novo é a FUNÇÃO do playground: uma chave estável
     * faria a segunda tentativa devolver "outra execução já está cuidando deste
     * turno", e quem estivesse testando acharia que travou.
     */
    expect(a.desfecho).toBe("candidato");
    expect(b.desfecho).toBe("candidato");
  });
});
