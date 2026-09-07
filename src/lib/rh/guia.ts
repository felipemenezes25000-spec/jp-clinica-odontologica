/**
 * O guia de entrevista da JP — objeto de primeira classe do sistema.
 *
 * Este arquivo é a transcrição do método de contratação REAL da clínica, escrito
 * pela Dra. Ana Beatriz (dentista e coordenadora) e pelo Jefferson (gestor) e
 * entregue em PDF. Antes desta onda o sistema entrevistava por um método nosso;
 * agora ele conduz a entrevista pelo método da própria JP — as 15 perguntas
 * gerais, os 10 critérios de 0 a 5 (total /50), os 10 sinais de observação, a
 * nota ética e as 5 regras de desempate são os deles, palavra por palavra onde
 * o texto original importa.
 *
 * O guia é editável no painel (o RH ajusta pergunta, critério e nota máxima sem
 * deploy), e `guiaSementeRecepcao()` é a semente: o que a clínica encontra
 * pronto na primeira vez que abre a tela. Editar a semente aqui não altera o
 * guia já gravado em disco — quem manda depois da primeira gravação é o
 * arquivo.
 *
 * Puro, como `vagas.ts` e `validar.ts`: sem I/O, sem `node:`, sem React.
 */
import type { FichaEntrevista } from "./ficha";
import type { AreaVaga } from "./tipos";

/* -------------------------------------------------------------------------- */
/* Tipos                                                                      */
/* -------------------------------------------------------------------------- */

export type CriterioGuia = {
  /** Identificador estável ("comunicacao-postura"). É por ele que nota, nota sugerida e critério se encontram. */
  chave: string;
  rotulo: string;
  /**
   * Verdadeiro quando a nota só pode sair da conversa, e não do papel.
   *
   * É a trava que impede a IA de opinar sobre o que ela não viu. Postura,
   * organização no aperto, disponibilidade real, entrosamento com a equipe e
   * perspectiva de permanência são coisas que a pessoa demonstra sentada à
   * mesa; um currículo bem escrito não prova nenhuma delas. A IA sugere nota
   * apenas para os critérios com `soNaEntrevista: false`, e o prompt diz isso
   * com todas as letras.
   */
  soNaEntrevista: boolean;
  /** O que observar para dar a nota. Desce no prompt e aparece na ficha impressa. */
  descricao: string;
};

