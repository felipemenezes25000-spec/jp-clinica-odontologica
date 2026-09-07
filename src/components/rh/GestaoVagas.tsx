/**
 * Aba "Vagas" do painel: onde a clínica escreve um anúncio e ele entra no ar.
 *
 * Toda a tela é construída em volta de uma pergunta só — "isto está no site ou
 * não?". Por isso o status é pílula sólida, o rascunho ganha aviso explícito, o
 * link "ver no site" só existe quando a vaga está mesmo publicada e as ações de
 * publicar/pausar/encerrar ficam no próprio card, sem precisar abrir o editor.
 *
 * Renderiza sobre o fundo escuro do painel (`.rh-aurora`), então os cards usam
 * `.rh-vidro` e as pílulas de status entram pela variante `pilulaEscura`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Briefcase,
  Copy,
  ExternalLink,
  Eye,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Sparkles,
  Square,
  Trash2,
  TriangleAlert,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { EditorVaga } from "@/components/rh/EditorVaga";
import { formatarData, tempoRelativo } from "@/lib/rh/formatar";
import { AREAS, MODELOS_TRABALHO, STATUS_VAGA, VINCULOS, statusVagaPor } from "@/lib/rh/opcoes";
import type { Candidatura, ConfiguracoesRh, StatusVaga, Vaga } from "@/lib/rh/tipos";
import { vagaVazia } from "@/lib/rh/tipos";
import { faixaSalarial, ordenarVagas, resumoJornada, vagaAberta } from "@/lib/rh/vagas";

/** Busca sem acento e sem caixa: quem procura "cirurgiao" acha "Cirurgião". */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .trim();
}

function rotuloArea(vaga: Vaga): string {
  return AREAS.find((a) => a.valor === vaga.area)?.rotulo ?? "Área não definida";
}

function rotuloVinculo(vaga: Vaga): string {
  return VINCULOS.find((v) => v.valor === vaga.vinculo)?.rotulo ?? "Vínculo não definido";
}

function rotuloModelo(vaga: Vaga): string {
  return MODELOS_TRABALHO.find((m) => m.valor === vaga.modelo)?.rotulo ?? "";
}

/* Campo sobre a superfície escura do painel. Não usa `.rh-campo`, que é branca
   e feita para o formulário público: aqui viraria uma lâmpada no meio do
   cabeçalho de vidro. Mesma métrica da barra de filtros da aba Candidaturas. */
const CAMPO =
  "h-12 w-full rounded-xl border border-white/15 bg-white/[0.07] px-3 text-sm text-white " +
  "placeholder:text-white/85 transition-colors hover:border-white/30 focus:border-lime";

const ACAO =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-white/25 " +
  "bg-white/5 px-3 text-xs font-extrabold text-white transition hover:bg-white/15 " +
  "disabled:cursor-not-allowed disabled:opacity-40";

