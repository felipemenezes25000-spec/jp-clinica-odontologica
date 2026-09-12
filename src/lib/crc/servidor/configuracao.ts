/**
 * Configuração, flags e kill switches lidos do banco — itens 42, 95, 102, 171.
 *
 * O DOMÍNIO define a FORMA e os padrões (`dominio/configuracao.ts`, puro e
 * testável). Este arquivo faz a leitura e a mesclagem. A separação é o que
 * permite os testes do horário comercial e da política de contato rodarem sem
 * banco nenhum.
 *
 * A MESCLAGEM É POR CAMPO, e não objeto inteiro: uma organização que configurou
 * só `recallDias` continua herdando os padrões do resto. Substituir o objeto
 * faria configurar um campo apagar todos os outros.
 */
import {
  CONFIGURACAO_PADRAO,
  FLAGS_PADRAO,
  type ChaveFlag,
  type ChaveKillSwitch,
  type ConfiguracaoCrc,
  type HorarioComercial,
} from "../dominio/configuracao";

import { gravar, selecionar } from "./banco";
import { auditar, registrar } from "./registro";

/**
 * Cache por processo, com validade curta.
 *
 * A configuração é lida em TODO passo de jornada e em todo envio. Sem cache,
 * um ciclo de 25 jornadas faria 25 leituras idênticas. Trinta segundos é curto
 * o bastante para uma mudança na tela surtir efeito enquanto o gestor ainda
 * está olhando, e longo o bastante para o worker não martelar o banco.
 *
 * O kill switch NÃO passa por aqui: ele é lido direto, sempre. Um interruptor
 * de emergência que demora meio minuto para valer não é interruptor de
 * emergência.
 */
type Entrada = { valor: ConfiguracaoCrc; expiraEm: number };
const cache = new Map<string, Entrada>();
const VALIDADE_MS = 30_000;

export function _limparCacheDeConfiguracao(): void {
  cache.clear();
  cacheOverride.clear();
}

/**
 * A configuração efetiva, com a hierarquia inteira.
 *
 * ============================================================================
 *  PADRÃO DO SISTEMA  →  ORGANIZAÇÃO  →  CLÍNICA
 *
 *  A terceira camada é nova (`supabase/28`), e a falta dela era concreta numa
 *  rede: `crc_settings` tem chave `(organization_id, chave)`, então horário
 *  comercial, fuso e feriados eram da empresa inteira.
 *
 *      a unidade do shopping abre às 10h e fecha às 22h;
 *      a do centro abre às 8h e fecha às 18h;
 *      a da praia fecha na segunda.
 *
 *  Com um horário só, a rede escolhe entre mandar mensagem às 21h para quem
 *  está dormindo ou parar de falar às 18h com quem ainda está atendendo. As
 *  duas opções são erradas, e nenhuma delas dá erro.
 * ============================================================================
 *
 * A MESCLAGEM É POR CAMPO, e não por objeto — em todas as camadas. Uma clínica
 * que sobrescreve só o horário continua herdando `recallDias` da organização. É
 * o que permite um override PEQUENO: não é preciso copiar a configuração toda
 * para mudar o fechamento de uma unidade.
 *
 * `clinicId` NULO é o caso simples e continua com uma leitura só.
 */
export async function lerConfiguracao(
  organizationId: string,
  clinicId: string | null = null,
): Promise<ConfiguracaoCrc> {
  const chave =
    clinicId === null || clinicId.length === 0 ? organizationId : `${organizationId}|${clinicId}`;

  const emCache = cache.get(chave);
  if (emCache !== undefined && emCache.expiraEm > Date.now()) return emCache.valor;

  const daOrganizacao = await selecionar("crc_settings", {
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
  });

  /*
   * A LEITURA DO OVERRIDE SÓ ACONTECE QUANDO HÁ CLÍNICA, e ela é tolerante a
   * falha: banco sem `supabase/28` devolve erro, e o comportamento certo aí é
   * seguir com a configuração da organização — que é exatamente o
   * comportamento de antes. Derrubar o envio porque a tabela de override ainda
   * não existe seria trocar "a unidade usa o horário da matriz" por "a unidade
   * não fala com ninguém".
   */
  const daClinica =
    clinicId === null || clinicId.length === 0
      ? []
      : await overrideDaClinica(organizationId, clinicId);

  // A ORDEM É A PRECEDÊNCIA: a última camada a falar vence.
  const valor = mesclar([...daOrganizacao, ...daClinica]);
  cache.set(chave, { valor, expiraEm: Date.now() + VALIDADE_MS });
  return valor;
}

