/**
 * De quem é esta conta da Meta — e de quem é este webhook. §31, §32, §33.
 *
 * ============================================================================
 *  A PERGUNTA DE ENTRADA E A DE SAÍDA SÃO DIFERENTES, e é por isso que há duas
 *  funções em vez de uma.
 *
 *  NA SAÍDA o CRC sabe de quem é a mensagem: ele tem a conversa, e a conversa
 *  tem a clínica. `canalMetaDaClinica` resolve daí.
 *
 *  NA ENTRADA não sabe. O corpo do webhook é justamente o que diz de quem é —
 *  e ele ainda não pode ser confiado, porque a assinatura não foi conferida. A
 *  circularidade é a mesma que `/api/crc/whatsapp/$canal` quebrou, e a saída é
 *  a mesma: o `:canal` da URL é um IDENTIFICADOR PÚBLICO que só diz QUAL LINHA
 *  LER, e quem o descobrir ainda precisa assinar o corpo com o `appSecret`
 *  daquele canal.
 * ============================================================================
 *
 * ============================================================================
 *  O TOKEN NUNCA SAI DAQUI EM DIREÇÃO À UI — §32.
 *
 *  `CanalMeta.token` existe só do lado do servidor. As funções que a tela
 *  chama devolvem `CanalMetaParaTela`, que tem `dica` e não tem token. Não é
 *  disciplina de quem escreve a tela: são dois tipos diferentes, e passar um
 *  pelo outro não compila.
 * ============================================================================
 */
import { selecionar, selecionarUm, type Filtro, type Linha } from "../../servidor/banco";
import { registrar } from "../../servidor/registro";
import { decifrar } from "../../servidor/segredo";

import {
  appSecretDoAmbiente,
  ehProdutoMeta,
  verifyTokenDoAmbiente,
  type ProdutoMeta,
} from "./config";

/* -------------------------------------------------------------------------- */
/* Os formatos                                                                */
/* -------------------------------------------------------------------------- */

/** Um canal da Meta, do lado do SERVIDOR. Carrega token. */
export type CanalMeta = {
  id: string;
  organizationId: string;
  clinicId: string;
  produtos: readonly ProdutoMeta[];
  pageId: string | null;
  instagramAccountId: string | null;
  displayName: string;
  username: string;
  /**
   * O Page Access Token, decifrado. `null` quando o canal existe só para
   * ROTEAR a entrada — que é legítimo, e é o degrau de migração: o canal
   * cadastrado sem token faz o webhook saber de quem é a mensagem, e o envio
   * recusa com motivo em vez de mandar pelo token de outra clínica.
   */
  token: string | null;
  /** O que não é token: `appId`, `appSecret`, `verifyToken`, `graphVersion`. */
  config: Readonly<Record<string, unknown>>;
  tokenExpiraEm: string | null;
  permissoes: Readonly<Record<string, unknown>>;
  ativo: boolean;
};

/** O mesmo canal, do lado da TELA. NÃO carrega token. */
export type CanalMetaParaTela = {
  id: string;
  clinicId: string;
  produtos: readonly ProdutoMeta[];
  pageId: string | null;
  instagramAccountId: string | null;
  displayName: string;
  username: string;
  /** Começo e fim do token, nunca o meio. Ver `dicaDoSegredo`. */
  dica: string;
  tokenExpiraEm: string | null;
  temToken: boolean;
  permissoes: readonly string[];
  ativo: boolean;
  ultimoWebhookEm: string | null;
  ultimaMensagemEm: string | null;
  ultimoLeadEm: string | null;
  ultimoErro: string | null;
  ultimoErroEm: string | null;
};

const COLUNAS =
  "id,organization_id,clinic_id,produtos,page_id,instagram_account_id," +
  "display_name,username,segredo_cifrado,dica,config,token_expira_em,permissoes,ativo," +
  "ultimo_webhook_em,ultima_mensagem_em,ultimo_lead_em,ultimo_erro,ultimo_erro_em";

/* -------------------------------------------------------------------------- */
/* Montagem                                                                   */
/* -------------------------------------------------------------------------- */

function produtosDe(valor: unknown): ProdutoMeta[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter(ehProdutoMeta);
}

function objetoDe(valor: unknown): Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function textoDe(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim();
  return v.length > 0 ? v : null;
}

