/**
 * Os dados de mentira da vitrine — SÓ EM DESENVOLVIMENTO.
 *
 * ============================================================================
 *  ELES SÃO TIPADOS CONTRA OS DTOs DE VERDADE, e isso é o ponto do arquivo.
 *
 *  Um dado de mentira solto (`as any`, objeto improvisado) engana a tela hoje e
 *  mente amanhã: o DTO muda, a vitrine continua bonita, e a tela real quebra.
 *  Aqui cada objeto declara o tipo exportado pela `api.ts`, então o `tsc` avisa
 *  no mesmo instante em que o contrato mudar.
 *
 *  O QUE ELES DEVEM MOSTRAR, e é diferente de "dados plausíveis": cada tela
 *  precisa aparecer no estado que ENSINA. Número redondo e lista curta escondem
 *  o que a gente quer revisar — nome comprido que estoura a coluna, valor de
 *  cinco dígitos que desalinha, lista com um item só, severidade crítica ao
 *  lado de severidade normal.
 * ============================================================================
 *
 * A chave de cada entrada é o NOME da função de servidor, que é como o
 * interceptador da vitrine encontra a resposta.
 */
import type { PainelDeSaudeDto, ResumoHome } from "@/lib/crc/api";

/* -------------------------------------------------------------------------- */
/* Home                                                                       */
/* -------------------------------------------------------------------------- */

const RESUMO_HOME: ResumoHome = {
  saudacao: "Boa tarde",
  precisamDeAtencao: 23,
  emAutomacao: 8,
  tarefasHoje: 4,
  conversasEsperando: 2,
  consultasRecuperadas: 11,
  pacientesReativados: 9,
  // Potencial e confirmado NUNCA no mesmo número — e a vitrine mostra os dois
  // com ordens de grandeza diferentes, que é quando o desalinho aparece.
  valorPotencialRecuperado: "48350.00",
  receitaConfirmada: "7420.00",
  frescorDados: new Date(Date.now() - 42 * 60_000).toISOString(),
  janelaDeHoje: { inicio: "08:00", fim: "19:00" },
  dentroDoHorario: true,
  prioridades: [
    {
      opportunityId: "o1",
      patientId: "p1",
      // Nome comprido de propósito: é ele que revela a coluna que não trunca.
      nome: "Maria Aparecida Gonçalves de Albuquerque",
      tipo: "ORCAMENTO_PARADO",
      tipoRotulo: "Orçamento parado",
      motivo: "Orçamento de prótese apresentado há 18 dias, sem resposta desde então.",
      score: 92,
      faixa: "ALTA",
      fatores: [
        { rotulo: "Valor do orçamento", pontos: 40 },
        { rotulo: "Dias parado", pontos: 32 },
        { rotulo: "Já veio à clínica", pontos: 20 },
      ],
      valorPotencial: "18400.00",
      proximaAcao: "Mandar mensagem tratando a objeção de preço",
      ultimoContatoEm: new Date(Date.now() - 18 * 86_400_000).toISOString(),
      temJornadaAtiva: false,
    },
    {
      opportunityId: "o2",
      patientId: "p2",
      nome: "João P. Silva",
      tipo: "FALTA",
      tipoRotulo: "Faltou e não remarcou",
      motivo: "Faltou na terça e não remarcou.",
      score: 61,
      faixa: "MEDIA",
      fatores: [{ rotulo: "Falta recente", pontos: 35 }],
      valorPotencial: "380.00",
      proximaAcao: "Oferecer dois horários desta semana",
      ultimoContatoEm: null,
      temJornadaAtiva: true,
    },
    {
      opportunityId: "o3",
      patientId: null,
      // Sem paciente ligado: o caso que a tela precisa saber desenhar.
      nome: "Paciente sem nome",
      tipo: "LEAD",
      tipoRotulo: "Lead sem resposta",
      motivo: "Veio do Instagram e ninguém respondeu em 3 dias.",
      score: 44,
      faixa: "BAIXA",
      fatores: [],
      valorPotencial: null,
      proximaAcao: null,
      ultimoContatoEm: null,
      temJornadaAtiva: false,
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Saúde                                                                      */
/* -------------------------------------------------------------------------- */

const PAINEL_SAUDE: PainelDeSaudeDto = {
  severidade: "atencao",
  em: new Date().toISOString(),
  // As três severidades juntas de propósito: é lado a lado que se descobre se
  // a diferença entre "atenção" e "crítico" está legível.
  sinais: [
    {
      codigo: "disjuntor_aberto",
      titulo: "O provedor de IA está cortado",
      acao: "Esperar o descanso do disjuntor; nada a fazer agora.",
      severidade: "critico",
      detalhe: "Cinco falhas seguidas às 14h32. Volta a tentar em 4 minutos.",
    },
    {
      codigo: "fila_parada",
      titulo: "Sete jobs esperando há mais de 20 minutos",
      acao: "Conferir se o worker está vivo na tela de execução.",
      severidade: "atencao",
      detalhe: "O mais antigo entrou na fila às 13h58.",
    },
    {
      codigo: "batimento",
      titulo: "O pulso está vivo",
      acao: "Nada a fazer.",
      severidade: "ok",
      detalhe: "Último batimento há 40 segundos.",
    },
  ],
  leituras: [
    {
      codigo: "handoff",
      titulo: "Repasse para gente em 18%",
      acao: "Dentro do esperado — nem calado demais, nem falando o que não devia.",
      severidade: "ok",
      detalhe: "Entre 10% e 40% é a faixa saudável.",
    },
  ],
  metricas: {
    turnos: 412,
    entregues: 337,
    humanos: 74,
    falhas: 1,
    taxaDeEntrega: 0.818,
    taxaDeHandoff: 0.18,
    taxaDeFalha: 0.002,
    custoTotal: 18.47,
    custoPorTurno: 0.0448,
    portoes: [
      { codigo: "opt_out", vezes: 12 },
      { codigo: "fora_do_horario", vezes: 7 },
      { codigo: "clinico", vezes: 3 },
    ],
  },
  comparacoes: [
    { metrica: "Taxa de entrega", antes: 0.74, agora: 0.818, variacao: 0.105, significativa: true },
    {
      metrica: "Custo por turno",
      antes: 0.051,
      agora: 0.0448,
      variacao: -0.121,
      significativa: false,
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* O catálogo                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Nome da função de servidor → a resposta que a vitrine devolve.
 *
 * O que não estiver aqui volta como FALHA explicada, e não como sucesso vazio:
 * assim a tela mostra o próprio estado de erro — que também é aparência que
 * precisa de revisão, e que ninguém nunca olha de propósito.
 */
export const DADOS_DA_VITRINE: Readonly<Record<string, unknown>> = {
  carregarHome: { ok: true, resumo: RESUMO_HOME },
  carregarSaudeDoSistema: { ok: true, painel: PAINEL_SAUDE },
};
