/**
 * Configurações → Integrações — itens 77, 132 a 136, e o Milestone 16.
 *
 * ESTA TELA É A QUE NÃO PODE MENTIR.
 *
 * Ela mostra três estados diferentes, e a diferença entre eles importa:
 *   NÃO CONFIGURADA  — falta credencial. A tela DIZ QUAL variável falta.
 *   SANDBOX          — está funcionando com dados de exemplo. Fica em amarelo,
 *                      porque confundir isso com produção faria a equipe achar
 *                      que mensagens estão saindo.
 *   CONECTADA        — credencial real, chamada real.
 *
 * O item 248 do contrato pede exatamente isso: implementar toda a infraestrutura
 * possível e marcar claramente o que depende de terceiro, sem fingir que está
 * funcionando. É mais honesto — e mais útil — do que um card verde genérico.
 *
 * OS KILL SWITCHES (Milestone 16) ficam aqui porque é onde alguém procura às
 * três da manhã. Eles são separados das feature flags de propósito: flag é
 * decisão de produto, interruptor é decisão de incidente, e misturar os dois
 * faz alguém desligar a coisa errada com pressa.
 */
import { useCallback, useEffect, useState } from "react";

import {
  acionarInterruptor,
  carregarIntegracoes,
  sincronizarAgora,
  testarConexaoDentalOffice,
  type EstadoIntegracoes,
} from "@/lib/crc/api";
import { KILL_SWITCHES } from "@/lib/crc/dominio/configuracao";
import { frescor } from "@/lib/crc/dominio/formatar";

import {
  Aviso,
  BarraDeRecado,
  Botao,
  Cartao,
  Etiqueta,
  Interruptor,
  ListaEsqueleto,
  Modal,
  useAcao,
} from "./base";

type Cartao3 = EstadoIntegracoes["dentalOffice"];

const INTERRUPTORES: { chave: string; rotulo: string; explicacao: string }[] = [
  {
    chave: KILL_SWITCHES.todasAutomacoes,
    rotulo: "Pausar todas as automações",
    explicacao:
      "Nenhuma jornada avança. As que já começaram ficam onde estão e continuam quando você religar.",
  },
  {
    chave: KILL_SWITCHES.enviosWhatsapp,
    rotulo: "Pausar envios de WhatsApp",
    explicacao:
      "As automações continuam calculando e registrando, mas nenhuma mensagem sai — nem automática, nem manual.",
  },
  {
    chave: KILL_SWITCHES.escritasDentalOffice,
    rotulo: "Pausar escritas no Dental Office",
    explicacao: "O CRC continua lendo a agenda, mas para de criar e alterar agendamentos lá.",
  },
  {
    chave: KILL_SWITCHES.acoesAutomaticasIa,
    rotulo: "Pausar ações automáticas da IA",
    explicacao:
      "A leitura das conversas continua; o que ela sugerir passa a exigir um atendente para acontecer.",
  },
];

