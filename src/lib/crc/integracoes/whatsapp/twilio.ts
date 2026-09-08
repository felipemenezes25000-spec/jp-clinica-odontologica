/**
 * Adapter do Twilio para WhatsApp.
 *
 * O outro provedor é a Meta Cloud (`meta-cloud.ts`). Os dois implementam
 * `PortaMensageria`, e o domínio não sabe qual está atrás: trocar é mudar
 * `WHATSAPP_PROVEDOR`.
 *
 * QUANDO ESCOLHER ESTE: para começar. O sandbox do Twilio manda mensagem no
 * mesmo dia, sem Business Manager verificado nem revisão de app. Ele cobra uma
 * taxa por mensagem em cima do preço de conversa da Meta — irrelevante perto
 * de duas semanas parado esperando verificação, e reversível depois sem
 * reescrever nada.
 *
 * AS TRÊS COISAS QUE ELE FAZ DIFERENTE DA META, e que justificam este arquivo:
 *
 *   1. O corpo do envio é `application/x-www-form-urlencoded`, não JSON.
 *      Mandar JSON devolve 400 sem explicar o motivo.
 *
 *   2. A assinatura é HMAC-SHA1 sobre a URL COMPLETA concatenada com os campos
 *      do formulário em ordem alfabética — e não sobre os bytes do corpo. É por
 *      isso que `verificarAssinatura` recebe o pedido inteiro, e não só o corpo.
 *
 *   3. O webhook chega form-urlencoded, com nomes de campo em PascalCase
 *      (`MessageSid`, `From`, `Body`), e não no envelope aninhado da Meta.
 *
 * O NÚMERO VIAJA COM O PREFIXO `whatsapp:` em toda a API do Twilio. A forma
 * canônica do CRC (E.164 sem '+') não tem esse prefixo, então a conversão
 * acontece SÓ nas bordas deste arquivo — nada fora daqui vê `whatsapp:`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { normalizarTelefone } from "../../dominio/telefone";
import { caminhoParaLog, pedir, type EventoHttp } from "../../servidor/http";
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

export type ConfigTwilio = {
  accountSid: string;
  authToken: string;
  /** O número remetente, em E.164 sem '+' (o prefixo é adicionado aqui). */
  numeroDe: string;
  /**
   * URL pública do webhook, quando `request.url` não é confiável.
   *
   * Atrás de proxy — e a Vercel é um — a URL que chega ao handler pode vir
   * como `http` mesmo o Twilio tendo chamado em `https`. A assinatura é
   * calculada sobre a URL, então um esquema diferente a quebra por inteiro, e
   * o sintoma é "todo webhook é recusado" sem nenhuma pista melhor.
   */
  urlWebhook: string | null;
};

/** `5511999998888` → `whatsapp:+5511999998888`. Só usado nas bordas. */
function paraTwilio(telefoneCanonico: string): string {
  return `whatsapp:+${telefoneCanonico}`;
}

/** `whatsapp:+5511999998888` → `5511999998888`, canônico. */
function deTwilio(valor: string): string | null {
  const limpo = valor.replace(/^whatsapp:/iu, "").trim();
  return normalizarTelefone(limpo);
}

export class ProvedorTwilio implements PortaMensageria {
  readonly nome = "twilio" as const;

  private readonly cfg: ConfigTwilio;
  private readonly organizationId: string | null;

  constructor(cfg: ConfigTwilio, organizationId: string | null) {
    this.cfg = cfg;
    this.organizationId = organizationId;
  }

  private get url(): string {
    return `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
      this.cfg.accountSid,
    )}/Messages.json`;
  }

  /** Basic auth: `AccountSid:AuthToken` em base64. É o que o Twilio usa. */
  private get autorizacao(): string {
    const par = `${this.cfg.accountSid}:${this.cfg.authToken}`;
    return `Basic ${Buffer.from(par, "utf8").toString("base64")}`;
  }

  enviarTexto(envio: EnvioTexto): Promise<ResultadoEnvio> {
    return this.postar(
      {
        From: paraTwilio(this.cfg.numeroDe),
        To: paraTwilio(envio.destino.telefone),
        Body: envio.texto,
      },
      "enviar_texto",
    );
  }

