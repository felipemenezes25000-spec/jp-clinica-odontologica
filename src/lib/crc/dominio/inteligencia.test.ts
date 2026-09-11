/**
 * A inteligência vertical — Fase H.
 *
 * O QUE ESTES TESTES PROTEGEM não é o cálculo: é a HONESTIDADE dele. Cada um dos
 * cinco módulos tem uma forma característica de mentir, e quase todo teste aqui
 * ataca essa forma:
 *
 *   BEST SEND TIME    anunciar um horário preferido para quem responde a
 *                     qualquer hora.
 *   CHURN             pôr no topo da lista quem já está voltando na terça.
 *   OBJEÇÕES          transformar a maior fatia de um bolo repartido em
 *                     diretriz ("o problema é preço", com 20%).
 *   PRÓXIMA AÇÃO      deixar três orçamentos grandes ocuparem a lista inteira.
 *   A/B               declarar vencedor com quarenta amostras.
 *   ATRIBUIÇÃO        fechar a conta inventando um canal.
 *
 * Todas as seis produzem números que PARECEM úteis. É por isso que precisam de
 * teste: um número errado com casa decimal é mais perigoso que nenhum número.
 */
import { describe, expect, it } from "vitest";

import { atribuirReceita, consolidar, JANELA_DIAS, type Toque } from "./atribuicao";
import { calcularRiscoDeChurn, type SinaisDoPaciente } from "./churn";
import { FUSO_PADRAO } from "./dia-local";
import {
  avaliarExperimento,
  previsaoDeTermino,
  varianteDe,
  DIFERENCA_MINIMA_PP,
  MINIMO_POR_VARIANTE,
} from "./experimento";
import { melhorHorarioDe, MINIMO_DE_RESPOSTAS } from "./melhor-horario";
import { classificarObjecao, contarObjecoes, leituraDaSituacao } from "./objecoes";
import { painelDoDia, COOLDOWN_DIAS, type Candidato } from "./proxima-acao";

const AGORA = new Date("2026-09-11T14:00:00.000Z");

/** Um instante ISO a N dias atrás. */
const diasAtras = (n: number): string => new Date(AGORA.getTime() - n * 86_400_000).toISOString();

/** Uma resposta às `hora` locais de São Paulo, `diasAtras` dias atrás. */
function respostaAs(hora: number, dias: number): { em: string } {
  // -03: a hora local `h` é `h + 3` em UTC.
  const base = new Date(AGORA.getTime() - dias * 86_400_000);
  const utc = Date.UTC(
    base.getUTCFullYear(),
    base.getUTCMonth(),
    base.getUTCDate(),
    (hora + 3) % 24,
    30,
  );
  return { em: new Date(utc).toISOString() };
}

/* ========================================================================== */
/* Best Send Time                                                             */
/* ========================================================================== */

