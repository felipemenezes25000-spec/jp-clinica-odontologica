/**
 * A identidade com namespace — §10, §25, §52.
 *
 * ============================================================================
 *  A COLISÃO QUE ESTE ARQUIVO TRAVA É SILENCIOSA E IRREVERSÍVEL.
 *
 *  Antes do `supabase/45`, `crc_patient_identities` guardava `(tipo, valor)` — e
 *  `EXTERNAL_ID` significava, por convenção NÃO ESCRITA, "id do paciente no
 *  Dental Office". O Dental Office numera pacientes com inteiros pequenos.
 *
 *  O Instagram também emite identificadores numéricos. O Messenger também.
 *
 *      EXTERNAL_ID / 123     ← o paciente 123 do prontuário
 *      EXTERNAL_ID / 123     ← o IGSID de quem mandou um direct
 *
 *  A MESMA LINHA. E a resolução devolveria `UNICO` com confiança total: do
 *  ponto de vista da tabela não existe ambiguidade — é um valor, um paciente. O
 *  mecanismo de `compartilhada` nem dispara.
 *
 *  O direct de um estranho entra no prontuário comercial de um paciente. E não
 *  há como descobrir depois: a informação que separava os dois nunca foi
 *  gravada.
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

import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import {
  forcaDoIdentificador,
  NAMESPACE_DO_PRONTUARIO,
  normalizarNamespace,
  resolver,
  type Candidato,
} from "../dominio/identidade";

import { quemE, quemEPerfilDaMeta, registrarIdentidade } from "./omnichannel";
import { desvincularPerfil, vincularPerfilAoPaciente } from "./meta";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLINICA = "22222222-2222-4222-8222-222222222222";
const AGORA = new Date("2026-09-15T12:00:00.000Z");

/** O número que colide: existe no Dental Office E parece um IGSID curto. */
const COLIDENTE = "123";

const PACIENTE_DO_PRONTUARIO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PACIENTE_DO_INSTAGRAM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);

  semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
  semear("crc_clinics", [{ id: CLINICA, organization_id: ORG, slug: "jp", ativa: true }]);
  semear("crc_patients", [
    {
      id: PACIENTE_DO_PRONTUARIO,
      organization_id: ORG,
      clinic_id: CLINICA,
      nome: "Ana do Prontuário",
      ativo: true,
      arquivado: false,
    },
    {
      id: PACIENTE_DO_INSTAGRAM,
      organization_id: ORG,
      clinic_id: CLINICA,
      nome: "Carlos do Instagram",
      ativo: true,
      arquivado: false,
    },
  ]);
});

/* -------------------------------------------------------------------------- */
/* 1. O namespace é parte da CHAVE                                            */
/* -------------------------------------------------------------------------- */

