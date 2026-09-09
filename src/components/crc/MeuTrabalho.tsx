import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Plus,
  Sparkles,
  TimerReset,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";

import { assumirTarefa, carregarMeuTrabalho, concluirTarefa } from "@/lib/crc/api";
import type { Tarefa } from "@/lib/crc/dominio/tipos";
import { tempoRelativo } from "@/lib/crc/dominio/formatar";
import { ROTULO_TIPO_TAREFA } from "@/lib/crc/dominio/rotulos";

import {
  Aviso,
  BarraDeRecado,
  Botao,
  Etiqueta,
  ListaEsqueleto,
  Vazio,
  useAcao,
} from "./base";
import { NovaTarefa } from "./NovaTarefa";

type Filtro = "todas" | "atrasadas" | "sem-prazo";

export function MeuTrabalho({
  usuarioId,
  aoAbrirPaciente,
}: {
  usuarioId: string;
  aoAbrirPaciente: (patientId: string) => void;
}) {
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarMeuTrabalho();
      if (r.ok) {
        setTarefas(r.tarefas);
        setNomes(r.nomes);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos carregar suas tarefas. Tente atualizar a página.");
    }
  }, []);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent): void => {
      if (e.key !== "c" || e.metaKey || e.ctrlKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (
        alvo !== null &&
        (alvo.tagName === "INPUT" ||
          alvo.tagName === "TEXTAREA" ||
          alvo.tagName === "SELECT" ||
          alvo.isContentEditable === true)
      ) {
        return;
      }
      e.preventDefault();
      setCriando(true);
    };

    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const concluir = useCallback(
    async (taskId: string): Promise<void> => {
      await acao.executar(
        () => concluirTarefa({ data: { taskId } }),
        () => {
          setTarefas((atuais) => (atuais === null ? null : atuais.filter((t) => t.id !== taskId)));
        },
        "Tarefa concluída.",
      );
    },
    [acao],
  );

  const assumir = useCallback(
    async (taskId: string): Promise<void> => {
      await acao.executar(
        () => assumirTarefa({ data: { taskId } }),
        () => {
          setTarefas((atuais) =>
            atuais === null
              ? null
              : atuais.map((t) => (t.id === taskId ? { ...t, assignedTo: usuarioId } : t)),
          );
        },
        "Tarefa atribuída a você.",
      );
    },
    [acao, usuarioId],
  );

  const minhas = useMemo(
    () => (tarefas ?? []).filter((t) => t.assignedTo === usuarioId),
    [tarefas, usuarioId],
  );
  const semDono = useMemo(() => (tarefas ?? []).filter((t) => t.assignedTo === null), [tarefas]);
  const agora = Date.now();
  const atrasadas = minhas.filter(
    (t) => t.dueAt !== null && Number.isFinite(Date.parse(t.dueAt)) && Date.parse(t.dueAt) < agora,
  );
  const semPrazo = minhas.filter((t) => t.dueAt === null);

  const filtradas = minhas.filter((t) => {
    if (filtro === "todas") return true;
    if (filtro === "sem-prazo") return t.dueAt === null;
    return t.dueAt !== null && Number.isFinite(Date.parse(t.dueAt)) && Date.parse(t.dueAt) < agora;
  });

  if (erro !== null && tarefas === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (tarefas === null) return <ListaEsqueleto linhas={5} />;

  return (
    <div className="crc-trabalho-v2">
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      <NovaTarefa
        aberto={criando}
        aoFechar={() => setCriando(false)}
        aoCriar={(mensagem) => {
          acao.avisar(mensagem);
          void recarregar();
        }}
      />

      <section className="crc-trabalho-command">
        <div>
          <div className="crc-trabalho-kicker">
            <Sparkles size={14} aria-hidden="true" />
            Seu turno, organizado
          </div>
          <h2 className="crc-trabalho-command-titulo">
            {minhas.length === 0
              ? "Sua fila está limpa."
              : `Você tem ${String(minhas.length)} ${minhas.length === 1 ? "tarefa" : "tarefas"} na mão.`}
          </h2>
          <p>
            Comece pelas atrasadas. O restante já está ordenado por prazo — sem precisar caçar trabalho em outras telas.
          </p>
        </div>
        <Botao variante="primario" onClick={() => setCriando(true)}>
          <Plus size={17} aria-hidden="true" /> Nova tarefa <kbd>C</kbd>
        </Botao>
      </section>

      <section className="crc-trabalho-resumo" aria-label="Resumo da sua fila">
        <ResumoCard
          icone={UserRoundCheck}
          rotulo="Na sua mão"
          valor={minhas.length}
          nota="Tarefas atribuídas a você"
          tom="info"
        />
        <ResumoCard
          icone={AlertTriangle}
          rotulo="Atrasadas"
          valor={atrasadas.length}
          nota={atrasadas.length > 0 ? "Comece por aqui" : "Nenhum prazo estourado"}
          tom={atrasadas.length > 0 ? "perigo" : "positivo"}
        />
        <ResumoCard
          icone={TimerReset}
          rotulo="Sem prazo"
          valor={semPrazo.length}
          nota="Precisam de decisão de prioridade"
        />
        <ResumoCard
          icone={UsersRound}
          rotulo="Sem responsável"
          valor={semDono.length}
          nota={semDono.length > 0 ? "Disponíveis para assumir" : "Nenhuma tarefa órfã"}
          tom={semDono.length > 0 ? "alerta" : "positivo"}
        />
      </section>

      <section className="crc-trabalho-bloco">
        <header className="crc-trabalho-bloco-topo">
          <div>
            <div className="crc-sobretitulo">Fila pessoal</div>
            <h2 className="crc-titulo-secao">O que você precisa resolver</h2>
          </div>
          <div className="crc-trabalho-filtros" role="group" aria-label="Filtrar tarefas">
            <FiltroBotao ativo={filtro === "todas"} onClick={() => setFiltro("todas")}>Todas {minhas.length}</FiltroBotao>
            <FiltroBotao ativo={filtro === "atrasadas"} onClick={() => setFiltro("atrasadas")}>Atrasadas {atrasadas.length}</FiltroBotao>
            <FiltroBotao ativo={filtro === "sem-prazo"} onClick={() => setFiltro("sem-prazo")}>Sem prazo {semPrazo.length}</FiltroBotao>
          </div>
        </header>

        <div className="crc-trabalho-superficie">
          {filtradas.length === 0 ? (
            <Vazio
              titulo={minhas.length === 0 ? "Você está em dia." : "Nada neste filtro."}
              explicacao={
                minhas.length === 0
                  ? "Nenhuma tarefa esperando você. Quando uma automação precisar de ajuda humana, ela aparece aqui."
                  : "Troque o filtro para ver as demais tarefas da sua fila."
              }
            />
          ) : (
            <ListaTarefas
              tarefas={filtradas}
              nomes={nomes}
              rodando={acao.rodando}
              aoConcluir={concluir}
              aoAbrirPaciente={aoAbrirPaciente}
            />
          )}
        </div>
      </section>

      {semDono.length > 0 && (
        <section className="crc-trabalho-bloco crc-trabalho-orfao">
          <header className="crc-trabalho-bloco-topo">
            <div>
              <div className="crc-sobretitulo">Fila compartilhada</div>
              <h2 className="crc-titulo-secao">Ninguém assumiu ainda</h2>
              <p className="crc-corpo">São tarefas reais sem dono. Assumir tira o caso da fila dos outros e coloca a responsabilidade no seu nome.</p>
            </div>
            <span className="crc-trabalho-badge-alerta">{semDono.length} disponíveis</span>
          </header>
          <div className="crc-trabalho-superficie">
            <ListaTarefas
              tarefas={semDono}
              nomes={nomes}
              rodando={acao.rodando}
              aoConcluir={concluir}
              aoAssumir={assumir}
              aoAbrirPaciente={aoAbrirPaciente}
            />
          </div>
        </section>
      )}
    </div>
  );
}

function ResumoCard({
  icone: Icone,
  rotulo,
  valor,
  nota,
  tom = "neutro",
}: {
  icone: typeof Clock3;
  rotulo: string;
  valor: number;
  nota: string;
  tom?: "neutro" | "perigo" | "alerta" | "positivo" | "info";
}) {
  return (
    <article className="crc-trabalho-resumo-card" data-tom={tom}>
      <span className="crc-trabalho-resumo-icone"><Icone aria-hidden="true" /></span>
      <div>
        <span className="crc-trabalho-resumo-label">{rotulo}</span>
        <strong>{valor}</strong>
        <span className="crc-trabalho-resumo-nota">{nota}</span>
      </div>
    </article>
  );
}

function FiltroBotao({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="crc-trabalho-filtro" aria-pressed={ativo} onClick={onClick}>
      {children}
    </button>
  );
}

function ListaTarefas({
  tarefas,
  nomes,
  rodando,
  aoConcluir,
  aoAssumir,
  aoAbrirPaciente,
}: {
  tarefas: Tarefa[];
  nomes: Record<string, string>;
  rodando: boolean;
  aoConcluir: (taskId: string) => Promise<void>;
  aoAssumir?: (taskId: string) => Promise<void>;
  aoAbrirPaciente: (patientId: string) => void;
}) {
  const agora = Date.now();

  return (
    <ul className="crc-trabalho-lista">
      {tarefas.map((t) => {
        const vencida =
          t.dueAt !== null && Number.isFinite(Date.parse(t.dueAt)) && Date.parse(t.dueAt) < agora;

        return (
          <li key={t.id} className="crc-trabalho-item" data-vencida={vencida ? "sim" : "nao"}>
            <div className="crc-trabalho-item-status" aria-hidden="true">
              {vencida ? <AlertTriangle /> : <Clock3 />}
            </div>

            <div className="crc-trabalho-item-corpo">
              <div className="crc-trabalho-item-topo">
                <strong>{t.titulo}</strong>
                <div className="crc-linha">
                  <Etiqueta>{ROTULO_TIPO_TAREFA[t.tipo]}</Etiqueta>
                  {vencida && <Etiqueta tom="perigo">Atrasada</Etiqueta>}
                </div>
              </div>

              <div className="crc-trabalho-item-meta">
                {t.patientId !== null && <span>{nomes[t.patientId] ?? "Paciente"}</span>}
                {t.dueAt !== null ? <span>Prazo {tempoRelativo(t.dueAt)}</span> : <span>Sem prazo definido</span>}
              </div>
              {t.motivo !== null && <p>{t.motivo}</p>}
            </div>

            <div className="crc-trabalho-item-acoes">
              {t.patientId !== null && (
                <Botao
                  pequeno
                  variante="discreto"
                  onClick={() => {
                    if (t.patientId !== null) aoAbrirPaciente(t.patientId);
                  }}
                >
                  Paciente <ArrowUpRight size={14} aria-hidden="true" />
                </Botao>
              )}

              {aoAssumir !== undefined && (
                <Botao pequeno carregando={rodando} onClick={() => void aoAssumir(t.id)}>
                  Assumir
                </Botao>
              )}

              <Botao pequeno variante="primario" carregando={rodando} onClick={() => void aoConcluir(t.id)}>
                <CheckCircle2 size={15} aria-hidden="true" /> Concluir
              </Botao>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
