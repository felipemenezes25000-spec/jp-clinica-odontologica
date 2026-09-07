/**
 * Gaveta de detalhe do candidato.
 *
 * É a tela em que a clínica decide a vida de alguém, então ela mostra tudo o
 * que a pessoa preencheu — sem "ver mais", sem abas escondendo metade do
 * cadastro. O que o RH não precisa ler não é escondido: simplesmente não existe
 * (campo vazio some, bloco inteiro vazio some junto), porque uma lista com dez
 * "—" cansa mais do que uma lista curta.
 *
 * A superfície é escura (`.rh-gaveta` pinta o verde profundo da marca), então
 * vale a regra do cliente sem exceção: **fundo verde, letra branca**. Nenhum
 * texto aqui é `text-lime` e nenhum branco de texto fica abaixo de 85% — o lime
 * sobrevive em ícone, anel, borda e ponto, que não são letra. As pílulas de
 * status entram pela variante `pilulaEscura`.
 * `.rh-rotulo` e `.rh-ajuda` do portal ficam de fora de propósito — as duas são
 * pintadas para fundo claro e sumiriam aqui; o que se repete delas é a métrica.
 *
 * Nada de `new Date()` neste arquivo: `agora` desce por prop, congelado uma vez
 * pela rota. Data calculada no render sairia diferente no servidor e no
 * navegador e derrubaria a hidratação.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  Archive,
  ArchiveRestore,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarClock,
  Check,
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  IdCard,
  LoaderCircle,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  StickyNote,
  Trash2,
  TriangleAlert,
  User,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CentralContato } from "@/components/rh/CentralContato";
import { BlocoFicha } from "@/components/rh/FichaEntrevista";
import { LeituraIa } from "@/components/rh/LeituraIa";
import { PainelDuvidas } from "@/components/rh/PainelDuvidas";
import {
  comLeituraDeDuvida,
  comRespostaDeDuvida,
  fichaVazia,
  leiturasDeDuvidas,
  respostasDeDuvidas,
} from "@/lib/rh/ficha";
import type { FichaEntrevista } from "@/lib/rh/ficha";
import type { GuiaEntrevista } from "@/lib/rh/guia";
import { linkEmail, linkTelefone } from "@/lib/rh/mensagens";
import {
  diasAteVencerGuarda,
  formatarData,
  formatarDataHora,
  formatarTamanho,
  idade,
  iniciais,
  mascararCep,
  mascararCpf,
  mascararTelefone,
  primeiroNome,
  tempoRelativo,
} from "@/lib/rh/formatar";
import {
  AREAS,
  DIAS_SEMANA,
  ETIQUETAS_SUGERIDAS,
  FAIXAS_EXPERIENCIA,
  PRAZOS_INICIO,
  STATUS,
  TURNOS,
  VINCULOS,
  chaveDisponibilidade,
  statusPor,
  statusVagaPor,
} from "@/lib/rh/opcoes";
import type { CamposGeriveis, Candidatura, StatusCandidatura, Vaga } from "@/lib/rh/tipos";
import { MESES_RETENCAO_LGPD } from "@/lib/rh/tipos";

/* -------------------------------------------------------------------------- */
/* Constantes de estilo e helpers puros                                       */
/* -------------------------------------------------------------------------- */

/** Métrica de `.rh-rotulo`, em branco: a superfície é verde, e a regra do
 *  cliente manda letra branca em fundo verde — inclusive no rótulo pequeno,
 *  que antes saía em lime. */
const ROTULO = "mb-1.5 block text-[0.68rem] font-bold uppercase tracking-[0.14em] text-white";
/** Métrica de `.rh-ajuda`, idem — no piso de 85% de branco que a regra fixa. */
const AJUDA = "mt-1.5 text-xs leading-relaxed text-white/85";

/* Campo de formulário na superfície escura. Não é `.rh-campo`: aquela classe é
   branca, desenhada para o formulário público, e no meio do vidro escuro daqui
   cada campo viraria um bloco de luz — a mesma razão pela qual a barra de
   filtros do painel também mantém a sua própria constante. A métrica (altura,
   raio, respiro) é a de `.rh-campo`. */
const CAMPO =
  "block w-full min-h-12 rounded-xl border border-white/15 bg-white/[0.07] px-3.5 py-2.5 " +
  "text-sm leading-relaxed text-white placeholder:text-white/85 transition-colors " +
  "hover:border-white/30 focus:border-lime";

/** Pílula de leitura. Não é `.rh-chip` porque `.rh-chip` é um controle
 *  (cursor de mão, hover, estado ativo) e isto aqui é texto. */
const CHIP_LEITURA =
  "inline-flex items-center rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/20";

const ACAO_RAPIDA =
  "inline-flex min-h-11 items-center gap-2 rounded-full px-3.5 text-sm font-bold ring-1 transition";

const NOTAS = [1, 2, 3, 4, 5];

/**
 * Pausa antes de mandar ao servidor o que foi marcado no roteiro de dúvidas.
 *
 * Mesmo número da ficha (`ESPERA_SALVAR` em `FichaEntrevista.tsx`) e pelo mesmo
 * motivo: um POST por tecla derrubaria a fila de escrita e faria o texto piscar
 * a cada resposta atrasada. A leitura (Convenceu · Em parte · Não convenceu) não
 * espera — é um clique só, discreto, e some se a gaveta fechar antes do prazo.
 */
const ESPERA_DUVIDAS = 1000;

/**
 * Alvos de tabulação dentro da gaveta. Serve à armadilha de foco: é a lista de
 * tudo o que pode receber Tab, na ordem do DOM.
 */
const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function rotuloDe(lista: { valor: string; rotulo: string }[], valor: string): string {
  return lista.find((i) => i.valor === valor)?.rotulo ?? "";
}

type Campo = { rotulo: string; valor: string; href?: string; externo?: boolean };

const campo = (rotulo: string, valor: string): Campo => ({ rotulo, valor });
const campoLink = (rotulo: string, valor: string, href: string): Campo => ({ rotulo, valor, href });
const campoExterno = (rotulo: string, valor: string, href: string): Campo => ({
  rotulo,
  valor,
  href,
  externo: true,
});

/** Um campo só entra na tela quando tem conteúdo — e um link, quando tem destino. */
function preenchidos(campos: Campo[]): Campo[] {
  return campos.filter((c) => c.valor.trim() !== "" && (c.href === undefined || c.href !== ""));
}

function textoEndereco(c: Candidatura): string {
  const rua = [c.logradouro, c.bairro].map((t) => t.trim()).filter((t) => t !== "");
  const cidade = [c.cidade.trim(), c.uf.trim()].filter((t) => t !== "").join(" - ");
  const cep = c.cep.trim() === "" ? "" : `CEP ${mascararCep(c.cep)}`;
  return [rua.join(" — "), cidade, cep].filter((t) => t !== "").join(" · ");
}

/**
 * O candidato ora cola a URL inteira, ora digita só o "@fulano". Normalizamos
 * para absoluta porque um href relativo levaria o RH para /rh/fulano — sairia
 * do painel para uma rota que não existe.
 */
