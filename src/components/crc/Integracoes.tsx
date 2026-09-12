import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  BrainCircuit,
  CheckCircle2,
  CircleDashed,
  Database,
  FlaskConical,
  MessageCircle,
  PauseCircle,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

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
  Etiqueta,
  Interruptor,
  ListaEsqueleto,
  Modal,
  useAcao,
} from "./base";
import { HubDeIntegracoes } from "./HubDeIntegracoes";
import "./crc-integrations.css";

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
      } else setErro(r.message);
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

  const sincronizar = useCallback(async (): Promise<void> => {
    setSincronizando(true);
    await acao.executar(
      () => sincronizarAgora(),
      (r) => {
        void r.pacientes;
        void r.agenda;
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
  if (estado === null) return <ListaEsqueleto linhas={4} />;

  const algumPausado = Object.values(estado.killSwitches).some((v) => v);
  const pausados = Object.values(estado.killSwitches).filter(Boolean).length;
  const conectadas = [estado.dentalOffice, estado.whatsapp, estado.ia].filter(
    (x) => x.conectado && x.adapter !== "sandbox",
  ).length;
  const sandboxes = [estado.dentalOffice, estado.whatsapp, estado.ia].filter(
    (x) => x.conectado && x.adapter === "sandbox",
  ).length;
  const interruptorConfirmado = INTERRUPTORES.find((i) => i.chave === confirmandoInterruptor);

  return (
    <div className="crc-int-v2">
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      {/*
        O HUB VEM NO TOPO: "está funcionando?" é a pergunta que traz a pessoa
        a esta tela. "Como configuro?" é a de quem já sabe que não está.
      */}
      <HubDeIntegracoes />

      <section className="crc-int-command-v2">
        <div>
          <div className="crc-int-kicker-v2">
            <Activity size={14} aria-hidden="true" /> Saúde do sistema
          </div>
          <h2>O que está conectado, o que está degradado e o que foi pausado.</h2>
          <p>
            Esta é a tela de diagnóstico operacional. Ela diferencia produção, sandbox e ausência de
            credencial — e concentra os interruptores de emergência.
          </p>
        </div>
        <div className="crc-int-command-status-v2" data-alerta={algumPausado ? "sim" : "nao"}>
          {algumPausado ? <ShieldAlert aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
          <span>
            <strong>
              {algumPausado
                ? `${pausados} proteção acionada${pausados > 1 ? "s" : ""}`
                : "Operação liberada"}
            </strong>
            <small>
              {conectadas} integrações reais · {sandboxes} sandbox
            </small>
          </span>
        </div>
      </section>

      {algumPausado && (
        <Aviso tom="alerta">
          Há interruptores de emergência acionados. Parte do sistema está pausada de propósito.
        </Aviso>
      )}

      <section className="crc-int-grid-v2">
        <IntegracaoCard
          icone={Database}
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
                  Testar
                </Botao>
                <Botao
                  pequeno
                  variante="primario"
                  carregando={sincronizando}
                  onClick={() => void sincronizar()}
                >
                  <RefreshCw size={14} aria-hidden="true" /> Sincronizar
                </Botao>
              </>
            ) : null
          }
        />
        <IntegracaoCard
          icone={MessageCircle}
          titulo={
            estado.whatsapp.adapter === "twilio"
              ? "WhatsApp · Twilio"
              : estado.whatsapp.adapter === "meta_cloud"
                ? "WhatsApp · Meta Cloud"
                : "WhatsApp"
          }
          descricao="Envio e recebimento de mensagens pelo canal oficial."
          dados={estado.whatsapp}
        />
        <IntegracaoCard
          icone={BrainCircuit}
          titulo="Leitura automática · IA"
          descricao="Classifica intenção, temperatura e próxima ação sugerida."
          dados={estado.ia}
        />
      </section>

      <section className="crc-int-painel-v2">
        <header>
          <span>
            <RefreshCw aria-hidden="true" />
          </span>
          <div>
            <small>Espelho de dados</small>
            <h2>Sincronização</h2>
          </div>
        </header>
        <div className="crc-int-painel-corpo-v2">
          {estado.sincronizacao.length === 0 ? (
            <div className="crc-int-vazio-v2">
              <CircleDashed aria-hidden="true" />
              <p>
                Nada foi sincronizado ainda. Assim que o Dental Office estiver configurado,
                pacientes e agenda começam a aparecer aqui.
              </p>
            </div>
          ) : (
            <div className="crc-int-sync-grid-v2">
              {estado.sincronizacao.map((s) => (
                <article key={s.recurso} data-status={s.status}>
                  <span className="crc-int-sync-icone-v2">
                    {s.status === "OK" ? (
                      <CheckCircle2 aria-hidden="true" />
                    ) : (
                      <ShieldAlert aria-hidden="true" />
                    )}
                  </span>
                  <div>
                    <small>{s.recurso === "customers" ? "Pacientes" : "Agenda"}</small>
                    <strong>{s.status === "OK" ? "Em dia" : "Falhou"}</strong>
                    <em>
                      Última tentativa {frescor(s.ultimaEm)} · sucesso{" "}
                      {frescor(s.ultimaComSucessoEm)}
                    </em>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {podeGerenciar && (
        <section className="crc-int-painel-v2 crc-int-emergencia-v2">
          <header>
            <span>
              <PauseCircle aria-hidden="true" />
            </span>
            <div>
              <small>Controle de incidente</small>
              <h2>Interruptores de emergência</h2>
            </div>
            {pausados > 0 && <strong>{pausados} pausados</strong>}
          </header>
          <div className="crc-int-painel-corpo-v2">
            <p className="crc-int-emergencia-copy-v2">
              Use quando algo estiver errado e você precisar parar uma parte do sistema sem
              derrubá-lo. Nada é apagado; ao liberar, as filas continuam.
            </p>
            <div className="crc-int-switches-v2">
              {INTERRUPTORES.map((i) => {
                const pausado = estado.killSwitches[i.chave] === true;
                return (
                  <article key={i.chave} data-pausado={pausado ? "sim" : "nao"}>
                    <div>
                      <strong>{i.rotulo}</strong>
                      <p>{i.explicacao}</p>
                    </div>
                    <div className="crc-int-switch-acao-v2">
                      {pausado && <Etiqueta tom="perigo">Pausado</Etiqueta>}
                      <Interruptor
                        ligado={pausado}
                        rotulo={i.rotulo}
                        desabilitado={acao.rodando}
                        aoMudar={(novo) => {
                          if (novo) setConfirmandoInterruptor(i.chave);
                          else void acionar(i.chave, false);
                        }}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <Modal
        titulo={interruptorConfirmado?.rotulo ?? "Confirmar"}
        aberto={confirmandoInterruptor !== null}
        aoFechar={() => setConfirmandoInterruptor(null)}
        rodape={
          <>
            <Botao onClick={() => setConfirmandoInterruptor(null)}>Cancelar</Botao>
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
          fica registrada na auditoria.
        </p>
      </Modal>
    </div>
  );
}

function IntegracaoCard({
  icone: Icone,
  titulo,
  descricao,
  dados,
  acoes,
}: {
  icone: typeof Database;
  titulo: string;
  descricao: string;
  dados: Cartao3;
  acoes?: ReactNode;
}) {
  const sandbox = dados.adapter === "sandbox";
  const status = !dados.conectado ? "off" : sandbox ? "sandbox" : "ok";
  return (
    <article className="crc-int-card-v2" data-status={status}>
      <header>
        <span>
          <Icone aria-hidden="true" />
        </span>
        <div>
          <h3>{titulo}</h3>
          <p>{descricao}</p>
        </div>
        {status === "ok" ? (
          <Etiqueta tom="positiva">Conectada</Etiqueta>
        ) : status === "sandbox" ? (
          <Etiqueta tom="alerta">Sandbox</Etiqueta>
        ) : (
          <Etiqueta>Não configurada</Etiqueta>
        )}
      </header>
      <div className="crc-int-card-corpo-v2">
        <p>{dados.detalhe}</p>
        <div className="crc-int-adapter-v2">
          <small>Adapter</small>
          <strong>{dados.adapter ?? "—"}</strong>
        </div>
        {dados.faltando.length > 0 && (
          <div className="crc-int-faltando-v2">
            <FlaskConical aria-hidden="true" />
            <div>
              <small>Falta no servidor</small>
              <strong>{dados.faltando.join(", ")}</strong>
            </div>
          </div>
        )}
      </div>
      {acoes !== undefined && acoes !== null && <footer>{acoes}</footer>}
    </article>
  );
}
