/**
 * Os alertas da triagem, em tela.
 *
 * O dono da clínica pediu que a IA "sinalizasse tudo". Este componente é o
 * "tudo" — e a única regra que ele não pode quebrar é a da hierarquia: o RH lê
 * de cima para baixo e precisa bater o olho no crítico antes de qualquer coisa.
 * Por isso os sinais vêm agrupados por severidade, na ordem de `SEVERIDADES`, e
 * não na ordem em que o motor os gerou.
 *
 * Superfície escura de propósito: os dois lugares onde ele aparece — a gaveta
 * do candidato e o cartão do kanban — são verde profundo. Daí as pílulas saírem
 * sempre na variante `pilulaEscura` do catálogo, que por ordem do cliente vem
 * com a letra branca: em cima de verde, letra branca, sem exceção. A cor da
 * gravidade continua viva no ícone e no anel de cada pílula, que não são letra.
 *
 * Nada de cor sozinha: cada severidade tem ícone próprio, rótulo por extenso e
 * a contagem em número. Quem não distingue o rosé do âmbar continua lendo
 * "2 críticos, 1 atenção".
 */
import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Info,
  OctagonAlert,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { contarPorSeveridade } from "@/lib/rh/ia/sinais";
import { SEVERIDADES, severidadePor } from "@/lib/rh/ia/tipos";
import type { ItemSeveridade, Sinal } from "@/lib/rh/ia/tipos";

/**
 * `SEVERIDADES` guarda o ícone por nome (o catálogo é puro e não pode importar
 * React); a tradução nome -> componente mora aqui, que é quem renderiza.
 */
const ICONES: Record<string, LucideIcon> = {
  OctagonAlert,
  TriangleAlert,
  CircleAlert,
  CircleHelp,
  Info,
};

function iconeDe(nome: string): LucideIcon {
  return ICONES[nome] ?? Info;
}

const PILULA_CONTAGEM =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-bold leading-none";

/* -------------------------------------------------------------------------- */
/* Selo de contagem                                                           */
/* -------------------------------------------------------------------------- */

/**
 * As pílulas de contagem, sem os textos. É o que cabe num cartão de kanban de
 * 240px: quantos alertas de cada gravidade, e nada mais.
 *
 * Devolve `null` quando não há sinal nenhum — o cartão do kanban também é usado
 * por quem ainda não foi analisado, e um selo "sem alertas" ali afirmaria algo
 * que ninguém verificou. A frase positiva é responsabilidade do `PainelSinais`,
 * que só aparece quando a análise existe.
 */
