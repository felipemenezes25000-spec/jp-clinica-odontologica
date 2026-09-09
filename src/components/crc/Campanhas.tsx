import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  Filter,
  Megaphone,
  MessageSquareText,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import {
  agendarCampanhaExistente,
  carregarCampanhas,
  carregarOpcoesDePublico,
  contarPublicoDaCampanha,
  criarCampanhaNova,
  pausarOuRetomarCampanha,
  type CampanhaDto,
} from "@/lib/crc/api";
import { TARIFA_BRL, categoriaDeCampanha, estimarCusto, reais } from "@/lib/crc/dominio/custo";
import { ROTULO_SITUACAO } from "@/lib/crc/dominio/rotulos";
import { SITUACOES_PACIENTE } from "@/lib/crc/dominio/tipos";

import {
  Aviso,
  BarraDeRecado,
  Botao,
  Campo,
  Entrada,
  Etiqueta,
  ListaEsqueleto,
  Modal,
  Vazio,
  useAcao,
} from "./base";
import "./crc-campaigns.css";

type Filtros = {
  diasSemVoltar: number | null;
  diasSemVoltarAte: number | null;
  semConsultaFutura: boolean;
  especialidade: string | null;
  convenio: string | null;
  situacao: string | null;
};

const FILTROS_INICIAIS: Filtros = {
  diasSemVoltar: 365,
  diasSemVoltarAte: null,
  semConsultaFutura: true,
  especialidade: null,
  convenio: null,
  situacao: null,
};

const TOM_POR_STATUS: Record<string, "neutra" | "positiva" | "alerta" | "info"> = {
  RASCUNHO: "neutra",
  AGENDADA: "info",
  RODANDO: "positiva",
  PAUSADA: "alerta",
  CONCLUIDA: "info",
};

const ROTULO_STATUS: Record<string, string> = {
  RASCUNHO: "Rascunho",
  AGENDADA: "Agendada",
  RODANDO: "Enviando",
  PAUSADA: "Pausada",
  CONCLUIDA: "Concluída",
};

