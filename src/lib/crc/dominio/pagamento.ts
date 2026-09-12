/**
 * Política de pagamento — o que a automação pode dizer sobre dinheiro.
 *
 * ============================================================================
 *  A LINHA QUE ESTE MÓDULO DESENHA, e ela é a razão de ele existir:
 *
 *      INFORMAR uma condição já decidida  →  a automação pode.
 *      NEGOCIAR uma condição nova         →  a automação não pode.
 *
 *  "Dá para parcelar em até 6× sem juros" é informar: alguém decidiu isso, está
 *  escrito, e repetir não muda nada. "Consigo fazer 10% para você" é negociar —
 *  e a automação não tem alçada para dar desconto, nem critério para saber
 *  quando vale.
 *
 *  O §29 é explícito: a IA nunca inventa desconto, taxa ou parcelamento.
 * ============================================================================
 *
 * ============================================================================
 *  E O TEXTO VAI PRONTO, escrito por uma pessoa.
 *
 *  A tentação é deixar o modelo formular a frase a partir dos números. O
 *  problema aparece na terceira mensagem: "dá para parcelar" vira "dá para
 *  parcelar em quantas vezes você precisar", porque o modelo está otimizando
 *  para ser útil e não para ser exato.
 *
 *  `textoParaPaciente` existe para o agente CITAR em vez de formular.
 * ============================================================================
 *
 * TUDO PURO.
 */

export type Politica = {
  nome: string;
  descontoMaxPct: number;
  /** `null` = ninguém aprova acima do teto. O teto é rígido. */
  aprovadorPapel: string | null;
  parcelasMax: number;
  parcelasSemJuros: number;
  parcelaMinima: number;
  /** A frase pronta. `null` = o agente não fala de pagamento. */
  textoParaPaciente: string | null;
};

/**
 * A política que nasce com uma clínica nova.
 *
 * TUDO FECHADO: zero de desconto, uma parcela, nenhum texto. Uma política que
 * nasce permissiva é uma política que ninguém configurou — e o primeiro efeito
 * dela seria o agente falando de parcelamento que a clínica não oferece.
 */
export const POLITICA_PADRAO: Politica = {
  nome: "Padrão",
  descontoMaxPct: 0,
  aprovadorPapel: null,
  parcelasMax: 1,
  parcelasSemJuros: 1,
  parcelaMinima: 0,
  textoParaPaciente: null,
};

/* -------------------------------------------------------------------------- */
/* O desconto                                                                 */
/* -------------------------------------------------------------------------- */

export type PedidoDeDesconto = {
  valorOriginal: number;
  valorProposto: number;
  politica: Politica;
  /** O papel de quem está pedindo. */
  papel: string;
};

export type VereditoDeDesconto =
  | { permitido: true; pct: number; motivo: string }
  | { permitido: false; pct: number; motivo: string; precisaDe: string | null };

/**
 * Este desconto pode?
 *
 * ============================================================================
 *  A FUNÇÃO NUNCA É CHAMADA PELA AUTOMAÇÃO — é chamada pela TELA, quando uma
 *  pessoa digita um valor.
 *
 *  Isso é de propósito. Se a automação pudesse consultá-la, alguém acabaria
 *  ligando um caminho em que o agente "verifica se pode" e oferece. O agente
 *  não oferece desconto; ele lê `textoParaPaciente` e para por aí.
 * ============================================================================
 */
