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
  semear("crc_organizations", [{ id: ORG, slug: "jp", nome: "Clínica Alfa" }]);
});

/* -------------------------------------------------------------------------- */

describe("o texto em uso", () => {
  it("sem versão publicada, é o do código — com o nome DESTA clínica", async () => {
    /*
     * ========================================================================
     *  A PRIMEIRA LINHA DO PROMPT ERA UM LITERAL: "Você atende pelo WhatsApp da
     *  JP Clínica Integrada Odontológica." Num SaaS isso é o agente de um
     *  cliente se apresentando como outro — e o modelo obedece, repetindo o nome
     *  errado com naturalidade, porque foi o que mandaram.
     * ========================================================================
     */
    const emUso = await instrucoesEmUso(ORG);

    expect(emUso).toContain("Clínica Alfa");
    expect(emUso).not.toContain("{{clinica}}");
    expect(emUso).not.toContain("JP Clínica");
  });

  it("outra organização recebe o NOME DELA no mesmo texto", async () => {
    // O teste que prova o isolamento: mesma constante, duas vozes.
    const OUTRA = "99999999-9999-4999-8999-999999999999";
    semear("crc_organizations", [{ id: OUTRA, slug: "beta", nome: "Odonto Beta" }]);

    expect(await instrucoesEmUso(OUTRA)).toContain("Odonto Beta");
    expect(await instrucoesEmUso(OUTRA)).not.toContain("Clínica Alfa");
  });

  it("o rascunho NÃO entra em uso", async () => {
    await salvarRascunho({ organizationId: ORG, instrucoes: TEXTO });
    // É a garantia mais importante da fatia: rascunho não fala com paciente.
    expect(await instrucoesEmUso(ORG)).toContain("Clínica Alfa");
    expect(await instrucoesEmUso(ORG)).not.toContain(TEXTO);
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
    // Continua o texto do código — com o nome desta clínica, e não o publicado.
    expect(await instrucoesEmUso(ORG)).toContain("Clínica Alfa");
    expect(await instrucoesEmUso(ORG)).not.toContain(OUTRO);
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

/* ========================================================================== */
/* A publicação atômica — Fase D                                              */
/* ========================================================================== */

describe("publicar não deixa a clínica sem versão", () => {
  /**
   * O MODO COMO ESTE DEFEITO APARECIA é o que o tornava perigoso.
   *
   * Arquivar a publicada e publicar o rascunho eram dois `update` separados, e
   * cada chamada ao PostgREST é uma transação própria. Morrer entre as duas
   * deixava a clínica SEM VERSÃO PUBLICADA.
   *
   * E `turno.ts` não quebra sem versão publicada: ele cai no texto que vem no
   * código. O agente simplesmente passa a falar com a personalidade padrão, sem
   * erro, sem alerta. A única pista é alguém estranhar que as respostas mudaram.
   */
  async function publicarUmaVersao(texto: string): Promise<void> {
    const r = await salvarRascunho({ organizationId: ORG, instrucoes: texto });
    await aprovar(r.ok ? r.id : null);
    const p = await publicarRascunho({ organizationId: ORG, agora: AGORA });
    expect(p.ok).toBe(true);
  }

  it("existe SEMPRE exatamente uma publicada, antes e depois da troca", async () => {
    await publicarUmaVersao(TEXTO);
    const umaSo = (): number =>
      conteudo("crc_agent_versions").filter((v) => v["status"] === "PUBLICADA").length;

    expect(umaSo()).toBe(1);

    await publicarUmaVersao(`${TEXTO}\n\nMais uma linha para virar outra versão.`);

    // Duas publicadas violariam o índice parcial; zero é o buraco que a Fase D
    // fechou. O número certo é um, nos dois momentos.
    expect(umaSo()).toBe(1);
  });

  it("a versão anterior vira ARQUIVADA, e não some", async () => {
    await publicarUmaVersao(TEXTO);
    const primeira = conteudo("crc_agent_versions").find((v) => v["status"] === "PUBLICADA");

    await publicarUmaVersao(`${TEXTO}\n\nSegunda versão do texto do agente.`);

    const antiga = conteudo("crc_agent_versions").find((v) => v["id"] === primeira?.["id"]);
    // Arquivada, não apagada: é o histórico que permite voltar atrás.
    expect(antiga?.["status"]).toBe("ARQUIVADA");
  });

  it("a troca é UMA chamada, e não dois updates", async () => {
    // Asserção estrutural: o resultado final de dois updates é idêntico ao de
    // uma transação, então nenhum teste de conteúdo pegaria a regressão.
    const modulo = await import("./estudio");
    const codigo = modulo.publicarRascunho.toString();

    expect(codigo).toContain("crc_publicar_versao_agente");
    expect(codigo).not.toContain('status: "ARQUIVADA"');
  });

  it("corrida de duas abas: a segunda recebe recusa nomeada, e nada quebra", async () => {
    const r = await salvarRascunho({ organizationId: ORG, instrucoes: TEXTO });
    await aprovar(r.ok ? r.id : null);

    const primeira = await publicarRascunho({ organizationId: ORG, agora: AGORA });
    expect(primeira.ok).toBe(true);

    // A segunda aba manda publicar o MESMO rascunho, que já não é rascunho.
    const segunda = await publicarRascunho({ organizationId: ORG, agora: AGORA });

    expect(segunda.ok).toBe(false);
    // Recusa com nome, para a tela poder dizer "recarregue" em vez de mostrar
    // um erro cru — e sem ter deixado a clínica sem versão pelo caminho.
    expect(conteudo("crc_agent_versions").filter((v) => v["status"] === "PUBLICADA")).toHaveLength(
      1,
    );
  });
});
