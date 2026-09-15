/**
 * A saúde da Meta — §39, §61, §74.
 *
 * ============================================================================
 *  O QUE ESTE ARQUIVO PROVA: QUE A TELA NÃO MENTE.
 *
 *  O §74 proíbe estado inventado. E o jeito mais fácil de inventar é o mais
 *  comum: mostrar "CONECTADO" porque existe uma linha no banco e uma variável
 *  de ambiente. Uma conta cadastrada, com token válido, cujo webhook NUNCA
 *  chegou, é exatamente a instalação que parece funcionar e não funciona — a
 *  causa nº 1 é subscrição sem o campo certo, que não dá erro nenhum.
 *
 *  Aqui `CONECTADO` exige FATO DATADO RECENTE. Todo o resto é `ATENCAO` ou
 *  `ERRO`, com a frase que diz o que fazer.
 * ============================================================================
 *
 * ============================================================================
 *  O PIOR CANAL DECIDE, E NÃO A MÉDIA.
 *
 *  Duas contas em que uma funciona e a outra tem token morto não é "metade
 *  funcionando": é uma clínica sem Instagram. A média esconderia exatamente o
 *  caso em que alguém precisa agir — e é isso que o teste de duas contas cobre.
 * ============================================================================
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return {
    ...real,
    registrar: () => undefined,
    auditar: () => Promise.resolve(),
    registrarIntegracao: () => Promise.resolve(),
  };
});

import { definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import {
  DIAS_PARA_ALERTAR_TOKEN,
  HORAS_SEM_WEBHOOK,
  lerSaudeDaMeta,
  type SaudeDaMeta,
} from "./meta-saude";

const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_B = "33333333-3333-4333-8333-333333333333";
const CLINICA = "22222222-2222-4222-8222-222222222222";
const CLINICA_2 = "24444444-2222-4222-8222-222222222222";

const AGORA = new Date("2026-09-15T12:00:00.000Z");

/** Quantas horas atrás, em ISO. */
function horasAtras(h: number): string {
  return new Date(AGORA.getTime() - h * 3_600_000).toISOString();
}

/** Em quantos dias, em ISO. Negativo = já passou. */
function emDias(d: number): string {
  return new Date(AGORA.getTime() + d * 86_400_000).toISOString();
}

function canal(p: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "canal-a",
    organization_id: ORG,
    clinic_id: CLINICA,
    provider: "meta",
    produtos: ["instagram", "messenger"],
    page_id: "104000000000001",
    instagram_account_id: "17841400000000099",
    ativo: true,
    token_expira_em: null,
    ultimo_webhook_em: horasAtras(1),
    ultima_mensagem_em: horasAtras(1),
    ultimo_lead_em: null,
    ultimo_erro: null,
    ultimo_erro_em: null,
    criado_em: "2026-09-01T00:00:00.000Z",
    ...p,
  };
}

function sinal(s: SaudeDaMeta, chave: string) {
  const achado = s.sinais.find((x) => x.chave === chave);
  if (achado === undefined) throw new Error(`Sinal ausente: ${chave}`);
  return achado;
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);

  /*
   * AS TRÊS VARIÁVEIS DO APLICATIVO, definidas por padrão.
   *
   * Sem elas, `lerSaudeDaMeta` responde ERRO por configuração — e com razão:
   * sem `META_APP_SECRET` todo webhook é recusado. Cada teste abaixo mede outra
   * coisa, e a ausência de variável abafaria todas de uma vez.
   *
   * O teste que mede ESTE caminho apaga a variável de propósito.
   */
  process.env["META_APP_ID"] = "app-de-teste";
  process.env["META_APP_SECRET"] = "segredo-de-teste";
  process.env["META_WEBHOOK_VERIFY_TOKEN"] = "verify-de-teste";

  semear("crc_organizations", [
    { id: ORG, slug: "jp" },
    { id: ORG_B, slug: "vizinha" },
  ]);
  semear("crc_clinics", [
    { id: CLINICA, organization_id: ORG, slug: "jp-matriz", ativa: true },
    { id: CLINICA_2, organization_id: ORG, slug: "jp-centro", ativa: true },
  ]);
});

/* -------------------------------------------------------------------------- */