describe("melhor horário de envio", () => {
  it("com poucas respostas, diz NÃO SEI", () => {
    const r = melhorHorarioDe([respostaAs(19, 1), respostaAs(19, 2)], FUSO_PADRAO);

    /*
     * Um palpite com duas amostras tem a aparência de personalização e o
     * comportamento de ruído. "Não sei" faz o sistema usar a janela comercial
     * padrão, que é o certo — e é uma resposta, não uma falha.
     */
    expect(r.sabemos).toBe(false);
    if (r.sabemos) return;
    expect(r.motivo).toContain(String(MINIMO_DE_RESPOSTAS));
  });

  it("encontra o hábito de quem responde à noite", () => {
    const respostas = [
      respostaAs(19, 1),
      respostaAs(20, 3),
      respostaAs(19, 5),
      respostaAs(21, 8),
      respostaAs(20, 12),
      respostaAs(19, 15),
    ];

    const r = melhorHorarioDe(respostas, FUSO_PADRAO);

    expect(r.sabemos).toBe(true);
    if (!r.sabemos) return;
    // A janela é 19–22; o alvo é o MEIO dela, e não a borda.
    expect(r.hora).toBeGreaterThanOrEqual(19);
    expect(r.hora).toBeLessThanOrEqual(21);
    expect(r.explicacao).toContain("%");
  });

  it("quem responde a QUALQUER hora não tem horário preferido", () => {
    const espalhadas = [2, 6, 9, 13, 17, 22, 4, 11].map((h, i) => respostaAs(h, i + 1));

    const r = melhorHorarioDe(espalhadas, FUSO_PADRAO);

    /*
     * O TESTE MAIS IMPORTANTE DESTE BLOCO. Sem o corte de concentração, a janela
     * com mais respostas venceria por um voto e o sistema anunciaria um horário
     * preferido que não existe — com a autoridade de quem olhou oito amostras.
     */
    expect(r.sabemos).toBe(false);
  });

  it("a janela atravessa a meia-noite", () => {
    // Quem responde às 23h e à 1h tem um hábito: a madrugada. Um laço que para
    // na hora 23 partiria isso em dois grupos de um.
    const madrugada = [
      respostaAs(23, 1),
      respostaAs(0, 2),
      respostaAs(1, 3),
      respostaAs(23, 4),
      respostaAs(0, 5),
      respostaAs(1, 6),
    ];

    const r = melhorHorarioDe(madrugada, FUSO_PADRAO);
    expect(r.sabemos).toBe(true);
  });

  it("usa o fuso da CLÍNICA, e não UTC", () => {
    const respostas = Array.from({ length: 6 }, (_, i) => respostaAs(19, i + 1));

    const local = melhorHorarioDe(respostas, FUSO_PADRAO);
    const utc = melhorHorarioDe(respostas, "UTC");

    expect(local.sabemos && utc.sabemos).toBe(true);
    if (!local.sabemos || !utc.sabemos) return;
    // Três horas de diferença: em UTC o sistema apontaria 22h para quem
    // responde às 19h, e a jornada dispararia depois que a pessoa dormiu.
    expect(local.hora).not.toBe(utc.hora);
  });
});

/* ========================================================================== */
/* Churn                                                                      */
/* ========================================================================== */

const sinais = (extra: Partial<SinaisDoPaciente> = {}): SinaisDoPaciente => ({
  ultimaConsultaEm: diasAtras(200),
  proximaConsultaEm: null,
  faltasRecentes: 0,
  comparecimentosRecentes: 2,
  tratamentoInterrompido: false,
  ultimaRespostaEm: diasAtras(30),
  intervaloEsperadoDias: 180,
  ...extra,
});

describe("risco de perder o paciente", () => {
  it("quem tem consulta marcada tem risco ZERO, por pior que seja o histórico", () => {
    const r = calcularRiscoDeChurn(
      sinais({
        proximaConsultaEm: diasAtras(-7),
        faltasRecentes: 5,
        tratamentoInterrompido: true,
        ultimaConsultaEm: diasAtras(900),
      }),
      AGORA,
    );

    /*
     * O CURTO-CIRCUITO QUE SALVA A LISTA. Sem ele, a fila de ligações encheria
     * de gente que já está voltando — e a recepção aprenderia a ignorar a fila.
     * Uma lista de prioridade só funciona enquanto quem a lê acredita nela.
     */
    expect(r.escore).toBe(0);
    expect(r.acaoSugerida).toContain("Nada a fazer");
  });

  it("tratamento interrompido é o sinal mais forte, e a ação diz o que falar", () => {
    const r = calcularRiscoDeChurn(sinais({ tratamentoInterrompido: true }), AGORA);

    expect(r.fatores.some((f) => f.codigo === "tratamento_interrompido")).toBe(true);
    // É a única ligação desta lista em que a recepção sabe sobre o que falar
    // antes de discar.
    expect(r.acaoSugerida).toContain("orçamento");
  });

  it("a ausência é RELATIVA ao intervalo esperado", () => {
    const semestral = calcularRiscoDeChurn(
      sinais({ ultimaConsultaEm: diasAtras(200), intervaloEsperadoDias: 180 }),
      AGORA,
    );
    const emTratamento = calcularRiscoDeChurn(
      sinais({ ultimaConsultaEm: diasAtras(200), intervaloEsperadoDias: 30 }),
      AGORA,
    );

    // Os MESMOS 200 dias. Para quem faz limpeza semestral é normal; para quem
    // está no meio de um canal é abandono. Um número absoluto trataria os dois
    // como o mesmo caso.
    expect(emTratamento.escore).toBeGreaterThan(semestral.escore);
  });

  it("quem nunca veio é PROSPECÇÃO, e a ação diz isso", () => {
    const r = calcularRiscoDeChurn(sinais({ ultimaConsultaEm: null }), AGORA);

    // Tratar como "ausência infinita" poria todo lead antigo no topo da lista de
    // retenção — e reter quem nunca foi paciente não é reter.
    expect(r.fatores.some((f) => f.codigo === "nunca_veio")).toBe(true);
    expect(r.acaoSugerida).toContain("prospecção");
  });

  it("faltas repetidas mandam LIGAR, e não mandar mensagem", () => {
    const r = calcularRiscoDeChurn(sinais({ faltasRecentes: 3 }), AGORA);

    // Quem falta duas vezes não responde a lembrete automático. A sugestão que
    // ignora isso gera mais uma mensagem ignorada.
    expect(r.acaoSugerida).toContain("Ligue");
  });

  it("todo fator vem com o motivo escrito", () => {
    const r = calcularRiscoDeChurn(
      sinais({ faltasRecentes: 2, tratamentoInterrompido: true }),
      AGORA,
    );

    // Um número sozinho — "risco 73" — não ajuda quem vai ligar a decidir o que
    // dizer. E é ela que liga.
    expect(r.fatores.every((f) => f.motivo.length > 10)).toBe(true);
  });
});

