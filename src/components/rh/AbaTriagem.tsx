/**
 * Aba "Triagem": a tela onde o RH decide QUEM ENTREVISTAR PRIMEIRO.
 *
 * Quatro blocos, na ordem em que a clínica trabalha: ver o estado da IA,
 * jogar currículo para dentro, comparar quem já foi lido e, por último, sair
 * daqui com uma lista de nomes para ligar hoje.
 *
 * Duas regras atravessam o arquivo inteiro:
 *
 * 1. **Nenhum `new Date()`.** Todo texto relativo sai do `props.agora` que a
 *    rota congelou — o mesmo motivo do resto do painel: relógio lido duas vezes
 *    (SSR e hidratação) faz o React repintar a raiz por divergência de string.
 * 2. **Nada é calculado aqui.** Permanência, lacunas e meses em odontologia
 *    chegam prontos dentro de `analise.metricas`, feitos em TypeScript puro no
 *    servidor. Esta tela só ordena, agrupa e desenha — se um número parecer
 *    errado, o lugar de corrigir é `@/lib/rh/ia/metricas`, nunca o JSX.
 *
 * O visual mora em `triagem.css` (classes `.tri-*`, escopo `.rh-triagem`), na
 * mesma linguagem do Resumo e da Gestão de vagas: folha branca, degrau de tom
 * em vez de filete, verde-campo nos dados e acento só no botão de ação.
 */
