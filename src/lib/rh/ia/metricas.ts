/**
 * Aritmética de permanência — feita em código, nunca pelo modelo.
 *
 * Modelo de linguagem erra conta de data com uma facilidade constrangedora, e
 * "quanto tempo ela ficou no último emprego" é exatamente a pergunta que o RH
 * da JP não pode errar. Então a IA só LÊ o que está escrito no currículo; quem
 * calcula é este arquivo, de forma determinística, testável e auditável — e o
 * resultado desce pronto para o modelo como verdade, com a instrução explícita
 * de não recalcular nada.
 *
 * Nenhum `new Date()` aqui dentro: "agora" entra sempre por parâmetro, porque
 * este cálculo roda no servidor e no navegador (SSR) e um relógio lido duas
 * vezes daria dois resultados diferentes na virada do mês.
 */
import type { EmpregoExtraido, ItemLinhaDoTempo, MetricasPermanencia } from "./tipos";

/**
 * Converte "AAAA-MM" ou "AAAA" no número absoluto de meses desde o ano 0.
 *
 * Quando o currículo traz só o ano, assume janeiro no início e dezembro no fim
 * — o intervalo MÁXIMO possível. É deliberado: é melhor superestimar a
 * permanência de alguém do que acusar a pessoa de rotatividade por causa da
 * imprecisão do currículo dela. Toda dúvida de data corre a favor da candidata.
 */
export function paraMes(txt: string, ehFim = false): number | null {
  if (!txt) return null;
  const s = txt.trim();

  const comMes = /^(\d{4})-(\d{1,2})/.exec(s);
  if (comMes) {
    const ano = Number(comMes[1] ?? "");
    const mes = Number(comMes[2] ?? "");
    if (!Number.isFinite(ano) || mes < 1 || mes > 12) return null;
    return ano * 12 + (mes - 1);
  }

  const soAno = /^(\d{4})$/.exec(s);
  if (soAno) {
    const ano = Number(soAno[1] ?? "");
    return Number.isFinite(ano) ? ano * 12 + (ehFim ? 11 : 0) : null;
  }

  return null;
}

/** Distância em meses. Nunca negativa: ver o tratamento de fim < início abaixo. */
export function mesesEntre(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return Math.max(0, b - a);
}

type ItemCalculado = EmpregoExtraido & {
  mesInicio: number | null;
  mesFim: number | null;
  meses: number | null;
  datado: boolean;
};

/** Mês absoluto de volta para "AAAA-MM". */
function deMes(m: number): string {
  const ano = Math.floor(m / 12);
  const mes = String((m % 12) + 1).padStart(2, "0");
  return `${ano}-${mes}`;
}

function mediana(ns: number[]): number | null {
  if (!ns.length) return null;
  const s = [...ns].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  if (s.length % 2) return s[meio] ?? null;
  const anterior = s[meio - 1] ?? 0;
  const atual = s[meio] ?? 0;
  return Math.round((anterior + atual) / 2);
}

/** Rótulo curto de um vínculo, usado nos pares de sobreposição. */
function rotuloVinculo(e: EmpregoExtraido): string {
  const cargo = e.cargo.trim() || "cargo não informado";
  const empresa = e.empresa.trim() || "empresa não informada";
  return `${cargo} — ${empresa}`;
}

