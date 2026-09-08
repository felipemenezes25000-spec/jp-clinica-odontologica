/**
 * As rubricas: o que cada vaga da JP realmente pede, escrito para ser lido pelo
 * modelo e conferido por um humano.
 *
 * `oQueImporta` não é enfeite de prompt — é a diferença entre uma nota genérica
 * de "perfil de atendimento" e uma nota que sabe que a recepção da clínica
 * confirma paciente por WhatsApp às sete da manhã. E os `pesos` existem para que
 * a nota geral seja auditável: o RH consegue apontar para o número e dizer por
 * que permanência pesou mais que progressão nesta vaga.
 *
 * Os seis critérios são os mesmos em todas as áreas de propósito. Comparar duas
 * candidatas de vagas diferentes só faz sentido se a régua tiver as mesmas
 * marcas; o que muda entre as áreas é quanto cada marca vale.
 */
import type { GuiaEntrevista } from "../guia";
import type { AreaVaga } from "../tipos";
import { emAnosMeses } from "./metricas";
import type { ChaveCriterio, CriterioIa, MetricasPermanencia } from "./tipos";

/** Sempre somam 100. É o que torna a nota geral comparável entre áreas. */
export type PesosCriterios = Record<ChaveCriterio, number>;

/**
 * Uma faixa de nota com a condição objetiva que a produz.
 *
 * `quando` é escrito com NÚMERO, nunca com adjetivo: "último emprego com 36
 * meses ou mais" pode ser conferido por qualquer pessoa com o currículo na
 * mão; "boa permanência" é opinião, e opinião é justamente o que estava
 * fazendo cada modelo calibrar do próprio jeito.
 */
export type FaixaCriterio = { de: number; ate: number; quando: string };

export type Rubrica = {
  area: AreaVaga;
  rotulo: string;
  pesos: PesosCriterios;
  /** Texto que desce no prompt: o que esta vaga é, nesta clínica, de verdade. */
  oQueImporta: string;
  /** O que o modelo deve procurar além dos sinais que o código já calcula. */
  sinaisExtras: string[];
  /**
   * A régua de cada critério, do topo para a base. É o conserto do problema
   * medido: três modelos leram os mesmos três currículos e deram 89/53/55,
   * 93/61/63 e 87/60/48 — estrelas e recomendação iguais, notas de critério
   * diferentes, porque o prompt dizia "permanência: tempo de casa" e não dizia
   * o que é 7 e o que é 9. Com as faixas ancoradas nas métricas que o código já
   * calcula, o modelo deixa de arbitrar a escala e passa a só posicionar a
   * candidata dentro dela.
   */
  ancoras: Record<ChaveCriterio, FaixaCriterio[]>;
};

/** Ordem canônica dos critérios — a mesma no prompt, no schema e na tela. */
export const CHAVES_CRITERIO: ChaveCriterio[] = [
  "permanencia",
  "aderencia",
  "atendimento",
  "administrativo",
  "progressao",
  "coerencia",
];

/**
 * Uma faixa mais o gatilho numérico que a seleciona.
 *
 * `minMeses` é o mínimo, em meses, da métrica que ancora AQUELE critério (ver
 * `metricaDeAncora`). `null` significa "critério de julgamento": progressão e
 * coerência continuam sendo leitura de gente, e por isso nunca recebem faixa
 * sugerida pelo cálculo — mas ganham descritor escrito de cada faixa, que é o
 * que faltava para dois modelos chamarem a mesma trajetória de 7.
 *
 * O campo mora aqui e não em `FaixaCriterio` de propósito: o prompt não precisa
 * ver o gatilho, precisa ver a condição em português.
 */
type Degrau = FaixaCriterio & { minMeses: number | null };

type DegrausDaArea = Record<ChaveCriterio, Degrau[]>;

/**
 * As cinco faixas de um critério ancorado em meses, do topo para a base.
 *
 * A última faixa tem sempre `minMeses: 0` para que o cálculo nunca fique sem
 * resposta quando a métrica existe — "não achei faixa" seria pior que a
 * ausência de âncora, porque devolveria o modelo à calibragem livre.
 */
function faixasPorMeses(
  quandos: [string, string, string, string, string],
  minimos: [number, number, number, number],
): Degrau[] {
  return [
    { de: 9, ate: 10, quando: quandos[0], minMeses: minimos[0] },
    { de: 7, ate: 8, quando: quandos[1], minMeses: minimos[1] },
    { de: 5, ate: 6, quando: quandos[2], minMeses: minimos[2] },
    { de: 3, ate: 4, quando: quandos[3], minMeses: minimos[3] },
    { de: 0, ate: 2, quando: quandos[4], minMeses: 0 },
  ];
}

/** As mesmas cinco faixas, para o critério que nenhuma métrica ancora. */
function faixasDeJulgamento(quandos: [string, string, string, string, string]): Degrau[] {
  return [
    { de: 9, ate: 10, quando: quandos[0], minMeses: null },
    { de: 7, ate: 8, quando: quandos[1], minMeses: null },
    { de: 5, ate: 6, quando: quandos[2], minMeses: null },
    { de: 3, ate: 4, quando: quandos[3], minMeses: null },
    { de: 0, ate: 2, quando: quandos[4], minMeses: null },
  ];
}

/** O que cada critério mede, em uma linha. Cabeçalho da tabela no prompt. */
const DESCRICAO_CRITERIO: Record<ChaveCriterio, string> = {
  permanencia: "tempo de casa, com peso maior no ULTIMO emprego; padrão de trocas",
  aderencia: "a experiência anterior serve para ESTA vaga NESTA clínica?",
  atendimento: "contato real com público, paciente, cliente; presencial vale mais que script",
  administrativo:
    "telefone, WhatsApp, agenda, sistema, planilha, caixa, confirmação, cobrança, organização",
  progressao: "assumiu função melhor ou mais responsabilidade ao longo do tempo?",
  coerencia: "a trajetória faz sentido para a idade e para o momento profissional?",
};

/**
 * As faixas de progressão e coerência que servem para quase toda vaga adulta.
 * Estágio tem as suas, porque a pergunta lá é outra.
 */
