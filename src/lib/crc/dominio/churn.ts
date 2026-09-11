/**
 * Risco de perder o paciente — Fase H.
 *
 * O QUE "CHURN" SIGNIFICA NUMA CLÍNICA, e por que o vocabulário de assinatura
 * não serve. Ninguém cancela um dentista: a pessoa simplesmente para de voltar.
 * Não há evento de saída, não há data de cancelamento. O que existe é uma
 * ausência que vai ficando longa até alguém notar — normalmente nunca.
 *
 * Por isso o cálculo aqui não pergunta "quem cancelou?": pergunta **quem está
 * no caminho de sumir, e ainda dá tempo de ligar?**
 *
 * AS QUATRO COISAS QUE O ESCORE OLHA, e por que cada uma:
 *
 *   TEMPO SEM VOLTAR, comparado ao intervalo ESPERADO do tipo de tratamento.
 *   Seis meses sem aparecer é normal para quem faz limpeza semestral e é sinal
 *   de abandono para quem está no meio de um canal.
 *
 *   FALTAS RECENTES. Quem falta duas vezes seguidas está dizendo alguma coisa —
 *   e é a métrica mais preditiva que uma clínica tem.
 *
 *   TRATAMENTO INTERROMPIDO. Orçamento aprovado e consulta não marcada é o
 *   sinal mais forte da lista: a pessoa decidiu e depois recuou.
 *
 *   SILÊNCIO. Parou de responder às mensagens.
 *
 * O ESCORE É EXPLICÁVEL POR CONSTRUÇÃO. Cada fator devolve pontos E a frase que
 * justifica os pontos. Um número sozinho — "risco 73" — não ajuda a recepção a
 * decidir o que dizer ao telefone, e é justamente ela que vai ligar.
 *
 * NÃO É PREVISÃO. É priorização de uma lista de ligações. A diferença importa:
 * ninguém é tratado diferente por causa do número, só é chamado antes.
 */
import { diasLocaisEntre, FUSO_PADRAO } from "./dia-local";

export type SinaisDoPaciente = {
  /** Última consulta que ACONTECEU. `null` = nunca veio. */
  ultimaConsultaEm: string | null;
  /** Consulta futura marcada, se houver. */
  proximaConsultaEm: string | null;
  /** Quantas vezes faltou nos últimos 12 meses. */
  faltasRecentes: number;
  /** Quantas consultas cumpriu nos últimos 12 meses. */
  comparecimentosRecentes: number;
  /** Tem orçamento aprovado e nenhuma consulta marcada? */
  tratamentoInterrompido: boolean;
  /** Última vez que a pessoa RESPONDEU alguma mensagem. */
  ultimaRespostaEm: string | null;
  /** Quantos dias a clínica espera entre consultas deste paciente. */
  intervaloEsperadoDias: number;
};

export type FatorDeRisco = {
  /** Estável, para métrica. */
  codigo: string;
  /** Em português, para quem vai ligar. */
  motivo: string;
  pontos: number;
};

export type RiscoDeChurn = {
  /** 0 a 100. */
  escore: number;
  nivel: "baixo" | "medio" | "alto";
  fatores: FatorDeRisco[];
  /** O que fazer. Um escore sem próxima ação é um número decorativo. */
  acaoSugerida: string;
};

/** O intervalo padrão quando ninguém configurou: seis meses. */
export const INTERVALO_PADRAO_DIAS = 180;

