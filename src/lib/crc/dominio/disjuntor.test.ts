/**
 * O disjuntor — Fase F.
 *
 * O TESTE MAIS IMPORTANTE DESTE ARQUIVO não é "abre depois de cinco falhas": é
 * `contaComoQueda`. Um disjuntor que abre no erro errado é pior do que nenhum —
 * ele transforma um bug de uma conversa em indisponibilidade de todas as
 * clínicas, e o sintoma não aponta para a causa.
 *
 * O relógio é PARÂMETRO, e não `Date.now()`. Testar uma máquina de estados
 * regida por tempo com relógio de parede significaria `sleep` de trinta
 * segundos por caso; congelar o relógio global apagaria justamente as corridas
 * que o objeto administra.
 */
import { describe, expect, it } from "vitest";

import { contaComoQueda, Disjuntor, POLITICA_PADRAO } from "./disjuntor";

const T0 = new Date("2026-09-11T14:00:00.000Z");
const mais = (ms: number): Date => new Date(T0.getTime() + ms);

describe("contaComoQueda", () => {
  it.each([
    ["timeout da chamada", "timeout", undefined],
    ["provedor indisponível", "indisponivel", undefined],
    ["conexão recusada", "ECONNREFUSED", undefined],
    ["DNS não resolveu", "ENOTFOUND", undefined],
    ["falha de fetch", "fetch failed", undefined],
  ])("%s conta como queda", (_, codigo, status) => {
    expect(contaComoQueda(codigo, status)).toBe(true);
  });

  it("429 conta: é o provedor dizendo para parar", () => {
    expect(contaComoQueda("rate_limit", 429)).toBe(true);
  });

  it.each([500, 502, 503, 504])("%d conta: o outro lado quebrou", (status) => {
    expect(contaComoQueda("erro", status)).toBe(true);
  });

  it.each([
    [400, "prompt malformado"],
    [401, "chave errada"],
    [403, "sem permissão"],
    [422, "parâmetro inválido"],
  ])("%d NÃO conta — é defeito nosso, não queda deles", (status, _motivo) => {
    /*
     * O 401 É O CASO MAIS TENTADOR DE CLASSIFICAR ERRADO. Parece "o provedor
     * recusou". Mas uma chave expirada não melhora com descanso: melhora com
     * alguém trocando a chave. Abrir o disjuntor só atrasaria a descoberta — e,
     * pior, derrubaria o atendimento de todas as clínicas enquanto isso.
     */
    expect(contaComoQueda("recusada", status)).toBe(false);
  });

  it("200 não conta, por óbvio que pareça", () => {
    expect(contaComoQueda("ok", 200)).toBe(false);
  });
});

describe("a máquina de estados", () => {
  it("começa fechado e deixa passar", () => {
    const d = new Disjuntor("teste");
    expect(d.ler(T0)).toMatchObject({ estado: "fechado", liberado: true });
  });

  it("quatro falhas não abrem; a quinta abre", () => {
    const d = new Disjuntor("teste");

    for (let i = 0; i < POLITICA_PADRAO.limite - 1; i += 1) d.falha(T0);
    expect(d.ler(T0).estado).toBe("fechado");

    d.falha(T0);
    expect(d.ler(T0)).toMatchObject({ estado: "aberto", liberado: false });
  });

  it("um sucesso no meio zera a contagem", () => {
    const d = new Disjuntor("teste");

    // Um 500 esporádico é a vida normal de uma API. O que sinaliza queda é a
    // SEQUÊNCIA, e por isso qualquer sucesso a interrompe.
    for (let i = 0; i < 4; i += 1) d.falha(T0);
    d.sucesso();
    for (let i = 0; i < 4; i += 1) d.falha(T0);

    expect(d.ler(T0).estado).toBe("fechado");
  });

  it("aberto, corta NA HORA — sem esperar timeout de rede", () => {
    const d = new Disjuntor("teste");
    for (let i = 0; i < 5; i += 1) d.falha(T0);

    /*
     * É O PONTO INTEIRO DO MECANISMO. Com a fila da Fase B, cem pacientes
     * esperando viram quinhentas chamadas condenadas, cada uma segurando uma
     * conexão pelo tempo do timeout. O worker fica ocupado esperando respostas
     * que não vêm — e as clínicas cujo provedor ESTÁ no ar param de ser
     * atendidas junto. Uma queda vira duas.
     */
    expect(d.ler(mais(1000)).liberado).toBe(false);
  });

  it("passado o descanso, deixa passar UMA sondagem", () => {
    const d = new Disjuntor("teste");
    for (let i = 0; i < 5; i += 1) d.falha(T0);

    const depois = mais(POLITICA_PADRAO.descansoMs + 1);
    expect(d.ler(depois)).toMatchObject({ estado: "meio_aberto", liberado: true });
  });

  it("sondagem que funciona fecha o disjuntor", () => {
    const d = new Disjuntor("teste");
    for (let i = 0; i < 5; i += 1) d.falha(T0);

    const depois = mais(POLITICA_PADRAO.descansoMs + 1);
    d.ler(depois);
    d.sucesso();

    expect(d.ler(depois)).toMatchObject({ estado: "fechado", liberado: true, falhasSeguidas: 0 });
  });

  it("sondagem que falha DOBRA o descanso", () => {
    const d = new Disjuntor("teste");
    for (let i = 0; i < 5; i += 1) d.falha(T0);

    const primeira = mais(POLITICA_PADRAO.descansoMs + 1);
    d.ler(primeira);
    d.falha(primeira);

    // Ainda cortado no tempo que teria bastado da primeira vez.
    expect(d.ler(mais(POLITICA_PADRAO.descansoMs * 2)).liberado).toBe(false);
    // E liberado depois do dobro.
    expect(d.ler(mais(POLITICA_PADRAO.descansoMs * 3 + 10)).liberado).toBe(true);
  });

  it("o descanso tem teto — não cresce para sempre", () => {
    const d = new Disjuntor("teste");
    for (let i = 0; i < 5; i += 1) d.falha(T0);

    // Dez sondagens falhadas seguidas. Sem teto, o descanso passaria de oito
    // horas, e o provedor voltaria sem ninguém perceber.
    let t = POLITICA_PADRAO.descansoMs;
    for (let i = 0; i < 10; i += 1) {
      t += POLITICA_PADRAO.descansoMaximoMs * 2;
      const quando = mais(t);
      d.ler(quando);
      d.falha(quando);
    }

    const leitura = d.ler(mais(t + POLITICA_PADRAO.descansoMaximoMs + 10));
    expect(leitura.liberado).toBe(true);
  });

  it("depois de fechar, o descanso volta ao mínimo", () => {
    const d = new Disjuntor("teste");

    // Incidente 1, com uma sondagem falhada que dobrou o descanso.
    for (let i = 0; i < 5; i += 1) d.falha(T0);
    const s1 = mais(POLITICA_PADRAO.descansoMs + 1);
    d.ler(s1);
    d.falha(s1);
    const s2 = mais(POLITICA_PADRAO.descansoMs * 3 + 10);
    d.ler(s2);
    d.sucesso();

    // Incidente 2, independente. A paciência acumulada no anterior não pode ser
    // herdada — senão o sistema fica cada vez mais lento para se recuperar ao
    // longo do dia, sem motivo.
    const base = mais(1_000_000);
    for (let i = 0; i < 5; i += 1) d.falha(base);
    const t = new Date(base.getTime() + POLITICA_PADRAO.descansoMs + 1);

    expect(d.ler(t).liberado).toBe(true);
  });
});
