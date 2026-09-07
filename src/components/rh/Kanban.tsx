import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from "react";
import {
  Archive,
  Check,
  ChevronsLeftRight,
  ClipboardCheck,
  ClipboardList,
  MessageCircle,
  MoveRight,
  Paperclip,
  Sparkles,
  Star,
  TriangleAlert,
} from "lucide-react";

import { ResumoDuvidas } from "@/components/rh/PainelDuvidas";
import { useAlturaAteOFimDaJanela } from "@/components/rh/useAlturaDaJanela";
import { duvidasImportantesDe } from "@/lib/rh/duvidas";
import { leiturasDeDuvidas, situacaoDaFicha, totalDaFicha } from "@/lib/rh/ficha";
import { iniciais, primeiroNome, tempoRelativo } from "@/lib/rh/formatar";
import { linkWhatsapp } from "@/lib/rh/mensagens";
import { AREAS, STATUS } from "@/lib/rh/opcoes";
import { recomendacaoPor } from "@/lib/rh/ia/tipos";
import type { Candidatura, StatusCandidatura } from "@/lib/rh/tipos";

/** Área pode chegar vazia de um registro antigo; o texto de reserva evita "undefined". */
function rotuloArea(area: string): string {
  return AREAS.find((a) => a.valor === area)?.rotulo ?? "Sem área";
}

/**
 * Estrelas só de leitura. O `role="img"` com `aria-label` é o que faz o leitor
 * de tela anunciar "Nota 4 de 5" em vez de cinco ícones mudos — e esse texto é
 * também a pista não cromática que o projeto exige para qualquer estado.
 */
function Estrelas(props: { nota: number }) {
  if (props.nota <= 0) return null;
  return (
    <span
      role="img"
      aria-label={`Nota ${props.nota} de 5`}
      className="flex shrink-0 items-center gap-0.5"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={11}
          strokeWidth={2}
          aria-hidden="true"
          fill={n <= props.nota ? "currentColor" : "none"}
          // Lime como texto só em fundo escuro — e o cartão do kanban é sempre escuro.
          className={n <= props.nota ? "text-lime" : "text-white/25"}
        />
      ))}
    </span>
  );
}

/**
 * A leitura da IA, em CHIPS, na mesma fileira da área e das estrelas.
 *
 * Era uma linha própria embaixo delas, e no estado mais comum do painel essa
 * linha inteira dizia "IA —": 54 dos 65 cartões gastavam 25px de altura para
 * mostrar um tracinho. Como chip, a informação continua na tela — vazio parece
 * cartão quebrado, tracinho diz "esta ainda não passou pela IA", e é isso que
 * faz a pessoa clicar em "Analisar todas" — mas sem uma fileira só para ela.
 *
 * Devolve um fragmento, e não um bloco: quem posiciona é a fileira de chips do
 * cartão, que já sabe quebrar linha.
 */