describe("nada cadastrado", () => {
  it("é NAO_CONFIGURADO, e o detalhe diz o que deixa de entrar", async () => {
    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(s.estado).toBe("NAO_CONFIGURADO");
    // Não é "integração desligada": é a lista do que a clínica não recebe.
    expect(s.detalhe).toContain("Lead Ads");
    expect(s.sinais).toEqual([]);
    expect(s.exigeReconexao).toBe(false);
  });

  it("um canal DESATIVADO não conta como cadastrado", async () => {
    // O cartão precisa dizer NAO_CONFIGURADO, e não CONECTADO com sinais de um
    // canal que não recebe mais nada.
    semear("crc_canais_meta", [canal({ ativo: false })]);

    expect((await lerSaudeDaMeta(ORG, null, AGORA)).estado).toBe("NAO_CONFIGURADO");
  });

  it("acesso a NENHUMA unidade é NAO_CONFIGURADO por acesso, e diz isso", async () => {
    semear("crc_canais_meta", [canal()]);

    const s = await lerSaudeDaMeta(ORG, [], AGORA);

    expect(s.estado).toBe("NAO_CONFIGURADO");
    expect(s.detalhe).toContain("unidade");
  });
});

describe("cadastrado e nunca recebeu", () => {
  it("é ATENCAO, e o detalhe aponta a SUBSCRIÇÃO — a causa real", async () => {
    /*
     * ==========================================================================
     *  ESTE É O ESTADO QUE MAIS ENGANA.
     *
     *  Token válido, conta cadastrada, app instalado — e nada chega. A causa é
     *  quase sempre a subscrição do webhook ter ficado sem o campo certo, e
     *  isso NÃO DÁ ERRO: a Meta aceita a subscrição e nunca entrega.
     *
     *  Um cartão verde aqui custaria dias de lead perdido.
     * ==========================================================================
     */
    semear("crc_canais_meta", [canal({ ultimo_webhook_em: null, ultima_mensagem_em: null })]);

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(s.estado).toBe("ATENCAO");
    expect(s.detalhe).toContain("NENHUM webhook");
    expect(s.detalhe).toContain("subscri");
    expect(sinal(s, "ultimo_webhook").valor).toBe("nunca");
    expect(sinal(s, "ultimo_webhook").alerta).toBe(true);
  });
});

describe("as variáveis do aplicativo", () => {
  it("faltando `META_APP_SECRET`, é ERRO — e o detalhe diz qual variável", async () => {
    /*
     * ==========================================================================
     *  O SILÊNCIO MAIS CARO, E O MAIS FÁCIL DE CAUSAR.
     *
     *  Sem o segredo, a assinatura não pode ser conferida: o webhook volta 503,
     *  a Meta reentrega, o CRC recusa de novo. Nada disso aparece como erro de
     *  token, de fila ou de chamada — os outros sinais ficam TODOS verdes
     *  enquanto nenhuma mensagem entra.
     *
     *  E a conclusão errada está a um passo: "nenhum webhook chegou ainda"
     *  manda conferir a subscrição do app, em vez da variável que falta.
     * ==========================================================================
     */
    delete process.env["META_APP_SECRET"];
    semear("crc_canais_meta", [canal()]);

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(s.estado).toBe("ERRO");
    expect(s.detalhe).toContain("META_APP_SECRET");
    expect(s.detalhe).toContain("recusado");
    expect(sinal(s, "configuracao").alerta).toBe(true);
    expect(sinal(s, "configuracao").valor).toContain("META_APP_SECRET");

    // NÃO é reconectar: é definir variável de ambiente e reimplantar.
    expect(s.exigeReconexao).toBe(false);
  });

  it("vem ANTES do token vencido — é ela que explica todo o resto", async () => {
    // Com as duas coisas erradas, o cartão aponta a variável: consertar o token
    // sem a variável não faz nenhum webhook entrar.
    delete process.env["META_APP_SECRET"];
    semear("crc_canais_meta", [canal({ token_expira_em: emDias(-3) })]);

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(s.estado).toBe("ERRO");
    expect(s.detalhe).toContain("META_APP_SECRET");
  });

  it("faltando duas, as duas aparecem no detalhe", async () => {
    delete process.env["META_APP_ID"];
    delete process.env["META_WEBHOOK_VERIFY_TOKEN"];
    semear("crc_canais_meta", [canal()]);

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(s.detalhe).toContain("META_APP_ID");
    expect(s.detalhe).toContain("META_WEBHOOK_VERIFY_TOKEN");
  });

  it("sem conta cadastrada, a variável ausente não vira alarme", async () => {
    // Um servidor sem nenhuma conta da Meta e sem as variáveis está
    // CORRETAMENTE desligado. `ERRO` aqui pintaria de vermelho a instalação de
    // toda clínica que não usa Instagram.
    delete process.env["META_APP_SECRET"];

    expect((await lerSaudeDaMeta(ORG, null, AGORA)).estado).toBe("NAO_CONFIGURADO");
  });
});

