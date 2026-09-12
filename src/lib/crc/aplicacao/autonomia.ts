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
  nivel: NivelAutonomia;
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
export async function lerNiveis(
  organizationId: string,
  clinicId: string | null,
): Promise<NivelConfigurado[]> {
  const linhas = await selecionar("crc_autonomia", {
    colunas: "clinic_id,dominio,nivel",
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
  });

  const daOrganizacao = new Map<string, NivelAutonomia>();
  const daClinica = new Map<string, NivelAutonomia>();

  for (const l of linhas) {
    const dominio = String(l["dominio"] ?? "");
    if (dominio.length === 0) continue;

    const nivel = nivelValido(l["nivel"]);
    const daLinha = l["clinic_id"];

    if (daLinha === null || daLinha === undefined) {
      daOrganizacao.set(dominio, nivel);
    } else if (clinicId !== null && daLinha === clinicId) {
      daClinica.set(dominio, nivel);
    }
  }

  return CATALOGO.map((d) => {
    const proprio = daClinica.get(d.dominio);
    if (proprio !== undefined) return { dominio: d.dominio, nivel: proprio, herdado: false };

    const herdado = daOrganizacao.get(d.dominio);
    if (herdado !== undefined) return { dominio: d.dominio, nivel: herdado, herdado: true };

    return { dominio: d.dominio, nivel: 0 as NivelAutonomia, herdado: true };
  });
}

export async function lerNivel(
  organizationId: string,
  clinicId: string | null,
  dominio: DominioAutonomia,
): Promise<NivelAutonomia> {
  const niveis = await lerNiveis(organizationId, clinicId);
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
  const [flags, switches, nivel] = await Promise.all([
    lerFlags(p.organizationId),
    lerKillSwitches(p.organizationId),
    lerNivel(p.organizationId, p.clinicId, p.dominio),
  ]);

  const veredito = podeAgir({
    dominio: p.dominio,
    risco: p.risco,
    nivel,
    flags,
    killSwitch: killSwitchDoDominio(p.dominio, switches),
  });

  if (!veredito.pode) {
    registrar("info", "Ação automática recusada pelo Centro de Autonomia.", {
      organizationId: p.organizationId,
      clinicId: p.clinicId,
      dominio: p.dominio,
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
): Promise<NivelAutonomia> {
  const seguro = nivelValido(nivel);

  /*
   * O UPSERT PRECISA DE UM CONFLITO POR ESCOPO.
   *
   * `crc_autonomia_por_clinica` cobre (organization_id, clinic_id, dominio) e
   * só existe quando `clinic_id is not null`; `crc_autonomia_padrao_da_org`
   * cobre (organization_id, dominio) para as linhas de padrão.
   *
   * Passar o conflito errado dá `42P10` — "no unique constraint matching ON
   * CONFLICT" — e é um erro alto, que é o que se quer: o silencioso seria
   * inserir uma segunda linha de padrão.
   */
  const conflito =
    clinicId === null ? "organization_id,dominio" : "organization_id,clinic_id,dominio";

  await gravar(
    "crc_autonomia",
    {
      organization_id: organizationId,
      clinic_id: clinicId,
      dominio,
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
    depois: { clinicId, dominio, nivel: seguro },
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
