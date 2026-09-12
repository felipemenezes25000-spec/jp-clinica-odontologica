/**
 * O freio de tentativa de login.
 *
 * O QUE ESTES TESTES PROTEGEM é o equilíbrio entre duas coisas que puxam para
 * lados opostos: travar o atacante sem punir quem errou uma letra da própria
 * senha. Um freio agressivo demais vira chamado de suporte; um frouxo não é
 * freio.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  chaveDoFreio,
  conferirFreio,
  esperaDoBloqueio,
  registrarFalha,
  registrarSucesso,
  _limparFreio,
  JANELA_MS,
  MAX_TENTATIVAS_LOGIN,
} from "./forca-bruta";

const AGORA = new Date("2026-09-12T14:00:00.000Z").getTime();
const CHAVE = chaveDoFreio("200.1.2.3", "maria@clinica.com");

beforeEach(() => {
  _limparFreio();
});

/* -------------------------------------------------------------------------- */

describe("a chave do freio", () => {
  it("combina IP E e-mail", () => {
    /*
     * SÓ IP puniria um consultório inteiro atrás do mesmo NAT porque uma pessoa
     * errou a senha. SÓ E-MAIL deixaria um atacante travar a conta de alguém de
     * fora, de propósito — negação de serviço contra a vítima.
     */
    expect(chaveDoFreio("1.1.1.1", "a@x.com")).not.toBe(chaveDoFreio("2.2.2.2", "a@x.com"));
    expect(chaveDoFreio("1.1.1.1", "a@x.com")).not.toBe(chaveDoFreio("1.1.1.1", "b@x.com"));
  });

  it("normaliza o e-mail: caixa e espaço não criam chave nova", () => {
    // Senão bastaria alternar maiúsculas para zerar o contador.
    expect(chaveDoFreio("1.1.1.1", " Maria@X.com ")).toBe(chaveDoFreio("1.1.1.1", "maria@x.com"));
  });
});

describe("o freio", () => {
  it("deixa passar as primeiras tentativas", () => {
    // Quem errou a senha de verdade não pode ser tratado como atacante logo na
    // segunda tentativa.
    for (let i = 1; i < MAX_TENTATIVAS_LOGIN; i += 1) {
      const r = registrarFalha(CHAVE, AGORA);
      expect(r.liberado, `tentativa ${String(i)}`).toBe(true);
    }
  });

  it("bloqueia a partir da sexta", () => {
    for (let i = 0; i < MAX_TENTATIVAS_LOGIN; i += 1) registrarFalha(CHAVE, AGORA);

    const r = registrarFalha(CHAVE, AGORA);
    expect(r.liberado).toBe(false);
    expect(r.esperaSegundos).toBe(60);
  });

  it("a espera CRESCE a cada tentativa além do teto", () => {
    // 1min, 2min, 4min… e com teto de 15. Sem teto, um erro bobo trancaria a
    // pessoa por horas; sem crescimento, o atacante só esperaria um minuto
    // entre as rajadas.
    expect(esperaDoBloqueio(MAX_TENTATIVAS_LOGIN)).toBe(0);
    expect(esperaDoBloqueio(MAX_TENTATIVAS_LOGIN + 1)).toBe(60_000);
    expect(esperaDoBloqueio(MAX_TENTATIVAS_LOGIN + 2)).toBe(120_000);
    expect(esperaDoBloqueio(MAX_TENTATIVAS_LOGIN + 3)).toBe(240_000);
    expect(esperaDoBloqueio(MAX_TENTATIVAS_LOGIN + 20)).toBe(15 * 60_000);
  });

  it("passada a espera, libera de novo", () => {
    for (let i = 0; i <= MAX_TENTATIVAS_LOGIN; i += 1) registrarFalha(CHAVE, AGORA);
    expect(conferirFreio(CHAVE, AGORA).liberado).toBe(false);

    // Um minuto depois.
    expect(conferirFreio(CHAVE, AGORA + 61_000).liberado).toBe(true);
  });

  it("a janela expira e o histórico some", () => {
    /*
     * Sem isto, cinco erros espalhados ao longo de um mês somariam como se
     * fossem um ataque — e a pessoa seria bloqueada por um histórico que não
     * diz nada sobre o que está acontecendo agora.
     */
    for (let i = 0; i < MAX_TENTATIVAS_LOGIN; i += 1) registrarFalha(CHAVE, AGORA);

    const depois = registrarFalha(CHAVE, AGORA + JANELA_MS + 1000);
    expect(depois.tentativas).toBe(1);
    expect(depois.liberado).toBe(true);
  });

  it("entrar ZERA o histórico", () => {
    // Quem entrou não é suspeito. Sem isto, quem errou quatro vezes e acertou
    // ficaria a uma tentativa do bloqueio pelos quinze minutos seguintes.
    for (let i = 0; i < MAX_TENTATIVAS_LOGIN; i += 1) registrarFalha(CHAVE, AGORA);
    registrarSucesso(CHAVE);

    expect(conferirFreio(CHAVE, AGORA).tentativas).toBe(0);
  });

  it("o bloqueio de uma chave NÃO afeta outra", () => {
    // É o teste que prova que a escolha da chave funciona: o colega de sala
    // continua conseguindo entrar.
    const outra = chaveDoFreio("200.1.2.3", "joao@clinica.com");
    for (let i = 0; i <= MAX_TENTATIVAS_LOGIN; i += 1) registrarFalha(CHAVE, AGORA);

    expect(conferirFreio(CHAVE, AGORA).liberado).toBe(false);
    expect(conferirFreio(outra, AGORA).liberado).toBe(true);
  });

  it("conferir NÃO conta — só a falha conta", () => {
    /*
     * `conferirFreio` roda ANTES de verificar a senha, em toda tentativa
     * inclusive as certas. Se ele contasse, entrar corretamente dez vezes
     * seguidas bloquearia a própria pessoa.
     */
    for (let i = 0; i < 20; i += 1) conferirFreio(CHAVE, AGORA);
    expect(conferirFreio(CHAVE, AGORA).tentativas).toBe(0);
  });
});
