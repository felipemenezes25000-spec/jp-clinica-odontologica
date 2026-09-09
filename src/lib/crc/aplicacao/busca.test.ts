/**
 * Busca global.
 *
 * O QUE ESTES TESTES PROTEGEM são as duas formas de a busca mentir:
 *
 *   ACHAR DEMAIS — devolver o paciente de outra unidade, ou casar um telefone
 *   por pedaço e abrir a conversa de outra pessoa. Os dois vazam dado.
 *
 *   ACHAR DE MENOS — não encontrar quem existe porque o termo foi lido como
 *   a coisa errada. Aqui o custo é a recepção desistir da caixa e voltar a
 *   procurar de aba em aba.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

import { limparBanco, semear } from "../testes/banco-memoria";

import { buscarEmTudo } from "./busca";

const ORG = "org-1";
const CLINICA = "clinica-1";

beforeEach(() => {
  limparBanco();
  semear("crc_organizations", [{ id: ORG, nome: "JP", slug: "jp" }]);
  semear("crc_clinics", [{ id: CLINICA, organization_id: ORG, nome: "JP", slug: "matriz" }]);

  semear("crc_patients", [
    {
      id: "p-1",
      organization_id: ORG,
      clinic_id: CLINICA,
      external_source: "do",
      external_id: "e1",
      nome: "Maria Souza Lima",
      telefone: "5511988887777",
      situacao: "EM_TRATAMENTO",
      ultima_consulta_em: "2026-01-10T10:00:00.000Z",
      proxima_consulta_em: null,
    },
    {
      id: "p-2",
      organization_id: ORG,
      clinic_id: CLINICA,
      external_source: "do",
      external_id: "e2",
      nome: "Mariana Costa",
      telefone: "5511977776666",
      situacao: "CONCLUIDO",
      ultima_consulta_em: "2025-06-01T10:00:00.000Z",
      proxima_consulta_em: null,
    },
  ]);
});

describe("o termo decide onde procurar", () => {
  it("texto acha por nome, com casamento parcial", async () => {
    const r = await buscarEmTudo(ORG, "maria");

    expect(r.porTelefone).toBe(false);
    const nomes = r.resultados.filter((x) => x.tipo === "paciente").map((x) => x.titulo);
    // "Mariana" contém "maria": quem digita três letras quer as duas.
    expect(nomes).toContain("Maria Souza Lima");
    expect(nomes).toContain("Mariana Costa");
  });

  it("número é telefone, e não nome", async () => {
    const r = await buscarEmTudo(ORG, "98888");

    expect(r.porTelefone).toBe(true);
    const pacientes = r.resultados.filter((x) => x.tipo === "paciente");
    expect(pacientes).toHaveLength(1);
    expect(pacientes[0]?.titulo).toBe("Maria Souza Lima");
  });

  it("aceita telefone com os separadores que as pessoas digitam", async () => {
    const r = await buscarEmTudo(ORG, "(11) 98888-7777");
    expect(r.porTelefone).toBe(true);
    expect(r.resultados.some((x) => x.titulo === "Maria Souza Lima")).toBe(true);
  });

  it("termo curto demais não consulta nada", async () => {
    const r = await buscarEmTudo(ORG, "m");
    expect(r.resultados).toEqual([]);
  });
});

describe("os quatro lugares", () => {
  it("encontra lead que ainda não é paciente, com a campanha à vista", async () => {
    semear("crc_leads", [
      {
        id: "l-1",
        organization_id: ORG,
        clinic_id: CLINICA,
        patient_id: null,
        nome: "Joana Prado",
        telefone: "5511966665555",
        origem: "GOOGLE",
        utm_campaign: "implantes-zona-norte",
        criado_em: "2026-09-08T12:00:00.000Z",
      },
    ]);

    const r = await buscarEmTudo(ORG, "joana");
    const lead = r.resultados.find((x) => x.tipo === "lead");
    expect(lead?.titulo).toBe("Joana Prado");
    expect(lead?.detalhe).toContain("implantes-zona-norte");
    // Sem ficha ainda: a tela não tem paciente para abrir.
    expect(lead?.patientId).toBeNull();
  });

  it("encontra oportunidade ABERTA pelo nome do paciente, e ignora a fechada", async () => {
    semear("crc_opportunities", [
      {
        id: "o-1",
        organization_id: ORG,
        clinic_id: CLINICA,
        patient_id: "p-1",
        tipo: "MISSED_APPOINTMENT",
        prioridade: 92,
        fechada_em: null,
        criado_em: "2026-09-08T12:00:00.000Z",
      },
      {
        id: "o-2",
        organization_id: ORG,
        clinic_id: CLINICA,
        patient_id: "p-1",
        tipo: "RECALL",
        prioridade: 40,
        fechada_em: "2026-08-01T12:00:00.000Z",
        criado_em: "2026-07-01T12:00:00.000Z",
      },
    ]);

    const r = await buscarEmTudo(ORG, "Maria Souza");
    const ops = r.resultados.filter((x) => x.tipo === "oportunidade");
    // Quem busca alguém para atender agora não quer o histórico encerrado.
    expect(ops).toHaveLength(1);
    expect(ops[0]?.id).toBe("o-1");
    expect(ops[0]?.detalhe).toContain("92");
  });

  it("acha conversa pelo assunto, mesmo sem lembrar o nome", async () => {
    semear("crc_conversations", [
      {
        id: "c-1",
        organization_id: ORG,
        clinic_id: CLINICA,
        patient_id: null,
        canal: "whatsapp",
        contato_externo: "5511955554444",
        status: "ABERTA",
        nao_lidas: 2,
        ultima_mensagem_em: "2026-09-08T18:00:00.000Z",
        ultima_mensagem_trecho: "queria saber o preço do clareamento",
      },
    ]);

    const r = await buscarEmTudo(ORG, "clareamento");
    const conversa = r.resultados.find((x) => x.tipo === "conversa");
    expect(conversa).toBeDefined();
    // Sem paciente ligado, o título é o contato — que é tudo que se sabe.
    expect(conversa?.titulo).toBe("5511955554444");
    expect(conversa?.detalhe).toContain("2 não lida");
  });

  it("a conversa de um paciente aparece com o nome dele", async () => {
    semear("crc_conversations", [
      {
        id: "c-2",
        organization_id: ORG,
        clinic_id: CLINICA,
        patient_id: "p-1",
        canal: "whatsapp",
        contato_externo: "5511988887777",
        status: "ABERTA",
        nao_lidas: 0,
        ultima_mensagem_em: "2026-09-08T18:00:00.000Z",
        ultima_mensagem_trecho: "obrigada!",
      },
    ]);

    const r = await buscarEmTudo(ORG, "Maria Souza");
    const conversa = r.resultados.find((x) => x.tipo === "conversa");
    expect(conversa?.titulo).toBe("Maria Souza Lima");
    expect(conversa?.patientId).toBe("p-1");
  });
});

describe("não vaza", () => {
  it("outra organização não aparece", async () => {
    semear("crc_patients", [
      {
        id: "p-outra",
        organization_id: "org-2",
        clinic_id: "clinica-9",
        external_source: "do",
        external_id: "e9",
        nome: "Maria de Outra Clínica",
        telefone: "5511988887777",
      },
    ]);

    const r = await buscarEmTudo(ORG, "maria");
    expect(r.resultados.every((x) => !x.titulo.includes("Outra"))).toBe(true);
  });

  it("conversa casa o telefone INTEIRO, e não por pedaço", async () => {
    semear("crc_conversations", [
      {
        id: "c-3",
        organization_id: ORG,
        clinic_id: CLINICA,
        patient_id: null,
        canal: "whatsapp",
        contato_externo: "5511988887777",
        status: "ABERTA",
        nao_lidas: 0,
        ultima_mensagem_em: "2026-09-08T18:00:00.000Z",
        ultima_mensagem_trecho: "oi",
      },
    ]);

    // O paciente é achado pelo final do número — isso é útil e esperado.
    const parcial = await buscarEmTudo(ORG, "8888");
    expect(parcial.resultados.some((x) => x.tipo === "paciente")).toBe(true);

    // A CONVERSA, não: abrir a conversa errada mostra o histórico de outra
    // pessoa, e "8888" é o final de muita gente.
    expect(parcial.resultados.some((x) => x.tipo === "conversa")).toBe(false);

    // Com o número inteiro, ela aparece.
    const completo = await buscarEmTudo(ORG, "5511988887777");
    expect(completo.resultados.some((x) => x.tipo === "conversa")).toBe(true);
  });
});
