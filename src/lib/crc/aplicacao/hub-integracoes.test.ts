/**
 * Integration Hub, com banco.
 *
 * ============================================================================
 *  O TESTE QUE CARREGA ESTE ARQUIVO é o do DEGRADED.
 *
 *  MISSING e CONNECTED qualquer um adivinha. "Está configurado, respondeu
 *  semana passada e não responde desde ontem" é o que ninguém percebe até o
 *  paciente reclamar — e é a única razão de esta tela existir.
 *
 *  INJEÇÃO DE DEFEITO:
 *    declarar CONNECTED por ter credencial → "credencial não é conexão" quebra;
 *    tratar qualquer erro como ERROR       → "erro velho não manda" quebra;
 *    ignorar erro intermitente             → "metade das vezes" quebra.
 * ============================================================================
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

import { definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import { lerHub } from "./hub-integracoes";

const ORG = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGORA = new Date("2026-09-15T14:00:00.000Z");

let seq = 0;

function credencial(sistema: string) {
  seq += 1;
  semear("crc_integracoes_clinica", [
    {
      id: `int-${String(seq)}`,
      organization_id: ORG,
      clinic_id: CLINICA,
      sistema,
      base_url: "https://exemplo.test",
      client_id: "x",
      segredo_cifrado: null,
      dica: "",
      config: {},
      ativo: true,
      criado_em: "2026-01-01T10:00:00.000Z",
      atualizado_em: "2026-01-01T10:00:00.000Z",
    },
  ]);
}

function log(integracao: string, sucesso: boolean, horasAtras: number) {
  seq += 1;
  const quando = new Date(AGORA.getTime() - horasAtras * 3_600_000).toISOString();
  semear("crc_integration_logs", [
    {
      id: `lg-${String(seq)}`,
      organization_id: ORG,
      integracao,
      operacao: "teste",
      direcao: "SAIDA",
      metodo: "GET",
      caminho: "/x",
      status_http: sucesso ? 200 : 500,
      sucesso,
      erro: sucesso ? null : "falhou",
      duracao_ms: 10,
      request_id: null,
      resumo: null,
      criado_em: quando,
    },
  ]);
}

const achar = (lista: { chave: string }[], chave: string) => lista.find((i) => i.chave === chave);

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  seq = 0;
});

/* -------------------------------------------------------------------------- */

describe("os quatro estados", () => {
  it("sem credencial é MISSING", async () => {
    const hub = await lerHub(ORG, [CLINICA], AGORA);
    expect(achar(hub, "dental_office")?.estado).toBe("MISSING");
  });

  it("CREDENCIAL NÃO É CONEXÃO — configurada e nunca usada continua MISSING", async () => {
    /*
     * ============================================================================
     *  Uma tela que mostra "conectado" porque alguém salvou uma credencial é
     *  pior do que não ter tela: ela afirma que está funcionando justamente
     *  quando a pessoa foi conferir por desconfiar que não estava.
     * ============================================================================
     */
    credencial("dental_office");

    const hub = await lerHub(ORG, [CLINICA], AGORA);
    const dental = achar(hub, "dental_office");

    expect(dental?.estado).toBe("MISSING");
    expect(dental?.detalhe).toContain("ainda não foi usada");
  });

  it("sucesso recente é CONNECTED", async () => {
    credencial("dental_office");
    log("dental_office", true, 2);

    expect(achar(await lerHub(ORG, [CLINICA], AGORA), "dental_office")?.estado).toBe("CONNECTED");
  });

  it("última tentativa falhou é ERROR", async () => {
    credencial("dental_office");
    log("dental_office", true, 10);
    log("dental_office", false, 1);

    expect(achar(await lerHub(ORG, [CLINICA], AGORA), "dental_office")?.estado).toBe("ERROR");
  });

  it("erro VELHO não manda: sucesso mais recente significa que voltou", async () => {
    /*
     * Tratar qualquer erro no histórico como ERROR deixaria a tela
     * permanentemente vermelha para toda integração que já falhou uma vez — e
     * uma tela sempre vermelha é uma tela que ninguém olha.
     */
    credencial("dental_office");
    log("dental_office", false, 30);
    log("dental_office", true, 1);

    expect(achar(await lerHub(ORG, [CLINICA], AGORA), "dental_office")?.estado).toBe("CONNECTED");
  });

  it("funcionou há muito tempo é DEGRADED, mesmo sem erro nenhum", async () => {
    /*
     * ============================================================================
     *  ESTE É O ESTADO QUE JUSTIFICA A TELA.
     *
     *  Nada deu erro. Simplesmente parou de acontecer — e ninguém percebe até
     *  o paciente reclamar que não recebeu a confirmação.
     * ============================================================================
     */
    credencial("dental_office");
    log("dental_office", true, 96);

    const dental = achar(await lerHub(ORG, [CLINICA], AGORA), "dental_office");

    expect(dental?.estado).toBe("DEGRADED");
    expect(dental?.detalhe).toContain("sem ninguém perceber");
  });

  it("erra metade das vezes é DEGRADED, e não CONNECTED", async () => {
    /*
     * Se só o último resultado contasse, uma integração que perde metade das
     * mensagens apareceria como saudável.
     */
    credencial("dental_office");
    for (let i = 0; i < 4; i += 1) log("dental_office", false, 5 + i);
    log("dental_office", true, 1);

    const dental = achar(await lerHub(ORG, [CLINICA], AGORA), "dental_office");

    expect(dental?.estado).toBe("DEGRADED");
    expect(dental?.detalhe).toContain("falhas nas últimas 24h");
  });
});

/* -------------------------------------------------------------------------- */

describe("o que está bloqueado por falta de provedor", () => {
  it("voz e pagamento são MISSING com frase própria", async () => {
    /*
     * BLOCKED_EXTERNAL não é um quinto estado — o §54 define quatro. O que muda
     * é o texto: "ninguém configurou" convida a configurar; "não há provedor"
     * avisa que não adianta procurar o botão.
     */
    const hub = await lerHub(ORG, [CLINICA], AGORA);

    for (const chave of ["voz", "pagamentos"]) {
      const i = achar(hub, chave);
      expect(i?.estado).toBe("MISSING");
      expect(i?.bloqueadoExterno).toBe(true);
      expect(i?.detalhe).toContain("Sem provedor");
    }
  });

  it("toda integração diz o que quebra se faltar", async () => {
    // "MISSING" sozinho não ajuda ninguém a priorizar. O que decide é saber
    // que sem o Dental Office cada paciente passa a ser digitado à mão.
    for (const i of await lerHub(ORG, [CLINICA], AGORA)) {
      expect(i.seFaltar.length).toBeGreaterThan(40);
      expect(i.detalhe.length).toBeGreaterThan(10);
    }
  });
});
