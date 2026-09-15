/**
 * Os adapters de Instagram Direct e Messenger — §13, §14, §17.
 *
 * ============================================================================
 *  UM ADAPTER PARA OS DOIS, E ISSO NÃO É ATALHO.
 *
 *  Instagram Direct e Messenger usam a MESMA Send API: `POST /{ID}/messages`
 *  com `{messaging_type, recipient:{id}, message:{text}}`. A diferença é o
 *  `{ID}` — id da conta do Instagram ou da Página — e o campo `platform` nos
 *  webhooks.
 *
 *  Escrever dois arquivos quase idênticos criaria o risco que importa: uma
 *  correção aplicada num e não no outro. Já aconteceu neste repositório com a
 *  janela de 24 horas, que existia na porta e em três adapters e não era
 *  chamada por ninguém.
 *
 *  O QUE É DIFERENTE ESTÁ NO CONSTRUTOR, e é pouco: o id da conta e o rótulo do
 *  canal. O resto é o mesmo protocolo.
 * ============================================================================
 *
 * ============================================================================
 *  FORMATOS CONFERIDOS EM 15/09/2026:
 *
 *    Send API      POST /{PAGE_ID|IG_ID}/messages
 *                  {messaging_type:"RESPONSE"|"MESSAGE_TAG",
 *                   tag:"HUMAN_AGENT", recipient:{id}, message:{text}}
 *      https://developers.facebook.com/docs/messenger-platform/reference/send-api/
 *
 *    Private reply POST /{IG_ID}/messages
 *                  {recipient:{comment_id}, message:{text}}
 *                  → {recipient_id, message_id}
 *      https://developers.facebook.com/docs/instagram-platform/private-replies/
 * ============================================================================
 */
import { campo, textoOpcional } from "../../dominio/validar";
import type { DestinoCanal } from "../../dominio/canais";
import type {
  PedidoDeEnvioNoCanal,
  PerfilExterno,
  PortaCanal,
  ResultadoEnvio,
} from "../canais/porta";

import { ClienteDaGraph } from "./cliente";
import type { TipoDeLogin } from "./config";

export type ConfiguracaoDaPorta = {
  /**
   * O id da conta que ENVIA: a conta do Instagram, ou a Página.
   *
   * ==========================================================================
   *  `/me/messages` FUNCIONARIA E NÃO É USADO.
   *
   *  A Meta resolve `/me` pelo token, e o token é de uma Página. Enquanto há um
   *  token, `/me` e `/{PAGE_ID}` são a mesma coisa.
   *
   *  Deixam de ser no dia em que alguém passa o token errado: com `/me`, a
   *  mensagem SAI — pela conta do token — e a clínica B responde o paciente
   *  pela conta da A. Com o id explícito, a Meta recusa com (#200), e o erro
   *  aponta para a configuração em vez de virar uma conversa cruzada.
   * ==========================================================================
   */
  contaId: string;
  token: string;
  login?: TipoDeLogin;
  organizationId: string | null;
};

/* -------------------------------------------------------------------------- */

class PortaMeta implements PortaCanal {
  readonly canal: DestinoCanal["canal"];
  readonly provedor = "meta";

  private readonly cfg: ConfiguracaoDaPorta;
  private readonly cliente: ClienteDaGraph;

  constructor(canal: "instagram" | "messenger", cfg: ConfiguracaoDaPorta) {
    this.canal = canal;
    this.cfg = cfg;
    this.cliente = new ClienteDaGraph({
      token: cfg.token,
      ...(cfg.login === undefined ? {} : { login: cfg.login }),
      organizationId: cfg.organizationId,
      integracao: canal === "instagram" ? "meta_instagram" : "meta_messenger",
    });
  }

  async enviar(pedido: PedidoDeEnvioNoCanal): Promise<ResultadoEnvio> {
    if (pedido.destino.canal !== this.canal) {
      /*
       * DESTINO DE OUTRO CANAL — recusa PERMANENTE, e não uma tentativa.
       *
       * Mandar um IGSID para a API do Messenger devolveria (#100) ou, pior,
       * acertaria um PSID coincidente. Recusar aqui é o que impede uma mensagem
       * ir para a pessoa errada por causa de um destino montado errado três
       * camadas acima.
       */
      return {
        ok: false,
        classe: "permanente",
        codigo: "CANAL_ERRADO",
        detalhe: `Este adapter é de ${this.canal} e recebeu um destino de ${pedido.destino.canal}.`,
      };
    }

    const corpo = this.montarCorpo(pedido);
    if (corpo === null) {
      return {
        ok: false,
        classe: "permanente",
        codigo: "FORMA_NAO_SUPORTADA",
        detalhe: `O canal ${this.canal} não sabe enviar na forma "${pedido.forma.forma}". Instagram e Messenger não têm template aprovado; fora das 24 horas o que existe é a etiqueta de atendimento humano.`,
      };
    }

    const r = await this.cliente.postar(
      `${this.cfg.contaId}/messages`,
      corpo,
      pedido.forma.forma === "private_reply" ? "private_reply" : "enviar_mensagem",
    );

    if (!r.ok) {
      return {
        ok: false,
        classe: r.erro.classe,
        codigo: r.erro.codigo,
        // A AÇÃO ENTRA NO DETALHE. "(#10) Application does not have permission"
        // não diz a ninguém o que fazer; a frase do catálogo diz.
        detalhe: `${r.erro.detalhe} — ${r.erro.acao}`,
      };
    }

    const id = textoOpcional(campo(r.dados, "message_id"));
    if (id === null) {
      /*
       * 200 SEM `message_id` — e isto NÃO é sucesso.
       *
       * A Send API sempre devolve `message_id` quando aceita. Sem ele, ou a
       * versão da Graph mudou o formato, ou a resposta é de outro endpoint.
       * Tratar como sucesso gravaria a mensagem como `SENT` sem
       * `provider_message_id` — e ela nunca receberia status de entrega, ficando
       * "enviada" para sempre sem ninguém saber se chegou.
       */
      return {
        ok: false,
        classe: "incerta",
        codigo: "SEM_MESSAGE_ID",
        detalhe:
          "A Meta respondeu com sucesso mas sem message_id. O envio PODE ter acontecido — não reenvie automaticamente.",
      };
    }

    return { ok: true, providerMessageId: id };
  }

