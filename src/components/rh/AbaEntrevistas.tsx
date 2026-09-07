/**
 * Aba "Entrevistas": o guia da clínica, a agenda do dia e o comparativo final.
 *
 * O método aqui não é nosso. As 15 perguntas gerais, os 10 critérios de 0 a 5, os
 * sinais de observação, a nota ética e as 5 regras de desempate foram escritos
 * pela Dra. Ana Beatriz e pelo Jefferson e entregues em PDF. Esta tela existe
 * para deixar esse papel utilizável — visível, editável, imprimível e ligado às
 * fichas — e não para substituí-lo por um método nosso. É por isso que o guia
 * aparece por extenso em vez de virar três chips de configuração, e por isso o
 * comparativo repete as regras de desempate por cima da tabela: é assim que a
 * clínica decide, e a hora de lembrar disso é a hora de decidir.
 *
 * Três blocos, na ordem em que a clínica usa:
 *
 *   1. O GUIA        — o método, com editor ao lado e impressão em branco.
 *   2. A AGENDA      — quem tem ficha ou entrevista marcada, por dia.
 *   3. O COMPARATIVO — a tabela da seção 4 do guia, viva, e a decisão final.
 *
 * Superfícies: o painel é escuro (`.rh-aurora`), então os blocos de leitura são
 * `.rh-vidro`. Todo formulário mora em `.rh-papel` — `.rh-campo`, `.rh-rotulo` e
 * os controles de `ControlesRh` são desenhados para superfície clara e perdem
 * contraste direto no verde profundo.
 *
 * E a regra de cor do cliente vale nas duas: sobre verde, LETRA BRANCA (apoio
 * nunca abaixo de `text-white/85`); sobre papel, LETRA PRETA (`text-ink`), com
 * `text-forest-2` reservado a título curto de seção. Lime e verde continuam em
 * ícone, borda, marcador de lista, estrela e anel de foco — nada disso é letra.
 *
 * SSR: nenhum `new Date()` no render. "Hoje" desce por `agora`, como no resto do
 * painel — servidor e navegador precisam escrever a mesma agenda, senão a
 * hidratação quebra na primeira linha do grupo "Hoje".
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  CalendarDays,
  Check,
  ClipboardCopy,
  Copy,
  Eye,
  FileText,
  Info,
  ListChecks,
  NotebookPen,
  Pencil,
  Play,
  Plus,
  Printer,
  Save,
  Scale,
  Sparkles,
  Star,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { CabecalhoFolha } from "@/components/rh/CabecalhoFolha";
import { CampoSelect, CampoTexto, CampoTextarea } from "@/components/rh/CampoTexto";
import { Interruptor, ListaEditavel } from "@/components/rh/ControlesRh";
import { formatarData, formatarDataHora, iniciais } from "@/lib/rh/formatar";
import type { DecisaoFicha, FichaEntrevista, ImpressaoFicha } from "@/lib/rh/ficha";
import { DECISOES, IMPRESSOES, fichaPreenchidaPorHumano, totalDaFicha } from "@/lib/rh/ficha";
import type { CriterioGuia, DecisaoFinal, GuiaEntrevista } from "@/lib/rh/guia";
import {
  decisaoFinalPreenchida,
  decisaoFinalVazia,
  guiaSementeRecepcao,
  guiaVazio,
  totalPossivel,
  validarGuia,
} from "@/lib/rh/guia";
import { AREAS } from "@/lib/rh/opcoes";
import type { AreaVaga, Candidatura, Vaga } from "@/lib/rh/tipos";
import { resumoJornada } from "@/lib/rh/vagas";

/* -------------------------------------------------------------------------- */
/* Estilos compartilhados                                                     */
/* -------------------------------------------------------------------------- */

/* Campo sobre a superfície escura do painel — mesma métrica da barra de filtros
   e da aba Vagas. `.rh-campo` é branco e viraria uma lâmpada aqui. */
const CAMPO =
  "h-12 w-full min-w-0 rounded-xl border border-white/15 bg-white/[0.07] px-3 text-sm text-white " +
  "transition-colors hover:border-white/30 focus:border-lime";

/* O <option> herda o fundo do sistema, não o do campo: sem estas classes a lista
   aberta sai branco sobre branco no Windows. */
const OPCAO = "bg-white text-ink";

const ACAO =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-white/25 " +
  "bg-white/5 px-3 text-xs font-extrabold text-white transition hover:bg-white/15 " +
  "disabled:cursor-not-allowed disabled:opacity-40";

const ACAO_FORTE =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-lime px-3.5 " +
  "text-xs font-extrabold text-brand-deep transition hover:brightness-110 " +
  "disabled:cursor-not-allowed disabled:opacity-40";

const ACAO_PERIGO =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border " +
  "border-rose-200/30 bg-rose-300/10 px-3 text-xs font-extrabold text-rose-100 transition " +
  "hover:bg-rose-300/20 disabled:cursor-not-allowed disabled:opacity-40";

/* Rótulo pequeno sobre fundo escuro. Branco: sobre verde a letra é branca, e o
   lime fica para o que não é letra — nos cartões `.rh-papel` vale `.rh-rotulo`. */
const ROTULO_ESCURO = "text-[0.65rem] font-bold uppercase tracking-[0.14em] text-white";

/* -------------------------------------------------------------------------- */
/* Datas: "hoje" para a clínica, sem depender do fuso do servidor             */
/* -------------------------------------------------------------------------- */

/**
 * Mesmo deslocamento fixo de `formatar.ts` e `vagas.ts`: São Paulo, sem horário
 * de verão desde 2019. Está repetido aqui pelo mesmo motivo que lá — as três
 * cópias são de uma linha e independentes, e transformá-las num utilitário
 * compartilhado obrigaria `formatar.ts` a exportar sua fatia privada de
 * calendário. Se um quarto lugar precisar disto, aí sim vale promover.
 */
const FUSO_BRASIL_MINUTOS = -180;

