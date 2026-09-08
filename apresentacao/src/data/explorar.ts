import type { ChaveMarca } from "./marcas";
import type { IdCena } from "./linhaDoTempo";

/**
 * O conteúdo do modo Explorar.
 *
 * Itens 17, 18, 52 e 53. A diferença entre este modo e o filme é o controle: no
 * filme a peça decide a ordem; aqui quem decide é quem está olhando.
 *
 * Mesma regra de linguagem do resto: nada de "evento", "webhook", "opt-out" ou
 * nome de código. Quem abre esta tela é o mesmo público do vídeo.
 */

/* -------------------------------------------------------------------------- */
/* Dicas dos nós                                                              */
/* -------------------------------------------------------------------------- */

export type DicaNo = {
  chave: string;
  titulo: string;
  texto: string;
  marca?: ChaveMarca;
  /** Para onde o "ver no vídeo" leva. */
  cena: IdCena;
};

export const DICAS: readonly DicaNo[] = [
  {
    chave: "dentalOffice",
    titulo: "Dental Office",
    texto:
      "É o sistema que a clínica já usa. Dele vêm os pacientes, a agenda, quem veio, quem faltou e quais horários estão livres. O JP CRC só lê — e devolve a consulta quando ela é marcada.",
    marca: "dentalOffice",
    cena: "dentalOffice",
  },
  {
    chave: "n8n",
    titulo: "A ponte entre os sistemas",
    texto:
      "Mantém os dois lados sempre iguais: busca a agenda, recebe avisos quando algo muda e tenta de novo sozinha se a conexão cair.",
    marca: "n8n",
    cena: "integracao",
  },
  {
    chave: "jp",
    titulo: "JP CRC",
    texto:
      "O cérebro da operação. É aqui que um dado (“faltou ontem”) vira alguém para chamar, com prioridade e com o motivo à vista.",
    marca: "jp",
    cena: "nucleo",
  },
  {
    chave: "ia",
    titulo: "Rotinas + inteligência artificial",
    texto:
      "As rotinas decidem quando falar. A inteligência artificial lê a resposta do paciente e diz o que fazer em seguida — sempre dentro do que a clínica autorizou.",
    marca: "ia",
    cena: "ia",
  },
  {
    chave: "whatsapp",
    titulo: "WhatsApp",
    texto:
      "O canal onde a conversa acontece. Dá para ver se a mensagem foi entregue, se foi lida e o que a pessoa respondeu.",
    marca: "whatsapp",
    cena: "whatsapp",
  },
  {
    chave: "paciente",
    titulo: "Paciente",
    texto:
      "Quem responde, escolhe o horário e aparece. Todo o resto existe para chegar até aqui na hora certa, sem incomodar.",
    cena: "agendamento",
  },
  {
    chave: "agendamento",
    titulo: "Consulta marcada",
    texto:
      "O horário é conferido de novo antes de fechar. Se alguém pegou a vaga nesse meio-tempo, o sistema oferece outra em vez de marcar em cima.",
    cena: "agendamento",
  },
  {
    chave: "resultado",
    titulo: "Resultados",
    texto:
      "Consultas recuperadas, pacientes que voltaram, parcelas em atraso resolvidas e quanto ainda está parado na fila. Tudo contado, nada estimado.",
    cena: "gestor",
  },
];

export function dicaPor(chave: string): DicaNo | undefined {
  return DICAS.find((d) => d.chave === chave);
}

/* -------------------------------------------------------------------------- */
/* Mini fluxos                                                                */
/* -------------------------------------------------------------------------- */

export type PassoFluxo = { rotulo: string; detalhe: string };

export type MiniFluxo = {
  chave: string;
  titulo: string;
  resumo: string;
  acento: "jp" | "whatsapp" | "n8n" | "ia" | "dentalOffice";
  passos: readonly PassoFluxo[];
  cena: IdCena;
};

