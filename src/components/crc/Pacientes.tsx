import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Bot,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  History,
  ListTodo,
  MessageSquareText,
  Phone,
  Search,
  ShieldAlert,
  Sparkles,
  UserRound,
} from "lucide-react";

import {
  buscarPacientes,
  carregarFichaPaciente,
  concluirTarefa,
  type FichaPaciente,
  type ItemTimeline,
} from "@/lib/crc/api";
import type { Paciente } from "@/lib/crc/dominio/tipos";
import { data, dataHora, dinheiro, iniciais, tempoRelativo } from "@/lib/crc/dominio/formatar";
import {
  ROTULO_SITUACAO,
  ROTULO_STATUS_JORNADA,
  ROTULO_TIPO_OPORTUNIDADE,
  ROTULO_TIPO_TAREFA,
} from "@/lib/crc/dominio/rotulos";
import { telefoneParaTela } from "@/lib/crc/dominio/telefone";

import {
  Aviso,
  BarraDeRecado,
  Botao,
  Etiqueta,
  ListaEsqueleto,
  Vazio,
  useAcao,
} from "./base";
import "./crc-patients.css";

/* -------------------------------------------------------------------------- */
/* Busca                                                                      */
/* -------------------------------------------------------------------------- */

export function BuscaPacientes({
  aoAbrirPaciente,
}: {
  aoAbrirPaciente: (patientId: string) => void;
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<Paciente[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (relogio.current !== null) clearTimeout(relogio.current);

    const limpo = termo.trim();
    if (limpo.length < 2) {
      setResultados(null);
      setBuscando(false);
      return;
    }

    setBuscando(true);
    relogio.current = setTimeout(() => {
      void (async () => {
        try {
          const r = await buscarPacientes({ data: { termo: limpo } });
          if (r.ok) {
            setResultados(r.itens);
            setErro(null);
          } else {
            setErro(r.message);
          }
        } catch {
          setErro("Não conseguimos buscar agora. Tente de novo.");
        } finally {
          setBuscando(false);
        }
      })();
    }, 280);

    return () => {
      if (relogio.current !== null) clearTimeout(relogio.current);
    };
  }, [termo]);

  return (
    <div className="crc-pacientes-busca-v2">
      <section className="crc-pacientes-busca-hero-v2">
        <div className="crc-pacientes-busca-copy-v2">
          <div className="crc-pacientes-busca-icone-v2"><UserRound aria-hidden="true" /></div>
          <div>
            <div className="crc-sobretitulo">Central de pacientes</div>
            <h2>Encontre qualquer paciente em segundos.</h2>
            <p>Nome ou telefone já bastam. A ficha abre com agenda, conversas, tarefas e histórico no mesmo workspace.</p>
          </div>
        </div>

        <div className="crc-pacientes-busca-campo-v2">
          <Search aria-hidden="true" />
          <label className="crc-so-leitor" htmlFor="crc-busca-paciente">Buscar paciente por nome ou telefone</label>
          <input
            id="crc-busca-paciente"
            type="search"
            placeholder="Digite nome ou telefone…"
            value={termo}
            autoComplete="off"
            autoFocus
            onChange={(e) => setTermo(e.target.value)}
          />
          {buscando && <span className="crc-pacientes-buscando-v2">Buscando…</span>}
        </div>
      </section>

      {erro !== null && <Aviso tom="perigo">{erro}</Aviso>}

      {termo.trim().length < 2 ? (
        <div className="crc-pacientes-inicio-v2">
          <div className="crc-pacientes-inicio-icone-v2"><Search aria-hidden="true" /></div>
          <Vazio
            titulo="Comece pelo nome ou telefone"
            explicacao="Digite pelo menos duas letras do nome, ou o telefone com DDD. A busca considera as duas formas de escrever o celular, com e sem o nono dígito."
          />
        </div>
      ) : buscando && resultados === null ? (
        <ListaEsqueleto linhas={4} />
      ) : resultados !== null && resultados.length === 0 ? (
        <div className="crc-pacientes-inicio-v2">
          <Vazio
            titulo="Nenhum paciente com esse nome ou telefone."
            explicacao="Confira a grafia. Se o paciente foi cadastrado agora no Dental Office, ele aparece aqui depois da próxima sincronização."
          />
        </div>
      ) : (
        <section className="crc-pacientes-resultados-v2">
          <header className="crc-pacientes-resultados-topo-v2">
            <div>
              <div className="crc-sobretitulo">Resultados</div>
              <h2 className="crc-titulo-secao">Pacientes encontrados</h2>
            </div>
            <span>{resultados?.length ?? 0}</span>
          </header>

          <ul className="crc-pacientes-lista-v2">
            {(resultados ?? []).map((p) => (
              <li key={p.id}>
                <button type="button" className="crc-paciente-resultado-v2" onClick={() => aoAbrirPaciente(p.id)}>
                  <span className="crc-paciente-avatar-v2" aria-hidden="true">{iniciais(p.nome)}</span>
                  <div className="crc-paciente-resultado-copy-v2">
                    <div className="crc-paciente-resultado-nome-v2">
                      <strong>{p.nome}</strong>
                      <div>
                        <Etiqueta tom={p.ativo && !p.arquivado ? "positiva" : "neutra"}>
                          {p.arquivado ? "Arquivado" : p.ativo ? "Ativo" : "Inativo"}
                        </Etiqueta>
                        {p.optOutEm !== null && <Etiqueta tom="perigo">Sem mensagens</Etiqueta>}
                      </div>
                    </div>
                    <div className="crc-paciente-resultado-dados-v2">
                      <span><Phone aria-hidden="true" /> {p.telefone === null ? "Sem telefone" : telefoneParaTela(p.telefone)}</span>
                      <span><Activity aria-hidden="true" /> {ROTULO_SITUACAO[p.situacao]}</span>
                      <span><CalendarDays aria-hidden="true" /> Última: {data(p.ultimaConsultaEm)}</span>
                      <span><CalendarClock aria-hidden="true" /> Próxima: {p.proximaConsultaEm === null ? "nenhuma" : data(p.proximaConsultaEm)}</span>
                    </div>
                  </div>
                  <ArrowUpRight className="crc-paciente-resultado-seta-v2" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Central do paciente                                                        */
/* -------------------------------------------------------------------------- */

type AbaFicha = "resumo" | "aberto" | "tarefas" | "conversas" | "agenda" | "historico";

export function CentralDoPaciente({
  patientId,
  aoVoltar,
}: {
  patientId: string;
  aoVoltar: () => void;
}) {
  const [ficha, setFicha] = useState<FichaPaciente | null>(null);
  const [aba, setAba] = useState<AbaFicha>("resumo");
  const [erro, setErro] = useState<string | null>(null);
  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarFichaPaciente({ data: { patientId } });
      if (r.ok) {
        setFicha(r.ficha);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos carregar esta ficha.");
    }
  }, [patientId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const concluir = useCallback(
    async (taskId: string): Promise<void> => {
      await acao.executar(
        () => concluirTarefa({ data: { taskId } }),
        () => void recarregar(),
        "Tarefa concluída.",
      );
    },
    [acao, recarregar],
  );

  if (erro !== null) {
    return (
      <div className="crc-paciente-workspace-v2">
        <Botao onClick={aoVoltar}><ArrowLeft size={16} aria-hidden="true" /> Voltar</Botao>
        <Aviso tom="perigo">{erro}</Aviso>
      </div>
    );
  }

  if (ficha === null) return <ListaEsqueleto linhas={5} />;

  const p = ficha.paciente;
  const tarefasAbertas = ficha.tarefas.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED");
  const oportunidadesAbertas = ficha.oportunidades.filter((o) => o.fechadaEm === null);
  const jornadaAtiva = ficha.jornadas.find((j) => j.status === "ACTIVE" || j.status === "WAITING");
  const consultas = ficha.timeline.filter((i) => i.tipo === "consulta");
  const mensagens = ficha.timeline.filter((i) => i.tipo === "mensagem");

  const abas: { chave: AbaFicha; rotulo: string; contador: number | null; icone: typeof Activity }[] = [
    { chave: "resumo", rotulo: "Resumo", contador: null, icone: Activity },
    { chave: "aberto", rotulo: "Em aberto", contador: oportunidadesAbertas.length, icone: CircleDollarSign },
    { chave: "tarefas", rotulo: "Tarefas", contador: tarefasAbertas.length, icone: ListTodo },
    { chave: "conversas", rotulo: "Conversas", contador: mensagens.length, icone: MessageSquareText },
    { chave: "agenda", rotulo: "Agenda", contador: consultas.length, icone: CalendarDays },
    { chave: "historico", rotulo: "Histórico", contador: null, icone: History },
  ];

  return (
    <div className="crc-paciente-workspace-v2">
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      <button type="button" className="crc-paciente-voltar-v2" onClick={aoVoltar}>
        <ArrowLeft aria-hidden="true" /> Todos os pacientes
      </button>

      <section className="crc-paciente-identidade-v2">
        <div className="crc-paciente-identidade-principal-v2">
          <span className="crc-paciente-identidade-avatar-v2" aria-hidden="true">{iniciais(p.nome)}</span>
          <div className="crc-paciente-identidade-copy-v2">
            <div className="crc-paciente-identidade-tags-v2">
              <Etiqueta tom={p.ativo && !p.arquivado ? "positiva" : "neutra"}>
                {p.arquivado ? "Arquivado" : p.ativo ? "Ativo" : "Inativo"}
              </Etiqueta>
              <Etiqueta>{ROTULO_SITUACAO[p.situacao]}</Etiqueta>
              {p.especialidade !== null && <Etiqueta tom="info">{p.especialidade}</Etiqueta>}
            </div>
            <h1>{p.nome}</h1>
            <p>Todo o relacionamento deste paciente em um único lugar.</p>
          </div>
        </div>

        {jornadaAtiva !== undefined && (
          <div className="crc-paciente-automacao-v2">
            <span><Sparkles aria-hidden="true" /></span>
            <div>
              <small>Automação ativa</small>
              <strong>{ROTULO_STATUS_JORNADA[jornadaAtiva.status]}</strong>
              {jornadaAtiva.resumeAt !== null && <em>Próximo passo {tempoRelativo(jornadaAtiva.resumeAt)}</em>}
            </div>
          </div>
        )}
      </section>

      {p.optOutEm !== null && (
        <div className="crc-paciente-optout-v2">
          <Aviso tom="perigo">
            <strong>Contato promocional bloqueado.</strong> Este paciente pediu para não receber mensagens em {data(p.optOutEm)}. Nenhuma automação fala com ele.
          </Aviso>
        </div>
      )}

      <section className="crc-paciente-dados-v2" aria-label="Dados principais">
        <Dado icone={Phone} rotulo="Telefone" valor={p.telefone === null ? "—" : telefoneParaTela(p.telefone)} />
        <Dado icone={CalendarDays} rotulo="Última consulta" valor={data(p.ultimaConsultaEm)} />
        <Dado icone={CalendarClock} rotulo="Próxima consulta" valor={p.proximaConsultaEm === null ? "Nenhuma marcada" : dataHora(p.proximaConsultaEm)} />
        <Dado icone={UserRound} rotulo="Nascimento" valor={p.nascimento === null ? "—" : data(p.nascimento)} />
      </section>

      <nav role="tablist" aria-label="Seções da ficha" className="crc-paciente-abas-v2">
        {abas.map((a) => {
          const Icone = a.icone;
          return (
            <button
              key={a.chave}
              type="button"
              role="tab"
              id={`aba-${a.chave}`}
              aria-selected={aba === a.chave}
              aria-controls={`painel-${a.chave}`}
              onClick={() => setAba(a.chave)}
            >
              <Icone aria-hidden="true" />
              <span>{a.rotulo}</span>
              {a.contador !== null && a.contador > 0 && <strong>{a.contador}</strong>}
            </button>
          );
        })}
      </nav>

      <div className="crc-paciente-conteudo-v2" role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`}>
        {aba === "resumo" && (
          <div className="crc-paciente-resumo-grid-v2">
            <PainelPaciente titulo="Oportunidades abertas" icone={CircleDollarSign} contador={oportunidadesAbertas.length}>
              <ListaOportunidades oportunidades={oportunidadesAbertas} />
            </PainelPaciente>
            <PainelPaciente titulo="Tarefas" icone={ListTodo} contador={tarefasAbertas.length}>
              <ListaTarefas tarefas={tarefasAbertas} rodando={acao.rodando} aoConcluir={concluir} />
            </PainelPaciente>
          </div>
        )}

        {aba === "aberto" && (
          <PainelPaciente titulo="Oportunidades abertas" icone={CircleDollarSign} contador={oportunidadesAbertas.length}>
            <ListaOportunidades oportunidades={oportunidadesAbertas} />
          </PainelPaciente>
        )}

        {aba === "tarefas" && (
          <PainelPaciente titulo="Tarefas" icone={ListTodo} contador={tarefasAbertas.length}>
            <ListaTarefas tarefas={tarefasAbertas} rodando={acao.rodando} aoConcluir={concluir} />
          </PainelPaciente>
        )}

        {aba === "conversas" && <Trechos itens={mensagens} vazio="Nenhuma mensagem trocada com este paciente ainda." titulo="Conversas" icone={MessageSquareText} />}
        {aba === "agenda" && <Trechos itens={consultas} vazio="Nenhuma consulta registrada para este paciente." titulo="Agenda" icone={CalendarDays} />}
        {aba === "historico" && <Timeline itens={ficha.timeline} />}
      </div>
    </div>
  );
}

function PainelPaciente({
  titulo,
  icone: Icone,
  contador,
  children,
}: {
  titulo: string;
  icone: typeof Activity;
  contador: number;
  children: React.ReactNode;
}) {
  return (
    <section className="crc-paciente-painel-v2">
      <header>
        <span><Icone aria-hidden="true" /></span>
        <div><small>Paciente</small><h2>{titulo}</h2></div>
        <strong>{contador}</strong>
      </header>
      <div className="crc-paciente-painel-corpo-v2">{children}</div>
    </section>
  );
}

function ListaOportunidades({ oportunidades }: { oportunidades: FichaPaciente["oportunidades"] }) {
  if (oportunidades.length === 0) {
    return <Vazio titulo="Nenhuma oportunidade aberta." explicacao="Este paciente não está pendente de nenhuma oportunidade comercial ou de relacionamento agora." />;
  }

  return (
    <ul className="crc-paciente-lista-interna-v2">
      {oportunidades.map((o) => (
        <li key={o.id} className="crc-paciente-oportunidade-v2">
          <div className="crc-paciente-oportunidade-topo-v2">
            <div>
              <strong>{ROTULO_TIPO_OPORTUNIDADE[o.tipo]}</strong>
              {o.motivo !== null && <span>{o.motivo}</span>}
            </div>
            <Etiqueta tom={o.priorityScore >= 65 ? "perigo" : "neutra"}>{o.priorityScore}/100</Etiqueta>
          </div>
          <div className="crc-paciente-oportunidade-meta-v2">
            {o.potentialValue !== null && <span><CircleDollarSign aria-hidden="true" /> {dinheiro(o.potentialValue)}</span>}
            {o.nextAction !== null && <span><ArrowUpRight aria-hidden="true" /> {o.nextAction}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ListaTarefas({
  tarefas,
  rodando,
  aoConcluir,
}: {
  tarefas: FichaPaciente["tarefas"];
  rodando: boolean;
  aoConcluir: (taskId: string) => Promise<void>;
}) {
  if (tarefas.length === 0) {
    return <Vazio titulo="Nenhuma tarefa aberta." explicacao="A equipe não tem nenhuma ação manual pendente para este paciente." />;
  }

  return (
    <ul className="crc-paciente-lista-interna-v2">
      {tarefas.map((t) => (
        <li key={t.id} className="crc-paciente-tarefa-v2">
          <div>
            <div className="crc-paciente-tarefa-topo-v2">
              <strong>{t.titulo}</strong>
              <Etiqueta>{ROTULO_TIPO_TAREFA[t.tipo]}</Etiqueta>
            </div>
            <div className="crc-paciente-tarefa-meta-v2">
              {t.dueAt !== null && <span>Prazo {tempoRelativo(t.dueAt)}</span>}
              {t.motivo !== null && <span>{t.motivo}</span>}
            </div>
          </div>
          <Botao pequeno carregando={rodando} onClick={() => void aoConcluir(t.id)}>
            <CheckCircle2 size={14} aria-hidden="true" /> Concluir
          </Botao>
        </li>
      ))}
    </ul>
  );
}

function Trechos({
  itens,
  titulo,
  vazio,
  icone: Icone,
}: {
  itens: ItemTimeline[];
  titulo: string;
  vazio: string;
  icone: typeof Activity;
}) {
  return (
    <PainelPaciente titulo={titulo} icone={Icone} contador={itens.length}>
      {itens.length === 0 ? (
        <Vazio titulo={`Nenhum registro em ${titulo.toLowerCase()}.`} explicacao={vazio} />
      ) : (
        <ol className="crc-paciente-trechos-v2">
          {itens.slice(0, 40).map((item, i) => (
            <li key={`${item.em}-${String(i)}`}>
              <div>
                <strong>{item.titulo}</strong>
                <span>{dataHora(item.em)}</span>
              </div>
              {item.detalhe.length > 0 && <p>{item.detalhe}</p>}
            </li>
          ))}
        </ol>
      )}
    </PainelPaciente>
  );
}

function Timeline({ itens }: { itens: ItemTimeline[] }) {
  return (
    <PainelPaciente titulo="Linha do tempo" icone={History} contador={itens.length}>
      {itens.length === 0 ? (
        <Vazio titulo="Ainda não há histórico." explicacao="Consultas, mensagens, tarefas, oportunidades e automações aparecem aqui em ordem cronológica." />
      ) : (
        <ol className="crc-paciente-timeline-v2">
          {itens.slice(0, 40).map((item, i) => (
            <li key={`${item.em}-${String(i)}`}>
              <div className="crc-paciente-timeline-trilho-v2">
                <span aria-hidden="true" />
                {i < Math.min(itens.length, 40) - 1 && <i aria-hidden="true" />}
              </div>
              <div>
                <div className="crc-paciente-timeline-topo-v2">
                  <strong>{item.titulo}</strong>
                  <span>{dataHora(item.em)}</span>
                </div>
                {item.detalhe.length > 0 && <p>{item.detalhe}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </PainelPaciente>
  );
}

function Dado({ icone: Icone, rotulo, valor }: { icone: typeof Phone; rotulo: string; valor: string }) {
  return (
    <article className="crc-paciente-dado-v2">
      <span><Icone aria-hidden="true" /></span>
      <div><small>{rotulo}</small><strong>{valor}</strong></div>
    </article>
  );
}