function ChipsIa(props: { item: Candidatura }) {
  const analise = props.item.analise;

  if (analise === null) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[0.7rem] text-white/85">
        <Sparkles size={11} aria-hidden="true" className="shrink-0" />
        <span aria-hidden="true">IA —</span>
        <span className="sr-only">Sem leitura da IA</span>
      </span>
    );
  }

  if (analise.erro.length > 0) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[0.7rem] font-semibold text-rose-800">
        <TriangleAlert size={11} aria-hidden="true" className="shrink-0" />A leitura falhou
      </span>
    );
  }

  const rec = recomendacaoPor(analise.recomendacao);

  return (
    <>
      <span
        role="img"
        aria-label={`Leitura da IA: ${analise.estrelas} de 5 estrelas`}
        className="flex shrink-0 items-center gap-0.5"
      >
        <Sparkles size={11} aria-hidden="true" className="mr-0.5 text-lime" />
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            size={10}
            strokeWidth={2}
            aria-hidden="true"
            fill={n <= analise.estrelas ? "currentColor" : "none"}
            className={n <= analise.estrelas ? "text-lime" : "text-white/25"}
          />
        ))}
      </span>
      <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${rec.pilulaEscura}`}>
        {rec.rotulo}
      </span>
      {/* As pílulas por gravidade saíram do cartão do kanban.
          Elas são ícone + número, sem legenda visível, e diziam a mesma coisa
          que a linha logo acima já diz em português ("14 dúvidas · 1
          importante"). Duas leituras do mesmo fato, uma delas ilegível para
          quem enxerga, é ruído. A quebra por gravidade continua inteira na
          gaveta, onde há espaço para nomear cada uma. */}
    </>
  );
}

/**
 * A ficha de entrevista no cartão, em um selo só.
 *
 * Discreto de propósito: quem varre a coluna com o olho precisa de duas
 * respostas — "já preparei a conversa desta pessoa?" e "esta já foi
 * entrevistada, e em quanto ficou?". Um ícone responde a primeira; o total
 * responde a segunda. Quem ainda não tem ficha não ganha selo nenhum: seria
 * ruído em cima do estado mais comum do painel.
 *
 * O total vai sem denominador porque o cartão não conhece o guia (é ele que diz
 * quanto vale o máximo), e um "38/0" inventado seria pior que o número puro. O
 * `/50` aparece na gaveta e no comparativo, onde o guia está em mãos.
 */
function SeloFicha(props: { item: Candidatura }) {
  const situacao = situacaoDaFicha(props.item.ficha);
  if (situacao === "sem" || situacao === "erro") return null;

  if (situacao === "concluida" && props.item.ficha !== null) {
    const { total } = totalDaFicha(props.item.ficha.notas);
    return (
      /* Fundo lime = fundo verde: o total vai branco. O selo continua verde na
         pastilha, no anel e no ícone — o que muda é só a letra. */
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-lime/15 px-2 py-0.5 text-[0.65rem] font-extrabold text-white ring-1 ring-lime/30">
        <ClipboardCheck size={11} aria-hidden="true" className="text-lime" />
        <span aria-hidden="true" className="tabular-nums">
          {total}
        </span>
        <span className="sr-only">Entrevista concluída, {total} pontos na ficha</span>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem] font-semibold text-white ring-1 ring-white/15">
      <ClipboardList size={11} aria-hidden="true" className="text-lime" />
      <span className="sr-only">
        {situacao === "preenchendo" ? "Ficha em preenchimento" : "Ficha de entrevista pronta"}
      </span>
      <span aria-hidden="true">Ficha</span>
    </span>
  );
}

/**
 * Pergunta sem resposta, no cartão do funil.
 *
 * Existe para uma cena específica: o RH arrastando gente de "entrevista" para
 * "proposta" numa tarde, olhando só para o cartão. Sem isto, a única forma de
 * saber que sobrou dúvida grave — o emprego curto que ninguém explicou, o
 * registro no conselho que ninguém conferiu — é abrir a gaveta de cada uma, e
 * ninguém abre quinze gavetas para mover cinco cartões. A pílula não julga a
 * candidata e não trava o arrasto: ela diz que ficou pergunta em aberto.
 *
 * Só aparece quando há dúvida IMPORTANTE (crítica ou alta) ainda não marcada
 * como "Convenceu". As outras não entram no cartão de propósito — 240px de
 * largura não comportam a lista inteira, e um selo que aparece em todo mundo
 * deixa de ser aviso e vira moldura.
 */
function SeloDuvidas(props: { item: Candidatura }) {
  const leituras = leiturasDeDuvidas(props.item.ficha);
  if (duvidasImportantesDe(props.item, leituras) === 0) return null;
  return <ResumoDuvidas item={props.item} leituras={leituras} />;
}

function CartaoCandidato(props: {
  item: Candidatura;
  agora: Date;
  arrastando: boolean;
  selecionada: boolean;
  aoAbrir: (id: string) => void;
  aoSelecionar: (id: string, marcada: boolean) => void;
  aoMoverStatus: (id: string, status: StatusCandidatura) => void;
  aoIniciarArrasto: (id: string) => void;
  aoTerminarArrasto: () => void;
}) {
  const { item } = props;
  const [menuAberto, setMenuAberto] = useState(false);
  const botaoMenuRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const idMenu = `${useId()}-mover`;

  // Abriu por teclado ou por clique, o foco vai para a primeira opção: um menu
  // que abre e deixa o foco para trás obriga a percorrer a página inteira de novo.
  useEffect(() => {
    if (!menuAberto) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [menuAberto]);

  const fecharMenu = (devolverFoco: boolean) => {
    setMenuAberto(false);
    if (devolverFoco) botaoMenuRef.current?.focus();
  };

  const etiquetasVisiveis = item.etiquetas.slice(0, 2);
  const restantes = item.etiquetas.length - etiquetasVisiveis.length;
  const subtitulo = item.vagaTitulo.trim() || item.cargoDesejado.trim() || "Candidatura espontânea";
  /** Sem texto: o atalho do cartão só abre a conversa. Ver o comentário abaixo. */
  const hrefWhats = linkWhatsapp(item.telefone, "");

  return (
    <article
      draggable
      data-arrastando={props.arrastando ? "true" : "false"}
      onDragStart={(e: DragEvent<HTMLElement>) => {
        // O id viaja no dataTransfer além do estado local porque é ele que
        // sobrevive ao arrasto entre colunas — o estado só cuida do visual.
        e.dataTransfer.setData("text/plain", item.id);
        e.dataTransfer.effectAllowed = "move";
        props.aoIniciarArrasto(item.id);
      }}
      onDragEnd={props.aoTerminarArrasto}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !menuAberto) return;
        // Para no cartão: mais acima, Escape é o atalho que fecha a gaveta.
        e.stopPropagation();
        fecharMenu(true);
      }}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setMenuAberto(false);
      }}
      /* A marca de selecionado não é só cor: além do anel lime, a própria
         caixa de seleção fica marcada e o contador da barra de lote sobe. */
      className={`rh-cartao-cand relative ${props.selecionada ? "ring-2 ring-lime" : ""}`}
    >
      <div className="flex items-start gap-2">
        {/* Caixa de seleção no lugar do avatar quando marcada não é opção: as
            duas coisas convivem, porque as iniciais são o que o RH usa para
            achar o cartão de relance. z-[2] para ficar acima do `.stretch-link`,
            que cobre o cartão inteiro — sem isso, marcar abriria a gaveta. */}
        <label className="relative z-[2] flex shrink-0 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={props.selecionada}
            onChange={(e) => props.aoSelecionar(item.id, e.target.checked)}
            className="h-5 w-5 shrink-0 accent-lime"
          />
          <span className="sr-only">Selecionar {item.nome || "candidatura sem nome"}</span>
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lime/15 text-xs font-extrabold text-white ring-1 ring-lime/25"
          >
            {iniciais(item.nome) || "?"}
          </span>
        </label>

        {/* `.stretch-link` estica o alvo deste botão por todo o cartão: clicar em
            qualquer canto abre a gaveta, mas quem recebe foco continua sendo um
            <button> de verdade, e não uma <div> clicável. */}
        <button
          type="button"
          onClick={() => props.aoAbrir(item.id)}
          className="stretch-link min-w-0 flex-1 text-left"
        >
          {/* Duas linhas, e NÃO `truncate`. Numa coluna de kanban com ~200px, cortar
     em uma linha virava "Silmara Ap…", "Be…", "Ra…" — o dado mais
     importante do cartão ilegível. Nome de gente não se abrevia. */}
          <span className="block text-sm font-bold leading-snug text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
            {item.nome || "Sem nome"}
          </span>
          <span className="mt-0.5 block truncate text-xs text-white/85">{subtitulo}</span>
        </button>
      </div>

      {/* A lista abre no fluxo do cartão, e não flutuando: o corpo da coluna tem
          `overflow-y: auto`, então uma lista em position absolute seria cortada
          pela borda da coluna assim que o cartão estivesse perto do rodapé.

          É `role="group"`, e não `role="menu"`: com `menuitem` o leitor de tela
          entra em modo de aplicação e passa a esperar navegação por setas, que
          esta lista não implementa — o comportamento real é o de botões comuns,
          alcançáveis por Tab. */}
      {menuAberto ? (
        <div
          ref={menuRef}
          id={idMenu}
          role="group"
          aria-label="Mover para"
          className="relative z-[2] mt-2 rounded-xl border border-lime/30 bg-brand-deep/95 p-1"
        >
          {STATUS.map((s) => {
            const atual = s.valor === item.status;
            return (
              <button
                key={s.valor}
                type="button"
                aria-current={atual ? "true" : undefined}
                onClick={() => {
                  if (atual) {
                    fecharMenu(true);
                    return;
                  }
                  // Fecha SEM devolver o foco ao botão do cartão: a mudança de
                  // status é otimista, o cartão é recriado dentro de outra
                  // coluna e esse botão deixa de existir — o foco cairia no
                  // <body>. Quem reposiciona o foco é o pai, na coluna destino.
                  fecharMenu(false);
                  props.aoMoverStatus(item.id, s.valor);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-xs font-medium text-white transition-colors hover:bg-white/10"
              >
                <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${s.ponto}`} />
                <span className="min-w-0 flex-1 truncate">{s.rotulo}</span>
                {atual ? (
                  <Check size={14} aria-hidden="true" className="shrink-0 text-lime" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* UMA fileira de chips, e não três.
          Área, nota do RH, leitura da IA, ficha, dúvidas e etiquetas eram três
          blocos empilhados com margem entre eles — 60px de altura para o que
          cabe numa linha e meia que quebra sozinha. Tudo aqui é do mesmo tipo
          (pastilha curta de estado), então tudo mora na mesma fileira. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-white ring-1 ring-white/15">
          {rotuloArea(item.area)}
        </span>
        <Estrelas nota={item.nota} />
        <ChipsIa item={item} />
        <SeloFicha item={item} />
        <SeloDuvidas item={item} />
        {item.arquivada ? (
          <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem] font-semibold text-white">
            <Archive size={10} aria-hidden="true" />
            Arquivada
          </span>
        ) : null}
        {etiquetasVisiveis.map((etiqueta) => (
          <span
            key={etiqueta}
            className="max-w-[9rem] truncate rounded-md bg-lime/10 px-1.5 py-0.5 text-[0.65rem] font-medium text-white ring-1 ring-lime/20"
          >
            {etiqueta}
          </span>
        ))}
        {restantes > 0 ? (
          <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-semibold text-white">
            +{restantes}
            <span className="sr-only"> outras etiquetas</span>
          </span>
        ) : null}
      </div>

      {/* O tempo relativo é a informação que o RH varre com o olho na coluna:
          branco de verdade, não branco esmaecido. */}
      {/* As duas ações moram aqui, e não ao lado do nome: na coluna estreita do
          kanban elas comiam a largura e obrigavam o nome a truncar. No rodapé
          não disputam espaço com nada. */}
      <footer className="mt-2 flex items-center justify-between gap-2 text-[0.7rem] text-white/85">
        <span>{tempoRelativo(item.criadoEm, props.agora)}</span>
        {item.curriculo ? (
          <span className="flex items-center gap-1 text-white">
            <Paperclip size={12} aria-hidden="true" className="text-lime" />
            <span className="sr-only">Currículo anexado</span>
            <span aria-hidden="true">CV</span>
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-1">
          {/* Atalho de WhatsApp: abre a conversa SEM mensagem pronta. É o gesto
            de "só quero falar rapidinho com ela", que na gaveta custa dois
            cliques a mais. Só ícone, sem preenchimento e sem cor forte, para
            não competir com abrir a ficha — que continua sendo o cartão
            inteiro. O texto pronto vive na central de contato, dentro da
            gaveta: um convite disparado daqui não teria o nome da vaga nem
            entraria no histórico dela. */}
          {hrefWhats === "" ? null : (
            <a
              href={hrefWhats}
              target="_blank"
              rel="noreferrer"
              aria-label={`Abrir conversa no WhatsApp com ${item.nome || "candidato"}`}
              onClick={(e) => e.stopPropagation()}
              className="rh-acao-cartao relative z-[2] flex shrink-0 items-center justify-center rounded-xl border border-white/15 text-white/85 transition-colors hover:border-lime/50 hover:text-white"
            >
              <MessageCircle size={16} aria-hidden="true" />
            </a>
          )}

          {/* Botão da lista "mover para". Ele existe por causa de quem não usa
            mouse: arrastar e soltar é gesto de ponteiro e a API nativa do HTML5
            não tem equivalente de teclado nenhum. Sem esta lista, teclado e leitor
            de tela não conseguiriam mudar o status de ninguém — o kanban seria
            decoração para essas pessoas. O z-[2] o mantém acima da camada do
            `.stretch-link`, que cobre o cartão inteiro. */}
          <button
            ref={botaoMenuRef}
            type="button"
            aria-controls={idMenu}
            aria-expanded={menuAberto}
            aria-label={`Mover ${primeiroNome(item.nome) || "candidato"} para outro status`}
            onClick={() => setMenuAberto((v) => !v)}
            className={`rh-acao-cartao relative z-[2] flex shrink-0 items-center justify-center rounded-xl border transition-colors ${
              menuAberto
                ? "border-lime bg-lime/20 text-lime"
                : "border-white/15 text-white/85 hover:border-lime/50 hover:text-lime"
            }`}
          >
            <MoveRight size={16} aria-hidden="true" />
          </button>
        </span>
      </footer>
    </article>
  );
}

export function Kanban(props: {
  itens: Candidatura[];
  agora: Date;
  /** Ids marcados para as ações em lote. Vive na rota: a tabela e o kanban
   *  compartilham a MESMA seleção, e trocar de visão não pode perdê-la. */
  selecionadas: string[];
  aoAbrir: (id: string) => void;
  aoSelecionar: (id: string, marcada: boolean) => void;
  aoMoverStatus: (id: string, status: StatusCandidatura) => void;
}) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colunaSobre, setColunaSobre] = useState<StatusCandidatura | null>(null);
  // Coluna que deve receber o foco depois de uma mudança feita pela lista do
  // cartão. Vira estado (e não um focus() no handler) porque o cartão só é
  // recriado na coluna destino no render seguinte.
  const [colunaFocada, setColunaFocada] = useState<StatusCandidatura | null>(null);
  /** Etapas vazias viram fita. Ligado por padrão — ver `.rh-coluna-trilho`. */
  const [recolherVazias, setRecolherVazias] = useState(true);
  /** Etapas vazias que o RH reabriu na mão, uma a uma. */
  const [reabertas, setReabertas] = useState<StatusCandidatura[]>([]);
  const base = useId();

  const refQuadro = useRef<HTMLDivElement>(null);
  const altura = useAlturaAteOFimDaJanela(refQuadro);

  useEffect(() => {
    if (colunaFocada === null) return;
    document.getElementById(`${base}-${colunaFocada}`)?.focus();
    setColunaFocada(null);
  }, [colunaFocada, base]);

  /** Caminho do teclado: move e leva o foco para o título da coluna de destino. */
  const moverPelaLista = (id: string, status: StatusCandidatura) => {
    props.aoMoverStatus(id, status);
    setColunaFocada(status);
  };

  const reabrir = useCallback((status: StatusCandidatura) => {
    setReabertas((atuais) => (atuais.includes(status) ? atuais : [...atuais, status]));
  }, []);

  const soltar = (e: DragEvent<HTMLElement>, status: StatusCandidatura) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || arrastando;
    setColunaSobre(null);
    setArrastando(null);
    if (!id) return;
    const item = props.itens.find((c) => c.id === id);
    // Soltar na própria coluna não é erro, mas também não é mudança: gravar aqui
    // geraria uma escrita em disco e um "atualizado agora" mentiroso.
    if (!item || item.status === status) return;
    props.aoMoverStatus(id, status);
  };

  const porColuna = STATUS.map((s) => ({
    etapa: s,
    daColuna: props.itens.filter((c) => c.status === s.valor),
  }));

  /* Com a lista inteira vazia (filtro que não achou ninguém, painel recém-aberto)
     NADA recolhe: oito fitas em fila não são um funil, são um código de barras —
     e é justamente a hora em que a frase "Nenhuma candidatura nova" precisa ser
     lida. Recolher só faz sentido quando há gente em alguma etapa. */
  const temGente = porColuna.some((c) => c.daColuna.length > 0);
  const eTrilho = (etapa: StatusCandidatura, quantas: number): boolean =>
    recolherVazias && temGente && quantas === 0 && !reabertas.includes(etapa);
  const recolhidas = porColuna.filter((c) => eTrilho(c.etapa.valor, c.daColuna.length)).length;

  return (
    <div className="jp-container flex flex-col py-4">
      {/* Uma linha de barra, e não duas: a instrução de arrasto encolheu para o
          que ela de fato ensina, e o controle das etapas vazias mora ao lado
          dela — é o mesmo assunto, "como este quadro está montado". */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-xs text-white/85">
          Arraste um cartão para outra coluna — ou use o botão de mover dentro dele.
        </p>

        {temGente ? (
          <button
            type="button"
            aria-pressed={!recolherVazias}
            onClick={() => {
              // Mostrar todas apaga as reaberturas manuais: sem isso, desligar e
              // religar o recolhimento deixaria de fora as que o RH abriu antes,
              // e o botão pareceria não fazer nada na segunda vez.
              setReabertas([]);
              setRecolherVazias((v) => !v);
            }}
            className="flex h-9 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-3 text-xs font-semibold text-white transition-colors hover:border-white/30"
          >
            <ChevronsLeftRight size={15} aria-hidden="true" className="text-lime" />
            {recolherVazias ? "Mostrar todas as etapas" : "Recolher etapas vazias"}
            {recolherVazias && recolhidas > 0 ? (
              <span className="rounded-full bg-lime px-1.5 py-0.5 text-[0.65rem] font-bold text-brand-deep">
                {recolhidas}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>

      <div
        ref={refQuadro}
        style={altura === "" ? undefined : { height: altura }}
        className="rh-quadro rh-scroll -mx-4 flex snap-x items-stretch gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0"
      >
        {porColuna.map(({ etapa: s, daColuna }) => {
          const idTitulo = `${base}-${s.valor}`;
          const alvo = colunaSobre === s.valor;
          const trilho = eTrilho(s.valor, daColuna.length);

          /* Os três manipuladores de arrasto são os MESMOS na fita e na coluna
             aberta: uma etapa recolhida continua sendo destino válido, senão
             recolher passaria a esconder caminho do funil em vez de só poupar
             largura. */
          const arrasto = {
            onDragOver: (e: DragEvent<HTMLElement>) => {
              // Sem o preventDefault o navegador recusa o soltar: por padrão
              // nenhum elemento é alvo válido de drop.
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (!alvo) setColunaSobre(s.valor);
            },
            onDragLeave: (e: DragEvent<HTMLElement>) => {
              // Sair para um filho ainda dispara dragleave na coluna; sem esta
              // checagem o realce piscaria a cada cartão sob o cursor.
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              setColunaSobre((atual) => (atual === s.valor ? null : atual));
            },
            onDrop: (e: DragEvent<HTMLElement>) => soltar(e, s.valor),
          };

          if (trilho) {
            return (
              <section
                key={s.valor}
                aria-labelledby={idTitulo}
                data-drop={alvo ? "true" : "false"}
                {...arrasto}
                className="rh-coluna rh-coluna-trilho snap-start"
              >
                <button
                  type="button"
                  aria-expanded={false}
                  onClick={() => reabrir(s.valor)}
                  className="rh-trilho-botao"
                >
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.ponto}`}
                  />
                  <span id={idTitulo} className="rh-trilho-rotulo text-white">
                    {s.rotulo}
                  </span>
                  <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-bold tabular-nums text-white">
                    0
                  </span>
                  {/* O nome de verdade do botão. O rótulo ali em cima está EM PÉ
                      e mesmo assim é lido normalmente — o que falta é dizer o
                      que o clique faz; sem esta linha ouvir-se-ia só
                      "Entrevista, 0, botão". */}
                  <span className="sr-only">
                    Abrir a coluna {s.rotulo}, que está vazia e recolhida
                  </span>
                </button>
              </section>
            );
          }

          return (
            <section
              key={s.valor}
              aria-labelledby={idTitulo}
              data-drop={alvo ? "true" : "false"}
              {...arrasto}
              className="rh-coluna snap-start"
            >
              <header className="rh-coluna-topo">
                <h3
                  id={idTitulo}
                  // Alvo de foco depois de mover um cartão pela lista: é o
                  // ponto estável mais próximo do cartão que acabou de chegar.
                  tabIndex={-1}
                  className="flex min-w-0 items-center gap-2 text-sm font-bold text-white outline-none"
                >
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.ponto}`}
                  />
                  <span className="truncate">{s.rotulo}</span>
                </h3>
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold tabular-nums text-white">
                  {daColuna.length}
                  <span className="sr-only">
                    {daColuna.length === 1 ? " candidatura" : " candidaturas"}
                  </span>
                </span>
              </header>

              <div className="rh-coluna-corpo rh-scroll">
                {daColuna.length === 0 ? (
                  <p className="rh-coluna-vazia rounded-xl border border-dashed border-white/25 px-3 py-6 text-center text-xs leading-relaxed text-white/85">
                    {/* `s.vazio` em vez de compor `Ninguém em ${s.rotulo}`:
                        metade dos rótulos já traz preposição ("Em triagem") ou
                        pede contração ("no Banco de talentos"), e "Ninguém em
                        Não seguiu" não é frase nenhuma. A frase de arrasto é a
                        única que pode citar o rótulo, porque o cita entre aspas
                        como nome de destino. */}
                    {arrastando ? `Solte aqui para mover para “${s.rotulo}”` : `${s.vazio}.`}
                  </p>
                ) : (
                  daColuna.map((item) => (
                    <CartaoCandidato
                      key={item.id}
                      item={item}
                      agora={props.agora}
                      arrastando={arrastando === item.id}
                      selecionada={props.selecionadas.includes(item.id)}
                      aoSelecionar={props.aoSelecionar}
                      aoAbrir={props.aoAbrir}
                      aoMoverStatus={moverPelaLista}
                      aoIniciarArrasto={setArrastando}
                      aoTerminarArrasto={() => {
                        setArrastando(null);
                        setColunaSobre(null);
                      }}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