export function calcularRiscoDeChurn(
  sinais: SinaisDoPaciente,
  agora: Date,
  fuso: string = FUSO_PADRAO,
): RiscoDeChurn {
  const fatores: FatorDeRisco[] = [];

  /*
   * CONSULTA MARCADA ZERA TUDO, e é a primeira coisa que se olha.
   *
   * Quem tem consulta na semana que vem não está sumindo, por pior que seja o
   * histórico. Sem este curto-circuito, a lista de ligações encheria de gente
   * que já está voltando — e a recepção aprenderia a ignorar a lista.
   */
  if (sinais.proximaConsultaEm !== null) {
    const faltam = diasLocaisEntre(agora, new Date(Date.parse(sinais.proximaConsultaEm)), fuso);
    if (faltam >= 0) {
      return {
        escore: 0,
        nivel: "baixo",
        fatores: [
          {
            codigo: "tem_consulta",
            motivo: `Tem consulta marcada daqui a ${String(faltam)} dias.`,
            pontos: 0,
          },
        ],
        acaoSugerida: "Nada a fazer: esta pessoa está voltando.",
      };
    }
  }

  // --- 1. tempo sem voltar, relativo ao esperado --------------------------
  const esperado =
    sinais.intervaloEsperadoDias > 0 ? sinais.intervaloEsperadoDias : INTERVALO_PADRAO_DIAS;

  if (sinais.ultimaConsultaEm === null) {
    /*
     * NUNCA VEIO É CATEGORIA PRÓPRIA, e não "ausência infinita".
     *
     * Tratar como o pior caso possível poria todo lead antigo no topo da lista
     * de retenção — e reter quem nunca foi paciente não é reter, é prospectar.
     * São duas conversas diferentes, e quem liga precisa saber qual é a dela.
     */
    fatores.push({
      codigo: "nunca_veio",
      motivo: "Nunca compareceu a uma consulta. É prospecção, e não retenção.",
      pontos: 20,
    });
  } else {
    const dias = diasLocaisEntre(new Date(Date.parse(sinais.ultimaConsultaEm)), agora, fuso);
    const razao = dias / esperado;

    if (razao >= 2) {
      fatores.push({
        codigo: "ausencia_longa",
        motivo: `Faz ${String(dias)} dias sem vir — mais que o dobro do intervalo esperado de ${String(esperado)}.`,
        pontos: 40,
      });
    } else if (razao >= 1.3) {
      fatores.push({
        codigo: "ausencia_acima_do_esperado",
        motivo: `Faz ${String(dias)} dias sem vir, e o intervalo esperado é ${String(esperado)}.`,
        pontos: 25,
      });
    } else if (razao >= 1) {
      fatores.push({
        codigo: "no_ponto_de_retorno",
        motivo: `Está no ponto de voltar: ${String(dias)} dias desde a última consulta.`,
        pontos: 10,
      });
    }
  }

  // --- 2. faltas ----------------------------------------------------------
  if (sinais.faltasRecentes >= 2) {
    fatores.push({
      codigo: "faltas_repetidas",
      // A métrica mais preditiva que uma clínica tem, e a mais ignorada.
      motivo: `Faltou ${String(sinais.faltasRecentes)} vezes no último ano.`,
      pontos: 25,
    });
  } else if (sinais.faltasRecentes === 1 && sinais.comparecimentosRecentes === 0) {
    // Uma falta é acaso; uma falta e NENHUM comparecimento é um padrão de uma
    // amostra só — e vale menos que duas faltas, mas não vale zero.
    fatores.push({
      codigo: "falta_unica_sem_retorno",
      motivo: "Faltou uma vez e não voltou desde então.",
      pontos: 15,
    });
  }

  // --- 3. tratamento interrompido ----------------------------------------
  if (sinais.tratamentoInterrompido) {
    fatores.push({
      codigo: "tratamento_interrompido",
      /*
       * O SINAL MAIS FORTE DA LISTA, e o mais acionável.
       *
       * Orçamento aprovado significa que a pessoa decidiu — passou pelo preço,
       * pelo medo, pela agenda. Não marcar depois disso é recuo, e recuo tem
       * motivo. É a única ligação desta lista em que a recepção sabe sobre o que
       * falar antes de discar.
       */
      motivo: "Aprovou um orçamento e não marcou a consulta.",
      pontos: 30,
    });
  }

  // --- 4. silêncio --------------------------------------------------------
  if (sinais.ultimaRespostaEm !== null) {
    const dias = diasLocaisEntre(new Date(Date.parse(sinais.ultimaRespostaEm)), agora, fuso);
    if (dias >= 90) {
      fatores.push({
        codigo: "silencio",
        motivo: `Não responde uma mensagem há ${String(dias)} dias.`,
        pontos: 15,
      });
    }
  }

  const escore = Math.min(
    fatores.reduce((t, f) => t + f.pontos, 0),
    100,
  );

  return {
    escore,
    nivel: escore >= 60 ? "alto" : escore >= 30 ? "medio" : "baixo",
    fatores,
    acaoSugerida: acaoPara(fatores, escore),
  };
}

/**
 * A próxima ação, escolhida pelo FATOR MAIS FORTE — e não pelo escore.
 *
 * Duas pessoas com escore 55 podem precisar de conversas opostas: uma sumiu há
 * um ano, a outra aprovou um orçamento na semana passada e não marcou. Sugerir a
 * mesma coisa para as duas é o que faz a recepção parar de ler a sugestão.
 */
function acaoPara(fatores: readonly FatorDeRisco[], escore: number): string {
  if (escore === 0) return "Nada a fazer.";

  const maisForte = [...fatores].sort((a, b) => b.pontos - a.pontos)[0];

  switch (maisForte?.codigo) {
    case "tratamento_interrompido":
      return "Ligue perguntando sobre o orçamento aprovado. Pergunte o que impediu de marcar — quase sempre é valor ou agenda, e as duas coisas têm saída.";
    case "faltas_repetidas":
    case "falta_unica_sem_retorno":
      return "Ligue antes de mandar mensagem. Quem falta duas vezes não responde a lembrete automático; responde a uma pessoa perguntando se está tudo bem.";
    case "ausencia_longa":
      return "Mande um convite de retorno com horário concreto. Depois de tanto tempo, 'venha quando puder' não move ninguém.";
    case "silencio":
      return "Tente outro canal: ligação. As mensagens não estão chegando ou não estão sendo lidas.";
    case "nunca_veio":
      return "Isto é prospecção, e não retenção. Trate como primeiro contato.";
    default:
      return "Mande o lembrete de retorno de rotina.";
  }
}
