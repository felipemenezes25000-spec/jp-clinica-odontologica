/**
 * Testes de contrato do adapter do Dental Office — item 81.
 *
 * "Criar fixtures baseadas em payloads reais/sandbox das integrações. Se
 * payload externo mudar, teste deve detectar quebra."
 *
 * AS CREDENCIAIS AINDA NÃO CHEGARAM, então os fixtures aqui são construídos a
 * partir da documentação da API (campos, códigos de status 1..6 e situações
 * 1..7) mais as variações de formato que APIs REST costumam ter: camelCase
 * contra snake_case, id numérico contra string, data com e sem fuso, lista na
 * raiz contra lista dentro de `data`.
 *
 * Isso é honesto sobre o que estes testes provam: eles provam que o MAPPER
 * aguenta a variação, não que a API produz exatamente estes bytes. No dia em
 * que a credencial chegar, um payload real capturado vira mais um fixture aqui
 * — e se ele quebrar algum caso, o teste aponta o campo exato.
 */
import { describe, expect, it } from "vitest";

import { calcularEspera, caminhoParaLog, statusEhTransitorio } from "../../servidor/http";

import { interpretarPagina, mapearAgendamento, mapearPaciente, mapearSlots } from "./mapeadores";
import { _reiniciarSandbox, criarSandbox } from "./sandbox";

/* ========================================================================== */
/* Paciente                                                                   */
/* ========================================================================== */

