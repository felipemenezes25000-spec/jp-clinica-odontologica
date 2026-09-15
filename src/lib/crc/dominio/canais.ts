/**
 * Os canais de conversa — e o fim do pressuposto "mensagem = telefone".
 *
 * ============================================================================
 *  O PRESSUPOSTO QUE ESTE ARQUIVO EXISTE PARA MATAR.
 *
 *  O CRC nasceu falando WhatsApp, e WhatsApp é telefone. Isso deixou o
 *  telefone vazando por toda a camada de aplicação: `PedidoEnvio.telefone`,
 *  `resolverConversa(…, telefoneBruto)`, `MensagemRecebida.telefone`.
 *
 *  Instagram não tem telefone. Messenger não tem telefone. A pessoa que manda
 *  direct é um identificador opaco emitido pela Meta e só válido dentro do
 *  par (conta da clínica, pessoa) — e ele não é telefone, não é e-mail, e não
 *  é nada que a clínica possa digitar.
 *
 *  Sem um destino GENÉRICO, cada canal novo entraria como um campo opcional a
 *  mais no mesmo objeto, e a camada de aplicação começaria a fazer
 *  `if (telefone !== null) … else if (igsid !== null) …` em vinte lugares. É
 *  assim que um CRM acaba com três CRMs dentro.
 * ============================================================================
 *
 * ============================================================================
 *  POR QUE UNIÃO DISCRIMINADA, E NÃO UM OBJETO COM TRÊS CAMPOS OPCIONAIS.
 *
 *      // o que NÃO fazer
 *      type Destino = { telefone?: string; igsid?: string; psid?: string };
 *
 *  Esse tipo permite `{}` — destino nenhum — e permite `{ telefone, psid }`,
 *  que é destino contraditório. Os dois compilam, e os dois chegam ao adapter.
 *
 *  Com união discriminada, o compilador exige o `switch` completo: um canal
 *  novo quebra a compilação em todo lugar que decide por canal, que é
 *  exatamente onde alguém precisa pensar.
 * ============================================================================
 *
 * ARQUIVO PURO. Nada de banco, nada de rede — é a linguagem que a aplicação e
 * os adapters usam para concordar sobre "para quem".
 */

/* -------------------------------------------------------------------------- */
/* O canal                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Os canais em que existe CONVERSA de duas vias.
 *
 * ============================================================================
 *  `lead_ads` NÃO ESTÁ AQUI, e a ausência é a decisão mais importante do
 *  arquivo.
 *
 *  Um Instant Form não é conversa: ninguém do outro lado está esperando
 *  resposta naquele canal, e não existe endereço para responder — o formulário
 *  entrega nome, telefone e e-mail, e a conversa continua por WhatsApp ou
 *  ligação. Modelá-lo como canal de conversa criaria uma thread que nunca
 *  recebe nem manda mensagem, aparecendo na Inbox para sempre sem nada a
 *  fazer.
 *
 *  Lead Ads é AQUISIÇÃO. Ele entra pelo funil (`crc_leads`), não pela Inbox.
 * ============================================================================
 */
export const CANAIS_DE_CONVERSA = ["whatsapp", "instagram", "messenger"] as const;

export type CanalConversa = (typeof CANAIS_DE_CONVERSA)[number];

export function ehCanalDeConversa(valor: unknown): valor is CanalConversa {
  return typeof valor === "string" && (CANAIS_DE_CONVERSA as readonly string[]).includes(valor);
}

/**
 * O canal de uma conversa vinda do banco.
 *
 * `crc_conversations.canal` é `text` com default `'whatsapp'`, e por isso pode
 * conter qualquer coisa — linha semeada à mão, canal de um deploy futuro,
 * migração pela metade. Quem lê precisa de uma resposta fechada.
 *
 * O FALLBACK É `whatsapp` PORQUE É O DEFAULT DA COLUNA, e não porque é o mais
 * provável: é o único valor que uma linha sem canal explícito pode ter tido.
 */
export function canalDaLinha(valor: unknown): CanalConversa {
  return ehCanalDeConversa(valor) ? valor : "whatsapp";
}

