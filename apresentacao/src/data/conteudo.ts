/**
 * Todo o texto da peça, num lugar só.
 *
 * Item 44 do briefing. O motivo prático: revisar uma apresentação é reler o
 * texto, e com o texto espalhado por 28 componentes a revisão vira caça ao
 * ponto-e-vírgula. Aqui dá para ler a peça inteira de cima a baixo sem abrir
 * nenhum `.tsx`.
 *
 * A REGRA DE LINGUAGEM
 * Quem assiste é dono de clínica, dentista, recepção, CRC — não gente de
 * tecnologia. Então nada de `appointment.missed`, "webhook", "score", "opt-out",
 * "job", "deduplicação" ou "evento". Cada uma dessas palavras foi trocada pela
 * frase que a explica: "não veio na consulta", "mudou lá, chega aqui na hora",
 * "nota de prioridade", "quem pediu para parar".
 *
 * Onde o termo do produto precisa aparecer (porque é o nome do botão que a
 * pessoa vai clicar depois), ele vem com a explicação do lado — nunca sozinho.
 */

export const MARCA = {
  produto: "JP CRC",
  produtoLongo: "JP CRC / Revenue OS",
  clinica: "JP Clínica Odontológica",
  assinatura: "Ver seu sorriso é nossa missão.",
} as const;

/* -------------------------------------------------------------------------- */
/* O raciocínio do sistema — o fio que atravessa o filme                      */
/* -------------------------------------------------------------------------- */

/**
 * O "por quê" de cada decisão, para o rodapé das cenas em que o sistema decide
 * alguma coisa (componente `Raciocinio`).
 *
 * Existe porque inteligência não se afirma, se demonstra. Um filme que repete
 * "o sistema é inteligente" convence menos que um que, seis vezes ao longo da
 * peça, mostra o critério usado. Cada linha aqui responde a mesma pergunta —
 * *por que ele fez isso, e não outra coisa* — na altura da cena em que a dúvida
 * nasce.
 *
 * Todas em linguagem de recepção, não de tecnologia, e todas curtas: o rodapé
 * tem uma linha e meia antes de encostar na área da legenda.
 */
export const RACIOCINIO = {
  eventos:
    "Ninguém digitou nada disso. O sistema leu a agenda e o histórico e percebeu sozinho.",
  divisao:
    "O critério é o risco de errar. O que dá para errar sozinho fica com uma pessoa.",
  reativacao:
    "Ele espalha os contatos ao longo do mês. Falar com todo mundo no mesmo dia queima a base.",
  ia: "Ela lê a frase inteira, não uma palavra. “Sim” de quem quer marcar é diferente de “sim, mas mês que vem”.",
  intencoes:
    "Toda leitura vem com uma ação junto. Entender sem saber o que fazer depois não resolve nada.",
  lembretes:
    "Quem não responde o lembrete recebe mais um — uma vez só, e mais perto do horário.",
} as const;

/* -------------------------------------------------------------------------- */
/* 01 — Abertura                                                              */
/* -------------------------------------------------------------------------- */

