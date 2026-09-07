/* eslint-disable react-refresh/only-export-components -- `filtrosVazios` e
   `aplicarFiltros` moram no mesmo arquivo da barra de propósito: são as regras
   que a barra promete cumprir, e separá-las faria os dois lados divergirem no
   dia em que um campo novo entrasse. O preço é perder o fast-refresh aqui. */
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Check,
  Download,
  Filter,
  LayoutGrid,
  Search,
  Sparkles,
  Star,
  Table2,
  X,
} from "lucide-react";

import { situacaoDaFicha } from "@/lib/rh/ficha";
import { contarPorSeveridade } from "@/lib/rh/ia/sinais";
import { RECOMENDACOES } from "@/lib/rh/ia/tipos";
import type { AnaliseIa, RecomendacaoIa } from "@/lib/rh/ia/tipos";
import { AREAS, STATUS } from "@/lib/rh/opcoes";
import type { AreaVaga, Candidatura, StatusCandidatura, Vaga } from "@/lib/rh/tipos";

export type FiltrosRh = {
  busca: string;
  area: AreaVaga | "";
  status: StatusCandidatura | "";
  vagaId: string;
  notaMinima: number;
  somenteComCurriculo: boolean;
  incluirArquivadas: boolean;
  /** Recomendação da IA. "" = qualquer uma, inclusive quem não foi analisada. */
  recomendacao: RecomendacaoIa | "";
  /** Nota 0 a 100 da IA. Zero desliga o filtro. */
  notaIaMinima: number;
  somenteComAnalise: boolean;
  comSinalCritico: boolean;
  /**
   * Em que pé está a ficha de entrevista. "" = tanto faz.
   *
   * Três valores, e não os cinco de `SituacaoFicha`: quem usa este filtro está
   * montando a fila de entrevistas ("quem ainda não tem ficha?", "quem já
   * entrevistei?"), e nesse trabalho uma ficha que falhou ao gerar é
   * indistinguível de uma que nunca existiu — nos dois casos falta preparar a
   * conversa. O motivo da falha continua escrito na própria ficha.
   */
  estadoFicha: "" | "sem-ficha" | "gerada" | "concluida";
  ordem: "recentes" | "antigas" | "nota" | "nome" | "nota-ia" | "estrelas";
};

/**
 * Valor sentinela do filtro de vaga para "candidaturas espontâneas". Não colide
 * com id real porque todo id de vaga nasce como "vaga_<16 hex>" no servidor — e
 * um sentinela é melhor que um segundo booleano, que abriria o estado impossível
 * "quero a vaga X e também as espontâneas".
 */
export const VAGA_ESPONTANEA = "espontanea";

const ORDENS: { valor: FiltrosRh["ordem"]; rotulo: string }[] = [
  { valor: "recentes", rotulo: "Mais recentes" },
  { valor: "antigas", rotulo: "Mais antigas" },
  { valor: "nota", rotulo: "Maior nota (do RH)" },
  { valor: "nota-ia", rotulo: "Maior nota da IA" },
  { valor: "estrelas", rotulo: "Mais estrelas da IA" },
  { valor: "nome", rotulo: "Nome (A a Z)" },
];

/**
 * A análise só vale quando existe E deu certo. Uma leitura que falhou tem nota
 * zero por causa do arquivo, não por causa da pessoa: se ela contasse como
 * análise válida, o filtro "só com leitura da IA" traria fichas que ninguém leu,
 * e a ordenação por nota da IA empurraria essas pessoas para o fim da fila por
 * um motivo que não é delas.
 */
function analiseValida(c: Candidatura): AnaliseIa | null {
  const a = c.analise;
  if (a === null || a.erro.length > 0) return null;
  return a;
}

function temSinalCritico(c: Candidatura): boolean {
  const a = analiseValida(c);
  if (a === null) return false;
  return contarPorSeveridade(a.sinais).critico > 0;
}

