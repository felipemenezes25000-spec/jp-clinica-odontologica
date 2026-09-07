/**
 * A trajetória em barras — a resposta visual para "quanto tempo ela fica".
 *
 * As barras ficam sobre um eixo compartilhado (o mês mais antigo à esquerda,
 * hoje à direita), e não cada uma no seu trilho: só assim uma sobreposição
 * aparece como o que ela é — dois vínculos ocupando o mesmo pedaço de calendário
 * — e uma lacuna vira um buraco visível, não uma nota de rodapé. A largura
 * continua proporcional à duração, que é o que o RH quer medir com o olho.
 *
 * Nenhum número nasce aqui. Todo mês exibido veio de `calcularMetricas`, que é
 * TypeScript puro e testado; esta tela só desenha o que já foi calculado —
 * inclusive `agora`, que desce por prop congelado pela rota para o SSR e a
 * hidratação chegarem ao mesmo pixel.
 *
 * Cor nunca sozinha: cada faixa traz o setor por extenso na linha de texto e um
 * ícone próprio, porque o RH imprime esta tela em preto e branco para levar
 * para a entrevista.
 *
 * E, por ordem do cliente, cor nenhuma tinge letra aqui: a tela mora sobre o
 * verde profundo, então todo texto sai branco (85% no mínimo quando é apoio). O
 * âmbar da lacuna, o lime do vínculo atual e o traço da sobreposição sobrevivem
 * onde não são letra — barra, borda, anel e ícone.
 */
import { Briefcase, BriefcaseMedical, CircleHelp, Stethoscope, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { emAnosMeses, paraMes } from "@/lib/rh/ia/metricas";
import type { ItemLinhaDoTempo, MetricasPermanencia } from "@/lib/rh/ia/tipos";

/* -------------------------------------------------------------------------- */
/* Classificação de setor (só para exibição)                                  */
/* -------------------------------------------------------------------------- */

type CategoriaSetor = "odontologia" | "saude" | "outro";

type EstiloSetor = {
  rotulo: string;
  icone: LucideIcon;
  /** Preenchimento da barra. Difere em cor E em traço, nunca só em cor. */
  barra: string;
};

const ESTILOS: Record<CategoriaSetor, EstiloSetor> = {
  odontologia: {
    rotulo: "Odontologia",
    icone: BriefcaseMedical,
    barra: "bg-lime ring-1 ring-lime",
  },
  saude: {
    rotulo: "Saúde",
    icone: Stethoscope,
    // Tracejada, e não só mais clara: em impressão preto e branco o traço é o
    // único jeito de separar "saúde" de "odontologia".
    barra: "border border-dashed border-lime/70 bg-lime/25",
  },
  outro: {
    rotulo: "Outros setores",
    icone: Briefcase,
    barra: "bg-white/20 ring-1 ring-white/35",
  },
};

/**
 * `ItemLinhaDoTempo` carrega a bandeira `odontologico`, mas não a de `saude` —
 * o cálculo agrega os meses de saúde e não guarda o flag por vínculo. Como a
 * distinção aqui é só de desenho (odontologia chega pronta, saúde chega perto,
 * o resto chega de fora), lemos o texto do setor em vez de mudar o tipo e
 * obrigar uma migração dos dados já gravados em disco.
 */
const SETOR_SAUDE =
  /(sa[uú]d|cl[ií]nic|hospital|m[eé]dic|ambulat|farm[aá]c|laborat|enferm|fisioter|psicol|veterin|odonto|dent)/i;

function categoriaDe(item: ItemLinhaDoTempo): CategoriaSetor {
  if (item.odontologico) return "odontologia";
  return SETOR_SAUDE.test(item.setor) ? "saude" : "outro";
}

/* -------------------------------------------------------------------------- */
/* Helpers puros                                                              */
/* -------------------------------------------------------------------------- */

/** "2024-03" -> "03/2024". Entrada vazia ou estranha vira "". */
function rotuloMes(mes: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mes.trim());
  if (!m) return "";
  return `${m[2] ?? ""}/${m[1] ?? ""}`;
}

function anoDe(mesNumerico: number): string {
  return String(Math.floor(mesNumerico / 12));
}

type Faixa = {
  tipo: "emprego" | "lacuna";
  chave: string;
  inicio: number | null;
  fim: number | null;
  /** Só nas faixas de emprego. */
  item: ItemLinhaDoTempo | null;
  /** Só nas lacunas. */
  meses: number;
};

/** Texto do período de um vínculo: "03/2021 → atual", "2019 → 06/2020", "". */
function textoPeriodo(item: ItemLinhaDoTempo): string {
  const de = rotuloMes(item.de);
  const ate = item.atual ? "atual" : rotuloMes(item.ate);
  if (de === "" && ate === "") return "";
  if (de === "") return `até ${ate}`;
  if (ate === "") return `desde ${de}`;
  return `${de} → ${ate}`;
}