/* ========================================================================== */
/* Objeções                                                                   */
/* ========================================================================== */

describe("classificar objeções", () => {
  it.each([
    ["tá muito caro pra mim", "PRECO"],
    ["achei salgado o valor", "PRECO"],
    ["vou falar com meu marido", "TERCEIRO"],
    ["tenho pavor de dentista", "MEDO"],
    ["vocês aceitam meu convênio?", "CONVENIO"],
    ["estou sem tempo esse mês", "TEMPO"],
    ["quero uma segunda opinião antes", "CONFIANCA"],
  ])("“%s” cai em %s", (texto, categoria) => {
    expect(classificarObjecao(texto).categoria).toBe(categoria);
  });

  it("“não tenho dinheiro agora” é PREÇO, e não TEMPO", () => {
    /*
     * A FRASE QUE PROVA A ORDEM DOS PADRÕES. Ela tem "agora" (tempo) e
     * "dinheiro" (preço). A pessoa está falando de dinheiro. Se TEMPO viesse
     * antes na lista, a clínica olharia o painel e concluiria que precisa abrir
     * mais horários — quando o que precisa é rever o parcelamento.
     */
    expect(classificarObjecao("não tenho dinheiro agora").categoria).toBe("PRECO");
  });

  it("guarda SEMPRE o texto original", () => {
    const o = classificarObjecao("tá caro, achei metade disso na clínica do bairro");

    // Guardada só como "PRECO", esta objeção viraria a mesma linha de "tá caro
    // pra mim agora, mês que vem eu consigo" — e são conversas opostas.
    expect(o.texto).toContain("clínica do bairro");
  });

  it("texto curto tem confiança menor", () => {
    // "Caro" sozinho pode ser resposta a "o que achou?" ou pedaço de "não é
    // caro". A contagem precisa saber disso para não somar chute com certeza.
    expect(classificarObjecao("caro").confianca).toBeLessThan(
      classificarObjecao("achei bem caro esse orçamento todo").confianca,
    );
  });

  it("os exemplos são os mais LONGOS, e não os primeiros", () => {
    const contagens = contarObjecoes([
      classificarObjecao("caro"),
      classificarObjecao("tá caro, achei metade disso na clínica do bairro"),
      classificarObjecao("caro demais"),
    ]);

    // "Tá caro" não ensina nada; "tá caro, achei metade disso" ensina tudo.
    expect(contagens[0]?.exemplos[0]).toContain("bairro");
  });

  it("não chama de padrão o que é bolo repartido", () => {
    const espalhadas = [
      classificarObjecao("tá caro"),
      classificarObjecao("tenho medo"),
      classificarObjecao("sem tempo"),
      classificarObjecao("vou falar com minha esposa"),
      classificarObjecao("quero pesquisar"),
    ];

    /*
     * 20% é a maior fatia de um bolo repartido, e não um problema a atacar.
     * Anunciar "o problema é preço" com esse número transformaria ruído em
     * diretriz — e a clínica mexeria no preço por causa de uma objeção.
     */
    expect(leituraDaSituacao(contarObjecoes(espalhadas))).toContain("espalhadas");
  });

  it("com padrão de verdade, a leitura é específica e acionável", () => {
    const todasPreco = Array.from({ length: 8 }, () => classificarObjecao("achei muito caro"));
    const leitura = leituraDaSituacao(contarObjecoes(todasPreco));

    // A sugestão não é "dê desconto": é olhar COMO o orçamento é apresentado.
    expect(leitura).toContain("desconto");
    expect(leitura).toContain("parcelamento");
  });
});

