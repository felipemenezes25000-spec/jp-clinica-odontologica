import { FPS } from "@/design-system/tokens";
import { cenaPorId, type IdCena } from "./linhaDoTempo";

/**
 * A narração e as legendas.
 *
 * Item 23: fora dos componentes, num arquivo só. Duas razões práticas — revisar
 * o texto falado é ler uma coluna, não caçar `<p>`; e gravar locução exige
 * exportar a lista com tempos, o que aqui é uma linha de código.
 *
 * `inicio` e `duracao` são frames LOCAIS da cena. Assim, alongar a cena 12 não
 * desloca a fala da cena 20 — a conversão para tempo global acontece no fim
 * deste arquivo, uma vez.
 *
 * Tom: profissional, natural, sem superlativo. A peça não vende milagre; ela
 * explica um mecanismo.
 */

export type FalaLocal = {
  cena: IdCena;
  texto: string;
  /** Frame local da cena em que a legenda entra. */
  inicio: number;
  duracao: number;
};

const s = (segundos: number): number => Math.round(segundos * FPS);

export const FALAS: readonly FalaLocal[] = [
  /* 01 */
  {
    cena: "abertura",
    texto: "Todos os dias, uma clínica gera centenas de sinais.",
    inicio: s(2.6),
    duracao: s(3.4),
  },
  {
    cena: "abertura",
    texto: "O problema nunca foi ter os dados. É transformar cada sinal em ação, no momento certo.",
    inicio: s(6.2),
    duracao: s(4.4),
  },

  /* 02 */
  {
    cena: "problema",
    texto:
      "Pacientes que faltaram. Pessoas que cancelaram. Quem não retorna há meses. Leads que acabaram de chegar.",
    inicio: s(0.8),
    duracao: s(4.6),
  },
  {
    cena: "problema",
    texto:
      "A informação existe — espalhada entre planilha, agenda, WhatsApp e a memória da equipe.",
    inicio: s(5.8),
    duracao: s(4),
  },

  /* 03 */
  {
    cena: "dentalOffice",
    texto:
      "O Dental Office continua sendo a fonte da operação clínica: pacientes, agenda, status, dentistas e disponibilidade.",
    inicio: s(0.7),
    duracao: s(6.4),
  },

  /* 04 */
  {
    cena: "integracao",
    texto: "Os dados são sincronizados, organizados e preparados para decisão.",
    inicio: s(0.8),
    duracao: s(5.2),
  },

  /* 05 */
  {
    cena: "nucleo",
    texto:
      "O JP CRC recebe essas informações, identifica eventos e transforma dado em oportunidade.",
    inicio: s(1.4),
    duracao: s(5.4),
  },

  /* 06 */
  {
    cena: "eventos",
    texto:
      "Faltas, cancelamentos, retornos vencidos, pacientes antigos e novos leads deixam de depender da memória da equipe.",
    inicio: s(0.8),
    duracao: s(6),
  },

  /* 07 */
  {
    cena: "elegibilidade",
    texto:
      "Antes de qualquer mensagem, o sistema confere as regras: telefone válido, sem consulta futura, sem pedido de descadastro, dentro do horário.",
    inicio: s(0.8),
    duracao: s(6.4),
  },

  /* 08 */
  {
    cena: "prioridade",
    texto:
      "E ordena a fila por prioridade — com o número e o motivo dele à vista de quem trabalha.",
    inicio: s(0.9),
    duracao: s(5.6),
  },

  /* 09 */
  {
    cena: "divisao",
    texto: "O sistema trabalha sozinho onde é seguro. A equipe entra onde faz diferença.",
    inicio: s(0.9),
    duracao: s(5),
  },

  /* 10 */
  {
    cena: "automacoes",
    texto: "Cada jornada tem gatilho, regra e limite de contato. Nada dispara sem passar por eles.",
    inicio: s(0.8),
    duracao: s(5.6),
  },

  /* 11 */
  {
    cena: "baseAntiga",
    texto:
      "Até a base histórica pode voltar a trabalhar para a clínica: o sistema segmenta pacientes antigos e organiza prioridades.",
    inicio: s(1),
    duracao: s(6.6),
  },

  /* 12 */
  {
    cena: "reativacao",
    texto:
      "A reativação sai em lotes, com cooldown e opt-out respeitados. Escala sem virar spam.",
    inicio: s(0.9),
    duracao: s(5.6),
  },

  /* 13 */
  {
    cena: "whatsapp",
    texto: "A conversa acontece no WhatsApp, onde o paciente já está.",
    inicio: s(0.8),
    duracao: s(3.6),
  },
  {
    cena: "whatsapp",
    texto: "E é aqui que o paciente responde.",
    inicio: s(5.4),
    duracao: s(2.8),
  },

  /* 14 */
  {
    cena: "ia",
    texto:
      "Quando o paciente responde, a inteligência artificial interpreta a intenção e escolhe a próxima ação permitida.",
    inicio: s(0.9),
    duracao: s(6),
  },

  /* 15 */
  {
    cena: "intencoes",
    texto:
      "Ela sabe diferenciar quem quer agendar, quem quer falar depois e quem precisa de atendimento humano.",
    inicio: s(0.8),
    duracao: s(5.4),
  },

  /* 16 */
  {
    cena: "agendamento",
    texto:
      "Quando o paciente quer marcar, o sistema consulta a disponibilidade real e conduz o agendamento.",
    inicio: s(0.9),
    duracao: s(5),
  },
  {
    cena: "agendamento",
    texto: "O horário é revalidado antes de confirmar — e só então a consulta é criada.",
    inicio: s(6.2),
    duracao: s(3.4),
  },

  /* 17 */
  {
    cena: "humano",
    texto:
      "A automação não elimina o atendimento humano. Ela elimina trabalho repetitivo.",
    inicio: s(0.9),
    duracao: s(5),
  },

  /* 18 */
  {
    cena: "home",
    texto:
      "A equipe abre o dia sabendo exatamente quem precisa dela — e o que já está sendo cuidado sozinho.",
    inicio: s(1),
    duracao: s(6),
  },

  /* 19 */
  {
    cena: "inbox",
    texto:
      "Cada conversa chega com histórico, oportunidade e a próxima ação sugerida do lado.",
    inicio: s(0.9),
    duracao: s(5.4),
  },

  /* 20 */
  {
    cena: "paciente360",
    texto: "E cada paciente tem uma página só, com tudo que já aconteceu entre ele e a clínica.",
    inicio: s(0.9),
    duracao: s(5.4),
  },

  /* 21 */
  {
    cena: "resultados",
    texto: "Cada ação fica registrada. Cada oportunidade pode ser acompanhada.",
    inicio: s(0.9),
    duracao: s(5),
  },

  /* 22 */
  {
    cena: "funil",
    texto:
      "Do paciente elegível ao tratamento iniciado, cada etapa é medida — não estimada.",
    inicio: s(0.9),
    duracao: s(5.2),
  },

  /* 23 */
  {
    cena: "antesDepois",
    texto: "Menos esforço operacional. Mais consistência.",
    inicio: s(0.9),
    duracao: s(4),
  },

  /* 24 */
  {
    cena: "impacto",
    texto:
      "Mais contato gera mais resposta; mais resposta gera mais agenda. O mecanismo é esse — sem promessa de percentual.",
    inicio: s(0.9),
    duracao: s(6),
  },

  /* 25 */
  {
    cena: "gestor",
    texto:
      "E a gestão passa a enxergar o que está gerando resposta, agendamento, reativação e resultado.",
    inicio: s(0.9),
    duracao: s(5.6),
  },

  /* 26 */
  {
    cena: "ecossistema",
    texto: "Do dado à consulta marcada, um caminho só — e observável de ponta a ponta.",
    inicio: s(1.2),
    duracao: s(5.4),
  },

  /* 27 */
  {
    cena: "frase",
    texto: "O Dental Office guarda a operação. O JP CRC transforma os dados em ação.",
    inicio: s(0.8),
    duracao: s(5.4),
  },

  /* 28 */
  {
    cena: "final",
    texto: "Mais organização, mais relacionamento e menos oportunidades esquecidas.",
    inicio: s(1.4),
    duracao: s(5),
  },
];

