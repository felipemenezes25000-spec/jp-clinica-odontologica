/**
 * O Radar de Receita, com banco — e o que estes testes impedem.
 *
 * ============================================================================
 *  OS QUATRO DEFEITOS QUE ESTE ARQUIVO PRENDE, todos da mesma família: um
 *  número de dinheiro na Home que não sobrevive a uma conferência.
 *
 *   1. contar oportunidade VENCIDA no total de recuperável;
 *   2. contar oportunidade de OUTRO TENANT;
 *   3. somar POTENCIAL onde a tela promete ESPERADO;
 *   4. ler "cinco trocas de mensagem" como "cinco contatos sem resposta".
 *
 *  INJEÇÃO DE DEFEITO — cada um destes reverte uma correção e derruba um teste:
 *    tirar `expires_at > now()` do resumo        → "vencida não entra" quebra;
 *    tirar o filtro de organização               → "tenant" quebra;
 *    somar `potential_value` em vez do produto   → "esperado ≠ potencial" quebra;
 *    contar ACAO sem zerar quando houve RESPOSTA → "conversa saudável" quebra.
 * ============================================================================
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

import { VERSAO_DO_SCORE } from "../dominio/radar";
import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import {
  funilDeAtribuicao,
  listarDoRadar,
  qualificarPagina,
  registrarElo,
  resumoDasClinicas,
  resumoDoRadar,
  varrerRadar,
} from "./radar";

const ORG_A = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLINICA_A = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA_A2 = "aaaa2222-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA_B = "bbbb1111-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const AGORA = new Date("2026-09-12T14:00:00.000Z");

let contador = 0;
function id(prefixo: string): string {
  contador += 1;
  return `${prefixo}${String(contador).padStart(4, "0")}-0000-4000-8000-000000000000`;
}

type Oportunidade = {
  id?: string;
  organizationId?: string;
  clinicId?: string;
  tipo?: string;
  valor?: number | null;
  probabilidade?: number | null;
  confianca?: number | null;
  expiraEm?: string | null;
  fechadaEm?: string | null;
  descartadaEm?: string | null;
  aguardando?: string | null;
  criadoEm?: string;
  versaoDoScore?: string | null;
  impacto?: number | null;
};

function umaOportunidade(o: Oportunidade = {}): string {
  const oid = o.id ?? id("0ppa");
  semear("crc_opportunities", [
    {
      id: oid,
      organization_id: o.organizationId ?? ORG_A,
      clinic_id: o.clinicId ?? CLINICA_A,
      patient_id: null,
      tipo: o.tipo ?? "BUDGET_RECOVERY",
      priority_score: 50,
      priority_fatores: [],
      potential_value: o.valor === undefined ? 1000 : o.valor,
      probability: o.probabilidade ?? null,
      confidence: o.confianca ?? null,
      impact: o.impacto ?? null,
      score_version: o.versaoDoScore ?? null,
      evidence: [],
      expires_at: o.expiraEm ?? null,
      fechada_em: o.fechadaEm ?? null,
      dismissed_em: o.descartadaEm ?? null,
      aguardando: o.aguardando ?? null,
      criado_em: o.criadoEm ?? "2026-09-01T10:00:00.000Z",
      atualizado_em: "2026-09-01T10:00:00.000Z",
    },
  ]);
  return oid;
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  contador = 0;
});

/* -------------------------------------------------------------------------- */

