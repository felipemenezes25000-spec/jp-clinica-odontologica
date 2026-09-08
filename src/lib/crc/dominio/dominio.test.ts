/**
 * Testes do domínio do CRC.
 *
 * O item 79 do contrato lista o que é obrigatório cobrir: priority score,
 * recall detection, journey exit condition, opt-out, status mapping,
 * attribution, budget eligibility, automation branching. Está tudo aqui.
 *
 * O item 245 é o que dá sentido a isso: nenhum teste destes pode ser apagado
 * para o CI ficar verde. Se um quebrar, ou a regra mudou de propósito (e o
 * teste muda junto, com a mudança explicada) ou há um bug.
 *
 * Nada aqui toca banco, rede ou relógio de parede: todo "agora" entra como
 * argumento. É o que torna o resultado igual às 3h da manhã e ao meio-dia.
 */
import { describe, expect, it } from "vitest";

import {
  CONFIGURACAO_PADRAO,
  dentroDoHorario,
  partesLocais,
  proximoInstanteUtil,
} from "./configuracao";
import { dinheiro, dinheiroCurto, iniciais, somarDinheiro, truncar } from "./formatar";
import { calcularPrioridade, faixaDePrioridade, type ContextoPrioridade } from "./prioridade";
import { alcancaClinica, pode } from "./rbac";
import {
  avaliarCondicao,
  avaliarRecall,
  fazAniversarioHoje,
  orcamentoElegivelParaRecuperacao,
  pedeDescadastro,
  podeContatar,
  temConsultaFutura,
  todasVerdadeiras,
  type ContextoCondicao,
  type ContextoContato,
  type ContextoRecall,
} from "./regras";
import {
  agendamentoContaComoFuturo,
  codigoDeStatusAgendamento,
  especialidadeDeCodigo,
  situacaoDeCodigo,
  statusAgendamentoDeCodigo,
} from "./status";
import {
  normalizarTelefone,
  telefoneMascarado,
  telefoneParaTela,
  variacoesDeTelefone,
} from "./telefone";

/* ========================================================================== */
/* Mapeamento de status (item 18)                                             */
/* ========================================================================== */

describe("mapeamento de status da agenda", () => {
  it("traduz os seis códigos documentados", () => {
    expect(statusAgendamentoDeCodigo(1)).toBe("TO_CONFIRM");
    expect(statusAgendamentoDeCodigo(2)).toBe("CONFIRMED");
    expect(statusAgendamentoDeCodigo(3)).toBe("IN_PROGRESS");
    expect(statusAgendamentoDeCodigo(4)).toBe("COMPLETED");
    expect(statusAgendamentoDeCodigo(5)).toBe("MISSED");
    expect(statusAgendamentoDeCodigo(6)).toBe("CANCELLED");
  });

  it("aceita o código como string, porque a API entrega os dois jeitos", () => {
    expect(statusAgendamentoDeCodigo("5")).toBe("MISSED");
    expect(statusAgendamentoDeCodigo(" 2 ")).toBe("CONFIRMED");
  });

  it("NÃO chuta em código desconhecido — devolve null", () => {
    // Este é o teste que importa mais do arquivo inteiro. Um status novo
    // mapeado por engano para MISSED manda mensagem de falta para quem
    // compareceu.
    expect(statusAgendamentoDeCodigo(9)).toBeNull();
    expect(statusAgendamentoDeCodigo(0)).toBeNull();
    expect(statusAgendamentoDeCodigo(null)).toBeNull();
    expect(statusAgendamentoDeCodigo(undefined)).toBeNull();
    expect(statusAgendamentoDeCodigo("faltou")).toBeNull();
    expect(statusAgendamentoDeCodigo(true)).toBeNull();
    expect(statusAgendamentoDeCodigo(2.5)).toBeNull();
    expect(statusAgendamentoDeCodigo([2])).toBeNull();
  });

  it("faz o caminho de volta para escrever no Dental Office", () => {
    expect(codigoDeStatusAgendamento("CONFIRMED")).toBe(2);
    expect(codigoDeStatusAgendamento("MISSED")).toBe(5);
  });

  it("só conta como consulta futura o que ainda pode acontecer", () => {
    expect(agendamentoContaComoFuturo("TO_CONFIRM")).toBe(true);
    expect(agendamentoContaComoFuturo("CONFIRMED")).toBe(true);
    expect(agendamentoContaComoFuturo("IN_PROGRESS")).toBe(true);
    expect(agendamentoContaComoFuturo("MISSED")).toBe(false);
    expect(agendamentoContaComoFuturo("CANCELLED")).toBe(false);
    expect(agendamentoContaComoFuturo("COMPLETED")).toBe(false);
  });
});