export function filtrosVazios(): FiltrosRh {
  return {
    busca: "",
    area: "",
    status: "",
    vagaId: "",
    notaMinima: 0,
    somenteComCurriculo: false,
    // Os quatro da triagem nascem desligados: a IA é uma camada a mais sobre a
    // lista, não um funil que esconde metade das candidaturas de quem abriu o
    // painel só para responder um WhatsApp.
    recomendacao: "",
    notaIaMinima: 0,
    somenteComAnalise: false,
    comSinalCritico: false,
    estadoFicha: "",
    // Arquivada fica fora por padrão: quem arquivou já decidiu que aquilo saiu
    // da mesa, e trazê-las de volta a cada abertura do painel desfaz a decisão.
    incluirArquivadas: false,
    ordem: "recentes",
  };
}

/**
 * Texto comparável: sem acento, sem caixa e sem espaço nas pontas. O NFD separa
 * o acento da letra e `\p{Mn}` varre as marcas soltas — assim "joão" casa com
 * "joao" e com "JOÃO", que é como a recepção digita quando está com pressa.
 */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .trim();
}

/** Todos os campos em que a busca procura, já concatenados e normalizados. */
function textoBuscavel(c: Candidatura): string {
  return normalizar(
    [c.nome, c.email, c.cargoDesejado, c.vagaTitulo, c.cidade, ...c.etiquetas].join(" "),
  );
}

/**
 * Comparação de nome sem `localeCompare`: a lista é renderizada no servidor e no
 * navegador, e a tabela de collation do Node "slim" não é a mesma do Chrome —
 * duas ordens diferentes derrubariam a hidratação. Comparar o texto já
 * normalizado dá o mesmo resultado nos dois lados e ainda ignora acento.
 */
function compararTexto(a: string, b: string): number {
  const x = normalizar(a);
  const y = normalizar(b);
  if (x === y) return 0;
  return x < y ? -1 : 1;
}

function comparar(a: Candidatura, b: Candidatura, ordem: FiltrosRh["ordem"]): number {
  switch (ordem) {
    case "antigas":
      return a.criadoEm.localeCompare(b.criadoEm);
    case "nota": {
      // Empate de nota volta a ser cronológico: entre dois candidatos nota 5, o
      // que chegou hoje é o que ainda está esperando resposta.
      const porNota = b.nota - a.nota;
      return porNota !== 0 ? porNota : b.criadoEm.localeCompare(a.criadoEm);
    }
    case "nota-ia": {
      // Sem análise vale -1, e não 0: quem ainda não foi lida fica abaixo de quem
      // realmente tirou zero, em vez de se misturar com ela.
      const x = analiseValida(a);
      const y = analiseValida(b);
      const porNota = (y === null ? -1 : y.notaGeral) - (x === null ? -1 : x.notaGeral);
      return porNota !== 0 ? porNota : b.criadoEm.localeCompare(a.criadoEm);
    }
    case "estrelas": {
      const x = analiseValida(a);
      const y = analiseValida(b);
      const porEstrela = (y === null ? -1 : y.estrelas) - (x === null ? -1 : x.estrelas);
      if (porEstrela !== 0) return porEstrela;
      // Mesmo número de estrelas: a nota de 0 a 100 desempata com mais
      // resolução do que a data, que só entra quando as duas coincidem.
      const porNota = (y === null ? -1 : y.notaGeral) - (x === null ? -1 : x.notaGeral);
      return porNota !== 0 ? porNota : b.criadoEm.localeCompare(a.criadoEm);
    }
    case "nome":
      return compararTexto(a.nome, b.nome);
    case "recentes":
      return b.criadoEm.localeCompare(a.criadoEm);
    default:
      return 0;
  }
}