function montar(linha: Linha): CanalMeta | null {
  const cifrado = typeof linha["segredo_cifrado"] === "string" ? linha["segredo_cifrado"] : "";
  let token: string | null = null;

  if (cifrado.length > 0) {
    token = decifrar(cifrado);
    if (token === null) {
      /*
       * DECIFRAR FALHOU, E ISSO NÃO PODE CAIR PARA O AMBIENTE.
       *
       * A linha existe e diz de quem é. Se a chave do servidor mudou ou alguém
       * mexeu na coluna, o comportamento seguro é recusar — cair no token do
       * ambiente aqui faria a Clínica B mandar direct pela conta da A. Mesma
       * decisão de `montarCanal` em `integracoes/credenciais.ts`.
       */
      registrar("erro", "Canal da Meta com segredo que não decifra.", {
        canal: String(linha["id"] ?? ""),
        detalhe: "Confira CRC_SEGREDO_CHAVE. O canal está inutilizável até isso ser resolvido.",
      });
      return null;
    }
  }

  const organizationId = textoDe(linha["organization_id"]);
  const clinicId = textoDe(linha["clinic_id"]);
  if (organizationId === null || clinicId === null) return null;

  return {
    id: String(linha["id"] ?? ""),
    organizationId,
    clinicId,
    produtos: produtosDe(linha["produtos"]),
    pageId: textoDe(linha["page_id"]),
    instagramAccountId: textoDe(linha["instagram_account_id"]),
    displayName: typeof linha["display_name"] === "string" ? linha["display_name"] : "",
    username: typeof linha["username"] === "string" ? linha["username"] : "",
    token,
    config: objetoDe(linha["config"]),
    tokenExpiraEm: textoDe(linha["token_expira_em"]),
    permissoes: objetoDe(linha["permissoes"]),
    ativo: linha["ativo"] !== false,
  };
}

export function paraTela(linha: Linha): CanalMetaParaTela {
  const cifrado = typeof linha["segredo_cifrado"] === "string" ? linha["segredo_cifrado"] : "";

  return {
    id: String(linha["id"] ?? ""),
    clinicId: String(linha["clinic_id"] ?? ""),
    produtos: produtosDe(linha["produtos"]),
    pageId: textoDe(linha["page_id"]),
    instagramAccountId: textoDe(linha["instagram_account_id"]),
    displayName: typeof linha["display_name"] === "string" ? linha["display_name"] : "",
    username: typeof linha["username"] === "string" ? linha["username"] : "",
    dica: typeof linha["dica"] === "string" ? linha["dica"] : "",
    tokenExpiraEm: textoDe(linha["token_expira_em"]),
    temToken: cifrado.length > 0,
    permissoes: Object.keys(objetoDe(linha["permissoes"])),
    ativo: linha["ativo"] !== false,
    ultimoWebhookEm: textoDe(linha["ultimo_webhook_em"]),
    ultimaMensagemEm: textoDe(linha["ultima_mensagem_em"]),
    ultimoLeadEm: textoDe(linha["ultimo_lead_em"]),
    ultimoErro: textoDe(linha["ultimo_erro"]),
    ultimoErroEm: textoDe(linha["ultimo_erro_em"]),
  };
}

/* -------------------------------------------------------------------------- */
/* A entrada — pelo id público da URL                                         */
/* -------------------------------------------------------------------------- */

/**
 * O canal pelo ID PÚBLICO dele — o caminho do webhook.
 *
 * CANAL DESATIVADO NÃO RECEBE. É o desligamento de um cliente, e ele tem que
 * valer na porta de entrada: não adianta parar de enviar e continuar aceitando
 * mensagem, criando conversa e cobrando classificação de IA.
 */
export async function canalMetaPorId(id: string): Promise<CanalMeta | null> {
  if (id.trim().length === 0) return null;

  const linha = await selecionarUm("crc_canais_meta", {
    colunas: COLUNAS,
    filtros: [
      { coluna: "id", op: "eq", valor: id },
      { coluna: "ativo", op: "eq", valor: true },
    ],
  });

  return linha === null ? null : montar(linha);
}

/**
 * O `appSecret` que confere a assinatura DESTE canal.
 *
 * ============================================================================
 *  A ORDEM É: CANAL, DEPOIS AMBIENTE — e o ambiente é compatibilidade.
 *
 *  O `appSecret` é do APLICATIVO da Meta, não da conta. Enquanto a instalação
 *  tem um app só — o caso da JP —, o do ambiente está certo e é mais simples de
 *  operar: um segredo, um lugar.
 *
 *  Ele deixa de estar certo no instante em que dois clientes trazem os próprios
 *  aplicativos. Aí o segredo de A não valida a assinatura de B: a mensagem
 *  legítima de B é recusada, e — pior — qualquer corpo assinado com o segredo
 *  de A passa dizendo ser de quem quiser.
 *
 *  `config.appSecret` na linha do canal é o caminho para esse dia, e ele vence
 *  quando existe.
 * ============================================================================
 */
