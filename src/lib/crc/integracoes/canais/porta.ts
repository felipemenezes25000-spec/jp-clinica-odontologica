/**
 * A porta de CANAL — a generalização de `PortaMensageria`. §7, Estratégia A.
 *
 * ============================================================================
 *  `PortaMensageria` NÃO FOI TOCADA, e essa é a decisão central do §7.
 *
 *  Ela tem cinco anos de comportamento difícil dentro: classificação de falha
 *  em três estados (com `incerta`, que quase todo mundo esquece), verificação
 *  de assinatura por provedor, janela de 24 horas, template aprovado,
 *  idempotência por `chaveDedupe`. Três adapters a implementam e há teste para
 *  cada um.
 *
 *  Generalizá-la — a Estratégia B do §7 — significaria mexer em
 *  `enviarTexto(EnvioTexto)`, cujo `destino` é `{ telefone: string }`. Todo
 *  adapter, todo teste e todo chamador mudariam no mesmo commit, para provar
 *  compatibilidade de um contrato que já está provado.
 *
 *  A ESTRATÉGIA A É ESTA:
 *
 *      PortaCanal                       ← a nova, genérica
 *      ├── PortaCanalWhatsapp           ← embrulha PortaMensageria, intacta
 *      ├── PortaCanalInstagram
 *      └── PortaCanalMessenger
 *
 *  O WhatsApp continua funcionando exatamente como funciona, e o que muda é
 *  que passa a existir um tipo pelo qual a aplicação fala com os três.
 * ============================================================================
 *
 * ============================================================================
 *  O QUE ESTA PORTA DELIBERADAMENTE NÃO EXPÕE — herdado do cabeçalho de
 *  `PortaMensageria`, e ampliado:
 *
 *    · nada de "conta remetente": é configuração do adapter;
 *    · nada de formato de template do provedor;
 *    · nada de retry: quem repete é a FILA, com a chave de dedupe intacta;
 *    · nada de DECISÃO de política. O adapter recebe a forma já decidida por
 *      `dominio/politica-de-canal.ts` e a executa.
 *
 *  O último é novo e é o que impede o pior desfecho: um adapter que decide
 *  sozinho usar `HUMAN_AGENT` estaria afirmando à Meta que uma pessoa está
 *  atendendo — sem saber se está.
 * ============================================================================
 */
import type { DestinoCanal } from "../../dominio/canais";
import type { ClasseDeFalha, ResultadoEnvio } from "../whatsapp/porta";

export type { ClasseDeFalha, ResultadoEnvio };

/* -------------------------------------------------------------------------- */
/* O envio                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * COMO a mensagem sai — a decisão já tomada pelo domínio.
 *
 * É a tradução de `DecisaoDeCanal` para o que o adapter precisa fazer. Ela
 * chega pronta: o adapter não avalia janela, não escolhe etiqueta, não decide
 * template.
 */
export type FormaDoEnvio =
  | { forma: "texto" }
  /** WhatsApp, fora da janela. O nome é o aprovado na Meta. */
  | { forma: "template"; providerNome: string; variaveis: readonly string[]; idioma?: string }
  /**
   * Instagram/Messenger, fora das 24h, com PESSOA atendendo.
   *
   * Ver `dominio/politica-de-canal.ts`: só `atendente` chega aqui, e só com a
   * feature aprovada. O adapter apenas acrescenta a etiqueta.
   */
  | { forma: "etiqueta_humana" }
  /** Resposta privada a um comentário. Uma só, e o destino é o COMENTÁRIO. */
  | { forma: "private_reply"; comentarioId: string };

export type PedidoDeEnvioNoCanal = {
  destino: DestinoCanal;
  /** O texto já renderizado. É ele que fica em `crc_messages` e na Inbox. */
  texto: string;
  forma: FormaDoEnvio;
  /**
   * A chave de idempotência NOSSA.
   *
   * A garantia de verdade está em `crc_messages.chave_dedupe`, com índice
   * único — a Meta não oferece idempotência de envio. Esta chave viaja para o
   * adapter poder usá-la no dia em que algum provedor suportar, e para
   * aparecer no log correlacionando o envio com a linha do banco.
   */
  chaveDedupe: string;
};

/* -------------------------------------------------------------------------- */
/* A porta                                                                    */
/* -------------------------------------------------------------------------- */

export type PortaCanal = {
  /** `whatsapp` | `instagram` | `messenger`. */
  readonly canal: DestinoCanal["canal"];
  /** `meta_cloud`, `twilio`, `waha`, `meta`, `sandbox`. Para log e dedupe. */
  readonly provedor: string;

  /**
   * Manda a mensagem, na forma que o domínio decidiu.
   *
   * ==========================================================================
   *  O ADAPTER PODE RECUSAR A FORMA, e essa é uma recusa legítima e esperada.
   *
   *  `private_reply` num adapter de WhatsApp não existe. `template` num de
   *  Instagram não existe. Em vez de ignorar em silêncio — que faria a mensagem
   *  sair como texto fora da janela e ser recusada pela Meta com um erro
   *  incompreensível —, o adapter devolve `permanente` dizendo o que foi pedido
   *  e o que ele sabe fazer.
   * ==========================================================================
   */
  enviar(pedido: PedidoDeEnvioNoCanal): Promise<ResultadoEnvio>;

  /**
   * Busca o perfil de quem está do outro lado — §24.
   *
   * Existe porque um IGSID de dezessete dígitos não é UX. `null` quando o
   * provedor não oferece ou a chamada falha — e aí a tela mostra "Direct do
   * Instagram" em vez de o número, que é o que `contatoParaTela` faz.
   *
   * NUNCA BLOQUEIA O RECEBIMENTO. Quem chama trata a ausência como normal: um
   * perfil que não carregou não pode impedir a mensagem de entrar na Inbox.
   */
  perfil?(contatoExterno: string): Promise<PerfilExterno | null>;
};

export type PerfilExterno = {
  /** O nome que a pessoa pôs no perfil. */
  nome: string | null;
  /** O `@usuario`, sem arroba. RÓTULO, nunca chave. */
  username: string | null;
  /**
   * A URL da foto, quando o provedor manda.
   *
   * TEMPORÁRIA, como toda URL de CDN da Meta. Guardá-la como permanente produz
   * um avatar que quebra em uma semana — e um avatar quebrado numa lista de
   * conversas parece defeito do CRC.
   */
  fotoUrl: string | null;
};