function progressaoPadrao(): Degrau[] {
  return faixasDeJulgamento([
    "dois ou mais degraus de cargo na trajetória (ex.: auxiliar → recepcionista → coordenadora), ou aumento de responsabilidade descrito em dois empregos diferentes",
    "um degrau de cargo, ou um aumento de escopo escrito com atividade concreta",
    "mesmo nível de cargo do começo ao fim, sem queda",
    "voltou a um cargo mais simples do que já ocupou, sem nenhuma explicação no texto",
    "três ou mais passagens no mesmo cargo de entrada, em empresas diferentes, sem nenhuma atividade nova descrita",
  ]);
}

function coerenciaPadrao(): Degrau[] {
  return faixasDeJulgamento([
    "idade, formação e sequência de empregos se encaixam; nenhum período sobreposto e nenhuma lacuna de 4 meses ou mais sem explicação escrita",
    "1 lacuna OU 1 sobreposição, com explicação plausível escrita no próprio currículo",
    "1 lacuna OU 1 sobreposição sem explicação, ou cargo que não conversa com a formação declarada",
    "2 ou mais contradições de data, ou tempo de experiência somado maior do que a idade permite",
    "datas impossíveis, ou o documento se contradiz em 3 pontos ou mais",
  ]);
}

/** A escada de permanência do briefing do dono da clínica, na letra dele. */
function permanenciaPadrao(): Degrau[] {
  return faixasPorMeses(
    [
      "último emprego com 36 meses (3 anos) ou mais",
      "último emprego com 24 a 35 meses (2 a 3 anos)",
      "último emprego com 12 a 23 meses (1 a 2 anos)",
      "último emprego com 6 a 11 meses",
      "último emprego com menos de 6 meses, OU três ou mais empregos com menos de 12 meses cada",
    ],
    [36, 24, 12, 6],
  );
}

/**
 * A régua de cada área. Fica separada de `RUBRICAS` porque `Rubrica.ancoras`
 * publica só `{de, ate, quando}` — o gatilho numérico é detalhe de implementação
 * de `faixaSugerida`, e vazá-lo para o prompt convidaria o modelo a recalcular
 * o que o código já calculou.
 */
