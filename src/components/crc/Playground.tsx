/**
 * Playground — testar o agente sem soltá-lo em cima de gente.
 *
 * O QUE ELE RESOLVE. Até agora, para saber como o agente responderia a uma
 * mensagem, era preciso esperar um paciente escrever aquela mensagem. E para
 * testar uma mudança no texto do agente, era preciso PUBLICAR a mudança — ou
 * seja, soltá-la em cima de paciente de verdade para descobrir se ficou boa.
 *
 * ========================================================================
 *  A PROMESSA DESTA TELA, e ela é a primeira coisa que a pessoa lê:
 *  NADA SAI, NADA É GRAVADO, NENHUM PACIENTE RECEBE NADA.
 *
 *  Quatro travas sustentam isso, e estão em `aplicacao/playground.ts`: sem
 *  envio, sem porta de mensageria, escritas dubladas e sem gravar a run.
 * ========================================================================
 *
 * O QUE **É** REAL: o modelo e as leituras. O contexto vem da conversa de
 * verdade, as ferramentas de leitura consultam os dados de verdade, e a chamada
 * de modelo é paga. Um playground que lê dados falsos testa o prompt contra uma
 * ficção — e a resposta que ele mostra não seria a que o paciente receberia.
 */
import { useCallback, useEffect, useState } from "react";
import { FlaskConical, Play } from "lucide-react";

import {
  carregarConversasParaTeste,
  rodarNoPlayground,
  type ConversaParaTesteDto,
  type ResultadoPlaygroundDto,
} from "@/lib/crc/api";

import {
  Area,
  Aviso,
  Botao,
  Cartao,
  Campo,
  Etiqueta,
  ListaEsqueleto,
  Vazio,
  useAcao,
} from "./base";

/** O que cada desfecho significa para quem está testando. */
const DESFECHO: Record<string, { tom: "positiva" | "alerta" | "perigo" | "info"; texto: string }> =
  {
    candidato: { tom: "positiva", texto: "O agente responderia isto" },
    enviado: { tom: "positiva", texto: "O agente responderia isto" },
    humano: { tom: "info", texto: "O agente passaria para uma pessoa" },
    sem_acao: { tom: "alerta", texto: "O agente não responderia" },
    falha_segura: { tom: "perigo", texto: "O turno falhou" },
    sem_provedor: { tom: "perigo", texto: "Falta configurar o provedor de IA" },
    erro: { tom: "perigo", texto: "Algo quebrou" },
  };

