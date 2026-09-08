/**
 * Adapter da Cloud API da Meta.
 *
 * Um dos dois provedores de WhatsApp que o CRC fala. O outro é o Twilio, em
 * `twilio.ts`. Os dois implementam `PortaMensageria`, e o domínio não sabe
 * qual está atrás — trocar é mudar `WHATSAPP_PROVEDOR`.
 *
 * QUANDO ESCOLHER ESTE: volume alto e Business Manager já verificado. É o
 * caminho mais barato porque não há intermediário cobrando por mensagem. O
 * preço é o onboarding — app criado, número migrado, revisão da Meta.
 *
 * POR QUE `fetch` DIRETO, E NÃO O SDK: mesma razão do driver do Supabase no
 * portal de RH. O projeto tem cinco dependências de runtime, todas
 * React/TanStack, e o que precisamos daqui é um POST com JSON.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { normalizarTelefone } from "../../dominio/telefone";
import { campo, ehObjeto, lista, textoOpcional } from "../../dominio/validar";
import { caminhoParaLog, pedir, type EventoHttp } from "../../servidor/http";
import { registrar, registrarIntegracao } from "../../servidor/registro";

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

export type ConfigMeta = {
  token: string;
  phoneId: string;
  appSecret: string;
  versao: string;
};

/* -------------------------------------------------------------------------- */
/* Meta Cloud API                                                             */
/* -------------------------------------------------------------------------- */

export class ProvedorMetaCloud implements PortaMensageria {
  readonly nome = "meta_cloud" as const;

  private readonly cfg: ConfigMeta;
  private readonly organizationId: string | null;

  constructor(cfg: ConfigMeta, organizationId: string | null) {
    this.cfg = cfg;
    this.organizationId = organizationId;
  }

  private get base(): string {
    return `https://graph.facebook.com/${this.cfg.versao}/${this.cfg.phoneId}/messages`;
  }

