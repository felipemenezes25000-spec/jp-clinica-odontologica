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
import { ProvedorWaha } from "./waha";
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
export { interpretarWebhookWaha } from "./waha";

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
  // Sandbox nao fala com ninguem: nao ha janela para respeitar.
  readonly exigeTemplateForaDaJanela = false;

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
    if (telefone === null) return { mensagens: [], entregas: [], destinatario: null };

    this.contador += 1;
    return {
      // O sandbox tem um canal só; rotear nele não faz sentido.
      destinatario: null,
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

export type EscolhaProvedor = "twilio" | "meta" | "sandbox" | "waha";

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
  if (bruto === "waha") return "waha";
  return "twilio";
}

/**
 * Monta o provedor, ou diz exatamente o que falta.
 *
 * Mesma trava do Dental Office: sandbox só fora de produção. Um WhatsApp de
 * mentira em produção seria pior do que nenhum — a operação acharia que as
 * mensagens saíram.
 */
export async function criarProvedorMensageria(
  organizationId: string | null,
  clinicId: string | null = null,
): Promise<EstadoMensageria> {
  const producao = process.env["NODE_ENV"] === "production";
  const pediuSandbox =
    (process.env["WHATSAPP_SANDBOX"] ?? "").trim() === "1" || provedorEscolhido() === "sandbox";

  if (pediuSandbox && !producao) {
    return { configurado: true, porta: obterSandboxMensageria() };
  }

  /*
   * O CANAL DA CLÍNICA VEM PRIMEIRO, e o ambiente é o último degrau.
   *
   * `crc_canais_whatsapp` existe desde o `supabase/23` e ninguém a lia para
   * ENVIAR — só para rotear a entrada. O resultado era metade da fronteira: a
   * mensagem da Clínica B entrava certo e SAÍA pelo número do ambiente, que é o
   * da A. Do lado do paciente, uma clínica que ele não conhece respondendo.
   */
  if (organizationId !== null && organizationId.length > 0) {
    const { credenciaisWhatsapp, ehCaminhoDoAmbiente } = await import("../credenciais");
    const r = await credenciaisWhatsapp(organizationId, clinicId);

    if (r.ok) return doCanal(r.credenciais, organizationId);
    if (!ehCaminhoDoAmbiente(r)) {
      return { configurado: false, motivo: r.motivo, faltando: r.faltando };
    }
  }

  return doAmbiente(organizationId);
}

/**
 * O provedor montado a partir do canal cadastrado.
 *
 * O `identificador` faz dobradinha: é a chave de ROTEAMENTO na entrada (o
 * `phone_number_id` que a Meta manda, o número que o Twilio recebeu, a sessão
 * do WAHA) e é a identidade de ENVIO na saída. Guardar os dois separados abriria
 * a possibilidade de responder por um número diferente do que recebeu.
 */
