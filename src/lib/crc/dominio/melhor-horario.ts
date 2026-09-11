/**
 * Best Send Time — Fase H.
 *
 * A PERGUNTA: a que horas esta pessoa responde?
 *
 * O QUE ISTO NÃO É, antes de tudo. Não é um modelo. Não é aprendizado de
 * máquina. É contagem de quando a pessoa respondeu, com três cuidados que a
 * contagem ingênua não tem — e que são a diferença entre um número útil e um
 * número que parece útil.
 *
 * POR QUE NÃO UM MODELO. Uma clínica tem centenas de pacientes, não milhões, e
 * cada um tem uma dúzia de mensagens. Não há dado para treinar nada. O que há é
 * um padrão simples e legível: a pessoa que sempre responde às 19h responde às
 * 19h. Um modelo em cima disso seria a mesma resposta com menos explicação — e
 * "por que o sistema mandou às 19h?" precisa ter resposta.
 *
 * OS TRÊS CUIDADOS:
 *
 *   1. SÓ RESPOSTA CONTA, e não mensagem enviada. Mandar às 9h e a pessoa
 *      responder às 19h significa que 19h é a hora DELA — 9h é a hora de quem
 *      configurou a jornada. Contar envio mediria o hábito da clínica.
 *
 *   2. O FUSO É O DA CLÍNICA. Um horário calculado em UTC aponta 21h para quem
 *      respondeu às 18h, e a jornada dispararia depois do jantar.
 *
 *   3. POUCO DADO NÃO VIRA PALPITE. Abaixo de um mínimo, a resposta é "não sei"
 *      — e "não sei" faz o sistema usar a janela comercial padrão, que é o
 *      comportamento certo. Um palpite com duas amostras tem a aparência de
 *      personalização e o comportamento de ruído.
 */
import { diaLocal, FUSO_PADRAO } from "./dia-local";

/** Uma resposta do paciente, com a hora em que ela chegou. */
export type RespostaObservada = {
  /** ISO. O instante em que a mensagem do paciente chegou. */
  em: string;
};

export type FaixaDeHorario = {
  /** 0 a 23, no fuso da clínica. */
  horaInicio: number;
  horaFim: number;
  /** Quantas respostas caíram nesta faixa. */
  respostas: number;
};

export type MelhorHorario =
  | {
      sabemos: true;
      /** A hora local com mais respostas. */
      hora: number;
      /** Quantas respostas sustentam a conclusão. */
      amostras: number;
      /** 0 a 1. Quanto da atividade da pessoa está nesta faixa. */
      concentracao: number;
      /** Em português, para a tela. */
      explicacao: string;
    }
  | { sabemos: false; motivo: string };

/**
 * O mínimo de respostas para arriscar uma conclusão.
 *
 * CINCO, e o número é uma escolha conservadora. Com três, uma pessoa que
 * respondeu duas vezes de manhã e uma à tarde "prefere manhã" — e não prefere
 * nada, respondeu quando pôde. Cinco não elimina o acaso; reduz a chance de
 * chamar acaso de padrão.
 */
export const MINIMO_DE_RESPOSTAS = 5;

/**
 * A janela de agrupamento, em horas.
 *
 * TRÊS HORAS, e não uma. Ninguém responde sempre às 19h em ponto: responde
 * "depois do trabalho". Uma janela de uma hora espalharia a mesma pessoa entre
 * 18h, 19h e 20h e concluiria que não há padrão. Três horas capturam o hábito
 * sem virar "de manhã ou de tarde", que não ajuda ninguém.
 */
const JANELA_HORAS = 3;

