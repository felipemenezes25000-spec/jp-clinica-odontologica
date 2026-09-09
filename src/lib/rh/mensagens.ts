/**
 * Os textos que a clínica manda para a candidata — e os links que os entregam.
 *
 * Antes desta onda o painel tinha um `wa.me` e um `mailto:` vazios: o RH abria
 * o WhatsApp e escrevia tudo de novo, do zero, toda vez. O resultado era o
 * previsível — mensagem seca, nome errado, vaga trocada, e o convite de
 * entrevista sem o endereço da clínica. Aqui o texto se escreve sozinho a
 * partir do que o sistema JÁ SABE daquela candidatura: o primeiro nome, a vaga,
 * a data que ficou marcada, as empresas que vieram sem período no currículo, o
 * documento que faltou. É isso que faz a mensagem parecer escrita por alguém
 * que leu o currículo — porque foi.
 *
 * Puro, como `formatar.ts`, `validar.ts` e `guia.ts`: sem React, sem I/O, sem
 * `node:`. O painel é renderizado no servidor, e qualquer diferença de string
 * entre os dois lados derruba a hidratação — por isso `agora` entra por
 * parâmetro em tudo que depende do relógio, e não há um `new Date()` sequer
 * neste arquivo.
 *
 * DUAS REGRAS QUE NÃO SE NEGOCIAM, e que valem para qualquer modelo novo:
 *
 *   1. Nada de dado sensível no texto. Nunca CPF, nunca a nota da IA, nunca um
 *      sinal, nunca a análise. O que sai daqui vai para o celular de uma pessoa
 *      que não é funcionária da clínica.
 *   2. O motivo de uma recusa nunca vem da leitura da IA. Ver `nao-seguiu`.
 */
import type { Candidatura } from "./tipos";
import { apenasDigitos, primeiroNome } from "./formatar";

/* -------------------------------------------------------------------------- */
/* Modelos                                                                    */
/* -------------------------------------------------------------------------- */

export type ChaveModelo =
  | "convite-entrevista"
  | "confirmar-vespera"
  | "pedir-documento"
  | "pedir-datas"
  | "proposta"
  | "nao-seguiu"
  | "nao-seguiu-entrevista"
  | "banco-de-talentos"
  | "primeiro-contato";

export type ModeloMensagem = {
  chave: ChaveModelo;
  /**
   * O nome do modelo — e também o começo da linha que vai para o histórico
   * ("Convite de entrevista enviado por WhatsApp em …"). Por isso ele é um
   * substantivo, e não um verbo no imperativo: "Convite de entrevista", nunca
   * "Convidar para entrevista".
   */
  rotulo: string;
  descricao: string;
  /** Nome do componente lucide-react; quem renderiza faz o mapa nome -> ícone. */
  icone: string;
  /**
   * Canais em que o modelo faz sentido, **com o recomendado na frente**. A
   * clínica combina quase tudo por WhatsApp, mas recusa e banco de talentos
   * saem melhor por e-mail: são mensagens que a pessoa pode querer reler
   * sozinha, sem o "digitando…" do outro lado.
   */
  canais: ("whatsapp" | "email")[];
  /**
   * Parte fixa do assunto de e-mail. O assunto que vai de verdade sai de
   * `montarAssunto`, que acrescenta a vaga — este campo é o que a tela mostra
   * como prévia antes de montar.
   */
  assunto: string;
  /** Quando escolher este modelo, em uma linha. É o que a tela mostra na lista. */
  quandoUsar: string;
};

export const MODELOS: ModeloMensagem[] = [
  {
    chave: "primeiro-contato",
    rotulo: "Primeiro contato",
    descricao:
      "Avisa que o currículo chegou, confirma que o interesse continua de pé e explica o próximo passo.",
    icone: "MessageSquarePlus",
    canais: ["whatsapp", "email"],
    assunto: "Recebemos o seu currículo",
    quandoUsar: "Currículo novo, antes de marcar qualquer coisa.",
  },
  {
    chave: "convite-entrevista",
    rotulo: "Convite de entrevista",
    descricao:
      "Chama para a conversa. Com data marcada, repete dia, horário e endereço; sem data, oferece manhã ou tarde e pergunta a preferência.",
    icone: "CalendarPlus",
    canais: ["whatsapp", "email"],
    assunto: "Convite para entrevista",
    quandoUsar: "Depois da triagem, quando a clínica decidiu conversar.",
  },
  {
    chave: "confirmar-vespera",
    rotulo: "Confirmação de véspera",
    descricao: "Confirma a entrevista já marcada e abre a porta para remarcar sem constrangimento.",
    icone: "CalendarCheck",
    canais: ["whatsapp", "email"],
    assunto: "Confirmação da sua entrevista",
    quandoUsar: "Um dia antes da conversa — é o que derruba o índice de falta.",
  },
  {
    chave: "pedir-datas",
    rotulo: "Pedido de datas",
    descricao:
      "Pergunta o período exato dos empregos que vieram sem data no currículo, nomeando cada um.",
    icone: "History",
    canais: ["whatsapp", "email"],
    quandoUsar: "Quando o currículo lista emprego sem dizer de quando até quando.",
    assunto: "Uma dúvida sobre o seu currículo",
  },
  {
    chave: "pedir-documento",
    rotulo: "Pedido de documento",
    descricao: "Pede só o que está faltando de fato — registro, contato ou o arquivo legível.",
    icone: "Paperclip",
    canais: ["whatsapp", "email"],
    assunto: "Falta um documento na sua candidatura",
    quandoUsar: "Quando falta CRO, e-mail ou o currículo saiu ilegível.",
  },
  {
    chave: "proposta",
    rotulo: "Proposta",
    descricao:
      "Dá a notícia e combina a conversa em que os detalhes do contrato serão fechados. Não escreve valores.",
    icone: "Handshake",
    canais: ["whatsapp", "email"],
    assunto: "Boa notícia sobre a sua candidatura",
    quandoUsar: "Depois da decisão de contratar, para combinar os detalhes.",
  },
  {
    chave: "nao-seguiu",
    rotulo: "Retorno de não seguimento",
    descricao:
      "Encerra o processo com respeito, sem promessa falsa, e oferece o banco de talentos.",
    icone: "HeartHandshake",
    // E-mail na frente: recusa é notícia que a pessoa pode querer ler sozinha,
    // sem o outro lado vendo que ela abriu.
    canais: ["email", "whatsapp"],
    assunto: "Retorno sobre o nosso processo seletivo",
    quandoUsar: "Quando a vaga foi para outra pessoa e o processo acabou para ela.",
  },
  {
    chave: "nao-seguiu-entrevista",
    rotulo: "Retorno depois da entrevista",
    descricao:
      "Para quem já sentou e conversou: agradece o tempo dela, diz que a vaga foi para outro perfil e deseja boa jornada.",
    icone: "Sprout",
    // WhatsApp na frente, ao contrário do "não seguiu" genérico: quem veio até
    // a clínica já trocou mensagem por aqui, e esperar o e-mail para dar a
    // notícia é o que deixa a pessoa dias no vácuo.
    canais: ["whatsapp", "email"],
    assunto: "Retorno da nossa entrevista",
    quandoUsar: "Depois da entrevista, quando a vaga ficou com outra pessoa.",
  },
  {
    chave: "banco-de-talentos",
    rotulo: "Banco de talentos",
    descricao: "Avisa que o currículo ficou guardado e pede que ela mantenha o contato atualizado.",
    icone: "BookmarkPlus",
    canais: ["email", "whatsapp"],
    assunto: "Seu currículo no nosso banco de talentos",
    quandoUsar: "Sem vaga aberta para o perfil, mas com vontade de chamar depois.",
  },
];