export function appSecretDoCanal(canal: CanalMeta): string {
  const doCanal = canal.config["appSecret"];
  if (typeof doCanal === "string" && doCanal.trim().length > 0) return doCanal.trim();

  /*
   * O SEGREDO SOZINHO, e não `appDoAmbiente()` inteiro.
   *
   * `META_APP_ID` não participa do HMAC. Exigi-lo aqui fazia um deploy sem ele
   * recusar TODO webhook com `motivo: "sem_segredo"` — e a pessoa ia conferir o
   * segredo, que estava certo. Ver o cabeçalho de `appSecretDoAmbiente`.
   */
  return appSecretDoAmbiente();
}

/** O token de verificação do handshake DESTE canal. */
export function verifyTokenDoCanal(canal: CanalMeta): string {
  const doCanal = canal.config["verifyToken"];
  if (typeof doCanal === "string" && doCanal.trim().length > 0) return doCanal.trim();

  return verifyTokenDoAmbiente();
}

/**
 * A feature Human Agent está aprovada para este canal? — §15.
 *
 * FALSO É O PADRÃO, e o padrão é o correto: a feature exige App Review. Um
 * sistema que assume aprovação envia com a etiqueta fora das 24 horas, a Meta
 * recusa com `(#10) permission`, e o erro não parece com "falta App Review".
 */
export function humanAgentAprovado(canal: CanalMeta): boolean {
  return canal.config["humanAgentAprovado"] === true;
}

/* -------------------------------------------------------------------------- */
/* O roteamento de tenant — §33                                               */
/* -------------------------------------------------------------------------- */

export type TenantDaMeta = {
  canalId: string;
  organizationId: string;
  clinicId: string;
};

/**
 * De qual organização e clínica é este evento.
 *
 * ============================================================================
 *  NÃO EXISTE "PRIMEIRA CLÍNICA ATIVA" AQUI, e a ausência é deliberada.
 *
 *  `resolverEscopo` em `aplicacao/webhooks.ts` tem esse caminho de transição,
 *  com uma trava que o desliga quando aparece a segunda clínica. Ele existe lá
 *  porque a JP já tinha WhatsApp funcionando antes de a tabela de canais
 *  existir, e exigir o cadastro derrubaria o recebimento.
 *
 *  AQUI NADA ESTÁ FUNCIONANDO AINDA. Não há instalação para não quebrar, então
 *  não há razão para o degrau — e um degrau sem razão é uma bomba-relógio com
 *  um comentário pedindo desculpas.
 *
 *  O §33 é explícito: se não conseguir resolver exatamente uma organização,
 *  FAIL CLOSED. `null` faz o envelope ir para `FALHOU` com motivo, aparecer na
 *  saúde, e esperar alguém cadastrar a conta. Nenhum lead é criado em
 *  organização arbitrária.
 * ============================================================================
 *
 * A CONTA PODE SER PÁGINA OU INSTAGRAM, e as duas colunas são consultadas — na
 * ordem em que a coincidência é mais provável. Um `or` numa consulta só seria
 * mais rápido; duas consultas sequenciais são mais legíveis e a segunda quase
 * nunca roda, porque a primeira acerta.
 */
export async function resolverTenantDaMeta(contaExterna: string): Promise<TenantDaMeta | null> {
  const conta = contaExterna.trim();
  if (conta.length === 0) return null;

  for (const coluna of ["page_id", "instagram_account_id"] as const) {
    const linha = await selecionarUm("crc_canais_meta", {
      colunas: "id,organization_id,clinic_id",
      filtros: [
        { coluna, op: "eq", valor: conta },
        { coluna: "ativo", op: "eq", valor: true },
      ],
    });

    if (linha !== null) {
      const organizationId = textoDe(linha["organization_id"]);
      const clinicId = textoDe(linha["clinic_id"]);
      if (organizationId === null || clinicId === null) continue;

      return { canalId: String(linha["id"] ?? ""), organizationId, clinicId };
    }
  }

  registrar("erro", "Evento da Meta para uma conta que não está cadastrada.", {
    conta,
    detalhe:
      "Nenhum canal ativo em crc_canais_meta tem esta Página ou conta do Instagram. O evento não será processado — cadastre a conta em Integrações › Meta.",
  });

  return null;
}

/* -------------------------------------------------------------------------- */
/* A saída — pela clínica                                                     */
/* -------------------------------------------------------------------------- */

