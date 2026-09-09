/**
 * Os componentes base do CRC — item 64.
 *
 * NÃO É UMA BIBLIOTECA DE UI. É o conjunto mínimo que as telas do CRC usam,
 * escrito para que ninguém precise decidir de novo qual cinza usar numa borda.
 * O item 150 (performance budget) descartou trazer uma biblioteca pronta: o que
 * está aqui são 300 linhas contra os megabytes de uma suíte completa, e a
 * acessibilidade que importa (foco visível, `aria`, escape, foco preso no
 * modal) cabe nessas 300.
 *
 * Toda a aparência vem de `crc.css`, sob `.crc-app`. Nenhum componente aqui
 * carrega estilo inline de cor ou espaçamento — se carregasse, mudar o design
 * system exigiria caçar o valor pelo JSX, que é o que o site fez uma vez e
 * rendeu quinze tons de cinza para a mesma borda.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

/* -------------------------------------------------------------------------- */
/* Botão                                                                      */
/* -------------------------------------------------------------------------- */

export type VarianteBotao = "primario" | "secundario" | "discreto" | "perigo";

export function Botao({
  variante = "secundario",
  pequeno = false,
  carregando = false,
  children,
  className = "",
  disabled,
  ...resto
}: {
  variante?: VarianteBotao;
  pequeno?: boolean;
  /**
   * Estado de "em andamento".
   *
   * Ele desabilita o botão junto, e isso não é detalhe: sem desabilitar,
   * clicar duas vezes em "Sincronizar agora" dispara dois jobs. O texto muda
   * para o usuário saber que algo está acontecendo — o item 140 pede estado
   * persistente para ação crítica, não só um toast que some.
   */
  carregando?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`crc-botao crc-botao-${variante}${pequeno ? " crc-botao-pequeno" : ""} ${className}`}
      disabled={disabled === true || carregando}
      aria-busy={carregando}
      {...resto}
    >
      {carregando ? "Aguarde…" : children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Cartão                                                                     */
/* -------------------------------------------------------------------------- */

export function Cartao({
  titulo,
  acao,
  compacto = false,
  children,
}: {
  titulo?: string;
  acao?: ReactNode;
  compacto?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`crc-cartao${compacto ? " crc-cartao-compacto" : ""}`}>
      {titulo !== undefined && (
        <header className="crc-linha" style={{ marginBottom: "var(--crc-e4)" }}>
          <h2 className="crc-titulo-secao">{titulo}</h2>
          {acao !== undefined && <div className="crc-empurra">{acao}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* KPI                                                                        */
/* -------------------------------------------------------------------------- */

export function Kpi({
  rotulo,
  valor,
  nota,
  destaque,
}: {
  rotulo: string;
  valor: string;
  /**
   * O único KPI acionável da tela.
   *
   * "foco" é para o número que representa TRABALHO A FAZER; "calmo" é o mesmo
   * número quando ele é zero, que é boa notícia e merece ser dita em verde.
   * Usar em mais de um cartão por tela desfaz o efeito: se tudo é destaque,
   * nada é.
   */
  destaque?: "foco" | "calmo";
  /**
   * A linha de baixo.
   *
   * É aqui que mora a honestidade do item 63: um KPI de recuperação sem
   * integração financeira mostra "valor potencial" e diz isso na nota. O
   * componente não decide — quem chama decide, e a nota obriga a pensar
   * nisso.
   */
  nota?: string;
}) {
  const classe =
    destaque === undefined
      ? "crc-kpi"
      : `crc-kpi crc-kpi-${destaque === "foco" ? "foco" : "calmo"}`;

  return (
    <div className={classe}>
      <span className="crc-kpi-rotulo">{rotulo}</span>
      <span className="crc-kpi-valor">{valor}</span>
      {nota !== undefined && <span className="crc-kpi-nota">{nota}</span>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Etiqueta                                                                   */
/* -------------------------------------------------------------------------- */

export type TomEtiqueta = "neutra" | "positiva" | "alerta" | "perigo" | "info";

export function Etiqueta({ tom = "neutra", children }: { tom?: TomEtiqueta; children: ReactNode }) {
  return <span className={`crc-etiqueta crc-etiqueta-${tom}`}>{children}</span>;
}

/* -------------------------------------------------------------------------- */
/* Campos                                                                     */
/* -------------------------------------------------------------------------- */

export function Campo({
  rotulo,
  dica,
  children,
}: {
  rotulo: string;
  dica?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="crc-campo">
      <label className="crc-rotulo" htmlFor={id}>
        {rotulo}
      </label>
      {children(id)}
      {dica !== undefined && <span className="crc-meta">{dica}</span>}
    </div>
  );
}

export function Entrada({ className = "", ...resto }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`crc-entrada ${className}`} {...resto} />;
}

export function Area({ className = "", ...resto }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`crc-area ${className}`} {...resto} />;
}

/* -------------------------------------------------------------------------- */
/* Estados                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Estado vazio — item 47: cada um ENSINA.
 *
 * Por isso `explicacao` é obrigatória. Um vazio que só diz "Nenhum registro"
 * deixa a pessoa sem saber se o sistema quebrou, se o filtro está errado, ou se
 * é assim mesmo. A explicação responde essa pergunta.
 */
export function Vazio({
  titulo,
  explicacao,
  acao,
}: {
  titulo: string;
  explicacao: string;
  acao?: ReactNode;
}) {
  return (
    <div className="crc-vazio">
      <strong>{titulo}</strong>
      <p>{explicacao}</p>
      {acao !== undefined && <div style={{ marginTop: "var(--crc-e2)" }}>{acao}</div>}
    </div>
  );
}

/**
 * Esqueleto que reflete o layout real (item 153).
 *
 * `aria-hidden` porque um leitor de tela anunciando doze caixas cinzas é pior
 * do que silêncio; quem lê por áudio recebe o `aria-busy` da região.
 */
export function Esqueleto({
  altura = 16,
  largura = "100%",
}: {
  altura?: number;
  largura?: string;
}) {
  return (
    <div
      className="crc-esqueleto"
      aria-hidden="true"
      style={{ height: `${String(altura)}px`, width: largura }}
    />
  );
}

export function ListaEsqueleto({ linhas = 4 }: { linhas?: number }) {
  return (
    <div className="crc-pilha" aria-busy="true" aria-live="polite">
      <span className="crc-so-leitor">Carregando…</span>
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="crc-cartao crc-cartao-compacto">
          <Esqueleto altura={14} largura="38%" />
          <div style={{ height: "var(--crc-e2)" }} />
          <Esqueleto altura={12} largura="72%" />
        </div>
      ))}
    </div>
  );
}

/**
 * Aviso — item 48: nunca "Erro 500".
 *
 * O `detalheTecnico` fica escondido atrás de um `<details>` e só é passado
 * quando quem lê pode agir sobre ele (tela de integrações, para admin). Item
 * 48: "com detalhes técnicos separados para admin".
 */
export function Aviso({
  tom,
  children,
  detalheTecnico,
}: {
  tom: "alerta" | "perigo" | "info";
  children: ReactNode;
  detalheTecnico?: string;
}) {
  return (
    <div className={`crc-aviso crc-aviso-${tom}`} role={tom === "perigo" ? "alert" : "status"}>
      <div style={{ minWidth: 0 }}>
        <div>{children}</div>
        {detalheTecnico !== undefined && detalheTecnico.length > 0 && (
          <details style={{ marginTop: "var(--crc-e2)" }}>
            <summary className="crc-meta" style={{ cursor: "pointer" }}>
              Detalhes técnicos
            </summary>
            <code className="crc-meta" style={{ overflowWrap: "anywhere" }}>
              {detalheTecnico}
            </code>
          </details>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Modal com foco preso, Escape e clique fora — item 65.
 *
 * O item 45 proíbe "modais para tudo", e por isso ele é usado em exatamente
 * dois lugares no CRC: confirmar ação destrutiva (item 142) e pedir o motivo da
 * perda (item 159). Nos dois casos a interrupção é o ponto — a pessoa PRECISA
 * parar e decidir.
 *
 * O foco preso não é enfeite de acessibilidade: sem ele, o Tab sai do diálogo e
 * vai para a página atrás, e quem navega por teclado fica preso num lugar
 * inalcançável visualmente.
 */
export function Modal({
  titulo,
  aberto,
  aoFechar,
  children,
  rodape,
}: {
  titulo: string;
  aberto: boolean;
  aoFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const tituloId = useId();

  const aoTeclar = useCallback(
    (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        aoFechar();
        return;
      }
      if (evento.key !== "Tab" || caixa.current === null) return;

      const focaveis = caixa.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (primeiro === undefined || ultimo === undefined) return;

      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    },
    [aoFechar],
  );

  useEffect(() => {
    if (!aberto) return;

    // Guarda quem tinha o foco para devolvê-lo ao fechar: sem isso, o Tab
    // recomeça do topo da página e a pessoa perde o lugar onde estava.
    const anterior = document.activeElement as HTMLElement | null;
    document.addEventListener("keydown", aoTeclar);

    const primeiro = caixa.current?.querySelector<HTMLElement>(
      'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    primeiro?.focus();

    return () => {
      document.removeEventListener("keydown", aoTeclar);
      anterior?.focus();
    };
  }, [aberto, aoTeclar]);

  if (!aberto) return null;

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(22, 36, 26, 0.35)",
        display: "grid",
        placeItems: "center",
        padding: "var(--crc-e4)",
        zIndex: 60,
      }}
    >
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="crc-cartao"
        style={{
          borderRadius: "var(--crc-r-modal)",
          maxWidth: "min(520px, 100%)",
          width: "100%",
          boxShadow: "var(--crc-sombra-flutuante)",
          maxHeight: "85dvh",
          overflowY: "auto",
        }}
      >
        <h2 id={tituloId} className="crc-titulo-secao" style={{ marginBottom: "var(--crc-e3)" }}>
          {titulo}
        </h2>
        {children}
        {rodape !== undefined && (
          <div
            className="crc-linha"
            style={{ marginTop: "var(--crc-e5)", justifyContent: "flex-end" }}
          >
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Aviso temporário                                                           */
/* -------------------------------------------------------------------------- */

export type Recado = { tom: "alerta" | "perigo" | "info"; texto: string } | null;

/**
 * O recado de resultado de ação.
 *
 * `role="status"` e `aria-live="polite"` fazem o leitor de tela anunciar sem
 * interromper — quem não vê a tela precisa saber que o envio deu certo, e um
 * toast visual sozinho não conta isso.
 *
 * Ele NÃO some sozinho, ao contrário de um toast. O item 140 é explícito: para
 * ação crítica, um aviso de três segundos não é suficiente. Fecha no clique ou
 * na próxima ação.
 */
export function BarraDeRecado({ recado, aoFechar }: { recado: Recado; aoFechar: () => void }) {
  if (recado === null) return null;
  return (
    <div style={{ marginBottom: "var(--crc-e4)" }}>
      <Aviso tom={recado.tom}>
        <div className="crc-linha" style={{ gap: "var(--crc-e3)" }}>
          <span style={{ minWidth: 0 }}>{recado.texto}</span>
          <button
            type="button"
            className="crc-botao crc-botao-discreto crc-botao-pequeno crc-empurra"
            onClick={aoFechar}
          >
            Fechar
          </button>
        </div>
      </Aviso>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Interruptor                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Interruptor acessível.
 *
 * Um `<button role="switch">` e não uma `<div>` com `onClick`: o botão já vem
 * com foco, Enter, Espaço e anúncio de estado de graça. Recriar isso à mão é
 * onde a acessibilidade costuma se perder.
 */
export function Interruptor({
  ligado,
  aoMudar,
  rotulo,
  desabilitado = false,
}: {
  ligado: boolean;
  aoMudar: (novo: boolean) => void;
  rotulo: string;
  desabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={desabilitado}
      onClick={() => {
        aoMudar(!ligado);
      }}
      style={{
        width: 42,
        height: 24,
        borderRadius: 999,
        border: "1px solid var(--crc-borda-forte)",
        background: ligado ? "var(--crc-primaria)" : "var(--crc-superficie-3)",
        position: "relative",
        cursor: desabilitado ? "not-allowed" : "pointer",
        opacity: desabilitado ? 0.55 : 1,
        transition: "background var(--crc-transicao)",
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 2,
          left: ligado ? 20 : 2,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#ffffff",
          boxShadow: "0 1px 2px rgba(0,0,0,.2)",
          transition: "left var(--crc-transicao)",
        }}
      />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Hook de ação                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Executa uma ação de servidor e cuida de "carregando" e "deu errado".
 *
 * Existe porque toda ação do CRC precisa das MESMAS três coisas: desabilitar o
 * botão enquanto roda, mostrar a mensagem humana da falha, e não deixar exceção
 * escapar para o error boundary. Repetir isso em cada tela é como uma delas
 * acaba sem tratamento — e é justamente a que vai falhar em produção.
 */
export function useAcao(): {
  rodando: boolean;
  recado: Recado;
  limpar: () => void;
  /**
   * Mostra um recado sem ter executado nada aqui.
   *
   * Existe para quem é dono da barra mas não da ação — um modal filho que
   * chama o servidor sozinho e precisa avisar o pai. Sem isto, cada um desses
   * casos inventaria a própria barra e a tela passaria a ter duas.
   */
  avisar: (texto: string, tom?: "info" | "perigo") => void;
  executar: <T extends { ok: boolean; message?: string }>(
    acao: () => Promise<T>,
    aoDarCerto?: (resultado: T & { ok: true }) => void,
    mensagemSucesso?: string,
  ) => Promise<void>;
} {
  const [rodando, setRodando] = useState(false);
  const [recado, setRecado] = useState<Recado>(null);

  const executar = useCallback(
    async <T extends { ok: boolean; message?: string }>(
      acao: () => Promise<T>,
      aoDarCerto?: (resultado: T & { ok: true }) => void,
      mensagemSucesso?: string,
    ): Promise<void> => {
      setRodando(true);
      setRecado(null);
      try {
        const resultado = await acao();
        if (resultado.ok) {
          aoDarCerto?.(resultado as T & { ok: true });
          if (mensagemSucesso !== undefined) setRecado({ tom: "info", texto: mensagemSucesso });
        } else {
          setRecado({
            tom: "perigo",
            texto: resultado.message ?? "Não foi possível concluir a ação.",
          });
        }
      } catch {
        // A rede caiu ou o servidor não respondeu. A frase é humana e diz o que
        // continua verdade — item 48.
        setRecado({
          tom: "perigo",
          texto:
            "Não conseguimos falar com o servidor. Seus dados continuam seguros; tente de novo.",
        });
      } finally {
        setRodando(false);
      }
    },
    [],
  );

  const avisar = useCallback((texto: string, tom: "info" | "perigo" = "info"): void => {
    setRecado({ tom, texto });
  }, []);

  return { rodando, recado, limpar: () => setRecado(null), avisar, executar };
}
