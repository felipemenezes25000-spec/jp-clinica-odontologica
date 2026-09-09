import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bot,
  Filter,
  Flame,
  Layers3,
  MoveRight,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

import { carregarFunil, moverOportunidade, type ItemPrioridade } from "@/lib/crc/api";
import { dinheiro } from "@/lib/crc/dominio/formatar";
import { MOTIVOS_PERDA, ROTULO_TIPO_OPORTUNIDADE } from "@/lib/crc/dominio/rotulos";

import {
  Aviso,
  BarraDeRecado,
  Botao,
  Campo,
  Etiqueta,
  ListaEsqueleto,
  Modal,
  Vazio,
  useAcao,
} from "./base";
import { BarraDeVisoes, FILTRO_VAZIO, filtroVazio, type FiltroFunilUi } from "./Visoes";

type Etapa = { id: string; chave: string; nome: string; ordem: number; categoria: string };
type Cartao = ItemPrioridade & { stageId: string | null };

export function Funil({ aoAbrirPaciente }: { aoAbrirPaciente: (patientId: string) => void }) {
  const [etapas, setEtapas] = useState<Etapa[] | null>(null);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [perdendo, setPerdendo] = useState<Cartao | null>(null);
  const [motivoPerda, setMotivoPerda] = useState<string>(MOTIVOS_PERDA[0].chave);
  const [filtro, setFiltro] = useState<FiltroFunilUi>({ ...FILTRO_VAZIO });

  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarFunil({ data: { filtros: filtro } });
      if (r.ok) {
        setEtapas(r.etapas);
        setCartoes(r.cartoes);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos carregar o funil. Tente atualizar a página.");
    }
  }, [filtro]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const mover = useCallback(
    async (cartao: Cartao, etapa: Etapa): Promise<void> => {
      if (etapa.categoria === "PERDIDA") {
        setPerdendo(cartao);
        return;
      }

      await acao.executar(
        () => moverOportunidade({ data: { opportunityId: cartao.opportunityId, etapa: etapa.chave } }),
        () => {
          setCartoes((atuais) =>
            atuais.map((c) =>
              c.opportunityId === cartao.opportunityId ? { ...c, stageId: etapa.id } : c,
            ),
          );
        },
        `${cartao.nome} foi para "${etapa.nome}".`,
      );
    },
    [acao],
  );

  const confirmarPerda = useCallback(async (): Promise<void> => {
    if (perdendo === null) return;
    const cartao = perdendo;

    await acao.executar(
      () =>
        moverOportunidade({
          data: { opportunityId: cartao.opportunityId, etapa: "perdido", lostReason: motivoPerda },
        }),
      () => {
        setCartoes((atuais) => atuais.filter((c) => c.opportunityId !== cartao.opportunityId));
        setPerdendo(null);
      },
      `${cartao.nome} foi marcada como perdida.`,
    );
  }, [acao, motivoPerda, perdendo]);

  const altas = useMemo(() => cartoes.filter((c) => c.faixa === "ALTA").length, [cartoes]);
  const emAutomacao = useMemo(() => cartoes.filter((c) => c.temJornadaAtiva).length, [cartoes]);
  const filtrosAtivos =
    filtro.tipos.length +
    (filtro.etapaChave === null ? 0 : 1) +
    (filtro.apenasMinhas ? 1 : 0);

  if (erro !== null && etapas === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (etapas === null) return <ListaEsqueleto linhas={4} />;

  const controles = (
    <section className="crc-funil-controles-v2">
      <div className="crc-funil-controles-titulo">
        <span><SlidersHorizontal aria-hidden="true" /></span>
        <div>
          <div className="crc-sobretitulo">Visão do pipeline</div>
          <strong>Filtre sem perder o contexto do quadro</strong>
        </div>
        {filtrosAtivos > 0 && <em>{filtrosAtivos} {filtrosAtivos === 1 ? "filtro ativo" : "filtros ativos"}</em>}
      </div>

      <div className="crc-funil-filtros-v2">
        <div className="crc-funil-campo-filtro">
          <label htmlFor="crc-funil-tipo">Tipo</label>
          <select
            id="crc-funil-tipo"
            className="crc-selecao"
            value={filtro.tipos[0] ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setFiltro((f) => ({ ...f, tipos: v === "" ? [] : [v] }));
            }}
          >
            <option value="">Todos os tipos</option>
            {Object.entries(ROTULO_TIPO_OPORTUNIDADE).map(([chave, rotulo]) => (
              <option key={chave} value={chave}>{rotulo}</option>
            ))}
          </select>
        </div>

        <div className="crc-funil-campo-filtro">
          <label htmlFor="crc-funil-etapa">Etapa</label>
          <select
            id="crc-funil-etapa"
            className="crc-selecao"
            value={filtro.etapaChave ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setFiltro((f) => ({ ...f, etapaChave: v === "" ? null : v }));
            }}
          >
            <option value="">Todas as etapas</option>
            {etapas.map((et) => (
              <option key={et.id} value={et.chave}>{et.nome}</option>
            ))}
          </select>
        </div>

        <label className="crc-funil-minhas-v2">
          <input
            type="checkbox"
            checked={filtro.apenasMinhas}
            onChange={(e) => setFiltro((f) => ({ ...f, apenasMinhas: e.target.checked }))}
          />
          <span>Somente oportunidades atribuídas a mim</span>
        </label>
      </div>

      <BarraDeVisoes filtro={filtro} aoAplicar={setFiltro} />
    </section>
  );

  return (
    <div className="crc-funil-v2">
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      <section className="crc-funil-resumo-v2" aria-label="Resumo do pipeline">
        <ResumoFunil icone={Layers3} rotulo="Abertas" valor={cartoes.length} nota="No recorte atual" />
        <ResumoFunil icone={Flame} rotulo="Prioridade alta" valor={altas} nota={altas > 0 ? "Pedem atenção primeiro" : "Nenhuma crítica agora"} tom={altas > 0 ? "perigo" : "positivo"} />
        <ResumoFunil icone={Bot} rotulo="Com automação" valor={emAutomacao} nota="Jornada ativa conduzindo" tom="info" />
        <ResumoFunil icone={Filter} rotulo="Filtros ativos" valor={filtrosAtivos} nota={filtrosAtivos > 0 ? "Quadro recortado" : "Mostrando tudo"} />
      </section>

      {controles}

      {cartoes.length === 0 ? (
        <div className="crc-funil-vazio-v2">
          <Vazio
            titulo={filtroVazio(filtro) ? "Nenhuma oportunidade aberta." : "Nenhuma oportunidade com esses filtros."}
            explicacao={
              filtroVazio(filtro)
                ? "Quando um paciente faltar, cancelar ou passar do prazo de retorno, a oportunidade aparece aqui automaticamente."
                : "O funil tem oportunidades, mas nenhuma passa por este filtro. Limpe os filtros para ver o quadro inteiro."
            }
          />
        </div>
      ) : (
        <div className="crc-funil crc-funil-quadro-v2">
          {etapas.map((etapa) => {
            const daEtapa = cartoes.filter((c) => c.stageId === etapa.id);
            const altasDaEtapa = daEtapa.filter((c) => c.faixa === "ALTA").length;
            return (
              <section key={etapa.id} className="crc-coluna crc-funil-coluna-v2" aria-label={etapa.nome}>
                <header className="crc-funil-coluna-topo-v2">
                  <div>
                    <h2>{etapa.nome}</h2>
                    <span>{daEtapa.length} {daEtapa.length === 1 ? "oportunidade" : "oportunidades"}</span>
                  </div>
                  <div className="crc-funil-coluna-contadores">
                    {altasDaEtapa > 0 && <span data-tom="perigo">{altasDaEtapa} alta</span>}
                    <strong>{daEtapa.length}</strong>
                  </div>
                </header>

                <div className="crc-coluna-corpo crc-funil-coluna-corpo-v2">
                  {daEtapa.length === 0 ? (
                    <div className="crc-funil-etapa-vazia">Nada nesta etapa.</div>
                  ) : (
                    daEtapa.map((cartao) => (
                      <CartaoFunil
                        key={cartao.opportunityId}
                        cartao={cartao}
                        etapas={etapas}
                        etapaAtual={etapa}
                        desabilitado={acao.rodando}
                        aoMover={mover}
                        aoAbrirPaciente={aoAbrirPaciente}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Modal
        titulo="Por que esta oportunidade foi perdida?"
        aberto={perdendo !== null}
        aoFechar={() => setPerdendo(null)}
        rodape={
          <>
            <Botao onClick={() => setPerdendo(null)}>Cancelar</Botao>
            <Botao variante="primario" carregando={acao.rodando} onClick={() => void confirmarPerda()}>
              Marcar como perdida
            </Botao>
          </>
        }
      >
        <p className="crc-corpo" style={{ marginBottom: "var(--crc-e4)" }}>
          O motivo entra no relatório de perdas e ajuda a equipe a entender onde os pacientes estão sendo perdidos. É obrigatório.
        </p>
        <Campo rotulo="Motivo">
          {(id) => (
            <select id={id} className="crc-selecao" value={motivoPerda} onChange={(e) => setMotivoPerda(e.target.value)}>
              {MOTIVOS_PERDA.map((m) => (
                <option key={m.chave} value={m.chave}>{m.rotulo}</option>
              ))}
            </select>
          )}
        </Campo>
      </Modal>
    </div>
  );
}

function ResumoFunil({
  icone: Icone,
  rotulo,
  valor,
  nota,
  tom = "neutro",
}: {
  icone: typeof Layers3;
  rotulo: string;
  valor: number;
  nota: string;
  tom?: "neutro" | "perigo" | "positivo" | "info";
}) {
  return (
    <article className="crc-funil-resumo-card-v2" data-tom={tom}>
      <span><Icone aria-hidden="true" /></span>
      <div><small>{rotulo}</small><strong>{valor}</strong><em>{nota}</em></div>
    </article>
  );
}

function CartaoFunil({
  cartao,
  etapas,
  etapaAtual,
  desabilitado,
  aoMover,
  aoAbrirPaciente,
}: {
  cartao: Cartao;
  etapas: Etapa[];
  etapaAtual: Etapa;
  desabilitado: boolean;
  aoMover: (cartao: Cartao, etapa: Etapa) => Promise<void>;
  aoAbrirPaciente: (patientId: string) => void;
}) {
  return (
    <article className={`crc-cartao-funil crc-funil-card-v2 crc-prioridade crc-prioridade-${cartao.faixa}`} data-faixa={cartao.faixa}>
      <div className="crc-funil-card-topo-v2">
        <div>
          <strong>{cartao.nome}</strong>
          <span>{cartao.tipoRotulo}</span>
        </div>
        <Etiqueta tom={cartao.faixa === "ALTA" ? "perigo" : cartao.faixa === "MEDIA" ? "alerta" : "neutra"}>
          {cartao.score}
        </Etiqueta>
      </div>

      {cartao.motivo.length > 0 && <p className="crc-funil-card-motivo-v2">{cartao.motivo}</p>}

      <div className="crc-funil-card-dados-v2">
        {cartao.valorPotencial !== null && <span><small>Potencial</small><strong>{dinheiro(cartao.valorPotencial)}</strong></span>}
        {cartao.proximaAcao !== null && <span><small>Próxima ação</small><strong>{cartao.proximaAcao}</strong></span>}
      </div>

      {cartao.temJornadaAtiva && (
        <div className="crc-funil-automacao-v2"><Sparkles aria-hidden="true" /> Automação conduzindo este caso</div>
      )}

      <div className="crc-funil-card-acoes-v2">
        <div className="crc-funil-mover-v2">
          <MoveRight aria-hidden="true" />
          <label className="crc-so-leitor" htmlFor={`mover-${cartao.opportunityId}`}>Mover {cartao.nome} para outra etapa</label>
          <select
            id={`mover-${cartao.opportunityId}`}
            className="crc-selecao"
            value={etapaAtual.id}
            disabled={desabilitado}
            onChange={(e) => {
              const destino = etapas.find((x) => x.id === e.target.value);
              if (destino !== undefined && destino.id !== etapaAtual.id) void aoMover(cartao, destino);
            }}
          >
            {etapas.map((e) => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>
        </div>

        {cartao.patientId !== null && (
          <Botao pequeno variante="discreto" onClick={() => cartao.patientId !== null && aoAbrirPaciente(cartao.patientId)}>
            Paciente <ArrowUpRight size={14} aria-hidden="true" />
          </Botao>
        )}
      </div>
    </article>
  );
}