export function avaliarDesconto(p: PedidoDeDesconto): VereditoDeDesconto {
  if (p.valorOriginal <= 0) {
    return {
      permitido: false,
      pct: 0,
      motivo: "O valor original precisa ser maior que zero.",
      precisaDe: null,
    };
  }

  if (p.valorProposto > p.valorOriginal) {
    return {
      permitido: true,
      pct: 0,
      motivo: "O valor proposto é maior que o original: não há desconto.",
    };
  }

  const pct = Number((((p.valorOriginal - p.valorProposto) / p.valorOriginal) * 100).toFixed(2));

  if (pct <= p.politica.descontoMaxPct) {
    return {
      permitido: true,
      pct,
      motivo:
        pct === 0
          ? "Sem desconto."
          : `${String(pct)}% está dentro do teto de ${String(p.politica.descontoMaxPct)}%.`,
    };
  }

  /*
   * ACIMA DO TETO SEM APROVADOR CONFIGURADO É RECUSA, e não "pergunte a
   * alguém". A política diz que o teto é rígido; inventar um caminho de exceção
   * aqui contornaria a decisão que a clínica tomou.
   */
  if (p.politica.aprovadorPapel === null) {
    return {
      permitido: false,
      pct,
      motivo: `${String(pct)}% passa do teto de ${String(p.politica.descontoMaxPct)}%, e esta política não tem alçada de exceção.`,
      precisaDe: null,
    };
  }

  if (p.papel === p.politica.aprovadorPapel || p.papel === "admin") {
    return {
      permitido: true,
      pct,
      motivo: `${String(pct)}% passa do teto, e você tem alçada para aprovar.`,
    };
  }

  return {
    permitido: false,
    pct,
    motivo: `${String(pct)}% passa do teto de ${String(p.politica.descontoMaxPct)}%.`,
    precisaDe: p.politica.aprovadorPapel,
  };
}

/* -------------------------------------------------------------------------- */
/* O parcelamento                                                             */
/* -------------------------------------------------------------------------- */

export type OpcaoDeParcela = {
  parcelas: number;
  valorDaParcela: number;
  semJuros: boolean;
};

/**
 * As opções de parcela que cabem na política.
 *
 * ============================================================================
 *  A PARCELA MÍNIMA É O QUE IMPEDE A LISTA DE FICAR RIDÍCULA.
 *
 *  Sem ela, um tratamento de R$ 600 em 12× vira parcela de R$ 50 — que custa
 *  mais para cobrar do que vale, e que a clínica não quer oferecer. Com ela, a
 *  lista para onde faz sentido parar.
 * ============================================================================
 */
export function opcoesDeParcelamento(valor: number, politica: Politica): OpcaoDeParcela[] {
  if (valor <= 0) return [];

  const opcoes: OpcaoDeParcela[] = [];

  for (let n = 1; n <= politica.parcelasMax; n += 1) {
    const daParcela = valor / n;
    if (n > 1 && daParcela < politica.parcelaMinima) break;

    opcoes.push({
      parcelas: n,
      valorDaParcela: Number(daParcela.toFixed(2)),
      semJuros: n <= politica.parcelasSemJuros,
    });
  }

  return opcoes;
}

/**
 * O que a automação pode dizer sobre pagamento, se é que pode.
 *
 * DEVOLVE `null` QUANDO NÃO HÁ NADA CONFIGURADO, e o agente cala. É o
 * comportamento certo: o silêncio sobre preço é recuperável, uma promessa
 * errada não.
 */
export function fraseParaOPaciente(politica: Politica): string | null {
  const texto = politica.textoParaPaciente;
  if (texto === null || texto.trim().length === 0) return null;
  return texto.trim();
}

/* -------------------------------------------------------------------------- */
/* Pré-consulta                                                               */
/* -------------------------------------------------------------------------- */

export type ItemDePreConsulta =
  "FORMULARIO" | "DOCUMENTO" | "CONFIRMACAO" | "CONVENIO" | "RISCO_FALTA" | "PAGAMENTO";

export type PendenciaDePreConsulta = {
  item: ItemDePreConsulta;
  rotulo: string;
  detalhe: string;
  /** Quem consegue fechar isto. */
  resolveQuem: "automacao" | "humano";
};

export type ContextoDaPreConsulta = {
  horasAteAConsulta: number;
  confirmada: boolean;
  primeiraVez: boolean;
  /** A pessoa usa convênio nesta consulta. */
  usaConvenio: boolean;
  /** O convênio já autorizou. */
  convenioAutorizado: boolean;
  riscoDeFalta: "BAIXO" | "MEDIO" | "ALTO" | null;
  /** Há cobrança vencida desta pessoa. */
  temDebito: boolean;
};

