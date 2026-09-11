import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CirclePause,
  ArrowUpRight,
  Bot,
  MessageSquareText,
  NotebookPen,
  Phone,
  Search,
  Send,
  Sparkles,
  UserRound,
} from "lucide-react";

import {
  abrirConversa,
  assumirConversaDaIa,
  carregarInbox,
  devolverConversaParaIa,
  pausarIaDaConversa,
  responderConversa,
  type Falha,
} from "@/lib/crc/api";
import type { Conversa, Mensagem } from "@/lib/crc/dominio/tipos";
import { hora, iniciais, tempoRelativo, truncar } from "@/lib/crc/dominio/formatar";
import { ROTULO_INTENCAO, ROTULO_TEMPERATURA } from "@/lib/crc/dominio/rotulos";
import { telefoneParaTela } from "@/lib/crc/dominio/telefone";

import { Aviso, BarraDeRecado, Botao, Etiqueta, ListaEsqueleto, Vazio, useAcao } from "./base";
import "./crc-operational.css";

/**
 * Quem manda nesta conversa, e o botão para mudar isso.
 *
 * A FAIXA EXISTE PORQUE O ESTADO É INVISÍVEL SEM ELA. "A IA está respondendo"
 * e "eu estou respondendo" produzem a mesma tela de mensagens — e a diferença
 * entre as duas é o paciente receber uma ou duas respostas.
 *
 * Três estados, três frases, e em cada uma só o botão que faz sentido ali. Um
 * painel com os três botões sempre visíveis faria a pessoa ler antes de agir;
 * aqui ela só vê a saída do estado em que está.
 */
function DonoDaConversa({
  dono,
  rodando,
  aoAssumir,
  aoDevolver,
  aoPausar,
}: {
  dono: "ia" | "humano" | "ninguem";
  rodando: boolean;
  aoAssumir: () => void;
  aoDevolver: () => void;
  aoPausar: () => void;
}) {
  if (dono === "humano") {
    return (
      <div className="crc-dono-faixa" data-dono="humano">
        <span>
          <UserRound size={14} aria-hidden="true" />
          <strong>Você está respondendo.</strong> A IA está calada nesta conversa.
        </span>
        <Botao pequeno variante="discreto" disabled={rodando} onClick={aoDevolver}>
          Devolver para a IA
        </Botao>
      </div>
    );
  }

  if (dono === "ninguem") {
    return (
      <div className="crc-dono-faixa" data-dono="ninguem">
        <span>
          <CirclePause size={14} aria-hidden="true" />
          <strong>IA pausada aqui.</strong> Ninguém está respondendo esta conversa.
        </span>
        <div className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
          <Botao pequeno disabled={rodando} onClick={aoAssumir}>
            Assumir
          </Botao>
          <Botao pequeno variante="discreto" disabled={rodando} onClick={aoDevolver}>
            Devolver para a IA
          </Botao>
        </div>
      </div>
    );
  }

  return (
    <div className="crc-dono-faixa" data-dono="ia">
      <span>
        <Bot size={14} aria-hidden="true" />
        <strong>A IA está atendendo.</strong> Assuma antes de responder, para não falar por cima.
      </span>
      <div className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
        <Botao pequeno disabled={rodando} onClick={aoAssumir}>
          Assumir conversa
        </Botao>
        <Botao pequeno variante="discreto" disabled={rodando} onClick={aoPausar}>
          Pausar IA
        </Botao>
      </div>
    </div>
  );
}