/* -------------------------------------------------------------------------- */
/* Conversão para tempo global                                                */
/* -------------------------------------------------------------------------- */

export type Fala = FalaLocal & { inicioGlobal: number; fimGlobal: number };

export const FALAS_GLOBAIS: readonly Fala[] = FALAS.map((fala) => {
  const cena = cenaPorId(fala.cena);
  const inicioGlobal = cena.inicioFrame + fala.inicio;
  return { ...fala, inicioGlobal, fimGlobal: inicioGlobal + fala.duracao };
}).sort((a, b) => a.inicioGlobal - b.inicioGlobal);

export function falaNoFrame(frame: number): Fala | null {
  return FALAS_GLOBAIS.find((f) => frame >= f.inicioGlobal && frame < f.fimGlobal) ?? null;
}

/**
 * Roteiro pronto para gravar locução: cada linha com o tempo em que ela entra.
 * Existe para o dia em que alguém for para o estúdio — e para conferir se a
 * narração cabe na cena sem atropelar a seguinte.
 */
export function roteiro(): string {
  return FALAS_GLOBAIS.map((f) => {
    const t = f.inicioGlobal / FPS;
    const m = Math.floor(t / 60);
    const seg = (t % 60).toFixed(1).padStart(4, "0");
    return `[${m}:${seg}] (${f.cena}) ${f.texto}`;
  }).join("\n");
}