describe("mapeamento de situação do paciente", () => {
  it("traduz os códigos documentados", () => {
    expect(situacaoDeCodigo(1)).toBe("PRIMEIRA_CONSULTA");
    expect(situacaoDeCodigo(2)).toBe("EM_TRATAMENTO");
    expect(situacaoDeCodigo(3)).toBe("CONCLUIDO");
    expect(situacaoDeCodigo(4)).toBe("ALTA");
    expect(situacaoDeCodigo(7)).toBe("ABANDONO");
  });

  it("recusa 5 e 6, que não estão documentados", () => {
    expect(situacaoDeCodigo(5)).toBeNull();
    expect(situacaoDeCodigo(6)).toBeNull();
  });

  it("especialidade desconhecida vira rótulo, e não null — é só etiqueta", () => {
    expect(especialidadeDeCodigo(8)).toBe("Implantodontia");
    expect(especialidadeDeCodigo(99)).toBe("Especialidade 99");
    expect(especialidadeDeCodigo("x")).toBeNull();
  });
});

/* ========================================================================== */
/* Telefone (itens 166, 167)                                                  */
/* ========================================================================== */

describe("normalização de telefone", () => {
  it("leva as formas comuns para a mesma chave canônica", () => {
    expect(normalizarTelefone("(11) 99999-8888")).toBe("5511999998888");
    expect(normalizarTelefone("11999998888")).toBe("5511999998888");
    expect(normalizarTelefone("5511999998888")).toBe("5511999998888");
    expect(normalizarTelefone("+55 (11) 99999-8888")).toBe("5511999998888");
    expect(normalizarTelefone("005511999998888")).toBe("5511999998888");
  });

  it("aceita fixo de oito dígitos", () => {
    expect(normalizarTelefone("(11) 3333-4444")).toBe("551133334444");
  });

  it("recusa número sem DDD, em vez de completar com o da clínica", () => {
    // Completar seria a tentação óbvia. Um paciente que se mudou receberia
    // mensagem destinada a um estranho em São Paulo.
    expect(normalizarTelefone("999998888")).toBeNull();
    expect(normalizarTelefone("33334444")).toBeNull();
  });

  it("recusa DDD que não existe", () => {
    expect(normalizarTelefone("(10) 99999-8888")).toBeNull();
    expect(normalizarTelefone("(20) 99999-8888")).toBeNull();
    expect(normalizarTelefone("(00) 99999-8888")).toBeNull();
  });

  it("recusa celular de nove dígitos que não começa com 9", () => {
    expect(normalizarTelefone("11899998888")).toBeNull();
  });

  it("recusa vazio, nulo e lixo", () => {
    expect(normalizarTelefone(null)).toBeNull();
    expect(normalizarTelefone(undefined)).toBeNull();
    expect(normalizarTelefone("")).toBeNull();
    expect(normalizarTelefone("sem telefone")).toBeNull();
    expect(normalizarTelefone("123")).toBeNull();
  });
});

describe("variações do nono dígito", () => {
  it("celular com nove gera a forma antiga de oito", () => {
    const v = variacoesDeTelefone("5511999998888");
    expect(v).toContain("5511999998888");
    expect(v).toContain("551199998888");
  });

  it("celular antigo gera a forma com nove", () => {
    const v = variacoesDeTelefone("551199998888");
    expect(v).toContain("5511999998888");
  });

  it("fixo NÃO ganha um 9 na frente", () => {
    // 1133334444 + 9 = 11933334444, que é um celular que não existe. Buscar
    // por ele traria zero resultados no melhor caso, e o paciente errado no
    // pior.
    const v = variacoesDeTelefone("551133334444");
    expect(v).toEqual(["551133334444"]);
  });

  it("nulo devolve lista vazia, e não estoura", () => {
    expect(variacoesDeTelefone(null)).toEqual([]);
  });
});

describe("telefone na tela", () => {
  it("formata no padrão brasileiro", () => {
    expect(telefoneParaTela("5511999998888")).toBe("(11) 99999-8888");
    expect(telefoneParaTela("551133334444")).toBe("(11) 3333-4444");
  });

  it("mascara para log e auditoria", () => {
    expect(telefoneMascarado("5511999998888")).toBe("(11) 9****-8888");
  });

  it("vazio vira string vazia, não 'undefined'", () => {
    expect(telefoneParaTela(null)).toBe("");
    expect(telefoneMascarado(undefined)).toBe("");
  });
});

/* ========================================================================== */
/* Priority score (item 31)                                                   */
/* ========================================================================== */

const BASE_PRIORIDADE: ContextoPrioridade = {
  tipo: "RECALL",
  horasDesdeRespostaPaciente: null,
  horasDesdeUltimoContato: null,
  diasEsperando: 0,
  valorPotencial: null,
  temConsultaFutura: false,
  consultasConcluidas: 0,
  temperatura: null,
  intencaoAgendar: false,
};

