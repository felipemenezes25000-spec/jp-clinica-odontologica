/**
 * O Workflow Studio — a parte que pensa.
 *
 * ========================================================================
 *  A DECISÃO QUE GOVERNA ESTE ARQUIVO INTEIRO, e ela é uma recusa.
 *
 *  A referência pedida era Dify/Botpress: um canvas onde se arrastam nós e
 *  se ligam setas em qualquer direção. Não é o que este editor faz, e a
 *  razão não é preguiça — é que **o motor de jornadas não executa grafo.**
 *
 *  Ele executa isto, e só isto:
 *
 *      gatilho → condições de entrada → passos EM SEQUÊNCIA
 *                                        ↑ saídas avaliadas antes de CADA passo
 *
 *  Um canvas que deixasse desenhar duas setas saindo do mesmo nó estaria
 *  desenhando algo que o `motor.ts` não sabe rodar. A pessoa configuraria,
 *  salvaria, veria o desenho bonito na tela — e a jornada rodaria em linha
 *  reta ignorando os ramos. Esse é o pior defeito possível numa ferramenta
 *  de configuração: ela não dá erro, ela mente.
 *
 *  Então o editor mostra a forma REAL: uma coluna. O que parece limitação é
 *  honestidade — e quando o motor souber ramificar, este arquivo muda junto.
 * ========================================================================
 *
 * O QUE ESTE MÓDULO É: puro. Sem banco, sem rede, sem relógio de parede. Ele
 * responde duas perguntas — "isto é válido?" e "o que isto faz?" — e as duas
 * precisam ser respondíveis sem nada em pé, porque quem pergunta é a tela,
 * a cada tecla.
 */
import type {
  CondicaoAutomacao,
  DefinicaoAutomacao,
  GatilhoAutomacao,
  PassoAutomacao,
  TipoTarefa,
} from "./tipos";

/* -------------------------------------------------------------------------- */
/* A paleta                                                                   */
/* -------------------------------------------------------------------------- */

export type TipoPasso = PassoAutomacao["tipo"];

/**
 * Um passo, descrito para gente.
 *
 * `custaMensagem` existe porque é a única propriedade de um passo que gasta
 * dinheiro de verdade e chega no celular de um paciente. Ela é o que a tela usa
 * para somar o custo máximo por pessoa antes de alguém publicar — e é a conta
 * que ninguém faz de cabeça olhando uma lista de passos.
 */
export type PassoDaPaleta = {
  tipo: TipoPasso;
  nome: string;
  /** O que ele faz, na língua de quem opera a clínica. */
  explicacao: string;
  /** Manda WhatsApp? É o que separa "configuração" de "conta no fim do mês". */
  custaMensagem: boolean;
  /** Faz a jornada dormir? Muda o que vem depois dele. */
  pausa: boolean;
};

export const PALETA: readonly PassoDaPaleta[] = [
  {
    tipo: "ESPERAR",
    nome: "Esperar um tempo",
    explicacao: "Segura a jornada por um número de minutos antes do próximo passo.",
    custaMensagem: false,
    pausa: true,
  },
  {
    tipo: "ESPERAR_ATE",
    nome: "Esperar até um horário",
    explicacao:
      "Segura até uma hora do dia. Serve para não mandar mensagem de madrugada quando o gatilho cai às 3h.",
    custaMensagem: false,
    pausa: true,
  },
  {
    tipo: "ENVIAR_TEMPLATE",
    nome: "Enviar mensagem",
    explicacao: "Manda um modelo aprovado por WhatsApp. É o único passo que custa dinheiro.",
    custaMensagem: true,
    pausa: false,
  },
  {
    tipo: "CRIAR_TAREFA",
    nome: "Criar tarefa para a recepção",
    explicacao: "Põe o paciente na fila de alguém. É como a jornada devolve o caso para gente.",
    custaMensagem: false,
    pausa: false,
  },
  {
    tipo: "MOVER_ETAPA",
    nome: "Mover no funil",
    explicacao: "Muda a etapa da oportunidade, para o funil refletir o que já aconteceu.",
    custaMensagem: false,
    pausa: false,
  },
  {
    tipo: "DEFINIR_PROXIMA_ACAO",
    nome: "Marcar a próxima ação",
    explicacao: "Escreve o que alguém deve fazer, e quando. Aparece na fila do dia.",
    custaMensagem: false,
    pausa: false,
  },
  {
    tipo: "SAIR_SE",
    nome: "Sair se…",
    explicacao:
      "Encerra a jornada quando uma condição for verdadeira naquele ponto. É o ramo que este motor tem.",
    custaMensagem: false,
    pausa: false,
  },
];

