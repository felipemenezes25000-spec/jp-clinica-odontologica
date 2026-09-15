/**
 * A configuração da plataforma Meta — um lugar só.
 *
 * ============================================================================
 *  A VERSÃO DA GRAPH API NÃO SE ESPALHA — §4.2, §81.
 *
 *  O adapter de WhatsApp já mostra como o erro começa: `meta-cloud.ts` monta a
 *  URL com `${this.cfg.versao}`, e o default `"v21.0"` aparece em DOIS lugares
 *  diferentes (`provedores.ts`, duas vezes). Com quatro produtos — direct,
 *  Messenger, comentários, Lead Ads — isso viraria oito.
 *
 *  Por que importa concretamente: versão da Graph API EXPIRA. A v21.0 saiu em
 *  outubro de 2024 e tem data de morte. No dia em que ela cair, um sistema com
 *  a versão em oito arquivos falha em oito lugares diferentes, e cada um com
 *  uma mensagem de erro própria.
 * ============================================================================
 *
 * ============================================================================
 *  O QUE FOI CONFERIDO NA DOCUMENTAÇÃO OFICIAL, e quando — §4.3.
 *
 *  Data da conferência: 15/09/2026.
 *
 *  VERSÃO ATUAL: v26.0, publicada em 29/07/2026, sem data de expiração
 *  definida. A v25.0 (18/02/2026) expira em 29/07/2028.
 *    https://developers.facebook.com/docs/graph-api/changelog/versions/
 *
 *  O default é v26.0 e NÃO uma versão tirada de tutorial. `META_GRAPH_VERSION`
 *  existe para subir a versão sem deploy de código — e para descer, no dia em
 *  que uma versão nova quebrar algo em produção.
 * ============================================================================
 */
import { ehProducao } from "../../servidor/ambiente";

/* -------------------------------------------------------------------------- */
/* A versão                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A versão conferida na documentação oficial em 15/09/2026.
 *
 * NÃO MUDE ISTO SEM CONFERIR A PÁGINA DE VERSÕES. Uma versão que não existe
 * responde 400 em toda chamada, com `(#2500) Unknown path components` — que não
 * se parece nem um pouco com "a versão está errada".
 */
export const VERSAO_CONFERIDA = "v26.0";

/**
 * A versão da Graph API que este processo usa.
 *
 * `vNN.N` OU NADA. Um valor mal digitado no ambiente — `26.0` sem o `v`, ou
 * `latest` — produziria uma URL que responde 400 em toda chamada. Recusar o
 * valor e cair no conferido faz a integração continuar funcionando com a versão
 * que se sabe boa, e o log diz o que foi ignorado.
 */
export function versaoDaGraph(): string {
  const bruta = (process.env["META_GRAPH_VERSION"] ?? "").trim();
  if (bruta.length === 0) return VERSAO_CONFERIDA;
  if (/^v\d{1,3}\.\d{1,2}$/u.test(bruta)) return bruta;
  return VERSAO_CONFERIDA;
}

/** `true` quando o ambiente pediu uma versão que não tem forma de versão. */
export function versaoDoAmbienteEhInvalida(): boolean {
  const bruta = (process.env["META_GRAPH_VERSION"] ?? "").trim();
  return bruta.length > 0 && !/^v\d{1,3}\.\d{1,2}$/u.test(bruta);
}

/* -------------------------------------------------------------------------- */
/* Os hosts                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Os dois hosts da Meta, e a escolha entre eles NÃO é estilística.
 *
 * ============================================================================
 *  `graph.facebook.com`   Facebook Login for Business. É o caminho quando a
 *                         clínica conecta pela PÁGINA — e é o único que atende
 *                         Messenger e Lead Ads.
 *
 *  `graph.instagram.com`  Instagram Login. Atende só Instagram, e existe para
 *                         quem não quer/não tem Página vinculada.
 * ============================================================================
 *
 * A JP tem Página e Instagram profissional ligados a ela, então o caminho é o
 * primeiro — e é o default. O segundo fica declarado porque a arquitetura o
 * suporta e porque um cliente futuro pode ter só Instagram.
 */
