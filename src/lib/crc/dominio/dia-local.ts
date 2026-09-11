/**
 * Que dia é hoje para a clínica — Fase D.
 *
 * O BUG QUE ESTE ARQUIVO EXISTE PARA MATAR cabe em uma linha:
 *
 *     agora.toISOString().slice(0, 10)
 *
 * Isso é o dia UTC. A Vercel roda em UTC, a clínica opera em -03, e o resultado
 * é que **o dia da clínica vira às 21h**.
 *
 * O EFEITO CONCRETO, e não teórico:
 *
 *   O teto diário de IA zera às 21h. Toda noite a clínica ganha três horas de
 *   orçamento extra — e quem configurou R$ 50 por dia paga por 27 horas de dia.
 *
 *   O relatório "gasto de hoje" mostra número errado das 21h à meia-noite, que é
 *   exatamente quando alguém fecha o caixa e olha.
 *
 *   Uma campanha agendada para "hoje" às 21h30 cai no balde de amanhã.
 *
 * POR QUE `Intl` E NÃO ARITMÉTICA DE OFFSET. Porque -03 não é constante: o
 * Brasil já teve horário de verão e pode ter de novo, e outros fusos mudam por
 * decreto. Subtrair três horas é um bug com data para explodir. `Intl` lê a base
 * de fusos do runtime, que é atualizada com ele.
 *
 * A FUNÇÃO É PURA e recebe o fuso, em vez de ler configuração: é domínio, e
 * domínio não consulta banco. Quem chama passa `configuracao.horario.fuso`.
 */

/** O fuso de quem não configurou nada. É onde a clínica fica. */
export const FUSO_PADRAO = "America/Sao_Paulo";

/**
 * `YYYY-MM-DD` no fuso informado.
 *
 * FUSO INVÁLIDO NÃO DERRUBA NADA: cai no padrão. Um dado de configuração
 * digitado errado não pode transformar "somar um gasto" em exceção no meio de um
 * turno — o erro de fuso desloca um relatório, a exceção derruba o atendimento.
 */
export function diaLocal(instante: Date, fuso: string = FUSO_PADRAO): string {
  try {
    // `en-CA` porque ele formata como `YYYY-MM-DD`, que é exatamente o formato
    // que o banco guarda. Montar a string à mão a partir das partes daria o
    // mesmo resultado com mais chance de errar o zero à esquerda.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: fuso,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instante);
  } catch {
    if (fuso === FUSO_PADRAO) {
      // O padrão também falhou: o runtime está sem base de fusos. Aí o dia UTC é
      // o melhor palpite que existe, e é melhor do que lançar.
      return instante.toISOString().slice(0, 10);
    }
    return diaLocal(instante, FUSO_PADRAO);
  }
}

/** O primeiro dia do mês local. É o começo da janela do teto mensal. */
export const primeiroDiaDoMesLocal = (instante: Date, fuso: string = FUSO_PADRAO): string =>
  `${diaLocal(instante, fuso).slice(0, 7)}-01`;

/**
 * O instante em que o dia local seguinte começa.
 *
 * Serve para agendamento: "rode isto quando virar o dia da clínica" não é
 * meia-noite UTC, e escrever meia-noite UTC é o mesmo bug com outra roupa.
 *
 * ANDA DE HORA EM HORA em vez de somar 24h porque o dia nem sempre tem 24 horas:
 * no início e no fim do horário de verão ele tem 23 ou 25. Somar 24h acerta 363
 * dias por ano e erra silenciosamente nos outros dois.
 */
export function proximaViradaDeDia(instante: Date, fuso: string = FUSO_PADRAO): Date {
  const hoje = diaLocal(instante, fuso);
  let cursor = instante.getTime();

  // 30 horas cobre qualquer dia, inclusive os de 25. O limite existe para o laço
  // não virar infinito se o fuso for tão exótico que o dia nunca mude.
  for (let i = 0; i < 30 * 60; i += 1) {
    cursor += 60_000;
    if (diaLocal(new Date(cursor), fuso) !== hoje) {
      // Achou o minuto da virada. Volta ao segundo zero dele.
      const d = new Date(cursor);
      d.setUTCSeconds(0, 0);
      return d;
    }
  }

  return new Date(instante.getTime() + 86_400_000);
}

/**
 * Quantos dias locais separam dois instantes.
 *
 * COMPARA DIAS, E NÃO MILISSEGUNDOS. "Faz 30 dias desde a última consulta" é
 * pergunta de calendário: das 23h de terça às 1h de quarta passou uma hora e
 * passou um dia. Dividir a diferença por 86.400.000 responde "zero", e é como se
 * escreve um recall que nunca dispara na data certa.
 */
export function diasLocaisEntre(de: Date, ate: Date, fuso: string = FUSO_PADRAO): number {
  const a = Date.parse(`${diaLocal(de, fuso)}T12:00:00.000Z`);
  const b = Date.parse(`${diaLocal(ate, fuso)}T12:00:00.000Z`);
  // Meio-dia dos dois lados: a folga de 12 horas absorve qualquer mudança de
  // offset entre as datas, e a divisão cai em inteiro exato.
  return Math.round((b - a) / 86_400_000);
}