export type ContextoMensagem = {
  item: Candidatura;
  clinica: { nome: string; telefone: string; endereco: string; horario: string };
  /** Quem está escrevendo. Vai no "aqui é a Ana" e na assinatura do e-mail. */
  remetente: string;
  agora: Date;
  /**
   * Para qual canal o texto está sendo montado.
   *
   * Não estava no desenho original e precisou entrar: o WhatsApp é conversa e
   * o e-mail é carta. O mesmo texto nos dois lugares erra dos dois lados — no
   * celular vira um parágrafo que ninguém lê até o fim, e no e-mail chega sem
   * assinatura, parecendo recado de desconhecido. É por isso que só o e-mail
   * ganha o bloco final com endereço, telefone e horário da clínica.
   *
   * Opcional porque o padrão é o canal que a clínica mais usa: WhatsApp.
   */
  canal?: "whatsapp" | "email";
};

/* -------------------------------------------------------------------------- */
/* Datas — leitura por extenso                                                */
/* -------------------------------------------------------------------------- */

const DIAS_SEMANA_EXTENSO = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

const MESES_EXTENSO = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/**
 * A clínica é em São Paulo e o Brasil não tem horário de verão desde 2019, então
 * um deslocamento fixo basta — e, ao contrário de `toLocaleString`, dá o mesmo
 * resultado no Node (que roda em UTC) e no navegador. Mesmo raciocínio, e mesmo
 * número, de `FUSO_BRASIL_MINUTOS` em `formatar.ts`.
 */
const FUSO_BRASIL_MINUTOS = -180;

type Momento = { ano: number; mes: number; dia: number; hora: number; minuto: number };

/**
 * Lê "AAAA-MM-DD" ou "AAAA-MM-DDTHH:mm" **ao pé da letra**, sem fuso.
 *
 * É de propósito: `entrevistaEm` e `ficha.entrevistaEm` são escritos por
 * `<input type="datetime-local">` e `<input type="date">`, que devolvem horário
 * de parede sem zona nenhuma. Interpretá-los como UTC deslocaria a entrevista
 * das 14:30 para as 11:30 no texto da mensagem.
 */
function lerMomento(iso: string): Momento | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso.trim());
  if (!m) return null;
  const ano = Number(m[1] ?? "");
  const mes = Number(m[2] ?? "");
  const dia = Number(m[3] ?? "");
  const hora = Number(m[4] ?? "0");
  const minuto = Number(m[5] ?? "0");
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59) return null;
  return { ano, mes, dia, hora, minuto };
}

/** O mesmo recorte de `partesLocais` em `formatar.ts`: um `Date` no fuso da clínica. */
function momentoLocal(data: Date): Momento | null {
  const ms = data.getTime();
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms + FUSO_BRASIL_MINUTOS * 60_000);
  return {
    ano: d.getUTCFullYear(),
    mes: d.getUTCMonth() + 1,
    dia: d.getUTCDate(),
    hora: d.getUTCHours(),
    minuto: d.getUTCMinutes(),
  };
}