  /**
   * Template aprovado.
   *
   * O Twilio moderno usa Content Templates: `ContentSid` identifica o modelo e
   * `ContentVariables` leva um JSON `{"1":"Maria","2":"14:30"}` — as variáveis
   * são numeradas por posição, e não por nome.
   *
   * Quando `template` não parece um Content SID (`HX...`), caímos para texto
   * simples com o conteúdo já renderizado. Isso é o que faz o sandbox e a
   * janela de 24h funcionarem sem nenhum template cadastrado — e é seguro
   * porque, dentro da janela, mensagem livre é permitida.
   */
  enviarTemplate(envio: EnvioTemplate): Promise<ResultadoEnvio> {
    const ehContentSid = /^HX[0-9a-f]{32}$/iu.test(envio.template);

    if (!ehContentSid) {
      return this.postar(
        {
          From: paraTwilio(this.cfg.numeroDe),
          To: paraTwilio(envio.destino.telefone),
          Body: envio.textoRenderizado,
        },
        "enviar_template_como_texto",
      );
    }

    const variaveis: Record<string, string> = {};
    envio.variaveis.forEach((v, i) => {
      variaveis[String(i + 1)] = v;
    });

    return this.postar(
      {
        From: paraTwilio(this.cfg.numeroDe),
        To: paraTwilio(envio.destino.telefone),
        ContentSid: envio.template,
        ContentVariables: JSON.stringify(variaveis),
      },
      "enviar_template",
    );
  }

  private async postar(campos: Record<string, string>, operacao: string): Promise<ResultadoEnvio> {
    const eventos: EventoHttp[] = [];
    try {
      const resposta = await pedir(this.url, {
        metodo: "POST",
        cabecalhos: { Authorization: this.autorizacao },
        corpo: campos,
        // A diferença número 1 em relação à Meta.
        formato: "form",
        // Item 194: NÃO repetir automaticamente. Um POST que deu timeout pode
        // ter entregue a mensagem, e repetir manda duas.
        repetirEscrita: false,
        timeoutMs: 15_000,
        aoRegistrar: (e) => eventos.push(e),
      });

      const corpo = resposta.corpo as Record<string, unknown> | null;
      const sid = typeof corpo?.["sid"] === "string" ? corpo["sid"] : null;

      if (resposta.status >= 400 || sid === null) {
        const codigo = String(corpo?.["code"] ?? resposta.status);
        const detalhe =
          typeof corpo?.["message"] === "string" ? corpo["message"] : resposta.texto.slice(0, 200);

        return {
          ok: false,
          // 4xx que não é 429 é problema do pedido: número inválido, template
          // não aprovado, janela de 24h fechada. Repetir não muda nada.
          permanente: resposta.status >= 400 && resposta.status < 500 && resposta.status !== 429,
          codigo,
          detalhe,
        };
      }

      return { ok: true, providerMessageId: sid };
    } catch (erro) {
      return {
        ok: false,
        permanente: false,
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
          caminho: caminhoParaLog(this.url),
          statusHttp: ultimo.statusHttp,
          sucesso: ultimo.sucesso,
          erro: ultimo.erro,
          duracaoMs: ultimo.duracaoMs,
        });
      }
    }
  }

  /**
   * Item 195, versão Twilio.
   *
   * O algoritmo é: pegue a URL completa, concatene cada par `chave+valor` do
   * formulário em ORDEM ALFABÉTICA de chave (sem separador nenhum), faça
   * HMAC-SHA1 com o auth token, e compare em base64 com `X-Twilio-Signature`.
   *
   * A ordenação é a parte que quebra silenciosamente se feita errado:
   * `URLSearchParams` preserva a ordem de chegada, não a alfabética.
   *
   * Sem esta conferência, qualquer pessoa que descubra a URL pode inventar "o
   * paciente X quer cancelar" — e a automação obedeceria.
   */
  verificarAssinatura(pedido: PedidoWebhook): boolean {
    const enviada = pedido.cabecalhos.get("x-twilio-signature") ?? "";
    if (enviada.length === 0) return false;

    const url = this.cfg.urlWebhook ?? pedido.url;

    const params = new URLSearchParams(pedido.corpoCru);
    const chaves = [...new Set([...params.keys()])].sort();
    let concatenado = url;
    for (const chave of chaves) {
      concatenado += chave + (params.get(chave) ?? "");
    }

    const esperada = createHmac("sha1", this.cfg.authToken)
      .update(Buffer.from(concatenado, "utf8"))
      .digest("base64");

    const a = Buffer.from(enviada, "utf8");
    const b = Buffer.from(esperada, "utf8");
    // Tamanhos diferentes já reprovam; comparar assim evita que a própria
    // diferença de tamanho vire o vazamento pelo tempo.
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  interpretarWebhook(corpo: unknown): WebhookInterpretado {
    return interpretarWebhookTwilio(corpo);
  }
}