/* ========================================================================== */
/* Next Best Action                                                           */
/* ========================================================================== */

const candidato = (extra: Partial<Candidato> = {}): Candidato => ({
  patientId: "p1",
  nome: "Ana",
  risco: calcularRiscoDeChurn(sinais(), AGORA),
  valorEmAberto: 0,
  temConsultaMarcada: false,
  diasDesdeUltimoContato: 30,
  optOut: false,
  ...extra,
});

describe("a lista do dia", () => {
  it("quem pediu para não ser contatado tem prioridade ZERO", () => {
    const p = painelDoDia([
      candidato({
        patientId: "opt",
        optOut: true,
        valorEmAberto: 50_000,
        risco: calcularRiscoDeChurn(sinais({ tratamentoInterrompido: true }), AGORA),
      }),
    ]);

    /*
     * ZERO, E NÃO "PRIORIDADE BAIXA". Pontuar e deixar no fim da lista
     * significaria que num dia devagar alguém chegaria lá — e ligaria. O
     * orçamento de R$ 50.000 neste caso é isca de propósito: é exatamente o
     * caso em que alguém racionalizaria a ligação.
     */
    expect(p.acoes[0]?.prioridade).toBe(0);
    expect(p.acoes[0]?.acao).toContain("Não contatar");
  });

  it("o cooldown ADIA, e não remove da lista", () => {
    const p = painelDoDia([
      candidato({
        diasDesdeUltimoContato: 2,
        valorEmAberto: 8000,
        risco: calcularRiscoDeChurn(sinais({ tratamentoInterrompido: true }), AGORA),
      }),
    ]);

    /*
     * A DIFERENÇA ENTRE ADIAR E REMOVER. Zerar tiraria da lista alguém que
     * continua sendo o caso mais valioso da clínica — e amanhã, quando o
     * cooldown vencer, ninguém lembraria dele.
     */
    expect(p.acoes[0]?.aguardar).toBe(true);
    expect(p.acoes[0]?.prioridade).toBeGreaterThan(0);
    expect(p.acoes[0]?.porque).toContain(String(COOLDOWN_DIAS));
  });

  it("risco ALTO com valor ZERO ainda entra na lista", () => {
    const p = painelDoDia([
      candidato({
        valorEmAberto: 0,
        risco: calcularRiscoDeChurn(
          sinais({ ultimaConsultaEm: diasAtras(700), faltasRecentes: 2 }),
          AGORA,
        ),
      }),
    ]);

    // O piso de peso existe para isto: paciente antigo sumindo vale uma ligação
    // mesmo sem dinheiro em aberto agora.
    expect(p.acoes[0]?.prioridade).toBeGreaterThan(0);
  });

  it("o valor entra em escala LOGARÍTMICA", () => {
    const risco = calcularRiscoDeChurn(sinais({ tratamentoInterrompido: true }), AGORA);

    const mil = painelDoDia([candidato({ patientId: "a", valorEmAberto: 1000, risco })]);
    const vinteMil = painelDoDia([candidato({ patientId: "b", valorEmAberto: 20_000, risco })]);

    const pMil = mil.acoes[0]?.prioridade ?? 0;
    const pVinte = vinteMil.acoes[0]?.prioridade ?? 0;

    /*
     * Vinte vezes mais dinheiro NÃO pode valer vinte vezes mais atenção. Em
     * escala linear, três casos grandes ocupariam a lista inteira e a recepção
     * nunca ligaria para o resto.
     */
    expect(pVinte).toBeGreaterThan(pMil);
    expect(pVinte).toBeLessThan(pMil * 5);
  });

  it("o painel soma o que está em risco", () => {
    const risco = calcularRiscoDeChurn(sinais({ tratamentoInterrompido: true }), AGORA);
    const p = painelDoDia([
      candidato({ patientId: "a", valorEmAberto: 5000, risco }),
      candidato({ patientId: "b", valorEmAberto: 3000, risco }),
      // Em cooldown: não entra na soma, porque não é ação de hoje.
      candidato({ patientId: "c", valorEmAberto: 9000, risco, diasDesdeUltimoContato: 1 }),
    ]);

    // "R$ 8.000 em risco nesta lista" é o que faz a tela ser lida. Uma lista de
    // nomes é trabalho; o número é motivo para fazer o trabalho.
    expect(p.valorEmRisco).toBe(8000);
    expect(p.emEspera).toBe(1);
  });
});