export function aplicarFiltros(itens: Candidatura[], f: FiltrosRh): Candidatura[] {
  // Cada palavra da busca precisa aparecer em algum campo: assim "ana recepção"
  // acha a Ana da recepção mesmo com as palavras em ordem trocada.
  const termos = normalizar(f.busca)
    .split(/\s+/)
    .filter((t) => t.length > 0);

  const filtrados = itens.filter((c) => {
    if (c.arquivada && !f.incluirArquivadas) return false;
    if (f.area !== "" && c.area !== f.area) return false;
    if (f.status !== "" && c.status !== f.status) return false;

    if (f.vagaId !== "") {
      const espontanea = c.vagaId.trim().length === 0;
      if (f.vagaId === VAGA_ESPONTANEA) {
        if (!espontanea) return false;
      } else if (c.vagaId !== f.vagaId) {
        return false;
      }
    }

    if (f.notaMinima > 0 && c.nota < f.notaMinima) return false;
    if (f.somenteComCurriculo && c.curriculo === null) return false;

    const analise = analiseValida(c);
    if (f.somenteComAnalise && analise === null) return false;
    // Recomendação e nota da IA só podem ser respondidas por quem foi lida: sem
    // análise a ficha não "falha" no filtro, ela simplesmente não tem o dado — e
    // mantê-la na lista faria "Entrevistar já" trazer gente que a IA nunca viu.
    if (f.recomendacao !== "" && (analise === null || analise.recomendacao !== f.recomendacao)) {
      return false;
    }
    if (f.notaIaMinima > 0 && (analise === null || analise.notaGeral < f.notaIaMinima)) {
      return false;
    }
    if (f.comSinalCritico && !temSinalCritico(c)) return false;

    if (f.estadoFicha !== "") {
      const situacao = situacaoDaFicha(c.ficha);
      if (f.estadoFicha === "sem-ficha" && situacao !== "sem" && situacao !== "erro") return false;
      // "Com ficha pronta" inclui a ficha que já está sendo preenchida: a
      // conversa começou, mas ainda não terminou — e é justamente essa a lista
      // de quem falta fechar.
      if (f.estadoFicha === "gerada" && situacao !== "gerada" && situacao !== "preenchendo") {
        return false;
      }
      if (f.estadoFicha === "concluida" && situacao !== "concluida") return false;
    }

    if (termos.length > 0) {
      const alvo = textoBuscavel(c);
      if (!termos.every((t) => alvo.includes(t))) return false;
    }

    return true;
  });

  // Ordenação estável na marra. `Array.prototype.sort` já é estável desde a
  // ES2019, mas o desempate explícito pelo índice documenta a intenção e protege
  // de um comparador que um dia devolva 0 por engano — dois candidatos trocando
  // de lugar sozinhos a cada re-render é o bug que ninguém consegue repetir.
  const decorado = filtrados.map((item, indice) => ({ item, indice }));
  decorado.sort((a, b) => {
    const diferenca = comparar(a.item, b.item, f.ordem);
    return diferenca !== 0 ? diferenca : a.indice - b.indice;
  });
  return decorado.map((d) => d.item);
}

/** Quantos filtros saíram do padrão — vira o contador do botão "Filtros". */
function contarAtivos(f: FiltrosRh): number {
  const padrao = filtrosVazios();
  let n = 0;
  if (f.busca.trim().length > 0) n += 1;
  if (f.area !== padrao.area) n += 1;
  if (f.status !== padrao.status) n += 1;
  if (f.vagaId !== padrao.vagaId) n += 1;
  if (f.notaMinima !== padrao.notaMinima) n += 1;
  if (f.somenteComCurriculo !== padrao.somenteComCurriculo) n += 1;
  if (f.incluirArquivadas !== padrao.incluirArquivadas) n += 1;
  if (f.recomendacao !== padrao.recomendacao) n += 1;
  if (f.notaIaMinima !== padrao.notaIaMinima) n += 1;
  if (f.somenteComAnalise !== padrao.somenteComAnalise) n += 1;
  if (f.comSinalCritico !== padrao.comSinalCritico) n += 1;
  if (f.estadoFicha !== padrao.estadoFicha) n += 1;
  if (f.ordem !== padrao.ordem) n += 1;
  return n;
}

