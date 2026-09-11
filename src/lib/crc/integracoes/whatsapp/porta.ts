/**
 * A porta de mensageria — item 35: "a camada de domínio não deve saber se o
 * fornecedor é Meta Cloud API, BSP X ou BSP Y".
 *
 * POR QUE ISSO IMPORTA AQUI MAIS DO QUE NO DENTAL OFFICE
 * Porque o provedor de WhatsApp ainda não foi contratado. Escrever o domínio
 * contra a Cloud API da Meta e depois descobrir que a clínica fechou com um BSP
 * significaria reescrever o motor de automação junto. Contra esta interface,
 * significa escrever um arquivo novo.
 *
 * O QUE ESTA INTERFACE DELIBERADAMENTE NÃO EXPÕE:
 *   - Nada de "número de telefone do remetente": isso é configuração do
 *     adapter, não decisão do domínio.
 *   - Nada de formato de template do provedor: o domínio manda chave e
 *     variáveis; traduzir para o formato aprovado é trabalho do adapter.
 *   - Nada de retry: quem repete é o `pedir` do http.ts, uma camada abaixo.
 */

export type DestinoMensagem = {
  /** E.164 sem '+'. A mesma forma canônica de `dominio/telefone.ts`. */
  telefone: string;
};

export type EnvioTexto = {
  destino: DestinoMensagem;
  texto: string;
  /**
   * Chave de idempotência NOSSA.
   *
   * O item 194 pede: antes de repetir um envio, verificar se o provedor já
   * processou. Como nem todo provedor oferece isso, a garantia de verdade fica
   * um nível acima — em `crc_messages.chave_dedupe`, com índice único. Esta
   * chave viaja junto para o adapter poder usá-la quando o provedor suportar.
   */
  chaveDedupe: string;
};

export type EnvioTemplate = {
  destino: DestinoMensagem;
  /** Nome do template aprovado no provedor. */
  template: string;
  idioma?: string;
  /** Variáveis na ordem em que o template as espera. */
  variaveis: string[];
  /** O texto já preenchido, para persistir e mostrar na Inbox. */
  textoRenderizado: string;
  chaveDedupe: string;
};

/**
 * Como uma falha de envio terminou. TRÊS estados, e não um booleano.
 *
 * ========================================================================
 *  O BOOLEANO `permanente` TINHA MENOS ESTADOS QUE A REALIDADE, e o estado que
 *  faltava é o que manda mensagem repetida para paciente.
 *
 *      "permanente"   número inválido, template não aprovado. Não insista.
 *      "transitoria"  o provedor está fora, a conexão foi recusada. O pedido
 *                     NÃO chegou; repetir é seguro e necessário.
 *      "incerta"      o pedido SAIU e a resposta não voltou. A Meta pode ter
 *                     aceitado. Repetir manda a mensagem DUAS VEZES.
 *
 *  O código HTTP já sabia disso: `repetirEscrita: false` existe porque "um POST
 *  que deu timeout pode ter entregue a mensagem". Só que uma camada acima, o
 *  `catch` devolvia `permanente: false` para qualquer erro de rede — e
 *  `permanente: false` liberava a chave de dedupe, reabrindo exatamente a porta
 *  que o HTTP tinha fechado.
 * ========================================================================
 */
export type ClasseDeFalha = "permanente" | "transitoria" | "incerta";

export type ResultadoEnvio =
  | { ok: true; providerMessageId: string }
  | {
      ok: false;
      /** Ver `ClasseDeFalha`. Decide entre repetir, desistir e não saber. */
      classe: ClasseDeFalha;
      codigo: string;
      detalhe: string;
    };

/** Uma mensagem recebida, já normalizada a partir do webhook do provedor. */
export type MensagemRecebida = {
  providerMessageId: string;
  /** E.164 sem '+', canônico. */
  telefone: string;
  texto: string;
  recebidaEm: string;
  /** Nome do perfil no WhatsApp, quando o provedor manda. Ajuda a casar paciente. */
  nomePerfil: string | null;
};

/** Uma atualização de entrega (SENT/DELIVERED/READ/FAILED). */
export type AtualizacaoEntrega = {
  providerMessageId: string;
  status: "SENT" | "DELIVERED" | "READ" | "FAILED";
  erro: string | null;
  em: string;
};

export type WebhookInterpretado = {
  mensagens: MensagemRecebida[];
  entregas: AtualizacaoEntrega[];
};

/** O que a conferência de assinatura precisa saber sobre o pedido recebido. */
export type PedidoWebhook = {
  /** Os bytes exatos, sem parse. */
  corpoCru: string;
  cabecalhos: Headers;
  /**
   * A URL completa como o provedor a chamou, incluindo querystring.
   *
   * ATENÇÃO EM PRODUÇÃO: atrás de proxy, `request.url` pode chegar como `http`
   * mesmo o provedor tendo chamado em `https`, e a assinatura do Twilio
   * quebraria. `WHATSAPP_WEBHOOK_URL` existe para fixar o valor quando isso
   * acontecer.
   */
  url: string;
};

export type PortaMensageria = {
  readonly nome: "meta_cloud" | "twilio" | "sandbox" | "waha";
  /**
   * Este canal recusa texto livre fora da janela de 24 horas?
   *
   * A REGRA É DA META, E NÃO DE "WHATSAPP" EM GERAL. Meta Cloud e Twilio
   * aplicam a janela de atendimento: passadas 24 horas da última mensagem do
   * paciente, só sai template aprovado. O sandbox não aplica — ele não fala
   * com ninguém — e um canal não-oficial como o WAHA também não.
   *
   * Declarar isto na porta, em vez de assumir globalmente, é o que permite a
   * regra valer em produção sem inventar uma restrição onde ela não existe.
   */
  readonly exigeTemplateForaDaJanela: boolean;
  enviarTexto(envio: EnvioTexto): Promise<ResultadoEnvio>;
  enviarTemplate(envio: EnvioTemplate): Promise<ResultadoEnvio>;
  /**
   * Confere a assinatura do webhook — item 195.
   *
   * POR QUE O PEDIDO INTEIRO, E NÃO SÓ O CORPO
   * Porque os dois provedores assinam coisas diferentes. A Meta faz HMAC-SHA256
   * sobre os BYTES CRUS do corpo. O Twilio faz HMAC-SHA1 sobre a URL COMPLETA
   * concatenada com os campos do formulário em ordem alfabética — o corpo cru
   * sozinho não basta, e a URL não estaria disponível se o contrato só
   * passasse o corpo.
   *
   * O corpo vai cru (string) porque a Meta precisa dos bytes exatos: um
   * `JSON.parse` seguido de `stringify` muda ordem de chave e espaçamento, e a
   * conferência falharia sempre.
   */
  verificarAssinatura(pedido: PedidoWebhook): boolean;
  interpretarWebhook(corpo: unknown): WebhookInterpretado;
};

export type EstadoMensageria =
  | { configurado: true; porta: PortaMensageria }
  | { configurado: false; motivo: string; faltando: string[] };
