/**
 * Tela de abertura do painel: o retrato do processo seletivo em uma olhada.
 *
 * A PERGUNTA DA TELA: "quem está esperando uma decisão minha hoje?". Por isso o
 * maior número é o de candidaturas novas (ainda não lidas), a frase sob o título
 * conta o achado do dia e o botão do título leva direto à fila.
 *
 * Nada aqui busca dado nem cria `Date`: os números saem todos de `itens`,
 * `vagas` e do `agora` que a rota congelou uma vez. É o que mantém o que o
 * servidor renderiza igual ao que o navegador hidrata — e, de quebra, faz a tela
 * inteira recalcular em um `useMemo` só quando a lista muda.
 *
 * O gráfico de meses é SVG escrito à mão (seis barras não pedem biblioteca) e o
 * resto é lista com barra fina: uma cor só nos dados, o verde da marca, e o mês
 * corrente é a barra que acende. A rosca multicolorida e o funil arco-íris
 * saíram — cor aqui diz "agora", não "categoria".
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import { ArrowRight, ShieldAlert } from "lucide-react";

import type { AbaRh } from "@/components/rh/CabecalhoRh";
import { MolduraCoroa } from "@/components/site/sistema/Coroa";
import { diasAteVencerGuarda, iniciais, tempoRelativo } from "@/lib/rh/formatar";
import { AREAS, STATUS, statusPor } from "@/lib/rh/opcoes";
import type { Candidatura, StatusCandidatura, Vaga } from "@/lib/rh/tipos";
import { MESES_RETENCAO_LGPD } from "@/lib/rh/tipos";
import { vagaAberta } from "@/lib/rh/vagas";

import "./painel.css";

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

const DIA_MS = 24 * 60 * 60 * 1000;
const SETE_DIAS_MS = 7 * DIA_MS;

type Competencia = { ano: number; mes: number };

/** Ano e mês de um instante, já no fuso da clínica. `null` para data inválida. */
function competencia(ms: number): Competencia | null {
  if (!Number.isFinite(ms)) return null;
  const deslocado = new Date(ms + FUSO_BRASIL_MINUTOS * 60_000);
  return { ano: deslocado.getUTCFullYear(), mes: deslocado.getUTCMonth() + 1 };
}

type Barra = { chave: string; rotulo: string; ano: number; total: number };
type LinhaArea = { rotulo: string; total: number; pct: number };
type Etapa = { valor: StatusCandidatura; rotulo: string; total: number };
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
    // A tabela fica DENTRO de um contêiner `sr-only`: uma tabela absoluta com
    // `style` próprio mantinha a largura natural (405px) e alargava a página
    // no celular. O contêiner de 1px recorta e a tabela não mede mais nada.
    <div className="sr-only">
      <table>
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
    </div>
  );
}

/** Frase no lugar do gráfico: a moldura fica e uma frase só ocupa a largura toda. */
function VazioGrafico({ texto }: { texto: string }) {
  return <p className="rh-vazio-linha">{texto}</p>;
}

/* -------------------------------------------------------------------------- */
/* Barras por mês                                                             */
/* -------------------------------------------------------------------------- */

