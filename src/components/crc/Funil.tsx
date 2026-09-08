/**
 * O funil — item 18 do Mega Prompt.
 *
 * "Cards devem mostrar somente: nome, motivo, valor potencial, último contato,
 * próxima ação, temperatura. Não colocar 15 informações em cada card."
 *
 * São seis coisas, e o cartão daqui mostra seis. A tentação de acrescentar
 * "especialidade", "responsável", "criado em" e "id" é real e foi recusada: um
 * kanban só serve se dá para ler uma coluna inteira de relance.
 *
 * SOBRE ARRASTAR E SOLTAR: não tem, de propósito. Drag-and-drop acessível exige
 * teclado equivalente, anúncio de posição e área de soltura clara — e feito pela
 * metade ele exclui quem usa teclado. Mover é um `<select>` no cartão: funciona
 * com mouse, teclado e leitor de tela, e no desktop custa o mesmo número de
 * cliques. Quando houver espaço para fazer arrastar direito, ele entra por cima
 * disto, não no lugar.
 *
 * O ITEM 159 APARECE AQUI COMO MODAL: mover para "Perdido" pede o motivo antes
 * de deixar. O servidor recusa sem motivo — a tela só evita que a pessoa
 * descubra isso por uma mensagem de erro.
 */
import { useCallback, useEffect, useState } from "react";

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
      // O FILTRO VAI PARA O SERVIDOR, e não para um `.filter()` daqui. Filtrar
      // em memória daria a lista certa e a CONTAGEM errada por coluna — o
      // funil traz no máximo 200 cartões, e "3 em Contato pendente" passaria a
      // significar "3 dos 200 que couberam".
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
      // Item 159: perda exige motivo. O modal pergunta antes de chamar o
      // servidor, para a pessoa não levar um erro na cara.
      if (etapa.categoria === "PERDIDA") {
        setPerdendo(cartao);
        return;
      }

      await acao.executar(
        () =>
          moverOportunidade({
            data: { opportunityId: cartao.opportunityId, etapa: etapa.chave },
          }),
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
        // A oportunidade fechada sai do quadro: ela não compete mais por
        // atenção, e mantê-la visível daria a impressão de trabalho pendente.
        setCartoes((atuais) => atuais.filter((c) => c.opportunityId !== cartao.opportunityId));
        setPerdendo(null);
      },
      `${cartao.nome} foi marcada como perdida.`,
    );
  }, [acao, motivoPerda, perdendo]);

  if (erro !== null && etapas === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (etapas === null) return <ListaEsqueleto linhas={4} />;

  const controles = (
    <>
      <div className="crc-linha crc-filtros-funil">
        <label className="crc-so-leitor" htmlFor="crc-funil-tipo">
          Filtrar por tipo
        </label>
        <select
          id="crc-funil-tipo"
          className="crc-selecao"
          value={filtro.tipos[0] ?? ""}
          onChange={(e) => {
            // UM tipo por vez. Multisseleção acessível exige um componente
            // próprio; o modelo de dados já aceita vários, então o dia em que
            // esse componente existir nada aqui atrás precisa mudar.
            const v = e.target.value;
            setFiltro((f) => ({ ...f, tipos: v === "" ? [] : [v] }));
          }}
        >
          <option value="">Todos os tipos</option>
          {Object.entries(ROTULO_TIPO_OPORTUNIDADE).map(([chave, rotulo]) => (
            <option key={chave} value={chave}>
              {rotulo}
            </option>
          ))}
        </select>

        <label className="crc-so-leitor" htmlFor="crc-funil-etapa">
          Filtrar por etapa
        </label>
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
            <option key={et.id} value={et.chave}>
              {et.nome}
            </option>
          ))}
        </select>

        <label className="crc-linha">
          <input
            type="checkbox"
            checked={filtro.apenasMinhas}
            onChange={(e) => {
              const marcado = e.target.checked;
              setFiltro((f) => ({ ...f, apenasMinhas: marcado }));
            }}
          />
          <span className="crc-corpo">Só as minhas</span>
        </label>
      </div>

      <BarraDeVisoes filtro={filtro} aoAplicar={setFiltro} />
    </>
  );

  if (cartoes.length === 0) {
    return (
      <>
        {controles}
        <Vazio
          titulo={
            filtroVazio(filtro)
              ? "Nenhuma oportunidade aberta."
              : "Nenhuma oportunidade com esses filtros."
          }
          explicacao={
            filtroVazio(filtro)
              ? "Quando um paciente faltar, cancelar ou passar do prazo de retorno, a oportunidade aparece aqui automaticamente."
              : "O funil tem oportunidades, mas nenhuma passa por este filtro. Limpe os filtros para ver o quadro inteiro."
          }
        />
      </>
    );
  }

  return (
    <>
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      {controles}

      <div className="crc-funil">
        {etapas.map((etapa) => {
          const daEtapa = cartoes.filter((c) => c.stageId === etapa.id);
          return (
            <section key={etapa.id} className="crc-coluna" aria-label={etapa.nome}>
              <div className="crc-coluna-topo">
                <h2 className="crc-titulo-cartao">{etapa.nome}</h2>
                <span className="crc-etiqueta crc-etiqueta-neutra crc-numero">
                  {daEtapa.length}
                </span>
              </div>

              <div className="crc-coluna-corpo">
                {daEtapa.length === 0 ? (
                  <p className="crc-meta" style={{ padding: "var(--crc-e3)" }}>
                    Nada nesta etapa.
                  </p>
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

      <Modal
        titulo="Por que esta oportunidade foi perdida?"
        aberto={perdendo !== null}
        aoFechar={() => {
          setPerdendo(null);
        }}
        rodape={
          <>
            <Botao
              onClick={() => {
                setPerdendo(null);
              }}
            >
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              carregando={acao.rodando}
              onClick={() => {
                void confirmarPerda();
              }}
            >
              Marcar como perdida
            </Botao>
          </>
        }
      >
        <p className="crc-corpo" style={{ marginBottom: "var(--crc-e4)" }}>
          O motivo entra no relatório de perdas e ajuda a equipe a entender onde os pacientes estão
          sendo perdidos. É obrigatório.
        </p>

        <Campo rotulo="Motivo">
          {(id) => (
            <select
              id={id}
              className="crc-selecao"
              value={motivoPerda}
              onChange={(e) => {
                setMotivoPerda(e.target.value);
              }}
            >
              {MOTIVOS_PERDA.map((m) => (
                <option key={m.chave} value={m.chave}>
                  {m.rotulo}
                </option>
              ))}
            </select>
          )}
        </Campo>
      </Modal>
    </>
  );
}

/* -------------------------------------------------------------------------- */

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
    <article className={`crc-cartao-funil crc-prioridade crc-prioridade-${cartao.faixa}`}>
      {/* 1. Nome */}
      <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "nowrap" }}>
        <strong className="crc-truncar" style={{ fontSize: "0.9375rem" }}>
          {cartao.nome}
        </strong>
        {/* 6. Temperatura — como texto, nunca só cor (item 65). */}
        <span className="crc-empurra" style={{ flexShrink: 0 }}>
          <Etiqueta
            tom={
              cartao.faixa === "ALTA" ? "perigo" : cartao.faixa === "MEDIA" ? "alerta" : "neutra"
            }
          >
            {cartao.score}
          </Etiqueta>
        </span>
      </div>

      {/* 2. Motivo */}
      <p className="crc-meta">{cartao.tipoRotulo}</p>
      {cartao.motivo.length > 0 && (
        <p className="crc-meta" style={{ color: "var(--crc-texto-2)" }}>
          {cartao.motivo}
        </p>
      )}

      {/* 3. Valor potencial */}
      {cartao.valorPotencial !== null && (
        <p className="crc-meta crc-numero" style={{ fontWeight: 600, color: "var(--crc-texto-2)" }}>
          {dinheiro(cartao.valorPotencial)}
        </p>
      )}

      {/* 4. Próxima ação */}
      {cartao.proximaAcao !== null && <p className="crc-meta">→ {cartao.proximaAcao}</p>}

      <div className="crc-linha" style={{ marginTop: "var(--crc-e2)", gap: "var(--crc-e2)" }}>
        {/*
          Mover por `<select>`: acessível de graça. Ver a explicação no
          cabeçalho do arquivo.
        */}
        <label className="crc-so-leitor" htmlFor={`mover-${cartao.opportunityId}`}>
          Mover {cartao.nome} para outra etapa
        </label>
        <select
          id={`mover-${cartao.opportunityId}`}
          className="crc-selecao"
          style={{ height: 32, fontSize: "0.8125rem", flex: 1, minWidth: 0 }}
          value={etapaAtual.id}
          disabled={desabilitado}
          onChange={(e) => {
            const destino = etapas.find((x) => x.id === e.target.value);
            if (destino !== undefined && destino.id !== etapaAtual.id)
              void aoMover(cartao, destino);
          }}
        >
          {etapas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>

        {cartao.patientId !== null && (
          <Botao
            pequeno
            variante="discreto"
            onClick={() => {
              if (cartao.patientId !== null) aoAbrirPaciente(cartao.patientId);
            }}
          >
            Abrir
          </Botao>
        )}
      </div>
    </article>
  );
}
