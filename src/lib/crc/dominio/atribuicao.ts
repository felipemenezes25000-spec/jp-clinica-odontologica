/**
 * Atribuição de receita — Fase H.
 *
 * A PERGUNTA: aquele tratamento de R$ 8.000 que fechou ontem — o que fez a
 * pessoa aparecer?
 *
 * A resposta importa porque é ela que decide onde a clínica põe dinheiro no mês
 * que vem. E é a pergunta que mais se responde errado, sempre do mesmo jeito:
 * olhando só o ÚLTIMO toque.
 *
 * POR QUE ÚLTIMO TOQUE ENGANA, no caso concreto de uma clínica. A pessoa viu um
 * anúncio em janeiro, entrou no site, recebeu um recall em março, respondeu em
 * abril e marcou pelo WhatsApp. Último toque credita 100% ao WhatsApp — e a
 * conclusão é "corta o anúncio, o WhatsApp é que traz paciente". No mês
 * seguinte, ninguém chega ao WhatsApp.
 *
 * ========================================================================
 *  O MODELO USADO AQUI É POSICIONAL (40/20/40):
 *
 *    40% ao PRIMEIRO toque   — quem trouxe a pessoa.
 *    40% ao ÚLTIMO           — quem fechou.
 *    20% dividido no meio    — quem manteve viva.
 *
 *  NÃO É O MODELO "CERTO". Não existe modelo certo: atribuição é uma
 *  convenção, não uma medição. O que existe é uma convenção ESCRITA e
 *  ESTÁVEL, que permite comparar meses entre si. Esta está escrita.
 * ========================================================================
 *
 * A JANELA É DE 90 DIAS, e o limite existe porque decisão de tratamento
 * odontológico leva semanas, não meses. Um anúncio de um ano atrás não fez a
 * pessoa aparecer ontem — creditar a ele infla eternamente o canal mais antigo.
 */
import { diasLocaisEntre, FUSO_PADRAO } from "./dia-local";

export type Toque = {
  /** `anuncio`, `site`, `whatsapp`, `indicacao`, `recall`, `campanha`… */
  canal: string;
  /** ISO. */
  em: string;
  /** Detalhe opcional: a campanha, o anúncio, a jornada. */
  origem: string | null;
};

export type CreditoDeCanal = {
  canal: string;
  /** 0 a 1. A soma de todos dá 1. */
  peso: number;
  /** Em reais. */
  valor: number;
  /** Quantos toques deste canal entraram na conta. */
  toques: number;
};

export type Atribuicao = {
  creditos: CreditoDeCanal[];
  /** Toques descartados por estarem fora da janela. */
  descartados: number;
  explicacao: string;
};

export const JANELA_DIAS = 90;

const PESO_PRIMEIRO = 0.4;
const PESO_ULTIMO = 0.4;
const PESO_MEIO = 0.2;