function GraficoBarras({ todosMeses }: { todosMeses: Barra[] }) {
  // Meses antes da primeira candidatura não dizem nada: quatro rótulos "0" em
  // fila só ocupavam o lugar do dado. O eixo começa no primeiro mês com gente.
  const primeiro = todosMeses.findIndex((b) => b.total > 0);
  const meses = primeiro > 0 ? todosMeses.slice(primeiro) : todosMeses;
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
  const largura = Math.max(180, Math.min(360, meses.length * 60));
  const base = 150;
  const topo = 30;
  const passo = largura / meses.length;
  const larguraBarra = Math.min(34, passo - 16);
  const descricao = meses.map((b) => `${b.rotulo}: ${b.total}`).join(", ");

  return (
    <>
      <svg
        viewBox={`0 0 ${largura} 176`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Candidaturas recebidas por mês nos últimos seis meses. ${descricao}.`}
        className="rh-grafico"
        style={{ maxWidth: `${largura * 1.5}px` }}
      >
        <line x1="0" y1={base} x2={largura} y2={base} className="rh-grafico__base" />
        {meses.map((b, i) => {
          const atual = i === meses.length - 1;
          // Piso de 4 unidades: um mês com uma candidatura não pode virar uma
          // barra de meio pixel, indistinguível de "nenhuma".
          const alturaBarra =
            b.total === 0 ? 0 : Math.max(4, Math.round((b.total / maior) * (base - topo)));
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
                  rx="3"
                  className={
                    atual ? "rh-grafico__barra rh-grafico__barra--atual" : "rh-grafico__barra"
                  }
                />
              ) : null}
              <text
                x={x + larguraBarra / 2}
                y={y - 8}
                textAnchor="middle"
                className="rh-grafico__valor"
              >
                {b.total}
              </text>
              <text
                x={x + larguraBarra / 2}
                y={base + 20}
                textAnchor="middle"
                className="rh-grafico__mes"
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
/* Lista com barra fina                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Uma linha de ranking: rótulo, número e uma barra de 4px proporcional ao maior.
 * A barra do primeiro é a que carrega o verde; as outras ficam num degrau de
 * tom, para o "quem lidera" ser visto e não só lido.
 */
function BarraDeLista({
  rotulo,
  total,
  maior,
  complemento,
  lider,
}: {
  rotulo: string;
  total: number;
  maior: number;
  complemento?: string;
  lider: boolean;
}) {
  const proporcao = maior > 0 ? Math.round((total / maior) * 100) : 0;
  return (
    <>
      <span className="rh-linha-barra__texto">
        <span className="rh-linha-barra__rotulo">{rotulo}</span>
        <span className="rh-linha-barra__valor">
          {total}
          {complemento ? <span className="rh-linha-barra__comp">{complemento}</span> : null}
        </span>
      </span>
      <span aria-hidden="true" className="rh-linha-barra__trilho">
        <span
          className={
            lider ? "rh-linha-barra__fill rh-linha-barra__fill--lider" : "rh-linha-barra__fill"
          }
          style={{ width: `${Math.max(proporcao, total > 0 ? 3 : 0)}%` }}
        />
      </span>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Número do cabeçalho de dados                                               */
/* -------------------------------------------------------------------------- */

/**
 * Número que rola de 0 até o valor. Escreve no nó de texto que o React criou
 * (`nodeValue`), nunca em `textContent`, para a reconciliação seguinte achar o
 * mesmo nó. O HTML do servidor já traz o valor final: sem JS ou com "reduzir
 * movimento" ninguém vê zero. `useLayoutEffect` zera antes do primeiro quadro
 * pintado, sem o tranco de "4, 0, 1, 2, 3, 4".
 */
function NumeroRola({ valor }: { valor: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const alvo = Number(valor);
    const no = ref.current?.firstChild;
    if (!no || !Number.isInteger(alvo) || alvo < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const duracao = 700;
    let inicio = 0;
    let quadro = 0;
    no.nodeValue = "0";
    const passo = (t: number) => {
      if (!inicio) inicio = t;
      const f = Math.min(1, (t - inicio) / duracao);
      no.nodeValue = String(Math.round(alvo * (1 - (1 - f) ** 3)));
      if (f < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => {
      cancelAnimationFrame(quadro);
      no.nodeValue = valor;
    };
  }, [valor]);
  return <span ref={ref}>{valor}</span>;
}

function Numero({
  rotulo,
  valor,
  contexto,
  lider = false,
}: {
  rotulo: string;
  valor: string;
  contexto: string;
  lider?: boolean;
}) {
  return (
    <div className={lider ? "rh-numero rh-numero--lider" : "rh-numero"}>
      <dt>{rotulo}</dt>
      <dd>
        <NumeroRola valor={valor} />
      </dd>
      <p>{contexto}</p>
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
    let entrevistasSemana = 0;

    for (const item of itens) {
      porStatus.set(item.status, (porStatus.get(item.status) ?? 0) + 1);
      if (EM_PROCESSO.includes(item.status)) emProcesso += 1;
      if (item.status === "contratado") contratados += 1;

      // `area` chega vazia só em registro antigo ou corrompido; ela vira um
      // balde próprio em vez de ser descartada, senão a soma das linhas não
      // bateria com o total de candidaturas exibido.
      const chaveArea = String(item.area) || "nao-informado";
      porArea.set(chaveArea, (porArea.get(chaveArea) ?? 0) + 1);

      if (item.vagaId !== "") porVaga.set(item.vagaId, (porVaga.get(item.vagaId) ?? 0) + 1);

      // Entrevista marcada para os próximos sete dias, de quem ainda está no
      // processo: é o segundo achado do dia, depois das candidaturas novas.
      const entrevistaMs = Date.parse(item.entrevistaEm);
      if (
        Number.isFinite(entrevistaMs) &&
        EM_PROCESSO.includes(item.status) &&
        entrevistaMs >= agoraMs &&
        entrevistaMs - agoraMs <= SETE_DIAS_MS
      ) {
        entrevistasSemana += 1;
      }

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

    // Linhas na ordem do catálogo (e não na ordem de chegada) para a lista
    // não trocar de posição a cada candidatura nova.
    const areas: LinhaArea[] = [];
    const nomeArea = new Map(AREAS.map((a) => [String(a.valor), a.rotulo]));
    for (const chave of [...AREAS.map((a) => String(a.valor)), "nao-informado"]) {
      const quantos = porArea.get(chave) ?? 0;
      if (quantos === 0) continue;
      areas.push({
        rotulo: nomeArea.get(chave) ?? "Não informado",
        total: quantos,
        pct: total > 0 ? Math.round((quantos / total) * 100) : 0,
      });
    }
    const maiorArea = areas.reduce((m, a) => (a.total > m ? a.total : m), 0);

    const etapas: Etapa[] = STATUS.map((s) => ({
      valor: s.valor,
      rotulo: s.rotulo,
      total: porStatus.get(s.valor) ?? 0,
    }));
    const maiorEtapa = etapas.reduce((m, e) => (e.total > m ? e.total : m), 0);

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
      novos: porStatus.get("novo") ?? 0,
      novasSemana,
      emProcesso,
      contratados,
      entrevistasSemana,
      abertas,
      conversao: total > 0 ? Math.round((contratados / total) * 100) : 0,
      vencidas,
      meses,
      areas,
      maiorArea,
      etapas,
      maiorEtapa,
      topoVagas,
      maiorVaga,
      recentes,
    };
  }, [itens, vagas, agora]);

  const vazio = dados.total === 0;

  // O achado do dia, montado dos mesmos números do painel: se a frase e a
  // tela discordassem, a pessoa confiaria em nenhuma das duas.
  const partes: string[] = [];
  if (dados.novos > 0) {
    partes.push(`${pluralizar(dados.novos, "candidatura nova", "candidaturas novas")} para ler`);
  }
  if (dados.entrevistasSemana > 0) {
    partes.push(
      `${pluralizar(dados.entrevistasSemana, "entrevista marcada", "entrevistas marcadas")} nos próximos 7 dias`,
    );
  }
  const achado = vazio
    ? "Ainda não chegou nenhuma candidatura pelo site."
    : partes.length > 0
      ? `${partes.join(" e ")}.`
      : "Nenhuma candidatura nova esperando leitura.";

  return (
    <div className="rh-resumo">
      <div className="rh-titulo">
        <div className="min-w-0">
          <h1>Resumo</h1>
          <p>{achado}</p>
        </div>
        {vazio ? null : (
          <button
            type="button"
            className="botao botao-acento rh-titulo__acao"
            onClick={() => aoIrParaAba("candidaturas")}
          >
            Abrir candidaturas
            <ArrowRight aria-hidden="true" />
          </button>
        )}
      </div>

      {dados.vencidas > 0 ? (
        /* `role="note"`, não `alert`: isto está na tela desde que o painel
           abriu, e um alerta anunciado a cada carga vira ruído. O botão leva à
           aba onde dá para agir — avisar sem oferecer o caminho seria só
           lembrar do problema. */
        <section role="note" className="rh-aviso-prazo">
          <h2>
            <ShieldAlert size={16} aria-hidden="true" />
            {pluralizar(dados.vencidas, "candidatura passou", "candidaturas passaram")} do prazo de
            guarda
          </h2>
          <p>
            O aviso aceito por essas pessoas fala em guarda de até {MESES_RETENCAO_LGPD} meses.
            Passado o prazo, manter CPF, nascimento e endereço no disco deixa de ter base legal —
            exclua as fichas ou peça um novo consentimento. Cada ficha vencida traz o aviso na seção
            “Origem e registro”.
          </p>
          <button type="button" onClick={() => aoIrParaAba("candidaturas")}>
            Ver candidaturas
          </button>
        </section>
      ) : null}

      <section aria-labelledby="rh-resumo-numeros">
        <h2 id="rh-resumo-numeros" className="sr-only">
          Números do processo seletivo
        </h2>
        {/* Um recipiente só, dividido por degraus de tom: seis números que se
            leem juntos não são seis cartões. A primeira célula é a resposta da
            tela e por isso é a maior. */}
        <dl className="rh-numeros">
          <Numero
            lider
            rotulo="Para ler agora"
            valor={String(dados.novos)}
            contexto={
              dados.novos > 0 ? "Candidaturas novas, ainda não lidas" : "Fila de leitura em dia"
            }
          />
          <Numero
            rotulo="Candidaturas"
            valor={String(dados.total)}
            contexto={vazio ? "Nenhuma até agora" : "Recebidas pelo site"}
          />
          <Numero
            rotulo="Em processo"
            valor={String(dados.emProcesso)}
            contexto="Triagem, entrevista, teste e proposta"
          />
          <Numero
            rotulo="Últimos 7 dias"
            valor={String(dados.novasSemana)}
            contexto={dados.novasSemana > 0 ? "Chegaram esta semana" : "Semana sem novidades"}
          />
          <Numero
            rotulo="Contratados"
            valor={String(dados.contratados)}
            contexto={
              dados.total > 0
                ? `${dados.contratados} de ${pluralizar(dados.total, "candidatura", "candidaturas")} (${dados.conversao}%)`
                : "Nenhuma contratação registrada"
            }
          />
          <Numero
            rotulo="Vagas abertas"
            valor={String(dados.abertas)}
            contexto={
              dados.abertas > 0 ? "Publicadas e recebendo currículo" : "Nada publicado no portal"
            }
          />
        </dl>
      </section>

      {vazio ? (
        <section className="rh-primeira-vez">
          <div>
            <h2>Ainda não chegou nenhuma candidatura</h2>
            <p>
              Publique a primeira vaga para o portal sair do ar vazio. Assim que ela estiver aberta,
              cada currículo enviado pelo site aparece aqui — com funil, histórico e anotações da
              equipe.
            </p>
          </div>
          <button type="button" className="botao botao-acento" onClick={() => aoIrParaAba("vagas")}>
            Publicar a primeira vaga
            <ArrowRight aria-hidden="true" />
          </button>
        </section>
      ) : (
        <>
          <section className="rh-lamina" aria-labelledby="rh-ultimas">
            <div className="rh-lamina__cabeca">
              <h2 id="rh-ultimas">Últimas candidaturas</h2>
              <button
                type="button"
                className="rh-texto-acao"
                onClick={() => aoIrParaAba("candidaturas")}
              >
                Ver todas
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>

            <ul className="rh-recentes">
              {dados.recentes.map((item) => {
                const info = statusPor(item.status);
                return (
                  <li key={item.id}>
                    <button type="button" onClick={() => aoAbrir(item.id)} className="rh-recente">
                      {/* O avatar é a coroa: identidade da pessoa na lista, com
                          as iniciais dentro. É a mesma forma da marca, usada
                          como ferramenta (dá para achar a linha de relance). */}
                      <MolduraCoroa proporcao={1} className="rh-recente__avatar" aria-hidden="true">
                        <span>{iniciais(item.nome) || "?"}</span>
                      </MolduraCoroa>
                      <span className="min-w-0 flex-1">
                        <span className="rh-recente__nome">{item.nome || "Sem nome"}</span>
                        <span className="rh-recente__meta">
                          {item.vagaTitulo || "Candidatura espontânea"}
                          <span aria-hidden="true"> · </span>
                          {tempoRelativo(item.criadoEm, agora)}
                        </span>
                      </span>
                      <span className={`rh-pilula ${info.pilulaClara}`}>{info.rotulo}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rh-lamina" aria-labelledby="rh-graf-funil">
            <div className="rh-lamina__cabeca">
              <h2 id="rh-graf-funil">Funil por etapa</h2>
            </div>
            <p className="rh-lamina__nota">
              Quantas pessoas estão em cada fase hoje; a faixa é proporcional ao total.
            </p>
            {/* A faixa é o funil de relance (largura = contagem); a legenda
                abaixo é o que se lê. O tom segue a ordem das etapas. */}
            <div className="rh-faixa" aria-hidden="true">
              {dados.etapas.map((etapa, i) =>
                etapa.total > 0 ? (
                  <span key={etapa.valor} data-tom={i % 4} style={{ flexGrow: etapa.total }} />
                ) : null,
              )}
            </div>
            <ol className="rh-funil">
              {dados.etapas.map((etapa, i) => (
                <li key={etapa.valor} data-vazia={etapa.total === 0 ? "true" : undefined}>
                  <span aria-hidden="true" className="rh-funil__tom" data-tom={i % 4} />
                  <span className="rh-funil__rotulo">{etapa.rotulo}</span>
                  <span className="rh-funil__valor">{etapa.total}</span>
                </li>
              ))}
            </ol>
            <TabelaOculta
              legenda="Candidaturas por etapa do funil"
              cabecalho={["Etapa", "Candidaturas"]}
              linhas={dados.etapas.map((e) => ({ rotulo: e.rotulo, valor: String(e.total) }))}
            />
          </section>

          <div className="rh-resumo__base">
            <section className="rh-lamina" aria-labelledby="rh-graf-meses">
              <div className="rh-lamina__cabeca">
                <h2 id="rh-graf-meses">Candidaturas por mês</h2>
              </div>
              <p className="rh-lamina__nota">
                Desde o primeiro mês com candidatura; o verde é o mês corrente.
              </p>
              <GraficoBarras todosMeses={dados.meses} />
            </section>

            <div className="rh-lamina rh-lamina--tom">
              <section aria-labelledby="rh-graf-areas">
                <div className="rh-lamina__cabeca">
                  <h2 id="rh-graf-areas">Por área da vaga</h2>
                </div>
                <p className="rh-lamina__nota">Onde a procura está concentrada.</p>
                <ul className="rh-ranking">
                  {dados.areas.map((area, i) => (
                    <li key={area.rotulo}>
                      <BarraDeLista
                        rotulo={area.rotulo}
                        total={area.total}
                        maior={dados.maiorArea}
                        complemento={`${area.pct}%`}
                        lider={i === 0 && area.total === dados.maiorArea}
                      />
                    </li>
                  ))}
                </ul>
                <TabelaOculta
                  legenda="Candidaturas por área"
                  cabecalho={["Área", "Candidaturas"]}
                  linhas={dados.areas.map((a) => ({
                    rotulo: a.rotulo,
                    valor: `${a.total} (${a.pct}%)`,
                  }))}
                />
              </section>

              <section aria-labelledby="rh-top-vagas">
                <div className="rh-lamina__cabeca">
                  <h2 id="rh-top-vagas">Vagas mais procuradas</h2>
                  <button
                    type="button"
                    className="rh-texto-acao"
                    onClick={() => aoIrParaAba("vagas")}
                  >
                    Gerenciar
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>

                {dados.topoVagas.length === 0 ? (
                  <p className="rh-lamina__nota">
                    Nenhuma candidatura ligada a uma vaga por enquanto — as que chegaram são
                    espontâneas.
                  </p>
                ) : (
                  <ul className="rh-ranking">
                    {dados.topoVagas.map((vaga, i) => (
                      <li key={vaga.id}>
                        <BarraDeLista
                          rotulo={vaga.titulo || "Vaga sem título"}
                          total={vaga.total}
                          maior={dados.maiorVaga}
                          lider={i === 0}
                        />
                        <span className="sr-only">
                          {pluralizar(vaga.total, "candidatura", "candidaturas")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
