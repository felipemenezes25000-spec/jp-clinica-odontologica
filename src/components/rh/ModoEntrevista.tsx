/**
 * Modo entrevista — a tela cheia que fica aberta com a candidata sentada na
 * frente.
 *
 * Isto não é uma tela de leitura, é uma tela de USO: o entrevistador olha para
 * ela de relance, no meio de uma conversa, enquanto escreve. Daí tudo o que
 * parece exagero e não é — fonte maior, alvo grande no dedo e no mouse, um
 * assunto por passo, nada piscando. O que atrapalha aqui não é feio, é caro:
 * um clique errado no meio da resposta faz a pessoa perder o fio.
 *
 * A ordem dos cinco passos é a ordem do guia da clínica, e não uma invenção
 * nossa: confirmar a triagem objetiva ANTES de aprofundar (é o que o PDF manda
 * fazer primeiro), depois as 15 perguntas que se faz com todas — é isso que
 * torna as candidatas comparáveis —, depois as 4 que só existem por causa
 * daquele currículo, depois a pontuação de 0 a 5 com evidência, e por fim o
 * fechamento com impressão, decisão e os quatro resumos.
 *
 * Duas travas éticas moram aqui:
 *  - a nota ética do guia fica fixa no rodapé, sempre visível, porque é durante
 *    a conversa que a pergunta proibida escapa — não depois;
 *  - o que a IA sugeriu aparece marcado como sugestão e NÃO entra no total
 *    enquanto um humano não confirmar. A folha que decide contratação não pode
 *    somar um palpite de máquina como se fosse observação de quem estava lá.
 *
 * Cor: o fundo é o verde profundo da clínica, então toda letra aqui é branca —
 * e o texto de apoio não desce de 85% de opacidade. Não é preciosismo: esta tela
 * é lida de relance, de lado, com uma pessoa esperando resposta, muitas vezes num
 * monitor de recepção com brilho baixo. Cinza claro sobre verde some. O lime
 * continua onde não é letra: ícone, borda, anel, régua de nota.
 *
 * Nada de `new Date()` no render: `agora` desce por prop, congelado pela rota.
 * O cronômetro conta segundos a partir da montagem, num efeito — nunca a partir
 * de um relógio lido durante a renderização.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Check,
  ClipboardCheck,
  Flag,
  ListChecks,
  LoaderCircle,
  MessageCircleQuestion,
  MessagesSquare,
  Phone,
  Save,
  Search,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { PainelDuvidas, ResumoDuvidas } from "@/components/rh/PainelDuvidas";
import { duvidasImportantesDe } from "@/lib/rh/duvidas";
import { apenasDigitos, mascararTelefone } from "@/lib/rh/formatar";
import {
  DECISOES,
  fichaVazia,
  IMPRESSOES,
  RESPOSTAS_TRIAGEM,
  comLeituraDeDuvida,
  comNota,
  comRespostaDeDuvida,
  comRespostaDePergunta,
  comRespostaDeTriagem,
  comSinal,
  leiturasDeDuvidas,
  notaDaFicha,
  notaSugeridaPara,
  partesDoEntrevistador,
  respostaDaPergunta,
  respostaDaTriagem,
  respostasDeDuvidas,
  totalDaFicha,
} from "@/lib/rh/ficha";
import type { FichaEntrevista, RespostaTriagem } from "@/lib/rh/ficha";
import { totalPossivel } from "@/lib/rh/guia";
import type { GuiaEntrevista } from "@/lib/rh/guia";
import type { Candidatura } from "@/lib/rh/tipos";

/* -------------------------------------------------------------------------- */
/* Constantes                                                                 */
/* -------------------------------------------------------------------------- */

/* Branco, e não lime: sobre verde a letra é branca. */
const ROTULO = "text-[0.7rem] font-bold uppercase tracking-[0.14em] text-white";

const BOTAO =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold ring-1 transition";
const BOTAO_PRINCIPAL = `${BOTAO} bg-lime text-brand-deep ring-lime hover:bg-lime/85`;
const BOTAO_SECUNDARIO = `${BOTAO} bg-white/10 text-white ring-white/20 hover:bg-white/20`;

/* Campo escuro em corpo maior que o da gaveta: aqui se digita olhando para a
   pessoa, não para a tela. A métrica de raio e respiro é a de `.rh-campo`. */
const CAMPO =
  "block w-full min-h-12 rounded-xl border border-white/15 bg-white/[0.07] px-3.5 py-2.5 " +
  "text-base leading-relaxed text-white placeholder:text-white/85 transition-colors " +
  "hover:border-white/30 focus:border-lime";

/** Igual ao da gaveta: a anotação sobe por pausa, nunca por tecla. */
const ESPERA_SALVAR = 1200;

/** Alvos de tabulação, para a armadilha de foco. Mesma lista da gaveta. */
const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type ChavePasso = "abertura" | "gerais" | "especificas" | "duvidas" | "pontuacao" | "fechamento";

/**
 * "O que perguntar" entra ENTRE as perguntas do currículo e a pontuação, e o
 * lugar não é arbitrário: as perguntas do passo anterior são as que a clínica
 * faz para conhecer a pessoa; estas são as que existem porque alguma coisa no
 * currículo não fecha. Perguntar isso depois de pontuar seria pontuar sem
 * saber, e perguntar antes das gerais abriria a conversa por uma cobrança.
 */