const DEGRAUS: Record<AreaVaga, DegrausDaArea> = {
  recepcao: {
    permanencia: permanenciaPadrao(),
    aderencia: faixasPorMeses(
      [
        "24 meses ou mais de aderência, contando 1 mês para cada mês em clínica odontológica e 1 mês para cada 2 meses em outra área da saúde",
        "12 a 23 meses de aderência na mesma conta",
        "6 a 11 meses de aderência na mesma conta",
        "1 a 5 meses de aderência na mesma conta",
        "0 mês em odontologia e 0 mês em outra área da saúde",
      ],
      [24, 12, 6, 1],
    ),
    atendimento: faixasPorMeses(
      [
        "36 meses ou mais de atendimento ao público",
        "18 a 35 meses de atendimento ao público",
        "6 a 17 meses de atendimento ao público",
        "1 a 5 meses de atendimento ao público",
        "0 mês de atendimento ao público nos vínculos datados",
      ],
      [36, 18, 6, 1],
    ),
    administrativo: faixasPorMeses(
      [
        "36 meses ou mais de rotina administrativa (agenda, sistema, planilha, caixa, cobrança)",
        "18 a 35 meses de rotina administrativa",
        "6 a 17 meses de rotina administrativa",
        "1 a 5 meses de rotina administrativa",
        "0 mês de rotina administrativa nos vínculos datados",
      ],
      [36, 18, 6, 1],
    ),
    progressao: progressaoPadrao(),
    coerencia: coerenciaPadrao(),
  },

  "asb-tsb": {
    permanencia: permanenciaPadrao(),
    aderencia: faixasPorMeses(
      [
        "24 meses ou mais de aderência (1 mês para cada mês em odontologia, 1 mês para cada 2 meses em outra área da saúde)",
        "12 a 23 meses de aderência na mesma conta",
        "6 a 11 meses de aderência na mesma conta",
        "1 a 5 meses de aderência, ou curso de ASB/TSB concluído sem nenhuma prática de cadeira",
        "0 mês em odontologia e nenhum curso da área concluído",
      ],
      [24, 12, 6, 1],
    ),
    atendimento: faixasPorMeses(
      [
        "24 meses ou mais de atendimento ao público",
        "12 a 23 meses de atendimento ao público",
        "6 a 11 meses de atendimento ao público",
        "1 a 5 meses de atendimento ao público",
        "0 mês de atendimento ao público nos vínculos datados",
      ],
      [24, 12, 6, 1],
    ),
    administrativo: faixasPorMeses(
      [
        "24 meses ou mais de rotina administrativa (aqui vale controle de estoque, esterilização registrada, agenda de cadeira)",
        "12 a 23 meses de rotina administrativa",
        "6 a 11 meses de rotina administrativa",
        "1 a 5 meses de rotina administrativa",
        "0 mês de rotina administrativa nos vínculos datados",
      ],
      [24, 12, 6, 1],
    ),
    progressao: faixasDeJulgamento([
      "passou de auxiliar a técnica, ou assumiu esterilização, estoque ou treinamento de colega dentro do mesmo lugar",
      "um aumento de escopo descrito com procedimento concreto (instrumentação, biossegurança, revelação)",
      "mesmo nível de cargo do começo ao fim, sem queda",
      "voltou a função mais simples do que já ocupou, sem explicação no texto",
      "três ou mais passagens no mesmo cargo de entrada, sem nenhuma prática nova descrita",
    ]),
    coerencia: faixasDeJulgamento([
      "curso concluído com instituição e ano, registro citado, e a sequência de empregos vem DEPOIS da formação",
      "curso concluído com instituição, faltando o ano ou o número do registro",
      "curso citado sem instituição, ou experiência de cadeira anterior à conclusão do curso",
      "2 ou mais contradições de data, ou curso e registro que não se encaixam",
      "datas impossíveis, ou formação declarada que o documento não sustenta em nenhum ponto",
    ]),
  },

  dentista: {
    // Mesma escada de permanência das outras áreas, mas com a ressalva escrita
    // na faixa de baixo: dentista que divide a semana entre consultórios não é
    // dentista rotativa, e a regra dos "três empregos curtos" não se aplica a
    // esta área (ver AREAS_SEM_REGRA_DE_ROTATIVIDADE).
    permanencia: faixasPorMeses(
      [
        "vínculo mais recente com 36 meses (3 anos) ou mais",
        "vínculo mais recente com 24 a 35 meses (2 a 3 anos)",
        "vínculo mais recente com 12 a 23 meses (1 a 2 anos)",
        "vínculo mais recente com 6 a 11 meses",
        "vínculo mais recente com menos de 6 meses — antes de puxar a nota para cá, confira se não são consultórios em paralelo, que é rotina da profissão",
      ],
      [36, 24, 12, 6],
    ),
    aderencia: faixasPorMeses(
      [
        "36 meses ou mais de atendimento clínico em odontologia",
        "18 a 35 meses de atendimento clínico em odontologia",
        "6 a 17 meses de atendimento clínico em odontologia",
        "1 a 5 meses de atendimento clínico em odontologia",
        "0 mês de atendimento clínico datado no documento",
      ],
      [36, 18, 6, 1],
    ),
    atendimento: faixasPorMeses(
      [
        "24 meses ou mais de contato direto com paciente ou público",
        "12 a 23 meses de contato direto com paciente ou público",
        "6 a 11 meses de contato direto com paciente ou público",
        "1 a 5 meses de contato direto com paciente ou público",
        "0 mês de contato com público nos vínculos datados",
      ],
      [24, 12, 6, 1],
    ),
    administrativo: faixasPorMeses(
      [
        "24 meses ou mais de rotina administrativa (agenda própria, prontuário, plano de tratamento, convênio)",
        "12 a 23 meses de rotina administrativa",
        "6 a 11 meses de rotina administrativa",
        "1 a 5 meses de rotina administrativa",
        "0 mês de rotina administrativa nos vínculos datados",
      ],
      [24, 12, 6, 1],
    ),
    progressao: faixasDeJulgamento([
      "especialização CONCLUÍDA com instituição e ano, e procedimentos mais complexos aparecendo ao longo do tempo",
      "especialização em andamento, ou ampliação clara do repertório de procedimentos entre um vínculo e outro",
      "clínica geral do começo ao fim, sem queda de escopo",
      "só cursos listados, nenhum procedimento novo em nenhum vínculo",
      "escopo declarado que encolhe ao longo do tempo, sem nenhuma explicação",
    ]),
    coerencia: faixasDeJulgamento([
      "CRO citado, formação datada, e a sequência de vínculos faz sentido para a idade — inclusive dois consultórios ao mesmo tempo",
      "CRO citado e 1 ponto a esclarecer na sequência de datas",
      "CRO ausente, ou 1 sobreposição que não se explica por consultórios em paralelo",
      "2 ou mais contradições de data, ou experiência clínica anterior à formação",
      "datas impossíveis, ou documento que não sustenta a formação declarada",
    ]),
  },

  administrativo: {
    permanencia: permanenciaPadrao(),
    // Aqui a aderência é conhecer o vocabulário da saúde (convênio, glosa,
    // faturamento). A força administrativa fora da saúde não entra nesta linha
    // — ela tem critério próprio, com peso 25, logo abaixo.
    aderencia: faixasPorMeses(
      [
        "24 meses ou mais em clínica, hospital, laboratório ou operadora (1 mês para cada mês em odontologia, 1 para cada 2 meses em outra área da saúde)",
        "12 a 23 meses de aderência na mesma conta",
        "6 a 11 meses de aderência na mesma conta",
        "1 a 5 meses de aderência na mesma conta",
        "0 mês na saúde — a rotina administrativa fora dela conta no critério administrativo, não neste",
      ],
      [24, 12, 6, 1],
    ),
    atendimento: faixasPorMeses(
      [
        "24 meses ou mais de atendimento ao público",
        "12 a 23 meses de atendimento ao público",
        "6 a 11 meses de atendimento ao público",
        "1 a 5 meses de atendimento ao público",
        "0 mês de atendimento ao público nos vínculos datados",
      ],
      [24, 12, 6, 1],
    ),
    administrativo: faixasPorMeses(
      [
        "48 meses (4 anos) ou mais de rotina administrativa, com sistema ou planilha nomeados",
        "24 a 47 meses de rotina administrativa",
        "12 a 23 meses de rotina administrativa",
        "3 a 11 meses de rotina administrativa",
        "menos de 3 meses de rotina administrativa nos vínculos datados",
      ],
      [48, 24, 12, 3],
    ),
    progressao: progressaoPadrao(),
    coerencia: coerenciaPadrao(),
  },

  estagio: {
    // Escada própria, e é o ponto do briefing: aos 18-22 anos passagem curta é
    // o normal da idade, não rotatividade. Copiar as faixas da recepção aqui
    // reprovaria metade das estagiárias por terem tido um contrato de fim de ano.
    permanencia: faixasPorMeses(
      [
        "12 meses ou mais em algum vínculo, OU nenhum emprego anterior — não ter histórico aos 18-22 anos é o esperado, não é falta",
        "último vínculo com 6 a 11 meses (contrato temporário, jovem aprendiz ou estágio que terminou no prazo entra aqui)",
        "último vínculo com 3 a 5 meses",
        "último vínculo com 1 a 2 meses",
        "último vínculo com menos de 1 mês, OU três ou mais saídas em menos de 3 meses cada DEPOIS dos 23 anos",
      ],
      [12, 6, 3, 1],
    ),
    // As duas faixas de baixo dependem do CURSO, que não é métrica: o cálculo
    // para em 3-4 quando não há mês nenhum na área, e o modelo desce para 2 se
    // o curso não tiver relação alguma com a clínica (é o passo de 1 ponto que
    // a instrução permite).
    aderencia: faixasPorMeses(
      [
        "12 meses ou mais de convívio com odontologia ou saúde (estágio anterior, jovem aprendiz em clínica, ajuda no consultório da família)",
        "6 a 11 meses de convívio com odontologia ou saúde",
        "1 a 5 meses de convívio com odontologia ou saúde",
        "0 mês na área, mas cursando algo ligado à saúde, à odontologia ou à administração",
        "0 mês na área e curso sem nenhuma relação com a rotina da clínica",
      ],
      [12, 6, 1, 0],
    ),
    atendimento: faixasPorMeses(
      [
        "12 meses ou mais de contato com público em qualquer trabalho",
        "6 a 11 meses de contato com público em qualquer trabalho",
        "1 a 5 meses de contato com público em qualquer trabalho",
        "0 mês datado, mas o documento cita balcão, negócio da família, voluntariado ou trabalho com gente sem data",
        "0 mês e nenhuma menção a contato com público em lugar nenhum do documento",
      ],
      [12, 6, 1, 0],
    ),
    administrativo: faixasPorMeses(
      [
        "12 meses ou mais de rotina administrativa",
        "6 a 11 meses de rotina administrativa",
        "1 a 5 meses de rotina administrativa",
        "0 mês datado, mas cita Office, planilha, sistema ou caixa em algum ponto do documento",
        "0 mês e nenhum sistema, planilha ou ferramenta citada",
      ],
      [12, 6, 1, 0],
    ),
    progressao: faixasDeJulgamento([
      "saiu de tarefa simples para responsabilidade própria dentro do mesmo lugar, ou trocou um vínculo por outro melhor",
      "um único vínculo ou estágio, com aumento de tarefa descrito por ela",
      "sem vínculo anterior, ou vínculos curtos sem descrição de evolução — é o esperado de quem está começando, e não puxa a nota para baixo",
      "sequência de vínculos em que as tarefas ficaram mais simples, sem explicação",
      "mais de 23 anos e cinco anos de trabalho sem nenhuma mudança de tarefa",
    ]),
    coerencia: faixasDeJulgamento([
      "18 a 25 anos, curso em andamento com instituição e semestre informados, e turno declarado compatível com clínica que abre cedo e fecha à noite",
      "curso em andamento com instituição, faltando o semestre OU o turno disponível",
      "curso concluído há mais de 24 meses, ou trajetória que não explica por que procura estágio agora",
      "2 ou mais contradições de data, ou curso citado sem instituição",
      "datas impossíveis, ou o documento não é o currículo dela",
    ]),
  },

  outro: {
    permanencia: permanenciaPadrao(),
    // Sem âncora numérica de propósito: aderência aqui é em relação ao TÍTULO
    // DA VAGA (marketing, TI, limpeza, manutenção), e mês em odontologia não
    // mede isso. Inventar um número aqui seria pior que não ter número.
    aderencia: faixasDeJulgamento([
      "já exerceu exatamente a função do título da vaga, com atividade concreta descrita e duração informada",
      "já exerceu função vizinha, com parte das atividades do título da vaga",
      "experiência de outra área, mas com atividades que se transferem para o título da vaga",
      "nenhuma atividade do documento conversa com o título da vaga, mas há disposição declarada",
      "o documento não traz uma única atividade concreta em nenhum vínculo",
    ]),
    atendimento: faixasPorMeses(
      [
        "24 meses ou mais de atendimento ao público",
        "12 a 23 meses de atendimento ao público",
        "6 a 11 meses de atendimento ao público",
        "1 a 5 meses de atendimento ao público",
        "0 mês de atendimento ao público nos vínculos datados",
      ],
      [24, 12, 6, 1],
    ),
    administrativo: faixasPorMeses(
      [
        "24 meses ou mais de rotina administrativa",
        "12 a 23 meses de rotina administrativa",
        "6 a 11 meses de rotina administrativa",
        "1 a 5 meses de rotina administrativa",
        "0 mês de rotina administrativa nos vínculos datados",
      ],
      [24, 12, 6, 1],
    ),
    progressao: progressaoPadrao(),
    coerencia: coerenciaPadrao(),
  },
};