function doCanal(
  canal: {
    provedor: string;
    identificador: string;
    segredo: string;
    config: Readonly<Record<string, unknown>>;
  },
  organizationId: string,
): EstadoMensageria {
  const texto = (chave: string, padrao = ""): string => {
    const v = canal.config[chave];
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : padrao;
  };

  if (canal.provedor === "meta_cloud" || canal.provedor === "meta") {
    const appSecret = texto("appSecret");
    if (appSecret.length === 0) {
      return {
        configurado: false,
        motivo:
          "O canal da Meta Cloud desta clínica está sem `appSecret` na configuração — sem ele não dá para conferir a assinatura do webhook.",
        faltando: ["config.appSecret"],
      };
    }
    return {
      configurado: true,
      porta: new ProvedorMetaCloud(
        {
          token: canal.segredo,
          phoneId: canal.identificador,
          appSecret,
          versao: texto("versao", "v21.0"),
        },
        organizationId,
      ),
    };
  }

  if (canal.provedor === "twilio") {
    const accountSid = texto("accountSid");
    if (accountSid.length === 0) {
      return {
        configurado: false,
        motivo: "O canal do Twilio desta clínica está sem `accountSid` na configuração.",
        faltando: ["config.accountSid"],
      };
    }
    const numeroDe = normalizarTelefone(canal.identificador);
    if (numeroDe === null) {
      return {
        configurado: false,
        motivo: `O identificador do canal Twilio não parece um telefone: "${canal.identificador}".`,
        faltando: ["identificador"],
      };
    }
    const urlWebhook = texto("urlWebhook");
    return {
      configurado: true,
      porta: new ProvedorTwilio(
        {
          accountSid,
          authToken: canal.segredo,
          numeroDe,
          urlWebhook: urlWebhook.length > 0 ? urlWebhook : null,
        },
        organizationId,
      ),
    };
  }

  if (canal.provedor === "waha") {
    // A MESMA TRAVA DUPLA DO AMBIENTE. Cadastrar o canal no banco não pode
    // virar um atalho para ligar o WAHA sem alguém aceitar o risco — ver
    // `criarWaha`.
    if ((process.env["WAHA_EU_ACEITO_O_RISCO"] ?? "").trim() !== "1") {
      return {
        configurado: false,
        motivo:
          "O canal desta clínica é WAHA, que não é API oficial do WhatsApp. Para usar, defina WAHA_EU_ACEITO_O_RISCO=1.",
        faltando: ["WAHA_EU_ACEITO_O_RISCO"],
      };
    }
    const url = texto("url");
    if (url.length === 0) {
      return {
        configurado: false,
        motivo: "O canal WAHA desta clínica está sem `url` na configuração.",
        faltando: ["config.url"],
      };
    }
    return {
      configurado: true,
      porta: new ProvedorWaha(
        { url, apiKey: canal.segredo, sessao: canal.identificador },
        organizationId,
      ),
    };
  }

  return {
    configurado: false,
    motivo: `Canal de WhatsApp com provedor desconhecido: "${canal.provedor}".`,
    faltando: [],
  };
}

function doAmbiente(organizationId: string | null): EstadoMensageria {
  const escolha = provedorEscolhido();
  if (escolha === "waha") return criarWaha(organizationId);
  return escolha === "meta" ? criarMeta(organizationId) : criarTwilio(organizationId);
}

/**
 * O provedor de UM CANAL, para a entrada roteada por tenant.
 *
 * ============================================================================
 *  É O QUE FALTAVA PARA O SAAS SER VERDADEIRO NA ENTRADA.
 *
 *  `provedorParaWebhook()` monta o adapter do AMBIENTE. Isso funciona enquanto
 *  todos os números vivem dentro do mesmo Meta App (ou da mesma conta Twilio) —
 *  o `app secret` é do aplicativo, e um aplicativo atende vários números.
 *
 *  Deixa de funcionar no instante em que dois clientes trazem os PRÓPRIOS
 *  aplicativos. Aí a assinatura da mensagem do tenant B é calculada com o
 *  segredo de B, e verificá-la com o segredo de A recusa mensagem legítima —
 *  ou, se A for o único cadastrado, aceita como B qualquer coisa assinada por A.
 *
 *  Aqui o adapter é montado com a credencial DAQUELE canal, e a assinatura é
 *  conferida com ela.
 * ============================================================================
 *
 * DEVOLVE O CANAL JUNTO, e não só a porta: quem chama precisa do tenant para
 * conferir que o destinatário do payload é mesmo este canal, e para gravar o
 * inbox já com organização e clínica.
 */
export async function provedorDoCanal(
  canalId: string,
): Promise<
  { ok: true; porta: PortaMensageria; canal: CanalDoWebhook } | { ok: false; motivo: string }
> {
  const { canalPorId } = await import("../credenciais");
  const canal = await canalPorId(canalId);

  if (canal === null) {
    return { ok: false, motivo: "Canal não encontrado, desativado, ou com segredo ilegível." };
  }

  const estado = doCanal(
    {
      provedor: canal.provedor,
      identificador: canal.identificador,
      // O SEGREDO DE ENVIO PODE SER VAZIO. Um canal cadastrado só para rotear a
      // entrada é legítimo — o que a verificação de assinatura usa é o
      // `appSecret` do `config`, e não isto.
      segredo: canal.segredo ?? "",
      config: canal.config,
    },
    canal.organizationId,
  );

  if (!estado.configurado) return { ok: false, motivo: estado.motivo };

  return {
    ok: true,
    porta: estado.porta,
    canal: {
      id: canal.id,
      organizationId: canal.organizationId,
      clinicId: canal.clinicId,
      provedor: canal.provedor,
      identificador: canal.identificador,
      config: canal.config,
    },
  };
}

