/**
 * A leitura da IA dentro da gaveta do candidato.
 *
 * É o bloco que a clínica olha antes de decidir se liga para alguém, e ele
 * precisa responder duas perguntas em cinco segundos: **vale a pena?** e **o que
 * eu pergunto?**. Daí a ordem: nota e recomendação primeiro, alertas logo
 * abaixo, e as perguntas da entrevista com um botão para levar o roteiro para o
 * telefone.
 *
 * O que este arquivo NÃO faz: conta. Todo mês, média e lacuna já chegaram
 * prontos de `calcularMetricas` e `sinaisDeCalculo`; a nota geral já veio
 * ponderada pela rubrica da vaga. Aqui só se desenha o que foi decidido em
 * outro lugar — inclusive `agora`, que desce por prop congelado pela rota, pelo
 * mesmo motivo do resto da gaveta: `new Date()` no render sai diferente no
 * servidor e no navegador e derruba a hidratação.
 *
 * A superfície é o verde profundo da gaveta, e sobre verde toda LETRA é branca —
 * regra do cliente. O lime continua carregando a marca onde não é texto: ícones,
 * barras de critério, anéis e bordas. As pílulas do catálogo entram na variante
 * `pilulaEscura`. Branco de apoio nunca desce de 85%: abaixo disso o texto
 * pequeno some no verde profundo.
 */
import { useEffect, useId, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  Copy,
  History,
  LoaderCircle,
  Quote,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Star,
  ThumbsUp,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatarDataHora, tempoRelativo } from "@/lib/rh/formatar";
import { CHAVES_CRITERIO } from "@/lib/rh/ia/rubricas";
import { VERSAO_ANALISE, recomendacaoPor } from "@/lib/rh/ia/tipos";
import type { AnaliseIa, ChaveCriterio, CriterioIa } from "@/lib/rh/ia/tipos";
import type { Candidatura } from "@/lib/rh/tipos";
import { LinhaDoTempoEmpregos } from "./LinhaDoTempoEmpregos";
import { PainelSinais } from "./PainelSinais";

/* -------------------------------------------------------------------------- */
/* Constantes de estilo e catálogos de tela                                   */
/* -------------------------------------------------------------------------- */

/**
 * Métrica de `.rh-rotulo`, com a cor invertida para o fundo escuro.
 *
 * Branco, e não lime: sobre o verde do vidro toda LETRA é branca por decisão do
 * cliente. O lime segue nos ícones, nas barras e nos anéis das pílulas.
 */
const ROTULO = "text-[0.68rem] font-bold uppercase tracking-[0.14em] text-white";

const BOTAO =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold ring-1 transition";
const BOTAO_PRINCIPAL = `${BOTAO} bg-lime text-brand-deep ring-lime hover:bg-lime/85`;
const BOTAO_SECUNDARIO = `${BOTAO} bg-white/10 text-white ring-white/20 hover:bg-white/20`;

const NOTAS = [1, 2, 3, 4, 5];

/**
 * Rótulo e uma linha de contexto por critério.
 *
 * O contexto existe porque "aderência 6/10" não diz nada sozinho: o RH precisa
 * saber que aquele número está respondendo "a experiência anterior serve para a
 * recepção de uma clínica odontológica?".
 */
const CRITERIOS: Record<ChaveCriterio, { rotulo: string; ajuda: string }> = {
  permanencia: {
    rotulo: "Permanência",
    ajuda: "Quanto tempo ela costuma ficar em cada emprego — e no último.",
  },
  aderencia: {
    rotulo: "Aderência à vaga",
    ajuda: "Se a experiência anterior serve para esta vaga, nesta clínica.",
  },
  atendimento: {
    rotulo: "Atendimento ao público",
    ajuda: "Trato com paciente, telefone, WhatsApp e sala de espera cheia.",
  },
  administrativo: {
    rotulo: "Rotina administrativa",
    ajuda: "Agenda, sistemas, confirmação, caixa e organização.",
  },
  progressao: {
    rotulo: "Progressão profissional",
    ajuda: "Se a carreira subiu, andou de lado ou voltou atrás.",
  },
  coerencia: {
    rotulo: "Coerência da trajetória",
    ajuda: "Idade, datas e histórico contando a mesma história.",
  },
};