/** Só o que o prompt precisa ver: a condição, sem o gatilho numérico. */
function ancorasDe(degraus: DegrausDaArea): Record<ChaveCriterio, FaixaCriterio[]> {
  const saida = {} as Record<ChaveCriterio, FaixaCriterio[]>;
  for (const chave of CHAVES_CRITERIO) {
    saida[chave] = degraus[chave].map((d) => ({ de: d.de, ate: d.ate, quando: d.quando }));
  }
  return saida;
}

export const RUBRICAS: Record<AreaVaga, Rubrica> = {
  recepcao: {
    area: "recepcao",
    rotulo: "Recepção e atendimento",
    /*
     * Pesos ditados pelo dono da clínica, sem tradução:
     *
     *   30  estabilidade profissional              -> permanencia
     *   25  experiência como secretária/recepção   -> atendimento
     *   15  experiência em clínica ou saúde        -> aderencia
     *   15  perspectiva de permanência             -> progressao
     *   10  experiência administrativa e tecnologia-> administrativo
     *    5  apresentação e coerência do currículo  -> coerencia
     *
     * A estabilidade subiu de 25 para 30 e virou o maior peso isolado: "uma
     * candidata que passou 4 anos numa empresa e 3 em outra deve ficar muito
     * acima de alguém com 8 meses, 5 meses, 1 ano, 4 meses".
     *
     * DISPONIBILIDADE NÃO ENTRA NA NOTA, de propósito, apesar de estar no
     * briefing. Currículo não prova horário: quem mora longe, quem estuda à
     * noite e quem tem outro vínculo escrevem exatamente a mesma folha. Fingir
     * que a leitura sabe isso produziria nota alta ou baixa por adivinhação.
     * Ela vira ALERTA e pergunta de entrevista, que é onde a resposta existe.
     *
     * IDADE TAMBÉM NÃO ENTRA, e isso é decisão, não esquecimento. O briefing
     * pedia "dos 20 e poucos até 50". O que a clínica quer medir com isso é
     * agilidade e desenvoltura com telefone, WhatsApp, sistema e planilha — e
     * isso está em "administrativo", medido pelo que a pessoa FEZ. Recortar por
     * ano de nascimento não mede nada disso, e é discriminação.
     */
    pesos: {
      permanencia: 30,
      atendimento: 25,
      aderencia: 15,
      progressao: 15,
      administrativo: 10,
      coerencia: 5,
    },
    ancoras: ancorasDe(DEGRAUS.recepcao),
    oQueImporta: `A recepção da JP atende paciente na cadeira e no telefone, confirma agenda,
responde WhatsApp, cobra retorno, fecha caixa e segura a sala de espera cheia sem perder a paciência.
Quem já fez isso em clínica odontológica chega pronta. Quem fez em clínica médica, laboratório ou
consultório chega perto. Varejo e telemarketing ensinam atendimento ao público, mas não ensinam a
rotina clínica: prontuário, convênio, confirmação de véspera, remarcação de falta e a conversa
delicada de cobrar um tratamento em aberto olhando na cara da pessoa.
Tempo de casa vale mais aqui do que em qualquer outra vaga da clínica. Paciente de bairro volta e
quer ser reconhecido pelo nome; recepção que troca todo ano quebra exatamente isso.`,
    sinaisExtras: [
      "Currículo que fala em atendimento mas não cita nenhum sistema, agenda ou planilha.",
      "Experiência só em telemarketing de script, sem contato presencial com o público.",
      "Menção a caixa, cobrança ou fechamento — é o que separa recepção de recepcionista de balcão.",
      "Disponibilidade de horário incompatível com clínica que abre cedo e fecha à noite.",
    ],
  },

  "asb-tsb": {
    area: "asb-tsb",
    rotulo: "Auxiliar / Técnico em Saúde Bucal",
    pesos: {
      permanencia: 20,
      aderencia: 30,
      atendimento: 10,
      administrativo: 5,
      progressao: 15,
      coerencia: 20,
    },
    ancoras: ancorasDe(DEGRAUS["asb-tsb"]),
    oQueImporta: `ASB e TSB precisam de REGISTRO NO CRO — é pré-requisito legal, não diferencial.
Currículo sem número de registro, sem CRO citado e sem curso concluído reconhecido é sinal crítico:
a clínica não pode colocar essa pessoa na cadeira, por melhor que seja o resto.
Depois do registro, o que importa é prática real: trabalho a quatro mãos, instrumentação,
esterilização, autoclave, biossegurança, revelação e manipulação de material. Curso concluído sem
nenhuma prática em consultório é ponto de atenção, não eliminatório — a JP treina, mas quer saber
que vai treinar antes de contratar.`,
    sinaisExtras: [
      "Curso de ASB/TSB citado sem instituição, sem ano de conclusão ou sem número de registro.",
      "Experiência em odontologia só como recepção, sem nada de cadeira nem de esterilização.",
      "Nenhuma menção a biossegurança, autoclave ou instrumentação — o básico da função.",
    ],
  },

  dentista: {
    area: "dentista",
    rotulo: "Cirurgião-dentista",
    pesos: {
      permanencia: 20,
      aderencia: 30,
      atendimento: 10,
      administrativo: 5,
      progressao: 20,
      coerencia: 15,
    },
    ancoras: ancorasDe(DEGRAUS.dentista),
    oQueImporta: `CRO ATIVO é pré-requisito. Sem número de CRO no currículo, é sinal crítico e a
pergunta vai para a entrevista antes de qualquer elogio.
Interessa volume e variedade de procedimentos, especialização concluída (e não só "cursando"),
e se a pessoa sabe explicar plano de tratamento sem empurrar procedimento — a JP é clínica de
bairro, vive de retorno e de indicação, e um dentista que vende demais custa mais caro do que
um dentista que produz de menos.
Passagem por várias clínicas ao mesmo tempo é comum e legítima na profissão: dentista costuma
dividir a semana entre dois ou três consultórios. Não trate isso como rotatividade nem como
contradição de datas sem antes considerar essa hipótese.`,
    sinaisExtras: [
      "Especialização listada como concluída sem instituição ou sem ano.",
      "Currículo que só lista cursos e nenhum atendimento clínico com data.",
      "Nenhuma menção a procedimento algum — nem clínica geral, nem urgência, nem prótese.",
    ],
  },

  administrativo: {
    area: "administrativo",
    rotulo: "Administrativo e gestão",
    pesos: {
      permanencia: 25,
      aderencia: 20,
      atendimento: 10,
      administrativo: 25,
      progressao: 15,
      coerencia: 5,
    },
    ancoras: ancorasDe(DEGRAUS.administrativo),
    oQueImporta: `Financeiro, convênios, compras, faturamento, contas a pagar e receber e rotina de
pessoal. Interessa sistema de gestão, planilha de verdade (não "Excel básico" no rodapé do
currículo), controle de caixa, conciliação, organização de processo e capacidade de fechar mês.
Experiência administrativa fora da saúde conta bastante — o processo é o mesmo. O que a pessoa vai
ter de aprender aqui é glosa de convênio e a linguagem do faturamento odontológico.
Coerência pesa pouco nesta vaga porque trajetória administrativa costuma ser mista de propósito:
quem passou por comércio, escritório e clínica traz repertório, não confusão.`,
    sinaisExtras: [
      "Cita 'rotinas administrativas' sem dizer uma única rotina concreta.",
      "Nenhum sistema, ERP ou planilha nomeado em nenhum emprego.",
      "Cargo de gestão declarado sem nenhuma equipe, orçamento ou número por trás.",
    ],
  },

  estagio: {
    area: "estagio",
    rotulo: "Estágio",
    // Permanência com o menor peso da tabela, e coerência com o maior: aos 19
    // anos a pergunta certa não é "quanto tempo ficou", é "isso faz sentido
    // para o momento de vida dela".
    pesos: {
      permanencia: 10,
      aderencia: 20,
      atendimento: 20,
      administrativo: 15,
      progressao: 10,
      coerencia: 25,
    },
    ancoras: ancorasDe(DEGRAUS.estagio),
    oQueImporta: `Aqui NÃO se cobra experiência. O que conta é estar cursando, ter disponibilidade
real de horário e demonstrar disposição de aprender.
Diga isto com todas as letras na sua avaliação: POUCO TEMPO DE CASA EM EMPREGO ANTERIOR NÃO É
DEMÉRITO PARA QUEM TEM 18 A 22 ANOS. É o normal da idade. Contrato temporário de fim de ano,
jovem aprendiz que terminou, estágio que acabou junto com o semestre, emprego largado para voltar
a estudar — tudo isso é trajetória saudável de estagiária, e tratar como rotatividade é erro de
leitura, não rigor. Só levante a permanência como problema se houver muitas saídas em sequência
DEPOIS dos 23 anos, ou se a própria pessoa descrever algo que peça explicação.
Um primeiro emprego, um trabalho de balcão ou um período ajudando no negócio da família valem
como experiência de atendimento — considere e diga que considerou.`,
    sinaisExtras: [
      "Curso em andamento sem instituição, sem semestre ou sem previsão de conclusão.",
      "Sem nenhuma indicação de turno disponível — estágio em clínica depende de horário.",
      "Currículo inteiro escrito em terceira pessoa ou copiado de modelo, sem nada próprio.",
    ],
  },

  outro: {
    area: "outro",
    rotulo: "Outra área",
    // Rubrica genérica e equilibrada: cobre marketing, TI, limpeza e apoio, onde
    // nenhum critério pode ser eleito o mais importante sem conhecer a vaga.
    pesos: {
      permanencia: 20,
      aderencia: 20,
      atendimento: 15,
      administrativo: 15,
      progressao: 15,
      coerencia: 15,
    },
    ancoras: ancorasDe(DEGRAUS.outro),
    oQueImporta: `Vaga de apoio da clínica (marketing, TI, limpeza, manutenção, serviços). Não há
um perfil único: leia o TÍTULO DA VAGA acima e julgue a aderência em relação a ele, não em relação
à odontologia. Não penalize quem nunca trabalhou em clínica se a função não exige isso.
O que continua valendo em qualquer função da JP: tempo de casa, trajetória que faz sentido, e
alguma evidência de que a pessoa lida bem com gente — a clínica é pequena e todo mundo cruza com
paciente no corredor.`,
    sinaisExtras: [
      "Experiência que não conversa com o título da vaga em nenhum ponto.",
      "Currículo genérico, sem uma atividade concreta em nenhum dos empregos.",
    ],
  },
};

