/**
 * Campanhas — o fluxo inteiro contra o banco de teste.
 *
 * O QUE ESTES TESTES PROTEGEM não é "a campanha envia". É que ela **não envie
 * para quem não devia**, e que o que ela deixou de enviar fique explicado.
 *
 * Uma campanha é o único lugar do sistema onde um erro atinge centenas de
 * pessoas de uma vez. As três garantias que valem mais que a funcionalidade:
 * o recorte não pega quem pediu para parar, o público congelado não muda
 * embaixo da campanha, e um bloqueio adiável não consome o alvo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return { ...real, registrar: () => undefined };
});

import { CONFIGURACAO_PADRAO } from "../dominio/configuracao";
import {
  agendarCampanha,
  contarPublico,
  criarCampanha,
  lerFiltroPublico,
  opcoesDoPublico,
  rodarCampanhas,
  FILTRO_PUBLICO_VAZIO,
} from "./campanhas";
import {
  obterSandboxMensageria,
  _reiniciarSandboxMensageria,
} from "../integracoes/whatsapp/provedores";
import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

const ORG = "org-1";
const CLINICA = "clinica-1";

/** Um instante dentro do horário comercial, para o envio não esbarrar nele. */
const HORARIO_UTIL = new Date("2026-09-08T14:00:00.000Z");

function paciente(id: string, extras: Record<string, unknown> = {}): void {
  semear("crc_patients", [
    {
      id,
      organization_id: ORG,
      clinic_id: CLINICA,
      external_source: "do",
      external_id: id,
      nome: `Paciente ${id}`,
      telefone: `551199999${id.slice(-4).padStart(4, "0")}`,
      situacao: "EM_TRATAMENTO",
      ativo: true,
      arquivado: false,
      ultima_consulta_em: "2024-01-01T10:00:00.000Z",
      proxima_consulta_em: null,
      opt_out_em: null,
      ...extras,
    },
  ]);
}

function contexto() {
  return {
    organizationId: ORG,
    porta: obterSandboxMensageria(),
    configuracao: CONFIGURACAO_PADRAO,
    enviosPausados: false,
    agora: HORARIO_UTIL,
  };
}

beforeEach(() => {
  limparBanco();
  definirRelogio(HORARIO_UTIL);
  _reiniciarSandboxMensageria();
  semear("crc_organizations", [{ id: ORG, nome: "JP", slug: "jp" }]);
  semear("crc_clinics", [
    { id: CLINICA, organization_id: ORG, nome: "JP", slug: "matriz", ativa: true },
  ]);
});

/* ========================================================================== */