/**
 * Aplica SÓ o override da clínica sobre uma configuração que quem chama já tem.
 *
 * ============================================================================
 *  POR QUE ISTO EXISTE, EM VEZ DE RELER TUDO.
 *
 *  A primeira versão trocava a configuração recebida por uma releitura completa
 *  (`lerConfiguracao(org, clinic)`). O resultado é quase sempre igual — e
 *  "quase" é o problema: um chamador que passa uma configuração DELIBERADAMENTE
 *  diferente (uma simulação, um teste, um cenário do playground) veria o
 *  parâmetro ser ignorado em silêncio.
 *
 *  Um parâmetro que às vezes é obedecido e às vezes não é pior do que um
 *  parâmetro que não existe.
 * ============================================================================
 *
 * Aqui a configuração recebida é a base, e só as chaves que a unidade
 * sobrescreveu mudam. Sem override, devolve o mesmo objeto.
 */
export async function comOverrideDaClinica(
  base: ConfiguracaoCrc,
  organizationId: string,
  clinicId: string | null,
): Promise<ConfiguracaoCrc> {
  if (clinicId === null || clinicId.length === 0) return base;

  const chave = `override|${organizationId}|${clinicId}`;
  const emCache = cacheOverride.get(chave);
  const linhas =
    emCache !== undefined && emCache.expiraEm > Date.now()
      ? emCache.linhas
      : await (async () => {
          const lidas = await overrideDaClinica(organizationId, clinicId);
          cacheOverride.set(chave, { linhas: lidas, expiraEm: Date.now() + VALIDADE_MS });
          return lidas;
        })();

  // SEM OVERRIDE, O MESMO OBJETO. Não é micro-otimização: é a garantia de que
  // ligar a terceira camada não muda nada para quem não a usa.
  if (linhas.length === 0) return base;

  return mesclar(linhas, base);
}

type EntradaOverride = { linhas: Record<string, unknown>[]; expiraEm: number };
const cacheOverride = new Map<string, EntradaOverride>();

async function overrideDaClinica(
  organizationId: string,
  clinicId: string,
): Promise<Record<string, unknown>[]> {
  try {
    return await selecionar("crc_settings_clinica", {
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "clinic_id", op: "eq", valor: clinicId },
      ],
    });
  } catch {
    return [];
  }
}

/**
 * `mesclar` recebe as camadas JÁ CONCATENADAS, na ordem de precedência.
 *
 * O laço aplica uma linha por vez, então a última a falar vence — e é por isso
 * que a clínica vem depois da organização na chamada. Um `Object.assign` de
 * objetos inteiros daria o resultado errado: sobrescrever `horarioComercial`
 * inteiro apagaria os feriados da organização que a unidade não redefiniu.
 */
function mesclar(
  linhas: readonly Record<string, unknown>[],
  base: ConfiguracaoCrc = CONFIGURACAO_PADRAO,
): ConfiguracaoCrc {
  const cfg: ConfiguracaoCrc = {
    ...base,
    horarioComercial: { ...base.horarioComercial },
  };

  for (const linha of linhas) {
    const chave = String(linha["chave"] ?? "");
    const valor = linha["valor"];

    switch (chave) {
      case "recallDias":
      case "recallLongoDias":
      case "inatividadeDias":
      case "orcamentoParadoDias":
      case "faltaEsperaHoras":
      case "confirmacaoAntecedenciaHoras":
      case "contatosPorDia":
      case "cooldownHoras":
      case "tentativasPorJornada":
      case "envioPorHora": {
        const n = numeroPositivo(valor);
        if (n !== null) cfg[chave] = n;
        break;
      }
      case "iaConfiancaAutomatica":
      case "iaConfiancaSugestao": {
        const n = fracao(valor);
        if (n !== null) cfg[chave] = n;
        break;
      }
      case "horarioComercial": {
        const h = lerHorario(valor);
        if (h !== null) cfg.horarioComercial = h;
        break;
      }
      default:
        // Chave desconhecida é ignorada, e não é erro: ela pode ser de uma
        // versão futura, ou resto de uma feature removida. Estourar aqui
        // derrubaria a operação por causa de uma linha órfã.
        break;
    }
  }

  // O limiar de sugestão nunca pode passar o de ação automática — a faixa do
  // meio deixaria de existir e a IA agiria sozinha com confiança baixa.
  if (cfg.iaConfiancaSugestao > cfg.iaConfiancaAutomatica) {
    cfg.iaConfiancaSugestao = cfg.iaConfiancaAutomatica;
  }

  return cfg;
}

