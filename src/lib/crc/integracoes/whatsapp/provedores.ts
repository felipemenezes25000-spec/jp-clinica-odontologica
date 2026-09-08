/**
 * O sandbox de mensageria e a fábrica que escolhe o provedor.
 *
 * Os adapters reais moram em `meta-cloud.ts` e `twilio.ts`. Este arquivo é o
 * ponto único em que se decide qual deles sobe — e a decisão é uma variável de
 * ambiente, `WHATSAPP_PROVEDOR`.
 *
 * POR QUE OS DOIS, E NÃO SÓ UM
 * Porque a escolha é comercial e ainda não foi feita. O Twilio manda mensagem
 * no mesmo dia; a Meta Cloud é mais barata no volume mas exige Business Manager
 * verificado e revisão de app. Manter os dois atrás da mesma porta significa
 * contratar o que for mais rápido agora e migrar pelo preço depois, sem
 * reescrever motor, jornada nem Inbox.
 *
 * O ITEM 11 DO MEGA PROMPT — "integrar exclusivamente através de canal
 * oficial/API compatível; evitar automação de WhatsApp Web" — está cumprido por
 * construção nos dois: não existe caminho aqui que abra navegador ou fale com
 * `web.whatsapp.com`.
 *
 * ESTADO: `BLOQUEADO_POR_CREDENCIAL` (item 248) nos dois. Nenhum provedor foi
 * contratado ainda.
 */
import { normalizarTelefone } from "../../dominio/telefone";
import { ehObjeto } from "../../dominio/validar";
import { registrar } from "../../servidor/registro";

import { ProvedorMetaCloud, interpretarWebhookMeta } from "./meta-cloud";
import { ProvedorTwilio } from "./twilio";
import type {
  EnvioTemplate,
  EnvioTexto,
  EstadoMensageria,
  PortaMensageria,
  ResultadoEnvio,
  WebhookInterpretado,
} from "./porta";

export { interpretarWebhookMeta } from "./meta-cloud";
export { interpretarWebhookTwilio } from "./twilio";

/* -------------------------------------------------------------------------- */
/* Sandbox                                                                    */
/* -------------------------------------------------------------------------- */

export type MensagemSandbox = {
  telefone: string;
  texto: string;
  providerMessageId: string;
  em: string;
};

/**
 * O provedor de mentira.
 *
 * NÃO ENVIA NADA. Grava numa lista em memória para a tela de teste mostrar o
 * que teria sido enviado — que é exatamente o que o modo SHADOW do item 96
 * precisa, e o que permite validar templates antes de existir contrato com
 * qualquer provedor.
 */
class ProvedorSandbox implements PortaMensageria {
  readonly nome = "sandbox" as const;

  private readonly enviadas: MensagemSandbox[] = [];
  private contador = 0;

  enviarTexto(envio: EnvioTexto): Promise<ResultadoEnvio> {
    return Promise.resolve(this.registrar(envio.destino.telefone, envio.texto));
  }

  enviarTemplate(envio: EnvioTemplate): Promise<ResultadoEnvio> {
    return Promise.resolve(this.registrar(envio.destino.telefone, envio.textoRenderizado));
  }

  private registrar(telefone: string, texto: string): ResultadoEnvio {
    this.contador += 1;
    const providerMessageId = `sandbox-${String(this.contador)}`;
    this.enviadas.push({ telefone, texto, providerMessageId, em: new Date().toISOString() });
    registrar("info", "[sandbox] mensagem NÃO enviada — só registrada.", {
      telefone,
      trecho: texto.slice(0, 80),
    });
    return { ok: true, providerMessageId };
  }

  /** O sandbox aceita qualquer webhook: ele só é alcançável fora de produção. */
  verificarAssinatura(): boolean {
    return true;
  }

  /**
   * Aceita três formatos: o envelope da Meta, o formulário do Twilio, e o
   * atalho `{ telefone, texto }` — que existe para simular resposta de paciente
   * com um curl de uma linha durante o desenvolvimento.
   */
  interpretarWebhook(corpo: unknown): WebhookInterpretado {
    if (!ehObjeto(corpo) || typeof corpo["telefone"] !== "string") {
      return interpretarWebhookMeta(corpo);
    }

    const telefone = normalizarTelefone(String(corpo["telefone"]));
    if (telefone === null) return { mensagens: [], entregas: [] };

    this.contador += 1;
    return {
      mensagens: [
        {
          providerMessageId: `sandbox-in-${String(this.contador)}`,
          telefone,
          texto: String(corpo["texto"] ?? ""),
          recebidaEm: new Date().toISOString(),
          nomePerfil: typeof corpo["nome"] === "string" ? corpo["nome"] : null,
        },
      ],
      entregas: [],
    };
  }

  listarEnviadas(): readonly MensagemSandbox[] {
    return this.enviadas;
  }
}