const PALETA_POR_TIPO = new Map(PALETA.map((p) => [p.tipo, p]));

export const daPaleta = (tipo: TipoPasso): PassoDaPaleta | null =>
  PALETA_POR_TIPO.get(tipo) ?? null;

/** As condições, com o nome que uma pessoa da clínica usaria. */
export const ROTULO_CONDICAO: Readonly<Record<CondicaoAutomacao["tipo"], string>> = {
  SEM_CONSULTA_FUTURA: "não tem consulta marcada",
  TEM_CONSULTA_FUTURA: "já tem consulta marcada",
  PACIENTE_RESPONDEU: "o paciente respondeu",
  PACIENTE_NAO_RESPONDEU: "o paciente não respondeu",
  PACIENTE_ATIVO: "é paciente ativo",
  SEM_OPT_OUT: "não pediu para parar de receber",
  TEM_TELEFONE: "tem telefone cadastrado",
  SITUACAO_E: "a situação é",
  DIAS_DESDE_ULTIMA_CONSULTA_MAIOR_QUE: "faz mais de N dias desde a última consulta",
  SEMPRE: "sempre",
};

/* -------------------------------------------------------------------------- */
/* O diagnóstico                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `erro` impede publicar. `aviso` não.
 *
 * A LINHA ENTRE OS DOIS é uma pergunta só: **a jornada faz o que a pessoa
 * quis?** Se ela vai rodar e não fazer nada, ou fazer o oposto, é erro. Se vai
 * funcionar e incomodar alguém, é aviso — porque às vezes é intencional, e uma
 * ferramenta que proíbe o incomum vira uma ferramenta que se contorna por fora.
 */
export type Achado = {
  severidade: "erro" | "aviso";
  /** `null` quando o achado é da definição inteira, e não de um passo. */
  passo: number | null;
  mensagem: string;
  /** O que fazer. Sem isto, o achado é só uma reclamação. */
  conserto: string;
};

export type ContextoDeValidacao = {
  /** As chaves de modelo que existem. Um envio para chave inexistente falha. */
  templatesDisponiveis: readonly string[];
  /** As etapas do funil desta clínica. */
  etapasDisponiveis: readonly string[];
};

/**
 * Confere uma definição inteira.
 *
 * A ORDEM DOS ACHADOS É A ORDEM DA LEITURA: primeiro o que invalida a jornada
 * como um todo, depois passo a passo. Quem abre uma lista de vinte problemas lê
 * os três primeiros — então os três primeiros têm que ser os que importam.
 */