/* -------------------------------------------------------------------------- */
/* O identificador do contato                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Como a pessoa é endereçada, no vocabulário do canal.
 *
 *   `telefone`              E.164 sem '+'. A forma canônica de `telefone.ts`.
 *   `instagram_scoped_id`   o IGSID. Opaco, emitido pela Meta, escopado à
 *                           conta da clínica. NÃO é o `@usuario`.
 *   `facebook_psid`         o PSID da Página. Mesma natureza.
 *
 * ============================================================================
 *  O `@usuario` NUNCA É CHAVE, e vale dizer por quê antes que alguém tente.
 *
 *  Username do Instagram é EDITÁVEL. A pessoa troca `@joao_ig` por
 *  `@joao.implante` e, se ele fosse a chave, a conversa de amanhã nasceria
 *  separada da de hoje — duas threads, dois históricos, um paciente.
 *
 *  Pior no sentido inverso: username liberado é REAPROVEITÁVEL. Outra pessoa
 *  assume `@joao_ig` e passa a escrever dentro da conversa de quem tinha o
 *  nome antes, com o histórico clínico-administrativo de alguém que ela não é.
 *
 *  O username entra como RÓTULO na tela (§24) e nunca como identidade.
 * ============================================================================
 */
export type TipoDeContato = "telefone" | "instagram_scoped_id" | "facebook_psid";

export type IdentificadorDoContato = {
  tipo: TipoDeContato;
  /** O valor opaco. Já normalizado quando o tipo admite normalização. */
  valor: string;
};

/**
 * O destino de uma mensagem, sem pressuposto de telefone.
 *
 * O TIPO DO CONTATO É DERIVÁVEL DO CANAL hoje — um canal, um tipo. Mesmo assim
 * os dois viajam juntos, e a redundância é deliberada: ela transforma
 * "instagram com um telefone dentro" em erro de compilação em vez de uma
 * chamada de Graph API que falha em produção com `invalid recipient`.
 */
export type DestinoCanal =
  | { canal: "whatsapp"; contato: { tipo: "telefone"; valor: string } }
  | { canal: "instagram"; contato: { tipo: "instagram_scoped_id"; valor: string } }
  | { canal: "messenger"; contato: { tipo: "facebook_psid"; valor: string } };

/** O tipo de contato que cada canal usa. Um só, por canal. */
export const CONTATO_DO_CANAL: Readonly<Record<CanalConversa, TipoDeContato>> = {
  whatsapp: "telefone",
  instagram: "instagram_scoped_id",
  messenger: "facebook_psid",
};

/**
 * Monta o destino a partir do par (canal, contato) que veio do banco.
 *
 * Devolve `null` quando o contato está vazio. FALHA FECHADO (§4.5): uma
 * conversa sem contato externo existe de verdade — importação antiga, linha
 * semeada — e enviar "para vazio" é pedir ao provedor que escolha o
 * destinatário.
 */
export function montarDestino(canal: CanalConversa, contato: string): DestinoCanal | null {
  const valor = contato.trim();
  if (valor.length === 0) return null;

  if (canal === "instagram") {
    return { canal: "instagram", contato: { tipo: "instagram_scoped_id", valor } };
  }
  if (canal === "messenger") {
    return { canal: "messenger", contato: { tipo: "facebook_psid", valor } };
  }
  return { canal: "whatsapp", contato: { tipo: "telefone", valor } };
}

/** A chave que vai para `crc_conversations.contato_externo`. */
export function contatoExternoDoDestino(destino: DestinoCanal): string {
  return destino.contato.valor;
}

/* -------------------------------------------------------------------------- */
/* O namespace de identidade                                                  */
/* -------------------------------------------------------------------------- */

/**
 * O namespace de cada canal na tabela de identidades — §10.
 *
 * ============================================================================
 *  O DEFEITO QUE ISTO IMPEDE, e ele é silencioso e irreversível.
 *
 *  `crc_patient_identities` guardava `(tipo, valor)`, e `tipo = EXTERNAL_ID`
 *  significava "id do paciente no Dental Office". O Dental Office numera
 *  pacientes com inteiros pequenos: `123`, `456`.
 *
 *  O Instagram também emite identificadores numéricos. O Messenger também. Sem
 *  namespace, o IGSID `123` e o paciente `123` do Dental Office são a MESMA
 *  linha — e `quemE("EXTERNAL_ID", "123")` devolve com confiança total um
 *  paciente que não tem nada a ver com quem mandou o direct.
 *
 *  A conversa do Instagram entra no prontuário comercial de um estranho. E não
 *  há como descobrir depois: a única informação que separava os dois — de qual
 *  sistema o número veio — nunca foi gravada.
 * ============================================================================
 *
 * `dental-office` é o namespace das linhas que já existem, e o backfill do
 * `supabase/45` as marca assim. Ver o cabeçalho da migração.
 */
