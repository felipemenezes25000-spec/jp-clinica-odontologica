/**
 * O que perguntar para esta candidata, e o que a resposta significa.
 *
 * O sistema já sabe apontar o que chamou atenção no currículo (os sinais) e já
 * sabe formular a pergunta. Faltava a parte que decide de verdade: **como ler a
 * resposta**. Uma passagem de cinco meses não é boa nem ruim — é boa se foi
 * contrato temporário que virou efetivo em outro lugar, e é ruim se a pessoa não
 * souber dizer por que saiu. Sem esse par, o roteiro vira interrogatório.
 *
 * POR QUE ISSO É CÓDIGO, E NÃO PROMPT
 * A leitura de cada tipo de sinal é sempre a mesma: "lacuna explicada por estudo,
 * filho ou saúde é neutra; lacuna que a pessoa não sabe explicar é atenção". Isso
 * não muda de candidata para candidata, então não precisa de modelo — precisa de
 * catálogo. Fica determinístico, sai de graça e o RH pode discordar por escrito.
 * O modelo continua responsável pelo que É específico daquele currículo: qual
 * empresa, qual sistema, qual ano.
 */
import type { Candidatura } from "./tipos";
import type { SeveridadeSinal, Sinal } from "./ia/tipos";

/** Como o entrevistador leu a resposta. Preenchido durante a conversa. */
export type LeituraResposta = "" | "convence" | "parcial" | "nao-convence";

export type OrigemDuvida = "triagem" | "sinal" | "ficha" | "analise";

export type DuvidaAberta = {
  /** Estável entre regenerações: derivado da origem, não de índice nem de sorteio. */
  id: string;
  origem: OrigemDuvida;
  chaveOrigem: string;
  severidade: SeveridadeSinal;
  /** O fato do currículo que levantou a dúvida. Sem isso a pergunta parece aleatória. */
  oQueChamouAtencao: string;
  pergunta: string;
  /** A resposta que resolve a dúvida a favor da candidata. */
  seConvence: string;
  /** A resposta que mantém ou agrava a dúvida. */
  seNaoConvence: string;
};

export const LEITURAS: { valor: LeituraResposta; rotulo: string; icone: string }[] = [
  { valor: "convence", rotulo: "Convenceu", icone: "CircleCheck" },
  { valor: "parcial", rotulo: "Em parte", icone: "CircleDot" },
  { valor: "nao-convence", rotulo: "Não convenceu", icone: "CircleX" },
];

/**
 * Catálogo de leitura por tipo de sinal.
 *
 * Escrito no tom de quem já contratou e já se arrependeu: o que fazer com a
 * resposta, não o que sentir sobre ela. Cada texto começa pelo lado que o RH
 * precisa reconhecer na hora, com a candidata na frente.
 */
