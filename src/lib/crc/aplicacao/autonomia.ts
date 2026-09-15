/**
 * O Centro de Autonomia — a leitura e a decisão, com o banco no meio.
 *
 * A POLÍTICA MORA EM `dominio/autonomia.ts`, e é pura. Aqui só entra o que
 * precisa do banco: qual nível está configurado, quais flags estão ligadas,
 * qual kill switch está acionado — e a gravação, que é auditada.
 *
 * ============================================================================
 *  A INVARIANTE QUE ESTE ARQUIVO NÃO PODE QUEBRAR:
 *
 *      NENHUM CAMINHO DAQUI PARA FORA AGE SEM PASSAR POR `podeAgir()`.
 *
 *  É por isso que `autorizar()` é a única função exportada que devolve
 *  permissão, e por isso ela sempre lê os kill switches SEM CACHE. Um
 *  "pausar tudo" que leva trinta segundos para valer não serve para o momento
 *  em que alguém precisa dele.
 * ============================================================================
 */
import {
  CATALOGO,
  descreverDominio,
  nivelEfetivo,
  nivelValido,
  podeAgir,
  type DominioAutonomia,
  type NivelAutonomia,
  type RiscoDaAcao,
  type Veredito,
} from "../dominio/autonomia";
import { KILL_SWITCHES } from "../dominio/configuracao";
import { apagar, gravar, selecionar, type Filtro } from "../servidor/banco";
import { lerFlags, lerKillSwitches } from "../servidor/configuracao";
import { auditar, registrar } from "../servidor/registro";

/* -------------------------------------------------------------------------- */
/* Leitura                                                                    */
/* -------------------------------------------------------------------------- */

export type NivelConfigurado = {
  dominio: DominioAutonomia;
  /**
   * O nível que VALE: `min(domínio, canal)`.
   *
   * É o que a tela mostra e o que todo chamador anterior ao `supabase/45`
   * espera. Sem canal pedido, ele é o nível do domínio.
   */
  nivel: NivelAutonomia;
  /**
   * O nível do DOMÍNIO, antes do teto de canal — §27.
   *
   * ==========================================================================
   *  OS DOIS VIAJAM SEPARADOS PORQUE A FRASE DE RECUSA PRECISA DIZER QUAL DOS
   *  DOIS APERTOU.
   *
   *  Com só o efetivo, uma clínica com domínio em 4 e canal em 2 leria
   *  "este domínio está no nível 2" — e alguém tentaria aumentar o domínio, sem
   *  efeito, porque o que segurava era o canal.
   * ==========================================================================
   */
  nivelDoDominio: NivelAutonomia;
  /** O teto do canal, quando existe regra própria. `null` = sem teto. */
  nivelDoCanal: NivelAutonomia | null;
  /** `true` quando o valor veio do padrão da organização, e não da clínica. */
  herdado: boolean;
};

/**
 * Os níveis de uma clínica, com herança da organização.
 *
 * ============================================================================
 *  A HERANÇA É POR DOMÍNIO, E NÃO POR LINHA INTEIRA.
 *
 *  Uma rede configura o padrão da organização com `recall: 4` e `agenda: 2`.
 *  A unidade nova sobe `agenda` para 4 e não mexe no resto. O resultado tem que
 *  ser `recall: 4` (herdado) e `agenda: 4` (próprio) — e não "a unidade tem
 *  configuração própria, logo ignore o padrão inteiro".
 *
 *  A segunda leitura é o erro comum, e o sintoma dele é uma unidade que perde
 *  silenciosamente a configuração de nove domínios ao ajustar um.
 * ============================================================================
 *
 * O PADRÃO DE TUDO É 0. Um domínio que ninguém configurou está desligado — é a
 * mesma regra das flags, e pela mesma razão: o caminho do esquecimento tem que
 * levar ao seguro.
 */
/**
 * `''` — a linha que vale para TODOS os canais.
 *
 * É o valor que as linhas anteriores ao `supabase/45` têm, e o default da
 * coluna. Uma configuração sem canal continua governando o domínio inteiro; o
 * canal entra como um segundo teto, nunca como substituto.
 */
export const TODOS_OS_CANAIS = "";