/**
 * Desmonta o formulário do Twilio.
 *
 * Diferente da Meta, cada webhook traz UMA coisa: ou uma mensagem recebida, ou
 * um status de entrega. O que distingue é a presença de `MessageStatus`.
 *
 * Exportada para o teste.
 */
export function interpretarWebhookTwilio(corpo: unknown): WebhookInterpretado {
  const campos = paraMapa(corpo);
  const mensagens: MensagemRecebida[] = [];
  const entregas: AtualizacaoEntrega[] = [];

  const sid = campos["MessageSid"] ?? campos["SmsSid"] ?? campos["SmsMessageSid"];
  if (sid === undefined || sid.length === 0) return { mensagens, entregas };

  const statusBruto = (campos["MessageStatus"] ?? campos["SmsStatus"] ?? "").toLowerCase();

  if (statusBruto.length > 0) {
    const mapa: Record<string, AtualizacaoEntrega["status"]> = {
      queued: "SENT",
      sending: "SENT",
      sent: "SENT",
      delivered: "DELIVERED",
      read: "READ",
      failed: "FAILED",
      undelivered: "FAILED",
    };
    const status = mapa[statusBruto];
    if (status !== undefined) {
      const codigoErro = campos["ErrorCode"];
      entregas.push({
        providerMessageId: sid,
        status,
        erro:
          codigoErro === undefined || codigoErro.length === 0
            ? null
            : `Twilio ${codigoErro}: ${campos["ErrorMessage"] ?? "sem detalhe"}`,
        em: new Date().toISOString(),
      });
    }
    return { mensagens, entregas };
  }

  const de = campos["From"];
  if (de === undefined) return { mensagens, entregas };

  const telefone = deTwilio(de);
  if (telefone === null) return { mensagens, entregas };

  // Só texto por enquanto, como no adapter da Meta. Mídia chega com
  // `NumMedia > 0`; tratá-la sem o pipeline do item 197 criaria mensagem vazia
  // na Inbox — pior do que registrar que veio algo não suportado.
  const corpoTexto = campos["Body"] ?? "";
  const numeroDeMidias = Number.parseInt(campos["NumMedia"] ?? "0", 10);
  const conteudo =
    corpoTexto.trim().length > 0
      ? corpoTexto
      : Number.isFinite(numeroDeMidias) && numeroDeMidias > 0
        ? "[mensagem com mídia recebida — abra no WhatsApp]"
        : "[mensagem vazia recebida]";

  mensagens.push({
    providerMessageId: sid,
    telefone,
    texto: conteudo,
    recebidaEm: new Date().toISOString(),
    nomePerfil: campos["ProfileName"] ?? null,
  });

  return { mensagens, entregas };
}

/**
 * Aceita tanto o texto cru do formulário quanto um objeto já desmontado.
 *
 * A rota entrega o objeto; o teste acha mais legível passar a string. Os dois
 * caminhos existem porque nenhum dos dois custa nada.
 */
function paraMapa(corpo: unknown): Record<string, string> {
  if (typeof corpo === "string") {
    return Object.fromEntries(new URLSearchParams(corpo).entries());
  }
  if (typeof corpo === "object" && corpo !== null) {
    const saida: Record<string, string> = {};
    for (const [chave, valor] of Object.entries(corpo as Record<string, unknown>)) {
      if (typeof valor === "string") saida[chave] = valor;
      else if (typeof valor === "number" || typeof valor === "boolean")
        saida[chave] = String(valor);
    }
    return saida;
  }
  return {};
}
