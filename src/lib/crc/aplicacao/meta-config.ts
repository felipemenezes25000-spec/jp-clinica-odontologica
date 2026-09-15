/**
 * Conectar, desconectar e configurar a Meta — §31, §32, §63, §66.
 *
 * ============================================================================
 *  A ESCRITA DE CREDENCIAL MORA AQUI, E NÃO EM `integracoes/`.
 *
 *  `integracoes/meta/canais.ts` LÊ: ele resolve de quem é a conta e decifra o
 *  token. Aqui se ESCREVE — e escrever credencial exige três coisas que a
 *  camada de integração não tem:
 *
 *    a cifra         `cifrar()` de `servidor/segredo.ts`
 *    a auditoria     §63 lista "conectar conta" e "desconectar conta"
 *    a permissão     quem chama é uma server function com `gerenciar_integracoes`
 * ============================================================================
 *
 * ============================================================================
 *  O TOKEN ENTRA E NUNCA SAI — §32.
 *
 *  Ele é cifrado na gravação e a única coisa que volta para a tela é a `dica`:
 *  começo e fim, nunca o meio. Não há função aqui que devolva o token, e não
 *  há caminho da tela que o peça.
 *
 *  A AUDITORIA GUARDA A DICA, E NÃO O SEGREDO. `auditar()` já passa o `depois`
 *  por `mascarar()`, mas depender disso seria depender de um detalhe de outro
 *  arquivo — o que vai para lá já é seguro na origem.
 * ============================================================================
 */
import { ehProdutoMeta, type ProdutoMeta } from "../integracoes/meta/config";
import { apagar, inserirIgnorandoDuplicata, selecionar, selecionarUm } from "../servidor/banco";
import { auditar, registrar } from "../servidor/registro";
import { cifrar, cifraConfigurada, dicaDoSegredo } from "../servidor/segredo";

/* -------------------------------------------------------------------------- */
/* Conectar                                                                   */
/* -------------------------------------------------------------------------- */

export type PedidoDeConexao = {
  organizationId: string;
  clinicId: string;
  userId: string | null;
  /** Nulo = criar; preenchido = atualizar aquele canal. */
  canalId?: string | null;
  pageId: string | null;
  instagramAccountId: string | null;
  displayName: string;
  username: string;
  produtos: readonly string[];
  /**
   * O Page Access Token, em claro. Vem da tela UMA vez e é cifrado aqui.
   *
   * VAZIO É LEGÍTIMO NUM UPDATE: significa "não mexi no token". Tratá-lo como
   * "apague o token" faria uma edição de rótulo desconectar a conta — e a
   * pessoa não saberia por quê.
   */
  token: string;
  /** `appSecret`, `verifyToken`, `humanAgentAprovado`, `loginTipo`. */
  config: Readonly<Record<string, unknown>>;
  /** Quando a Meta disse que o token vence. `null` = não informado. */
  tokenExpiraEm: string | null;
  permissoes: readonly string[];
};

export type ResultadoDaConexao =
  | { ok: true; canalId: string; dica: string }
  | { ok: false; motivo: string; faltando: readonly string[] };

