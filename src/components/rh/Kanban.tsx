import { useMemo, useRef, useState, type DragEvent } from "react";
import {
  Archive,
  ArrowRight,
  Clock,
  GripVertical,
  Sparkles,
  Star,
  TriangleAlert,
} from "lucide-react";

import { MolduraCoroa } from "@/components/site/sistema/Coroa";
import { useAlturaAteOFimDaJanela } from "@/components/rh/useAlturaDaJanela";
import { duvidasImportantesDe } from "@/lib/rh/duvidas";
import { leiturasDeDuvidas } from "@/lib/rh/ficha";
import { iniciais, tempoRelativo } from "@/lib/rh/formatar";
import { AREAS, STATUS, STATUS_INICIAL, statusPor } from "@/lib/rh/opcoes";
import { recomendacaoPor } from "@/lib/rh/ia/tipos";
import type { Candidatura, StatusCandidatura } from "@/lib/rh/tipos";

function rotuloArea(area: string): string {
  return AREAS.find((item) => item.valor === area)?.rotulo ?? "Sem área";
}

function subtituloDe(item: Candidatura): string {
  return item.vagaTitulo.trim() || item.cargoDesejado.trim() || "Candidatura espontânea";
}

function avaliacaoDe(item: Candidatura) {
  const analise = item.analise;
  const iaValida = analise !== null && analise.erro.length === 0;

  return {
    notaRh: item.nota > 0 ? item.nota : null,
    notaIa: iaValida ? analise.estrelas : null,
    recomendacao: iaValida ? recomendacaoPor(analise.recomendacao) : null,
    erroIa: analise !== null && analise.erro.length > 0,
  };
}

function alertasDe(item: Candidatura): number {
  const leituras = leiturasDeDuvidas(item.ficha);
  return duvidasImportantesDe(item, leituras);
}