export function validarDefinicao(
  definicao: DefinicaoAutomacao,
  contexto: ContextoDeValidacao,
): Achado[] {
  const achados: Achado[] = [];
  const passos = definicao.passos;

  /* --- a jornada como um todo ------------------------------------------- */

  if (passos.length === 0) {
    achados.push({
      severidade: "erro",
      passo: null,
      mensagem: "A jornada não tem nenhum passo.",
      conserto: "Acrescente ao menos um passo, ou deixe a automação como rascunho.",
    });
  }

  /*
   * A ARMADILHA MAIS CARA DESTE EDITOR, e ela é invisível lendo a lista de
   * passos: as saídas são avaliadas ANTES DE CADA PASSO, inclusive o primeiro.
   * Uma saída `SEMPRE` encerra toda jornada antes do passo zero — e o painel
   * mostraria centenas de inscrições e nenhuma mensagem, sem nenhum erro.
   */
  for (const s of definicao.saidas) {
    if (s.condicao.tipo === "SEMPRE") {
      achados.push({
        severidade: "erro",
        passo: null,
        mensagem: 'A saída "sempre" encerra a jornada antes do primeiro passo.',
        conserto: 'Troque por uma condição real, ou remova a saída. "Sempre" aqui desliga tudo.',
      });
    }
  }

  /*
   * A SEGUNDA ARMADILHA: entrar por uma condição e sair pela MESMA condição.
   * A pessoa inscreve quem "já tem consulta marcada" e manda sair quem "já tem
   * consulta marcada". Ninguém completa um passo sequer, e a leitura de fora é
   * "a automação não funciona" — sem nada no log dizendo por quê.
   */
  const entradas = new Set(definicao.condicoes.map((c) => c.tipo));
  for (const s of definicao.saidas) {
    if (entradas.has(s.condicao.tipo)) {
      achados.push({
        severidade: "erro",
        passo: null,
        mensagem: `Entra por "${ROTULO_CONDICAO[s.condicao.tipo]}" e sai pela mesma condição.`,
        conserto:
          "Quem entrar vai sair antes do primeiro passo. Remova de um dos dois lados — normalmente da saída.",
      });
    }
  }

  if (definicao.saidas.length === 0 && passos.some((p) => temEspera(p))) {
    achados.push({
      severidade: "aviso",
      passo: null,
      mensagem: "A jornada espera, mas não tem nenhuma condição de saída.",
      conserto:
        'Sem saída, ela continua mesmo que o paciente já tenha resolvido sozinho — e manda "sentimos sua falta" para quem remarcou ontem. A saída usual é "já tem consulta marcada".',
    });
  }

  /* --- passo a passo ---------------------------------------------------- */

  let mensagensSeguidas = 0;

  for (let i = 0; i < passos.length; i += 1) {
    const p = passos[i];
    if (p === undefined) continue;

    achados.push(...validarPasso(p, i, contexto));

    if (p.tipo === "ENVIAR_TEMPLATE") {
      mensagensSeguidas += 1;
      /*
       * DUAS MENSAGENS SEM NADA ENTRE ELAS chegam no mesmo minuto. Do lado de
       * cá é "dois passos"; do lado do paciente é uma clínica que mandou duas
       * mensagens seguidas às 21h. É o tipo de coisa que faz bloquear o número.
       */
      if (mensagensSeguidas > 1) {
        achados.push({
          severidade: "aviso",
          passo: i,
          mensagem: "Duas mensagens seguidas, sem espera entre elas.",
          conserto: "Ponha uma espera no meio. As duas chegam no mesmo minuto como está.",
        });
      }
    } else if (temEspera(p)) {
      mensagensSeguidas = 0;
    }

    if (p.tipo === "SAIR_SE" && i === passos.length - 1) {
      achados.push({
        severidade: "aviso",
        passo: i,
        mensagem: 'O "sair se" é o último passo.',
        conserto:
          "Não há nada depois dele para evitar: a jornada terminaria aqui de qualquer jeito.",
      });
    }
  }

  /*
   * O PRIMEIRO PASSO SER UM ENVIO é quase sempre engano, e um engano que só
   * aparece em produção. O gatilho é um evento — o paciente acabou de faltar —
   * e a mensagem sai no mesmo segundo em que o sistema soube. Quem faltou às
   * 8h recebe "sentimos sua falta" às 8h01, antes de qualquer pessoa da clínica
   * ter olhado a agenda.
   */
  const primeiro = passos[0];
  if (primeiro !== undefined && primeiro.tipo === "ENVIAR_TEMPLATE") {
    achados.push({
      severidade: "aviso",
      passo: 0,
      mensagem: "A primeira coisa que a jornada faz é mandar mensagem.",
      conserto:
        "Ela sai no mesmo minuto do gatilho. Uma espera antes dá tempo de o paciente ligar, ou de alguém da recepção ver.",
    });
  }

  const ultimo = passos[passos.length - 1];
  if (ultimo !== undefined && temEspera(ultimo)) {
    achados.push({
      severidade: "aviso",
      passo: passos.length - 1,
      mensagem: "A jornada termina numa espera.",
      conserto: "Ela vai dormir e acordar só para terminar. Provavelmente falta um passo depois.",
    });
  }

  return achados;
}

function temEspera(p: PassoAutomacao): boolean {
  return p.tipo === "ESPERAR" || p.tipo === "ESPERAR_ATE";
}