export async function conectarCanalMeta(p: PedidoDeConexao): Promise<ResultadoDaConexao> {
  const pageId = (p.pageId ?? "").trim();
  const igId = (p.instagramAccountId ?? "").trim();

  if (pageId.length === 0 && igId.length === 0) {
    return {
      ok: false,
      motivo:
        "É preciso informar o ID da Página do Facebook, o ID da conta do Instagram, ou os dois. São eles que dizem de quem é cada webhook.",
      faltando: ["page_id", "instagram_account_id"],
    };
  }

  const produtos = p.produtos.filter(ehProdutoMeta);
  if (produtos.length === 0) {
    return {
      ok: false,
      motivo: "Escolha ao menos um produto: Instagram, Messenger, comentários ou Lead Ads.",
      faltando: ["produtos"],
    };
  }

  /*
   * ==========================================================================
   *  OS PRODUTOS EXIGEM AS CHAVES CERTAS, e a conferência é aqui e não na
   *  primeira falha em produção.
   *
   *  Messenger e Lead Ads roteiam por `page_id`; Instagram e comentários, pelo
   *  id da conta do Instagram. Salvar "Lead Ads" numa linha sem `page_id`
   *  produz um canal que nunca recebe nada — e o sintoma é silêncio, não erro.
   * ==========================================================================
   */
  const exigemPagina: ProdutoMeta[] = ["messenger", "lead_ads"];
  const exigemInstagram: ProdutoMeta[] = ["instagram", "comentarios"];

  const faltaPagina = pageId.length === 0 && produtos.some((x) => exigemPagina.includes(x));
  const faltaInstagram = igId.length === 0 && produtos.some((x) => exigemInstagram.includes(x));

  if (faltaPagina) {
    return {
      ok: false,
      motivo:
        "Messenger e Lead Ads são da Página: sem o ID da Página, o webhook deles não tem como ser roteado.",
      faltando: ["page_id"],
    };
  }
  if (faltaInstagram) {
    return {
      ok: false,
      motivo:
        "Instagram e comentários são da conta profissional do Instagram: sem o ID dela, o webhook não tem como ser roteado.",
      faltando: ["instagram_account_id"],
    };
  }

  const token = p.token.trim();

  if (token.length > 0) {
    const cifra = cifraConfigurada();
    if (!cifra.ok) {
      /*
       * SEM CHAVE DE CIFRA, NADA É GRAVADO — a mesma regra de
       * `servidor/segredo.ts`.
       *
       * A alternativa seria guardar em claro "só por enquanto", e o resultado
       * conhecido é um Page Access Token em texto puro numa tabela, para
       * sempre, porque ninguém volta para consertar.
       */
      return { ok: false, motivo: cifra.motivo, faltando: ["CRC_SEGREDO_CHAVE"] };
    }
  }

  const agora = new Date().toISOString();
  const permissoes: Record<string, string> = {};
  for (const perm of p.permissoes) {
    const limpa = perm.trim();
    if (limpa.length > 0) permissoes[limpa] = agora.slice(0, 10);
  }

  const linha = {
    organization_id: p.organizationId,
    clinic_id: p.clinicId,
    provider: "meta",
    produtos,
    page_id: pageId.length > 0 ? pageId : null,
    instagram_account_id: igId.length > 0 ? igId : null,
    display_name: p.displayName.trim().slice(0, 200),
    username: p.username.trim().replace(/^@/u, "").slice(0, 120),
    ...(token.length > 0 ? { segredo_cifrado: cifrar(token), dica: dicaDoSegredo(token) } : {}),
    config: p.config,
    token_expira_em: p.tokenExpiraEm,
    permissoes,
    ativo: true,
    atualizado_em: agora,
  };

  const existente =
    p.canalId !== null && p.canalId !== undefined && p.canalId.length > 0
      ? await selecionarUm("crc_canais_meta", {
          colunas: "id,dica",
          filtros: [
            { coluna: "id", op: "eq", valor: p.canalId },
            { coluna: "organization_id", op: "eq", valor: p.organizationId },
          ],
        })
      : null;

  let canalId: string;

  if (existente !== null) {
    const { atualizar } = await import("../servidor/banco");
    await atualizar(
      "crc_canais_meta",
      [
        { coluna: "id", op: "eq", valor: String(existente["id"] ?? "") },
        { coluna: "organization_id", op: "eq", valor: p.organizationId },
      ],
      linha,
    );
    canalId = String(existente["id"] ?? "");
  } else {
    const criada = await inserirIgnorandoDuplicata("crc_canais_meta", linha);
    if (criada === null) {
      /*
       * O ÍNDICE ÚNICO RECUSOU: esta Página (ou este Instagram) já pertence a
       * outro canal.
       *
       * É a proteção do §33 funcionando, e a mensagem precisa dizer o que
       * fazer — "já cadastrado" sozinho faria a pessoa tentar de novo. O que
       * resolve é editar o canal existente ou desativá-lo.
       */
      return {
        ok: false,
        motivo:
          "Esta Página ou conta do Instagram já está cadastrada em outro canal. Edite o canal existente em vez de criar um segundo — dois canais com a mesma conta deixariam o webhook com dois donos possíveis.",
        faltando: [],
      };
    }
    canalId = String(criada["id"] ?? "");
  }

  await auditar({
    organizationId: p.organizationId,
    userId: p.userId,
    ator: "humano",
    acao: existente === null ? "meta.canal_conectado" : "meta.canal_atualizado",
    entityType: "canal_meta",
    entityId: canalId,
    depois: {
      clinicId: p.clinicId,
      pageId: pageId.length > 0 ? pageId : null,
      instagramAccountId: igId.length > 0 ? igId : null,
      produtos,
      // A DICA, E NUNCA O TOKEN. Ver o cabeçalho.
      dica: token.length > 0 ? dicaDoSegredo(token) : String(existente?.["dica"] ?? ""),
      permissoes: Object.keys(permissoes),
    },
  });

  registrar("aviso", "Canal da Meta conectado.", {
    organizationId: p.organizationId,
    canalId,
    produtos: produtos.join(","),
  });

  return {
    ok: true,
    canalId,
    dica: token.length > 0 ? dicaDoSegredo(token) : String(existente?.["dica"] ?? ""),
  };
}