/**
 * O bloco que traz os critérios do guia da clínica para dentro da rubrica.
 *
 * A triagem e a ficha julgam a mesma pessoa em momentos diferentes, e até aqui
 * falavam línguas diferentes: a triagem pontuava "aderência" e "progressão"
 * (critérios nossos), a ficha pontuava "experiência em recepção" e "rotinas
 * financeiras" (critérios da Dra. Ana Beatriz e do Jefferson). O RH lia as duas
 * telas lado a lado e tinha de traduzir de cabeça qual nota correspondia a quê.
 *
 * O que este bloco faz — e o que ele deliberadamente NÃO faz: ele diz ao modelo
 * o que a clínica vai olhar na mesa, para a leitura do currículo já reparar
 * nessas coisas e escrever nesses termos. Ele não troca os seis critérios da
 * análise pelos dez do guia: os pesos, a nota 0..100 e a comparabilidade entre
 * áreas dependem das chaves fixas de `CHAVES_CRITERIO`, e um guia editável no
 * painel mudaria a régua da nota geral no dia em que alguém renomeasse um
 * critério. A régua continua nossa; o vocabulário passa a ser deles.
 */
function criteriosDoGuiaEmTexto(guia: GuiaEntrevista): string {
  const pontuaveis = guia.criterios.filter((c) => !c.soNaEntrevista);
  const soNaMesa = guia.criterios.filter((c) => c.soNaEntrevista);
  const linhas: string[] = [];

  linhas.push(
    `O GUIA DE ENTREVISTA DESTA VAGA ("${guia.titulo}") — o método que a própria clínica usa na mesa.` +
      ` Sua leitura precisa alimentar estes critérios, com estas palavras:`,
  );
  for (const c of pontuaveis) linhas.push(`- ${c.rotulo}: ${c.descricao}`);

  if (soNaMesa.length > 0) {
    linhas.push(
      `Os critérios abaixo a clínica só avalia com a pessoa na frente, e você NAO deve opinar sobre eles` +
        ` — nem para elogiar, nem para levantar dúvida (você não viu ninguém):`,
    );
    for (const c of soNaMesa) linhas.push(`- ${c.rotulo}`);
  }

  return linhas.join("\n");
}