describe("o recorte", () => {
  it("nunca inclui quem pediu para parar, nem quem não tem telefone", async () => {
    paciente("p-1");
    paciente("p-2", { opt_out_em: "2026-01-01T00:00:00.000Z" });
    paciente("p-3", { telefone: null });
    paciente("p-4", { arquivado: true });
    paciente("p-5", { ativo: false });

    // Nenhuma dessas quatro exclusões é opção da tela: elas entram sempre.
    const quantos = await contarPublico(ORG, { ...FILTRO_PUBLICO_VAZIO }, HORARIO_UTIL);
    expect(quantos).toBe(1);
  });

  it("por padrão, deixa de fora quem já tem consulta marcada", async () => {
    paciente("p-1");
    paciente("p-2", { proxima_consulta_em: "2026-10-01T10:00:00.000Z" });

    // O padrão do filtro é o seguro: falar com quem já tem consulta é o erro
    // mais caro de uma campanha.
    expect(await contarPublico(ORG, lerFiltroPublico({}), HORARIO_UTIL)).toBe(1);
  });

  it("filtra por convênio quando o Dental Office informa o campo", async () => {
    paciente("p-1", { convenio: "Amil Dental" });
    paciente("p-2", { convenio: "Odontoprev" });
    paciente("p-3");

    const f = lerFiltroPublico({ convenio: "Amil Dental" });
    expect(await contarPublico(ORG, f, HORARIO_UTIL)).toBe(1);

    // Sem filtro de convênio, todos entram — inclusive quem é particular.
    expect(await contarPublico(ORG, { ...FILTRO_PUBLICO_VAZIO }, HORARIO_UTIL)).toBe(3);
  });

  it("as opções vêm da base, e ficam vazias quando o campo não vem", async () => {
    paciente("p-1", { convenio: "Amil Dental", especialidade: "Ortodontia" });
    paciente("p-2", { convenio: null, especialidade: "Ortodontia" });

    const com = await opcoesDoPublico(ORG);
    expect(com.convenios).toEqual(["Amil Dental"]);
    // Sem repetir: a mesma especialidade em dois pacientes é uma opção.
    expect(com.especialidades).toEqual(["Ortodontia"]);

    limparBanco();
    definirRelogio(HORARIO_UTIL);
    paciente("p-9", { convenio: null });

    // É este caso que faz o campo de convênio sumir da tela em vez de aparecer
    // vazio e nunca casar com ninguém.
    const sem = await opcoesDoPublico(ORG);
    expect(sem.convenios).toEqual([]);
  });

  it("a FAIXA separa quem sumiu há um ano de quem sumiu há cinco", async () => {
    // O caso que a especificação pede: 6–12, 12–24 e 24+ meses são conversas
    // diferentes, e sem teto a primeira campanha levaria as três juntas.
    paciente("p-1", { ultima_consulta_em: "2026-03-08T10:00:00.000Z" }); // ~6 meses
    paciente("p-2", { ultima_consulta_em: "2025-03-08T10:00:00.000Z" }); // ~18 meses
    paciente("p-3", { ultima_consulta_em: "2021-09-08T10:00:00.000Z" }); // ~5 anos

    const semTeto = lerFiltroPublico({ diasSemVoltar: 365 });
    // Só com piso: leva o de 18 meses E o de 5 anos.
    expect(await contarPublico(ORG, semTeto, HORARIO_UTIL)).toBe(2);

    const faixa = lerFiltroPublico({ diasSemVoltar: 365, diasSemVoltarAte: 730 });
    // Com a faixa 12–24 meses: só o de 18 meses.
    expect(await contarPublico(ORG, faixa, HORARIO_UTIL)).toBe(1);

    const antigos = lerFiltroPublico({ diasSemVoltar: 730 });
    expect(await contarPublico(ORG, antigos, HORARIO_UTIL)).toBe(1);
  });

  it("teto abaixo do piso é descartado, e não vira faixa vazia", async () => {
    paciente("p-1", { ultima_consulta_em: "2025-03-08T10:00:00.000Z" });

    // Uma faixa impossível não pode devolver uma tela que parece quebrada:
    // o teto inválido cai fora e o filtro volta a ser "de N dias para cima".
    const f = lerFiltroPublico({ diasSemVoltar: 730, diasSemVoltarAte: 365 });
    expect(f.diasSemVoltarAte).toBeNull();
    expect(await contarPublico(ORG, f, HORARIO_UTIL)).toBe(0);
  });

  it("filtro desconhecido não vira consulta", async () => {
    paciente("p-1");
    const f = lerFiltroPublico({ limite: 99999, deleteTudo: true, situacao: "INVENTADA" });
    expect(f.situacao).toBeNull();
    expect(await contarPublico(ORG, f, HORARIO_UTIL)).toBe(1);
  });
});

/* ========================================================================== */

describe("agendar congela o público", () => {
  it("quem entra no critério DEPOIS não recebe", async () => {
    paciente("p-1");

    const criada = await criarCampanha({
      organizationId: ORG,
      clinicId: CLINICA,
      nome: "Sumidos",
      mensagem: "Oi, {{primeiroNome}}! Vamos marcar?",
      filtros: { ...FILTRO_PUBLICO_VAZIO },
      porDia: 100,
      autorId: "u-1",
    });
    expect(criada.ok).toBe(true);
    if (!criada.ok) return;

    const r = await agendarCampanha({ organizationId: ORG, campaignId: criada.id, autorId: "u-1" });
    expect(r.ok && r.publico).toBe(1);

    // Alguém novo passa a se encaixar no filtro depois da revisão.
    paciente("p-2");

    // O público não se mexe: é o que foi revisado que sai.
    expect(conteudo("crc_campaign_targets")).toHaveLength(1);
  });

  it("agendar duas vezes não duplica o alvo", async () => {
    paciente("p-1");
    const criada = await criarCampanha({
      organizationId: ORG,
      clinicId: CLINICA,
      nome: "Sumidos",
      mensagem: "Oi, {{primeiroNome}}!",
      filtros: { ...FILTRO_PUBLICO_VAZIO },
      porDia: 100,
      autorId: "u-1",
    });
    if (!criada.ok) return;

    await agendarCampanha({ organizationId: ORG, campaignId: criada.id, autorId: "u-1" });
    const segunda = await agendarCampanha({
      organizationId: ORG,
      campaignId: criada.id,
      autorId: "u-1",
    });

    // A segunda é recusada pelo status, e o índice único é a rede embaixo.
    expect(segunda.ok).toBe(false);
    expect(conteudo("crc_campaign_targets")).toHaveLength(1);
  });
});