export const ABERTURA = {
  titulo: "JP CRC",
  subtitulo: "O sistema que cuida do relacionamento com os pacientes da JP.",
  pilares: [
    "Organização",
    "Automação",
    "Inteligência artificial",
    "WhatsApp",
    "Agenda",
    "Resultado",
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* 02 — O problema                                                            */
/* -------------------------------------------------------------------------- */

export const PROBLEMA = {
  sinais: [
    "Faltou na consulta",
    "Desmarcou",
    "Não volta há um ano",
    "Pediu informação e ninguém respondeu",
    "Paciente antigo esquecido",
    "Retorno prometido e esquecido",
  ],
  ondeMora: ["Planilha", "WhatsApp", "Agenda", "Memória da equipe"],
  frase: "A clínica tem milhares de chances de trazer gente de volta.",
  fraseDois: "O difícil é saber quem precisa de atenção, quando e por quê.",
} as const;

/* -------------------------------------------------------------------------- */
/* 03 — Dental Office                                                         */
/* -------------------------------------------------------------------------- */

export const DENTAL_OFFICE = {
  titulo: "Tudo começa com o que a clínica já registra.",
  entidades: [
    "Pacientes",
    "Consultas marcadas",
    "Dentistas",
    "Quem veio e quem faltou",
    "Horários livres",
  ],
  nota: "O Dental Office continua sendo o sistema da clínica. O JP CRC só lê o que está lá — não muda e não substitui nada.",
} as const;

/* -------------------------------------------------------------------------- */
/* 04 — A ponte entre os sistemas                                             */
/* -------------------------------------------------------------------------- */

export const INTEGRACAO = {
  titulo: "Os dados chegam organizados e prontos para usar.",
  etapas: [
    { nome: "Buscar", detalhe: "Puxa a agenda e a lista de pacientes." },
    { nome: "Avisar na hora", detalhe: "Mudou algo lá, chega aqui na mesma hora." },
    { nome: "Conferir todo dia", detalhe: "Uma varredura diária procura quem sumiu." },
    { nome: "Tentar de novo", detalhe: "Se a conexão cai, ele tenta sozinho outra vez." },
    { nome: "Sem repetido", detalhe: "O mesmo paciente nunca vira dois cadastros." },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* 05 — O núcleo                                                              */
/* -------------------------------------------------------------------------- */

export const NUCLEO = {
  titulo: "Aqui o dado deixa de ser um registro.",
  subtitulo: "Ele vira alguém para chamar.",
  modulos: [
    { nome: "Pacientes", detalhe: "Todo mundo num lugar só" },
    { nome: "Funil", detalhe: "Em que ponto cada um está" },
    { nome: "Quem chamar", detalhe: "A lista do que fazer hoje" },
    { nome: "Tarefas", detalhe: "O que é da equipe" },
    { nome: "Conversas", detalhe: "O WhatsApp de cada paciente" },
    { nome: "Automações", detalhe: "As rotinas que rodam sozinhas" },
    { nome: "Inteligência artificial", detalhe: "Lê as respostas" },
    { nome: "Relatórios", detalhe: "O que deu certo" },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* 06 — O que o sistema percebe                                               */
/* -------------------------------------------------------------------------- */

export const EVENTOS = {
  titulo: "O sistema fica de olho na operação o tempo todo.",
  cartoes: [
    { rotulo: "Faltou", quando: "não veio na consulta de ontem" },
    { rotulo: "Desmarcou", quando: "cancelou e não remarcou" },
    { rotulo: "Passou da hora de voltar", quando: "o retorno venceu" },
    { rotulo: "Sumiu", quando: "não aparece há muitos meses" },
    { rotulo: "Aniversário", quando: "faz aniversário hoje" },
    { rotulo: "Parou no meio", quando: "abandonou o tratamento" },
    { rotulo: "Pediu informação", quando: "chegou agora e quer saber mais" },
    { rotulo: "Orçamento parado", quando: "recebeu o orçamento e não respondeu" },
    { rotulo: "Consulta a confirmar", quando: "tem consulta amanhã e não confirmou" },
    { rotulo: "Parcela vencida", quando: "passou a data e não pagou" },
  ],
  carimbo: "O sistema percebeu",
} as const;

/* -------------------------------------------------------------------------- */
/* 07 — As regras de contato                                                  */
/* -------------------------------------------------------------------------- */

export const ELEGIBILIDADE = {
  titulo: "Perceber não é o mesmo que mandar mensagem.",
  paciente: { nome: "Maria Souza", situacao: "Faltou ontem — 14:30, Ortodontia" },
  checagens: [
    "Tem telefone válido",
    "Não tem outra consulta já marcada",
    "Nunca pediu para parar de receber",
    "Não recebeu outra mensagem hoje",
    "Está dentro do horário de atendimento",
  ],
  veredicto: "Pode falar com ela",
  nota: "Se qualquer uma dessas respostas fosse não, a mensagem simplesmente não sairia.",
} as const;

/* -------------------------------------------------------------------------- */
/* 08 — Quem vem primeiro                                                     */
/* -------------------------------------------------------------------------- */

export const PRIORIDADE = {
  titulo: "Quem vem primeiro?",
  fatoresTitulo: "Por que a Maria está no topo",
  criterios: [
    "Faz quanto tempo",
    "O que a pessoa disse",
    "Se respondeu há pouco",
    "Se já tem consulta marcada",
    "Valor do tratamento parado",
  ],
  nota: "A nota aparece junto com o motivo. Ninguém precisa confiar no número às cegas.",
} as const;

/* -------------------------------------------------------------------------- */
/* 09 — Humano e automação                                                    */
/* -------------------------------------------------------------------------- */

export const DIVISAO = {
  titulo: "O sistema faz sozinho o que é seguro fazer sozinho.",
  subtitulo: "O resto continua sendo com a equipe.",
  automacao: {
    titulo: "Automação",
    itens: [
      "Faltou e ainda não respondeu",
      "Está na hora do retorno de rotina",
      "Confirmar a consulta de amanhã",
      "Lembrar da parcela que venceu",
      "Feliz aniversário",
    ],
  },
  humano: {
    titulo: "A equipe",
    itens: [
      "Está com dor ou com alguma queixa",
      "Quer saber preço ou negociar",
      "Está reclamando de algo",
      "Quer renegociar um pagamento atrasado",
      "Quer falar com a dentista",
    ],
  },
} as const;

/* -------------------------------------------------------------------------- */
/* 10 — As rotinas do dia                                                     */
/* -------------------------------------------------------------------------- */

export const PAINEL_AUTOMACOES = {
  titulo: "As rotinas que rodam todo dia",
  legendaModo:
    "Cada rotina pode só sugerir para a equipe ou agir sozinha. Quem decide isso é a clínica.",
} as const;

/* -------------------------------------------------------------------------- */
/* 11 — Pacientes antigos                                                     */
/* -------------------------------------------------------------------------- */

export const BASE_ANTIGA = {
  titulo: "Os pacientes antigos param de ser esquecidos.",
  subtitulo: "Gente que a clínica já conquistou uma vez.",
  rotuloTotal: "pacientes sem voltar há um bom tempo",
  rotuloElegiveis: "podem receber contato hoje",
} as const;

/* -------------------------------------------------------------------------- */
/* 12 — Contato aos poucos                                                    */
/* -------------------------------------------------------------------------- */

export const REATIVACAO = {
  titulo: "Falar com muita gente sem parecer spam.",
  lotes: [
    { rotulo: "Hoje", quantidade: 250 },
    { rotulo: "Amanhã", quantidade: 250 },
    { rotulo: "Depois", quantidade: 250 },
  ],
  protecoes: [
    "No máximo uma mensagem por pessoa, por dia",
    "Um tempo de descanso entre uma campanha e outra",
    "Quem pede para parar nunca mais recebe",
    "Só em horário comercial",
    "Quem tem mais chance de voltar vem antes",
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* 14 — Tráfego pago: o lead chega                                            */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Orçamentos parados                                                         */
/* -------------------------------------------------------------------------- */

/**
 * O dinheiro que já está dentro de casa.
 *
 * De tudo que o sistema encontra, esta é a fila mais cara: o orçamento foi
 * apresentado, a dentista já gastou a hora da avaliação, o paciente não disse
 * não — apenas não voltou. Diferente de um paciente novo, aqui não há nada a
 * conquistar; há uma conversa a retomar.
 *
 * O tom do texto é deliberadamente o oposto de cobrança. "Ficou alguma dúvida"
 * é uma pergunta; "e aí, fechou?" é uma abordagem de vendedor — e vira bloqueio
 * no WhatsApp.
 */
export const ORCAMENTOS = {
  titulo: "E tem muito orçamento parado esperando resposta.",
  subtitulo: "Já foi apresentado, e a pessoa não disse não.",
  origem: "Tudo isso já está no Dental Office",
  total: {
    valor: "R$ 312.400",
    rotulo: "em orçamentos apresentados e sem resposta",
  },
  pilha: [
    {
      paciente: "Carlos Antunes",
      tratamento: "Prótese sobre implante",
      valor: "R$ 12.300",
      parado: "há 21 dias",
    },
    {
      paciente: "Ana Costa",
      tratamento: "Implante unitário",
      valor: "R$ 4.800",
      parado: "há 34 dias",
    },
    {
      paciente: "João Lima",
      tratamento: "Clareamento e limpeza",
      valor: "R$ 1.150",
      parado: "há 12 dias",
    },
  ],
  comoTrata: {
    titulo: "O que o sistema faz com essa fila",
    itens: [
      "Junta todos num lugar só, do mais alto para o mais baixo",
      "Pergunta se ficou alguma dúvida — não pergunta se vai fechar",
      "Oferece conversar com a equipe ou remarcar a avaliação",
      "Quem responde chega para a equipe com o orçamento já na tela",
      "Quem diz que não quer sai da fila e não é procurado de novo",
    ],
  },
  raciocinio:
    "Orçamento parado quase nunca é “não”. É “depois” — e ninguém voltou para perguntar.",
} as const;

/* -------------------------------------------------------------------------- */
/* Montar uma campanha                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A cena que responde "sim, mas quem faz isso?".
 *
 * A cena anterior mostra campanhas prontas rodando, e a reação natural de quem
 * assiste é imaginar que alguém de fora precisa configurar. Esta mostra os três
 * passos, com o vocabulário da recepção — "quem vai receber", e não "segmento";
 * "o que vai chegar", e não "template".
 *
 * O número da prévia é o coração da tela: ver quantas pessoas entram no filtro
 * ANTES de enviar é o que separa uma campanha de um disparo às cegas.
 */
export const MONTAR_CAMPANHA = {
  titulo: "Montar uma campanha são três passos.",
  subtitulo: "Feito pela própria clínica, sem planilha nenhuma.",
  passos: [
    {
      numero: "1",
      titulo: "Quem vai receber",
      detalhe: "Escolhe o filtro na tela: tempo sem voltar, tipo de tratamento, convênio.",
      exemplo: ["Sem voltar há mais de 12 meses", "Já fez limpeza", "Sem consulta marcada"],
    },
    {
      numero: "2",
      titulo: "O que vai chegar",
      detalhe: "Escreve a mensagem uma vez. O sistema põe o nome certo em cada uma.",
      exemplo: ["“Oi, Ana! Faz um tempo que a gente não te vê por aqui…”"],
    },
    {
      numero: "3",
      titulo: "Quando sai",
      detalhe: "Escolhe o dia, o horário e quantas pessoas por dia — para não sair tudo junto.",
      exemplo: ["A partir de segunda", "Das 9h às 18h", "120 por dia"],
    },
  ],
  previa: {
    rotulo: "pessoas entram nesse filtro",
    valor: 964,
    nota: "O número aparece antes de enviar. Mexeu no filtro, ele muda na hora.",
  },
  botao: "Revisar e agendar",
  raciocinio:
    "Nada sai sem alguém da clínica revisar. O sistema monta a fila; quem aperta o botão é gente.",
} as const;

export const LEAD_PAGO = {
  titulo: "O anúncio traz o contato. O sistema faz o resto.",
  subtitulo: "Quem clica hoje e é respondido amanhã já contratou em outro lugar.",
  cadeia: ["Anúncio", "Clique", "Formulário ou WhatsApp", "JP CRC"],
  /** O que o sistema guarda sobre a origem — é isso que depois vira relatório. */
  origem: [
    { campo: "Campanha", valor: "Implantes · Zona Norte" },
    { campo: "Anúncio", valor: "Vídeo de 15s — antes e depois" },
    { campo: "O que a pessoa buscou", valor: "“implante dentário preço”" },
    { campo: "Chegou", valor: "hoje, 14:32 · pelo celular" },
  ],
  lead: { nome: "João Lima", pedido: "Quero saber sobre implante" },
  resposta: {
    autor: "Automação",
    texto:
      "Oi, João! Aqui é da JP Clínica Odontológica. Vi que você tem interesse em implante. Posso te explicar como funciona a avaliação?",
    hora: "14:32",
  },
  tempo: { valor: 47, rotulo: "segundos até a primeira resposta" },
  nota: "O primeiro a responder costuma ficar com o paciente. Por isso essa resposta não espera alguém abrir o computador.",
} as const;

/* -------------------------------------------------------------------------- */
/* 15 — Tráfego pago: medir e controlar                                       */
/* -------------------------------------------------------------------------- */

export const MIDIA = {
  titulo: "Dá para saber qual anúncio virou paciente na cadeira.",
  subtitulo: "Não “quantos cliques”. Quantas pessoas apareceram.",
  /** O funil do dinheiro: cada etapa com o custo acumulado por pessoa. */
  funil: [
    { etapa: "Investido no mês", valor: "R$ 3.900", detalhe: "duas campanhas" },
    { etapa: "Cliques", valor: "312", detalhe: "R$ 12,50 cada" },
    { etapa: "Viraram contato", valor: "128", detalhe: "R$ 30,47 por contato" },
    { etapa: "Responderam", valor: "74", detalhe: "58% de quem foi chamado" },
    { etapa: "Marcaram avaliação", valor: "41", detalhe: "R$ 95,12 por consulta" },
    { etapa: "Compareceram na clínica", valor: "33", detalhe: "R$ 118,18 por paciente" },
  ],
  comparacao: {
    titulo: "E qual campanha vale a pena",
    linhas: [
      { nome: "Implantes · Zona Norte", pacientes: 24, custo: "R$ 96", boa: true },
      { nome: "Clareamento · Geral", pacientes: 9, custo: "R$ 211", boa: false },
    ],
  },
  controles: {
    titulo: "O que a clínica controla",
    itens: [
      "Quem fala primeiro: a automação ou uma pessoa",
      "Se a automação pode marcar sozinha ou só qualificar",
      "Em que horário o sistema responde",
      "Quantas vezes um contato pode ser procurado",
      "Pausar a campanha que traz clique e não traz paciente",
    ],
  },
} as const;

/* -------------------------------------------------------------------------- */
/* 13 — Campanhas e aniversariantes                                           */
/* -------------------------------------------------------------------------- */

export const CAMPANHAS = {
  titulo: "Falar com um grupo inteiro sem perder o jeito de falar com um.",
  subtitulo: "Campanha aqui não é disparo em massa.",
  tipos: [
    { nome: "Aniversariantes do mês", quando: "todo dia, de manhã", fila: 46 },
    { nome: "Quem sumiu há mais de um ano", quando: "em lotes de 250 por dia", fila: 964 },
    { nome: "Clareamento antes do verão", quando: "por tipo de tratamento", fila: 380 },
    { nome: "Quem parou no meio do tratamento", quando: "uma vez por trimestre", fila: 512 },
  ],
  regra:
    "Toda campanha passa pelas mesmas regras: uma mensagem por pessoa por dia, só em horário comercial, e quem pediu para parar fica de fora.",
  resultado: "Última campanha: 312 enviadas · 58 responderam · 21 marcaram",
  aniversario: {
    autor: "Automação",
    texto:
      "Parabéns, João! A equipe da JP Clínica Odontológica deseja um ótimo dia para você. 🎉",
    hora: "09:00",
    nota: "No aniversário a mensagem não vende nada. Ela só cumprimenta — e é por isso que funciona.",
  },
} as const;

/* -------------------------------------------------------------------------- */
/* 18 — Lembrete e confirmação                                                */
/* -------------------------------------------------------------------------- */

export const LEMBRETES = {
  titulo: "A consulta marcada também precisa ser lembrada.",
  mensagem:
    "Oi, Maria! Passando para lembrar da sua consulta amanhã, quinta, às 16:00, com a Dra. Juliana.",
  opcoes: ["Confirmo", "Preciso remarcar"],
  resposta: "Confirmo",
  fechamento: "Perfeito! Te esperamos amanhã às 16h. 🙂",
  quando: [
    { rotulo: "3 dias antes", detalhe: "O primeiro aviso, com data, hora e dentista." },
    { rotulo: "1 dia antes", detalhe: "O pedido de confirmação — é o que mais reduz falta." },
    { rotulo: "2 horas antes", detalhe: "Só para quem ainda não confirmou." },
  ],
  vaga: {
    titulo: "E quando a pessoa não pode vir?",
    texto:
      "O horário volta para a agenda na hora, e o sistema oferece para quem está esperando uma vaga. A cadeira não fica vazia.",
  },
} as const;

/* -------------------------------------------------------------------------- */
/* 19 — Cobrança de parcela                                                   */
/* -------------------------------------------------------------------------- */

export const COBRANCA = {
  titulo: "Cobrar sem constranger.",
  subtitulo: "A mensagem mais delicada que o sistema manda.",
  mensagens: [
    {
      de: "clinica" as const,
      autor: "Automação",
      texto:
        "Oi, Carlos! Tudo bem? Vi aqui que a parcela de março ficou em aberto. Quer que eu te mande o link para acertar?",
      hora: "10:04",
    },
    { de: "paciente" as const, texto: "Pode mandar", hora: "10:21" },
    {
      de: "clinica" as const,
      autor: "Sistema",
      texto: "Prontinho. Escolha como prefere pagar — o link vale por 3 dias.",
      hora: "10:21",
    },
  ],
  /** O que o próprio sistema consegue emitir e mandar na conversa. */
  formas: [
    { nome: "Pix", detalhe: "código copia e cola, cai na hora" },
    { nome: "Boleto", detalhe: "gerado e enviado no WhatsApp" },
    { nome: "Cartão", detalhe: "link seguro, parcelável" },
  ],
  baixa: "Pagou? O sistema dá baixa sozinho e para de cobrar — ninguém recebe lembrete de dívida que já quitou.",
  regras: [
    { rotulo: "Só depois de três dias", detalhe: "Ninguém é cobrado no dia seguinte ao vencimento." },
    { rotulo: "Uma vez, não toda semana", detalhe: "Se não responder, vira tarefa da equipe — não outra mensagem." },
    { rotulo: "Nunca em cima de quem já pagou", detalhe: "O sistema confere o pagamento antes de escrever." },
    { rotulo: "Renegociar é com gente", detalhe: "Pedido de desconto ou de parcelamento vai direto para a equipe." },
  ],
  resultado: "47 parcelas resolvidas · R$ 86.400 ainda na fila",
} as const;

/* -------------------------------------------------------------------------- */
/* 13 — WhatsApp                                                              */
/* -------------------------------------------------------------------------- */

export const CONVERSA = {
  titulo: "A conversa acontece onde o paciente já está.",
  mensagens: [
    {
      de: "clinica" as const,
      texto:
        "Olá, Maria! Aqui é da JP Clínica Odontológica. Vimos que sua consulta de ontem não aconteceu — quer que eu veja um novo horário para você?",
      hora: "09:12",
    },
    { de: "paciente" as const, texto: "Oi! Quero marcar sim", hora: "09:31" },
  ],
  nota: "A tela de celular aqui é uma ilustração feita para o vídeo, não uma cópia do aplicativo.",
} as const;

/* -------------------------------------------------------------------------- */
/* 14 — A leitura da resposta                                                 */
/* -------------------------------------------------------------------------- */

export const IA = {
  titulo: "A inteligência artificial não serve para escrever bonito.",
  subtitulo: "Ela serve para entender o que a pessoa quis dizer.",
  entrada: "Quero marcar sim",
  saida: [
    { campo: "O que ela quer", valor: "Marcar consulta" },
    { campo: "Interesse", valor: "Alto" },
    { campo: "Certeza da leitura", valor: "97%" },
    { campo: "O que fazer agora", valor: "Mostrar horários" },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* 15 — Outras respostas                                                      */
/* -------------------------------------------------------------------------- */

export const INTENCOES = {
  titulo: "E quando a resposta não é essa?",
  casos: [
    { fala: "Me chama mês que vem", saida: "Quer que chamem depois", acao: "Volta na data pedida" },
    { fala: "Quanto custa?", saida: "Quer saber preço", acao: "Vai para a equipe" },
    { fala: "Quero falar com a doutora", saida: "Dúvida sobre o tratamento", acao: "Vai para a equipe" },
    { fala: "Não quero receber mensagens", saida: "Pediu para parar", acao: "Nunca mais recebe" },
    { fala: "Estou com dor", saida: "Queixa de dor", acao: "Vai para a equipe, na frente" },
    { fala: "Vou acertar semana que vem", saida: "Falou do pagamento", acao: "Volta na data combinada" },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* 16 — Marcando a consulta                                                   */
/* -------------------------------------------------------------------------- */

export const AGENDAMENTO = {
  titulo: "Do “quero marcar” até a consulta na agenda.",
  oferta: "Tenho estes horários para quinta-feira. Qual prefere?",
  horarios: ["09:00", "14:30", "16:00"],
  escolha: "16h",
  revalidando: "Conferindo se o horário ainda está livre…",
  confirmado: "16:00 continua livre",
  criado: "Consulta marcada",
  nota: "Se alguém na recepção pegar esse horário nesse meio-tempo, o sistema oferece outro em vez de marcar em cima.",
} as const;

/* -------------------------------------------------------------------------- */
/* 17 — Quando a equipe entra                                                 */
/* -------------------------------------------------------------------------- */

export const HUMANO = {
  titulo: "Quando o caso é delicado, a automação para.",
  paciente: "Ana Costa",
  fala: "Estou com dor e queria falar sobre um tratamento.",
  classificacao: "Queixa de dor · precisa de gente",
  destino: "Equipe · dentista responsável",
  nota: "A automação não some da conversa: ela entrega o histórico pronto para a equipe e sai.",
} as const;

/* -------------------------------------------------------------------------- */
/* 18 — A tela do dia                                                         */
/* -------------------------------------------------------------------------- */

export const HOME = {
  saudacao: "Boa tarde, Raphaela.",
  linhaUm: "pacientes precisam de você hoje.",
  linhaDois: "já estão sendo cuidados automaticamente.",
  cartoes: [
    { rotulo: "Consultas recuperadas", valor: 128, detalhe: "nos últimos 30 dias" },
    { rotulo: "Pacientes que voltaram", valor: 193, detalhe: "da base antiga" },
    { rotulo: "Conversas esperando", valor: 7, detalhe: "resposta da equipe" },
    { rotulo: "Parcelas em atraso", valor: 31, detalhe: "sendo cobradas com jeito" },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* 19 — As conversas                                                          */
/* -------------------------------------------------------------------------- */

export const INBOX = {
  titulo: "A equipe recebe o histórico pronto, do lado da conversa.",
  contexto: [
    { rotulo: "Última consulta", valor: "12/03 · Ortodontia" },
    { rotulo: "Próxima consulta", valor: "nenhuma marcada" },
    { rotulo: "Por que ela está aqui", valor: "Faltou · prioridade 92" },
    { rotulo: "Resumo automático", valor: "Quer remarcar. Prefere fim de tarde." },
    { rotulo: "O que fazer agora", valor: "Mostrar horários" },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* 20 — A ficha do paciente                                                   */
/* -------------------------------------------------------------------------- */

export const PACIENTE_360 = {
  titulo: "Tudo o que a equipe precisa saber, numa página só.",
  abas: ["Resumo", "O que está em aberto", "Histórico", "Conversas", "Agenda", "Tarefas"],
  timeline: [
    { quando: "hoje, 09:31", o_que: "Respondeu no WhatsApp", quem: "Paciente" },
    { quando: "hoje, 09:12", o_que: "Recebeu a mensagem de retorno", quem: "Automação" },
    { quando: "ontem, 15:02", o_que: "Faltou na consulta", quem: "Dental Office" },
    { quando: "12/03", o_que: "Veio na consulta · Ortodontia", quem: "Dental Office" },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* 21–25 — Resultado                                                          */
/* -------------------------------------------------------------------------- */

export const RESULTADOS_TEXTO = {
  titulo: "O que se acumula quando nada é esquecido.",
} as const;

export const FUNIL_TEXTO = {
  titulo: "De quem podia ser chamado até quem começou o tratamento.",
  nota: "Cada etapa é contada de verdade — nenhuma é estimativa.",
} as const;

export const ANTES_DEPOIS = {
  titulo: "Menos trabalho manual. Mais constância.",
  antes: ["Planilhas", "Procurar na mão", "Esquecimento", "Retorno sem regularidade"],
  depois: [
    "Lista pronta do dia",
    "Rotinas com regra clara",
    "Leitura automática das respostas",
    "Histórico e números",
  ],
} as const;

export const IMPACTO = {
  titulo: "O caminho, não a promessa.",
  cadeia: [
    "Base de pacientes",
    "Mais contato",
    "Mais respostas",
    "Mais consultas marcadas",
    "Mais gente comparecendo",
    "Mais tratamentos",
    "Mais receita",
  ],
  aviso:
    "A peça mostra como funciona e o valor que está parado na fila. Nenhum aumento de receita é prometido aqui.",
} as const;

export const GESTOR_TEXTO = {
  titulo: "O que a gestão passa a enxergar",
  notaValor:
    "É o valor dos tratamentos parados na fila — não dinheiro que já entrou no caixa.",
} as const;

/* -------------------------------------------------------------------------- */
/* 26–28 — Fechamento                                                         */
/* -------------------------------------------------------------------------- */

export const ECOSSISTEMA = {
  titulo: "Tudo junto, do começo ao fim",
  cadeia: [
    "Dental Office",
    "A ponte entre os sistemas",
    "JP CRC",
    "Rotinas + inteligência artificial",
    "WhatsApp",
    "Paciente",
    "Consulta marcada",
    "Resultado",
  ],
} as const;

export const FRASE = {
  linhas: [
    "O Dental Office guarda a operação.",
    "O JP CRC transforma os dados em ação.",
    "E ação em resultado.",
  ],
} as const;

export const FINAL = {
  titulo: "JP CRC",
  subtitulo: [
    "Mais relacionamento.",
    "Mais organização.",
    "Mais pacientes de volta.",
    "Menos oportunidade esquecida.",
  ],
  assinatura: "JP Clínica Odontológica",
} as const;

/* -------------------------------------------------------------------------- */
/* Tela inicial e modo explorar                                               */
/* -------------------------------------------------------------------------- */

export const CAPA = {
  chamada: "Conheça o JP CRC",
  subtitulo:
    "Sua base de pacientes não deveria ficar parada. Em cinco minutos, com narração, você entende como os dados da clínica viram conversa, agenda e resultado.",
  assistir: "Assistir com narração",
  semSom: "Assistir sem som",
  explorar: "Explorar",
  duracao: "≈ 4 min",
} as const;
