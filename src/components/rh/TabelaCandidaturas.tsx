import {
  useMemo,
  useState,
  type KeyboardEvent as EventoTeclado,
  type MouseEvent as EventoMouse,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  MessageCircle,
  Paperclip,
  RotateCcw,
  Sparkles,
  Star,
  TriangleAlert,
} from "lucide-react";

import { ResumoDuvidas } from "@/components/rh/PainelDuvidas";
import { duvidasImportantesDe } from "@/lib/rh/duvidas";
import { leiturasDeDuvidas, situacaoDaFicha, totalDaFicha } from "@/lib/rh/ficha";
import { formatarData, iniciais, tempoRelativo } from "@/lib/rh/formatar";
import { linkWhatsapp } from "@/lib/rh/mensagens";
import { contarPorSeveridade } from "@/lib/rh/ia/sinais";
import type { AnaliseIa } from "@/lib/rh/ia/tipos";
import { AREAS, STATUS, statusPor } from "@/lib/rh/opcoes";
import type { Candidatura, StatusCandidatura } from "@/lib/rh/tipos";

type Coluna =
  | "nome"
  | "vaga"
  | "area"
  | "status"
  | "nota"
  | "ia"
  | "sinais"
  | "ficha"
  | "duvidas"
  | "cidade"
  | "recebida";
type Direcao = "asc" | "desc";
type OrdemLocal = { coluna: Coluna; direcao: Direcao } | null;

/** `padrao` é a direção do primeiro clique: nota e data começam do maior. */
const COLUNAS: { chave: Coluna; rotulo: string; padrao: Direcao }[] = [
  { chave: "nome", rotulo: "Candidato", padrao: "asc" },
  { chave: "vaga", rotulo: "Vaga", padrao: "asc" },
  { chave: "area", rotulo: "Área", padrao: "asc" },
  { chave: "status", rotulo: "Status", padrao: "asc" },
  { chave: "nota", rotulo: "Nota", padrao: "desc" },
  { chave: "ia", rotulo: "IA", padrao: "desc" },
  { chave: "sinais", rotulo: "Sinais", padrao: "desc" },
  { chave: "ficha", rotulo: "Ficha", padrao: "desc" },
  /* Coluna própria, e não um pedaço da célula de ficha: quem clica aqui está
     montando a fila de "com quem eu ainda preciso falar antes de fazer
     proposta", e essa é uma ordenação de verdade — a mesma pergunta que o selo
     do kanban responde de relance. */
  { chave: "duvidas", rotulo: "Dúvidas", padrao: "desc" },
  { chave: "cidade", rotulo: "Cidade/UF", padrao: "asc" },
  { chave: "recebida", rotulo: "Recebida em", padrao: "desc" },
];

function rotuloArea(area: string): string {
  return AREAS.find((a) => a.valor === area)?.rotulo ?? "Sem área";
}

function rotuloVaga(c: Candidatura): string {
  return c.vagaTitulo.trim() || c.cargoDesejado.trim() || "Candidatura espontânea";
}

/**
 * A análise só conta quando existe E deu certo. Uma leitura que falhou tem nota
 * zero por causa do PDF corrompido, não por causa da candidata: tratá-la como
 * análise válida jogaria a pessoa para o fim da ordenação por um motivo que não
 * é dela.
 */
function analiseValida(c: Candidatura): AnaliseIa | null {
  const a = c.analise;
  if (a === null || a.erro.length > 0) return null;
  return a;
}

/** Alertas que fazem alguém parar a leitura: crítico e alto, somados. */
function graves(c: Candidatura): number {
  const a = analiseValida(c);
  if (a === null) return 0;
  const contagem = contarPorSeveridade(a.sinais);
  return contagem.critico + contagem.alto;
}

/**
 * Peso da ficha para ordenar a coluna: quanto mais adiantada a entrevista, mais
 * alto. Entre duas concluídas desempata o total — que é exatamente o que se
 * procura ao clicar nessa coluna depois de um dia de entrevistas.
 *
 * Ficha que falhou ao gerar fica ACIMA de "sem ficha" de propósito: ela pede uma
 * ação (tentar de novo), e quem ordena por esta coluna está justamente atrás do
 * que ainda falta fazer.
 */