export type TipoDeLogin = "facebook" | "instagram";

export function hostDaGraph(login: TipoDeLogin): string {
  return login === "instagram" ? "https://graph.instagram.com" : "https://graph.facebook.com";
}

/** `https://graph.facebook.com/v26.0/<caminho>` */
export function urlDaGraph(
  caminho: string,
  login: TipoDeLogin = "facebook",
  versao: string = versaoDaGraph(),
): string {
  const limpo = caminho.replace(/^\/+/u, "");
  return `${hostDaGraph(login)}/${versao}/${limpo}`;
}

/* -------------------------------------------------------------------------- */
/* Tempos                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * O timeout de uma chamada à Graph.
 *
 * QUINZE SEGUNDOS, o mesmo do `meta-cloud.ts`. E o mesmo raciocínio: o webhook
 * precisa devolver 200 rápido, e uma chamada que passa disso já deveria ter
 * virado trabalho de fila.
 */
export const TIMEOUT_GRAPH_MS = 15_000;

/**
 * Quanto esperar quando a Meta devolve 429 sem `Retry-After`.
 *
 * ============================================================================
 *  O NÚMERO É ALTO DE PROPÓSITO — 60 segundos.
 *
 *  A cota da Meta é por HORA, e por conta. Reintentar em dois segundos não
 *  restaura cota nenhuma: só consome mais uma chamada do balde que acabou de
 *  estourar, e a Meta conta a recusa como uso.
 *
 *  Quando o `Retry-After` vem, ele vence. Quando não vem, o custo de esperar um
 *  minuto a mais é um minuto; o de martelar é a conta bloqueada.
 * ============================================================================
 */
export const ESPERA_PADRAO_429_MS = 60_000;

/* -------------------------------------------------------------------------- */
/* As permissões                                                              */
/* -------------------------------------------------------------------------- */

export type ProdutoMeta = "instagram" | "messenger" | "comentarios" | "lead_ads";

export const PRODUTOS_META: readonly ProdutoMeta[] = [
  "instagram",
  "messenger",
  "comentarios",
  "lead_ads",
] as const;

export function ehProdutoMeta(valor: unknown): valor is ProdutoMeta {
  return typeof valor === "string" && (PRODUTOS_META as readonly string[]).includes(valor);
}

export type ExigenciaDoProduto = {
  produto: ProdutoMeta;
  rotulo: string;
  /**
   * As permissões, com os nomes CONFERIDOS na documentação oficial.
   *
   * ========================================================================
   *  O §4.3 pede exatamente isto: confirmar os nomes na documentação ATUAL, e
   *  documentar o que foi confirmado e a fonte.
   *
   *  O risco de não fazer é concreto e caro: a Meta renomeou os escopos do
   *  Instagram Login em 2024/2025 — `business_manage_messages` virou
   *  `instagram_business_manage_messages`, e os antigos foram descontinuados em
   *  27/01/2025. Um sistema com o nome antigo pede uma permissão que não
   *  existe, e o App Review é recusado sem explicação útil.
   * ========================================================================
   */
  permissoes: readonly string[];
  /** A fonte oficial do que está escrito acima. */
  fonte: string;
  /** O que a clínica perde quando este produto não está liberado. */
  seFaltar: string;
};

/**
 * O catálogo de exigências, conferido em 15/09/2026.
 *
 * ============================================================================
 *  ELE É DADO, E NÃO CÓDIGO — e isso é o ponto.
 *
 *  A tela do §31 mostra "permissões confirmadas", o runbook do §57 diz o que
 *  pedir no App Review, e o documento do §56 lista o que precisa de Advanced
 *  Access. Se cada um tivesse a própria lista, elas divergiriam — e a que
 *  divergisse seria descoberta durante a submissão, que é o pior momento.
 * ============================================================================
 */