/**
 * O que falta para esta consulta acontecer.
 *
 * ============================================================================
 *  A LISTA SÓ TEM O QUE FALTA. Um checklist que mostra "tudo certo" em nove
 *  itens e uma pendência no décimo faz a pendência sumir no meio dos vistos.
 *
 *  E CADA ITEM DIZ QUEM RESOLVE. Pedir confirmação o CRC faz sozinho; ligar
 *  para o convênio não — depende de falar com o plano (§31), e prometer
 *  "autorizado" sem prova externa é o que o §31 proíbe nominalmente.
 * ============================================================================
 */
export function pendenciasDaPreConsulta(ctx: ContextoDaPreConsulta): PendenciaDePreConsulta[] {
  const p: PendenciaDePreConsulta[] = [];

  /*
   * A JANELA DE 72 HORAS. Antes disso quase nada é pendência: ninguém confirma
   * com duas semanas, e cobrar documento com antecedência demais é incômodo.
   *
   * Fora da janela, a lista é vazia — e vazia é a resposta certa.
   */
  if (ctx.horasAteAConsulta > 72 || ctx.horasAteAConsulta < 0) return p;

  if (!ctx.confirmada) {
    p.push({
      item: "CONFIRMACAO",
      rotulo: "Sem confirmação",
      detalhe: "A pessoa ainda não confirmou presença.",
      // O CRC pede confirmação sozinho: é mensagem esperada, e o paciente
      // reconhece.
      resolveQuem: "automacao",
    });
  }

  if (ctx.primeiraVez) {
    p.push({
      item: "FORMULARIO",
      rotulo: "Anamnese não preenchida",
      detalhe: "Primeira consulta: o formulário de saúde ainda não veio.",
      resolveQuem: "automacao",
    });

    p.push({
      item: "DOCUMENTO",
      rotulo: "Documento não enviado",
      detalhe: "Primeira consulta: falta documento com foto.",
      resolveQuem: "automacao",
    });
  }

  if (ctx.usaConvenio && !ctx.convenioAutorizado) {
    p.push({
      item: "CONVENIO",
      rotulo: "Convênio sem autorização",
      detalhe:
        "A autorização depende de consultar o plano. O sistema não diz “autorizado” sem prova externa.",
      // HUMANO, sempre. Ver o §31: nunca dizer "autorizado" sem prova.
      resolveQuem: "humano",
    });
  }

  if (ctx.riscoDeFalta === "ALTO") {
    p.push({
      item: "RISCO_FALTA",
      rotulo: "Risco alto de falta",
      detalhe: "Vale deixar o encaixe preparado para esta janela.",
      resolveQuem: "automacao",
    });
  }

  if (ctx.temDebito) {
    p.push({
      item: "PAGAMENTO",
      rotulo: "Débito em aberto",
      detalhe:
        "Há cobrança vencida. Cobrar na recepção, na frente de outras pessoas, é constrangimento — vale resolver antes.",
      // HUMANO: decidir se cobra, se perdoa, ou se deixa passar é da clínica.
      resolveQuem: "humano",
    });
  }

  return p;
}

/** `true` quando alguma pendência bloqueia o atendimento de verdade. */
export function bloqueiaAtendimento(pendencias: readonly PendenciaDePreConsulta[]): boolean {
  /*
   * SÓ O CONVÊNIO BLOQUEIA, e nenhum dos outros.
   *
   * Falta de formulário se resolve na recepção em dois minutos; falta de
   * confirmação não impede ninguém de ser atendido. Convênio sem autorização
   * impede: o procedimento não pode ser cobrado do plano depois.
   *
   * Chamar tudo de bloqueio faria a tela gritar em todo caso, e aí ninguém
   * distinguiria o que realmente impede.
   */
  return pendencias.some((p) => p.item === "CONVENIO");
}