function LinhaCandidato(props: {
  item: Candidatura;
  agora: Date;
  selecionada: boolean;
  arrastando: boolean;
  aoAbrir: (id: string) => void;
  aoSelecionar: (id: string, marcada: boolean) => void;
  aoMoverStatus: (id: string, status: StatusCandidatura) => void;
  aoIniciarArrasto: (id: string) => void;
  aoTerminarArrasto: () => void;
}) {
  const { item } = props;
  const avaliacao = avaliacaoDe(item);
  const alertas = alertasDe(item);

  return (
    <article
      draggable
      data-arrastando={props.arrastando ? "true" : "false"}
      onDragStart={(event: DragEvent<HTMLElement>) => {
        event.dataTransfer.setData("text/plain", item.id);
        event.dataTransfer.effectAllowed = "move";
        props.aoIniciarArrasto(item.id);
      }}
      onDragEnd={props.aoTerminarArrasto}
      className={`group grid min-h-[72px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-tinta/[0.07] px-4 py-2.5 transition-colors last:border-b-0 hover:bg-chao sm:px-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(8rem,.72fr)_minmax(7.5rem,.65fr)_minmax(7.5rem,.62fr)_minmax(9.25rem,.82fr)_auto] ${
        props.selecionada ? "bg-chao-2" : "bg-white"
      } ${props.arrastando ? "opacity-50" : ""}`}
    >
      <div className="col-span-2 flex min-w-0 items-center gap-3 xl:col-span-1">
        <GripVertical
          size={15}
          aria-hidden="true"
          className="hidden shrink-0 cursor-grab text-tinta-suave/40 transition-colors group-hover:text-tinta-suave lg:block"
        />

        <label className="relative z-[2] flex shrink-0 cursor-pointer items-center before:absolute before:-inset-3.5 before:content-['']">
          <input
            type="checkbox"
            checked={props.selecionada}
            onChange={(event) => props.aoSelecionar(item.id, event.target.checked)}
            className="h-5 w-5 rounded border-tinta/30 accent-[var(--campo-marca)]"
          />
          <span className="sr-only">Selecionar {item.nome || "candidatura sem nome"}</span>
        </label>

        <MolduraCoroa
          proporcao={1}
          aria-hidden="true"
          className="grid w-10 shrink-0 place-items-center bg-chao-3 text-xs font-semibold text-tinta"
        >
          <span>{iniciais(item.nome) || "?"}</span>
        </MolduraCoroa>

        <button
          type="button"
          onClick={() => props.aoAbrir(item.id)}
          className="min-h-11 min-w-0 flex-1 rounded-lg text-left"
        >
          <span className="block truncate text-[0.9375rem] font-semibold leading-tight text-tinta">
            {item.nome || "Sem nome"}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-tinta-suave">
            {/* Só o cargo: a área entra como dica, porque cargo e área juntos
                se cortavam um ao outro em reticências. */}
            <span className="truncate" title={rotuloArea(item.area)}>
              {subtituloDe(item)}
            </span>
            {item.arquivada ? (
              <span className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-chao-2 px-2 py-0.5 text-xs font-semibold text-tinta-suave">
                <Archive size={10} aria-hidden="true" />
                Arquivada
              </span>
            ) : null}
          </span>
        </button>
      </div>

      <div
        className={`col-span-2 flex items-center gap-2 xl:col-span-1 xl:justify-start ${
          avaliacao.notaRh === null && avaliacao.notaIa === null && !avaliacao.erroIa
            ? "max-xl:hidden"
            : ""
        }`}
      >
        {avaliacao.notaRh !== null ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
            <Star size={11} fill="currentColor" aria-hidden="true" />
            RH {avaliacao.notaRh}/5
          </span>
        ) : null}
        {avaliacao.notaIa !== null ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-tinta-suave">
            <Sparkles size={11} aria-hidden="true" className="text-forest" />
            IA {avaliacao.notaIa}/5
          </span>
        ) : avaliacao.erroIa ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-800">
            <TriangleAlert size={11} aria-hidden="true" />
            IA falhou
          </span>
        ) : (
          <span className="text-xs text-tinta-suave">Sem avaliação</span>
        )}
      </div>

      <div className={`col-span-2 xl:col-span-1 ${alertas > 0 ? "" : "max-xl:hidden"}`}>
        {alertas > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-800">
            <TriangleAlert size={11} aria-hidden="true" />
            {alertas} {alertas === 1 ? "alerta" : "alertas"}
          </span>
        ) : (
          <span className="text-xs text-tinta-suave">Sem alertas</span>
        )}
      </div>

      <div className="col-span-2 flex items-center gap-1.5 text-[0.8125rem] text-tinta-suave xl:col-span-1">
        <Clock size={12} aria-hidden="true" />
        {tempoRelativo(item.criadoEm, props.agora)}
      </div>

      <div className="min-w-0">
        <label className="sr-only" htmlFor={`status-${item.id}`}>
          Etapa de {item.nome || "candidatura"}
        </label>
        <select
          id={`status-${item.id}`}
          value={item.status}
          onChange={(event) =>
            props.aoMoverStatus(item.id, event.target.value as StatusCandidatura)
          }
          className="h-11 w-full rounded-xl border border-tinta/25 bg-white px-2.5 text-sm font-medium text-tinta"
        >
          {STATUS.map((status) => (
            <option key={status.valor} value={status.valor}>
              {status.rotulo}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={() => props.aoAbrir(item.id)}
        className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-chao-2 px-4 text-sm font-semibold text-tinta transition hover:bg-chao-3"
      >
        Abrir
        <ArrowRight size={13} aria-hidden="true" />
      </button>
    </article>
  );
}

export function Kanban(props: {
  itens: Candidatura[];
  agora: Date;
  selecionadas: string[];
  aoAbrir: (id: string) => void;
  aoSelecionar: (id: string, marcada: boolean) => void;
  aoMoverStatus: (id: string, status: StatusCandidatura) => void;
}) {
  const statusInicial = props.itens[0]?.status ?? STATUS_INICIAL.valor;
  const [statusAtivo, setStatusAtivo] = useState<StatusCandidatura>(statusInicial);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [destino, setDestino] = useState<StatusCandidatura | null>(null);
  const refPainel = useRef<HTMLDivElement>(null);
  const altura = useAlturaAteOFimDaJanela(refPainel, "0.75rem", "25rem");

  const porStatus = useMemo(
    () =>
      STATUS.map((status) => ({
        status,
        itens: props.itens.filter((item) => item.status === status.valor),
      })),
    [props.itens],
  );

  /* O `find` sempre acha: `statusAtivo` é um valor do funil e `porStatus` cobre
     o funil inteiro. O fallback existe para o compilador, e devolve a etapa
     vazia em vez de um `undefined` que estouraria as duas linhas de baixo. */
  const grupoAtivo = porStatus.find((grupo) => grupo.status.valor === statusAtivo) ?? {
    status: statusPor(statusAtivo),
    itens: [] as Candidatura[],
  };
  const statusMeta = grupoAtivo.status;
  const itensAtivos = grupoAtivo.itens;
  const selecionadasNaEtapa = itensAtivos.filter((item) =>
    props.selecionadas.includes(item.id),
  ).length;

  const soltarNaEtapa = (event: DragEvent<HTMLElement>, status: StatusCandidatura) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain") || arrastando;
    setDestino(null);
    setArrastando(null);
    if (!id) return;

    const item = props.itens.find((candidato) => candidato.id === id);
    if (!item || item.status === status) {
      setStatusAtivo(status);
      return;
    }

    props.aoMoverStatus(id, status);
    setStatusAtivo(status);
  };

  return (
    <div className="jp-container py-3">
      <div
        ref={refPainel}
        style={altura === "" ? undefined : { maxHeight: altura }}
        className="flex min-h-[25rem] flex-col overflow-hidden rounded-2xl bg-white"
      >
        <div className="px-4 pb-3 pt-4 sm:px-5">
          <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-tinta">Etapas do funil</h2>
            </div>
            <p className="text-sm text-tinta-suave">
              Escolha uma etapa para ver as pessoas. Arraste uma pessoa até outra etapa para
              movê-la.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 min-[1760px]:grid-cols-8">
            {porStatus.map(({ status, itens }) => {
              const ativa = status.valor === statusAtivo;
              const alvo = destino === status.valor;

              return (
                <button
                  key={status.valor}
                  type="button"
                  aria-pressed={ativa}
                  onClick={() => setStatusAtivo(status.valor)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDestino(status.valor);
                  }}
                  onDragLeave={(event) => {
                    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                    setDestino((atual) => (atual === status.valor ? null : atual));
                  }}
                  onDrop={(event) => soltarNaEtapa(event, status.valor)}
                  className={`group relative min-w-0 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    ativa
                      ? "border-transparent bg-chao-3"
                      : "border-transparent bg-chao hover:bg-chao-2"
                  } ${alvo ? "ring-2 ring-tinta ring-offset-1" : ""}`}
                >
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 shrink-0 rounded-full ${status.ponto}`}
                      />
                      <span className="truncate text-sm font-semibold text-tinta">
                        {status.rotulo}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                        ativa ? "bg-tinta text-sobre-campo" : "bg-chao-2 text-tinta"
                      }`}
                    >
                      {itens.length}
                    </span>
                  </div>

                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-forest transition-[width]"
                      style={{
                        width: `${String(
                          props.itens.length === 0
                            ? 0
                            : Math.max(4, Math.round((itens.length / props.itens.length) * 100)),
                        )}%`,
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <section className="flex min-h-0 flex-1 flex-col bg-white" aria-label={statusMeta.rotulo}>
          <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusMeta.ponto}`}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-base font-semibold text-tinta">
                    {statusMeta.rotulo}
                  </h3>
                  <span className="rounded-full bg-chao-2 px-2 py-0.5 text-xs font-semibold tabular-nums text-tinta">
                    {itensAtivos.length}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm text-tinta-suave">{statusMeta.descricao}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-tinta-suave">
              {selecionadasNaEtapa > 0 ? (
                <span className="rounded-full bg-chao-3 px-2.5 py-1 font-semibold text-tinta">
                  {selecionadasNaEtapa} selecionada{selecionadasNaEtapa === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
          </header>

          <div className="hidden grid-cols-[minmax(0,1.7fr)_minmax(8rem,.72fr)_minmax(7.5rem,.65fr)_minmax(7.5rem,.62fr)_minmax(9.25rem,.82fr)_auto] items-center gap-3 bg-chao px-5 py-2 text-xs font-medium text-tinta-suave xl:grid">
            <span className="pl-[72px]">Candidato</span>
            <span>Avaliação</span>
            <span>Alertas</span>
            <span>Recebido</span>
            <span>Etapa</span>
            <span className="sr-only">Ação</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {itensAtivos.length === 0 ? (
              <div className="flex h-full min-h-44 flex-col items-center justify-center px-6 text-center">
                <span
                  className={`mb-3 h-3 w-3 rounded-full ${statusMeta.ponto}`}
                  aria-hidden="true"
                />
                <p className="text-base font-semibold text-tinta">{statusMeta.vazio}</p>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-tinta-suave">
                  A etapa continua visível no topo e também funciona como destino para arrastar
                  candidatos.
                </p>
              </div>
            ) : (
              itensAtivos.map((item) => (
                <LinhaCandidato
                  key={item.id}
                  item={item}
                  agora={props.agora}
                  selecionada={props.selecionadas.includes(item.id)}
                  arrastando={arrastando === item.id}
                  aoAbrir={props.aoAbrir}
                  aoSelecionar={props.aoSelecionar}
                  aoMoverStatus={props.aoMoverStatus}
                  aoIniciarArrasto={setArrastando}
                  aoTerminarArrasto={() => {
                    setArrastando(null);
                    setDestino(null);
                  }}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
