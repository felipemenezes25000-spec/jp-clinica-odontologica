/**
 * Adapter do WAHA — Fase F, item 23.
 *
 * O QUE É. WAHA (WhatsApp HTTP API) é um servidor que a própria clínica hospeda
 * e que conversa com o WhatsApp Web por trás. Não é API oficial da Meta: é
 * automação do aplicativo, com o número de celular da clínica pareado por QR
 * code.
 *
 * ========================================================================
 * O AVISO QUE PRECISA VIR ANTES DO CÓDIGO, e que não pode ficar escondido
 * numa linha de documentação:
 *
 *   ISTO VIOLA OS TERMOS DE USO DO WHATSAPP. O número pode ser banido, e
 *   quando é, some junto todo o histórico daquele WhatsApp Business. Para
 *   uma clínica, isso significa perder a conversa de meses com cada
 *   paciente — e não há recurso.
 *
 *   NÃO É O PADRÃO, E NÃO DEVE SER. Existe aqui porque o roadmap pediu o
 *   adapter, e porque há um caso legítimo: teste interno e desenvolvimento,
 *   sem esperar aprovação da Meta. Para falar com paciente de verdade, o
 *   caminho é Meta Cloud ou Twilio.
 *
 *   `WHATSAPP_PROVEDOR=waha` EXIGE `WAHA_EU_ACEITO_O_RISCO=1`. Duas
 *   variáveis para a mesma escolha é atrito de propósito: ninguém liga isto
 *   por acidente, e quem liga escreveu, com as próprias mãos, que aceitou.
 * ========================================================================
 *
 * O QUE MUDA EM RELAÇÃO AOS OFICIAIS, além do risco:
 *
 *   SEM JANELA DE 24 HORAS. A regra é da Meta, e este canal não passa por ela.
 *   `exigeTemplateForaDaJanela: false` — e isso NÃO é uma vantagem: significa
 *   que a proteção que impedia a clínica de mandar mensagem para quem não
 *   escreveu há dias simplesmente não existe aqui. A política de contato do
 *   CRC continua valendo, e passa a ser a única barreira.
 *
 *   SEM TEMPLATE APROVADO. Template vira texto comum. O `textoRenderizado` é o
 *   que sai, que é exatamente o que já ficava na Inbox.
 *
 *   ASSINATURA POR SEGREDO COMPARTILHADO, e não HMAC do provedor. WAHA manda
 *   `X-Api-Key` se configurado. É mais fraco do que a assinatura da Meta, e o
 *   código recusa webhook sem chave em vez de aceitar por omissão.
 */
import { timingSafeEqual } from "node:crypto";

import { normalizarTelefone } from "../../dominio/telefone";
import { campo, ehObjeto, lista, textoOpcional } from "../../dominio/validar";
import { caminhoParaLog, entregaFicouIncerta, pedir, type EventoHttp } from "../../servidor/http";
import { registrarIntegracao } from "../../servidor/registro";

import type {
  AtualizacaoEntrega,
  EnvioTemplate,
  EnvioTexto,
  MensagemRecebida,
  PedidoWebhook,
  PortaMensageria,
  ResultadoEnvio,
  WebhookInterpretado,
} from "./porta";

export type ConfigWaha = {
  /** A URL do servidor WAHA da clínica. Ex.: `https://waha.clinica.com.br`. */
  url: string;
  /** `X-Api-Key`. Vazio significa servidor aberto — e o código recusa isso. */
  apiKey: string;
  /** O nome da sessão pareada. WAHA chama de `session`; o padrão dele é `default`. */
  sessao: string;
};

export class ProvedorWaha implements PortaMensageria {
  readonly nome = "waha" as const;

  /**
   * FALSO, E ISTO NÃO É UMA VANTAGEM.
   *
   * A janela de 24 horas é regra da Meta, aplicada pela API oficial. Este canal
   * não passa por ela, então tecnicamente texto livre sai a qualquer hora.
   *
   * O que some junto é a proteção: a janela também impedia a clínica de mandar
   * mensagem para quem não escreve há uma semana. Aqui, a única barreira que
   * resta é a política de contato do CRC — opt-out, horário comercial, cooldown
   * — e ela passa a carregar sozinha um peso que era dividido.
   */
  readonly exigeTemplateForaDaJanela = false;

  private readonly cfg: ConfigWaha;
  private readonly organizationId: string | null;

  constructor(cfg: ConfigWaha, organizationId: string | null) {
    this.cfg = cfg;
    this.organizationId = organizationId;
  }