export function GestaoVagas(props: {
  vagas: Vaga[];
  candidaturas: Candidatura[];
  config: ConfiguracoesRh;
  agora: Date;
  salvando: boolean;
  aoSalvar: (vaga: Vaga) => void;
  aoExcluir: (id: string) => void;
  /** Avisa a rota que o editor (camada modal) abriu ou fechou, para os avisos
   *  flutuantes saírem de cima dos botões do rodapé dele. */
  aoAlternarEditor: (aberto: boolean) => void;
}) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<StatusVaga | "">("");
  const [editando, setEditando] = useState<Vaga | null>(null);
  const [confirmando, setConfirmando] = useState("");
  const refCancelarExclusao = useRef<HTMLButtonElement>(null);
  /** Id da vaga cujo "Excluir" deve receber o foco de volta ao cancelar. Só o
   *  próprio Cancelar preenche isto: fechar a confirmação por outro caminho
   *  (editar, duplicar, publicar) não pode roubar o foco de onde a pessoa foi. */
  const refVoltarFoco = useRef("");

  const { aoAlternarEditor } = props;
  useEffect(() => {
    aoAlternarEditor(editando !== null);
    // Trocar de aba desmonta esta tela com o editor aberto; sem a limpeza a
    // rota continuaria achando que existe uma camada modal por cima.
    return () => aoAlternarEditor(false);
  }, [editando, aoAlternarEditor]);

  // O botão "Excluir" some do DOM no mesmo clique que abre a confirmação (o
  // ternário troca a linha de ações inteira), e com ele iria o foco para o
  // <body>. O passo seguro é o padrão: quem recebe o foco é o "Cancelar".
  useEffect(() => {
    if (confirmando !== "") {
      refCancelarExclusao.current?.focus();
      return;
    }
    const alvo = refVoltarFoco.current;
    refVoltarFoco.current = "";
    // Por id, e não por ref guardada: ao voltar do ramo da confirmação o React
    // recria o botão, e a referência antiga aponta para um nó fora do DOM.
    if (alvo !== "") document.getElementById(`rh-excluir-${alvo}`)?.focus();
  }, [confirmando]);

  /** Quantas candidaturas apontam para cada vaga — inclusive as arquivadas, que
   *  continuam sendo histórico daquele processo. */
  const porVaga = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const c of props.candidaturas) {
      if (c.vagaId.length === 0) continue;
      mapa.set(c.vagaId, (mapa.get(c.vagaId) ?? 0) + 1);
    }
    return mapa;
  }, [props.candidaturas]);

  const contagens = useMemo(() => {
    const mapa = new Map<StatusVaga, number>();
    for (const v of props.vagas) mapa.set(v.status, (mapa.get(v.status) ?? 0) + 1);
    return mapa;
  }, [props.vagas]);

  const visiveis = useMemo(() => {
    const termo = normalizar(busca);
    return ordenarVagas(
      props.vagas.filter((v) => {
        if (filtro !== "" && v.status !== filtro) return false;
        if (termo.length === 0) return true;
        return normalizar(`${v.titulo} ${v.resumo}`).includes(termo);
      }),
    );
  }, [props.vagas, busca, filtro]);

  const abrirNova = () => {
    setConfirmando("");
    setEditando(vagaVazia());
  };

  /**
   * Duplicar zera id, slug e datas: o servidor trata isso como vaga nova, gera
   * outro slug e não herda a data de publicação da original — senão a cópia
   * nasceria "publicada" no topo do portal sem nunca ter ido ao ar.
   */
  const duplicar = (vaga: Vaga) => {
    setConfirmando("");
    setEditando({
      ...vaga,
      id: "",
      slug: "",
      titulo: `${vaga.titulo} (cópia)`,
      status: "rascunho",
      criadoEm: "",
      atualizadoEm: "",
      publicadoEm: "",
    });
  };

  const trocarStatus = (vaga: Vaga, status: StatusVaga) => {
    setConfirmando("");
    props.aoSalvar({ ...vaga, status });
  };

  const semVagaNenhuma = props.vagas.length === 0;

  return (
    <section aria-labelledby="rh-vagas-titulo" className="space-y-6">
      <header className="rh-vidro p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id="rh-vagas-titulo"
              className="font-display text-2xl font-extrabold leading-tight text-white"
            >
              Vagas do portal
            </h2>
            <p className="mt-1 max-w-2xl text-sm font-medium text-white/85">
              O que estiver como <strong className="font-extrabold text-white">Aberta</strong>{" "}
              aparece agora mesmo na página de carreiras do site. Rascunho, pausada e encerrada
              ficam só aqui dentro.
            </p>
          </div>
          <button type="button" className="button-primary" onClick={abrirNova}>
            <Plus className="h-5 w-5" aria-hidden="true" />
            Nova vaga
          </button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-center">
          <div>
            <label className="sr-only" htmlFor="rh-busca-vaga">
              Buscar vaga pelo título
            </label>
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 text-lime"
              >
                <Search className="h-4 w-4" />
              </span>
              <input
                id="rh-busca-vaga"
                type="search"
                className={`${CAMPO} min-w-0 flex-1`}
                value={busca}
                placeholder="Buscar por título"
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>

          <div
            role="group"
            aria-label="Filtrar por status da vaga"
            className="flex flex-wrap gap-2"
          >
            <button
              type="button"
              className="rh-chip rh-chip-escuro"
              data-ativo={filtro === ""}
              aria-pressed={filtro === ""}
              onClick={() => setFiltro("")}
            >
              Todas
              <span className="font-extrabold tabular-nums">{props.vagas.length}</span>
            </button>
            {STATUS_VAGA.map((s) => {
              const total = contagens.get(s.valor) ?? 0;
              const ativo = filtro === s.valor;
              return (
                <button
                  key={s.valor}
                  type="button"
                  className="rh-chip rh-chip-escuro"
                  data-ativo={ativo}
                  aria-pressed={ativo}
                  onClick={() => setFiltro(ativo ? "" : s.valor)}
                >
                  {s.rotulo}
                  <span className="font-extrabold tabular-nums">{total}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {semVagaNenhuma ? (
        <div className="rh-vidro flex flex-col items-center gap-4 px-6 py-14 text-center">
          <span
            aria-hidden="true"
            className="inline-grid h-14 w-14 place-items-center rounded-full bg-lime/15 text-lime"
          >
            <Briefcase className="h-7 w-7" />
          </span>
          <div>
            <h3 className="font-display text-xl font-extrabold text-white">
              Nenhuma vaga cadastrada ainda
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm font-medium text-white/85">
              Crie a primeira vaga para o portal de carreiras sair do lugar. Você pode salvar como
              rascunho e publicar só quando o texto estiver do jeito que a clínica quer.
            </p>
          </div>
          <button type="button" className="button-primary" onClick={abrirNova}>
            <Plus className="h-5 w-5" aria-hidden="true" />
            Criar a primeira vaga
          </button>
        </div>
      ) : visiveis.length === 0 ? (
        <div className="rh-vidro flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm font-bold text-white">Nenhuma vaga com esses filtros.</p>
          <button
            type="button"
            className={ACAO}
            onClick={() => {
              setBusca("");
              setFiltro("");
            }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Limpar busca e filtros
          </button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {visiveis.map((vaga) => {
            const status = statusVagaPor(vaga.status);
            const inscritos = porVaga.get(vaga.id) ?? 0;
            const salario = faixaSalarial(vaga);
            const jornada = resumoJornada(vaga);
            const noAr = vagaAberta(vaga, props.agora);
            const publicada = tempoRelativo(vaga.publicadoEm, props.agora);
            const prazo = formatarData(vaga.encerraEm);

            return (
              <li key={vaga.id} className="rh-vidro flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-extrabold uppercase tracking-wide ${status.pilulaEscura}`}
                  >
                    {status.rotulo}
                  </span>
                  {vaga.destaque ? (
                    <span className="inline-flex items-center gap-1 text-[0.7rem] font-extrabold uppercase tracking-wide text-white">
                      <Sparkles className="h-3.5 w-3.5 text-lime" aria-hidden="true" />
                      Destaque
                    </span>
                  ) : null}
                </div>

                <div>
                  <h3 className="font-display text-lg font-extrabold leading-tight text-white">
                    {vaga.titulo.trim().length > 0 ? vaga.titulo : "Vaga sem título"}
                  </h3>
                  {vaga.resumo.trim().length > 0 ? (
                    <p className="mt-1 line-clamp-2 text-sm font-medium text-white/85">
                      {vaga.resumo}
                    </p>
                  ) : null}
                </div>

                <ul className="flex flex-wrap gap-1.5 text-[0.7rem] font-bold text-white">
                  <li className="rounded-full bg-white/10 px-2.5 py-1">{rotuloArea(vaga)}</li>
                  <li className="rounded-full bg-white/10 px-2.5 py-1">{rotuloVinculo(vaga)}</li>
                  <li className="rounded-full bg-white/10 px-2.5 py-1">{rotuloModelo(vaga)}</li>
                  {vaga.quantidade > 1 ? (
                    <li className="rounded-full bg-white/10 px-2.5 py-1">
                      {vaga.quantidade} posições
                    </li>
                  ) : null}
                </ul>

                <dl className="space-y-1.5 text-xs font-semibold text-white/85">
                  <div className="flex items-center gap-2">
                    <dt className="sr-only">Candidaturas</dt>
                    <Users className="h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
                    <dd>
                      {inscritos === 0
                        ? "Nenhuma candidatura ainda"
                        : `${inscritos} ${inscritos === 1 ? "candidatura" : "candidaturas"}`}
                    </dd>
                  </div>
                  {salario.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <dt className="sr-only">Faixa salarial</dt>
                      <Wallet className="h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
                      <dd>{salario}</dd>
                    </div>
                  ) : null}
                  {jornada.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <dt className="sr-only">Jornada</dt>
                      <Briefcase className="h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
                      <dd>{jornada}</dd>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <dt className="sr-only">Publicação</dt>
                    <Eye className="h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
                    <dd>
                      {publicada.length > 0 ? `Publicada ${publicada}` : "Ainda não publicada"}
                      {prazo.length > 0 ? ` · encerra em ${prazo}` : " · sem prazo"}
                    </dd>
                  </div>
                </dl>

                {/* Dois avisos diferentes, porque as causas são diferentes: uma
                    vaga pode estar "Aberta" e ainda assim fora do ar por vencimento. */}
                {vaga.status === "rascunho" ? (
                  <p className="flex items-start gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white ring-1 ring-white/20">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    Esta vaga ainda não aparece no site.
                  </p>
                ) : vaga.status === "aberta" && !noAr ? (
                  <p className="flex items-start gap-2 rounded-xl bg-amber-300/15 px-3 py-2 text-xs font-bold text-amber-100 ring-1 ring-amber-200/30">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />O prazo
                    passou: a vaga saiu do site sozinha. Mude a data para reabrir.
                  </p>
                ) : null}

                {confirmando === vaga.id ? (
                  <div className="rounded-xl bg-rose-300/10 p-3 ring-1 ring-rose-200/30">
                    {/* `alert`: a pergunta aparece sem que nada seja anunciado,
                        e ela é a única explicação do que o próximo clique faz. */}
                    <p role="alert" className="text-xs font-bold text-rose-100">
                      Excluir “{vaga.titulo}” de vez?
                      {inscritos > 0
                        ? ` ${inscritos} ${inscritos === 1 ? "candidatura continua" : "candidaturas continuam"} no painel, mas sem o anúncio original para consultar. Encerrar costuma ser melhor do que excluir.`
                        : " Não há candidaturas ligadas a ela."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        ref={refCancelarExclusao}
                        type="button"
                        className={ACAO}
                        onClick={() => {
                          refVoltarFoco.current = vaga.id;
                          setConfirmando("");
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-rose-500 px-3 text-xs font-extrabold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={props.salvando}
                        onClick={() => {
                          setConfirmando("");
                          props.aoExcluir(vaga.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Excluir definitivamente
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      className={ACAO}
                      onClick={() => {
                        setConfirmando("");
                        setEditando(vaga);
                      }}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      Editar
                    </button>

                    {vaga.status === "aberta" ? (
                      <button
                        type="button"
                        className={ACAO}
                        disabled={props.salvando}
                        onClick={() => trocarStatus(vaga, "pausada")}
                      >
                        <Pause className="h-4 w-4" aria-hidden="true" />
                        Pausar
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={ACAO}
                        disabled={props.salvando}
                        onClick={() => trocarStatus(vaga, "aberta")}
                      >
                        <Play className="h-4 w-4" aria-hidden="true" />
                        {vaga.status === "rascunho" ? "Publicar" : "Reabrir"}
                      </button>
                    )}

                    {vaga.status !== "encerrada" ? (
                      <button
                        type="button"
                        className={ACAO}
                        disabled={props.salvando}
                        onClick={() => trocarStatus(vaga, "encerrada")}
                      >
                        <Square className="h-4 w-4" aria-hidden="true" />
                        Encerrar
                      </button>
                    ) : null}

                    <button type="button" className={ACAO} onClick={() => duplicar(vaga)}>
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      Duplicar
                    </button>

                    {/* O link só existe quando a vaga está realmente no ar: em
                        rascunho, pausada ou vencida a página pública não existe,
                        e mandar o RH para um 404 destrói a confiança na tela. */}
                    {noAr ? (
                      <a
                        className={ACAO}
                        href={`/carreiras/${vaga.slug}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        Ver no site
                      </a>
                    ) : null}

                    <button
                      id={`rh-excluir-${vaga.id}`}
                      type="button"
                      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-rose-200/30 bg-rose-300/10 px-3 text-xs font-extrabold text-rose-100 transition hover:bg-rose-300/20"
                      onClick={() => setConfirmando(vaga.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Excluir
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <EditorVaga
        // A key remonta o editor a cada vaga aberta: garante formulário limpo
        // mesmo se o mesmo objeto de vaga voltar depois de um salvamento.
        key={editando ? `${editando.id}-${editando.titulo}` : "fechado"}
        vaga={editando}
        beneficiosSugeridos={props.config.beneficiosPadrao}
        salvando={props.salvando}
        aoFechar={() => setEditando(null)}
        aoSalvar={(vaga) => {
          // Fecha na hora: a lista é redesenhada com o que o servidor devolver,
          // e manter o editor aberto sobre a lista atualizada só confundiria.
          setEditando(null);
          props.aoSalvar(vaga);
        }}
      />
    </section>
  );
}
