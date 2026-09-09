/**
 * Entender qual horário o paciente escolheu.
 *
 * O CONTEXTO: a clínica ofereceu duas ou três opções reais, vindas da agenda do
 * Dental Office. O paciente responde em português de WhatsApp — "10:40 tá
 * ótimo", "pode ser a segunda", "quinta de manhã", "o das 9". Alguém precisa
 * transformar isso num índice.
 *
 * POR QUE ISSO NÃO É TRABALHO DA IA
 * Porque marcar consulta errada é caro e silencioso: o paciente aparece na
 * terça, a agenda diz quinta, e ninguém descobre até a recepção olhar na cara
 * dele. A IA classifica a INTENÇÃO ("essa pessoa quer agendar"); a escolha do
 * horário é casamento de string com uma lista curta e fechada que nós mesmos
 * acabamos de oferecer. Regra determinística acerta ou devolve `null` — e
 * `null` aqui significa "pergunte de novo", que é o pior desfecho aceitável.
 *
 * A REGRA DE OURO DESTE ARQUIVO É A AMBIGUIDADE VENCER.
 * Se o texto casa com duas opções, ou se casa com hora que não foi oferecida,
 * o resultado é `null`. Nunca "o mais provável". Um chute com 80% de acerto
 * aqui produz um paciente irritado a cada cinco marcações.
 */

/** O que foi oferecido, na ordem em que apareceu na mensagem. */
export type OpcaoOferecida = {
  /** Início do horário, ISO com fuso. */
  inicioEm: string;
  /** A hora local já resolvida, "HH:MM" — o que o paciente leu na tela. */
  horaLocal: string;
  /** O dia local, "AAAA-MM-DD". Distingue duas opções na mesma hora. */
  diaLocal: string;
};

export type Escolha =
  | { tipo: "opcao"; indice: number }
  /** Quis marcar, mas não deu para saber qual. Pergunte de novo. */
  | { tipo: "ambigua" }
  /** Não escolheu nenhuma: pediu outro dia, outro horário, ou mudou de assunto. */
  | { tipo: "nenhuma" }
  /** Disse explicitamente que nenhuma serve. Vale sair da automação. */
  | { tipo: "recusa" };

/** Tira acento e caixa. O paciente escreve "às 10h" e "as 10 h" com a mesma intenção. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Todas as horas citadas no texto, em minutos desde a meia-noite.
 *
 * Aceita `10:40`, `10h40`, `10h`, `10 horas`, `10hs`. NÃO aceita `10` sozinho:
 * "quero as 10 primeiras" e "sou o paciente 10" existem, e um número solto é
 * fraco demais para marcar consulta. Se o paciente escrever só "10", a resposta
 * é ambígua e a clínica pergunta — que é o comportamento certo.
 */
function horasCitadas(texto: string): number[] {
  const achados: number[] = [];

  // Duas formas de dizer hora, e as duas precisam de uma âncora:
  //
  //   `10:40`, `10h40`, `10h`, `10 horas` — a âncora é o separador.
  //   `2 da tarde`, `9 da manhã`         — a âncora é o período por extenso.
  //
  // O que NÃO existe aqui é número solto: "quero as 10 primeiras" e "sou o
  // paciente 10" são frases reais, e um número sem âncora é fraco demais para
  // marcar consulta. Sem âncora, a resposta vira ambígua e a clínica pergunta.
  const comSeparador = /\b(\d{1,2})\s*(?::|h(?:ora)?s?)\s*(\d{2})?\b/gu;
  const comPeriodo = /\b(\d{1,2})\s*(?:h(?:ora)?s?)?\s*(?:da|de|à|a)\s+(manha|tarde|noite)\b/gu;

  const registrar = (h: number, min: number, periodo: string | null): void => {
    if (!Number.isFinite(h) || h > 23 || min > 59) return;

    // O período dito por extenso RESOLVE a ambiguidade em vez de criá-la:
    // "2 da tarde" é 14h e só 14h. Guardar também 02:00 reintroduziria a
    // dúvida que a própria pessoa acabou de eliminar.
    if (periodo === "tarde" || periodo === "noite") {
      achados.push((h < 12 ? h + 12 : h) * 60 + min);
      return;
    }
    if (periodo === "manha") {
      achados.push((h === 12 ? 0 : h) * 60 + min);
      return;
    }

    achados.push(h * 60 + min);

    // Sem período dito, "pode ser as 2h" num contexto comercial é quase sempre
    // 14h. Guardamos as DUAS leituras e deixamos a lista de opções desempatar:
    // se só uma das duas foi oferecida, não há ambiguidade nenhuma na prática.
    if (h >= 1 && h <= 7) achados.push((h + 12) * 60 + min);
  };

  for (const m of texto.matchAll(comPeriodo)) {
    registrar(Number.parseInt(m[1] ?? "", 10), 0, m[2] ?? null);
  }
  for (const m of texto.matchAll(comSeparador)) {
    registrar(
      Number.parseInt(m[1] ?? "", 10),
      m[2] === undefined ? 0 : Number.parseInt(m[2], 10),
      null,
    );
  }
  return achados;
}

