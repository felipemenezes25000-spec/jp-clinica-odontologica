/**
 * Campanhas — falar com um grupo sem virar disparo em massa.
 *
 * A TELA SÃO OS TRÊS PASSOS, e nessa ordem: quem recebe, o que chega, quando
 * sai. Cada um responde uma pergunta que a pessoa já tem na cabeça, e nenhum
 * pede nada que ela ainda não saiba responder.
 *
 * O NÚMERO APARECE ANTES DE ENVIAR, e muda quando o filtro muda. É a única
 * coisa que transforma "montar uma campanha" numa decisão informada: sem ele, a
 * pessoa aperta enviar sem saber se está falando com trinta ou com três mil.
 * Por isso ele é recontado no servidor a cada ajuste, com debounce — e não
 * estimado no cliente.
 *
 * "REVISAR E AGENDAR" É UM SEGUNDO CLIQUE, deliberadamente. Criar a campanha
 * não manda nada; ela nasce em rascunho. O público só é congelado quando
 * alguém revisa e agenda — e a partir daí o que foi revisado é o que sai.
 */
import { useCallback, useEffect, useRef, useState } from "react";

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
  Cartao,
  Entrada,
  Etiqueta,
  ListaEsqueleto,
  Modal,
  Vazio,
  useAcao,
} from "./base";

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
      } else {
        setErro(r.message);
      }
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
        // Sem as opções a tela continua montando campanha — só sem os dois
        // filtros que dependem delas.
        setOpcoes({ especialidades: [], convenios: [] });
      }
    })();
  }, [recarregar]);

  // A contagem prévia. 300ms depois do último ajuste: quem mexe num filtro
  // costuma mexer em três seguidos, e uma consulta por tecla seria desperdício.
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
        () => {
          void recarregar();
        },
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
        () => {
          void recarregar();
        },
        c.status === "RODANDO" ? `"${c.nome}" pausada.` : `"${c.nome}" retomada.`,
      );
    },
    [acao, recarregar],
  );

  // A estimativa acompanha a contagem: mesmo público, mesma hora de leitura.
  // `new Date()` aqui é seguro porque o modal só existe depois de um clique —
  // não há render de servidor para divergir na hidratação.
  const custo = publico === null ? null : estimarCusto(publico, categoriaDeCampanha(), new Date());
  const dias = publico === null || porDia <= 0 ? 0 : Math.ceil(publico / porDia);

  if (erro !== null && campanhas === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (campanhas === null) return <ListaEsqueleto linhas={3} />;

  return (
    <>
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      <Cartao
        titulo="Campanhas"
        acao={
          <Botao
            variante="primario"
            onClick={() => {
              setMontando(true);
              setPublico(null);
            }}
          >
            Montar campanha
          </Botao>
        }
      >
        <Aviso tom="info">
          Toda campanha passa pelas mesmas regras de uma mensagem individual: uma por pessoa por
          dia, só em horário comercial, e quem pediu para parar fica de fora. Ela é uma fila que
          respeita as regras — não um canal paralelo.
        </Aviso>

        {campanhas.length === 0 ? (
          <Vazio
            titulo="Nenhuma campanha ainda."
            explicacao="Uma campanha fala com um recorte da base — quem sumiu há mais de um ano, quem parou no meio do tratamento. Monte uma e veja quantas pessoas entram no filtro antes de enviar qualquer coisa."
          />
        ) : (
          <ul className="crc-pilha" style={{ marginTop: "var(--crc-e4)" }}>
            {campanhas.map((c) => (
              <li key={c.id} className="crc-cartao-compacto">
                <div className="crc-linha">
                  <strong style={{ flex: 1 }}>{c.nome}</strong>
                  <Etiqueta tom={TOM_POR_STATUS[c.status] ?? "neutra"}>
                    {ROTULO_STATUS[c.status] ?? c.status}
                  </Etiqueta>
                </div>

                <p className="crc-corpo" style={{ marginTop: "var(--crc-e2)" }}>
                  {c.mensagem}
                </p>

                <div className="crc-linha" style={{ marginTop: "var(--crc-e3)" }}>
                  {c.status === "RASCUNHO" ? (
                    <span className="crc-meta">
                      Ainda não enviou nada. Revise e agende para congelar o público.
                    </span>
                  ) : (
                    <>
                      <span className="crc-meta">{c.publico} no público</span>
                      {/* O gasto acumulado fica colado no número de enviadas
                          porque é a mesma informação lida de dois jeitos — e
                          porque é o dado que decide pausar uma campanha que
                          está entregando pouco. */}
                      <span className="crc-meta">
                        {c.enviadas} enviadas ·{" "}
                        {reais(estimarCusto(c.enviadas, categoriaDeCampanha(), new Date()).total)}
                      </span>
                      <span className="crc-meta">{c.pendentes} na fila</span>
                      {/* As puladas aparecem sempre que existem: "312 de 964"
                          sem explicar os 652 restantes faz a equipe desconfiar
                          da ferramenta inteira. */}
                      {c.puladas > 0 && (
                        <span className="crc-meta">{c.puladas} puladas pelas regras</span>
                      )}
                      <span className="crc-meta">{c.porDia} por dia</span>
                    </>
                  )}

                  <div className="crc-linha crc-empurra">
                    {c.status === "RASCUNHO" && (
                      <Botao
                        pequeno
                        variante="primario"
                        disabled={acao.rodando}
                        onClick={() => {
                          void agendar(c);
                        }}
                      >
                        Revisar e agendar
                      </Botao>
                    )}
                    {(c.status === "RODANDO" || c.status === "PAUSADA") && (
                      <Botao
                        pequeno
                        variante={c.status === "RODANDO" ? "secundario" : "primario"}
                        disabled={acao.rodando}
                        onClick={() => {
                          void alternar(c);
                        }}
                      >
                        {c.status === "RODANDO" ? "Pausar" : "Retomar"}
                      </Botao>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Modal
        titulo="Montar campanha"
        aberto={montando}
        aoFechar={() => {
          setMontando(false);
        }}
        rodape={
          <>
            <Botao
              onClick={() => {
                setMontando(false);
              }}
            >
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              carregando={acao.rodando}
              disabled={nome.trim().length < 3 || publico === 0}
              onClick={() => {
                void criar();
              }}
            >
              Criar rascunho
            </Botao>
          </>
        }
      >
        <p className="crc-meta" style={{ marginBottom: "var(--crc-e4)" }}>
          <strong>Passo 1 — quem vai receber.</strong> Quem está arquivado, inativo, sem telefone ou
          pediu para parar já fica de fora, sempre.
        </p>

        {/*
          OS ATALHOS VÊM ANTES DOS CAMPOS, e não depois, porque quase toda
          campanha de reativação é uma destas três. Digitar "365" e "730" à mão
          é onde o erro entra — e um erro aqui manda a mesma mensagem para quem
          sumiu há sete meses e para quem sumiu há sete anos.
        */}
        <div className="crc-linha" style={{ marginBottom: "var(--crc-e3)" }}>
          <span className="crc-meta">Faixas comuns:</span>
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
              <Botao
                key={faixa.nome}
                pequeno
                variante={ativa ? "primario" : "discreto"}
                onClick={() => {
                  setFiltros((f) => ({
                    ...f,
                    diasSemVoltar: faixa.de,
                    diasSemVoltarAte: faixa.ate,
                  }));
                }}
              >
                {faixa.nome}
              </Botao>
            );
          })}
        </div>

        <Campo rotulo="Sem voltar há pelo menos (dias)" dica="Em branco, não filtra por tempo.">
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

        <Campo
          rotulo="E no máximo (dias)"
          dica="Em branco, não há teto: entra todo mundo daquele tempo para cima."
        >
          {(id) => (
            <Entrada
              id={id}
              inputMode="numeric"
              value={filtros.diasSemVoltarAte === null ? "" : String(filtros.diasSemVoltarAte)}
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
              <option value="">Todas as situações</option>
              {SITUACOES_PACIENTE.map((s) => (
                <option key={s} value={s}>
                  {ROTULO_SITUACAO[s]}
                </option>
              ))}
            </select>
          )}
        </Campo>

        {/* Lista vinda do banco, e não texto livre: "implantodontia" digitado em
            minúsculas casaria com ninguém, e a tela mostraria zero sem explicar
            que o erro foi de digitação. */}
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
                <option value="">Todas as especialidades</option>
                {opcoes.especialidades.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            )}
          </Campo>
        )}

        {/* O convênio só aparece quando algum paciente tem um. Enquanto o Dental
            Office não informar o campo, um filtro visível que nunca casa com
            ninguém faria a clínica concluir que o sistema está quebrado. */}
        {opcoes.convenios.length > 0 && (
          <Campo rotulo="Convênio" dica="Em branco, todos — inclusive quem é particular.">
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
                <option value="">Todos os convênios</option>
                {opcoes.convenios.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </Campo>
        )}

        <label className="crc-linha" style={{ marginTop: "var(--crc-e2)" }}>
          <input
            type="checkbox"
            checked={filtros.semConsultaFutura}
            onChange={(e) => {
              const marcado = e.target.checked;
              setFiltros((f) => ({ ...f, semConsultaFutura: marcado }));
            }}
          />
          <span className="crc-corpo">Só quem não tem consulta marcada</span>
        </label>

        {/*
          OS DOIS NÚMEROS TÊM O MESMO PESO, e isso é a decisão da tela.
          Quantas pessoas e quanto custa são os dois lados de "vale a pena
          mandar?". Enquanto só o primeiro aparecia, "964 entram nesse filtro"
          era uma informação simpática que escondia R$ 301 — e ninguém aperta
          enviar querendo descobrir isso na fatura.
        */}
        <div
          className="crc-kpi"
          style={{ marginTop: "var(--crc-e4)", marginBottom: "var(--crc-e5)" }}
        >
          {/*
            UM BLOCO SÓ, E NÃO DOIS CARTÕES. O modal tem 478px úteis; dois
            cartões de KPI lado a lado sobrariam 2px e apertariam os dois
            números. Mais que isso: são as duas metades da MESMA pergunta, e
            separá-los em caixas sugeriria que dá para olhar uma e ignorar a
            outra.
          */}
          <div className="crc-linha" style={{ gap: "var(--crc-e6)", alignItems: "flex-start" }}>
            <div className="crc-pilha" style={{ gap: "var(--crc-e1)", minWidth: 0 }}>
              <span className="crc-kpi-rotulo">Entram nesse filtro</span>
              <span className="crc-kpi-valor">
                {contando ? "…" : publico === null ? "—" : publico.toLocaleString("pt-BR")}
              </span>
            </div>

            <div className="crc-pilha" style={{ gap: "var(--crc-e1)", minWidth: 0 }}>
              <span className="crc-kpi-rotulo">Custo estimado</span>
              <span className="crc-kpi-valor">
                {contando || custo === null ? "…" : reais(custo.total)}
              </span>
            </div>
          </div>

          <span className="crc-kpi-nota" style={{ marginTop: "var(--crc-e2)" }}>
            {publico === 0 ? (
              "Ninguém entra nesse recorte hoje. Ajuste o filtro."
            ) : (
              <>
                Campanha é <strong>marketing</strong> para a Meta — {reais(TARIFA_BRL.marketing)}{" "}
                por mensagem entregue, contra {reais(TARIFA_BRL.utilidade)} de uma confirmação de
                consulta.
                {dias > 1 && custo !== null && (
                  <>
                    {" "}
                    Saindo {porDia.toLocaleString("pt-BR")} por dia, são {dias} dias a cerca de{" "}
                    {reais(custo.total / dias)} por dia.
                  </>
                )}{" "}
                Os dois números mudam quando você mexe no filtro.
              </>
            )}
          </span>
        </div>

        <p className="crc-meta" style={{ marginBottom: "var(--crc-e3)" }}>
          <strong>Passo 2 — o que vai chegar.</strong> Escreva uma vez; o sistema põe o nome de cada
          pessoa. Use <code>{"{{primeiroNome}}"}</code>.
        </p>

        <Campo rotulo="Nome da campanha">
          {(id) => (
            <Entrada
              id={id}
              value={nome}
              maxLength={120}
              placeholder="Quem sumiu há mais de um ano"
              onChange={(e) => {
                setNome(e.target.value);
              }}
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
              onChange={(e) => {
                setMensagem(e.target.value);
              }}
            />
          )}
        </Campo>

        <p
          className="crc-meta"
          style={{ marginTop: "var(--crc-e4)", marginBottom: "var(--crc-e3)" }}
        >
          <strong>Passo 3 — quando sai.</strong> Espalhar é o que impede queimar a base.
        </p>

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
          Criar não envia nada. A campanha nasce em rascunho — o público só é congelado quando você
          clicar em <strong>Revisar e agendar</strong>.
        </Aviso>
      </Modal>
    </>
  );
}