export type ResolucaoDoCanal =
  { ok: true; canal: CanalMeta } | { ok: false; motivo: string; faltando: readonly string[] };

/**
 * O canal da Meta desta clínica, para ENVIAR.
 *
 * ============================================================================
 *  O GRÃO É A CLÍNICA, e "mais de um" é RECUSA e não escolha.
 *
 *  É a mesma regra de `credenciaisWhatsapp`: uma organização com duas contas
 *  da Meta ativas e uma operação que não disse de qual clínica é não tem
 *  resposta certa. Escolher a primeira é o defeito de origem — do lado do
 *  paciente, uma clínica que ele não conhece respondendo o direct dele.
 * ============================================================================
 *
 * O PRODUTO ENTRA NA BUSCA. Uma conta cadastrada só para Lead Ads não pode ser
 * usada para mandar direct: ela pode não ter a permissão, e a chamada falharia
 * com `(#10)` — que é um erro correto com uma explicação inútil. Recusar aqui
 * diz o que falta.
 */
export async function canalMetaDaClinica(
  organizationId: string,
  clinicId: string | null,
  produto: ProdutoMeta,
): Promise<ResolucaoDoCanal> {
  if (organizationId.trim().length === 0) {
    return {
      ok: false,
      motivo: "Sem organização não há como escolher a conta da Meta.",
      faltando: ["organizationId"],
    };
  }

  const filtros: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "ativo", op: "eq", valor: true },
  ];
  if (clinicId !== null && clinicId.trim().length > 0) {
    filtros.push({ coluna: "clinic_id", op: "eq", valor: clinicId });
  }

  const linhas = await selecionar("crc_canais_meta", {
    colunas: COLUNAS,
    filtros,
    ordenar: [{ coluna: "criado_em", ascendente: true }],
    limite: 20,
  });

  const servem = linhas.filter((l) => produtosDe(l["produtos"]).includes(produto));

  if (servem.length === 0) {
    return {
      ok: false,
      motivo:
        linhas.length === 0
          ? "Nenhuma conta da Meta está cadastrada e ativa para esta clínica."
          : `A conta da Meta desta clínica não está habilitada para ${produto}. Confira os produtos do canal em Integrações › Meta.`,
      faltando: linhas.length === 0 ? ["crc_canais_meta"] : [`produtos.${produto}`],
    };
  }

  if (servem.length > 1) {
    return {
      ok: false,
      motivo:
        "Esta organização tem mais de uma conta da Meta ativa para este produto e a operação não disse de qual clínica é. Recusado para não responder pela conta errada.",
      faltando: [],
    };
  }

  const canal = montar(servem[0]!);
  if (canal === null) {
    return {
      ok: false,
      motivo:
        "A conta da Meta desta clínica está cadastrada mas o token não pôde ser decifrado. Confira CRC_SEGREDO_CHAVE.",
      faltando: ["CRC_SEGREDO_CHAVE"],
    };
  }

  if (canal.token === null) {
    /*
     * CANAL SÓ DE ROTEAMENTO: recebe e não envia.
     *
     * É o mesmo degrau de migração de `crc_canais_whatsapp` — cadastrar a conta
     * faz o webhook saber de quem é a mensagem antes de haver token de envio.
     * A diferença aqui é que NÃO há ambiente para cair: o token da Meta é de
     * uma Página específica, e não existe "token do ambiente" que sirva para
     * outra conta. Recusar com motivo é a única resposta honesta.
     */
    return {
      ok: false,
      motivo:
        "A conta da Meta desta clínica está cadastrada para receber, mas não tem token de envio. Conecte a conta em Integrações › Meta.",
      faltando: ["token"],
    };
  }

  return { ok: true, canal };
}

/**
 * Todos os canais da organização, para a TELA.
 *
 * Devolve `CanalMetaParaTela`, que não tem token. Ver o cabeçalho: são dois
 * tipos diferentes de propósito, e passar um pelo outro não compila.
 */
export async function canaisMetaParaTela(
  organizationId: string,
  clinicIds: readonly string[] | null,
): Promise<CanalMetaParaTela[]> {
  const filtros: Filtro[] = [{ coluna: "organization_id", op: "eq", valor: organizationId }];
  if (clinicIds !== null) {
    if (clinicIds.length === 0) return [];
    filtros.push({ coluna: "clinic_id", op: "in", valor: [...clinicIds] });
  }

  const linhas = await selecionar("crc_canais_meta", {
    colunas: COLUNAS,
    filtros,
    ordenar: [{ coluna: "criado_em", ascendente: true }],
    limite: 50,
  });

  return linhas.map(paraTela);
}