/**
 * Desativa um canal — §31.
 *
 * ============================================================================
 *  DESATIVA, E NÃO APAGA. A linha continua, com `ativo = false`.
 *
 *  Três coisas dependem dela existir depois de desligada:
 *
 *    AS CONVERSAS       elas apontam para a clínica, não para o canal — mas o
 *                       histórico de "por qual conta isto entrou" mora aqui.
 *
 *    A AUDITORIA        §63 exige poder responder "quem desconectou e quando".
 *                       Uma linha apagada não responde.
 *
 *    O REATIVAR         religar exige só um UPDATE, com o token ainda cifrado
 *                       na coluna. Apagar obrigaria a refazer o OAuth inteiro.
 *
 *  E o desligamento VALE NA PORTA DE ENTRADA: `canalMetaPorId` filtra por
 *  `ativo`, então um canal desativado para de receber na hora. Não adianta
 *  parar de enviar e continuar aceitando mensagem.
 * ============================================================================
 */
export async function desativarCanalMeta(p: {
  organizationId: string;
  canalId: string;
  userId: string | null;
}): Promise<boolean> {
  const { atualizar } = await import("../servidor/banco");

  const antes = await selecionarUm("crc_canais_meta", {
    colunas: "id,page_id,instagram_account_id,produtos,ativo",
    filtros: [
      { coluna: "id", op: "eq", valor: p.canalId },
      { coluna: "organization_id", op: "eq", valor: p.organizationId },
    ],
  });
  if (antes === null) return false;

  await atualizar(
    "crc_canais_meta",
    [
      { coluna: "id", op: "eq", valor: p.canalId },
      { coluna: "organization_id", op: "eq", valor: p.organizationId },
    ],
    { ativo: false, atualizado_em: new Date().toISOString() },
  );

  await auditar({
    organizationId: p.organizationId,
    userId: p.userId,
    ator: "humano",
    acao: "meta.canal_desativado",
    entityType: "canal_meta",
    entityId: p.canalId,
    antes: { ativo: true, produtos: antes["produtos"] },
    depois: { ativo: false },
  });

  registrar("aviso", "Canal da Meta desativado.", {
    organizationId: p.organizationId,
    canalId: p.canalId,
  });

  return true;
}

/* -------------------------------------------------------------------------- */
/* Testar — §31                                                               */
/* -------------------------------------------------------------------------- */