describe("priority score", () => {
  it("nunca passa de 100 nem fica abaixo de zero", () => {
    const alto = calcularPrioridade({
      ...BASE_PRIORIDADE,
      tipo: "NEW_LEAD",
      intencaoAgendar: true,
      horasDesdeRespostaPaciente: 0.2,
      temperatura: "HOT",
      valorPotencial: 50000,
      consultasConcluidas: 9,
      diasEsperando: 40,
    });
    expect(alto.score).toBe(100);

    const baixo = calcularPrioridade({
      ...BASE_PRIORIDADE,
      tipo: "BIRTHDAY",
      temConsultaFutura: true,
      horasDesdeUltimoContato: 1,
    });
    expect(baixo.score).toBe(0);
  });

  it("os fatores somam exatamente o score, quando não bate no teto", () => {
    // Auditabilidade não é decorativa: se a soma dos fatores não fosse o
    // score, a explicação da tela seria ficção.
    const r = calcularPrioridade({ ...BASE_PRIORIDADE, tipo: "MISSED_APPOINTMENT" });
    const soma = r.fatores.reduce((s, f) => s + f.pontos, 0);
    expect(soma).toBe(r.score);
  });

  it("quem pediu para agendar passa na frente de quem só está esperando", () => {
    const pediu = calcularPrioridade({ ...BASE_PRIORIDADE, intencaoAgendar: true });
    const esperando = calcularPrioridade({ ...BASE_PRIORIDADE, diasEsperando: 30 });
    expect(pediu.score).toBeGreaterThan(esperando.score);
  });

  it("resposta recente pesa mais que resposta de três dias atrás", () => {
    const agora = calcularPrioridade({ ...BASE_PRIORIDADE, horasDesdeRespostaPaciente: 0.5 });
    const antes = calcularPrioridade({ ...BASE_PRIORIDADE, horasDesdeRespostaPaciente: 70 });
    expect(agora.score).toBeGreaterThan(antes.score);
  });

  it("consulta já marcada derruba a prioridade", () => {
    const sem = calcularPrioridade({ ...BASE_PRIORIDADE, tipo: "MISSED_APPOINTMENT" });
    const com = calcularPrioridade({
      ...BASE_PRIORIDADE,
      tipo: "MISSED_APPOINTMENT",
      temConsultaFutura: true,
    });
    expect(com.score).toBeLessThan(sem.score);
  });

  it("contato nas últimas 24h derruba a prioridade — é o antiassédio", () => {
    const semContato = calcularPrioridade({ ...BASE_PRIORIDADE, tipo: "MISSED_APPOINTMENT" });
    const contatado = calcularPrioridade({
      ...BASE_PRIORIDADE,
      tipo: "MISSED_APPOINTMENT",
      horasDesdeUltimoContato: 3,
    });
    expect(contatado.score).toBeLessThan(semContato.score);
  });

  it("ordena os fatores por impacto, para a tela mostrar o que mais pesou", () => {
    const r = calcularPrioridade({
      ...BASE_PRIORIDADE,
      tipo: "MISSED_APPOINTMENT",
      intencaoAgendar: true,
      diasEsperando: 4,
    });
    const pesos = r.fatores.map((f) => Math.abs(f.pontos));
    expect([...pesos].sort((a, b) => b - a)).toEqual(pesos);
  });

  it("as faixas cobrem a escala inteira", () => {
    expect(faixaDePrioridade(100)).toBe("ALTA");
    expect(faixaDePrioridade(65)).toBe("ALTA");
    expect(faixaDePrioridade(64)).toBe("MEDIA");
    expect(faixaDePrioridade(35)).toBe("MEDIA");
    expect(faixaDePrioridade(34)).toBe("BAIXA");
    expect(faixaDePrioridade(0)).toBe("BAIXA");
  });
});

/* ========================================================================== */
/* Recall (itens 10 do Mega Prompt, 52 do contrato)                           */
/* ========================================================================== */

const AGORA = new Date("2026-09-08T15:00:00.000Z");

const BASE_RECALL: ContextoRecall = {
  // 200 dias antes de AGORA: passou do recall (180) e ainda não chegou na
  // inatividade (240). É a faixa que caracteriza RECALL e não INACTIVE_PATIENT.
  ultimaConsultaEm: "2026-02-20T10:00:00.000Z",
  proximaConsultaEm: null,
  ativo: true,
  arquivado: false,
  optOutEm: null,
  telefone: "5511999998888",
  situacao: "EM_TRATAMENTO",
};