export function SeloSinais(props: { sinais: Sinal[] }) {
  const { sinais } = props;
  const contagem = contarPorSeveridade(sinais);
  const visiveis = SEVERIDADES.filter((s) => contagem[s.valor] > 0);
  if (visiveis.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-1">
      {visiveis.map((s) => {
        const Icone = iconeDe(s.icone);
        const n = contagem[s.valor];
        return (
          <li key={s.valor} className={`${PILULA_CONTAGEM} ${s.pilulaEscura}`}>
            <Icone className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span aria-hidden="true">{n}</span>
            <span className="sr-only">
              {n} {n === 1 ? "alerta" : "alertas"} de gravidade {s.rotulo.toLowerCase()}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Painel completo                                                            */
/* -------------------------------------------------------------------------- */

function LinhaSinal(props: { sinal: Sinal; severidade: ItemSeveridade }) {
  const { sinal, severidade } = props;
  const Icone = iconeDe(severidade.icone);

  return (
    <li className="rounded-xl bg-white/[0.05] p-3 ring-1 ring-white/10">
      <div className="flex gap-2.5">
        <span
          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${severidade.pilulaEscura}`}
        >
          <Icone className="h-3.5 w-3.5" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-snug text-white">
            {sinal.titulo}
            {/* A gravidade já está no cabeçalho do grupo, mas quem navega por
                leitor de tela salta de item em item e chega aqui sem ele. */}
            <span className="sr-only"> — gravidade {severidade.rotulo.toLowerCase()}</span>
          </p>

          <p className="mt-0.5 text-sm leading-relaxed text-white/85">{sinal.detalhe}</p>

          {sinal.evidencias.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5">
              {sinal.evidencias.map((e) => (
                // Evidência é o fato que sustenta o alerta: é para ser lido, então
                // 85% de branco, o piso do projeto, e não os 55% de antes.
                <li key={e} className="text-xs leading-relaxed text-white/85">
                  · {e}
                </li>
              ))}
            </ul>
          ) : null}

          {/* O que vira roteiro de entrevista fica destacado: é a única parte do
              alerta que a clínica leva para a conversa com a candidata. */}
          {sinal.perguntar !== "" ? (
            /* A tarja é lime translúcido sobre o verde profundo — fundo verde,
               logo letra branca. O "perguntar:" continua se destacando pelo
               peso da fonte e pelo anel de lime, que não é letra. */
            <p className="mt-2 rounded-lg bg-lime/10 px-2.5 py-1.5 text-xs leading-relaxed ring-1 ring-lime/30">
              <strong className="font-bold text-white">perguntar: </strong>
              <span className="text-white/85">{sinal.perguntar}</span>
            </p>
          ) : null}

          {/* Precisa aparecer na tela, e não só na conta: a nota é o número que
              o RH usa para justificar uma decisão, e há sinais que ele TEM de
              ver mas não pode usar contra ninguém — dado sensível (LGPD e
              não-discriminação) e os de logística, que falam do arquivo ou do
              trajeto, não da candidata. Sem esta marca, quem lê "morar longe"
              logo abaixo de "nota 62" conclui sozinho que uma coisa causou a
              outra, e passa a decidir por um critério que a clínica não pode
              defender se for questionada. */}
          {!sinal.contaNaNota ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[0.66rem] font-bold uppercase tracking-[0.08em] text-white/85 ring-1 ring-white/25">
              <Info className="h-3 w-3 shrink-0" aria-hidden="true" />
              não influenciou a nota
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function PainelSinais(props: { sinais: Sinal[]; compacto?: boolean }) {
  const { sinais } = props;
  const compacto = props.compacto === true;

  if (sinais.length === 0) {
    /* Vazio nunca é silêncio: "nada de atenção" é uma informação que o RH quer
       ler, e um bloco em branco só faz a pessoa se perguntar se carregou. */
    return (
      /* Fundo lime sobre verde: a frase sai branca, e o verde da marca fica no
         anel e no ícone de visto — que continuam dizendo "está tudo certo" sem
         precisar tingir a letra. */
      <p
        className={
          compacto
            ? `${PILULA_CONTAGEM} bg-lime/15 text-white ring-1 ring-lime/45`
            : "flex items-center gap-2 rounded-xl bg-lime/10 px-3 py-2.5 text-sm font-semibold text-white ring-1 ring-lime/30"
        }
      >
        <CircleCheck
          className={compacto ? "h-3 w-3 shrink-0 text-lime" : "h-4 w-4 shrink-0 text-lime"}
          aria-hidden="true"
        />
        {compacto ? "sem alertas" : "Nada de atenção no currículo."}
      </p>
    );
  }

  if (compacto) return <SeloSinais sinais={sinais} />;

  const contagem = contarPorSeveridade(sinais);
  const grupos = SEVERIDADES.filter((s) => contagem[s.valor] > 0);

  return (
    <div className="space-y-4">
      {grupos.map((sev) => {
        const Icone = iconeDe(sev.icone);
        const doGrupo = sinais.filter((s) => s.severidade === sev.valor);
        return (
          <section key={sev.valor} aria-label={`Alertas de gravidade ${sev.rotulo.toLowerCase()}`}>
            <h4 className="flex items-center gap-2">
              <span className={`${PILULA_CONTAGEM} ${sev.pilulaEscura}`}>
                <Icone className="h-3 w-3 shrink-0" aria-hidden="true" />
                {sev.rotulo}
              </span>
              <span className="text-xs font-semibold text-white/85">
                {doGrupo.length} {doGrupo.length === 1 ? "alerta" : "alertas"}
              </span>
            </h4>

            <ul className="mt-2 space-y-2">
              {/* `chave` se repete quando o mesmo tipo de alerta vale para dois
                  vínculos diferentes; o título entra na key para desempatar. */}
              {doGrupo.map((s) => (
                <LinhaSinal
                  key={`${s.chave}-${s.titulo}`}
                  sinal={s}
                  severidade={severidadePor(s.severidade)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