/* Campo escuro reaproveitado pelos selects e pelo input de busca. Não usa
   `.rh-campo` porque aquela classe é branca, feita para o formulário público:
   sobre a barra escura viraria uma fileira de lâmpadas. */
const CAMPO =
  "h-11 w-full min-w-0 rounded-xl border border-border-soft bg-white px-3 text-sm " +
  "text-ink shadow-sm transition-colors hover:border-forest/25 focus:border-forest";

/* O <option> herda o fundo do sistema, não o da barra: sem estas duas classes,
   a lista aberta sai texto branco sobre branco no Windows. */
const OPCAO = "bg-white text-ink";

/* Rótulo branco, e não lime: a barra é fundo verde, e ali toda LETRA é branca por
   decisão do cliente. O lime continua vivo no ícone e na borda dos campos. */
const ROTULO = "whitespace-nowrap text-[0.65rem] font-bold uppercase tracking-[0.14em] text-ink";

const BASE_CONTROLE =
  "min-w-[9.5rem] flex-1 basis-full sm:basis-[calc(50%-0.375rem)] lg:basis-auto";

function Campo(props: { id: string; rotulo: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${BASE_CONTROLE}`}>
      <label htmlFor={props.id} className={ROTULO}>
        {props.rotulo}
      </label>
      {props.children}
    </div>
  );
}

/**
 * Interruptor de verdade (`role="switch"`), não um checkbox maquiado. O estado
 * nunca é só a cor: o botão do trilho anda para a direita e um "check" aparece
 * ao lado do rótulo — dá para ler em monocromático.
 */
function Interruptor(props: { ligado: boolean; rotulo: string; aoAlternar: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.ligado}
      onClick={() => props.aoAlternar(!props.ligado)}
      className={`flex h-11 items-center gap-2.5 rounded-xl border px-3 text-left text-sm font-medium transition-colors ${BASE_CONTROLE} ${
        props.ligado
          ? "border-forest/30 bg-mint text-ink"
          : "border-border-soft bg-white text-ink-soft hover:border-forest/20"
      }`}
    >
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          props.ligado ? "bg-lime" : "bg-white/25"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            props.ligado ? "left-[1.125rem]" : "left-0.5"
          }`}
        />
      </span>
      <span className="min-w-0 flex-1">{props.rotulo}</span>
      {props.ligado ? <Check size={15} aria-hidden="true" className="shrink-0 text-lime" /> : null}
    </button>
  );
}