export function Inbox({
  aoAbrirPaciente,
  conversaInicial = null,
  aoConsumirInicial,
}: {
  aoAbrirPaciente: (patientId: string) => void;
  conversaInicial?: string | null;
  aoConsumirInicial?: () => void;
}) {
  const [conversas, setConversas] = useState<Conversa[] | null>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<Conversa | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [bloqueadaPor, setBloqueadaPor] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [notaInterna, setNotaInterna] = useState(false);
  const [apenasNaoLidas, setApenasNaoLidas] = useState(false);
  const [carregandoConversa, setCarregandoConversa] = useState(false);
  const [mudandoDono, setMudandoDono] = useState(false);
  const [busca, setBusca] = useState("");

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

  /**
   * Troca o dono e recarrega.
   *
   * RECARREGA A LISTA INTEIRA de propósito, em vez de remendar o estado local:
   * o dono aparece na faixa E governa se o envio é seguro, e um estado local
   * desatualizado aqui é exatamente o bug que esta fatia existe para impedir.
   */
  const trocarDono = useCallback(
    async (acao: "assumir" | "devolver" | "pausar"): Promise<void> => {
      if (selecionada === null || mudandoDono) return;
      setMudandoDono(true);
      try {
        const data = { conversationId: selecionada.id };
        if (acao === "assumir") await assumirConversaDaIa({ data });
        else if (acao === "devolver") await devolverConversaParaIa({ data });
        else await pausarIaDaConversa({ data });
        await recarregar();
      } catch {
        // A faixa continua mostrando o estado antigo, que é a verdade até a
        // próxima leitura. Melhor do que mostrar um estado que não foi gravado.
      } finally {
        setMudandoDono(false);
      }
    },
    [selecionada, mudandoDono, recarregar],
  );

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  useEffect(() => {
    if (!carregandoConversa) fimDaLista.current?.scrollIntoView({ block: "end" });
  }, [mensagens, carregandoConversa]);

  const voltarParaLista = useCallback((): void => {
    setSelecionada(null);
    setMensagens([]);
    setTexto("");
    setNotaInterna(false);
    setBloqueadaPor(null);
    setCarregandoConversa(false);
  }, []);

  const selecionar = useCallback(async (conversa: Conversa): Promise<void> => {
    setSelecionada(conversa);
    setMensagens([]);
    setTexto("");
    setNotaInterna(false);
    setBloqueadaPor(null);
    setCarregandoConversa(true);

    try {
      const r = await abrirConversa({ data: { conversationId: conversa.id } });
      if (r.ok) {
        setMensagens(r.mensagens);
        setBloqueadaPor(r.bloqueadaPor);
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
    } finally {
      setCarregandoConversa(false);
    }
  }, []);

  useEffect(() => {
    if (conversaInicial === null || conversas === null) return;
    const alvo = conversas.find((c) => c.id === conversaInicial);
    if (alvo !== undefined && selecionada?.id !== alvo.id) void selecionar(alvo);
    aoConsumirInicial?.();
  }, [conversaInicial, conversas, selecionada, selecionar, aoConsumirInicial]);

  const enviar = useCallback(async (): Promise<void> => {
    if (selecionada === null || texto.trim().length === 0 || carregandoConversa) return;
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
  }, [acao, carregandoConversa, notaInterna, selecionada, texto]);

  const conversasFiltradas = useMemo(() => {
    if (conversas === null) return null;
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (termo.length === 0) return conversas;

    return conversas.filter((c) => {
      const nome = c.patientId === null ? "" : (nomes[c.patientId] ?? "");
      const telefone = telefoneParaTela(c.contatoExterno);
      const trecho = c.ultimaMensagemTrecho ?? "";
      return `${nome} ${telefone} ${trecho}`.toLocaleLowerCase("pt-BR").includes(termo);
    });
  }, [busca, conversas, nomes]);

  const totalNaoLidas = (conversas ?? []).reduce((soma, c) => soma + c.naoLidas, 0);
  const totalRevisao = (conversas ?? []).filter((c) => c.revisaoPendente).length;

  if (erro !== null && conversas === null) return <Aviso tom="perigo">{erro}</Aviso>;

  return (
    <div className="crc-inbox-v2">
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      <section className="crc-inbox-resumo" aria-label="Estado das conversas">
        <div className="crc-inbox-resumo-copy">
          <div className="crc-inbox-resumo-icone">
            <MessageSquareText aria-hidden="true" />
          </div>
          <div>
            <strong>
              {totalNaoLidas === 0
                ? "Nenhuma mensagem esperando."
                : `${String(totalNaoLidas)} ${totalNaoLidas === 1 ? "mensagem nova" : "mensagens novas"}.`}
            </strong>
            <span>
              {totalRevisao > 0
                ? `${String(totalRevisao)} ${totalRevisao === 1 ? "conversa precisa" : "conversas precisam"} de revisão.`
                : "Nenhum conflito de identificação pendente."}
            </span>
          </div>
        </div>
        <div className="crc-inbox-resumo-status">
          <span /> Atendimento conectado ao contexto do paciente
        </div>
      </section>

      <div
        className="crc-inbox crc-inbox-layout-v2"
        data-conversa-aberta={selecionada === null ? "nao" : "sim"}
      >
        <section className="crc-painel crc-inbox-lista" aria-label="Conversas">
          <div className="crc-inbox-lista-topo">
            <div>
              <div className="crc-sobretitulo">Fila de atendimento</div>
              <h2 className="crc-titulo-cartao">Conversas</h2>
            </div>
            {totalNaoLidas > 0 && <span className="crc-inbox-nao-lidas">{totalNaoLidas}</span>}
          </div>

          <div className="crc-inbox-busca-wrap">
            <Search aria-hidden="true" />
            <label className="crc-so-leitor" htmlFor="crc-inbox-busca">
              Buscar conversa
            </label>
            <input
              id="crc-inbox-busca"
              className="crc-inbox-busca"
              type="search"
              placeholder="Paciente, telefone ou mensagem…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          <div className="crc-inbox-filtro-linha">
            <button
              type="button"
              className="crc-inbox-filtro"
              aria-pressed={!apenasNaoLidas}
              onClick={() => setApenasNaoLidas(false)}
            >
              Todas
            </button>
            <button
              type="button"
              className="crc-inbox-filtro"
              aria-pressed={apenasNaoLidas}
              onClick={() => setApenasNaoLidas(true)}
            >
              Não lidas
            </button>
          </div>

          <div className="crc-painel-corpo crc-inbox-lista-corpo">
            {conversasFiltradas === null ? (
              <div className="crc-inbox-loading">
                <ListaEsqueleto linhas={5} />
              </div>
            ) : conversasFiltradas.length === 0 ? (
              <Vazio
                titulo={
                  busca.trim().length > 0
                    ? "Nada encontrado."
                    : apenasNaoLidas
                      ? "Nenhuma conversa esperando você."
                      : "Nenhuma conversa ainda."
                }
                explicacao={
                  busca.trim().length > 0
                    ? "Tente outro nome, telefone ou trecho da mensagem."
                    : apenasNaoLidas
                      ? "Você chegou ao fim da fila. Quando um paciente responder, a conversa aparece aqui."
                      : "As conversas aparecem quando um paciente escreve pelo WhatsApp ou quando uma automação inicia o contato."
                }
              />
            ) : (
              <ul className="crc-inbox-lista-itens" role="listbox">
                {conversasFiltradas.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selecionada?.id === c.id}
                      className="crc-conversa-item crc-conversa-item-v2"
                      onClick={() => void selecionar(c)}
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

        <section
          className="crc-painel crc-inbox-conversa"
          aria-label="Mensagens"
          aria-busy={carregandoConversa}
        >
          {selecionada === null ? (
            <div className="crc-inbox-sem-selecao">
              <div className="crc-inbox-sem-selecao-icone">
                <MessageSquareText aria-hidden="true" />
              </div>
              <Vazio
                titulo="Escolha uma conversa"
                explicacao="A conversa abre aqui sem tirar você da fila. O contexto do paciente aparece ao lado."
              />
            </div>
          ) : (
            <>
              <header className="crc-inbox-conversa-topo">
                <Botao
                  pequeno
                  variante="discreto"
                  className="crc-inbox-voltar"
                  aria-label="Voltar para a lista de conversas"
                  onClick={voltarParaLista}
                >
                  <ArrowLeft size={16} aria-hidden="true" /> Conversas
                </Botao>

                <div className="crc-inbox-pessoa">
                  <span className="crc-inbox-avatar" aria-hidden="true">
                    {iniciais(
                      selecionada.patientId === null
                        ? telefoneParaTela(selecionada.contatoExterno)
                        : (nomes[selecionada.patientId] ?? "Paciente"),
                    )}
                  </span>
                  <div>
                    <h2 className="crc-titulo-cartao crc-truncar">
                      {selecionada.patientId === null
                        ? telefoneParaTela(selecionada.contatoExterno)
                        : (nomes[selecionada.patientId] ?? "Paciente")}
                    </h2>
                    <p className="crc-meta">{telefoneParaTela(selecionada.contatoExterno)}</p>
                  </div>
                </div>

                {selecionada.patientId !== null && (
                  <Botao
                    pequeno
                    onClick={() =>
                      selecionada.patientId !== null && aoAbrirPaciente(selecionada.patientId)
                    }
                  >
                    Ficha <ArrowUpRight size={14} aria-hidden="true" />
                  </Botao>
                )}
              </header>

              <DonoDaConversa
                dono={selecionada.dono}
                rodando={mudandoDono}
                aoAssumir={() => void trocarDono("assumir")}
                aoDevolver={() => void trocarDono("devolver")}
                aoPausar={() => void trocarDono("pausar")}
              />

              <div className="crc-painel-corpo crc-inbox-conversa-corpo">
                {selecionada.revisaoPendente && (
                  <div className="crc-inbox-aviso">
                    <Aviso tom="alerta">
                      Este telefone está cadastrado para mais de um paciente. Confirme de quem é
                      esta conversa antes de registrar qualquer coisa na ficha.
                    </Aviso>
                  </div>
                )}

                <div className="crc-mensagens crc-mensagens-v2">
                  {carregandoConversa ? (
                    <p className="crc-meta" role="status" style={{ textAlign: "center" }}>
                      Carregando conversa…
                    </p>
                  ) : mensagens.length === 0 ? (
                    <p className="crc-meta" style={{ textAlign: "center" }}>
                      Nenhuma mensagem nesta conversa ainda.
                    </p>
                  ) : (
                    mensagens.map((m) => <Balao key={m.id} mensagem={m} />)
                  )}
                  <div ref={fimDaLista} />
                </div>
              </div>

              <footer
                className={`crc-inbox-composer${notaInterna ? " crc-inbox-composer-nota" : ""}`}
              >
                {bloqueadaPor !== null && (
                  <div className="crc-inbox-bloqueio">
                    <Aviso tom="alerta">
                      Outro atendente está cuidando desta conversa agora. Combine antes de
                      responder.
                    </Aviso>
                  </div>
                )}

                <div className="crc-inbox-modo" role="group" aria-label="Tipo de mensagem">
                  <button
                    type="button"
                    aria-pressed={!notaInterna}
                    onClick={() => setNotaInterna(false)}
                  >
                    <MessageSquareText aria-hidden="true" /> Resposta ao paciente
                  </button>
                  <button
                    type="button"
                    aria-pressed={notaInterna}
                    onClick={() => setNotaInterna(true)}
                  >
                    <NotebookPen aria-hidden="true" /> Nota interna
                  </button>
                </div>

                <label className="crc-so-leitor" htmlFor="crc-resposta">
                  {notaInterna ? "Nota interna" : "Resposta ao paciente"}
                </label>
                <textarea
                  id="crc-resposta"
                  className="crc-area crc-inbox-textarea"
                  placeholder={
                    carregandoConversa
                      ? "Carregando histórico…"
                      : notaInterna
                        ? "Escreva uma nota para a equipe. O paciente não vê."
                        : "Escreva sua resposta para o paciente…"
                  }
                  value={texto}
                  disabled={carregandoConversa}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      void enviar();
                    }
                  }}
                />

                <div className="crc-inbox-composer-rodape">
                  <span className="crc-meta">Ctrl/⌘ + Enter envia</span>
                  <Botao
                    variante="primario"
                    carregando={acao.rodando}
                    disabled={carregandoConversa || texto.trim().length === 0}
                    onClick={() => void enviar()}
                  >
                    {notaInterna ? (
                      <NotebookPen size={16} aria-hidden="true" />
                    ) : (
                      <Send size={16} aria-hidden="true" />
                    )}
                    {notaInterna ? "Salvar nota" : "Enviar"}
                  </Botao>
                </div>
              </footer>
            </>
          )}
        </section>

        <aside className="crc-painel crc-inbox-contexto" aria-label="Contexto do paciente">
          <div className="crc-inbox-contexto-topo">
            <div className="crc-sobretitulo">Antes de responder</div>
            <h2 className="crc-titulo-cartao">Contexto</h2>
          </div>
          <div className="crc-painel-corpo crc-inbox-contexto-corpo">
            {selecionada === null ? (
              <div className="crc-inbox-contexto-vazio">
                <UserRound aria-hidden="true" />
                <p>Abra uma conversa para ver o que já sabemos sobre o paciente.</p>
              </div>
            ) : (
              <div className="crc-inbox-contexto-stack">
                {selecionada.resumoIa !== null && (
                  <section className="crc-inbox-ia">
                    <div className="crc-inbox-ia-topo">
                      <Sparkles aria-hidden="true" />
                      <span>Leitura automática</span>
                    </div>
                    <p>{selecionada.resumoIa}</p>
                    {selecionada.resumoIaEm !== null && (
                      <small>Lido {tempoRelativo(selecionada.resumoIaEm)}</small>
                    )}
                  </section>
                )}

                <div className="crc-inbox-tags">
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

                <ContextoDado
                  icone={Phone}
                  rotulo="Telefone"
                  valor={telefoneParaTela(selecionada.contatoExterno)}
                />
                {selecionada.ultimaMensagemEm !== null && (
                  <ContextoDado
                    icone={MessageSquareText}
                    rotulo="Última mensagem"
                    valor={tempoRelativo(selecionada.ultimaMensagemEm)}
                  />
                )}
                <ContextoDado
                  icone={Bot}
                  rotulo="Origem do contexto"
                  valor={
                    selecionada.resumoIa !== null
                      ? "IA + histórico da conversa"
                      : "Histórico da conversa"
                  }
                />
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ContextoDado({
  icone: Icone,
  rotulo,
  valor,
}: {
  icone: typeof Phone;
  rotulo: string;
  valor: string;
}) {
  return (
    <div className="crc-inbox-contexto-dado">
      <span>
        <Icone aria-hidden="true" />
      </span>
      <div>
        <small>{rotulo}</small>
        <strong>{valor}</strong>
      </div>
    </div>
  );
}

function ItemConversa({ conversa, nome }: { conversa: Conversa; nome: string | null }) {
  const titulo = nome ?? telefoneParaTela(conversa.contatoExterno);

  return (
    <div className="crc-inbox-item-grid">
      <span className="crc-inbox-item-avatar" aria-hidden="true">
        {iniciais(titulo)}
      </span>
      <div className="crc-inbox-item-copy">
        <div className="crc-inbox-item-titulo">
          <strong className="crc-truncar">{titulo}</strong>
          {conversa.ultimaMensagemEm !== null && (
            <span>{tempoRelativo(conversa.ultimaMensagemEm)}</span>
          )}
        </div>
        <p className="crc-truncar">
          {conversa.ultimaMensagemTrecho === null
            ? "Sem mensagens"
            : truncar(conversa.ultimaMensagemTrecho, 72)}
        </p>
        <div className="crc-inbox-item-tags">
          {conversa.naoLidas > 0 && (
            <Etiqueta tom="positiva">
              {conversa.naoLidas} {conversa.naoLidas === 1 ? "nova" : "novas"}
            </Etiqueta>
          )}
          {conversa.revisaoPendente && <Etiqueta tom="alerta">Revisar paciente</Etiqueta>}
        </div>
      </div>
    </div>
  );
}

function Balao({ mensagem }: { mensagem: Mensagem }) {
  const classe = mensagem.notaInterna
    ? "crc-balao crc-balao-nota crc-balao-v2"
    : mensagem.direcao === "ENTRADA"
      ? "crc-balao crc-balao-entrada crc-balao-v2"
      : "crc-balao crc-balao-saida crc-balao-v2";

  return (
    <div className={classe}>
      {mensagem.notaInterna && (
        <div className="crc-balao-nota-label">
          <NotebookPen aria-hidden="true" /> Nota interna — paciente não vê
        </div>
      )}
      <div>{mensagem.conteudo}</div>
      <div className="crc-balao-hora">
        {hora(mensagem.criadoEm)}
        {mensagem.remetente === "automacao" && " · automação"}
        {mensagem.statusEntrega === "FAILED" && " · falhou"}
      </div>
    </div>
  );
}