export function melhorHorarioDe(
  respostas: readonly RespostaObservada[],
  fuso: string = FUSO_PADRAO,
): MelhorHorario {
  if (respostas.length < MINIMO_DE_RESPOSTAS) {
    return {
      sabemos: false,
      motivo: `São só ${String(respostas.length)} respostas. Com menos de ${String(MINIMO_DE_RESPOSTAS)}, qualquer horário é chute.`,
    };
  }

  const porHora = new Array<number>(24).fill(0);
  let validas = 0;

  for (const r of respostas) {
    const hora = horaLocal(r.em, fuso);
    if (hora === null) continue;
    porHora[hora] = (porHora[hora] ?? 0) + 1;
    validas += 1;
  }

  if (validas < MINIMO_DE_RESPOSTAS) {
    return { sabemos: false, motivo: "Não há respostas com data legível suficiente." };
  }

  /*
   * A JANELA DESLIZANTE É CIRCULAR, e isso não é firula.
   *
   * Quem responde às 23h e à 1h tem um hábito — a madrugada — e um laço que
   * para na hora 23 o partiria em dois grupos de um. O `% 24` custa nada e
   * resolve o caso de quem trabalha à noite, que numa clínica é bem mais comum
   * do que parece.
   */
  let melhorInicio = 0;
  let melhorSoma = -1;

  for (let inicio = 0; inicio < 24; inicio += 1) {
    let soma = 0;
    for (let d = 0; d < JANELA_HORAS; d += 1) soma += porHora[(inicio + d) % 24] ?? 0;
    if (soma > melhorSoma) {
      melhorSoma = soma;
      melhorInicio = inicio;
    }
  }

  const concentracao = melhorSoma / validas;

  /*
   * CONCENTRAÇÃO BAIXA TAMBÉM É "NÃO SEI".
   *
   * Uma pessoa que responde a qualquer hora tem dados de sobra e nenhum padrão.
   * Sem este corte, a janela com mais respostas venceria por um voto e o sistema
   * anunciaria um horário preferido que não existe — com a autoridade de quem
   * olhou vinte amostras.
   */
  if (concentracao < 0.4) {
    return {
      sabemos: false,
      motivo: "Esta pessoa responde a qualquer hora: não há horário preferido.",
    };
  }

  // A hora do MEIO da janela: é o alvo, e não a borda. Mandar às 18h para quem
  // responde entre 18h e 21h acerta a borda; 19h acerta o centro.
  const hora = (melhorInicio + Math.floor(JANELA_HORAS / 2)) % 24;

  return {
    sabemos: true,
    hora,
    amostras: validas,
    concentracao,
    explicacao: `${String(Math.round(concentracao * 100))}% das ${String(validas)} respostas desta pessoa chegaram entre ${String(melhorInicio)}h e ${String((melhorInicio + JANELA_HORAS) % 24)}h.`,
  };
}

/**
 * A hora local de um instante ISO.
 *
 * Reaproveita `diaLocal`, que já resolve fuso com `Intl` — e não com offset
 * fixo, porque -03 não é constante e subtrair três horas é um bug com data
 * marcada.
 */
function horaLocal(iso: string, fuso: string): number | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;

  try {
    const texto = new Intl.DateTimeFormat("en-CA", {
      timeZone: fuso,
      hour: "2-digit",
      hour12: false,
    }).format(new Date(t));
    const n = Number.parseInt(texto, 10);
    // `24` aparece em alguns runtimes para a meia-noite. Normalizar aqui evita
    // um índice fora do array que ninguém entenderia depois.
    return Number.isFinite(n) ? n % 24 : null;
  } catch {
    void diaLocal;
    return null;
  }
}

/**
 * A distribuição completa, para a tela mostrar o gráfico.
 *
 * SEPARADA DA CONCLUSÃO de propósito: a tela quer o desenho inteiro, e a jornada
 * quer um número. Devolver os dois juntos faria a jornada carregar 24 posições
 * para usar uma.
 */
export function distribuicaoPorFaixa(
  respostas: readonly RespostaObservada[],
  fuso: string = FUSO_PADRAO,
): FaixaDeHorario[] {
  const porHora = new Array<number>(24).fill(0);
  for (const r of respostas) {
    const hora = horaLocal(r.em, fuso);
    if (hora !== null) porHora[hora] = (porHora[hora] ?? 0) + 1;
  }

  const faixas: FaixaDeHorario[] = [];
  for (let inicio = 0; inicio < 24; inicio += JANELA_HORAS) {
    let soma = 0;
    for (let d = 0; d < JANELA_HORAS; d += 1) soma += porHora[(inicio + d) % 24] ?? 0;
    faixas.push({ horaInicio: inicio, horaFim: (inicio + JANELA_HORAS) % 24, respostas: soma });
  }
  return faixas;
}