function urlPerfil(valor: string, base: string): string {
  const v = valor.trim();
  if (v === "") return "";
  if (/^https?:\/\//i.test(v)) return v;
  return base + v.replace(/^@+/, "").replace(/^\/+/, "");
}

/* Os três montadores de link que moravam aqui (wa.me, tel: e mailto:) saíram
   para `@/lib/rh/mensagens`, que é quem a central de contato usa. Manter as
   duas cópias significaria corrigir o mesmo bug de DDD duas vezes — e a daqui
   recusava tanto o número com o "0" da operadora quanto o já internacional. */

/**
 * `<input type="datetime-local">` só aceita "AAAA-MM-DDTHH:mm" sem fuso, e é
 * exatamente esse formato ingênuo que gravamos — por isso o corte seco. Se um
 * dia chegar aqui um ISO com "Z", cortar é melhor que converter errado: o campo
 * mostra o horário como foi digitado, sem deslocar três horas sozinho.
 */
function paraCampoDataHora(iso: string): string {
  return iso.trim().slice(0, 16);
}

/* -------------------------------------------------------------------------- */
/* Peças de leitura                                                           */
/* -------------------------------------------------------------------------- */

function Secao(props: { id: string; titulo: string; icone: LucideIcon; children: ReactNode }) {
  const { id, titulo, icone: Icone, children } = props;
  return (
    <section aria-labelledby={id} className="rh-vidro p-4 sm:p-5">
      <h3
        id={id}
        className="flex items-center gap-2 font-display text-[0.72rem] font-extrabold uppercase tracking-[0.14em] text-white"
      >
        {/* A marca continua verde no ícone, que não é letra. */}
        <Icone className="h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
        {titulo}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ListaCampos({ campos }: { campos: Campo[] }) {
  if (campos.length === 0) return null;
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {campos.map((c) => (
        <div key={c.rotulo} className="min-w-0">
          <dt className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-white/85">
            {c.rotulo}
          </dt>
          <dd className="mt-0.5 break-words text-sm font-semibold leading-snug text-white">
            {c.href === undefined ? (
              c.valor
            ) : (
              <a
                href={c.href}
                {...(c.externo === true ? { target: "_blank", rel: "noreferrer" } : {})}
                className="inline-flex min-h-11 items-center gap-1.5 text-white underline decoration-lime/60 underline-offset-4 hover:decoration-lime"
              >
                {c.valor}
                {c.externo === true ? (
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : null}
              </a>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ChipsLeitura({ rotulo, itens }: { rotulo: string; itens: string[] }) {
  if (itens.length === 0) return null;
  return (
    <div>
      <p className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-white/85">{rotulo}</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {itens.map((i) => (
          <li key={i} className={CHIP_LEITURA}>
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Disponibilidade como matriz dia × turno, e não como a lista de strings que o
 * dado é por dentro ("seg-manha", "seg-tarde", ...).
 *
 * O que o RH pergunta é sempre espacial — "ela cobre as tardes?", "sobra alguém
 * no sábado?" —, e com dezoito frases soltas em coluna a pessoa acaba
 * desenhando a grade de cabeça para responder. A matriz já é a resposta: uma
 * coluna vazia é um dia sem ninguém, uma linha cheia é um turno coberto.
 *
 * Marcado nunca é só cor: cada célula traz ✓ ou – e um texto para leitor de
 * tela, e os cabeçalhos de linha e coluna dão o contexto ("Segunda, Manhã,
 * disponível") sem que a pessoa precise contar posições.
 */
function GradeDisponibilidade({ chaves, nome }: { chaves: string[]; nome: string }) {
  const marcadas = new Set(chaves);
  const total = DIAS_SEMANA.length * TURNOS.length;
  const cabecalho = "px-1 pb-2 text-[0.66rem] font-bold uppercase tracking-[0.08em] text-white/85";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[16rem] border-collapse text-center">
        <caption className="sr-only">
          Dias e turnos em que {nome === "" ? "o candidato" : nome} tem disponibilidade
        </caption>
        <thead>
          <tr>
            <th scope="col" className={cabecalho}>
              <span className="sr-only">Turno</span>
            </th>
            {DIAS_SEMANA.map((d) => (
              <th key={d.valor} scope="col" className={cabecalho}>
                <abbr title={d.rotulo} className="no-underline">
                  {d.curto}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TURNOS.map((t) => (
            <tr key={t.valor}>
              <th
                scope="row"
                className="py-1 pr-2 text-left text-xs font-bold text-white/85 whitespace-nowrap"
              >
                {t.rotulo}
              </th>
              {DIAS_SEMANA.map((d) => {
                const livre = marcadas.has(chaveDisponibilidade(d.valor, t.valor));
                return (
                  <td key={d.valor} className="px-0.5 py-1">
                    <span
                      className={
                        livre
                          ? // O ✓ vai branco: a pastilha continua verde no fundo e
                            // no anel, que é onde a marca pode ficar.
                            "grid h-8 w-full min-w-8 place-items-center rounded-lg bg-lime/20 text-white ring-1 ring-lime/45"
                          : // O "–" de indisponível era branco a 30% e sumia no
                            // vidro escuro. Sobe ao piso de 85% da regra: quem
                            // separa os dois estados é o glifo (✓ vs –), o fundo
                            // e o anel, não a força da tinta.
                            "grid h-8 w-full min-w-8 place-items-center rounded-lg bg-white/5 text-white/85 ring-1 ring-white/10"
                      }
                    >
                      {livre ? (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Minus className="h-4 w-4" aria-hidden="true" />
                      )}
                      <span className="sr-only">{livre ? "disponível" : "indisponível"}</span>
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={AJUDA}>
        {chaves.length} de {total} turnos marcados.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Componente público                                                         */
/* -------------------------------------------------------------------------- */

type PropsConteudo = {
  item: Candidatura;
  vagas: Vaga[];
  agora: Date;
  salvando: boolean;
  aoFechar: () => void;
  aoAtualizar: (id: string, campos: Partial<CamposGeriveis>) => void;
  aoAnotar: (id: string, texto: string) => void;
  aoRemoverAnotacao: (id: string, anotacaoId: string) => void;
  /**
   * Quem assina as mensagens da central de contato. Vem das configurações do
   * portal (`assinaturaRh`) e cai para o nome da clínica quando está em branco
   * — quem resolve isso é a rota, que é quem conhece a configuração.
   */
  remetente: string;
  aoExcluir: (id: string) => void;
  /** Esta ficha está com uma leitura da IA em andamento agora. */
  analisando: boolean;
  aoAnalisar: (id: string, forcar: boolean) => void;

  /**
   * O guia de entrevista que vale para esta candidatura — o mesmo que a IA usou
   * para escrever a ficha (ver `escolherGuia`). `null` só quando não existe guia
   * nenhum gravado, e aí a ficha aparece sem a tabela de critérios em vez de
   * inventar uma.
   */
  guia: GuiaEntrevista | null;
  gerandoFicha: boolean;
  salvandoFicha: boolean;
  aoGerarFicha: (id: string, forcar: boolean) => void;
  aoSalvarFicha: (id: string, ficha: FichaEntrevista) => void;
  aoAbrirModoEntrevista: (id: string) => void;
};

/**
 * Sem candidato não há gaveta. O conteúdo mora num componente à parte — e não
 * atrás de um `if` no meio deste — porque ele guarda hooks (foco, trava de
 * rolagem, rascunhos de anotação): desmontar de verdade é o que garante que a
 * limpeza rode, inclusive quando o painel some sem passar por `aoFechar`.
 *
 * A `key` pelo id zera os rascunhos ao trocar de candidato: um "confirma
 * exclusão?" aberto não pode sobreviver para a próxima pessoa da fila.
 */
export function GavetaCandidatura(
  props: Omit<PropsConteudo, "item"> & { item: Candidatura | null },
) {
  const { item, ...resto } = props;
  if (!item) return null;
  return <ConteudoGaveta key={item.id} item={item} {...resto} />;
}

function ConteudoGaveta(props: PropsConteudo) {
  const {
    item,
    vagas,
    agora,
    salvando,
    aoFechar,
    aoAtualizar,
    aoAnotar,
    aoRemoverAnotacao,
    remetente,
    aoExcluir,
    analisando,
    aoAnalisar,
    guia,
    gerandoFicha,
    salvandoFicha,
    aoGerarFicha,
    aoSalvarFicha,
    aoAbrirModoEntrevista,
  } = props;

  const refGaveta = useRef<HTMLElement>(null);
  const refCancelarExclusao = useRef<HTMLButtonElement>(null);
  /** `aoFechar` num ref para o efeito de abertura rodar uma vez só: com ele nas
   *  dependências, cada render do pai com uma closure nova refaria o foco. */
  const refAoFechar = useRef(aoFechar);

  const [responsavel, setResponsavel] = useState(item.responsavel);
  const [entrevista, setEntrevista] = useState(paraCampoDataHora(item.entrevistaEm));
  const [novaEtiqueta, setNovaEtiqueta] = useState("");
  const [rascunhoAnotacao, setRascunhoAnotacao] = useState("");
  const [anotacaoEmDuvida, setAnotacaoEmDuvida] = useState("");
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  /* ------------------------------------------- roteiro de dúvidas (rascunho) */

  /**
   * O que o RH marcou no roteiro, antes de o servidor confirmar.
   *
   * Fica aqui, e não dentro do `<PainelDuvidas>`, porque o painel é a vitrine —
   * ele não conhece a rota nem sabe salvar. E fica separado do rascunho da ficha
   * (que mora em `<BlocoFicha>`) porque os dois blocos são irmãos na tela: cada
   * um edita a SUA metade e compõe o envio a partir de `item.ficha`, que é a
   * versão do servidor. O roteiro pode ser lido antes de existir ficha, e é aí
   * que o painel entra em `somenteLeitura` — quem ainda não marcou entrevista
   * está justamente decidindo se vale a pena chamar.
   */
  const [duvidas, setDuvidas] = useState(() => ({
    leituras: leiturasDeDuvidas(item.ficha),
    respostas: respostasDeDuvidas(item.ficha),
  }));

  /* Mesmo carimbo de ordem da ficha: enquanto houver edição local não
     confirmada, a tela é dona do que está escrito e ignora o que volta do
     servidor — é aí que a resposta atrasada de um POST anterior chegaria por
     cima do que a pessoa acabou de marcar. */
  const refDuvidasSujo = useRef(false);
  const refDuvidasTempo = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refDuvidasPendente = useRef<FichaEntrevista | null>(null);
  const refDuvidasDespachar = useRef<(f: FichaEntrevista) => void>(() => {});
  const refSalvandoFichaAntes = useRef(salvandoFicha);

  useEffect(() => {
    if (refDuvidasSujo.current || salvandoFicha) return;
    setDuvidas({
      leituras: leiturasDeDuvidas(item.ficha),
      respostas: respostasDeDuvidas(item.ficha),
    });
  }, [item.ficha, salvandoFicha]);

  // O ciclo fecha quando o salvamento termina: só então a tela volta a aceitar
  // o que vem do disco.
  useEffect(() => {
    if (refSalvandoFichaAntes.current && !salvandoFicha) refDuvidasSujo.current = false;
    refSalvandoFichaAntes.current = salvandoFicha;
  }, [salvandoFicha]);

  function despacharDuvidas(f: FichaEntrevista) {
    if (refDuvidasTempo.current !== null) {
      clearTimeout(refDuvidasTempo.current);
      refDuvidasTempo.current = null;
    }
    refDuvidasPendente.current = null;
    aoSalvarFicha(item.id, f);
  }

  useEffect(() => {
    refDuvidasDespachar.current = despacharDuvidas;
  });

  // Fechar a gaveta com um debounce em voo não pode custar a anotação.
  useEffect(() => {
    return () => {
      if (refDuvidasTempo.current !== null) clearTimeout(refDuvidasTempo.current);
      const pendente = refDuvidasPendente.current;
      if (pendente !== null) refDuvidasDespachar.current(pendente);
    };
  }, []);

  /**
   * Aplica uma mudança do roteiro e agenda o salvamento.
   *
   * A base é sempre `item.ficha` — a versão do servidor —, e não o rascunho da
   * ficha ao lado: o que sai daqui carrega a metade humana inteira porque a rota
   * grava `{ ...fichaGravada, ...camposRecebidos }`, e mandar só os dois campos
   * do roteiro apagaria triagem, notas e resumos do disco.
   */
  function editarDuvidas(muda: (f: FichaEntrevista) => FichaEntrevista, imediato: boolean) {
    const base = item.ficha ?? fichaVazia();
    const f = muda({
      ...base,
      leiturasDuvidas: duvidas.leituras,
      respostasDuvidas: duvidas.respostas,
    });
    refDuvidasSujo.current = true;
    setDuvidas({ leituras: f.leiturasDuvidas, respostas: f.respostasDuvidas });
    if (refDuvidasTempo.current !== null) clearTimeout(refDuvidasTempo.current);
    if (imediato) {
      despacharDuvidas(f);
      return;
    }
    refDuvidasPendente.current = f;
    refDuvidasTempo.current = setTimeout(() => despacharDuvidas(f), ESPERA_DUVIDAS);
  }

  const uid = useId();
  const idTitulo = `${uid}-titulo`;

  useEffect(() => {
    refAoFechar.current = aoFechar;
  }, [aoFechar]);

  // Campo de texto não vai ao servidor a cada tecla (seria um POST por letra),
  // mas precisa acompanhar quem edita a mesma candidatura de outro lugar.
  useEffect(() => {
    setResponsavel(item.responsavel);
  }, [item.responsavel]);

  // Mesmo motivo: um `datetime-local` dispara `onChange` a cada valor completo
  // (a data, depois a hora, depois a correção da hora), e cada um deles seria um
  // POST — com duas respostas em voo, a antiga chegava por último e reescrevia o
  // campo no meio da digitação.
  useEffect(() => {
    setEntrevista(paraCampoDataHora(item.entrevistaEm));
  }, [item.entrevistaEm]);

  /**
   * Comportamento de diálogo modal, de verdade:
   * foco entra na abertura, Escape fecha, Tab circula só aqui dentro, a rolagem
   * do fundo trava e o foco volta para quem abriu quando a gaveta sai.
   *
   * O foco de entrada vai para o próprio painel (tabIndex -1) e não para o
   * primeiro botão: assim o leitor de tela anuncia o nome do candidato — o
   * `aria-labelledby` do diálogo — antes de qualquer rótulo de controle.
   */
  useEffect(() => {
    const gaveta = refGaveta.current;
    if (!gaveta) return;

    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    gaveta.focus();

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        // Impede que a tela por baixo (kanban, tabela) também reaja ao Escape.
        e.stopPropagation();
        refAoFechar.current();
        return;
      }
      if (e.key !== "Tab") return;

      const alvos = Array.from(gaveta.querySelectorAll<HTMLElement>(FOCAVEIS)).filter(
        // offsetParent nulo = escondido; o alvo atual entra sempre, senão a
        // volta do Shift+Tab a partir dele erraria o cálculo das pontas.
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      const primeiro = alvos[0];
      const ultimo = alvos[alvos.length - 1];
      if (!primeiro || !ultimo) {
        e.preventDefault();
        gaveta.focus();
        return;
      }

      const ativo = document.activeElement;
      const fora = !gaveta.contains(ativo);
      // O painel em si conta como "antes do primeiro": é ele que segura o foco
      // na abertura, e sem isto um Shift+Tab logo de cara escaparia da gaveta.
      const noPainel = ativo === gaveta;
      if (e.shiftKey && (ativo === primeiro || fora || noPainel)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (ativo === ultimo || fora)) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    // Captura para chegar antes de qualquer handler da página por baixo.
    document.addEventListener("keydown", tecla, true);

    return () => {
      document.removeEventListener("keydown", tecla, true);
      document.body.style.overflow = overflowAnterior;
      // `isConnected`: se o elemento que abriu a gaveta saiu do DOM (a linha da
      // tabela foi refiltrada, por exemplo), focá-lo jogaria o foco no <body>.
      if (anterior && anterior.isConnected) anterior.focus();
    };
  }, []);

  // O botão de cancelar recebe o foco assim que a confirmação aparece: o passo
  // seguro é o padrão, e o dedo/tecla que vinha descendo não cai no destrutivo.
  useEffect(() => {
    if (confirmandoExclusao) refCancelarExclusao.current?.focus();
  }, [confirmandoExclusao]);

  /* ---- dados derivados ---- */

  const vaga = item.vagaId === "" ? undefined : vagas.find((v) => v.id === item.vagaId);
  const pilula = statusPor(item.status);
  const anos = idade(item.nascimento, agora);

  const anotacoes = [...item.anotacoes].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const sugestoesEtiqueta = ETIQUETAS_SUGERIDAS.filter((e) => !item.etiquetas.includes(e));

  /* ---- ações de gestão (otimistas: chamam o pai na hora) ---- */

  const trocarStatus = (e: ChangeEvent<HTMLSelectElement>) => {
    // Sem cast: só um valor que existe em STATUS pode virar status.
    const escolhido = STATUS.find((s) => s.valor === e.target.value);
    if (escolhido) aoAtualizar(item.id, { status: escolhido.valor });
  };

  const definirNota = (n: number) => {
    // Clicar de novo na estrela atual zera — é o gesto que todo mundo tenta.
    aoAtualizar(item.id, { nota: item.nota === n ? 0 : n });
  };

  const salvarResponsavel = () => {
    const limpo = responsavel.trim();
    if (limpo === item.responsavel) return;
    aoAtualizar(item.id, { responsavel: limpo });
  };

  const salvarEntrevista = () => {
    if (entrevista === paraCampoDataHora(item.entrevistaEm)) return;
    aoAtualizar(item.id, { entrevistaEm: entrevista });
  };

  const removerEtiqueta = (etq: string) => {
    aoAtualizar(item.id, { etiquetas: item.etiquetas.filter((e) => e !== etq) });
  };

  const adicionarEtiqueta = (etq: string) => {
    const limpa = etq.trim();
    if (limpa === "" || item.etiquetas.includes(limpa)) return;
    aoAtualizar(item.id, { etiquetas: [...item.etiquetas, limpa] });
  };

  const adicionarAnotacao = () => {
    const texto = rascunhoAnotacao.trim();
    if (texto === "") return;
    aoAnotar(item.id, texto);
    setRascunhoAnotacao("");
  };

  /* ---- blocos de leitura ---- */

  const camposVaga = preenchidos([
    campo("Área", rotuloDe(AREAS, item.area)),
    campo("Cargo desejado", item.cargoDesejado),
    campo("Vínculo", rotuloDe(VINCULOS, item.vinculo)),
    campo("Pode começar", rotuloDe(PRAZOS_INICIO, item.inicioEm)),
    campo("Pretensão", item.pretensao),
  ]);

  const camposPessoais = preenchidos([
    campo(
      "Nascimento",
      item.nascimento.trim() === ""
        ? ""
        : `${formatarData(item.nascimento)}${anos === null ? "" : ` · ${anos} anos`}`,
    ),
    campo("CPF", item.cpf.trim() === "" ? "" : mascararCpf(item.cpf)),
    // Os dois links vêm de `@/lib/rh/mensagens`, a mesma fonte da central de
    // contato: um só lugar decide o que é telefone válido e o que é e-mail
    // válido. O mailto vai sem assunto e sem corpo de propósito — quem escreve
    // mensagem com conteúdo é a central, e um assunto genérico aqui só
    // atrapalharia quem já vai digitar o dele.
    campoLink("E-mail", item.email, linkEmail(item.email, "", "")),
    campoLink(
      "Telefone",
      item.telefone.trim() === "" ? "" : mascararTelefone(item.telefone),
      linkTelefone(item.telefone),
    ),
    campo("Endereço", textoEndereco(item)),
    campoExterno(
      "LinkedIn",
      item.linkedin,
      urlPerfil(item.linkedin, "https://www.linkedin.com/in/"),
    ),
    campoExterno(
      "Instagram",
      item.instagram,
      urlPerfil(item.instagram, "https://www.instagram.com/"),
    ),
  ]);

  const camposFormacao = preenchidos([
    campo("Escolaridade", item.escolaridade),
    campo("Instituição", item.instituicao),
    campo("Conclusão", item.anoFormacao),
    campo("Pós-graduações", item.posGraduacoes),
    campo("Cursos", item.cursos),
  ]);
  const temCro = item.cro.trim() !== "";

  const camposOrigem = preenchidos([
    campo("Como chegou até nós", item.origem),
    campo("Indicado por", item.indicadoPor),
    campo("Recebida em", formatarDataHora(item.criadoEm)),
    campo("Última alteração", formatarDataHora(item.atualizadoEm)),
    // A redação do aviso que ESTA pessoa leu. `consentimentoLgpd: true` prova
    // que houve aceite; sem a versão não dá para saber a quê.
    campo("Aviso aceito (versão)", item.consentimentoVersao),
  ]);

  // Prazo de guarda prometido no formulário. Nada é apagado automaticamente —
  // isso é decisão de pessoa —, mas a ficha precisa dizer quando o prazo virou.
  const diasDeGuarda = diasAteVencerGuarda(item.criadoEm, agora, MESES_RETENCAO_LGPD);
  const guardaVencida = diasDeGuarda !== null && diasDeGuarda < 0;

  /**
   * Ficha ainda crua: tem currículo anexado, ninguém mandou ler, e por isso as
   * seções de formação e experiência não têm o que mostrar.
   *
   * Desde que o formulário público passou a pedir só o essencial (nome,
   * WhatsApp e currículo), esses campos deixaram de vir digitados e passam a
   * vir da leitura. Sem este aviso a gaveta apareceria quase vazia e o RH
   * concluiria que a candidata não preencheu nada — quando na verdade falta um
   * clique em "Analisar este currículo".
   */
  const aguardandoLeitura =
    item.analise === null &&
    item.curriculo !== null &&
    item.escolaridade.trim() === "" &&
    item.experiencias.length === 0;

  const faixaExperiencia = rotuloDe(FAIXAS_EXPERIENCIA, item.anosExperiencia);
  const temExperiencia = faixaExperiencia !== "" || item.experiencias.length > 0;
  const temHabilidades =
    item.competencias.length > 0 || item.softwares.length > 0 || item.idiomas.length > 0;

  return (
    <>
      {/*
        Fundo escurecido. É <button> e não <div> com onClick — nada clicável sem
        semântica neste projeto —, mas fica fora da ordem de tabulação e do leitor
        de tela: quem usa teclado fecha pelo Escape ou pelo X, e um "botão sem
        nome" a mais só atrapalharia a leitura.
      */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={aoFechar}
        className="fixed inset-0 z-[89] cursor-default bg-brand-deep/70 backdrop-blur-[2px]"
      />

      <aside
        ref={refGaveta}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        /* O contorno global de foco é --forest-2, invisível sobre o verde
           profundo daqui; o lime é o mesmo remédio que o site já usa em
           .bg-forest e no rodapé. E outline-none só no painel, que recebe foco
           por código e não é um controle — os controles mantêm o anel. */
        className="rh-gaveta text-white outline-none"
      >
        {/* ---------- Topo grudento ----------
            `max-h` + rolagem própria: com a central de contato aqui dentro, o
            painel de escrever mensagem abre um textarea de dez linhas, e sem
            teto o cabeçalho empurraria a ficha inteira para fora da tela no
            celular. Com o teto, quem cresce rola dentro do próprio cabeçalho e
            o corpo continua alcançável. */}
        <header className="rh-scroll max-h-[62dvh] shrink-0 overflow-y-auto border-b border-lime/20 bg-brand-deep/85 px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-lime/15 font-display text-base font-extrabold text-white ring-1 ring-lime/35"
            >
              {iniciais(item.nome) || "?"}
            </span>

            <div className="min-w-0 flex-1">
              <h2
                id={idTitulo}
                className="break-words font-display text-lg font-extrabold leading-tight text-white"
              >
                {item.nome.trim() === "" ? "Candidatura sem nome" : item.nome}
              </h2>

              <p className="mt-1 text-sm font-semibold text-white/85">
                {vaga ? (
                  <a
                    href={`/carreiras/${vaga.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    /* Nova aba de propósito: conferir o anúncio não pode custar
                       o lugar na fila de triagem. Âncora simples em vez de
                       <Link> porque a rota pública vive fora do painel. */
                    className="inline-flex min-h-11 items-center gap-1.5 text-white underline decoration-lime/60 underline-offset-4 hover:decoration-lime"
                  >
                    {vaga.titulo}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </a>
                ) : item.vagaTitulo.trim() !== "" ? (
                  item.vagaTitulo
                ) : item.cargoDesejado.trim() !== "" ? (
                  `${item.cargoDesejado} · candidatura espontânea`
                ) : (
                  "Candidatura espontânea"
                )}
              </p>

              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/85">
                <span className="font-mono">{item.protocolo || "sem protocolo"}</span>
                <span aria-hidden="true">·</span>
                <span>{tempoRelativo(item.criadoEm, agora) || "data desconhecida"}</span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold ${pilula.pilulaEscura}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${pilula.ponto}`} aria-hidden="true" />
                  {pilula.rotulo}
                </span>
                {item.arquivada ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[0.7rem] font-bold text-white/85 ring-1 ring-white/20">
                    <Archive className="h-3 w-3" aria-hidden="true" />
                    Arquivada
                  </span>
                ) : null}
              </p>
            </div>

            <button
              type="button"
              onClick={aoFechar}
              aria-label="Fechar detalhes do candidato"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 transition hover:bg-white/20"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* ---------- Baixar currículo ----------
              Baixar NÃO é contato: continua aqui, ao lado da identificação,
              porque é o gesto que abre o PDF antes de qualquer conversa. Os
              três links de contato que moravam nesta linha (WhatsApp, e-mail e
              telefone, todos sem conteúdo útil) saíram para a central logo
              abaixo, que escreve a mensagem e registra o envio sozinha. */}
          <div className="mt-3 flex flex-wrap gap-2">
            {item.curriculo ? (
              <a
                href={`/api/rh/curriculo/${item.id}`}
                download={item.curriculo.nomeOriginal}
                aria-label={`Baixar currículo (${formatarTamanho(item.curriculo.tamanho)})`}
                className={`${ACAO_RAPIDA} bg-white/10 text-white ring-white/20 hover:bg-white/20`}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Baixar currículo</span>
                <span className="hidden font-normal text-white/85 sm:inline">
                  {formatarTamanho(item.curriculo.tamanho)}
                </span>
              </a>
            ) : (
              <span
                className={`${ACAO_RAPIDA} bg-amber-300/15 text-amber-100 ring-amber-200/35`}
                /* Ausência de currículo muda a conversa com o candidato, então
                   é aviso visível — não um botão desabilitado que ninguém lê. */
              >
                <TriangleAlert className="h-4 w-4" aria-hidden="true" />
                Sem currículo<span className="hidden sm:inline">&nbsp;anexado</span>
              </span>
            )}
          </div>

          {/* ---------- Central de contato ----------
              No topo grudento porque falar com a candidata é a razão de a
              gaveta estar aberta: com ela lá embaixo, o RH rolava a ficha
              inteira até o fim toda vez que precisava mandar um WhatsApp.
              O `aoRegistrar` cai na MESMA anotação que o RH escreve à mão —
              não existe um segundo histórico paralelo. */}
          <div className="mt-3">
            <CentralContato
              item={item}
              agora={agora}
              remetente={remetente}
              aoRegistrar={(texto) => aoAnotar(item.id, texto)}
            />
          </div>
        </header>

        {/* ---------- Corpo rolável ---------- */}
        <div className="rh-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          {/* ---------- Faixa de gestão ---------- */}
          <section aria-labelledby={`${uid}-gestao`} className="rh-vidro p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3
                id={`${uid}-gestao`}
                className="flex items-center gap-2 font-display text-[0.72rem] font-extrabold uppercase tracking-[0.14em] text-white"
              >
                <BadgeCheck className="h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
                Gestão do processo
              </h3>
              {/* Indicador discreto: avisa que gravou sem tirar nada da tela. */}
              <p
                role="status"
                className="flex items-center gap-1.5 text-xs font-semibold text-white"
              >
                {salvando ? (
                  <>
                    <LoaderCircle
                      className="h-3.5 w-3.5 animate-spin text-lime"
                      aria-hidden="true"
                    />
                    Salvando…
                  </>
                ) : null}
              </p>
            </div>

            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${uid}-status`} className={ROTULO}>
                  Status
                </label>
                <select
                  id={`${uid}-status`}
                  className={CAMPO}
                  value={item.status}
                  onChange={trocarStatus}
                >
                  {STATUS.map((s) => (
                    /* O <option> herda o fundo do sistema, não o do select: sem
                       estas classes a lista aberta sai branco no branco. */
                    <option key={s.valor} value={s.valor} className="bg-white text-ink">
                      {s.rotulo}
                    </option>
                  ))}
                </select>
                <p className={AJUDA}>{pilula.descricao}</p>
              </div>

              <div>
                <label htmlFor={`${uid}-responsavel`} className={ROTULO}>
                  Responsável
                </label>
                <input
                  id={`${uid}-responsavel`}
                  type="text"
                  className={CAMPO}
                  placeholder="Quem está conduzindo"
                  value={responsavel}
                  onChange={(e) => setResponsavel(e.target.value)}
                  onBlur={salvarResponsavel}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      salvarResponsavel();
                    }
                  }}
                />
                <p className={AJUDA}>Grava ao sair do campo ou no Enter.</p>
              </div>

              <div>
                <p className={ROTULO} id={`${uid}-nota-rotulo`}>
                  Avaliação
                </p>
                <div
                  role="group"
                  aria-labelledby={`${uid}-nota-rotulo`}
                  className="flex flex-wrap items-center gap-0.5"
                >
                  {NOTAS.map((n) => {
                    const ativa = n <= item.nota;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => definirNota(n)}
                        aria-pressed={ativa}
                        aria-label={`avaliar com ${n} ${n === 1 ? "estrela" : "estrelas"}`}
                        data-ativa={ativa}
                        className="rh-estrela grid h-11 w-11 place-items-center rounded-full"
                      >
                        <Star
                          className="h-5 w-5"
                          fill={ativa ? "currentColor" : "none"}
                          aria-hidden="true"
                        />
                      </button>
                    );
                  })}
                  {/* A nota em texto: quem não distingue a estrela cheia da vazia
                      continua sabendo em quanto o candidato foi avaliado. */}
                  <span className="ml-2 text-sm font-bold text-white">
                    {item.nota > 0 ? `${item.nota} de 5` : "sem nota"}
                  </span>
                </div>
                <p className={AJUDA}>Clique na mesma estrela para zerar.</p>
              </div>

              <div>
                <label htmlFor={`${uid}-entrevista`} className={ROTULO}>
                  Entrevista
                </label>
                <input
                  id={`${uid}-entrevista`}
                  type="datetime-local"
                  className={CAMPO}
                  value={entrevista}
                  onChange={(e) => setEntrevista(e.target.value)}
                  onBlur={salvarEntrevista}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      salvarEntrevista();
                    }
                  }}
                />
                <p className={AJUDA}>
                  {/* Sem promessa de "agenda do funil": não existe tela nenhuma
                      que mostre esta data — nem no cartão, nem na tabela, nem no
                      resumo. Ela fica na ficha e sai na exportação. */}
                  {item.entrevistaEm.trim() === ""
                    ? "Vale para qualquer status: dá para marcar a data antes de mover o candidato para Entrevista ou Teste prático. Grava ao sair do campo ou no Enter."
                    : `${formatarDataHora(item.entrevistaEm)} — fica registrada nesta ficha e sai na exportação CSV. Grava ao sair do campo ou no Enter.`}
                </p>
              </div>
            </div>

            {/* ---- Etiquetas ---- */}
            <div className="mt-4">
              <p className={ROTULO} id={`${uid}-etiquetas-rotulo`}>
                Etiquetas
              </p>

              <div
                role="group"
                aria-labelledby={`${uid}-etiquetas-rotulo`}
                className="flex flex-wrap gap-1.5"
              >
                {item.etiquetas.map((etq) => (
                  /* O chip inteiro é o botão de remover. Um X de 24px dentro de
                     um chip de 40px seria alvo pequeno demais no celular. */
                  <button
                    key={etq}
                    type="button"
                    onClick={() => removerEtiqueta(etq)}
                    aria-label={`Remover etiqueta ${etq}`}
                    data-ativo="true"
                    className="rh-chip rh-chip-escuro min-h-11!"
                  >
                    {etq}
                    <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </button>
                ))}
                {item.etiquetas.length === 0 ? (
                  <p className="text-xs text-white/85">Nenhuma etiqueta ainda.</p>
                ) : null}
              </div>

              {sugestoesEtiqueta.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {sugestoesEtiqueta.map((etq) => (
                    <button
                      key={etq}
                      type="button"
                      onClick={() => adicionarEtiqueta(etq)}
                      aria-label={`Adicionar etiqueta ${etq}`}
                      className="rh-chip rh-chip-escuro min-h-11!"
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {etq}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div className="min-w-[10rem] flex-1">
                  <label htmlFor={`${uid}-nova-etiqueta`} className="sr-only">
                    Nova etiqueta
                  </label>
                  <input
                    id={`${uid}-nova-etiqueta`}
                    type="text"
                    className={CAMPO}
                    placeholder="Etiqueta própria"
                    value={novaEtiqueta}
                    onChange={(e) => setNovaEtiqueta(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      // Enter aqui adiciona a etiqueta; sem isto ele submeteria
                      // o formulário mais próximo e a tela recarregaria.
                      e.preventDefault();
                      adicionarEtiqueta(novaEtiqueta);
                      setNovaEtiqueta("");
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    adicionarEtiqueta(novaEtiqueta);
                    setNovaEtiqueta("");
                  }}
                  disabled={novaEtiqueta.trim() === ""}
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-lime px-4 text-sm font-bold text-brand-deep transition hover:bg-lime/85 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/85"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Adicionar
                </button>
              </div>
            </div>

            <div className="mt-4 border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={() => aoAtualizar(item.id, { arquivada: !item.arquivada })}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-bold text-white ring-1 ring-white/20 transition hover:bg-white/20"
              >
                {item.arquivada ? (
                  <>
                    <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                    Tirar do arquivo
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4" aria-hidden="true" />
                    Arquivar candidatura
                  </>
                )}
              </button>
              <p className={AJUDA}>
                Arquivar só esconde da lista padrão. Nada é apagado e o histórico continua inteiro.
              </p>
            </div>
          </section>

          {/* ---------- Leitura da IA ----------
              Primeira seção depois da faixa de gestão, e não no rodapé: é a
              informação mais cara e mais densa da tela (permanência calculada,
              sinais, perguntas de entrevista), e quem abre a ficha decide olhando
              para ela. Embaixo dos dados pessoais, ninguém rolaria até aqui. */}
          <LeituraIa
            item={item}
            agora={agora}
            analisando={analisando}
            aoAnalisar={(forcar) => aoAnalisar(item.id, forcar)}
          />

          {/* ---------- O que perguntar ----------
              Entre a leitura da IA e a ficha, e nesta ordem porque é a ordem da
              cabeça de quem lê: primeiro o que a IA achou no currículo, depois
              o que ficou SEM resposta e precisa ser perguntado, e só então a
              ficha, que é onde a conversa vira registro. Invertido, o RH
              começaria a preencher a entrevista antes de saber o que investigar.

              Sem ficha ainda, o painel é só leitura: dá para ler o roteiro
              inteiro antes de marcar a entrevista, que é exatamente o momento em
              que a clínica decide se vale a pena chamar a pessoa. Marcar
              resposta antes de ter conversado não faria sentido — e sem ficha
              não há onde gravar sem inventar uma. */}
          {/* `<div>` e não `<section>`: o painel já traz a sua própria
              `<section aria-labelledby>` com o título "O que perguntar" — o que
              falta aqui é só a superfície de vidro que as outras seções da
              gaveta usam. Uma segunda região com um segundo título anunciaria a
              mesma coisa duas vezes no leitor de tela. */}
          <div className="rh-vidro p-4 sm:p-5">
            <PainelDuvidas
              item={item}
              leituras={duvidas.leituras}
              respostas={duvidas.respostas}
              somenteLeitura={item.ficha === null}
              // Clique de leitura sobe na hora: é um toque só, e a gaveta pode
              // fechar no instante seguinte.
              aoMudarLeitura={(id, leitura) =>
                editarDuvidas((f) => comLeituraDeDuvida(f, id, leitura), true)
              }
              // A anotação sobe por pausa, nunca por tecla.
              aoMudarResposta={(id, texto) =>
                editarDuvidas((f) => comRespostaDeDuvida(f, id, texto), false)
              }
            />
          </div>

          {/* ---------- Ficha de entrevista ----------
              Logo depois da leitura da IA, e nesta ordem: a leitura diz se vale
              a pena conversar, a ficha é a conversa. Antes dos dados pessoais
              porque é aqui que o dia de trabalho continua — quem abre a gaveta
              decide chamar, prepara a ficha e, na hora marcada, entra no modo
              entrevista. Os dados cadastrais são consulta, não fluxo. */}
          <BlocoFicha
            item={item}
            guia={guia}
            agora={agora}
            gerando={gerandoFicha}
            salvando={salvandoFicha}
            aoGerar={(forcar) => aoGerarFicha(item.id, forcar)}
            aoSalvar={(ficha) => aoSalvarFicha(item.id, ficha)}
            aoAbrirModoEntrevista={() => aoAbrirModoEntrevista(item.id)}
          />

          {/* ---------- Vaga pretendida ---------- */}
          {camposVaga.length > 0 || item.especialidades.length > 0 || vaga ? (
            <Secao id={`${uid}-vaga`} titulo="Vaga pretendida" icone={Briefcase}>
              {vaga ? (
                <p className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                  {vaga.titulo}
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold ${statusVagaPor(vaga.status).pilulaEscura}`}
                  >
                    {statusVagaPor(vaga.status).rotulo}
                  </span>
                </p>
              ) : item.vagaId !== "" ? (
                /* A vaga saiu do ar, mas o título ficou gravado na candidatura
                   justamente para o processo continuar fazendo sentido. */
                <p className="mb-3 text-sm font-semibold text-white/85">
                  {item.vagaTitulo.trim() === ""
                    ? "A vaga desta candidatura não existe mais."
                    : `${item.vagaTitulo} — vaga removida do painel.`}
                </p>
              ) : (
                <p className="mb-3 text-sm font-semibold text-white/85">
                  Candidatura espontânea, sem vaga ligada.
                </p>
              )}
              <ListaCampos campos={camposVaga} />
              {item.especialidades.length > 0 ? (
                <div className="mt-3">
                  <ChipsLeitura rotulo="Especialidades" itens={item.especialidades} />
                </div>
              ) : null}
            </Secao>
          ) : null}

          {/* ---------- Dados pessoais ---------- */}
          {camposPessoais.length > 0 ? (
            <Secao id={`${uid}-pessoais`} titulo="Dados pessoais" icone={User}>
              <ListaCampos campos={camposPessoais} />
            </Secao>
          ) : null}

          {/* ---------- Disponibilidade ---------- */}
          {item.disponibilidade.length > 0 ? (
            <Secao id={`${uid}-disponibilidade`} titulo="Disponibilidade" icone={CalendarClock}>
              <GradeDisponibilidade chaves={item.disponibilidade} nome={primeiroNome(item.nome)} />
            </Secao>
          ) : null}

          {aguardandoLeitura ? (
            <div
              role="status"
              className="flex items-start gap-3 rounded-2xl border border-border-soft bg-mint/60 p-4"
            >
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-forest" aria-hidden="true" />
              <p className="text-sm font-semibold leading-relaxed text-ink">
                Formação, experiência, cursos e idiomas ainda não aparecem porque o currículo não
                foi lido. O formulário do site pede só nome, WhatsApp e o arquivo — o resto sai da
                leitura. Use “Analisar este currículo”, logo abaixo.
              </p>
            </div>
          ) : null}

          {/* ---------- Formação ---------- */}
          {camposFormacao.length > 0 || temCro ? (
            <Secao id={`${uid}-formacao`} titulo="Formação" icone={GraduationCap}>
              {temCro ? (
                /* O CRO é o que decide se a pessoa pode atender: fora da lista
                   de campos, em destaque, porque é a primeira coisa procurada. */
                <p className="mb-3 inline-flex items-center gap-2 rounded-xl bg-lime/15 px-3 py-2 text-sm font-extrabold text-white ring-1 ring-lime/35">
                  <IdCard className="h-4 w-4 shrink-0" aria-hidden="true" />
                  CRO {item.cro}
                  {item.croUf.trim() === "" ? "" : `/${item.croUf}`}
                </p>
              ) : null}
              <ListaCampos campos={camposFormacao} />
            </Secao>
          ) : null}

          {/* ---------- Experiência ---------- */}
          {temExperiencia ? (
            <Secao id={`${uid}-experiencia`} titulo="Experiência" icone={Building2}>
              {faixaExperiencia !== "" ? (
                <p className="mb-3 text-sm font-semibold text-white">{faixaExperiencia}</p>
              ) : null}
              {item.experiencias.length > 0 ? (
                <ul className="space-y-2">
                  {item.experiencias.map((exp, i) => (
                    <li
                      key={`${exp.empresa}-${exp.cargo}-${i}`}
                      className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10"
                    >
                      <p className="text-sm font-extrabold text-white">
                        {exp.cargo.trim() === "" ? "Cargo não informado" : exp.cargo}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-white/85">
                        {[exp.empresa, exp.periodo].filter((t) => t.trim() !== "").join(" · ")}
                      </p>
                      {exp.atividades.trim() !== "" ? (
                        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-white/85">
                          {exp.atividades}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Secao>
          ) : null}

          {/* ---------- Competências ---------- */}
          {temHabilidades ? (
            <Secao id={`${uid}-habilidades`} titulo="Competências" icone={Sparkles}>
              <div className="space-y-3">
                <ChipsLeitura rotulo="Competências" itens={item.competencias} />
                <ChipsLeitura rotulo="Softwares" itens={item.softwares} />
                <ChipsLeitura rotulo="Idiomas" itens={item.idiomas} />
              </div>
            </Secao>
          ) : null}

          {/* ---------- Carta ---------- */}
          {item.cartaApresentacao.trim() !== "" ? (
            <Secao id={`${uid}-carta`} titulo="Carta de apresentação" icone={FileText}>
              {/* pre-wrap: a pessoa escreveu em parágrafos e essa quebra é parte
                  do que ela quis dizer. */}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-white">
                {item.cartaApresentacao}
              </p>
            </Secao>
          ) : null}

          {/* ---------- Origem ---------- */}
          {camposOrigem.length > 0 ? (
            <Secao id={`${uid}-origem`} titulo="Origem e registro" icone={ShieldCheck}>
              <ListaCampos campos={camposOrigem} />
              <p className={AJUDA}>
                {item.consentimentoLgpd
                  ? "O candidato aceitou o uso dos dados para fins de recrutamento (LGPD)."
                  : "Sem registro de consentimento LGPD nesta candidatura."}
              </p>
              {guardaVencida ? (
                /* `role="note"` e não `alert`: a gaveta pode abrir com o prazo
                   já vencido, e um alerta anunciado a cada abertura vira ruído
                   que se aprende a ignorar. */
                <p
                  role="note"
                  className="mt-2 rounded-xl border border-amber-200/35 bg-amber-300/12 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-50"
                >
                  Prazo de guarda vencido: passaram-se mais de {MESES_RETENCAO_LGPD} meses desde o
                  envio, que é o prazo declarado no aviso aceito por esta pessoa. Exclua a
                  candidatura ou peça um novo consentimento.
                </p>
              ) : diasDeGuarda !== null && diasDeGuarda <= 60 ? (
                <p className={AJUDA}>
                  Prazo de guarda vence em {diasDeGuarda === 1 ? "1 dia" : `${diasDeGuarda} dias`}.
                </p>
              ) : null}
            </Secao>
          ) : null}

          {/* ---------- Anotações ---------- */}
          <Secao id={`${uid}-anotacoes`} titulo="Anotações internas" icone={StickyNote}>
            <label htmlFor={`${uid}-nova-anotacao`} className="sr-only">
              Nova anotação
            </label>
            <textarea
              id={`${uid}-nova-anotacao`}
              className={`${CAMPO} min-h-28 resize-y`}
              rows={3}
              placeholder="O que ficou desta conversa?"
              value={rascunhoAnotacao}
              onChange={(e) => setRascunhoAnotacao(e.target.value)}
            />
            <button
              type="button"
              onClick={adicionarAnotacao}
              disabled={rascunhoAnotacao.trim() === ""}
              className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-lime px-4 text-sm font-bold text-brand-deep transition hover:bg-lime/85 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/85"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Adicionar anotação
            </button>

            {anotacoes.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {anotacoes.map((a) => (
                  <li key={a.id} className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                    <p className="flex flex-wrap items-center gap-x-2 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-white/85">
                      {a.autor || "Equipe"}
                      <span aria-hidden="true">·</span>
                      <span className="normal-case tracking-normal">
                        {formatarDataHora(a.criadoEm)}
                      </span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-white">
                      {a.texto}
                    </p>

                    {anotacaoEmDuvida === a.id ? (
                      /* Confirmação no lugar do próprio botão: o RH não perde o
                         contexto e ninguém apaga um registro por engano. */
                      <p
                        role="alert"
                        className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-white/85"
                      >
                        Remover esta anotação?
                        <button
                          type="button"
                          onClick={() => {
                            aoRemoverAnotacao(item.id, a.id);
                            setAnotacaoEmDuvida("");
                          }}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-rose-400/20 px-3 font-bold text-rose-100 ring-1 ring-rose-300/45 transition hover:bg-rose-400/30"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Sim, remover
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnotacaoEmDuvida("")}
                          className="inline-flex min-h-11 items-center rounded-full bg-white/10 px-3 font-bold text-white ring-1 ring-white/20 transition hover:bg-white/20"
                        >
                          Cancelar
                        </button>
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAnotacaoEmDuvida(a.id)}
                        className="mt-1.5 inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-white/85 underline decoration-white/30 underline-offset-4 transition hover:text-white"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Remover
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-white/85">
                Nenhuma anotação. O que for escrito aqui fica só para a equipe.
              </p>
            )}
          </Secao>
        </div>

        {/* ---------- Rodapé destrutivo ---------- */}
        <footer className="shrink-0 border-t border-lime/20 bg-brand-deep/85 px-4 py-3 sm:px-5">
          {confirmandoExclusao ? (
            <div role="alert" className="space-y-2">
              <p className="flex items-start gap-2 text-sm font-semibold leading-relaxed text-rose-100">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Excluir apaga o cadastro, as anotações e também o arquivo de currículo do
                  servidor. Não há como desfazer — se a ideia é só tirar da lista, use “Arquivar
                  candidatura”.
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  ref={refCancelarExclusao}
                  type="button"
                  onClick={() => setConfirmandoExclusao(false)}
                  className="inline-flex min-h-11 items-center rounded-full bg-white/10 px-4 text-sm font-bold text-white ring-1 ring-white/20 transition hover:bg-white/20"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => aoExcluir(item.id)}
                  disabled={salvando}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rose-400/20 px-4 text-sm font-bold text-rose-100 ring-1 ring-rose-300/50 transition hover:bg-rose-400/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Excluir definitivamente
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmandoExclusao(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold text-rose-200 ring-1 ring-rose-300/35 transition hover:bg-rose-400/15 hover:text-rose-100"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Excluir candidatura
            </button>
          )}
        </footer>
      </aside>
    </>
  );
}