export type CanalDoWebhook = {
  id: string;
  organizationId: string;
  clinicId: string;
  provedor: string;
  identificador: string;
  config: Readonly<Record<string, unknown>>;
};

/**
 * O provedor do WEBHOOK DE ENTRADA — e ele é do ambiente de propósito.
 *
 * A ROTA DE ENTRADA NÃO SABE DE QUEM É A MENSAGEM ANTES DE LER O CORPO. É
 * justamente `interpretarWebhook` que extrai o destinatário que depois resolve o
 * tenant. Pedir a credencial da clínica aqui seria circular.
 *
 * E ISSO É ARQUITETURALMENTE CERTO PARA A META: a assinatura do webhook usa o
 * `app secret`, que é do APLICATIVO, não do número — um aplicativo atende vários
 * números, de vários tenants. Para o Twilio o token é da conta, e ali a
 * verificação por ambiente é uma limitação real, registrada no relatório.
 *
 * SEPARADO EM FUNÇÃO PRÓPRIA para que ninguém use este caminho por engano no
 * envio, que é onde a credencial errada escreve no mundo.
 */
export function provedorParaWebhook(): EstadoMensageria {
  const producao = process.env["NODE_ENV"] === "production";
  const pediuSandbox =
    (process.env["WHATSAPP_SANDBOX"] ?? "").trim() === "1" || provedorEscolhido() === "sandbox";

  if (pediuSandbox && !producao) {
    return { configurado: true, porta: obterSandboxMensageria() };
  }
  return doAmbiente(null);
}

/**
 * O WAHA, com a trava dupla — Fase F.
 *
 * `WHATSAPP_PROVEDOR=waha` NÃO BASTA. É preciso também
 * `WAHA_EU_ACEITO_O_RISCO=1`, e a duplicação é atrito de propósito.
 *
 * O RISCO, dito sem rodeio: o WAHA automatiza o WhatsApp Web com o número da
 * clínica, o que viola os termos de uso. O número pode ser banido — e quando é,
 * some junto todo o histórico daquele WhatsApp Business. Meses de conversa com
 * cada paciente, sem recurso.
 *
 * Uma variável só seria fácil demais de copiar de um tutorial. Duas exigem que
 * alguém escreva, com as próprias mãos, que aceitou o risco — e deixam no
 * ambiente um registro de quem decidiu.
 */
function criarWaha(organizationId: string | null): EstadoMensageria {
  if ((process.env["WAHA_EU_ACEITO_O_RISCO"] ?? "").trim() !== "1") {
    return {
      configurado: false,
      motivo:
        "O WAHA não é API oficial do WhatsApp: ele automatiza o WhatsApp Web e viola os termos de uso. O número pode ser banido, e com ele some o histórico inteiro de conversas da clínica. Para usar mesmo assim, defina WAHA_EU_ACEITO_O_RISCO=1.",
      faltando: ["WAHA_EU_ACEITO_O_RISCO"],
    };
  }

  const url = (process.env["WAHA_URL"] ?? "").trim();
  const apiKey = (process.env["WAHA_API_KEY"] ?? "").trim();
  const sessao = (process.env["WAHA_SESSAO"] ?? "default").trim();

  const faltando: string[] = [];
  if (url.length === 0) faltando.push("WAHA_URL");
  // A CHAVE É OBRIGATÓRIA, e não opcional como no WAHA original. Sem ela,
  // `verificarAssinatura` recusaria todo webhook — e um canal que recebe
  // mensagem mas não consegue provar a origem dela é pior do que um canal
  // desligado: a automação obedeceria a qualquer um que descobrisse a URL.
  if (apiKey.length === 0) faltando.push("WAHA_API_KEY");

  if (faltando.length > 0) {
    return { configurado: false, motivo: "O WAHA ainda não foi configurado.", faltando };
  }

  return {
    configurado: true,
    porta: new ProvedorWaha({ url, apiKey, sessao }, organizationId),
  };
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