const LEITURA_POR_SINAL: Record<string, { convence: string; naoConvence: string }> = {
  "ultimo-curto": {
    convence:
      "Ela diz o motivo sem hesitar e o motivo é externo ou é melhoria: contrato temporário, empresa que fechou, mudança de área com passo à frente, proposta melhor. Datas e nomes batem com o currículo.",
    naoConvence:
      "Ela não lembra por que saiu, muda a versão no meio da conversa, ou o motivo se repete nos empregos anteriores. Aí o padrão é dela, não da empresa — e vai se repetir aqui.",
  },
  rotatividade: {
    convence:
      "A sequência tem uma linha: cada saída levou a um cargo melhor, ou foram contratos com prazo definido desde o início. E ela explica o que mudou para querer ficar agora.",
    naoConvence:
      "Cada saída tem um motivo diferente e nenhum é dela: sempre foi a chefia, o colega, o transporte. Recepção de clínica custa dois meses de treino — isso é prejuízo real.",
  },
  "datas-sobrepostas": {
    convence:
      "Era mesmo dois trabalhos ao mesmo tempo (comum em meio período e diarista), ou ela reconhece na hora que digitou errado e corrige com a data certa.",
    naoConvence:
      "Ela insiste que as datas estão corretas e a matemática continua não fechando. Currículo com data inflada é o sinal mais barato de que outras coisas também estão infladas.",
  },
  lacuna: {
    convence:
      "Estudo, filho pequeno, cuidado de familiar, tratamento de saúde, tentativa de negócio próprio. Qualquer coisa dita com naturalidade — buraco na carreira é normal e não é da nossa conta além do que ela quiser contar.",
    naoConvence:
      "Ela desconversa ou dá uma resposta que não se sustenta. E cuidado com o inverso: perguntar demais sobre motivo pessoal é invasivo, então uma resposta vaga que ela não quer detalhar NÃO é problema — só é problema se contradisser o resto.",
  },
  "sem-datas": {
    convence:
      "Ela informa os períodos na hora, com mês e ano, e eles batem com o que contou sobre a rotina. Currículo malfeito não é profissional malfeito.",
    naoConvence:
      "Ela não consegue precisar nem o ano, ou os períodos que ela diz não cabem na idade dela. Sem data, o histórico inteiro é não verificável — e aí só a experiência prática conta.",
  },
  "sem-experiencia": {
    convence:
      "Para estágio ou primeiro emprego, isso não é defeito: o que conta é disponibilidade real, vontade de aprender e alguém em casa que sustente a rotina de horário.",
    naoConvence:
      "Para uma vaga que pede rotina de recepção pronta, ela não tem onde se apoiar e vai precisar de treinamento longo. Só siga se a clínica tiver esse fôlego agora.",
  },
  "sem-registro": {
    convence:
      "Ela tem o registro e só esqueceu de pôr no currículo — peça o número e confira no site do conselho antes de avançar.",
    naoConvence:
      "Ela não tem registro ativo. Para dentista e para ASB isso é eliminatório e não é negociável: a clínica responde pelo profissional que coloca na cadeira.",
  },
  "experiencia-fora-da-area": {
    convence:
      "A experiência é de atendimento de verdade — varejo, hotelaria, telemarketing ativo — e ela demonstra que entende a diferença entre vender e acolher paciente com dor.",
    naoConvence:
      "A experiência não tem contato com público nem rotina administrativa, e ela fala da vaga como um emprego qualquer. Vai embora no primeiro aperto.",
  },
  "sem-atendimento": {
    convence:
      "Aparece atendimento que o currículo não nomeou: balcão, telefone, portaria, sala de espera. Muita gente não escreve isso porque acha que não conta.",
    naoConvence:
      "Ela nunca lidou com público e a rotina descrita é toda interna. Recepção cheia com telefone tocando é um ambiente específico — não dá para descobrir se aguenta depois de contratada.",
  },
  "sem-administrativo": {
    convence:
      "Ela já fez agenda, confirmação, caixa ou sistema em algum lugar, mesmo sem o cargo ter esse nome. Peça para descrever um dia inteiro de trabalho — é ali que aparece.",
    naoConvence:
      "Nunca mexeu com agenda, sistema nem dinheiro. Dá para ensinar, mas conte o tempo: são semanas até ela fechar o caixa sozinha.",
  },
  "idade-incoerente": {
    convence:
      "A conta fecha quando ela explica: começou muito cedo, trabalhos simultâneos, negócio da família. Acontece.",
    naoConvence:
      "A soma dos anos declarados não cabe na idade e ela não explica. Currículo inflado no tempo costuma estar inflado na função também.",
  },
  desempregada: {
    convence:
      "Disponibilidade imediata é vantagem para a clínica, e ela diz sem constrangimento há quanto tempo está procurando.",
    naoConvence:
      "Nada aqui é demérito. Estar sem emprego não diz nada sobre a pessoa — só confirme a data real de início e siga.",
  },
  "fora-da-regiao": {
    convence:
      "Ela já calculou o trajeto, sabe o tempo e a condução, e o horário da clínica cabe. Ou está de mudança para perto.",
    naoConvence:
      "Mais de uma hora e meia de cada lado, sem plano. Não é falta de vontade — é que às 7h da manhã, no terceiro mês, a conta não fecha e ela sai.",
  },
  "possivel-duplicado": {
    convence:
      "É a mesma pessoa que já se candidatou antes ou para outra vaga. Junte as duas fichas e avalie o histórico completo em vez de dois pedaços.",
    naoConvence:
      "São pessoas diferentes com nome parecido. Confira o telefone e o CPF antes de qualquer contato, para não ligar chamando pelo nome errado.",
  },
  ilegivel: {
    convence:
      "Ela manda o currículo de novo em PDF ou conta a trajetória por telefone em cinco minutos. Foto tremida não diz nada sobre a candidata.",
    naoConvence:
      "Não dá para avaliar o que não dá para ler. Peça um envio novo antes de decidir — descartar por qualidade de arquivo seria injusto.",
  },
  "documento-invalido": {
    convence:
      "Foi arquivo trocado no envio. Peça o currículo certo — acontece o tempo todo com anexo de WhatsApp.",
    naoConvence:
      "Ela não tem currículo montado. Ofereça receber os dados por telefone se o perfil interessar; muita gente boa não sabe montar currículo.",
  },
  "sem-contato": {
    convence: "O contato existe e só ficou de fora do arquivo. Anote e siga.",
    naoConvence:
      "Sem telefone e sem e-mail não há como chamar. Antes de arquivar, procure o número no WhatsApp que enviou o currículo.",
  },
  "sem-telefone": {
    convence: "Ela passa o número na hora.",
    naoConvence:
      "Só e-mail para uma vaga de recepção é estranho — confirme que ela ainda está procurando.",
  },
  "dado-sensivel": {
    convence: "",
    naoConvence: "",
  },
};

