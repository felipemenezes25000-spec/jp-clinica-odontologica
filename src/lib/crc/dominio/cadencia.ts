/**
 * A cadência de uma campanha — quantas mensagens já deveriam ter saído.
 *
 * ============================================================================
 *  O QUE ESTE ARQUIVO CONSERTA: "100 por dia" significava 25 por dia.
 *
 *  `rodarCampanhas` selecionava os alvos assim:
 *
 *      limite: Math.min(restaHoje, ctx.limitePorVolta ?? 25)
 *
 *  e era chamada por um lugar só — a volta pesada, que roda UMA VEZ POR DIA.
 *  Ou seja: a campanha configurada para 100 contatos diários mandava 25, e os
 *  75 restantes esperavam o dia seguinte para virar mais 25.
 *
 *  Uma campanha de 964 pessoas a "100 por dia" levaria 38 dias em vez de 10. E
 *  ninguém veria erro: a tela mostraria a campanha RODANDO, com progresso.
 * ============================================================================
 *
 * A CORREÇÃO NÃO É AUMENTAR O LOTE PARA 100. Mandar 100 mensagens às 8h05 é o
 * padrão que derruba a reputação do número — e a partir daí nada chega, nem as
 * boas. O cabeçalho de `campanhas.ts` sempre disse isso: "o envio é espalhado
 * por dia".
 *
 * O QUE FALTAVA ERA A CONTA DO "ESPALHADO". Este arquivo é ela: a que responde
 * **quantas já deveriam ter saído a esta hora**, e não "quantas cabem por
 * volta". A diferença aparece quando o pulso atrasa: com um teto por volta, a
 * campanha perde o que não saiu; com uma cota acumulada, a volta seguinte
 * recupera o atraso sozinha e o dia fecha na meta.
 *
 * PURO, E POR ISSO TESTÁVEL SEM BANCO E SEM RELÓGIO DE PAREDE. A janela
 * comercial, o feriado e o fuso entram como dados.
 */
import { partesLocais, type HorarioComercial } from "./configuracao";

function minutosDe(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number.parseInt(h ?? "0", 10) * 60 + Number.parseInt(m ?? "0", 10);
}

/**
 * Quanto da janela comercial de hoje já passou, de 0 a 1.
 *
 * FORA DA JANELA A RESPOSTA NÃO É ZERO NOS DOIS LADOS: antes de abrir é 0 (nada
 * deveria ter saído), depois de fechar é 1 (o dia inteiro já passou). Devolver 0
 * depois do fechamento faria a campanha "perder" o que já mandou e tentar
 * mandar de novo no dia seguinte a partir do zero — e devolver 1 antes de abrir
 * liberaria a cota inteira às 3h da manhã.
 *
 * DIA SEM JANELA — domingo, feriado — devolve 1: não há janela para percorrer, e
 * quem decide não enviar é a política de contato, não esta conta. Devolver 0
 * aqui seria proibir por dois caminhos diferentes e esconder qual dos dois agiu.
 */
export function fracaoDaJanela(agora: Date, horario: HorarioComercial): number {
  const p = partesLocais(agora, horario.fuso);

  const iso = `${String(p.ano)}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
  if (horario.feriados.includes(iso)) return 1;

  const janela = horario.dias[p.diaSemana];
  if (janela === null || janela === undefined) return 1;

  const abre = minutosDe(janela.inicio);
  const fecha = minutosDe(janela.fim);
  if (fecha <= abre) return 1;

  const agoraMin = p.hora * 60 + p.minuto;
  if (agoraMin <= abre) return 0;
  if (agoraMin >= fecha) return 1;

  return (agoraMin - abre) / (fecha - abre);
}

/**
 * A meta é atingida com a janela ainda aberta, e não no instante em que fecha.
 *
 * ========================================================================
 *  ISTO NASCEU DE O TESTE FALHAR EM 96 DE 100, e o defeito estava na conta.
 *
 *  Com a cota proporcional pura, `porDia` só é alcançado quando a fração chega
 *  a 1 — ou seja, no minuto do FECHAMENTO. E nesse minuto `dentroDoHorario` já
 *  é falso: `enviarMensagem` recusa, o alvo volta para PENDENTE, e as últimas
 *  mensagens do dia simplesmente não saem. Todo dia. Sempre as mesmas últimas.
 *
 *  Uma campanha que entrega 96% e culpa o relógio é pior do que uma que entrega
 *  96% e diz que é o limite — porque ninguém procura o que não aparece.
 * ========================================================================
 *
 * DEZ POR CENTO DA JANELA COMO FOLGA. Numa janela de 11 horas é a última hora:
 * tempo de sobra para o pulso completar a meta, e pouco o bastante para não
 * concentrar o fim do dia. O número não precisa ser exato — precisa ser
 * diferente de zero.
 */
const FOLGA_DA_JANELA = 0.9;

/**
 * Quantas mensagens já deveriam ter saído hoje, considerando a hora.
 *
 * `ceil` E NÃO `floor`: com `floor`, uma campanha de 10 por dia numa janela de
 * 11 horas só liberaria a primeira mensagem depois de uma hora inteira — e a
 * última ficaria para o fechamento. Arredondar para cima faz a primeira sair na
 * primeira volta do pulso.
 */
export function cotaAcumulada(porDia: number, agora: Date, horario: HorarioComercial): number {
  if (porDia <= 0) return 0;
  const andamento = Math.min(1, fracaoDaJanela(agora, horario) / FOLGA_DA_JANELA);
  return Math.ceil(porDia * andamento);
}

/**
 * O instante em que o dia local COMEÇOU.
 *
 * ========================================================================
 *  POR QUE NÃO `setHours(0,0,0,0)`, que era o que estava no código.
 *
 *  Isso usa o fuso do SERVIDOR. Na Vercel, o servidor é UTC — então o contador
 *  diário da campanha virava às 21h de São Paulo. Efeito prático: a partir das
 *  21h a campanha "esquece" tudo que mandou no dia e libera a cota inteira de
 *  novo. Cem mensagens durante o dia, e cem de madrugada.
 *
 *  E não é um bug que aparece: o relatório mostra os dois dias com 100, cada um
 *  dentro da meta.
 * ========================================================================
 *
 * A CONTA É SUBTRAIR A HORA LOCAL DECORRIDA, e não converter data para instante.
 * Assim ela continua certa em dia de mudança de horário de verão, onde o dia
 * local tem 23 ou 25 horas e a aritmética de "meia-noite mais 24h" erra.
 */
export function inicioDoDiaLocal(agora: Date, fuso: string): Date {
  const p = partesLocais(agora, fuso);
  const decorridoMs = (p.hora * 60 + p.minuto) * 60_000;
  const inicio = new Date(agora.getTime() - decorridoMs);
  // Os segundos do minuto corrente também: sem isto, o corte cai alguns
  // segundos DEPOIS da virada e a primeira mensagem do dia não é contada.
  inicio.setUTCSeconds(0, 0);
  return inicio;
}