export type ResultadoDoTeste = { ok: boolean; detalhe: string };

/**
 * Confere que a credencial funciona, SEM falar com paciente nenhum.
 *
 * ============================================================================
 *  O §31 É EXPLÍCITO: "a ação Testar não pode enviar mensagem para paciente
 *  real sem confirmação explícita e alvo de teste seguro".
 *
 *  Esta função NÃO tem caminho de envio. Ela faz um GET no próprio objeto da
 *  conta — `GET /{id}?fields=name,username` — e isso prova as três coisas que
 *  interessam:
 *
 *    o token existe e não venceu       (senão: #190)
 *    o app tem acesso àquela conta     (senão: #200 ou #10)
 *    a versão da Graph em uso responde (senão: #2500)
 *
 *  Um teste que manda mensagem provaria a mesma coisa e custaria uma mensagem
 *  para alguém. O GET é gratuito em risco.
 * ============================================================================
 */
export async function testarCanalMeta(p: {
  organizationId: string;
  canalId: string;
}): Promise<ResultadoDoTeste> {
  const { canalMetaPorId } = await import("../integracoes/meta/canais");
  const canal = await canalMetaPorId(p.canalId);

  if (canal === null || canal.organizationId !== p.organizationId) {
    return { ok: false, detalhe: "Canal não encontrado, desativado, ou de outra organização." };
  }
  if (canal.token === null) {
    return {
      ok: false,
      detalhe:
        "Este canal está cadastrado só para receber: não há token de envio para testar. Conecte a conta.",
    };
  }

  const alvo = canal.instagramAccountId ?? canal.pageId;
  if (alvo === null) {
    return { ok: false, detalhe: "O canal não tem Página nem conta do Instagram vinculada." };
  }

  const { ClienteDaGraph } = await import("../integracoes/meta/cliente");
  const cliente = new ClienteDaGraph({
    token: canal.token,
    organizationId: p.organizationId,
    integracao: canal.instagramAccountId !== null ? "meta_instagram" : "meta_messenger",
  });

  const r = await cliente.obter(
    alvo,
    { fields: canal.instagramAccountId !== null ? "id,name,username" : "id,name" },
    "testar",
  );

  if (!r.ok) {
    return { ok: false, detalhe: `${r.erro.codigo}: ${r.erro.detalhe} — ${r.erro.acao}` };
  }

  const { campo, textoOpcional } = await import("../dominio/validar");
  const nome = textoOpcional(campo(r.dados, "name")) ?? "(sem nome)";
  const usuario = textoOpcional(campo(r.dados, "username"));

  return {
    ok: true,
    detalhe: usuario === null ? `Conectado a "${nome}".` : `Conectado a "${nome}" (@${usuario}).`,
  };
}

/* -------------------------------------------------------------------------- */
/* As regras sociais — §66                                                    */
/* -------------------------------------------------------------------------- */

export type RegraParaTela = {
  id: string;
  nome: string;
  clinicId: string | null;
  canal: string;
  evento: string;
  contem: string[];
  naoContem: string[];
  exigirCaptacao: boolean;
  midias: string[];
  criarLead: boolean;
  criarOportunidade: boolean;
  enviarPrivateReply: boolean;
  intencao: string | null;
  copy: string | null;
  cooldownHoras: number;
  ativa: boolean;
};