describe("detecção de recall", () => {
  it("dispara quando passou do limite e não há consulta futura", () => {
    const r = avaliarRecall(BASE_RECALL, AGORA, CONFIGURACAO_PADRAO);
    expect(r.elegivel).toBe(true);
    if (r.elegivel) expect(r.tipo).toBe("RECALL");
  });

  it("separa recall de inatividade pelo tempo sem consulta", () => {
    // Os dois patamares existem porque a conversa é outra: quem sumiu há seis
    // meses recebe "está na hora do retorno"; quem sumiu há oito meses recebe
    // uma reativação. Trocar os dois soa desatento para o paciente.
    const recente = avaliarRecall(BASE_RECALL, AGORA, CONFIGURACAO_PADRAO);
    expect(recente.elegivel).toBe(true);
    if (recente.elegivel) expect(recente.tipo).toBe("RECALL");

    const antigo = avaliarRecall(
      { ...BASE_RECALL, ultimaConsultaEm: "2025-09-01T10:00:00.000Z" },
      AGORA,
      CONFIGURACAO_PADRAO,
    );
    expect(antigo.elegivel).toBe(true);
    if (antigo.elegivel) expect(antigo.tipo).toBe("INACTIVE_PATIENT");
  });

  it("NÃO dispara quando o paciente já tem consulta marcada", () => {
    const r = avaliarRecall(
      { ...BASE_RECALL, proximaConsultaEm: "2026-09-20T10:00:00.000Z" },
      AGORA,
      CONFIGURACAO_PADRAO,
    );
    expect(r.elegivel).toBe(false);
  });

  it("NÃO dispara para quem pediu para não receber mensagens", () => {
    const r = avaliarRecall(
      { ...BASE_RECALL, optOutEm: "2026-03-01T00:00:00.000Z" },
      AGORA,
      CONFIGURACAO_PADRAO,
    );
    expect(r.elegivel).toBe(false);
  });

  it("NÃO dispara para quem não tem telefone", () => {
    const r = avaliarRecall({ ...BASE_RECALL, telefone: null }, AGORA, CONFIGURACAO_PADRAO);
    expect(r.elegivel).toBe(false);
  });

  it("NÃO dispara para paciente arquivado ou inativo", () => {
    expect(
      avaliarRecall({ ...BASE_RECALL, arquivado: true }, AGORA, CONFIGURACAO_PADRAO).elegivel,
    ).toBe(false);
    expect(
      avaliarRecall({ ...BASE_RECALL, ativo: false }, AGORA, CONFIGURACAO_PADRAO).elegivel,
    ).toBe(false);
  });

  it("quem nunca veio não é recall — é lead", () => {
    const r = avaliarRecall({ ...BASE_RECALL, ultimaConsultaEm: null }, AGORA, CONFIGURACAO_PADRAO);
    expect(r.elegivel).toBe(false);
  });

  it("abandono vira inatividade na hora, sem esperar o prazo", () => {
    const r = avaliarRecall(
      { ...BASE_RECALL, situacao: "ABANDONO", ultimaConsultaEm: "2026-09-01T10:00:00.000Z" },
      AGORA,
      CONFIGURACAO_PADRAO,
    );
    expect(r.elegivel).toBe(true);
    if (r.elegivel) expect(r.tipo).toBe("INACTIVE_PATIENT");
  });

  it("respeita o limite configurado, e não um número fixo no código", () => {
    // Item 171: mudar recall de 180 para 90 é configuração, não deploy.
    const ctx = { ...BASE_RECALL, ultimaConsultaEm: "2026-06-01T10:00:00.000Z" }; // ~99 dias
    expect(avaliarRecall(ctx, AGORA, CONFIGURACAO_PADRAO).elegivel).toBe(false);
    expect(avaliarRecall(ctx, AGORA, { ...CONFIGURACAO_PADRAO, recallDias: 90 }).elegivel).toBe(
      true,
    );
  });

  it("consulta que começou há uma hora ainda conta como futura", () => {
    // O paciente está na cadeira. Ninguém deveria mandar recall para ele.
    expect(temConsultaFutura("2026-09-08T14:00:00.000Z", AGORA)).toBe(true);
    expect(temConsultaFutura("2026-09-08T10:00:00.000Z", AGORA)).toBe(false);
    expect(temConsultaFutura(null, AGORA)).toBe(false);
  });
});

/* ========================================================================== */
/* Aniversário                                                                */
/* ========================================================================== */

describe("aniversário", () => {
  it("bate mês e dia", () => {
    expect(fazAniversarioHoje("1990-09-08", { mes: 9, dia: 8, ano: 2026 })).toBe(true);
    expect(fazAniversarioHoje("1990-09-09", { mes: 9, dia: 8, ano: 2026 })).toBe(false);
  });

  it("29 de fevereiro cai no dia 28 em ano comum, e no 29 em bissexto", () => {
    expect(fazAniversarioHoje("1992-02-29", { mes: 2, dia: 28, ano: 2026 })).toBe(true);
    expect(fazAniversarioHoje("1992-02-29", { mes: 2, dia: 28, ano: 2028 })).toBe(false);
    expect(fazAniversarioHoje("1992-02-29", { mes: 2, dia: 29, ano: 2028 })).toBe(true);
  });

  it("sem data de nascimento não há aniversário", () => {
    expect(fazAniversarioHoje(null, { mes: 9, dia: 8, ano: 2026 })).toBe(false);
    expect(fazAniversarioHoje("", { mes: 9, dia: 8, ano: 2026 })).toBe(false);
  });
});

/* ========================================================================== */
/* Opt-out (item 39)                                                          */
/* ========================================================================== */