function dois(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * "quinta-feira, 10 de setembro de 2026".
 *
 * Escrito à mão em vez de `Intl.DateTimeFormat` porque o nome do dia depende do
 * ICU instalado no runtime: no Node "slim" ele cai para inglês, e o convite
 * sairia com "Thursday" no servidor e "quinta-feira" no navegador.
 */
export function dataPorExtenso(iso: string, comDiaDaSemana = true): string {
  const p = lerMomento(iso);
  if (!p) return "";
  const mes = MESES_EXTENSO[p.mes - 1] ?? "";
  const corpo = `${p.dia} de ${mes} de ${p.ano}`;
  if (!comDiaDaSemana) return corpo;
  const semana = DIAS_SEMANA_EXTENSO[new Date(Date.UTC(p.ano, p.mes - 1, p.dia)).getUTCDay()] ?? "";
  return semana === "" ? corpo : `${semana}, ${corpo}`;
}

/** Dias de calendário entre hoje e a data alvo. Negativo quando já passou. */
function diasAte(iso: string, agora: Date): number | null {
  const alvo = lerMomento(iso);
  const hoje = momentoLocal(agora);
  if (!alvo || !hoje) return null;
  const a = Date.UTC(alvo.ano, alvo.mes - 1, alvo.dia);
  const b = Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia);
  return Math.round((a - b) / 86_400_000);
}

/* -------------------------------------------------------------------------- */
/* Leitura da candidatura                                                     */
/* -------------------------------------------------------------------------- */

export type EntrevistaMarcada = {
  /** "AAAA-MM-DDTHH:mm" — horário de parede, como foi digitado. */
  iso: string;
  /** "AAAA-MM-DD". */
  data: string;
  /** "HH:MM", ou "" quando só a data foi combinada. */
  hora: string;
};

/**
 * Quando é a entrevista, e de onde veio a data.
 *
 * Mesma precedência de `quandoDaEntrevista` na aba Entrevistas, e pelo mesmo
 * motivo: a ficha é o papel que o entrevistador tem na mão, então ela manda; o
 * campo da gaveta é o combinado anterior e vale enquanto a ficha não tiver data
 * própria. Duas telas dizendo horários diferentes para a mesma conversa é o
 * tipo de erro que faz candidata chegar na hora errada.
 */
export function entrevistaMarcada(item: Candidatura): EntrevistaMarcada | null {
  const ficha = item.ficha;
  if (ficha !== null && ficha.entrevistaEm.trim().length >= 10) {
    const data = ficha.entrevistaEm.trim().slice(0, 10);
    const hora = ficha.horario.trim().slice(0, 5);
    return { iso: hora === "" ? data : `${data}T${hora}`, data, hora };
  }
  const bruto = item.entrevistaEm.trim();
  if (bruto.length >= 10) {
    const data = bruto.slice(0, 10);
    const hora = bruto.slice(11, 16);
    return { iso: hora === "" ? data : `${data}T${hora}`, data, hora };
  }
  return null;
}

/** Se aquele alerta da triagem disparou para esta candidatura. */
export function temSinal(item: Candidatura, chave: string): boolean {
  return item.analise?.sinais.some((s) => s.chave === chave) ?? false;
}

/**
 * As empresas que entraram no currículo sem período — nomeadas.
 *
 * É a linha do tempo calculada em `ia/metricas.ts`, filtrada pelas entradas cujo
 * início veio vazio: exatamente o mesmo critério que o sinal "sem-datas" usa
 * para disparar. Os dois precisam concordar, senão a mensagem pergunta por um
 * emprego que o painel não apontou.
 */
export function empregosSemPeriodo(item: Candidatura): string[] {
  const linha = item.analise?.metricas.linhaDoTempo ?? [];
  return linha
    .filter((t) => t.de.trim() === "")
    .map((t) => {
      const cargo = t.cargo.trim();
      const empresa = t.empresa.trim();
      if (cargo !== "" && empresa !== "") return `${cargo} — ${empresa}`;
      return cargo !== "" ? cargo : empresa;
    })
    .filter((t) => t !== "");
}

/** O que a mensagem chama de "a vaga". Nunca sai vazio. */
function vagaDe(item: Candidatura): string {
  const titulo = item.vagaTitulo.trim();
  if (titulo !== "") return titulo;
  const cargo = item.cargoDesejado.trim();
  return cargo !== "" ? cargo : "uma vaga na clínica";
}

function saudacao(item: Candidatura, ctx: ContextoMensagem): string {
  const nome = primeiroNome(item.nome);
  const quem = ctx.remetente.trim();
  const abre = nome === "" ? "Olá!" : `Oi, ${nome}!`;
  // Sem remetente configurado a frase ainda precisa fechar: "aqui é da JP…"
  // seria agramatical, então o "aqui é" some junto com o nome de quem escreve.
  return quem === ""
    ? `${abre} Somos da ${ctx.clinica.nome}.`
    : `${abre} Aqui é ${quem}, da ${ctx.clinica.nome}.`;
}

/**
 * O rodapé que só o e-mail leva.
 *
 * No WhatsApp ele seria ruído: a pessoa já está falando com o número da
 * clínica, salvo na agenda dela. No e-mail é o contrário — sem endereço e
 * telefone a mensagem chega parecendo recado de desconhecido, e é justamente
 * o e-mail que a candidata guarda para achar a clínica no dia da entrevista.
 */
export function assinaturaEmail(ctx: ContextoMensagem): string {
  return linhasDaAssinatura(ctx).join("\n");
}

function linhasDaAssinatura(ctx: ContextoMensagem): string[] {
  const quem = ctx.remetente.trim();
  // Sem linha em branco no começo: quem junta os parágrafos já separa com uma.
  const linhas: string[] = ["Um abraço,"];
  if (quem !== "") linhas.push(quem);
  linhas.push(ctx.clinica.nome);
  if (ctx.clinica.endereco.trim() !== "") linhas.push(ctx.clinica.endereco.trim());
  const rodape = [ctx.clinica.telefone.trim(), ctx.clinica.horario.trim()].filter((t) => t !== "");
  if (rodape.length > 0) linhas.push(rodape.join(" · "));
  return linhas;
}

