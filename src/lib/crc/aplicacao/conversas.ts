/**
 * Para onde uma resposta vai — resolvido num lugar só.
 *
 * ESTE ARQUIVO NASCEU DE UM BUG QUE IMPEDIA QUALQUER ENVIO.
 *
 * Três caminhos diferentes liam `crc_conversations.telefone` para descobrir o
 * destino. Essa coluna NÃO EXISTE: o schema guarda o contato em
 * `contato_externo` — "chave do contato no provedor; para WhatsApp, o telefone
 * E.164 sem '+'". O PostgREST recusa a consulta inteira quando ela pede uma
 * coluna inexistente, então o efeito não era "telefone vazio": era a consulta
 * estourando, o turno virando `falha_segura`, e o agente nunca conseguindo
 * responder ninguém.
 *
 * Os testes não pegavam porque o banco em memória guarda objetos: um teste que
 * semeia `{ telefone: "5511..." }` concorda com um código que lê `telefone`, e
 * os dois estão errados juntos.
 *
 * POR QUE UMA FUNÇÃO E NÃO TRÊS CORREÇÕES. Corrigir cada consulta deixaria o
 * mesmo conhecimento — "onde mora o contato de uma conversa" — repetido em três
 * arquivos, e o quarto caminho escrito no ano que vem repetiria o erro. Aqui a
 * pergunta tem uma resposta só.
 *
 * O NOME `contato` E NÃO `telefone` É DELIBERADO. O CRC já tem o canal como
 * coluna, e um dia vai existir conversa que não é WhatsApp. Chamar de telefone o
 * que o schema chama de contato externo é como o erro anterior começou.
 */
import { selecionarUm } from "../servidor/banco";

export type DestinoDaConversa = {
  conversationId: string;
  organizationId: string;
  clinicId: string | null;
  patientId: string | null;
  /** `whatsapp`, e no futuro outros. Vem da coluna, não de suposição. */
  canal: string;
  /** A chave do contato no provedor. Para WhatsApp, E.164 sem '+'. */
  contato: string;
};

/**
 * O destino canônico de uma conversa, ou `null`.
 *
 * `null` cobre DOIS casos que quem chama trata igual — não enviar — e que vale
 * distinguir no log: a conversa não existe, ou ela existe sem contato. O segundo
 * acontece de verdade: conversa criada por importação sem telefone.
 */
export async function destinoDaConversa(
  organizationId: string,
  conversationId: string,
): Promise<DestinoDaConversa | null> {
  const l = await selecionarUm("crc_conversations", {
    colunas: "id,organization_id,clinic_id,patient_id,canal,contato_externo",
    filtros: [
      { coluna: "id", op: "eq", valor: conversationId },
      // O tenant SEMPRE no filtro, e nunca só no `id`: um uuid vazado de outra
      // clínica não pode devolver o contato de um paciente que não é desta.
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
  });
  if (l === null) return null;

  const contato = typeof l["contato_externo"] === "string" ? l["contato_externo"].trim() : "";
  if (contato.length === 0) return null;

  return {
    conversationId,
    organizationId,
    clinicId: typeof l["clinic_id"] === "string" ? l["clinic_id"] : null,
    patientId: typeof l["patient_id"] === "string" ? l["patient_id"] : null,
    canal: typeof l["canal"] === "string" ? l["canal"] : "whatsapp",
    contato,
  };
}