function numeroPositivo(valor: unknown): number | null {
  const n = typeof valor === "number" ? valor : Number.parseFloat(String(valor));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fracao(valor: unknown): number | null {
  const n = typeof valor === "number" ? valor : Number.parseFloat(String(valor));
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

/**
 * Lê o horário comercial gravado, campo a campo.
 *
 * Um horário malformado é RECUSADO INTEIRO (devolve `null`, e o padrão vale).
 * Aceitar pela metade produziria uma clínica com três dias configurados e
 * quatro fechados sem ninguém ter pedido isso — e o sintoma seria "a automação
 * parou de mandar mensagem às quintas".
 */
function lerHorario(valor: unknown): HorarioComercial | null {
  if (typeof valor !== "object" || valor === null) return null;
  const o = valor as Record<string, unknown>;

  const dias = o["dias"];
  if (!Array.isArray(dias) || dias.length !== 7) return null;

  const janelas = dias.map((d) => {
    if (d === null || typeof d !== "object") return null;
    const j = d as Record<string, unknown>;
    const inicio = j["inicio"];
    const fim = j["fim"];
    if (typeof inicio !== "string" || typeof fim !== "string") return null;
    if (!/^\d{2}:\d{2}$/u.test(inicio) || !/^\d{2}:\d{2}$/u.test(fim)) return null;
    if (inicio >= fim) return null;
    return { inicio, fim };
  });

  const feriados = Array.isArray(o["feriados"])
    ? o["feriados"].filter(
        (f): f is string => typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(f),
      )
    : [];

  return {
    dias: janelas as HorarioComercial["dias"],
    feriados,
    fuso: typeof o["fuso"] === "string" ? o["fuso"] : CONFIGURACAO_PADRAO.horarioComercial.fuso,
  };
}

export async function gravarConfiguracao(
  organizationId: string,
  chave: string,
  valor: unknown,
  userId: string | null,
): Promise<void> {
  await gravar(
    "crc_settings",
    {
      organization_id: organizationId,
      chave,
      valor,
      atualizado_por: userId,
      atualizado_em: new Date().toISOString(),
    },
    "organization_id,chave",
  );

  cache.delete(organizationId);

  await auditar({
    organizationId,
    userId,
    ator: "humano",
    acao: "configuracao.alterada",
    entityType: "settings",
    entityId: null,
    depois: { chave, valor },
  });
}

/* -------------------------------------------------------------------------- */
/* Feature flags                                                              */
/* -------------------------------------------------------------------------- */

export async function lerFlags(organizationId: string): Promise<Record<string, boolean>> {
  const linhas = await selecionar("crc_feature_flags", {
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
  });

  const flags: Record<string, boolean> = { ...FLAGS_PADRAO };
  for (const l of linhas) {
    const chave = String(l["chave"] ?? "");
    if (chave.length > 0) flags[chave] = l["ligada"] === true;
  }
  return flags;
}

export async function flagLigada(organizationId: string, chave: ChaveFlag): Promise<boolean> {
  const flags = await lerFlags(organizationId);
  // O padrão é DESLIGADO (item 95). Uma flag que não existe no banco não pode
  // significar "ligada".
  return flags[chave] === true;
}

export async function definirFlag(
  organizationId: string,
  chave: ChaveFlag,
  ligada: boolean,
  userId: string | null,
): Promise<void> {
  await gravar(
    "crc_feature_flags",
    {
      organization_id: organizationId,
      chave,
      ligada,
      atualizado_em: new Date().toISOString(),
    },
    "organization_id,chave",
  );

  await auditar({
    organizationId,
    userId,
    ator: "humano",
    acao: ligada ? "flag.ligada" : "flag.desligada",
    entityType: "feature_flag",
    entityId: null,
    depois: { chave, ligada },
  });

  registrar("info", "Feature flag alterada.", { organizationId, chave, ligada });
}

/* -------------------------------------------------------------------------- */
/* Kill switches (Milestone 16)                                               */
/* -------------------------------------------------------------------------- */

/**
 * Lê os interruptores de emergência, SEM cache.
 *
 * Ver a explicação no topo. Um "pausar todas as automações" que leva trinta
 * segundos para valer não serve para o momento em que alguém precisa dele.
 */
export async function lerKillSwitches(organizationId: string): Promise<Record<string, boolean>> {
  const linhas = await selecionar("crc_feature_flags", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "chave", op: "like", valor: "kill_*" },
    ],
  });

  const switches: Record<string, boolean> = {};
  for (const l of linhas) {
    switches[String(l["chave"] ?? "")] = l["ligada"] === true;
  }
  return switches;
}

export async function acionarKillSwitch(
  organizationId: string,
  chave: ChaveKillSwitch,
  ligado: boolean,
  userId: string | null,
): Promise<void> {
  await gravar(
    "crc_feature_flags",
    {
      organization_id: organizationId,
      chave,
      ligada: ligado,
      atualizado_em: new Date().toISOString(),
    },
    "organization_id,chave",
  );

  await auditar({
    organizationId,
    userId,
    ator: "humano",
    acao: ligado ? "kill_switch.acionado" : "kill_switch.liberado",
    entityType: "kill_switch",
    entityId: null,
    depois: { chave, ligado },
  });

  // Nível de aviso, e não info: acionar um kill switch é sempre um evento
  // notável, e ele precisa aparecer no filtro de alerta da plataforma.
  registrar("aviso", ligado ? "Kill switch ACIONADO." : "Kill switch liberado.", {
    organizationId,
    chave,
  });
}