export async function listarRegrasSociais(
  organizationId: string,
  clinicIds: readonly string[] | null,
): Promise<RegraParaTela[]> {
  const filtros = [
    { coluna: "organization_id" as const, op: "eq" as const, valor: organizationId },
  ];

  const linhas = await selecionar("crc_regras_sociais", {
    filtros,
    ordenar: [{ coluna: "criado_em", ascendente: true }],
    limite: 100,
  });

  const textos = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  return linhas
    .filter((l) => {
      // A regra da ORGANIZAÇÃO (clinic_id nulo) aparece para todo mundo; a da
      // unidade, só para quem alcança aquela unidade.
      if (clinicIds === null) return true;
      const daLinha = l["clinic_id"];
      if (daLinha === null || daLinha === undefined) return true;
      return clinicIds.includes(String(daLinha));
    })
    .map((l) => ({
      id: String(l["id"] ?? ""),
      nome: String(l["nome"] ?? ""),
      clinicId: typeof l["clinic_id"] === "string" ? l["clinic_id"] : null,
      canal: String(l["canal"] ?? "instagram"),
      evento: String(l["evento"] ?? "comment.created"),
      contem: textos(l["contem"]),
      naoContem: textos(l["nao_contem"]),
      exigirCaptacao: l["exigir_captacao"] !== false,
      midias: textos(l["midias"]),
      criarLead: l["criar_lead"] === true,
      criarOportunidade: l["criar_oportunidade"] === true,
      enviarPrivateReply: l["enviar_private_reply"] === true,
      intencao: typeof l["intencao"] === "string" ? l["intencao"] : null,
      copy: typeof l["copy"] === "string" ? l["copy"] : null,
      cooldownHoras: typeof l["cooldown_horas"] === "number" ? l["cooldown_horas"] : 168,
      ativa: l["ativa"] === true,
    }));
}

export type PedidoDeRegra = {
  organizationId: string;
  userId: string | null;
  id?: string | null;
  nome: string;
  clinicId: string | null;
  canal: string;
  evento: string;
  contem: readonly string[];
  naoContem: readonly string[];
  exigirCaptacao: boolean;
  midias: readonly string[];
  criarLead: boolean;
  criarOportunidade: boolean;
  enviarPrivateReply: boolean;
  intencao: string | null;
  copy: string | null;
  cooldownHoras: number;
  ativa: boolean;
};

/**
 * Grava uma regra social.
 *
 * ============================================================================
 *  A REGRA NASCE DESLIGADA quando alguém liga o private reply sem cooldown.
 *
 *  Não é paternalismo: `cooldown_horas = 0` com `enviar_private_reply = true` é
 *  uma configuração que manda um direct por comentário, e dez comentários da
 *  mesma pessoa viram dez directs. A Meta trata isso como spam, e a penalidade
 *  é a conta.
 *
 *  A regra é gravada como a pessoa pediu — ela pode ter motivo —, e a resposta
 *  diz o que foi feito. O que NÃO acontece é o sistema fazer isso em silêncio.
 * ============================================================================
 */
