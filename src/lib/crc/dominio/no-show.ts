/**
 * Risco de falta — quem provavelmente não vem, e POR QUÊ.
 *
 * ============================================================================
 *  O QUE ESTE ARQUIVO DELIBERADAMENTE NÃO USA, e a lista é a parte importante:
 *
 *      idade · gênero · bairro · convênio · renda · nome
 *
 *  Não é só uma restrição ética do §17 — é que nenhum deles prevê falta. O que
 *  prevê é COMPORTAMENTO: já faltou antes, remarcou duas vezes, marcou com dois
 *  meses de antecedência, não confirmou, é a primeira consulta.
 *
 *  E a diferença prática é grande: um modelo que usa bairro aprende a tratar
 *  pior quem mora longe, o que é exatamente o oposto do que a clínica quer —
 *  quem mora longe e vem assim mesmo é o paciente mais fiel que ela tem.
 * ============================================================================
 *
 * ============================================================================
 *  POR QUE HEURÍSTICA, E NÃO MODELO.
 *
 *  Um modelo precisaria de milhares de desfechos rotulados desta clínica, e
 *  eles não existem. Treinado com poucos, decoraria o ruído.
 *
 *  Mas a razão principal é outra: a saída daqui vira AÇÃO sobre uma pessoa —
 *  uma ligação extra, um lembrete a mais, um horário oferecido à lista de
 *  espera em paralelo. Cada uma dessas custa incômodo para alguém, e a recepção
 *  precisa poder olhar a tela e discordar. "Risco alto" sem motivo é um rótulo;
 *  "risco alto: faltou nas duas últimas e não confirmou" é um argumento.
 * ============================================================================
 *
 * TUDO PURO. O instante entra por parâmetro.
 */

export type NivelDeRisco = "BAIXO" | "MEDIO" | "ALTO";

export type FatorDeRisco = {
  chave: string;
  /** Pronto para a tela, na voz de quem vai ler. */
  rotulo: string;
  pontos: number;
};

export type RiscoDeFalta = {
  nivel: NivelDeRisco;
  /** 0..100. Não é probabilidade: é ordem de atenção. */
  pontos: number;
  fatores: FatorDeRisco[];
  /** O que fazer, em uma frase. */
  acao: string;
  versao: string;
};

/** A versão da régua. Muda quando os pesos mudam — ver `radar.ts`. */
export const VERSAO_DO_RISCO = "no-show-1";

export type ContextoDeFalta = {
  /** Consultas concluídas do paciente. Mede vínculo. */
  consultasConcluidas: number;
  /** Quantas vezes faltou, no total. */
  faltas: number;
  /** Faltou na ÚLTIMA consulta marcada? Pesa mais que o total. */
  faltouNaUltima: boolean;
  /** Quantas vezes remarcou nos últimos meses. */
  remarcacoes: number;
  /** Horas entre a marcação e a consulta. Antecedência grande esfria. */
  horasDeAntecedencia: number;
  /** Já confirmou esta consulta? */
  confirmada: boolean;
  /** Horas que faltam para a consulta. */
  horasAteAConsulta: number;
  /** Primeira consulta desta pessoa na clínica. */
  primeiraVez: boolean;
  /** A pessoa respondeu alguma mensagem nossa nos últimos 90 dias. */
  respondeMensagens: boolean;
  /** Começa antes das 9h ou depois das 18h — os extremos faltam mais. */
  horarioExtremo: boolean;
  /** Segunda de manhã e sexta à tarde concentram falta. */
  diaDeRisco: boolean;
};

const ALTO = 55;
const MEDIO = 30;

/**
 * O risco, com a explicação junto.
 *
 * A ESCALA É 0..100 COM TETO RÍGIDO. Sem teto, um paciente com todos os sinais
 * chegaria a 140, e "risco 140/100" não significa nada para quem lê.
 */