  private get base(): string {
    return `${this.cfg.url.replace(/\/+$/u, "")}/api/sendText`;
  }

  enviarTexto(envio: EnvioTexto): Promise<ResultadoEnvio> {
    return this.postar(
      {
        session: this.cfg.sessao,
        // WAHA usa o JID do WhatsApp, e não E.164 puro.
        chatId: `${envio.destino.telefone}@c.us`,
        text: envio.texto,
      },
      "enviar_texto",
    );
  }

  /**
   * Template vira TEXTO COMUM.
   *
   * Não há template aprovado fora da API oficial. O `textoRenderizado` já é o
   * que a Inbox mostra e o que o paciente leria — mandar ele é o comportamento
   * honesto. A alternativa seria recusar, e recusar transformaria toda jornada
   * baseada em template em falha silenciosa neste canal.
   */
  enviarTemplate(envio: EnvioTemplate): Promise<ResultadoEnvio> {
    return this.postar(
      {
        session: this.cfg.sessao,
        chatId: `${envio.destino.telefone}@c.us`,
        text: envio.textoRenderizado,
      },
      "enviar_template_como_texto",
    );
  }

  private async postar(corpo: unknown, operacao: string): Promise<ResultadoEnvio> {
    const eventos: EventoHttp[] = [];
    try {
      const resposta = await pedir(this.base, {
        metodo: "POST",
        cabecalhos: this.cfg.apiKey.length > 0 ? { "X-Api-Key": this.cfg.apiKey } : {},
        corpo,
        // Mesma regra dos oficiais: POST que deu timeout pode ter entregue.
        repetirEscrita: false,
        timeoutMs: 20_000,
        aoRegistrar: (e) => eventos.push(e),
      });

      const id =
        textoOpcional(campo(resposta.corpo, "id")) ??
        textoOpcional(campo(resposta.corpo, "_data.id.id"));

      if (resposta.status >= 400 || id === null) {
        const detalhe =
          textoOpcional(campo(resposta.corpo, "message")) ?? resposta.texto.slice(0, 200);
        return {
          ok: false,
          /*
           * O 401/403 AQUI É PERMANENTE, mas com um significado diferente do
           * dos oficiais: normalmente quer dizer que a SESSÃO CAIU — o celular
           * desconectou, ou o número foi banido. Repetir não resolve; alguém
           * precisa parear o QR code de novo.
           */
          // Uma RESPOSTA chegou: não há incerteza nenhuma aqui. 4xx que não é
          // 429 é problema do pedido — número inválido, template não aprovado,
          // janela fechada. Repetir não muda nada.
          classe:
            resposta.status >= 400 && resposta.status < 500 && resposta.status !== 429
              ? "permanente"
              : "transitoria",
          codigo: String(resposta.status),
          detalhe,
        };
      }

      return { ok: true, providerMessageId: id };
    } catch (erro) {
      return {
        ok: false,
        /*
         * AQUI ESTAVA O DEFEITO. `permanente: false` liberava a chave de
         * dedupe, e um timeout DEPOIS de a Meta aceitar virava uma segunda
         * mensagem para o paciente. `entregaFicouIncerta` separa "a conexão
         * foi recusada" de "o pedido saiu e não voltou resposta".
         */
        classe: entregaFicouIncerta(erro) ? "incerta" : "transitoria",
        codigo: "REDE",
        detalhe: erro instanceof Error ? erro.message : String(erro),
      };
    } finally {
      const ultimo = eventos[eventos.length - 1];
      if (ultimo !== undefined) {
        await registrarIntegracao({
          organizationId: this.organizationId,
          integracao: "whatsapp",
          operacao,
          metodo: "POST",
          caminho: caminhoParaLog(this.base),
          statusHttp: ultimo.statusHttp,
          sucesso: ultimo.sucesso,
          erro: ultimo.erro,
          duracaoMs: ultimo.duracaoMs,
        });
      }
    }
  }