export function Integracoes({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [estado, setEstado] = useState<EstadoIntegracoes | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoInterruptor, setConfirmandoInterruptor] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarIntegracoes();
      if (r.ok) {
        setEstado(r.estado);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos carregar o estado das integrações.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const testar = useCallback(async (): Promise<void> => {
    await acao.executar(
      () => testarConexaoDentalOffice(),
      undefined,
      "Conexão com o Dental Office funcionando.",
    );
  }, [acao]);

  /**
   * Item 140: para ação longa, estado PERSISTENTE, e não um toast de três
   * segundos. A sincronização pode levar minutos; o botão fica ocupado e o
   * aviso permanece até a resposta chegar.
   */
  const sincronizar = useCallback(async (): Promise<void> => {
    setSincronizando(true);
    await acao.executar(
      () => sincronizarAgora(),
      (r) => {
        const p = r.pacientes;
        const a = r.agenda;
        acao.limpar();
        setEstado((atual) =>
          atual === null
            ? null
            : {
                ...atual,
                sincronizacao: atual.sincronizacao.map((s) => ({
                  ...s,
                  ultimaComSucessoEm: new Date().toISOString(),
                })),
              },
        );
        void p;
        void a;
      },
      "Sincronização concluída.",
    );
    setSincronizando(false);
    await recarregar();
  }, [acao, recarregar]);

  const acionar = useCallback(
    async (chave: string, ligado: boolean): Promise<void> => {
      await acao.executar(
        () => acionarInterruptor({ data: { chave, ligado } }),
        () => {
          setEstado((atual) =>
            atual === null
              ? null
              : { ...atual, killSwitches: { ...atual.killSwitches, [chave]: ligado } },
          );
          setConfirmandoInterruptor(null);
        },
        ligado ? "Pausado." : "Liberado.",
      );
    },
    [acao],
  );

  if (erro !== null && estado === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (estado === null) return <ListaEsqueleto linhas={3} />;

  const algumPausado = Object.values(estado.killSwitches).some((v) => v);
  const interruptorConfirmado = INTERRUPTORES.find((i) => i.chave === confirmandoInterruptor);

  return (
    <>
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      {/* Um sistema com algo pausado precisa gritar isso no topo. */}
      {algumPausado && (
        <div style={{ marginBottom: "var(--crc-e5)" }}>
          <Aviso tom="alerta">
            Há interruptores de emergência acionados. Parte do sistema está pausada de propósito —
            confira a seção abaixo antes de investigar "por que nada está sendo enviado".
          </Aviso>
        </div>
      )}

      <div className="crc-pilha">
        <CartaoIntegracao
          titulo="Dental Office"
          descricao="Pacientes, agenda, disponibilidade e criação de consultas."
          dados={estado.dentalOffice}
          acoes={
            podeGerenciar && estado.dentalOffice.conectado ? (
              <>
                <Botao
                  pequeno
                  carregando={acao.rodando && !sincronizando}
                  onClick={() => void testar()}
                >
                  Testar conexão
                </Botao>
                <Botao
                  pequeno
                  variante="primario"
                  carregando={sincronizando}
                  onClick={() => void sincronizar()}
                >
                  Sincronizar agora
                </Botao>
              </>
            ) : null
          }
        />

        <CartaoIntegracao
          titulo="WhatsApp"
          descricao="Envio e recebimento de mensagens pelo canal oficial."
          dados={estado.whatsapp}
        />

        <CartaoIntegracao
          titulo="Leitura automática (IA)"
          descricao="Classifica a intenção da conversa e sugere a próxima ação."
          dados={estado.ia}
        />

        {/* ---- Sincronização (itens 135, 136) --------------------------- */}
        <Cartao titulo="Sincronização">
          {estado.sincronizacao.length === 0 ? (
            <p className="crc-corpo">
              Nada foi sincronizado ainda. Assim que as credenciais do Dental Office forem
              cadastradas, a primeira sincronização traz a base de pacientes e a agenda.
            </p>
          ) : (
            <div className="crc-tabela-caixa">
              <table className="crc-tabela">
                <thead>
                  <tr>
                    <th scope="col">Recurso</th>
                    <th scope="col">Situação</th>
                    <th scope="col">Última tentativa</th>
                    <th scope="col">Último sucesso</th>
                  </tr>
                </thead>
                <tbody>
                  {estado.sincronizacao.map((s) => (
                    <tr key={s.recurso}>
                      <td>{s.recurso === "customers" ? "Pacientes" : "Agenda"}</td>
                      <td>
                        <Etiqueta tom={s.status === "OK" ? "positiva" : "perigo"}>
                          {s.status === "OK" ? "Em dia" : "Falhou"}
                        </Etiqueta>
                      </td>
                      <td className="crc-meta">{frescor(s.ultimaEm)}</td>
                      <td className="crc-meta">{frescor(s.ultimaComSucessoEm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>

        {/* ---- Kill switches -------------------------------------------- */}
        {podeGerenciar && (
          <Cartao titulo="Interruptores de emergência">
            <p className="crc-corpo" style={{ marginBottom: "var(--crc-e4)" }}>
              Use quando algo estiver errado e você precisar parar o sistema sem derrubá-lo. Nada é
              perdido: o que estava em andamento continua de onde parou quando você liberar.
            </p>

            <div className="crc-pilha" style={{ gap: "var(--crc-e4)" }}>
              {INTERRUPTORES.map((i) => {
                const pausado = estado.killSwitches[i.chave] === true;
                return (
                  <div
                    key={i.chave}
                    className="crc-linha"
                    style={{ gap: "var(--crc-e4)", alignItems: "flex-start", flexWrap: "nowrap" }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
                        <strong style={{ fontSize: "0.9375rem" }}>{i.rotulo}</strong>
                        {pausado && <Etiqueta tom="perigo">Pausado</Etiqueta>}
                      </div>
                      <p className="crc-meta">{i.explicacao}</p>
                    </div>

                    <Interruptor
                      ligado={pausado}
                      rotulo={i.rotulo}
                      desabilitado={acao.rodando}
                      aoMudar={(novo) => {
                        // Item 142: PAUSAR pede confirmação; liberar não. O
                        // dano de pausar por engano é maior — o sistema para
                        // de contatar pacientes e ninguém percebe na hora.
                        if (novo) setConfirmandoInterruptor(i.chave);
                        else void acionar(i.chave, false);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </Cartao>
        )}
      </div>

      <Modal
        titulo={interruptorConfirmado?.rotulo ?? "Confirmar"}
        aberto={confirmandoInterruptor !== null}
        aoFechar={() => {
          setConfirmandoInterruptor(null);
        }}
        rodape={
          <>
            <Botao
              onClick={() => {
                setConfirmandoInterruptor(null);
              }}
            >
              Cancelar
            </Botao>
            <Botao
              variante="perigo"
              carregando={acao.rodando}
              onClick={() => {
                if (confirmandoInterruptor !== null) void acionar(confirmandoInterruptor, true);
              }}
            >
              Pausar agora
            </Botao>
          </>
        }
      >
        <p className="crc-corpo">{interruptorConfirmado?.explicacao}</p>
        <p className="crc-corpo" style={{ marginTop: "var(--crc-e3)" }}>
          Enquanto estiver pausado, a equipe precisa acompanhar os pacientes manualmente. A ação
          fica registrada na auditoria com seu nome.
        </p>
      </Modal>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function CartaoIntegracao({
  titulo,
  descricao,
  dados,
  acoes,
}: {
  titulo: string;
  descricao: string;
  dados: Cartao3;
  acoes?: React.ReactNode;
}) {
  const sandbox = dados.adapter === "sandbox";

  return (
    <Cartao>
      <div className="crc-linha" style={{ gap: "var(--crc-e3)", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
            <h3 className="crc-titulo-cartao">{titulo}</h3>

            {/*
              Os três estados. Sandbox é AMARELO, e não verde: ele funciona,
              mas não é produção — e tratar os dois igual é como uma equipe
              descobre tarde que nada estava sendo enviado.
            */}
            {!dados.conectado ? (
              <Etiqueta tom="neutra">Não configurada</Etiqueta>
            ) : sandbox ? (
              <Etiqueta tom="alerta">Dados de exemplo</Etiqueta>
            ) : (
              <Etiqueta tom="positiva">Conectada</Etiqueta>
            )}
          </div>

          <p className="crc-corpo" style={{ marginTop: "var(--crc-e1)" }}>
            {descricao}
          </p>
          <p className="crc-meta" style={{ marginTop: "var(--crc-e1)" }}>
            {dados.detalhe}
          </p>

          {/*
            ITEM 248: quando falta credencial, a tela diz EXATAMENTE qual. Um
            "não configurado" genérico transforma cinco minutos de trabalho
            numa investigação.
          */}
          {dados.faltando.length > 0 && (
            <div style={{ marginTop: "var(--crc-e3)" }}>
              <Aviso tom="info">
                Falta cadastrar no servidor:{" "}
                <strong style={{ fontFamily: "ui-monospace, monospace" }}>
                  {dados.faltando.join(", ")}
                </strong>
                . Enquanto isso, tudo que depende desta integração fica indisponível — e o resto do
                CRC continua funcionando.
              </Aviso>
            </div>
          )}
        </div>

        {acoes !== undefined && acoes !== null && (
          <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexShrink: 0 }}>
            {acoes}
          </div>
        )}
      </div>
    </Cartao>
  );
}
