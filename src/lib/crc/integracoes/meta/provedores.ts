/**
 * A fábrica de portas da Meta, e o sandbox que substitui a Meta — §54.
 *
 * ============================================================================
 *  O SANDBOX NÃO É CONVENIÊNCIA DE TESTE: É REQUISITO.
 *
 *  O §54 é explícito — "não dependa da Meta real para CI". E o motivo é
 *  aritmético: o App Review leva semanas, a conta de teste tem cota própria, e
 *  um pipeline que precisa de Instagram real para rodar é um pipeline que roda
 *  uma vez e é desligado.
 *
 *  O QUE ELE PRECISA SABER FAZER, do §54:
 *
 *      emitir direct / Messenger / comentário / lead
 *      devolver detalhes de lead
 *      simular 429, 500, timeout, token expirado
 *      REGISTRAR os envios
 *
 *  O último é o que faz o E2E provar algo: "a recepção respondeu" só é
 *  verificável se houver onde conferir que o envio saiu.
 * ============================================================================
 *
 * ============================================================================
 *  A MESMA TRAVA DO WHATSAPP: SANDBOX NUNCA EM PRODUÇÃO.
 *
 *  Um Instagram de mentira em produção é pior do que nenhum. A operação veria
 *  as respostas "saindo" na Inbox, com `provider_message_id` e tudo, e o
 *  paciente nunca receberia nada — e ninguém descobriria até alguém ligar
 *  reclamando.
 *
 *  A checagem é `NODE_ENV === "production"` em `sandboxLigado()`, e ela não é
 *  contornável por variável.
 * ============================================================================
 */
import { registrar } from "../../servidor/registro";
import type {
  PedidoDeEnvioNoCanal,
  PerfilExterno,
  PortaCanal,
  ResultadoEnvio,
} from "../canais/porta";

import {
  canalMetaDaClinica,
  canalMetaPorId,
  type CanalMeta,
  type ResolucaoDoCanal,
} from "./canais";
import { sandboxLigado, type ProdutoMeta } from "./config";
import { portaInstagram, portaMessenger } from "./porta";

/* -------------------------------------------------------------------------- */
/* O sandbox                                                                  */
/* -------------------------------------------------------------------------- */

export type EnvioRegistrado = {
  canal: "instagram" | "messenger";
  /** O IGSID/PSID, ou `comment:<id>` num private reply. */
  destino: string;
  texto: string;
  forma: string;
  providerMessageId: string;
  em: string;
};

/**
 * A falha que o próximo envio vai produzir.
 *
 * ARMADA UMA VEZ E CONSUMIDA, como `falharProximaEscrita` do banco em memória.
 * Uma falha permanente até alguém desarmar faria o teste seguinte falhar por um
 * motivo que não é dele — e é assim que uma suíte ganha fama de instável.
 */
export type FalhaArmada =
  { tipo: "429" } | { tipo: "500" } | { tipo: "timeout" } | { tipo: "token_expirado" };

class SandboxDaMeta {
  private readonly enviados: EnvioRegistrado[] = [];
  private contador = 0;
  private armada: FalhaArmada | null = null;
  private perfis = new Map<string, PerfilExterno>();

  armarFalha(falha: FalhaArmada | null): void {
    this.armada = falha;
  }

  definirPerfil(contato: string, perfil: PerfilExterno): void {
    this.perfis.set(contato, perfil);
  }

  listarEnviados(): readonly EnvioRegistrado[] {
    return this.enviados;
  }

  limpar(): void {
    this.enviados.length = 0;
    this.contador = 0;
    this.armada = null;
    this.perfis = new Map();
  }

  porta(canal: "instagram" | "messenger"): PortaCanal {
    return {
      canal,
      provedor: "sandbox",
      enviar: (pedido) => Promise.resolve(this.registrar(canal, pedido)),
      perfil: (contato) => Promise.resolve(this.perfis.get(contato) ?? null),
    };
  }

  private registrar(
    canal: "instagram" | "messenger",
    pedido: PedidoDeEnvioNoCanal,
  ): ResultadoEnvio {
    const falha = this.armada;
    this.armada = null;

    if (falha !== null) return this.falhar(falha);

    this.contador += 1;
    const providerMessageId = `sandbox-meta-${String(this.contador)}`;

    this.enviados.push({
      canal,
      destino:
        pedido.forma.forma === "private_reply"
          ? `comment:${pedido.forma.comentarioId}`
          : pedido.destino.contato.valor,
      texto: pedido.texto,
      forma: pedido.forma.forma,
      providerMessageId,
      em: new Date().toISOString(),
    });

    registrar("info", "[sandbox meta] mensagem NÃO enviada — só registrada.", {
      canal,
      forma: pedido.forma.forma,
      trecho: pedido.texto.slice(0, 80),
    });

    return { ok: true, providerMessageId };
  }

  /**
   * As falhas, com a MESMA classificação da Meta real.
   *
   * ==========================================================================
   *  O `timeout` DEVOLVE `incerta`, e é o cenário mais importante do sandbox.
   *
   *  É o §35 em teste: o POST saiu, a resposta não voltou, a Meta PODE ter
   *  aceitado. Um sandbox que devolvesse `transitoria` aqui faria o teste
   *  provar o comportamento ERRADO — a chave de dedupe seria liberada e a
   *  segunda tentativa mandaria a segunda mensagem.
   * ==========================================================================
   */
  private falhar(falha: FalhaArmada): ResultadoEnvio {
    if (falha.tipo === "429") {
      return {
        ok: false,
        classe: "transitoria",
        codigo: "#4",
        detalhe: "[sandbox] Application request limit reached — a cota volta por hora.",
      };
    }
    if (falha.tipo === "500") {
      return {
        ok: false,
        classe: "transitoria",
        codigo: "500",
        detalhe: "[sandbox] A Meta devolveu erro de servidor.",
      };
    }
    if (falha.tipo === "token_expirado") {
      return {
        ok: false,
        classe: "permanente",
        codigo: "#190",
        detalhe:
          "[sandbox] Token inválido ou expirado — é preciso reconectar a conta; nenhuma retentativa resolve.",
      };
    }
    return {
      ok: false,
      classe: "incerta",
      codigo: "REDE",
      detalhe:
        "[sandbox] O pedido saiu e a resposta não voltou. A Meta PODE ter aceitado — não reenvie automaticamente.",
    };
  }
}

