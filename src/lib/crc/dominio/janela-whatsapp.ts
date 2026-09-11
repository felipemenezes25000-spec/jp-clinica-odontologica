/**
 * A janela de 24 horas do WhatsApp — a regra que o CRC estava ignorando.
 *
 * O DEFEITO QUE ISTO CORRIGE: `enviarMensagem` sempre chamou `enviarTexto`.
 * `enviarTemplate` existe na porta e nos três adapters, e nada o chamava. Fora
 * da janela de atendimento a Meta RECUSA texto livre — então toda campanha e
 * toda automação proativa produziriam mensagem que não chega, com erro 131047
 * e nenhuma explicação na tela.
 *
 * A REGRA DA META, em uma frase: depois que o paciente escreve, a clínica tem
 * 24 horas para responder o que quiser. Passadas as 24 horas, só sai template
 * aprovado, até o paciente escrever de novo.
 *
 * Isto é DOMÍNIO e não integração: a regra é do canal, mas a decisão de "posso
 * mandar este texto agora?" é de negócio, precisa ser testada sem rede, e
 * precisa valer igual para os três adapters. O adapter executa; quem decide é
 * aqui.
 */

/** 24 horas em milissegundos. */
export const JANELA_ATENDIMENTO_MS = 24 * 60 * 60 * 1000;

/**
 * Uma margem antes do fim da janela.
 *
 * Sem ela existe a corrida clássica: o código julga a janela aberta faltando
 * dois segundos, a mensagem entra na fila, e quando o provedor a processa a
 * janela fechou. Cinco minutos é folga suficiente para fila e retry, e curto
 * o bastante para não desperdiçar janela boa.
 */
export const MARGEM_JANELA_MS = 5 * 60 * 1000;

export type EstadoJanela =
  /** O paciente escreveu há pouco: texto livre pode sair. */
  | { aberta: true; fechaEm: Date }
  /** Passou das 24h, ou o paciente nunca escreveu: só template aprovado. */
  | { aberta: false; motivo: "expirou" | "nunca_escreveu" };

/**
 * A janela está aberta?
 *
 * `ultimaEntradaEm` é o instante da última mensagem RECEBIDA do paciente —
 * mensagem enviada por nós não reabre nada, e é por isso que o parâmetro se
 * chama "entrada" e não "última mensagem".
 */
export function estadoDaJanela(ultimaEntradaEm: Date | string | null, agora: Date): EstadoJanela {
  if (ultimaEntradaEm === null) return { aberta: false, motivo: "nunca_escreveu" };

  const entrada =
    typeof ultimaEntradaEm === "string" ? new Date(Date.parse(ultimaEntradaEm)) : ultimaEntradaEm;
  if (Number.isNaN(entrada.getTime())) return { aberta: false, motivo: "nunca_escreveu" };

  const fecha = new Date(entrada.getTime() + JANELA_ATENDIMENTO_MS);
  const limite = fecha.getTime() - MARGEM_JANELA_MS;

  if (agora.getTime() >= limite) return { aberta: false, motivo: "expirou" };
  return { aberta: true, fechaEm: fecha };
}

/* -------------------------------------------------------------------------- */
/* O que dá para enviar                                                       */
/* -------------------------------------------------------------------------- */

export type FormaDeEnvio =
  /** Texto livre. Só dentro da janela. */
  | { forma: "texto" }
  /** Template aprovado, com o nome que o provedor conhece. */
  | { forma: "template"; providerNome: string }
  /** Não dá para enviar agora, e o motivo é nomeado. */
  | { forma: "recusado"; codigo: "fora_da_janela_sem_template"; motivo: string };

/**
 * Decide COMO a mensagem sai — ou por que não sai.
 *
 * A ordem importa: a janela é consultada antes do template. Dentro da janela,
 * texto livre é sempre preferível, porque template gasta tarifa de utilidade
 * ou marketing enquanto a resposta dentro da janela é serviço (ver
 * `docs/crc/CUSTO-DAS-MENSAGENS.md`).
 *
 * `providerNome` vem de `crc_templates.provider_nome` — o nome aprovado na
 * Meta. Ter um template no CRC não basta: sem aprovação, o nome não existe do
 * outro lado, e mandar mesmo assim é o mesmo erro com outra roupa.
 */
export function comoEnviar(entrada: {
  janela: EstadoJanela;
  /** O nome aprovado no provedor, quando o modelo de mensagem tem um. */
  providerNome: string | null;
}): FormaDeEnvio {
  if (entrada.janela.aberta) return { forma: "texto" };

  const nome = entrada.providerNome?.trim() ?? "";
  if (nome.length > 0) return { forma: "template", providerNome: nome };

  return {
    forma: "recusado",
    codigo: "fora_da_janela_sem_template",
    motivo:
      entrada.janela.motivo === "nunca_escreveu"
        ? "O paciente nunca escreveu para a clínica, então só um modelo aprovado pode iniciar a conversa."
        : "Passaram-se mais de 24 horas desde a última mensagem do paciente; só um modelo aprovado pode ser enviado.",
  };
}