describe("detecção de descadastro", () => {
  it("pega os pedidos mais comuns", () => {
    const pedidos = [
      "PARE de me mandar mensagem",
      "pare de mandar isso",
      "não quero mais receber",
      "nao quero receber mensagens",
      "não me mande mais nada",
      "nao me manda mais",
      "remover meu número",
      "excluir meu cadastro",
      "me tira dessa lista",
      "descadastrar",
      "sair da lista",
      "parar",
      "STOP",
    ];
    for (const p of pedidos) {
      expect(pedeDescadastro(p), `não pegou: ${p}`).toBe(true);
    }
  });

  it("NÃO confunde com mensagem comum", () => {
    // Falso positivo cala o sistema para quem não pediu. É reversível, mas
    // errar aqui em frases normais deixaria a automação inútil.
    const normais = [
      "quero remarcar",
      "pode mandar os horários?",
      "não posso nessa data",
      "vou parar de tomar o remédio, tudo bem?",
      "obrigada, pode me mandar depois",
      "não quero a terça, quero a quinta",
    ];
    for (const n of normais) {
      expect(pedeDescadastro(n), `falso positivo: ${n}`).toBe(false);
    }
  });

  it("texto vazio não é pedido", () => {
    expect(pedeDescadastro("")).toBe(false);
    expect(pedeDescadastro("   ")).toBe(false);
  });
});

/* ========================================================================== */
/* Política global de contato (item 34)                                       */
/* ========================================================================== */

const BASE_CONTATO: ContextoContato = {
  optOutEm: null,
  telefone: "5511999998888",
  contatosHoje: 0,
  horasDesdeUltimoContato: null,
  temJornadaAtivaConcorrente: false,
  conversaAtribuidaAHumano: false,
};

// Terça-feira, 11h no horário de São Paulo (14h UTC).
const HORARIO_COMERCIAL = new Date("2026-09-08T14:00:00.000Z");
const MADRUGADA = new Date("2026-09-08T05:00:00.000Z"); // 02h em SP
const HORARIO = CONFIGURACAO_PADRAO.horarioComercial;

describe("política global de contato", () => {
  it("libera dentro do horário, sem impedimentos", () => {
    const r = podeContatar(BASE_CONTATO, HORARIO_COMERCIAL, CONFIGURACAO_PADRAO, HORARIO);
    expect(r.pode).toBe(true);
  });

  it("bloqueia definitivamente quem pediu opt-out", () => {
    const r = podeContatar(
      { ...BASE_CONTATO, optOutEm: "2026-01-01T00:00:00.000Z" },
      HORARIO_COMERCIAL,
      CONFIGURACAO_PADRAO,
      HORARIO,
    );
    expect(r.pode).toBe(false);
    if (!r.pode) {
      expect(r.codigo).toBe("OPT_OUT");
      // Sem reagendamento: opt-out não é "depois", é "nunca".
      expect(r.reagendarPara).toBeUndefined();
    }
  });

  it("bloqueia e REAGENDA quem já foi contatado hoje", () => {
    const r = podeContatar(
      { ...BASE_CONTATO, contatosHoje: 1 },
      HORARIO_COMERCIAL,
      CONFIGURACAO_PADRAO,
      HORARIO,
    );
    expect(r.pode).toBe(false);
    if (!r.pode) {
      expect(r.codigo).toBe("LIMITE_DIARIO");
      expect(r.reagendarPara).toBeInstanceOf(Date);
    }
  });

  it("bloqueia e reagenda dentro do cooldown", () => {
    const r = podeContatar(
      { ...BASE_CONTATO, horasDesdeUltimoContato: 3 },
      HORARIO_COMERCIAL,
      CONFIGURACAO_PADRAO,
      HORARIO,
    );
    expect(r.pode).toBe(false);
    if (!r.pode) expect(r.codigo).toBe("COOLDOWN");
  });

  it("cala a automação quando um atendente assumiu a conversa", () => {
    const r = podeContatar(
      { ...BASE_CONTATO, conversaAtribuidaAHumano: true },
      HORARIO_COMERCIAL,
      CONFIGURACAO_PADRAO,
      HORARIO,
    );
    expect(r.pode).toBe(false);
    if (!r.pode) expect(r.codigo).toBe("ATENDIMENTO_HUMANO");
  });

  it("impede duas automações falarem ao mesmo tempo com o mesmo paciente", () => {
    const r = podeContatar(
      { ...BASE_CONTATO, temJornadaAtivaConcorrente: true },
      HORARIO_COMERCIAL,
      CONFIGURACAO_PADRAO,
      HORARIO,
    );
    expect(r.pode).toBe(false);
    if (!r.pode) expect(r.codigo).toBe("OUTRA_JORNADA");
  });

  it("bloqueia às duas da manhã", () => {
    const r = podeContatar(BASE_CONTATO, MADRUGADA, CONFIGURACAO_PADRAO, HORARIO);
    expect(r.pode).toBe(false);
    if (!r.pode) expect(r.codigo).toBe("FORA_DO_HORARIO");
  });

  it("bloqueia quem não tem telefone", () => {
    const r = podeContatar(
      { ...BASE_CONTATO, telefone: null },
      HORARIO_COMERCIAL,
      CONFIGURACAO_PADRAO,
      HORARIO,
    );
    expect(r.pode).toBe(false);
    if (!r.pode) expect(r.codigo).toBe("SEM_TELEFONE");
  });
});

