/**
 * Todo o texto da peça, num lugar só.
 *
 * Item 44 do briefing. O motivo prático: revisar uma apresentação é reler o
 * texto, e com o texto espalhado por 28 componentes a revisão vira caça ao
 * ponto-e-vírgula. Aqui dá para ler a peça inteira de cima a baixo sem abrir
 * nenhum `.tsx`.
 *
 * O vocabulário NÃO é inventado: "Faltou", "Retorno", "Paciente inativo",
 * "Orçamento parado", "Quer agendar", "Oferecer horários" são os mesmos rótulos
 * de `src/lib/crc/dominio/rotulos.ts` no sistema real. Um vídeo que chama as
 * coisas por outro nome ensina o time errado.
 */

export const MARCA = {
  produto: "JP CRC",
  produtoLongo: "JP CRC / Revenue OS",
  clinica: "JP Clínica Odontológica",
  assinatura: "Ver seu sorriso é nossa missão.",
} as const;

/* -------------------------------------------------------------------------- */
/* 01 — Abertura                                                              */
/* -------------------------------------------------------------------------- */

export const ABERTURA = {
  titulo: "JP CRC",
  subtitulo:
    "O novo cérebro de relacionamento e recuperação da JP Clínica Odontológica.",
  pilares: ["CRM", "Automação", "IA", "WhatsApp", "Agendamento", "Receita"],
} as const;

/* -------------------------------------------------------------------------- */
/* 02 — O problema                                                            */
/* -------------------------------------------------------------------------- */

export const PROBLEMA = {
  sinais: [
    "Paciente faltou",
    "Paciente cancelou",
    "Não volta há 1 ano",
    "Lead sem resposta",
    "Paciente antigo esquecido",
    "Follow-up atrasado",
  ],
  ondeMora: ["Planilha", "WhatsApp", "Agenda", "Memória da equipe"],
  frase: "A clínica tem milhares de oportunidades.",
  fraseDois: "O difícil é saber quem precisa de atenção, quando e por quê.",
} as const;

/* -------------------------------------------------------------------------- */
/* 03 — Dental Office                                                         */
/* -------------------------------------------------------------------------- */

export const DENTAL_OFFICE = {
  titulo: "Tudo começa com os dados da operação.",
  entidades: [
    "Pacientes",
    "Agendamentos",
    "Dentistas",
    "Status da consulta",
    "Horários disponíveis",
  ],
  nota: "O Dental Office continua sendo o sistema da clínica. O JP CRC lê dele — não o substitui.",
} as const;

/* -------------------------------------------------------------------------- */
/* 04 — n8n + backend                                                         */
/* -------------------------------------------------------------------------- */