  /**
   * O corpo da Send API, pela forma decidida no domínio.
   *
   * `null` quando a forma não existe neste canal — ver `enviar`.
   */
  private montarCorpo(pedido: PedidoDeEnvioNoCanal): Record<string, unknown> | null {
    const texto = { text: pedido.texto };

    if (pedido.forma.forma === "private_reply") {
      /*
       * O DESTINATÁRIO É O COMENTÁRIO, e não a pessoa — §17.
       *
       * ======================================================================
       *  E É ISSO QUE TORNA O PRIVATE REPLY POSSÍVEL.
       *
       *  A pessoa nunca mandou direct: não há janela de 24 horas aberta, e um
       *  envio para o IGSID dela seria recusado. O `comment_id` é o que a Meta
       *  aceita como autorização — a pessoa comentou em público, e isso vale
       *  como convite por 7 dias.
       *
       *  A resposta traz `recipient_id`, que É o IGSID dela. É a partir dele
       *  que a conversa passa a existir na Inbox — ver `aplicacao/social.ts`.
       * ======================================================================
       */
      if (this.canal !== "instagram") return null;
      return {
        recipient: { comment_id: pedido.forma.comentarioId },
        message: texto,
      };
    }

    if (pedido.forma.forma === "template") {
      // Instagram e Messenger não têm template aprovado. Ver `enviar`.
      return null;
    }

    const recipient = { id: pedido.destino.contato.valor };

    if (pedido.forma.forma === "etiqueta_humana") {
      return {
        messaging_type: "MESSAGE_TAG",
        // A ETIQUETA É UMA AFIRMAÇÃO À META: "uma pessoa está atendendo". Só
        // chega aqui quem passou por `avaliarPoliticaDoCanal` com
        // `quem: "atendente"` — ver o cabeçalho de `canais/porta.ts`.
        tag: "HUMAN_AGENT",
        recipient,
        message: texto,
      };
    }

    return { messaging_type: "RESPONSE", recipient, message: texto };
  }

  /**
   * O perfil de quem escreveu — §24.
   *
   * ============================================================================
   *  NUNCA LANÇA, E NUNCA BLOQUEIA.
   *
   *  Esta chamada é UX: ela troca dezessete dígitos por um `@usuario`. Se
   *  falhar, a mensagem entra na Inbox do mesmo jeito e a tela mostra "Direct
   *  do Instagram".
   *
   *  Deixá-la no caminho crítico do webhook seria trocar a entrega da mensagem
   *  por um enfeite — e ela é justamente a chamada mais provável de bater em
   *  429, porque acontece uma vez por conversa nova.
   * ============================================================================
   */
  async perfil(contatoExterno: string): Promise<PerfilExterno | null> {
    const campos =
      this.canal === "instagram" ? "name,username,profile_pic" : "first_name,last_name,profile_pic";

    const r = await this.cliente.obter(contatoExterno, { fields: campos }, "perfil");
    if (!r.ok) return null;

    const nome =
      textoOpcional(campo(r.dados, "name")) ??
      [textoOpcional(campo(r.dados, "first_name")), textoOpcional(campo(r.dados, "last_name"))]
        .filter((p): p is string => p !== null)
        .join(" ");

    return {
      nome: nome.length > 0 ? nome : null,
      username: textoOpcional(campo(r.dados, "username")),
      fotoUrl: textoOpcional(campo(r.dados, "profile_pic")),
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Fábricas                                                                   */
/* -------------------------------------------------------------------------- */

export function portaInstagram(cfg: ConfiguracaoDaPorta): PortaCanal {
  return new PortaMeta("instagram", cfg);
}

export function portaMessenger(cfg: ConfiguracaoDaPorta): PortaCanal {
  return new PortaMeta("messenger", cfg);
}