describe("o IGSID NÃO colide com o id do Dental Office — §10", () => {
  it("o MESMO valor em namespaces diferentes são DUAS identidades", async () => {
    expect(
      await registrarIdentidade(
        ORG,
        PACIENTE_DO_PRONTUARIO,
        "EXTERNAL_ID",
        COLIDENTE,
        NAMESPACE_DO_PRONTUARIO,
      ),
    ).toBe(true);

    expect(
      await registrarIdentidade(ORG, PACIENTE_DO_INSTAGRAM, "EXTERNAL_ID", COLIDENTE, "instagram"),
    ).toBe(true);

    const linhas = conteudo("crc_patient_identities");
    expect(linhas).toHaveLength(2);

    /*
     * ==========================================================================
     *  E NENHUMA FOI MARCADA COMO COMPARTILHADA.
     *
     *  Sem o namespace no filtro, a segunda gravação acharia a primeira como
     *  "de outra pessoa" e marcaria AS DUAS como compartilhadas — o que
     *  quebraria a resolução de AMBAS: `resolver()` recusa decidir quando o
     *  identificador é compartilhado.
     *
     *  O resultado seria uma conversa de Instagram e um paciente do prontuário,
     *  os dois em revisão pendente para sempre, por uma coincidência numérica.
     * ==========================================================================
     */
    expect(linhas.every((l) => l["compartilhada"] === false)).toBe(true);
  });

  it("a resolução devolve o paciente DE CADA namespace", async () => {
    await registrarIdentidade(
      ORG,
      PACIENTE_DO_PRONTUARIO,
      "EXTERNAL_ID",
      COLIDENTE,
      NAMESPACE_DO_PRONTUARIO,
    );
    await registrarIdentidade(ORG, PACIENTE_DO_INSTAGRAM, "EXTERNAL_ID", COLIDENTE, "instagram");

    const doProntuario = await quemE(ORG, "EXTERNAL_ID", COLIDENTE, NAMESPACE_DO_PRONTUARIO);
    expect(doProntuario.tipo).toBe("UNICO");
    if (doProntuario.tipo === "UNICO") expect(doProntuario.patientId).toBe(PACIENTE_DO_PRONTUARIO);

    const doInstagram = await quemEPerfilDaMeta(ORG, "instagram", COLIDENTE);
    expect(doInstagram.tipo).toBe("UNICO");
    if (doInstagram.tipo === "UNICO") expect(doInstagram.patientId).toBe(PACIENTE_DO_INSTAGRAM);
  });

  it("o PSID não colide com o IGSID", async () => {
    await registrarIdentidade(ORG, PACIENTE_DO_PRONTUARIO, "EXTERNAL_ID", COLIDENTE, "instagram");
    await registrarIdentidade(ORG, PACIENTE_DO_INSTAGRAM, "EXTERNAL_ID", COLIDENTE, "messenger");

    const ig = await quemEPerfilDaMeta(ORG, "instagram", COLIDENTE);
    const fb = await quemEPerfilDaMeta(ORG, "messenger", COLIDENTE);

    expect(ig.tipo).toBe("UNICO");
    expect(fb.tipo).toBe("UNICO");
    if (ig.tipo === "UNICO" && fb.tipo === "UNICO") {
      expect(ig.patientId).not.toBe(fb.patientId);
    }
  });

  it("`EXTERNAL_ID` SEM namespace é RECUSADO na gravação", async () => {
    /*
     * ==========================================================================
     *  A RECUSA É O QUE TORNA A COLISÃO IMPOSSÍVEL, e não só improvável.
     *
     *  Um `EXTERNAL_ID` sem origem declarada é exatamente o estado que causava o
     *  problema. Aceitá-lo "por compatibilidade" deixaria a porta aberta para o
     *  próximo chamador que esquecesse o namespace.
     * ==========================================================================
     */
    expect(await registrarIdentidade(ORG, PACIENTE_DO_PRONTUARIO, "EXTERNAL_ID", COLIDENTE)).toBe(
      false,
    );
    expect(conteudo("crc_patient_identities")).toHaveLength(0);
  });

  it("`EXTERNAL_ID` sem namespace NÃO resolve — devolve NENHUM com motivo", async () => {
    await registrarIdentidade(
      ORG,
      PACIENTE_DO_PRONTUARIO,
      "EXTERNAL_ID",
      COLIDENTE,
      NAMESPACE_DO_PRONTUARIO,
    );

    const r = await quemE(ORG, "EXTERNAL_ID", COLIDENTE);
    /*
     * BUSCAR SEM FILTRAR NAMESPACE devolveria os pacientes de TODOS os sistemas
     * que têm aquele número — que É a colisão. `NENHUM` é a resposta honesta.
     */
    expect(r.tipo).toBe("NENHUM");
    expect(r.porque).toContain("namespace");
  });
});

/* -------------------------------------------------------------------------- */
/* 2. O telefone continua GLOBAL                                              */
/* -------------------------------------------------------------------------- */

describe("telefone, e-mail e CPF NÃO têm namespace", () => {
  it("o telefone é gravado e resolvido sem namespace", async () => {
    /*
     * ==========================================================================
     *  E ISSO É DELIBERADO: `11999990000` é o MESMO número em qualquer sistema.
     *
     *  Namespeá-lo quebraria o cruzamento que a tabela existe para fazer — o
     *  telefone vindo do Dental Office deixaria de casar com o telefone digitado
     *  no site.
     * ==========================================================================
     */
    expect(
      await registrarIdentidade(ORG, PACIENTE_DO_PRONTUARIO, "TELEFONE", "(11) 99999-0000"),
    ).toBe(true);

    const r = await quemE(ORG, "TELEFONE", "11999990000");
    expect(r.tipo).toBe("UNICO");
  });

  it("namespace num tipo GLOBAL é recusado", async () => {
    /*
     * Engolir o valor faria a linha nascer fora do alcance da busca — o pior
     * desfecho: gravada, e invisível.
     */
    expect(
      await registrarIdentidade(
        ORG,
        PACIENTE_DO_PRONTUARIO,
        "TELEFONE",
        "11999990000",
        "instagram",
      ),
    ).toBe(false);
    expect(conteudo("crc_patient_identities")).toHaveLength(0);
  });

  it("o telefone de FAMÍLIA continua ambíguo", async () => {
    // O caso que a resolução de identidade existe para tratar — e o namespace
    // não muda nada nele.
    await registrarIdentidade(ORG, PACIENTE_DO_PRONTUARIO, "TELEFONE", "11999990000");
    await registrarIdentidade(ORG, PACIENTE_DO_INSTAGRAM, "TELEFONE", "11999990000");

    const r = await quemE(ORG, "TELEFONE", "11999990000");
    expect(r.tipo).toBe("AMBIGUO");
  });
});