export async function lerNiveis(
  organizationId: string,
  clinicId: string | null,
  /**
   * O canal, quando se quer o nível que vale NELE.
   *
   * Ausente (ou `TODOS_OS_CANAIS`) devolve o nível do domínio sem considerar
   * canal nenhum — que é o que a tela de configuração mostra, e o que todo
   * chamador anterior ao `supabase/45` espera.
   */
  canal: string = TODOS_OS_CANAIS,
): Promise<NivelConfigurado[]> {
  const linhas = await selecionar("crc_autonomia", {
    colunas: "clinic_id,dominio,nivel,canal",
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
  });

  const daOrganizacao = new Map<string, NivelAutonomia>();
  const daClinica = new Map<string, NivelAutonomia>();
  const doCanalNaOrganizacao = new Map<string, NivelAutonomia>();
  const doCanalNaClinica = new Map<string, NivelAutonomia>();

  for (const l of linhas) {
    const dominio = String(l["dominio"] ?? "");
    if (dominio.length === 0) continue;

    const nivel = nivelValido(l["nivel"]);
    const daLinha = l["clinic_id"];
    const canalDaLinha = typeof l["canal"] === "string" ? l["canal"] : TODOS_OS_CANAIS;

    // Linha de um canal que não é o pedido: não participa desta leitura.
    if (canalDaLinha !== TODOS_OS_CANAIS && canalDaLinha !== canal) continue;

    const ehDoCanal = canalDaLinha !== TODOS_OS_CANAIS;

    if (daLinha === null || daLinha === undefined) {
      (ehDoCanal ? doCanalNaOrganizacao : daOrganizacao).set(dominio, nivel);
    } else if (clinicId !== null && daLinha === clinicId) {
      (ehDoCanal ? doCanalNaClinica : daClinica).set(dominio, nivel);
    }
  }

  return CATALOGO.map((d) => {
    const proprio = daClinica.get(d.dominio);
    const herdado = daOrganizacao.get(d.dominio);

    const doDominio = proprio ?? herdado ?? (0 as NivelAutonomia);
    const veioDaOrganizacao = proprio === undefined;

    /*
     * O TETO DO CANAL, com a MESMA herança do domínio: a linha da clínica
     * vence a da organização.
     *
     * `undefined` quando não há regra de canal nenhuma — e aí `nivelEfetivo`
     * devolve o nível do domínio intacto, que é o comportamento de antes.
     */
    const doCanal = doCanalNaClinica.get(d.dominio) ?? doCanalNaOrganizacao.get(d.dominio);

    const efetivo = nivelEfetivo(doDominio, doCanal ?? null);

    return {
      dominio: d.dominio,
      nivel: efetivo,
      nivelDoDominio: doDominio,
      nivelDoCanal: doCanal ?? null,
      // "Herdado" continua querendo dizer "não tem linha PRÓPRIA da clínica" —
      // e um teto de canal da organização não transforma a linha em própria.
      herdado: veioDaOrganizacao && doCanalNaClinica.get(d.dominio) === undefined,
    };
  });
}

export async function lerNivel(
  organizationId: string,
  clinicId: string | null,
  dominio: DominioAutonomia,
  canal: string = TODOS_OS_CANAIS,
): Promise<NivelAutonomia> {
  const niveis = await lerNiveis(organizationId, clinicId, canal);
  return niveis.find((n) => n.dominio === dominio)?.nivel ?? 0;
}

/* -------------------------------------------------------------------------- */
/* A decisão                                                                  */
/* -------------------------------------------------------------------------- */

export type PedidoDeAutorizacao = {
  organizationId: string;
  clinicId: string | null;
  dominio: DominioAutonomia;
  risco: RiscoDaAcao;
  /**
   * Em qual canal a ação vai acontecer — §27.
   *
   * Ausente = nenhum teto de canal. É o caminho de quem não fala com pessoa
   * (writeback, marketing) e o de todo chamador anterior ao `supabase/45`.
   */
  canal?: string | null;
};

/**
 * O sistema pode fazer isto sozinho, agora, nesta clínica?
 *
 * ============================================================================
 *  O KILL SWITCH RELEVANTE DEPENDE DO DOMÍNIO, e ignorar isso seria pior que
 *  não ter kill switch nenhum.
 *
 *  `kill_automacoes` para tudo. Mas `kill_envios` só deveria parar o que fala
 *  com paciente, e `kill_escritas_do` só o que grava no Dental Office. Tratar
 *  os três como um só faria a clínica desligar o sistema inteiro para conter um
 *  problema de escrita — e, pior, faria alguém religar os três de uma vez para
 *  voltar a operar.
 * ============================================================================
 */