const PASSOS: { chave: ChavePasso; rotulo: string; icone: LucideIcon }[] = [
  { chave: "abertura", rotulo: "Abertura", icone: UserRound },
  { chave: "gerais", rotulo: "Perguntas gerais", icone: MessagesSquare },
  { chave: "especificas", rotulo: "Do currículo", icone: Search },
  /* O rótulo do passo NÃO repete o título do painel ("O que perguntar"): o
     cabeçalho fixo desta tela e o cabeçalho do bloco ficam a dois centímetros um
     do outro, e duas vezes a mesma frase lê como defeito de montagem. Aqui o
     passo diz o que é, e o painel logo abaixo diz o que fazer. */
  { chave: "duvidas", rotulo: "Dúvidas em aberto", icone: MessageCircleQuestion },
  { chave: "pontuacao", rotulo: "Pontuação", icone: ListChecks },
  { chave: "fechamento", rotulo: "Fechamento", icone: Flag },
];

/* -------------------------------------------------------------------------- */
/* Helpers puros                                                              */
/* -------------------------------------------------------------------------- */

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** "AAAA-MM-DD" no fuso de quem está na sala — `toISOString` daria o dia em UTC. */
function paraCampoData(d: Date): string {
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}

function paraCampoHora(d: Date): string {
  return `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}

/** Cronômetro: "07:12" e, passada uma hora, "1:07:12". */
function duracao(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  return h > 0 ? `${h}:${doisDigitos(m)}:${doisDigitos(s)}` : `${doisDigitos(m)}:${doisDigitos(s)}`;
}

/**
 * A ficha com que a tela abre.
 *
 * Data, horário e entrevistadores já vêm preenchidos porque ninguém quer
 * digitar cabeçalho com a candidata esperando — e os três ficam editáveis no
 * primeiro passo justamente porque `agora` é o instante em que a rota carregou,
 * não o instante em que a entrevista começou. O painel aberto desde as 8h
 * sugeriria 8h a uma conversa das 14h; corrigir é um toque, e ler um relógio no
 * render quebraria a hidratação.
 */
function fichaInicial(item: Candidatura, guia: GuiaEntrevista, agora: Date): FichaEntrevista {
  const base = item.ficha ?? fichaVazia();
  return {
    ...base,
    entrevistaEm: base.entrevistaEm === "" ? paraCampoData(agora) : base.entrevistaEm,
    horario: base.horario === "" ? paraCampoHora(agora) : base.horario,
    entrevistadores:
      base.entrevistadores.trim() === "" ? guia.entrevistadores : base.entrevistadores,
  };
}

/* -------------------------------------------------------------------------- */
/* Peças                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Textarea que cresce com o texto.
 *
 * Barra de rolagem dentro de um campo de anotação é a pior coisa possível aqui:
 * quem está conversando não vê o que escreveu duas frases atrás, e não vai
 * parar a entrevista para rolar. A altura é recalculada a cada mudança de valor.
 */
function CampoAnotacao(props: {
  id: string;
  valor: string;
  aoMudar: (valor: string) => void;
  aoSair: () => void;
  rotulo: string;
  placeholder?: string;
  linhas?: number;
}) {
  const { id, valor, aoMudar, aoSair, rotulo, placeholder = "anote aqui…", linhas = 2 } = props;
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // "auto" antes de medir: sem isso a caixa só cresce, nunca encolhe quando o
    // texto é apagado.
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [valor]);

  return (
    <>
      <label htmlFor={id} className="sr-only">
        {rotulo}
      </label>
      <textarea
        id={id}
        ref={ref}
        rows={linhas}
        value={valor}
        placeholder={placeholder}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => aoMudar(e.target.value)}
        onBlur={aoSair}
        className={`${CAMPO} resize-none overflow-hidden`}
      />
    </>
  );
}

/** Grupo de pílulas grandes (Sim/Não/Parcial, Impressão, Decisão). */
function Escolha<T extends string>(props: {
  legenda: string;
  opcoes: { valor: T; rotulo: string }[];
  valor: T;
  aoEscolher: (valor: T) => void;
}) {
  const { legenda, opcoes, valor, aoEscolher } = props;
  return (
    <div role="group" aria-label={legenda} className="flex flex-wrap gap-2">
      {opcoes.map((o) => {
        const ativo = valor === o.valor;
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={ativo}
            // Clicar no que já está marcado desmarca: "ainda não avaliei" é um
            // estado legítimo, e diferente de "avaliei e foi fraca".
            onClick={() => aoEscolher(ativo ? ("" as T) : o.valor)}
            className={`inline-flex min-h-12 items-center justify-center rounded-full px-6 text-base font-bold ring-1 transition ${
              ativo
                ? "bg-lime text-brand-deep ring-lime"
                : "bg-white/10 text-white ring-white/20 hover:bg-white/20"
            }`}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A régua de 0 a `maximo` de um critério.
 *
 * `sugerida` é a nota que a IA propôs e que ninguém confirmou ainda: ela
 * aparece com anel tracejado, nunca preenchida, e não entra no total. É a
 * diferença entre "o currículo indica 4" e "nós avaliamos 4" — e essa folha vai
 * para a mesa onde se decide contratação.
 *
 * O grupo também escuta o teclado numérico: com o foco em qualquer botão da
 * linha, digitar 0 a 5 marca a nota. É como se pontua rápido enquanto se ouve.
 */
function BotoesNota(props: {
  legenda: string;
  valor: number | null;
  sugerida: number | null;
  maximo: number;
  aoEscolher: (nota: number | null) => void;
}) {
  const { legenda, valor, sugerida, maximo, aoEscolher } = props;
  const notas = Array.from({ length: maximo + 1 }, (_, i) => i);

  return (
    <div
      role="group"
      aria-label={legenda}
      onKeyDown={(e) => {
        if (e.key.length !== 1) return;
        const n = Number(e.key);
        if (!Number.isInteger(n) || n < 0 || n > maximo) return;
        e.preventDefault();
        aoEscolher(n);
      }}
      className="flex flex-wrap gap-1.5"
    >
      {notas.map((n) => {
        const ativo = valor === n;
        const proposta = valor === null && sugerida === n;
        return (
          <button
            key={n}
            type="button"
            aria-pressed={ativo}
            aria-label={`${legenda}: nota ${n}${proposta ? " (sugestão da IA, ainda não confirmada)" : ""}`}
            onClick={() => aoEscolher(ativo ? null : n)}
            className={[
              "inline-flex h-12 w-12 items-center justify-center rounded-xl text-lg font-extrabold tabular-nums transition",
              ativo
                ? "bg-lime text-brand-deep ring-1 ring-lime"
                : proposta
                  ? // Tracejado, e não preenchido: a diferença entre "o
                    // currículo indica 4" e "nós avaliamos 4" precisa ser
                    // visível de longe, inclusive para quem só olha a forma.
                    "border-2 border-dashed border-lime/70 bg-lime/10 text-white"
                  : "bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20",
            ].join(" ")}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

/** Uma pergunta com a caixa de anotação embaixo. Serve aos passos 2 e 3. */
function Pergunta(props: {
  numero: number;
  pergunta: string;
  porque?: string;
  id: string;
  valor: string;
  aoMudar: (valor: string) => void;
  aoSair: () => void;
}) {
  const { numero, pergunta, porque = "", id, valor, aoMudar, aoSair } = props;
  return (
    <li className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10">
      <div className="flex gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lime/15 text-sm font-extrabold tabular-nums text-white ring-1 ring-lime/30">
          {numero}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-relaxed text-white sm:text-lg">
            {pergunta}
          </p>
          {porque.trim() === "" ? null : (
            <p className="mt-1 text-sm leading-relaxed text-white/85">para saber: {porque}</p>
          )}
          <div className="mt-3">
            <CampoAnotacao
              id={id}
              rotulo={`Anotação: ${pergunta}`}
              valor={valor}
              aoMudar={aoMudar}
              aoSair={aoSair}
            />
          </div>
        </div>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Componente público                                                         */
/* -------------------------------------------------------------------------- */

export function ModoEntrevista(props: {
  item: Candidatura;
  guia: GuiaEntrevista;
  agora: Date;
  salvando: boolean;
  aoFechar: () => void;
  aoSalvar: (ficha: FichaEntrevista) => void;
}) {
  const { item, guia, agora, salvando, aoFechar, aoSalvar } = props;
  const uid = useId();
  const idTitulo = `${uid}-titulo`;

  const [rascunho, setRascunho] = useState<FichaEntrevista>(() => fichaInicial(item, guia, agora));
  const [passo, setPasso] = useState(0);
  const [segundos, setSegundos] = useState(0);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  /* O mesmo "tem coisa não salva" mora em dois lugares de propósito: no `ref`,
     porque o ouvinte de Escape é registrado uma vez e leria um `state`
     congelado; e no `state`, porque o rodapé precisa redesenhar quando ele
     muda. Ref lido no render não redesenha nada. */
  const [sujo, setSujo] = useState(false);

  const refCaixa = useRef<HTMLDivElement | null>(null);
  const refCorpo = useRef<HTMLElement | null>(null);
  const refContinuar = useRef<HTMLButtonElement | null>(null);

  /* Mesmo carimbo de ordem da gaveta: enquanto a edição local não foi
     confirmada por um salvamento que terminou, a tela é dona do texto e ignora
     o que volta do servidor — é aí que a resposta atrasada de um POST anterior
     chegaria por cima do que a pessoa acabou de escrever. */
  const refSujo = useRef(false);
  const refSeq = useRef(0);
  const refEnviado = useRef(0);
  const refTempo = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refPendente = useRef<FichaEntrevista | null>(null);
  const refDespachar = useRef<(f: FichaEntrevista) => void>(() => {});
  const refSalvandoAntes = useRef(salvando);
  const refFechar = useRef(aoFechar);

  useEffect(() => {
    refFechar.current = aoFechar;
  }, [aoFechar]);

  useEffect(() => {
    if (refSujo.current || salvando) return;
    setRascunho(fichaInicial(item, guia, agora));
  }, [item, guia, agora, salvando]);

  useEffect(() => {
    if (refSalvandoAntes.current && !salvando && refSeq.current === refEnviado.current) {
      refSujo.current = false;
      setSujo(false);
    }
    refSalvandoAntes.current = salvando;
  }, [salvando]);

  /* ------------------------------------------------------------ cronômetro */

  useEffect(() => {
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  /* ------------------------------------------------------ diálogo modal */

  /**
   * Comportamento de diálogo, igual ao da gaveta: o foco entra na abertura, Tab
   * circula só aqui dentro, a rolagem do fundo trava e o foco volta para quem
   * abriu. A diferença é o Escape, que aqui pergunta antes de sair quando há
   * anotação ainda não salva — sair de uma entrevista por engano e perder o que
   * foi escrito é o pior desfecho possível desta tela.
   */
  useEffect(() => {
    const caixa = refCaixa.current;
    if (!caixa) return;

    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    caixa.focus();

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        // Impede que a gaveta por baixo também reaja e feche junto.
        e.stopPropagation();
        if (refSujo.current || refPendente.current !== null) setConfirmandoSaida(true);
        else refFechar.current();
        return;
      }
      if (e.key !== "Tab") return;

      const alvos = Array.from(caixa.querySelectorAll<HTMLElement>(FOCAVEIS)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      const primeiro = alvos[0];
      const ultimo = alvos[alvos.length - 1];
      if (!primeiro || !ultimo) {
        e.preventDefault();
        caixa.focus();
        return;
      }

      const ativo = document.activeElement;
      const fora = !caixa.contains(ativo);
      const naCaixa = ativo === caixa;
      if (e.shiftKey && (ativo === primeiro || fora || naCaixa)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (ativo === ultimo || fora)) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener("keydown", tecla, true);

    return () => {
      document.removeEventListener("keydown", tecla, true);
      document.body.style.overflow = overflowAnterior;
      if (anterior && anterior.isConnected) anterior.focus();
    };
  }, []);

  // O passo troca a tela inteira: quem rolou até o fim do anterior precisa
  // começar o novo do começo, senão parece que a tela não mudou.
  useEffect(() => {
    refCorpo.current?.scrollTo({ top: 0 });
  }, [passo]);

  // Na confirmação de saída o foco vai para "Continuar entrevista": o passo
  // seguro é o padrão, e a tecla que vinha descendo não cai no descarte.
  useEffect(() => {
    if (confirmandoSaida) refContinuar.current?.focus();
  }, [confirmandoSaida]);

  /* ------------------------------------------------------------ salvamento */

  function despachar(f: FichaEntrevista) {
    if (refTempo.current !== null) {
      clearTimeout(refTempo.current);
      refTempo.current = null;
    }
    refPendente.current = null;
    refEnviado.current = refSeq.current;
    // Base do servidor + metade humana daqui: uma regeração que tenha
    // acontecido no meio da conversa continua valendo para o texto da IA.
    aoSalvar({ ...(item.ficha ?? fichaVazia()), ...partesDoEntrevistador(f) });
  }

  useEffect(() => {
    refDespachar.current = despachar;
  });

  function editar(f: FichaEntrevista, imediato: boolean) {
    refSeq.current += 1;
    refSujo.current = true;
    setSujo(true);
    setRascunho(f);
    if (refTempo.current !== null) clearTimeout(refTempo.current);
    if (imediato) {
      despachar(f);
      return;
    }
    refPendente.current = f;
    refTempo.current = setTimeout(() => despachar(f), ESPERA_SALVAR);
  }

  function salvarPendente() {
    const pendente = refPendente.current;
    if (pendente !== null) despachar(pendente);
  }

  // Se a tela sair com um debounce em voo (fechar, recarregar, navegar), o que
  // estava para subir sobe agora.
  useEffect(() => {
    return () => {
      if (refTempo.current !== null) clearTimeout(refTempo.current);
      const pendente = refPendente.current;
      if (pendente !== null) refDespachar.current(pendente);
    };
  }, []);

  function tentarFechar() {
    if (refSujo.current || refPendente.current !== null) {
      setConfirmandoSaida(true);
      return;
    }
    aoFechar();
  }

  function salvarEEncerrar() {
    despachar(rascunho);
    aoFechar();
  }

  /* --------------------------------------------------------------- dados */

  const nome = item.nome.trim() === "" ? "Candidatura sem nome" : item.nome;
  const digitos = apenasDigitos(item.telefone);
  const { total, avaliados } = totalDaFicha(rascunho.notas);
  const maximo = totalPossivel(guia);
  const porConfirmar = guia.criterios.filter((c) => {
    const n = notaDaFicha(rascunho, c.chave);
    return (n === null || n.nota === null) && notaSugeridaPara(rascunho, c.chave) !== null;
  }).length;
  const atual = PASSOS[passo] ?? PASSOS[0];
  const ultimo = passo === PASSOS.length - 1;

  /* ------------------------------------------------------------ os passos */

  function conteudo(chave: ChavePasso) {
    if (chave === "abertura") {
      return (
        <div className="space-y-5">
          <section className="rounded-2xl bg-white/[0.05] p-4 ring-1 ring-white/10">
            <h2 className="font-display text-2xl font-extrabold leading-tight text-white">
              {nome}
            </h2>
            <p className="mt-1 text-sm text-white/85">
              {item.vagaTitulo.trim() === "" ? "Candidatura espontânea" : item.vagaTitulo}
              {item.protocolo === "" ? "" : ` · protocolo ${item.protocolo}`}
            </p>
            {digitos === "" ? null : (
              <a
                href={`tel:+55${digitos}`}
                className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-full bg-white/10 px-4 text-base font-bold text-white ring-1 ring-white/20 hover:bg-white/20"
              >
                <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                {mascararTelefone(item.telefone)}
              </a>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor={`${uid}-data`} className={ROTULO}>
                  Data
                </label>
                <input
                  id={`${uid}-data`}
                  type="date"
                  value={rascunho.entrevistaEm}
                  onChange={(e) => editar({ ...rascunho, entrevistaEm: e.target.value }, false)}
                  onBlur={salvarPendente}
                  className={`${CAMPO} mt-1.5`}
                />
              </div>
              <div>
                <label htmlFor={`${uid}-hora`} className={ROTULO}>
                  Horário
                </label>
                <input
                  id={`${uid}-hora`}
                  type="time"
                  value={rascunho.horario}
                  onChange={(e) => editar({ ...rascunho, horario: e.target.value }, false)}
                  onBlur={salvarPendente}
                  className={`${CAMPO} mt-1.5`}
                />
              </div>
              <div>
                <label htmlFor={`${uid}-quem`} className={ROTULO}>
                  Entrevistadores
                </label>
                <input
                  id={`${uid}-quem`}
                  type="text"
                  value={rascunho.entrevistadores}
                  onChange={(e) => editar({ ...rascunho, entrevistadores: e.target.value }, false)}
                  onBlur={salvarPendente}
                  className={`${CAMPO} mt-1.5`}
                />
              </div>
            </div>
          </section>

          {rascunho.pontoForte.trim() === "" ? null : (
            <section className="rounded-2xl border-l-4 border-lime bg-white/[0.05] p-4">
              <h3 className={ROTULO}>Ponto forte</h3>
              <p className="mt-2 text-base leading-relaxed text-white/90">{rascunho.pontoForte}</p>
            </section>
          )}
          {rascunho.oQueValidar.trim() === "" ? null : (
            <section className="rounded-2xl border-l-4 border-amber-300 bg-white/[0.05] p-4">
              <h3 className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-amber-200">
                O que validar
              </h3>
              <p className="mt-2 text-base leading-relaxed text-white/90">{rascunho.oQueValidar}</p>
            </section>
          )}

          <section>
            <h3 className={ROTULO}>Triagem objetiva</h3>
            <p className="mt-1 text-sm leading-relaxed text-white/85">
              Confirme os quatro antes de aprofundar. Se a resposta vier errada aqui, não adianta
              seguir para as perguntas abertas.
            </p>

            {rascunho.triagem.length === 0 ? (
              <p className="mt-3 rounded-2xl bg-white/[0.04] p-4 text-sm text-white/85 ring-1 ring-white/10">
                Esta ficha ainda não tem triagem objetiva. Prepare a ficha na gaveta da candidata
                para o sistema montar os quatro itens a partir do currículo dela.
              </p>
            ) : (
              <ol className="mt-3 space-y-4">
                {rascunho.triagem.map((t, i) => {
                  const r = respostaDaTriagem(rascunho, t.pergunta);
                  return (
                    <li
                      key={t.pergunta}
                      className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10"
                    >
                      <p className="text-base font-semibold leading-relaxed text-white sm:text-lg">
                        <span className="mr-2 font-extrabold tabular-nums text-white">
                          {i + 1}.
                        </span>
                        {t.pergunta}
                      </p>
                      {t.porque.trim() === "" ? null : (
                        <p className="mt-1 text-sm leading-relaxed text-white/85">{t.porque}</p>
                      )}
                      <div className="mt-3">
                        <Escolha<RespostaTriagem>
                          legenda={`Resposta: ${t.pergunta}`}
                          opcoes={RESPOSTAS_TRIAGEM}
                          valor={r?.resposta ?? ""}
                          aoEscolher={(valor) =>
                            editar(
                              comRespostaDeTriagem(rascunho, t.pergunta, { resposta: valor }),
                              true,
                            )
                          }
                        />
                      </div>
                      <div className="mt-3">
                        <CampoAnotacao
                          id={`${uid}-tri-${i}`}
                          rotulo={`Observação: ${t.pergunta}`}
                          valor={r?.observacao ?? ""}
                          placeholder="o que ela respondeu…"
                          aoMudar={(valor) =>
                            editar(
                              comRespostaDeTriagem(rascunho, t.pergunta, { observacao: valor }),
                              false,
                            )
                          }
                          aoSair={salvarPendente}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      );
    }

    if (chave === "gerais") {
      return (
        <div>
          <p className="text-sm leading-relaxed text-white/85">
            As mesmas perguntas, na mesma ordem, com todas as candidatas — é isso que permite
            comparar evidência com evidência no fim, em vez de impressão com impressão.
          </p>
          <ol className="mt-4 space-y-4">
            {guia.perguntasGerais.map((p, i) => (
              <Pergunta
                key={p}
                numero={i + 1}
                pergunta={p}
                id={`${uid}-geral-${i}`}
                valor={respostaDaPergunta(rascunho, p)?.resposta ?? ""}
                aoMudar={(valor) => editar(comRespostaDePergunta(rascunho, p, valor), false)}
                aoSair={salvarPendente}
              />
            ))}
          </ol>
        </div>
      );
    }

    if (chave === "especificas") {
      if (rascunho.perguntasEspecificas.length === 0) {
        return (
          <p className="rounded-2xl bg-white/[0.04] p-4 text-sm leading-relaxed text-white/85 ring-1 ring-white/10">
            Esta ficha ainda não tem as perguntas do currículo. Prepare a ficha na gaveta da
            candidata: elas saem do que este currículo específico não prova.
          </p>
        );
      }
      return (
        <div>
          <p className="text-sm leading-relaxed text-white/85">
            Estas quatro existem por causa deste currículo, e só dele.
          </p>
          <ol className="mt-4 space-y-4">
            {rascunho.perguntasEspecificas.map((p, i) => (
              <Pergunta
                key={p.pergunta}
                numero={i + 1}
                pergunta={p.pergunta}
                porque={p.porque}
                id={`${uid}-esp-${i}`}
                valor={respostaDaPergunta(rascunho, p.pergunta)?.resposta ?? ""}
                aoMudar={(valor) =>
                  editar(comRespostaDePergunta(rascunho, p.pergunta, valor), false)
                }
                aoSair={salvarPendente}
              />
            ))}
          </ol>
        </div>
      );
    }

    if (chave === "duvidas") {
      return (
        <div>
          {/* Aqui NÃO é somente leitura: este é o momento em que a resposta
              existe. Marcar durante a conversa, e não depois, é o que faz o
              registro valer alguma coisa — quinze minutos depois já virou
              memória, e memória é onde a impressão geral come o fato. */}
          <PainelDuvidas
            item={item}
            leituras={leiturasDeDuvidas(rascunho)}
            respostas={respostasDeDuvidas(rascunho)}
            aoMudarLeitura={(id, leitura) =>
              editar(comLeituraDeDuvida(rascunho, id, leitura), true)
            }
            aoMudarResposta={(id, texto) => editar(comRespostaDeDuvida(rascunho, id, texto), false)}
          />
        </div>
      );
    }

    if (chave === "pontuacao") {
      return (
        <div className="space-y-5">
          <ol className="space-y-4">
            {guia.criterios.map((c, i) => {
              const n = notaDaFicha(rascunho, c.chave);
              const sugerida = notaSugeridaPara(rascunho, c.chave);
              return (
                <li key={c.chave} className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3 className="text-base font-bold text-white sm:text-lg">
                      <span className="mr-2 font-extrabold tabular-nums text-white">{i + 1}.</span>
                      {c.rotulo}
                    </h3>
                    <p className="text-sm font-extrabold tabular-nums text-white">
                      {n === null || n.nota === null ? "—" : `${n.nota}/${guia.notaMaxima}`}
                    </p>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-white/85">{c.descricao}</p>

                  {c.soNaEntrevista ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-100 ring-1 ring-amber-200/30">
                      <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      só você pode avaliar isto
                    </p>
                  ) : sugerida !== null && (n === null || n.nota === null) ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-lime/10 px-3 py-1 text-xs font-bold text-white ring-1 ring-lime/30">
                      sugestão da IA: {sugerida.nota} — confirme
                    </p>
                  ) : null}

                  {sugerida !== null && sugerida.evidencia.trim() !== "" ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-white/85">
                      {sugerida.evidencia}
                    </p>
                  ) : null}

                  <div className="mt-3">
                    <BotoesNota
                      legenda={c.rotulo}
                      valor={n?.nota ?? null}
                      // A sugestão só aparece pré-marcada onde a IA tinha
                      // direito de opinar. Nos critérios de conversa a régua
                      // nasce vazia, de propósito.
                      sugerida={c.soNaEntrevista ? null : (sugerida?.nota ?? null)}
                      maximo={guia.notaMaxima}
                      aoEscolher={(nota) => editar(comNota(rascunho, c.chave, { nota }), true)}
                    />
                  </div>

                  <div className="mt-3">
                    <CampoAnotacao
                      id={`${uid}-ev-${i}`}
                      rotulo={`Evidência: ${c.rotulo}`}
                      valor={n?.evidencia ?? ""}
                      placeholder="a evidência concreta que sustenta esta nota…"
                      linhas={1}
                      aoMudar={(valor) =>
                        editar(comNota(rascunho, c.chave, { evidencia: valor }), false)
                      }
                      aoSair={salvarPendente}
                    />
                  </div>
                </li>
              );
            })}
          </ol>

          {guia.sinaisObservacao.length === 0 ? null : (
            <section className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10">
              <h3 className={ROTULO}>Sinais observados na conversa</h3>
              <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                {guia.sinaisObservacao.map((s) => {
                  const marcado = rascunho.sinaisObservados.includes(s);
                  return (
                    <li key={s}>
                      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 text-base leading-snug text-white hover:bg-white/5">
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={(e) => editar(comSinal(rascunho, s, e.target.checked), true)}
                          className="h-6 w-6 shrink-0 accent-lime"
                        />
                        <span className="min-w-0">{s}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <section>
          <h3 className={ROTULO}>Impressão</h3>
          <div className="mt-2">
            <Escolha
              legenda="Impressão geral"
              opcoes={IMPRESSOES}
              valor={rascunho.impressao}
              aoEscolher={(valor) => editar({ ...rascunho, impressao: valor }, true)}
            />
          </div>
        </section>

        <section>
          <h3 className={ROTULO}>Decisão</h3>
          <div className="mt-2">
            <Escolha
              legenda="Decisão"
              opcoes={DECISOES}
              valor={rascunho.decisao}
              aoEscolher={(valor) => editar({ ...rascunho, decisao: valor }, true)}
            />
          </div>

          {/* O saldo do roteiro fica colado na decisão de propósito.
              Uma entrevista termina bem quase sempre — a pessoa foi simpática, a
              conversa fluiu —, e é exatamente aí que a dúvida grave que ficou
              sem resposta some da cabeça de quem vai escrever "recomendo". Isto
              não trava nada e não opina sobre a candidata: repete o que o
              próprio entrevistador marcou, no instante em que ele decide. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ResumoDuvidas item={item} leituras={leiturasDeDuvidas(rascunho)} />
            <button
              type="button"
              onClick={() => setPasso(PASSOS.findIndex((p) => p.chave === "duvidas"))}
              className="min-h-11 rounded-full px-3 text-xs font-bold text-white underline underline-offset-4 hover:text-white"
            >
              rever o roteiro
            </button>
          </div>

          {duvidasImportantesDe(item, leiturasDeDuvidas(rascunho)) > 0 ? (
            <p className="mt-2 flex items-start gap-2 rounded-xl bg-rose-300/15 px-3 py-2.5 text-sm font-semibold leading-relaxed text-white ring-1 ring-rose-200/45">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-200" aria-hidden="true" />
              <span>
                Ficou dúvida importante sem "Convenceu" no roteiro. Nada aqui impede a decisão —
                quem entrevistou manda —, mas se for avançar assim, escreva embaixo o que fez você
                seguir mesmo com isso em aberto. É essa linha que vai sustentar a escolha daqui a
                três meses.
              </span>
            </p>
          ) : null}
        </section>

        <section className="space-y-4">
          <div>
            <label htmlFor={`${uid}-ev-pos`} className={ROTULO}>
              Principal evidência positiva
            </label>
            <div className="mt-2">
              <CampoAnotacao
                id={`${uid}-ev-pos`}
                rotulo="Principal evidência positiva"
                valor={rascunho.evidenciaPositiva}
                placeholder="o exemplo concreto que ela deu…"
                aoMudar={(valor) => editar({ ...rascunho, evidenciaPositiva: valor }, false)}
                aoSair={salvarPendente}
              />
            </div>
          </div>

          <div>
            <label htmlFor={`${uid}-duvida`} className={ROTULO}>
              Principal dúvida / risco em aberto
            </label>
            <div className="mt-2">
              <CampoAnotacao
                id={`${uid}-duvida`}
                rotulo="Principal dúvida ou risco em aberto"
                valor={rascunho.duvidaAberta}
                placeholder="o que ficou sem resposta…"
                aoMudar={(valor) => editar({ ...rascunho, duvidaAberta: valor }, false)}
                aoSair={salvarPendente}
              />
            </div>
          </div>

          <div>
            <label htmlFor={`${uid}-motivo`} className={ROTULO}>
              Motivo para avançar
            </label>
            <div className="mt-2">
              <CampoAnotacao
                id={`${uid}-motivo`}
                rotulo="Motivo para avançar"
                valor={rascunho.motivoParaAvancar}
                placeholder="por que ela segue no processo…"
                aoMudar={(valor) => editar({ ...rascunho, motivoParaAvancar: valor }, false)}
                aoSair={salvarPendente}
              />
            </div>
          </div>

          <div>
            <label htmlFor={`${uid}-checar`} className={ROTULO}>
              O que checar antes da contratação
            </label>
            <div className="mt-2">
              <CampoAnotacao
                id={`${uid}-checar`}
                rotulo="O que checar antes da contratação"
                valor={rascunho.checarAntesDeContratar}
                placeholder="referências, comprovações, datas…"
                aoMudar={(valor) => editar({ ...rascunho, checarAntesDeContratar: valor }, false)}
                aoSair={salvarPendente}
              />
            </div>
          </div>
        </section>

        {guia.regrasDesempate.length === 0 ? null : (
          <section className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10">
            <h3 className={ROTULO}>Como a clínica desempata no fim</h3>
            <ol className="mt-2 space-y-1.5">
              {guia.regrasDesempate.map((r, i) => (
                <li key={r} className="flex gap-2 text-sm leading-relaxed text-white/85">
                  <span className="font-extrabold tabular-nums text-white">{i + 1}.</span>
                  <span className="min-w-0">{r}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <button type="button" onClick={salvarEEncerrar} className={`${BOTAO_PRINCIPAL} w-full`}>
          <Save className="h-5 w-5" aria-hidden="true" />
          Salvar e encerrar
        </button>
      </div>
    );
  }

  /* --------------------------------------------------------------- render */

  return (
    <div
      ref={refCaixa}
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      tabIndex={-1}
      /* z acima da gaveta (z-90): esta tela nasce de dentro dela e precisa
         cobri-la por inteiro. O contorno global de foco some no verde profundo,
         então o painel usa outline-none — ele recebe foco por código e não é um
         controle; os controles mantêm o anel. */
      className="rh-superficie-escura fixed inset-0 z-[95] flex flex-col bg-brand-deep text-white outline-none"
    >
      {/* ---------- Topo ---------- */}
      <header className="shrink-0 border-b border-lime/20 px-3 py-3 sm:px-5">
        <div className="flex items-start gap-3">
          {/* A marca oficial, discreta: o símbolo e não o lockup, porque aqui ela
              é assinatura de tela e não cabeçalho de documento — o nome da
              candidata é que precisa da largura. `fundo="escuro"` porque a
              superfície é o verde profundo: a arte de fundo claro tem contorno
              #095902 e sumiria. Decorativa (`alt=""`): quem usa esta tela sabe
              onde está, e o leitor de tela já anuncia o título ao lado. */}
          <Logo variante="simbolo" fundo="escuro" altura={30} className="mt-0.5 shrink-0" />

          <div className="min-w-0 flex-1">
            <h1
              id={idTitulo}
              className="truncate font-display text-base font-extrabold leading-tight text-white sm:text-lg"
            >
              {nome}
            </h1>
            <p className="truncate text-xs text-white/85">Entrevista pelo guia: {guia.titulo}</p>
          </div>

          {/* Cronômetro discreto. `aria-hidden` de propósito: um número que muda
              a cada segundo dentro de uma região viva faria o leitor de tela
              interromper a conversa sessenta vezes por minuto. */}
          <p
            aria-hidden="true"
            className="shrink-0 rounded-full bg-white/10 px-3 py-1 font-mono text-sm font-bold tabular-nums text-white"
          >
            {duracao(segundos)}
          </p>

          <button
            type="button"
            onClick={tentarFechar}
            aria-label="Fechar o modo entrevista"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 transition hover:bg-white/20"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Passos. Rolam na horizontal a partir de 360px, sem quebrar linha:
            a sequência é a espinha da entrevista e precisa continuar lida como
            uma sequência. */}
        <nav aria-label="Passos da entrevista" className="rh-scroll mt-3 overflow-x-auto">
          <ol className="flex min-w-max gap-1.5">
            {PASSOS.map((p, i) => {
              const ativo = i === passo;
              const Icone = p.icone;
              return (
                <li key={p.chave}>
                  <button
                    type="button"
                    onClick={() => setPasso(i)}
                    aria-current={ativo ? "step" : undefined}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3.5 text-sm font-bold ring-1 transition ${
                      ativo
                        ? "bg-lime text-brand-deep ring-lime"
                        : "bg-white/[0.06] text-white ring-white/15 hover:bg-white/15"
                    }`}
                  >
                    <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="tabular-nums">{i + 1}.</span>
                    {p.rotulo}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </header>

      {/* ---------- Corpo ---------- */}
      <main ref={refCorpo} className="rh-scroll min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-5">
        <div className="mx-auto w-full max-w-3xl">
          {/* Grudento no topo da área rolável: a pontuação tem dez critérios e
              passa de uma tela, e o total precisa continuar à vista enquanto se
              desce a lista — é ele que a clínica compara no fim. */}
          <h2 className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 bg-brand-deep px-1 py-2 font-display text-xl font-extrabold text-white">
            {atual?.rotulo ?? ""}
            {atual?.chave === "pontuacao" ? (
              <span className="rounded-full bg-lime/15 px-3 py-1 text-sm font-extrabold tabular-nums text-white ring-1 ring-lime/30">
                {total}/{maximo} · {avaliados} de {guia.criterios.length}
              </span>
            ) : null}
          </h2>

          {atual?.chave === "pontuacao" && porConfirmar > 0 ? (
            <p className="mt-2 text-sm leading-relaxed text-white/85">
              {porConfirmar === 1
                ? "1 critério está com sugestão da IA ainda não confirmada — ela não entra no total até você marcar a nota."
                : `${porConfirmar} critérios estão com sugestão da IA ainda não confirmada — elas não entram no total até você marcar a nota.`}
            </p>
          ) : null}

          <div className="mt-4 pb-4">{conteudo(atual?.chave ?? "abertura")}</div>
        </div>
      </main>

      {/* ---------- Rodapé ----------
          A nota ética do guia fica aqui, fixa, em todos os passos: é durante a
          conversa que a pergunta proibida escapa, não depois dela. */}
      <footer className="shrink-0 border-t border-lime/20 px-3 py-3 sm:px-5">
        <div className="mx-auto w-full max-w-3xl">
          <p className="flex items-start gap-2 text-[0.7rem] leading-relaxed text-white/85">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{guia.notaEtica}</span>
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPasso((p) => Math.max(0, p - 1))}
              disabled={passo === 0}
              className={`${BOTAO_SECUNDARIO} disabled:opacity-40`}
            >
              Voltar
            </button>

            {ultimo ? (
              <button type="button" onClick={salvarEEncerrar} className={BOTAO_PRINCIPAL}>
                <Save className="h-4 w-4" aria-hidden="true" />
                Salvar e encerrar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPasso((p) => Math.min(PASSOS.length - 1, p + 1))}
                className={BOTAO_PRINCIPAL}
              >
                Avançar
              </button>
            )}

            <p
              role="status"
              aria-live="polite"
              className="ml-auto text-xs font-semibold text-white"
            >
              {salvando ? (
                <span className="inline-flex items-center gap-1.5">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  salvando…
                </span>
              ) : sujo ? (
                "anotando…"
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  anotações salvas
                </span>
              )}
            </p>
          </div>
        </div>
      </footer>

      {/* ---------- Confirmação de saída ---------- */}
      {confirmandoSaida ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-brand-deep/85 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl bg-brand-deep p-5 ring-1 ring-lime/30">
            <p className="flex items-start gap-2 text-base font-bold leading-relaxed text-white">
              <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-lime" aria-hidden="true" />
              Há anotação desta entrevista ainda não salva.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                ref={refContinuar}
                onClick={() => setConfirmandoSaida(false)}
                className={BOTAO_PRINCIPAL}
              >
                Continuar entrevista
              </button>
              <button type="button" onClick={salvarEEncerrar} className={BOTAO_SECUNDARIO}>
                <Save className="h-4 w-4" aria-hidden="true" />
                Salvar e sair
              </button>
              <button
                type="button"
                onClick={aoFechar}
                className={`${BOTAO_SECUNDARIO} text-rose-100`}
              >
                Sair sem salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
