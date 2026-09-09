/**
 * O que cada mensagem custa — e por que isso precisa aparecer na tela.
 *
 * O SISTEMA TINHA 17 MODELOS DE MENSAGEM E NENHUMA NOÇÃO DE PREÇO. O gestor
 * montava uma campanha, via "964 entram nesse filtro" e apertava enviar. O que
 * ele não via era **R$ 301**.
 *
 * A diferença entre categorias não é de margem, é de ordem de grandeza: no
 * Brasil, marketing custa **9 vezes** utilidade. Uma única campanha de
 * reativação de 500 pessoas custa mais que o sistema inteiro rodando um mês —
 * confirmação, falta, recall, cobrança e a recepção conversando o dia todo
 * somam menos de um sexto dela.
 *
 * QUEM DECIDE A CATEGORIA É A META, E NÃO ESTE ARQUIVO. Ela é declarada no
 * cadastro do modelo e confirmada na aprovação. O que está aqui é a intenção
 * de cada texto, usada para ESTIMAR — e a tela escreve "estimado", nunca
 * "custo". Se a Meta aprovar um modelo em categoria diferente, a conta real
 * muda e a daqui vira uma aproximação.
 *
 * Tudo é função pura com o "agora" entrando por parâmetro, como no resto do
 * domínio: a tarifa de serviço muda de valor numa data, e uma função que lê o
 * relógio sozinha seria impossível de testar dos dois lados dessa data.
 *
 * Fonte: tabela da Meta para o Brasil, cobrança por mensagem entregue.
 */
import { dinheiro } from "./formatar";

/* -------------------------------------------------------------------------- */
/* Categorias                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * As quatro categorias da Meta.
 *
 * `autenticacao` não é usada por este produto — clínica não manda código de
 * verificação — mas está no tipo porque, no dia em que alguém adicionar login
 * por WhatsApp, o compilador vai obrigar a decidir o preço em vez de deixar
 * cair num `default` silencioso.
 */
export type CategoriaMensagem = "utilidade" | "marketing" | "servico" | "autenticacao";

export const CATEGORIAS_MENSAGEM: readonly CategoriaMensagem[] = [
  "utilidade",
  "marketing",
  "servico",
  "autenticacao",
] as const;

export const ROTULO_CATEGORIA: Readonly<Record<CategoriaMensagem, string>> = {
  utilidade: "Utilidade",
  marketing: "Marketing",
  servico: "Serviço",
  autenticacao: "Autenticação",
};

/**
 * O que cada categoria significa na régua da Meta.
 *
 * Está aqui porque a diferença de preço só faz sentido junto da diferença de
 * natureza — e porque é isso que alguém precisa ler antes de reclassificar um
 * modelo para "ficar mais barato", que é o caminho mais curto para ter o
 * modelo reprovado e o número penalizado.
 */
export const EXPLICACAO_CATEGORIA: Readonly<Record<CategoriaMensagem, string>> = {
  utilidade:
    "Trata de algo que já está acontecendo entre a clínica e o paciente: uma consulta marcada, uma falta, uma parcela.",
  marketing:
    "Convida ou oferece sem que exista nada em andamento. Reativação, recall e aniversário entram aqui — e custam 9 vezes mais.",
  servico: "Resposta a quem escreveu primeiro, dentro de 24 horas. É a conversa da recepção.",
  autenticacao: "Código de verificação. Este produto não usa.",
};

/* -------------------------------------------------------------------------- */
/* Tarifas                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Por mensagem ENTREGUE no Brasil, em MILIONÉSIMOS de real.
 *
 * Inteiro, e não `0.034`, porque a conta é feita em cima disto: em float,
 * `200 × 0.034` dá `6.800000000000001`, e arredondar isso para cima produz
 * R$ 6,81 — um centavo inventado pela representação binária, no número que a
 * clínica usa para decidir se manda a campanha.
 *
 * Mensagem recebida nunca custa. Mensagem não entregue não é cobrada — por
 * isso a estimativa é um teto, e não uma previsão.
 */
const TARIFA_MICRO: Readonly<Record<CategoriaMensagem, number>> = {
  utilidade: 34_000,
  marketing: 312_500,
  servico: 34_000,
  autenticacao: 34_000,
};

/** As mesmas tarifas em reais, para exibir: `0.3125`. */
export const TARIFA_BRL: Readonly<Record<CategoriaMensagem, number>> = {
  utilidade: TARIFA_MICRO.utilidade / 1_000_000,
  marketing: TARIFA_MICRO.marketing / 1_000_000,
  servico: TARIFA_MICRO.servico / 1_000_000,
  autenticacao: TARIFA_MICRO.autenticacao / 1_000_000,
};