/* ========================================================================== */
/* A/B                                                                        */
/* ========================================================================== */

const braco = (amostras: number, taxa: number, v: "A" | "B") => ({
  variante: v,
  amostras,
  sucessos: Math.round(amostras * taxa),
  taxa,
});

describe("experimento A/B", () => {
  it("com amostra pequena, NÃO declara vencedor — e diz quanto falta", () => {
    const r = avaliarExperimento(braco(20, 0.18, "A"), braco(20, 0.35, "B"));

    /*
     * 35% CONTRA 18% PARECE DECISIVO, e com vinte amostras por lado é acaso na
     * maior parte das vezes. Um painel que mostra isso em verde convence: a
     * clínica troca o texto, o número volta ao normal no mês seguinte, e
     * ninguém liga as duas coisas.
     */
    expect(r.decidido).toBe(false);
    if (r.decidido) return;
    expect(r.faltamPorVariante).toBe(MINIMO_POR_VARIANTE - 20);
    expect(r.explicacao).toContain("acaso");
  });

  it("EMPATE é um resultado, e dos mais valiosos", () => {
    const r = avaliarExperimento(braco(200, 0.2, "A"), braco(200, 0.23, "B"));

    expect(r.decidido).toBe(false);
    if (r.decidido) return;
    // Ele diz: pare de mexer nisto. Sem esta saída, a clínica trocaria de texto
    // para sempre atrás de um ganho que não está ali.
    expect(r.explicacao).toContain("gargalo é outro");
  });

  it("com amostra e diferença grandes, decide", () => {
    const r = avaliarExperimento(braco(200, 0.2, "A"), braco(200, 0.38, "B"));

    expect(r.decidido).toBe(true);
    if (!r.decidido) return;
    expect(r.vencedora).toBe("B");
    expect(r.diferencaPp).toBeGreaterThanOrEqual(DIFERENCA_MINIMA_PP);
  });

  it("a mesma pessoa cai SEMPRE na mesma variante", () => {
    const a = varianteDe("exp-1", "paciente-42");
    for (let i = 0; i < 10; i += 1) expect(varianteDe("exp-1", "paciente-42")).toBe(a);
  });

  it("o experimento entra no sorteio — senão o viés se acumula", () => {
    /*
     * Sem o id do experimento no hash, quem caiu em A no teste de lembrete
     * cairia em A em TODOS os testes, para sempre. O segundo experimento
     * herdaria o viés do primeiro sem que ninguém tivesse como perceber.
     */
    const pacientes = Array.from({ length: 60 }, (_, i) => `p${String(i)}`);
    const noExp1 = pacientes.map((p) => varianteDe("exp-1", p));
    const noExp2 = pacientes.map((p) => varianteDe("exp-2", p));

    const iguais = noExp1.filter((v, i) => v === noExp2[i]).length;
    // Se fossem idênticos, seriam 60. Metade é o esperado de dois sorteios
    // independentes.
    expect(iguais).toBeGreaterThan(15);
    expect(iguais).toBeLessThan(45);
  });

  it("divide as pessoas mais ou menos ao meio", () => {
    const n = 400;
    const emA = Array.from({ length: n }, (_, i) => varianteDe("exp-x", `p${String(i)}`)).filter(
      (v) => v === "A",
    ).length;

    expect(emA).toBeGreaterThan(n * 0.4);
    expect(emA).toBeLessThan(n * 0.6);
  });

  it("avisa quando o experimento demoraria demais", () => {
    const r = previsaoDeTermino(braco(10, 0.2, "A"), braco(10, 0.2, "B"), 4);

    /*
     * Um teste que precisa de oito meses não é um teste: é uma decisão adiada
     * por oito meses. Até lá, preço, equipe e sazonalidade terão mudado, e o
     * resultado não vai dizer respeito ao texto.
     */
    expect(r.viavel).toBe(false);
    expect(r.explicacao).toContain("sazonalidade");
  });
});