export const FLUXOS: readonly MiniFluxo[] = [
  {
    chave: "faltantes",
    titulo: "Quem faltou na consulta",
    resumo: "A janela mais curta e mais valiosa: quem faltou ontem ainda está no assunto.",
    acento: "jp",
    cena: "elegibilidade",
    passos: [
      { rotulo: "Faltou", detalhe: "A consulta de ontem fica marcada como não realizada." },
      { rotulo: "O sistema percebe", detalhe: "Sem ninguém precisar olhar a agenda." },
      { rotulo: "Confere as regras", detalhe: "Tem telefone, não tem outra consulta, não pediu para parar." },
      { rotulo: "Manda mensagem", detalhe: "No WhatsApp, em horário comercial." },
      { rotulo: "Lê a resposta", detalhe: "Entende se a pessoa quer remarcar ou não." },
      { rotulo: "Mostra horários", detalhe: "Só os que existem de verdade na agenda." },
      { rotulo: "Consulta remarcada", detalhe: "Criada nos dois sistemas, sem digitar duas vezes." },
    ],
  },
  {
    chave: "recall",
    titulo: "Está na hora de voltar",
    resumo: "O retorno de rotina que ninguém lembra de cobrar.",
    acento: "dentalOffice",
    cena: "eventos",
    passos: [
      { rotulo: "Seis meses sem aparecer", detalhe: "Uma varredura diária olha a base inteira." },
      { rotulo: "Já remarcou?", detalhe: "Quem já tem consulta marcada sai da fila na hora." },
      { rotulo: "Contato", detalhe: "Uma mensagem por pessoa, por dia. Nunca mais que isso." },
      { rotulo: "Resposta", detalhe: "Quer voltar, quer depois, ou não quer mais receber." },
      { rotulo: "Agenda", detalhe: "Quem quer, marca ali mesmo na conversa." },
    ],
  },
  {
    chave: "base-antiga",
    titulo: "Pacientes antigos",
    resumo: "Gente que a clínica já conquistou uma vez — e parou de falar com ela.",
    acento: "whatsapp",
    cena: "baseAntiga",
    passos: [
      { rotulo: "A base inteira", detalhe: "Todo mundo que não aparece há muito tempo." },
      { rotulo: "Separação", detalhe: "Por quanto tempo faz, especialidade e situação do tratamento." },
      { rotulo: "Aos poucos", detalhe: "250 por dia, com descanso entre uma campanha e outra." },
      { rotulo: "WhatsApp", detalhe: "Só em horário comercial, respeitando quem pediu para parar." },
      { rotulo: "Leitura das respostas", detalhe: "Separa quem quer voltar de quem quer sossego." },
      { rotulo: "De volta à agenda", detalhe: "Quem quer, volta a ser paciente." },
    ],
  },
  {
    chave: "cobranca",
    titulo: "Parcela em atraso",
    resumo: "Cobrar sem constranger — e sem depender de alguém lembrar da data.",
    acento: "n8n",
    cena: "eventos",
    passos: [
      { rotulo: "A parcela venceu", detalhe: "O sistema vê a data passar sem o pagamento." },
      { rotulo: "Três dias de espera", detalhe: "Ninguém é cobrado no dia seguinte ao vencimento." },
      { rotulo: "Lembrete gentil", detalhe: "Uma mensagem discreta, sem tom de cobrança dura." },
      { rotulo: "Se responder", detalhe: "“Vou acertar semana que vem” vira um retorno agendado." },
      { rotulo: "Se pedir prazo", detalhe: "Renegociação é conversa humana: vai para a equipe." },
      { rotulo: "Resolvido", detalhe: "O pagamento entra e o paciente segue o tratamento." },
    ],
  },
  {
    chave: "leads",
    titulo: "Quem pediu informação agora",
    resumo: "O contato que chegou há minutos e ainda está com o celular na mão.",
    acento: "ia",
    cena: "prioridade",
    passos: [
      { rotulo: "Chegou um contato", detalhe: "Formulário, campanha ou indicação." },
      { rotulo: "Vai para a frente da fila", detalhe: "É o caso com maior chance de virar consulta." },
      { rotulo: "Primeiro contato", detalhe: "Automático quando é seguro, humano quando não é." },
      { rotulo: "Leitura do interesse", detalhe: "O sistema marca se a pessoa está quente ou fria." },
      { rotulo: "Avaliação marcada", detalhe: "A etapa muda sozinha quando a consulta é criada." },
    ],
  },
  {
    chave: "escalonamento",
    titulo: "Quando a equipe entra",
    resumo: "A regra que decide o que a automação NÃO faz.",
    acento: "jp",
    cena: "humano",
    passos: [
      { rotulo: "Dor ou queixa", detalhe: "Sintoma é sempre com gente. A rotina para na hora." },
      { rotulo: "Preço e negociação", detalhe: "Inclusive renegociar uma parcela atrasada." },
      { rotulo: "Reclamação", detalhe: "Vai direto para uma pessoa, sem resposta pronta." },
      { rotulo: "Dúvida do próprio sistema", detalhe: "Se ele não tem certeza do que a pessoa quis dizer, não age." },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Camadas do mapa                                                            */
/* -------------------------------------------------------------------------- */

export type Camada = { chave: string; nome: string; descricao: string };

export const CAMADAS: readonly Camada[] = [
  {
    chave: "fonte",
    nome: "De onde vem",
    descricao: "Dental Office — a operação da clínica como ela já é hoje.",
  },
  {
    chave: "integracao",
    nome: "A ponte",
    descricao: "Mantém os dois lados atualizados, sem ninguém digitar nada duas vezes.",
  },
  {
    chave: "nucleo",
    nome: "O cérebro",
    descricao: "JP CRC: quem precisa de contato, por quê, e o que já foi feito.",
  },
  {
    chave: "acao",
    nome: "A decisão",
    descricao: "Rotinas e inteligência artificial escolhem o que fazer, dentro das regras.",
  },
  {
    chave: "canal",
    nome: "A conversa",
    descricao: "WhatsApp: a mensagem chega, a pessoa lê e responde.",
  },
  {
    chave: "resultado",
    nome: "O resultado",
    descricao: "Consulta marcada, paciente que apareceu e o que a gestão consegue medir.",
  },
];
