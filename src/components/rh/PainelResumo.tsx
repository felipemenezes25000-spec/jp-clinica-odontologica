/**
 * Tela de abertura do painel: o retrato do processo seletivo em uma olhada.
 *
 * Nada aqui busca dado nem cria `Date`: os números saem todos de `itens`,
 * `vagas` e do `agora` que a rota congelou uma vez. É o que mantém o que o
 * servidor renderiza igual ao que o navegador hidrata — e, de quebra, faz a tela
 * inteira recalcular em um `useMemo` só quando a lista muda.
 *
 * Os três gráficos são SVG escrito à mão. Um gráfico aqui tem seis barras, seis
 * fatias e oito linhas; qualquer biblioteca custaria mais bytes do que o painel
 * inteiro e ainda traria uma paleta que não é a da marca.
 */
import { useMemo, type CSSProperties } from "react";
import {
  ArrowRight,
  Briefcase,
  ChartColumn,
  ChartPie,
  Hourglass,
  Inbox,
  Percent,
  ShieldAlert,
  Sparkles,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { AbaRh } from "@/components/rh/CabecalhoRh";
import { diasAteVencerGuarda, iniciais, tempoRelativo } from "@/lib/rh/formatar";
import { AREAS, STATUS, statusPor } from "@/lib/rh/opcoes";
import type { Candidatura, StatusCandidatura, Vaga } from "@/lib/rh/tipos";
import { MESES_RETENCAO_LGPD } from "@/lib/rh/tipos";
import { vagaAberta } from "@/lib/rh/vagas";

/**
 * Conteúdo só para leitor de tela. Vai em `style` porque o projeto não tem um
 * utilitário para isso, e `display: none` esconderia a tabela também de quem
 * usa leitor — o recorte por `clip-path` a mantém no fluxo acessível.
 */
const SO_LEITOR: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};

/** Mesmo deslocamento fixo de `formatar.ts`: São Paulo, sem horário de verão. */
const FUSO_BRASIL_MINUTOS = -180;

const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** Status que significam "processo andando" — nem entrada, nem desfecho. */
const EM_PROCESSO: StatusCandidatura[] = ["triagem", "entrevista", "teste", "proposta"];

const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Paleta das séries. São os mesmos matizes das pílulas escuras de `STATUS`
 * (âmbar, céu, violeta, esmeralda, rosa), na versão 300 do Tailwind: sobre o
 * verde profundo todos passam de 4,5:1, e entre si têm matiz e claridade
 * diferentes — quem não distingue verde de vermelho ainda separa as fatias.
 * Mesmo assim nenhuma leitura depende da cor: a legenda, o funil e a tabela
 * escondida repetem o número em texto.
 */
const PALETA: string[] = [
  "#8BD34A",
  "#FCD34D",
  "#7DD3FC",
  "#C4B5FD",
  "#6EE7B7",
  "#FDA4AF",
  "#E2E8DC",
];

const COR_STATUS: Record<StatusCandidatura, string> = {
  novo: "#8BD34A",
  triagem: "#FCD34D",
  entrevista: "#7DD3FC",
  teste: "#C4B5FD",
  proposta: "#6EE7B7",
  contratado: "#EBF5E1",
  reprovado: "#FDA4AF",
  banco: "#B7C4B9",
};

const CARTAO = "rh-dashboard-card rounded-2xl border border-border-soft bg-white p-4 sm:p-5";

type Competencia = { ano: number; mes: number };

/** Ano e mês de um instante, já no fuso da clínica. `null` para data inválida. */
function competencia(ms: number): Competencia | null {
  if (!Number.isFinite(ms)) return null;
  const deslocado = new Date(ms + FUSO_BRASIL_MINUTOS * 60_000);
  return { ano: deslocado.getUTCFullYear(), mes: deslocado.getUTCMonth() + 1 };
}

type Barra = { chave: string; rotulo: string; ano: number; total: number };
type Fatia = { rotulo: string; total: number; pct: number; cor: string };
type Etapa = { valor: StatusCandidatura; rotulo: string; total: number; cor: string };
type LinhaVaga = { id: string; titulo: string; total: number };

