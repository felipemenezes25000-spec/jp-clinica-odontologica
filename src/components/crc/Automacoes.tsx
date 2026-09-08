/**
 * A área de Automações — item 19 do Mega Prompt, itens 178 a 180 do contrato.
 *
 * O QUE A TELA PRECISA RESPONDER, e responde:
 *   - o que está ligado?
 *   - quantos pacientes cada uma está tratando agora?
 *   - está funcionando? (quantos agendaram por causa dela)
 *   - como ligo, pauso, ou coloco em simulação?
 *
 * A MÉTRICA EXIBIDA É "PACIENTES QUE AGENDARAM", E NÃO "MENSAGENS ENVIADAS".
 * O item 261 é explícito: o objetivo não é mensagem enviada, é paciente
 * recuperado. Mostrar volume de envio no lugar de resultado treina a equipe a
 * otimizar a métrica errada — e a métrica errada aqui significa mandar mais
 * mensagem para as mesmas pessoas.
 *
 * O CONTROLE DE MODO É O CENTRO DA TELA, e não um detalhe escondido. Ele é o
 * rollout gradual do item 200 em forma de interface: simulação → só recomenda →
 * executa. Cada opção diz em português o que faz, porque "SHADOW" não significa
 * nada para quem trabalha na recepção.
 */
import { useCallback, useEffect, useState } from "react";

import { carregarAutomacoes, mudarEstadoAutomacao, type ResumoAutomacao } from "@/lib/crc/api";
import { EXPLICACAO_MODO_AUTOMACAO, ROTULO_MODO_AUTOMACAO } from "@/lib/crc/dominio/rotulos";
import type { ModoAutomacao } from "@/lib/crc/dominio/tipos";

import {
  Aviso,
  BarraDeRecado,
  Botao,
  Cartao,
  Etiqueta,
  ListaEsqueleto,
  Modal,
  Vazio,
  useAcao,
} from "./base";
import { BotaoJornadas, JornadasDaAutomacao } from "./JornadasDaAutomacao";

const MODOS: ModoAutomacao[] = ["SHADOW", "RECOMENDAR", "EXECUTAR"];

