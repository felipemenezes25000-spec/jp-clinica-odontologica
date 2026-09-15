/**
 * O cartão da Meta em Integrações — §31, §39, §74.
 *
 * ============================================================================
 *  ESTA TELA NÃO DIZ "CONECTADO" PORQUE EXISTE CREDENCIAL — §74.
 *
 *  Todo estado vem de `lerSaudeDaMeta`, que só sai de fato datado: último
 *  webhook, última mensagem, último lead, último erro, fila, dead letter. Uma
 *  conta recém-conectada aparece como ATENÇÃO, com a frase "cadastrada e
 *  nenhum webhook chegou ainda" — porque a causa mais comum de silêncio é a
 *  subscrição do webhook ter ficado sem o campo certo, e isso não dá erro
 *  nenhum.
 * ============================================================================
 *
 * ============================================================================
 *  E ELA NUNCA MOSTRA TOKEN — §32.
 *
 *  `carregarMeta` devolve `CanalMetaParaTela`, que tem `dica` (começo e fim) e
 *  não tem `token`. Não é disciplina de quem escreveu esta tela: são dois tipos
 *  diferentes no servidor, e passar um pelo outro não compila.
 *
 *  O campo de token é de ESCRITA e nasce vazio a cada abertura. Vazio num
 *  update significa "não mexi no token" — ver `PedidoDeConexao.token`.
 * ============================================================================
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Facebook,
  Instagram,
  Megaphone,
  MessageCircle,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import {
  carregarMeta,
  conectarMeta,
  desativarMeta,
  reconciliarLeadsDaMeta,
  removerRegraDeComentario,
  salvarRegraDeComentario,
  sincronizarConversasDaMeta,
  testarMeta,
  type EstadoDaMetaDto,
} from "@/lib/crc/api";

import {
  Aviso,
  BarraDeRecado,
  Botao,
  Campo,
  Entrada,
  Etiqueta,
  ListaEsqueleto,
  Modal,
  useAcao,
} from "./base";
import "./crc-omnichannel.css";

const ICONE_DO_PRODUTO: Readonly<Record<string, typeof Plug>> = {
  instagram: Instagram,
  messenger: Facebook,
  comentarios: MessageCircle,
  lead_ads: Megaphone,
};

const ROTULO_DO_PRODUTO: Readonly<Record<string, string>> = {
  instagram: "Instagram Direct",
  messenger: "Messenger",
  comentarios: "Comentários",
  lead_ads: "Lead Ads",
};

const PRODUTOS = ["instagram", "messenger", "comentarios", "lead_ads"] as const;

/* -------------------------------------------------------------------------- */
/* As regras de comentário — §66                                              */
/* -------------------------------------------------------------------------- */

/**
 * O formulário de uma regra, em texto.
 *
 * ============================================================================
 *  AS LISTAS SÃO CAMPOS DE TEXTO SEPARADOS POR VÍRGULA, e não um editor de
 *  etiquetas.
 *
 *  Um editor de etiquetas é mais bonito e some com o problema real: quem
 *  escreve uma regra precisa VER as dez palavras juntas para perceber que
 *  "implante" e "implantes" estão as duas ali, e que falta "quanto custa". Uma
 *  lista de chips com scroll horizontal esconde isso.
 *
 *  A conversão texto ↔ lista é `dividir`/`juntar`, e ela remove vazios — quem
 *  digita "a, b," não está pedindo uma palavra vazia.
 * ============================================================================
 */
type FormularioDeRegra = {
  id: string | null;
  nome: string;
  contem: string;
  naoContem: string;
  midias: string;
  exigirCaptacao: boolean;
  criarLead: boolean;
  criarOportunidade: boolean;
  enviarPrivateReply: boolean;
  copy: string;
  cooldownHoras: string;
  ativa: boolean;
};

/** A regra nova nasce DESLIGADA e sem resposta privada — §4.5, §79. */
const REGRA_EM_BRANCO: FormularioDeRegra = {
  id: null,
  nome: "",
  contem: "",
  naoContem: "",
  midias: "",
  exigirCaptacao: true,
  criarLead: true,
  criarOportunidade: true,
  enviarPrivateReply: false,
  copy: "",
  cooldownHoras: "168",
  ativa: false,
};