/* ========================================================================== */
/* Atribuição                                                                 */
/* ========================================================================== */

const toque = (canal: string, dias: number): Toque => ({
  canal,
  em: diasAtras(dias),
  origem: null,
});

describe("atribuição de receita", () => {
  it("NÃO credita tudo ao último toque", () => {
    const r = atribuirReceita(
      [toque("anuncio", 80), toque("site", 60), toque("recall", 20), toque("whatsapp", 1)],
      10_000,
      AGORA,
    );

    const whatsapp = r.creditos.find((c) => c.canal === "whatsapp");
    const anuncio = r.creditos.find((c) => c.canal === "anuncio");

    /*
     * O ERRO CLÁSSICO, e o caro: último toque creditaria 100% ao WhatsApp, e a
     * conclusão seria "corta o anúncio". No mês seguinte, ninguém chega ao
     * WhatsApp.
     */
    expect(whatsapp?.valor).toBe(4000);
    expect(anuncio?.valor).toBe(4000);
  });

  it("descarta toque fora da janela", () => {
    const r = atribuirReceita(
      [toque("anuncio", JANELA_DIAS + 30), toque("whatsapp", 2)],
      5000,
      AGORA,
    );

    // Um anúncio de um ano atrás não fez a pessoa aparecer ontem. Creditar a ele
    // infla eternamente o canal mais antigo.
    expect(r.descartados).toBe(1);
    expect(r.creditos).toHaveLength(1);
  });

  it("descarta toque POSTERIOR ao fechamento", () => {
    // Parece impossível e não é: a mensagem de pós-atendimento entra na mesma
    // lista, e creditar a venda a ela seria dizer que o agradecimento causou a
    // compra.
    const r = atribuirReceita(
      [toque("whatsapp", 5), { canal: "pos_atendimento", em: diasAtras(-2), origem: null }],
      3000,
      AGORA,
    );

    expect(r.creditos.some((c) => c.canal === "pos_atendimento")).toBe(false);
  });

  it("com dois toques, a conta ainda fecha em 100%", () => {
    const r = atribuirReceita([toque("site", 30), toque("whatsapp", 3)], 1000, AGORA);
    const total = r.creditos.reduce((t, c) => t + c.valor, 0);

    // Descartar os 20% do meio faria a soma dos créditos não bater com a
    // receita — o tipo de erro que só aparece quando alguém soma a coluna.
    expect(total).toBe(1000);
  });

  it("sem toque, NÃO inventa canal", () => {
    const r = atribuirReceita([], 7000, AGORA);

    /*
     * Inventar um canal para fechar a conta é o que faz painéis de marketing
     * mentirem com confiança. "Não sei de onde veio" é informação: se aparece
     * muito, o que falta é rastreamento.
     */
    expect(r.creditos).toEqual([]);
    expect(r.explicacao).toContain("não tem origem conhecida");
  });

  it("o consolidado mostra quanto ficou SEM origem", () => {
    const comOrigem = atribuirReceita([toque("site", 10)], 40_000, AGORA);
    const sem = atribuirReceita([], 90_000, AGORA);

    const c = consolidar([
      { atribuicao: comOrigem, valor: 40_000 },
      { atribuicao: sem, valor: 90_000 },
    ]);

    /*
     * O NÚMERO MAIS IMPORTANTE DA TELA quando está alto. Um painel bonito
     * dividindo R$ 40.000 entre canais, com R$ 90.000 fora da conta, descreve
     * 30% da realidade — e quem olha decide os outros 70% com base nele.
     */
    expect(c.semOrigem).toBe(90_000);
    expect(c.total).toBe(130_000);
  });
});