export type GuiaEntrevista = {
  id: string;
  /** Derivado do título pelo servidor. Serve para achar o guia por nome legível. */
  slug: string;
  titulo: string;

  area: AreaVaga;
  /**
   * Vaga específica a que este guia pertence. "" quando ele vale para a área
   * inteira — que é o caso normal: a clínica reabre "Recepcionista" todo ano e
   * o método continua o mesmo.
   */
  vagaId: string;
  /** No máximo um guia padrão por área. Quem garante é `salvarGuiaAdmin`. */
  padrao: boolean;

  /** "Dra. Ana Beatriz — Dentista e Coordenadora | Jefferson — Gestor". */
  entrevistadores: string;
  /** O objetivo escrito pela clínica, verbatim. */
  objetivo: string;

  /** As perguntas que se faz com todas, na mesma ordem — é isso que torna as candidatas comparáveis. */
  perguntasGerais: string[];
  criterios: CriterioGuia[];
  /** As caixas de "sinais para observar durante a conversa". */
  sinaisObservacao: string[];
  /** A nota ética do guia, verbatim. Vira restrição dura no prompt. */
  notaEtica: string;
  /** O desempate objetivo, na ordem em que a clínica escreveu. */
  regrasDesempate: string[];
  /** Nota máxima por critério. 5 no guia da JP; fica configurável porque o total impresso (/50) depende dela. */
  notaMaxima: number;

  /**
   * Verdadeiro quando NINGUÉM da clínica escreveu este texto.
   *
   * O guia de recepção veio em PDF, assinado pela Dra. Ana Beatriz e pelo
   * Jefferson: é o método da casa e vale como está. Um guia criado por
   * duplicação — levar o método de recepção para "Administrativo", por exemplo —
   * é outra coisa: as perguntas continuam falando de balcão e de agenda de
   * paciente, e os critérios foram pesados para uma função que não é aquela.
   * Ele serve de rascunho, mas entrevistar por ele sem revisar é entrevistar por
   * um método que ninguém aprovou.
   *
   * Por isso a marca existe e a tela grita enquanto ela estiver ligada. Quem a
   * desliga é uma pessoa, no botão "já revisamos este guia" — nunca um
   * salvamento comum, senão a primeira correção de vírgula apagaria o aviso.
   */
  derivado: boolean;

  /**
   * A decisão final do processo seletivo conduzido por este guia.
   *
   * ONDE ISTO MORA, E POR QUÊ. A alternativa era `ConfiguracoesRh`, e ela está
   * errada por dois motivos: aquele arquivo é conteúdo editorial do portal
   * (título, chamada, e-mail do RH) e é ÚNICO — a clínica contrata mais de uma
   * vez, e a segunda decisão apagaria a primeira sem que ninguém percebesse.
   * Um arquivo próprio de "processo seletivo" seria o mais correto no longo
   * prazo, mas hoje não existe entidade de processo no sistema: teria que nascer
   * inteira (id, abertura, fechamento, rota, armazenamento) só para guardar
   * quatro campos.
   *
   * O guia é o recorte que o sistema já tem e que corresponde ao processo: área,
   * vaga e método. É dele que sai a tabela do comparativo, é por ele que as
   * fichas foram geradas, e é ele que o painel já sabe salvar. A decisão fica
   * ao lado dos critérios que a produziram.
   *
   * A consequência a assumir: reabrir a vaga no ano seguinte com o MESMO guia
   * sobrescreve a decisão anterior. Por isso duplicar um guia não leva a decisão
   * junto (ver a aba Entrevistas) e `registradaEm` fica gravado — a tela sempre
   * diz de quando é a folha que está na mesa.
   */
  decisaoFinal: DecisaoFinal;

  criadoEm: string;
  atualizadoEm: string;
};

/**
 * O bloco "Decisão final" da seção 4 do guia, preenchido depois de entrevistar
 * todas.
 *
 * O nome é guardado junto do id pelo mesmo motivo de `Candidatura.vagaTitulo`:
 * a folha de decisão precisa continuar legível depois que a candidatura for
 * arquivada, apagada por prazo de LGPD ou perdida numa importação. Um id órfão
 * transformaria "escolhemos a Rose" em "escolhemos (registro removido)".
 */
export type DecisaoFinal = {
  escolhidaId: string;
  escolhidaNome: string;
  reservaId: string;
  reservaNome: string;
  /** "Principal motivo da escolha", no texto do guia. */
  motivo: string;
  /** "Referências / comprovações pendentes". */
  referenciasPendentes: string;
  /** ISO, carimbado pelo servidor. "" enquanto ninguém decidiu nada. */
  registradaEm: string;
};

export function decisaoFinalVazia(): DecisaoFinal {
  return {
    escolhidaId: "",
    escolhidaNome: "",
    reservaId: "",
    reservaNome: "",
    motivo: "",
    referenciasPendentes: "",
    registradaEm: "",
  };
}

/** Se há decisão registrada de fato — o carimbo sozinho não conta como conteúdo. */
export function decisaoFinalPreenchida(d: DecisaoFinal): boolean {
  return (
    d.escolhidaId.length > 0 ||
    d.escolhidaNome.length > 0 ||
    d.reservaId.length > 0 ||
    d.reservaNome.length > 0 ||
    d.motivo.length > 0 ||
    d.referenciasPendentes.length > 0
  );
}

/**
 * Guia zerado, para o formulário do painel começar em branco. Função pelo mesmo
 * motivo de `vagaVazia()`: arrays novos a cada chamada.
 */