function minutosDe(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number.parseInt(h ?? "0", 10) * 60 + Number.parseInt(m ?? "0", 10);
}

/** Palavras que dizem "nenhuma dessas serve". */
const RECUSAS = [
  "nenhum",
  "nenhuma",
  "nao posso",
  "nao consigo",
  "nao da",
  "nao vai dar",
  "outro dia",
  "outro horario",
  "mais tarde",
  "outra semana",
  "impossivel",
];

const ORDINAIS: ReadonlyArray<readonly [RegExp, number]> = [
  [/\b(primeir[ao]|1a?º?|opcao 1|a 1)\b/u, 0],
  [/\b(segund[ao]|2a?º?|opcao 2|a 2)\b/u, 1],
  [/\b(terceir[ao]|3a?º?|opcao 3|a 3)\b/u, 2],
];

/**
 * Casa a resposta do paciente com as opções oferecidas.
 *
 * A ORDEM DAS TENTATIVAS É DELIBERADA:
 *
 *   1. Recusa primeiro. "Nenhum desses horários, pode ser 10:40 de outro dia?"
 *      cita uma hora que talvez até case — e ainda assim é recusa. Ler a hora
 *      antes da recusa marcaria consulta contra a vontade explícita da pessoa.
 *
 *   2. Hora, depois ordinal. Quem escreve "10:40" está olhando para a opção,
 *      e a hora é mais específica que "a segunda" — que depende de o paciente
 *      e a clínica contarem a lista igual.
 */
export function interpretarEscolha(
  bruto: string,
  opcoes: readonly OpcaoOferecida[],
): Escolha {
  const texto = normalizar(bruto);
  if (texto.length === 0 || opcoes.length === 0) return { tipo: "nenhuma" };

  if (RECUSAS.some((r) => texto.includes(r))) return { tipo: "recusa" };

  // --- Por hora citada ---
  const citadas = horasCitadas(texto);
  if (citadas.length > 0) {
    const casam = new Set<number>();
    for (const [i, o] of opcoes.entries()) {
      if (citadas.includes(minutosDe(o.horaLocal))) casam.add(i);
    }
    // Duas opções na mesma hora em dias diferentes: só o dia desempata, e o
    // paciente não citou dia. Perguntar é mais barato que adivinhar.
    if (casam.size === 1) {
      const [indice] = [...casam];
      return { tipo: "opcao", indice: indice ?? 0 };
    }
    if (casam.size > 1) return { tipo: "ambigua" };

    // Citou hora, e nenhuma das oferecidas bate. Não é escolha — é
    // contraproposta, e contraproposta é assunto de gente.
    return { tipo: "nenhuma" };
  }

  // --- Por ordinal ---
  for (const [padrao, indice] of ORDINAIS) {
    if (padrao.test(texto) && indice < opcoes.length) return { tipo: "opcao", indice };
  }

  // --- Aceite genérico com uma única opção na mesa ---
  // "pode ser", "fechado", "ok" só é suficiente quando não há o que confundir.
  if (opcoes.length === 1 && /\b(pode ser|fechado|ok|isso|perfeito|confirmo|topo|beleza|sim)\b/u.test(texto)) {
    return { tipo: "opcao", indice: 0 };
  }

  return { tipo: "nenhuma" };
}