/**
 * Nunca devolve undefined: uma vaga antiga com área desconhecida cairia em
 * `undefined` e derrubaria a montagem do prompt inteiro. Recepção é o padrão
 * porque é a vaga que a clínica mais abre.
 *
 * O segundo parâmetro é opcional e aceita `null` de propósito: sem guia
 * gravado (instalação nova, área sem método escrito), a rubrica volta a ser
 * exatamente a de antes — quem não tem guia não perde nada.
 */
export function rubricaPara(area: AreaVaga, guia?: GuiaEntrevista | null): Rubrica {
  const base = RUBRICAS[area] ?? RUBRICAS.recepcao;
  if (guia === undefined || guia === null || guia.criterios.length === 0) return base;

  // Cópia: `RUBRICAS` é constante de módulo e vive o processo inteiro — mutar
  // `oQueImporta` aqui empilharia o guia de uma candidatura na análise de todas
  // as seguintes.
  return { ...base, oQueImporta: `${base.oQueImporta}\n\n${criteriosDoGuiaEmTexto(guia)}` };
}

/* -------------------------------------------------------------------------- */
/* Âncoras: da métrica calculada para a faixa de nota                          */
/* -------------------------------------------------------------------------- */

/**
 * Onde a regra dos "três empregos curtos" NÃO vale.
 *
 * Estágio porque a própria rubrica diz que passagem curta dos 18 aos 22 é o
 * normal da idade; dentista porque a profissão divide a semana entre dois ou
 * três consultórios, e vínculo paralelo curto ali é rotina, não rotatividade.
 */