export async function autorizar(p: PedidoDeAutorizacao): Promise<Veredito> {
  const canal = p.canal ?? TODOS_OS_CANAIS;

  const [flags, switches, niveis] = await Promise.all([
    lerFlags(p.organizationId),
    lerKillSwitches(p.organizationId),
    /*
     * O CANAL VAI PARA A LEITURA, e não para uma checagem depois.
     *
     * `lerNiveis` resolve a herança dos DOIS — a clínica vencendo a organização
     * no domínio e no canal. Aplicar o teto de canal aqui, fora dela,
     * duplicaria a regra de herança e as duas divergiriam no primeiro caso de
     * rede com três unidades.
     */
    lerNiveis(p.organizationId, p.clinicId, canal),
  ]);

  const configurado = niveis.find((n) => n.dominio === p.dominio);
  const nivel = configurado?.nivel ?? 0;

  const veredito = podeAgir({
    dominio: p.dominio,
    risco: p.risco,
    /*
     * OS DOIS VÃO SEPARADOS, e `podeAgir` refaz o `min`.
     *
     * Passar só o efetivo faria a frase de recusa dizer "este domínio está no
     * nível 2" quando o domínio está em 4 e o canal em 2 — e alguém aumentaria
     * o domínio sem efeito. Ver `NivelConfigurado.nivelDoDominio`.
     */
    nivel: configurado?.nivelDoDominio ?? 0,
    nivelDoCanal: configurado?.nivelDoCanal ?? null,
    flags,
    killSwitch: killSwitchDoDominio(p.dominio, switches),
  });

  if (!veredito.pode) {
    registrar("info", "Ação automática recusada pelo Centro de Autonomia.", {
      organizationId: p.organizationId,
      clinicId: p.clinicId,
      dominio: p.dominio,
      canal: canal.length > 0 ? canal : null,
      risco: p.risco,
      nivel,
      motivo: veredito.motivo,
    });
  }

  return veredito;
}

function killSwitchDoDominio(
  dominio: DominioAutonomia,
  switches: Readonly<Record<string, boolean>>,
): boolean {
  // O mestre para tudo, sempre.
  if (switches[KILL_SWITCHES.todasAutomacoes] === true) return true;

  if (dominio === "writeback" || dominio === "agenda") {
    if (switches[KILL_SWITCHES.escritasDentalOffice] === true) return true;
  }

  /*
   * OS DOMÍNIOS QUE FALAM COM PACIENTE respondem ao interruptor de envio.
   *
   * `marketing` está de fora de propósito: ele só decide público e mensagem, e
   * quem envia é `campanhas`, que está aqui. Incluí-lo faria o kill switch de
   * envio também congelar o planejamento — que é justamente o trabalho que
   * alguém quer fazer enquanto o envio está parado.
   */
  const FALAM: readonly DominioAutonomia[] = [
    "mensagens",
    "campanhas",
    "recall",
    "tratamento",
    "cobranca",
    "reputacao",
    "voz",
  ];
  if (FALAM.includes(dominio) && switches[KILL_SWITCHES.enviosWhatsapp] === true) return true;

  // O interruptor das ações automáticas da IA vale para todos eles.
  if (switches[KILL_SWITCHES.acoesAutomaticasIa] === true) return true;

  return false;
}

/* -------------------------------------------------------------------------- */
/* Escrita                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Muda o nível. Sempre auditado, sempre por uma pessoa.
 *
 * `clinicId` nulo grava o padrão da organização. Os dois índices únicos do
 * `supabase/30` fazem o `on conflict` funcionar nos dois casos — e é por isso
 * que o conflito passado é diferente conforme o escopo.
 */