import {
  useCallback,
  useMemo,
  useState,
  type DragEvent as EventoArrastar,
  type ReactNode,
  type KeyboardEvent as EventoTeclado,
  type MouseEvent as EventoMouse,
} from "react";
import {
  Check,
  ChevronRight,
  ClipboardCopy,
  FileText,
  Inbox,
  ListChecks,
  RotateCcw,
  ScanSearch,
  Sparkles,
  Star,
  Trash2,
  TriangleAlert,
  Trophy,
  Upload,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { MolduraCoroa } from "@/components/site/sistema/Coroa";
import { SeloSinais } from "@/components/rh/PainelSinais";
import { formatarData, formatarTamanho, iniciais } from "@/lib/rh/formatar";
import { emAnosMeses } from "@/lib/rh/ia/metricas";
import {
  custoEstimado,
  formatarDolar,
  TOKENS_ENTRADA_POR_CURRICULO,
  TOKENS_SAIDA_POR_CURRICULO,
} from "@/lib/rh/ia/precos";
import { CHAVES_CRITERIO } from "@/lib/rh/ia/rubricas";
import { RECOMENDACOES, recomendacaoPor } from "@/lib/rh/ia/tipos";
import type { AnaliseIa, ChaveCriterio, RankingIa, RecomendacaoIa, Sinal } from "@/lib/rh/ia/tipos";
import { AREAS } from "@/lib/rh/opcoes";
import type { AreaVaga, Candidatura, Vaga } from "@/lib/rh/tipos";
import { EXTENSOES_CURRICULO, TAMANHO_MAX_CURRICULO, TIPOS_CURRICULO } from "@/lib/rh/tipos";
import "@/components/rh/triagem.css";

/** Espelho do limite do servidor (`importarCurriculos`). Ver o aviso na tela. */
const LIMITE_IMPORTACAO = 40;

/**
 * Quantas candidatas o servidor analisa por chamada (`MAX_ANALISES_POR_CHAMADA`).
 * Não é um detalhe interno: é o que explica ao RH por que o botão precisa ser
 * apertado de novo quando a fila é grande, em vez de deixá-lo achar que travou.
 */
const LOTE_ANALISE = 20;

/**
 * O que o servidor devolve depois de uma importação.
 *
 * Prop opcional de propósito: quem monta a rota pode ainda não ter o resultado
 * em mãos (a primeira versão do painel só mostrava aviso flutuante), e nesse
 * caso o bloco simplesmente não aparece. Quando vier, é aqui que a clínica
 * descobre quantos arquivos viraram ficha e quais foram recusados — informação
 * que some junto com o aviso passageiro e some rápido demais para 40 arquivos.
 */
export type ResultadoImportacao = {
  criadas: number;
  duplicadas: number;
  erros: { arquivo: string; motivo: string }[];
};

/* -------------------------------------------------------------------------- */
/* Rótulos e formatação                                                       */
/* -------------------------------------------------------------------------- */

const ROTULO_CRITERIO: Record<ChaveCriterio, string> = {
  permanencia: "Permanência",
  aderencia: "Aderência",
  atendimento: "Atendimento",
  administrativo: "Administrativo",
  progressao: "Progressão",
  coerencia: "Coerência",
};

/** Cabeçalho da tabela: seis colunas de critério em tela larga só cabem abreviadas. */
const CURTO_CRITERIO: Record<ChaveCriterio, string> = {
  permanencia: "Perm.",
  aderencia: "Ader.",
  atendimento: "Atend.",
  administrativo: "Adm.",
  progressao: "Progr.",
  coerencia: "Coer.",
};

function rotuloArea(area: string): string {
  return AREAS.find((a) => a.valor === area)?.rotulo ?? "Sem área";
}

function rotuloVaga(c: Candidatura): string {
  return c.vagaTitulo.trim() || c.cargoDesejado.trim() || "Candidatura espontânea";
}

function pluralizar(n: number, singular: string, plural: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${plural}`;
}

/** "8" vira "8"; "7.5" vira "7,5" — vírgula, que é como o Brasil lê nota. */
function formatarNota(n: number): string {
  const limpa = Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : 0;
  return Number.isInteger(limpa) ? String(limpa) : limpa.toFixed(1).replace(".", ",");
}

type Faixa = { rotulo: string; faixa: "forte" | "bom" | "atencao" | "fraco" };

/**
 * Faixa da célula de critério — SEMPRE acompanhada do número escrito.
 *
 * A cor (em `triagem.css`, por `data-faixa`) é o atalho para o olho varrer a
 * tabela; ela nunca é a informação. Quem não distingue verde de âmbar lê o "7"
 * e o rótulo textual ("forte", "fraco") que o leitor de tela anuncia, e chega
 * exatamente à mesma conclusão.
 */
function faixaDaNota(nota: number): Faixa {
  if (nota >= 8) return { rotulo: "forte", faixa: "forte" };
  if (nota >= 6) return { rotulo: "bom", faixa: "bom" };
  if (nota >= 4) return { rotulo: "atenção", faixa: "atencao" };
  return { rotulo: "fraco", faixa: "fraco" };
}

/**
 * Notas por critério, na ordem canônica da rubrica.
 *
 * Chave repetida vale a primeira ocorrência, igual a `notaPonderada`: duas
 * notas para "permanencia" são alucinação do modelo, e a segunda não pode
 * apagar a primeira só por vir depois.
 */
function notasPorCriterio(analise: AnaliseIa): Map<ChaveCriterio, number> {
  const mapa = new Map<ChaveCriterio, number>();
  for (const c of analise.criterios) {
    if (!mapa.has(c.chave)) mapa.set(c.chave, c.nota);
  }
  return mapa;
}

/** "3 meses na Loja Fast Modas" — o número que a clínica não pode errar. */
function textoUltimoEmprego(analise: AnaliseIa): string {
  const ultimo = analise.metricas.ultimoEmprego;
  if (!ultimo) return "Sem emprego datado no currículo";
  const empresa = ultimo.empresa.trim();
  const tempo = emAnosMeses(ultimo.meses);
  return empresa ? `${tempo} na ${empresa}` : tempo;
}

/**
 * Os alertas que merecem pílula na lista final.
 *
 * Crítico primeiro; só quando não existe nenhum é que os "alto" aparecem —
 * mostrar os dois níveis sempre encheria a linha de pastilha e faria o crítico
 * (o que manda parar antes de ligar) perder o destaque que ele existe para ter.
 */
function sinaisDeDestaque(sinais: Sinal[]): Sinal[] {
  const criticos = sinais.filter((s) => s.severidade === "critico");
  if (criticos.length > 0) return criticos.slice(0, 3);
  return sinais.filter((s) => s.severidade === "alto").slice(0, 2);
}

/* -------------------------------------------------------------------------- */
/* Peças de leitura                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Estrelas da nota. Desenho, não texto: o preenchimento pede 3:1 (WCAG 1.4.11),
 * e a nota também vem escrita ao lado, em número, em todo lugar onde aparece.
 * A cor vem de `triagem.css` (`--estrela` cheia, `--estrela-vazia` apagada).
 */
function EstrelasNota(props: { valor: number }) {
  return (
    <span role="img" aria-label={`${props.valor} de 5 estrelas`} className="tri-estrelas">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={14}
          strokeWidth={1.75}
          aria-hidden="true"
          data-vazia={n <= props.valor ? "false" : "true"}
          fill="currentColor"
        />
      ))}
    </span>
  );
}

/** As iniciais na moldura da casa — a mesma peça do Resumo e do kanban. */
function Avatar(props: { nome: string }) {
  return (
    <MolduraCoroa as="span" proporcao={1} className="tri-avatar" aria-hidden="true">
      <span>{iniciais(props.nome) || "?"}</span>
    </MolduraCoroa>
  );
}

/** Estado vazio: ícone, uma frase de título e o texto que explica o próximo passo. */
function Vazio(props: { icone: LucideIcon; titulo: string; children: ReactNode }) {
  const { icone: Icone } = props;
  return (
    <div className="tri-vazio">
      <span className="tri-pastilha" aria-hidden="true">
        <Icone size={20} />
      </span>
      <strong>{props.titulo}</strong>
      <p>{props.children}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Seletor de recorte (área + vaga), compartilhado por ranking e fila         */
/* -------------------------------------------------------------------------- */

const BTN = "tri-btn tri-btn--chao";
const BTN_FORTE = "tri-btn tri-btn--forte";

function SeletorRecorte(props: {
  id: string;
  area: AreaVaga | "";
  vagaId: string;
  vagas: Vaga[];
  rotuloArea: string;
  rotuloVaga: string;
  aoMudarArea: (area: AreaVaga | "") => void;
  aoMudarVaga: (vagaId: string) => void;
}) {
  return (
    <>
      <label className="tri-recorte">
        <span className="tri-rotulo">{props.rotuloArea}</span>
        <select
          id={`${props.id}-area`}
          className="tri-select"
          value={props.area}
          onChange={(e) => props.aoMudarArea(e.target.value as AreaVaga | "")}
        >
          <option value="">Todas as áreas</option>
          {AREAS.map((a) => (
            <option key={a.valor} value={a.valor}>
              {a.rotulo}
            </option>
          ))}
        </select>
      </label>

      <label className="tri-recorte">
        <span className="tri-rotulo">{props.rotuloVaga}</span>
        <select
          id={`${props.id}-vaga`}
          className="tri-select"
          value={props.vagaId}
          onChange={(e) => props.aoMudarVaga(e.target.value)}
        >
          <option value="">Todas as vagas</option>
          {props.vagas.map((v) => (
            <option key={v.id} value={v.id}>
              {v.titulo}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* 1. Barra de estado da IA                                                   */
/* -------------------------------------------------------------------------- */

function BarraEstadoIa(props: {
  estadoIa: {
    configurada: boolean;
    motivo: string;
    modelo: string;
    pendentes: number;
    analisadas: number;
  };
  ocupado: boolean;
  progresso: { feitos: number; total: number } | null;
  /** Ids já analisados dentro do recorte — o que "refazer" reanalisa. */
  idsParaRefazer: string[];
  aoAnalisarTodas: (ids: string[], forcar: boolean) => void;
}) {
  const [refazer, setRefazer] = useState(false);
  /**
   * Passo de confirmação antes de gastar. Estado, e não `window.confirm`:
   * o diálogo nativo não cabe as três informações que importam (quantas, qual
   * modelo, quanto sai), some no celular e não é legível por leitor de tela do
   * jeito que o resto do painel é.
   */
  const [confirmando, setConfirmando] = useState(false);
  const estado = props.estadoIa;

  // Sem chave no servidor a tela inteira vira instrução de configuração: um
  // botão que só devolveria erro é pior do que botão nenhum.
  if (!estado.configurada) {
    return (
      <section aria-labelledby="rh-ia-desligada" className="tri-lamina">
        <div className="tri-cabeca">
          <div className="tri-titulo">
            <span className="tri-pastilha" data-tom="aviso" aria-hidden="true">
              <TriangleAlert size={20} />
            </span>
            <div>
              <h2 id="rh-ia-desligada">A leitura por IA está desligada</h2>
              {/*
                O nome exato da variável NÃO é escrito neste arquivo, e não é descuido:
                este componente vira um JavaScript estático que qualquer visitante
                baixa, com ou sem sessão. Quem precisa do nome o recebe do próprio
                servidor, dentro de `motivo` — que só existe depois do login, e por
                isso aparece logo aqui embaixo, em destaque, e não no rodapé.
              */}
              <p className="tri-sub">
                O servidor não encontrou a chave da OpenAI. Sem ela nada é lido, nada é analisado e
                nenhum currículo sai do lugar — o resto do painel continua funcionando normalmente.
              </p>
            </div>
          </div>
        </div>

        {estado.motivo.length > 0 ? (
          <p className="tri-aviso">
            <strong>O servidor relata:</strong> {estado.motivo}
          </p>
        ) : null}

        <ol className="tri-passos">
          <li>
            <span>
              Entre no painel da hospedagem: <strong>Vercel</strong> → projeto da clínica →{" "}
              <strong>Settings</strong> → <strong>Environment Variables</strong>.
            </span>
          </li>
          <li>
            <span>
              Clique em <strong>Add New</strong>, use exatamente o nome de variável que o servidor
              cita no aviso acima (ele está também no arquivo <code>.env.example</code> do projeto)
              e cole a chave da OpenAI no campo de valor.
            </span>
          </li>
          <li>
            <span>
              Marque os ambientes <strong>Production</strong> e <strong>Preview</strong> e salve.
            </span>
          </li>
          <li>
            <span>
              Faça um <strong>Redeploy</strong>: variável nova só vale para a próxima publicação.
            </span>
          </li>
        </ol>
        <p className="tri-nota-rodape" style={{ marginTop: 16 }}>
          Nunca escreva a chave aqui, em anotação de candidato ou em mensagem de WhatsApp. Ela vive
          só no servidor: esta tela jamais mostra o valor, nem inteiro nem em pedaço.
        </p>
      </section>
    );
  }

  const pendentes = estado.pendentes;
  const lote = Math.min(pendentes, LOTE_ANALISE);
  const progresso = props.progresso;
  const podeRefazer = props.idsParaRefazer.length > 0;
  /**
   * A marca de "refazer" não é levada em conta quando não há o que refazer.
   * Sem esta guarda, mudar o recorte com a caixa marcada deixaria o botão
   * travado escrevendo "Refazer 0 análises" — e o RH não teria como voltar
   * para a fila de pendentes sem desmarcar algo que ele nem lembra de ter
   * marcado.
   */
  const refazendo = refazer && podeRefazer;
  const alvo = refazendo ? props.idsParaRefazer : [];

  /** Quantas leituras este clique vai realmente pagar. */
  const quantidade = refazendo ? props.idsParaRefazer.length : pendentes;
  const custo = custoEstimado(estado.modelo, quantidade);
  const nada = props.ocupado || quantidade === 0;

  const rotuloBotao = props.ocupado
    ? "Analisando…"
    : refazendo
      ? `Refazer ${pluralizar(props.idsParaRefazer.length, "análise", "análises")}`
      : pendentes === 0
        ? "Nada pendente"
        : `Analisar as ${pendentes} pendentes`;

  return (
    <section aria-labelledby="rh-ia-estado" className="tri-lamina">
      <div className="tri-cabeca">
        <div className="tri-titulo">
          <span className="tri-pastilha" aria-hidden="true">
            <Sparkles size={20} />
          </span>
          <div>
            <h2 id="rh-ia-estado">Leitura por IA</h2>
            <p className="tri-sub">
              Modelo em uso: <strong>{estado.modelo || "—"}</strong>. A IA lê o currículo e julga;
              tempo de casa, lacunas e médias são calculados pelo sistema, não pelo modelo.
            </p>
          </div>
        </div>

        <div className="tri-acoes">
          <div className="tri-numeros">
            <p className="tri-numero">
              <strong>{estado.analisadas}</strong>
              <span>{estado.analisadas === 1 ? "analisada" : "analisadas"}</span>
            </p>
            <p className="tri-numero">
              <strong>{pendentes}</strong>
              <span>{pendentes === 1 ? "pendente" : "pendentes"}</span>
            </p>
          </div>
          {/* O botão NÃO dispara mais a análise: ele abre a confirmação. A
              ordem do cliente veio depois de um susto na fatura — nada de
              gastar antes de a pessoa ver quantas, com qual modelo e quanto. */}
          <button
            type="button"
            className={BTN_FORTE}
            disabled={nada}
            aria-expanded={confirmando}
            aria-controls="rh-ia-confirmar"
            onClick={() => setConfirmando(true)}
          >
            <ScanSearch aria-hidden="true" />
            {rotuloBotao}
          </button>
        </div>
      </div>

      {confirmando && !nada ? (
        <div
          id="rh-ia-confirmar"
          role="group"
          aria-label="Confirmar a análise em lote"
          className="tri-confirma"
        >
          <p>
            <TriangleAlert size={18} aria-hidden="true" className="shrink-0" />
            Confirma a leitura de {pluralizar(quantidade, "currículo", "currículos")}?
          </p>

          <dl>
            <div className="min-w-0">
              <dt>Serão analisadas</dt>
              <dd>{quantidade}</dd>
            </div>
            <div className="min-w-0">
              <dt>Modelo em uso</dt>
              <dd className="tri-mono">{estado.modelo || "—"}</dd>
            </div>
            <div className="min-w-0">
              <dt>Custo estimado</dt>
              {/* Modelo fora da tabela de preços não vira chute: a tela diz que
                  não sabe. Um número inventado aqui seria pior que nenhum — o
                  RH decidiria confiando nele. */}
              <dd>{custo.conhecido ? formatarDolar(custo.dolares) : "custo desconhecido"}</dd>
            </div>
          </dl>

          <p className="tri-confirma__texto">
            {custo.conhecido
              ? `Estimativa por cima de ${TOKENS_ENTRADA_POR_CURRICULO.toLocaleString("pt-BR")} tokens de entrada e ${TOKENS_SAIDA_POR_CURRICULO.toLocaleString("pt-BR")} de saída por currículo. O valor real varia com o tamanho de cada PDF; a cobrança é na conta da OpenAI da clínica, não aqui.`
              : `O painel não conhece o preço de “${estado.modelo || "—"}”, então não estima o gasto — e não chuta. Confira a tabela da OpenAI antes de rodar uma fila grande.`}
          </p>

          <div className="tri-acoes" style={{ marginTop: 16, gap: 8 }}>
            <button
              type="button"
              className={BTN_FORTE}
              onClick={() => {
                setConfirmando(false);
                props.aoAnalisarTodas(alvo, refazendo);
              }}
            >
              <ScanSearch aria-hidden="true" />
              Confirmar e analisar
            </button>
            <button type="button" className={BTN} onClick={() => setConfirmando(false)}>
              <X aria-hidden="true" />
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {/* Refazer é caixa, e não segundo botão: é a MESMA ação com outro alvo, e
          dois botões parecidos lado a lado convidam ao clique errado — que aqui
          custa token e reescreve análise que já estava boa. */}
      <label className="tri-refazer">
        <input
          type="checkbox"
          checked={refazendo}
          disabled={props.ocupado || !podeRefazer}
          onChange={(e) => {
            setRefazer(e.target.checked);
            // Fecha a confirmação: ela mostra QUANTAS e QUANTO, e marcar a
            // caixa muda os dois números. Confirmar uma conta que já não é a
            // que está escrita é exatamente o susto que este passo evita.
            setConfirmando(false);
          }}
        />
        Refazer análises já feitas do recorte escolhido abaixo
        {podeRefazer ? ` (${props.idsParaRefazer.length})` : " (nenhuma ainda)"}
      </label>

      {progresso && progresso.total > 0 ? (
        <div className="tri-progresso">
          <div className="tri-progresso__topo">
            <span>Lendo currículos…</span>
            <span>
              {progresso.feitos} de {progresso.total}
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progresso.feitos}
            aria-valuemin={0}
            aria-valuemax={progresso.total}
            aria-valuetext={`${progresso.feitos} de ${progresso.total} candidaturas analisadas`}
            aria-label="Progresso da análise por IA"
            className="tri-trilho"
          >
            <div
              style={{
                width: `${Math.round((progresso.feitos / progresso.total) * 100)}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      {pendentes > LOTE_ANALISE ? (
        <p className="tri-nota-rodape" style={{ marginTop: 12 }}>
          O servidor lê até {LOTE_ANALISE} currículos por vez — são duas leituras do modelo por
          ficha, e a fila inteira numa requisição só estouraria o tempo de resposta. O painel emenda
          as rodadas sozinho até zerar a fila (a primeira cuida de {lote}), e leva minutos com uma
          fila deste tamanho. Dá para continuar trabalhando enquanto isso, e cada rodada já fica
          gravada: se você fechar o painel no meio, nada do que foi lido se perde e o próximo clique
          retoma de onde parou.
        </p>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Importar currículos                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Mesma regra do `AreaUpload` e do servidor: a extensão manda, o mime é prova
 * adicional. Repetida aqui porque descobrir que o arquivo não serve depois de
 * subir 40 deles é um jeito cruel de dar a notícia.
 */
function motivoRecusa(arquivo: File): string {
  if (arquivo.size > TAMANHO_MAX_CURRICULO) {
    return `tem ${formatarTamanho(arquivo.size)} e o limite é ${formatarTamanho(
      TAMANHO_MAX_CURRICULO,
    )}`;
  }
  const nome = arquivo.name.trim().replace(/\\/g, "/").split("/").pop() ?? "";
  const corte = nome.lastIndexOf(".");
  const bruta = corte > 0 ? nome.slice(corte + 1) : "";
  const extensao = bruta.length > 0 ? `.${bruta.replace(/[^A-Za-z0-9]/g, "").toLowerCase()}` : "";
  if (!EXTENSOES_CURRICULO.includes(extensao)) {
    return "não é PDF, DOC, DOCX, JPG ou PNG";
  }
  return "";
}

function Importador(props: {
  vagas: Vaga[];
  iaConfigurada: boolean;
  ocupado: boolean;
  resultado: ResultadoImportacao | null;
  aoImportar: (arquivos: File[], area: AreaVaga | "", vagaId: string, analisar: boolean) => void;
}) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [sobre, setSobre] = useState(false);
  const [recusados, setRecusados] = useState<string[]>([]);
  const [area, setArea] = useState<AreaVaga | "">("");
  const [vagaId, setVagaId] = useState("");
  const [analisar, setAnalisar] = useState(true);

  const total = arquivos.reduce((soma, a) => soma + a.size, 0);
  const excedente = Math.max(0, arquivos.length - LIMITE_IMPORTACAO);

  const aceitar = (lista: FileList | null) => {
    if (!lista) return;
    const novos: File[] = [];
    const problemas: string[] = [];

    for (const arquivo of Array.from(lista)) {
      const recusa = motivoRecusa(arquivo);
      if (recusa.length > 0) {
        problemas.push(`${arquivo.name} — ${recusa}.`);
        continue;
      }
      // Repetido dentro da própria fila (a pessoa soltou a mesma pasta duas
      // vezes) é filtrado por nome+tamanho aqui, que é o que o navegador
      // consegue ver de graça. O de verdade — mesmo conteúdo, nome diferente —
      // quem pega é o servidor, pelo sha-256.
      const jaEstá =
        arquivos.some((a) => a.name === arquivo.name && a.size === arquivo.size) ||
        novos.some((a) => a.name === arquivo.name && a.size === arquivo.size);
      if (jaEstá) continue;
      novos.push(arquivo);
    }

    setRecusados(problemas);
    if (novos.length > 0) setArquivos((atual) => [...atual, ...novos]);
  };

  const aoSoltar = (evento: EventoArrastar<HTMLLabelElement>) => {
    evento.preventDefault();
    setSobre(false);
    aceitar(evento.dataTransfer.files);
  };

  const enviar = () => {
    if (arquivos.length === 0) return;
    props.aoImportar(arquivos.slice(0, LIMITE_IMPORTACAO), area, vagaId, analisar);
    // A fila é esvaziada no envio de propósito: mantê-la na tela convidaria a
    // um segundo clique que subiria tudo outra vez. O que aconteceu com cada
    // arquivo aparece no bloco de resultado logo abaixo.
    setArquivos([]);
    setRecusados([]);
  };

  const resultado = props.resultado;

  return (
    <section aria-labelledby="rh-importar" className="tri-lamina">
      <div className="tri-cabeca">
        <div className="tri-titulo">
          <span className="tri-pastilha" aria-hidden="true">
            <Upload size={20} />
          </span>
          <div>
            <h2 id="rh-importar">Importar currículos</h2>
            <p className="tri-sub">
              Para o acervo que chega por WhatsApp, e-mail ou pasta no computador. Cada arquivo vira
              uma ficha nova; o nome, o telefone e a experiência saem da própria leitura do
              documento.
            </p>
          </div>
        </div>
      </div>

      <div className="tri-importar">
        <div>
          {/* Input real dentro do label: é o que dá clique, Enter/Espaço e nome
              acessível de graça. Um <div> com .click() sairia da ordem de
              tabulação e não anunciaria nada a leitor de tela. */}
          <label
            className="tri-solta"
            data-sobre={sobre ? "true" : "false"}
            data-preenchido={arquivos.length > 0 ? "true" : "false"}
            onDragOver={(e) => {
              // Sem o preventDefault o navegador abre o PDF numa aba nova em vez
              // de entregá-lo ao drop.
              e.preventDefault();
              setSobre(true);
            }}
            onDragLeave={() => setSobre(false)}
            onDrop={aoSoltar}
          >
            <input
              id="rh-triagem-arquivos"
              type="file"
              multiple
              className="sr-only"
              accept={[...EXTENSOES_CURRICULO, ...TIPOS_CURRICULO].join(",")}
              onChange={(e) => {
                aceitar(e.target.files);
                // Zera para que escolher a MESMA pasta de novo ainda dispare o
                // onChange depois de uma remoção.
                e.target.value = "";
              }}
            />
            <span className="tri-pastilha" aria-hidden="true">
              <Upload size={22} />
            </span>
            <strong>Soltar currículos aqui</strong>
            <span className="tri-solta__dica">
              Vários de uma vez. PDF, DOC, DOCX, JPG ou PNG, até{" "}
              {formatarTamanho(TAMANHO_MAX_CURRICULO)} cada, no máximo {LIMITE_IMPORTACAO} por
              envio.
            </span>
          </label>

          {recusados.length > 0 ? (
            <ul role="alert" className="tri-alerta-lista">
              {recusados.map((r) => (
                <li key={r}>
                  <TriangleAlert size={14} aria-hidden="true" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {arquivos.length > 0 ? (
            <div>
              <div className="tri-fila-topo">
                <span>
                  {pluralizar(arquivos.length, "arquivo na fila", "arquivos na fila")} ·{" "}
                  {formatarTamanho(total)}
                </span>
                <button
                  type="button"
                  className="tri-btn tri-btn--link"
                  onClick={() => {
                    setArquivos([]);
                    setRecusados([]);
                  }}
                >
                  <RotateCcw aria-hidden="true" />
                  Limpar a fila
                </button>
              </div>

              <ul className="tri-arquivos">
                {arquivos.map((a, indice) => (
                  <li
                    key={`${a.name}-${a.size}-${indice}`}
                    className="tri-arquivo"
                    data-excede={indice >= LIMITE_IMPORTACAO ? "true" : "false"}
                  >
                    <FileText size={16} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="tri-arquivo__nome">{a.name}</span>
                      <span className="tri-arquivo__meta">
                        {formatarTamanho(a.size)}
                        {indice >= LIMITE_IMPORTACAO ? " · fica para o próximo envio" : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="tri-icone-btn"
                      onClick={() => setArquivos((atual) => atual.filter((_, i) => i !== indice))}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      <span className="sr-only">Tirar {a.name} da fila</span>
                    </button>
                  </li>
                ))}
              </ul>

              {excedente > 0 ? (
                <p role="alert" className="tri-alerta-lista">
                  {pluralizar(excedente, "arquivo passou", "arquivos passaram")} do limite de{" "}
                  {LIMITE_IMPORTACAO}. Este envio leva os primeiros {LIMITE_IMPORTACAO}; solte o
                  resto depois.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="tri-lado">
          <div className="tri-recortes">
            <SeletorRecorte
              id="rh-importar"
              area={area}
              vagaId={vagaId}
              vagas={props.vagas}
              rotuloArea="Área destes currículos"
              rotuloVaga="Vaga destes currículos"
              aoMudarArea={setArea}
              aoMudarVaga={(id) => {
                setVagaId(id);
                // Escolher a vaga já resolve a área: são 40 fichas nascendo de
                // uma vez, e uma área errada em todas custa uma triagem inteira.
                const vaga = props.vagas.find((v) => v.id === id);
                if (vaga) setArea(vaga.area);
              }}
            />
          </div>

          <label className="tri-opcao">
            <input
              type="checkbox"
              checked={analisar && props.iaConfigurada}
              disabled={!props.iaConfigurada}
              onChange={(e) => setAnalisar(e.target.checked)}
            />
            <span className="min-w-0">
              <strong>Analisar com IA ao importar</strong>
              <span>
                {props.iaConfigurada
                  ? "Cada currículo é lido e avaliado na hora. Sem isto, as fichas entram e ficam pendentes até você mandar analisar."
                  : "Indisponível: o servidor está sem a chave da OpenAI. As fichas entram e ficam pendentes."}
              </span>
            </span>
          </label>

          <p className="tri-nota-rodape">
            Arquivo repetido é detectado pelo <strong>conteúdo</strong>, e não pelo nome: o mesmo
            PDF salvo como “curriculo (1).pdf” em outra pasta é reconhecido e pulado, e dois
            arquivos diferentes com o mesmo nome entram os dois.
          </p>

          <button
            type="button"
            className={BTN_FORTE}
            disabled={arquivos.length === 0 || props.ocupado}
            onClick={enviar}
          >
            <Upload aria-hidden="true" />
            {props.ocupado
              ? "Enviando…"
              : `Importar ${pluralizar(
                  Math.min(arquivos.length, LIMITE_IMPORTACAO),
                  "currículo",
                  "currículos",
                )}`}
          </button>
        </div>
      </div>

      {resultado ? (
        <div role="status" className="tri-resultado">
          <Check size={20} aria-hidden="true" />
          <div>
            <p>
              {pluralizar(resultado.criadas, "ficha criada", "fichas criadas")} ·{" "}
              {pluralizar(resultado.duplicadas, "repetida pulada", "repetidas puladas")} ·{" "}
              {pluralizar(resultado.erros.length, "arquivo recusado", "arquivos recusados")}
            </p>
            {resultado.erros.length > 0 ? (
              <ul>
                {resultado.erros.map((e) => (
                  <li key={`${e.arquivo}-${e.motivo}`}>
                    <X size={14} aria-hidden="true" />
                    <span>
                      <strong>{e.arquivo}</strong> — {e.motivo}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Ranking                                                                 */
/* -------------------------------------------------------------------------- */

type LinhaRanking = {
  posicao: number;
  porque: string;
  item: Candidatura;
  analise: AnaliseIa;
  notas: Map<ChaveCriterio, number>;
};

function CelulaCriterio(props: { chave: ChaveCriterio; nota: number | undefined }) {
  if (props.nota === undefined) {
    return (
      <td className="tri-centro">
        <span className="tri-nota" data-faixa="sem">
          <span aria-hidden="true">—</span>
          <span className="sr-only">Sem nota de {ROTULO_CRITERIO[props.chave]}</span>
        </span>
      </td>
    );
  }
  const faixa = faixaDaNota(props.nota);
  return (
    <td className="tri-centro">
      <span className="tri-nota" data-faixa={faixa.faixa}>
        <span aria-hidden="true">{formatarNota(props.nota)}</span>
        <span className="sr-only">
          {ROTULO_CRITERIO[props.chave]}: {formatarNota(props.nota)} de 10, {faixa.rotulo}
        </span>
      </span>
    </td>
  );
}

function BlocoRanking(props: {
  ranking: RankingIa | null;
  linhas: LinhaRanking[];
  vagas: Vaga[];
  area: AreaVaga | "";
  vagaId: string;
  ocupado: boolean;
  temAnalises: boolean;
  aoMudarArea: (area: AreaVaga | "") => void;
  aoMudarVaga: (vagaId: string) => void;
  aoGerarRanking: (area: AreaVaga | "", vagaId: string) => void;
  aoAbrir: (id: string) => void;
}) {
  const { linhas } = props;

  const porId = useMemo(() => new Map(linhas.map((l) => [l.item.id, l])), [linhas]);
  const shortlist = useMemo(() => {
    const ranking = props.ranking;
    if (!ranking) return [];
    return ranking.shortlist
      .map((id) => porId.get(id))
      .filter((l): l is LinhaRanking => l !== undefined);
  }, [props.ranking, porId]);

  const aoClicarLinha = (e: EventoMouse<HTMLTableRowElement>, id: string) => {
    const alvo = e.target as HTMLElement | null;
    if (alvo?.closest("button, a, select, input, label")) return;
    props.aoAbrir(id);
  };

  const aoTeclarLinha = (e: EventoTeclado<HTMLTableRowElement>, id: string) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    props.aoAbrir(id);
  };

  return (
    <section aria-labelledby="rh-ranking" className="tri-lamina">
      <div className="tri-cabeca">
        <div className="tri-titulo">
          <span className="tri-pastilha" aria-hidden="true">
            <Trophy size={20} />
          </span>
          <div>
            <h2 id="rh-ranking">Ranking da vaga</h2>
            <p className="tri-sub">
              Compara as candidatas já analisadas de um mesmo recorte e devolve uma ordem com o
              porquê de cada posição. É a leitura do conjunto: quem está na frente, e em relação a
              quem.
            </p>
          </div>
        </div>
      </div>

      <div className="tri-recortes">
        <SeletorRecorte
          id="rh-ranking"
          area={props.area}
          vagaId={props.vagaId}
          vagas={props.vagas}
          rotuloArea="Área"
          rotuloVaga="Vaga"
          aoMudarArea={props.aoMudarArea}
          aoMudarVaga={props.aoMudarVaga}
        />
        <button
          type="button"
          className={BTN_FORTE}
          disabled={props.ocupado || !props.temAnalises}
          onClick={() => props.aoGerarRanking(props.area, props.vagaId)}
        >
          <Trophy aria-hidden="true" />
          {props.ocupado ? "Comparando…" : "Gerar ranking"}
        </button>
      </div>

      {!props.temAnalises ? (
        <Vazio icone={ScanSearch} titulo="Nenhuma candidatura analisada neste recorte">
          O ranking compara análises prontas — rode a leitura por IA lá em cima (ou mude a área e a
          vaga) e volte aqui.
        </Vazio>
      ) : !props.ranking ? (
        <Vazio icone={Trophy} titulo="Nenhum ranking gerado ainda">
          O botão manda as análises deste recorte para o modelo comparar uma com a outra e devolve:
          uma ordem de quem chamar primeiro, o motivo de cada posição e uma leitura do grupo
          inteiro. As notas individuais que você já vê na lista abaixo não mudam.
        </Vazio>
      ) : linhas.length === 0 ? (
        <Vazio icone={Inbox} titulo="Ninguém do ranking aparece neste recorte">
          O ranking existe, mas nenhuma das candidatas dele aparece no recorte escolhido agora.
          Volte a área e a vaga para as que estavam quando ele foi gerado, ou gere um novo.
        </Vazio>
      ) : (
        <>
          {shortlist.length > 0 ? (
            <>
              <h3 className="tri-subtitulo">Entrevistar primeiro</h3>
              <ul className="tri-top">
                {shortlist.map((l) => (
                  <li key={l.item.id}>
                    <button
                      type="button"
                      onClick={() => props.aoAbrir(l.item.id)}
                      className="tri-top__item"
                    >
                      <span className="tri-top__quem">
                        <span aria-hidden="true" className="tri-pos">
                          {l.posicao}
                        </span>
                        <Avatar nome={l.item.nome} />
                        <span>
                          <span className="tri-nome">{l.item.nome || "Sem nome"}</span>
                          <span className="tri-meta">{rotuloVaga(l.item)}</span>
                        </span>
                      </span>
                      <span className="tri-top__nota">
                        <EstrelasNota valor={l.analise.estrelas} />
                        <span>nota {l.analise.notaGeral}</span>
                      </span>
                      <span className="tri-top__porque">
                        {l.porque || l.analise.resumoUmaLinha}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {props.ranking.observacaoGeral.trim().length > 0 ? (
            <p className="tri-leitura">
              <Sparkles size={18} aria-hidden="true" />
              <span>
                <strong>Leitura do grupo: </strong>
                {props.ranking.observacaoGeral}
              </span>
            </p>
          ) : null}

          {/* ---- Tabela comparativa (a partir de 900px) ---- */}
          <div className="tri-tabela-wrap">
            <div className="rh-scroll tri-tabela-rolagem">
              <table className="tri-tabela">
                <caption className="sr-only">
                  Ranking das candidatas analisadas, da primeira à última posição. Cada critério
                  vale de 0 a 10. Enter abre a ficha da linha em foco.
                </caption>
                <thead>
                  <tr>
                    {/* A tabela tem uma ordem só — a do ranking —, e é isso que
                        o aria-sort declara. Não há botão de reordenar de
                        propósito: mexer na ordem jogaria fora justamente o que o
                        modelo comparou. */}
                    <th scope="col" aria-sort="ascending">
                      #
                    </th>
                    <th scope="col">Candidata</th>
                    <th scope="col">Nota</th>
                    {CHAVES_CRITERIO.map((chave) => (
                      <th key={chave} scope="col" className="tri-centro">
                        <abbr title={ROTULO_CRITERIO[chave]} className="no-underline">
                          {CURTO_CRITERIO[chave]}
                        </abbr>
                      </th>
                    ))}
                    <th scope="col">Sinais</th>
                    <th scope="col">Por que nesta posição</th>
                    <th scope="col">
                      <span className="sr-only">Abrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    /* A linha inteira responde a Enter e Espaço, mas continua
                       sendo uma <tr>: ela contém o selo de sinais (uma lista) e
                       um botão, e nada disso pode morar dentro de um <button>.
                       Por isso tabIndex na linha e "Abrir" explícito no fim. */
                    <tr
                      key={l.item.id}
                      tabIndex={0}
                      onClick={(e) => aoClicarLinha(e, l.item.id)}
                      onKeyDown={(e) => aoTeclarLinha(e, l.item.id)}
                    >
                      <td className="tri-posicao">{l.posicao}</td>
                      <td>
                        <span className="tri-quem">
                          <Avatar nome={l.item.nome} />
                          <span>
                            <span className="tri-nome">{l.item.nome || "Sem nome"}</span>
                            <span className="tri-meta">{rotuloVaga(l.item)}</span>
                          </span>
                        </span>
                      </td>
                      <td className="tri-geral">
                        <span className="tri-nota-geral">
                          <span>
                            {l.analise.notaGeral}
                            <small>/100</small>
                          </span>
                          <EstrelasNota valor={l.analise.estrelas} />
                        </span>
                      </td>
                      {CHAVES_CRITERIO.map((chave) => (
                        <CelulaCriterio key={chave} chave={chave} nota={l.notas.get(chave)} />
                      ))}
                      <td>
                        <SeloSinais sinais={l.analise.sinais} />
                      </td>
                      <td className="tri-porque">{l.porque || l.analise.resumoUmaLinha || "—"}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => props.aoAbrir(l.item.id)}
                          className="tri-abrir"
                        >
                          <span className="sr-only">
                            Abrir a ficha de {l.item.nome || "candidata"}
                          </span>
                          <ChevronRight size={18} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ---- Cartões empilhados (até 900px) ----
              Treze colunas num celular viram um arrastar infinito para a direita
              só para descobrir a nota de coerência.

              O cartão inteiro não é um <button>: ele contém o selo de sinais, que
              é lista, e lista dentro de botão é HTML inválido — o teclado ficaria
              preso. O alvo clicável é o botão do rodapé. */}
          <ul className="tri-cartoes">
            {linhas.map((l) => (
              <li key={l.item.id} className="tri-cartao">
                <div className="tri-cartao__topo">
                  <span aria-hidden="true" className="tri-pos">
                    {l.posicao}
                  </span>
                  <Avatar nome={l.item.nome} />
                  <span>
                    <span className="tri-nome">{l.item.nome || "Sem nome"}</span>
                    <span className="tri-meta">{rotuloVaga(l.item)}</span>
                  </span>
                  <span className="tri-pontos">
                    <EstrelasNota valor={l.analise.estrelas} />
                    <b>{l.analise.notaGeral}/100</b>
                  </span>
                </div>

                <div className="tri-criterios">
                  {CHAVES_CRITERIO.map((chave) => {
                    const nota = l.notas.get(chave);
                    const faixa = nota === undefined ? null : faixaDaNota(nota);
                    return (
                      <span key={chave} data-faixa={faixa ? faixa.faixa : "sem"}>
                        <small>{CURTO_CRITERIO[chave]}</small>
                        <b>{nota === undefined ? "—" : formatarNota(nota)}</b>
                        <span className="sr-only">
                          {ROTULO_CRITERIO[chave]}:{" "}
                          {nota === undefined ? "sem nota" : `${formatarNota(nota)} de 10`}
                        </span>
                      </span>
                    );
                  })}
                </div>

                <SeloSinais sinais={l.analise.sinais} />

                <p className="tri-top__porque">{l.porque || l.analise.resumoUmaLinha}</p>

                <button
                  type="button"
                  onClick={() => props.aoAbrir(l.item.id)}
                  className={`${BTN} justify-self-start`}
                >
                  Abrir a ficha
                  <span className="sr-only"> de {l.item.nome || "candidata"}</span>
                  <ChevronRight aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Quem entrevistar primeiro                                               */
/* -------------------------------------------------------------------------- */

type ItemFila = { item: Candidatura; analise: AnaliseIa };
type GrupoFila = { valor: RecomendacaoIa; rotulo: string; itens: ItemFila[] };

/**
 * O texto que o dono da clínica cola no WhatsApp da equipe.
 *
 * Formato pedido por ele, sem tradução: nome, estrelas, pontos fortes, pontos
 * de atenção, minha impressão e perguntas que eu faria. Texto puro de verdade —
 * nada de asterisco, hífen de lista markdown ou tabela, que o WhatsApp
 * transforma em negrito ou embaralha na quebra de linha do celular.
 */
function textoDaLista(entrada: { grupos: GrupoFila[]; agora: Date; recorte: string }): string {
  const linhas: string[] = [];
  const total = entrada.grupos.reduce((soma, g) => soma + g.itens.length, 0);

  linhas.push("TRIAGEM DE CURRÍCULOS — JP Clínica Integrada Odontológica");
  linhas.push(entrada.recorte);
  linhas.push(
    `${formatarData(entrada.agora.toISOString())} · ${pluralizar(
      total,
      "candidata analisada",
      "candidatas analisadas",
    )}`,
  );

  // Numeração contínua entre os grupos: quem lê no celular fala "a candidata 4",
  // e reiniciar a contagem em cada grupo criaria duas candidatas 1.
  let n = 0;

  for (const grupo of entrada.grupos) {
    if (grupo.itens.length === 0) continue;
    linhas.push("");
    linhas.push("————————————————");
    linhas.push(`${grupo.rotulo.toUpperCase()} (${grupo.itens.length})`);
    linhas.push("————————————————");

    for (const { item, analise } of grupo.itens) {
      n += 1;
      linhas.push("");
      linhas.push(`Candidata ${n} — ${item.nome || "Sem nome"}`);
      linhas.push(
        `${pluralizar(analise.estrelas, "estrela", "estrelas")} · nota ${analise.notaGeral} de 100 · ${rotuloVaga(item)}`,
      );
      linhas.push(`Último emprego: ${textoUltimoEmprego(analise)}`);
      if (item.telefone.trim().length > 0) linhas.push(`Telefone: ${item.telefone}`);

      if (analise.pontosFortes.length > 0) {
        linhas.push("");
        linhas.push("Pontos fortes:");
        for (const p of analise.pontosFortes) linhas.push(`• ${p}`);
      }

      if (analise.pontosAtencao.length > 0) {
        linhas.push("");
        linhas.push("Pontos de atenção:");
        for (const p of analise.pontosAtencao) linhas.push(`• ${p}`);
      }

      if (analise.impressao.trim().length > 0) {
        linhas.push("");
        linhas.push("Minha impressão:");
        linhas.push(analise.impressao.trim());
      }

      if (analise.perguntasEntrevista.length > 0) {
        linhas.push("");
        linhas.push("Perguntas que eu faria:");
        analise.perguntasEntrevista.forEach((p, i) => {
          linhas.push(`${i + 1}. ${p.pergunta}`);
          if (p.porque.trim().length > 0) linhas.push(`   (para saber: ${p.porque.trim()})`);
        });
      }
    }
  }

  linhas.push("");
  linhas.push("————————————————");
  linhas.push(
    "Leitura feita por IA sobre o que está escrito no currículo. Serve para escolher a ordem das entrevistas, nunca para decidir sozinha.",
  );

  return linhas.join("\n");
}

function FilaEntrevistas(props: {
  grupos: GrupoFila[];
  agora: Date;
  recorte: string;
  /** Quantas candidaturas existem no recorte, analisadas ou não. */
  totalRecorte: number;
  totalGeral: number;
  aoAbrir: (id: string) => void;
}) {
  // "Talvez" e "Descartar" nascem fechados: a fila útil é o topo, e as duas
  // últimas listas juntas costumam ser maiores que as duas primeiras.
  const [abertos, setAbertos] = useState<Record<RecomendacaoIa, boolean>>({
    "entrevistar-ja": true,
    entrevistar: true,
    talvez: false,
    descartar: false,
  });
  const [copia, setCopia] = useState<"" | "ok" | "manual">("");
  const [texto, setTexto] = useState("");

  const total = props.grupos.reduce((soma, g) => soma + g.itens.length, 0);

  const copiar = useCallback(() => {
    const conteudo = textoDaLista({
      grupos: props.grupos,
      agora: props.agora,
      recorte: props.recorte,
    });
    setTexto(conteudo);

    // `navigator.clipboard` não existe em contexto sem HTTPS e pode ser negado
    // por permissão. Em vez de falhar em silêncio, a tela devolve o texto num
    // campo já selecionável — copiar na mão é pior, mas é possível.
    const area = navigator.clipboard;
    if (!area) {
      setCopia("manual");
      return;
    }
    area
      .writeText(conteudo)
      .then(() => setCopia("ok"))
      .catch(() => setCopia("manual"));
  }, [props.grupos, props.agora, props.recorte]);

  return (
    <section aria-labelledby="rh-fila" className="tri-lamina">
      <div className="tri-cabeca">
        <div className="tri-titulo">
          <span className="tri-pastilha" aria-hidden="true">
            <ListChecks size={20} />
          </span>
          <div>
            <h2 id="rh-fila">Quem entrevistar primeiro</h2>
            <p className="tri-sub">
              Sai direto das análises já feitas, sem depender de ranking: primeiro pela
              recomendação, depois pela nota. {props.recorte}
            </p>
          </div>
        </div>

        {total > 0 ? (
          <button type="button" className={BTN} onClick={copiar}>
            {copia === "ok" ? <Check aria-hidden="true" /> : <ClipboardCopy aria-hidden="true" />}
            {copia === "ok" ? "Lista copiada" : "Exportar esta lista"}
          </button>
        ) : null}
      </div>

      {copia === "manual" ? (
        <div className="tri-copia">
          <label htmlFor="rh-fila-texto">
            O navegador não deixou copiar sozinho. Selecione tudo aqui dentro e copie na mão:
          </label>
          <textarea id="rh-fila-texto" readOnly rows={8} value={texto} />
        </div>
      ) : null}

      {props.totalGeral === 0 ? (
        <Vazio icone={Inbox} titulo="Nenhuma candidatura no portal ainda">
          Publique uma vaga ou importe o acervo de currículos aqui em cima — a fila de entrevistas
          nasce das análises dessas fichas.
        </Vazio>
      ) : props.totalRecorte === 0 ? (
        <Vazio icone={Inbox} titulo="Nenhuma candidatura neste recorte">
          Nenhuma candidatura na área e na vaga escolhidas. Volte o recorte para “todas” e a lista
          aparece.
        </Vazio>
      ) : total === 0 ? (
        <Vazio icone={ScanSearch} titulo="Falta rodar a leitura por IA">
          {pluralizar(props.totalRecorte, "candidatura espera", "candidaturas esperam")} leitura
          neste recorte. Rode a análise por IA lá em cima: é ela que gera as estrelas, os pontos de
          atenção e a ordem desta fila.
        </Vazio>
      ) : (
        <div className="tri-grupos">
          {props.grupos.map((grupo) => {
            const r = recomendacaoPor(grupo.valor);
            return (
              <details
                key={grupo.valor}
                open={abertos[grupo.valor]}
                onToggle={(e) => {
                  // O valor é lido AQUI, e não dentro do updater do setState.
                  //
                  // `e.currentTarget` só é válido enquanto o manipulador roda. O
                  // updater é chamado depois, na fase de render, e a essa altura
                  // o React já zerou o campo — dava
                  // "Cannot read properties of null (reading 'open')" e derrubava
                  // a aba inteira no error boundary, sem nada no console além do
                  // stack minificado.
                  const aberto = e.currentTarget.open;
                  setAbertos((atual) => ({ ...atual, [grupo.valor]: aberto }));
                }}
                className="tri-grupo"
              >
                <summary>
                  <span className={`rh-pilula ${r.pilulaClara}`}>{r.rotulo}</span>
                  <span>{pluralizar(grupo.itens.length, "candidata", "candidatas")}</span>
                  <ChevronRight size={18} aria-hidden="true" />
                </summary>

                {grupo.itens.length === 0 ? (
                  <p className="tri-nota-rodape" style={{ padding: "0 16px 16px" }}>
                    Ninguém neste grupo.
                  </p>
                ) : (
                  <ul className="tri-pessoas">
                    {grupo.itens.map(({ item, analise }) => {
                      const destaques = sinaisDeDestaque(analise.sinais);
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => props.aoAbrir(item.id)}
                            className="tri-pessoa"
                          >
                            <span className="tri-pessoa__topo">
                              <Avatar nome={item.nome} />
                              <span>
                                <span className="tri-nome">{item.nome || "Sem nome"}</span>
                                <span className="tri-meta">
                                  {rotuloVaga(item)} · {rotuloArea(item.area)}
                                </span>
                              </span>
                              <span className="tri-pontos">
                                <EstrelasNota valor={analise.estrelas} />
                                <b>nota {analise.notaGeral}</b>
                              </span>
                            </span>

                            <span className="tri-pessoa__emprego">
                              <strong>Último emprego:</strong> {textoUltimoEmprego(analise)}
                            </span>

                            {destaques.length > 0 ? (
                              <span className="tri-pessoa__alertas">
                                {destaques.map((s) => (
                                  <span key={s.chave} className="tri-alerta">
                                    <TriangleAlert size={13} aria-hidden="true" />
                                    {s.titulo}
                                  </span>
                                ))}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* A aba                                                                      */
/* -------------------------------------------------------------------------- */

export function AbaTriagem(props: {
  itens: Candidatura[];
  vagas: Vaga[];
  agora: Date;
  estadoIa: {
    configurada: boolean;
    motivo: string;
    modelo: string;
    pendentes: number;
    analisadas: number;
  };
  ocupado: boolean;
  progresso: { feitos: number; total: number } | null;
  ranking: RankingIa | null;
  /** Opcional: ver `ResultadoImportacao`. Ausente, o bloco de resultado não aparece. */
  resultadoImportacao?: ResultadoImportacao | null;
  aoAnalisarTodas: (ids: string[], forcar: boolean) => void;
  aoGerarRanking: (area: AreaVaga | "", vagaId: string) => void;
  aoImportar: (arquivos: File[], area: AreaVaga | "", vagaId: string, analisar: boolean) => void;
  aoAbrir: (id: string) => void;
}) {
  // O recorte é um só para o ranking e para a fila de propósito: são a mesma
  // pergunta ("quem chamo para esta vaga?") vista de dois jeitos, e dois pares
  // de seletores discordando entre si já confundiu gente em painel bom.
  const [area, setArea] = useState<AreaVaga | "">("");
  const [vagaId, setVagaId] = useState("");

  const { itens, vagas, agora } = props;

  /** Candidaturas do recorte. Arquivada fica de fora: já saiu do processo. */
  const doRecorte = useMemo(
    () =>
      itens.filter((c) => {
        if (c.arquivada) return false;
        if (area !== "" && c.area !== area) return false;
        if (vagaId !== "" && c.vagaId !== vagaId) return false;
        return true;
      }),
    [itens, area, vagaId],
  );

  /**
   * Só quem tem análise sem erro entra na comparação. Uma ficha cuja leitura
   * falhou tem `analise` preenchida (é assim que a tela consegue dizer "tente de
   * novo"), mas nota zero — e ela apareceria no fim da fila como se fosse
   * julgamento sobre a pessoa, quando o que houve foi um PDF corrompido.
   */
  const analisadas = useMemo(() => {
    const lista: ItemFila[] = [];
    for (const item of doRecorte) {
      const analise = item.analise;
      if (!analise || analise.erro.length > 0) continue;
      lista.push({ item, analise });
    }
    return lista;
  }, [doRecorte]);

  const idsParaRefazer = useMemo(() => analisadas.map((a) => a.item.id), [analisadas]);

  const grupos = useMemo((): GrupoFila[] => {
    const ordem = new Map(analisadas.map((a, i) => [a.item.id, i]));
    return RECOMENDACOES.map((r) => ({
      valor: r.valor,
      rotulo: r.rotulo,
      itens: analisadas
        .filter((a) => a.analise.recomendacao === r.valor)
        .sort((a, b) => {
          if (b.analise.notaGeral !== a.analise.notaGeral) {
            return b.analise.notaGeral - a.analise.notaGeral;
          }
          if (b.analise.estrelas !== a.analise.estrelas) {
            return b.analise.estrelas - a.analise.estrelas;
          }
          // Empate resolvido pela ordem de chegada da lista, não pelo nome:
          // ordenar por nome faria "Ana" ganhar de "Zuleica" sem nenhum motivo.
          return (ordem.get(a.item.id) ?? 0) - (ordem.get(b.item.id) ?? 0);
        }),
    }));
  }, [analisadas]);

  /** Linhas do ranking, já casadas com a ficha e renumeradas pela posição. */
  const linhasRanking = useMemo((): LinhaRanking[] => {
    const ranking = props.ranking;
    if (!ranking) return [];
    const porId = new Map(analisadas.map((a) => [a.item.id, a]));
    const linhas: LinhaRanking[] = [];

    for (const entrada of [...ranking.ordem].sort((a, b) => a.posicao - b.posicao)) {
      const achada = porId.get(entrada.id);
      if (!achada) continue;
      linhas.push({
        posicao: entrada.posicao,
        porque: entrada.porque,
        item: achada.item,
        analise: achada.analise,
        notas: notasPorCriterio(achada.analise),
      });
    }
    return linhas;
  }, [props.ranking, analisadas]);

  const recorte = useMemo(() => {
    const partes: string[] = [];
    if (area !== "") partes.push(rotuloArea(area));
    const vaga = vagas.find((v) => v.id === vagaId);
    if (vaga) partes.push(vaga.titulo);
    return partes.length > 0 ? `Recorte: ${partes.join(" · ")}` : "Recorte: todas as áreas e vagas";
  }, [area, vagaId, vagas]);

  return (
    <div className="rh-triagem">
      <BarraEstadoIa
        estadoIa={props.estadoIa}
        ocupado={props.ocupado}
        progresso={props.progresso}
        idsParaRefazer={idsParaRefazer}
        aoAnalisarTodas={props.aoAnalisarTodas}
      />

      <Importador
        vagas={vagas}
        iaConfigurada={props.estadoIa.configurada}
        ocupado={props.ocupado}
        resultado={props.resultadoImportacao ?? null}
        aoImportar={props.aoImportar}
      />

      <BlocoRanking
        ranking={props.ranking}
        linhas={linhasRanking}
        vagas={vagas}
        area={area}
        vagaId={vagaId}
        ocupado={props.ocupado}
        temAnalises={analisadas.length > 0}
        aoMudarArea={setArea}
        aoMudarVaga={(id) => {
          setVagaId(id);
          const vaga = vagas.find((v) => v.id === id);
          if (vaga) setArea(vaga.area);
        }}
        aoGerarRanking={props.aoGerarRanking}
        aoAbrir={props.aoAbrir}
      />

      <FilaEntrevistas
        grupos={grupos}
        agora={agora}
        recorte={recorte}
        totalRecorte={doRecorte.length}
        totalGeral={itens.length}
        aoAbrir={props.aoAbrir}
      />

      <p className="tri-pe">
        <Users size={16} aria-hidden="true" />
        Tudo nesta aba é leitura de currículo por IA sobre o que a própria candidata escreveu. Serve
        para escolher a ordem das entrevistas e as perguntas — a decisão de contratar continua sendo
        de quem conversa com a pessoa.
      </p>
    </div>
  );
}
