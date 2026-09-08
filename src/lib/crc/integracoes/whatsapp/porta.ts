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

export type ResultadoEnvio =
  | { ok: true; providerMessageId: string }
  | {
      ok: false;
      /**
       * `permanente` decide o destino da falha: repetir ou dead letter.
       * Número inválido é permanente; provedor fora do ar é transitório.
       */
      permanente: boolean;
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

export type PortaMensageria = {
  readonly nome: "meta_cloud" | "sandbox";
  enviarTexto(envio: EnvioTexto): Promise<ResultadoEnvio>;
  enviarTemplate(envio: EnvioTemplate): Promise<ResultadoEnvio>;
  /**
   * Confere a assinatura do webhook — item 195.
   *
   * Recebe o corpo CRU (string), e não o objeto já parseado: a assinatura é
   * calculada sobre os bytes exatos, e `JSON.parse` seguido de `stringify` os
   * altera (ordem de chave, espaçamento) e faz a conferência falhar.
   */
  verificarAssinatura(corpoCru: string, cabecalhos: Headers): boolean;
  interpretarWebhook(corpo: unknown): WebhookInterpretado;
};

export type EstadoMensageria =
  | { configurado: true; porta: PortaMensageria }
  | { configurado: false; motivo: string; faltando: string[] };