export function guiaVazio(): GuiaEntrevista {
  return {
    id: "",
    slug: "",
    titulo: "",
    area: "" as AreaVaga,
    vagaId: "",
    padrao: false,
    entrevistadores: "",
    objetivo: "",
    perguntasGerais: [],
    criterios: [],
    sinaisObservacao: [],
    notaEtica: NOTA_ETICA_JP,
    regrasDesempate: [],
    notaMaxima: 5,
    // Um guia em branco é escrito por quem está digitando — ou seja, pela
    // clínica. `derivado` só nasce ligado quando o sistema copia um guia para
    // outra área, que é a única situação em que o texto na tela não é de
    // ninguém da JP.
    derivado: false,
    decisaoFinal: decisaoFinalVazia(),
    criadoEm: "",
    atualizadoEm: "",
  };
}

/**
 * A nota ética do guia, verbatim.
 *
 * Sai como constante separada porque ela não é texto de um guia: é o limite que
 * a clínica escreveu para si mesma, e o prompt da ficha a repete como restrição
 * dura. Um guia novo, criado do zero pelo RH, já nasce com ela preenchida.
 */
export const NOTA_ETICA_JP =
  "Importante: registre exemplos concretos das respostas. Evite usar idade, aparência, estado civil, maternidade, religião ou qualquer característica pessoal sem relação com a função como critério de seleção.";

/* -------------------------------------------------------------------------- */
/* A semente: o guia de recepção da JP, como a clínica escreveu                */
/* -------------------------------------------------------------------------- */

/**
 * Os dez critérios do guia, de 0 a 5 cada (total /50).
 *
 * A marcação de `soNaEntrevista` é a única leitura nossa sobre a tabela da
 * clínica, e ela responde a uma pergunta só: *o currículo consegue provar
 * isto?* Experiência em recepção, atendimento ao público, sistemas, rotinas
 * financeiras e estabilidade estão escritos no papel — a IA pontua e cita a
 * evidência. Comunicação e postura, organização no aperto, disponibilidade
 * real, compatibilidade com a equipe e perspectiva de permanência só aparecem
 * na conversa; ali a IA não opina, porque não viu a pessoa. As caixas ficam em
 * branco na ficha impressa, para a Dra. Ana Beatriz e o Jefferson preencherem
 * na mesa.
 */
const CRITERIOS_JP: CriterioGuia[] = [
  {
    chave: "comunicacao-postura",
    rotulo: "Comunicação e postura",
    soNaEntrevista: true,
    descricao:
      "Fala com clareza, olha no olho, responde o que foi perguntado. Cordialidade que o paciente sente no balcão.",
  },
  {
    chave: "experiencia-recepcao",
    rotulo: "Experiência em recepção",
    soNaEntrevista: false,
    descricao:
      "Já ocupou o posto de recepção de verdade: agenda, telefone, balcão, fluxo de pacientes. Tempo e lugar contam.",
  },
  {
    chave: "atendimento-publico",
    rotulo: "Atendimento ao público",
    soNaEntrevista: false,
    descricao:
      "Contato direto e presencial com público, paciente ou cliente. Script de telemarketing vale menos que balcão.",
  },
  {
    chave: "organizacao",
    rotulo: "Organização",
    soNaEntrevista: true,
    descricao:
      "Como se organiza com telefone tocando, recepção cheia e WhatsApp ao mesmo tempo. Método, não boa vontade.",
  },
  {
    chave: "sistemas-whatsapp",
    rotulo: "Sistemas / WhatsApp",
    soNaEntrevista: false,
    descricao:
      "Sistema de clínica, prontuário, CRM, agenda eletrônica, WhatsApp Web, planilha. Nome do sistema e para que usava.",
  },
  {
    chave: "rotinas-financeiras",
    rotulo: "Rotinas financeiras",
    soNaEntrevista: false,
    descricao:
      "Caixa, recebimentos, recibos, notas fiscais, conferência e fechamento do dia. Segurança com dinheiro alheio.",
  },
  {
    chave: "estabilidade",
    rotulo: "Estabilidade profissional",
    soNaEntrevista: false,
    descricao:
      "Tempo de casa nos vínculos anteriores, com peso maior no último. Trocas explicadas contam a favor.",
  },
  {
    chave: "disponibilidade",
    rotulo: "Disponibilidade",
    soNaEntrevista: true,
    descricao:
      "Segunda a sexta, 8h às 18h, com intervalo. Deslocamento, faculdade e compromisso fixo entram aqui.",
  },
  {
    chave: "compatibilidade-equipe",
    rotulo: "Compatibilidade com a equipe",
    soNaEntrevista: true,
    descricao:
      "Como lida com equipe e com conflito profissional. Clínica pequena: entrosamento é rotina, não detalhe.",
  },
  {
    chave: "permanencia",
    rotulo: "Perspectiva de permanência",
    soNaEntrevista: true,
    descricao:
      "O que espera do próximo emprego e o que a faria ficar alguns anos. Expectativa alinhada com o que a JP oferece.",
  },
];

