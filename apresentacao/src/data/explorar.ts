import type { ChaveMarca } from "./marcas";
import type { IdCena } from "./linhaDoTempo";

/**
 * O conteúdo do modo Explorar.
 *
 * Itens 17, 18, 52 e 53. A diferença entre este modo e o filme é o controle: no
 * filme a peça decide a ordem; aqui quem decide é quem está olhando. O conteúdo
 * é o mesmo — o que muda é quem aperta o botão.
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
      "Fonte dos dados operacionais: pacientes, agendamentos, dentistas, status e horários disponíveis. O JP CRC lê de lá e devolve o agendamento criado.",
    marca: "dentalOffice",
    cena: "dentalOffice",
  },
  {
    chave: "n8n",
    titulo: "n8n",
    texto:
      "Orquestra workflows e integrações auxiliares: webhooks, sincronizações periódicas, retentativa quando a integração cai.",
    marca: "n8n",
    cena: "integracao",
  },
  {
    chave: "jp",
    titulo: "JP CRC",
    texto:
      "Inteligência operacional, CRM e automações. É onde o evento vira oportunidade, a oportunidade vira fila e a fila vira conversa.",
    marca: "jp",
    cena: "nucleo",
  },
  {
    chave: "ia",
    titulo: "IA",
    texto:
      "Classifica intenção, mede temperatura e recomenda a próxima ação permitida. Não decide fora do que a regra autoriza.",
    marca: "ia",
    cena: "ia",
  },
  {
    chave: "whatsapp",
    titulo: "WhatsApp",
    texto:
      "O canal do relacionamento. Entrega, leitura e resposta voltam para a conversa do paciente dentro do CRC.",
    marca: "whatsapp",
    cena: "whatsapp",
  },
  {
    chave: "paciente",
    titulo: "Paciente",
    texto:
      "Quem responde, agenda e comparece. Todo o resto do sistema existe para chegar até aqui na hora certa.",
    cena: "agendamento",
  },
  {
    chave: "equipe",
    titulo: "Equipe / CRC",
    texto:
      "Recebe apenas o que exige julgamento humano — com histórico, oportunidade e próxima ação já do lado.",
    cena: "humano",
  },
  {
    chave: "resultado",
    titulo: "Resultados",
    texto:
      "Consultas recuperadas, pacientes reativados, conversão e valor potencial na fila. Medido, não estimado.",
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
    titulo: "Recuperação de faltantes",
    resumo: "A janela mais curta e mais valiosa: quem faltou ontem ainda está no assunto.",
    acento: "jp",
    cena: "elegibilidade",
    passos: [
      { rotulo: "Faltou", detalhe: "O Dental Office marca a consulta como MISSED." },
      { rotulo: "Detectado", detalhe: "O evento `appointment.missed` entra no motor." },
      { rotulo: "Elegível", detalhe: "Telefone válido, sem consulta futura, sem opt-out." },
      { rotulo: "WhatsApp", detalhe: "Mensagem de recuperação dentro do horário permitido." },
      { rotulo: "Resposta", detalhe: "A IA classifica a intenção e escolhe a ação." },
      { rotulo: "Agenda", detalhe: "Horários reais oferecidos e revalidados." },
      { rotulo: "Recuperado", detalhe: "Consulta criada nos dois sistemas." },
    ],
  },
  {
    chave: "recall",
    titulo: "Retorno (recall)",
    resumo: "O retorno de rotina que ninguém lembra de cobrar.",
    acento: "dentalOffice",
    cena: "eventos",
    passos: [
      { rotulo: "6 meses sem retorno", detalhe: "Varredura diária sobre a base inteira." },
      { rotulo: "Sem consulta futura", detalhe: "Quem já remarcou sai da fila na hora." },
      { rotulo: "Contato", detalhe: "Mensagem de retorno, uma por paciente por dia." },
      { rotulo: "Resposta", detalhe: "Interesse, adiamento ou descadastro." },
      { rotulo: "Agenda", detalhe: "Quem quer, agenda ali mesmo." },
    ],
  },
  {
    chave: "base-antiga",
    titulo: "Reativação da base antiga",
    resumo: "Pacientes que a clínica já conquistou uma vez — e parou de falar com eles.",
    acento: "whatsapp",
    cena: "baseAntiga",
    passos: [
      { rotulo: "Base antiga", detalhe: "Todo mundo sem retorno recente." },
      { rotulo: "Segmentação", detalhe: "Por tempo parado, especialidade e situação." },
      { rotulo: "Lotes", detalhe: "250 por dia, com cooldown entre campanhas." },
      { rotulo: "WhatsApp", detalhe: "Só em horário comercial, respeitando opt-out." },
      { rotulo: "IA", detalhe: "Separa quem quer voltar de quem pediu para parar." },
      { rotulo: "Agendamento", detalhe: "Quem quer volta para a agenda." },
    ],
  },
  {
    chave: "leads",
    titulo: "Lead novo",
    resumo: "O contato que chegou agora e ainda está com o celular na mão.",
    acento: "ia",
    cena: "prioridade",
    passos: [
      { rotulo: "Lead criado", detalhe: "Formulário, campanha ou indicação." },
      { rotulo: "Prioridade alta", detalhe: "Peso base 30 — o maior da tabela." },
      { rotulo: "Primeiro contato", detalhe: "Automático quando é seguro, humano quando não." },
      { rotulo: "Qualificação", detalhe: "A IA lê a resposta e marca a temperatura." },
      { rotulo: "Avaliação agendada", detalhe: "Etapa do funil muda sozinha." },
    ],
  },
  {
    chave: "orcamento",
    titulo: "Orçamento parado",
    resumo: "O tratamento que foi orçado, não foi recusado — e ficou parado.",
    acento: "n8n",
    cena: "eventos",
    passos: [
      { rotulo: "Orçamento criado", detalhe: "Registrado com valor e especialidade." },
      { rotulo: "Sem decisão", detalhe: "Passou o prazo sem aprovação nem recusa." },
      { rotulo: "Tarefa para o CRC", detalhe: "Negociação é conversa humana, não template." },
      { rotulo: "Motivo registrado", detalhe: "Preço, distância, adiamento — fechado, vira relatório." },
    ],
  },
  {
    chave: "escalonamento",
    titulo: "Quando o humano entra",
    resumo: "A regra que decide o que a automação NÃO faz.",
    acento: "jp",
    cena: "humano",
    passos: [
      { rotulo: "Dúvida clínica", detalhe: "Dor, sintoma, indicação: sempre humano." },
      { rotulo: "Preço e negociação", detalhe: "Regra comercial, com um responsável." },
      { rotulo: "Reclamação", detalhe: "Escala imediata, sem tentativa de resposta pronta." },
      { rotulo: "Baixa confiança", detalhe: "Se a IA não tem certeza, ela não age." },
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
    nome: "Fonte",
    descricao: "Dental Office — a operação da clínica como ela é hoje.",
  },
  {
    chave: "integracao",
    nome: "Integração",
    descricao: "Backend e n8n: sync, webhooks, jobs, retentativa, deduplicação.",
  },
  {
    chave: "nucleo",
    nome: "Núcleo",
    descricao: "JP CRC: pacientes, CRM, oportunidades, tarefas, conversas, analytics.",
  },
  {
    chave: "acao",
    nome: "Ação",
    descricao: "Automações e IA decidem o que fazer, dentro das regras de contato.",
  },
  {
    chave: "canal",
    nome: "Canal",
    descricao: "WhatsApp: entrega, leitura e resposta do paciente.",
  },
  {
    chave: "resultado",
    nome: "Resultado",
    descricao: "Agendamento, comparecimento e o que a gestão consegue medir.",
  },
];
