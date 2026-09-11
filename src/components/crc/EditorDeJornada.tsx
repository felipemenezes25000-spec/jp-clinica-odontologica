/**
 * O Workflow Studio — o canvas.
 *
 * ========================================================================
 *  POR QUE ESTE EDITOR É UMA COLUNA, E NÃO UM CANVAS LIVRE.
 *
 *  A referência pedida era Dify/Botpress: nós soltos, setas em qualquer
 *  direção. Não é isto, e a razão está em `dominio/workflow.ts`: **o motor de
 *  jornadas não executa grafo.** Ele executa uma sequência, com saídas
 *  avaliadas antes de cada passo.
 *
 *  Um canvas que deixasse ligar dois caminhos saindo do mesmo nó desenharia
 *  algo que o `motor.ts` não sabe rodar. A pessoa configuraria, salvaria, veria
 *  o desenho na tela — e a jornada rodaria em linha reta ignorando os ramos.
 *  Uma ferramenta de configuração que não dá erro e não faz o que mostra é pior
 *  do que não ter ferramenta.
 *
 *  Então o desenho mostra a forma REAL do motor. Quando ele souber ramificar,
 *  esta tela muda junto — e não antes.
 * ========================================================================
 *
 * O QUE ESTA TELA FAZ QUE UMA LISTA DE CAMPOS NÃO FARIA:
 *
 *   MOSTRA O TEMPO. A jornada persegue alguém por três dias, e isso não aparece
 *   em lugar nenhum lendo `{tipo: "ESPERAR", minutos: 1440}`. Aqui o tempo
 *   acumulado aparece ao lado de cada passo.
 *
 *   MOSTRA AS SAÍDAS COMO O QUE ELAS SÃO: uma guarda que vale para TODOS os
 *   passos, e não um item no fim da lista. É o erro de leitura mais caro deste
 *   modelo, e uma barra lateral contínua o corrige sem precisar de texto.
 *
 *   MOSTRA O CUSTO ANTES DE PUBLICAR. Cada mensagem é dinheiro e é o celular de
 *   um paciente.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Clock,
  DoorOpen,
  Info,
  MessageSquareText,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";

import {
  carregarJornadaParaEditar,
  publicarJornada,
  type JornadaParaEditarDto,
} from "@/lib/crc/api";
import type {
  CondicaoAutomacao,
  DefinicaoAutomacao,
  PassoAutomacao,
  TipoTarefa,
} from "@/lib/crc/dominio/tipos";
import {
  daPaleta,
  descreverGatilho,
  descreverPasso,
  duracao,
  mover,
  PALETA,
  passoNovo,
  podePublicar,
  resumir,
  ROTULO_CONDICAO,
  validarDefinicao,
  type Achado,
  type TipoPasso,
} from "@/lib/crc/dominio/workflow";

import {
  Aviso,
  BarraDeRecado,
  Botao,
  Campo,
  Entrada,
  Etiqueta,
  ListaEsqueleto,
  useAcao,
} from "./base";

export function EditorDeJornada({
  automationId,
  podeGerenciar,
}: {
  automationId: string;
  podeGerenciar: boolean;
}) {
  const [base, setBase] = useState<JornadaParaEditarDto | null>(null);
  const [rascunho, setRascunho] = useState<DefinicaoAutomacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarJornadaParaEditar({ data: { automationId } });
      if (r.ok) {
        setBase(r.jornada);
        setRascunho(r.jornada.definicao);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos carregar esta jornada.");
    }
  }, [automationId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  /*
   * A VALIDAÇÃO RODA A CADA TECLA, com a MESMA função que o servidor usa.
   *
   * Mesma função, e não uma cópia simplificada: duas validações divergem no
   * primeiro mês, e a divergência aparece como "a tela deixou salvar e o
   * servidor recusou" — que é a pior forma de descobrir uma regra.
   */
  const achados = useMemo<Achado[]>(() => {
    if (rascunho === null || base === null) return [];
    return validarDefinicao(rascunho, {
      templatesDisponiveis: base.templatesDisponiveis,
      etapasDisponiveis: base.etapasDisponiveis,
    });
  }, [rascunho, base]);

  const resumo = useMemo(() => (rascunho === null ? null : resumir(rascunho)), [rascunho]);

  const mudou = useMemo(
    () =>
      base !== null &&
      rascunho !== null &&
      JSON.stringify(base.definicao) !== JSON.stringify(rascunho),
    [base, rascunho],
  );

  const trocarPassos = useCallback((passos: PassoAutomacao[]): void => {
    setRascunho((d) => (d === null ? null : { ...d, passos }));
  }, []);

  if (erro !== null && base === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (base === null || rascunho === null || resumo === null) return <ListaEsqueleto linhas={6} />;

  const publicar = (): void => {
    void acao.executar(
      () =>
        publicarJornada({
          data: { automationId, definicao: rascunho, versaoEsperada: base.versao },
        }),
      () => {
        void recarregar();
      },
      "Jornada publicada. Quem já estava no meio continua na versão anterior.",
    );
  };

  return (
    <div className="crc-wf">
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      {/* ---- o cabeçalho: o que está em jogo -------------------------- */}
      <header className="crc-wf-topo">
        <div>
          <h3>{base.nome}</h3>
          <p className="crc-meta">
            Versão {base.versao} publicada
            {base.emJornada > 0 && (
              <>
                {" · "}
                <strong>{base.emJornada} paciente(s) no meio dela agora</strong>
              </>
            )}
          </p>
        </div>

        {podeGerenciar && (
          <div className="crc-wf-acoes">
            {mudou && (
              <Botao
                variante="discreto"
                onClick={() => {
                  setRascunho(base.definicao);
                }}
              >
                Descartar mudanças
              </Botao>
            )}
            <Botao
              variante="primario"
              disabled={!mudou || !podePublicar(achados)}
              carregando={acao.rodando}
              onClick={publicar}
            >
              Publicar versão {base.versao + 1}
            </Botao>
          </div>
        )}
      </header>

      {/*
        O AVISO DE JORNADA EM VOO aparece SÓ quando há gente dentro, e diz o que
        vai acontecer com ela — não um "atenção" genérico. A regra é boa notícia
        e precisa ser dita: ninguém é teleportado para a jornada nova no meio.
      */}
      {base.emJornada > 0 && mudou && (
        <Aviso tom="info">
          Os <strong>{base.emJornada}</strong> pacientes que já estão nesta jornada continuam na
          versão {base.versao} até o fim. A versão nova vale só para quem entrar depois de publicar.
        </Aviso>
      )}

      <div className="crc-wf-corpo">
        {/* ---- a coluna do fluxo ------------------------------------- */}
        <div className="crc-wf-fluxo">
          <NoDeGatilho definicao={rascunho} />

          <Conector />

          <NoDeEntrada condicoes={rascunho.condicoes} />

          {rascunho.passos.length === 0 ? (
            <>
              <Conector />
              <div className="crc-wf-no crc-wf-no-vazio">
                <p className="crc-corpo">Esta jornada não faz nada ainda.</p>
                <small className="crc-meta">Acrescente o primeiro passo abaixo.</small>
              </div>
            </>
          ) : (
            rascunho.passos.map((p, i) => (
              <PassoNoFluxo
                key={`${p.tipo}-${String(i)}`}
                passo={p}
                indice={i}
                total={rascunho.passos.length}
                minutosAcumulados={minutosAte(rascunho.passos, i)}
                achados={achados.filter((a) => a.passo === i)}
                editavel={podeGerenciar}
                base={base}
                aoMudar={(novo) => {
                  trocarPassos(rascunho.passos.map((x, j) => (j === i ? novo : x)));
                }}
                aoRemover={() => {
                  trocarPassos(rascunho.passos.filter((_, j) => j !== i));
                }}
                aoMover={(delta) => {
                  trocarPassos(mover(rascunho.passos, i, i + delta));
                }}
              />
            ))
          )}

          {podeGerenciar && (
            <AdicionarPasso
              aoAdicionar={(tipo) => {
                trocarPassos([...rascunho.passos, passoNovo(tipo)]);
              }}
            />
          )}

          <Conector />
          <div className="crc-wf-no crc-wf-no-fim">Jornada concluída</div>
        </div>

        {/* ---- a lateral: saídas, resumo, problemas ------------------ */}
        <aside className="crc-wf-lado">
          <Saidas
            saidas={rascunho.saidas}
            editavel={podeGerenciar}
            aoMudar={(saidas) => {
              setRascunho({ ...rascunho, saidas });
            }}
          />

          <section className="crc-wf-painel">
            <h4>O que ela faz</h4>
            <ul className="crc-wf-resumo">
              <li>
                <span>Passos</span>
                <strong>{resumo.passos}</strong>
              </li>
              <li>
                <span>Mensagens por paciente</span>
                <strong>{resumo.mensagens}</strong>
              </li>
              <li>
                <span>Tarefas para a recepção</span>
                <strong>{resumo.tarefas}</strong>
              </li>
              <li>
                {/*
                  O NÚMERO QUE MAIS SURPREENDE quem montou a jornada. Ninguém
                  soma 120 + 1440 + 2880 de cabeça lendo a lista de passos, e o
                  resultado costuma ser "esta coisa persegue a pessoa por uma
                  semana".
                */}
                <span>Duração, se ninguém sair</span>
                <strong>{duracao(resumo.duracaoTotalMinutos)}</strong>
              </li>
            </ul>
          </section>

          <Problemas achados={achados} />
        </aside>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Os nós do fluxo                                                            */
/* -------------------------------------------------------------------------- */

function Conector() {
  return <div className="crc-wf-conector" aria-hidden="true" />;
}

function NoDeGatilho({ definicao }: { definicao: DefinicaoAutomacao }) {
  return (
    <div className="crc-wf-no crc-wf-no-gatilho">
      <span className="crc-wf-no-icone">
        <Zap size={16} aria-hidden="true" />
      </span>
      <div>
        <strong>{descreverGatilho(definicao.gatilho)}</strong>
        <small className="crc-meta">
          {/*
            O GATILHO NÃO É EDITÁVEL AQUI, e dizer por quê evita o chamado de
            suporte. Trocá-lo não é editar a jornada: é criar outra, com outro
            público — e as métricas da atual passariam a somar duas coisas
            diferentes sob o mesmo nome.
          */}
          O gatilho não muda por aqui: trocá-lo faria desta outra automação, e o histórico das duas
          ficaria somado.
        </small>
      </div>
    </div>
  );
}

function NoDeEntrada({ condicoes }: { condicoes: CondicaoAutomacao[] }) {
  return (
    <div className="crc-wf-no crc-wf-no-entrada">
      <span className="crc-wf-no-icone">
        <Info size={16} aria-hidden="true" />
      </span>
      <div>
        <strong>Entra na jornada quem</strong>
        {condicoes.length === 0 ? (
          <small className="crc-meta">Todo mundo que dispara o gatilho.</small>
        ) : (
          <ul className="crc-wf-condicoes">
            {condicoes.map((c, i) => (
              <li key={`${c.tipo}-${String(i)}`}>{ROTULO_CONDICAO[c.tipo]}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PassoNoFluxo({
  passo,
  indice,
  total,
  minutosAcumulados,
  achados,
  editavel,
  base,
  aoMudar,
  aoRemover,
  aoMover,
}: {
  passo: PassoAutomacao;
  indice: number;
  total: number;
  minutosAcumulados: number;
  achados: Achado[];
  editavel: boolean;
  base: JornadaParaEditarDto;
  aoMudar: (p: PassoAutomacao) => void;
  aoRemover: () => void;
  aoMover: (delta: number) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const meta = daPaleta(passo.tipo);
  const temErro = achados.some((a) => a.severidade === "erro");

  return (
    <>
      <Conector />
      <div
        className="crc-wf-no crc-wf-no-passo"
        data-severidade={temErro ? "erro" : achados.length > 0 ? "aviso" : "ok"}
        data-tipo={passo.tipo}
      >
        <span className="crc-wf-no-icone">
          {meta?.custaMensagem === true ? (
            <MessageSquareText size={16} aria-hidden="true" />
          ) : meta?.pausa === true ? (
            <Clock size={16} aria-hidden="true" />
          ) : passo.tipo === "SAIR_SE" ? (
            <DoorOpen size={16} aria-hidden="true" />
          ) : (
            <Zap size={16} aria-hidden="true" />
          )}
        </span>

        <div className="crc-wf-no-corpo">
          <div className="crc-wf-no-titulo">
            <strong>{descreverPasso(passo)}</strong>
            {/*
              O TEMPO ACUMULADO é o que uma lista de passos esconde. "Dia 3" ao
              lado do segundo lembrete responde, sem ninguém somar nada, a
              pergunta que decide se a jornada é insistente ou perseguidora.
            */}
            {minutosAcumulados > 0 && (
              <Etiqueta tom="neutra">+{duracao(minutosAcumulados)}</Etiqueta>
            )}
            {meta?.custaMensagem === true && <Etiqueta tom="alerta">custa envio</Etiqueta>}
          </div>

          {achados.map((a) => (
            <p key={a.mensagem} className={`crc-wf-achado crc-wf-achado-${a.severidade}`}>
              <AlertTriangle size={13} aria-hidden="true" />
              <span>
                <strong>{a.mensagem}</strong> {a.conserto}
              </span>
            </p>
          ))}

          {aberto && editavel && <CamposDoPasso passo={passo} base={base} aoMudar={aoMudar} />}
        </div>

        {editavel && (
          <div className="crc-wf-no-botoes">
            <Botao
              pequeno
              variante="discreto"
              onClick={() => {
                setAberto((v) => !v);
              }}
            >
              {aberto ? "Fechar" : "Ajustar"}
            </Botao>
            <button
              type="button"
              className="crc-wf-icone-botao"
              aria-label="Mover para cima"
              disabled={indice === 0}
              onClick={() => {
                aoMover(-1);
              }}
            >
              <ArrowUp size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="crc-wf-icone-botao"
              aria-label="Mover para baixo"
              disabled={indice === total - 1}
              onClick={() => {
                aoMover(1);
              }}
            >
              <ArrowDown size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="crc-wf-icone-botao crc-wf-icone-perigo"
              aria-label="Remover passo"
              onClick={aoRemover}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Os campos de um passo, por tipo.
 *
 * SETAS E BOTÕES, E NÃO ARRASTAR. Reordenar por teclado funciona, funciona no
 * celular, e é anunciável por leitor de tela — três coisas que um `drag and
 * drop` caseiro não entrega sem muito código. A jornada tem cinco a dez passos;
 * o ganho do arrasto aqui seria estética, e o custo seria acessibilidade.
 */
function CamposDoPasso({
  passo,
  base,
  aoMudar,
}: {
  passo: PassoAutomacao;
  base: JornadaParaEditarDto;
  aoMudar: (p: PassoAutomacao) => void;
}) {
  return (
    <div className="crc-wf-campos">
      {passo.tipo === "ESPERAR" && (
        <Campo rotulo="Esperar quanto tempo" dica="Em minutos. 1440 é um dia.">
          {(id) => (
            <Entrada
              id={id}
              type="number"
              min={1}
              value={passo.minutos}
              onChange={(e) => {
                aoMudar({ ...passo, minutos: Number(e.target.value) });
              }}
            />
          )}
        </Campo>
      )}

      {passo.tipo === "ESPERAR_ATE" && (
        <Campo
          rotulo="Esperar até que horas"
          dica="Evita que uma mensagem saia de madrugada quando o gatilho cai às 3h."
        >
          {(id) => (
            <Entrada
              id={id}
              type="time"
              value={passo.hora}
              onChange={(e) => {
                aoMudar({ ...passo, hora: e.target.value });
              }}
            />
          )}
        </Campo>
      )}

      {passo.tipo === "ENVIAR_TEMPLATE" && (
        <Campo rotulo="Qual modelo" dica="Só modelos cadastrados em Modelos aparecem aqui.">
          {(id) => (
            <select
              id={id}
              className="crc-entrada"
              value={passo.template}
              onChange={(e) => {
                aoMudar({ ...passo, template: e.target.value });
              }}
            >
              <option value="">Escolha um modelo…</option>
              {base.templatesDisponiveis.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </Campo>
      )}

      {passo.tipo === "CRIAR_TAREFA" && (
        <>
          <Campo rotulo="O que a pessoa deve fazer">
            {(id) => (
              <Entrada
                id={id}
                value={passo.titulo}
                onChange={(e) => {
                  aoMudar({ ...passo, titulo: e.target.value });
                }}
              />
            )}
          </Campo>
          <Campo rotulo="Tipo">
            {(id) => (
              <select
                id={id}
                className="crc-entrada"
                value={passo.tipoTarefa}
                onChange={(e) => {
                  aoMudar({ ...passo, tipoTarefa: e.target.value as TipoTarefa });
                }}
              >
                {(
                  ["LIGAR", "WHATSAPP", "REVISAR", "NEGOCIAR", "CONFIRMAR", "RETORNAR"] as const
                ).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </Campo>
          <Campo rotulo="Prazo, em horas">
            {(id) => (
              <Entrada
                id={id}
                type="number"
                min={1}
                value={passo.prazoHoras}
                onChange={(e) => {
                  aoMudar({ ...passo, prazoHoras: Number(e.target.value) });
                }}
              />
            )}
          </Campo>
        </>
      )}

      {passo.tipo === "MOVER_ETAPA" && (
        <Campo rotulo="Para qual etapa do funil">
          {(id) => (
            <select
              id={id}
              className="crc-entrada"
              value={passo.etapa}
              onChange={(e) => {
                aoMudar({ ...passo, etapa: e.target.value });
              }}
            >
              <option value="">Escolha uma etapa…</option>
              {base.etapasDisponiveis.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          )}
        </Campo>
      )}

      {passo.tipo === "DEFINIR_PROXIMA_ACAO" && (
        <>
          <Campo rotulo="Qual a próxima ação" dica="Aparece na fila do dia de quem atende.">
            {(id) => (
              <Entrada
                id={id}
                value={passo.acao}
                onChange={(e) => {
                  aoMudar({ ...passo, acao: e.target.value });
                }}
              />
            )}
          </Campo>
          <Campo rotulo="Em quantas horas">
            {(id) => (
              <Entrada
                id={id}
                type="number"
                min={1}
                value={passo.emHoras}
                onChange={(e) => {
                  aoMudar({ ...passo, emHoras: Number(e.target.value) });
                }}
              />
            )}
          </Campo>
        </>
      )}

      {passo.tipo === "SAIR_SE" && (
        <>
          <Campo rotulo="Sair quando">
            {(id) => (
              <select
                id={id}
                className="crc-entrada"
                value={passo.condicao.tipo}
                onChange={(e) => {
                  aoMudar({
                    ...passo,
                    condicao: { tipo: e.target.value } as CondicaoAutomacao,
                  });
                }}
              >
                {CONDICOES_SIMPLES.map((c) => (
                  <option key={c} value={c}>
                    {ROTULO_CONDICAO[c]}
                  </option>
                ))}
              </select>
            )}
          </Campo>
          <Campo
            rotulo="Motivo"
            dica="É o que aparece no relatório de por que as jornadas terminaram."
          >
            {(id) => (
              <Entrada
                id={id}
                value={passo.motivo}
                onChange={(e) => {
                  aoMudar({ ...passo, motivo: e.target.value });
                }}
              />
            )}
          </Campo>
        </>
      )}
    </div>
  );
}

/**
 * As condições sem parâmetro.
 *
 * `SITUACAO_E` e `DIAS_DESDE_…` ficam de fora do seletor porque cada uma precisa
 * de um segundo campo, e um seletor que muda a forma do formulário conforme a
 * escolha é onde este editor começaria a ficar confuso. Quem precisa delas
 * continua tendo as automações de fábrica — e quando houver demanda, elas ganham
 * campo próprio em vez de um genérico mal resolvido.
 */
const CONDICOES_SIMPLES = [
  "PACIENTE_RESPONDEU",
  "PACIENTE_NAO_RESPONDEU",
  "TEM_CONSULTA_FUTURA",
  "SEM_CONSULTA_FUTURA",
  "PACIENTE_ATIVO",
  "SEM_OPT_OUT",
  "TEM_TELEFONE",
] as const satisfies readonly CondicaoAutomacao["tipo"][];

function AdicionarPasso({ aoAdicionar }: { aoAdicionar: (t: TipoPasso) => void }) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <Conector />
      {aberto ? (
        <div className="crc-wf-paleta">
          {PALETA.map((p) => (
            <button
              key={p.tipo}
              type="button"
              className="crc-wf-paleta-item"
              onClick={() => {
                aoAdicionar(p.tipo);
                setAberto(false);
              }}
            >
              <strong>{p.nome}</strong>
              <small>{p.explicacao}</small>
            </button>
          ))}
          <Botao
            variante="discreto"
            onClick={() => {
              setAberto(false);
            }}
          >
            Cancelar
          </Botao>
        </div>
      ) : (
        <button
          type="button"
          className="crc-wf-adicionar"
          onClick={() => {
            setAberto(true);
          }}
        >
          <Plus size={16} aria-hidden="true" /> Acrescentar passo
        </button>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* A lateral                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * As saídas, desenhadas como GUARDA e não como lista.
 *
 * O ERRO DE LEITURA MAIS CARO DESTE MODELO é achar que a saída acontece no fim.
 * Ela é avaliada ANTES DE CADA PASSO — inclusive o primeiro. Quem lê "saídas"
 * como um item no rodapé monta uma jornada que encerra todo mundo na entrada e
 * não entende por quê.
 *
 * A barra fica na lateral, contínua, ao lado de todos os passos: a posição diz
 * o que o texto teria que explicar.
 */
function Saidas({
  saidas,
  editavel,
  aoMudar,
}: {
  saidas: { condicao: CondicaoAutomacao; motivo: string }[];
  editavel: boolean;
  aoMudar: (s: { condicao: CondicaoAutomacao; motivo: string }[]) => void;
}) {
  return (
    <section className="crc-wf-painel crc-wf-saidas">
      <h4>
        <DoorOpen size={15} aria-hidden="true" /> Sai da jornada a qualquer momento
      </h4>
      <p className="crc-meta">
        Conferido <strong>antes de cada passo</strong>, inclusive o primeiro. É o que impede
        &ldquo;sentimos sua falta&rdquo; de chegar para quem já remarcou.
      </p>

      {saidas.length === 0 ? (
        <p className="crc-corpo">Nenhuma. A jornada vai até o fim, aconteça o que acontecer.</p>
      ) : (
        <ul className="crc-wf-saidas-lista">
          {saidas.map((s, i) => (
            <li key={`${s.condicao.tipo}-${String(i)}`}>
              <span>{ROTULO_CONDICAO[s.condicao.tipo]}</span>
              {editavel && (
                <button
                  type="button"
                  className="crc-wf-icone-botao crc-wf-icone-perigo"
                  aria-label={`Remover saída ${ROTULO_CONDICAO[s.condicao.tipo]}`}
                  onClick={() => {
                    aoMudar(saidas.filter((_, j) => j !== i));
                  }}
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editavel && (
        <select
          className="crc-entrada"
          value=""
          aria-label="Acrescentar saída"
          onChange={(e) => {
            const tipo = e.target.value;
            if (tipo.length === 0) return;
            aoMudar([
              ...saidas,
              { condicao: { tipo } as CondicaoAutomacao, motivo: tipo.toLowerCase() },
            ]);
          }}
        >
          <option value="">Acrescentar saída…</option>
          {CONDICOES_SIMPLES.filter((c) => !saidas.some((s) => s.condicao.tipo === c)).map((c) => (
            <option key={c} value={c}>
              {ROTULO_CONDICAO[c]}
            </option>
          ))}
        </select>
      )}
    </section>
  );
}

function Problemas({ achados }: { achados: Achado[] }) {
  const erros = achados.filter((a) => a.severidade === "erro");
  const avisos = achados.filter((a) => a.severidade === "aviso");

  if (achados.length === 0) {
    return (
      <section className="crc-wf-painel">
        <h4>Conferência</h4>
        <p className="crc-corpo">Nada a apontar nesta jornada.</p>
      </section>
    );
  }

  return (
    <section className="crc-wf-painel">
      <h4>Conferência</h4>
      {erros.length > 0 && (
        <Aviso tom="perigo">
          {erros.length === 1
            ? "Um problema impede publicar."
            : `${String(erros.length)} problemas impedem publicar.`}
        </Aviso>
      )}
      <ul className="crc-wf-problemas">
        {[...erros, ...avisos].map((a) => (
          <li key={`${a.severidade}-${a.mensagem}`} data-severidade={a.severidade}>
            <strong>
              {a.passo !== null && `Passo ${String(a.passo + 1)}: `}
              {a.mensagem}
            </strong>
            <small>{a.conserto}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Quanto tempo passou do gatilho até o passo `ate`.
 *
 * `ESPERAR_ATE` NÃO ENTRA na conta, pelo mesmo motivo que não entra no resumo:
 * depende da hora em que a jornada chegou nela. Um número chutado aqui teria a
 * aparência de precisão sem o conteúdo — e esta etiqueta existe justamente para
 * quem confia nela.
 */
function minutosAte(passos: readonly PassoAutomacao[], ate: number): number {
  let total = 0;
  for (let i = 0; i < ate; i += 1) {
    const p = passos[i];
    if (p?.tipo === "ESPERAR") total += Math.max(p.minutos, 0);
  }
  return total;
}