export function Campanhas() {
  const [campanhas, setCampanhas] = useState<CampanhaDto[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [montando, setMontando] = useState(false);
  const [nome, setNome] = useState("");
  const [mensagem, setMensagem] = useState(
    "Oi, {{primeiroNome}}! Faz um tempo que a gente não te vê por aqui. Quer marcar uma avaliação?",
  );
  const [porDia, setPorDia] = useState(120);
  const [filtros, setFiltros] = useState<Filtros>({ ...FILTROS_INICIAIS });
  const [opcoes, setOpcoes] = useState<{ especialidades: string[]; convenios: string[] }>({
    especialidades: [],
    convenios: [],
  });
  const [publico, setPublico] = useState<number | null>(null);
  const [contando, setContando] = useState(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarCampanhas();
      if (r.ok) {
        setCampanhas(r.campanhas);
        setErro(null);
      } else setErro(r.message);
    } catch {
      setErro("Não conseguimos carregar as campanhas.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
    void (async () => {
      try {
        const r = await carregarOpcoesDePublico();
        if (r.ok) setOpcoes({ especialidades: r.especialidades, convenios: r.convenios });
      } catch {
        setOpcoes({ especialidades: [], convenios: [] });
      }
    })();
  }, [recarregar]);

  useEffect(() => {
    if (!montando) return;
    if (relogio.current !== null) clearTimeout(relogio.current);
    setContando(true);
    relogio.current = setTimeout(() => {
      void (async () => {
        try {
          const r = await contarPublicoDaCampanha({ data: { filtros } });
          if (r.ok) setPublico(r.quantidade);
        } catch {
          setPublico(null);
        } finally {
          setContando(false);
        }
      })();
    }, 300);
    return () => {
      if (relogio.current !== null) clearTimeout(relogio.current);
    };
  }, [filtros, montando]);

  const criar = useCallback(async (): Promise<void> => {
    await acao.executar(
      () => criarCampanhaNova({ data: { nome, mensagem, porDia, filtros } }),
      () => {
        setMontando(false);
        setNome("");
        void recarregar();
      },
      "Campanha criada em rascunho. Revise e agende para começar a enviar.",
    );
  }, [acao, filtros, mensagem, nome, porDia, recarregar]);

  const agendar = useCallback(
    async (c: CampanhaDto): Promise<void> => {
      await acao.executar(
        () => agendarCampanhaExistente({ data: { campaignId: c.id } }),
        () => void recarregar(),
        `"${c.nome}" começou a enviar.`,
      );
    },
    [acao, recarregar],
  );

  const alternar = useCallback(
    async (c: CampanhaDto): Promise<void> => {
      await acao.executar(
        () =>
          pausarOuRetomarCampanha({ data: { campaignId: c.id, pausar: c.status === "RODANDO" } }),
        () => void recarregar(),
        c.status === "RODANDO" ? `"${c.nome}" pausada.` : `"${c.nome}" retomada.`,
      );
    },
    [acao, recarregar],
  );

  const custo = publico === null ? null : estimarCusto(publico, categoriaDeCampanha(), new Date());
  const dias = publico === null || porDia <= 0 ? 0 : Math.ceil(publico / porDia);

  if (erro !== null && campanhas === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (campanhas === null) return <ListaEsqueleto linhas={3} />;

  const rodando = campanhas.filter((c) => c.status === "RODANDO").length;
  const rascunhos = campanhas.filter((c) => c.status === "RASCUNHO").length;
  const pendentes = campanhas.reduce((s, c) => s + c.pendentes, 0);
  const enviadas = campanhas.reduce((s, c) => s + c.enviadas, 0);

  return (
    <div className="crc-camp-v2">
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      <section className="crc-camp-command-v2">
        <div>
          <div className="crc-camp-kicker-v2">
            <Megaphone size={14} aria-hidden="true" /> Campanhas seguras
          </div>
          <h2>Fale com grupos sem transformar o CRC em disparador de massa.</h2>
          <p>
            Público, custo e cadência ficam visíveis antes de qualquer envio. Opt-out, horário e
            limite de contato continuam valendo pessoa por pessoa.
          </p>
        </div>
        <Botao
          variante="primario"
          onClick={() => {
            setMontando(true);
            setPublico(null);
          }}
        >
          <Plus size={16} aria-hidden="true" /> Montar campanha
        </Botao>
      </section>

      <section className="crc-camp-resumo-v2">
        <ResumoCamp
          icone={Play}
          rotulo="Rodando"
          valor={rodando}
          nota="Campanhas em envio"
          tom="positivo"
        />
        <ResumoCamp
          icone={Filter}
          rotulo="Rascunhos"
          valor={rascunhos}
          nota="Ainda sem congelar público"
        />
        <ResumoCamp
          icone={UsersRound}
          rotulo="Na fila"
          valor={pendentes}
          nota="Aguardando cadência"
          tom="info"
        />
        <ResumoCamp
          icone={MessageSquareText}
          rotulo="Enviadas"
          valor={enviadas}
          nota="Mensagens processadas"
        />
      </section>

      <Aviso tom="info">
        Campanha não fura as regras globais: quem pediu para parar fica de fora, o limite diário
        continua valendo e envios respeitam horário comercial.
      </Aviso>

      {campanhas.length === 0 ? (
        <div className="crc-camp-vazio-v2">
          <Vazio
            titulo="Nenhuma campanha ainda."
            explicacao="Monte um recorte da base e veja quantas pessoas entram e quanto custa antes de decidir enviar."
          />
        </div>
      ) : (
        <section className="crc-camp-lista-v2">
          {campanhas.map((c) => {
            const progresso =
              c.publico > 0 ? Math.min(100, Math.round((c.enviadas / c.publico) * 100)) : 0;
            const gasto = estimarCusto(c.enviadas, categoriaDeCampanha(), new Date()).total;
            return (
              <article key={c.id} className="crc-camp-card-v2" data-status={c.status}>
                <header>
                  <span className="crc-camp-card-icone-v2">
                    <Megaphone aria-hidden="true" />
                  </span>
                  <div>
                    <div className="crc-camp-card-titulo-v2">
                      <h3>{c.nome}</h3>
                      <Etiqueta tom={TOM_POR_STATUS[c.status] ?? "neutra"}>
                        {ROTULO_STATUS[c.status] ?? c.status}
                      </Etiqueta>
                    </div>
                    <p>{c.mensagem}</p>
                  </div>
                  <div className="crc-camp-card-acoes-v2">
                    {c.status === "RASCUNHO" && (
                      <Botao
                        pequeno
                        variante="primario"
                        disabled={acao.rodando}
                        onClick={() => void agendar(c)}
                      >
                        Revisar e agendar <ArrowRight size={14} aria-hidden="true" />
                      </Botao>
                    )}
                    {(c.status === "RODANDO" || c.status === "PAUSADA") && (
                      <Botao
                        pequeno
                        variante={c.status === "RODANDO" ? "secundario" : "primario"}
                        disabled={acao.rodando}
                        onClick={() => void alternar(c)}
                      >
                        {c.status === "RODANDO" ? (
                          <>
                            <Pause size={14} aria-hidden="true" /> Pausar
                          </>
                        ) : (
                          <>
                            <Play size={14} aria-hidden="true" /> Retomar
                          </>
                        )}
                      </Botao>
                    )}
                  </div>
                </header>

                {c.status === "RASCUNHO" ? (
                  <div className="crc-camp-rascunho-v2">
                    <ShieldCheck aria-hidden="true" />
                    <span>
                      Nada foi enviado. O público só é congelado quando você revisar e agendar.
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="crc-camp-metricas-v2">
                      <MetricaCamp rotulo="Público" valor={c.publico.toLocaleString("pt-BR")} />
                      <MetricaCamp rotulo="Enviadas" valor={c.enviadas.toLocaleString("pt-BR")} />
                      <MetricaCamp rotulo="Na fila" valor={c.pendentes.toLocaleString("pt-BR")} />
                      <MetricaCamp
                        rotulo="Puladas pelas regras"
                        valor={c.puladas.toLocaleString("pt-BR")}
                      />
                      <MetricaCamp rotulo="Gasto acumulado" valor={reais(gasto)} destaque />
                      <MetricaCamp
                        rotulo="Cadência"
                        valor={`${c.porDia.toLocaleString("pt-BR")}/dia`}
                      />
                    </div>
                    <div className="crc-camp-progresso-v2">
                      <div>
                        <span>Progresso</span>
                        <strong>{progresso}%</strong>
                      </div>
                      <i>
                        <b style={{ width: `${String(progresso)}%` }} />
                      </i>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </section>
      )}

      <Modal
        titulo="Montar campanha"
        aberto={montando}
        aoFechar={() => setMontando(false)}
        rodape={
          <>
            <Botao onClick={() => setMontando(false)}>Cancelar</Botao>
            <Botao
              variante="primario"
              carregando={acao.rodando}
              disabled={nome.trim().length < 3 || publico === 0}
              onClick={() => void criar()}
            >
              Criar rascunho
            </Botao>
          </>
        }
      >
        <div className="crc-camp-builder-v2">
          <section>
            <div className="crc-camp-builder-etapa-v2">
              <span>1</span>
              <div>
                <strong>Quem recebe</strong>
                <small>O servidor recalcula o público a cada ajuste.</small>
              </div>
            </div>
            <div className="crc-camp-faixas-v2">
              {(
                [
                  { nome: "6 a 12 meses", de: 180, ate: 365 },
                  { nome: "12 a 24 meses", de: 365, ate: 730 },
                  { nome: "mais de 24 meses", de: 730, ate: null },
                ] as const
              ).map((faixa) => {
                const ativa =
                  filtros.diasSemVoltar === faixa.de && filtros.diasSemVoltarAte === faixa.ate;
                return (
                  <button
                    key={faixa.nome}
                    type="button"
                    aria-pressed={ativa}
                    onClick={() =>
                      setFiltros((f) => ({
                        ...f,
                        diasSemVoltar: faixa.de,
                        diasSemVoltarAte: faixa.ate,
                      }))
                    }
                  >
                    {faixa.nome}
                  </button>
                );
              })}
            </div>
            <div className="crc-camp-campos-grid-v2">
              <Campo rotulo="Sem voltar há pelo menos" dica="Dias; em branco, não filtra.">
                {(id) => (
                  <Entrada
                    id={id}
                    inputMode="numeric"
                    value={filtros.diasSemVoltar === null ? "" : String(filtros.diasSemVoltar)}
                    onChange={(e) => {
                      const n = Number.parseInt(e.target.value, 10);
                      setFiltros((f) => ({
                        ...f,
                        diasSemVoltar: Number.isFinite(n) && n > 0 ? n : null,
                      }));
                    }}
                  />
                )}
              </Campo>
              <Campo rotulo="E no máximo" dica="Dias; em branco, sem teto.">
                {(id) => (
                  <Entrada
                    id={id}
                    inputMode="numeric"
                    value={
                      filtros.diasSemVoltarAte === null ? "" : String(filtros.diasSemVoltarAte)
                    }
                    onChange={(e) => {
                      const n = Number.parseInt(e.target.value, 10);
                      setFiltros((f) => ({
                        ...f,
                        diasSemVoltarAte: Number.isFinite(n) && n > 0 ? n : null,
                      }));
                    }}
                  />
                )}
              </Campo>
              <Campo rotulo="Situação" dica="Em branco, todas.">
                {(id) => (
                  <select
                    id={id}
                    className="crc-selecao"
                    value={filtros.situacao ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFiltros((f) => ({ ...f, situacao: v === "" ? null : v }));
                    }}
                  >
                    <option value="">Todas</option>
                    {SITUACOES_PACIENTE.map((s) => (
                      <option key={s} value={s}>
                        {ROTULO_SITUACAO[s]}
                      </option>
                    ))}
                  </select>
                )}
              </Campo>
              {opcoes.especialidades.length > 0 && (
                <Campo rotulo="Especialidade" dica="Em branco, todas.">
                  {(id) => (
                    <select
                      id={id}
                      className="crc-selecao"
                      value={filtros.especialidade ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFiltros((f) => ({ ...f, especialidade: v === "" ? null : v }));
                      }}
                    >
                      <option value="">Todas</option>
                      {opcoes.especialidades.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </select>
                  )}
                </Campo>
              )}
              {opcoes.convenios.length > 0 && (
                <Campo rotulo="Convênio" dica="Em branco, todos.">
                  {(id) => (
                    <select
                      id={id}
                      className="crc-selecao"
                      value={filtros.convenio ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFiltros((f) => ({ ...f, convenio: v === "" ? null : v }));
                      }}
                    >
                      <option value="">Todos</option>
                      {opcoes.convenios.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}
                </Campo>
              )}
            </div>
            <label className="crc-camp-check-v2">
              <input
                type="checkbox"
                checked={filtros.semConsultaFutura}
                onChange={(e) => setFiltros((f) => ({ ...f, semConsultaFutura: e.target.checked }))}
              />
              <span>Só quem não tem consulta marcada</span>
            </label>

            <div className="crc-camp-estimativa-v2">
              <div>
                <UsersRound aria-hidden="true" />
                <span>
                  <small>Entram nesse filtro</small>
                  <strong>
                    {contando ? "…" : publico === null ? "—" : publico.toLocaleString("pt-BR")}
                  </strong>
                </span>
              </div>
              <div>
                <CircleDollarSign aria-hidden="true" />
                <span>
                  <small>Custo estimado</small>
                  <strong>{contando || custo === null ? "…" : reais(custo.total)}</strong>
                </span>
              </div>
              <p>
                Campanha é marketing para a Meta — {reais(TARIFA_BRL.marketing)} por mensagem
                entregue.
                {dias > 1 && custo !== null
                  ? ` Com ${porDia.toLocaleString("pt-BR")} por dia, são cerca de ${dias} dias.`
                  : ""}
              </p>
            </div>
          </section>

          <section>
            <div className="crc-camp-builder-etapa-v2">
              <span>2</span>
              <div>
                <strong>O que chega</strong>
                <small>Use {"{{primeiroNome}}"} para personalizar.</small>
              </div>
            </div>
            <Campo rotulo="Nome da campanha">
              {(id) => (
                <Entrada
                  id={id}
                  value={nome}
                  maxLength={120}
                  placeholder="Quem sumiu há mais de um ano"
                  onChange={(e) => setNome(e.target.value)}
                />
              )}
            </Campo>
            <Campo rotulo="Mensagem">
              {(id) => (
                <textarea
                  id={id}
                  className="crc-area"
                  rows={4}
                  maxLength={900}
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                />
              )}
            </Campo>
          </section>

          <section>
            <div className="crc-camp-builder-etapa-v2">
              <span>3</span>
              <div>
                <strong>Quando sai</strong>
                <small>Cadência protege a base e o número da clínica.</small>
              </div>
            </div>
            <Campo rotulo="Quantas por dia">
              {(id) => (
                <Entrada
                  id={id}
                  inputMode="numeric"
                  value={String(porDia)}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    setPorDia(Number.isFinite(n) && n > 0 ? n : 1);
                  }}
                />
              )}
            </Campo>
            <Aviso tom="info">
              Criar não envia nada. A campanha nasce em rascunho e só começa depois de{" "}
              <strong>Revisar e agendar</strong>.
            </Aviso>
          </section>
        </div>
      </Modal>
    </div>
  );
}

function ResumoCamp({
  icone: Icone,
  rotulo,
  valor,
  nota,
  tom = "neutro",
}: {
  icone: typeof Play;
  rotulo: string;
  valor: number;
  nota: string;
  tom?: "neutro" | "positivo" | "info";
}) {
  return (
    <article className="crc-camp-resumo-card-v2" data-tom={tom}>
      <span>
        <Icone aria-hidden="true" />
      </span>
      <div>
        <small>{rotulo}</small>
        <strong>{valor}</strong>
        <em>{nota}</em>
      </div>
    </article>
  );
}
function MetricaCamp({
  rotulo,
  valor,
  destaque = false,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div className={`crc-camp-metrica-v2${destaque ? " crc-camp-metrica-destaque-v2" : ""}`}>
      <small>{rotulo}</small>
      <strong>{valor}</strong>
    </div>
  );
}