export function Automacoes({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [automacoes, setAutomacoes] = useState<ResumoAutomacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<ResumoAutomacao | null>(null);
  // Uma automação aberta por vez: duas listas de jornada lado a lado competem
  // pela mesma leitura e nenhuma é lida.
  const [jornadasAbertas, setJornadasAbertas] = useState<string | null>(null);

  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarAutomacoes();
      if (r.ok) {
        setAutomacoes(r.automacoes);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos carregar as automações. Tente atualizar a página.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const alterar = useCallback(
    async (a: ResumoAutomacao, mudanca: { status?: string; modo?: string }): Promise<void> => {
      await acao.executar(
        () => mudarEstadoAutomacao({ data: { automationId: a.id, ...mudanca } }),
        () => {
          setAutomacoes((atuais) =>
            atuais === null ? null : atuais.map((x) => (x.id === a.id ? { ...x, ...mudanca } : x)),
          );
          setConfirmando(null);
        },
        "Automação atualizada.",
      );
    },
    [acao],
  );

  if (erro !== null && automacoes === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (automacoes === null) return <ListaEsqueleto linhas={4} />;

  if (automacoes.length === 0) {
    return (
      <Vazio
        titulo="Nenhuma automação instalada."
        explicacao="As automações iniciais são criadas junto com a organização, em modo de simulação. Se elas não aparecem aqui, a instalação inicial ainda não foi executada."
      />
    );
  }

  const emExecucao = automacoes.filter((a) => a.status === "ATIVA" && a.modo === "EXECUTAR").length;

  return (
    <>
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      {/*
        Item 96 + 200: enquanto nada está enviando de verdade, a tela deixa
        isso explícito. Uma equipe que acha que a automação está trabalhando
        quando ela está em simulação para de acompanhar os pacientes à mão — e
        aí ninguém é contatado.
      */}
      {emExecucao === 0 && (
        <div style={{ marginBottom: "var(--crc-e5)" }}>
          <Aviso tom="info">
            Nenhuma automação está enviando mensagens ainda. Elas estão calculando e registrando o
            que fariam, sem falar com pacientes. Continue acompanhando os contatos manualmente até
            ligar a primeira.
          </Aviso>
        </div>
      )}

      <div className="crc-pilha">
        {automacoes.map((a) => (
          <Cartao key={a.id}>
            <div className="crc-linha" style={{ gap: "var(--crc-e3)", alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
                  <h3 className="crc-titulo-cartao">{a.nome}</h3>
                  <Etiqueta tom={a.status === "ATIVA" ? "positiva" : "neutra"}>
                    {a.status === "ATIVA"
                      ? "Ativa"
                      : a.status === "PAUSADA"
                        ? "Pausada"
                        : "Rascunho"}
                  </Etiqueta>
                  <Etiqueta tom={a.modo === "EXECUTAR" ? "alerta" : "neutra"}>
                    {ROTULO_MODO_AUTOMACAO[a.modo as ModoAutomacao] ?? a.modo}
                  </Etiqueta>
                </div>

                {a.descricao !== null && (
                  <p className="crc-corpo" style={{ marginTop: "var(--crc-e1)" }}>
                    {a.descricao}
                  </p>
                )}

                <div
                  className="crc-linha"
                  style={{ marginTop: "var(--crc-e3)", gap: "var(--crc-e6)" }}
                >
                  <Numero rotulo="Em jornada agora" valor={a.emJornada} />
                  <Numero rotulo="Concluídas no mês" valor={a.concluidasNoMes} />
                  {/* A métrica que importa. Ver o cabeçalho do arquivo. */}
                  <Numero rotulo="Agendaram por causa dela" valor={a.saidasPorConversao} destaque />
                </div>

                <div style={{ marginTop: "var(--crc-e3)" }}>
                  <BotaoJornadas
                    aberto={jornadasAbertas === a.id}
                    aoAlternar={() => {
                      setJornadasAbertas((atual) => (atual === a.id ? null : a.id));
                    }}
                  />
                </div>
              </div>

              {podeGerenciar && (
                <div className="crc-pilha" style={{ gap: "var(--crc-e2)", flexShrink: 0 }}>
                  <Botao
                    pequeno
                    variante={a.status === "ATIVA" ? "secundario" : "primario"}
                    disabled={acao.rodando}
                    onClick={() => {
                      void alterar(a, { status: a.status === "ATIVA" ? "PAUSADA" : "ATIVA" });
                    }}
                  >
                    {a.status === "ATIVA" ? "Pausar" : "Ativar"}
                  </Botao>
                </div>
              )}
            </div>

            {podeGerenciar && (
              <>
                <hr className="crc-separador" />

                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="crc-kpi-rotulo" style={{ marginBottom: "var(--crc-e2)" }}>
                    O que ela pode fazer
                  </legend>

                  <div className="crc-pilha" style={{ gap: "var(--crc-e2)" }}>
                    {MODOS.map((modo) => (
                      <label
                        key={modo}
                        className="crc-linha"
                        style={{
                          gap: "var(--crc-e3)",
                          alignItems: "flex-start",
                          flexWrap: "nowrap",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="radio"
                          name={`modo-${a.id}`}
                          checked={a.modo === modo}
                          disabled={acao.rodando}
                          onChange={() => {
                            // Item 142: passar para envio real é ação que
                            // merece confirmação. As outras duas reduzem o
                            // alcance e não precisam.
                            if (modo === "EXECUTAR") setConfirmando(a);
                            else void alterar(a, { modo });
                          }}
                          style={{ marginTop: 4 }}
                        />
                        <span style={{ minWidth: 0 }}>
                          <strong style={{ fontSize: "0.9375rem" }}>
                            {ROTULO_MODO_AUTOMACAO[modo]}
                          </strong>
                          <span className="crc-meta" style={{ display: "block" }}>
                            {EXPLICACAO_MODO_AUTOMACAO[modo]}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            )}

            {jornadasAbertas === a.id && (
              <>
                <hr className="crc-separador" />
                {a.modo === "SHADOW" && (
                  <Aviso tom="info">
                    Esta automação está em simulação. O que aparece abaixo é o que ela{" "}
                    <strong>teria</strong> enviado — leia as mensagens antes de liberar o envio.
                  </Aviso>
                )}
                <JornadasDaAutomacao automationId={a.id} emSimulacao={a.modo === "SHADOW"} />
              </>
            )}
          </Cartao>
        ))}
      </div>

      <Modal
        titulo="Ligar o envio automático de mensagens?"
        aberto={confirmando !== null}
        aoFechar={() => {
          setConfirmando(null);
        }}
        rodape={
          <>
            <Botao
              onClick={() => {
                setConfirmando(null);
              }}
            >
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              carregando={acao.rodando}
              onClick={() => {
                if (confirmando !== null) void alterar(confirmando, { modo: "EXECUTAR" });
              }}
            >
              Ligar envio
            </Botao>
          </>
        }
      >
        <p className="crc-corpo">
          A partir de agora, <strong>{confirmando?.nome}</strong> vai enviar mensagens de WhatsApp
          para pacientes de verdade, sem passar por ninguém antes.
        </p>
        <p className="crc-corpo" style={{ marginTop: "var(--crc-e3)" }}>
          As regras de contato continuam valendo: nada sai fora do horário de atendimento, nada sai
          para quem pediu para não receber, e cada paciente tem um limite de contatos por dia.
        </p>
        <p className="crc-corpo" style={{ marginTop: "var(--crc-e3)" }}>
          Você pode desligar a qualquer momento aqui, ou pausar tudo de uma vez em Integrações.
        </p>
      </Modal>
    </>
  );
}

function Numero({
  rotulo,
  valor,
  destaque = false,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <div>
      <span className="crc-kpi-rotulo">{rotulo}</span>
      <div
        className="crc-numero"
        style={{
          fontSize: "1.25rem",
          fontWeight: 600,
          color: destaque ? "var(--crc-primaria)" : "var(--crc-texto)",
        }}
      >
        {valor.toLocaleString("pt-BR")}
      </div>
    </div>
  );
}