export function calcularRiscoDeFalta(ctx: ContextoDeFalta, _agora?: Date): RiscoDeFalta {
  const fatores: FatorDeRisco[] = [];
  const somar = (chave: string, rotulo: string, pontos: number): void => {
    if (pontos === 0) return;
    fatores.push({ chave, rotulo, pontos });
  };

  /*
   * 1. O HISTÓRICO DE FALTA É O SINAL MAIS FORTE, e de longe.
   *
   * Quem faltou uma vez falta de novo com frequência muito maior que a média.
   * Mas a ÚLTIMA pesa separado do total de propósito: alguém com 20 consultas e
   * 2 faltas antigas é um paciente fiel; alguém com 3 consultas e a última
   * falta é outra história, e a taxa sozinha (ambos ~10%) não distinguiria.
   */
  if (ctx.faltouNaUltima) somar("ultima", "Faltou na última consulta", 30);

  if (ctx.faltas > 0 && ctx.consultasConcluidas + ctx.faltas > 0) {
    const taxa = ctx.faltas / (ctx.consultasConcluidas + ctx.faltas);
    /*
     * A FAIXA DE 60% É SEPARADA DAS DEMAIS, e a separação nasceu de um caso que
     * o modelo classificava errado: quem faltou em 4 das 5 últimas consultas
     * caía na mesma faixa de quem faltou em 2 de 5.
     *
     * Não são o mesmo paciente. Abaixo de 60% existe um histórico irregular;
     * acima, existe uma pessoa para quem marcar consulta não significa vir — e
     * a clínica precisa tratar a agenda dela de outro jeito, com encaixe
     * preparado por padrão.
     */
    if (taxa >= 0.6) somar("historico", `Faltou em ${pct(taxa)} das consultas`, 35);
    else if (taxa >= 0.4) somar("historico", `Faltou em ${pct(taxa)} das consultas`, 25);
    else if (taxa >= 0.2) somar("historico", `Faltou em ${pct(taxa)} das consultas`, 15);
    else somar("historico", `Já faltou ${String(ctx.faltas)}×`, 7);
  }

  // 2. Remarcar muito é o ensaio da falta: a pessoa já está adiando.
  if (ctx.remarcacoes >= 3) somar("remarcacoes", "Remarcou 3× ou mais", 16);
  else if (ctx.remarcacoes === 2) somar("remarcacoes", "Remarcou duas vezes", 9);

  /*
   * 3. NÃO CONFIRMAR, PERTO DA HORA.
   *
   * A janela importa: não ter confirmado uma consulta que é daqui a duas
   * semanas não diz nada — ninguém confirma com duas semanas. Não ter
   * confirmado a de amanhã diz muito.
   */
  if (!ctx.confirmada) {
    if (ctx.horasAteAConsulta <= 24) somar("confirmacao", "Não confirmou, e é amanhã", 22);
    else if (ctx.horasAteAConsulta <= 72) somar("confirmacao", "Ainda não confirmou", 10);
  } else {
    /*
     * ========================================================================
     *  CONFIRMAR DERRUBA O RISCO — MAS NÃO IGUALMENTE PARA TODO MUNDO.
     *
     *  Esta gradação nasceu de um teste que falhou, e o teste estava certo:
     *  quem faltou em 4 das últimas 5 consultas e confirmou esta caía para
     *  risco médio, como se a confirmação de um faltante crônico valesse o
     *  mesmo que a de um paciente pontual.
     *
     *  Não vale. Confirmação é uma PROMESSA, e o histórico é o que diz quanto
     *  as promessas daquela pessoa costumam valer. Quem confirma e não aparece
     *  já provou que a confirmação dele é fraca — dar a ele o desconto cheio é
     *  tratar a promessa como o fato.
     *
     *  O desconto vai de -25 (sem histórico de falta) a -8 (faltante crônico).
     *  Continua sendo o maior sinal positivo do modelo, e continua fazendo a
     *  confirmação valer a pena como intervenção — só deixa de apagar o que já
     *  se sabe.
     * ========================================================================
     */
    const total = ctx.consultasConcluidas + ctx.faltas;
    const taxaDeFalta = total > 0 ? ctx.faltas / total : 0;
    const desconto = taxaDeFalta >= 0.5 ? -8 : taxaDeFalta >= 0.25 ? -15 : -25;

    somar(
      "confirmacao",
      taxaDeFalta >= 0.5 ? "Confirmou — mas já confirmou e faltou antes" : "Confirmou presença",
      desconto,
    );
  }

  /*
   * 4. ANTECEDÊNCIA. Marcar com dois meses e esquecer é o caso clássico —
   * a vida muda no meio. Marcar para depois de amanhã é intenção fresca.
   */
  if (ctx.horasDeAntecedencia >= 24 * 45) somar("antecedencia", "Marcada há mais de 45 dias", 14);
  else if (ctx.horasDeAntecedencia >= 24 * 21)
    somar("antecedencia", "Marcada há mais de 3 semanas", 8);
  else if (ctx.horasDeAntecedencia <= 48) somar("antecedencia", "Marcada há pouco", -8);

  // 5. Primeira vez: sem vínculo, sem custo de desmarcar.
  if (ctx.primeiraVez) somar("primeira", "Primeira consulta na clínica", 14);

  // 6. Vínculo. Quem já veio muitas vezes vem de novo.
  if (ctx.consultasConcluidas >= 8) somar("vinculo", "Paciente de longa data", -18);
  else if (ctx.consultasConcluidas >= 3) somar("vinculo", "Já se tratou aqui", -10);

  // 7. Silêncio. Quem nunca responde também não avisa que não vem.
  if (!ctx.respondeMensagens) somar("silencio", "Não responde às mensagens", 10);

  /*
   * 8 e 9. HORÁRIO E DIA pesam pouco de propósito.
   *
   * São regularidades reais e fracas. Dar peso grande a elas faria a clínica
   * concluir que "segunda de manhã é ruim" e parar de marcar — quando o
   * problema é o lembrete, não o horário.
   */
  if (ctx.horarioExtremo) somar("horario", "Horário de início ou fim do dia", 6);
  if (ctx.diaDeRisco) somar("dia", "Dia com mais faltas historicamente", 4);

  const bruto = fatores.reduce((s, f) => s + f.pontos, 0);
  const pontos = Math.max(0, Math.min(100, bruto));

  fatores.sort((a, b) => Math.abs(b.pontos) - Math.abs(a.pontos));

  const nivel: NivelDeRisco = pontos >= ALTO ? "ALTO" : pontos >= MEDIO ? "MEDIO" : "BAIXO";

  return { nivel, pontos, fatores, acao: acaoPara(nivel, ctx), versao: VERSAO_DO_RISCO };
}