export async function salvarRegraSocial(
  p: PedidoDeRegra,
): Promise<{ ok: true; id: string; aviso: string | null } | { ok: false; motivo: string }> {
  const nome = p.nome.trim();
  if (nome.length === 0) return { ok: false, motivo: "Dê um nome à regra." };

  const contem = [...new Set(p.contem.map((c) => c.trim()).filter((c) => c.length > 0))];

  if (p.ativa && contem.length === 0) {
    /*
     * REGRA ATIVA SEM PALAVRA É RECUSADA na gravação, e não só ignorada em
     * `casarRegra`.
     *
     * `casarRegra` já não casa nada nesse caso — ver o comentário dela. Mas
     * deixar salvar produziria uma regra que aparece "Ativa" na tela e não faz
     * nada, e a pessoa passaria a tarde tentando entender por quê.
     */
    return {
      ok: false,
      motivo:
        "Uma regra ativa precisa de pelo menos uma palavra em 'Contém'. Sem palavra nenhuma ela não casaria comentário nenhum — e apareceria como ativa sem fazer nada.",
    };
  }

  const cooldown = Math.max(0, Math.min(Math.trunc(p.cooldownHoras), 8760));

  const linha = {
    organization_id: p.organizationId,
    clinic_id: p.clinicId,
    nome: nome.slice(0, 200),
    canal: p.canal,
    evento: p.evento,
    contem,
    nao_contem: [...new Set(p.naoContem.map((c) => c.trim()).filter((c) => c.length > 0))],
    exigir_captacao: p.exigirCaptacao,
    midias: [...new Set(p.midias.map((m) => m.trim()).filter((m) => m.length > 0))],
    criar_lead: p.criarLead,
    criar_oportunidade: p.criarOportunidade,
    enviar_private_reply: p.enviarPrivateReply,
    intencao: p.intencao,
    copy: p.copy === null ? null : p.copy.slice(0, 1000),
    cooldown_horas: cooldown,
    ativa: p.ativa,
    atualizado_em: new Date().toISOString(),
  };

  let id: string;

  if (p.id !== null && p.id !== undefined && p.id.length > 0) {
    const { atualizar } = await import("../servidor/banco");
    await atualizar(
      "crc_regras_sociais",
      [
        { coluna: "id", op: "eq", valor: p.id },
        { coluna: "organization_id", op: "eq", valor: p.organizationId },
      ],
      linha,
    );
    id = p.id;
  } else {
    const { inserir } = await import("../servidor/banco");
    const criadas = await inserir("crc_regras_sociais", linha);
    id = String(criadas[0]?.["id"] ?? "");
  }

  await auditar({
    organizationId: p.organizationId,
    userId: p.userId,
    ator: "humano",
    acao: "social.regra_salva",
    entityType: "regra_social",
    entityId: id,
    depois: {
      nome,
      ativa: p.ativa,
      enviarPrivateReply: p.enviarPrivateReply,
      cooldownHoras: cooldown,
      contem,
    },
  });

  const aviso =
    p.enviarPrivateReply && cooldown === 0
      ? "Atenção: resposta privada com cooldown zero manda um direct por comentário. Dez comentários da mesma pessoa viram dez directs, e a Meta trata isso como spam."
      : null;

  return { ok: true, id, aviso };
}

export async function removerRegraSocial(p: {
  organizationId: string;
  id: string;
  userId: string | null;
}): Promise<void> {
  await apagar("crc_regras_sociais", [
    { coluna: "id", op: "eq", valor: p.id },
    { coluna: "organization_id", op: "eq", valor: p.organizationId },
  ]);

  await auditar({
    organizationId: p.organizationId,
    userId: p.userId,
    ator: "humano",
    acao: "social.regra_removida",
    entityType: "regra_social",
    entityId: p.id,
    depois: null,
  });
}

/* -------------------------------------------------------------------------- */
/* O padrão inicial — §79, degrau 1                                           */
/* -------------------------------------------------------------------------- */

/**
 * A regra de exemplo que nasce DESLIGADA.
 *
 * ============================================================================
 *  ELA EXISTE PARA SER LIDA, e não para ser usada como está.
 *
 *  O §79 monta o rollout em degraus, e o degrau 4 — "private reply automático
 *  somente em regra restrita" — é o quarto. Uma regra que nascesse ativa
 *  atropelaria os três primeiros.
 *
 *  O valor dela é mostrar a FORMA: quais palavras, qual veto, qual cooldown. A
 *  tela em branco não ensina que `nao_contem: ["capilar"]` existe — e "implante
 *  capilar" é o falso positivo que acontece de verdade numa clínica
 *  odontológica.
 * ============================================================================
 */
export async function semearRegraDeExemplo(p: {
  organizationId: string;
  clinicId: string | null;
  userId: string | null;
}): Promise<string | null> {
  const jaTem = await selecionarUm("crc_regras_sociais", {
    colunas: "id",
    filtros: [{ coluna: "organization_id", op: "eq", valor: p.organizationId }],
  });
  if (jaTem !== null) return null;

  const r = await salvarRegraSocial({
    organizationId: p.organizationId,
    userId: p.userId,
    nome: "Exemplo — comentário sobre implante",
    clinicId: p.clinicId,
    canal: "instagram",
    evento: "comment.created",
    contem: ["implante", "implantes", "quero implante", "valor do implante"],
    // O VETO QUE IMPORTA: clínica odontológica, e "implante capilar" não é
    // odontologia. Sem ele, a regra responde a quem procurava dermatologista.
    naoContem: ["capilar", "cabelo", "silicone", "mama"],
    exigirCaptacao: true,
    midias: [],
    criarLead: true,
    criarOportunidade: true,
    // DESLIGADO. Ver o cabeçalho: private reply é o degrau 4 do §79.
    enviarPrivateReply: false,
    intencao: "INTERESSE",
    copy: null,
    cooldownHoras: 168,
    // A REGRA NASCE INATIVA. §4.5 — o caminho do esquecimento leva ao seguro.
    ativa: false,
  });

  return r.ok ? r.id : null;
}