const AREAS_SEM_REGRA_DE_ROTATIVIDADE: AreaVaga[] = ["estagio", "dentista"];

/**
 * Meses que contam como aderência: mês em odontologia vale 1, mês em outra área
 * da saúde vale meio.
 *
 * `mesesEmSaude` inclui os vínculos odontológicos (uma clínica de odontologia é
 * saúde), então subtrair antes de dividir evita contar o mesmo emprego duas
 * vezes — e o piso em zero protege do currículo em que o marcador de saúde veio
 * mais restrito que o de odontologia.
 */
function mesesAderentes(m: MetricasPermanencia): number {
  const saudeNaoOdonto = Math.max(0, m.mesesEmSaude - m.mesesEmOdontologia);
  return m.mesesEmOdontologia + Math.floor(saudeNaoOdonto / 2);
}

/**
 * Currículo que lista empregos mas não data nenhum deles zera todas as somas —
 * e zero aqui significaria "nunca atendeu público", que é uma acusação, não uma
 * medição. Nesse caso não há âncora nenhuma.
 *
 * Currículo SEM emprego algum é diferente: aí o zero é fato do documento.
 */
function somasSaoConfiaveis(m: MetricasPermanencia): boolean {
  return m.totalEmpregos === 0 || m.empregosDatados > 0;
}

/** A métrica que ancora cada critério. `null` = critério de julgamento. */
function valorDeAncora(chave: ChaveCriterio, m: MetricasPermanencia): number | null {
  if (chave === "permanencia") return m.mesesUltimoEmprego;
  if (!somasSaoConfiaveis(m)) return null;
  if (chave === "aderencia") return mesesAderentes(m);
  if (chave === "atendimento") return m.mesesAtendimentoPublico;
  if (chave === "administrativo") return m.mesesAdministrativo;
  return null;
}

/** "9-10", "7-8" — o rótulo que o modelo vai repetir na justificativa. */
function rotuloFaixa(f: FaixaCriterio): string {
  return `${f.de}-${f.ate}`;
}

/** Este critério tem alguma métrica capaz de ancorá-lo NESTA área? */
function criterioTemMetrica(area: AreaVaga, chave: ChaveCriterio): boolean {
  return DEGRAUS[area][chave].some((d) => d.minMeses !== null);
}

/**
 * A faixa que os números deste currículo indicam — ou `null` quando não há
 * número que sustente faixa nenhuma.
 *
 * `null` sai em dois casos bem diferentes, e o prompt precisa distinguir os
 * dois: critério de julgamento (progressão, coerência, e aderência na área
 * "outro"), onde nunca houve métrica; e dado ausente (currículo sem datas),
 * onde a métrica existe mas o documento não a alimenta. Em nenhum dos dois a
 * função chuta uma faixa: chutar seria devolver ao modelo exatamente a
 * liberdade de calibragem que esta função existe para tirar.
 */
export function faixaSugerida(
  chave: ChaveCriterio,
  metricas: MetricasPermanencia,
  rubrica: Rubrica,
): FaixaCriterio | null {
  const degraus = DEGRAUS[rubrica.area][chave];
  // Lê da rubrica, não de DEGRAUS: `rubricaPara` devolve cópia, e o dia em que
  // alguém ajustar as faixas de uma vaga específica a sugestão tem de sair de lá.
  const publicadas = rubrica.ancoras[chave];
  const naPosicao = (i: number): FaixaCriterio | null => publicadas[i] ?? null;

  if (chave === "permanencia") {
    // Documento sem nenhum emprego: não há tempo de casa para medir. Em estágio
    // isso não é buraco de dado — a rubrica diz com todas as letras que não ter
    // histórico aos 18-22 anos é o esperado, e a faixa de topo já prevê o caso.
    if (metricas.totalEmpregos === 0) return rubrica.area === "estagio" ? naPosicao(0) : null;

    // A regra do dono da clínica, textual: três ou mais empregos com menos de
    // 12 meses derruba para a faixa de baixo, por mais longo que tenha sido o
    // último. Vem antes do cálculo por meses porque é justamente a exceção a ele.
    if (!AREAS_SEM_REGRA_DE_ROTATIVIDADE.includes(rubrica.area) && metricas.empregosCurtos >= 3) {
      return naPosicao(degraus.length - 1);
    }
  }

  const valor = valorDeAncora(chave, metricas);
  if (valor === null) return null;

  // Degraus vêm do topo para a base, então a primeira que o valor alcança é a dela.
  const indice = degraus.findIndex((d) => d.minMeses !== null && valor >= d.minMeses);
  return indice === -1 ? null : naPosicao(indice);
}

/** Os números deste currículo que sustentam a faixa, escritos por extenso. */
function numeroQueAncora(chave: ChaveCriterio, m: MetricasPermanencia): string {
  if (chave === "permanencia") {
    const curtos = `${m.empregosCurtos} emprego${m.empregosCurtos === 1 ? "" : "s"} com menos de 12 meses`;
    return `último emprego ${emAnosMeses(m.mesesUltimoEmprego)}, e ${curtos}`;
  }
  if (chave === "aderencia") {
    return `${emAnosMeses(m.mesesEmOdontologia)} em odontologia e ${emAnosMeses(m.mesesEmSaude)} em saúde, o que dá ${emAnosMeses(mesesAderentes(m))} de aderência contada`;
  }
  if (chave === "atendimento")
    return `${emAnosMeses(m.mesesAtendimentoPublico)} de atendimento ao público`;
  if (chave === "administrativo")
    return `${emAnosMeses(m.mesesAdministrativo)} de rotina administrativa`;
  return "";
}

/**
 * O bloco de critérios que desce no prompt, já com a régua desta vaga e a faixa
 * que os números desta candidata indicam.
 *
 * Substitui a lista de uma linha por critério que existia antes ("permanencia -
 * tempo de casa, com peso maior no ULTIMO emprego"). Aquela lista dizia O QUE
 * medir e não dizia COM QUE RÉGUA — e era essa a origem da variação entre
 * modelos que o RH mediu: mesma leitura, mesma recomendação, notas de critério
 * diferentes em até 15 pontos.
 */