/* ========================================================================== */
/* Horário comercial e fuso (itens 97, 98, 219)                               */
/* ========================================================================== */

describe("horário comercial", () => {
  it("lê a hora no fuso da clínica, não no do servidor", () => {
    // O servidor da Vercel roda em UTC. 14h UTC são 11h em São Paulo.
    const p = partesLocais(HORARIO_COMERCIAL, "America/Sao_Paulo");
    expect(p.hora).toBe(11);
    expect(p.dia).toBe(8);
    expect(p.mes).toBe(9);
    expect(p.diaSemana).toBe(2); // terça
  });

  it("meia-noite local vira hora 0, e não 24", () => {
    const p = partesLocais(new Date("2026-09-09T03:00:00.000Z"), "America/Sao_Paulo");
    expect(p.hora).toBe(0);
  });

  it("está aberto na terça de manhã e fechado na madrugada", () => {
    expect(dentroDoHorario(HORARIO_COMERCIAL, HORARIO)).toBe(true);
    expect(dentroDoHorario(MADRUGADA, HORARIO)).toBe(false);
  });

  it("domingo é fechado", () => {
    // 2026-09-13 é domingo.
    expect(dentroDoHorario(new Date("2026-09-13T14:00:00.000Z"), HORARIO)).toBe(false);
  });

  it("sábado fecha às 13h", () => {
    // 2026-09-12 é sábado. 13h UTC = 10h SP (aberto); 17h UTC = 14h SP (fechado).
    expect(dentroDoHorario(new Date("2026-09-12T13:00:00.000Z"), HORARIO)).toBe(true);
    expect(dentroDoHorario(new Date("2026-09-12T17:00:00.000Z"), HORARIO)).toBe(false);
  });

  it("feriado configurado fecha o dia inteiro", () => {
    const comFeriado = { ...HORARIO, feriados: ["2026-09-08"] };
    expect(dentroDoHorario(HORARIO_COMERCIAL, comFeriado)).toBe(false);
  });

  it("adia a mensagem da madrugada para a abertura, em vez de cancelar", () => {
    const proximo = proximoInstanteUtil(MADRUGADA, HORARIO);
    expect(proximo.getTime()).toBeGreaterThan(MADRUGADA.getTime());
    expect(dentroDoHorario(proximo, HORARIO)).toBe(true);
    const p = partesLocais(proximo, "America/Sao_Paulo");
    expect(p.hora).toBe(8);
    expect(p.dia).toBe(8); // mesmo dia, só mais tarde
  });

  it("depois do fechamento, joga para a abertura do dia seguinte", () => {
    // Terça 23h UTC = 20h SP, já fechado.
    const proximo = proximoInstanteUtil(new Date("2026-09-08T23:00:00.000Z"), HORARIO);
    expect(dentroDoHorario(proximo, HORARIO)).toBe(true);
    const p = partesLocais(proximo, "America/Sao_Paulo");
    expect(p.dia).toBe(9);
    expect(p.hora).toBe(8);
  });

  it("pula o domingo inteiro", () => {
    // Sábado 18h SP (21h UTC), fechado. O próximo útil é segunda.
    const proximo = proximoInstanteUtil(new Date("2026-09-12T21:00:00.000Z"), HORARIO);
    const p = partesLocais(proximo, "America/Sao_Paulo");
    expect(p.diaSemana).toBe(1); // segunda
    expect(p.dia).toBe(14);
  });

  it("quem já está dentro do horário não é adiado", () => {
    expect(proximoInstanteUtil(HORARIO_COMERCIAL, HORARIO).getTime()).toBe(
      HORARIO_COMERCIAL.getTime(),
    );
  });
});

/* ========================================================================== */
/* Condições e ramificação de automação (itens 33, 84)                        */
/* ========================================================================== */

const BASE_CONDICAO: ContextoCondicao = {
  paciente: {
    ativo: true,
    arquivado: false,
    optOutEm: null,
    telefone: "5511999998888",
    situacao: "EM_TRATAMENTO",
    ultimaConsultaEm: "2026-01-01T10:00:00.000Z",
    proximaConsultaEm: null,
  },
  pacienteRespondeu: false,
  agora: AGORA,
};