function validarPasso(
  p: PassoAutomacao,
  i: number,
  contexto: ContextoDeValidacao,
): readonly Achado[] {
  const achados: Achado[] = [];

  switch (p.tipo) {
    case "ESPERAR":
      if (!Number.isFinite(p.minutos) || p.minutos <= 0) {
        achados.push({
          severidade: "erro",
          passo: i,
          mensagem: "A espera precisa ser de pelo menos um minuto.",
          conserto: "Zero ou negativo faz o passo não existir.",
        });
      }
      break;

    case "ESPERAR_ATE":
      if (!/^([01]\d|2[0-3]):[0-5]\d$/u.test(p.hora)) {
        achados.push({
          severidade: "erro",
          passo: i,
          mensagem: `"${p.hora}" não é um horário válido.`,
          conserto: "Use HH:MM em 24 horas — por exemplo, 09:00 ou 17:30.",
        });
      }
      break;

    case "ENVIAR_TEMPLATE":
      /*
       * MODELO INEXISTENTE É ERRO, E NÃO AVISO. O envio falha em tempo de
       * execução, no meio da jornada de um paciente de verdade — e o custo de
       * descobrir isso ali é muito maior do que o de barrar aqui.
       */
      if (p.template.trim().length === 0) {
        achados.push({
          severidade: "erro",
          passo: i,
          mensagem: "Nenhum modelo escolhido.",
          conserto: "Escolha o modelo que vai ser enviado.",
        });
      } else if (!contexto.templatesDisponiveis.includes(p.template)) {
        achados.push({
          severidade: "erro",
          passo: i,
          mensagem: `O modelo "${p.template}" não existe.`,
          conserto:
            "Cadastre-o em Modelos, ou escolha outro. Como está, o envio falha no meio da jornada.",
        });
      }
      break;

    case "CRIAR_TAREFA":
      if (p.titulo.trim().length === 0) {
        achados.push({
          severidade: "erro",
          passo: i,
          mensagem: "A tarefa não tem título.",
          conserto: "Quem abrir a fila precisa saber o que fazer sem abrir o paciente.",
        });
      }
      if (!Number.isFinite(p.prazoHoras) || p.prazoHoras <= 0) {
        achados.push({
          severidade: "erro",
          passo: i,
          mensagem: "O prazo da tarefa precisa ser maior que zero.",
          conserto: "Sem prazo, a tarefa nasce atrasada e some no meio da fila.",
        });
      }
      break;

    case "MOVER_ETAPA":
      if (contexto.etapasDisponiveis.length > 0 && !contexto.etapasDisponiveis.includes(p.etapa)) {
        achados.push({
          severidade: "erro",
          passo: i,
          mensagem: `A etapa "${p.etapa}" não existe no funil desta clínica.`,
          conserto: "Escolha uma das etapas configuradas.",
        });
      }
      break;

    case "DEFINIR_PROXIMA_ACAO":
      if (p.acao.trim().length === 0) {
        achados.push({
          severidade: "erro",
          passo: i,
          mensagem: "A próxima ação está em branco.",
          conserto: 'Escreva o que fazer — por exemplo, "ligar para confirmar".',
        });
      }
      break;

    case "SAIR_SE":
      if (p.motivo.trim().length === 0) {
        achados.push({
          severidade: "erro",
          passo: i,
          mensagem: "A saída não tem motivo.",
          conserto:
            "O motivo é o que aparece no relatório. Sem ele, ninguém sabe por que as jornadas terminaram.",
        });
      }
      break;
  }

  return achados;
}

/** Só os erros impedem publicar. */
export const podePublicar = (achados: readonly Achado[]): boolean =>
  !achados.some((a) => a.severidade === "erro");

/* -------------------------------------------------------------------------- */
/* A leitura em português                                                     */
/* -------------------------------------------------------------------------- */

/**
 * O que um passo faz, numa linha.
 *
 * POR QUE NÃO USAR O `rotulo` QUE VEM NA DEFINIÇÃO: ele é opcional e escrito à
 * mão, então mente assim que alguém muda o número e esquece o texto — um passo
 * rotulado "Esperar 2 horas" com `minutos: 1440`. Aqui o texto é DERIVADO do
 * dado, e por construção não tem como divergir.
 */
export function descreverPasso(p: PassoAutomacao): string {
  switch (p.tipo) {
    case "ESPERAR":
      return `Esperar ${duracao(p.minutos)}`;
    case "ESPERAR_ATE":
      return `Esperar até as ${p.hora}`;
    case "ENVIAR_TEMPLATE":
      return `Enviar "${p.template}"`;
    case "CRIAR_TAREFA":
      return `Criar tarefa "${p.titulo}" (${p.tipoTarefa}, ${duracao(p.prazoHoras * 60)})`;
    case "MOVER_ETAPA":
      return `Mover para "${p.etapa}"`;
    case "DEFINIR_PROXIMA_ACAO":
      return `Próxima ação: "${p.acao}" em ${duracao(p.emHoras * 60)}`;
    case "SAIR_SE":
      return `Sair se ${ROTULO_CONDICAO[p.condicao.tipo]}`;
  }
}

/**
 * Minutos em linguagem de gente.
 *
 * "2880 minutos" não significa nada para quem lê; "2 dias" significa. E o erro
 * que isto previne é real: configurar 120 achando que são duas horas quando o
 * campo estava em dias, ou o contrário.
 */
export function duracao(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos <= 0) return "sem espera";
  if (minutos < 60) return `${String(Math.round(minutos))} min`;

  const horas = minutos / 60;
  if (horas < 24) {
    const h = Math.round(horas * 10) / 10;
    return `${String(h)} ${h === 1 ? "hora" : "horas"}`;
  }

  const dias = Math.round((horas / 24) * 10) / 10;
  return `${String(dias)} ${dias === 1 ? "dia" : "dias"}`;
}