/**
 * O dia em que responder paciente deixa de ser de graça.
 *
 * Até 30/09/2026 a resposta dentro da janela de 24h é gratuita e ilimitada.
 * A partir daqui ela é cobrada como utilidade, com as primeiras
 * {@link FRANQUIA_SERVICO_MES} por número por mês liberadas.
 *
 * A data está no código, e não só na documentação, porque a conta muda sozinha
 * quando ela chegar. Uma estimativa que ignorasse a virada mostraria "grátis"
 * em outubro para uma clínica que já estaria pagando.
 */
export const INICIO_COBRANCA_SERVICO = Date.parse("2026-10-01T00:00:00.000Z");

/**
 * A franquia mensal de serviço, por número de telefone.
 *
 * Na prática da clínica isso quase sempre significa CUSTO ZERO na conversa da
 * recepção: 200 conversas com 6 respostas cada dão 1.200 mensagens, das quais
 * 200 são cobradas — R$ 6,80 no mês. Vale estar escrito para ninguém deixar de
 * conversar com paciente por medo da conta.
 */
export const FRANQUIA_SERVICO_MES = 1000;

function tarifaMicroVigente(categoria: CategoriaMensagem, agora: Date): number {
  if (categoria === "servico" && agora.getTime() < INICIO_COBRANCA_SERVICO) return 0;
  return TARIFA_MICRO[categoria];
}

/** A tarifa vigente de uma categoria na data dada, em reais. */
export function tarifaVigente(categoria: CategoriaMensagem, agora: Date): number {
  return tarifaMicroVigente(categoria, agora) / 1_000_000;
}

/* -------------------------------------------------------------------------- */
/* A conta                                                                    */
/* -------------------------------------------------------------------------- */

export type EstimativaDeCusto = {
  /** Quantas mensagens seriam enviadas. */
  mensagens: number;
  categoria: CategoriaMensagem;
  /** Quantas efetivamente entram na conta. */
  cobradas: number;
  /** Em reais. */
  total: number;
  /** `true` enquanto responder paciente ainda for gratuito. */
  gratuitoPorEnquanto: boolean;
};

/**
 * Quanto custaria enviar `mensagens` de uma categoria.
 *
 * `servicoJaEnviadasNoMes` só importa para serviço, e existe para a franquia
 * ser aplicada sobre o mês inteiro e não sobre cada envio isolado — sem isso,
 * dez lotes de 200 mensagens pareceriam todos gratuitos.
 */
export function estimarCusto(
  mensagens: number,
  categoria: CategoriaMensagem,
  agora: Date,
  servicoJaEnviadasNoMes = 0,
): EstimativaDeCusto {
  const quantidade = Number.isFinite(mensagens) ? Math.max(0, Math.floor(mensagens)) : 0;
  const micro = tarifaMicroVigente(categoria, agora);
  const gratuitoPorEnquanto = categoria === "servico" && micro === 0;

  const cobradas =
    categoria === "servico"
      ? Math.max(
          0,
          quantidade - Math.max(0, FRANQUIA_SERVICO_MES - Math.max(0, servicoJaEnviadasNoMes)),
        )
      : quantidade;

  // `cobradas * micro` é inteiro exato; só a última divisão vira float. O
  // arredondamento é para CIMA porque uma estimativa que arredonda para baixo
  // é a que produz a surpresa desagradável na fatura.
  const total = Math.ceil((cobradas * micro) / 10_000) / 100;

  return { mensagens: quantidade, categoria, cobradas, total, gratuitoPorEnquanto };
}

/** `"R$ 301,25"`, no mesmo formato de dinheiro do resto do sistema. */
export function reais(valor: number): string {
  return dinheiro(valor.toFixed(2));
}

/* -------------------------------------------------------------------------- */
/* A categoria de cada modelo                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A categoria PRETENDIDA de cada modelo do catálogo.
 *
 * Três decisões que merecem explicação, porque são as que mudam a conta:
 *
 *   RECALL E REATIVAÇÃO SÃO MARKETING. Tentador chamar de utilidade — "é o
 *   retorno de rotina dele" — e errado: não existe nada em andamento, e a Meta
 *   reprova ou reclassifica. Classificar para baixo não economiza; custa o
 *   modelo reprovado e, repetido, penaliza o número.
 *
 *   ANIVERSÁRIO É MARKETING, e é o único item da lista que dá para simplesmente
 *   não mandar. R$ 0,31 por felicitação, 45 por mês, dá R$ 14 — barato, e vale
 *   saber que é escolha, não custo obrigatório.
 *
 *   COBRANÇA É UTILIDADE. Há transação em curso (o tratamento contratado), e é
 *   o que a régua do art. 42 do CDC já assume ao falar de "sua parcela".
 */
