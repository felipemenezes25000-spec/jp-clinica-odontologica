import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  CirclePause,
  FlaskConical,
  Gauge,
  MessageSquareText,
  Play,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Workflow,
} from "lucide-react";

import { carregarAutomacoes, mudarEstadoAutomacao, type ResumoAutomacao } from "@/lib/crc/api";
import { ROTULO_CATEGORIA, reais } from "@/lib/crc/dominio/custo";
import { EXPLICACAO_MODO_AUTOMACAO, ROTULO_MODO_AUTOMACAO } from "@/lib/crc/dominio/rotulos";
import type { ModoAutomacao } from "@/lib/crc/dominio/tipos";

import {
  Aviso,
  BarraDeRecado,
  Botao,
  Etiqueta,
  ListaEsqueleto,
  Modal,
  Vazio,
  useAcao,
} from "./base";
import { BotaoJornadas, JornadasDaAutomacao } from "./JornadasDaAutomacao";
import { EditorDeJornada } from "./EditorDeJornada";
import "./crc-automations.css";
import "./crc-workflow.css";

const MODOS: ModoAutomacao[] = ["SHADOW", "RECOMENDAR", "EXECUTAR"];

function composicao(porCategoria: Record<string, number>): string {
  const partes = (["marketing", "utilidade", "autenticacao", "servico"] as const)
    .filter((c) => (porCategoria[c] ?? 0) > 0)
    .map((c) => `${String(porCategoria[c])} de ${ROTULO_CATEGORIA[c].toLowerCase()}`);
  if (partes.length === 0) return "nenhuma mensagem";
  if (partes.length === 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1] ?? ""}`;
}

export function Automacoes({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [automacoes, setAutomacoes] = useState<ResumoAutomacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<ResumoAutomacao | null>(null);
  const [jornadasAbertas, setJornadasAbertas] = useState<string | null>(null);
  /*
   * UM EDITOR ABERTO POR VEZ, e por isso é um id e não um Set.
   *
   * O editor guarda rascunho não publicado. Dois abertos ao mesmo tempo seriam
   * dois rascunhos concorrendo pela atenção de quem edita, e a tela não teria
   * como avisar qual deles tem mudança pendente sem virar um gerenciador de
   * abas — que é problema maior do que o que resolveria.
   */
  const [editando, setEditando] = useState<string | null>(null);
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
  if (automacoes.length === 0)
    return (
      <Vazio
        titulo="Nenhuma automação instalada."
        explicacao="As automações iniciais são criadas junto com a organização, em modo de simulação. Se elas não aparecem aqui, a instalação inicial ainda não foi executada."
      />
    );

  const ativas = automacoes.filter((a) => a.status === "ATIVA").length;
  const executando = automacoes.filter((a) => a.status === "ATIVA" && a.modo === "EXECUTAR").length;
  const emJornada = automacoes.reduce((s, a) => s + a.emJornada, 0);
  const convertidas = automacoes.reduce((s, a) => s + a.saidasPorConversao, 0);

  return (
    <div className="crc-auto-v2">
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      <section className="crc-auto-command-v2">
        <div>
          <div className="crc-auto-kicker-v2">
            <Sparkles size={14} aria-hidden="true" /> Motor de relacionamento
          </div>
          <h2>Automação com autonomia visível — nunca caixa-preta.</h2>
          <p>
            Cada jornada deixa claro se está simulando, recomendando ou falando com pacientes de
            verdade. Resultado é medido por agendamento, não por volume de mensagem.
          </p>
        </div>
        <span
          className={`crc-auto-geral-status-v2${executando > 0 ? " crc-auto-geral-ativo-v2" : ""}`}
        >
          {executando > 0 ? <Play aria-hidden="true" /> : <CirclePause aria-hidden="true" />}
          {executando > 0 ? `${executando} enviando de verdade` : "Nenhuma enviando de verdade"}
        </span>
      </section>

      <section className="crc-auto-resumo-v2" aria-label="Resumo das automações">
        <ResumoAuto
          icone={Bot}
          rotulo="Automações ativas"
          valor={ativas}
          nota={`${automacoes.length} instaladas`}
          tom="info"
        />
        <ResumoAuto
          icone={UsersRound}
          rotulo="Em jornada agora"
          valor={emJornada}
          nota="Pacientes sendo conduzidos"
        />
        <ResumoAuto
          icone={CheckCircle2}
          rotulo="Agendaram por elas"
          valor={convertidas}
          nota="Conversões atribuídas"
          tom="positivo"
        />
        <ResumoAuto
          icone={ShieldCheck}
          rotulo="Envio real"
          valor={executando}
          nota={executando > 0 ? "Autonomia liberada" : "Operação protegida"}
          tom={executando > 0 ? "alerta" : "positivo"}
        />
      </section>

      {executando === 0 && (
        <Aviso tom="info">
          Nenhuma automação está enviando mensagens agora. As que estão em simulação ou recomendação
          continuam calculando e registrando o que fariam.
        </Aviso>
      )}

      <section className="crc-auto-lista-v2">
        {automacoes.map((a) => (
          <article
            key={a.id}
            className="crc-auto-card-v2"
            data-status={a.status}
            data-modo={a.modo}
          >
            <header className="crc-auto-card-topo-v2">
              <span className="crc-auto-card-icone-v2">
                {a.modo === "SHADOW" ? (
                  <FlaskConical aria-hidden="true" />
                ) : a.modo === "EXECUTAR" ? (
                  <Bot aria-hidden="true" />
                ) : (
                  <Gauge aria-hidden="true" />
                )}
              </span>
              <div className="crc-auto-card-copy-v2">
                <div className="crc-auto-card-titulo-v2">
                  <h3>{a.nome}</h3>
                  <Etiqueta tom={a.status === "ATIVA" ? "positiva" : "neutra"}>
                    {a.status === "ATIVA"
                      ? "Ativa"
                      : a.status === "PAUSADA"
                        ? "Pausada"
                        : "Rascunho"}
                  </Etiqueta>
                  <Etiqueta
                    tom={
                      a.modo === "EXECUTAR" ? "alerta" : a.modo === "RECOMENDAR" ? "info" : "neutra"
                    }
                  >
                    {ROTULO_MODO_AUTOMACAO[a.modo as ModoAutomacao] ?? a.modo}
                  </Etiqueta>
                </div>
                {a.descricao !== null && <p>{a.descricao}</p>}
              </div>
              {podeGerenciar && (
                <Botao
                  pequeno
                  variante={a.status === "ATIVA" ? "secundario" : "primario"}
                  disabled={acao.rodando}
                  onClick={() =>
                    void alterar(a, { status: a.status === "ATIVA" ? "PAUSADA" : "ATIVA" })
                  }
                >
                  {a.status === "ATIVA" ? (
                    <>
                      <CirclePause size={14} aria-hidden="true" /> Pausar
                    </>
                  ) : (
                    <>
                      <Play size={14} aria-hidden="true" /> Ativar
                    </>
                  )}
                </Botao>
              )}
            </header>

            <div className="crc-auto-card-metricas-v2">
              <MetricaAuto rotulo="Em jornada" valor={a.emJornada} />
              <MetricaAuto rotulo="Concluídas no mês" valor={a.concluidasNoMes} />
              <MetricaAuto rotulo="Agendaram" valor={a.saidasPorConversao} destaque />
              <div className="crc-auto-custo-v2">
                <small>Custo máximo por paciente</small>
                <strong>{a.custo.mensagens > 0 ? reais(a.custo.atePorPaciente) : "R$ 0"}</strong>
                <span>
                  {a.custo.mensagens > 0 ? composicao(a.custo.porCategoria) : "sem mensagem"}
                </span>
              </div>
            </div>

            {podeGerenciar && (
              <fieldset className="crc-auto-modos-v2">
                <legend>Grau de autonomia</legend>
                {MODOS.map((modo) => (
                  <label key={modo} data-selecionado={a.modo === modo ? "sim" : "nao"}>
                    <input
                      type="radio"
                      name={`modo-${a.id}`}
                      checked={a.modo === modo}
                      disabled={acao.rodando}
                      onChange={() => {
                        if (modo === "EXECUTAR") setConfirmando(a);
                        else void alterar(a, { modo });
                      }}
                    />
                    <span>
                      <strong>{ROTULO_MODO_AUTOMACAO[modo]}</strong>
                      <small>{EXPLICACAO_MODO_AUTOMACAO[modo]}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            <footer className="crc-auto-card-rodape-v2">
              <BotaoJornadas
                aberto={jornadasAbertas === a.id}
                aoAlternar={() => setJornadasAbertas((atual) => (atual === a.id ? null : a.id))}
              />
              <Botao
                pequeno
                variante="discreto"
                onClick={() => setEditando((atual) => (atual === a.id ? null : a.id))}
              >
                <Workflow size={14} aria-hidden="true" />{" "}
                {editando === a.id ? "Fechar a jornada" : "Ver e editar a jornada"}
              </Botao>
              <ChevronDown
                className={jornadasAbertas === a.id ? "crc-auto-chevron-aberto-v2" : ""}
                aria-hidden="true"
              />
            </footer>

            {editando === a.id && (
              <div className="crc-auto-jornadas-v2">
                <EditorDeJornada automationId={a.id} podeGerenciar={podeGerenciar} />
              </div>
            )}

            {jornadasAbertas === a.id && (
              <div className="crc-auto-jornadas-v2">
                {a.modo === "SHADOW" && (
                  <Aviso tom="info">
                    Esta automação está em simulação. O conteúdo abaixo é o que ela{" "}
                    <strong>teria</strong> enviado.
                  </Aviso>
                )}
                <JornadasDaAutomacao automationId={a.id} emSimulacao={a.modo === "SHADOW"} />
              </div>
            )}
          </article>
        ))}
      </section>

      <Modal
        titulo="Ligar o envio automático de mensagens?"
        aberto={confirmando !== null}
        aoFechar={() => setConfirmando(null)}
        rodape={
          <>
            <Botao onClick={() => setConfirmando(null)}>Cancelar</Botao>
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
        <div className="crc-auto-confirmacao-v2">
          <span>
            <MessageSquareText aria-hidden="true" />
          </span>
          <div>
            <p className="crc-corpo">
              A partir de agora, <strong>{confirmando?.nome}</strong> poderá enviar mensagens de
              WhatsApp para pacientes de verdade sem passar por aprovação humana.
            </p>
            <p className="crc-corpo">
              Horário comercial, opt-out, cooldown e limite de contatos continuam valendo. Você pode
              voltar para recomendação ou simulação a qualquer momento.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ResumoAuto({
  icone: Icone,
  rotulo,
  valor,
  nota,
  tom = "neutro",
}: {
  icone: typeof Bot;
  rotulo: string;
  valor: number;
  nota: string;
  tom?: "neutro" | "positivo" | "info" | "alerta";
}) {
  return (
    <article className="crc-auto-resumo-card-v2" data-tom={tom}>
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

function MetricaAuto({
  rotulo,
  valor,
  destaque = false,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <div className={`crc-auto-metrica-v2${destaque ? " crc-auto-metrica-destaque-v2" : ""}`}>
      <small>{rotulo}</small>
      <strong>{valor.toLocaleString("pt-BR")}</strong>
    </div>
  );
}