export async function definirNivel(
  organizationId: string,
  clinicId: string | null,
  dominio: DominioAutonomia,
  nivel: number,
  userId: string | null,
  /**
   * O canal, quando se está configurando o TETO DE UM CANAL — §27.
   *
   * `TODOS_OS_CANAIS` (o padrão) grava o nível do domínio, como sempre. Um
   * canal nomeado grava uma linha SEPARADA, que só abaixa: ver `nivelEfetivo`.
   */
  canal: string = TODOS_OS_CANAIS,
): Promise<NivelAutonomia> {
  const seguro = nivelValido(nivel);

  /*
   * O UPSERT PRECISA DE UM CONFLITO POR ESCOPO.
   *
   * `crc_autonomia_por_clinica_canal` cobre
   * (organization_id, clinic_id, dominio, canal) e só existe quando
   * `clinic_id is not null`; `crc_autonomia_padrao_da_org_canal` cobre
   * (organization_id, dominio, canal) para as linhas de padrão.
   *
   * Passar o conflito errado dá `42P10` — "no unique constraint matching ON
   * CONFLICT" — e é um erro alto, que é o que se quer: o silencioso seria
   * inserir uma segunda linha de padrão.
   *
   * O CANAL ENTROU NOS DOIS no `supabase/45`. Sem ele no conflito, gravar o
   * teto do Instagram sobrescreveria o nível do domínio — o oposto do §27.
   */
  const conflito =
    clinicId === null ? "organization_id,dominio,canal" : "organization_id,clinic_id,dominio,canal";

  await gravar(
    "crc_autonomia",
    {
      organization_id: organizationId,
      clinic_id: clinicId,
      dominio,
      canal,
      nivel: seguro,
      atualizado_por: userId,
      atualizado_em: new Date().toISOString(),
    },
    conflito,
  );

  await auditar({
    organizationId,
    userId,
    ator: "humano",
    acao: "autonomia.alterada",
    entityType: "autonomia",
    entityId: null,
    depois: { clinicId, dominio, canal: canal.length > 0 ? canal : null, nivel: seguro },
  });

  // Aviso, e não info: subir autonomia é uma decisão notável, e precisa aparecer
  // no filtro de alerta junto com os kill switches.
  registrar("aviso", "Nível de autonomia alterado.", {
    organizationId,
    clinicId,
    dominio,
    nivel: seguro,
  });

  return seguro;
}

/* -------------------------------------------------------------------------- */
/* A tela                                                                     */
/* -------------------------------------------------------------------------- */

export type PainelDeAutonomia = {
  dominio: DominioAutonomia;
  rotulo: string;
  explicacao: string;
  nivel: NivelAutonomia;
  herdado: boolean;
  /** A flag que serve de teto, e se ela está ligada. */
  teto: { chave: string; ligada: boolean } | null;
  /**
   * O nível EFETIVO: o que de fato acontece hoje.
   *
   * É a coluna que a tela precisa mostrar em destaque. Um domínio no nível 5
   * com a flag desligada opera como 0, e mostrar só o 5 é a forma mais fácil de
   * alguém concluir que a automação está quebrada quando ela está obedecendo.
   */
  efetivo: NivelAutonomia;
  bloqueadoPor: string | null;
};

export async function lerPainel(
  organizationId: string,
  clinicId: string | null,
): Promise<PainelDeAutonomia[]> {
  const [niveis, flags, switches] = await Promise.all([
    lerNiveis(organizationId, clinicId),
    lerFlags(organizationId),
    lerKillSwitches(organizationId),
  ]);

  return niveis.map((n) => {
    const d = descreverDominio(n.dominio);
    const tetoLigado = d.tetoDaFlag === null ? true : flags[d.tetoDaFlag] === true;
    const morto = killSwitchDoDominio(n.dominio, switches);

    let bloqueadoPor: string | null = null;
    if (morto) bloqueadoPor = "Kill switch acionado";
    else if (!tetoLigado) bloqueadoPor = `Chave "${String(d.tetoDaFlag)}" desligada`;

    return {
      dominio: n.dominio,
      rotulo: d.rotulo,
      explicacao: d.explicacao,
      nivel: n.nivel,
      herdado: n.herdado,
      teto: d.tetoDaFlag === null ? null : { chave: d.tetoDaFlag, ligada: tetoLigado },
      efetivo: bloqueadoPor === null ? n.nivel : (0 as NivelAutonomia),
      bloqueadoPor,
    };
  });
}

/**
 * Apaga a configuração própria da clínica e volta a herdar da organização.
 *
 * Existe porque "voltar ao padrão" não é o mesmo que "definir 0": o primeiro
 * segue o padrão da organização quando ele mudar, o segundo congela no zero.
 * Sem esta função, a única forma de voltar a herdar seria apagar a linha no
 * banco à mão.
 */
export async function voltarAHerdar(
  organizationId: string,
  clinicId: string,
  dominio: DominioAutonomia,
  userId: string | null,
): Promise<void> {
  const filtros: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "clinic_id", op: "eq", valor: clinicId },
    { coluna: "dominio", op: "eq", valor: dominio },
  ];

  await apagar("crc_autonomia", filtros);

  await auditar({
    organizationId,
    userId,
    ator: "humano",
    acao: "autonomia.herdada",
    entityType: "autonomia",
    entityId: null,
    depois: { clinicId, dominio },
  });
}