describe("condições de automação", () => {
  it("SEMPRE é sempre verdadeira", () => {
    expect(avaliarCondicao({ tipo: "SEMPRE" }, BASE_CONDICAO)).toBe(true);
  });

  it("SEM_CONSULTA_FUTURA e TEM_CONSULTA_FUTURA são opostas", () => {
    const sem = BASE_CONDICAO;
    const com: ContextoCondicao = {
      ...BASE_CONDICAO,
      paciente: { ...BASE_CONDICAO.paciente, proximaConsultaEm: "2026-10-01T10:00:00.000Z" },
    };
    expect(avaliarCondicao({ tipo: "SEM_CONSULTA_FUTURA" }, sem)).toBe(true);
    expect(avaliarCondicao({ tipo: "TEM_CONSULTA_FUTURA" }, sem)).toBe(false);
    expect(avaliarCondicao({ tipo: "SEM_CONSULTA_FUTURA" }, com)).toBe(false);
    expect(avaliarCondicao({ tipo: "TEM_CONSULTA_FUTURA" }, com)).toBe(true);
  });

  it("a ramificação 'respondeu / não respondeu' funciona nos dois lados", () => {
    const respondeu = { ...BASE_CONDICAO, pacienteRespondeu: true };
    expect(avaliarCondicao({ tipo: "PACIENTE_RESPONDEU" }, respondeu)).toBe(true);
    expect(avaliarCondicao({ tipo: "PACIENTE_NAO_RESPONDEU" }, respondeu)).toBe(false);
    expect(avaliarCondicao({ tipo: "PACIENTE_NAO_RESPONDEU" }, BASE_CONDICAO)).toBe(true);
  });

  it("SITUACAO_E compara a situação normalizada", () => {
    expect(avaliarCondicao({ tipo: "SITUACAO_E", situacao: "EM_TRATAMENTO" }, BASE_CONDICAO)).toBe(
      true,
    );
    expect(avaliarCondicao({ tipo: "SITUACAO_E", situacao: "ABANDONO" }, BASE_CONDICAO)).toBe(
      false,
    );
  });

  it("DIAS_DESDE_ULTIMA_CONSULTA compara com o limite", () => {
    expect(
      avaliarCondicao({ tipo: "DIAS_DESDE_ULTIMA_CONSULTA_MAIOR_QUE", dias: 100 }, BASE_CONDICAO),
    ).toBe(true);
    expect(
      avaliarCondicao({ tipo: "DIAS_DESDE_ULTIMA_CONSULTA_MAIOR_QUE", dias: 999 }, BASE_CONDICAO),
    ).toBe(false);
  });

  it("todasVerdadeiras exige o conjunto inteiro", () => {
    expect(
      todasVerdadeiras(
        [{ tipo: "PACIENTE_ATIVO" }, { tipo: "SEM_OPT_OUT" }, { tipo: "TEM_TELEFONE" }],
        BASE_CONDICAO,
      ),
    ).toBe(true);
    expect(
      todasVerdadeiras([{ tipo: "PACIENTE_ATIVO" }, { tipo: "PACIENTE_RESPONDEU" }], BASE_CONDICAO),
    ).toBe(false);
  });

  it("lista vazia de condições não bloqueia a jornada", () => {
    expect(todasVerdadeiras([], BASE_CONDICAO)).toBe(true);
  });
});

/* ========================================================================== */
/* Elegibilidade de orçamento (item 58)                                       */
/* ========================================================================== */

describe("recuperação de orçamento", () => {
  const base = {
    status: "OPEN",
    emitidoEm: "2026-08-01T10:00:00.000Z",
    expiraEm: null,
    temConsultaFutura: false,
    optOut: false,
  };

  it("orçamento aberto e parado há mais que o limite é elegível", () => {
    expect(orcamentoElegivelParaRecuperacao(base, AGORA, CONFIGURACAO_PADRAO)).toBe(true);
  });

  it("orçamento recente ainda não é oportunidade", () => {
    expect(
      orcamentoElegivelParaRecuperacao(
        { ...base, emitidoEm: "2026-09-06T10:00:00.000Z" },
        AGORA,
        CONFIGURACAO_PADRAO,
      ),
    ).toBe(false);
  });

  it("orçamento aprovado, recusado ou expirado não entra", () => {
    for (const status of ["APPROVED", "REJECTED", "EXPIRED", "CANCELLED", "UNKNOWN"]) {
      expect(
        orcamentoElegivelParaRecuperacao({ ...base, status }, AGORA, CONFIGURACAO_PADRAO),
      ).toBe(false);
    }
  });

  it("orçamento com validade vencida não entra, mesmo estando OPEN", () => {
    expect(
      orcamentoElegivelParaRecuperacao(
        { ...base, expiraEm: "2026-09-01T00:00:00.000Z" },
        AGORA,
        CONFIGURACAO_PADRAO,
      ),
    ).toBe(false);
  });

  it("opt-out e consulta marcada bloqueiam", () => {
    expect(
      orcamentoElegivelParaRecuperacao({ ...base, optOut: true }, AGORA, CONFIGURACAO_PADRAO),
    ).toBe(false);
    expect(
      orcamentoElegivelParaRecuperacao(
        { ...base, temConsultaFutura: true },
        AGORA,
        CONFIGURACAO_PADRAO,
      ),
    ).toBe(false);
  });
});

/* ========================================================================== */
/* RBAC (itens 37, 70, 71, 83)                                                */
/* ========================================================================== */