/** Leitura genérica para o que a IA levantou e não tem catálogo próprio. */
const LEITURA_PADRAO = {
  convence:
    "Ela responde com fato concreto: nome do sistema, nome da empresa, o que fazia na prática, um exemplo do dia a dia.",
  naoConvence:
    "A resposta fica no genérico — 'sempre fui organizada', 'gosto de gente'. Sem exemplo, é adjetivo, e adjetivo não se confere.",
};

function leituraDe(chave: string): { convence: string; naoConvence: string } {
  return LEITURA_POR_SINAL[chave] ?? LEITURA_PADRAO;
}

/** Normaliza a pergunta para deduplicar: a IA e o motor de sinais repetem tema. */
function chaveDaPergunta(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ORDEM: Record<SeveridadeSinal, number> = {
  critico: 0,
  alto: 1,
  medio: 2,
  baixo: 3,
  info: 4,
};

/**
 * Junta tudo que existe de dúvida sobre esta candidata, sem repetir.
 *
 * A ordem das fontes importa: a triagem objetiva da ficha vem primeiro porque é
 * eliminatória — não faz sentido investigar sistema de clínica com alguém que
 * não tem disponibilidade para o horário. Depois vêm os sinais calculados (fato
 * duro), e por último as perguntas que a IA levantou lendo o texto.
 */
export function montarDuvidas(item: Candidatura): DuvidaAberta[] {
  const saida: DuvidaAberta[] = [];
  const vistas = new Set<string>();

  const acrescentar = (d: DuvidaAberta) => {
    const chave = chaveDaPergunta(d.pergunta);
    if (chave === "" || vistas.has(chave)) return;
    vistas.add(chave);
    saida.push(d);
  };

  const ficha = item.ficha;
  if (ficha !== null) {
    for (const [i, t] of ficha.triagem.entries()) {
      acrescentar({
        id: "triagem-" + i,
        origem: "triagem",
        chaveOrigem: "triagem",
        severidade: "alto",
        oQueChamouAtencao: t.porque,
        pergunta: t.pergunta,
        seConvence: "Resposta 'sim' clara, sem ressalva. É item de corte: passa ou não passa.",
        seNaoConvence:
          "'Não' ou 'em parte' aqui pesa mais que qualquer outra resposta da entrevista — a triagem existe justamente para não gastar uma hora com quem não pode assumir a vaga.",
      });
    }
  }

  const analise = item.analise;
  if (analise !== null) {
    for (const s of analise.sinais) {
      if (s.perguntar.trim() === "") continue;
      const l = leituraDe(s.chave);
      if (l.convence === "" && l.naoConvence === "") continue;
      acrescentar({
        id: "sinal-" + s.chave,
        origem: "sinal",
        chaveOrigem: s.chave,
        severidade: s.severidade,
        oQueChamouAtencao: s.detalhe,
        pergunta: s.perguntar,
        seConvence: l.convence,
        seNaoConvence: l.naoConvence,
      });
    }
  }

  if (ficha !== null) {
    for (const [i, p] of ficha.perguntasEspecificas.entries()) {
      acrescentar({
        id: "ficha-" + i,
        origem: "ficha",
        chaveOrigem: "ficha",
        severidade: "medio",
        oQueChamouAtencao: p.porque,
        pergunta: p.pergunta,
        seConvence: LEITURA_PADRAO.convence,
        seNaoConvence: LEITURA_PADRAO.naoConvence,
      });
    }
  }

  if (analise !== null) {
    for (const [i, p] of analise.perguntasEntrevista.entries()) {
      acrescentar({
        id: "analise-" + i,
        origem: "analise",
        chaveOrigem: "analise",
        severidade: "medio",
        oQueChamouAtencao: p.porque,
        pergunta: p.pergunta,
        seConvence: LEITURA_PADRAO.convence,
        seNaoConvence: LEITURA_PADRAO.naoConvence,
      });
    }
  }

  // Ordenação estável por gravidade: o que pode eliminar vem antes do que só
  // esclarece. Dentro da mesma gravidade, mantém a ordem de entrada.
  return saida
    .map((d, i) => ({ d, i }))
    .sort((a, b) => ORDEM[a.d.severidade] - ORDEM[b.d.severidade] || a.i - b.i)
    .map((x) => x.d);
}

/**
 * Quantas dúvidas GRAVES ainda pesam.
 *
 * "Importante" é crítico ou alto — e deixa de contar assim que o entrevistador
 * marca "Convenceu": uma dúvida grave respondida deixou de ser dúvida. "Em
 * parte" e "não convenceu" continuam contando, porque nenhuma das duas fecha o
 * assunto.
 *
 * Mora aqui, e não na tela, porque três superfícies fazem a mesma pergunta — o
 * painel, o cartão do kanban e a linha da tabela — e bastaria uma das cópias
 * envelhecer para o funil e a tabela discordarem sobre a mesma pessoa na mesma
 * tarde.
 */
export function importantesEmAberto(
  duvidas: DuvidaAberta[],
  leituras: Record<string, LeituraResposta>,
): number {
  return duvidas.filter(
    (d) =>
      (d.severidade === "critico" || d.severidade === "alto") &&
      (leituras[d.id] ?? "") !== "convence",
  ).length;
}

/** O mesmo, a partir da candidatura — que é o que o funil e a tabela têm em mãos. */
export function duvidasImportantesDe(
  item: Candidatura,
  leituras: Record<string, LeituraResposta>,
): number {
  return importantesEmAberto(montarDuvidas(item), leituras);
}

/** Quantas dúvidas ainda não foram lidas pelo entrevistador. */
export function duvidasEmAberto(
  duvidas: DuvidaAberta[],
  leituras: Record<string, LeituraResposta>,
): number {
  return duvidas.filter((d) => (leituras[d.id] ?? "") === "").length;
}

/**
 * O veredito do roteiro, em uma linha. Não substitui a decisão do entrevistador
 * — resume o que ele mesmo marcou, para ele não terminar a conversa com a
 * sensação boa de sempre e esquecer que três respostas não fecharam.
 */
export function resumoDasLeituras(
  duvidas: DuvidaAberta[],
  leituras: Record<string, LeituraResposta>,
): { convence: number; parcial: number; naoConvence: number; aberto: number; frase: string } {
  let convence = 0;
  let parcial = 0;
  let naoConvence = 0;
  let aberto = 0;
  let graveNaoResolvida = 0;

  for (const d of duvidas) {
    const l = leituras[d.id] ?? "";
    if (l === "convence") convence++;
    else if (l === "parcial") parcial++;
    else if (l === "nao-convence") {
      naoConvence++;
      if (d.severidade === "critico" || d.severidade === "alto") graveNaoResolvida++;
    } else aberto++;
  }

  const frase =
    duvidas.length === 0
      ? "Nenhuma dúvida aberta no currículo."
      : aberto === duvidas.length
        ? "Nenhuma dúvida foi lida ainda."
        : graveNaoResolvida > 0
          ? graveNaoResolvida +
            (graveNaoResolvida === 1
              ? " dúvida importante não foi resolvida na conversa."
              : " dúvidas importantes não foram resolvidas na conversa.")
          : aberto > 0
            ? aberto +
              (aberto === 1 ? " pergunta ficou sem leitura." : " perguntas ficaram sem leitura.")
            : naoConvence === 0 && parcial === 0
              ? "Todas as dúvidas foram esclarecidas."
              : "As dúvidas foram lidas, com pontos parciais a considerar.";

  return { convence, parcial, naoConvence, aberto, frase };
}
