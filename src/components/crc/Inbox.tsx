import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CirclePause,
  ArrowUpRight,
  Bot,
  Facebook,
  Instagram,
  MessageCircle,
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
  buscarPacientes,
  carregarInbox,
  devolverConversaParaIa,
  pausarIaDaConversa,
  responderConversa,
  vincularPerfilDaMeta,
  type Falha,
} from "@/lib/crc/api";
import {
  CANAIS_DE_CONVERSA,
  canalDaLinha,
  contatoParaTela,
  rotuloDoCanal,
  type CanalConversa,
} from "@/lib/crc/dominio/canais";
import type { Conversa, Mensagem, Paciente } from "@/lib/crc/dominio/tipos";
import { hora, iniciais, tempoRelativo, truncar } from "@/lib/crc/dominio/formatar";
import { ROTULO_INTENCAO, ROTULO_TEMPERATURA } from "@/lib/crc/dominio/rotulos";
import { telefoneParaTela } from "@/lib/crc/dominio/telefone";

import { Aviso, BarraDeRecado, Botao, Etiqueta, ListaEsqueleto, Vazio, useAcao } from "./base";
import "./crc-operational.css";
import "./crc-omnichannel.css";

/* -------------------------------------------------------------------------- */
/* O canal na tela — §22                                                      */
/* -------------------------------------------------------------------------- */

const ICONE_DO_CANAL: Readonly<Record<CanalConversa, typeof Phone>> = {
  whatsapp: MessageCircle,
  instagram: Instagram,
  messenger: Facebook,
};

/**
 * O selo que diz de onde a conversa veio.
 *
 * ============================================================================
 *  ÍCONE + TEXTO + `aria-label`, e NÃO cor — §22, segunda frase.
 *
 *  O §22 sugere emoji colorido e, na linha seguinte, proíbe depender de cor. A
 *  segunda frase venceu, e o motivo está inteiro no cabeçalho de
 *  `crc-omnichannel.css`: a paleta do CRC é fechada em cinco semânticas, e o
 *  azul já significa "informativo".
 *
 *  O `aria-label` carrega a frase COMPLETA — "conversa por direct do
 *  Instagram" — e não só o nome. Lido em sequência depois do nome do paciente,
 *  "Instagram" sozinho soa como parte do nome dele.
 * ============================================================================
 */
function SeloDeCanal({ canal }: { canal: string }) {
  const chave = canalDaLinha(canal);
  const rotulo = rotuloDoCanal(canal);
  const Icone = ICONE_DO_CANAL[chave];

  return (
    <span className="crc-canal-selo" data-canal={chave} aria-label={rotulo.acessivel}>
      <Icone aria-hidden="true" />
      <span>{rotulo.nome}</span>
    </span>
  );
}

/**
 * O painel de vínculo — §25.
 *
 * ============================================================================
 *  A AÇÃO "VINCULAR A PACIENTE EXISTENTE" MORA NA INBOX, e não na ficha.
 *
 *  O §25 pede a ação "na ficha, com busca". A ficha é o lugar natural para a
 *  administração da identidade — e é o lugar ERRADO para o momento em que a
 *  decisão acontece.
 *
 *  O momento é este: alguém mandou direct, a recepção está lendo a conversa, e
 *  percebe que é a Ana que veio na semana passada. Mandá-la abrir outra tela,
 *  achar a Ana e voltar significa, na prática, que o vínculo não é feito — e a
 *  conversa fica órfã para sempre.
 *
 *  A ficha continua tendo o desvínculo e a lista de canais (§24); o VÍNCULO
 *  acontece onde a informação aparece.
 * ============================================================================
 *
 * ============================================================================
 *  E ELE NÃO SUGERE NINGUÉM. A busca é digitada.
 *
 *  Um "provavelmente é a Ana Silva" seria sugestão por similaridade de nome —
 *  proibido pelo §10, e pela razão que `dominio/identidade.ts` explica: o
 *  estrago de um vínculo errado é irreversível, e o acerto economiza um clique.
 *
 *  Quando o telefone resolve para exatamente um paciente, o vínculo já
 *  aconteceu sozinho em `resolverConversaNoCanal` — e aí este painel nem
 *  aparece.
 * ============================================================================
 */