export function atribuirReceita(
  toques: readonly Toque[],
  valorFechado: number,
  fechadoEm: Date,
  fuso: string = FUSO_PADRAO,
): Atribuicao {
  const dentro = toques
    .filter((t) => {
      const quando = Date.parse(t.em);
      if (!Number.isFinite(quando)) return false;
      const dias = diasLocaisEntre(new Date(quando), fechadoEm, fuso);
      // `dias >= 0` descarta toque POSTERIOR ao fechamento. Parece impossível e
      // não é: uma mensagem de pós-atendimento entra na mesma lista, e creditar
      // a venda a ela seria dizer que o agradecimento causou a compra.
      return dias >= 0 && dias <= JANELA_DIAS;
    })
    .sort((a, b) => Date.parse(a.em) - Date.parse(b.em));

  const descartados = toques.length - dentro.length;

  if (dentro.length === 0) {
    return {
      creditos: [],
      descartados,
      /*
       * SEM TOQUE, SEM ATRIBUIÇÃO — e não "atribui a orgânico".
       *
       * Inventar um canal para fechar a conta é o que faz painéis de marketing
       * mentirem com confiança. "Não sei de onde veio" é informação: se aparece
       * muito, o que falta é rastreamento, e é isso que precisa ser consertado.
       */
      explicacao: `Nenhum toque registrado nos ${String(JANELA_DIAS)} dias anteriores. Esta receita não tem origem conhecida.`,
    };
  }

  const pesos = new Map<string, number>();
  const contagem = new Map<string, number>();

  const somar = (canal: string, peso: number): void => {
    pesos.set(canal, (pesos.get(canal) ?? 0) + peso);
    contagem.set(canal, (contagem.get(canal) ?? 0) + 1);
  };

  if (dentro.length === 1) {
    // UM TOQUE LEVA TUDO. Distribuir 40/20/40 entre um só é a mesma coisa que
    // dar 100%, e escrever o caso explícito evita a divisão por zero do meio.
    somar(dentro[0]?.canal ?? "desconhecido", 1);
  } else if (dentro.length === 2) {
    /*
     * COM DOIS TOQUES, NÃO HÁ MEIO — e os 20% precisam ir a algum lugar.
     *
     * Dividi-los igualmente entre os dois mantém a conta em 1 e preserva a
     * intenção: primeiro e último valem o mesmo. Descartar os 20% faria a soma
     * dos créditos não bater com a receita, que é o tipo de erro que só aparece
     * quando alguém soma a coluna.
     */
    somar(dentro[0]?.canal ?? "desconhecido", PESO_PRIMEIRO + PESO_MEIO / 2);
    somar(dentro[1]?.canal ?? "desconhecido", PESO_ULTIMO + PESO_MEIO / 2);
  } else {
    somar(dentro[0]?.canal ?? "desconhecido", PESO_PRIMEIRO);
    somar(dentro[dentro.length - 1]?.canal ?? "desconhecido", PESO_ULTIMO);

    const meio = dentro.slice(1, -1);
    const porToque = PESO_MEIO / meio.length;
    for (const t of meio) somar(t.canal, porToque);
  }

  const creditos = [...pesos.entries()]
    .map(([canal, peso]) => ({
      canal,
      peso,
      // Arredonda em centavos: um painel que mostra R$ 3.199,9999998 corrói a
      // confiança em tudo o mais que a tela diz.
      valor: Math.round(valorFechado * peso * 100) / 100,
      toques: contagem.get(canal) ?? 0,
    }))
    .sort((a, b) => b.valor - a.valor);

  return {
    creditos,
    descartados,
    explicacao: `${String(dentro.length)} toques em ${String(JANELA_DIAS)} dias. O primeiro (${dentro[0]?.canal ?? "?"}) e o último (${dentro[dentro.length - 1]?.canal ?? "?"}) levam 40% cada; os do meio dividem 20%.`,
  };
}

/**
 * Soma a atribuição de várias vendas, para o painel do mês.
 *
 * O QUE ESTA FUNÇÃO ACRESCENTA ao simples somatório é o `semOrigem`: quanto da
 * receita do mês não tem toque registrado.
 *
 * ELE É O NÚMERO MAIS IMPORTANTE DA TELA quando está alto. Um painel bonito
 * dividindo R$ 40.000 entre quatro canais, com R$ 90.000 fora da conta, é um
 * painel que descreve 30% da realidade — e quem olha decide os outros 70% com
 * base nele.
 */
export function consolidar(atribuicoes: readonly { atribuicao: Atribuicao; valor: number }[]): {
  creditos: CreditoDeCanal[];
  semOrigem: number;
  total: number;
} {
  const pesos = new Map<string, { valor: number; toques: number }>();
  let semOrigem = 0;
  let total = 0;

  for (const { atribuicao, valor } of atribuicoes) {
    total += valor;

    if (atribuicao.creditos.length === 0) {
      semOrigem += valor;
      continue;
    }

    for (const c of atribuicao.creditos) {
      const atual = pesos.get(c.canal) ?? { valor: 0, toques: 0 };
      pesos.set(c.canal, { valor: atual.valor + c.valor, toques: atual.toques + c.toques });
    }
  }

  const creditos = [...pesos.entries()]
    .map(([canal, v]) => ({
      canal,
      peso: total > 0 ? v.valor / total : 0,
      valor: Math.round(v.valor * 100) / 100,
      toques: v.toques,
    }))
    .sort((a, b) => b.valor - a.valor);

  return { creditos, semOrigem: Math.round(semOrigem * 100) / 100, total };
}