/** "AAAA-MM-DD" do dia da clínica, opcionalmente deslocado alguns dias. */
function diaLocal(agora: Date, maisDias: number): string {
  const ms = agora.getTime();
  if (Number.isNaN(ms)) return "";
  const deslocado = new Date(ms + FUSO_BRASIL_MINUTOS * 60_000 + maisDias * 86_400_000);
  const mes = String(deslocado.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(deslocado.getUTCDate()).padStart(2, "0");
  return `${deslocado.getUTCFullYear()}-${mes}-${dia}`;
}

const DIAS_DA_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/** "quinta-feira" a partir de "2026-09-10". Vazio quando a data é ilegível. */
function diaDaSemana(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return "";
  const data = new Date(Date.UTC(Number(m[1] ?? ""), Number(m[2] ?? "") - 1, Number(m[3] ?? "")));
  if (Number.isNaN(data.getTime())) return "";
  return DIAS_DA_SEMANA[data.getUTCDay()] ?? "";
}

/* -------------------------------------------------------------------------- */
/* Leitura do domínio                                                         */
/* -------------------------------------------------------------------------- */

function plural(n: number, singular: string, plural_: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${plural_}`;
}

function rotuloArea(area: AreaVaga): string {
  return AREAS.find((a) => a.valor === area)?.rotulo ?? "Sem área";
}

function rotuloVaga(c: Candidatura): string {
  return c.vagaTitulo.trim() || c.cargoDesejado.trim() || "Candidatura espontânea";
}

function nomeDaCandidata(c: Candidatura): string {
  return c.nome.trim().length > 0 ? c.nome.trim() : "Sem nome no currículo";
}

/**
 * A decisão final lida do guia, completada com o objeto vazio.
 *
 * O guia é JSON em disco e pode ter sido gravado por uma versão anterior (ou
 * editado à mão): `comPadrao` no armazenamento é raso e deixaria passar um
 * `decisaoFinal` incompleto, que quebraria esta tela no primeiro `.length`.
 */
function decisaoDoGuia(guia: GuiaEntrevista): DecisaoFinal {
  return { ...decisaoFinalVazia(), ...guia.decisaoFinal };
}

/**
 * Estrelas da leitura por IA. `null` quando não há análise válida — uma análise
 * que falhou tem zero por causa do PDF, não por causa da candidata, e mostrá-la
 * como "0 estrelas" seria dizer algo sobre a pessoa que ninguém disse.
 */
function estrelasDaIa(c: Candidatura): number | null {
  const a = c.analise;
  if (a === null || a.erro.length > 0) return null;
  return a.estrelas;
}

/** A vaga a que o guia pertence, quando ele foi escrito para uma vaga específica. */
function vagaDoGuia(guia: GuiaEntrevista, vagas: Vaga[]): Vaga | null {
  if (guia.vagaId.length === 0) return null;
  return vagas.find((v) => v.id === guia.vagaId) ?? null;
}

/**
 * O horário do cabeçalho da ficha.
 *
 * Não é campo do guia de propósito: o horário já é a jornada da vaga ("segunda a
 * sexta, 8h às 18h"), e um segundo lugar para escrevê-lo criaria duas verdades
 * que ninguém sincroniza. Quando o guia vale para a área inteira, não há jornada
 * para mostrar — e inventar uma seria pior que deixar em branco.
 */
function horarioDoGuia(guia: GuiaEntrevista, vagas: Vaga[]): string {
  const vaga = vagaDoGuia(guia, vagas);
  if (vaga === null) return "";
  return resumoJornada(vaga);
}

function rotuloDoGuia(guia: GuiaEntrevista, vagas: Vaga[]): string {
  const vaga = vagaDoGuia(guia, vagas);
  const partes = [guia.titulo.trim().length > 0 ? guia.titulo : "Guia sem título"];
  partes.push(vaga !== null ? vaga.titulo : rotuloArea(guia.area));
  if (guia.padrao) partes.push("padrão da área");
  return partes.join(" · ");
}

/**
 * O guia mostrado agora. Nunca devolve `undefined` com a lista cheia: sem uma
 * escolha estável a tabela do comparativo trocaria de colunas a cada render.
 */
function guiaEscolhido(guias: GuiaEntrevista[], id: string): GuiaEntrevista | null {
  if (guias.length === 0) return null;
  const alvo = guias.find((g) => g.id === id);
  if (alvo !== undefined) return alvo;
  return guias.find((g) => g.padrao) ?? guias[0] ?? null;
}

/**
 * Quando a entrevista é, e de onde veio a data.
 *
 * A ficha manda: ela é o papel da entrevista, e o entrevistador escreve nela.
 * A data da candidatura (o campo da gaveta, "AAAA-MM-DDTHH:mm") é o combinado
 * anterior, e continua valendo enquanto a ficha não tiver data própria.
 */
function quandoDaEntrevista(item: Candidatura): { data: string; hora: string } {
  const ficha = item.ficha;
  if (ficha !== null && ficha.entrevistaEm.trim().length > 0) {
    return { data: ficha.entrevistaEm.trim().slice(0, 10), hora: ficha.horario.trim().slice(0, 5) };
  }
  const bruto = item.entrevistaEm.trim();
  if (bruto.length >= 10) return { data: bruto.slice(0, 10), hora: bruto.slice(11, 16) };
  return { data: "", hora: "" };
}

type EstadoFicha = {
  rotulo: string;
  /** Complemento curto: o total quando a ficha está concluída. */
  detalhe: string;
  pilula: string;
  concluida: boolean;
};

/**
 * Em que pé a ficha está — é o que a agenda mostra em cada linha.
 *
 * "Gerada" e "em preenchimento" são estados diferentes e a diferença importa:
 * regerar a parte da IA em cima de uma ficha já preenchida é seguro (o servidor
 * preserva o que o humano escreveu), mas a tela precisa dizer que existe
 * trabalho salvo lá dentro.
 */
function estadoDaFicha(item: Candidatura, totalPossivelDoGuia: number): EstadoFicha {
  const ficha = item.ficha;
  if (ficha === null) {
    return {
      rotulo: "Sem ficha",
      detalhe: "",
      pilula: "bg-white/10 text-white ring-1 ring-white/20",
      concluida: false,
    };
  }
  if (ficha.erro.length > 0) {
    return {
      rotulo: "Falhou ao gerar",
      detalhe: "",
      pilula: "bg-rose-300/15 text-rose-100 ring-1 ring-rose-200/30",
      concluida: false,
    };
  }

  const { total, avaliados } = totalDaFicha(ficha.notas);
  if (ficha.decisao.length > 0) {
    return {
      rotulo: "Concluída",
      // Sem guia selecionado não há denominador: "34/0" seria pior que "34".
      detalhe: totalPossivelDoGuia > 0 ? `${total}/${totalPossivelDoGuia}` : `${total}`,
      pilula: "bg-lime/15 text-white ring-1 ring-lime/30",
      concluida: true,
    };
  }
  if (fichaPreenchidaPorHumano(ficha)) {
    return {
      rotulo: "Em preenchimento",
      detalhe: avaliados > 0 ? `${total} pontos em ${avaliados}` : "",
      pilula: "bg-amber-300/15 text-amber-200 ring-1 ring-amber-200/30",
      concluida: false,
    };
  }
  return {
    rotulo: ficha.geradaEm.length > 0 ? "Ficha gerada" : "Ficha em branco",
    detalhe: "",
    pilula: "bg-sky-300/15 text-sky-200 ring-1 ring-sky-200/30",
    concluida: false,
  };
}

function rotuloImpressao(v: ImpressaoFicha): string {
  return IMPRESSOES.find((i) => i.valor === v)?.rotulo ?? "";
}

function rotuloDecisao(v: DecisaoFicha): string {
  return DECISOES.find((d) => d.valor === v)?.rotulo ?? "";
}

/* -------------------------------------------------------------------------- */
/* Impressão                                                                  */
/* -------------------------------------------------------------------------- */

type Impressao = "" | "guia" | "comparativo";

/**
 * A folha impressa não usa a folha de estilo do painel.
 *
 * O CSS entra num `<style media="print">` que só existe no DOM enquanto a
 * impressão está acontecendo, e some depois. É de propósito: regra global de
 * impressão morando em `styles.css` valeria para o painel inteiro, e a ficha
 * individual (que é de outra tela) passaria a sair junto ou a sumir, dependendo
 * de quem escreveu a regra por último. Aqui, quem manda é quem pediu para
 * imprimir.
 *
 * `body > *:not(.rh-imp)` funciona porque a área de impressão é levada para
 * filha direta do `<body>` por um portal: escondê-la por `visibility` deixaria a
 * folha à mercê de qualquer `overflow: hidden` no caminho, e um `position:
 * fixed` só imprimiria a primeira página.
 */
const CSS_IMPRESSAO = `
@page { size: A4; margin: 14mm; }
.rh-imp { position: absolute; left: -200vw; top: 0; width: 190mm; }
@media print {
  body > *:not(.rh-imp) { display: none !important; }
  .rh-imp {
    position: static;
    left: auto;
    width: auto;
    color: #000;
    background: #fff;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10.5pt;
    line-height: 1.45;
  }
  .rh-imp h1 { font-size: 15pt; margin: 0 0 1mm; }
  .rh-imp h2 {
    font-size: 10.5pt;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border-bottom: 1px solid #000;
    padding-bottom: 1mm;
    margin: 7mm 0 3mm;
  }
  .rh-imp p { margin: 0 0 2mm; }
  .rh-imp .sub { font-size: 9.5pt; color: #333; }
  .rh-imp ol, .rh-imp ul { margin: 0; padding-left: 6mm; }
  .rh-imp li { margin-bottom: 2.5mm; break-inside: avoid; }
  .rh-imp .linha { border-bottom: 1px dotted #555; height: 6mm; margin-top: 1.5mm; }
  .rh-imp .caixa { border: 1px solid #000; padding: 2mm 3mm; margin-bottom: 3mm; break-inside: avoid; }
  .rh-imp table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  .rh-imp th, .rh-imp td {
    border: 1px solid #000;
    padding: 1.5mm 2mm;
    text-align: left;
    vertical-align: top;
  }
  .rh-imp th { background: #eee; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .rh-imp td.nota { white-space: nowrap; letter-spacing: 0.18em; width: 30mm; }
  .rh-imp td.num { text-align: center; white-space: nowrap; }
  .rh-imp .etica {
    margin-top: 7mm;
    padding-top: 2mm;
    border-top: 1px solid #000;
    font-size: 9pt;
    font-style: italic;
  }
  .rh-imp .rodape { margin-top: 4mm; font-size: 8.5pt; color: #444; }

  /* ---- O cabeçalho institucional destas duas folhas ----
     O guia em branco e o comparativo não são .rh-folha: eles moram neste
     portal, que tem folha de estilo própria de propósito. Por isso as medidas
     do <CabecalhoFolha> precisam ser repetidas aqui sob .rh-imp — e são as
     MESMAS de styles.css, porque as três folhas que a clínica leva para a
     mesa (ficha, guia, comparativo) têm que sair com o mesmo topo. Sem isto o
     cabeçalho sairia com a marca solta e o layout do documento errado. */
  .rh-imp .rh-folha-cabecalho { background: #fff; color: #000; }
  .rh-imp .rh-folha-cabecalho-marca {
    display: flex;
    align-items: center;
    gap: 4mm;
    border-bottom: 1.5pt solid #000;
    padding-bottom: 2mm;
    break-inside: avoid;
  }
  /* A marca é SVG e escala sem perder nitidez; a altura em mm é o que mantém a
     faixa com a mesma medida em toda impressora. O max-width protege de uma
     arte trocada por engano estourar a folha. */
  .rh-imp .rh-folha-cabecalho-logo {
    flex: none;
    height: 12mm;
    width: auto;
    max-width: 62mm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .rh-imp .rh-folha-cabecalho-nome {
    margin: 0;
    font-size: 9.5pt;
    font-weight: 800;
    line-height: 1.2;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .rh-imp .rh-folha-cabecalho-barra { margin-inline: 0.6mm; font-weight: 400; }
  .rh-imp .rh-folha-cabecalho-uso { margin: 0.6mm 0 0; font-size: 8pt; line-height: 1.3; }
  .rh-imp .rh-folha-cabecalho-assunto { margin-top: 3mm; break-inside: avoid; }
  .rh-imp .rh-folha-cabecalho-titulo {
    margin: 0 0 1.5mm;
    font-size: 15pt;
    font-weight: 800;
    line-height: 1.15;
  }
  .rh-imp .rh-folha-cabecalho-subtitulo,
  .rh-imp .rh-folha-cabecalho-dados {
    margin: 0 0 1mm;
    font-size: 9.5pt;
    line-height: 1.35;
  }
  /* Letra cinza clara em papel é letra que ninguém lê: o aviso é pequeno, mas preto. */
  .rh-imp .rh-folha-cabecalho-lgpd {
    margin: 2mm 0 0;
    border-top: 0.5pt solid #000;
    padding-top: 1.2mm;
    font-size: 7.5pt;
    line-height: 1.3;
  }
}
`;

/** Portal para o `<body>` com o CSS de impressão junto. Só existe durante a impressão. */
function AreaDeImpressao(props: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    // `aria-hidden`: é uma segunda cópia do mesmo conteúdo, e anunciá-la faria o
    // leitor de tela ler a tela inteira duas vezes.
    <div className="rh-imp" aria-hidden="true">
      <style>{CSS_IMPRESSAO}</style>
      {props.children}
    </div>,
    document.body,
  );
}

/** Cinco quadradinhos de nota, para preencher à caneta. */
function NotasEmBranco(props: { notaMaxima: number }) {
  const escala: number[] = [];
  for (let n = 0; n <= props.notaMaxima; n += 1) escala.push(n);
  return <>{escala.map((n) => `( ${n} )`).join(" ")}</>;
}

/**
 * O guia em branco, no formato que vai para a mesa.
 *
 * É a folha que a clínica já usava em papel: cabeçalho para identificar a
 * candidata, as perguntas gerais com espaço para escrever, a tabela de critérios
 * com a coluna de evidência, os sinais para marcar, o resumo dos entrevistadores
 * e a nota ética no rodapé. A ordem é a do PDF.
 */
function GuiaEmBranco(props: { guia: GuiaEntrevista; horario: string; vaga: string }) {
  const guia = props.guia;
  return (
    <>
      {/* A marca oficial no topo, pelo mesmo componente da ficha. Sem
          `confidencial`: esta folha sai em branco, é formulário e não leva dado
          de ninguém — o aviso de LGPD só faz sentido onde há pessoa nomeada. */}
      <CabecalhoFolha
        titulo={guia.titulo}
        subtitulo={guia.entrevistadores}
        linhaDados={[props.vaga, props.horario].filter((t) => t.length > 0).join(" · ")}
      />
      {guia.objetivo.length > 0 ? <p className="sub">{guia.objetivo}</p> : null}

      <div className="caixa">
        <p>
          Candidata: ______________________________________ Data: ____/____/______ Horário:
          ____:____
        </p>
        <p>
          Impressão: ( ) Excelente ( ) Boa ( ) Regular ( ) Fraca &nbsp;&nbsp; Decisão: ( ) Avança (
          ) Reserva ( ) Não avança
        </p>
      </div>

      <h2>Perguntas gerais — fazer com todas</h2>
      <ol>
        {guia.perguntasGerais.map((p) => (
          <li key={p}>
            {p}
            <div className="linha" />
          </li>
        ))}
      </ol>

      <h2>O que observar e como pontuar</h2>
      <table>
        <thead>
          <tr>
            <th>Critério</th>
            <th>Nota (0 a {guia.notaMaxima})</th>
            <th>Evidência / observação</th>
          </tr>
        </thead>
        <tbody>
          {guia.criterios.map((c) => (
            <tr key={c.chave}>
              <td>{c.rotulo}</td>
              <td className="nota">
                <NotasEmBranco notaMaxima={guia.notaMaxima} />
              </td>
              <td />
            </tr>
          ))}
          <tr>
            <th>Total</th>
            <th className="num">____ / {totalPossivel(guia)}</th>
            <th />
          </tr>
        </tbody>
      </table>

      {guia.sinaisObservacao.length > 0 ? (
        <>
          <h2>Sinais para observar durante a conversa</h2>
          <ul>
            {guia.sinaisObservacao.map((s) => (
              <li key={s}>( ) {s}</li>
            ))}
          </ul>
        </>
      ) : null}

      <h2>Resumo dos entrevistadores</h2>
      {[
        "Principal evidência positiva",
        "Principal dúvida / risco ainda aberto",
        "Motivo para avançar",
        "O que precisa ser checado antes da contratação",
      ].map((titulo) => (
        <div className="caixa" key={titulo}>
          <p>
            <strong>{titulo}</strong>
          </p>
          <div className="linha" />
          <div className="linha" />
        </div>
      ))}

      {guia.notaEtica.length > 0 ? <p className="etica">{guia.notaEtica}</p> : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* 1. O guia — leitura                                                        */
/* -------------------------------------------------------------------------- */

function TituloBloco(props: { id: string; icone: LucideIcon; texto: string }) {
  const { icone: Icone } = props;
  return (
    <h3
      id={props.id}
      className="flex items-center gap-2 font-display text-lg font-extrabold text-white"
    >
      <Icone className="h-5 w-5 shrink-0 text-lime" aria-hidden="true" />
      {props.texto}
    </h3>
  );
}

/**
 * O aviso de guia derivado.
 *
 * Fica em vermelho e no topo porque a diferença que ele marca é a mais
 * importante da tela: um guia escrito pela clínica pode ser usado como está; um
 * guia que o sistema copiou de outra área só vira método depois que alguém da
 * JP ler linha por linha. Enquanto ninguém revisou, toda ficha gerada por ele
 * sai de perguntas que foram pensadas para outra função.
 */
function AvisoDerivado(props: { salvando: boolean; aoRevisar: () => void }) {
  return (
    <div className="rounded-2xl border border-amber-200/40 bg-amber-300/10 p-4">
      <p className="flex items-start gap-2 text-sm font-bold text-amber-100">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <span>
          Este guia não foi escrito pela clínica. Ele nasceu de uma cópia, feita aqui no painel, de
          um guia de outra área — as perguntas e os pesos dos critérios ainda são os da função
          original.
        </span>
      </p>
      <p className="mt-2 pl-7 text-xs font-medium leading-relaxed text-amber-100/85">
        Revise pergunta por pergunta antes de entrevistar alguém por ele: é este texto que desce no
        pedido da ficha e que a IA usa como método. Quando a Dra. Ana Beatriz e o Jefferson tiverem
        lido e ajustado, marque como revisado e o aviso some.
      </p>
      <button
        type="button"
        className={`${ACAO} mt-3 ml-7`}
        disabled={props.salvando}
        onClick={props.aoRevisar}
      >
        <Check className="h-4 w-4" aria-hidden="true" />
        Já revisamos este guia
      </button>
    </div>
  );
}

function VisaoGuia(props: {
  guia: GuiaEntrevista;
  vagas: Vaga[];
  salvando: boolean;
  aoEditar: () => void;
  aoRevisar: () => void;
}) {
  const guia = props.guia;
  const vaga = vagaDoGuia(guia, props.vagas);
  const horario = horarioDoGuia(guia, props.vagas);
  const atualizado = formatarDataHora(guia.atualizadoEm);

  return (
    <div className="space-y-5">
      {guia.derivado ? (
        <AvisoDerivado salvando={props.salvando} aoRevisar={props.aoRevisar} />
      ) : null}

      <header className="rounded-2xl border border-white/12 bg-white/[0.04] p-4">
        <h4 className="font-display text-xl font-extrabold leading-tight text-white">
          {guia.titulo.trim().length > 0 ? guia.titulo : "Guia sem título"}
        </h4>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className={ROTULO_ESCURO}>Entrevistadores</dt>
            <dd className="mt-1 text-sm font-semibold text-white">
              {guia.entrevistadores.trim().length > 0 ? guia.entrevistadores : "Não informados"}
            </dd>
          </div>
          <div>
            <dt className={ROTULO_ESCURO}>Vaga e horário</dt>
            <dd className="mt-1 text-sm font-semibold text-white">
              {vaga !== null ? vaga.titulo : `Vale para toda a área: ${rotuloArea(guia.area)}`}
              {horario.length > 0 ? (
                <span className="block text-xs font-medium text-white/85">{horario}</span>
              ) : null}
            </dd>
          </div>
        </dl>
        {guia.objetivo.trim().length > 0 ? (
          <div className="mt-3">
            <p className={ROTULO_ESCURO}>Objetivo</p>
            <p className="mt-1 text-sm font-medium leading-relaxed text-white/85">
              {guia.objetivo}
            </p>
          </div>
        ) : null}
        <p className="mt-3 text-xs font-semibold text-white/85">
          {atualizado.length > 0 ? `Atualizado em ${atualizado}.` : "Ainda não foi editado aqui."}{" "}
          {plural(guia.perguntasGerais.length, "pergunta geral", "perguntas gerais")} ·{" "}
          {plural(guia.criterios.length, "critério", "critérios")} · total{" "}
          <span className="tabular-nums">{totalPossivel(guia)}</span> pontos.
        </p>
      </header>

      <section aria-label="Perguntas gerais do guia">
        <h5 className={ROTULO_ESCURO}>Perguntas gerais — fazer com todas</h5>
        <p className="mt-1 text-xs font-medium text-white/85">
          Na mesma ordem para todo mundo. É essa repetição que deixa as candidatas comparáveis e
          tira a decisão da impressão inicial.
        </p>
        {guia.perguntasGerais.length === 0 ? (
          <p className="mt-2 text-sm font-medium text-white/85">Nenhuma pergunta cadastrada.</p>
        ) : (
          <ol className="mt-3 space-y-1.5">
            {guia.perguntasGerais.map((p, i) => (
              <li
                key={p}
                className="flex gap-2.5 text-sm font-medium leading-relaxed text-white/85"
              >
                <span className="mt-0.5 inline-grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/10 text-[0.65rem] font-extrabold tabular-nums text-white">
                  {i + 1}
                </span>
                <span className="min-w-0">{p}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Critérios de avaliação do guia">
        <h5 className={ROTULO_ESCURO}>
          Critérios — 0 a {guia.notaMaxima} cada, total {totalPossivel(guia)}
        </h5>
        <ul className="mt-3 grid gap-2 lg:grid-cols-2">
          {guia.criterios.map((c) => (
            <li key={c.chave} className="rounded-xl border border-white/12 bg-white/[0.04] p-3">
              <p className="flex items-start justify-between gap-2 text-sm font-extrabold text-white">
                <span className="min-w-0">{c.rotulo}</span>
                {c.soNaEntrevista ? (
                  <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wide text-white">
                    só na entrevista
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-lime/15 px-2 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wide text-white">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    IA sugere
                  </span>
                )}
              </p>
              {c.descricao.trim().length > 0 ? (
                <p className="mt-1 text-xs font-medium leading-relaxed text-white/85">
                  {c.descricao}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {guia.sinaisObservacao.length > 0 ? (
        <section aria-label="Sinais para observar na conversa">
          <h5 className={ROTULO_ESCURO}>Sinais para observar durante a conversa</h5>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {guia.sinaisObservacao.map((s) => (
              <li
                key={s}
                className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/85"
              >
                {s}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {guia.regrasDesempate.length > 0 ? (
        <section aria-label="Regras de desempate do guia">
          <h5 className={ROTULO_ESCURO}>Como a clínica desempata</h5>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm font-medium leading-relaxed text-white/85 marker:font-extrabold marker:text-white">
            {guia.regrasDesempate.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {guia.notaEtica.trim().length > 0 ? (
        <p className="flex items-start gap-2 rounded-2xl border border-lime/25 bg-lime/[0.07] p-3.5 text-sm font-medium italic leading-relaxed text-white/85">
          <Scale className="mt-0.5 h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
          <span>{guia.notaEtica}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={ACAO} onClick={props.aoEditar}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Editar este guia
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 1. O guia — edição                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Critério com identidade local.
 *
 * O React precisa de uma chave estável por linha, e a chave do domínio pode
 * estar vazia (critério recém-adicionado, cuja `chave` só é gerada pelo servidor
 * a partir do rótulo). Usar o rótulo como chave faria o campo perder o foco a
 * cada letra digitada; usar o índice desmontaria a linha inteira a cada
 * reordenação, e o botão recém-clicado deixaria de existir.
 */
type CriterioEditavel = CriterioGuia & { local: string };

/** Os campos que esta tela edita. O resto do guia (id, slug, datas, decisão final) é do servidor. */
type CamposDoGuia = Pick<
  GuiaEntrevista,
  | "titulo"
  | "area"
  | "vagaId"
  | "padrao"
  | "entrevistadores"
  | "objetivo"
  | "perguntasGerais"
  | "criterios"
  | "sinaisObservacao"
  | "notaEtica"
  | "regrasDesempate"
  | "notaMaxima"
>;

function camposDoGuia(g: GuiaEntrevista): CamposDoGuia {
  return {
    titulo: g.titulo,
    area: g.area,
    vagaId: g.vagaId,
    padrao: g.padrao,
    entrevistadores: g.entrevistadores,
    objetivo: g.objetivo,
    perguntasGerais: g.perguntasGerais,
    criterios: g.criterios,
    sinaisObservacao: g.sinaisObservacao,
    notaEtica: g.notaEtica,
    regrasDesempate: g.regrasDesempate,
    notaMaxima: g.notaMaxima,
  };
}

function EditorGuia(props: {
  /** O guia sendo editado. Id vazio significa guia novo (ou cópia). */
  rascunho: GuiaEntrevista;
  vagas: Vaga[];
  salvando: boolean;
  aoFechar: () => void;
  aoSalvar: (guia: GuiaEntrevista) => void;
}) {
  const [form, setForm] = useState<GuiaEntrevista>(props.rascunho);
  const [criterios, setCriterios] = useState<CriterioEditavel[]>(() =>
    props.rascunho.criterios.map((c, i) => ({
      ...c,
      local: c.chave.length > 0 ? c.chave : `n${i}`,
    })),
  );
  const proximoLocal = useRef(0);
  const [tentouSalvar, setTentouSalvar] = useState(false);

  const trocar = <C extends keyof GuiaEntrevista>(campo: C, valor: GuiaEntrevista[C]) => {
    setForm((atual) => {
      const proximo: GuiaEntrevista = { ...atual };
      proximo[campo] = valor;
      return proximo;
    });
  };

  const paraValidar: GuiaEntrevista = { ...form, criterios };
  const erros = validarGuia(paraValidar);
  const primeiroErro = Object.values(erros)[0] ?? "";

  const salvar = () => {
    setTentouSalvar(true);
    if (primeiroErro.length > 0) return;
    // Mescla sobre o rascunho: `decisaoFinal`, `derivado`, `id`, `slug` e datas
    // não passam por este formulário e precisam chegar ao servidor como estavam.
    // Reenviar o objeto inteiro do estado local apagaria a decisão final que
    // alguém pode ter gravado no bloco de baixo enquanto o editor estava aberto.
    props.aoSalvar({ ...props.rascunho, ...camposDoGuia(paraValidar) });
  };

  const vagasDaArea = props.vagas.filter((v) => form.area.length === 0 || v.area === form.area);

  const mudarCriterio = (local: string, mudanca: Partial<CriterioGuia>) => {
    setCriterios((atual) => atual.map((c) => (c.local === local ? { ...c, ...mudanca } : c)));
  };

  const moverCriterio = (indice: number, destino: number) => {
    setCriterios((atual) => {
      if (destino < 0 || destino >= atual.length) return atual;
      const item = atual[indice];
      if (item === undefined) return atual;
      const copia = [...atual];
      copia.splice(indice, 1);
      copia.splice(destino, 0, item);
      return copia;
    });
  };

  return (
    <div className="rh-papel space-y-7 p-4 sm:p-6 [&_:focus-visible]:outline-forest-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-display text-lg font-extrabold text-forest-2">
            {props.rascunho.id.length > 0 ? "Editando o guia" : "Novo guia de entrevista"}
          </h4>
          <p className="rh-ajuda">
            O que estiver aqui é o método que a clínica usa na mesa — e é o mesmo texto que desce no
            pedido da ficha para a IA.
          </p>
        </div>
        <button type="button" className="rh-chip" onClick={props.aoFechar}>
          <X className="h-4 w-4" aria-hidden="true" />
          Fechar sem salvar
        </button>
      </div>

      <section className="space-y-4">
        <CampoTexto
          campo="guia-titulo"
          rotulo="Título do guia"
          valor={form.titulo}
          maxLength={120}
          erro={tentouSalvar ? (erros["titulo"] ?? "") : ""}
          ajuda="Como este método aparece na lista. Ex.: “Guia de entrevista e seleção — Recepcionista”."
          aoMudar={(v) => trocar("titulo", v)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoSelect
            campo="guia-area"
            rotulo="Área"
            valor={form.area}
            erro={tentouSalvar ? (erros["area"] ?? "") : ""}
            ajuda="O guia vale para as candidaturas desta área."
            opcoes={AREAS.map((a) => ({ valor: a.valor, rotulo: a.rotulo }))}
            vazio="Escolha a área..."
            aoMudar={(v) => trocar("area", v as AreaVaga)}
          />
          <CampoSelect
            campo="guia-vaga"
            rotulo="Vaga específica"
            valor={form.vagaId}
            opcional
            ajuda="Deixe em branco para o guia valer para a área inteira — é o caso normal, porque a vaga reabre e o método continua o mesmo."
            opcoes={vagasDaArea.map((v) => ({ valor: v.id, rotulo: v.titulo }))}
            vazio="Vale para a área inteira"
            aoMudar={(v) => trocar("vagaId", v)}
          />
        </div>

        <CampoTexto
          campo="guia-entrevistadores"
          rotulo="Entrevistadores"
          valor={form.entrevistadores}
          maxLength={200}
          ajuda="Quem conduz. Sai no cabeçalho da folha impressa."
          aoMudar={(v) => trocar("entrevistadores", v)}
        />

        <CampoTextarea
          campo="guia-objetivo"
          rotulo="Objetivo do guia"
          valor={form.objetivo}
          linhas={3}
          maxLength={600}
          ajuda="Uma ou duas frases sobre o que este método existe para garantir."
          aoMudar={(v) => trocar("objetivo", v)}
        />

        <Interruptor
          rotulo="Guia padrão desta área"
          descricao="É o guia usado quando a candidatura não aponta para nenhum outro. Só um por área: marcar este desmarca o anterior."
          ligado={form.padrao}
          desativado={props.salvando}
          aoMudar={(v) => trocar("padrao", v)}
        />
      </section>

      <section className="space-y-4 border-t border-border-soft pt-6">
        <ListaEditavel
          rotulo="Perguntas gerais — fazer com todas"
          ajuda="A mesma sequência para todas as candidatas. Escreva a pergunta como ela é dita em voz alta."
          placeholder="Ex.: Conte sobre seu último emprego: função, quanto tempo e por que saiu."
          itens={form.perguntasGerais}
          sugestoes={[]}
          rotuloSugestoes=""
          aoMudar={(itens) => trocar("perguntasGerais", itens)}
        />
      </section>

      <section className="space-y-3 border-t border-border-soft pt-6">
        <div>
          <p className="rh-rotulo">Critérios de avaliação</p>
          <p className="rh-ajuda">
            Cada critério vale de 0 a {form.notaMaxima} e forma o total do comparativo. Renomear um
            critério não desliga as notas já dadas — elas seguem a chave interna, não o texto.
          </p>
        </div>

        {criterios.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-soft bg-cream/60 p-4 text-sm font-medium text-ink-soft">
            Sem critério não há ficha: é a tabela de notas que sustenta o comparativo final.
            Adicione ao menos um.
          </p>
        ) : (
          <ol className="space-y-3">
            {criterios.map((c, indice) => (
              <li key={c.local} className="rounded-2xl border border-border-soft bg-white p-3">
                <div className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-3 inline-grid h-6 w-6 shrink-0 place-items-center rounded-full bg-mint text-[0.7rem] font-extrabold text-ink"
                  >
                    {indice + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <label className="sr-only" htmlFor={`rh-criterio-rotulo-${c.local}`}>
                      Nome do critério {indice + 1}
                    </label>
                    <input
                      id={`rh-criterio-rotulo-${c.local}`}
                      className="rh-campo"
                      type="text"
                      value={c.rotulo}
                      maxLength={80}
                      placeholder="Nome do critério"
                      onChange={(e) => mudarCriterio(c.local, { rotulo: e.target.value })}
                    />
                    <label className="sr-only" htmlFor={`rh-criterio-ajuda-${c.local}`}>
                      O que observar no critério {indice + 1}
                    </label>
                    <textarea
                      id={`rh-criterio-ajuda-${c.local}`}
                      className="rh-campo"
                      rows={2}
                      value={c.descricao}
                      maxLength={300}
                      placeholder="O que observar para dar a nota. Sai na folha impressa e no pedido da ficha."
                      onChange={(e) => mudarCriterio(c.local, { descricao: e.target.value })}
                    />
                    <Interruptor
                      rotulo="Só avaliável na entrevista"
                      descricao="Ligado, a IA não sugere nota aqui e a caixa sai em branco na ficha impressa. É para o que só a conversa mostra — postura, organização no aperto, disponibilidade real. Desligado, a IA pontua e cita a evidência do currículo."
                      ligado={c.soNaEntrevista}
                      desativado={props.salvando}
                      aoMudar={(v) => mudarCriterio(c.local, { soNaEntrevista: v })}
                    />
                  </div>
                  <span className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      className="inline-grid h-11 w-11 place-items-center rounded-xl border border-border-soft bg-white text-ink-soft transition hover:border-forest hover:text-forest disabled:cursor-not-allowed disabled:opacity-35"
                      disabled={indice === 0}
                      aria-label={`Subir o critério ${c.rotulo || indice + 1}`}
                      onClick={() => moverCriterio(indice, indice - 1)}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="inline-grid h-11 w-11 place-items-center rounded-xl border border-border-soft bg-white text-ink-soft transition hover:border-forest hover:text-forest disabled:cursor-not-allowed disabled:opacity-35"
                      disabled={indice === criterios.length - 1}
                      aria-label={`Descer o critério ${c.rotulo || indice + 1}`}
                      onClick={() => moverCriterio(indice, indice + 1)}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="inline-grid h-11 w-11 place-items-center rounded-xl border border-border-soft bg-white text-ink-soft transition hover:border-destructive hover:text-destructive"
                      aria-label={`Remover o critério ${c.rotulo || indice + 1}`}
                      onClick={() =>
                        setCriterios((atual) => atual.filter((item) => item.local !== c.local))
                      }
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <button
            type="button"
            className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-forest px-4 text-sm font-extrabold text-white transition hover:bg-brand-deep"
            onClick={() => {
              proximoLocal.current += 1;
              setCriterios((atual) => [
                ...atual,
                // `chave` nasce vazia de propósito: quem a gera é o servidor, a
                // partir do rótulo, com desambiguação por sufixo.
                {
                  chave: "",
                  rotulo: "",
                  soNaEntrevista: false,
                  descricao: "",
                  local: `novo-${proximoLocal.current}`,
                },
              ]);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Adicionar critério
          </button>

          <div className="w-32">
            <label className="rh-rotulo" htmlFor="rh-campo-guia-notaMaxima">
              Nota máxima
            </label>
            <input
              id="rh-campo-guia-notaMaxima"
              className="rh-campo"
              type="number"
              min={1}
              max={10}
              value={form.notaMaxima}
              onChange={(e) => trocar("notaMaxima", Math.trunc(Number(e.target.value) || 0))}
            />
          </div>
          <p className="rh-ajuda flex-1">
            Total do comparativo: {criterios.length} × {form.notaMaxima} ={" "}
            <strong>{criterios.length * form.notaMaxima}</strong> pontos.
          </p>
        </div>
      </section>

      <section className="space-y-4 border-t border-border-soft pt-6">
        <ListaEditavel
          rotulo="Sinais para observar na conversa"
          ajuda="As caixinhas que os entrevistadores marcam durante a entrevista."
          placeholder="Ex.: Jogo de cintura no atendimento"
          itens={form.sinaisObservacao}
          sugestoes={[]}
          rotuloSugestoes=""
          aoMudar={(itens) => trocar("sinaisObservacao", itens)}
        />

        <ListaEditavel
          rotulo="Regras de desempate, na ordem"
          ajuda="A ordem é o método: a regra 1 decide primeiro, e só quem empata nela chega à regra 2."
          placeholder="Ex.: Evidência concreta de domínio de agenda, WhatsApp e sistemas."
          itens={form.regrasDesempate}
          sugestoes={[]}
          rotuloSugestoes=""
          aoMudar={(itens) => trocar("regrasDesempate", itens)}
        />

        <CampoTextarea
          campo="guia-notaEtica"
          rotulo="Nota ética"
          valor={form.notaEtica}
          linhas={4}
          maxLength={1000}
          ajuda="Vira restrição dura no pedido da ficha: a IA é proibida de tocar no que estiver escrito aqui. Se você reescrever esta nota, é a nota nova que passa a valer."
          aoMudar={(v) => trocar("notaEtica", v)}
        />
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-border-soft pt-5">
        <button
          type="button"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-forest px-5 text-sm font-extrabold text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-45"
          disabled={props.salvando}
          onClick={salvar}
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {props.salvando ? "Salvando..." : "Salvar guia"}
        </button>
        <button type="button" className="rh-chip" onClick={props.aoFechar}>
          Descartar alterações
        </button>
        {tentouSalvar && primeiroErro.length > 0 ? (
          <p role="alert" className="rh-erro">
            {primeiroErro}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Agenda de entrevistas                                                   */
/* -------------------------------------------------------------------------- */

type LinhaAgenda = {
  item: Candidatura;
  data: string;
  hora: string;
  estado: EstadoFicha;
};

type GrupoAgenda = { chave: string; titulo: string; descricao: string; linhas: LinhaAgenda[] };

/**
 * A agenda, agrupada por proximidade.
 *
 * "Já realizadas" não é só "a data passou": uma ficha com decisão registrada
 * está encerrada mesmo que a data tenha sido digitada errado, e mantê-la em
 * "Hoje" faria a clínica procurar por uma conversa que já aconteceu.
 */
function agruparAgenda(linhas: LinhaAgenda[], hoje: string, fimDaSemana: string): GrupoAgenda[] {
  const hojeItens: LinhaAgenda[] = [];
  const semana: LinhaAgenda[] = [];
  const adiante: LinhaAgenda[] = [];
  const semData: LinhaAgenda[] = [];
  const realizadas: LinhaAgenda[] = [];

  for (const linha of linhas) {
    if (linha.estado.concluida) {
      realizadas.push(linha);
      continue;
    }
    if (linha.data.length === 0) {
      semData.push(linha);
      continue;
    }
    if (linha.data < hoje) realizadas.push(linha);
    else if (linha.data === hoje) hojeItens.push(linha);
    else if (linha.data <= fimDaSemana) semana.push(linha);
    else adiante.push(linha);
  }

  const porData = (a: LinhaAgenda, b: LinhaAgenda): number => {
    const pela = `${a.data}${a.hora}`.localeCompare(`${b.data}${b.hora}`);
    if (pela !== 0) return pela;
    return a.item.nome.localeCompare(b.item.nome, "pt-BR");
  };

  hojeItens.sort(porData);
  semana.sort(porData);
  adiante.sort(porData);
  semData.sort((a, b) => a.item.nome.localeCompare(b.item.nome, "pt-BR"));
  // Realizadas ao contrário: a última entrevista é a que ainda está fresca.
  realizadas.sort((a, b) => porData(b, a));

  return [
    {
      chave: "hoje",
      titulo: "Hoje",
      descricao: "Acontece nas próximas horas.",
      linhas: hojeItens,
    },
    {
      chave: "semana",
      titulo: "Esta semana",
      descricao: "Nos próximos sete dias.",
      linhas: semana,
    },
    {
      chave: "adiante",
      titulo: "Mais adiante",
      descricao: "Marcadas para depois desta semana.",
      linhas: adiante,
    },
    {
      chave: "sem-data",
      titulo: "Sem data",
      descricao: "A ficha existe, mas ninguém marcou dia e hora ainda.",
      linhas: semData,
    },
    {
      chave: "realizadas",
      titulo: "Já realizadas",
      descricao: "Conversa feita ou data vencida.",
      linhas: realizadas,
    },
  ].filter((g) => g.linhas.length > 0);
}

function EstrelasIa(props: { estrelas: number | null }) {
  if (props.estrelas === null) {
    return (
      <span className="text-xs font-semibold text-white/85">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Sem leitura da IA</span>
      </span>
    );
  }
  const nota = props.estrelas;
  return (
    <span
      role="img"
      aria-label={`Leitura da IA: ${nota} de 5 estrelas`}
      className="flex items-center gap-0.5"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={12}
          strokeWidth={2}
          aria-hidden="true"
          fill={n <= nota ? "currentColor" : "none"}
          className={n <= nota ? "text-lime" : "text-white/25"}
        />
      ))}
    </span>
  );
}

function LinhaDaAgenda(props: {
  linha: LinhaAgenda;
  aoAbrir: (id: string) => void;
  aoAbrirModoEntrevista: (id: string) => void;
}) {
  const { item, data, hora, estado } = props.linha;
  const dia = formatarData(data);
  const semana = diaDaSemana(data);

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.04] p-3">
      <span
        aria-hidden="true"
        className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full bg-lime/15 text-[0.7rem] font-extrabold text-white"
      >
        {iniciais(item.nome) || "?"}
      </span>

      <span className="min-w-[10rem] flex-1">
        <span className="block truncate text-sm font-extrabold text-white">
          {nomeDaCandidata(item)}
        </span>
        <span className="block truncate text-xs font-medium text-white/85">{rotuloVaga(item)}</span>
      </span>

      <EstrelasIa estrelas={estrelasDaIa(item)} />

      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-extrabold ${estado.pilula}`}
      >
        {estado.rotulo}
        {estado.detalhe.length > 0 ? <span className="tabular-nums">{estado.detalhe}</span> : null}
      </span>

      <span className="min-w-[8.5rem] text-xs font-semibold text-white">
        {dia.length > 0 ? (
          <>
            <CalendarDays className="mr-1 inline h-3.5 w-3.5 text-lime" aria-hidden="true" />
            {dia}
            {hora.length > 0 ? ` às ${hora}` : ""}
            {semana.length > 0 ? <span className="block pl-5 text-white/85">{semana}</span> : null}
          </>
        ) : (
          <span className="text-white/85">Sem data marcada</span>
        )}
      </span>

      <span className="flex flex-wrap gap-2">
        <button type="button" className={ACAO} onClick={() => props.aoAbrir(item.id)}>
          <FileText className="h-4 w-4" aria-hidden="true" />
          Abrir ficha
        </button>
        <button
          type="button"
          className={ACAO_FORTE}
          onClick={() => props.aoAbrirModoEntrevista(item.id)}
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          Iniciar entrevista
        </button>
      </span>
    </li>
  );
}

function Agenda(props: {
  itens: Candidatura[];
  guia: GuiaEntrevista | null;
  agora: Date;
  aoAbrir: (id: string) => void;
  aoAbrirModoEntrevista: (id: string) => void;
}) {
  const { itens, guia, agora } = props;

  const grupos = useMemo(() => {
    const possivel = guia === null ? 0 : totalPossivel(guia);
    const linhas: LinhaAgenda[] = [];

    for (const item of itens) {
      // Arquivada sai da agenda: ela é a lista do que ainda vai acontecer, e
      // quem foi arquivado saiu do processo. No comparativo é o contrário —
      // quem já foi entrevistada continua contando, mesmo arquivada depois.
      if (item.arquivada) continue;
      const { data, hora } = quandoDaEntrevista(item);
      if (item.ficha === null && data.length === 0) continue;
      linhas.push({ item, data, hora, estado: estadoDaFicha(item, possivel) });
    }

    return agruparAgenda(linhas, diaLocal(agora, 0), diaLocal(agora, 7));
  }, [itens, guia, agora]);

  const total = grupos.reduce((soma, g) => soma + g.linhas.length, 0);

  return (
    <section aria-labelledby="rh-agenda-titulo" className="rh-vidro p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <TituloBloco id="rh-agenda-titulo" icone={CalendarClock} texto="Agenda de entrevistas" />
          <p className="mt-1 max-w-2xl text-sm font-medium text-white/85">
            Quem tem ficha gerada ou entrevista marcada. A ordem é a do relógio: primeiro o que
            acontece hoje.
          </p>
        </div>
        {total > 0 ? (
          <p className="text-xs font-bold text-white/85">
            {plural(total, "pessoa na agenda", "pessoas na agenda")}
          </p>
        ) : null}
      </div>

      {total === 0 ? (
        <div className="mt-4 rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-8 text-center">
          <NotebookPen className="mx-auto h-6 w-6 text-white/85" aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-white">Nenhuma entrevista por aqui ainda.</p>
          <p className="mx-auto mt-1 max-w-lg text-sm font-medium leading-relaxed text-white/85">
            A ficha nasce na gaveta da candidata: abra a aba Candidaturas, escolha alguém e mande
            gerar a ficha de entrevista. Ela aparece nesta agenda no mesmo instante — com ou sem dia
            marcado.
          </p>
          {/* Link comum, e não navegação do roteador: esta tela não recebe o
              controle de abas do painel, e um <a> honesto leva para o lugar
              certo sem inventar um contrato novo entre os dois componentes. */}
          <a className={`${ACAO} mt-4`} href="/rh?aba=candidaturas">
            <Eye className="h-4 w-4" aria-hidden="true" />
            Ir para as candidaturas
          </a>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {grupos.map((grupo) => (
            <section key={grupo.chave} aria-labelledby={`rh-agenda-${grupo.chave}`}>
              <h4
                id={`rh-agenda-${grupo.chave}`}
                className="flex flex-wrap items-baseline gap-2 text-sm font-extrabold text-white"
              >
                {grupo.titulo}
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.7rem] tabular-nums text-white">
                  {grupo.linhas.length}
                </span>
                <span className="text-xs font-medium text-white/85">{grupo.descricao}</span>
              </h4>
              <ul className="mt-2 space-y-2">
                {grupo.linhas.map((linha) => (
                  <LinhaDaAgenda
                    key={linha.item.id}
                    linha={linha}
                    aoAbrir={props.aoAbrir}
                    aoAbrirModoEntrevista={props.aoAbrirModoEntrevista}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Comparativo final                                                       */
/* -------------------------------------------------------------------------- */

type LinhaComparativo = {
  id: string;
  nome: string;
  vaga: string;
  /** Nota por chave de critério; `null` é "ninguém pontuou", que não é zero. */
  notas: Record<string, number | null>;
  total: number;
  avaliados: number;
  estrelas: number | null;
  impressao: ImpressaoFicha;
  decisao: DecisaoFicha;
  arquivada: boolean;
};

type Direcao = "asc" | "desc";
type OrdemTabela = { coluna: string; direcao: Direcao } | null;

/** Colunas fixas do comparativo. As do meio saem dos critérios do guia. */
const COLUNA_NOME = "candidata";
const COLUNA_TOTAL = "total";
const COLUNA_IA = "ia";
const COLUNA_IMPRESSAO = "impressao";
const COLUNA_DECISAO = "decisao";

/** A ficha desta candidata foi feita por este guia? */
function fichaDoGuia(ficha: FichaEntrevista, guia: GuiaEntrevista): boolean {
  // `guiaId` vazio é ficha antiga, de antes de o guia existir como objeto: ela
  // continua aparecendo, senão o comparativo esconderia entrevistas reais sem
  // dizer por quê.
  return ficha.guiaId.length === 0 || ficha.guiaId === guia.id;
}

function montarLinhas(itens: Candidatura[], guia: GuiaEntrevista): LinhaComparativo[] {
  const linhas: LinhaComparativo[] = [];
  for (const item of itens) {
    const ficha = item.ficha;
    if (ficha === null || !fichaDoGuia(ficha, guia)) continue;

    const notas: Record<string, number | null> = {};
    for (const criterio of guia.criterios) notas[criterio.chave] = null;
    for (const nota of ficha.notas) {
      if (!(nota.chave in notas)) continue;
      notas[nota.chave] = nota.nota;
    }

    const { total, avaliados } = totalDaFicha(ficha.notas);
    linhas.push({
      id: item.id,
      nome: nomeDaCandidata(item),
      vaga: rotuloVaga(item),
      notas,
      total,
      avaliados,
      estrelas: estrelasDaIa(item),
      impressao: ficha.impressao,
      decisao: ficha.decisao,
      arquivada: item.arquivada,
    });
  }
  return linhas;
}

function compararLinhas(a: LinhaComparativo, b: LinhaComparativo, coluna: string): number {
  switch (coluna) {
    case COLUNA_NOME:
      return a.nome.localeCompare(b.nome, "pt-BR");
    case COLUNA_TOTAL:
      return a.total - b.total;
    case COLUNA_IA:
      // Sem leitura vale -1, e não 0: quem não foi lida fica abaixo de quem
      // tirou zero de verdade no primeiro clique, e sobe ao topo no segundo.
      return (a.estrelas ?? -1) - (b.estrelas ?? -1);
    case COLUNA_IMPRESSAO:
      return indiceEm(IMPRESSOES, a.impressao) - indiceEm(IMPRESSOES, b.impressao);
    case COLUNA_DECISAO:
      return indiceEm(DECISOES, a.decisao) - indiceEm(DECISOES, b.decisao);
    default: {
      const x = a.notas[coluna];
      const y = b.notas[coluna];
      return (x ?? -1) - (y ?? -1);
    }
  }
}

/** Posição no catálogo; o que não foi marcado vai para o fim. */
function indiceEm(catalogo: { valor: string }[], valor: string): number {
  if (valor.length === 0) return catalogo.length;
  const i = catalogo.findIndex((c) => c.valor === valor);
  return i < 0 ? catalogo.length : i;
}

/**
 * O comparativo em texto puro, para colar no grupo da equipe.
 *
 * Sem markdown e sem tabela: o WhatsApp não tem nem uma coisa nem outra, e uma
 * tabela colada lá vira sopa de pipes. Uma pessoa por bloco, o total primeiro.
 */
function textoDoComparativo(entrada: {
  guia: GuiaEntrevista;
  linhas: LinhaComparativo[];
  decisao: DecisaoFinal;
  agora: Date;
}): string {
  const { guia, linhas, decisao } = entrada;
  const partes: string[] = [];

  partes.push(`COMPARATIVO — ${guia.titulo}`);
  if (guia.entrevistadores.trim().length > 0) partes.push(guia.entrevistadores);
  partes.push(`Total possível: ${totalPossivel(guia)} pontos (${guia.criterios.length} critérios)`);
  // `agora` vem por prop até aqui pelo mesmo motivo do resto da tela: um
  // `new Date()` neste texto mudaria entre o servidor e o navegador.
  const hoje = formatarData(diaLocal(entrada.agora, 0));
  if (hoje.length > 0) partes.push(`Exportado em ${hoje}`);
  partes.push("");

  linhas.forEach((linha, indice) => {
    const cabecalho = [
      `${indice + 1}. ${linha.nome}`,
      `${linha.total}/${totalPossivel(guia)}`,
      linha.estrelas === null ? "IA: sem leitura" : `IA: ${linha.estrelas}/5`,
    ];
    if (linha.impressao.length > 0)
      cabecalho.push(`Impressão: ${rotuloImpressao(linha.impressao)}`);
    if (linha.decisao.length > 0) cabecalho.push(`Decisão: ${rotuloDecisao(linha.decisao)}`);
    partes.push(cabecalho.join(" · "));

    const notas = guia.criterios
      .map((c) => {
        const nota = linha.notas[c.chave];
        return `${c.rotulo}: ${nota === null || nota === undefined ? "—" : nota}`;
      })
      .join(" | ");
    partes.push(`   ${notas}`);
    partes.push("");
  });

  if (guia.regrasDesempate.length > 0) {
    partes.push("DESEMPATE (as regras do guia, na ordem):");
    guia.regrasDesempate.forEach((r, i) => partes.push(`${i + 1}. ${r}`));
    partes.push("");
  }

  if (decisaoFinalPreenchida(decisao)) {
    partes.push("DECISÃO FINAL");
    if (decisao.escolhidaNome.length > 0) partes.push(`Escolhida: ${decisao.escolhidaNome}`);
    if (decisao.reservaNome.length > 0) partes.push(`2ª opção: ${decisao.reservaNome}`);
    if (decisao.motivo.length > 0) partes.push(`Motivo: ${decisao.motivo}`);
    if (decisao.referenciasPendentes.length > 0) {
      partes.push(`Pendências: ${decisao.referenciasPendentes}`);
    }
    const quando = formatarDataHora(decisao.registradaEm);
    if (quando.length > 0) partes.push(`Registrada em ${quando}.`);
  } else {
    partes.push("Decisão final ainda não registrada.");
  }

  return partes.join("\n").trim();
}

/** O comparativo no papel: a mesma tabela, em preto e branco. */
function ComparativoImpresso(props: {
  guia: GuiaEntrevista;
  linhas: LinhaComparativo[];
  decisao: DecisaoFinal;
}) {
  const { guia, linhas, decisao } = props;
  return (
    <>
      {/* `confidencial`: esta folha nomeia todas as candidatas entrevistadas e
          diz quem avança — é o documento mais sensível do processo. */}
      <CabecalhoFolha
        titulo={`Comparativo final — ${guia.titulo}`}
        subtitulo={guia.entrevistadores}
        linhaDados={`Total possível: ${totalPossivel(guia)} pontos · ${guia.criterios.length} critérios`}
        confidencial
      />

      <table>
        <thead>
          <tr>
            <th>Candidata</th>
            {guia.criterios.map((c) => (
              <th key={c.chave}>{c.rotulo}</th>
            ))}
            <th>Total</th>
            <th>Impressão</th>
            <th>Decisão</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.id}>
              <td>{linha.nome}</td>
              {guia.criterios.map((c) => {
                const nota = linha.notas[c.chave];
                return (
                  <td className="num" key={c.chave}>
                    {nota === null || nota === undefined ? "—" : nota}
                  </td>
                );
              })}
              <td className="num">
                {linha.total}/{totalPossivel(guia)}
              </td>
              <td>{rotuloImpressao(linha.impressao) || "—"}</td>
              <td>{rotuloDecisao(linha.decisao) || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {guia.regrasDesempate.length > 0 ? (
        <>
          <h2>Desempate objetivo</h2>
          <ol>
            {guia.regrasDesempate.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </>
      ) : null}

      <h2>Decisão final</h2>
      <div className="caixa">
        <p>
          <strong>Candidata escolhida:</strong>{" "}
          {decisao.escolhidaNome.length > 0 ? decisao.escolhidaNome : "____________________"}
        </p>
        <p>
          <strong>2ª opção / reserva:</strong>{" "}
          {decisao.reservaNome.length > 0 ? decisao.reservaNome : "____________________"}
        </p>
        <p>
          <strong>Principal motivo da escolha:</strong>{" "}
          {decisao.motivo.length > 0 ? decisao.motivo : ""}
        </p>
        {decisao.motivo.length === 0 ? <div className="linha" /> : null}
        <p>
          <strong>Referências / comprovações pendentes:</strong>{" "}
          {decisao.referenciasPendentes.length > 0 ? decisao.referenciasPendentes : ""}
        </p>
        {decisao.referenciasPendentes.length === 0 ? <div className="linha" /> : null}
      </div>

      {guia.notaEtica.length > 0 ? <p className="etica">{guia.notaEtica}</p> : null}
      <p className="rodape">
        Toda decisão deve ser sustentada por critérios relacionados à função e pelas respostas dadas
        no processo seletivo.
      </p>
    </>
  );
}

function BlocoDecisaoFinal(props: {
  guia: GuiaEntrevista;
  linhas: LinhaComparativo[];
  salvando: boolean;
  aoSalvar: (decisao: DecisaoFinal) => void;
}) {
  const gravada = decisaoDoGuia(props.guia);
  const [form, setForm] = useState<DecisaoFinal>(gravada);

  /** A versão que veio do servidor quando este formulário nasceu. */
  const base = useRef<DecisaoFinal>(gravada);

  // Mesmo cuidado das configurações do portal: adota o que o servidor devolveu,
  // menos quando há edição local pendente — sobrescrever o que a pessoa está
  // digitando apagaria o motivo da escolha sem aviso nenhum.
  useEffect(() => {
    const doServidor = decisaoDoGuia(props.guia);
    if (mesmaDecisaoNaTela(doServidor, base.current)) return;
    const pendente = !mesmaDecisaoNaTela(form, base.current);
    base.current = doServidor;
    if (!pendente) setForm(doServidor);
  }, [props.guia, form]);

  const opcoes = props.linhas.map((l) => ({ valor: l.id, rotulo: l.nome }));
  const nomeDe = (id: string, nomeAnterior: string): string =>
    props.linhas.find((l) => l.id === id)?.nome ?? (id.length > 0 ? nomeAnterior : "");

  const trocar = <C extends keyof DecisaoFinal>(campo: C, valor: DecisaoFinal[C]) => {
    setForm((atual) => {
      const proximo: DecisaoFinal = { ...atual };
      proximo[campo] = valor;
      return proximo;
    });
  };

  const sujo = !mesmaDecisaoNaTela(form, decisaoDoGuia(props.guia));
  const quando = formatarDataHora(gravada.registradaEm);

  return (
    <div className="rh-papel mt-5 space-y-5 p-4 sm:p-5 [&_:focus-visible]:outline-forest-2">
      <div>
        <h4 className="font-display text-lg font-extrabold text-forest-2">Decisão final</h4>
        <p className="rh-ajuda">
          Fica gravada neste guia, junto dos critérios que a produziram.{" "}
          {quando.length > 0
            ? `Registrada em ${quando}.`
            : "Ainda não há decisão registrada neste processo."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <CampoSelect
          campo="decisao-escolhida"
          rotulo="Candidata escolhida"
          valor={form.escolhidaId}
          opcoes={opcoes}
          vazio="Ainda não escolhemos"
          aoMudar={(v) =>
            setForm((atual) => ({
              ...atual,
              escolhidaId: v,
              // O nome viaja junto do id: a folha impressa precisa continuar
              // legível se a candidatura for arquivada ou apagada por prazo.
              escolhidaNome: nomeDe(v, atual.escolhidaNome),
            }))
          }
        />
        <CampoSelect
          campo="decisao-reserva"
          rotulo="2ª opção / reserva"
          valor={form.reservaId}
          opcoes={opcoes}
          vazio="Sem reserva"
          aoMudar={(v) =>
            setForm((atual) => ({
              ...atual,
              reservaId: v,
              reservaNome: nomeDe(v, atual.reservaNome),
            }))
          }
        />
      </div>

      <CampoTextarea
        campo="decisao-motivo"
        rotulo="Principal motivo da escolha"
        valor={form.motivo}
        linhas={3}
        maxLength={1200}
        ajuda="Evidência, não sensação: o que ela mostrou na conversa que sustenta a escolha."
        aoMudar={(v) => trocar("motivo", v)}
      />

      <CampoTextarea
        campo="decisao-referencias"
        rotulo="Referências / comprovações pendentes"
        valor={form.referenciasPendentes}
        linhas={3}
        maxLength={1200}
        ajuda="O que ainda precisa ser checado antes de fechar a contratação."
        aoMudar={(v) => trocar("referenciasPendentes", v)}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-forest px-5 text-sm font-extrabold text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-45"
          disabled={props.salvando || !sujo}
          onClick={() => props.aoSalvar(form)}
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {props.salvando ? "Salvando..." : "Salvar decisão"}
        </button>
        {decisaoFinalPreenchida(form) ? (
          <button
            type="button"
            className="rh-chip"
            disabled={props.salvando}
            onClick={() => {
              const limpa = decisaoFinalVazia();
              setForm(limpa);
              props.aoSalvar(limpa);
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Limpar decisão
          </button>
        ) : null}
        {sujo ? (
          <p className="text-xs font-bold text-ink">Há alteração não salva neste bloco.</p>
        ) : null}
      </div>
    </div>
  );
}

/** Compara só o que a tela edita; o carimbo do servidor fica de fora. */
function mesmaDecisaoNaTela(a: DecisaoFinal, b: DecisaoFinal): boolean {
  return (
    a.escolhidaId === b.escolhidaId &&
    a.escolhidaNome === b.escolhidaNome &&
    a.reservaId === b.reservaId &&
    a.reservaNome === b.reservaNome &&
    a.motivo === b.motivo &&
    a.referenciasPendentes === b.referenciasPendentes
  );
}

function Comparativo(props: {
  guia: GuiaEntrevista;
  itens: Candidatura[];
  salvando: boolean;
  aoSalvarGuia: (guia: GuiaEntrevista) => void;
  aoImprimir: (linhas: LinhaComparativo[]) => void;
  agora: Date;
}) {
  const { guia, itens } = props;
  const [ordem, setOrdem] = useState<OrdemTabela>(null);
  const [copia, setCopia] = useState<"" | "ok" | "manual">("");
  const [textoManual, setTextoManual] = useState("");

  const linhas = useMemo(() => montarLinhas(itens, guia), [itens, guia]);

  const ordenadas = useMemo(() => {
    if (!ordem) {
      // Sem ordenação escolhida, o total manda — é a leitura que a clínica faz
      // primeiro, e a tabela do guia é lida de cima para baixo.
      return [...linhas].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
    }
    const sinal = ordem.direcao === "asc" ? 1 : -1;
    const decorado = linhas.map((linha, indice) => ({ linha, indice }));
    decorado.sort((a, b) => {
      const diferenca = compararLinhas(a.linha, b.linha, ordem.coluna) * sinal;
      return diferenca !== 0 ? diferenca : a.indice - b.indice;
    });
    return decorado.map((d) => d.linha);
  }, [linhas, ordem]);

  const decisao = decisaoDoGuia(guia);

  const alternar = (coluna: string, padrao: Direcao) => {
    setOrdem((atual) => {
      if (!atual || atual.coluna !== coluna) return { coluna, direcao: padrao };
      if (atual.direcao === padrao) return { coluna, direcao: padrao === "asc" ? "desc" : "asc" };
      return null;
    });
  };

  const copiar = () => {
    const conteudo = textoDoComparativo({
      guia,
      linhas: ordenadas,
      decisao,
      agora: props.agora,
    });
    setTextoManual(conteudo);
    // `navigator.clipboard` não existe fora de contexto seguro e pode ser
    // negado por permissão: em vez de falhar calado, a tela devolve o texto num
    // campo selecionável.
    const area = navigator.clipboard;
    if (!area) {
      setCopia("manual");
      return;
    }
    area
      .writeText(conteudo)
      .then(() => setCopia("ok"))
      .catch(() => setCopia("manual"));
  };

  const colunas: { chave: string; rotulo: string; padrao: Direcao; curto: boolean }[] = [
    { chave: COLUNA_NOME, rotulo: "Candidata", padrao: "asc", curto: false },
    ...guia.criterios.map((c) => ({
      chave: c.chave,
      rotulo: c.rotulo,
      padrao: "desc" as Direcao,
      curto: true,
    })),
    { chave: COLUNA_TOTAL, rotulo: `Total /${totalPossivel(guia)}`, padrao: "desc", curto: true },
    { chave: COLUNA_IA, rotulo: "IA", padrao: "desc", curto: true },
    { chave: COLUNA_IMPRESSAO, rotulo: "Impressão", padrao: "asc", curto: true },
    { chave: COLUNA_DECISAO, rotulo: "Decisão", padrao: "asc", curto: true },
  ];

  return (
    <section aria-labelledby="rh-comparativo-titulo" className="rh-vidro p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <TituloBloco id="rh-comparativo-titulo" icone={Scale} texto="Comparativo final" />
          <p className="mt-1 max-w-2xl text-sm font-medium text-white/85">
            Uma linha por candidata entrevistada, uma coluna por critério deste guia. Clique no
            cabeçalho para reordenar.
          </p>
        </div>
        {linhas.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ACAO} onClick={copiar}>
              {copia === "ok" ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
              )}
              {copia === "ok" ? "Comparativo copiado" : "Exportar comparativo"}
            </button>
            <button type="button" className={ACAO} onClick={() => props.aoImprimir(ordenadas)}>
              <Printer className="h-4 w-4" aria-hidden="true" />
              Imprimir
            </button>
          </div>
        ) : null}
      </div>

      {copia === "manual" ? (
        <div className="mt-3">
          <label htmlFor="rh-comparativo-texto" className="text-xs font-semibold text-amber-100">
            O navegador não deixou copiar sozinho. Selecione tudo aqui dentro e copie na mão:
          </label>
          <textarea
            id="rh-comparativo-texto"
            readOnly
            rows={8}
            value={textoManual}
            className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/[0.07] p-3 font-mono text-xs text-white"
          />
        </div>
      ) : null}

      {guia.regrasDesempate.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-lime/25 bg-lime/[0.07] p-4">
          <h4 className="flex items-center gap-2 text-sm font-extrabold text-white">
            <ListChecks className="h-4 w-4 text-lime" aria-hidden="true" />
            Como a clínica desempata
          </h4>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm font-medium leading-relaxed text-white/85 marker:font-extrabold marker:text-white">
            {guia.regrasDesempate.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {linhas.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-8 text-center">
          <Info className="mx-auto h-6 w-6 text-white/85" aria-hidden="true" />
          <p className="mx-auto mt-2 max-w-xl text-sm font-medium italic leading-relaxed text-white/85">
            “Preencha somente depois de entrevistar todas. O objetivo é comparar evidências e não
            sensação.”
          </p>
          <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-white/85">
            Ainda não há ficha nenhuma feita por este guia. Assim que a primeira entrevista for
            registrada, a tabela aparece aqui.
          </p>
        </div>
      ) : (
        <>
          <div className="rh-papel mt-4 overflow-hidden [&_:focus-visible]:outline-forest-2">
            <div className="rh-scroll max-h-[70dvh] overflow-auto">
              <table className="rh-tabela">
                <caption className="sr-only">
                  Comparativo das candidatas entrevistadas pelo guia {guia.titulo}. Use os botões do
                  cabeçalho para ordenar.
                </caption>
                <thead>
                  <tr>
                    {colunas.map((coluna) => {
                      const ativa = ordem?.coluna === coluna.chave;
                      const Icone = !ativa
                        ? ArrowUpDown
                        : ordem.direcao === "asc"
                          ? ArrowUp
                          : ArrowDown;
                      return (
                        <th
                          key={coluna.chave}
                          scope="col"
                          aria-sort={
                            ativa ? (ordem.direcao === "asc" ? "ascending" : "descending") : "none"
                          }
                        >
                          <button
                            type="button"
                            onClick={() => alternar(coluna.chave, coluna.padrao)}
                            className={`flex items-center gap-1.5 rounded-lg py-1 text-left uppercase tracking-[0.1em] text-ink transition-colors ${
                              ativa ? "underline decoration-2 underline-offset-4" : ""
                            } ${coluna.curto ? "max-w-[7.5rem] whitespace-normal" : ""}`}
                          >
                            {coluna.rotulo}
                            <Icone
                              size={12}
                              aria-hidden="true"
                              className={ativa ? "text-forest" : "text-ink-soft/50"}
                            />
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {ordenadas.map((linha) => (
                    <tr key={linha.id}>
                      <td>
                        <span className="block font-semibold text-ink">{linha.nome}</span>
                        <span className="block text-xs text-ink-soft">
                          {linha.vaga}
                          {linha.arquivada ? " · arquivada" : ""}
                        </span>
                      </td>
                      {guia.criterios.map((c) => {
                        const nota = linha.notas[c.chave];
                        return (
                          <td key={c.chave} className="text-center tabular-nums">
                            {nota === null || nota === undefined ? (
                              <span className="text-ink-soft">
                                <span aria-hidden="true">—</span>
                                <span className="sr-only">Sem nota neste critério</span>
                              </span>
                            ) : (
                              <span className="font-semibold text-ink">{nota}</span>
                            )}
                          </td>
                        );
                      })}
                      {/* O total é a coluna que decide: peso maior, fundo próprio. */}
                      <td className="bg-mint/40 text-center">
                        <span className="font-extrabold tabular-nums text-ink">{linha.total}</span>
                        <span className="text-xs font-semibold text-ink-soft">
                          /{totalPossivel(guia)}
                        </span>
                        {linha.avaliados < guia.criterios.length ? (
                          <span className="block text-[0.65rem] font-semibold text-ink-soft">
                            {linha.avaliados} de {guia.criterios.length} critérios
                          </span>
                        ) : null}
                      </td>
                      <td className="text-center">
                        {linha.estrelas === null ? (
                          <span className="text-ink-soft">
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">Sem leitura da IA</span>
                          </span>
                        ) : (
                          <span
                            className="font-semibold tabular-nums text-ink"
                            aria-label={`${linha.estrelas} de 5 estrelas na leitura da IA`}
                          >
                            {linha.estrelas}/5
                          </span>
                        )}
                      </td>
                      <td>{rotuloImpressao(linha.impressao) || "—"}</td>
                      <td>{rotuloDecisao(linha.decisao) || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <BlocoDecisaoFinal
            guia={guia}
            linhas={ordenadas}
            salvando={props.salvando}
            aoSalvar={(d) => props.aoSalvarGuia({ ...guia, decisaoFinal: d })}
          />
        </>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* A aba                                                                      */
/* -------------------------------------------------------------------------- */

export function AbaEntrevistas(props: {
  itens: Candidatura[];
  guias: GuiaEntrevista[];
  vagas: Vaga[];
  agora: Date;
  salvando: boolean;
  aoSalvarGuia: (guia: GuiaEntrevista) => void;
  aoExcluirGuia: (id: string) => void;
  aoAbrir: (id: string) => void;
  aoAbrirModoEntrevista: (id: string) => void;
}) {
  const [idGuia, setIdGuia] = useState("");
  const [rascunho, setRascunho] = useState<GuiaEntrevista | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [impressao, setImpressao] = useState<Impressao>("");
  const [linhasParaImprimir, setLinhasParaImprimir] = useState<LinhaComparativo[]>([]);
  const refCancelar = useRef<HTMLButtonElement>(null);

  const guia = useMemo(() => guiaEscolhido(props.guias, idGuia), [props.guias, idGuia]);

  // O "Excluir" some do DOM no mesmo clique que abre a confirmação, e o foco
  // iria junto para o <body>. O passo seguro é o Cancelar.
  useEffect(() => {
    if (confirmando) refCancelar.current?.focus();
  }, [confirmando]);

  /**
   * A impressão acontece em três tempos: o estado monta a área no `<body>`, o
   * navegador pinta, e só então o diálogo abre. Chamar `print()` no mesmo
   * quadro do clique imprimiria a página sem a área — ela ainda não existe.
   */
  useEffect(() => {
    if (impressao === "") return;
    const fim = () => setImpressao("");
    window.addEventListener("afterprint", fim);
    const id = window.setTimeout(() => window.print(), 90);
    return () => {
      window.removeEventListener("afterprint", fim);
      window.clearTimeout(id);
    };
  }, [impressao]);

  const salvarGuia = (item: GuiaEntrevista) => {
    setRascunho(null);
    setConfirmando(false);
    props.aoSalvarGuia(item);
  };

  return (
    <section aria-labelledby="rh-entrevistas-titulo" className="space-y-6">
      <header className="rh-vidro p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id="rh-entrevistas-titulo"
              className="font-display text-2xl font-extrabold leading-tight text-white"
            >
              Entrevistas
            </h2>
            <p className="mt-1 max-w-2xl text-sm font-medium text-white/85">
              O método é da clínica: as perguntas, os critérios e as regras de desempate abaixo
              foram escritos por quem entrevista. É por eles que as fichas são geradas e é por eles
              que a decisão é tomada.
            </p>
          </div>
          <button
            type="button"
            className={ACAO}
            onClick={() => {
              setConfirmando(false);
              setRascunho(guiaVazio());
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo guia
          </button>
        </div>

        {props.guias.length > 0 ? (
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <div className="min-w-[16rem] flex-1">
              <label className={`${ROTULO_ESCURO} block`} htmlFor="rh-seletor-guia">
                Guia em uso
              </label>
              <select
                id="rh-seletor-guia"
                className={`${CAMPO} mt-1.5`}
                value={guia?.id ?? ""}
                onChange={(e) => {
                  setRascunho(null);
                  setConfirmando(false);
                  setIdGuia(e.target.value);
                }}
              >
                {props.guias.map((g) => (
                  <option key={g.id} value={g.id} className={OPCAO}>
                    {rotuloDoGuia(g, props.vagas)}
                  </option>
                ))}
              </select>
            </div>

            {guia !== null ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={ACAO}
                  onClick={() => {
                    setConfirmando(false);
                    setImpressao("guia");
                  }}
                >
                  <Printer className="h-4 w-4" aria-hidden="true" />
                  Imprimir guia em branco
                </button>
                {guia.padrao ? null : (
                  <button
                    type="button"
                    className={ACAO}
                    disabled={props.salvando}
                    // Ação de um clique porque é uma troca de um campo só, e
                    // abrir o editor inteiro para marcar uma caixa é o tipo de
                    // atrito que faz a clínica deixar dois guias disputando a
                    // mesma área. Quem desmarca o anterior é o servidor.
                    onClick={() => props.aoSalvarGuia({ ...guia, padrao: true })}
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Marcar como padrão da área
                  </button>
                )}
                <button
                  type="button"
                  className={ACAO}
                  onClick={() => {
                    setConfirmando(false);
                    // A cópia não leva a decisão final junto: ela pertence ao
                    // processo que já aconteceu, e herdá-la faria o guia novo
                    // nascer afirmando que a clínica já escolheu alguém.
                    // `derivado` nasce ligado porque este texto foi escrito para
                    // outra função — quem o valida é uma pessoa, não a cópia.
                    setRascunho({
                      ...guia,
                      id: "",
                      slug: "",
                      titulo: `${guia.titulo} (cópia)`,
                      padrao: false,
                      derivado: true,
                      decisaoFinal: decisaoFinalVazia(),
                      criadoEm: "",
                      atualizadoEm: "",
                    });
                  }}
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  Duplicar
                </button>
                {confirmando ? null : (
                  <button
                    type="button"
                    className={ACAO_PERIGO}
                    onClick={() => setConfirmando(true)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Excluir
                  </button>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {confirmando && guia !== null ? (
          <div className="mt-4 rounded-xl bg-rose-300/10 p-3 ring-1 ring-rose-200/30">
            <p role="alert" className="text-xs font-bold leading-relaxed text-rose-100">
              Excluir “{guia.titulo}” de vez? As fichas já geradas por ele continuam válidas — elas
              guardam o título do método junto —, mas as próximas candidaturas desta área passarão a
              usar outro guia, e as perguntas e critérios escritos aqui não voltam.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                ref={refCancelar}
                type="button"
                className={ACAO}
                onClick={() => setConfirmando(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-rose-500 px-3 text-xs font-extrabold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={props.salvando}
                onClick={() => {
                  setConfirmando(false);
                  props.aoExcluirGuia(guia.id);
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Excluir definitivamente
              </button>
            </div>
          </div>
        ) : null}
      </header>

      {/* ---- 1. O guia ---- */}
      <section aria-labelledby="rh-guia-titulo" className="rh-vidro p-4 sm:p-5">
        <TituloBloco id="rh-guia-titulo" icone={NotebookPen} texto="O guia da clínica" />

        <div className="mt-4">
          {rascunho !== null ? (
            <EditorGuia
              // A key remonta o editor a cada guia aberto: sem ela, trocar de
              // guia manteria no formulário o texto do anterior.
              key={rascunho.id.length > 0 ? rascunho.id : "novo"}
              rascunho={rascunho}
              vagas={props.vagas}
              salvando={props.salvando}
              aoFechar={() => setRascunho(null)}
              aoSalvar={salvarGuia}
            />
          ) : guia === null ? (
            <div className="rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-8 text-center">
              <NotebookPen className="mx-auto h-6 w-6 text-white/85" aria-hidden="true" />
              <p className="mt-2 text-sm font-bold text-white">Nenhum guia cadastrado.</p>
              <p className="mx-auto mt-1 max-w-lg text-sm font-medium leading-relaxed text-white/85">
                Sem guia não há ficha: é dele que saem as perguntas, os critérios e a folha que vai
                para a mesa. Comece pelo método que a clínica já entregou em papel.
              </p>
              <button
                type="button"
                className={`${ACAO_FORTE} mt-4`}
                disabled={props.salvando}
                onClick={() => props.aoSalvarGuia(guiaSementeRecepcao())}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Trazer o guia de recepção da JP
              </button>
            </div>
          ) : (
            <VisaoGuia
              guia={guia}
              vagas={props.vagas}
              salvando={props.salvando}
              aoEditar={() => {
                setConfirmando(false);
                setRascunho(guia);
              }}
              aoRevisar={() => props.aoSalvarGuia({ ...guia, derivado: false })}
            />
          )}
        </div>
      </section>

      {/* ---- 2. A agenda ---- */}
      <Agenda
        itens={props.itens}
        guia={guia}
        agora={props.agora}
        aoAbrir={props.aoAbrir}
        aoAbrirModoEntrevista={props.aoAbrirModoEntrevista}
      />

      {/* ---- 3. O comparativo ---- */}
      {guia !== null ? (
        <Comparativo
          guia={guia}
          itens={props.itens}
          salvando={props.salvando}
          agora={props.agora}
          aoSalvarGuia={props.aoSalvarGuia}
          aoImprimir={(linhas) => {
            setLinhasParaImprimir(linhas);
            setImpressao("comparativo");
          }}
        />
      ) : null}

      {impressao !== "" && guia !== null ? (
        <AreaDeImpressao>
          {impressao === "guia" ? (
            <GuiaEmBranco
              guia={guia}
              horario={horarioDoGuia(guia, props.vagas)}
              vaga={vagaDoGuia(guia, props.vagas)?.titulo ?? rotuloArea(guia.area)}
            />
          ) : (
            <ComparativoImpresso
              guia={guia}
              linhas={linhasParaImprimir}
              decisao={decisaoDoGuia(guia)}
            />
          )}
        </AreaDeImpressao>
      ) : null}
    </section>
  );
}