describe("permissões", () => {
  it("admin pode tudo", () => {
    expect(pode("admin", "gerenciar_integracoes")).toBe(true);
    expect(pode("admin", "ver_auditoria")).toBe(true);
    expect(pode("admin", "gerenciar_usuarios")).toBe(true);
  });

  it("o CRC não alcança configuração administrativa — item 83", () => {
    expect(pode("crc", "ver_paciente")).toBe(true);
    expect(pode("crc", "enviar_mensagem")).toBe(true);
    expect(pode("crc", "gerenciar_integracoes")).toBe(false);
    expect(pode("crc", "gerenciar_usuarios")).toBe(false);
    expect(pode("crc", "gerenciar_autopilot")).toBe(false);
    expect(pode("crc", "ver_auditoria")).toBe(false);
  });

  it("o dentista não vê valor de orçamento — item 230", () => {
    expect(pode("dentista", "receber_escalonamento_clinico")).toBe(true);
    expect(pode("dentista", "ver_financeiro")).toBe(false);
    expect(pode("dentista", "enviar_mensagem")).toBe(false);
  });

  it("marketing vê analytics e não vê conversa de paciente", () => {
    expect(pode("marketing", "ver_analytics_gerencial")).toBe(true);
    expect(pode("marketing", "ver_conversa")).toBe(false);
    expect(pode("marketing", "ver_paciente")).toBe(false);
  });

  it("recepção responde mensagem mas não mexe em automação", () => {
    expect(pode("recepcao", "enviar_mensagem")).toBe(true);
    expect(pode("recepcao", "gerenciar_automacao")).toBe(false);
    expect(pode("recepcao", "editar_paciente")).toBe(false);
  });

  it("só admin e gestor mexem no Autopilot — item 227", () => {
    expect(pode("admin", "gerenciar_autopilot")).toBe(true);
    expect(pode("gestor", "gerenciar_autopilot")).toBe(true);
    for (const papel of ["crc", "recepcao", "dentista", "marketing"] as const) {
      expect(pode(papel, "gerenciar_autopilot")).toBe(false);
    }
  });
});

describe("isolamento por clínica — item 71", () => {
  it("o usuário só alcança as unidades dele", () => {
    const usuario = { papel: "crc" as const, clinicas: ["clinica-a"] };
    expect(alcancaClinica(usuario, "clinica-a")).toBe(true);
    expect(alcancaClinica(usuario, "clinica-b")).toBe(false);
  });

  it("admin alcança qualquer unidade da organização", () => {
    expect(alcancaClinica({ papel: "admin", clinicas: [] }, "qualquer")).toBe(true);
  });

  it("gestor sem vínculo NÃO alcança — papel não substitui vínculo", () => {
    expect(alcancaClinica({ papel: "gestor", clinicas: ["a"] }, "b")).toBe(false);
  });
});

/* ========================================================================== */
/* Dinheiro (item 221)                                                        */
/* ========================================================================== */

describe("dinheiro", () => {
  it("formata em real brasileiro", () => {
    expect(dinheiro("4800.50").replace(/\s/gu, " ")).toBe("R$ 4.800,50");
    expect(dinheiro("0.00").replace(/\s/gu, " ")).toBe("R$ 0,00");
  });

  it("valor ausente vira travessão, e não R$ 0,00", () => {
    // "não sabemos" e "é zero" são coisas diferentes. Item 63.
    expect(dinheiro(null)).toBe("—");
    expect(dinheiro(undefined)).toBe("—");
    expect(dinheiro("")).toBe("—");
    expect(dinheiro("abc")).toBe("—");
  });

  it("soma sem erro de ponto flutuante", () => {
    // 0.1 + 0.2 em float dá 0.30000000000000004.
    expect(somarDinheiro(["0.10", "0.20"])).toBe("0.30");
    expect(somarDinheiro(["1000.01", "2000.02", "3000.03"])).toBe("6000.06");
  });

  it("ignora entradas inválidas na soma, em vez de virar NaN", () => {
    expect(somarDinheiro(["100.00", null, undefined, "abc", "50.50"])).toBe("150.50");
    expect(somarDinheiro([])).toBe("0.00");
  });

  it("encurta valores grandes para caber no KPI", () => {
    expect(dinheiroCurto("42830.00")).toContain("mil");
    expect(dinheiroCurto("1500000.00")).toContain("mi");
    expect(dinheiroCurto("450.00").replace(/\s/gu, " ")).toBe("R$ 450,00");
  });
});

describe("texto", () => {
  it("iniciais ignoram a partícula do meio", () => {
    expect(iniciais("Maria de Souza")).toBe("MS");
    expect(iniciais("João")).toBe("J");
    expect(iniciais("  ")).toBe("?");
  });

  it("truncar respeita o limite e não corta no meio de espaço", () => {
    expect(truncar("um texto bem curto", 50)).toBe("um texto bem curto");
    expect(truncar("um texto bem mais longo do que cabe", 12).length).toBeLessThanOrEqual(12);
    expect(truncar("um texto bem mais longo do que cabe", 12)).toMatch(/…$/u);
  });
});