describe("o resumo da Home", () => {
  it("separa o potencial do esperado — e a diferença é enorme", () => {
    /*
     * É A ASSERÇÃO CENTRAL DO RADAR. R$ 10.000 de potencial com 12% de chance
     * são R$ 1.200 de esperado. Uma Home que anuncia os R$ 10.000 está somando
     * o que aconteceria se todo mundo fechasse.
     */
    umaOportunidade({ valor: 10_000, probabilidade: 0.12, confianca: 0.2 });

    return resumoDoRadar(ORG_A, null).then((r) => {
      expect(r.totalPotencial).toBe(10_000);
      expect(r.totalEsperado).toBe(1_200);
    });
  });

  it("oportunidade VENCIDA não entra no total de recuperável", async () => {
    umaOportunidade({ valor: 5_000, probabilidade: 0.5 });
    umaOportunidade({
      valor: 90_000,
      probabilidade: 0.5,
      expiraEm: "2026-09-11T10:00:00.000Z", // ontem
    });

    const r = await resumoDoRadar(ORG_A, null);

    expect(r.totalAbertas).toBe(1);
    expect(r.totalEsperado).toBe(2_500);
  });

  it("fechada e descartada não entram", async () => {
    umaOportunidade({ valor: 1_000, probabilidade: 0.5 });
    umaOportunidade({ valor: 80_000, probabilidade: 0.9, fechadaEm: "2026-09-10T10:00:00.000Z" });
    umaOportunidade({
      valor: 80_000,
      probabilidade: 0.9,
      descartadaEm: "2026-09-10T10:00:00.000Z",
    });

    const r = await resumoDoRadar(ORG_A, null);

    expect(r.totalAbertas).toBe(1);
    expect(r.totalEsperado).toBe(500);
  });

  it("não vaza entre tenants", async () => {
    umaOportunidade({
      organizationId: ORG_A,
      clinicId: CLINICA_A,
      valor: 1_000,
      probabilidade: 0.5,
    });
    umaOportunidade({
      organizationId: ORG_B,
      clinicId: CLINICA_B,
      valor: 99_000,
      probabilidade: 0.9,
    });

    const a = await resumoDoRadar(ORG_A, null);
    const b = await resumoDoRadar(ORG_B, null);

    expect(a.totalEsperado).toBe(500);
    expect(b.totalEsperado).toBe(89_100);
  });

  it("não vaza entre clínicas do mesmo tenant", async () => {
    umaOportunidade({ clinicId: CLINICA_A, valor: 1_000, probabilidade: 0.5 });
    umaOportunidade({ clinicId: CLINICA_A2, valor: 50_000, probabilidade: 0.5 });

    const matriz = await resumoDoRadar(ORG_A, CLINICA_A);
    const filial = await resumoDoRadar(ORG_A, CLINICA_A2);
    const rede = await resumoDoRadar(ORG_A, null);

    expect(matriz.totalEsperado).toBe(500);
    expect(filial.totalEsperado).toBe(25_000);
    expect(rede.totalEsperado).toBe(25_500);
  });

  it("conta quantas ainda NÃO foram avaliadas — é o que explica a diferença", async () => {
    /*
     * Uma oportunidade sem `probability` contribui com ZERO para o esperado.
     * Sem este número na tela, alguém olharia R$ 900 mil de potencial e R$ 4 mil
     * de esperado e concluiria que o Radar está quebrado — quando ele só ainda
     * não pontuou.
     */
    umaOportunidade({ valor: 10_000, probabilidade: 0.2 });
    umaOportunidade({ valor: 900_000, probabilidade: null });

    const r = await resumoDoRadar(ORG_A, null);

    expect(r.totalAbertas).toBe(2);
    expect(r.totalPotencial).toBe(910_000);
    expect(r.totalEsperado).toBe(2_000);
    expect(r.naoAvaliadas).toBe(1);
  });

  it("conta as que estão paradas esperando uma pessoa", async () => {
    umaOportunidade({ probabilidade: 0.2 });
    umaOportunidade({ probabilidade: 0.2, aguardando: "HUMANO" });
    umaOportunidade({ probabilidade: 0.2, aguardando: "PACIENTE" });

    const r = await resumoDoRadar(ORG_A, null);
    expect(r.aguardandoHumano).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("a qualificação", () => {
  it("pontua o que nunca foi pontuado, e grava a versão da fórmula", async () => {
    const oid = umaOportunidade({ valor: 4_000 });

    const r = await qualificarPagina(ORG_A, null, AGORA);

    expect(r.lidas).toBe(1);
    expect(r.pontuadas).toBe(1);
    expect(r.fechou).toBe(true);

    const linha = conteudo("crc_opportunities").find((l) => l["id"] === oid);
    expect(linha?.["probability"]).toBeGreaterThan(0);
    expect(linha?.["score_version"]).toBe(VERSAO_DO_SCORE);
    expect(linha?.["urgency"]).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(linha?.["evidence"])).toBe(true);
  });

  it("NÃO repontua o que já está na versão corrente", async () => {
    /*
     * Não é economia: sem isto, a passagem reescreveria a base inteira a cada
     * cinco minutos, gerando `atualizado_em` novo em tudo e apagando a
     * informação de quando a oportunidade realmente mudou.
     */
    umaOportunidade({ probabilidade: 0.42, versaoDoScore: VERSAO_DO_SCORE });

    const r = await qualificarPagina(ORG_A, null, AGORA);

    expect(r.lidas).toBe(1);
    expect(r.pontuadas).toBe(0);
    expect(conteudo("crc_opportunities")[0]?.["probability"]).toBe(0.42);
  });

  it("repontua quando a VERSÃO muda", async () => {
    umaOportunidade({ probabilidade: 0.42, versaoDoScore: "radar-0-antigo" });

    const r = await qualificarPagina(ORG_A, null, AGORA);

    expect(r.pontuadas).toBe(1);
    expect(conteudo("crc_opportunities")[0]?.["score_version"]).toBe(VERSAO_DO_SCORE);
  });

  it("uma conversa saudável NÃO é lida como silêncio", async () => {
    /*
     * ============================================================================
     *  O DEFEITO MAIS CARO DESTE ARQUIVO, e o mais fácil de escrever.
     *
     *  Contar os elos `ACAO` como "tentativas sem resposta" faz a oportunidade
     *  com cinco trocas de mensagem — cinco ações, cinco respostas, a conversa
     *  MAIS produtiva da clínica — ser lida como cinco contatos ignorados, e ter
     *  a probabilidade cortada a 15% do valor.
     *
     *  A conversa mais promissora vira a de menor chance, e desce para o fim da
     *  fila.
     * ============================================================================
     */
    const conversando = umaOportunidade({ valor: 4_000 });
    const calado = umaOportunidade({ valor: 4_000 });

    for (let i = 0; i < 5; i += 1) {
      await registrarElo({
        organizationId: ORG_A,
        clinicId: CLINICA_A,
        opportunityId: conversando,
        elo: "ACAO",
        chaveDedupe: `acao:${conversando}:${String(i)}`,
      });
      await registrarElo({
        organizationId: ORG_A,
        clinicId: CLINICA_A,
        opportunityId: conversando,
        elo: "RESPOSTA",
        chaveDedupe: `resp:${conversando}:${String(i)}`,
      });
    }

    for (let i = 0; i < 5; i += 1) {
      await registrarElo({
        organizationId: ORG_A,
        clinicId: CLINICA_A,
        opportunityId: calado,
        elo: "ACAO",
        chaveDedupe: `acao:${calado}:${String(i)}`,
      });
    }

    await qualificarPagina(ORG_A, null, AGORA);

    const linhas = conteudo("crc_opportunities");
    const pConversando = Number(linhas.find((l) => l["id"] === conversando)?.["probability"]);
    const pCalado = Number(linhas.find((l) => l["id"] === calado)?.["probability"]);

    expect(pConversando).toBeGreaterThan(pCalado * 5);
  });

  it("o cursor anda, e a página incompleta fecha a volta", async () => {
    umaOportunidade({ id: "0ppa0001-0000-4000-8000-000000000000" });
    umaOportunidade({ id: "0ppa0002-0000-4000-8000-000000000000" });

    const primeira = await qualificarPagina(ORG_A, null, AGORA);
    expect(primeira.ultimoId).toBe("0ppa0002-0000-4000-8000-000000000000");
    expect(primeira.fechou).toBe(true);

    const depois = await qualificarPagina(ORG_A, primeira.ultimoId, AGORA);
    expect(depois.lidas).toBe(0);
    expect(depois.fechou).toBe(true);
  });

  it("não pontua oportunidade de outro tenant", async () => {
    const doB = umaOportunidade({ organizationId: ORG_B, clinicId: CLINICA_B });

    const r = await qualificarPagina(ORG_A, null, AGORA);

    expect(r.lidas).toBe(0);
    expect(conteudo("crc_opportunities").find((l) => l["id"] === doB)?.["probability"]).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("a fila", () => {
  it("ordena por impacto, e não por valor bruto", async () => {
    const pequenaUrgente = umaOportunidade({ valor: 500, probabilidade: 0.9, impacto: 80 });
    const grandeFria = umaOportunidade({ valor: 90_000, probabilidade: 0.02, impacto: 30 });

    const fila = await listarDoRadar(ORG_A, [CLINICA_A], {}, AGORA);

    expect(fila[0]?.id).toBe(pequenaUrgente);
    expect(fila[1]?.id).toBe(grandeFria);
  });

  it("some com a vencida, mesmo que ela esteja aberta no banco", async () => {
    umaOportunidade({ impacto: 90, expiraEm: "2026-09-11T10:00:00.000Z" });
    const viva = umaOportunidade({ impacto: 10 });

    const fila = await listarDoRadar(ORG_A, [CLINICA_A], {}, AGORA);

    expect(fila).toHaveLength(1);
    expect(fila[0]?.id).toBe(viva);
  });

  it("só mostra as clínicas que o usuário ALCANÇA", async () => {
    /*
     * ============================================================================
     *  O VAZAMENTO QUE ESTE TESTE FECHA, e ele é do tipo que ninguém percebe.
     *
     *  A fila recebe a lista de clínicas do contexto da sessão. Numa rede de
     *  três unidades, um usuário que só alcança a do centro veria as três se a
     *  lista virasse `null` — e abriria oportunidades de pacientes que ele não
     *  pode nem ler.
     * ============================================================================
     */
    umaOportunidade({ clinicId: CLINICA_A, impacto: 10 });
    umaOportunidade({ clinicId: CLINICA_A2, impacto: 90 });

    const soMatriz = await listarDoRadar(ORG_A, [CLINICA_A], {}, AGORA);
    const ambas = await listarDoRadar(ORG_A, [CLINICA_A, CLINICA_A2], {}, AGORA);

    expect(soMatriz).toHaveLength(1);
    expect(soMatriz[0]?.id).toBeDefined();
    expect(ambas).toHaveLength(2);
  });

  it("lista VAZIA de clínicas devolve vazio — e não tudo", async () => {
    /*
     * ============================================================================
     *  O QUE ESTE TESTE PROVA, E O QUE ELE NÃO PROVA — anotado porque a injeção
     *  de defeito mostrou a diferença.
     *
     *  PROVA: usuário sem clínica alguma vê zero, e não tudo.
     *
     *  NÃO PROVA: que a guarda `clinicIds.length === 0` em `listarDoRadar` é
     *  necessária. Tirando a guarda, o filtro vira `clinic_id=in.()` — e o
     *  PostgREST responde `200 []` a isso (conferido contra o banco real). O
     *  comportamento seguro vem do banco, não da guarda.
     *
     *  A guarda fica porque torna a intenção explícita e evita uma ida ao banco
     *  que já se sabe vazia. Quem protege o isolamento de verdade é o teste
     *  acima — tirar o filtro de clínica o derruba.
     * ============================================================================
     */
    umaOportunidade({ impacto: 90 });

    expect(await listarDoRadar(ORG_A, [], {}, AGORA)).toHaveLength(0);
  });

  it("o resumo por clínicas alcançadas soma só o que é visível", async () => {
    umaOportunidade({ clinicId: CLINICA_A, valor: 1_000, probabilidade: 0.5 });
    umaOportunidade({ clinicId: CLINICA_A2, valor: 50_000, probabilidade: 0.5 });

    expect((await resumoDasClinicas(ORG_A, [CLINICA_A])).totalEsperado).toBe(500);
    expect((await resumoDasClinicas(ORG_A, [CLINICA_A, CLINICA_A2])).totalEsperado).toBe(25_500);
    expect((await resumoDasClinicas(ORG_A, [])).totalEsperado).toBe(0);
    expect((await resumoDasClinicas(ORG_A, [])).totalAbertas).toBe(0);
  });

  it("o estado vem derivado dos fatos", async () => {
    umaOportunidade({ aguardando: "HUMANO", probabilidade: 0.3, impacto: 50 });

    const fila = await listarDoRadar(ORG_A, [CLINICA_A], {}, AGORA);
    expect(fila[0]?.estado).toBe("WAITING_HUMAN");
  });
});

/* -------------------------------------------------------------------------- */

describe("a cadeia de atribuição", () => {
  it("RECUSA valor em elo que não seja PRODUCAO", async () => {
    /*
     * ============================================================================
     *  A REGRA QUE IMPEDE "QUANTO O CRC RECUPEROU" DE VIRAR A SOMA DAS
     *  TENTATIVAS.
     *
     *  Gravar o valor do orçamento já no elo `ACAO` é tentador — o valor é
     *  conhecido. Mas aí a soma da tabela inclui dinheiro que ninguém recebeu.
     *  A recusa é alta, e não silenciosa.
     * ============================================================================
     */
    await expect(
      registrarElo({
        organizationId: ORG_A,
        clinicId: CLINICA_A,
        elo: "ACAO",
        valor: 8_000,
      }),
    ).rejects.toThrow(/não pode carregar valor/u);
  });

  it("a confiança padrão é DESCONHECIDO — nada vira crédito por omissão", async () => {
    await registrarElo({
      organizationId: ORG_A,
      clinicId: CLINICA_A,
      elo: "CONSULTA_CRIADA",
      chaveDedupe: "c1",
    });

    expect(conteudo("crc_attribution_events")[0]?.["confianca"]).toBe("DESCONHECIDO");
  });

  it("o mesmo elo não entra duas vezes", async () => {
    const primeiro = await registrarElo({
      organizationId: ORG_A,
      clinicId: CLINICA_A,
      elo: "RESPOSTA",
      chaveDedupe: "resposta:conv-1:msg-9",
    });
    const segundo = await registrarElo({
      organizationId: ORG_A,
      clinicId: CLINICA_A,
      elo: "RESPOSTA",
      chaveDedupe: "resposta:conv-1:msg-9",
    });

    expect(primeiro).not.toBeNull();
    expect(segundo).toBeNull();
    expect(conteudo("crc_attribution_events")).toHaveLength(1);
  });

  it("o funil separa produção CONFIRMADA da provável", async () => {
    /*
     * "R$ 28.450 recuperados" só pode usar a confirmada. As duas existirem
     * separadas é o que impede a mesma frase de ser dita com dois números.
     */
    await registrarElo({
      organizationId: ORG_A,
      clinicId: CLINICA_A,
      elo: "PRODUCAO",
      valor: 8_000,
      confianca: "CONFIRMADO",
      chaveDedupe: "p1",
    });
    await registrarElo({
      organizationId: ORG_A,
      clinicId: CLINICA_A,
      elo: "PRODUCAO",
      valor: 5_000,
      confianca: "PROVAVEL",
      chaveDedupe: "p2",
    });
    await registrarElo({
      organizationId: ORG_A,
      clinicId: CLINICA_A,
      elo: "ACAO",
      chaveDedupe: "a1",
    });

    const f = await funilDeAtribuicao(ORG_A, null, "2026-01-01T00:00:00.000Z");

    expect(f.producao).toBe(13_000);
    expect(f.producaoConfirmada).toBe(8_000);
    expect(f.acoes).toBe(1);
  });

  it("o funil não atravessa tenant", async () => {
    await registrarElo({
      organizationId: ORG_B,
      clinicId: CLINICA_B,
      elo: "PRODUCAO",
      valor: 99_000,
      confianca: "CONFIRMADO",
      chaveDedupe: "b1",
    });

    const f = await funilDeAtribuicao(ORG_A, null, "2026-01-01T00:00:00.000Z");
    expect(f.producao).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("a varredura do Radar", () => {
  function nOportunidades(n: number): void {
    const linhas = [];
    for (let i = 0; i < n; i += 1) {
      linhas.push({
        id: `0ppa${String(i).padStart(4, "0")}-0000-4000-8000-000000000000`,
        organization_id: ORG_A,
        clinic_id: CLINICA_A,
        patient_id: null,
        tipo: "RECALL",
        priority_score: 10,
        priority_fatores: [],
        potential_value: 800,
        probability: null,
        confidence: null,
        impact: null,
        score_version: null,
        evidence: [],
        expires_at: null,
        fechada_em: null,
        dismissed_em: null,
        aguardando: null,
        criado_em: "2026-09-01T10:00:00.000Z",
        atualizado_em: "2026-09-01T10:00:00.000Z",
      });
    }
    semear("crc_opportunities", linhas);
  }

  it("percorre a base inteira em várias páginas e fecha o ciclo", async () => {
    nOportunidades(450);

    const r = await varrerRadar(ORG_A, AGORA);

    expect(r.paginas).toBe(3); // 200 + 200 + 50
    expect(r.lidas).toBe(450);
    expect(r.pontuadas).toBe(450);
    expect(r.fechouCiclo).toBe(true);
    expect(r.parouPor).toBe("fim");
  });

  it("o CICLO não é zerado a cada página — a armadilha do upsert de linha inteira", async () => {
    /*
     * ============================================================================
     *  O DEFEITO B-7, QUE JÁ ACONTECEU DE VERDADE NA VARREDURA DE RECALL.
     *
     *  `gravar` usa `resolution=merge-duplicates`, que no PostgREST é upsert de
     *  LINHA INTEIRA: coluna omitida do payload volta ao DEFAULT. Omitir `ciclo`
     *  na gravação intermediária o zera a cada página — e o painel de Saúde
     *  passa a ler "esta varredura nunca fechou uma volta" numa varredura
     *  perfeitamente saudável.
     *
     *  Três voltas completas têm que dar ciclo 3.
     * ============================================================================
     */
    nOportunidades(450);

    await varrerRadar(ORG_A, AGORA);
    await varrerRadar(ORG_A, AGORA);
    await varrerRadar(ORG_A, AGORA);

    const estado = conteudo("crc_scan_state").find((l) => l["varredura"] === "radar");
    expect(estado?.["ciclo"]).toBe(3);
    expect(estado?.["ultimo_ciclo_completo_em"]).toBe(AGORA.toISOString());
  });

  it("o cursor VOLTA AO COMEÇO quando o ciclo fecha", async () => {
    /*
     * Sem isto, a segunda volta leria zero para sempre: o cursor ficaria além do
     * último id, e nada novo nasce com id menor. A varredura pareceria saudável
     * — rodando, sem erro — e não pontuaria mais nada.
     */
    nOportunidades(50);

    await varrerRadar(ORG_A, AGORA);

    const estado = conteudo("crc_scan_state").find((l) => l["varredura"] === "radar");
    expect(estado?.["cursor_id"]).toBeNull();
  });

  it("a segunda volta não repontua o que já está na versão corrente", async () => {
    nOportunidades(50);

    const primeira = await varrerRadar(ORG_A, AGORA);
    const segunda = await varrerRadar(ORG_A, AGORA);

    expect(primeira.pontuadas).toBe(50);
    // Lê de novo — precisa ler para saber que não precisa escrever — e não
    // escreve nada. É o que impede 8.000 `atualizado_em` novos por noite.
    expect(segunda.lidas).toBe(50);
    expect(segunda.pontuadas).toBe(0);
  });

  it("o teto por volta segura, e diz que foi o teto", async () => {
    nOportunidades(900);

    const r = await varrerRadar(ORG_A, AGORA, { teto: 400 });

    expect(r.fechouCiclo).toBe(false);
    expect(r.parouPor).toBe("teto");
    expect(r.lidas).toBeLessThan(900);

    // E o cursor guardou onde parou, para a próxima volta continuar dali.
    const estado = conteudo("crc_scan_state").find((l) => l["varredura"] === "radar");
    expect(typeof estado?.["cursor_id"]).toBe("string");
  });

  it("duas voltas com teto apertado cobrem a base sem repetir nem pular", async () => {
    nOportunidades(500);

    await varrerRadar(ORG_A, AGORA, { teto: 200 });
    await varrerRadar(ORG_A, AGORA, { teto: 200 });
    await varrerRadar(ORG_A, AGORA, { teto: 200 });

    const semPontuar = conteudo("crc_opportunities").filter((l) => l["probability"] === null);
    expect(semPontuar).toHaveLength(0);
  });

  it("não atravessa tenant", async () => {
    nOportunidades(10);
    semear("crc_opportunities", [
      {
        id: "bbbb0001-0000-4000-8000-000000000000",
        organization_id: ORG_B,
        clinic_id: CLINICA_B,
        patient_id: null,
        tipo: "RECALL",
        priority_score: 10,
        priority_fatores: [],
        potential_value: 800,
        probability: null,
        confidence: null,
        impact: null,
        score_version: null,
        evidence: [],
        expires_at: null,
        fechada_em: null,
        dismissed_em: null,
        aguardando: null,
        criado_em: "2026-09-01T10:00:00.000Z",
        atualizado_em: "2026-09-01T10:00:00.000Z",
      },
    ]);

    const r = await varrerRadar(ORG_A, AGORA);

    expect(r.pontuadas).toBe(10);
    const doB = conteudo("crc_opportunities").find(
      (l) => l["id"] === "bbbb0001-0000-4000-8000-000000000000",
    );
    expect(doB?.["probability"]).toBeNull();
  });
});
