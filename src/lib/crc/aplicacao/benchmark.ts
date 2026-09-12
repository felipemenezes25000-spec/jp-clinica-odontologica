/**
 * Benchmarking interno — §42.
 *
 * As quatro comparações que o §42 pede dentro da organização. A quinta — entre
 * tenants — NÃO está aqui e não deve estar: comparar clínicas de donos
 * diferentes sem contrato que autorize é vazar dado de um cliente para outro.
 */
import { compararPeriodos, ranquear, type Ranking, type Variacao } from "../dominio/benchmark";
import { contar, selecionar, type Filtro } from "../servidor/banco";

export type Comparacoes = {
  clinicas: Ranking;
  dentistas: Ranking;
  periodo: Variacao[];
  campanhas: Ranking;
};

function janela(coluna: string, de: string, ate: string): Filtro[] {
  return [
    { coluna, op: "gte", valor: de },
    { coluna, op: "lt", valor: ate },
  ];
}

/**
 * Comparecimento, em porcentagem — a métrica que serve para os três rankings.
 *
 * ============================================================================
 *  COMPARECIMENTO, E NÃO VOLUME.
 *
 *  Ranquear por número de consultas premiaria a unidade maior todo mês, e o
 *  painel não ensinaria nada: a maior é a maior. Comparecimento é uma TAXA, e
 *  uma taxa compara unidades de tamanhos diferentes de forma justa — que é
 *  justamente o que um benchmark precisa fazer.
 *
 *  O volume entra como PISO (`VOLUME_MINIMO`), e não como nota.
 * ============================================================================
 */
async function comparecimentoPor(
  organizationId: string,
  coluna: "clinic_id" | "dentista_externo_id",
  chaves: readonly { chave: string; rotulo: string }[],
  de: string,
  ate: string,
): Promise<{ chave: string; rotulo: string; valor: number; volume: number }[]> {
  return Promise.all(
    chaves.map(async (k) => {
      const base: Filtro[] = [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna, op: "eq", valor: k.chave },
        ...janela("inicio_em", de, ate),
      ];

      const [vieram, decididas] = await Promise.all([
        contar("crc_appointments", [...base, { coluna: "status", op: "eq", valor: "COMPLETED" }]),
        contar("crc_appointments", [
          ...base,
          // Cancelamento com aviso fica de fora dos dois lados: a cadeira deu
          // tempo de ser reocupada, e não é um comparecimento perdido.
          { coluna: "status", op: "in", valor: ["COMPLETED", "MISSED"] },
        ]),
      ]);

      return {
        chave: k.chave,
        rotulo: k.rotulo,
        valor: decididas === 0 ? 0 : Math.round((vieram / decididas) * 1000) / 10,
        volume: decididas,
      };
    }),
  );
}

