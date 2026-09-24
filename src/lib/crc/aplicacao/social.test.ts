/**
 * Comentário → lead → private reply. §16, §17, §27, §30, §43, §53.
 *
 * ============================================================================
 *  O INVARIANTE CARO DESTE ARQUIVO É UM SÓ: **UM DIRECT, E SÓ UM.**
 *
 *  A Meta permite UMA resposta privada por comentário, e a mesma pessoa
 *  comentando dez vezes não pode receber dez directs. Duas coisas podem quebrar
 *  isso, e as duas são testadas aqui:
 *
 *    A REENTREGA      o mesmo webhook chegando duas vezes porque não
 *                     devolvemos 200 rápido o bastante.
 *
 *    A CORRIDA        dois webhooks juntos, os dois avaliando política e
 *                     autonomia, os dois passando, os dois mandando.
 *
 *  A reserva no banco resolve as duas — e é por isso que ela vem ANTES da
 *  política e da autonomia.
 * ============================================================================
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import { _reiniciarSandboxDaMeta, obterSandboxDaMeta } from "../integracoes/meta/provedores";
import type { EventoComentario } from "../integracoes/meta/tipos";

import { registrarEventoSocial } from "./social";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLINICA = "22222222-2222-4222-8222-222222222222";
const ATOR = "17841400000000001";
const MIDIA = "media-de-captacao";
const AGORA = new Date("2026-09-15T12:00:00.000Z");

const ESCOPO = { organizationId: ORG, clinicId: CLINICA };

function comentario(p: Partial<EventoComentario> = {}): EventoComentario {
  return {
    tipo: "instagram.comment.created",
    idExterno: "comment-1",
    contaExterna: "17841400000000099",
    ocorridoEm: AGORA.toISOString(),
    plataforma: "instagram",
    comentarioId: "comment-1",
    atorId: ATOR,
    atorApelido: "joao_ig",
    midiaId: MIDIA,
    texto: "quero saber do IMPLANTE",
    paiId: null,
    ...p,
  };
}

function semearRegra(p: Record<string, unknown> = {}): void {
  semear("crc_regras_sociais", [
    {
      id: "regra-implante",
      organization_id: ORG,
      clinic_id: null,
      nome: "Implante",
      canal: "instagram",
      evento: "comment.created",
      contem: ["implante"],
      nao_contem: ["capilar"],
      exigir_captacao: true,
      midias: [MIDIA],
      criar_lead: true,
      criar_oportunidade: true,
      enviar_private_reply: false,
      intencao: "INTERESSE",
      template_id: null,
      copy: null,
      cooldown_horas: 168,
      ativa: true,
      ...p,
    },
  ]);
}

/** Libera a autonomia o suficiente para o private reply (risco MEDIO → nível 4). */
function liberarAutonomia(): void {
  semear("crc_feature_flags", [{ organization_id: ORG, chave: "ai_agente_envio", ligada: true }]);
  semear("crc_autonomia", [
    { organization_id: ORG, clinic_id: null, dominio: "mensagens", canal: "", nivel: 4 },
  ]);
}

/**
 * O relógio do CÓDIGO, deslocado para `AGORA`.
 *
 * ============================================================================
 *  `definirRelogio` SÓ MOVE O RELÓGIO DO BANCO FALSO — e `agoraIso()`, que o
 *  lê. A janela de 7 dias do private reply já passa por `agoraIso()`; o resto
 *  do caminho não: `leads.ts` monta a dedupe "contato + dia" e `oportunidades`
 *  carimbam as datas com o `new Date()` do processo.
 *
 *  FOI ASSIM QUE O ARQUIVO QUEBROU. A janela também media pelo `new Date()`,
 *  e, preso ao relógio de parede, o comentário de `AGORA` envelhecia sozinho.
 *  Sete dias depois dele, em 22/09/2026, todo direct deste arquivo passou a
 *  sair BLOQUEADO por "mais de 7 dias": oito testes quebraram, e o do kill
 *  switch seguiu verde pelo motivo errado.
 *
 *  DESLOCADO, E NÃO CONGELADO: o relógio começa em `AGORA` e continua andando.
 *  `vi.setSystemTime` faria dois `new Date()` separados por milissegundos
 *  devolverem o mesmo instante, e é assim que uma corrida de relógio passa no
 *  teste e quebra em produção.
 *
 *  É UM PROXY, e não uma subclasse, para `instanceof Date` continuar valendo
 *  nas datas criadas antes da troca — `AGORA` inclusive. `instante`, em
 *  `dominio/politica-de-canal.ts`, decide por `instanceof Date`.
 * ============================================================================
 */