/** Junta parágrafos descartando os que ficaram vazios, sem deixar linha dupla. */
function montar(partes: string[]): string {
  return partes
    .map((p) => p.trimEnd())
    .filter((p) => p !== "")
    .join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Os textos                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Como a entrevista é dita no texto: "amanhã, quinta-feira, 10 de setembro, às
 * 14:30". "Hoje" e "amanhã" entram só quando são verdade — dizer "amanhã" para
 * uma conversa que é semana que vem é o jeito mais rápido de perder a candidata.
 */
function quandoPorExtenso(marcada: EntrevistaMarcada, agora: Date): string {
  const dias = diasAte(marcada.data, agora);
  const extenso = dataPorExtenso(marcada.data);
  const prefixo = dias === 0 ? "hoje, " : dias === 1 ? "amanhã, " : "";
  const hora = marcada.hora === "" ? "" : `, às ${marcada.hora}`;
  return `${prefixo}${extenso}${hora}`;
}

function textoConviteEntrevista(ctx: ContextoMensagem): string[] {
  const { item, clinica } = ctx;
  const vaga = vagaDe(item);
  const marcada = entrevistaMarcada(item);
  const onde = clinica.endereco.trim() === "" ? "aqui na clínica" : `na ${clinica.endereco.trim()}`;

  if (marcada !== null) {
    return [
      saudacao(item, ctx),
      `Queremos conversar com você sobre a vaga de ${vaga}. Ficou marcado para ${quandoPorExtenso(marcada, ctx.agora)}, ${onde}.`,
      "A conversa leva cerca de 40 minutos. Traga um documento com foto e, se puder, uma cópia impressa do currículo.",
      "Consegue confirmar que estará lá? Se precisar remarcar, é só me avisar.",
    ];
  }

  const expediente =
    clinica.horario.trim() === "" ? "" : ` Atendemos ${clinica.horario.trim().toLowerCase()}.`;
  return [
    saudacao(item, ctx),
    `Gostamos do seu currículo e queremos conversar com você sobre a vaga de ${vaga}.`,
    `Consigo te receber de manhã ou à tarde — qual dos dois períodos fica melhor para você? Assim que me disser, fecho o dia e o horário.${expediente}`,
    `A conversa é ${onde} e leva cerca de 40 minutos.`,
  ];
}

function textoConfirmarVespera(ctx: ContextoMensagem): string[] {
  const { item, clinica } = ctx;
  const marcada = entrevistaMarcada(item);
  const onde = clinica.endereco.trim() === "" ? "aqui na clínica" : `na ${clinica.endereco.trim()}`;
  const quando =
    marcada === null
      ? "a nossa conversa"
      : `a nossa conversa de ${quandoPorExtenso(marcada, ctx.agora)}`;

  return [
    saudacao(item, ctx),
    `Passando só para confirmar ${quando}, ${onde}.`,
    "Se aparecer qualquer imprevisto, me avisa por aqui que a gente remarca sem problema nenhum.",
    "Até logo!",
  ];
}

/**
 * O pedido de datas — o modelo que mais prova que alguém leu o currículo.
 *
 * As empresas são nomeadas uma a uma a partir da linha do tempo. Uma mensagem
 * genérica ("faltam algumas datas no seu currículo") obriga a candidata a
 * adivinhar de quais empregos estamos falando, e a resposta volta incompleta.
 */
function textoPedirDatas(ctx: ContextoMensagem): string[] {
  const { item } = ctx;
  const faltando = empregosSemPeriodo(item);
  const vaga = vagaDe(item);

  const lista = faltando.length > 0 ? faltando.map((e) => `• ${e}`).join("\n") : "";
  const pergunta =
    faltando.length === 1
      ? "De que mês a que mês você ficou nesse emprego?"
      : "De que mês a que mês você ficou em cada um deles?";

  return [
    saudacao(item, ctx),
    `Estou organizando o seu currículo para a vaga de ${vaga} e ficou faltando o período de ${faltando.length === 1 ? "um dos empregos" : "alguns empregos"}:`,
    lista,
    `${pergunta} Pode responder por aqui mesmo, é rapidinho — sem isso a sua experiência acaba ficando de fora da nossa conta.`,
  ];
}

/**
 * O pedido de documento monta a lista a partir dos SINAIS, e não de uma lista
 * fixa: pedir o CRO de quem já mandou o CRO é o tipo de mensagem que faz a
 * pessoa achar que ninguém abriu o arquivo dela.
 */
function faltantes(item: Candidatura): string[] {
  const lista: string[] = [];
  if (temSinal(item, "sem-registro")) {
    lista.push("o número do seu CRO e o estado do registro (ex.: CRO-SP 12345)");
  }
  if (temSinal(item, "sem-contato")) {
    lista.push("um e-mail para contato");
  }
  if (temSinal(item, "sem-telefone")) {
    lista.push("um telefone com WhatsApp");
  }
  if (temSinal(item, "ilegivel") || temSinal(item, "documento-invalido")) {
    lista.push("o currículo em PDF (o arquivo que chegou ficou difícil de ler)");
  }
  return lista;
}

function textoPedirDocumento(ctx: ContextoMensagem): string[] {
  const { item } = ctx;
  const vaga = vagaDe(item);
  const falta = faltantes(item);

  // Sem nada faltando o modelo nem deveria ter sido oferecido (ver
  // `modelosAplicaveis`), mas texto quebrado é pior que texto genérico: se a
  // tela chamar assim mesmo, o pedido continua fazendo sentido.
  if (falta.length === 0) {
    return [
      saudacao(item, ctx),
      `Estou finalizando a sua candidatura para a vaga de ${vaga}.`,
      "Consegue me enviar o seu currículo atualizado em PDF? Assim garanto que estou olhando a versão mais recente.",
    ];
  }

  const lista = falta.map((f) => `• ${f}`).join("\n");
  return [
    saudacao(item, ctx),
    `Para seguir com a sua candidatura para a vaga de ${vaga}, falta ${falta.length === 1 ? "uma coisinha" : "um pouco de informação"}:`,
    lista,
    "Pode me mandar por aqui mesmo. Assim que chegar, sigo com a sua análise.",
  ];
}

function textoProposta(ctx: ContextoMensagem): string[] {
  const { item, clinica } = ctx;
  const vaga = vagaDe(item);
  const expediente =
    clinica.horario.trim() === ""
      ? ""
      : ` Estamos na clínica ${clinica.horario.trim().toLowerCase()}.`;

  return [
    saudacao(item, ctx),
    `Tenho uma boa notícia: queremos você com a gente na vaga de ${vaga}.`,
    // Nenhum valor, nenhuma data de início, nenhuma promessa de benefício: isso
    // se combina com uma pessoa falando com outra. Uma condição escrita aqui
    // vira compromisso antes de alguém ter conferido se ela se sustenta.
    "Combinamos os detalhes — função, jornada, data de início e remuneração — em uma conversa rápida, pessoalmente ou por telefone, como você preferir.",
    `Que horário funciona melhor para eu te ligar?${expediente}`,
  ];
}

/**
 * A recusa.
 *
 * ATENÇÃO, e este é o comentário mais importante do arquivo: este texto NUNCA
 * pode citar um motivo vindo da análise da IA. O sistema sabe a nota, sabe os
 * sinais, sabe que a permanência média foi de sete meses — e nada disso pode
 * chegar ao celular da candidata. "Você não passou porque a IA achou que você
 * troca muito de emprego" não é transparência: é uma máquina julgando alguém e
 * um humano se escondendo atrás dela, com um dado que a pessoa não tem como
 * contestar e que pode simplesmente estar errado (as datas do currículo dela
 * estavam ilegíveis; ela cuidou de um filho doente; a empresa fechou).
 *
 * O que se diz é o que é verdade e é suficiente: seguimos com outra pessoa.
 * Esta é a diferença entre recusar com respeito e humilhar — e a clínica é de
 * bairro, essa pessoa vai cruzar com a recepcionista no mercado.
 */
function textoNaoSeguiu(ctx: ContextoMensagem): string[] {
  const { item } = ctx;
  const vaga = vagaDe(item);

  return [
    saudacao(item, ctx),
    // "Agradecemos", e não "obrigado/obrigada": quem assina muda, e o texto não
    // pode sair no gênero errado de quem está escrevendo.
    `Agradecemos a sua participação no nosso processo para a vaga de ${vaga} e o tempo que você dedicou à gente.`,
    // Sem "você foi muito bem, mas…" e sem "entraremos em contato em breve": os
    // dois são falsos e a pessoa fica esperando por um telefonema que não vem.
    "Dessa vez seguimos com outra pessoa para essa vaga.",
    "Se você quiser, guardamos o seu currículo no nosso banco de talentos e falamos com você quando abrir uma oportunidade do seu perfil. É só me responder por aqui.",
    "Desejo tudo de bom para você.",
  ];
}

/**
 * O retorno de quem JÁ FOI ENTREVISTADA — texto escrito pela própria clínica.
 *
 * Vale a mesma regra do `textoNaoSeguiu`, e ela é a mais importante deste
 * arquivo: NUNCA citar motivo vindo da análise da IA. O sistema sabe a nota e
 * os sinais; nada disso chega ao celular de ninguém.
 *
 * Por que é um modelo SEPARADO do "não seguiu" genérico: aquele serve para quem
 * foi cortado na triagem, e diz "o tempo que você dedicou à gente" — frase que
 * cabe em quem só mandou currículo. Quem pegou condução, sentou na recepção e
 * conversou meia hora com a equipe dedicou outra coisa, e ouvir o mesmo texto
 * padrão depois disso é o que faz a pessoa sentir que ninguém percebeu que ela
 * esteve lá.
 *
 * E é por isso que `relevancia` DEVOLVE NULL quando não há sinal de entrevista:
 * agradecer por uma conversa que não aconteceu é pior do que não escrever.
 */
function textoNaoSeguiuEntrevista(ctx: ContextoMensagem): string[] {
  const { item } = ctx;

  return [
    saudacao(item, ctx),
    "Passando para agradecer muito pelo seu tempo e dedicação em participar da nossa entrevista. Foi muito bom conhecer um pouco mais sobre você. 😊",
    "Queremos informar que, desta vez, decidimos seguir com outro perfil para a vaga. Sabemos que processos exigem energia, por isso fazemos questão de dar esse retorno de forma transparente.",
    "Desejamos muito sucesso e sorte em toda a sua jornada profissional 💚",
  ];
}

function textoBancoDeTalentos(ctx: ContextoMensagem): string[] {
  const { item } = ctx;
  const vaga = vagaDe(item);

  return [
    saudacao(item, ctx),
    `No momento não temos uma vaga aberta para o perfil de ${vaga}, mas o seu currículo ficou guardado no nosso banco de talentos.`,
    "Quando abrir uma oportunidade assim, você é uma das primeiras pessoas que a gente chama.",
    "Se mudar o seu telefone ou o seu e-mail, me avisa por aqui para eu atualizar o cadastro.",
  ];
}

function textoPrimeiroContato(ctx: ContextoMensagem): string[] {
  const { item } = ctx;
  const vaga = vagaDe(item);

  return [
    saudacao(item, ctx),
    `Recebemos o seu currículo para a vaga de ${vaga} e ficamos contentes com o seu interesse.`,
    "Você ainda tem interesse na vaga? Se sim, me responde por aqui que eu te explico como funciona o processo e já combino a nossa conversa.",
  ];
}

function paragrafos(chave: ChaveModelo, ctx: ContextoMensagem): string[] {
  switch (chave) {
    case "convite-entrevista":
      return textoConviteEntrevista(ctx);
    case "confirmar-vespera":
      return textoConfirmarVespera(ctx);
    case "pedir-datas":
      return textoPedirDatas(ctx);
    case "pedir-documento":
      return textoPedirDocumento(ctx);
    case "proposta":
      return textoProposta(ctx);
    case "nao-seguiu":
      return textoNaoSeguiu(ctx);
    case "nao-seguiu-entrevista":
      return textoNaoSeguiuEntrevista(ctx);
    case "banco-de-talentos":
      return textoBancoDeTalentos(ctx);
    case "primeiro-contato":
      return textoPrimeiroContato(ctx);
  }
}

export function montarMensagem(chave: ChaveModelo, ctx: ContextoMensagem): string {
  const corpo = paragrafos(chave, ctx);
  if (ctx.canal !== "email") return montar(corpo);
  return montar([...corpo, assinaturaEmail(ctx)]);
}

export function montarAssunto(chave: ChaveModelo, ctx: ContextoMensagem): string {
  const modelo = MODELOS.find((m) => m.chave === chave);
  const base = modelo?.assunto ?? "Sobre a sua candidatura";
  const vaga = vagaDe(ctx.item);
  // A vaga entra no assunto porque a candidata costuma estar em processo em
  // mais de um lugar: "Convite para entrevista" sozinho não diz de quem é.
  return `${base} — ${vaga} · ${ctx.clinica.nome}`;
}

/* -------------------------------------------------------------------------- */
/* Quais modelos fazem sentido agora                                          */
/* -------------------------------------------------------------------------- */

/**
 * Peso de relevância de um modelo para o estado atual da candidatura.
 * `null` significa "não oferecer": o modelo não faz sentido aqui.
 *
 * A regra mora nesta camada pura, e não na tela, porque é decisão de domínio —
 * e porque é testável sem montar um DOM. Oferecer "confirmar véspera" sem
 * entrevista marcada ou "pedir datas" sem o sinal correspondente produz
 * mensagem sobre coisa nenhuma.
 */
/**
 * Há sinal de que a entrevista ACONTECEU — e não apenas de que foi marcada.
 *
 * Data combinada, sozinha, não prova nada: a conversa pode ter sido desmarcada
 * ou a pessoa pode não ter aparecido. O que prova é a ficha PREENCHIDA, porque
 * quem responde triagem, pergunta, nota ou marca um sinal observado está com a
 * candidata na frente. Passar de "entrevista" para teste ou proposta também
 * prova: as duas etapas vêm depois da conversa.
 *
 * A data entra como último recurso, e de propósito: sem ela, quem entrevistou
 * sem preencher nada — que acontece num dia corrido — ficaria sem o modelo
 * certo para dar o retorno.
 */
function houveEntrevista(item: Candidatura): boolean {
  if (item.status === "teste" || item.status === "proposta") return true;

  const ficha = item.ficha;
  if (ficha !== null) {
    const preenchida =
      ficha.respostasTriagem.length > 0 ||
      ficha.respostasPerguntas.length > 0 ||
      ficha.notas.length > 0 ||
      ficha.sinaisObservados.length > 0 ||
      ficha.entrevistadores.trim() !== "";
    if (preenchida) return true;
  }

  return entrevistaMarcada(item) !== null;
}

function relevancia(chave: ChaveModelo, item: Candidatura): number | null {
  const marcada = entrevistaMarcada(item) !== null;
  const status = item.status;

  switch (chave) {
    case "confirmar-vespera":
      // Sem data combinada não há o que confirmar.
      return marcada ? (status === "entrevista" ? 100 : 70) : null;

    case "convite-entrevista":
      if (status === "contratado" || status === "reprovado") return null;
      return status === "entrevista" ? (marcada ? 90 : 95) : status === "triagem" ? 80 : 45;

    case "pedir-datas":
      // Só quando o alerta disparou E há empresa para nomear: sem nome, o texto
      // vira a mensagem genérica que este modelo existe para evitar.
      if (!temSinal(item, "sem-datas") || empregosSemPeriodo(item).length === 0) return null;
      return 85;

    case "pedir-documento":
      return faltantes(item).length === 0 ? null : 82;

    case "proposta":
      if (status === "reprovado" || status === "banco") return null;
      return status === "proposta" || status === "contratado" ? 98 : status === "teste" ? 60 : 20;

    case "nao-seguiu":
      if (status === "contratado") return null;
      /* Cede a vez para o modelo de pós-entrevista quando a conversa
         aconteceu: os dois cabem, mas o certo aparece primeiro. */
      if (status === "reprovado") return houveEntrevista(item) ? 90 : 96;
      return 15;

    case "nao-seguiu-entrevista":
      if (status === "contratado") return null;
      // Sem sinal de entrevista o modelo não é oferecido: ele agradece por uma
      // conversa, e oferecer isso para quem nunca foi chamada é convidar o RH
      // a mandar uma mentira sem perceber.
      if (!houveEntrevista(item)) return null;
      return status === "reprovado" ? 97 : 20;

    case "banco-de-talentos":
      if (status === "contratado") return null;
      return status === "banco" ? 94 : status === "reprovado" ? 60 : 18;

    case "primeiro-contato":
      if (status === "contratado" || status === "reprovado") return null;
      return status === "novo" ? 92 : 30;
  }
}

/**
 * Os modelos que fazem sentido para esta candidatura, do mais relevante para o
 * menos. A ordem do `MODELOS` desempata, para a lista não dançar entre renders.
 */
export function modelosAplicaveis(item: Candidatura): ModeloMensagem[] {
  return MODELOS.map((m, i) => ({ m, i, peso: relevancia(m.chave, item) }))
    .filter((x): x is { m: ModeloMensagem; i: number; peso: number } => x.peso !== null)
    .sort((a, b) => (b.peso === a.peso ? a.i - b.i : b.peso - a.peso))
    .map((x) => x.m);
}

/* -------------------------------------------------------------------------- */
/* Links                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Só os dígitos do número, já com o 55 na frente — ou "" quando o telefone não
 * serve. Aceita número que já venha com o código do país (o currículo às vezes
 * traz "+55 11 …") sem duplicar o 55.
 */
function celularInternacional(telefone: string): string {
  let d = apenasDigitos(telefone);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return "";
  return `55${d}`;
}

/**
 * O `wa.me` do número da CANDIDATA.
 *
 * `whatsappLink` de "@/lib/jp" aponta para o número da própria clínica: ele
 * serve ao paciente que quer falar conosco, no site público. Aqui é o contrário
 * — quem precisa receber a mensagem é a candidata —, então reaproveitamos só o
 * formato (wa.me + texto já codificado) e trocamos o destino.
 *
 * Telefone inválido devolve "" e quem chama trata: um href vazio levaria o RH
 * para a própria página do painel, o que parece um clique que não funcionou.
 */
export function linkWhatsapp(telefone: string, texto: string): string {
  const numero = celularInternacional(telefone);
  if (numero === "") return "";
  // Sem texto, sem `?text=`: o parâmetro vazio faz alguns WhatsApp Web abrirem
  // a conversa com o campo já "tocado", e o rascunho que o RH digitar some.
  if (texto.trim() === "") return `https://wa.me/${numero}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export function linkEmail(email: string, assunto: string, corpo: string): string {
  const e = email.trim();
  // Checagem mínima de forma: `mailto:` com lixo abre o cliente de e-mail com
  // um destinatário impossível, e o RH só descobre quando a mensagem volta.
  if (e === "" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "";
  return `mailto:${encodeURIComponent(e).replace(/%40/g, "@")}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}

export function linkTelefone(telefone: string): string {
  const numero = celularInternacional(telefone);
  if (numero === "") return "";
  return `tel:+${numero}`;
}

/* -------------------------------------------------------------------------- */
/* Convite de calendário (.ics)                                               */
/* -------------------------------------------------------------------------- */

/**
 * Texto de calendário, no formato do RFC 5545, sem nenhuma dependência.
 *
 * As armadilhas do formato, e como cada uma é tratada aqui:
 *
 * • **CRLF.** O RFC manda separar linhas com \r\n. Só \n faz o Outlook recusar
 *   o arquivo inteiro — sem mensagem de erro, o convite simplesmente não abre.
 *
 * • **Dobra em 75 octetos.** Linha de conteúdo não pode passar de 75 OCTETOS
 *   (não caracteres): a continuação vai na linha seguinte começando por um
 *   espaço. "Odontológica" tem 12 caracteres e 13 octetos, então contar
 *   caracteres estoura o limite em qualquer descrição com acento. A dobra
 *   também nunca corta um ponto de código no meio — meio "ç" em UTF-8 é um
 *   arquivo corrompido.
 *
 * • **Escape.** Vírgula, ponto e vírgula e barra invertida são separadores no
 *   formato e precisam de \; a quebra de linha vira o literal \n. Sem isso,
 *   o endereço "R. Rio Verde, 1029 — Vila Bruna" faz o Google Agenda ler
 *   "Vila Bruna" como um segundo valor e o local chega cortado.
 *
 * • **UID estável.** Derivado do id da candidatura + o início da entrevista,
 *   NUNCA de `Math.random`. Se o RH reemitir o mesmo convite (remarcou, mandou
 *   de novo, o e-mail sumiu), um UID novo criaria um SEGUNDO compromisso na
 *   agenda em vez de atualizar o primeiro — e a clínica ficaria com duas
 *   entrevistas fantasma no mesmo dia.
 *
 * • **Fuso.** Escolha: converter para UTC (sufixo Z), e não emitir TZID com
 *   VTIMEZONE. Motivo: um bloco VTIMEZONE carrega as REGRAS de horário de verão
 *   do fuso, que teriam de ser mantidas à mão aqui dentro e envelheceriam em
 *   silêncio. O Brasil não tem horário de verão desde 2019, então -03:00 é fixo
 *   e a conversão é exata; e UTC é entendido por todo cliente de calendário que
 *   existe. Se o país voltar a ter horário de verão, é ESTE ponto que precisa
 *   mudar (o deslocamento deixa de ser constante), e não a formatação.
 */
export type EntradaEvento = {
  titulo: string;
  descricao: string;
  local: string;
  /** "AAAA-MM-DDTHH:mm" no horário de parede da clínica. */
  inicioIso: string;
  duracaoMinutos: number;
  agora: Date;
  /**
   * Semente estável do UID — na prática, o id da candidatura.
   *
   * Não estava no desenho original e precisou entrar: sem ele a função não tem
   * como derivar "o id da candidatura mais o início", que é o que garante que
   * reemitir o mesmo convite atualize o compromisso em vez de duplicá-lo.
   * Quando vem vazio, cai num resumo determinístico do título + início — pior,
   * porque muda se alguém corrigir o título, mas ainda assim nunca aleatório.
   */
  id?: string;
};

function tamanhoUtf8(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp < 0x80) return 1;
  if (cp < 0x800) return 2;
  if (cp < 0x10000) return 3;
  return 4;
}