/* -------------------------------------------------------------------------- */
/* Componente                                                                 */
/* -------------------------------------------------------------------------- */

export function LinhaDoTempoEmpregos(props: { metricas: MetricasPermanencia; agora: Date }) {
  const { metricas, agora } = props;

  if (metricas.linhaDoTempo.length === 0) {
    return (
      <p className="rounded-xl bg-white/[0.05] px-3 py-2.5 text-sm text-white/85 ring-1 ring-white/10">
        O currículo não trouxe nenhum vínculo de trabalho para montar a linha do tempo.
      </p>
    );
  }

  // UTC como em `calcularMetricas`: misturar fuso local aqui deslocaria a
  // barra de quem está "atual" em um mês, dependendo do servidor.
  const mesAgora = agora.getUTCFullYear() * 12 + agora.getUTCMonth();

  const faixas: Faixa[] = metricas.linhaDoTempo.map((item, i) => {
    const inicio = paraMes(item.de, false);
    const fim = item.atual ? mesAgora : paraMes(item.ate, true);
    return {
      tipo: "emprego",
      // Empresa e cargo se repetem em currículo com dois contratos na mesma
      // casa; o índice desempata sem depender de dado do documento.
      chave: `e${i}-${item.empresa}-${item.cargo}`,
      inicio,
      // Fim anterior ao início já foi neutralizado no cálculo (`meses` vem
      // `null`); aqui a barra também não pode nascer negativa.
      fim: fim != null && inicio != null && fim < inicio ? null : fim,
      item,
      meses: 0,
    };
  });

  for (const [i, l] of metricas.lacunas.entries()) {
    faixas.push({
      tipo: "lacuna",
      chave: `l${i}-${l.de}`,
      inicio: paraMes(l.de, false),
      fim: paraMes(l.ate, false),
      item: null,
      meses: l.meses,
    });
  }

  const marcos = faixas.flatMap((f) => (f.inicio == null ? [] : [f.inicio, f.fim ?? f.inicio]));
  const min = marcos.length > 0 ? Math.min(...marcos) : mesAgora;
  const max = marcos.length > 0 ? Math.max(...marcos) : mesAgora;
  // Um vínculo único de um mês só daria vão zero e divisão por zero adiante.
  const vao = Math.max(max - min, 1);

  const ordenadas = [...faixas].sort((a, b) => {
    // Sem data vai para o fim: não dá para posicioná-la no eixo, e ela não
    // pode empurrar quem tem data para baixo.
    const ia = a.inicio ?? Number.NEGATIVE_INFINITY;
    const ib = b.inicio ?? Number.NEGATIVE_INFINITY;
    return ib - ia;
  });

  const empregos = ordenadas.filter((f) => f.tipo === "emprego");
  const resumo = [
    `Linha do tempo de ${empregos.length} ${empregos.length === 1 ? "vínculo" : "vínculos"}`,
    marcos.length > 0 ? `entre ${anoDe(min)} e ${max >= mesAgora ? "hoje" : anoDe(max)}` : "",
    metricas.lacunas.length > 0
      ? `com ${metricas.lacunas.length} ${metricas.lacunas.length === 1 ? "lacuna" : "lacunas"}`
      : "",
    metricas.sobreposicoes.length > 0 ? "e períodos sobrepostos" : "",
  ]
    .filter((t) => t !== "")
    .join(", ");

  const categoriasUsadas: CategoriaSetor[] = (["odontologia", "saude", "outro"] as const).filter(
    (c) => metricas.linhaDoTempo.some((i) => categoriaDe(i) === c),
  );

  return (
    <div className="space-y-3">
      {/* ---------- Legenda ---------- */}
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {categoriasUsadas.map((c) => {
          const e = ESTILOS[c];
          const Icone = e.icone;
          return (
            <li key={c} className="inline-flex items-center gap-1.5 text-[0.7rem] text-white/85">
              <span className={`h-2.5 w-5 shrink-0 rounded-full ${e.barra}`} aria-hidden="true" />
              <Icone className="h-3 w-3 shrink-0" aria-hidden="true" />
              {e.rotulo}
            </li>
          );
        })}
        {metricas.empregosSemData > 0 ? (
          <li className="inline-flex items-center gap-1.5 text-[0.7rem] text-white/85">
            <span
              className="h-2.5 w-5 shrink-0 rounded-full border border-dashed border-white/45"
              aria-hidden="true"
            />
            <CircleHelp className="h-3 w-3 shrink-0" aria-hidden="true" />
            Período não informado
          </li>
        ) : null}
      </ul>

      {/* ---------- Gráfico ---------- */}
      <div role="img" aria-label={resumo} className="space-y-2.5">
        {ordenadas.map((f) => {
          const inicio = f.inicio;
          const fim = f.fim ?? inicio;
          const posicionada = inicio != null && fim != null;
          const esquerda = posicionada ? ((inicio - min) / vao) * 100 : 0;
          const largura = posicionada ? Math.max(((fim - inicio) / vao) * 100, 1.5) : 100;

          if (f.tipo === "lacuna") {
            return (
              <div key={f.chave}>
                <p className="text-xs font-semibold text-white">
                  {f.meses} {f.meses === 1 ? "mês" : "meses"} sem registro
                </p>
                <div className="mt-1 h-2.5 w-full rounded-full bg-white/[0.04]">
                  <div
                    className="h-2.5 rounded-full border border-dashed border-amber-200/60 bg-amber-200/10"
                    style={{ marginLeft: `${esquerda}%`, width: `${largura}%` }}
                  />
                </div>
              </div>
            );
          }

          const item = f.item;
          if (!item) return null;
          const cat = categoriaDe(item);
          const estilo = ESTILOS[cat];
          const Icone = estilo.icone;
          const periodo = textoPeriodo(item);

          return (
            <div key={f.chave}>
              <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm leading-snug text-white">
                <Icone className="h-3.5 w-3.5 shrink-0 self-center text-lime" aria-hidden="true" />
                <strong className="font-bold">
                  {item.cargo.trim() === "" ? "Cargo não informado" : item.cargo}
                </strong>
                {item.empresa.trim() === "" ? null : (
                  <span className="text-white/85">· {item.empresa}</span>
                )}
                {item.atual ? (
                  <span className="rounded-full bg-lime/15 px-2 py-0.5 text-[0.66rem] font-bold text-white ring-1 ring-lime/45">
                    atual
                  </span>
                ) : null}
              </p>

              <p className="mt-0.5 text-xs text-white/85">
                {/* Duração sempre em texto: é o número que a clínica não pode
                    ler errado, e barra nenhuma comunica "3 meses". */}
                {periodo === "" ? "período não informado" : periodo} ·{" "}
                <span className="font-semibold text-white">{emAnosMeses(item.meses)}</span> ·{" "}
                {estilo.rotulo}
              </p>

              <div className="mt-1 h-2.5 w-full rounded-full bg-white/[0.04]">
                <div
                  className={
                    posicionada
                      ? `h-2.5 rounded-full ${estilo.barra}`
                      : "h-2.5 rounded-full border border-dashed border-white/45 bg-white/[0.06]"
                  }
                  style={{ marginLeft: `${esquerda}%`, width: `${largura}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* ---------- Eixo ---------- */}
      {marcos.length > 0 ? (
        <p className="flex items-center justify-between text-[0.66rem] font-semibold text-white/85">
          <span>{anoDe(min)}</span>
          <span>{max >= mesAgora ? "hoje" : anoDe(max)}</span>
        </p>
      ) : null}

      {/* ---------- Sobreposições ---------- */}
      {metricas.sobreposicoes.length > 0 ? (
        <div className="rounded-xl bg-amber-300/10 p-3 ring-1 ring-amber-200/30">
          <p className="flex items-center gap-1.5 text-xs font-bold text-white">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-200" aria-hidden="true" />
            Períodos sobrepostos
          </p>
          <ul className="mt-1 space-y-0.5">
            {metricas.sobreposicoes.map((s) => (
              <li key={`${s.a}|${s.b}`} className="text-xs leading-relaxed text-white/85">
                {s.a} e {s.b} se cruzam por {s.meses} {s.meses === 1 ? "mês" : "meses"}.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ---------- Versão textual ----------
          O gráfico acima é um `role="img"`: para quem usa leitor de tela ele é
          uma figura só, com o resumo no aria-label. Esta lista é o conteúdo
          equivalente, na mesma ordem, sem depender de enxergar barra nenhuma. */}
      <ol className="sr-only">
        {ordenadas.map((f) => (
          <li key={`t-${f.chave}`}>
            {f.tipo === "lacuna"
              ? `Lacuna de ${f.meses} meses sem registro.`
              : `${f.item?.cargo === "" ? "Cargo não informado" : (f.item?.cargo ?? "")} em ${
                  f.item?.empresa === "" ? "empresa não informada" : (f.item?.empresa ?? "")
                }: ${f.item ? textoPeriodo(f.item) || "período não informado" : ""}, ${emAnosMeses(
                  f.item?.meses ?? null,
                )}.`}
          </li>
        ))}
      </ol>
    </div>
  );
}