export const NAMESPACE_DENTAL_OFFICE = "dental-office";

export const NAMESPACE_DO_CANAL: Readonly<Record<CanalConversa, string>> = {
  whatsapp: "whatsapp",
  instagram: "instagram",
  messenger: "messenger",
};

/** O namespace do identificador de um lead vindo de formulário da Meta. */
export const NAMESPACE_META_LEAD = "meta-lead";

/* -------------------------------------------------------------------------- */
/* Rótulos                                                                    */
/* -------------------------------------------------------------------------- */

export type RotuloDeCanal = {
  /** O nome que a pessoa lê. */
  nome: string;
  /**
   * O texto para leitor de tela e para `aria-label`.
   *
   * SEPARADO DO NOME de propósito: o §22 proíbe status dependente de cor, e a
   * lista da Inbox mostra o canal com ícone + nome. O rótulo acessível carrega
   * a frase inteira ("conversa pelo Instagram") porque, lido em sequência com
   * o nome do paciente, "Instagram" sozinho soa como parte do nome.
   */
  acessivel: string;
  /**
   * A chave de cor/ícone da tela. Não é a cor: é o nome dela.
   *
   * O CSS resolve `data-canal="instagram"`. Guardar `#C13584` aqui traria
   * decisão de design para o domínio, e o tema escuro precisaria de um segundo
   * campo.
   */
  chave: CanalConversa;
};

export const ROTULO_DO_CANAL: Readonly<Record<CanalConversa, RotuloDeCanal>> = {
  whatsapp: { nome: "WhatsApp", acessivel: "conversa pelo WhatsApp", chave: "whatsapp" },
  instagram: {
    nome: "Instagram",
    acessivel: "conversa por direct do Instagram",
    chave: "instagram",
  },
  messenger: {
    nome: "Messenger",
    acessivel: "conversa pelo Messenger do Facebook",
    chave: "messenger",
  },
};

export function rotuloDoCanal(canal: unknown): RotuloDeCanal {
  return ROTULO_DO_CANAL[canalDaLinha(canal)];
}

/* -------------------------------------------------------------------------- */
/* O que cada canal aceita                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Como se mostra um contato na tela, por canal.
 *
 * ============================================================================
 *  IDENTIFICADOR DA META NUNCA É UX PRINCIPAL — §24.
 *
 *  Um IGSID tem dezessete dígitos. A Inbox mostrava `telefoneParaTela(contato)`
 *  para toda conversa, e `telefoneParaTela` de um IGSID devolve o próprio
 *  número cru: dezessete dígitos onde deveria estar um nome.
 *
 *  Quando não há nome nem username, o honesto é dizer o que se sabe — "direct
 *  do Instagram" — em vez de despejar a chave técnica. Ela continua acessível
 *  no detalhe/admin, que é onde alguém investigando precisa dela.
 * ============================================================================
 */
export function contatoParaTela(
  canal: unknown,
  contato: string,
  /** Username/nome de perfil, quando conhecido. */
  apelido: string | null = null,
): string {
  const c = canalDaLinha(canal);

  if (c === "whatsapp") {
    // Quem sabe formatar telefone é `dominio/telefone.ts`. Aqui só se decide
    // QUE é telefone — formatar aqui duplicaria a regra do DDI.
    return contato;
  }

  const nome = (apelido ?? "").trim();
  if (nome.length > 0) return c === "instagram" ? `@${nome.replace(/^@/u, "")}` : nome;

  return c === "instagram" ? "Direct do Instagram" : "Messenger do Facebook";
}

/**
 * Este canal precisa de identificador tipo telefone?
 *
 * Usado por quem ainda recebe telefone como entrada — o formulário do site, a
 * campanha, a importação. É a fronteira entre o mundo antigo e o novo, e ela é
 * declarada em vez de assumida.
 */
export function canalUsaTelefone(canal: unknown): boolean {
  return CONTATO_DO_CANAL[canalDaLinha(canal)] === "telefone";
}