function pluralizar(n: number, singular: string, plural: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${plural}`;
}

/* -------------------------------------------------------------------------- */
/* Acessibilidade dos gráficos                                                */
/* -------------------------------------------------------------------------- */

/**
 * O equivalente textual do gráfico. Uma tabela, e não um parágrafo, porque o
 * leitor de tela navega célula a célula e a pessoa consegue comparar dois meses
 * sem reouvir a frase inteira.
 */
function TabelaOculta({
  legenda,
  cabecalho,
  linhas,
}: {
  legenda: string;
  cabecalho: [string, string];
  linhas: { rotulo: string; valor: string }[];
}) {
  return (
    <table style={SO_LEITOR}>
      <caption>{legenda}</caption>
      <thead>
        <tr>
          <th scope="col">{cabecalho[0]}</th>
          <th scope="col">{cabecalho[1]}</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha) => (
          <tr key={linha.rotulo}>
            <th scope="row">{linha.rotulo}</th>
            <td>{linha.valor}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VazioGrafico({ texto }: { texto: string }) {
  return (
    <p className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-white/85">
      {texto}
    </p>
  );
}

/**
 * Cores de TEXTO dos SVG, em um lugar só.
 *
 * A regra da clínica ("fundo verde, letra branca") vale igual dentro do
 * gráfico: barra, arco e fatia podem ser lime, mas todo número e todo rótulo
 * sai em branco — cheio no valor, 90% no rótulo de apoio, que é o piso de 85%
 * do projeto com folga. Antes os rótulos desciam a 60%, e mês nenhum se lia.
 */
const TINTA_VALOR = "#172018";
const TINTA_ROTULO = "#5a6b5c";

/* -------------------------------------------------------------------------- */
/* Gráfico 1 — barras por mês                                                 */
/* -------------------------------------------------------------------------- */

function GraficoBarras({ meses }: { meses: Barra[] }) {
  const maior = meses.reduce((m, b) => (b.total > m ? b.total : m), 0);
  const linhas = meses.map((b) => ({
    rotulo: `${b.rotulo}/${b.ano}`,
    valor: String(b.total),
  }));

  if (maior === 0) {
    return <VazioGrafico texto="Nenhuma candidatura nos últimos seis meses." />;
  }

  // Coordenadas em unidades do viewBox, nunca em px: o cartão muda de largura
  // entre o celular e o desktop e o desenho acompanha sozinho.
  const largura = 360;
  const base = 150;
  const topo = 36;
  const passo = largura / meses.length;
  const larguraBarra = Math.min(30, passo - 18);

  const descricao = meses.map((b) => `${b.rotulo}: ${b.total}`).join(", ");

  return (
    <>
      <svg
        viewBox={`0 0 ${largura} 180`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Candidaturas recebidas por mês nos últimos seis meses. ${descricao}.`}
        className="w-full"
      >
        <line
          x1="0"
          y1={base}
          x2={largura}
          y2={base}
          style={{ stroke: "rgba(9,89,2,0.16)" }}
          strokeWidth="1"
        />
        {meses.map((b, i) => {
          const proporcao = b.total / maior;
          // Piso de 4 unidades: um mês com uma candidatura não pode virar uma
          // barra de meio pixel, indistinguível de "nenhuma".
          const alturaBarra =
            b.total === 0 ? 0 : Math.max(4, Math.round(proporcao * (base - topo)));
          const x = i * passo + (passo - larguraBarra) / 2;
          const y = base - alturaBarra;
          return (
            <g key={b.chave}>
              {alturaBarra > 0 ? (
                <rect
                  x={x}
                  y={y}
                  width={larguraBarra}
                  height={alturaBarra}
                  rx="6"
                  style={{ fill: "var(--lime)" }}
                />
              ) : null}
              <text
                x={x + larguraBarra / 2}
                y={y - 8}
                textAnchor="middle"
                style={{ fill: TINTA_VALOR }}
                fontSize="13"
                fontWeight="700"
              >
                {b.total}
              </text>
              <text
                x={x + larguraBarra / 2}
                y={base + 20}
                textAnchor="middle"
                style={{ fill: TINTA_ROTULO }}
                fontSize="12"
              >
                {b.rotulo}
              </text>
            </g>
          );
        })}
      </svg>
      <TabelaOculta
        legenda="Candidaturas por mês"
        cabecalho={["Mês", "Candidaturas"]}
        linhas={linhas}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Gráfico 2 — rosca por área                                                 */