describe("o token", () => {
  it("VENCIDO é ERRO, e exige uma PESSOA para reconectar", async () => {
    semear("crc_canais_meta", [canal({ token_expira_em: emDias(-1) })]);

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(s.estado).toBe("ERRO");
    // `exigeReconexao` é o que faz a tela mostrar o botão de reconectar em vez
    // de sugerir "tente de novo": nenhuma retentativa conserta token vencido.
    expect(s.exigeReconexao).toBe(true);
    expect(sinal(s, "token").valor).toBe("VENCIDO");
  });

  it("vencendo dentro da janela é ATENCAO, e diz quantos dias faltam", async () => {
    semear("crc_canais_meta", [canal({ token_expira_em: emDias(DIAS_PARA_ALERTAR_TOKEN - 4) })]);

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(s.estado).toBe("ATENCAO");
    expect(s.detalhe).toContain("10 dias");
    expect(sinal(s, "token").alerta).toBe(true);
    // Vencendo não é vencido: ninguém precisa correr agora.
    expect(s.exigeReconexao).toBe(false);
  });

  it("longe de vencer não alerta", async () => {
    semear("crc_canais_meta", [canal({ token_expira_em: emDias(59) })]);

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(s.estado).toBe("CONECTADO");
    expect(sinal(s, "token").alerta).toBe(false);
  });

  it("sem data, a tela diz `não informou` — e NUNCA `válido`", async () => {
    /*
     * `null` significa "não sabemos". O caso legítimo é o token de System User,
     * que não vence. Mas escrever "válido" aqui seria afirmar o que não foi
     * medido — e o §74 é sobre exatamente isso.
     */
    semear("crc_canais_meta", [canal({ token_expira_em: null })]);

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(sinal(s, "token").valor).toContain("não informou");
    expect(sinal(s, "token").valor).not.toContain("válido");
    expect(sinal(s, "token").alerta).toBe(false);
  });
});

describe("o webhook que parou", () => {
  it(`mais de ${String(HORAS_SEM_WEBHOOK)}h sem webhook é ATENCAO`, async () => {
    semear("crc_canais_meta", [
      canal({
        ultimo_webhook_em: horasAtras(HORAS_SEM_WEBHOOK + 5),
        ultima_mensagem_em: horasAtras(HORAS_SEM_WEBHOOK + 5),
      }),
    ]);

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(s.estado).toBe("ATENCAO");
    expect(s.detalhe).toContain("53 horas");
    expect(s.detalhe).toContain("sem ninguém perceber");
  });

  it("dentro da janela não alerta — clínica fechada no fim de semana é normal", async () => {
    semear("crc_canais_meta", [canal({ ultimo_webhook_em: horasAtras(HORAS_SEM_WEBHOOK - 2) })]);

    expect((await lerSaudeDaMeta(ORG, null, AGORA)).estado).toBe("CONECTADO");
  });
});

describe("o erro mais novo que o último sucesso", () => {
  it("é ERRO, com o detalhe registrado — e não exige reconexão", async () => {
    semear("crc_canais_meta", [
      canal({
        ultimo_webhook_em: horasAtras(5),
        ultimo_erro: "(#4) Application request limit reached",
        ultimo_erro_em: horasAtras(1),
      }),
    ]);

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(s.estado).toBe("ERRO");
    expect(s.detalhe).toContain("Application request limit");
    // Limite de cota não é token morto: reconectar não resolveria nada.
    expect(s.exigeReconexao).toBe(false);
  });

  it("um erro ANTIGO com webhook novo depois NÃO é erro — a integração voltou", async () => {
    /*
     * Sem esta comparação de datas, um 429 de anteontem deixaria o cartão
     * vermelho para sempre. E um cartão que está vermelho há três dias é um
     * cartão que ninguém olha mais.
     */
    semear("crc_canais_meta", [
      canal({
        ultimo_webhook_em: horasAtras(1),
        ultimo_erro: "(#4) limite",
        ultimo_erro_em: horasAtras(30),
      }),
    ]);

    expect((await lerSaudeDaMeta(ORG, null, AGORA)).estado).toBe("CONECTADO");
  });
});