let sandbox: ProvedorSandbox | null = null;

export function obterSandboxMensageria(): ProvedorSandbox {
  sandbox ??= new ProvedorSandbox();
  return sandbox;
}

export function _reiniciarSandboxMensageria(): void {
  sandbox = null;
}

/* -------------------------------------------------------------------------- */
/* Fábrica                                                                    */
/* -------------------------------------------------------------------------- */

export type EscolhaProvedor = "twilio" | "meta" | "sandbox";

/**
 * Qual provedor usar.
 *
 * `WHATSAPP_PROVEDOR` decide. Sem ela, o padrão é `twilio` — não por
 * preferência técnica, mas porque é o que permite estar enviando amanhã, e
 * porque a variável ausente significa "ninguém escolheu ainda".
 */
export function provedorEscolhido(): EscolhaProvedor {
  const bruto = (process.env["WHATSAPP_PROVEDOR"] ?? "").trim().toLowerCase();
  if (bruto === "meta" || bruto === "meta_cloud") return "meta";
  if (bruto === "sandbox") return "sandbox";
  return "twilio";
}

/**
 * Monta o provedor, ou diz exatamente o que falta.
 *
 * Mesma trava do Dental Office: sandbox só fora de produção. Um WhatsApp de
 * mentira em produção seria pior do que nenhum — a operação acharia que as
 * mensagens saíram.
 */
export function criarProvedorMensageria(organizationId: string | null): EstadoMensageria {
  const producao = process.env["NODE_ENV"] === "production";
  const pediuSandbox =
    (process.env["WHATSAPP_SANDBOX"] ?? "").trim() === "1" || provedorEscolhido() === "sandbox";

  if (pediuSandbox && !producao) {
    return { configurado: true, porta: obterSandboxMensageria() };
  }

  return provedorEscolhido() === "meta" ? criarMeta(organizationId) : criarTwilio(organizationId);
}

function criarTwilio(organizationId: string | null): EstadoMensageria {
  const accountSid = (process.env["TWILIO_ACCOUNT_SID"] ?? "").trim();
  const authToken = (process.env["TWILIO_AUTH_TOKEN"] ?? "").trim();
  const numeroBruto = (process.env["TWILIO_WHATSAPP_FROM"] ?? "").trim();

  const faltando: string[] = [];
  if (accountSid.length === 0) faltando.push("TWILIO_ACCOUNT_SID");
  if (authToken.length === 0) faltando.push("TWILIO_AUTH_TOKEN");
  if (numeroBruto.length === 0) faltando.push("TWILIO_WHATSAPP_FROM");

  if (faltando.length > 0) {
    return {
      configurado: false,
      motivo: "O WhatsApp (Twilio) ainda não foi configurado.",
      faltando,
    };
  }

  // O número remetente é normalizado na entrada, e não a cada envio: um número
  // mal digitado na variável de ambiente falharia em toda mensagem, e o erro
  // apareceria como "Twilio 21211" em vez de "a configuração está errada".
  const numeroDe = normalizarTelefone(numeroBruto);
  if (numeroDe === null) {
    return {
      configurado: false,
      motivo: `TWILIO_WHATSAPP_FROM não parece um telefone válido: "${numeroBruto}".`,
      faltando: ["TWILIO_WHATSAPP_FROM"],
    };
  }

  const urlWebhook = (process.env["WHATSAPP_WEBHOOK_URL"] ?? "").trim();

  return {
    configurado: true,
    porta: new ProvedorTwilio(
      {
        accountSid,
        authToken,
        numeroDe,
        urlWebhook: urlWebhook.length > 0 ? urlWebhook : null,
      },
      organizationId,
    ),
  };
}

function criarMeta(organizationId: string | null): EstadoMensageria {
  const token = (process.env["WHATSAPP_TOKEN"] ?? "").trim();
  const phoneId = (process.env["WHATSAPP_PHONE_ID"] ?? "").trim();
  const appSecret = (process.env["WHATSAPP_APP_SECRET"] ?? "").trim();

  const faltando: string[] = [];
  if (token.length === 0) faltando.push("WHATSAPP_TOKEN");
  if (phoneId.length === 0) faltando.push("WHATSAPP_PHONE_ID");
  if (appSecret.length === 0) faltando.push("WHATSAPP_APP_SECRET");

  if (faltando.length > 0) {
    return {
      configurado: false,
      motivo: "O WhatsApp (Meta Cloud) ainda não foi configurado.",
      faltando,
    };
  }

  return {
    configurado: true,
    porta: new ProvedorMetaCloud(
      {
        token,
        phoneId,
        appSecret,
        versao: (process.env["WHATSAPP_API_VERSAO"] ?? "v21.0").trim(),
      },
      organizationId,
    ),
  };
}