function pesoDaFicha(c: Candidatura): number {
  const ficha = c.ficha;
  switch (situacaoDaFicha(ficha)) {
    case "concluida":
      return 3000 + (ficha === null ? 0 : totalDaFicha(ficha.notas).total);
    case "preenchendo":
      return 2000;
    case "gerada":
      return 1000;
    case "erro":
      return 500;
    default:
      return 0;
  }
}

/**
 * Dúvidas graves que a entrevista ainda não resolveu.
 *
 * A conta mora em `PainelDuvidas` para o funil e a tabela nunca discordarem
 * sobre a mesma pessoa; aqui ela só serve para ordenar e para decidir se a
 * pílula aparece.
 */
function duvidasPesando(c: Candidatura): number {
  return duvidasImportantesDe(c, leiturasDeDuvidas(c.ficha));
}

/** Mesma normalização da barra de filtros: sem acento, sem caixa, comparável. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .trim();
}

function compararTexto(a: string, b: string): number {
  const x = normalizar(a);
  const y = normalizar(b);
  if (x === y) return 0;
  return x < y ? -1 : 1;
}

/** Status ordena pela posição no funil, não em ordem alfabética. */
function indiceStatus(status: StatusCandidatura): number {
  const i = STATUS.findIndex((s) => s.valor === status);
  return i < 0 ? STATUS.length : i;
}

function comparar(a: Candidatura, b: Candidatura, coluna: Coluna): number {
  switch (coluna) {
    case "nome":
      return compararTexto(a.nome, b.nome);
    case "vaga":
      return compararTexto(rotuloVaga(a), rotuloVaga(b));
    case "area":
      return compararTexto(rotuloArea(a.area), rotuloArea(b.area));
    case "status":
      return indiceStatus(a.status) - indiceStatus(b.status);
    case "nota":
      return a.nota - b.nota;
    case "ia": {
      // Quem não foi lida vale -1, e não 0: no primeiro clique (decrescente) ela
      // fica abaixo de quem tirou zero de verdade, e a ordem crescente a traz
      // para o topo — que é justamente como se procura "quem falta analisar".
      const x = analiseValida(a);
      const y = analiseValida(b);
      return (x === null ? -1 : x.notaGeral) - (y === null ? -1 : y.notaGeral);
    }
    case "sinais":
      return graves(a) - graves(b);
    case "ficha":
      return pesoDaFicha(a) - pesoDaFicha(b);
    case "duvidas":
      return duvidasPesando(a) - duvidasPesando(b);
    case "cidade":
      return compararTexto(`${a.cidade} ${a.uf}`, `${b.cidade} ${b.uf}`);
    case "recebida":
      return a.criadoEm.localeCompare(b.criadoEm);
    default:
      return 0;
  }
}

/**
 * Estrelas de leitura na superfície clara. Aqui o preenchimento é --forest, e
 * não o lime: lime como glifo em fundo claro mede 2,81:1 e reprovaria.
 */
function Estrelas(props: { nota: number }) {
  if (props.nota <= 0) {
    return (
      <span className="text-ink-soft">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Sem nota</span>
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={`Nota ${props.nota} de 5`}
      className="flex items-center gap-0.5 whitespace-nowrap"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={12}
          strokeWidth={2}
          aria-hidden="true"
          fill={n <= props.nota ? "currentColor" : "none"}
          className={n <= props.nota ? "text-forest" : "text-ink-soft/35"}
        />
      ))}
    </span>
  );
}

/** Tracinho de "não há o que mostrar", com o motivo dito para o leitor de tela. */
function Vazio(props: { descricao: string }) {
  return (
    <span className="text-ink-soft">
      <span aria-hidden="true">—</span>
      <span className="sr-only">{props.descricao}</span>
    </span>
  );
}

/** Estrelas da IA + nota /100, na paleta clara da tabela. */
function CelulaIa(props: { item: Candidatura }) {
  const item = props.item;
  if (item.analise !== null && item.analise.erro.length > 0) {
    return (
      <span className="flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-rose-700">
        <TriangleAlert size={13} aria-hidden="true" className="shrink-0" />
        Falhou
      </span>
    );
  }

  const analise = analiseValida(item);
  if (analise === null) return <Vazio descricao="Ainda não passou pela leitura da IA" />;

  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span
        role="img"
        aria-label={`Leitura da IA: ${analise.estrelas} de 5 estrelas`}
        className="flex items-center gap-0.5"
      >
        <Sparkles size={12} aria-hidden="true" className="mr-0.5 text-forest" />
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            size={12}
            strokeWidth={2}
            aria-hidden="true"
            fill={n <= analise.estrelas ? "currentColor" : "none"}
            className={n <= analise.estrelas ? "text-forest" : "text-ink-soft/35"}
          />
        ))}
      </span>
      <span className="text-xs font-bold tabular-nums text-ink">
        {analise.notaGeral}
        <span className="font-medium text-ink-soft">/100</span>
      </span>
    </span>
  );
}