/**
 * O que fazer com o número.
 *
 * ============================================================================
 *  A AÇÃO DE RISCO ALTO NÃO É "LIGAR MAIS", e essa é a decisão de produto
 *  deste arquivo.
 *
 *  Insistir com quem vai faltar não faz a pessoa vir: ela já decidiu, ou a
 *  vida decidiu por ela. O que recupera a hora é PREPARAR O ENCAIXE — deixar a
 *  lista de espera pronta para ocupar a cadeira se a falta acontecer.
 *
 *  A clínica não pode controlar se a pessoa vem. Pode controlar se a cadeira
 *  fica vazia.
 * ============================================================================
 */
function acaoPara(nivel: NivelDeRisco, ctx: ContextoDeFalta): string {
  if (nivel === "ALTO") {
    if (!ctx.confirmada && ctx.horasAteAConsulta <= 48) {
      return "Confirmar por telefone e já preparar encaixe para este horário.";
    }
    return "Preparar encaixe: deixar a lista de espera pronta para esta janela.";
  }
  if (nivel === "MEDIO") {
    return ctx.confirmada
      ? "Lembrete de véspera, como de costume."
      : "Pedir confirmação com 48h de antecedência.";
  }
  return "Nada além do lembrete padrão.";
}

const pct = (v: number): string => `${String(Math.round(v * 100))}%`;

/* -------------------------------------------------------------------------- */

/**
 * O horário é de início ou fim de expediente?
 *
 * Vive aqui, e não em quem chama, porque a regra é do modelo de risco: mudar a
 * faixa é mudar o que "horário extremo" significa, e isso tem que mudar num
 * lugar só.
 */
export function ehHorarioExtremo(horaLocal: number): boolean {
  return horaLocal < 9 || horaLocal >= 18;
}

/**
 * Segunda de manhã e sexta à tarde.
 *
 * São as duas janelas em que falta concentra em consultório: a segunda porque a
 * semana começa atropelada, a sexta porque a pessoa já emendou o fim de semana.
 * Vale pouco no escore — ver o comentário do fator 9.
 */
export function ehDiaDeRisco(diaSemana: number, horaLocal: number): boolean {
  if (diaSemana === 1 && horaLocal < 12) return true;
  if (diaSemana === 5 && horaLocal >= 14) return true;
  return false;
}
