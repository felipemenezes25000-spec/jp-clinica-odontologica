/**
 * A direção de uma mensagem, normalizada num lugar só.
 *
 * ESTE ARQUIVO NASCEU DE UM BUG QUE TROCAVA PACIENTE POR CLÍNICA.
 *
 * O schema declara `ENTRADA | SAIDA`. O runtime agentic, escrito depois, lia
 * assim:
 *
 *     direcao === "IN" || direcao === "recebida" ? "recebida" : "enviada"
 *
 * Nenhum dos dois valores existe no banco. O resultado é que TODA mensagem do
 * paciente caía no `else` e era rotulada como mensagem da clínica. Três coisas
 * quebravam juntas, e nenhuma de forma visível:
 *
 *   A CONVERSA CHEGAVA AO MODELO COM OS PAPÉIS TROCADOS. O agente lia a
 *   pergunta do paciente como se a clínica tivesse dito aquilo.
 *
 *   A JANELA DE 24 HORAS NUNCA ABRIA, porque "última mensagem recebida" não
 *   existia. Num provedor que exige template fora da janela, isso é o agente
 *   nunca conseguir responder.
 *
 *   O PORTÃO DE REPETIÇÃO comparava a resposta nova contra as mensagens do
 *   próprio paciente, que ele julgava serem da clínica.
 *
 * Os testes passavam porque semeavam `direcao: "IN"` — o mesmo valor inventado
 * que o código lia. Banco fake sem schema concorda com qualquer invenção.
 *
 * A LIÇÃO QUE VIRA REGRA: valor de enum de banco se normaliza aqui, uma vez, e
 * o resto do sistema fala o vocabulário do domínio.
 */
import type { Direcao } from "./tipos";

/**
 * Os apelidos históricos aceitos na leitura.
 *
 * `IN`/`OUT` e `recebida`/`enviada` nunca foram gravados por este sistema — são
 * o vocabulário errado que o runtime agentic usava. Ficam aceitos na LEITURA
 * por um motivo prático: se alguma linha tiver sido gravada assim por um
 * caminho que não conhecemos, ela é lida certo em vez de virar silenciosamente
 * mensagem da clínica.
 *
 * A ESCRITA NUNCA USA APELIDO. `paraBanco` só devolve `ENTRADA` ou `SAIDA`.
 */
const APELIDOS: Readonly<Record<string, Direcao>> = {
  entrada: "ENTRADA",
  in: "ENTRADA",
  inbound: "ENTRADA",
  recebida: "ENTRADA",
  saida: "SAIDA",
  out: "SAIDA",
  outbound: "SAIDA",
  enviada: "SAIDA",
};

/**
 * Lê a direção de uma linha do banco.
 *
 * O PADRÃO É `SAIDA`, e a escolha não é arbitrária. Um valor irreconhecível
 * tratado como `ENTRADA` faria uma linha corrompida abrir a janela de 24 horas e
 * contar como mensagem do paciente; tratado como `SAIDA`, ele no máximo deixa a
 * janela fechada. Entre errar para "pode falar livremente" e errar para "precisa
 * de template", o segundo é o lado seguro.
 */
export function lerDirecao(valor: unknown): Direcao {
  if (typeof valor !== "string") return "SAIDA";
  return APELIDOS[valor.trim().toLowerCase()] ?? "SAIDA";
}

/** `true` quando a mensagem veio do paciente. */
export const ehDoPaciente = (valor: unknown): boolean => lerDirecao(valor) === "ENTRADA";

/** O valor que vai para a coluna. Sem apelido, nunca. */
export const paraBanco = (d: Direcao): Direcao => d;

/**
 * O vocabulário do contexto do turno.
 *
 * `recebida`/`enviada` continuam existindo dentro de `ia-platform` porque é
 * assim que a conversa é serializada para o modelo — "Paciente:" e "Clínica:".
 * A diferença é que agora essa tradução acontece UMA vez, aqui, a partir do
 * valor real da coluna.
 */
export const comoNoTurno = (valor: unknown): "recebida" | "enviada" =>
  ehDoPaciente(valor) ? "recebida" : "enviada";