export function BarraFiltros(props: {
  filtros: FiltrosRh;
  aoMudar: (f: FiltrosRh) => void;
  vagas: Vaga[];
  total: number;
  visiveis: number;
  visao: "kanban" | "tabela";
  aoTrocarVisao: (v: "kanban" | "tabela") => void;
  aoExportar: () => void;
  /** Quantas estão marcadas para as ações em lote. */
  selecionadas: number;
  /** Todas as visíveis já estão marcadas — a caixa vira "desmarcar todas". */
  todasVisiveisMarcadas: boolean;
  aoSelecionarVisiveis: (marcar: boolean) => void;
}) {
  /* Fechado por padrão em QUALQUER largura, e não só no celular.
     Com os filtros sempre abertos no desktop, três fileiras de controles
     empurravam o primeiro candidato para um terço abaixo da dobra — e o RH
     abre esta tela para ver gente, não para ver filtro. O botão mostra
     quantos estão ativos, então nada fica escondido sem aviso. */
  const [painelAberto, setPainelAberto] = useState(false);
  const barraRef = useRef<HTMLDivElement>(null);
  // Começa na variável de tema (a rota pode fixá-la) e é corrigido por medição
  // logo no primeiro efeito. O valor inicial é o mesmo no servidor e no
  // navegador, então a hidratação não vê diferença nenhuma.
  const [topo, setTopo] = useState("var(--rh-topo, 0px)");
  const base = useId();
  const idPainel = `${base}-painel`;
  const idBusca = `${base}-busca`;
  const idArea = `${base}-area`;
  const idStatus = `${base}-status`;
  const idVaga = `${base}-vaga`;
  const idOrdem = `${base}-ordem`;
  const idRecomendacao = `${base}-recomendacao`;
  const idNotaIa = `${base}-nota-ia`;
  const idFicha = `${base}-ficha`;
  const idTriagem = `${base}-triagem`;

  const { filtros, aoMudar } = props;
  const ativos = contarAtivos(filtros);

  const mudar = (parcial: Partial<FiltrosRh>) => aoMudar({ ...filtros, ...parcial });

  /**
   * O cabeçalho do painel também é grudento e fica numa camada acima desta
   * barra: parada em `top: 0`, a barra escorregaria para debaixo dele e sumiria
   * na rolagem. A altura vem de medição, e não de um número fixo, porque o
   * cabeçalho quebra em duas linhas no celular — qualquer constante escrita aqui
   * estaria errada em metade das telas.
   */
  useEffect(() => {
    const barra = barraRef.current;
    if (!barra) return;

    const candidatos = Array.from(document.querySelectorAll<HTMLElement>("header")).filter(
      (el) =>
        getComputedStyle(el).position === "sticky" &&
        // Só interessa um cabeçalho que venha ANTES da barra no documento.
        (el.compareDocumentPosition(barra) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    );
    // O último é o mais próximo da barra. Importa quando a página tem dois
    // cabeçalhos grudentos: pegar o primeiro colaria a barra na altura errada.
    const cabecalho = candidatos[candidatos.length - 1];
    if (!cabecalho) return;

    const medir = () => setTopo(`${cabecalho.offsetHeight}px`);
    medir();
    // Remedir no resize é obrigatório: girar o tablet muda a altura do cabeçalho.
    const observador = new ResizeObserver(medir);
    observador.observe(cabecalho);
    return () => observador.disconnect();
  }, []);

  // Cast obrigatório: `CSSProperties` não declara propriedades customizadas, e
  // é por variável que a medição chega às classes utilitárias do painel.
  const estiloPainel = { "--rh-painel-max": `calc(100dvh - ${topo} - 11rem)` } as CSSProperties;

  return (
    <div
      ref={barraRef}
      style={{ top: topo }}
      className="sticky z-30 border-y border-border-soft bg-white/95 shadow-[0_12px_30px_-28px_rgba(3,47,1,0.55)] backdrop-blur-xl"
    >
      <div className="jp-container flex flex-col gap-3 py-3">
        {/* LINHA 1 — busca, atalho do painel no celular, visão e exportação */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <label htmlFor={idBusca} className="sr-only">
              Buscar candidatura
            </label>
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lime"
            />
            <input
              id={idBusca}
              type="search"
              value={filtros.busca}
              onChange={(e) => mudar({ busca: e.target.value })}
              placeholder="Nome, e-mail, vaga, cidade ou etiqueta"
              /* O rótulo é sr-only, então o placeholder é a única pista visual do
                 que o campo aceita — e ele é LETRA sobre fundo verde, então vai
                 no piso de 85% de branco que o cliente fixou. */
              className={`${CAMPO} pl-9 pr-12 placeholder:text-ink-soft`}
            />
            {filtros.busca.length > 0 ? (
              <button
                type="button"
                onClick={() => mudar({ busca: "" })}
                aria-label="Limpar busca"
                className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-white/85 transition-colors hover:text-white"
              >
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setPainelAberto((v) => !v)}
            aria-expanded={painelAberto}
            aria-controls={idPainel}
            className="flex h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-3 text-sm font-semibold text-white transition-colors hover:border-white/30"
          >
            <Filter size={16} aria-hidden="true" />
            Filtros
            {ativos > 0 ? (
              <span className="rounded-full bg-lime px-1.5 py-0.5 text-[0.65rem] font-bold text-brand-deep">
                {ativos}
              </span>
            ) : null}
          </button>

          <div
            role="group"
            aria-label="Modo de visualização"
            className="flex h-11 items-center gap-1 rounded-xl border border-white/15 bg-white/[0.07] p-1"
          >
            <button
              type="button"
              aria-pressed={props.visao === "kanban"}
              onClick={() => props.aoTrocarVisao("kanban")}
              className={`flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold transition-colors ${
                props.visao === "kanban"
                  ? "bg-lime text-brand-deep"
                  : "text-white/85 hover:text-white"
              }`}
            >
              <LayoutGrid size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Kanban</span>
              <span className="sr-only sm:hidden">Kanban</span>
            </button>
            <button
              type="button"
              aria-pressed={props.visao === "tabela"}
              onClick={() => props.aoTrocarVisao("tabela")}
              className={`flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold transition-colors ${
                props.visao === "tabela"
                  ? "bg-lime text-brand-deep"
                  : "text-white/85 hover:text-white"
              }`}
            >
              <Table2 size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Tabela</span>
              <span className="sr-only sm:hidden">Tabela</span>
            </button>
          </div>

          <button
            type="button"
            onClick={props.aoExportar}
            /* Texto branco: sobre o fundo já tingido de lime, `text-lime` cai
               para 4,17:1. O lime segue na borda, onde 3:1 basta. */
            className="flex h-11 items-center gap-2 rounded-xl border border-lime/40 bg-lime/10 px-3 text-sm font-semibold text-white transition-colors hover:bg-lime/20"
          >
            <Download size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Exportar CSV</span>
            <span className="sr-only sm:hidden">Exportar CSV</span>
          </button>
        </div>

        {/* LINHA 2 — o resto dos filtros. No celular vive atrás do botão
            "Filtros": dez controles empilhados empurrariam a lista para fora da
            tela antes de a pessoa ver o primeiro candidato. */}
        <div
          id={idPainel}
          /* A barra é grudenta e nasce colada no cabeçalho, então ela nunca
             rola: no celular, os sete controles empilhados passavam da altura da
             tela e os últimos ("Incluir arquivadas", "Limpar tudo") ficavam fora
             de alcance. A rolagem própria vale só abaixo de `lg`, onde o painel
             empilha; no desktop ele cabe em uma faixa. A variável carrega a
             medição do cabeçalho que já existe para o `top`. */
          style={estiloPainel}
          className={`${painelAberto ? "flex" : "hidden"} max-h-[var(--rh-painel-max)] flex-wrap items-end gap-3 overflow-y-auto border-t border-white/10 pt-3`}
        >
          <Campo id={idArea} rotulo="Área">
            <select
              id={idArea}
              value={filtros.area}
              onChange={(e) => mudar({ area: e.target.value as AreaVaga | "" })}
              className={CAMPO}
            >
              <option value="" className={OPCAO}>
                Todas as áreas
              </option>
              {AREAS.map((a) => (
                <option key={a.valor} value={a.valor} className={OPCAO}>
                  {a.rotulo}
                </option>
              ))}
            </select>
          </Campo>

          <Campo id={idStatus} rotulo="Status">
            <select
              id={idStatus}
              value={filtros.status}
              onChange={(e) => mudar({ status: e.target.value as StatusCandidatura | "" })}
              className={CAMPO}
            >
              <option value="" className={OPCAO}>
                Todos os status
              </option>
              {STATUS.map((s) => (
                <option key={s.valor} value={s.valor} className={OPCAO}>
                  {s.rotulo}
                </option>
              ))}
            </select>
          </Campo>

          <Campo id={idVaga} rotulo="Vaga">
            <select
              id={idVaga}
              value={filtros.vagaId}
              onChange={(e) => mudar({ vagaId: e.target.value })}
              className={CAMPO}
            >
              <option value="" className={OPCAO}>
                Todas as vagas
              </option>
              <option value={VAGA_ESPONTANEA} className={OPCAO}>
                Candidaturas espontâneas
              </option>
              {props.vagas.map((v) => (
                <option key={v.id} value={v.id} className={OPCAO}>
                  {v.titulo}
                </option>
              ))}
            </select>
          </Campo>

          <Campo id={idOrdem} rotulo="Ordenar por">
            <select
              id={idOrdem}
              value={filtros.ordem}
              onChange={(e) => mudar({ ordem: e.target.value as FiltrosRh["ordem"] })}
              className={CAMPO}
            >
              {ORDENS.map((o) => (
                <option key={o.valor} value={o.valor} className={OPCAO}>
                  {o.rotulo}
                </option>
              ))}
            </select>
          </Campo>

          {/* Nota mínima. As estrelas vivem numa cápsula clara porque
              `.rh-estrela[data-ativa]` pinta com --brand-green, que sobre o
              verde profundo da barra sumiria. */}
          <div className={`flex flex-col gap-1.5 ${BASE_CONTROLE}`}>
            <span className={ROTULO}>Nota mínima</span>
            <div className="flex h-11 items-center gap-1 rounded-xl bg-paper px-1.5 ring-1 ring-white/15 [&_:focus-visible]:outline-forest-2">
              <div role="radiogroup" aria-label="Nota mínima" className="flex items-center">
                {[1, 2, 3, 4, 5].map((n) => {
                  const ativa = n <= filtros.notaMinima;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={filtros.notaMinima === n}
                      aria-label={`Nota mínima ${n}`}
                      data-ativa={ativa ? "true" : "false"}
                      // Clicar na estrela já marcada zera o filtro: é o gesto que
                      // todo mundo tenta antes de procurar um botão "limpar".
                      onClick={() => mudar({ notaMinima: filtros.notaMinima === n ? 0 : n })}
                      className="rh-estrela flex h-9 w-8 items-center justify-center rounded-lg"
                    >
                      <Star
                        size={17}
                        strokeWidth={2}
                        aria-hidden="true"
                        fill={ativa ? "currentColor" : "none"}
                      />
                    </button>
                  );
                })}
              </div>
              {/* Texto ao lado das estrelas: o filtro não pode ser lido só pelo
                  preenchimento dos ícones. A cápsula é clara, então o valor vai
                  de --ink, o preto do projeto. */}
              <span className="ml-0.5 text-xs font-semibold text-ink">
                {filtros.notaMinima > 0 ? `${filtros.notaMinima}+` : "Qualquer"}
              </span>
            </div>
          </div>

          <Interruptor
            ligado={filtros.somenteComCurriculo}
            rotulo="Só com currículo"
            aoAlternar={(v) => mudar({ somenteComCurriculo: v })}
          />
          <Interruptor
            ligado={filtros.incluirArquivadas}
            rotulo="Incluir arquivadas"
            aoAlternar={(v) => mudar({ incluirArquivadas: v })}
          />

          {/* ---- Triagem por IA ----
              Agrupados sob subtítulo próprio, e em basis-full, porque respondem a
              outra pergunta: os de cima recortam o cadastro ("quem é"), estes
              recortam o julgamento ("o que a leitura achou"). Misturados na mesma
              fileira, "Nota mínima" (a do RH) e "Nota da IA" ficariam lado a lado
              sem nada dizendo que uma é opinião humana e a outra é leitura de
              máquina. */}
          <div
            role="group"
            aria-labelledby={idTriagem}
            className="flex basis-full flex-wrap items-end gap-3 border-t border-white/10 pt-3"
          >
            <p
              id={idTriagem}
              className="flex basis-full items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-white"
            >
              {/* Ícone segue lime: a regra do cliente vale para letra, não para
                  ícone — é o que mantém a marca viva depois do texto virar branco. */}
              <Sparkles size={13} aria-hidden="true" className="text-lime" />
              Triagem por IA
            </p>

            <Campo id={idRecomendacao} rotulo="Recomendação">
              <select
                id={idRecomendacao}
                value={filtros.recomendacao}
                onChange={(e) => mudar({ recomendacao: e.target.value as RecomendacaoIa | "" })}
                className={CAMPO}
              >
                <option value="" className={OPCAO}>
                  Qualquer recomendação
                </option>
                {RECOMENDACOES.map((r) => (
                  <option key={r.valor} value={r.valor} className={OPCAO}>
                    {r.rotulo}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo id={idNotaIa} rotulo="Nota da IA (mínima)">
              <select
                id={idNotaIa}
                value={String(filtros.notaIaMinima)}
                onChange={(e) => mudar({ notaIaMinima: Number(e.target.value) })}
                className={CAMPO}
              >
                <option value="0" className={OPCAO}>
                  Qualquer nota
                </option>
                {[50, 60, 70, 80, 90].map((n) => (
                  <option key={n} value={String(n)} className={OPCAO}>
                    {n} ou mais
                  </option>
                ))}
              </select>
            </Campo>

            <Campo id={idFicha} rotulo="Ficha de entrevista">
              <select
                id={idFicha}
                value={filtros.estadoFicha}
                onChange={(e) => mudar({ estadoFicha: e.target.value as FiltrosRh["estadoFicha"] })}
                className={CAMPO}
              >
                <option value="" className={OPCAO}>
                  Qualquer ficha
                </option>
                <option value="sem-ficha" className={OPCAO}>
                  Ainda sem ficha
                </option>
                <option value="gerada" className={OPCAO}>
                  Com ficha pronta
                </option>
                <option value="concluida" className={OPCAO}>
                  Entrevista concluída
                </option>
              </select>
            </Campo>

            <Interruptor
              ligado={filtros.somenteComAnalise}
              rotulo="Só com leitura da IA"
              aoAlternar={(v) => mudar({ somenteComAnalise: v })}
            />
            <Interruptor
              ligado={filtros.comSinalCritico}
              rotulo="Com alerta crítico"
              aoAlternar={(v) => mudar({ comSinalCritico: v })}
            />
          </div>
        </div>

        {/* LINHA 3 — contagem, seleção em lote e saída de emergência */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p aria-live="polite" className="text-white/85">
            <strong className="font-display font-extrabold text-white">{props.visiveis}</strong> de{" "}
            {props.total} {props.total === 1 ? "candidatura" : "candidaturas"}
            {props.selecionadas > 0 ? (
              <>
                {" · "}
                <strong className="font-display font-extrabold text-white">
                  {props.selecionadas}
                </strong>{" "}
                {props.selecionadas === 1 ? "selecionada" : "selecionadas"}
              </>
            ) : null}
          </p>

          {/* "Marcar todas as visíveis" mora aqui, e não no cabeçalho da
              tabela, porque a seleção é a mesma nas duas visões — no kanban
              não existe cabeçalho de coluna onde pendurar isto, e duas caixas
              de "marcar todos" dariam dois donos ao mesmo estado. VISÍVEIS, e
              não todas: marcar 200 candidaturas que o filtro está escondendo é
              o tipo de gesto que ninguém consegue desfazer com confiança. */}
          {props.visiveis > 0 ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-white">
              <input
                type="checkbox"
                checked={props.todasVisiveisMarcadas}
                onChange={(e) => props.aoSelecionarVisiveis(e.target.checked)}
                className="h-5 w-5 accent-lime"
              />
              Selecionar {props.visiveis === 1 ? "a visível" : "todas as visíveis"}
            </label>
          ) : null}
          {ativos > 0 ? (
            <button
              type="button"
              onClick={() => aoMudar(filtrosVazios())}
              className="flex h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-white transition-colors hover:text-white/85"
            >
              <X size={15} aria-hidden="true" className="text-lime" />
              Limpar tudo
              <span className="sr-only">
                ({ativos} {ativos === 1 ? "filtro ativo" : "filtros ativos"})
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