describe("a normalização de namespace", () => {
  it("exige namespace em EXTERNAL_ID e o recusa nos outros", () => {
    expect(normalizarNamespace("EXTERNAL_ID", "instagram")).toBe("instagram");
    expect(normalizarNamespace("EXTERNAL_ID", "")).toBeNull();
    expect(normalizarNamespace("TELEFONE", "")).toBe("");
    expect(normalizarNamespace("TELEFONE", "instagram")).toBeNull();
  });

  it("normaliza a caixa e recusa caractere que quebraria log e chave", () => {
    expect(normalizarNamespace("EXTERNAL_ID", "  Instagram  ")).toBe("instagram");
    // `:` e `|` aparecem em chave de dedupe e em log estruturado.
    expect(normalizarNamespace("EXTERNAL_ID", "insta:gram")).toBeNull();
    expect(normalizarNamespace("EXTERNAL_ID", "insta|gram")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* 3. A força: o prontuário vence o perfil social                             */
/* -------------------------------------------------------------------------- */

describe("entre dois ids externos, o namespace desempata", () => {
  it("o id do Dental Office vale mais que um IGSID", () => {
    /*
     * ==========================================================================
     *  O id do Dental Office É o prontuário: o paciente existe porque aquela
     *  linha existe. Um IGSID identifica com certeza um PERFIL, e o vínculo
     *  perfil↔paciente é uma AFIRMAÇÃO que alguém fez.
     *
     *  Empatados, `resolver()` devolveria `AMBIGUO` e pararia a operação. Com o
     *  prontuário na frente, ele resolve pela fonte de verdade sobre quem é
     *  paciente, e o vínculo social pode ser corrigido à mão depois.
     * ==========================================================================
     */
    expect(forcaDoIdentificador("EXTERNAL_ID", NAMESPACE_DO_PRONTUARIO)).toBeGreaterThan(
      forcaDoIdentificador("EXTERNAL_ID", "instagram"),
    );
  });

  it("a resolução escolhe o do prontuário", () => {
    const candidatos: Candidato[] = [
      {
        patientId: "do-instagram",
        nome: "Carlos",
        porQual: "EXTERNAL_ID",
        namespace: "instagram",
        compartilhado: false,
        confirmado: false,
      },
      {
        patientId: "do-prontuario",
        nome: "Ana",
        porQual: "EXTERNAL_ID",
        namespace: NAMESPACE_DO_PRONTUARIO,
        compartilhado: false,
        confirmado: false,
      },
    ];

    const r = resolver(candidatos);
    expect(r.tipo).toBe("UNICO");
    if (r.tipo === "UNICO") expect(r.patientId).toBe("do-prontuario");
    // A FRASE DIZ QUAL FOI, e é o que permite alguém conferir.
    expect(r.porque).toContain("sistema da clínica");
  });

  it("o rótulo do perfil social é legível na explicação", () => {
    const r = resolver([
      {
        patientId: "p",
        nome: "Carlos",
        porQual: "EXTERNAL_ID",
        namespace: "instagram",
        compartilhado: false,
        confirmado: false,
      },
    ]);
    expect(r.porque).toContain("perfil do Instagram");
  });

  it("confirmado à mão continua vencendo tudo", () => {
    const r = resolver([
      {
        patientId: "inferido",
        nome: "Ana",
        porQual: "EXTERNAL_ID",
        namespace: NAMESPACE_DO_PRONTUARIO,
        compartilhado: false,
        confirmado: false,
      },
      {
        patientId: "confirmado",
        nome: "Carlos",
        porQual: "EXTERNAL_ID",
        namespace: "instagram",
        compartilhado: false,
        confirmado: true,
      },
    ]);
    expect(r.tipo).toBe("UNICO");
    if (r.tipo === "UNICO") expect(r.patientId).toBe("confirmado");
  });
});

/* -------------------------------------------------------------------------- */
/* 4. O vínculo e o desvínculo — §25                                          */
/* -------------------------------------------------------------------------- */

describe("vincular e desvincular um perfil — §25, §63", () => {
  const CONVERSA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const IGSID = "17841400000000001";

  beforeEach(() => {
    semear("crc_conversations", [
      {
        id: CONVERSA,
        organization_id: ORG,
        clinic_id: CLINICA,
        patient_id: null,
        canal: "instagram",
        contato_externo: IGSID,
        status: "ABERTA",
        revisao_pendente: false,
      },
    ]);
    semear("crc_messages", [
      {
        id: "msg-1",
        organization_id: ORG,
        conversation_id: CONVERSA,
        patient_id: null,
        direcao: "ENTRADA",
        remetente: "paciente",
        conteudo: "oi",
        status_entrega: "DELIVERED",
      },
    ]);
  });

  it("o vínculo grava a identidade COM namespace e propaga para as mensagens", async () => {
    await vincularPerfilAoPaciente({
      organizationId: ORG,
      canal: "instagram",
      contatoExterno: IGSID,
      patientId: PACIENTE_DO_PRONTUARIO,
      conversationId: CONVERSA,
      userId: "user-1",
      motivo: "Confirmado na Inbox.",
    });

    const identidade = conteudo("crc_patient_identities")[0];
    expect(identidade?.["tipo"]).toBe("EXTERNAL_ID");
    expect(identidade?.["namespace"]).toBe("instagram");
    expect(identidade?.["valor"]).toBe(IGSID);

    const conversa = conteudo("crc_conversations")[0];
    expect(conversa?.["patient_id"]).toBe(PACIENTE_DO_PRONTUARIO);

    /*
     * AS MENSAGENS JÁ RECEBIDAS TAMBÉM. Sem este passo, o histórico do paciente
     * começaria vazio justamente na conversa que motivou o vínculo — é a mesma
     * razão de `vincularConversaAoPaciente` atualizar `crc_messages`.
     */
    expect(conteudo("crc_messages")[0]?.["patient_id"]).toBe(PACIENTE_DO_PRONTUARIO);
  });

  it("o desvínculo apaga a identidade e devolve a conversa para revisão", async () => {
    await vincularPerfilAoPaciente({
      organizationId: ORG,
      canal: "instagram",
      contatoExterno: IGSID,
      patientId: PACIENTE_DO_PRONTUARIO,
      conversationId: CONVERSA,
      userId: "user-1",
      motivo: "Confirmado na Inbox.",
    });

    await desvincularPerfil({
      organizationId: ORG,
      canal: "instagram",
      contatoExterno: IGSID,
      patientId: PACIENTE_DO_PRONTUARIO,
      conversationId: CONVERSA,
      userId: "user-1",
    });

    expect(conteudo("crc_patient_identities")).toHaveLength(0);

    const conversa = conteudo("crc_conversations")[0];
    expect(conversa?.["patient_id"] ?? null).toBeNull();
    // VOLTA PARA REVISÃO: alguém precisa dizer de quem é.
    expect(conversa?.["revisao_pendente"]).toBe(true);

    /*
     * E AS MENSAGENS PERDEM O PACIENTE TAMBÉM. Deixá-las apontando manteria a
     * conversa no Patient 360 de quem não é — que é exatamente o estrago que o
     * desvínculo existe para reparar.
     */
    expect(conteudo("crc_messages")[0]?.["patient_id"] ?? null).toBeNull();
  });

  it("o desvínculo NÃO toca a identidade de outro namespace", async () => {
    await registrarIdentidade(
      ORG,
      PACIENTE_DO_PRONTUARIO,
      "EXTERNAL_ID",
      IGSID,
      NAMESPACE_DO_PRONTUARIO,
    );
    await vincularPerfilAoPaciente({
      organizationId: ORG,
      canal: "instagram",
      contatoExterno: IGSID,
      patientId: PACIENTE_DO_PRONTUARIO,
      conversationId: CONVERSA,
      userId: null,
      motivo: "teste",
    });

    expect(conteudo("crc_patient_identities")).toHaveLength(2);

    await desvincularPerfil({
      organizationId: ORG,
      canal: "instagram",
      contatoExterno: IGSID,
      patientId: PACIENTE_DO_PRONTUARIO,
      conversationId: CONVERSA,
      userId: null,
    });

    // SOBROU A DO PRONTUÁRIO. Um `delete` sem namespace apagaria as duas — e a
    // do prontuário é o vínculo com o sistema da clínica.
    const restantes = conteudo("crc_patient_identities");
    expect(restantes).toHaveLength(1);
    expect(restantes[0]?.["namespace"]).toBe(NAMESPACE_DO_PRONTUARIO);
  });
});

/* -------------------------------------------------------------------------- */
/* 5. O tenant                                                                */
/* -------------------------------------------------------------------------- */

describe("a identidade não atravessa a fronteira da organização", () => {
  it("o mesmo IGSID em outra organização não resolve", async () => {
    await registrarIdentidade(ORG, PACIENTE_DO_PRONTUARIO, "EXTERNAL_ID", "999", "instagram");

    const outra = "99999999-9999-4999-8999-999999999999";
    expect((await quemEPerfilDaMeta(outra, "instagram", "999")).tipo).toBe("NENHUM");
  });
});
