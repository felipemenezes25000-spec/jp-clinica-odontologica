/**
 * A Inbox — item 17 do Mega Prompt, itens 40 e 41 do contrato.
 *
 * Três painéis: lista de conversas | conversa | contexto do paciente.
 *
 * DECISÕES QUE VALE EXPLICAR:
 *
 *   O painel de contexto some antes da lista quando a tela encolhe (ver
 *   `crc.css`). Ele é apoio; a conversa é o trabalho. Em telas estreitas a
 *   lista some quando há conversa aberta — empilhar as duas obrigaria a rolar
 *   a lista inteira para chegar no que se está lendo.
 *
 *   A nota interna é visualmente OUTRA COISA (item 163). Se ela parecesse
 *   mensagem, alguém escreveria uma achando que o paciente não veria. O
 *   componente também não usa o mesmo caminho de envio — a distinção é de
 *   arquitetura, não de estilo.
 *
 *   O aviso de "Fulano está atendendo" (item 41) aparece ANTES da caixa de
 *   texto, e não como toast depois do envio. Descobrir que outra pessoa já
 *   respondeu depois de escrever é a pior hora possível.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { abrirConversa, carregarInbox, responderConversa, type Falha } from "@/lib/crc/api";
import type { Conversa, Mensagem } from "@/lib/crc/dominio/tipos";
import { hora, iniciais, tempoRelativo, truncar } from "@/lib/crc/dominio/formatar";
import { ROTULO_INTENCAO, ROTULO_TEMPERATURA } from "@/lib/crc/dominio/rotulos";
import { telefoneParaTela } from "@/lib/crc/dominio/telefone";

import { Aviso, BarraDeRecado, Botao, Etiqueta, ListaEsqueleto, Vazio, useAcao } from "./base";

export function Inbox({ aoAbrirPaciente }: { aoAbrirPaciente: (patientId: string) => void }) {
  const [conversas, setConversas] = useState<Conversa[] | null>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<Conversa | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [bloqueadaPor, setBloqueadaPor] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [notaInterna, setNotaInterna] = useState(false);
  const [apenasNaoLidas, setApenasNaoLidas] = useState(false);

  const acao = useAcao();
  const fimDaLista = useRef<HTMLDivElement>(null);

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarInbox({ data: { apenasNaoLidas } });
      if (r.ok) {
        setConversas(r.conversas);
        setNomes(r.nomes);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos carregar as conversas. Tente atualizar a página.");
    }
  }, [apenasNaoLidas]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  // Rola para a mensagem mais recente ao abrir a conversa. Sem isso, abrir uma
  // conversa longa mostra o começo dela — que é justamente o que ninguém
  // precisa ler.
  useEffect(() => {
    fimDaLista.current?.scrollIntoView({ block: "end" });
  }, [mensagens]);

  const selecionar = useCallback(async (conversa: Conversa): Promise<void> => {
    setSelecionada(conversa);
    setMensagens([]);
    setTexto("");
    setNotaInterna(false);

    try {
      const r = await abrirConversa({ data: { conversationId: conversa.id } });
      if (r.ok) {
        setMensagens(r.mensagens);
        setBloqueadaPor(r.bloqueadaPor);
        // A conversa foi marcada como lida no servidor; refletir aqui evita
        // o contador ficar teimando até o próximo carregamento.
        setConversas((atuais) =>
          atuais === null
            ? null
            : atuais.map((c) => (c.id === conversa.id ? { ...c, naoLidas: 0 } : c)),
        );
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos abrir esta conversa.");
    }
  }, []);

  const enviar = useCallback(async (): Promise<void> => {
    if (selecionada === null || texto.trim().length === 0) return;
    const conteudo = texto.trim();
    const interna = notaInterna;

    await acao.executar(
      () =>
        responderConversa({
          data: { conversationId: selecionada.id, texto: conteudo, notaInterna: interna },
        }) as Promise<{ ok: true; mensagem: Mensagem | null } | Falha>,
      (r) => {
        setTexto("");
        setNotaInterna(false);
        if (r.mensagem !== null) setMensagens((atuais) => [...atuais, r.mensagem as Mensagem]);
      },
    );
  }, [acao, notaInterna, selecionada, texto]);

  if (erro !== null && conversas === null) {
    return <Aviso tom="perigo">{erro}</Aviso>;
  }

  return (
    <>
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      <div className="crc-inbox" data-conversa-aberta={selecionada === null ? "nao" : "sim"}>
        {/* ---- Painel 1: lista ------------------------------------------- */}
        <section className="crc-painel" aria-label="Conversas">
          <div className="crc-painel-topo">
            <h2 className="crc-titulo-cartao">Conversas</h2>
            <Botao
              pequeno
              variante="discreto"
              aria-pressed={apenasNaoLidas}
              onClick={() => {
                setApenasNaoLidas((v) => !v);
              }}
            >
              {apenasNaoLidas ? "Ver todas" : "Só não lidas"}
            </Botao>
          </div>

          <div className="crc-painel-corpo">
            {conversas === null ? (
              <div style={{ padding: "var(--crc-e4)" }}>
                <ListaEsqueleto linhas={5} />
              </div>
            ) : conversas.length === 0 ? (
              <Vazio
                titulo={
                  apenasNaoLidas ? "Nenhuma conversa esperando você." : "Nenhuma conversa ainda."
                }
                explicacao={
                  apenasNaoLidas
                    ? "Você chegou ao fim da fila. Quando um paciente responder, a conversa aparece aqui."
                    : "As conversas aparecem aqui quando um paciente escreve pelo WhatsApp ou quando uma automação inicia o contato."
                }
              />
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }} role="listbox">
                {conversas.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selecionada?.id === c.id}
                      className="crc-conversa-item"
                      onClick={() => {
                        void selecionar(c);
                      }}
                    >
                      <ItemConversa
                        conversa={c}
                        nome={c.patientId === null ? null : (nomes[c.patientId] ?? null)}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ---- Painel 2: conversa ---------------------------------------- */}
        <section className="crc-painel" aria-label="Mensagens">
          {selecionada === null ? (
            <Vazio
              titulo="Escolha uma conversa"
              explicacao="Selecione alguém na lista ao lado para ler o histórico e responder."
            />
          ) : (
            <>
              <div className="crc-painel-topo">
                <div style={{ minWidth: 0 }}>
                  <h2 className="crc-titulo-cartao crc-truncar">
                    {selecionada.patientId === null
                      ? telefoneParaTela(selecionada.contatoExterno)
                      : (nomes[selecionada.patientId] ?? "Paciente")}
                  </h2>
                  <p className="crc-meta">{telefoneParaTela(selecionada.contatoExterno)}</p>
                </div>

                {selecionada.patientId !== null && (
                  <Botao
                    pequeno
                    onClick={() => {
                      if (selecionada.patientId !== null) aoAbrirPaciente(selecionada.patientId);
                    }}
                  >
                    Ver ficha
                  </Botao>
                )}
              </div>

              <div className="crc-painel-corpo">
                {/*
                  Item 167: telefone que casou com mais de um paciente. O
                  sistema NÃO escolheu, e a tela precisa dizer isso — senão o
                  atendente assume que a conversa é de quem o nome sugere.
                */}
                {selecionada.revisaoPendente && (
                  <div style={{ padding: "var(--crc-e4) var(--crc-e4) 0" }}>
                    <Aviso tom="alerta">
                      Este telefone está cadastrado para mais de um paciente. Confirme de quem é
                      esta conversa antes de registrar qualquer coisa na ficha.
                    </Aviso>
                  </div>
                )}

                <div className="crc-mensagens">
                  {mensagens.length === 0 ? (
                    <p className="crc-meta" style={{ textAlign: "center" }}>
                      Nenhuma mensagem nesta conversa ainda.
                    </p>
                  ) : (
                    mensagens.map((m) => <Balao key={m.id} mensagem={m} />)
                  )}
                  <div ref={fimDaLista} />
                </div>
              </div>

              <div className="crc-painel-rodape">
                {/*
                  Item 41: o aviso vem ANTES da caixa de texto. Descobrir que
                  outra pessoa já respondeu depois de escrever é a pior hora.
                */}
                {bloqueadaPor !== null && (
                  <div style={{ marginBottom: "var(--crc-e2)" }}>
                    <Aviso tom="alerta">
                      Outro atendente está cuidando desta conversa agora. Combine antes de
                      responder.
                    </Aviso>
                  </div>
                )}

                <label className="crc-so-leitor" htmlFor="crc-resposta">
                  {notaInterna ? "Nota interna" : "Resposta ao paciente"}
                </label>
                <textarea
                  id="crc-resposta"
                  className="crc-area"
                  style={{ minHeight: 72 }}
                  placeholder={
                    notaInterna
                      ? "Nota interna — o paciente NÃO vê este texto."
                      : "Escreva sua resposta…"
                  }
                  value={texto}
                  onChange={(e) => {
                    setTexto(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    // Ctrl/Cmd+Enter envia. Enter sozinho quebra linha — numa
                    // caixa de conversa longa, enviar no Enter manda mensagem
                    // pela metade o tempo todo.
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      void enviar();
                    }
                  }}
                />

                <div className="crc-linha" style={{ marginTop: "var(--crc-e2)" }}>
                  <label className="crc-linha crc-meta" style={{ gap: "var(--crc-e2)" }}>
                    <input
                      type="checkbox"
                      checked={notaInterna}
                      onChange={(e) => {
                        setNotaInterna(e.target.checked);
                      }}
                    />
                    Nota interna (o paciente não vê)
                  </label>

                  <div className="crc-empurra">
                    <Botao
                      variante="primario"
                      carregando={acao.rodando}
                      disabled={texto.trim().length === 0}
                      onClick={() => {
                        void enviar();
                      }}
                    >
                      {notaInterna ? "Salvar nota" : "Enviar"}
                    </Botao>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ---- Painel 3: contexto ---------------------------------------- */}
        <section className="crc-painel" aria-label="Contexto do paciente">
          <div className="crc-painel-topo">
            <h2 className="crc-titulo-cartao">Contexto</h2>
          </div>
          <div className="crc-painel-corpo" style={{ padding: "var(--crc-e4)" }}>
            {selecionada === null ? (
              <p className="crc-meta">Abra uma conversa para ver o contexto do paciente.</p>
            ) : (
              <div className="crc-pilha">
                {/*
                  O resumo da IA aparece PRIMEIRO, e identificado como leitura
                  automática. Sem a atribuição, o atendente pode tomá-lo como
                  fato registrado por um colega.
                */}
                {selecionada.resumoIa !== null && (
                  <div>
                    <span className="crc-kpi-rotulo">Resumo automático</span>
                    <p className="crc-corpo" style={{ marginTop: "var(--crc-e1)" }}>
                      {selecionada.resumoIa}
                    </p>
                    {selecionada.resumoIaEm !== null && (
                      <p className="crc-meta" style={{ marginTop: "var(--crc-e1)" }}>
                        Lido {tempoRelativo(selecionada.resumoIaEm)}
                      </p>
                    )}
                  </div>
                )}

                <div className="crc-linha">
                  {selecionada.intencao !== null && (
                    <Etiqueta tom="info">{ROTULO_INTENCAO[selecionada.intencao]}</Etiqueta>
                  )}
                  {selecionada.temperatura !== null && (
                    <Etiqueta
                      tom={
                        selecionada.temperatura === "HOT"
                          ? "perigo"
                          : selecionada.temperatura === "WARM"
                            ? "alerta"
                            : "neutra"
                      }
                    >
                      {ROTULO_TEMPERATURA[selecionada.temperatura]}
                    </Etiqueta>
                  )}
                </div>

                <hr className="crc-separador" />

                <div>
                  <span className="crc-kpi-rotulo">Telefone</span>
                  <p className="crc-corpo">{telefoneParaTela(selecionada.contatoExterno)}</p>
                </div>

                {selecionada.ultimaMensagemEm !== null && (
                  <div>
                    <span className="crc-kpi-rotulo">Última mensagem</span>
                    <p className="crc-corpo">{tempoRelativo(selecionada.ultimaMensagemEm)}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function ItemConversa({ conversa, nome }: { conversa: Conversa; nome: string | null }) {
  const titulo = nome ?? telefoneParaTela(conversa.contatoExterno);

  return (
    <div className="crc-linha" style={{ gap: "var(--crc-e3)", alignItems: "flex-start" }}>
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 34,
          height: 34,
          borderRadius: "50%",
          background: "var(--crc-superficie-3)",
          color: "var(--crc-texto-2)",
          fontSize: "0.75rem",
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {iniciais(titulo)}
      </span>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "nowrap" }}>
          <strong className="crc-truncar" style={{ fontSize: "0.9375rem" }}>
            {titulo}
          </strong>
          {conversa.ultimaMensagemEm !== null && (
            <span className="crc-meta crc-empurra" style={{ flexShrink: 0 }}>
              {tempoRelativo(conversa.ultimaMensagemEm)}
            </span>
          )}
        </div>

        <p className="crc-meta crc-truncar" style={{ marginTop: 2 }}>
          {conversa.ultimaMensagemTrecho === null
            ? "Sem mensagens"
            : truncar(conversa.ultimaMensagemTrecho, 64)}
        </p>

        <div className="crc-linha" style={{ marginTop: "var(--crc-e1)", gap: "var(--crc-e1)" }}>
          {/* O contador de não lidas é texto, e não só um ponto colorido. */}
          {conversa.naoLidas > 0 && (
            <Etiqueta tom="positiva">
              {conversa.naoLidas} {conversa.naoLidas === 1 ? "nova" : "novas"}
            </Etiqueta>
          )}
          {conversa.revisaoPendente && <Etiqueta tom="alerta">Precisa de revisão</Etiqueta>}
        </div>
      </div>
    </div>
  );
}

function Balao({ mensagem }: { mensagem: Mensagem }) {
  const classe = mensagem.notaInterna
    ? "crc-balao crc-balao-nota"
    : mensagem.direcao === "ENTRADA"
      ? "crc-balao crc-balao-entrada"
      : "crc-balao crc-balao-saida";

  return (
    <div className={classe}>
      {mensagem.notaInterna && (
        <div style={{ fontSize: "0.6875rem", fontWeight: 700, marginBottom: 2 }}>
          NOTA INTERNA — o paciente não vê
        </div>
      )}
      <div>{mensagem.conteudo}</div>
      <div
        style={{
          fontSize: "0.6875rem",
          opacity: 0.75,
          marginTop: 4,
          textAlign: mensagem.direcao === "ENTRADA" ? "left" : "right",
        }}
      >
        {hora(mensagem.criadoEm)}
        {mensagem.remetente === "automacao" && " · automação"}
        {mensagem.statusEntrega === "FAILED" && " · falhou"}
      </div>
    </div>
  );
}