export function descreverGatilho(g: GatilhoAutomacao): string {
  if (g.tipo === "EVENTO") return `Quando acontece: ${g.evento}`;
  const rotulos: Record<string, string> = {
    RECALL: "pacientes sem consulta há seis meses",
    ANIVERSARIO: "aniversariantes do dia",
    CONFIRMACAO: "consultas de amanhã, para confirmar",
    ABANDONO: "orçamentos aprovados e não iniciados",
  };
  return `Varredura diária: ${rotulos[g.seletor] ?? g.seletor}`;
}

/* -------------------------------------------------------------------------- */
/* O resumo                                                                   */
/* -------------------------------------------------------------------------- */

export type ResumoDaJornada = {
  passos: number;
  mensagens: number;
  /** Do gatilho ao último passo, se ninguém sair antes. */
  duracaoTotalMinutos: number;
  tarefas: number;
  saidas: number;
};

/**
 * O que a jornada faz, em números.
 *
 * `duracaoTotalMinutos` é o **pior caso**: ninguém sai no meio. É o número certo
 * para a pergunta que se faz antes de publicar — "por quanto tempo esta coisa
 * fica perseguindo uma pessoa?" — e a resposta costuma surpreender quem montou.
 */
export function resumir(definicao: DefinicaoAutomacao): ResumoDaJornada {
  let mensagens = 0;
  let minutos = 0;
  let tarefas = 0;

  for (const p of definicao.passos) {
    if (p.tipo === "ENVIAR_TEMPLATE") mensagens += 1;
    else if (p.tipo === "CRIAR_TAREFA") tarefas += 1;
    else if (p.tipo === "ESPERAR") minutos += Math.max(p.minutos, 0);
    /*
     * `ESPERAR_ATE` NÃO ENTRA NA SOMA, e isso é deliberado: quanto ela dura
     * depende da hora em que a jornada chegou nela. Chutar "12 horas" daria um
     * número com aparência de precisão e sem conteúdo — pior que omitir.
     */
  }

  return {
    passos: definicao.passos.length,
    mensagens,
    duracaoTotalMinutos: minutos,
    tarefas,
    saidas: definicao.saidas.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Construir passos novos                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Um passo recém-criado, com valores que já fazem sentido.
 *
 * O PADRÃO NÃO É VAZIO de propósito. Um passo novo em branco obriga a pessoa a
 * preencher tudo antes de ver a forma da jornada — e a forma é justamente o que
 * ela veio ver. Com padrão plausível, arrasta-se primeiro e ajusta-se depois.
 */
export function passoNovo(tipo: TipoPasso): PassoAutomacao {
  switch (tipo) {
    case "ESPERAR":
      return { tipo: "ESPERAR", minutos: 120 };
    case "ESPERAR_ATE":
      return { tipo: "ESPERAR_ATE", hora: "09:00" };
    case "ENVIAR_TEMPLATE":
      return { tipo: "ENVIAR_TEMPLATE", template: "" };
    case "CRIAR_TAREFA":
      return {
        tipo: "CRIAR_TAREFA",
        titulo: "Falar com o paciente",
        tipoTarefa: "LIGAR" as TipoTarefa,
        prazoHoras: 24,
      };
    case "MOVER_ETAPA":
      return { tipo: "MOVER_ETAPA", etapa: "" };
    case "DEFINIR_PROXIMA_ACAO":
      return { tipo: "DEFINIR_PROXIMA_ACAO", acao: "Ligar para o paciente", emHoras: 24 };
    case "SAIR_SE":
      return {
        tipo: "SAIR_SE",
        condicao: { tipo: "PACIENTE_RESPONDEU" },
        motivo: "paciente_respondeu",
      };
  }
}

/**
 * Move um passo de lugar. Devolve um array novo.
 *
 * ÍNDICE FORA DA FAIXA DEVOLVE O ORIGINAL em vez de lançar: quem chama é um
 * `onDragEnd`, e um drop fora da lista é gesto normal de usuário, não erro de
 * programa.
 */
export function mover<T>(lista: readonly T[], de: number, para: number): T[] {
  if (de === para) return [...lista];
  if (de < 0 || de >= lista.length || para < 0 || para >= lista.length) return [...lista];

  const copia = [...lista];
  const [item] = copia.splice(de, 1);
  if (item === undefined) return [...lista];
  copia.splice(para, 0, item);
  return copia;
}