/**
 * Sinais que pedem atenção. As pílulas do catálogo são desenhadas para fundo
 * escuro (`pilulaEscura`), e o `SeloSinais` só existe nessa variante — numa
 * linha branca ele sairia rosé sobre branco. Aqui as contagens são redesenhadas
 * na paleta clara, com o número escrito e o rótulo por extenso no leitor.
 */
function CelulaSinais(props: { item: Candidatura }) {
  const analise = analiseValida(props.item);
  if (analise === null) return <Vazio descricao="Sem leitura da IA" />;

  const contagem = contarPorSeveridade(analise.sinais);
  if (contagem.critico === 0 && contagem.alto === 0) {
    // Superfície clara: o texto corrido vai de --ink, nunca de --forest.
    return <span className="whitespace-nowrap text-xs font-semibold text-ink">Nada grave</span>;
  }

  return (
    <span className="flex items-center gap-1.5">
      {contagem.critico > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold tabular-nums text-rose-800 ring-1 ring-rose-300">
          <TriangleAlert size={11} aria-hidden="true" />
          <span aria-hidden="true">{contagem.critico}</span>
          <span className="sr-only">
            {contagem.critico} {contagem.critico === 1 ? "alerta crítico" : "alertas críticos"}
          </span>
        </span>
      ) : null}
      {contagem.alto > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-900 ring-1 ring-amber-300">
          <span aria-hidden="true">{contagem.alto}</span>
          <span className="sr-only">
            {contagem.alto} {contagem.alto === 1 ? "alerta alto" : "alertas altos"}
          </span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * A ficha de entrevista na paleta clara da tabela: ícone quando ela existe,
 * total quando a entrevista foi concluída.
 *
 * Sem denominador pelo mesmo motivo do cartão do kanban — a tabela não conhece
 * o guia, e o máximo (/50 no guia da JP) depende dele. O número aparece com
 * "pts" para ninguém confundir com a nota de 0 a 100 da coluna vizinha.
 */
function CelulaFicha(props: { item: Candidatura }) {
  const ficha = props.item.ficha;
  const situacao = situacaoDaFicha(ficha);

  if (situacao === "erro") {
    return (
      <span className="flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-rose-700">
        <TriangleAlert size={13} aria-hidden="true" className="shrink-0" />
        Falhou
      </span>
    );
  }
  if (situacao === "sem") return <Vazio descricao="Sem ficha de entrevista" />;

  if (situacao === "concluida" && ficha !== null) {
    const { total } = totalDaFicha(ficha.notas);
    return (
      <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-bold text-ink">
        <ClipboardCheck size={13} aria-hidden="true" className="shrink-0 text-forest" />
        <span className="tabular-nums">{total}</span>
        <span className="font-medium text-ink-soft">pts</span>
        <span className="sr-only">na ficha, entrevista concluída</span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-ink">
      <ClipboardList size={13} aria-hidden="true" className="shrink-0 text-forest" />
      {situacao === "preenchendo" ? "Em preenchimento" : "Pronta"}
    </span>
  );
}

/**
 * A pílula do roteiro na linha da tabela — a mesma do cartão do kanban, na
 * variante clara.
 *
 * Só acende quando sobrou dúvida importante em aberto; nas outras linhas fica o
 * tracinho das demais colunas, que é o vocabulário que a tabela já usa para
 * "nada a dizer aqui". Discreta de propósito: é aviso, não veredito.
 */
function CelulaDuvidas(props: { item: Candidatura }) {
  const leituras = leiturasDeDuvidas(props.item.ficha);
  if (duvidasImportantesDe(props.item, leituras) === 0) {
    return <Vazio descricao="Nenhuma dúvida importante em aberto" />;
  }
  return <ResumoDuvidas item={props.item} leituras={leituras} superficie="clara" />;
}

function LinkCurriculo(props: { item: Candidatura }) {
  if (!props.item.curriculo) {
    return (
      <span className="text-ink-soft">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Sem currículo anexado</span>
      </span>
    );
  }
  return (
    <a
      // Rota protegida por sessão: nunca um caminho de disco na tela.
      href={`/api/rh/curriculo/${props.item.id}`}
      target="_blank"
      rel="noreferrer"
      aria-label={`Baixar currículo de ${props.item.nome || "candidato"}`}
      className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-forest transition-colors hover:bg-mint"
    >
      <Paperclip size={16} aria-hidden="true" />
    </a>
  );
}

/**
 * Atalho de WhatsApp da linha: abre a conversa SEM mensagem pronta.
 *
 * Discreto de propósito — só ícone, do tamanho do clipe do currículo ao lado,
 * sem preenchimento nem cor forte. Quem manda na linha continua sendo "Abrir",
 * que leva à ficha; isto aqui é o gesto de "só quero falar rapidinho com ela".
 * A mensagem escrita mora na central de contato, dentro da gaveta: um convite
 * disparado daqui sairia sem o nome da vaga e não entraria no histórico dela.
 */
function AtalhoWhatsapp(props: { item: Candidatura }) {
  const href = linkWhatsapp(props.item.telefone, "");
  if (href === "") {
    return (
      <span className="text-ink-soft">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Sem telefone para WhatsApp</span>
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`Abrir conversa no WhatsApp com ${props.item.nome || "candidato"}`}
      className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-forest transition-colors hover:bg-mint"
    >
      <MessageCircle size={16} aria-hidden="true" />
    </a>
  );
}

function SeletorStatus(props: {
  item: Candidatura;
  aoMoverStatus: (id: string, status: StatusCandidatura) => void;
}) {
  const atual = statusPor(props.item.status);
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${atual.ponto}`} />
      <select
        value={props.item.status}
        aria-label={`Status de ${props.item.nome || "candidato"}`}
        onChange={(e) => props.aoMoverStatus(props.item.id, e.target.value as StatusCandidatura)}
        className="h-11 min-w-[8.5rem] rounded-xl border border-border-soft bg-white px-2 text-xs font-semibold text-ink transition-colors hover:border-forest"
      >
        {STATUS.map((s) => (
          <option key={s.valor} value={s.valor}>
            {s.rotulo}
          </option>
        ))}
      </select>
    </span>
  );
}

export function TabelaCandidaturas(props: {
  /** Já filtradas pela barra. */
  itens: Candidatura[];
  /** Quantas existem antes de qualquer filtro — separa "portal vazio" de
   *  "filtro sem resultado", que pedem telas diferentes. */
  total: number;
  agora: Date;
  /** Ids marcados para as ações em lote — a MESMA seleção do kanban. */
  selecionadas: string[];
  aoAbrir: (id: string) => void;
  aoSelecionar: (id: string, marcada: boolean) => void;
  aoMoverStatus: (id: string, status: StatusCandidatura) => void;
}) {
  // Ordenação local, separada de propósito do seletor da barra de filtros: quem
  // está lendo a tabela quer reordenar uma coluna sem mexer no que o kanban
  // mostra. `null` significa "do jeito que a lista chegou".
  const [ordem, setOrdem] = useState<OrdemLocal>(null);

  const { itens } = props;

  const linhas = useMemo(() => {
    if (!ordem) return itens;
    const decorado = itens.map((item, indice) => ({ item, indice }));
    const sinal = ordem.direcao === "asc" ? 1 : -1;
    decorado.sort((a, b) => {
      const diferenca = comparar(a.item, b.item, ordem.coluna) * sinal;
      return diferenca !== 0 ? diferenca : a.indice - b.indice;
    });
    return decorado.map((d) => d.item);
  }, [itens, ordem]);

  // Três estados por coluna: padrão, invertido e "sem ordenação local" — o
  // terceiro clique devolve a lista à ordem escolhida na barra de filtros.
  const alternar = (coluna: Coluna, padrao: Direcao) => {
    setOrdem((atual) => {
      if (!atual || atual.coluna !== coluna) return { coluna, direcao: padrao };
      if (atual.direcao === padrao) return { coluna, direcao: padrao === "asc" ? "desc" : "asc" };
      return null;
    });
  };

  const colunaAtiva = ordem ? COLUNAS.find((c) => c.chave === ordem.coluna) : undefined;

  const aoTeclarLinha = (e: EventoTeclado<HTMLTableRowElement>, id: string) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    // Só quando o foco está na própria linha: sem esta guarda, o espaço que abre
    // o <select> de status abriria a gaveta junto.
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    props.aoAbrir(id);
  };

  const aoClicarLinha = (e: EventoMouse<HTMLTableRowElement>, id: string) => {
    const alvo = e.target as HTMLElement | null;
    if (alvo?.closest("select, button, a, input, label")) return;
    props.aoAbrir(id);
  };

  if (itens.length === 0) {
    return (
      <div className="jp-container py-5">
        <p className="rh-papel px-5 py-10 text-center text-sm text-ink">
          {/* Portal recém-instalado não tem filtro para limpar: mandar limpar a
              busca que ninguém digitou é pedir uma ação impossível. */}
          {props.total === 0
            ? "Nenhuma candidatura chegou ainda. Publique uma vaga na aba Vagas: assim que o site receber o primeiro currículo, ele aparece aqui."
            : "Nenhuma candidatura com os filtros de agora. Tente limpar a busca ou incluir as arquivadas."}
        </p>
      </div>
    );
  }

  return (
    <div className="jp-container py-5">
      {/* Aviso de que a ordenação daqui é local — sem ele, o RH tenta entender
          por que a tabela não obedece ao "Ordenar por" da barra. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="text-white/85">
          Clique no cabeçalho para ordenar a tabela. Essa ordem vale só aqui — o{" "}
          <span className="font-semibold text-white">Ordenar por</span> da barra continua mandando
          na lista.
        </p>
        {ordem && colunaAtiva ? (
          <button
            type="button"
            onClick={() => setOrdem(null)}
            /* Texto branco, e não lime: sobre o fundo já tingido de lime o
                 `text-lime` cai para 3,7:1. O lime segue na borda, onde 3:1
                 basta. */
            className="flex h-11 items-center gap-1.5 rounded-xl border border-lime/40 bg-lime/10 px-3 font-semibold text-white transition-colors hover:bg-lime/20"
          >
            <RotateCcw size={14} aria-hidden="true" />
            {colunaAtiva.rotulo} {ordem.direcao === "asc" ? "crescente" : "decrescente"} · voltar à
            ordem da lista
          </button>
        ) : null}
      </div>

      {/* ---- Tabela (a partir de 768px) ---- */}
      {/* Mesmo motivo do resto do portal: dentro de `.rh-aurora` o foco sai
          lime, e estas superfícies são claras. */}
      <div className="rh-papel hidden overflow-hidden md:block [&_:focus-visible]:outline-forest-2">
        <div className="rh-scroll max-h-[70dvh] overflow-auto">
          <table className="rh-tabela">
            <caption className="sr-only">
              Candidaturas recebidas. Use os botões do cabeçalho para ordenar e Enter para abrir uma
              linha.
            </caption>
            <thead>
              <tr>
                {/* Coluna de seleção. Sem rótulo escrito no cabeçalho: quem
                    marca tudo é a barra de filtros, que já tem o contador — e
                    uma segunda caixa "marcar todos" aqui daria dois donos para
                    o mesmo estado. */}
                <th scope="col">
                  <span className="sr-only">Selecionar</span>
                </th>
                {COLUNAS.map((c) => {
                  const ativa = ordem?.coluna === c.chave;
                  const Icone = !ativa
                    ? ArrowUpDown
                    : ordem.direcao === "asc"
                      ? ArrowUp
                      : ArrowDown;
                  return (
                    <th
                      key={c.chave}
                      scope="col"
                      aria-sort={
                        ativa ? (ordem.direcao === "asc" ? "ascending" : "descending") : "none"
                      }
                    >
                      <button
                        type="button"
                        onClick={() => alternar(c.chave, c.padrao)}
                        /* `text-ink` explícito no botão: `.rh-tabela thead th`
                           pinta o cabeçalho de --brand-text, que é verde sobre
                           branco — e a regra do cliente manda letra preta aqui.
                           A coluna ativa continua se distinguindo pelo sublinhado
                           e pela seta cheia, sem depender de cor. */
                        className={`flex items-center gap-1.5 rounded-lg py-1 text-left uppercase tracking-[0.1em] text-ink transition-colors ${
                          ativa ? "underline decoration-2 underline-offset-4" : ""
                        }`}
                      >
                        {c.rotulo}
                        <Icone
                          size={12}
                          aria-hidden="true"
                          className={ativa ? "text-forest" : "text-ink-soft/50"}
                        />
                      </button>
                    </th>
                  );
                })}
                <th scope="col">Currículo</th>
                <th scope="col">
                  <span className="sr-only">WhatsApp</span>
                </th>
                <th scope="col">
                  <span className="sr-only">Abrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((item) => (
                /* A linha inteira responde a Enter e Espaço, mas continua sendo
                   uma <tr>: transformá-la em botão é impossível na prática —
                   ela contém um <select> e um link, e controle dentro de botão
                   é HTML inválido (o teclado ficaria preso no primeiro deles).
                   Por isso tabIndex na linha, com os controles internos ainda
                   tabuláveis e um botão "abrir" explícito na última coluna. */
                <tr
                  key={item.id}
                  role="row"
                  tabIndex={0}
                  onKeyDown={(e) => aoTeclarLinha(e, item.id)}
                  onClick={(e) => aoClicarLinha(e, item.id)}
                  className={`cursor-pointer ${
                    props.selecionadas.includes(item.id) ? "bg-mint" : ""
                  }`}
                >
                  <td>
                    <label className="flex min-h-11 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked={props.selecionadas.includes(item.id)}
                        onChange={(e) => props.aoSelecionar(item.id, e.target.checked)}
                        className="h-5 w-5 accent-forest"
                      />
                      <span className="sr-only">
                        Selecionar {item.nome || "candidatura sem nome"}
                      </span>
                    </label>
                  </td>
                  <td>
                    <span className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mint text-[0.7rem] font-extrabold text-ink"
                      >
                        {iniciais(item.nome) || "?"}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">
                          {item.nome || "Sem nome"}
                        </span>
                        <span className="block truncate text-xs text-ink-soft">{item.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className="max-w-[14rem] truncate">{rotuloVaga(item)}</td>
                  <td className="whitespace-nowrap">{rotuloArea(item.area)}</td>
                  <td>
                    <SeletorStatus item={item} aoMoverStatus={props.aoMoverStatus} />
                  </td>
                  <td>
                    <Estrelas nota={item.nota} />
                  </td>
                  <td>
                    <CelulaIa item={item} />
                  </td>
                  <td>
                    <CelulaSinais item={item} />
                  </td>
                  <td>
                    <CelulaFicha item={item} />
                  </td>
                  <td>
                    <CelulaDuvidas item={item} />
                  </td>
                  <td className="whitespace-nowrap">
                    {item.cidade ? `${item.cidade}${item.uf ? `/${item.uf}` : ""}` : "—"}
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="block text-ink">{formatarData(item.criadoEm) || "—"}</span>
                    <span className="block text-xs text-ink-soft">
                      {tempoRelativo(item.criadoEm, props.agora)}
                    </span>
                  </td>
                  <td>
                    <LinkCurriculo item={item} />
                  </td>
                  <td>
                    <AtalhoWhatsapp item={item} />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => props.aoAbrir(item.id)}
                      className="flex h-11 items-center gap-1 whitespace-nowrap rounded-xl px-2.5 text-xs font-bold text-ink transition-colors hover:bg-mint"
                    >
                      Abrir
                      <span className="sr-only"> a candidatura de {item.nome || "candidato"}</span>
                      <ChevronRight size={14} aria-hidden="true" className="text-forest" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- Cartões empilhados (até 768px) ----
          A mesma informação, sem rolagem horizontal: nove colunas num celular
          viram um arrastar infinito para a direita só para descobrir a cidade. */}
      <div className="md:hidden">
        <div className="mb-3 flex items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-white">
              Ordenar a tabela
            </span>
            <select
              value={ordem ? ordem.coluna : ""}
              onChange={(e) => {
                const escolhida = COLUNAS.find((c) => c.chave === e.target.value);
                setOrdem(escolhida ? { coluna: escolhida.chave, direcao: escolhida.padrao } : null);
              }}
              className="h-11 w-full min-w-0 rounded-xl border border-white/15 bg-white/[0.07] px-3 text-sm text-white"
            >
              <option value="" className="bg-brand-deep text-white">
                Ordem da lista
              </option>
              {COLUNAS.map((c) => (
                <option key={c.chave} value={c.chave} className="bg-brand-deep text-white">
                  {c.rotulo}
                </option>
              ))}
            </select>
          </label>
          {ordem ? (
            <button
              type="button"
              onClick={() =>
                setOrdem({
                  coluna: ordem.coluna,
                  direcao: ordem.direcao === "asc" ? "desc" : "asc",
                })
              }
              aria-label={
                ordem.direcao === "asc"
                  ? "Ordem crescente. Trocar para decrescente"
                  : "Ordem decrescente. Trocar para crescente"
              }
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-lime/40 bg-lime/10 text-white"
            >
              {ordem.direcao === "asc" ? (
                <ArrowUp size={16} aria-hidden="true" />
              ) : (
                <ArrowDown size={16} aria-hidden="true" />
              )}
            </button>
          ) : null}
        </div>

        <ul className="flex flex-col gap-3">
          {linhas.map((item) => (
            <li
              key={item.id}
              className={`rh-papel relative p-4 [&_:focus-visible]:outline-forest-2 ${
                props.selecionadas.includes(item.id) ? "ring-2 ring-forest" : ""
              }`}
            >
              <div className="flex items-start gap-2.5">
                {/* z-[2]: o `.stretch-link` do nome cobre o cartão inteiro, e
                    sem isto marcar a caixa abriria a gaveta. */}
                <label className="relative z-[2] flex shrink-0 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={props.selecionadas.includes(item.id)}
                    onChange={(e) => props.aoSelecionar(item.id, e.target.checked)}
                    className="h-5 w-5 shrink-0 accent-forest"
                  />
                  <span className="sr-only">Selecionar {item.nome || "candidatura sem nome"}</span>
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint text-xs font-extrabold text-ink"
                  >
                    {iniciais(item.nome) || "?"}
                  </span>
                </label>
                {/* Mesmo padrão do kanban: o alvo do botão cobre o cartão, mas
                    quem recebe o foco é um <button>. */}
                <button
                  type="button"
                  onClick={() => props.aoAbrir(item.id)}
                  className="stretch-link min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-bold text-ink">
                    {item.nome || "Sem nome"}
                  </span>
                  <span className="block truncate text-xs text-ink-soft">{item.email}</span>
                </button>
                <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-soft" />
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div className="min-w-0">
                  <dt className="font-semibold uppercase tracking-[0.1em] text-ink-soft">Vaga</dt>
                  <dd className="truncate text-ink">{rotuloVaga(item)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="font-semibold uppercase tracking-[0.1em] text-ink-soft">Área</dt>
                  <dd className="truncate text-ink">{rotuloArea(item.area)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="font-semibold uppercase tracking-[0.1em] text-ink-soft">
                    Cidade/UF
                  </dt>
                  <dd className="truncate text-ink">
                    {item.cidade ? `${item.cidade}${item.uf ? `/${item.uf}` : ""}` : "—"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="font-semibold uppercase tracking-[0.1em] text-ink-soft">
                    Recebida em
                  </dt>
                  <dd className="truncate text-ink">
                    {formatarData(item.criadoEm) || "—"}
                    <span className="text-ink-soft">
                      {" "}
                      · {tempoRelativo(item.criadoEm, props.agora)}
                    </span>
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="font-semibold uppercase tracking-[0.1em] text-ink-soft">Nota</dt>
                  <dd>
                    <Estrelas nota={item.nota} />
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="font-semibold uppercase tracking-[0.1em] text-ink-soft">
                    Leitura da IA
                  </dt>
                  <dd>
                    <CelulaIa item={item} />
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="font-semibold uppercase tracking-[0.1em] text-ink-soft">Sinais</dt>
                  <dd>
                    <CelulaSinais item={item} />
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="font-semibold uppercase tracking-[0.1em] text-ink-soft">Ficha</dt>
                  <dd>
                    <CelulaFicha item={item} />
                  </dd>
                </div>
              </dl>

              {/* z-[2] para ficar acima da camada do `.stretch-link`. */}
              <div className="relative z-[2] mt-3 flex items-center justify-between gap-2">
                <SeletorStatus item={item} aoMoverStatus={props.aoMoverStatus} />
                <span className="flex items-center gap-1">
                  <AtalhoWhatsapp item={item} />
                  <LinkCurriculo item={item} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