export async function compararTudo(
  organizationId: string,
  clinicIds: readonly string[] | null,
  agora: Date = new Date(),
): Promise<Comparacoes> {
  const vazio: Ranking = { linhas: [], mediana: 0, comparaveis: 0, aviso: null };
  if (clinicIds !== null && clinicIds.length === 0) {
    return { clinicas: vazio, dentistas: vazio, periodo: [], campanhas: vazio };
  }

  /*
   * TRINTA DIAS CONTRA OS TRINTA ANTERIORES, sem sobreposição.
   *
   * O mesmo desenho das anomalias do briefing: se as janelas se cruzassem,
   * cada consulta contaria dos dois lados e a variação seria sempre menor que
   * a real.
   */
  const fimAtual = agora.toISOString();
  const inicioAtual = new Date(agora.getTime() - 30 * 86_400_000).toISOString();
  const inicioAnterior = new Date(agora.getTime() - 60 * 86_400_000).toISOString();

  const escopo: Filtro[] = [{ coluna: "organization_id", op: "eq", valor: organizationId }];
  if (clinicIds !== null) escopo.push({ coluna: "clinic_id", op: "in", valor: [...clinicIds] });

  const [clinicas, consultas, campanhas] = await Promise.all([
    selecionar<{ id: string; nome: string }>("crc_clinics", {
      colunas: "id,nome",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "ativa", op: "eq", valor: true },
      ],
      limite: 50,
    }),
    selecionar<{ dentista_externo_id: string | null; dentista_nome: string | null }>(
      "crc_appointments",
      {
        colunas: "dentista_externo_id,dentista_nome",
        filtros: [...escopo, ...janela("inicio_em", inicioAtual, fimAtual)],
        limite: 5000,
      },
    ),
    selecionar<{ id: string; nome: string }>("crc_campaigns", {
      colunas: "id,nome",
      filtros: escopo,
      ordenar: [{ coluna: "criado_em", ascendente: false }],
      limite: 20,
    }),
  ]);

  const dentistas = new Map<string, string>();
  for (const c of consultas) {
    if (c.dentista_externo_id === null) continue;
    dentistas.set(c.dentista_externo_id, c.dentista_nome ?? "Sem nome");
  }

  const alcancadas = clinicas.filter((c) => clinicIds === null || clinicIds.includes(c.id));

  const [porClinica, porDentista] = await Promise.all([
    comparecimentoPor(
      organizationId,
      "clinic_id",
      alcancadas.map((c) => ({ chave: c.id, rotulo: c.nome })),
      inicioAtual,
      fimAtual,
    ),
    comparecimentoPor(
      organizationId,
      "dentista_externo_id",
      [...dentistas].map(([chave, rotulo]) => ({ chave, rotulo })),
      inicioAtual,
      fimAtual,
    ),
  ]);

  /* --- período contra período ------------------------------------------- */

  const contarJanela = (extras: Filtro[], de: string, ate: string): Promise<number> =>
    contar("crc_appointments", [...escopo, ...extras, ...janela("inicio_em", de, ate)]);

  const [feitasAgora, feitasAntes, faltasAgora, faltasAntes] = await Promise.all([
    contarJanela([{ coluna: "status", op: "eq", valor: "COMPLETED" }], inicioAtual, fimAtual),
    contarJanela([{ coluna: "status", op: "eq", valor: "COMPLETED" }], inicioAnterior, inicioAtual),
    contarJanela([{ coluna: "status", op: "eq", valor: "MISSED" }], inicioAtual, fimAtual),
    contarJanela([{ coluna: "status", op: "eq", valor: "MISSED" }], inicioAnterior, inicioAtual),
  ]);

  const [leadsAgora, leadsAntes] = await Promise.all([
    contar("crc_leads", [...escopo, ...janela("criado_em", inicioAtual, fimAtual)]),
    contar("crc_leads", [...escopo, ...janela("criado_em", inicioAnterior, inicioAtual)]),
  ]);

  /* --- campanha contra campanha ----------------------------------------- */

  const porCampanha = await Promise.all(
    campanhas.map(async (c) => {
      const alvos: Filtro[] = [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "campaign_id", op: "eq", valor: c.id },
      ];
      const [total, converteram] = await Promise.all([
        contar("crc_campaign_targets", alvos),
        contar("crc_campaign_targets", [
          ...alvos,
          { coluna: "status", op: "eq", valor: "CONVERTIDO" },
        ]),
      ]);

      return {
        chave: c.id,
        rotulo: c.nome,
        valor: total === 0 ? 0 : Math.round((converteram / total) * 1000) / 10,
        volume: total,
      };
    }),
  );

  return {
    clinicas: ranquear(porClinica),
    dentistas: ranquear(porDentista),
    periodo: [
      compararPeriodos("Consultas realizadas", feitasAgora, feitasAntes, true),
      compararPeriodos("Faltas", faltasAgora, faltasAntes, false),
      compararPeriodos("Leads novos", leadsAgora, leadsAntes, true),
    ],
    campanhas: ranquear(porCampanha),
  };
}