/* -------------------------------------------------------------------------- */
/* Os canais do paciente — §24                                                */
/* -------------------------------------------------------------------------- */

export type CanalDoPaciente = {
  canal: string;
  /** O `@usuario` ou telefone, já pronto para a tela. */
  contato: string;
  conversationId: string;
  primeiroContatoEm: string | null;
  ultimoContatoEm: string | null;
  naoLidas: number;
};

/**
 * Os canais por onde esta pessoa já falou — §23, §24.
 *
 * ============================================================================
 *  UMA CONVERSA POR CANAL, E TODAS NA MESMA FICHA — é o §23 literal.
 *
 *  O Instagram e o WhatsApp da mesma pessoa NÃO são fundidos numa thread
 *  visual: são conversas diferentes, com janelas diferentes, políticas
 *  diferentes e identificadores diferentes. Juntá-las na tela faria a recepção
 *  responder no canal errado — e no Instagram fora das 24 horas isso significa
 *  a mensagem não sair.
 *
 *  O que é ÚNICO é a PESSOA. Esta função é o que a ficha usa para mostrar
 *  "Canais conhecidos", e a linha do tempo (`crc_linha_do_tempo`) é o que
 *  mostra tudo em ordem cronológica.
 * ============================================================================
 */
export async function canaisDoPaciente(
  organizationId: string,
  patientId: string,
): Promise<CanalDoPaciente[]> {
  const { contatoParaTela } = await import("../dominio/canais");
  const { telefoneParaTela } = await import("../dominio/telefone");

  const linhas = await selecionar("crc_conversations", {
    colunas: "id,canal,contato_externo,apelido_externo,nao_lidas,criado_em,ultima_mensagem_em",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "patient_id", op: "eq", valor: patientId },
    ],
    ordenar: [{ coluna: "ultima_mensagem_em", ascendente: false, nullsPrimeiro: false }],
    limite: 20,
  });

  return linhas.map((l) => {
    const canal = String(l["canal"] ?? "whatsapp");
    const contato = String(l["contato_externo"] ?? "");
    const apelido = typeof l["apelido_externo"] === "string" ? l["apelido_externo"] : null;

    return {
      canal,
      // O TELEFONE É FORMATADO POR QUEM SABE FORMATAR TELEFONE. `contatoParaTela`
      // decide QUE é telefone; `telefoneParaTela` decide COMO mostrar. Duplicar
      // a regra do DDI aqui é como um defeito antigo deste repositório começou.
      contato:
        canal === "whatsapp" ? telefoneParaTela(contato) : contatoParaTela(canal, contato, apelido),
      conversationId: String(l["id"] ?? ""),
      primeiroContatoEm: typeof l["criado_em"] === "string" ? l["criado_em"] : null,
      ultimoContatoEm: typeof l["ultima_mensagem_em"] === "string" ? l["ultima_mensagem_em"] : null,
      naoLidas: typeof l["nao_lidas"] === "number" ? l["nao_lidas"] : 0,
    };
  });
}

/* -------------------------------------------------------------------------- */

export async function canaisMetaCadastrados(organizationId: string): Promise<number> {
  const { contar } = await import("../servidor/banco");
  return contar("crc_canais_meta", [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "ativo", op: "eq", valor: true },
  ]);
}