  /**
   * WAHA não assina o corpo. O que existe é um segredo compartilhado.
   *
   * SEM CHAVE, RECUSA — e não "aceita porque não dá para verificar". A
   * conferência de webhook existe porque qualquer pessoa que descubra a URL
   * pode inventar "o paciente X disse que quer cancelar", e a automação
   * obedeceria. Um canal que não consegue provar a origem não deve ser tratado
   * como se conseguisse.
   *
   * A comparação é em tempo constante pelo mesmo motivo do resto do sistema:
   * `===` vaza o comprimento do prefixo correto.
   */
  verificarAssinatura(pedido: PedidoWebhook): boolean {
    if (this.cfg.apiKey.length === 0) return false;

    const enviada = pedido.cabecalhos.get("x-api-key") ?? "";
    const a = Buffer.from(enviada);
    const b = Buffer.from(this.cfg.apiKey);
    // `timingSafeEqual` exige tamanhos iguais; o teste de comprimento antes é
    // inevitável e não vaza mais do que o próprio cabeçalho já vaza.
    return a.length === b.length && timingSafeEqual(a, b);
  }

  interpretarWebhook(corpo: unknown): WebhookInterpretado {
    return interpretarWebhookWaha(corpo);
  }
}

/* -------------------------------------------------------------------------- */
/* O webhook                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Normaliza o evento do WAHA para o formato do CRC.
 *
 * WAHA manda `{event, session, payload}`. Os eventos que interessam são
 * `message` (chegou algo) e `message.ack` (status de entrega).
 *
 * MENSAGEM QUE NÓS MANDAMOS TAMBÉM VOLTA, com `fromMe: true` — porque o WAHA
 * espelha o WhatsApp Web, e lá aparece tudo. Tratá-la como recebida faria o
 * agente responder à própria mensagem, num laço que só para quando alguém
 * percebe. É a diferença mais importante em relação aos webhooks oficiais.
 */
export function interpretarWebhookWaha(corpo: unknown): WebhookInterpretado {
  if (!ehObjeto(corpo)) return { mensagens: [], entregas: [], destinatario: null };

  // No WAHA quem identifica o canal é a SESSÃO pareada: uma sessão por número.
  const destinatario = textoOpcional(campo(corpo, "session"));
  const evento = textoOpcional(campo(corpo, "event")) ?? "";
  const payload = campo(corpo, "payload");

  if (evento === "message" || evento === "message.any") {
    if (campo(payload, "fromMe") === true) return { mensagens: [], entregas: [], destinatario };

    const de = textoOpcional(campo(payload, "from")) ?? "";
    // `5511999998888@c.us` → `5511999998888`. Grupo vem como `...@g.us` e é
    // descartado: o CRC fala com paciente, não com grupo.
    if (!de.endsWith("@c.us")) return { mensagens: [], entregas: [], destinatario };

    const telefone = normalizarTelefone(de.replace("@c.us", ""));
    const texto = textoOpcional(campo(payload, "body")) ?? "";
    const id = textoOpcional(campo(payload, "id"));

    if (telefone === null || id === null || texto.length === 0) {
      return { mensagens: [], entregas: [], destinatario };
    }

    const carimbo = campo(payload, "timestamp");
    const mensagem: MensagemRecebida = {
      providerMessageId: id,
      telefone,
      texto,
      // WAHA manda segundos desde a época; o resto do sistema usa ISO.
      recebidaEm:
        typeof carimbo === "number"
          ? new Date(carimbo * 1000).toISOString()
          : new Date().toISOString(),
      nomePerfil: textoOpcional(campo(payload, "_data.notifyName")),
    };

    return { mensagens: [mensagem], entregas: [], destinatario };
  }

  if (evento === "message.ack") {
    const id = textoOpcional(campo(payload, "id"));
    if (id === null) return { mensagens: [], entregas: [], destinatario };

    const entrega: AtualizacaoEntrega = {
      providerMessageId: id,
      status: statusDoAck(campo(payload, "ack")),
      erro: null,
      em: new Date().toISOString(),
    };
    return { mensagens: [], entregas: [entrega], destinatario };
  }

  // Evento desconhecido não é erro: o WAHA emite dezenas de tipos, e a lista
  // cresce entre versões. Ignorar o que não se entende é mais seguro do que
  // adivinhar.
  void lista;
  return { mensagens: [], entregas: [], destinatario };
}

/** O `ack` do WAHA é numérico: 1 enviado, 2 entregue, 3 lido. */
function statusDoAck(ack: unknown): AtualizacaoEntrega["status"] {
  const n = typeof ack === "number" ? ack : Number(ack ?? 0);
  if (n >= 3) return "READ";
  if (n === 2) return "DELIVERED";
  if (n === 1) return "SENT";
  // Zero é "pendente" e negativo é erro. Os dois viram FAILED porque, do ponto
  // de vista da Inbox, "não chegou" é a informação útil.
  return n < 0 ? "FAILED" : "SENT";
}