export function textoDasAncoras(rubrica: Rubrica, metricas: MetricasPermanencia): string {
  const L: string[] = [];

  L.push("OS SEIS CRITERIOS (nota de 0 a 10 em cada, sempre os seis, sempre nesta ordem).");
  L.push(
    "Cada criterio tem faixa fechada: escolha a faixa PRIMEIRO, a nota dentro dela DEPOIS. Nao use outra escala,",
  );
  L.push("nao compare com media de mercado e nao recalcule nenhum dos numeros abaixo.");

  CHAVES_CRITERIO.forEach((chave, i) => {
    L.push("");
    L.push(`${i + 1}. ${chave} (peso ${rubrica.pesos[chave]}%) — ${DESCRICAO_CRITERIO[chave]}`);
    for (const faixa of rubrica.ancoras[chave]) {
      L.push(`   ${rotuloFaixa(faixa).padEnd(5)} ${faixa.quando}`);
    }

    const sugerida = faixaSugerida(chave, metricas, rubrica);
    if (sugerida !== null) {
      const numeros = numeroQueAncora(chave, metricas);
      L.push(
        `   >> pelos numeros deste curriculo (${numeros}), a faixa indicada e ${rotuloFaixa(sugerida)}.`,
      );
      return;
    }

    if (!criterioTemMetrica(rubrica.area, chave)) {
      L.push(
        `   >> este criterio nao tem metrica que o ancore: a faixa e julgamento seu. Escolha pelos descritores`,
      );
      L.push(
        `      acima e cite na justificativa o trecho do curriculo que sustenta a faixa escolhida.`,
      );
      return;
    }

    L.push(
      `   >> este criterio nao tem numero para ancorar: o documento nao traz datas suficientes. Avalie pelo`,
    );
    L.push(
      `      texto e diga na justificativa que a nota e incerta por falta de datas. Nao invente numero que o`,
    );
    L.push(`      documento nao tem, nem para o bem nem para o mal.`);
  });

  return L.join("\n");
}

/**
 * TETO DE NOTA POR ROTATIVIDADE — pedido do cliente: "períodos curtos em
 * emprego abaixam a nota dela drasticamente".
 *
 * POR QUE UM TETO, E NÃO MAIS PESO EM "PERMANÊNCIA"
 * A permanência já vale 30% da régua de recepção, e esses pesos foram fixados
 * pelo cliente — mexer neles mudaria a nota de todo mundo e desalinharia as
 * faixas de 80/65/50 que ele também definiu. Além disso, os 30% são uma nota
 * que o MODELO dá: ele pode achar que quatro passagens de oito meses são "média
 * permanência" e devolver 6 de 10, e aí a média ponderada devolve alguém com 72
 * pontos e quatro empregos curtos.
 *
 * O teto é conta nossa, sobre datas que nós mesmos medimos. Ele não discute com
 * o modelo: apenas impede que a média ponderada leve para a faixa de "chamar
 * com prioridade" quem tem um padrão de saída rápida. É o mesmo princípio do
 * resto do motor — julgamento é do modelo, conta é nossa.
 *
 * PRECISA DE PROVA ANTES DE PUNIR
 * Só vale com três ou mais vínculos DATADOS. Com dois empregos, um curto vira
 * "50% de rotatividade" e não quer dizer nada: pode ser primeiro emprego,
 * contrato temporário ou empresa que fechou. Sem base, não há teto.
 *
 * As faixas seguem a régua do próprio cliente: 80 é "chamar com prioridade",
 * 65 é "boa candidata", 50 é "avaliar se faltar melhor". Um quarto dos vínculos
 * curtos já tira a prioridade; metade tira o "boa candidata"; a maioria curta
 * leva para a faixa de baixa prioridade.
 */
export function tetoPorRotatividade(
  m: MetricasPermanencia,
): { teto: number; motivo: string } | null {
  if (m.empregosDatados < 3) return null;
  const proporcao = m.proporcaoCurtos;
  if (proporcao === null) return null;

  const quantos = `${String(m.empregosCurtos)} de ${String(m.empregosDatados)} vínculos datados duraram menos de um ano`;

  if (proporcao >= 60) {
    return { teto: 45, motivo: `${quantos} (${String(proporcao)}%).` };
  }
  if (proporcao >= 40) {
    return { teto: 60, motivo: `${quantos} (${String(proporcao)}%).` };
  }
  if (proporcao >= 25) {
    return { teto: 75, motivo: `${quantos} (${String(proporcao)}%).` };
  }
  return null;
}

/**
 * Nota 0..100 a partir das notas 0..10 dos critérios, ponderada pelos pesos da
 * rubrica.
 *
 * Renormaliza pelo peso dos critérios efetivamente presentes: se o modelo
 * devolver cinco critérios em vez de seis, o certo é distribuir os 100 pontos
 * entre os cinco, e não entregar uma nota baixa que na verdade só reflete um
 * critério faltando. Chave repetida vale uma vez só — a primeira ocorrência —
 * porque duas notas para "permanencia" dobrariam o peso daquele critério.
 */
export function notaPonderada(criterios: CriterioIa[], pesos: PesosCriterios): number {
  const vistas = new Set<ChaveCriterio>();
  let soma = 0;
  let pesoTotal = 0;

  for (const c of criterios) {
    if (!CHAVES_CRITERIO.includes(c.chave) || vistas.has(c.chave)) continue;
    vistas.add(c.chave);

    const peso = pesos[c.chave];
    // Nota fora de 0..10 é alucinação do modelo, não opinião: corta na régua
    // em vez de deixar um 47 solitário estourar a média para cima.
    const nota = Math.min(10, Math.max(0, Number.isFinite(c.nota) ? c.nota : 0));
    soma += nota * peso;
    pesoTotal += peso;
  }

  if (!pesoTotal) return 0;
  return Math.round((soma / pesoTotal) * 10);
}