/* -------------------------------------------------------------------------- */

function GraficoRosca({ fatias, total }: { fatias: Fatia[]; total: number }) {
  if (total === 0 || fatias.length === 0) {
    return <VazioGrafico texto="Sem candidaturas para distribuir por área." />;
  }

  const raio = 46;
  const circunferencia = 2 * Math.PI * raio;
  // Respiro entre fatias, e só quando há mais de uma: com uma fatia só, o vão
  // abriria um talho no anel fechado.
  const vao = fatias.length > 1 ? 2 : 0;

  let acumulado = 0;
  const arcos = fatias.map((fatia) => {
    const comprimento = (fatia.total / total) * circunferencia;
    const arco = {
      fatia,
      // Piso pequeno para uma fatia de 1 em 200 continuar visível no anel.
      traco: Math.max(comprimento - vao, 1.5),
      deslocamento: -acumulado,
    };
    acumulado += comprimento;
    return arco;
  });

  const descricao = fatias.map((f) => `${f.rotulo}: ${f.total} (${f.pct}%)`).join(", ");

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg
        viewBox="0 0 120 120"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Distribuição das candidaturas por área da vaga. ${descricao}.`}
        className="w-32 shrink-0 sm:w-36"
      >
        <g transform="rotate(-90 60 60)">
          <circle
            cx="60"
            cy="60"
            r={raio}
            fill="none"
            style={{ stroke: "rgba(9,89,2,0.10)" }}
            strokeWidth="16"
          />
          {arcos.map((arco) => (
            <circle
              key={arco.fatia.rotulo}
              cx="60"
              cy="60"
              r={raio}
              fill="none"
              style={{ stroke: arco.fatia.cor }}
              strokeWidth="16"
              strokeLinecap="butt"
              strokeDasharray={`${arco.traco} ${circunferencia - arco.traco}`}
              strokeDashoffset={arco.deslocamento}
            >
              <title>{`${arco.fatia.rotulo}: ${arco.fatia.total} (${arco.fatia.pct}%)`}</title>
            </circle>
          ))}
        </g>
        <text
          x="60"
          y="58"
          textAnchor="middle"
          style={{ fill: TINTA_VALOR }}
          fontSize="22"
          fontWeight="800"
        >
          {total}
        </text>
        <text x="60" y="72" textAnchor="middle" style={{ fill: TINTA_ROTULO }} fontSize="9">
          no total
        </text>
      </svg>

      <ul className="w-full min-w-0 space-y-1.5">
        {fatias.map((fatia) => (
          <li key={fatia.rotulo} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: fatia.cor }}
            />
            <span className="min-w-0 flex-1 truncate text-white">{fatia.rotulo}</span>
            <span className="shrink-0 font-bold tabular-nums text-white">{fatia.total}</span>
            <span className="w-11 shrink-0 text-right text-xs tabular-nums text-white/85">
              {fatia.pct}%
            </span>
          </li>
        ))}
      </ul>

      <TabelaOculta
        legenda="Candidaturas por área"
        cabecalho={["Área", "Candidaturas"]}
        linhas={fatias.map((f) => ({ rotulo: f.rotulo, valor: `${f.total} (${f.pct}%)` }))}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Gráfico 3 — funil por status                                               */
/* -------------------------------------------------------------------------- */

function GraficoFunil({ etapas }: { etapas: Etapa[] }) {
  const maior = etapas.reduce((m, e) => (e.total > m ? e.total : m), 0);

  if (maior === 0) {
    return <VazioGrafico texto="O funil começa a se desenhar com a primeira candidatura." />;
  }

  const alturaLinha = 30;
  const inicioBarra = 104;
  const larguraTrilho = 180;
  const altura = etapas.length * alturaLinha;
  const descricao = etapas.map((e) => `${e.rotulo}: ${e.total}`).join(", ");

  return (
    <>
      <svg
        viewBox={`0 0 320 ${altura}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Funil de candidaturas por etapa. ${descricao}.`}
        className="w-full"
      >
        {etapas.map((etapa, i) => {
          const y = i * alturaLinha;
          const proporcao = etapa.total / maior;
          const largura = etapa.total === 0 ? 0 : Math.max(5, proporcao * larguraTrilho);
          return (
            <g key={etapa.valor}>
              <text x="0" y={y + 15} style={{ fill: TINTA_ROTULO }} fontSize="11" fontWeight="600">
                {etapa.rotulo}
              </text>
              <rect
                x={inicioBarra}
                y={y + 4}
                width={larguraTrilho}
                height="14"
                rx="7"
                style={{ fill: "rgba(9,89,2,0.08)" }}
              />
              {largura > 0 ? (
                <rect
                  x={inicioBarra}
                  y={y + 4}
                  width={largura}
                  height="14"
                  rx="7"
                  style={{ fill: etapa.cor }}
                >
                  <title>{`${etapa.rotulo}: ${etapa.total}`}</title>
                </rect>
              ) : null}
              <text
                x={inicioBarra + larguraTrilho + 8}
                y={y + 15}
                style={{ fill: TINTA_VALOR }}
                fontSize="11"
                fontWeight="700"
              >
                {etapa.total}
              </text>
            </g>
          );
        })}
      </svg>
      <TabelaOculta
        legenda="Candidaturas por etapa do funil"
        cabecalho={["Etapa", "Candidaturas"]}
        linhas={etapas.map((e) => ({ rotulo: e.rotulo, valor: String(e.total) }))}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* KPI                                                                        */
/* -------------------------------------------------------------------------- */

function Kpi({
  icone: Icone,
  rotulo,
  valor,
  contexto,
}: {
  icone: LucideIcon;
  rotulo: string;
  valor: string;
  contexto: string;
}) {
  return (
    /* `.rh-kpi` é um cartão de verde profundo: o rótulo em versalete era lime e
       agora é branco, com o ícone segurando a cor da marca. O contexto sobe de
       60% para 85%, o piso do projeto para texto de apoio sobre verde. */
    <div className="rh-kpi">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-mint text-forest ring-1 ring-forest/10"
        >
          <Icone size={17} />
        </span>
        <span className="text-[0.68rem] font-bold uppercase tracking-[0.13em] text-white">
          {rotulo}
        </span>
      </div>
      <strong>{valor}</strong>
      <span className="text-xs leading-snug text-white/85">{contexto}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Painel                                                                     */
/* -------------------------------------------------------------------------- */

export function PainelResumo({
  itens,
  vagas,
  agora,
  aoAbrir,
  aoIrParaAba,
}: {
  itens: Candidatura[];
  vagas: Vaga[];
  agora: Date;
  aoAbrir: (id: string) => void;
  aoIrParaAba: (aba: AbaRh) => void;
}) {
  const dados = useMemo(() => {
    const agoraMs = agora.getTime();
    const total = itens.length;

    // Meses do eixo: seis baldes fechados antes de contar, para um mês sem
    // nenhuma candidatura aparecer como zero em vez de sumir do gráfico.
    const hoje = competencia(agoraMs);
    const meses: Barra[] = [];
    if (hoje) {
      for (let i = 5; i >= 0; i -= 1) {
        let mes = hoje.mes - i;
        let ano = hoje.ano;
        while (mes <= 0) {
          mes += 12;
          ano -= 1;
        }
        meses.push({
          chave: `${ano}-${mes}`,
          rotulo: MESES_CURTOS[mes - 1] ?? "",
          ano,
          total: 0,
        });
      }
    }
    const indiceMes = new Map(meses.map((m, i) => [m.chave, i]));

    const porStatus = new Map<StatusCandidatura, number>();
    const porArea = new Map<string, number>();
    const porVaga = new Map<string, number>();

    let novasSemana = 0;
    let emProcesso = 0;
    let contratados = 0;

    for (const item of itens) {
      porStatus.set(item.status, (porStatus.get(item.status) ?? 0) + 1);
      if (EM_PROCESSO.includes(item.status)) emProcesso += 1;
      if (item.status === "contratado") contratados += 1;

      // `area` chega vazia só em registro antigo ou corrompido; ela vira um
      // balde próprio em vez de ser descartada, senão a soma das fatias não
      // bateria com o total de candidaturas exibido no meio da rosca.
      const chaveArea = String(item.area) || "nao-informado";
      porArea.set(chaveArea, (porArea.get(chaveArea) ?? 0) + 1);

      if (item.vagaId !== "") porVaga.set(item.vagaId, (porVaga.get(item.vagaId) ?? 0) + 1);

      const criadoMs = Date.parse(item.criadoEm);
      if (Number.isFinite(criadoMs)) {
        const decorrido = agoraMs - criadoMs;
        if (decorrido >= 0 && decorrido <= SETE_DIAS_MS) novasSemana += 1;

        const comp = competencia(criadoMs);
        if (comp) {
          const posicao = indiceMes.get(`${comp.ano}-${comp.mes}`);
          if (posicao !== undefined) {
            const balde = meses[posicao];
            if (balde) balde.total += 1;
          }
        }
      }
    }

    // Fatias na ordem do catálogo (e não na ordem de chegada) para a legenda
    // não trocar de posição a cada candidatura nova.
    const fatias: Fatia[] = [];
    const nomeArea = new Map(AREAS.map((a) => [String(a.valor), a.rotulo]));
    let cor = 0;
    for (const chave of [...AREAS.map((a) => String(a.valor)), "nao-informado"]) {
      const quantos = porArea.get(chave) ?? 0;
      if (quantos === 0) continue;
      fatias.push({
        rotulo: nomeArea.get(chave) ?? "Não informado",
        total: quantos,
        pct: total > 0 ? Math.round((quantos / total) * 100) : 0,
        cor: PALETA[cor % PALETA.length] ?? "#8BD34A",
      });
      cor += 1;
    }

    const etapas: Etapa[] = STATUS.map((s) => ({
      valor: s.valor,
      rotulo: s.rotulo,
      total: porStatus.get(s.valor) ?? 0,
      cor: COR_STATUS[s.valor],
    }));

    const abertas = vagas.filter((v) => vagaAberta(v, agora)).length;

    const topoVagas: LinhaVaga[] = vagas
      .map((v) => ({ id: v.id, titulo: v.titulo, total: porVaga.get(v.id) ?? 0 }))
      .filter((v) => v.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
    const maiorVaga = topoVagas.reduce((m, v) => (v.total > m ? v.total : m), 0);

    const recentes = [...itens]
      .sort((a, b) => {
        const va = Date.parse(a.criadoEm);
        const vb = Date.parse(b.criadoEm);
        return (Number.isFinite(vb) ? vb : 0) - (Number.isFinite(va) ? va : 0);
      })
      .slice(0, 6);

    // Candidaturas cujo prazo de guarda prometido no aviso de LGPD já passou.
    // Nada é apagado automaticamente — apagar o currículo de alguém é decisão
    // de pessoa —, mas quem abre o painel precisa ver que existe uma pilha
    // vencida, senão a promessa dos 24 meses fica só no texto do formulário.
    const vencidas = itens.filter((c) => {
      const dias = diasAteVencerGuarda(c.criadoEm, agora, MESES_RETENCAO_LGPD);
      return dias !== null && dias < 0;
    }).length;

    return {
      total,
      novasSemana,
      emProcesso,
      contratados,
      abertas,
      conversao: total > 0 ? Math.round((contratados / total) * 100) : 0,
      vencidas,
      meses,
      fatias,
      etapas,
      topoVagas,
      maiorVaga,
      recentes,
    };
  }, [itens, vagas, agora]);

  const vazio = dados.total === 0;

  return (
    <div className="rh-resumo-premium space-y-5">
      {dados.vencidas > 0 ? (
        /* `role="note"`, não `alert`: isto está na tela desde que o painel
           abriu, e um alerta anunciado a cada carga vira ruído. O botão leva à
           aba onde dá para agir — avisar sem oferecer o caminho seria só
           lembrar do problema. */
        <section
          role="note"
          className="rounded-2xl border border-amber-200/35 bg-amber-300/12 px-5 py-4"
        >
          {/* O aviso está sobre a aurora verde: título e corpo em branco, com o
              âmbar preservado no ícone e na borda — que não são letra. */}
          <h2 className="flex items-center gap-2 font-display text-sm font-extrabold text-white">
            <ShieldAlert size={16} className="text-amber-200" aria-hidden="true" />
            {pluralizar(dados.vencidas, "candidatura passou", "candidaturas passaram")} do prazo de
            guarda
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-white/85">
            O aviso aceito por essas pessoas fala em guarda de até {MESES_RETENCAO_LGPD} meses.
            Passado o prazo, manter CPF, nascimento e endereço no disco deixa de ter base legal —
            exclua as fichas ou peça um novo consentimento. Cada ficha vencida traz o aviso na seção
            “Origem e registro”.
          </p>
          <button
            type="button"
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-200/40 px-3 text-xs font-bold text-white transition-colors hover:bg-amber-200/15"
            onClick={() => aoIrParaAba("candidaturas")}
          >
            Ver candidaturas
          </button>
        </section>
      ) : null}

      <section aria-labelledby="rh-resumo-numeros">
        <h2 id="rh-resumo-numeros" style={SO_LEITOR}>
          Números do processo seletivo
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <Kpi
            icone={Users}
            rotulo="Candidaturas"
            valor={String(dados.total)}
            contexto={vazio ? "Nenhuma até agora" : "Total recebido pelo site"}
          />
          <Kpi
            icone={Sparkles}
            rotulo="Últimos 7 dias"
            valor={String(dados.novasSemana)}
            contexto={
              dados.novasSemana > 0 ? `+${dados.novasSemana} esta semana` : "Semana sem novidades"
            }
          />
          <Kpi
            icone={Hourglass}
            rotulo="Em processo"
            valor={String(dados.emProcesso)}
            contexto="Triagem, entrevista, teste e proposta"
          />
          <Kpi
            icone={UserCheck}
            rotulo="Contratados"
            valor={String(dados.contratados)}
            contexto={
              dados.contratados > 0 ? "Fecharam com a clínica" : "Nenhuma contratação registrada"
            }
          />
          <Kpi
            icone={Briefcase}
            rotulo="Vagas abertas"
            valor={String(dados.abertas)}
            contexto={
              dados.abertas > 0 ? "Publicadas e recebendo currículo" : "Nada publicado no portal"
            }
          />
          <Kpi
            icone={Percent}
            rotulo="Conversão"
            valor={`${dados.conversao}%`}
            contexto={
              dados.total > 0
                ? `${dados.contratados} de ${pluralizar(dados.total, "candidatura", "candidaturas")}`
                : "Depende da primeira candidatura"
            }
          />
        </div>
      </section>

      {vazio ? (
        <section className="rh-vidro flex flex-col items-center gap-4 px-5 py-10 text-center">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-lime/15 text-lime"
          >
            <Inbox size={26} />
          </span>
          <div className="max-w-md">
            <h2 className="font-display text-xl font-extrabold text-white">
              Ainda não chegou nenhuma candidatura
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/85">
              Publique a primeira vaga para o portal sair do ar vazio. Assim que ela estiver aberta,
              cada currículo enviado pelo site aparece aqui — com funil, histórico e anotações da
              equipe.
            </p>
          </div>
          <button type="button" className="button-primary" onClick={() => aoIrParaAba("vagas")}>
            <Briefcase size={18} aria-hidden="true" />
            Publicar a primeira vaga
          </button>
        </section>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <section className={CARTAO} aria-labelledby="rh-graf-meses">
              <h2
                id="rh-graf-meses"
                className="flex items-center gap-2 font-display text-sm font-extrabold text-white"
              >
                <ChartColumn size={16} className="text-lime" aria-hidden="true" />
                Candidaturas por mês
              </h2>
              <p className="mt-1 text-xs text-white/85">Últimos seis meses fechados até hoje.</p>
              <div className="mt-3">
                <GraficoBarras meses={dados.meses} />
              </div>
            </section>

            <section className={CARTAO} aria-labelledby="rh-graf-areas">
              <h2
                id="rh-graf-areas"
                className="flex items-center gap-2 font-display text-sm font-extrabold text-white"
              >
                <ChartPie size={16} className="text-lime" aria-hidden="true" />
                Por área da vaga
              </h2>
              <p className="mt-1 text-xs text-white/85">Onde a procura está concentrada.</p>
              <div className="mt-3">
                <GraficoRosca fatias={dados.fatias} total={dados.total} />
              </div>
            </section>

            <section className={CARTAO} aria-labelledby="rh-graf-funil">
              <h2
                id="rh-graf-funil"
                className="flex items-center gap-2 font-display text-sm font-extrabold text-white"
              >
                <Hourglass size={16} className="text-lime" aria-hidden="true" />
                Funil por etapa
              </h2>
              <p className="mt-1 text-xs text-white/85">Quantas pessoas param em cada fase.</p>
              <div className="mt-3">
                <GraficoFunil etapas={dados.etapas} />
              </div>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className={CARTAO} aria-labelledby="rh-ultimas">
              <div className="flex items-center justify-between gap-3">
                <h2
                  id="rh-ultimas"
                  className="font-display text-sm font-extrabold text-white sm:text-base"
                >
                  Últimas candidaturas
                </h2>
                <button
                  type="button"
                  onClick={() => aoIrParaAba("candidaturas")}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-white transition hover:bg-white/10"
                >
                  Ver todas
                  <ArrowRight size={14} className="text-lime" aria-hidden="true" />
                </button>
              </div>

              <ul className="mt-2 divide-y divide-white/10">
                {dados.recentes.map((item) => {
                  const info = statusPor(item.status);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => aoAbrir(item.id)}
                        className="flex w-full min-h-14 items-center gap-3 rounded-xl px-1 py-2 text-left transition hover:bg-white/5"
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime/15 text-sm font-extrabold text-white ring-1 ring-lime/40"
                        >
                          {iniciais(item.nome) || "?"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-white">
                            {item.nome || "Sem nome"}
                          </span>
                          <span className="block truncate text-xs text-white/85">
                            {item.vagaTitulo || "Candidatura espontânea"}
                            <span aria-hidden="true" className="mx-1.5 text-lime">
                              •
                            </span>
                            {tempoRelativo(item.criadoEm, agora)}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[0.7rem] font-bold ${info.pilulaEscura}`}
                        >
                          {info.rotulo}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className={CARTAO} aria-labelledby="rh-top-vagas">
              <div className="flex items-center justify-between gap-3">
                <h2
                  id="rh-top-vagas"
                  className="font-display text-sm font-extrabold text-white sm:text-base"
                >
                  Vagas com mais candidatos
                </h2>
                <button
                  type="button"
                  onClick={() => aoIrParaAba("vagas")}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-white transition hover:bg-white/10"
                >
                  Gerenciar vagas
                  <ArrowRight size={14} className="text-lime" aria-hidden="true" />
                </button>
              </div>

              {dados.topoVagas.length === 0 ? (
                <p className="mt-3 text-sm leading-relaxed text-white/85">
                  Nenhuma candidatura ligada a uma vaga por enquanto — as que chegaram são
                  espontâneas.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {dados.topoVagas.map((vaga) => {
                    const proporcao =
                      dados.maiorVaga > 0 ? Math.round((vaga.total / dados.maiorVaga) * 100) : 0;
                    return (
                      <li key={vaga.id}>
                        <button
                          type="button"
                          onClick={() => aoIrParaAba("vagas")}
                          className="block w-full rounded-xl px-1 py-1.5 text-left transition hover:bg-white/5"
                        >
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 truncate text-sm font-semibold text-white">
                              {vaga.titulo || "Vaga sem título"}
                            </span>
                            <span className="shrink-0 text-sm font-extrabold tabular-nums text-white">
                              {vaga.total}
                            </span>
                          </span>
                          <span
                            aria-hidden="true"
                            className="mt-1.5 block h-2 w-full overflow-hidden rounded-full bg-white/10"
                          >
                            <span
                              className="block h-full rounded-full bg-lime"
                              style={{ width: `${Math.max(proporcao, 4)}%` }}
                            />
                          </span>
                          <span style={SO_LEITOR}>
                            {pluralizar(vaga.total, "candidatura", "candidaturas")}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