describe("mapeamento de paciente", () => {
  it("lê o payload documentado", () => {
    const r = mapearPaciente({
      id: 4211,
      name: "Maria Souza Lima",
      birth_date: "1985-04-12",
      gender: "F",
      situation: 2,
      specialty: 8,
      active: true,
      cell_phone: "(11) 99999-0001",
      email: "Maria@Exemplo.COM",
      clinic_id: "clin-1",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.externalId).toBe("4211"); // id numérico vira texto
    expect(r.valor.nome).toBe("Maria Souza Lima");
    expect(r.valor.situacao).toBe("EM_TRATAMENTO");
    expect(r.valor.especialidade).toBe("Implantodontia");
    expect(r.valor.telefone).toBe("5511999990001");
    expect(r.valor.telefoneBruto).toBe("(11) 99999-0001");
    expect(r.valor.email).toBe("maria@exemplo.com"); // minúsculas
  });

  it("aceita camelCase e português, porque a API varia entre endpoints", () => {
    const r = mapearPaciente({
      customerId: "9",
      nome: "João Santos",
      birthDate: "1979-11-30",
      situacao: 7,
      celular: "11999990002",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.externalId).toBe("9");
    expect(r.valor.situacao).toBe("ABANDONO");
    expect(r.valor.telefone).toBe("5511999990002");
  });

  it("rejeita paciente sem id ou sem nome", () => {
    expect(mapearPaciente({ name: "Sem ID" }).ok).toBe(false);
    expect(mapearPaciente({ id: "1" }).ok).toBe(false);
    expect(mapearPaciente({ id: "1", name: "   " }).ok).toBe(false);
    expect(mapearPaciente(null).ok).toBe(false);
    expect(mapearPaciente("texto solto").ok).toBe(false);
  });

  it("situação desconhecida NÃO rejeita o paciente", () => {
    // Rejeitar aqui deixaria a base do CRC menor que a do Dental Office por
    // causa de um código que ninguém documentou.
    const r = mapearPaciente({ id: "1", name: "Alguém", situation: 42 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.situacao).toBe("DESCONHECIDO");
  });

  it("campo `active` ausente significa ATIVO, e não inativo", () => {
    // O contrário sumiria com o paciente da operação inteira por omissão da API.
    const r = mapearPaciente({ id: "1", name: "Alguém" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.ativo).toBe(true);

    for (const valor of [false, 0, "false", "0", "nao"]) {
      const inativo = mapearPaciente({ id: "1", name: "Alguém", active: valor });
      expect(inativo.ok).toBe(true);
      if (inativo.ok)
        expect(inativo.valor.ativo, `falhou com ${JSON.stringify(valor)}`).toBe(false);
    }
  });

  it("prefere o celular ao fixo quando há os dois", () => {
    // Mensagem para o fixo não falha com erro: simplesmente nunca chega.
    const r = mapearPaciente({
      id: "1",
      name: "Alguém",
      phone: "(11) 3333-4444",
      cell_phone: "(11) 99999-0001",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.telefone).toBe("5511999990001");
  });

  it("encontra o telefone dentro de contacts[]", () => {
    const r = mapearPaciente({
      id: "1",
      name: "Alguém",
      contacts: [
        { type: "email", value: "x@y.com" },
        { type: "phone", value: "(11) 98888-7777" },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.telefone).toBe("5511988887777");
  });

  it("paciente sem telefone entra com telefone nulo, sem quebrar", () => {
    const r = mapearPaciente({ id: "1", name: "Alguém" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.telefone).toBeNull();
  });

  it("e-mail malformado vira null em vez de contaminar a base", () => {
    const r = mapearPaciente({ id: "1", name: "Alguém", email: "não é email" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.email).toBeNull();
  });

  it("aceita nascimento em formato brasileiro", () => {
    const r = mapearPaciente({ id: "1", name: "Alguém", birth_date: "12/04/1985" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.nascimento).toBe("1985-04-12");
  });
});

/* ========================================================================== */
/* Agendamento                                                                */
/* ========================================================================== */

describe("mapeamento de agendamento", () => {
  it("lê o payload documentado", () => {
    const r = mapearAgendamento({
      id: "ag-1",
      customer_id: "4211",
      clinic_id: "clin-1",
      dentist_id: "dent-1",
      dentist_name: "Dra. Juliana",
      chair_id: "cad-2",
      start: "2026-09-08T14:00:00-03:00",
      end: "2026-09-08T14:40:00-03:00",
      status: 5,
      description: "Retorno",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.status).toBe("MISSED");
    expect(r.valor.inicioEm).toBe("2026-09-08T17:00:00.000Z");
    expect(r.valor.pacienteExternoId).toBe("4211");
  });

  it("data SEM fuso é lida como horário da clínica, não como UTC", () => {
    // Este é o teste que evita a consulta aparecer três horas antes e a
    // confirmação disparar no dia errado.
    const r = mapearAgendamento({ id: "a", start: "2026-09-08 14:00:00", status: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.inicioEm).toBe("2026-09-08T17:00:00.000Z");
  });

  it("REJEITA status desconhecido, em vez de chutar", () => {
    // Chutar TO_CONFIRM colocaria na fila de confirmação; chutar MISSED
    // mandaria mensagem de falta para quem compareceu.
    const r = mapearAgendamento({ id: "a", start: "2026-09-08T14:00:00-03:00", status: 99 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.campo).toBe("status");
  });

  it("REJEITA agendamento sem data reconhecível", () => {
    expect(mapearAgendamento({ id: "a", status: 1 }).ok).toBe(false);
    expect(mapearAgendamento({ id: "a", start: "amanhã", status: 1 }).ok).toBe(false);
  });

  it("aceita as variações de nome de campo da data", () => {
    for (const chave of ["start", "start_at", "startAt", "date_time", "data_hora", "inicio"]) {
      const r = mapearAgendamento({ id: "a", [chave]: "2026-09-08T14:00:00-03:00", status: 2 });
      expect(r.ok, `falhou com a chave ${chave}`).toBe(true);
    }
  });

  it("guarda o código cru do status para auditoria de mapeamento", () => {
    const r = mapearAgendamento({ id: "a", start: "2026-09-08T14:00:00-03:00", status: 4 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.status).toBe("COMPLETED");
      expect(r.valor.statusExterno).toBe("4");
    }
  });
});

/* ========================================================================== */
/* Paginação (item 15)                                                        */
/* ========================================================================== */

describe("paginação", () => {
  it("respeita total_pages quando a API informa", () => {
    const p = interpretarPagina({ data: [1, 2, 3], total_pages: 3 }, 1, 3);
    expect(p.proximaPagina).toBe(2);
    expect(interpretarPagina({ data: [1], total_pages: 3 }, 3, 3).proximaPagina).toBeNull();
  });

  it("respeita has_more", () => {
    expect(interpretarPagina({ items: [1], has_more: true }, 1, 10).proximaPagina).toBe(2);
    expect(interpretarPagina({ items: [1], has_more: false }, 1, 10).proximaPagina).toBeNull();
  });

  it("usa o total de registros quando é o que existe", () => {
    expect(interpretarPagina({ data: [1, 2], total: 10 }, 1, 2).proximaPagina).toBe(2);
    expect(interpretarPagina({ data: [1, 2], total: 4 }, 2, 2).proximaPagina).toBeNull();
  });

  it("sem metadado nenhum, página cheia significa 'tente a próxima'", () => {
    // Parar cedo deixaria pacientes fora do CRC sem ninguém perceber. Uma
    // requisição extra no fim do sync é barata perto disso.
    expect(interpretarPagina([1, 2, 3], 1, 3).proximaPagina).toBe(2);
    expect(interpretarPagina([1, 2], 1, 3).proximaPagina).toBeNull();
  });

  it("acha a lista onde quer que a API tenha colocado", () => {
    for (const chave of ["data", "items", "results", "content", "records"]) {
      expect(interpretarPagina({ [chave]: [1, 2] }, 1, 10).itens).toHaveLength(2);
    }
    expect(interpretarPagina([1, 2, 3], 1, 10).itens).toHaveLength(3);
    expect(interpretarPagina({ nada: true }, 1, 10).itens).toHaveLength(0);
  });
});

/* ========================================================================== */
/* Horários disponíveis (item 19)                                             */
/* ========================================================================== */

describe("os campos do paciente, como a API realmente os manda", () => {
  /*
   * Estes três vinham SEMPRE nulos e ninguém percebia — `null` não é erro, é
   * silêncio. Cada um desliga uma funcionalidade inteira: sem especialidade o
   * filtro de campanha fica sem opções, sem convênio ele se esconde, e sem
   * situação a automação de abandono nunca dispara.
   */
  const doJeitoDaApi = {
    id: 2,
    name: "Max Cavalera",
    phone: "1140028922",
    cellphone: "11940028922",
    active: true,
    customer_situation_id: 7,
    specialty_ids: [4, 5],
    dental_insurance_id: 3,
  };

  it("situação vem de `customer_situation_id`, e não de `situation`", () => {
    const r = mapearPaciente(doJeitoDaApi);
    if (!r.ok) throw new Error(r.erro);
    // 7 = abandono na tabela padrão. É o que faz a automação de abandono ter
    // alguém para trabalhar.
    expect(r.valor.situacao).toBe("ABANDONO");
  });

  it("especialidade vem do ARRAY `specialty_ids`, e fica a primeira", () => {
    const r = mapearPaciente(doJeitoDaApi);
    if (!r.ok) throw new Error(r.erro);
    // O id cru: quem traduz para "Endodontia" é a sincronização, consultando
    // /disciplines uma vez por execução.
    expect(r.valor.especialidade).toBe("4");
  });

  it("sem nome de convênio, guarda o id em vez de perder o dado", () => {
    const r = mapearPaciente(doJeitoDaApi);
    if (!r.ok) throw new Error(r.erro);
    // Não existe endpoint que liste convênios. O id ainda agrupa pacientes do
    // mesmo plano, e é melhor que null.
    expect(r.valor.convenio).toBe("3");
  });

  it("quando o nome do convênio vem (agenda), ele vence o id", () => {
    const r = mapearPaciente({ ...doJeitoDaApi, dental_insurance_name: "Amil Dental" });
    if (!r.ok) throw new Error(r.erro);
    expect(r.valor.convenio).toBe("Amil Dental");
  });

  it("situação desconhecida não rejeita o paciente", () => {
    // Item 114: a base do CRC não pode ficar menor que a do Dental Office por
    // causa de um campo que ninguém preencheu.
    const r = mapearPaciente({ id: 9, name: "Sem situação", cellphone: "11940028922" });
    if (!r.ok) throw new Error(r.erro);
    expect(r.valor.situacao).toBe("DESCONHECIDO");
  });
});

describe("a anotação do agendamento", () => {
  it("`notes` vence `description`, porque `description` é o nome do paciente", () => {
    // Descoberto cruzando a especificação com o exemplo de resposta: o Dental
    // Office preenche `description` com o nome do paciente, para o calendário
    // deles. A anotação que o CRC escreve volta em `notes`.
    const r = mapearAgendamento(
      {
        id: 5,
        clinic_id: 7,
        customer_id: 42,
        dentist_id: 3,
        schedule_start: "2026-09-10T13:40:00.000Z",
        schedule_end: "2026-09-10T14:10:00.000Z",
        description: "Maria Souza Lima",
        notes: "Agendado pelo JP CRC",
        schedule_situation: { id: 1, name: "Confirmar", label: "to_confirm" },
      },
      "-03:00",
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.descricao).toBe("Agendado pelo JP CRC");
  });

  it("sem anotação nossa, cai no rótulo deles em vez de ficar vazio", () => {
    const r = mapearAgendamento(
      {
        id: 6,
        clinic_id: 7,
        schedule_start: "2026-09-10T13:40:00.000Z",
        description: "Maria Souza Lima",
        notes: null,
        schedule_situation: { id: 4, name: "Faltou", label: "absence" },
      },
      "-03:00",
    );

    if (!r.ok) throw new Error(r.erro);
    expect(r.valor.descricao).toBe("Maria Souza Lima");
    // E o status veio do rótulo, não do número.
    expect(r.valor.status).toBe("MISSED");
  });
});

describe("horários disponíveis", () => {
  const ctx = { clinicId: "c1", dentistaExternoId: "d1" };

  /**
   * O FORMATO REAL da API do Dental Office: agrupado por dia, com `periods`
   * dentro, e `start_time`/`end_time`/`chair_id` em cada período.
   *
   * A versão anterior destes testes usava uma lista plana de `start`/`end` que
   * a API nunca devolve — e foi assim que um adapter inteiro passou verde
   * contra uma API imaginada.
   */
  const diaReal = (data: string, periodos: { de: string; ate: string; cadeira: number }[]) => [
    {
      date: data,
      periods: periodos.map((p) => ({
        start_time: p.de,
        end_time: p.ate,
        chair_id: p.cadeira,
      })),
    },
  ];

  it("lê o formato agrupado por dia, com a cadeira de cada período", () => {
    const slots = mapearSlots(
      diaReal("2026-09-08", [
        { de: "2026-09-08T14:00:00-03:00", ate: "2026-09-08T14:30:00-03:00", cadeira: 1 },
        { de: "2026-09-08T14:30:00-03:00", ate: "2026-09-08T15:00:00-03:00", cadeira: 1 },
      ]),
      ctx,
    );

    expect(slots).toHaveLength(2);
    expect(slots[0]?.duracaoMinutos).toBe(30);
    // A cadeira é o que torna o horário agendável: sem ela o POST é recusado.
    expect(slots[0]?.cadeiraExternaId).toBe("1");
  });

  it("calcula a duração pelo início e fim do período", () => {
    const slots = mapearSlots(
      diaReal("2026-09-08", [
        { de: "2026-09-08T14:00:00-03:00", ate: "2026-09-08T14:50:00-03:00", cadeira: 2 },
      ]),
      ctx,
    );
    expect(slots[0]?.duracaoMinutos).toBe(50);
  });

  it("junta vários dias numa lista só, ordenada", () => {
    const slots = mapearSlots(
      [
        ...diaReal("2026-09-09", [
          { de: "2026-09-09T09:00:00-03:00", ate: "2026-09-09T09:30:00-03:00", cadeira: 1 },
        ]),
        ...diaReal("2026-09-08", [
          { de: "2026-09-08T15:00:00-03:00", ate: "2026-09-08T15:30:00-03:00", cadeira: 1 },
        ]),
      ],
      ctx,
    );

    expect(slots).toHaveLength(2);
    expect(slots[0]?.inicioEm.localeCompare(slots[1]?.inicioEm ?? "")).toBeLessThan(0);
  });

  it("o mesmo horário em duas cadeiras vira UM horário", () => {
    // A API devolve o período uma vez por cadeira livre. Mostrar "14:00" duas
    // vezes ao paciente parece defeito — fica a primeira cadeira, sempre a
    // mesma, para o comportamento ser reproduzível.
    const slots = mapearSlots(
      diaReal("2026-09-08", [
        { de: "2026-09-08T14:00:00-03:00", ate: "2026-09-08T14:30:00-03:00", cadeira: 1 },
        { de: "2026-09-08T14:00:00-03:00", ate: "2026-09-08T14:30:00-03:00", cadeira: 7 },
      ]),
      ctx,
    );

    expect(slots).toHaveLength(1);
    expect(slots[0]?.cadeiraExternaId).toBe("1");
  });

  it("horário SEM cadeira é descartado, e não oferecido", () => {
    // Item 119 ganhou um motivo novo: sem `chair_id` a API recusa o POST, e
    // oferecer esse horário ao paciente produziria uma promessa que quebra na
    // hora de confirmar.
    const slots = mapearSlots(
      [
        {
          date: "2026-09-08",
          periods: [
            { start_time: "2026-09-08T14:00:00-03:00", end_time: "2026-09-08T14:30:00-03:00" },
          ],
        },
      ],
      ctx,
    );
    expect(slots).toHaveLength(0);
  });

  it("ignora entrada inválida em vez de inventar horário", () => {
    // Item 119: nunca mentir disponibilidade.
    const slots = mapearSlots(["não é data", null, { nada: 1 }], ctx);
    expect(slots).toHaveLength(0);
  });
});

/* ========================================================================== */
/* Política de retry (itens 11, 12, 194)                                      */
/* ========================================================================== */

describe("política de retry", () => {
  it("repete só o que é transitório", () => {
    for (const s of [408, 425, 429, 500, 502, 503, 504]) {
      expect(statusEhTransitorio(s), `${String(s)} deveria ser transitório`).toBe(true);
    }
    for (const s of [400, 401, 403, 404, 409, 422]) {
      expect(statusEhTransitorio(s), `${String(s)} NÃO deveria ser transitório`).toBe(false);
    }
  });

  it("o backoff cresce e tem teto", () => {
    const semJitter = (): number => 1; // topo da faixa, para o teste ser determinístico
    const e1 = calcularEspera(1, null, semJitter);
    const e2 = calcularEspera(2, null, semJitter);
    const e3 = calcularEspera(3, null, semJitter);
    expect(e2).toBeGreaterThan(e1);
    expect(e3).toBeGreaterThan(e2);
    expect(calcularEspera(20, null, semJitter)).toBeLessThanOrEqual(8000);
  });

  it("o jitter espalha a volta — duas chamadas não caem no mesmo instante", () => {
    // Sem jitter, 5.000 requisições que tomaram 429 voltam juntas e tomam 429
    // de novo.
    const baixo = calcularEspera(3, null, () => 0);
    const alto = calcularEspera(3, null, () => 1);
    expect(baixo).toBeLessThan(alto);
  });

  it("Retry-After do servidor ganha do nosso cálculo", () => {
    expect(calcularEspera(1, 30, () => 1)).toBe(30_000);
    // Com teto: um Retry-After absurdo não trava o worker por uma hora.
    expect(calcularEspera(1, 3600, () => 1)).toBe(60_000);
  });
});

describe("caminho para log (item 75)", () => {
  it("guarda o nome do parâmetro e joga fora o valor", () => {
    expect(caminhoParaLog("https://api.exemplo.com/v1/customers?phone=5511999998888&page=2")).toBe(
      "/v1/customers?phone&page",
    );
  });

  it("aguenta URL malformada sem estourar", () => {
    expect(caminhoParaLog("não é url?x=1")).toBe("não é url");
  });
});

/* ========================================================================== */
/* Sandbox (item 239)                                                         */
/* ========================================================================== */

describe("adapter de sandbox", () => {
  it("se identifica como sandbox — nunca pode passar por produção", () => {
    _reiniciarSandbox();
    expect(criarSandbox().nome).toBe("sandbox");
  });

  it("devolve a mesma instância, para o fluxo E2E fechar o ciclo", () => {
    _reiniciarSandbox();
    expect(criarSandbox()).toBe(criarSandbox());
  });

  it("pagina os pacientes até o fim", async () => {
    _reiniciarSandbox();
    const cliente = criarSandbox();

    const todos: string[] = [];
    let pagina: number | null = 1;
    let voltas = 0;

    while (pagina !== null && voltas < 20) {
      const lote = await cliente.listarPacientes({ pagina, tamanho: 3 });
      todos.push(...lote.itens.map((p) => p.externalId));
      pagina = lote.proximaPagina;
      voltas += 1;
    }

    expect(todos.length).toBe(8);
    expect(new Set(todos).size).toBe(8); // sem repetição entre páginas
  });

  it("tem os cenários que os fluxos E2E do contrato exigem", async () => {
    _reiniciarSandbox();
    const cliente = criarSandbox();
    const lote = await cliente.listarAgendamentos({
      de: "2020-01-01T00:00:00.000Z",
      ate: "2030-01-01T00:00:00.000Z",
      pagina: 1,
      tamanho: 100,
    });

    const status = lote.itens.map((a) => a.status);
    expect(status).toContain("MISSED"); // item 49
    expect(status).toContain("CANCELLED"); // item 51
    expect(status).toContain("TO_CONFIRM"); // item 50
    expect(status).toContain("COMPLETED"); // item 52
  });

  it("recusa criar agendamento em horário já ocupado — item 21", async () => {
    _reiniciarSandbox();
    const cliente = criarSandbox();

    const slots = await cliente.horariosDisponiveis({
      clinicaExternaId: "clin-1",
      dentistaExternoId: "dent-1",
      diasAFrente: 14,
      clinicId: "c1",
    });
    const alvo = slots[0];
    expect(alvo).toBeDefined();
    if (alvo === undefined) return;

    const primeira = await cliente.criarAgendamento({
      clinicaExternaId: "clin-1",
      pacienteExternoId: "do-1001",
      dentistaExternoId: "dent-1",
      cadeiraExternaId: "cad-1",
      inicioEm: alvo.inicioEm,
      duracaoMinutos: 30,
    });
    expect(primeira.ok).toBe(true);

    // A segunda tentativa no MESMO horário precisa falhar. É a concorrência do
    // item 85, exercitada onde ela pode ser exercitada.
    const segunda = await cliente.criarAgendamento({
      clinicaExternaId: "clin-1",
      pacienteExternoId: "do-1003",
      dentistaExternoId: "dent-1",
      cadeiraExternaId: "cad-1",
      inicioEm: alvo.inicioEm,
      duracaoMinutos: 30,
    });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.codigo).toBe("SLOT_OCUPADO");
  });

  it("não oferece horário que já está ocupado", async () => {
    _reiniciarSandbox();
    const cliente = criarSandbox();

    const slots = await cliente.horariosDisponiveis({
      clinicaExternaId: "clin-1",
      dentistaExternoId: "dent-1",
      diasAFrente: 14,
      clinicId: "c1",
    });

    const lote = await cliente.listarAgendamentos({
      de: "2020-01-01T00:00:00.000Z",
      ate: "2030-01-01T00:00:00.000Z",
      pagina: 1,
      tamanho: 100,
    });

    const ocupados = new Set(
      lote.itens.filter((a) => a.status !== "CANCELLED").map((a) => a.inicioEm),
    );
    for (const s of slots) {
      expect(ocupados.has(s.inicioEm), `ofereceu horário ocupado: ${s.inicioEm}`).toBe(false);
    }
  });

  it("nunca oferece horário no passado", async () => {
    _reiniciarSandbox();
    const slots = await criarSandbox().horariosDisponiveis({
      clinicaExternaId: "clin-1",
      dentistaExternoId: "dent-1",
      diasAFrente: 14,
      clinicId: "c1",
    });
    for (const s of slots) {
      expect(Date.parse(s.inicioEm)).toBeGreaterThan(Date.now() - 60_000);
    }
  });
});