/**
 * O guia de recepção que a clínica entregou, pronto para uso.
 *
 * `id`, `slug`, `criadoEm` e `atualizadoEm` ficam vazios: quem carimba é o
 * armazenamento, na hora de semear — assim a semente não carrega data de
 * compilação nem id falso.
 */
export function guiaSementeRecepcao(): GuiaEntrevista {
  return {
    ...guiaVazio(),
    titulo: "Guia de entrevista e seleção — Recepcionista",
    area: "recepcao",
    padrao: true,
    entrevistadores: "Dra. Ana Beatriz — Dentista e Coordenadora | Jefferson — Gestor",
    objetivo:
      "Conduzir entrevistas consistentes, comparar candidatas pelos mesmos critérios e registrar evidências para a decisão final.",
    perguntasGerais: [
      "Fale um pouco sobre você e sua trajetória profissional.",
      "O que motivou você a se candidatar a uma vaga de recepcionista em uma clínica odontológica?",
      "Conte sobre seu último emprego: qual era sua função, quanto tempo permaneceu e por que saiu?",
      "Qual foi o emprego em que você permaneceu por mais tempo? O que fez você permanecer nele?",
      "Como era sua rotina de atendimento ao público?",
      "Já trabalhou com agenda, confirmação de consultas, telefone e WhatsApp? Como era essa rotina?",
      "Já utilizou sistema de atendimento, prontuário, CRM ou sistema de clínica? Qual e para quais funções?",
      "Já trabalhou com pagamentos, caixa, recebimentos, recibos ou notas fiscais?",
      "Como lidaria com um paciente insatisfeito, nervoso ou reclamando de atraso?",
      "Como se organiza quando há telefone tocando, pacientes na recepção e mensagens no WhatsApp ao mesmo tempo?",
      "Como é seu relacionamento com equipes? Como costuma lidar com conflitos profissionais?",
      "O horário é de segunda a sexta, das 8h às 18h, com intervalo de almoço. É compatível com sua disponibilidade?",
      "Como será seu deslocamento até a clínica e quanto tempo aproximadamente levará?",
      "Você possui faculdade, curso ou outro compromisso fixo que possa interferir nesse horário?",
      "O que você espera do próximo emprego e o que faria você permanecer em uma empresa por alguns anos?",
    ],
    criterios: CRITERIOS_JP,
    sinaisObservacao: [
      "Comunicação e clareza",
      "Jogo de cintura no atendimento",
      "Postura e cordialidade",
      "Facilidade com computador, WhatsApp e sistemas",
      "Coerência da trajetória profissional",
      "Capacidade de trabalhar em equipe",
      "Estabilidade nos empregos anteriores",
      "Disponibilidade real para o horário",
      "Motivação real pela função",
      "Perspectiva de permanência na clínica",
    ],
    notaEtica: NOTA_ETICA_JP,
    regrasDesempate: [
      "Melhor combinação entre experiência real de recepção e aderência ao ambiente odontológico.",
      "Evidência concreta de domínio de agenda, WhatsApp, sistemas e resolução de problemas.",
      "Segurança com caixa, recebimentos, notas e conferência financeira.",
      "Disponibilidade real e perspectiva de permanência compatível com a necessidade da clínica.",
      "Em caso de empate técnico, priorizar a candidata que apresentou respostas mais específicas, exemplos verificáveis e menor necessidade de adaptação para começar.",
    ],
    notaMaxima: 5,
  };
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                    */
/* -------------------------------------------------------------------------- */

/** Os critérios que a IA pode pontuar: os que o currículo consegue provar. */
export function criteriosPontuaveisPelaIa(guia: GuiaEntrevista): CriterioGuia[] {
  return guia.criterios.filter((c) => !c.soNaEntrevista);
}

/** Os critérios que só a conversa responde — a IA não opina sobre nenhum deles. */
export function criteriosSoNaEntrevista(guia: GuiaEntrevista): CriterioGuia[] {
  return guia.criterios.filter((c) => c.soNaEntrevista);
}

/** Total possível do comparativo final ("/50" no guia da JP). */
export function totalPossivel(guia: GuiaEntrevista): number {
  return guia.criterios.length * guia.notaMaxima;
}

export function criterioPor(guia: GuiaEntrevista, chave: string): CriterioGuia | null {
  return guia.criterios.find((c) => c.chave === chave) ?? null;
}

/**
 * Qual guia vale para uma candidatura: o da vaga, senão o padrão da área, senão
 * qualquer um da área, senão o padrão geral, senão o primeiro da lista.
 *
 * Mora aqui, e não no servidor, porque as duas pontas precisam da MESMA
 * resposta: `guiaParaVaga` escolhe o guia com que a IA escreve a ficha, e a
 * gaveta escolhe o guia com que a ficha é lida, pontuada e impressa. Se as duas
 * regras vivessem separadas, um dia a folha impressa traria critérios de um
 * método e as notas sugeridas de outro — e ninguém na mesa perceberia.
 *
 * Devolve `null` quando não há guia nenhum; quem precisa de um valor sempre
 * (o servidor, o modo entrevista) completa com `guiaSementeRecepcao()`.
 */
export function escolherGuia(
  guias: GuiaEntrevista[],
  vagaId: string,
  area: AreaVaga,
): GuiaEntrevista | null {
  const daVaga =
    vagaId.length > 0 ? guias.find((g) => g.vagaId.length > 0 && g.vagaId === vagaId) : undefined;
  if (daVaga !== undefined) return daVaga;

  const daArea =
    guias.find((g) => g.area === area && g.padrao) ?? guias.find((g) => g.area === area);
  if (daArea !== undefined) return daArea;

  return guias.find((g) => g.padrao) ?? guias[0] ?? null;
}

/**
 * Campo -> mensagem, no mesmo formato de `validarVaga`. A ordem de inserção
 * importa: o servidor devolve a primeira mensagem como motivo da recusa.
 */
export function validarGuia(g: GuiaEntrevista): Record<string, string> {
  const erros: Record<string, string> = {};

  if (g.titulo.trim().length === 0) erros["titulo"] = "Dê um título ao guia.";
  if (!g.area) erros["area"] = "Escolha a área a que este guia se aplica.";
  if (g.criterios.length === 0) {
    // Sem critério não há ficha: é a tabela de notas que sustenta o comparativo
    // final e a decisão. Um guia só com perguntas viraria roteiro de conversa,
    // não método de seleção.
    erros["criterios"] = "O guia precisa de pelo menos um critério de avaliação.";
  }
  if (!Number.isInteger(g.notaMaxima) || g.notaMaxima < 1 || g.notaMaxima > 10) {
    erros["notaMaxima"] = "A nota máxima por critério precisa ficar entre 1 e 10.";
  }

  const chaves = new Set<string>();
  for (const c of g.criterios) {
    if (c.chave.length === 0 || chaves.has(c.chave)) {
      // Chave repetida faria duas linhas da tabela disputarem a mesma nota, e a
      // soma /50 passaria a depender de qual delas o React renderizou por último.
      erros["criterios"] = "Cada critério precisa de uma chave própria, sem repetição.";
      break;
    }
    chaves.add(c.chave);
  }

  return erros;
}

/**
 * Título -> chave de critério. Mesma normalização de `gerarSlug`, mas separada
 * de propósito: slug é URL de vaga e chave é identidade de linha da tabela; os
 * dois só parecem a mesma coisa até alguém mudar um deles.
 */
export function chaveDeCriterio(rotulo: string): string {
  return (
    rotulo
      .normalize("NFD")
      .replace(/\p{Mn}/gu, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 40) || "criterio"
  );
}

/* -------------------------------------------------------------------------- */
/* Calibragem: as oito fichas que a clínica JÁ escreveu à mão                  */
/* -------------------------------------------------------------------------- */

export type FichaDaClinica = {
  nome: string;
  pontoForte: string;
  oQueValidar: string;
  triagem: string[];
  perguntas: string[];
};

/**
 * As oito fichas da seção 5 do guia, redigidas pelos próprios entrevistadores.
 *
 * Elas existem aqui por um motivo específico e limitado: mostrar ao modelo o
 * TOM da casa — a concisão, a objetividade e o tipo de dúvida que a JP levanta.
 * O conteúdo é de outras pessoas e não pode reaparecer em ficha nenhuma; o
 * prompt diz isso explicitamente ("imite a forma, nunca o conteúdo").
 *
 * Repare no padrão que se repete nas oito e que a IA precisa reproduzir: toda
 * pergunta cita algo concreto daquele currículo — nome de empresa, nome de
 * sistema, ano de saída, cargo, lacuna. Nenhuma delas é "quais são seus pontos
 * fracos".
 */
export const FICHAS_DA_CLINICA: FichaDaClinica[] = [
  {
    nome: "Priscila Oliveira Lemos",
    pontoForte:
      "Mais de 10 anos de vivência clínica em consultórios odontológicos e estética; experiência prolongada em consultório; familiaridade com termos cirúrgicos, esterilização, instrumentais, agendamentos, pagamentos e software odontológico Easy.",
    oQueValidar:
      "Confirmar o nível real de experiência com convênios: autorizações, portais de operadoras, TISS e faturamento, versus rotina predominantemente particular.",
    triagem: [
      "Disponibilidade integral para o horário da clínica",
      "Deslocamento diário viável",
      "Uso diário do sistema Easy",
      "Já executou autorização e faturamento de convênios odontológicos na prática",
    ],
    perguntas: [
      "O atendimento era particular ou por convênio? Chegou a preencher guias TISS?",
      "Quais funções do Easy você usava no dia a dia?",
      "O que motivou a transição para a estética na Clinderm e o retorno à odontologia?",
      "Como era o suporte emergencial ao dentista durante os atendimentos?",
    ],
  },
  {
    nome: "Rose Gomes Maciel",
    pontoForte:
      "Experiência prolongada com atendimento, preenchimento e conferência de guias de convênios, agendamento e rotinas financeiras. Histórico de estabilidade e domínio de contas a pagar/receber, conciliação, caixa e notas fiscais.",
    oQueValidar:
      "A vivência com guias de saúde é antiga; validar adaptação a portais web atuais, sistemas de clínica e rotina digital da recepção.",
    triagem: [
      "Disponibilidade integral",
      "Facilidade atual com computador, WhatsApp Web e sistemas",
      "Aprende sistema novo com autonomia",
      "Interesse em permanecer em recepção no médio e longo prazo",
    ],
    perguntas: [
      "Que tecnologia você usava para autorizações web e para resolver glosas?",
      "Qual foi o motivo da saída da Disol depois de quase 8 anos, e como foi a passagem por caixa de supermercado?",
      "Como fazia o fechamento diário sem desassistir a recepção?",
      "Como conduzia pacientes ansiosos ou com dor?",
    ],
  },
  {
    nome: "Daniele Xavier",
    pontoForte:
      "Vivência odontológica extensa, formação como ASB e cursos voltados à recepção odontológica e redução de faltas. Conhece vocabulário, rotina clínica e operação de consultório.",
    oQueValidar:
      "Motivação para vaga estritamente administrativa, conciliação com a graduação em Odontologia, perspectiva de permanência e contexto do consultório próprio.",
    triagem: [
      "Disponibilidade integral",
      "Faculdade compatível, sem ausências recorrentes",
      "De acordo com função 100% administrativa, sem horas de estágio",
      "Sem atividade paralela conflitante",
    ],
    perguntas: [
      "Qual é a sua motivação para uma vaga operacional estando na graduação em Odontologia?",
      "Como funcionava o Consultório Próprio e por que ele foi encerrado?",
      "Como pretende conciliar o horário da clínica com a graduação?",
      "Como era a rotina de autorizações e faturamento onde você trabalhou?",
    ],
  },
  {
    nome: "Wanessa Borges Celestino",
    pontoForte:
      "Histórico de estabilidade profissional, experiência recente em ambiente hospitalar, triagem de ligações, atendimento e suporte a profissionais. Vivência com controle financeiro e atendimento ao público como autônoma.",
    oQueValidar:
      "Situação do vínculo atual, disponibilidade para migração, experiência efetiva com prontuário, faturamento e convênios, e adaptação a software odontológico.",
    triagem: [
      "Disponível para encerrar ou compatibilizar o vínculo atual",
      "Disponibilidade integral",
      "Facilidade com sistemas de clínica",
      "Aceita rotina intensa de balcão, telefone e WhatsApp",
    ],
    perguntas: [
      "Qual é o seu turno no Hospital Servidor Público e o que motiva o interesse em migrar?",
      "Você chegou a mexer com faturamento, prontuário ou autorização no hospital?",
      "Como equilibrava atendimento e caixa quando trabalhava como autônoma?",
      "Como você reagiria a um paciente agitado reclamando de valores?",
    ],
  },
  {
    nome: "Stefany Carolina Correa de Carvalho Cittatini",
    pontoForte:
      "Vivência hospitalar com prontuários, triagem e direcionamento de pacientes; experiência recente com WhatsApp e CRM, útil para confirmação de consultas, qualificação de contatos e resgate de faltosos.",
    oQueValidar:
      "Esclarecer datas e motivos de transições recentes; verificar experiência com elegibilidade, TISS e autorização de convênios.",
    triagem: [
      "Disponibilidade integral",
      "Sustenta alto volume de WhatsApp sem perder o atendimento presencial",
      "Já usou CRM de forma recorrente",
      "Interesse de permanência em saúde e odontologia",
    ],
    perguntas: [
      "Desde quando você está na Nova Toriba e o que motiva o retorno à área da saúde?",
      "Como foram os contratos terceirizados no Hospital Brasilândia e na Guima Conseco, e por que os desligamentos?",
      "Como usava o WhatsApp para manter a agenda cheia?",
      "Você chegou a conferir elegibilidade de planos e emitir guias TISS?",
    ],
  },
  {
    nome: "Cauane Feitosa de Oliveira",
    pontoForte:
      "Experiência recente em clínica de psicologia com WhatsApp, confirmação de agenda, recepção, acolhimento e organização do espaço. Perfil com vivência direta de rotina clínica.",
    oQueValidar:
      "Motivo de saída recente, compatibilidade da faculdade com o expediente, nível de experiência com recebimentos, notas fiscais, convênios e fechamento de caixa.",
    triagem: [
      "Turno da faculdade compatível com 8h às 18h",
      "Sem estágio ou compromisso fixo conflitante",
      "Disponibilidade presencial integral",
      "Confortável em aprender rotinas financeiras e de convênios",
    ],
    perguntas: [
      "Qual foi o motivo da saída da clínica de psicologia em agosto de 2026?",
      "Qual é o seu turno na UNIP e como você se organiza com ele?",
      "Você mexia com cobranças, notas fiscais, maquininha ou convênios?",
      "Como organizava o WhatsApp com a recepção cheia?",
    ],
  },
  {
    nome: "Suellen da Silva Meira",
    pontoForte:
      "Experiência prévia como recepcionista, com agendamentos, atendimento presencial e telefônico e organização documental. Prática em abertura e fechamento de caixa e emissão de notas fiscais.",
    oQueValidar:
      "Preencher a linha do tempo profissional, confirmar estabilidade e verificar adaptação à área de saúde e odontologia, onde não há experiência registrada.",
    triagem: [
      "Consegue informar datas completas dos últimos vínculos",
      "Disponibilidade integral",
      "Facilidade com sistemas, WhatsApp e rotina digital",
      "Disposta a aprender vocabulário de odontologia e convênios",
    ],
    perguntas: [
      "Quais foram as datas de início e saída na Empresa Ideal e nos empregos recentes?",
      "Qual era o ramo da Empresa Ideal e como você organizava o fluxo da recepção?",
      "Você teve algum contato prévio com clínica médica ou odontológica?",
      "Como era a conferência de valores e o fechamento diário na Polo Wear?",
    ],
  },
  {
    nome: "Raissa dos Santos Silva",
    pontoForte:
      "Relata experiência de aproximadamente 2 anos em recepção de clínica, com agenda médica, confirmação de consultas, exames e prontuários, além de caixa e emissão de notas fiscais.",
    oQueValidar:
      "O currículo não informa empresas nem datas. É essencial esclarecer e, se necessário, comprovar a experiência descrita, além de validar convênios e disponibilidade da faculdade.",
    triagem: [
      "Consegue informar nomes das clínicas e datas exatas",
      "Esclarece a natureza dos vínculos (CLT, estágio, prestação de serviços)",
      "Turno da faculdade compatível",
      "Trabalhou com portais de convênio ou somente particular",
    ],
    perguntas: [
      "Em quais clínicas você trabalhou, de qual especialidade e em que datas exatas?",
      "Os vínculos foram com carteira assinada, prestação de serviços ou estágio?",
      "Você fazia autorização em portais de convênio ou o atendimento era só particular?",
      "Qual é o turno de Biomedicina na Uninove e qual a sua disponibilidade real?",
    ],
  },
];

/**
 * As oito fichas da clínica em texto, prontas para entrar no prompt.
 *
 * O formato traz ponto forte, o que validar, os quatro itens de triagem e as
 * quatro perguntas de cada uma. É mais do que a linha resumida que
 * `exemplosDeFicha` produz a partir das fichas já preenchidas no sistema, e é
 * de propósito: enquanto ninguém preencheu nada, a única referência de forma
 * que o modelo tem são estas — e o que ele precisa aprender delas é
 * exatamente a estrutura 4 + 4 e o jeito de perguntar.
 */
export function exemplosDaClinica(): string {
  return FICHAS_DA_CLINICA.map((f, indice) => {
    const numero = String(indice + 1).padStart(2, "0");
    return [
      `${numero} — ${f.nome}`,
      `Ponto forte: ${f.pontoForte}`,
      `O que validar: ${f.oQueValidar}`,
      `Triagem objetiva: ${f.triagem.join(" · ")}`,
      `Perguntas de investigação: ${f.perguntas.join(" · ")}`,
    ].join("\n");
  }).join("\n\n");
}

/**
 * Uma ficha já preenchida no sistema, resumida em uma linha para calibragem.
 *
 * "nome | ponto forte | o que validar | decisão" — é o mínimo que mostra ao
 * modelo o gosto REAL desta clínica, e não o do PDF: com o tempo, o que a Dra.
 * Ana Beatriz e o Jefferson escreveram e decidiram vale mais como referência do
 * que os oito exemplos de fábrica.
 */
export function linhaDeExemplo(nome: string, ficha: FichaEntrevista): string {
  const decisao = DECISAO_EM_TEXTO[ficha.decisao] ?? "decisão não registrada";
  const partes = [
    nome.trim().length > 0 ? nome.trim() : "(sem nome)",
    ficha.pontoForte.trim() || "(sem ponto forte escrito)",
    ficha.oQueValidar.trim() || "(sem ponto a validar escrito)",
    decisao,
  ];
  return `- ${partes.join(" | ")}`;
}

const DECISAO_EM_TEXTO: Record<string, string> = {
  avanca: "avança",
  reserva: "reserva",
  "nao-avanca": "não avança",
};