export const EXIGENCIAS: readonly ExigenciaDoProduto[] = [
  {
    produto: "instagram",
    rotulo: "Instagram Direct",
    permissoes: [
      "instagram_business_basic",
      "instagram_business_manage_messages",
      // Pelo caminho de Facebook Login, a Página é quem autoriza:
      "pages_messaging",
      "pages_show_list",
    ],
    fonte:
      "https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login",
    seFaltar: "Direct não entra na Inbox, e a recepção volta a responder pelo app do celular.",
  },
  {
    produto: "messenger",
    rotulo: "Facebook Messenger",
    permissoes: [
      "pages_messaging",
      "pages_manage_metadata",
      "pages_read_engagement",
      "pages_show_list",
    ],
    fonte:
      "https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview",
    seFaltar: "Mensagem da Página fica só no Facebook, fora do histórico do paciente.",
  },
  {
    produto: "comentarios",
    rotulo: "Comentários e private reply",
    permissoes: [
      "instagram_business_basic",
      "instagram_business_manage_comments",
      "instagram_business_manage_messages",
      "pages_manage_metadata",
    ],
    fonte: "https://developers.facebook.com/docs/instagram-platform/private-replies/",
    seFaltar:
      "Comentário com intenção de compra morre no post. Ninguém vira lead, e a atribuição do conteúdo não existe.",
  },
  {
    produto: "lead_ads",
    rotulo: "Meta Lead Ads",
    permissoes: ["leads_retrieval", "pages_manage_ads", "pages_show_list", "pages_read_engagement"],
    fonte:
      "https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-leadgen/",
    seFaltar:
      "O lead do Instant Form fica no Gerenciador de Anúncios. Alguém baixa CSV, e o speed-to-lead morre.",
  },
] as const;

export function exigenciasDe(produto: ProdutoMeta): ExigenciaDoProduto {
  const achada = EXIGENCIAS.find((e) => e.produto === produto);
  // `EXIGENCIAS` cobre os quatro produtos de `ProdutoMeta`. O fallback existe
  // porque o compilador não sabe disso, e devolver o primeiro é melhor que
  // lançar num caminho de leitura de tela.
  return achada ?? EXIGENCIAS[0]!;
}

/**
 * Os campos de webhook que cada produto exige.
 *
 * ============================================================================
 *  ASSINAR O CAMPO ERRADO É O DEFEITO MAIS COMUM DESTA INTEGRAÇÃO, e o sintoma
 *  é péssimo: não há erro nenhum. O webhook simplesmente nunca chega.
 *
 *  A tela de saúde do §39 usa esta lista para dizer "assinado, e nunca recebeu
 *  nada" em vez de "conectado".
 * ============================================================================
 */
export const CAMPOS_DE_WEBHOOK: Readonly<Record<ProdutoMeta, readonly string[]>> = {
  instagram: ["messages", "messaging_postbacks", "messaging_seen", "messaging_referral"],
  messenger: ["messages", "messaging_postbacks", "message_deliveries", "message_reads"],
  comentarios: ["comments", "mentions"],
  lead_ads: ["leadgen"],
};

/* -------------------------------------------------------------------------- */
/* O ambiente                                                                 */
/* -------------------------------------------------------------------------- */

export type AppDaMeta = {
  appId: string;
  appSecret: string;
  verifyToken: string;
};

/**
 * O aplicativo da Meta, do ambiente.
 *
 * ============================================================================
 *  O `appSecret` É DO APLICATIVO, E NÃO DO CANAL — e isso decide onde ele mora.
 *
 *  A assinatura do webhook é HMAC com o app secret. Ela precisa ser conferida
 *  ANTES de o corpo ser confiável, ou seja: antes de saber de qual canal é a
 *  mensagem. Um segredo por canal exigiria decifrar N segredos e tentar todos —
 *  o que transforma a verificação num oráculo de tempo e num laço de CPU
 *  acionável por qualquer um que descubra a URL.
 *
 *  A rota por canal (`/api/crc/meta/$canal`) resolve isso do outro lado: o
 *  canal vem da URL — identificador público, não credencial — e o `appSecret`
 *  dele sai do `config` daquela linha. Ver `canais.ts`.
 *
 *  ESTE CAMINHO DE AMBIENTE é o degrau de compatibilidade, e ele se desliga
 *  sozinho quando a instalação deixa de ser de um cliente — exatamente como
 *  `integracoes/credenciais.ts` faz com o Dental Office e o WhatsApp.
 * ============================================================================
 */