/**
 * O que a tela diz enquanto o modelo trabalha.
 *
 * São dois passes de API e a coisa leva perto de meio minuto: um spinner mudo
 * nesse tempo passa a impressão de travado. Os passos são os reais, na ordem em
 * que acontecem — só não são cronometrados, então trocam por tempo, não por
 * evento. Melhor uma expectativa honesta do que uma barra de progresso falsa.
 */
const PASSOS = [
  "Lendo o currículo página por página…",
  "Calculando o tempo em cada emprego…",
  "Conferindo datas, lacunas e sobreposições…",
  "Avaliando pela rubrica da vaga…",
  "Escrevendo as perguntas da entrevista…",
];

/* -------------------------------------------------------------------------- */
/* Helpers puros                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Separador de milhar à mão em vez de `toLocaleString`: o número aparece no
 * HTML do servidor e no do navegador, e basta um ICU diferente entre os dois
 * para o React reclamar de divergência na hidratação por causa de um ponto.
 */
function milhar(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** O roteiro como ele vai para o WhatsApp de quem vai entrevistar. */
function textoDasPerguntas(item: Candidatura, analise: AnaliseIa): string {
  const nome = item.nome.trim() === "" ? "candidata" : item.nome.trim();
  const linhas = [
    `Perguntas para a entrevista — ${nome}`,
    `Leitura da IA em ${formatarDataHora(analise.analisadoEm)} · ${analise.modelo}`,
    "",
  ];
  analise.perguntasEntrevista.forEach((p, i) => {
    linhas.push(`${i + 1}. ${p.pergunta}`);
    if (p.porque.trim() !== "") linhas.push(`   para saber: ${p.porque}`);
    linhas.push("");
  });
  linhas.push("Apoio à decisão — confirme tudo na conversa.");
  return linhas.join("\n");
}

/**
 * `navigator.clipboard` some fora de contexto seguro (o painel roda em rede
 * local da clínica com frequência) e o Safari antigo ainda depende do
 * `execCommand`. Sem o segundo caminho, o botão simplesmente não faria nada em
 * metade dos computadores da recepção.
 */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // Sem contexto seguro ou sem permissão: cai no caminho antigo abaixo.
  }

  try {
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    // Fora da tela, mas ainda focável: `display:none` impediria a seleção.
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Peças                                                                      */
/* -------------------------------------------------------------------------- */

function Estrelas(props: { nota: number }) {
  const { nota } = props;
  return (
    <span
      role="img"
      aria-label={`${nota} de 5 ${nota === 1 ? "estrela" : "estrelas"}`}
      className="inline-flex items-center gap-0.5"
    >
      {NOTAS.map((n) => (
        <Star
          key={n}
          className={n <= nota ? "h-6 w-6 text-lime" : "h-6 w-6 text-white/25"}
          fill={n <= nota ? "currentColor" : "none"}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

/**
 * Uma barra de critério.
 *
 * O número aparece sempre, ao lado do rótulo: a barra é o atalho para o olho,
 * nunca o único portador da informação — em 3/10 e 5/10 a diferença de largura
 * some numa tela de 360px, e some de vez para quem imprime.
 */
function BarraCriterio(props: { chave: ChaveCriterio; criterio: CriterioIa | null }) {
  const { chave, criterio } = props;
  const meta = CRITERIOS[chave];
  const nota = criterio ? Math.max(0, Math.min(10, criterio.nota)) : null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-bold text-white">{meta.rotulo}</p>
        <p className="shrink-0 text-sm font-extrabold tabular-nums text-white">
          {nota == null ? "—" : `${nota}/10`}
          <span className="sr-only"> pontos</span>
        </p>
      </div>

      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
        {/* Não é `.rh-progresso`: aquele trilho é creme, desenhado para o
            formulário público, e no vidro escuro daqui cada barra viraria um
            bloco de luz. A métrica (altura, raio) é a mesma. */}
        <div
          className="h-full rounded-full bg-lime transition-[width] duration-500"
          style={{ width: `${(nota ?? 0) * 10}%` }}
        />
      </div>

      <p className="mt-1.5 text-sm leading-relaxed text-white/85">
        {criterio && criterio.justificativa.trim() !== "" ? criterio.justificativa : meta.ajuda}
      </p>

      {criterio && criterio.evidencias.length > 0 ? (
        /* As evidências são o que sustenta a nota, mas são seis blocos de citação
           por candidata: dentro de um <details> elas ficam a um clique de quem
           está conferindo, sem empurrar as perguntas da entrevista para longe. */
        <details className="mt-1.5">
          <summary className="inline-flex min-h-8 cursor-pointer items-center text-xs font-bold text-white">
            ver evidências ({criterio.evidencias.length})
          </summary>
          <ul className="mt-1 space-y-0.5 border-l border-lime/30 pl-2.5">
            {criterio.evidencias.map((e) => (
              <li key={e} className="text-xs leading-relaxed text-white/85">
                {e}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function ListaComIcone(props: {
  titulo: string;
  itens: string[];
  icone: LucideIcon;
  corIcone: string;
  vazio: string;
}) {
  const { titulo, itens, icone: Icone, corIcone, vazio } = props;
  return (
    <section aria-label={titulo}>
      <h4 className={ROTULO}>{titulo}</h4>
      {itens.length === 0 ? (
        <p className="mt-2 text-sm text-white/85">{vazio}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {itens.map((t) => (
            <li key={t} className="flex gap-2 text-sm leading-relaxed text-white/85">
              {/* Ícone próprio por coluna, e não só a cor do texto: as duas
                  listas ficam lado a lado no desktop e viram uma coluna só no
                  celular, onde a proximidade deixa de separar as duas. */}
              <Icone className={`mt-0.5 h-4 w-4 shrink-0 ${corIcone}`} aria-hidden="true" />
              <span className="min-w-0">{t}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Componente público                                                         */
/* -------------------------------------------------------------------------- */

export function LeituraIa(props: {
  item: Candidatura;
  agora: Date;
  analisando: boolean;
  aoAnalisar: (forcar: boolean) => void;
  /**
   * Estado da chave da OpenAI. Opcional porque nem toda tela que abre a gaveta
   * já carregou `estadoIa()` — quando não vem, o cartão simplesmente oferece o
   * botão e a falha (se houver) aparece depois, escrita na própria análise.
   * Quando vem e a IA não está configurada, mostramos o motivo no lugar do
   * botão: um botão que nunca vai funcionar é pior que nenhum.
   */
  estadoIa?: { configurada: boolean; motivo: string };
}) {
  const { item, agora, analisando, aoAnalisar } = props;
  const analise = item.analise;
  const uid = useId();

  const [passo, setPasso] = useState(0);
  const [copiado, setCopiado] = useState<"" | "sim" | "nao">("");
  const refTempoCopia = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!analisando) return undefined;
    setPasso(0);
    const t = setInterval(() => setPasso((p) => (p + 1) % PASSOS.length), 5200);
    return () => clearInterval(t);
  }, [analisando]);

  useEffect(() => {
    return () => {
      if (refTempoCopia.current !== null) clearTimeout(refTempoCopia.current);
    };
  }, []);

  const configurada = props.estadoIa === undefined || props.estadoIa.configurada;

  async function copiarPerguntas() {
    if (!analise) return;
    const ok = await copiarTexto(textoDasPerguntas(item, analise));
    setCopiado(ok ? "sim" : "nao");
    if (refTempoCopia.current !== null) clearTimeout(refTempoCopia.current);
    refTempoCopia.current = setTimeout(() => setCopiado(""), 4000);
  }

  /* ---------------------------------------------------------------- cabeçalho */

  const titulo = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3
        id={`${uid}-titulo`}
        className="flex items-center gap-2 font-display text-[0.72rem] font-extrabold uppercase tracking-[0.14em] text-white"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
        Leitura da IA
      </h3>

      {analise && !analisando ? (
        <button
          type="button"
          onClick={() => aoAnalisar(true)}
          className={`${BOTAO_SECUNDARIO} min-h-9 px-3 text-xs`}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Reanalisar
        </button>
      ) : null}
    </div>
  );

  /* ------------------------------------------------------------------ estados */

  // Analisando sem nada gravado ainda: a tela inteira é a espera.
  if (analisando && !analise) {
    return (
      <section aria-labelledby={`${uid}-titulo`} className="rh-vidro p-4 sm:p-5">
        {titulo}
        <div className="mt-3 flex items-center gap-3">
          <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-lime" aria-hidden="true" />
          <div className="min-w-0">
            {/* aria-live polite: o texto troca sozinho, e quem usa leitor de tela
                precisa saber que algo continua acontecendo — sem interromper. */}
            <p role="status" aria-live="polite" className="text-sm font-bold text-white">
              {PASSOS[passo] ?? PASSOS[0]}
            </p>
            <p className="mt-0.5 text-xs text-white/85">
              São duas leituras completas do currículo: costuma levar cerca de 30 segundos.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Nunca analisada: o convite.
  if (!analise) {
    return (
      <section aria-labelledby={`${uid}-titulo`} className="rh-vidro p-4 sm:p-5">
        {titulo}
        <p className="mt-2 text-sm leading-relaxed text-white/85">
          A IA lê o currículo anexado, calcula quanto tempo a candidata ficou em cada emprego
          (principalmente no último), confere datas e lacunas e aponta o que perguntar na
          entrevista.
        </p>

        {configurada ? (
          <button
            type="button"
            onClick={() => aoAnalisar(false)}
            className={`${BOTAO_PRINCIPAL} mt-3`}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Analisar este currículo
          </button>
        ) : (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-300/10 p-3 text-sm leading-relaxed text-amber-100 ring-1 ring-amber-200/30">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong className="font-bold">A triagem por IA está desligada.</strong>{" "}
              {props.estadoIa?.motivo ?? ""}
            </span>
          </p>
        )}
      </section>
    );
  }

  /* -------------------------------------------------------------- com análise */

  const rec = recomendacaoPor(analise.recomendacao);
  const desatualizada = analise.versao !== VERSAO_ANALISE;
  const quando = formatarDataHora(analise.analisadoEm);
  const relativo = tempoRelativo(analise.analisadoEm, agora);
  const tokens = analise.tokensEntrada + analise.tokensSaida;

  return (
    <section aria-labelledby={`${uid}-titulo`} className="rh-vidro p-4 sm:p-5">
      {titulo}

      {/* ---------- Reanálise em curso, com a leitura antiga ainda na tela ----------
          Trocar tudo por um spinner apagaria justamente o que a pessoa está
          conferindo enquanto espera. A faixa avisa; o resto continua legível. */}
      {analisando ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 flex items-center gap-2 rounded-xl bg-lime/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-lime/25"
        >
          <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-lime" aria-hidden="true" />
          {PASSOS[passo] ?? PASSOS[0]}
        </p>
      ) : null}

      {/* ---------- Falha da última tentativa ---------- */}
      {analise.erro !== "" ? (
        <div className="mt-3 rounded-xl bg-rose-300/10 p-3 ring-1 ring-rose-200/30">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-rose-100">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong className="font-bold">A análise não terminou.</strong> {analise.erro}
            </span>
          </p>
          {!analisando ? (
            <button
              type="button"
              onClick={() => aoAnalisar(true)}
              className={`${BOTAO_SECUNDARIO} mt-2.5 min-h-9 px-3 text-xs`}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Tentar de novo
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ---------- Versão antiga da rubrica ---------- */}
      {desatualizada ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-300/10 p-3 text-sm leading-relaxed text-amber-100 ring-1 ring-amber-200/30">
          <History className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Esta leitura é de uma versão anterior da triagem (v{analise.versao}, a atual é v
            {VERSAO_ANALISE}). Os critérios mudaram desde então — reanalise antes de comparar com as
            outras candidatas.
          </span>
        </p>
      ) : null}

      {/* ---------- a) Cabeçalho do veredito ---------- */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Estrelas nota={analise.estrelas} />
            <p className="font-display text-2xl font-extrabold leading-none tabular-nums text-white">
              {analise.notaGeral}
              <span className="text-base font-bold text-white/85">/100</span>
            </p>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${rec.pilulaEscura}`}
            >
              {rec.rotulo}
            </span>
          </div>

          {analise.resumoUmaLinha.trim() !== "" ? (
            <p className="mt-2 text-sm font-semibold leading-relaxed text-white">
              {analise.resumoUmaLinha}
            </p>
          ) : null}
        </div>

        <p className="text-right text-[0.7rem] leading-relaxed text-white/85">
          {quando === "" ? "analisado" : `analisado em ${quando}`}
          {relativo === "" ? "" : ` (${relativo})`}
          {analise.modelo === "" ? null : (
            <>
              <br />
              {analise.modelo}
            </>
          )}
        </p>
      </div>

      {/* ---------- b) As seis barras ---------- */}
      {analise.criterios.length > 0 ? (
        <div className="mt-4 space-y-3.5 border-t border-white/10 pt-4">
          {/* Sempre as seis, na ordem canônica da rubrica: critério que o modelo
              deixou de responder aparece como "—", e não some da tela — some,
              o RH acharia que a nota geral saiu de cinco critérios. */}
          {CHAVES_CRITERIO.map((c) => (
            <BarraCriterio
              key={c}
              chave={c}
              criterio={analise.criterios.find((k) => k.chave === c) ?? null}
            />
          ))}
        </div>
      ) : null}

      {/* ---------- c) Sinais ---------- */}
      <div className="mt-4 border-t border-white/10 pt-4">
        <h4 className={ROTULO}>Sinalizações</h4>
        <div className="mt-2">
          <PainelSinais sinais={analise.sinais} />
        </div>
      </div>

      {/* ---------- d) Linha do tempo ---------- */}
      <div className="mt-4 border-t border-white/10 pt-4">
        <h4 className={ROTULO}>Trajetória</h4>
        <div className="mt-2">
          <LinhaDoTempoEmpregos metricas={analise.metricas} agora={agora} />
        </div>
      </div>

      {/* ---------- e) Fortes e atenção ---------- */}
      <div className="mt-4 grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-2">
        <ListaComIcone
          titulo="Pontos fortes"
          itens={analise.pontosFortes}
          icone={ThumbsUp}
          corIcone="text-lime"
          vazio="Nada que se destaque no currículo."
        />
        <ListaComIcone
          titulo="Pontos de atenção"
          itens={analise.pontosAtencao}
          icone={ShieldAlert}
          corIcone="text-amber-200"
          vazio="Nada a esclarecer além do que já está acima."
        />
      </div>

      {/* ---------- f) Impressão ---------- */}
      {analise.impressao.trim() !== "" ? (
        <blockquote className="mt-4 rounded-xl border-l-4 border-lime bg-white/[0.05] p-3.5">
          <p className="flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.12em] text-white">
            <Quote className="h-3 w-3 shrink-0 text-lime" aria-hidden="true" />
            Minha impressão
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-white">{analise.impressao}</p>
        </blockquote>
      ) : null}

      {/* ---------- g) Perguntas da entrevista ---------- */}
      {analise.perguntasEntrevista.length > 0 ? (
        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className={ROTULO}>Perguntas que eu faria</h4>
            <button
              type="button"
              onClick={() => void copiarPerguntas()}
              className={`${BOTAO_SECUNDARIO} min-h-9 px-3 text-xs`}
            >
              {copiado === "sim" ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              copiar as perguntas
            </button>
          </div>

          {/* Confirmação visível, e não só o ícone trocado: o botão fica no alto
              do bloco e quem clicou já rolou para as perguntas. */}
          <p role="status" aria-live="polite" className="mt-1 text-xs font-semibold text-white">
            {copiado === "sim" ? "Perguntas copiadas para a área de transferência." : ""}
            {copiado === "nao" ? (
              <span className="text-amber-200">
                Não consegui copiar neste navegador — selecione o texto abaixo à mão.
              </span>
            ) : null}
          </p>

          <ol className="mt-2 space-y-2.5">
            {analise.perguntasEntrevista.map((p, i) => (
              <li key={p.pergunta} className="flex gap-2.5">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lime/15 text-xs font-extrabold tabular-nums text-white ring-1 ring-lime/30">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-relaxed text-white">{p.pergunta}</p>
                  {p.porque.trim() !== "" ? (
                    <p className="mt-0.5 text-xs leading-relaxed text-white/85">
                      para saber: {p.porque}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {/* ---------- h) Rodapé ----------
          O aviso é obrigatório e fica junto do número: quem lê "82/100" precisa
          ler, na mesma linha de visão, que isso é apoio — não decisão. */}
      <footer className="mt-4 border-t border-white/10 pt-3">
        <p className="text-[0.7rem] leading-relaxed text-white/85">
          Confiança da leitura: {analise.confianca}% · {milhar(tokens)} tokens (
          {milhar(analise.tokensEntrada)} de entrada, {milhar(analise.tokensSaida)} de saída)
        </p>
        <p className="mt-1 text-[0.7rem] font-semibold leading-relaxed text-white/85">
          Esta leitura é apoio à decisão humana: ela não substitui a entrevista nem decide
          contratação sozinha.
        </p>
      </footer>
    </section>
  );
}