/** Dobra em 75 octetos, contando por ponto de código para nunca partir um caractere. */
function dobrar(linha: string): string {
  const LIMITE = 75;
  const pedacos: string[] = [];
  let atual = "";
  // Começa em 0 na primeira linha; nas continuações, o espaço inicial já ocupa
  // um octeto do orçamento.
  let octetos = 0;

  for (const ch of linha) {
    const n = tamanhoUtf8(ch);
    if (octetos + n > LIMITE) {
      pedacos.push(atual);
      atual = "";
      octetos = 1;
    }
    atual += ch;
    octetos += n;
  }
  pedacos.push(atual);
  return pedacos.join("\r\n ");
}

/** A barra invertida vem primeiro, senão as escapadas seguintes são escapadas de novo. */
function escapar(valor: string): string {
  return valor
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** "AAAAMMDDTHHMMSSZ" a partir de um horário de parede da clínica. */
function paraUtcCompacto(momento: Momento): string {
  const ms = Date.UTC(momento.ano, momento.mes - 1, momento.dia, momento.hora, momento.minuto);
  return instanteCompacto(new Date(ms - FUSO_BRASIL_MINUTOS * 60_000));
}

function instanteCompacto(data: Date): string {
  return (
    `${data.getUTCFullYear()}${dois(data.getUTCMonth() + 1)}${dois(data.getUTCDate())}` +
    `T${dois(data.getUTCHours())}${dois(data.getUTCMinutes())}${dois(data.getUTCSeconds())}Z`
  );
}

/**
 * FNV-1a de 32 bits, em hexadecimal. Não é criptografia — é só um resumo curto
 * e DETERMINÍSTICO para o UID de quem não tem id, que é o que importa aqui.
 */
function resumo(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function eventoIcs(entrada: EntradaEvento): string {
  const inicio = lerMomento(entrada.inicioIso);
  if (inicio === null) return "";

  const minutos = Number.isFinite(entrada.duracaoMinutos)
    ? Math.max(5, Math.round(entrada.duracaoMinutos))
    : 60;

  const dtStart = paraUtcCompacto(inicio);
  const fimMs =
    Date.UTC(inicio.ano, inicio.mes - 1, inicio.dia, inicio.hora, inicio.minuto) +
    minutos * 60_000 -
    FUSO_BRASIL_MINUTOS * 60_000;
  const dtEnd = instanteCompacto(new Date(fimMs));
  const dtStamp = Number.isNaN(entrada.agora.getTime()) ? dtStart : instanteCompacto(entrada.agora);

  const semente = (entrada.id ?? "").trim();
  const uid =
    semente === ""
      ? `jp-${resumo(`${entrada.titulo}|${entrada.inicioIso}`)}-${dtStart}@jpclinicaodontologica.com.br`
      : `jp-${semente}-${dtStart}@jpclinicaodontologica.com.br`;

  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JP Clinica Integrada Odontologica//Portal de RH//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapar(entrada.titulo)}`,
    `DESCRIPTION:${escapar(entrada.descricao)}`,
    `LOCATION:${escapar(entrada.local)}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    // Lembrete uma hora antes: a entrevista some no meio da agenda de
    // atendimento da clínica, e quem entrevista é quem está na cadeira.
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT60M",
    `DESCRIPTION:${escapar(entrada.titulo)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // O arquivo termina com CRLF: o RFC trata a última linha como linha completa,
  // e sem isso alguns clientes descartam o END:VCALENDAR.
  return `${linhas.map(dobrar).join("\r\n")}\r\n`;
}

/** "Maria da Silva" -> "maria-da-silva". Só o que sobrevive a um sistema de arquivos. */
function pedaco(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function nomeArquivoIcs(item: Candidatura): string {
  const nome = pedaco(item.nome).slice(0, 40);
  const marcada = entrevistaMarcada(item);
  const data = marcada?.data ?? "";
  // Nome, e não protocolo: o arquivo cai na pasta de Downloads junto com outros
  // vinte, e é pelo nome da pessoa que o RH acha o convite certo.
  return (
    ["entrevista", nome === "" ? "candidata" : nome, data].filter((p) => p !== "").join("-") +
    ".ics"
  );
}

/* -------------------------------------------------------------------------- */
/* Registro no histórico                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A linha que entra nas anotações da candidata quando o RH usa uma ação de
 * envio: "Convite de entrevista enviado por WhatsApp em 06/09/2026 às 14:30 —
 * por Ana Beatriz".
 *
 * Existe aqui, e não na tela, porque é o texto do REGISTRO: ele precisa sair
 * igual venha de onde vier, e é ele que o painel lê meses depois para saber se
 * alguém chegou a falar com aquela pessoa. Antes disso, o histórico dependia de
 * alguém lembrar de digitar — e ninguém lembra no meio de um dia de clínica.
 */
export function linhaDeRegistro(entrada: {
  acao: string;
  canal: string;
  remetente: string;
  quando: Date;
}): string {
  const p = momentoLocal(entrada.quando);
  const carimbo =
    p === null
      ? ""
      : ` em ${dois(p.dia)}/${dois(p.mes)}/${p.ano} às ${dois(p.hora)}:${dois(p.minuto)}`;
  const canal = entrada.canal.trim() === "" ? "" : ` por ${entrada.canal.trim()}`;
  const quem = entrada.remetente.trim() === "" ? "" : ` — por ${entrada.remetente.trim()}`;
  return `${entrada.acao}${canal}${carimbo}${quem}`;
}