describe("a fila", () => {
  it("webhook FALHOU vira ATENCAO, mesmo com tudo mais em ordem", async () => {
    semear("crc_canais_meta", [canal()]);
    semear("crc_webhook_inbox", [
      { id: "in-1", organization_id: ORG, provedor: "meta", status: "FALHOU", external_id: "k1" },
      { id: "in-2", organization_id: ORG, provedor: "meta", status: "PENDENTE", external_id: "k2" },
    ]);

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(s.estado).toBe("ATENCAO");
    expect(s.detalhe).toContain("não foram aplicados");
    expect(sinal(s, "fila").valor).toBe("1 pendente(s), 1 com falha");
    expect(sinal(s, "fila").alerta).toBe(true);
  });

  it("a fila do WhatsApp não entra na conta da Meta", async () => {
    // O §36 põe os dois provedores na MESMA fila. Contar sem filtrar por
    // `provedor` faria o cartão da Meta ficar amarelo por causa do WhatsApp.
    semear("crc_canais_meta", [canal()]);
    semear("crc_webhook_inbox", [
      {
        id: "in-w",
        organization_id: ORG,
        provedor: "whatsapp",
        status: "FALHOU",
        external_id: "kw",
      },
    ]);

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(s.estado).toBe("CONECTADO");
    expect(sinal(s, "fila").valor).toBe("0 pendente(s), 0 com falha");
  });

  it("dead letter pendente vira ATENCAO", async () => {
    semear("crc_canais_meta", [canal()]);
    semear("crc_dead_letters", [
      {
        id: "dl-1",
        organization_id: ORG,
        origem: "webhook",
        status: "PENDENTE",
        erro: "esgotou as tentativas",
      },
    ]);

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(s.estado).toBe("ATENCAO");
    expect(sinal(s, "dlq").alerta).toBe(true);
  });
});

describe("as falhas de chamada nas últimas 24h", () => {
  function logs(quantos: number, integracao: string, horas: number) {
    return Array.from({ length: quantos }, (_v, i) => ({
      id: `log-${integracao}-${String(i)}`,
      organization_id: ORG,
      integracao,
      operacao: "postar",
      sucesso: false,
      criado_em: horasAtras(horas),
    }));
  }

  it("três ou mais viram ATENCAO", async () => {
    semear("crc_canais_meta", [canal()]);
    semear("crc_integration_logs", logs(3, "meta_instagram", 2));

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(s.estado).toBe("ATENCAO");
    expect(s.detalhe).toContain("3 falhas");
    expect(sinal(s, "erros").alerta).toBe(true);
  });

  it("duas não — uma falha isolada é ruído de rede", async () => {
    semear("crc_canais_meta", [canal()]);
    semear("crc_integration_logs", logs(2, "meta_instagram", 2));

    expect((await lerSaudeDaMeta(ORG, null, AGORA)).estado).toBe("CONECTADO");
  });

  it("só conta integração `meta_*` — o Dental Office tem cartão próprio", async () => {
    semear("crc_canais_meta", [canal()]);
    semear("crc_integration_logs", logs(9, "dental_office", 2));

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(s.estado).toBe("CONECTADO");
    expect(sinal(s, "erros").valor).toBe("0");
  });

  it("falha de 30h atrás não conta — a janela é de 24h", async () => {
    semear("crc_canais_meta", [canal()]);
    semear("crc_integration_logs", logs(9, "meta_lead_ads", 30));

    expect((await lerSaudeDaMeta(ORG, null, AGORA)).estado).toBe("CONECTADO");
  });
});

describe("os eventos sociais ignorados", () => {
  it("são MEDIDOS e mostrados, mas não pintam o cartão de amarelo", async () => {
    /*
     * ==========================================================================
     *  IGNORADO É SINAL, E NÃO ESTATÍSTICA — §61.
     *
     *  Um comentário que nenhuma regra casa é `IGNORADO`, e é o comportamento
     *  certo: a maioria dos comentários não pede private reply.
     *
     *  Mas um NÚMERO ALTO no dia em que a clínica publicou campanha significa
     *  que a regra não está casando — e sem este número ninguém descobre: não
     *  há erro, não há falha, só silêncio. Por isso ele aparece na tela sem
     *  ser alerta: quem olha o cartão decide se 40 é muito.
     * ==========================================================================
     */
    semear("crc_canais_meta", [canal()]);
    semear(
      "crc_social_events",
      Array.from({ length: 4 }, (_v, i) => ({
        id: `ev-${String(i)}`,
        organization_id: ORG,
        clinic_id: CLINICA,
        provider: "meta",
        canal: "instagram",
        event_type: "instagram.comment.created",
        external_event_id: `c-${String(i)}`,
        processing_status: "IGNORADO",
        recebido_em: horasAtras(2),
      })),
    );

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(s.estado).toBe("CONECTADO");
    expect(sinal(s, "ignorados").valor).toBe("4");
    expect(sinal(s, "ignorados").alerta).toBe(false);
  });
});

