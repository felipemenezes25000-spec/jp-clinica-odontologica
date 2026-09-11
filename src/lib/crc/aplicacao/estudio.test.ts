/**
 * Testes do Estúdio.
 *
 * O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR é publicar às cegas, em três formas:
 *
 *   PUBLICAR SEM AVALIAR. O rascunho nunca passou pela suíte.
 *   PUBLICAR COM A AVALIAÇÃO DE OUTRO TEXTO. A suíte aprovou a versão 2 e alguém
 *   publica a 3 — o gate aprovaria o passado com cara de estar funcionando.
 *   EDITAR DEPOIS DE APROVAR. O texto mudou, e a aprovação some junto.
 *
 * A terceira é a mais fácil de esquecer ao escrever o código, e a mais fácil de
 * fazer sem perceber ao usar a tela.
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

import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import { INSTRUCOES_DO_AGENTE } from "../ia-platform/instrucoes";
import { _semearRodada, estadoDoGate } from "./avaliacao";
import {
  descartarRascunho,
  instrucoesEmUso,
  listarVersoes,
  publicarRascunho,
  rascunhoAPartirDoAtual,
  rascunhoDoAgente,
  registrarAvaliacaoDaVersao,
  salvarRascunho,
  versaoPublicada,
} from "./estudio";

const ORG = "11111111-1111-4111-8111-111111111111";
const AGORA = new Date("2026-09-11T14:00:00.000Z");

const TEXTO = `Você atende pelo WhatsApp da clínica. Fale curto, gentil, em português do Brasil.
Nunca fale de remédio, preço ou horário que você não consultou. Quando a conversa
exigir uma pessoa, diga que vai passar para a equipe e marque precisaHumano.`;

const OUTRO = `${TEXTO}\n\nE trate cada pessoa pelo primeiro nome, sempre que souber qual é.`;

/**
 * Aprova a versão dada, como se a suíte tivesse rodado e passado.
 *
 * Faz as DUAS gravações que a rodada de verdade faz: a rodada aponta para a
 * versão (`agent_version_id`) e a versão aponta para a rodada (`rodada_id`). A
 * segunda é a que `publicarRascunho` confere, e é ela que `salvarRascunho` limpa
 * quando o texto muda.
 */
async function aprovar(versaoId: string | null, quando = AGORA): Promise<void> {
  await _semearRodada(ORG, { liberado: true, criadoEm: quando.toISOString() });
  const linhas = conteudo("crc_eval_rodadas");
  const ultima = linhas[linhas.length - 1];
  if (ultima === undefined) return;
  ultima["agent_version_id"] = versaoId;

  if (versaoId !== null) {
    await registrarAvaliacaoDaVersao(ORG, versaoId, String(ultima["id"] ?? ""));
  }
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
});

/* -------------------------------------------------------------------------- */

describe("o texto em uso", () => {
  it("sem versão publicada, é o do código", async () => {
    expect(await instrucoesEmUso(ORG)).toBe(INSTRUCOES_DO_AGENTE);
  });

  it("o rascunho NÃO entra em uso", async () => {
    await salvarRascunho({ organizationId: ORG, instrucoes: TEXTO });
    // É a garantia mais importante da fatia: rascunho não fala com paciente.
    expect(await instrucoesEmUso(ORG)).toBe(INSTRUCOES_DO_AGENTE);
  });

  it("publicado, passa a ser o texto do agente", async () => {
    const r = await salvarRascunho({ organizationId: ORG, instrucoes: TEXTO });
    await aprovar(r.ok ? r.id : null);
    expect((await publicarRascunho({ organizationId: ORG, agora: AGORA })).ok).toBe(true);

    expect(await instrucoesEmUso(ORG)).toBe(TEXTO);
  });
});

/* -------------------------------------------------------------------------- */