  enviarTexto(envio: EnvioTexto): Promise<ResultadoEnvio> {
    return this.postar(
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: envio.destino.telefone,
        type: "text",
        // `preview_url: false` de propósito: prévia de link numa mensagem de
        // clínica costuma expor o título da página, e o link que mandamos é de
        // agendamento — a prévia não acrescenta nada e ocupa a tela.
        text: { preview_url: false, body: envio.texto },
      },
      "enviar_texto",
    );
  }

  enviarTemplate(envio: EnvioTemplate): Promise<ResultadoEnvio> {
    return this.postar(
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: envio.destino.telefone,
        type: "template",
        template: {
          name: envio.template,
          language: { code: envio.idioma ?? "pt_BR" },
          components:
            envio.variaveis.length === 0
              ? []
              : [
                  {
                    type: "body",
                    parameters: envio.variaveis.map((v) => ({ type: "text", text: v })),
                  },
                ],
        },
      },
      "enviar_template",
    );
  }

  private async postar(corpo: unknown, operacao: string): Promise<ResultadoEnvio> {
    const eventos: EventoHttp[] = [];
    try {
      const resposta = await pedir(this.base, {
        metodo: "POST",
        cabecalhos: { Authorization: `Bearer ${this.cfg.token}` },
        corpo,
        // Item 194: NÃO repetir automaticamente. Um POST que deu timeout pode
        // ter entregue a mensagem, e repetir manda duas.
        repetirEscrita: false,
        timeoutMs: 15_000,
        aoRegistrar: (e) => eventos.push(e),
      });

      const id = textoOpcional(campo(resposta.corpo, "messages.0.id"));

      if (resposta.status >= 400 || id === null) {
        const codigo = String(
          textoOpcional(campo(resposta.corpo, "error.code")) ?? resposta.status,
        );
        const detalhe =
          textoOpcional(campo(resposta.corpo, "error.message")) ?? resposta.texto.slice(0, 200);
        return {
          ok: false,
          // 4xx que não é 429 é problema do pedido: número inválido, template
          // não aprovado, janela de 24h fechada. Repetir não muda nada.
          permanente: resposta.status >= 400 && resposta.status < 500 && resposta.status !== 429,
          codigo,
          detalhe,
        };
      }

      return { ok: true, providerMessageId: id };
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
   * Item 195: webhook anônimo NÃO é aceito.
   *
   * A Meta assina os BYTES CRUS do corpo — por isso `pedido.url` é ignorado
   * aqui, ao contrário do Twilio.
   *
   * Sem esta conferência, qualquer pessoa que descubra a URL pode inventar
   * "mensagem recebida do paciente X dizendo que quer cancelar" — e a
   * automação obedeceria. A comparação é em tempo constante pelo mesmo motivo
   * que a rota de cron do RH usa: `===` vaza o comprimento do prefixo correto.
   */
  verificarAssinatura(pedido: PedidoWebhook): boolean {
    const enviada = pedido.cabecalhos.get("x-hub-signature-256") ?? "";
    if (!enviada.startsWith("sha256=")) return false;

    const esperada =
      "sha256=" +
      createHmac("sha256", this.cfg.appSecret).update(pedido.corpoCru, "utf8").digest("hex");

    const a = Buffer.from(enviada, "utf8");
    const b = Buffer.from(esperada, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  interpretarWebhook(corpo: unknown): WebhookInterpretado {
    return interpretarWebhookMeta(corpo);
  }
}

/**
 * Desmonta o envelope da Meta.
 *
 * O formato é `entry[].changes[].value.{messages[],statuses[]}`, e cada nível
 * pode faltar. Percorrer com `?.` encadeado esconderia de onde veio cada
 * pedaço; os laços explícitos deixam legível o que está sendo procurado.
 *
 * Fora deste arquivo, exportada só para o teste.
 */
export function interpretarWebhookMeta(corpo: unknown): WebhookInterpretado {
  const mensagens: MensagemRecebida[] = [];
  const entregas: AtualizacaoEntrega[] = [];

  for (const entry of lista(campo(corpo, "entry"))) {
    for (const change of lista(campo(entry, "changes"))) {
      const valor = campo(change, "value");

      // Nome do perfil vem numa lista paralela, indexada por wa_id.
      const nomes = new Map<string, string>();
      for (const contato of lista(campo(valor, "contacts"))) {
        const waId = textoOpcional(campo(contato, "wa_id"));
        const nome = textoOpcional(campo(contato, "profile.name"));
        if (waId !== null && nome !== null) nomes.set(waId, nome);
      }

      for (const msg of lista(campo(valor, "messages"))) {
        if (!ehObjeto(msg)) continue;
        const id = textoOpcional(msg["id"]);
        const de = textoOpcional(msg["from"]);
        if (id === null || de === null) continue;

        // Só texto por enquanto. Áudio e imagem chegam, mas tratá-los sem o
        // pipeline de mídia do item 197 seria criar mensagem vazia na Inbox —
        // pior do que registrar que veio algo não suportado.
        const texto =
          textoOpcional(campo(msg, "text.body")) ??
          textoOpcional(campo(msg, "button.text")) ??
          textoOpcional(campo(msg, "interactive.button_reply.title")) ??
          textoOpcional(campo(msg, "interactive.list_reply.title"));

        const tipo = textoOpcional(msg["type"]) ?? "desconhecido";
        const conteudo = texto ?? `[mensagem de ${tipo} recebida — abra no WhatsApp]`;

        const canonico = normalizarTelefone(de) ?? de;
        const carimbo = textoOpcional(msg["timestamp"]);
        const recebidaEm =
          carimbo === null
            ? new Date().toISOString()
            : new Date(Number.parseInt(carimbo, 10) * 1000).toISOString();

        mensagens.push({
          providerMessageId: id,
          telefone: canonico,
          texto: conteudo,
          recebidaEm,
          nomePerfil: nomes.get(de) ?? null,
        });
      }

      for (const st of lista(campo(valor, "statuses"))) {
        if (!ehObjeto(st)) continue;
        const id = textoOpcional(st["id"]);
        const bruto = (textoOpcional(st["status"]) ?? "").toLowerCase();
        if (id === null) continue;

        const mapa: Record<string, AtualizacaoEntrega["status"]> = {
          sent: "SENT",
          delivered: "DELIVERED",
          read: "READ",
          failed: "FAILED",
        };
        const status = mapa[bruto];
        if (status === undefined) continue;

        const carimbo = textoOpcional(st["timestamp"]);
        entregas.push({
          providerMessageId: id,
          status,
          erro: textoOpcional(campo(st, "errors.0.title")),
          em:
            carimbo === null
              ? new Date().toISOString()
              : new Date(Number.parseInt(carimbo, 10) * 1000).toISOString(),
        });
      }
    }
  }

  return { mensagens, entregas };
}