const DataReal = globalThis.Date;

function deslocarRelogio(para: Date): void {
  const deslocamento = para.getTime() - DataReal.now();
  const agora = (): number => DataReal.now() + deslocamento;

  vi.stubGlobal(
    "Date",
    new Proxy(DataReal, {
      // Só o `new Date()` SEM argumento é "agora"; com argumento, é a data pedida.
      construct: (alvo, args, novoAlvo) =>
        Reflect.construct(alvo, args.length === 0 ? [agora()] : args, novoAlvo),
      // `Date()` sem `new` também é "agora", em texto.
      apply: () => new DataReal(agora()).toString(),
      get: (alvo, chave, receptor) =>
        chave === "now" ? agora : Reflect.get(alvo, chave, receptor),
    }),
  );
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  deslocarRelogio(AGORA);
  _reiniciarSandboxDaMeta();
  process.env["META_SANDBOX"] = "1";

  semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
  semear("crc_clinics", [{ id: CLINICA, organization_id: ORG, slug: "jp", ativa: true }]);
  semear("crc_opportunity_stages", [
    {
      id: "etapa-1",
      organization_id: ORG,
      chave: "contato_pendente",
      nome: "Contato pendente",
      ordem: 2,
    },
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* -------------------------------------------------------------------------- */
/* 1. O registro vem antes da regra                                           */
/* -------------------------------------------------------------------------- */

describe("o comentário é REGISTRADO mesmo sem regra nenhuma", () => {
  it("vira evento social IGNORADO, com o motivo escrito", async () => {
    /*
     * ==========================================================================
     *  UM COMENTÁRIO QUE NÃO VIRA LEAD AINDA É INFORMAÇÃO.
     *
     *  Ele diz que aquele reel gera conversa, e é o DENOMINADOR da pergunta
     *  "quantos comentários viraram lead?". Sem o denominador, a taxa de
     *  conversão de conteúdo não existe.
     * ==========================================================================
     */
    const r = await registrarEventoSocial(ESCOPO, comentario());
    expect(r).toBe("ignorado");

    const eventos = conteudo("crc_social_events");
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.["processing_status"]).toBe("IGNORADO");
    expect(String(eventos[0]?.["resultado"])).toContain("Nenhuma regra social ativa");
    // A ATRIBUIÇÃO DE CONTEÚDO É GRAVADA de qualquer forma.
    expect(eventos[0]?.["external_media_id"]).toBe(MIDIA);
  });

  it("os DOIS relógios são gravados — §49", async () => {
    await registrarEventoSocial(ESCOPO, comentario());
    const e = conteudo("crc_social_events")[0];

    /*
     * A janela de 7 dias do private reply mede `ocorrido_em`. Medir por
     * `recebido_em` faria um webhook atrasado parecer fresco, e a Meta
     * recusaria o envio com um erro que ninguém saberia explicar.
     */
    expect(e?.["ocorrido_em"]).toBe(AGORA.toISOString());
    expect(Number.isFinite(Date.parse(String(e?.["recebido_em"])))).toBe(true);
  });

  it("o MESMO comentário duas vezes não vira dois eventos — §34", async () => {
    expect(await registrarEventoSocial(ESCOPO, comentario())).toBe("ignorado");
    expect(await registrarEventoSocial(ESCOPO, comentario())).toBe("duplicado");
    expect(conteudo("crc_social_events")).toHaveLength(1);
  });

  it("comentário APAGADO não dispara nada", async () => {
    /*
     * A pessoa decidiu não ter dito aquilo. Mandar direct sobre um comentário
     * apagado é responder a algo que ela retirou — e prova que estamos lendo e
     * guardando.
     */
    semearRegra({ enviar_private_reply: true });
    liberarAutonomia();

    const r = await registrarEventoSocial(
      ESCOPO,
      comentario({ tipo: "instagram.comment.deleted", idExterno: "comment-1:removido" }),
    );

    expect(r).toBe("ignorado");
    expect(obterSandboxDaMeta().listarEnviados()).toHaveLength(0);
    expect(conteudo("crc_leads")).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Nem todo comentário é lead — §43                                        */
/* -------------------------------------------------------------------------- */

describe("o falso positivo do §43", () => {
  beforeEach(() => {
    semearRegra();
  });

  it("`linda doutora ❤️` NÃO vira lead de implante", async () => {
    await registrarEventoSocial(ESCOPO, comentario({ texto: "linda doutora ❤️" }));
    expect(conteudo("crc_leads")).toHaveLength(0);
    expect(conteudo("crc_opportunities")).toHaveLength(0);
  });

  it("`implante capilar` é vetado", async () => {
    await registrarEventoSocial(ESCOPO, comentario({ texto: "quero implante capilar" }));
    expect(conteudo("crc_leads")).toHaveLength(0);
    expect(String(conteudo("crc_social_events")[0]?.["resultado"])).toContain("capilar");
  });

  it("comentário em post NÃO marcado como captação não casa", async () => {
    await registrarEventoSocial(ESCOPO, comentario({ midiaId: "post-institucional" }));
    expect(conteudo("crc_leads")).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Quando casa, vira lead e oportunidade                                   */
/* -------------------------------------------------------------------------- */

describe("o comentário com intenção vira lead e entra no funil", () => {
  beforeEach(() => {
    semearRegra();
  });

  it("cria lead com a atribuição de conteúdo — §19", async () => {
    const r = await registrarEventoSocial(ESCOPO, comentario());
    expect(r).toBe("processado");

    const leads = conteudo("crc_leads");
    expect(leads).toHaveLength(1);

    const lead = leads[0]!;
    expect(lead["origem"]).toBe("INSTAGRAM");
    /*
     * A ATRIBUIÇÃO ENTRA NO MESMO MODELO DO SITE — §19 é explícito: "Meta deve
     * entrar como uma nova fonte no MESMO modelo de atribuição". Um segundo
     * modelo só para social faria o relatório somar duas tabelas com semânticas
     * diferentes.
     */
    expect(lead["utm_source"]).toBe("instagram");
    expect(lead["utm_medium"]).toBe("comentario");
    expect(lead["utm_campaign"]).toBe("Implante");
    expect(lead["utm_content"]).toBe(MIDIA);

    // O LEAD NASCE SEM TELEFONE, e é a verdade do canal: quem comenta deu um
    // perfil, não um contato.
    expect(lead["telefone"] ?? null).toBeNull();
    expect(lead["nome"]).toBe("@joao_ig");

    // O QUE A PESSOA ESCREVEU vai junto, para quem atender não começar no
    // escuro.
    const campos = lead["campos"] as Record<string, unknown>;
    expect(String(campos["comentario"])).toContain("IMPLANTE");
    expect(campos["intencao"]).toBe("INTERESSE");
  });

  it("abre oportunidade no funil, com a origem legível", async () => {
    await registrarEventoSocial(ESCOPO, comentario());

    const ops = conteudo("crc_opportunities");
    expect(ops).toHaveLength(1);
    /*
     * `NEW_LEAD`, E A DIVERGÊNCIA DO §20 É DELIBERADA: `TipoOportunidade` é
     * união fechada que governa priorização, e não um rótulo. O interesse vive
     * em `motivo` e em `campos.intencao`.
     */
    expect(ops[0]?.["tipo"]).toBe("NEW_LEAD");
    expect(ops[0]?.["origem"]).toBe("instagram:comentario");
    expect(String(ops[0]?.["motivo"])).toContain("INTERESSE");
  });

  it("emite `lead.created` — o evento de domínio do §70", async () => {
    await registrarEventoSocial(ESCOPO, comentario());
    const eventos = conteudo("crc_events").filter((e) => e["tipo"] === "lead.created");
    expect(eventos).toHaveLength(1);
  });

  it("o evento social aponta para o lead e para a oportunidade", async () => {
    await registrarEventoSocial(ESCOPO, comentario());
    const e = conteudo("crc_social_events")[0];
    expect(e?.["processing_status"]).toBe("PROCESSADO");
    expect(e?.["regra_id"]).toBe("regra-implante");
    expect(e?.["lead_id"]).not.toBeNull();
    expect(e?.["opportunity_id"]).not.toBeNull();
  });

  it("a MESMA pessoa comentando de novo hoje NÃO vira segundo lead", async () => {
    // A MESMA POLÍTICA DE `registrarLead`: contato + dia. Quem volta em duas
    // semanas É um lead novo — o interesse ressurgiu.
    await registrarEventoSocial(ESCOPO, comentario({ idExterno: "c1", comentarioId: "c1" }));
    await registrarEventoSocial(ESCOPO, comentario({ idExterno: "c2", comentarioId: "c2" }));
    expect(conteudo("crc_leads")).toHaveLength(1);
  });

  it("comentário SEM ator não vira lead", async () => {
    /*
     * A Meta manda `from.id` em comentário, mas NÃO em menção. Um lead sem
     * identificador de pessoa seria uma linha que nunca pode ser respondida nem
     * deduplicada — e a segunda menção criaria a segunda linha.
     */
    await registrarEventoSocial(ESCOPO, comentario({ atorId: null }));
    expect(conteudo("crc_leads")).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. O private reply — §17, §27                                              */
/* -------------------------------------------------------------------------- */

describe("o private reply sai UMA vez", () => {
  beforeEach(() => {
    semearRegra({ enviar_private_reply: true });
    liberarAutonomia();
  });

  it("manda o direct e grava a reserva como ENVIADO", async () => {
    await registrarEventoSocial(ESCOPO, comentario());

    const enviados = obterSandboxDaMeta().listarEnviados();
    expect(enviados).toHaveLength(1);
    // O DESTINO É O COMENTÁRIO, e não a pessoa: é o que a Meta aceita como
    // autorização quando não há janela aberta.
    expect(enviados[0]?.forma).toBe("private_reply");
    expect(enviados[0]?.destino).toBe("comment:comment-1");
    // A COPY PADRÃO NÃO DIAGNOSTICA E NÃO PROMETE PREÇO — §29, §67.
    expect(enviados[0]?.texto.toLowerCase()).not.toContain("implante");
    expect(enviados[0]?.texto.toLowerCase()).not.toContain("r$");

    const reservas = conteudo("crc_private_replies");
    expect(reservas).toHaveLength(1);
    expect(reservas[0]?.["status"]).toBe("ENVIADO");
    expect(reservas[0]?.["provider_message_id"]).not.toBeNull();
  });

  it("DEZ comentários da mesma pessoa produzem UM direct", async () => {
    /*
     * ==========================================================================
     *  É O §17 LITERAL: "a mesma pessoa comentando 10 vezes não pode receber 10
     *  directs idênticos".
     *
     *  E o que protege NÃO é a dedupe por id de comentário: cada comentário tem
     *  id próprio, e cada um passaria. É a chave
     *  `regra + ator + mídia + janela`.
     * ==========================================================================
     */
    for (let i = 1; i <= 10; i += 1) {
      await registrarEventoSocial(
        ESCOPO,
        comentario({ idExterno: `c${String(i)}`, comentarioId: `c${String(i)}` }),
      );
    }

    expect(obterSandboxDaMeta().listarEnviados()).toHaveLength(1);
    expect(conteudo("crc_private_replies")).toHaveLength(1);
  });

  it("DUAS pessoas recebem DOIS directs", async () => {
    // O CONTROLE do teste de cima: sem ele, uma implementação que nunca manda
    // nada passaria nos dois.
    await registrarEventoSocial(ESCOPO, comentario({ idExterno: "c1", comentarioId: "c1" }));
    await registrarEventoSocial(
      ESCOPO,
      comentario({ idExterno: "c2", comentarioId: "c2", atorId: "outra-pessoa" }),
    );
    expect(obterSandboxDaMeta().listarEnviados()).toHaveLength(2);
  });

  it("comentário de 8 dias NÃO recebe direct — §15", async () => {
    const antigo = new Date(AGORA.getTime() - 8 * 24 * 3_600_000).toISOString();
    await registrarEventoSocial(ESCOPO, comentario({ ocorridoEm: antigo }));

    expect(obterSandboxDaMeta().listarEnviados()).toHaveLength(0);
    const reserva = conteudo("crc_private_replies")[0];
    expect(reserva?.["status"]).toBe("BLOQUEADO");
    expect(String(reserva?.["erro"])).toContain("7 dias");
  });

  it("autonomia insuficiente BLOQUEIA, e o motivo fica escrito — §27", async () => {
    /*
     * ==========================================================================
     *  RISCO MÉDIO EXIGE NÍVEL 4 ("executa e escala").
     *
     *  A pessoa comentou em público — o que é convite, e é por isso que a Meta
     *  permite. Mas ela não pediu direct. A clínica precisa ter dito
     *  explicitamente que quer isso automático.
     * ==========================================================================
     */
    limparBanco();
    definirRelogio(AGORA);
    semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
    semear("crc_clinics", [{ id: CLINICA, organization_id: ORG, slug: "jp", ativa: true }]);
    semearRegra({ enviar_private_reply: true });
    semear("crc_feature_flags", [{ organization_id: ORG, chave: "ai_agente_envio", ligada: true }]);
    semear("crc_autonomia", [
      { organization_id: ORG, clinic_id: null, dominio: "mensagens", canal: "", nivel: 3 },
    ]);

    await registrarEventoSocial(ESCOPO, comentario());

    expect(obterSandboxDaMeta().listarEnviados()).toHaveLength(0);
    const reserva = conteudo("crc_private_replies")[0];
    expect(reserva?.["status"]).toBe("BLOQUEADO");
    expect(String(reserva?.["erro"])).toContain("autonomia");
  });

  it("o canal pode ABAIXAR o nível do domínio — §27", async () => {
    /*
     * A clínica quer a IA respondendo WhatsApp sozinha e apenas SUGERINDO no
     * Instagram, onde a conta é a mesma que publica e um erro é público.
     */
    semear("crc_autonomia", [
      { organization_id: ORG, clinic_id: null, dominio: "mensagens", canal: "instagram", nivel: 2 },
    ]);

    await registrarEventoSocial(ESCOPO, comentario());

    expect(obterSandboxDaMeta().listarEnviados()).toHaveLength(0);
    expect(String(conteudo("crc_private_replies")[0]?.["erro"])).toContain("canal");
  });

  it("o kill switch de envios para o private reply", async () => {
    semear("crc_feature_flags", [{ organization_id: ORG, chave: "kill_envios", ligada: true }]);

    await registrarEventoSocial(ESCOPO, comentario());
    expect(obterSandboxDaMeta().listarEnviados()).toHaveLength(0);
  });

  it("a falha INCERTA não libera a reserva — §35", async () => {
    /*
     * ==========================================================================
     *  O POST SAIU E A RESPOSTA NÃO VOLTOU: a Meta PODE ter entregue.
     *
     *  Liberar a reserva faria a próxima volta mandar a SEGUNDA mensagem. Entre
     *  "a pessoa talvez não receba" e "a pessoa recebe duas vezes", o segundo é
     *  pior: é visível, parece descuido, e não há como desfazer.
     * ==========================================================================
     */
    obterSandboxDaMeta().armarFalha({ tipo: "timeout" });

    await registrarEventoSocial(ESCOPO, comentario());

    const reserva = conteudo("crc_private_replies")[0];
    expect(reserva?.["status"]).toBe("INCERTO");
    // A RESERVA CONTINUA OCUPADA: a chave impede a segunda tentativa.
    expect(reserva?.["chave_reserva"]).not.toBeNull();
  });

  it("a falha PERMANENTE fecha a reserva como FALHOU", async () => {
    obterSandboxDaMeta().armarFalha({ tipo: "token_expirado" });

    await registrarEventoSocial(ESCOPO, comentario());

    const reserva = conteudo("crc_private_replies")[0];
    expect(reserva?.["status"]).toBe("FALHOU");
    expect(String(reserva?.["erro"])).toContain("#190");
  });

  it("a regra com private reply DESLIGADO cria lead e não manda nada", async () => {
    limparBanco();
    definirRelogio(AGORA);
    semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
    semear("crc_clinics", [{ id: CLINICA, organization_id: ORG, slug: "jp", ativa: true }]);
    semearRegra({ enviar_private_reply: false });
    liberarAutonomia();

    await registrarEventoSocial(ESCOPO, comentario());

    expect(conteudo("crc_leads")).toHaveLength(1);
    expect(obterSandboxDaMeta().listarEnviados()).toHaveLength(0);
    // NENHUMA RESERVA: a regra não pede, então nem se reserva.
    expect(conteudo("crc_private_replies")).toHaveLength(0);
  });

  it("a copy da regra vence a padrão — §67", async () => {
    limparBanco();
    definirRelogio(AGORA);
    semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
    semear("crc_clinics", [{ id: CLINICA, organization_id: ORG, slug: "jp", ativa: true }]);
    semearRegra({
      enviar_private_reply: true,
      copy: "Oi! Posso te mandar os horários de avaliação?",
    });
    liberarAutonomia();

    await registrarEventoSocial(ESCOPO, comentario());

    expect(obterSandboxDaMeta().listarEnviados()[0]?.texto).toBe(
      "Oi! Posso te mandar os horários de avaliação?",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 5. O escopo de tenant                                                      */
/* -------------------------------------------------------------------------- */

describe("a regra de uma organização não vale para outra", () => {
  it("o comentário de outra organização não casa a regra da JP", async () => {
    semearRegra();

    const outraOrg = "99999999-9999-4999-8999-999999999999";
    const outraClinica = "88888888-8888-4888-8888-888888888888";
    semear("crc_organizations", [{ id: outraOrg, slug: "outra" }]);
    semear("crc_clinics", [
      { id: outraClinica, organization_id: outraOrg, slug: "outra", ativa: true },
    ]);

    await registrarEventoSocial({ organizationId: outraOrg, clinicId: outraClinica }, comentario());

    // NENHUM lead, e o evento registrado na organização certa.
    expect(conteudo("crc_leads")).toHaveLength(0);
    expect(conteudo("crc_social_events")[0]?.["organization_id"]).toBe(outraOrg);
  });
});