function PainelDeVinculo({
  conversa,
  aoVincular,
}: {
  conversa: Conversa;
  aoVincular: (patientId: string) => void;
}) {
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState<Paciente[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  const procurar = useCallback(async (): Promise<void> => {
    const t = termo.trim();
    if (t.length < 3) return;
    setBuscando(true);
    try {
      const r = await buscarPacientes({ data: { termo: t } });
      setAchados(r.ok ? r.itens : []);
    } catch {
      setAchados([]);
    } finally {
      setBuscando(false);
    }
  }, [termo]);

  const canal = rotuloDoCanal(conversa.canal);

  return (
    <div className="crc-inbox-aviso">
      <Aviso tom="alerta">
        {conversa.revisaoPendente
          ? "Este contato está cadastrado para mais de um paciente. Confirme de quem é esta conversa antes de registrar qualquer coisa na ficha."
          : `Este ${canal.nome} ainda não está ligado a nenhum paciente. Vincule para o histórico aparecer na ficha.`}
      </Aviso>

      <div className="crc-linha" style={{ gap: "var(--crc-e2)", marginTop: "var(--crc-e2)" }}>
        <label className="crc-so-leitor" htmlFor="crc-vincular-busca">
          Buscar paciente por nome, telefone ou e-mail
        </label>
        <input
          id="crc-vincular-busca"
          className="crc-campo"
          type="search"
          placeholder="Nome, telefone ou e-mail do paciente…"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void procurar();
            }
          }}
        />
        <Botao
          pequeno
          carregando={buscando}
          disabled={termo.trim().length < 3}
          onClick={() => void procurar()}
        >
          Buscar
        </Botao>
      </div>

      {achados !== null && (
        <div role="status" style={{ marginTop: "var(--crc-e2)" }}>
          {achados.length === 0 ? (
            <p className="crc-meta">
              Nenhum paciente com esse termo. Se a pessoa ainda não é paciente, ela segue como lead
              — e isso é o normal para quem chega por direct.
            </p>
          ) : (
            <ul className="crc-canais-do-paciente">
              {achados.slice(0, 6).map((p) => (
                <li key={p.id} className="crc-canal-linha">
                  <div>
                    <strong>{p.nome}</strong>
                    <small>
                      {p.telefone === null ? "sem telefone" : telefoneParaTela(p.telefone)}
                    </small>
                  </div>
                  <Botao pequeno variante="primario" onClick={() => aoVincular(p.id)}>
                    Vincular
                  </Botao>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Como esta pessoa aparece na lista — §24.
 *
 * ============================================================================
 *  UM IGSID TEM DEZESSETE DÍGITOS, e a Inbox mostrava `contato_externo` para
 *  toda conversa sem paciente vinculado.
 *
 *  Sem esta função, a lista de conversas do Instagram seria uma coluna de
 *  números de dezessete dígitos — que é literalmente o que o §24 proíbe:
 *  "nunca exibir identificadores Meta gigantes como UX principal".
 *
 *  A ORDEM É: nome do paciente → apelido do perfil → rótulo do canal. Nunca o
 *  id técnico. Ele continua acessível no detalhe/admin, que é onde alguém
 *  investigando precisa dele.
 * ============================================================================
 */
function comoChamar(conversa: Conversa, nome: string | null): string {
  if (nome !== null && nome.length > 0) return nome;

  const canal = canalDaLinha(conversa.canal);
  if (canal === "whatsapp") return telefoneParaTela(conversa.contatoExterno);

  return contatoParaTela(canal, conversa.contatoExterno, conversa.apelidoExterno);
}

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

  /**
   * Os canais marcados. VAZIO = todos — §22.
   *
   * ==========================================================================
   *  O FILTRO É MÚLTIPLO, e não um seletor de um canal.
   *
   *  "Todos" e "só o Instagram" são os dois usos óbvios. O terceiro é o que
   *  justifica a multiplicidade: numa clínica com muito volume de WhatsApp, a
   *  recepção da tarde quer ver "Instagram + Messenger" — o que chegou pelo
   *  social, que é menos e responde diferente — sem perder de vista que a
   *  Inbox é uma só.
   *
   *  VAZIO SIGNIFICA TODOS, e não nenhum. Desmarcar o último filtro volta ao
   *  estado inicial em vez de mostrar uma lista vazia que pareceria defeito.
   * ==========================================================================
   */
  const [canaisMarcados, setCanaisMarcados] = useState<readonly CanalConversa[]>([]);
  const [apenasRevisao, setApenasRevisao] = useState(false);
  const [donos, setDonos] = useState<readonly string[]>([]);

  const acao = useAcao();
  const fimDaLista = useRef<HTMLDivElement>(null);

  /*
   * A CHAVE DE DEPENDÊNCIA É UMA STRING, e não o array.
   *
   * `useCallback` compara dependências por identidade, e um array novo a cada
   * render — que é o que `setCanaisMarcados([...])` produz — recriaria
   * `recarregar` sempre, e o `useEffect` que depende dela faria uma requisição
   * por render. A string só muda quando a SELEÇÃO muda.
   */
  const chaveDosCanais = canaisMarcados.join(",");
  const chaveDosDonos = donos.join(",");

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarInbox({
        data: {
          apenasNaoLidas,
          apenasRevisao,
          canais: chaveDosCanais.length > 0 ? chaveDosCanais.split(",") : [],
          donos: chaveDosDonos.length > 0 ? chaveDosDonos.split(",") : [],
        },
      });
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
  }, [apenasNaoLidas, apenasRevisao, chaveDosCanais, chaveDosDonos]);

  const alternarCanal = useCallback((canal: CanalConversa): void => {
    setCanaisMarcados((atuais) =>
      atuais.includes(canal) ? atuais.filter((c) => c !== canal) : [...atuais, canal],
    );
  }, []);

  const alternarDono = useCallback((dono: string): void => {
    setDonos((atuais) =>
      atuais.includes(dono) ? atuais.filter((d) => d !== dono) : [...atuais, dono],
    );
  }, []);

  /**
   * Liga o perfil ao paciente — §25.
   *
   * RECARREGA A LISTA INTEIRA depois, pelo mesmo motivo de `trocarDono`: o
   * vínculo muda o nome mostrado, a ficha alcançável e as mensagens já
   * recebidas. Remendar o estado local deixaria a tela concordando consigo
   * mesma e discordando do banco.
   */
  const vincular = useCallback(
    async (patientId: string): Promise<void> => {
      if (selecionada === null) return;

      await acao.executar(
        () =>
          vincularPerfilDaMeta({
            data: {
              conversationId: selecionada.id,
              patientId,
              motivo: "Confirmado por quem atendeu, na Inbox.",
            },
          }) as Promise<{ ok: true } | Falha>,
        undefined,
        "Perfil vinculado ao paciente. O histórico passa a aparecer na ficha.",
      );

      await recarregar();

      // A conversa aberta precisa refletir o vínculo — senão o painel continua
      // pedindo para vincular algo que já foi vinculado.
      const atualizada = await abrirConversa({ data: { conversationId: selecionada.id } });
      if (atualizada.ok) setMensagens(atualizada.mensagens);
      setSelecionada((atual) =>
        atual === null ? null : { ...atual, patientId, revisaoPendente: false },
      );
    },
    [acao, recarregar, selecionada],
  );

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
      /*
       * A BUSCA INCLUI O CONTATO CRU, e não só o formatado — e aí está a
       * diferença que faz a busca servir no Instagram.
       *
       * `telefoneParaTela` de um IGSID devolve o número cru; buscar por
       * `@joao_ig` não acharia nada se só o número estivesse no índice. Com o
       * apelido e o rótulo do canal na mesma string, quem atende encontra por
       * "@joao", por "instagram", ou pelo trecho da mensagem.
       */
      const apelido = c.apelidoExterno ?? "";
      const canal = rotuloDoCanal(c.canal).nome;
      const contato = `${c.contatoExterno} ${telefoneParaTela(c.contatoExterno)}`;
      const trecho = c.ultimaMensagemTrecho ?? "";

      return `${nome} ${apelido} ${canal} ${contato} ${trecho}`
        .toLocaleLowerCase("pt-BR")
        .includes(termo);
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

          {/*
            OS FILTROS DE CANAL E DE DONO — §22.

            `role="group"` com `aria-label` é o que faz um leitor de tela
            anunciar "grupo Filtrar por canal" antes dos botões, em vez de ler
            sete botões soltos no meio da lista. Cada botão carrega
            `aria-pressed`, que é o estado — e não a cor.
          */}
          <div className="crc-canal-filtros" role="group" aria-label="Filtrar por canal">
            {CANAIS_DE_CONVERSA.map((canal) => {
              const rotulo = rotuloDoCanal(canal);
              const Icone = ICONE_DO_CANAL[canal];
              const ligado = canaisMarcados.includes(canal);

              return (
                <button
                  key={canal}
                  type="button"
                  className="crc-canal-filtro"
                  aria-pressed={ligado}
                  onClick={() => alternarCanal(canal)}
                >
                  <Icone aria-hidden="true" />
                  {rotulo.nome}
                </button>
              );
            })}
          </div>

          <div
            className="crc-canal-filtros"
            role="group"
            aria-label="Filtrar por quem responde e por revisão"
          >
            <button
              type="button"
              className="crc-canal-filtro"
              aria-pressed={donos.includes("ia")}
              onClick={() => alternarDono("ia")}
            >
              <Bot aria-hidden="true" />
              IA assumiu
            </button>
            <button
              type="button"
              className="crc-canal-filtro"
              aria-pressed={donos.includes("humano")}
              onClick={() => alternarDono("humano")}
            >
              <UserRound aria-hidden="true" />
              Humano assumiu
            </button>
            <button
              type="button"
              className="crc-canal-filtro"
              aria-pressed={apenasRevisao}
              onClick={() => setApenasRevisao((v) => !v)}
            >
              Revisão de identidade
            </button>
          </div>

          {/* ============================================================
               A FILA É UM `listbox`, E O `<li>` DENTRO DELE É `presentation`.

               `role="listbox"` exige `option` como filho DIRETO. Com o `li`
               no caminho, o axe-core reprova quatro vezes por uma causa só:

                 aria-required-children  o `li` não é `option`
                 aria-required-parent    o `option` não alcança o listbox
                 listitem                o `li` está num `ul` que virou listbox
                 aria-input-field-name   o listbox estava sem nome

               `presentation` tira o `li` da árvore de acessibilidade e deixa o
               botão como filho direto — sem mexer no HTML nem no CSS, que
               continuam precisando do `li`.

               Para quem usa leitor de tela a diferença não é acadêmica: um
               listbox malformado é lido como texto solto, e a fila deixa de
               ser navegável por seta.

               Encontrado por `e2e/acessibilidade.spec.ts` depois que a
               varredura passou a esperar a tela ASSENTAR — antes ela media a
               tela antes de a lista existir, e não via nada disto.
             ============================================================ */}
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
                      : "As conversas aparecem quando alguém escreve pelo WhatsApp, pelo direct do Instagram ou pelo Messenger — e também quando uma automação inicia o contato."
                }
              />
            ) : (
              <ul className="crc-inbox-lista-itens" role="listbox" aria-label="Conversas na fila">
                {conversasFiltradas.map((c) => (
                  <li key={c.id} role="presentation">
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
                      comoChamar(
                        selecionada,
                        selecionada.patientId === null
                          ? null
                          : (nomes[selecionada.patientId] ?? null),
                      ),
                    )}
                  </span>
                  <div>
                    <h2 className="crc-titulo-cartao crc-truncar">
                      {comoChamar(
                        selecionada,
                        selecionada.patientId === null
                          ? null
                          : (nomes[selecionada.patientId] ?? null),
                      )}
                    </h2>
                    <p className="crc-meta crc-linha" style={{ gap: "var(--crc-e2)" }}>
                      <SeloDeCanal canal={selecionada.canal} />
                      {/*
                        NO CABEÇALHO O CONTATO APARECE, inclusive o do
                        Instagram — e aqui isso é correto.

                        O §24 proíbe o id gigante como UX PRINCIPAL. Neste
                        ponto a pessoa já está DENTRO da conversa, com o nome no
                        título; o identificador aqui é o detalhe que ela precisa
                        quando vai procurar o perfil no aplicativo ou abrir um
                        chamado.
                      */}
                      {canalDaLinha(selecionada.canal) === "whatsapp"
                        ? telefoneParaTela(selecionada.contatoExterno)
                        : contatoParaTela(
                            selecionada.canal,
                            selecionada.contatoExterno,
                            selecionada.apelidoExterno,
                          )}
                    </p>
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
                {/*
                  O PAINEL APARECE EM DOIS CASOS, e não só na ambiguidade — §25.

                  `revisaoPendente` é a ambiguidade: o contato casou com mais de
                  um paciente, e o sistema recusou escolher.

                  O segundo caso é mais comum e não é problema nenhum: uma
                  conversa de Instagram SEM paciente vinculado. Quem chega por
                  direct quase nunca tem ficha — é prospect, e é normal. O
                  painel é o que permite ligar as duas coisas no instante em que
                  quem atende descobre quem é.

                  Só para Instagram e Messenger: no WhatsApp o vínculo é por
                  telefone e tem caminho próprio (`vincularConversaAoPaciente`).
                */}
                {(selecionada.revisaoPendente ||
                  (selecionada.patientId === null &&
                    canalDaLinha(selecionada.canal) !== "whatsapp")) && (
                  <PainelDeVinculo conversa={selecionada} aoVincular={(id) => void vincular(id)} />
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
                  icone={
                    canalDaLinha(selecionada.canal) === "whatsapp"
                      ? Phone
                      : ICONE_DO_CANAL[canalDaLinha(selecionada.canal)]
                  }
                  // O RÓTULO SEGUE O CANAL. "Telefone" numa conversa de
                  // Instagram é uma etiqueta errada em cima de um dado que não
                  // é telefone — e alguém copiaria o IGSID para discar.
                  rotulo={
                    canalDaLinha(selecionada.canal) === "whatsapp"
                      ? "Telefone"
                      : `Perfil no ${rotuloDoCanal(selecionada.canal).nome}`
                  }
                  valor={
                    canalDaLinha(selecionada.canal) === "whatsapp"
                      ? telefoneParaTela(selecionada.contatoExterno)
                      : contatoParaTela(
                          selecionada.canal,
                          selecionada.contatoExterno,
                          selecionada.apelidoExterno,
                        )
                  }
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
  // §24: NUNCA o id técnico como título. Ver `comoChamar`.
  const titulo = comoChamar(conversa, nome);
  const canal = canalDaLinha(conversa.canal);

  /*
   * ==========================================================================
   *  O CONTATO APARECE QUANDO O TÍTULO É O NOME.
   *
   *  Uma conversa é única por (organização, canal, contato). Uma pessoa com dois
   *  celulares tem, corretamente, duas conversas — e a lista mostrava as duas
   *  com o mesmo nome, a mesma inicial e o mesmo horário relativo. Na base atual
   *  isso dá três "Maria Aparecida de Souza Nascimento Filha" idênticas, e mais
   *  dezessete pacientes repetidos.
   *
   *  Não é bug de agrupamento: são conversas distintas. O defeito é a lista não
   *  dizer o que as separa. Com o número embaixo, três linhas iguais viram três
   *  linhas diferentes — e quem atende sabe qual abrir.
   *
   *  Quando o título JÁ É o telefone (paciente desconhecido), repetir embaixo
   *  seria ruído.
   * ==========================================================================
   */
  /*
   * NO INSTAGRAM O SEGUNDO NÍVEL É O APELIDO, e não o contato.
   *
   * ==========================================================================
   *  O raciocínio acima vale para telefone: a pessoa com dois celulares tem
   *  duas conversas, e o número embaixo é o que as separa.
   *
   *  No Instagram, o que separa é o PERFIL — e o identificador dele tem
   *  dezessete dígitos. Mostrá-lo embaixo do nome devolveria exatamente a UX
   *  que o §24 proíbe, e não separaria nada: quem tem dois perfis do Instagram
   *  vinculados ao mesmo paciente é caso raríssimo, e `@usuario` já distingue.
   * ==========================================================================
   */
  const contato =
    nome === null
      ? null
      : canal === "whatsapp"
        ? telefoneParaTela(conversa.contatoExterno)
        : (conversa.apelidoExterno ?? "").length > 0
          ? `@${(conversa.apelidoExterno ?? "").replace(/^@/u, "")}`
          : null;

  /*
   * "SEM MENSAGENS" SÓ QUANDO NÃO HÁ MENSAGEM NENHUMA.
   *
   *  A linha dizia "Sem mensagens" sempre que o trecho estava vazio — inclusive
   *  em conversa COM data de última mensagem, que é contradição na mesma linha:
   *  "anteontem · Sem mensagens". O trecho é preenchido pelos caminhos de
   *  entrada e de envio; conversa semeada por fora não passa por nenhum dos
   *  dois, e aí o que falta é a PRÉVIA, não a mensagem.
   */
  const semMensagemNenhuma = conversa.ultimaMensagemEm === null;

  return (
    <div className="crc-inbox-item-grid">
      <span className="crc-inbox-item-avatar" aria-hidden="true">
        {iniciais(titulo)}
      </span>
      <div className="crc-inbox-item-copy">
        <div className="crc-inbox-item-titulo">
          <strong className="crc-truncar">{titulo}</strong>
          {/*
            O SELO FICA ANTES DO HORÁRIO, e sempre visível — §22.

            Ele é o que responde "de onde veio isto?" antes de a pessoa abrir a
            conversa. E é o que impede o erro que a Inbox unificada torna
            possível: responder no Instagram achando que é WhatsApp, onde fora
            das 24 horas a mensagem simplesmente não sai.
          */}
          <SeloDeCanal canal={conversa.canal} />
          {conversa.ultimaMensagemEm !== null && (
            <span>{tempoRelativo(conversa.ultimaMensagemEm)}</span>
          )}
        </div>
        {contato !== null && <p className="crc-inbox-item-contato">{contato}</p>}
        <p className="crc-truncar">
          {conversa.ultimaMensagemTrecho !== null
            ? truncar(conversa.ultimaMensagemTrecho, 72)
            : semMensagemNenhuma
              ? "Sem mensagens"
              : "Abra para ler a conversa"}
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