describe("o rascunho", () => {
  it("texto curto é recusado, com o motivo", async () => {
    const r = await salvarRascunho({ organizationId: ORG, instrucoes: "seja legal" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("curto");
  });

  it("salvar duas vezes mexe no MESMO rascunho", async () => {
    await salvarRascunho({ organizationId: ORG, instrucoes: TEXTO });
    await salvarRascunho({ organizationId: ORG, instrucoes: OUTRO });

    // Dois rascunhos abertos é a forma mais rápida de alguém publicar o que não
    // revisou.
    expect(conteudo("crc_agent_versions")).toHaveLength(1);
    expect((await rascunhoDoAgente(ORG))?.instrucoes).toBe(OUTRO);
  });

  it("a numeração NÃO reaproveita número de versão descartada", async () => {
    await salvarRascunho({ organizationId: ORG, instrucoes: TEXTO });
    await descartarRascunho(ORG);
    const segundo = await salvarRascunho({ organizationId: ORG, instrucoes: OUTRO });

    // Reaproveitar faria dois textos diferentes atenderem pelo mesmo nome no
    // histórico.
    expect(segundo.ok && segundo.versao).toBe(2);
  });

  it("abrir rascunho a partir do atual copia o texto em uso", async () => {
    const r = await rascunhoAPartirDoAtual({ organizationId: ORG });
    expect(r.ok).toBe(true);
    expect((await rascunhoDoAgente(ORG))?.instrucoes).toBe(INSTRUCOES_DO_AGENTE);
  });

  it("descartar não toca no que está no ar", async () => {
    const primeiro = await salvarRascunho({ organizationId: ORG, instrucoes: TEXTO });
    await aprovar(primeiro.ok ? primeiro.id : null);
    await publicarRascunho({ organizationId: ORG, agora: AGORA });

    await salvarRascunho({ organizationId: ORG, instrucoes: OUTRO });
    await descartarRascunho(ORG);

    expect(await instrucoesEmUso(ORG)).toBe(TEXTO);
    expect((await versaoPublicada(ORG))?.versao).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("publicar", () => {
  it("sem rascunho, não há o que publicar", async () => {
    const r = await publicarRascunho({ organizationId: ORG, agora: AGORA });
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe("sem_rascunho");
  });

  it("sem avaliação DESTE rascunho, recusa", async () => {
    await salvarRascunho({ organizationId: ORG, instrucoes: TEXTO });
    const r = await publicarRascunho({ organizationId: ORG, agora: AGORA });
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe("sem_avaliacao");
  });

  it("com a avaliação de OUTRA versão, recusa", async () => {
    /*
     * O CASO QUE O VÍNCULO EXISTE PARA COBRIR.
     *
     * A suíte aprovou a versão 1, que está publicada. Alguém escreve a versão 2 e
     * tenta publicar. Sem o vínculo, "a última rodada passou" seria verdade — e o
     * gate liberaria um texto que ninguém avaliou.
     */
    const primeiro = await salvarRascunho({ organizationId: ORG, instrucoes: TEXTO });
    await aprovar(primeiro.ok ? primeiro.id : null);
    await publicarRascunho({ organizationId: ORG, agora: AGORA });

    await salvarRascunho({ organizationId: ORG, instrucoes: OUTRO });
    const r = await publicarRascunho({ organizationId: ORG, agora: AGORA });

    expect(r.ok).toBe(false);
    expect(r.codigo).toBe("sem_avaliacao");
    // E o texto no ar continua o antigo.
    expect(await instrucoesEmUso(ORG)).toBe(TEXTO);
  });

  it("com avaliação reprovada, recusa", async () => {
    const r1 = await salvarRascunho({ organizationId: ORG, instrucoes: TEXTO });
    await _semearRodada(ORG, { liberado: false, criadoEm: AGORA.toISOString() });

    // A rodada REPROVADA é anotada na versão do mesmo jeito que a aprovada seria:
    // o que distingue as duas é o `liberado`, e é isso que este teste afirma.
    const linhas = conteudo("crc_eval_rodadas");
    const ultima = linhas[linhas.length - 1];
    if (ultima !== undefined && r1.ok) {
      ultima["agent_version_id"] = r1.id;
      await registrarAvaliacaoDaVersao(ORG, r1.id, String(ultima["id"] ?? ""));
    }

    const r = await publicarRascunho({ organizationId: ORG, agora: AGORA });
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe("avaliacao_reprovada");
  });

  it("com avaliação velha, recusa", async () => {
    const r1 = await salvarRascunho({ organizationId: ORG, instrucoes: TEXTO });
    await aprovar(r1.ok ? r1.id : null, new Date(AGORA.getTime() - 100 * 3_600_000));

    const r = await publicarRascunho({ organizationId: ORG, agora: AGORA });
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe("avaliacao_velha");
  });

  it("publicar ARQUIVA a versão anterior — uma no ar por vez", async () => {
    const primeiro = await salvarRascunho({ organizationId: ORG, instrucoes: TEXTO });
    await aprovar(primeiro.ok ? primeiro.id : null);
    await publicarRascunho({ organizationId: ORG, agora: AGORA });

    const segundo = await salvarRascunho({ organizationId: ORG, instrucoes: OUTRO });
    await aprovar(segundo.ok ? segundo.id : null);
    const r = await publicarRascunho({ organizationId: ORG, agora: AGORA });

    expect(r.ok).toBe(true);
    const versoes = await listarVersoes(ORG);
    expect(versoes.filter((v) => v.status === "PUBLICADA")).toHaveLength(1);
    expect(versoes.find((v) => v.versao === 1)?.status).toBe("ARQUIVADA");
    expect(await instrucoesEmUso(ORG)).toBe(OUTRO);
  });

  it("editar depois de aprovar APAGA a aprovação", async () => {
    /*
     * O CASO QUE ACONTECE TODO DIA: a pessoa avalia, lê o resultado, e ajusta uma
     * frase antes de publicar. O texto mudou e ninguém o avaliou — a aprovação
     * anterior era de outro texto.
     */
    const r1 = await salvarRascunho({ organizationId: ORG, instrucoes: TEXTO });
    await aprovar(r1.ok ? r1.id : null);

    await salvarRascunho({ organizationId: ORG, instrucoes: OUTRO });

    const r = await publicarRascunho({ organizationId: ORG, agora: AGORA });
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe("sem_avaliacao");
    expect(await instrucoesEmUso(ORG)).toBe(INSTRUCOES_DO_AGENTE);
  });
});

/* -------------------------------------------------------------------------- */

describe("o gate olha a versão publicada", () => {
  it("com a publicada aprovada e um rascunho reprovado, o gate continua liberado", async () => {
    /*
     * `ultimaRodada` responderia "reprovado" aqui, e estaria errado sobre o texto
     * que o paciente recebe: o rascunho não fala com ninguém.
     */
    const primeiro = await salvarRascunho({ organizationId: ORG, instrucoes: TEXTO });
    await aprovar(primeiro.ok ? primeiro.id : null);
    await publicarRascunho({ organizationId: ORG, agora: AGORA });
    const publicada = await versaoPublicada(ORG);

    const segundo = await salvarRascunho({ organizationId: ORG, instrucoes: OUTRO });
    await _semearRodada(ORG, { liberado: false, criadoEm: AGORA.toISOString() });
    const linhas = conteudo("crc_eval_rodadas");
    const ultima = linhas[linhas.length - 1];
    if (ultima !== undefined) ultima["agent_version_id"] = segundo.ok ? segundo.id : null;

    const g = await estadoDoGate(ORG, AGORA);
    expect(publicada).not.toBeNull();
    expect(g.liberado).toBe(true);
  });

  it("sem versão publicada, o gate olha as rodadas do texto do código", async () => {
    await _semearRodada(ORG, { liberado: true, criadoEm: AGORA.toISOString() });
    // `_semearRodada` grava `agent_version_id` nulo, que é exatamente o que
    // significa "avaliou o texto que vem no código".
    expect((await estadoDoGate(ORG, AGORA)).liberado).toBe(true);
  });
});