describe("duas contas", () => {
  it("o PIOR canal decide o cartão, e não a média", async () => {
    /*
     * ==========================================================================
     *  Uma conta saudável e uma com token morto não é "metade funcionando": é
     *  uma clínica inteira sem Instagram. A média esconderia exatamente o caso
     *  em que alguém precisa agir.
     * ==========================================================================
     */
    semear("crc_canais_meta", [
      canal({ id: "canal-ok", clinic_id: CLINICA, token_expira_em: emDias(45) }),
      canal({
        id: "canal-morto",
        clinic_id: CLINICA_2,
        page_id: "104000000000003",
        instagram_account_id: "17841400000000299",
        token_expira_em: emDias(-2),
        criado_em: "2026-09-02T00:00:00.000Z",
      }),
    ]);

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(s.estado).toBe("ERRO");
    expect(s.exigeReconexao).toBe(true);
  });

  it("o sinal de data é o MAIS RECENTE das duas — é o que prova que chega algo", async () => {
    semear("crc_canais_meta", [
      canal({ id: "canal-1", ultimo_webhook_em: horasAtras(70) }),
      canal({
        id: "canal-2",
        clinic_id: CLINICA_2,
        page_id: "104000000000003",
        instagram_account_id: "17841400000000299",
        ultimo_webhook_em: horasAtras(1),
        criado_em: "2026-09-02T00:00:00.000Z",
      }),
    ]);

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(s.estado).toBe("CONECTADO");
    expect(sinal(s, "ultimo_webhook").valor).toBe("há 1 h");
  });

  it("filtrando por UMA unidade, a conta da outra sai da conta", async () => {
    semear("crc_canais_meta", [
      canal({ id: "canal-1", clinic_id: CLINICA }),
      canal({
        id: "canal-morto",
        clinic_id: CLINICA_2,
        page_id: "104000000000003",
        instagram_account_id: "17841400000000299",
        token_expira_em: emDias(-2),
        criado_em: "2026-09-02T00:00:00.000Z",
      }),
    ]);

    // Quem só administra a matriz vê a matriz. O token morto da outra unidade
    // não é problema dele — e mostrá-lo faria o cartão pedir uma ação que essa
    // pessoa não tem como executar.
    expect((await lerSaudeDaMeta(ORG, [CLINICA], AGORA)).estado).toBe("CONECTADO");
    expect((await lerSaudeDaMeta(ORG, [CLINICA_2], AGORA)).estado).toBe("ERRO");
  });
});

describe("o isolamento entre organizações", () => {
  it("a organização B não muda o cartão da A", async () => {
    semear("crc_canais_meta", [
      canal(),
      canal({
        id: "canal-da-b",
        organization_id: ORG_B,
        clinic_id: CLINICA_2,
        page_id: "104000000000009",
        instagram_account_id: "17841400000000999",
        token_expira_em: emDias(-9),
        criado_em: "2026-09-02T00:00:00.000Z",
      }),
    ]);
    semear("crc_webhook_inbox", [
      {
        id: "in-b",
        organization_id: ORG_B,
        provedor: "meta",
        status: "FALHOU",
        external_id: "kb",
      },
    ]);

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(s.estado).toBe("CONECTADO");
    expect(sinal(s, "fila").valor).toBe("0 pendente(s), 0 com falha");
  });
});

describe("CONECTADO", () => {
  it("exige FATO DATADO, e o detalhe traz a data em linguagem humana", async () => {
    semear("crc_canais_meta", [
      canal({ ultimo_webhook_em: horasAtras(3), ultima_mensagem_em: horasAtras(4) }),
    ]);

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(s.estado).toBe("CONECTADO");
    // Nunca só o nome do estado: a frase é o que permite conferir se é verdade.
    expect(s.detalhe).toContain("há 3 h");
    expect(s.detalhe).toContain("sem falhas pendentes");
    expect(s.sinais).toHaveLength(9);
    expect(sinal(s, "configuracao").valor).toContain("as três");
  });

  it("menos de uma hora é contado em minutos, e não arredondado para zero", async () => {
    semear("crc_canais_meta", [canal({ ultimo_webhook_em: horasAtras(0.25) })]);

    const s = await lerSaudeDaMeta(ORG, null, AGORA);

    expect(sinal(s, "ultimo_webhook").valor).toBe("há 15 min");
  });

  it("um lead que nunca veio aparece como `nunca`, e não como zero", async () => {
    // "0" pareceria uma medição; "nunca" é o que realmente se sabe.
    semear("crc_canais_meta", [canal({ ultimo_lead_em: null })]);

    expect(sinal(await lerSaudeDaMeta(ORG, null, AGORA), "ultimo_lead").valor).toBe("nunca");
  });
});