export const CATEGORIA_DO_MODELO: Readonly<Record<string, CategoriaMensagem>> = {
  falta_primeiro_contato: "utilidade",
  falta_segundo_contato: "utilidade",
  cancelamento_reagendar: "utilidade",
  confirmacao_consulta: "utilidade",
  abandono_tratamento: "utilidade",
  orcamento_parado: "utilidade",

  cobranca_lembrete: "utilidade",
  cobranca_recente: "utilidade",
  cobranca_atrasada: "utilidade",

  recall_seis_meses: "marketing",
  reativacao_inativo: "marketing",
  aniversario: "marketing",

  // Respostas dentro da conversa: o paciente escreveu primeiro.
  cobranca_ja_pago: "servico",
  lead_primeiro_contato: "servico",
  agendamento_oferta: "servico",
  agendamento_confirmado: "servico",
  agendamento_sem_horario: "servico",
};

/**
 * A categoria de um modelo, com o padrão mais CARO quando não se conhece.
 *
 * Errar para marketing é deliberado: uma estimativa que subestima faz alguém
 * apertar enviar achando que custa R$ 30 quando custa R$ 300. Errar para cima
 * assusta um pouco e não gera fatura inesperada.
 */
export function categoriaDoModelo(chave: string): CategoriaMensagem {
  return CATEGORIA_DO_MODELO[chave] ?? "marketing";
}

/* -------------------------------------------------------------------------- */
/* O custo de uma jornada                                                     */
/* -------------------------------------------------------------------------- */

export type PerfilDeCusto = {
  /** Quantas mensagens de cada categoria a jornada pode mandar por paciente. */
  porCategoria: Readonly<Record<CategoriaMensagem, number>>;
  /** A categoria que domina a conta — a mais cara com ao menos uma mensagem. */
  categoriaDominante: CategoriaMensagem | null;
  /** Total de mensagens no caminho mais longo. */
  mensagens: number;
  /** O TETO por paciente, em reais. Ver abaixo por que é teto. */
  custoMaximoPorPaciente: number;
};

/**
 * Quanto uma jornada pode custar por paciente.
 *
 * É UM TETO, E A TELA PRECISA DIZER "ATÉ". Uma jornada de recuperação de falta
 * tem duas mensagens, mas quem responde a primeira sai antes da segunda — e
 * quem sai é justamente o caso de sucesso. Somar todos os passos e chamar o
 * resultado de "custo" superestimaria de propósito; chamá-lo de teto é o que a
 * conta realmente é.
 *
 * A dominante é a mais CARA presente, não a mais frequente: uma jornada com
 * cinco utilidades e um marketing custa, por paciente, quase só o marketing —
 * e é ele que decide se a jornada é barata ou não.
 */
export function perfilDeCustoDaJornada(
  chavesDeModelo: readonly string[],
  agora: Date,
): PerfilDeCusto {
  const porCategoria: Record<CategoriaMensagem, number> = {
    utilidade: 0,
    marketing: 0,
    servico: 0,
    autenticacao: 0,
  };

  let microTotal = 0;
  for (const chave of chavesDeModelo) {
    const categoria = categoriaDoModelo(chave);
    porCategoria[categoria] += 1;
    microTotal += tarifaMicroVigente(categoria, agora);
  }

  // Da mais cara para a mais barata: a ordem da lista É a regra.
  const dominante =
    (["marketing", "utilidade", "autenticacao", "servico"] as const).find(
      (c) => porCategoria[c] > 0,
    ) ?? null;

  return {
    porCategoria,
    categoriaDominante: dominante,
    mensagens: chavesDeModelo.length,
    custoMaximoPorPaciente: Math.ceil(microTotal / 10_000) / 100,
  };
}

/**
 * A categoria de uma campanha.
 *
 * Campanha é SEMPRE marketing, sem exceção e sem consultar o texto. Alguém vai
 * escrever "sua avaliação de rotina está na hora" e achar que isso é utilidade
 * — não é: quem recebe não tem nada em andamento com a clínica, que é
 * exatamente o motivo de estar numa campanha de reativação.
 *
 * A função existe para esse raciocínio ter um lugar onde morar, em vez de a
 * constante `"marketing"` aparecer solta na tela sem explicação.
 */
export function categoriaDeCampanha(): CategoriaMensagem {
  return "marketing";
}