function dividir(texto: string): string[] {
  return texto
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function juntar(lista: readonly string[]): string {
  return lista.join(", ");
}

export function MetaIntegracao({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [estado, setEstado] = useState<EstadoDaMetaDto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [conectando, setConectando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const acao = useAcao();

  /**
   * A unidade do canal — §33.
   *
   * ==========================================================================
   *  COM UMA UNIDADE A TELA NÃO PERGUNTA; COM DUAS, ELA PERGUNTA.
   *
   *  Uma conta da Meta pertence a UMA unidade: é isso que o roteamento de
   *  entrada usa para saber de quem é a mensagem que chega. Escolher por
   *  código — `unidades[0]` — acertaria numa instalação com uma clínica e
   *  escolheria arbitrariamente numa rede, que é o defeito de origem que o
   *  `supabase/23` existiu para matar.
   * ==========================================================================
   */
  const [unidade, setUnidade] = useState<string | null>(null);

  const [form, setForm] = useState({
    pageId: "",
    instagramAccountId: "",
    displayName: "",
    username: "",
    token: "",
    appSecret: "",
    verifyToken: "",
    humanAgentAprovado: false,
    produtos: ["instagram", "messenger", "comentarios", "lead_ads"] as string[],
  });

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarMeta();
      if (r.ok) {
        setEstado(r.estado);
        setErro(null);
      } else setErro(r.message);
    } catch {
      setErro("Não conseguimos carregar o estado da Meta.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const salvar = useCallback(async (): Promise<void> => {
    if (unidade === null) return;

    await acao.executar(
      () =>
        conectarMeta({
          data: {
            canalId: editando,
            clinicId: unidade,
            pageId: form.pageId,
            instagramAccountId: form.instagramAccountId,
            displayName: form.displayName,
            username: form.username,
            produtos: form.produtos,
            token: form.token,
            appSecret: form.appSecret,
            verifyToken: form.verifyToken,
            humanAgentAprovado: form.humanAgentAprovado,
            /*
             * A VALIDADE DO TOKEN NÃO É PEDIDA NO FORMULÁRIO, e vai como nula.
             *
             * ==================================================================
             *  Pedir "quando vence?" para quem cola um token é pedir uma
             *  informação que a pessoa não tem — e o que ela digitaria seria um
             *  palpite. Um palpite errado é pior que `null`: a tela diria
             *  "válido por 60 dias" sobre um token que venceu ontem.
             *
             *  `null` faz a tela dizer "a Meta não informou", que é a verdade.
             *  Quem souber a data pode gravá-la depois; o alarme real é o
             *  (#190) chegando, e ele é tratado em `erros.ts`.
             * ==================================================================
             */
            tokenExpiraEm: null,
            /*
             * AS PERMISSÕES VÃO DO CATÁLOGO, e não de digitação.
             *
             * Elas são as do produto escolhido, conferidas na documentação
             * oficial (`EXIGENCIAS` em `integracoes/meta/config.ts`). Deixar
             * alguém digitar o nome da permissão é deixar alguém digitar
             * `instagram_manage_messages` — o nome ANTIGO, descontinuado em
             * 27/01/2025 — e a tela afirmaria uma permissão que não existe.
             */
            permissoes: (estado?.exigencias ?? [])
              .filter((e) => form.produtos.includes(e.produto))
              .flatMap((e) => [...e.permissoes]),
          },
        }),
      () => {
        setConectando(false);
        setEditando(null);
        setForm((f) => ({ ...f, token: "", appSecret: "", verifyToken: "" }));
      },
      "Conta da Meta conectada.",
    );

    await recarregar();
  }, [acao, editando, estado, form, recarregar, unidade]);

  /* ---------------------------------------------------------------------- */
  /* As regras de comentário — §66                                          */
  /* ---------------------------------------------------------------------- */

  const [regra, setRegra] = useState<FormularioDeRegra | null>(null);

  const salvarRegra = useCallback(async (): Promise<void> => {
    if (regra === null) return;

    /*
     * O COOLDOWN VAI COMO NÚMERO, e um campo vazio vale o padrão de 7 dias.
     *
     * `Number("")` é zero, e zero com resposta privada ligada é um direct por
     * comentário. O servidor avisa nesse caso (ver `salvarRegraSocial`), mas
     * deixar o vazio VIRAR zero seria produzir a configuração perigosa a partir
     * de um campo que a pessoa só não preencheu.
     */
    const bruto = regra.cooldownHoras.trim();
    const cooldown = bruto.length === 0 ? 168 : Number(bruto);

    await acao.executar(
      () =>
        salvarRegraDeComentario({
          data: {
            id: regra.id,
            nome: regra.nome,
            // A REGRA É DA ORGANIZAÇÃO. Uma regra por unidade só faz sentido
            // quando cada unidade tem o próprio Instagram — e aí ela nasce da
            // conta, não deste formulário.
            clinicId: null,
            canal: "instagram",
            evento: "comment.created",
            contem: dividir(regra.contem),
            naoContem: dividir(regra.naoContem),
            exigirCaptacao: regra.exigirCaptacao,
            midias: dividir(regra.midias),
            criarLead: regra.criarLead,
            criarOportunidade: regra.criarOportunidade,
            enviarPrivateReply: regra.enviarPrivateReply,
            intencao: regra.criarLead ? "INTERESSE" : null,
            copy: regra.copy.trim().length === 0 ? null : regra.copy.trim(),
            cooldownHoras: Number.isFinite(cooldown) ? cooldown : 168,
            ativa: regra.ativa,
          },
        }),
      (r) => {
        setRegra(null);

        /*
         * O AVISO DO SERVIDOR NÃO É DESCARTADO — e vence a mensagem de sucesso.
         *
         * ====================================================================
         *  `salvarRegraSocial` grava a regra como a pessoa pediu e devolve um
         *  aviso quando a combinação é perigosa: resposta privada com cooldown
         *  zero manda um direct por comentário, e dez comentários da mesma
         *  pessoa viram dez directs.
         *
         *  Mostrar "Regra salva." e engolir o aviso faria o cuidado do servidor
         *  não chegar a ninguém. Por isso não há `mensagemSucesso` aqui: quem
         *  decide o texto é o resultado.
         * ====================================================================
         */
        if (r.aviso !== null) acao.avisar(r.aviso, "perigo");
        else acao.avisar("Regra salva.");
      },
    );

    await recarregar();
  }, [acao, recarregar, regra]);

  const removerRegra = useCallback(
    async (id: string): Promise<void> => {
      await acao.executar(
        () => removerRegraDeComentario({ data: { id } }),
        undefined,
        "Regra removida.",
      );
      await recarregar();
    },
    [acao, recarregar],
  );

  if (erro !== null && estado === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (estado === null) return <ListaEsqueleto linhas={4} />;

  const s = estado.saude;
  const Icone =
    s.estado === "CONECTADO"
      ? CheckCircle2
      : s.estado === "ERRO"
        ? ShieldAlert
        : s.estado === "ATENCAO"
          ? AlertTriangle
          : CircleDashed;

  return (
    <section className="crc-painel" aria-label="Integração com a Meta">
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      <div className="crc-inbox-lista-topo">
        <div>
          <div className="crc-sobretitulo">Instagram · Messenger · Lead Ads</div>
          <h2 className="crc-titulo-cartao">Meta</h2>
        </div>
        <Etiqueta
          tom={
            s.estado === "CONECTADO"
              ? "positiva"
              : s.estado === "ERRO"
                ? "perigo"
                : s.estado === "ATENCAO"
                  ? "alerta"
                  : "neutra"
          }
        >
          <Icone size={12} aria-hidden="true" />{" "}
          {s.estado === "NAO_CONFIGURADO" ? "não configurado" : s.estado.toLowerCase()}
        </Etiqueta>
      </div>

      <div className="crc-painel-corpo">
        {/* O DETALHE VEM SEMPRE, e nunca só o nome do estado — §39. */}
        <p>{s.detalhe}</p>

        {estado.sandbox && (
          <Aviso tom="alerta">
            Este servidor está rodando com o <strong>sandbox da Meta</strong>. Nada é enviado de
            verdade: as mensagens são registradas em memória para os testes. Em produção o sandbox é
            desligado por construção.
          </Aviso>
        )}

        {estado.graph.ambienteInvalido && (
          <Aviso tom="alerta">
            A variável <code>META_GRAPH_VERSION</code> tem um valor que não parece uma versão
            (esperado <code>vNN.N</code>). O CRC está usando <code>{estado.graph.conferida}</code>,
            que é a versão conferida na documentação oficial.
          </Aviso>
        )}

        {s.exigeReconexao && (
          <Aviso tom="perigo">
            O token de uma das contas venceu ou foi revogado. Nenhuma mensagem sai e nenhum lead é
            buscado até alguém <strong>reconectar</strong> — retentativa não resolve.
          </Aviso>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Os sinais medidos — §39                                          */}
        {/* ---------------------------------------------------------------- */}

        {s.sinais.length > 0 && (
          <div className="crc-meta-sinais">
            {s.sinais.map((sinal) => (
              <div
                key={sinal.chave}
                className="crc-meta-sinal"
                data-alerta={sinal.alerta ? "sim" : "nao"}
              >
                <small>{sinal.rotulo}</small>
                <strong>{sinal.valor}</strong>
              </div>
            ))}
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* As contas cadastradas                                            */}
        {/* ---------------------------------------------------------------- */}

        <div style={{ marginTop: "var(--crc-e5)" }}>
          <p className="crc-rotulo">Contas conectadas</p>

          {estado.canais.length === 0 ? (
            <p className="crc-meta">
              Nenhuma conta conectada. Instagram, Messenger, comentários e Lead Ads não entram no
              CRC até aqui ter uma linha.
            </p>
          ) : (
            <div className="crc-pilha" style={{ gap: "var(--crc-e2)" }}>
              {estado.canais.map((c) => (
                <div key={c.id} className="crc-meta-canal">
                  <div className="crc-meta-canal-copy">
                    <strong>
                      {c.displayName.length > 0 ? c.displayName : "Conta sem nome"}
                      {c.username.length > 0 && ` · @${c.username}`}
                    </strong>
                    <code>
                      {c.pageId !== null && `Página ${c.pageId}`}
                      {c.pageId !== null && c.instagramAccountId !== null && " · "}
                      {c.instagramAccountId !== null && `Instagram ${c.instagramAccountId}`}
                    </code>
                    <div className="crc-meta-produtos" style={{ marginTop: "4px" }}>
                      {c.produtos.map((p) => {
                        const IconeP = ICONE_DO_PRODUTO[p] ?? Plug;
                        return (
                          <Etiqueta key={p} tom="neutra">
                            <IconeP size={11} aria-hidden="true" /> {ROTULO_DO_PRODUTO[p] ?? p}
                          </Etiqueta>
                        );
                      })}
                      {!c.ativo && <Etiqueta tom="alerta">desativada</Etiqueta>}
                    </div>
                    <small className="crc-meta">
                      {/*
                        A DICA, E NUNCA O TOKEN — §32. Oito caracteres de um
                        token de duzentos não o reconstroem, e servem para
                        alguém conferir visualmente que colou o certo.
                      */}
                      {c.temToken ? `token ${c.dica}` : "sem token de envio — só recebe"}
                      {c.permissoes.length > 0 &&
                        ` · ${String(c.permissoes.length)} permissão(ões) confirmada(s)`}
                    </small>
                    {c.ultimoErro !== null && (
                      <small className="crc-meta" style={{ color: "var(--crc-perigo)" }}>
                        último erro: {c.ultimoErro}
                      </small>
                    )}
                  </div>

                  {podeGerenciar && (
                    <div className="crc-linha" style={{ gap: "4px", flexWrap: "wrap" }}>
                      <Botao
                        pequeno
                        onClick={() =>
                          void acao.executar(
                            () => testarMeta({ data: { canalId: c.id } }),
                            undefined,
                            "Conexão conferida.",
                          )
                        }
                      >
                        Testar
                      </Botao>

                      {c.produtos.includes("lead_ads") && (
                        <Botao
                          pequeno
                          onClick={() =>
                            void acao.executar(
                              () =>
                                reconciliarLeadsDaMeta({
                                  data: { clinicId: c.clinicId },
                                }) as Promise<
                                  { ok: true } | { ok: false; code: string; message: string }
                                >,
                              undefined,
                              "Reconciliação concluída — veja o resultado em Saúde.",
                            )
                          }
                        >
                          <RefreshCw size={13} aria-hidden="true" /> Reconciliar leads
                        </Botao>
                      )}

                      {c.produtos.includes("instagram") && (
                        <Botao
                          pequeno
                          onClick={() =>
                            void acao.executar(
                              () =>
                                sincronizarConversasDaMeta({
                                  data: { clinicId: c.clinicId, canal: "instagram" },
                                }) as Promise<
                                  { ok: true } | { ok: false; code: string; message: string }
                                >,
                              undefined,
                              "Histórico importado. Nenhuma automação foi disparada sobre ele.",
                            )
                          }
                        >
                          Sincronizar conversas
                        </Botao>
                      )}

                      <Botao
                        pequeno
                        variante="discreto"
                        onClick={() => {
                          setEditando(c.id);
                          setUnidade(c.clinicId);
                          setConectando(true);
                          setForm({
                            pageId: c.pageId ?? "",
                            instagramAccountId: c.instagramAccountId ?? "",
                            displayName: c.displayName,
                            username: c.username,
                            // OS SEGREDOS NASCEM VAZIOS. Ver o cabeçalho: vazio
                            // significa "não mexi", e não "apague".
                            token: "",
                            appSecret: "",
                            verifyToken: "",
                            humanAgentAprovado: false,
                            produtos: [...c.produtos],
                          });
                        }}
                      >
                        Editar
                      </Botao>

                      {c.ativo && (
                        <Botao
                          pequeno
                          variante="discreto"
                          onClick={() =>
                            void acao
                              .executar(
                                () => desativarMeta({ data: { canalId: c.id } }),
                                undefined,
                                "Conta desativada. Ela para de receber e de enviar na hora.",
                              )
                              .then(() => recarregar())
                          }
                        >
                          Desativar
                        </Botao>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {podeGerenciar && (
            <div style={{ marginTop: "var(--crc-e3)" }}>
              <Botao
                variante="primario"
                disabled={estado.unidades.length === 0}
                onClick={() => {
                  setEditando(null);
                  // UMA UNIDADE JÁ VEM ESCOLHIDA. Perguntar quando não há
                  // escolha é atrito sem informação.
                  setUnidade(
                    estado.unidades.length === 1 ? (estado.unidades[0]?.id ?? null) : null,
                  );
                  setConectando(true);
                }}
              >
                <Plug size={14} aria-hidden="true" /> Conectar conta da Meta
              </Botao>
              {estado.unidades.length === 0 && (
                <p className="crc-meta">
                  Seu acesso não inclui nenhuma unidade ativa. Uma conta da Meta pertence a UMA
                  unidade — é isso que diz de quem é cada mensagem que chega.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* A URL do webhook e os campos a assinar — §39                     */}
        {/* ---------------------------------------------------------------- */}

        <div style={{ marginTop: "var(--crc-e5)" }}>
          <p className="crc-rotulo">No painel da Meta</p>
          <p className="crc-meta">
            A URL do webhook é <code>{estado.urlDoWebhook}</code>
            <strong>&lt;id do canal&gt;</strong> — o id aparece depois de conectar. Ela é por canal
            de propósito: é o que permite conferir a assinatura com o segredo daquele app, e não com
            o de outro.
          </p>
          {estado.urlDoWebhook.startsWith("/") && (
            <Aviso tom="alerta">
              <code>CRC_URL_PUBLICA</code> não está configurada no servidor, então a URL acima está
              incompleta. A Meta precisa de um endereço público em HTTPS.
            </Aviso>
          )}

          <div className="crc-meta-sinais">
            {Object.entries(estado.camposDeWebhook).map(([produto, campos]) => (
              <div key={produto} className="crc-meta-sinal" data-alerta="nao">
                <small>{ROTULO_DO_PRODUTO[produto] ?? produto}</small>
                <strong>{campos.join(", ")}</strong>
              </div>
            ))}
          </div>
          <p className="crc-meta">
            Assinar o campo errado é o defeito mais comum desta integração, e o sintoma é péssimo:
            não há erro nenhum — o webhook simplesmente nunca chega.
          </p>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* As permissões conferidas — §4.3                                  */}
        {/* ---------------------------------------------------------------- */}

        <details style={{ marginTop: "var(--crc-e5)" }}>
          <summary className="crc-rotulo">Permissões que cada produto exige</summary>
          <div className="crc-pilha" style={{ gap: "var(--crc-e2)", marginTop: "var(--crc-e2)" }}>
            {estado.exigencias.map((e) => (
              <div key={e.produto} className="crc-meta-sinal">
                <small>{e.rotulo}</small>
                <strong>{e.permissoes.join(" · ")}</strong>
                <small className="crc-meta">
                  Se faltar: {e.seFaltar}{" "}
                  <a href={e.fonte} target="_blank" rel="noreferrer noopener">
                    documentação oficial
                  </a>
                </small>
              </div>
            ))}
          </div>
        </details>

        {/* ---------------------------------------------------------------- */}
        {/* As regras de comentário — §66                                    */}
        {/* ---------------------------------------------------------------- */}

        <div style={{ marginTop: "var(--crc-e5)" }}>
          <div className="crc-inbox-lista-topo" style={{ padding: 0 }}>
            <p className="crc-rotulo">Regras de comentário</p>
            {podeGerenciar && (
              <Botao pequeno variante="discreto" onClick={() => setRegra({ ...REGRA_EM_BRANCO })}>
                <Plus size={14} aria-hidden="true" /> Nova regra
              </Botao>
            )}
          </div>
          {estado.regras.length === 0 ? (
            <p className="crc-meta">
              Nenhuma regra cadastrada. Sem regra, comentário no Instagram fica só no post — nada
              vira lead, e nenhuma resposta privada sai.
            </p>
          ) : (
            <div className="crc-pilha" style={{ gap: "var(--crc-e2)" }}>
              {estado.regras.map((r) => (
                <div key={r.id} className="crc-meta-canal">
                  <div className="crc-meta-canal-copy">
                    <strong>{r.nome}</strong>
                    <code>
                      contém: {r.contem.join(", ") || "—"}
                      {r.naoContem.length > 0 && ` · veta: ${r.naoContem.join(", ")}`}
                    </code>
                    <div className="crc-meta-produtos" style={{ marginTop: "4px" }}>
                      <Etiqueta tom={r.ativa ? "positiva" : "neutra"}>
                        {r.ativa ? "ativa" : "desligada"}
                      </Etiqueta>
                      {r.criarLead && <Etiqueta tom="neutra">cria lead</Etiqueta>}
                      {r.criarOportunidade && <Etiqueta tom="neutra">abre oportunidade</Etiqueta>}
                      {r.enviarPrivateReply && (
                        <Etiqueta tom="alerta">
                          responde em privado · cooldown {String(r.cooldownHoras)}h
                        </Etiqueta>
                      )}
                      {r.exigirCaptacao && (
                        <Etiqueta tom="neutra">só em conteúdo de captação</Etiqueta>
                      )}
                    </div>
                  </div>

                  {podeGerenciar && (
                    <div className="crc-linha" style={{ gap: "var(--crc-e1)" }}>
                      <Botao
                        pequeno
                        variante="discreto"
                        onClick={() =>
                          setRegra({
                            id: r.id,
                            nome: r.nome,
                            contem: juntar(r.contem),
                            naoContem: juntar(r.naoContem),
                            midias: juntar(r.midias),
                            exigirCaptacao: r.exigirCaptacao,
                            criarLead: r.criarLead,
                            criarOportunidade: r.criarOportunidade,
                            enviarPrivateReply: r.enviarPrivateReply,
                            copy: r.copy ?? "",
                            cooldownHoras: String(r.cooldownHoras),
                            ativa: r.ativa,
                          })
                        }
                      >
                        <Pencil size={14} aria-hidden="true" /> Editar
                      </Botao>
                      <Botao
                        pequeno
                        variante="discreto"
                        carregando={acao.rodando}
                        onClick={() => void removerRegra(r.id)}
                      >
                        <Trash2 size={14} aria-hidden="true" /> Remover
                      </Botao>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* O formulário de conexão                                            */}
      {/* ------------------------------------------------------------------ */}

      <Modal
        aberto={conectando}
        titulo={editando === null ? "Conectar conta da Meta" : "Editar conta da Meta"}
        aoFechar={() => {
          setConectando(false);
          setEditando(null);
        }}
      >
        <div className="crc-pilha" style={{ gap: "var(--crc-e3)" }}>
          <Aviso tom="alerta">
            Os IDs e o token saem do painel da Meta (Business Suite › Configurações › WhatsApp e
            Instagram, ou o Graph API Explorer). O token é gravado <strong>cifrado</strong> e nunca
            volta para esta tela — só o começo e o fim dele, para conferência.
          </Aviso>

          {estado.unidades.length > 1 && (
            <Campo
              rotulo="Unidade desta conta"
              dica="Uma conta da Meta pertence a uma unidade. É o que diz de quem é cada mensagem."
            >
              {(id) => (
                <select
                  id={id}
                  className="crc-selecao"
                  value={unidade ?? ""}
                  onChange={(e) => setUnidade(e.target.value === "" ? null : e.target.value)}
                >
                  <option value="">Escolha a unidade…</option>
                  {estado.unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
          )}

          <Campo
            rotulo="ID da Página do Facebook"
            dica="Roteia Messenger e Lead Ads. Deixe vazio se a clínica não tem Página."
          >
            {(id) => (
              <Entrada
                id={id}
                value={form.pageId}
                onChange={(e) => setForm((f) => ({ ...f, pageId: e.target.value }))}
              />
            )}
          </Campo>
          <Campo
            rotulo="ID da conta profissional do Instagram"
            dica="Roteia direct e comentários. NÃO é o @usuário: é o número que a Meta mostra."
          >
            {(id) => (
              <Entrada
                id={id}
                value={form.instagramAccountId}
                onChange={(e) => setForm((f) => ({ ...f, instagramAccountId: e.target.value }))}
              />
            )}
          </Campo>
          <Campo rotulo="Nome da conta" dica="Só para a tela dizer de quem é o canal.">
            {(id) => (
              <Entrada
                id={id}
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              />
            )}
          </Campo>
          <Campo rotulo="@usuário do Instagram">
            {(id) => (
              <Entrada
                id={id}
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              />
            )}
          </Campo>

          <div>
            <p className="crc-rotulo">Produtos desta conta</p>
            <div className="crc-meta-produtos">
              {PRODUTOS.map((p) => {
                const IconeP = ICONE_DO_PRODUTO[p] ?? Plug;
                const ligado = form.produtos.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    className="crc-canal-filtro"
                    aria-pressed={ligado}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        produtos: ligado ? f.produtos.filter((x) => x !== p) : [...f.produtos, p],
                      }))
                    }
                  >
                    <IconeP aria-hidden="true" /> {ROTULO_DO_PRODUTO[p] ?? p}
                  </button>
                );
              })}
            </div>
          </div>

          <Campo
            rotulo="Page Access Token"
            dica={
              editando === null
                ? "Cifrado na gravação. Sem ele o canal recebe e não envia."
                : "Deixe vazio para manter o token atual."
            }
          >
            {(id) => (
              <Entrada
                id={id}
                type="password"
                autoComplete="off"
                value={form.token}
                onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
              />
            )}
          </Campo>
          <Campo
            rotulo="App Secret"
            dica="É com ele que a assinatura do webhook é conferida. Sem ele, o webhook é recusado."
          >
            {(id) => (
              <Entrada
                id={id}
                type="password"
                autoComplete="off"
                value={form.appSecret}
                onChange={(e) => setForm((f) => ({ ...f, appSecret: e.target.value }))}
              />
            )}
          </Campo>
          <Campo
            rotulo="Verify Token do webhook"
            dica="O que você digitou no painel da Meta ao salvar a URL do webhook."
          >
            {(id) => (
              <Entrada
                id={id}
                type="password"
                autoComplete="off"
                value={form.verifyToken}
                onChange={(e) => setForm((f) => ({ ...f, verifyToken: e.target.value }))}
              />
            )}
          </Campo>

          <label className="crc-funil-minhas-v2">
            <input
              type="checkbox"
              checked={form.humanAgentAprovado}
              onChange={(e) => setForm((f) => ({ ...f, humanAgentAprovado: e.target.checked }))}
            />
            <span>
              A feature <strong>Human Agent</strong> está aprovada no App Review deste app
              <br />
              <small className="crc-meta">
                Sem ela, passadas 24 horas da última mensagem da pessoa, nem a recepção consegue
                responder — a Meta recusa. Marque só se o App Review aprovou de verdade: marcar sem
                aprovação faz o envio falhar com um erro de permissão que não parece com isto.
              </small>
            </span>
          </label>

          <div className="crc-linha" style={{ gap: "var(--crc-e2)", justifyContent: "flex-end" }}>
            <Botao
              variante="discreto"
              onClick={() => {
                setConectando(false);
                setEditando(null);
              }}
            >
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              carregando={acao.rodando}
              disabled={unidade === null}
              onClick={() => void salvar()}
            >
              Salvar
            </Botao>
          </div>
        </div>
      </Modal>

      {/* ------------------------------------------------------------------ */}
      {/* O formulário de regra — §66                                        */}
      {/* ------------------------------------------------------------------ */}

      <Modal
        aberto={regra !== null}
        titulo={regra?.id === null ? "Nova regra de comentário" : "Editar regra de comentário"}
        aoFechar={() => setRegra(null)}
      >
        {regra !== null && (
          <div className="crc-pilha" style={{ gap: "var(--crc-e3)" }}>
            <Aviso tom="alerta">
              A regra decide o que acontece quando alguém comenta. Ela não interpreta sintoma e não
              sugere tratamento: o que ela faz é <strong>classificar interesse</strong> e, se você
              ligar, mandar <strong>uma</strong> resposta privada convidando a pessoa a conversar.
            </Aviso>

            <Campo
              rotulo="Nome da regra"
              dica="Só para você reconhecer na lista. Ex.: “Implante — campanha de setembro”."
            >
              {(id) => (
                <Entrada
                  id={id}
                  value={regra.nome}
                  onChange={(e) =>
                    setRegra((r) => (r === null ? r : { ...r, nome: e.target.value }))
                  }
                />
              )}
            </Campo>

            <Campo
              rotulo="Contém (separe por vírgula)"
              dica="Casa por palavra inteira: “dor” não casa “adorei”. Inclua o plural — “implante, implantes”."
            >
              {(id) => (
                <Entrada
                  id={id}
                  value={regra.contem}
                  onChange={(e) =>
                    setRegra((r) => (r === null ? r : { ...r, contem: e.target.value }))
                  }
                />
              )}
            </Campo>

            <Campo
              rotulo="NÃO contém (o veto)"
              dica="O veto que mais importa numa clínica odontológica é “capilar”: “implante capilar” não é odontologia."
            >
              {(id) => (
                <Entrada
                  id={id}
                  value={regra.naoContem}
                  onChange={(e) =>
                    setRegra((r) => (r === null ? r : { ...r, naoContem: e.target.value }))
                  }
                />
              )}
            </Campo>

            <label className="crc-funil-minhas-v2">
              <input
                type="checkbox"
                checked={regra.exigirCaptacao}
                onChange={(e) =>
                  setRegra((r) => (r === null ? r : { ...r, exigirCaptacao: e.target.checked }))
                }
              />
              <span>
                Só em conteúdo de captação
                <br />
                <small className="crc-meta">
                  Um comentário num post institucional não é um pedido de orçamento. Com isto
                  marcado, a regra só age nas mídias listadas abaixo — e{" "}
                  <strong>lista vazia não casa nada</strong>, que é o correto: uma regra que exige
                  captação sem dizer qual conteúdo é captação não tem como agir.
                </small>
              </span>
            </label>

            <Campo
              rotulo="IDs das mídias de captação"
              dica="O id do post ou reel da campanha, separado por vírgula. Fica no Business Suite, na publicação."
            >
              {(id) => (
                <Entrada
                  id={id}
                  value={regra.midias}
                  onChange={(e) =>
                    setRegra((r) => (r === null ? r : { ...r, midias: e.target.value }))
                  }
                />
              )}
            </Campo>

            <div className="crc-pilha" style={{ gap: "var(--crc-e1)" }}>
              <label className="crc-funil-minhas-v2">
                <input
                  type="checkbox"
                  checked={regra.criarLead}
                  onChange={(e) =>
                    setRegra((r) => (r === null ? r : { ...r, criarLead: e.target.checked }))
                  }
                />
                <span>Criar lead</span>
              </label>
              <label className="crc-funil-minhas-v2">
                <input
                  type="checkbox"
                  checked={regra.criarOportunidade}
                  onChange={(e) =>
                    setRegra((r) =>
                      r === null ? r : { ...r, criarOportunidade: e.target.checked },
                    )
                  }
                />
                <span>Abrir oportunidade no funil</span>
              </label>
            </div>

            <label className="crc-funil-minhas-v2">
              <input
                type="checkbox"
                checked={regra.enviarPrivateReply}
                onChange={(e) =>
                  setRegra((r) => (r === null ? r : { ...r, enviarPrivateReply: e.target.checked }))
                }
              />
              <span>
                Responder em privado
                <br />
                <small className="crc-meta">
                  A Meta permite <strong>uma</strong> mensagem por comentário, em até 7 dias. Exige
                  App Review aprovado — sem ele o envio falha com um erro de permissão que não
                  parece com isto.
                </small>
              </span>
            </label>

            <Campo
              rotulo="Texto da resposta privada"
              dica="Vazio usa o texto padrão. Convide para conversar; não prometa preço nem diagnóstico."
            >
              {(id) => (
                <Entrada
                  id={id}
                  value={regra.copy}
                  onChange={(e) =>
                    setRegra((r) => (r === null ? r : { ...r, copy: e.target.value }))
                  }
                />
              )}
            </Campo>

            <Campo
              rotulo="Cooldown, em horas"
              dica="Quanto tempo antes de a MESMA pessoa poder receber outra resposta privada. Padrão: 168 (7 dias)."
            >
              {(id) => (
                <Entrada
                  id={id}
                  type="number"
                  min={0}
                  max={8760}
                  value={regra.cooldownHoras}
                  onChange={(e) =>
                    setRegra((r) => (r === null ? r : { ...r, cooldownHoras: e.target.value }))
                  }
                />
              )}
            </Campo>

            {regra.enviarPrivateReply && regra.cooldownHoras.trim() === "0" && (
              <Aviso tom="perigo">
                Cooldown <strong>zero</strong> com resposta privada manda um direct por comentário.
                Dez comentários da mesma pessoa viram dez directs, e a Meta trata isso como spam — a
                penalidade é a conta, não a mensagem.
              </Aviso>
            )}

            <label className="crc-funil-minhas-v2">
              <input
                type="checkbox"
                checked={regra.ativa}
                onChange={(e) =>
                  setRegra((r) => (r === null ? r : { ...r, ativa: e.target.checked }))
                }
              />
              <span>
                Regra ativa
                <br />
                <small className="crc-meta">
                  Uma regra ativa precisa de pelo menos uma palavra em “Contém” — sem isso ela
                  apareceria como ativa sem casar comentário nenhum, e o servidor recusa.
                </small>
              </span>
            </label>

            <div className="crc-linha" style={{ gap: "var(--crc-e2)", justifyContent: "flex-end" }}>
              <Botao variante="discreto" onClick={() => setRegra(null)}>
                Cancelar
              </Botao>
              <Botao
                variante="primario"
                carregando={acao.rodando}
                disabled={regra.nome.trim().length === 0}
                onClick={() => void salvarRegra()}
              >
                Salvar regra
              </Botao>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