let sandbox: SandboxDaMeta | null = null;

export function obterSandboxDaMeta(): SandboxDaMeta {
  sandbox ??= new SandboxDaMeta();
  return sandbox;
}

export function _reiniciarSandboxDaMeta(): void {
  sandbox = null;
}

/* -------------------------------------------------------------------------- */
/* A fábrica                                                                  */
/* -------------------------------------------------------------------------- */

export type EstadoDaPorta =
  | { configurado: true; porta: PortaCanal; canal: CanalMeta | null }
  | { configurado: false; motivo: string; faltando: readonly string[] };

/**
 * A porta para ENVIAR neste canal, nesta clínica.
 *
 * ============================================================================
 *  O SANDBOX VEM PRIMEIRO, E SÓ FORA DE PRODUÇÃO.
 *
 *  Mesma ordem de `criarProvedorMensageria`: o sandbox curto-circuita a
 *  resolução de credencial, porque em desenvolvimento não HÁ credencial — e
 *  exigir uma faria o ambiente local não funcionar sem uma conta da Meta.
 * ============================================================================
 */
export async function criarPortaDaMeta(
  canal: "instagram" | "messenger",
  organizationId: string | null,
  clinicId: string | null = null,
): Promise<EstadoDaPorta> {
  if (sandboxLigado()) {
    return { configurado: true, porta: obterSandboxDaMeta().porta(canal), canal: null };
  }

  if (organizationId === null || organizationId.trim().length === 0) {
    return {
      configurado: false,
      motivo: "Sem organização não há como escolher a conta da Meta.",
      faltando: ["organizationId"],
    };
  }

  const produto: ProdutoMeta = canal;
  const r = await canalMetaDaClinica(organizationId, clinicId, produto);
  if (!r.ok) return { configurado: false, motivo: r.motivo, faltando: r.faltando };

  return portaDoCanal(canal, r.canal);
}

/**
 * A porta de um canal JÁ CARREGADO — o caminho da entrada.
 *
 * O webhook já leu a linha do canal para conferir a assinatura. Pedir para
 * resolvê-la de novo pela clínica seria uma segunda ida ao banco com uma
 * chance de divergir — e a divergência mandaria a resposta por outra conta.
 */
export function portaDoCanal(canal: "instagram" | "messenger", linha: CanalMeta): EstadoDaPorta {
  if (sandboxLigado()) {
    return { configurado: true, porta: obterSandboxDaMeta().porta(canal), canal: linha };
  }

  if (linha.token === null) {
    return {
      configurado: false,
      motivo:
        "Esta conta da Meta está cadastrada para receber, mas não tem token de envio. Conecte a conta em Integrações › Meta.",
      faltando: ["token"],
    };
  }

  /*
   * O ID DA CONTA DEPENDE DO CANAL, e trocar os dois é o erro clássico.
   *
   * ==========================================================================
   *  `POST /{PAGE_ID}/messages` manda pelo Messenger da Página.
   *  `POST /{IG_ID}/messages`   manda pelo direct do Instagram.
   *
   *  Com o id trocado a Meta não recusa necessariamente: ela pode ACEITAR e
   *  entregar pelo canal errado — a pessoa que escreveu no Instagram recebe a
   *  resposta no Messenger, numa conversa que ela não abriu.
   * ==========================================================================
   */
  const contaId = canal === "instagram" ? linha.instagramAccountId : linha.pageId;
  if (contaId === null) {
    return {
      configurado: false,
      motivo:
        canal === "instagram"
          ? "Esta conta da Meta não tem a conta profissional do Instagram vinculada."
          : "Esta conta da Meta não tem a Página do Facebook vinculada.",
      faltando: [canal === "instagram" ? "instagram_account_id" : "page_id"],
    };
  }

  const login = linha.config["loginTipo"] === "instagram" ? ("instagram" as const) : undefined;
  const cfg = {
    contaId,
    token: linha.token,
    organizationId: linha.organizationId,
    ...(login === undefined ? {} : { login }),
  };

  return {
    configurado: true,
    porta: canal === "instagram" ? portaInstagram(cfg) : portaMessenger(cfg),
    canal: linha,
  };
}

/**
 * O canal da ENTRADA, pelo id público da URL — e o `appSecret` dele.
 *
 * Devolve a linha inteira porque quem chama precisa de três coisas dela: o
 * `appSecret` para conferir a assinatura, o tenant para gravar o inbox, e as
 * contas externas para conferir que o payload é DESTE canal. Ver o cabeçalho de
 * `/api/crc/whatsapp/$canal`, que descreve a mesma sequência.
 */
export async function canalDaEntrada(
  canalId: string,
): Promise<{ ok: true; canal: CanalMeta } | { ok: false; motivo: string }> {
  const canal = await canalMetaPorId(canalId);
  if (canal === null) {
    return {
      ok: false,
      motivo: "Canal não encontrado, desativado, ou com segredo ilegível.",
    };
  }
  return { ok: true, canal };
}

export type { ResolucaoDoCanal };