export const INTEGRACAO = {
  titulo: "Sincronizados, organizados e prontos para decisão.",
  etapas: [
    { nome: "Sync", detalhe: "Leitura incremental da agenda e da base" },
    { nome: "Webhooks", detalhe: "Mudou lá, chega aqui" },
    { nome: "Jobs", detalhe: "Varredura diária de retorno e inatividade" },
    { nome: "Retry", detalhe: "Se a integração cai, tenta de novo" },
    { nome: "Deduplicação", detalhe: "O mesmo paciente não vira dois" },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* 05 — O núcleo                                                              */
/* -------------------------------------------------------------------------- */

export const NUCLEO = {
  titulo: "Aqui os dados deixam de ser registro.",
  subtitulo: "Eles viram oportunidade.",
  modulos: [
    { nome: "Pacientes", detalhe: "Base unificada" },
    { nome: "CRM", detalhe: "Funil e etapas" },
    { nome: "Oportunidades", detalhe: "O que precisa de ação" },
    { nome: "Tarefas", detalhe: "Fila da equipe" },
    { nome: "Conversas", detalhe: "Inbox por paciente" },
    { nome: "Automações", detalhe: "Jornadas com regra" },
    { nome: "IA", detalhe: "Intenção e próxima ação" },
    { nome: "Analytics", detalhe: "O que gerou resultado" },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* 06 — Motor de eventos                                                      */
/* -------------------------------------------------------------------------- */

export const EVENTOS = {
  titulo: "O sistema observa a operação o tempo todo.",
  cartoes: [
    { rotulo: "Faltou", evento: "appointment.missed" },
    { rotulo: "Cancelou", evento: "appointment.cancelled" },
    { rotulo: "Retorno vencido", evento: "patient.recall_due" },
    { rotulo: "Paciente inativo", evento: "patient.inactive_detected" },
    { rotulo: "Aniversário", evento: "patient.birthday" },
    { rotulo: "Tratamento abandonado", evento: "patient.inactive_detected" },
    { rotulo: "Lead novo", evento: "lead.created" },
    { rotulo: "Orçamento parado", evento: "budget.pending" },
    { rotulo: "Consulta a confirmar", evento: "appointment.upcoming" },
  ],
  carimbo: "Evento detectado",
} as const;

/* -------------------------------------------------------------------------- */
/* 07 — Motor de regras                                                       */
/* -------------------------------------------------------------------------- */

export const ELEGIBILIDADE = {
  titulo: "Nem todo evento vira mensagem.",
  paciente: { nome: "Maria Souza", situacao: "Faltou ontem — 14:30, Ortodontia" },
  checagens: [
    "Telefone válido",
    "Sem consulta futura marcada",
    "Não pediu para parar de receber",
    "Não está em outra jornada",
    "Dentro do horário permitido",
  ],
  veredicto: "Elegível",
  nota: "As mesmas regras de `avaliarRecall` e `podeContatar` que rodam em produção.",
} as const;

/* -------------------------------------------------------------------------- */
/* 08 — Prioridade                                                            */
/* -------------------------------------------------------------------------- */

export const PRIORIDADE = {
  titulo: "Nem todo paciente precisa da mesma atenção.",
  fatoresTitulo: "Por que a Maria está no topo",
  criterios: [
    "Urgência",
    "Intenção declarada",
    "Tempo parado",
    "Engajamento recente",
    "Valor potencial",
  ],
  nota: "O score é auditável: a tela mostra o número e o que o formou.",
} as const;

/* -------------------------------------------------------------------------- */
/* 09 — Humano × automação                                                    */
/* -------------------------------------------------------------------------- */

export const DIVISAO = {
  titulo: "O sistema trabalha sozinho onde é seguro.",
  subtitulo: "A equipe entra onde realmente agrega valor.",
  automacao: {
    titulo: "Automação",
    itens: [
      "Faltou e não respondeu ainda",
      "Retorno de rotina vencido",
      "Confirmação de consulta",
      "Aniversário",
    ],
  },
  humano: {
    titulo: "CRC",
    itens: [
      "Dor ou queixa clínica",
      "Pergunta de preço e negociação",
      "Reclamação",
      "Pedido para falar com a dentista",
    ],
  },
} as const;

/* -------------------------------------------------------------------------- */
/* 10 — Automações                                                            */
/* -------------------------------------------------------------------------- */

export const PAINEL_AUTOMACOES = {
  titulo: "As jornadas que rodam todo dia",
  legendaModo: "Todas com três modos: simulação, só recomenda, executa.",
} as const;

/* -------------------------------------------------------------------------- */
/* 11 — Base antiga                                                           */
/* -------------------------------------------------------------------------- */

export const BASE_ANTIGA = {
  titulo: "A base antiga deixa de ficar esquecida.",
  subtitulo: "Pacientes que a clínica já conquistou uma vez.",
  rotuloTotal: "pacientes sem retorno recente",
  rotuloElegiveis: "elegíveis para contato hoje",
} as const;

/* -------------------------------------------------------------------------- */
/* 12 — Reativação em escala                                                  */
/* -------------------------------------------------------------------------- */

export const REATIVACAO = {
  titulo: "A escala aumenta sem perder o controle.",
  lotes: [
    { rotulo: "Hoje", quantidade: 250 },
    { rotulo: "Amanhã", quantidade: 250 },
    { rotulo: "Depois", quantidade: 250 },
  ],
  protecoes: [
    "Um contato por paciente por dia",
    "Cooldown entre campanhas",
    "Opt-out respeitado para sempre",
    "Só em horário comercial",
    "Prioridade antes de volume",
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* 13 — WhatsApp                                                              */
/* -------------------------------------------------------------------------- */

export const CONVERSA = {
  titulo: "O relacionamento acontece onde o paciente já está.",
  mensagens: [
    {
      de: "clinica" as const,
      texto:
        "Olá, Maria! Aqui é da JP Clínica Odontológica. Vimos que sua consulta de ontem não aconteceu — quer que eu veja um novo horário para você?",
      hora: "09:12",
    },
    { de: "paciente" as const, texto: "Oi! Quero marcar sim", hora: "09:31" },
  ],
  nota: "Interface do próprio design system. A peça não copia a tela do WhatsApp.",
} as const;

/* -------------------------------------------------------------------------- */
/* 14 — IA                                                                    */
/* -------------------------------------------------------------------------- */

export const IA = {
  titulo: "A IA não escreve mensagem bonita.",
  subtitulo: "Ela entende a intenção e decide a próxima ação permitida.",
  entrada: "Quero marcar sim",
  saida: [
    { campo: "Intenção", valor: "Quer agendar" },
    { campo: "Temperatura", valor: "Quente" },
    { campo: "Confiança", valor: "97%" },
    { campo: "Próxima ação", valor: "Oferecer horários" },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* 15 — Outras intenções                                                      */
/* -------------------------------------------------------------------------- */

export const INTENCOES = {
  titulo: "E quando a resposta não é essa?",
  casos: [
    { fala: "Me chama mês que vem", saida: "Pedido de retorno depois", acao: "Agendar follow-up" },
    { fala: "Quanto custa?", saida: "Perguntou preço", acao: "Regra comercial · humano" },
    { fala: "Quero falar com a doutora", saida: "Dúvida clínica", acao: "Passar para um atendente" },
    { fala: "Não quero receber mensagens", saida: "Descadastro", acao: "Opt-out imediato" },
    { fala: "Estou com dor", saida: "Dúvida clínica", acao: "Humano · prioridade" },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* 16 — Agendamento                                                           */
/* -------------------------------------------------------------------------- */

export const AGENDAMENTO = {
  titulo: "Do interesse ao agendamento, sem troca manual entre sistemas.",
  oferta: "Tenho estes horários para quinta-feira. Qual prefere?",
  horarios: ["09:00", "14:30", "16:00"],
  escolha: "16h",
  revalidando: "Revalidando disponibilidade no Dental Office…",
  confirmado: "16:00 continua livre",
  criado: "Agendamento criado",
  nota: "O horário é revalidado antes de confirmar. Se alguém ocupou nesse meio-tempo, o sistema oferece outro em vez de marcar em cima.",
} as const;

/* -------------------------------------------------------------------------- */
/* 17 — Caso humano                                                           */
/* -------------------------------------------------------------------------- */

export const HUMANO = {
  titulo: "Quando o caso exige julgamento, a automação para.",
  paciente: "Ana Costa",
  fala: "Estou com dor e queria falar sobre um tratamento.",
  classificacao: "Dúvida clínica · atendimento humano",
  destino: "CRC · Dr. responsável",
  nota: "A automação não some da conversa: ela entrega o contexto e sai.",
} as const;

/* -------------------------------------------------------------------------- */
/* 18 — Home operacional                                                      */
/* -------------------------------------------------------------------------- */

export const HOME = {
  saudacao: "Boa tarde, Raphaela.",
  linhaUm: "pacientes precisam da sua atenção.",
  linhaDois: "estão sendo trabalhados automaticamente.",
  cartoes: [
    { rotulo: "Consultas recuperadas", valor: 128, detalhe: "nos últimos 30 dias" },
    { rotulo: "Pacientes reativados", valor: 193, detalhe: "base histórica" },
    { rotulo: "Conversas aguardando", valor: 7, detalhe: "resposta da equipe" },
    { rotulo: "Tarefas abertas", valor: 23, detalhe: "com prazo hoje" },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* 19 — Inbox                                                                 */
/* -------------------------------------------------------------------------- */

export const INBOX = {
  titulo: "A equipe recebe o contexto pronto.",
  contexto: [
    { rotulo: "Última consulta", valor: "12/03 · Ortodontia" },
    { rotulo: "Próxima consulta", valor: "—" },
    { rotulo: "Oportunidade", valor: "Faltou · prioridade 92" },
    { rotulo: "Resumo da IA", valor: "Quer remarcar. Prefere fim de tarde." },
    { rotulo: "Próxima ação", valor: "Oferecer horários" },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* 20 — Paciente 360                                                          */
/* -------------------------------------------------------------------------- */

export const PACIENTE_360 = {
  titulo: "Tudo o que a equipe precisa, num lugar só.",
  abas: ["Resumo da IA", "Oportunidades", "Timeline", "Conversas", "Agenda", "Tarefas"],
  timeline: [
    { quando: "hoje, 09:31", o_que: "Respondeu no WhatsApp", quem: "Paciente" },
    { quando: "hoje, 09:12", o_que: "Mensagem de recuperação enviada", quem: "Automação" },
    { quando: "ontem, 15:02", o_que: "Faltou na consulta", quem: "Dental Office" },
    { quando: "12/03", o_que: "Consulta atendida · Ortodontia", quem: "Dental Office" },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* 21–25 — Resultado                                                          */
/* -------------------------------------------------------------------------- */

export const RESULTADOS_TEXTO = {
  titulo: "O que se acumula quando nada é esquecido.",
} as const;

export const FUNIL_TEXTO = {
  titulo: "Do elegível ao tratamento.",
  nota: "Cada etapa é medida — não estimada.",
} as const;

export const ANTES_DEPOIS = {
  titulo: "Menos esforço operacional. Mais consistência.",
  antes: ["Planilhas", "Busca manual", "Esquecimento", "Follow-up irregular"],
  depois: ["Fila inteligente", "Automação com regra", "IA para triagem", "Histórico e métricas"],
} as const;

export const IMPACTO = {
  titulo: "O caminho, não a promessa.",
  cadeia: [
    "Base de pacientes",
    "Mais contato",
    "Mais respostas",
    "Mais agendamentos",
    "Mais comparecimento",
    "Mais tratamentos",
    "Mais receita",
  ],
  aviso:
    "A peça mostra o mecanismo e o valor potencial na fila. Nenhum percentual de aumento é prometido.",
} as const;

export const GESTOR_TEXTO = {
  titulo: "O que o gestor passa a enxergar",
  notaValor:
    "Valor potencial, e não receita confirmada: o fechamento financeiro depende de integração que ainda não está ligada.",
} as const;

/* -------------------------------------------------------------------------- */
/* 26–28 — Fechamento                                                         */
/* -------------------------------------------------------------------------- */

export const ECOSSISTEMA = {
  titulo: "O ecossistema completo",
  cadeia: [
    "Dental Office",
    "Backend + n8n",
    "JP CRC",
    "Automação + IA",
    "WhatsApp",
    "Paciente",
    "Agendamento",
    "Resultados",
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
    "Mais pacientes recuperados.",
    "Mais oportunidades aproveitadas.",
  ],
  assinatura: "JP Clínica Odontológica",
} as const;

/* -------------------------------------------------------------------------- */
/* Tela inicial e modo explorar                                               */
/* -------------------------------------------------------------------------- */

export const CAPA = {
  chamada: "Conheça o JP CRC",
  subtitulo:
    "Sua base de pacientes não deveria ficar parada. Um tour de quatro minutos por como os dados da clínica viram relacionamento, agenda e resultado.",
  assistir: "Assistir",
  explorar: "Explorar",
  duracao: "≈ 4 min",
} as const;