/* ========================================================================== */

describe("o envio", () => {
  async function campanhaPronta(quantos: number, porDia = 100): Promise<string> {
    for (let i = 1; i <= quantos; i += 1) paciente(`p-${String(i)}`);

    const criada = await criarCampanha({
      organizationId: ORG,
      clinicId: CLINICA,
      nome: "Sumidos",
      mensagem: "Oi, {{primeiroNome}}! Vamos marcar?",
      filtros: { ...FILTRO_PUBLICO_VAZIO },
      porDia,
      autorId: "u-1",
    });
    if (!criada.ok) throw new Error(criada.motivo);
    await agendarCampanha({ organizationId: ORG, campaignId: criada.id, autorId: "u-1" });
    return criada.id;
  }

  it("envia, substitui o nome, e marca o alvo", async () => {
    await campanhaPronta(2);

    const r = await rodarCampanhas(contexto());
    expect(r.enviadas).toBe(2);

    const enviadas = obterSandboxMensageria().listarEnviadas();
    expect(enviadas).toHaveLength(2);
    // A variável foi substituída: `{{primeiroNome}}` cru chegando no WhatsApp
    // de um paciente destrói a confiança na automação inteira.
    expect(enviadas[0]?.texto).not.toContain("{{");
    expect(enviadas[0]?.texto).toContain("Paciente");

    const alvos = conteudo("crc_campaign_targets");
    expect(alvos.every((a) => a["status"] === "ENVIADA")).toBe(true);
  });

  it("respeita a cota do dia", async () => {
    await campanhaPronta(5, 2);

    const r = await rodarCampanhas(contexto());
    expect(r.enviadas).toBe(2);
    expect(obterSandboxMensageria().listarEnviadas()).toHaveLength(2);

    // A segunda volta no MESMO dia não manda mais nada: a cota é contada do
    // que já saiu hoje, e não distribuída por ciclo.
    const segunda = await rodarCampanhas(contexto());
    expect(segunda.enviadas).toBe(0);
  });

  it("com os envios pausados, não sai nada", async () => {
    await campanhaPronta(3);
    const r = await rodarCampanhas({ ...contexto(), enviosPausados: true });
    expect(r.enviadas).toBe(0);
    expect(obterSandboxMensageria().listarEnviadas()).toHaveLength(0);
  });

  it("fora do horário NÃO consome o alvo: ele volta na próxima volta", async () => {
    await campanhaPronta(2);

    // 05h UTC = 02h em São Paulo.
    const madrugada = new Date("2026-09-08T05:00:00.000Z");
    definirRelogio(madrugada);
    const noite = await rodarCampanhas({ ...contexto(), agora: madrugada });

    expect(noite.enviadas).toBe(0);
    // E, principalmente, ninguém foi marcado como pulado: perder a pessoa por
    // causa do relógio seria o pior desfecho possível.
    expect(noite.puladas).toBe(0);
    expect(conteudo("crc_campaign_targets").every((a) => a["status"] === "PENDENTE")).toBe(true);

    definirRelogio(HORARIO_UTIL);
    const dia = await rodarCampanhas(contexto());
    expect(dia.enviadas).toBe(2);
  });

  it("a campanha se conclui sozinha quando a fila acaba", async () => {
    await campanhaPronta(1);
    await rodarCampanhas(contexto());
    await rodarCampanhas(contexto());

    expect(conteudo("crc_campaigns")[0]?.["status"]).toBe("CONCLUIDA");
  });
});