export function Playground() {
  const [conversas, setConversas] = useState<ConversaParaTesteDto[] | null>(null);
  const [conversaId, setConversaId] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [instrucoes, setInstrucoes] = useState("");
  const [resultado, setResultado] = useState<ResultadoPlaygroundDto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const acao = useAcao();

  useEffect(() => {
    void (async () => {
      try {
        const r = await carregarConversasParaTeste();
        if (r.ok) {
          setConversas(r.conversas);
          setConversaId(r.conversas[0]?.id ?? "");
        } else {
          setErro(r.message);
        }
      } catch {
        setErro("Não conseguimos carregar as conversas.");
      }
    })();
  }, []);

  const rodar = useCallback((): void => {
    void acao.executar(
      () =>
        rodarNoPlayground({
          data: {
            conversationId: conversaId,
            mensagem,
            // Vazio significa "usa o texto publicado". Mandar string vazia faria
            // o agente rodar SEM instrução nenhuma, que é outro teste.
            instrucoes: instrucoes.trim().length === 0 ? null : instrucoes,
          },
        }),
      (r) => {
        setResultado(r.resultado);
      },
      "Turno simulado. Nada foi enviado.",
    );
  }, [acao, conversaId, mensagem, instrucoes]);

  if (erro !== null && conversas === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (conversas === null) return <ListaEsqueleto linhas={3} />;

  const d = resultado === null ? undefined : (DESFECHO[resultado.desfecho] ?? DESFECHO["erro"]);

  return (
    <>
      {/*
        A PROMESSA VEM ANTES DO FORMULÁRIO, e não depois.
        Quem abre esta tela precisa saber que pode digitar sem medo ANTES de
        digitar. Um aviso no rodapé seria lido depois de a pessoa já ter
        hesitado.
      */}
      <div style={{ marginBottom: "var(--crc-e5)" }}>
        <Aviso tom="info">
          <strong>Nada sai daqui.</strong> Nenhuma mensagem é enviada, nenhuma consulta é marcada e
          nenhuma tarefa é criada — mesmo que o agente decida fazer essas coisas. O que ele TERIA
          feito aparece na lista de passos. A chamada ao modelo é real e entra no orçamento de IA.
        </Aviso>
      </div>

      <Cartao titulo="O teste">
        {conversas.length === 0 ? (
          <Vazio
            titulo="Nenhuma conversa para usar de cenário"
            explicacao="O Playground roda sobre uma conversa real, para o contexto ser o de verdade. Quando chegar a primeira mensagem, ela aparece aqui."
          />
        ) : (
          <>
            <Campo
              rotulo="Conversa"
              dica="O histórico e o paciente vêm desta conversa. Sua mensagem entra como se fosse a próxima."
            >
              {(id) => (
                <select
                  id={id}
                  className="crc-entrada"
                  value={conversaId}
                  onChange={(e) => {
                    setConversaId(e.target.value);
                  }}
                >
                  {conversas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                      {c.ultimaMensagem.length > 0 ? ` — ${c.ultimaMensagem}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </Campo>

            <Campo rotulo="A mensagem do paciente" dica="O que você quer ver o agente responder.">
              {(id) => (
                <Area
                  id={id}
                  rows={3}
                  value={mensagem}
                  placeholder="Oi, consigo remarcar minha consulta de quinta?"
                  onChange={(e) => {
                    setMensagem(e.target.value);
                  }}
                />
              )}
            </Campo>

            <Campo
              rotulo="Texto do agente (opcional)"
              // É O PONTO DA TELA. Sem isto, testar uma mudança de instruções
              // exigiria publicá-la — soltando-a em cima de gente.
              dica="Deixe vazio para usar o texto publicado. Preencha para testar uma versão nova ANTES de publicar."
            >
              {(id) => (
                <Area
                  id={id}
                  rows={5}
                  value={instrucoes}
                  placeholder="Cole aqui o rascunho do Estúdio para ver o efeito dele."
                  onChange={(e) => {
                    setInstrucoes(e.target.value);
                  }}
                />
              )}
            </Campo>

            <Botao
              onClick={rodar}
              disabled={acao.rodando || mensagem.trim().length === 0 || conversaId.length === 0}
            >
              <Play size={14} /> {acao.rodando ? "Rodando…" : "Rodar o turno"}
            </Botao>
          </>
        )}
      </Cartao>

      {resultado !== null && d !== undefined && (
        <>
          <Cartao titulo="O que aconteceria">
            <div
              className="crc-linha"
              style={{ gap: "var(--crc-e3)", marginBottom: "var(--crc-e3)" }}
            >
              <FlaskConical size={16} />
              <Etiqueta tom={d.tom}>{d.texto}</Etiqueta>
            </div>

            {resultado.resposta !== null ? (
              <blockquote className="crc-cartao-compacto">{resultado.resposta}</blockquote>
            ) : (
              <p className="crc-corpo">
                {resultado.motivo.length > 0
                  ? resultado.motivo
                  : "O agente não produziu resposta para este caso."}
              </p>
            )}
          </Cartao>

          {resultado.escritasSimuladas.length > 0 && (
            <Cartao titulo="O que TERIA mudado no mundo">
              {/*
                A PARTE MAIS IMPORTANTE DA TELA quando ela aparece. É aqui que
                se descobre que o agente marcaria uma consulta, criaria uma
                tarefa ou registraria um opt-out — sem nada disso ter
                acontecido.
              */}
              <Aviso tom="alerta">
                Em produção, este turno teria executado as ações abaixo. Aqui elas foram apenas
                descritas.
              </Aviso>
              <ul className="crc-pilha" style={{ marginTop: "var(--crc-e3)" }}>
                {resultado.escritasSimuladas.map((e, i) => (
                  <li key={`${e}-${String(i)}`} className="crc-cartao-compacto">
                    <code>{e}</code>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}

          <Cartao titulo="Passo a passo">
            <p className="crc-corpo" style={{ marginBottom: "var(--crc-e3)" }}>
              Ajustar um texto olhando só a resposta final é tentativa e erro caro. Aqui está o que
              o agente consultou e decidiu antes de responder.
            </p>
            {resultado.passos.length === 0 ? (
              <Vazio titulo="Sem passos" explicacao="O turno terminou antes de o modelo agir." />
            ) : (
              <ul className="crc-pilha">
                {resultado.passos.map((p, i) => (
                  <li key={`${p.nome}-${String(i)}`} className="crc-cartao-compacto">
                    <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
                      <Etiqueta tom={p.teriaEscrito ? "alerta" : "neutra"}>{p.tipo}</Etiqueta>
                      <strong>{p.nome}</strong>
                    </div>
                    <p className="crc-corpo" style={{ marginTop: "var(--crc-e1)" }}>
                      {p.detalhe}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </>
      )}
    </>
  );
}
