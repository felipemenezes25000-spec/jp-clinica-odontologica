import { useMemo, useRef, useState, type DragEvent } from "react";
import {
  Archive,
  ArrowRight,
  Clock,
  GripVertical,
  Sparkles,
  Star,
  TriangleAlert,
  Users,
} from "lucide-react";

import { useAlturaAteOFimDaJanela } from "@/components/rh/useAlturaDaJanela";
import { duvidasImportantesDe } from "@/lib/rh/duvidas";
import { leiturasDeDuvidas } from "@/lib/rh/ficha";
import { iniciais, tempoRelativo } from "@/lib/rh/formatar";
import { AREAS, STATUS } from "@/lib/rh/opcoes";
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
      className={`group grid min-h-[72px] grid-cols-1 items-center gap-3 border-b border-slate-100 px-3 py-2.5 transition-colors last:border-b-0 hover:bg-emerald-50/40 sm:px-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(8rem,.72fr)_minmax(7.5rem,.65fr)_minmax(7.5rem,.62fr)_minmax(9.25rem,.82fr)_auto] ${
        props.selecionada ? "bg-emerald-50/70" : "bg-white"
      } ${props.arrastando ? "opacity-50" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <GripVertical
          size={15}
          aria-hidden="true"
          className="hidden shrink-0 cursor-grab text-slate-300 transition-colors group-hover:text-slate-500 lg:block"
        />

        <label className="relative z-[2] flex shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            checked={props.selecionada}
            onChange={(event) => props.aoSelecionar(item.id, event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-emerald-700"
          />
          <span className="sr-only">Selecionar {item.nome || "candidatura sem nome"}</span>
        </label>

        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-extrabold text-emerald-800 ring-1 ring-emerald-100"
        >
          {iniciais(item.nome) || "?"}
        </span>

        <button
          type="button"
          onClick={() => props.aoAbrir(item.id)}
          className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
        >
          <span className="block truncate text-[0.82rem] font-extrabold leading-tight text-slate-900">
            {item.nome || "Sem nome"}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[0.7rem] text-slate-500">
            <span className="truncate">{subtituloDe(item)}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0 truncate">{rotuloArea(item.area)}</span>
            {item.arquivada ? (
              <span className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[0.62rem] font-semibold text-slate-600">
                <Archive size={10} aria-hidden="true" />
                Arquivada
              </span>
            ) : null}
          </span>
        </button>
      </div>

      <div className="flex items-center gap-2 xl:justify-start">
        {avaliacao.notaRh !== null ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[0.68rem] font-extrabold text-amber-800 ring-1 ring-amber-100">
            <Star size={11} fill="currentColor" aria-hidden="true" />
            RH {avaliacao.notaRh}/5
          </span>
        ) : null}
        {avaliacao.notaIa !== null ? (
          <span className="inline-flex items-center gap-1 text-[0.68rem] font-bold text-slate-600">
            <Sparkles size={11} aria-hidden="true" className="text-emerald-600" />
            IA {avaliacao.notaIa}/5
          </span>
        ) : avaliacao.erroIa ? (
          <span className="inline-flex items-center gap-1 text-[0.68rem] font-semibold text-rose-700">
            <TriangleAlert size={11} aria-hidden="true" />
            IA falhou
          </span>
        ) : (
          <span className="text-[0.68rem] text-slate-400">Sem avaliação</span>
        )}
      </div>

      <div>
        {alertas > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2 py-1 text-[0.68rem] font-bold text-rose-700 ring-1 ring-rose-100">
            <TriangleAlert size={11} aria-hidden="true" />
            {alertas} {alertas === 1 ? "alerta" : "alertas"}
          </span>
        ) : (
          <span className="text-[0.68rem] font-medium text-slate-400">Sem alertas</span>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-[0.68rem] font-medium text-slate-500">
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
          className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-[0.7rem] font-bold text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
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
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-[0.7rem] font-extrabold text-emerald-800 transition hover:border-emerald-200 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
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
  const statusInicial = props.itens[0]?.status ?? STATUS[0].valor;
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

  const grupoAtivo = porStatus.find((grupo) => grupo.status.valor === statusAtivo) ?? porStatus[0];
  const statusMeta = grupoAtivo.status;
  const itensAtivos = grupoAtivo.itens;
  const selecionadasNaEtapa = itensAtivos.filter((item) => props.selecionadas.includes(item.id)).length;

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
        style={altura === "" ? undefined : { height: altura }}
        className="flex min-h-[25rem] flex-col overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-[#f7faf7] shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)]"
      >
        <div className="border-b border-slate-200/80 bg-white px-3 py-3 sm:px-4">
          <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-emerald-700">
                Funil de candidaturas
              </p>
              <h2 className="mt-0.5 text-base font-extrabold tracking-tight text-slate-950">
                Todas as etapas em uma única visão
              </h2>
            </div>
            <p className="text-[0.68rem] font-medium text-slate-500">
              Clique em uma etapa para filtrar. Arraste uma pessoa para mover no funil.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-8">
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
                  className={`group relative min-w-0 rounded-xl border px-2.5 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${
                    ativa
                      ? "border-emerald-200 bg-emerald-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/50"
                  } ${alvo ? "ring-2 ring-emerald-500 ring-offset-1" : ""}`}
                >
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 shrink-0 rounded-full ${status.ponto}`}
                      />
                      <span className="truncate text-[0.68rem] font-extrabold text-slate-700">
                        {status.rotulo}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[0.65rem] font-black tabular-nums ${
                        ativa ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {itens.length}
                    </span>
                  </div>

                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-[width]"
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
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-3 py-2.5 sm:px-4">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusMeta.ponto}`}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-extrabold text-slate-950">{statusMeta.rotulo}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-black tabular-nums text-slate-700">
                    {itensAtivos.length}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[0.68rem] text-slate-500">{statusMeta.descricao}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[0.68rem] text-slate-500">
              {selecionadasNaEtapa > 0 ? (
                <span className="rounded-full bg-emerald-50 px-2 py-1 font-bold text-emerald-800 ring-1 ring-emerald-100">
                  {selecionadasNaEtapa} selecionada{selecionadasNaEtapa === 1 ? "" : "s"}
                </span>
              ) : null}
              <span className="hidden items-center gap-1.5 sm:inline-flex">
                <Users size={12} aria-hidden="true" />
                {props.itens.length} no filtro atual
              </span>
            </div>
          </header>

          <div className="hidden grid-cols-[minmax(0,1.7fr)_minmax(8rem,.72fr)_minmax(7.5rem,.65fr)_minmax(7.5rem,.62fr)_minmax(9.25rem,.82fr)_auto] items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-[0.62rem] font-extrabold uppercase tracking-[0.09em] text-slate-500 xl:grid">
            <span className="pl-[66px]">Candidato</span>
            <span>Avaliação</span>
            <span>Alertas</span>
            <span>Recebido</span>
            <span>Etapa</span>
            <span className="sr-only">Ação</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {itensAtivos.length === 0 ? (
              <div className="flex h-full min-h-44 flex-col items-center justify-center px-6 text-center">
                <span className={`mb-3 h-3 w-3 rounded-full ${statusMeta.ponto}`} aria-hidden="true" />
                <p className="text-sm font-extrabold text-slate-800">{statusMeta.vazio}</p>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">
                  A etapa continua visível no topo e também funciona como destino para arrastar candidatos.
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