export function calcularMetricas(empregos: EmpregoExtraido[], agora: Date): MetricasPermanencia {
  const mesAgora = agora.getUTCFullYear() * 12 + agora.getUTCMonth();

  const itens: ItemCalculado[] = empregos.map((e) => {
    const ini = paraMes(e.inicio, false);
    const fimBruto = e.atual ? mesAgora : paraMes(e.fim, true);
    // Um fim anterior ao início é erro de digitação do currículo, não
    // permanência negativa: descarta a duração e o vínculo entra na linha do
    // tempo sem número, em vez de inventar um valor ou virar um negativo que
    // envenenaria a média e a mediana.
    const fim = fimBruto != null && ini != null && fimBruto < ini ? null : fimBruto;
    /* A duração pode vir de DUAS fontes, e a ordem importa:
       1. das datas, quando existem — conta calculada;
       2. da duração que o próprio currículo declara ("2 anos"), quando ele dá
          o tempo em vez do período.
       O segundo caso era descartado, e com ele ia embora justamente o que a
       clínica mais quer saber. Ler "2 anos" não é inventar data nenhuma: a
       pessoa continua sem `mesInicio`, então não entra em lacuna, sobreposição
       nem ordem cronológica — só na conta de permanência, onde é a verdade. */
    const calculada = mesesEntre(ini, fim);
    const declarada =
      typeof e.duracaoMesesDeclarada === "number" && e.duracaoMesesDeclarada > 0
        ? e.duracaoMesesDeclarada
        : null;
    return {
      ...e,
      mesInicio: ini,
      mesFim: fim,
      meses: calculada ?? declarada,
      datado: ini != null,
    };
  });

  const datados = itens.filter((i) => i.datado);
  const comDuracao = itens.filter((i) => i.meses != null);

  // O "último" é o de início mais recente, não o primeiro da lista: currículo
  // que mistura ordem cronológica com ordem de importância é regra, não exceção.
  const ordenados = [...datados].sort((a, b) => (b.mesInicio ?? 0) - (a.mesInicio ?? 0));
  const ultimo = ordenados[0] ?? null;

  const somaMeses = comDuracao.reduce((s, i) => s + (i.meses ?? 0), 0);
  const somaOnde = (filtro: (i: ItemCalculado) => boolean): number =>
    comDuracao.filter(filtro).reduce((s, i) => s + (i.meses ?? 0), 0);

  // Lacunas: buraco de 4+ meses entre o fim de um vínculo e o início do
  // seguinte. Menos que isso é troca normal de emprego, não lacuna.
  const cronologicos = [...datados].sort((a, b) => (a.mesInicio ?? 0) - (b.mesInicio ?? 0));
  const lacunas: { de: string; ate: string; meses: number }[] = [];
  for (let i = 1; i < cronologicos.length; i++) {
    const ant = cronologicos[i - 1];
    const atu = cronologicos[i];
    if (!ant || !atu || ant.mesFim == null || atu.mesInicio == null) continue;
    const vazio = atu.mesInicio - ant.mesFim;
    if (vazio >= 4)
      lacunas.push({ de: deMes(ant.mesFim), ate: deMes(atu.mesInicio), meses: vazio });
  }

  // Sobreposições: dois vínculos datados cujos intervalos se cruzam por 2 meses
  // ou mais. É o achado mais valioso desta função para o RH — na prática é o
  // sinal mais comum de data errada ou de currículo inflado. Dois meses de
  // folga porque emenda de emprego (sai dia 5, entra dia 20) costuma aparecer
  // como um mês de encavalamento no arredondamento para "AAAA-MM", e isso não
  // é contradição nenhuma. Sobreposição legítima existe (dois meios-períodos),
  // e por isso o sinal correspondente vira pergunta de entrevista, não acusação.
  const comIntervalo = datados.filter((i) => i.mesInicio != null && i.mesFim != null);
  const sobreposicoes: { a: string; b: string; meses: number }[] = [];
  for (let i = 0; i < comIntervalo.length; i++) {
    for (let j = i + 1; j < comIntervalo.length; j++) {
      const a = comIntervalo[i];
      const b = comIntervalo[j];
      if (
        !a ||
        !b ||
        a.mesInicio == null ||
        a.mesFim == null ||
        b.mesInicio == null ||
        b.mesFim == null
      )
        continue;
      const cruzamento = Math.min(a.mesFim, b.mesFim) - Math.max(a.mesInicio, b.mesInicio);
      if (cruzamento >= 2) {
        sobreposicoes.push({ a: rotuloVinculo(a), b: rotuloVinculo(b), meses: cruzamento });
      }
    }
  }

  const curtos = comDuracao.filter((i) => (i.meses ?? 0) < 12).length;
  const inicios24 = datados.filter((i) => (i.mesInicio ?? 0) >= mesAgora - 24).length;

  const linhaDoTempo: ItemLinhaDoTempo[] = itens.map((i) => ({
    empresa: i.empresa,
    cargo: i.cargo,
    de: i.mesInicio != null ? deMes(i.mesInicio) : "",
    ate: i.atual ? "atual" : i.mesFim != null ? deMes(i.mesFim) : "",
    meses: i.meses,
    setor: i.setor,
    odontologico: i.odontologico,
    atendimentoPublico: i.atendimentoPublico,
    administrativo: i.administrativo,
    atual: i.atual,
  }));

  return {
    totalEmpregos: itens.length,
    empregosDatados: datados.length,
    empregosSemData: itens.length - datados.length,
    empregosComDuracao: comDuracao.length,

    mesesUltimoEmprego: ultimo?.meses ?? null,
    ultimoEmprego: ultimo
      ? { empresa: ultimo.empresa, cargo: ultimo.cargo, meses: ultimo.meses }
      : null,
    // Sem nenhum vínculo datado não dá para afirmar nada: `null` é "não sei",
    // e é diferente de `false` ("está desempregada"), que vira sinal na tela.
    empregadaAtualmente: itens.some((i) => i.atual) ? true : datados.length ? false : null,

    mediaMesesPorEmprego: comDuracao.length ? Math.round(somaMeses / comDuracao.length) : null,
    medianaMeses: mediana(comDuracao.map((i) => i.meses ?? 0)),
    mesesExperienciaTotal: comDuracao.length ? somaMeses : null,

    mesesEmOdontologia: somaOnde((i) => i.odontologico),
    mesesEmSaude: somaOnde((i) => i.saude),
    mesesAtendimentoPublico: somaOnde((i) => i.atendimentoPublico),
    mesesAdministrativo: somaOnde((i) => i.administrativo),

    empregosCurtos: curtos,
    proporcaoCurtos: comDuracao.length ? Math.round((curtos / comDuracao.length) * 100) : null,
    inicios24Meses: inicios24,

    lacunas,
    sobreposicoes,
    linhaDoTempo,
  };
}

/** "14" -> "1 ano e 2 meses". `null` vira "não informado", nunca "0 meses". */
export function emAnosMeses(meses: number | null): string {
  if (meses == null) return "não informado";
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const parteAnos = `${anos} ${anos === 1 ? "ano" : "anos"}`;
  const parteMeses = `${resto} ${resto === 1 ? "mês" : "meses"}`;
  if (!anos) return parteMeses;
  if (!resto) return parteAnos;
  return `${parteAnos} e ${parteMeses}`;
}