export function appDoAmbiente(): { ok: true; app: AppDaMeta } | { ok: false; faltando: string[] } {
  const appId = (process.env["META_APP_ID"] ?? "").trim();
  const appSecret = appSecretDoAmbiente();
  const verifyToken = verifyTokenDoAmbiente();

  const faltando: string[] = [];
  if (appId.length === 0) faltando.push("META_APP_ID");
  if (appSecret.length === 0) faltando.push("META_APP_SECRET");
  if (verifyToken.length === 0) faltando.push("META_WEBHOOK_VERIFY_TOKEN");

  if (faltando.length > 0) return { ok: false, faltando };
  return { ok: true, app: { appId, appSecret, verifyToken } };
}

/**
 * O `appSecret` do ambiente, sozinho — e a razão de ele não passar por
 * `appDoAmbiente()`.
 *
 * ============================================================================
 *  UMA VARIÁVEL AUSENTE NÃO PODE MENTIR SOBRE OUTRA.
 *
 *  `appDoAmbiente()` é tudo-ou-nada de propósito: ele responde "o aplicativo
 *  está configurado?", e a resposta honesta com duas de três variáveis é NÃO.
 *  É isso que a tela de saúde precisa.
 *
 *  Mas quem confere a assinatura precisa de UMA coisa: o segredo. Fazer o
 *  segredo depender de `META_APP_ID` — que não participa do HMAC e não é
 *  consumido em lugar nenhum — produz o pior sintoma possível:
 *
 *    um deploy com `META_APP_SECRET` certo e sem `META_APP_ID` recusa TODO
 *    webhook com `motivo: "sem_segredo"`, e a pessoa vai conferir o segredo —
 *    que está certo — em vez da variável que falta.
 *
 *  Isto não é afrouxar a trava. O corpo continua sendo recusado quando o
 *  segredo de verdade falta, que é o único caso em que a assinatura não pode
 *  ser conferida. O que muda é a variável ausente aparecer com o próprio nome,
 *  em `appDoAmbiente().faltando`, na tela de saúde.
 *
 *  Foi um E2E que encontrou isto: `scripts/servidor-e2e.mjs` definia o segredo
 *  e o verify token, e não o app id — e as doze provas do arquivo falharam com
 *  503 e "sem_segredo".
 * ============================================================================
 */
export function appSecretDoAmbiente(): string {
  return (process.env["META_APP_SECRET"] ?? "").trim();
}

/** O token do handshake, sozinho. Mesmo argumento de `appSecretDoAmbiente`. */
export function verifyTokenDoAmbiente(): string {
  return (process.env["META_WEBHOOK_VERIFY_TOKEN"] ?? "").trim();
}

/**
 * O sandbox local está ligado?
 *
 * ============================================================================
 *  A MESMA TRAVA DO WHATSAPP: sandbox NUNCA em produção.
 *
 *  Um Instagram de mentira em produção é pior do que nenhum — a operação veria
 *  as mensagens "saindo" e o paciente nunca receberia nada. Ver
 *  `criarProvedorMensageria`, que faz a checagem idêntica.
 * ============================================================================
 *
 * ============================================================================
 *  A PERGUNTA VAI PARA `ehProducao()`, e a indireção é obrigatória.
 *
 *  `process.env["NODE_ENV"]` aqui virava LITERAL no bundle do servidor, e esta
 *  função inteira era compilada para `return false` — nos dois modos de build.
 *  O caminho do sandbox não existia no artefato, e `META_SANDBOX` não era nem
 *  lido.
 *
 *  O cabeçalho de `servidor/ambiente.ts` tem o artefato, a medição e a análise
 *  da troca. Não volte a ler `process.env["NODE_ENV"]` direto daqui.
 * ============================================================================
 */
export function sandboxLigado(): boolean {
  if (ehProducao()) return false;
  return (process.env["META_SANDBOX"] ?? "").trim() === "1";
}
