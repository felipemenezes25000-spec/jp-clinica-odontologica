/**
 * Central de contato da candidata — o "botão para chamar no WhatsApp, mandar
 * e-mail e tudo mais" que o dono da clínica pediu.
 *
 * O que existia antes eram dois links burros: um `wa.me` e um `mailto:` sem
 * conteúdo. Funcionavam, e não serviam para nada — o RH abria o WhatsApp e
 * escrevia tudo de novo, à mão, em cada uma das candidatas. Aqui a diferença
 * não é enfeite: é que a mensagem já vem escrita a partir do que o sistema sabe
 * daquela pessoa (a vaga, a data marcada, o emprego que veio sem período), que
 * o RH pode editar antes de mandar, que o histórico dela passa a registrar o
 * envio sozinho e que a entrevista entra na agenda em um clique.
 *
 * SUPERFÍCIE: vive no cabeçalho da gaveta, que é clara. O visual mora em
 * `triagem.css` (classes `.cc-*`): degrau de tom em vez de filete, tinta como
 * letra, acento só como fundo do WhatsApp. Nada de `text-lime` nem de branco
 * translúcido: aqui o texto é tinta sobre claro.
 *
 * RELÓGIO: `agora` desce por prop e é ele que monta todo texto que aparece na
 * tela — nada de `new Date()` no render, senão servidor e navegador escreveriam
 * datas diferentes e a hidratação quebraria. A ÚNICA exceção está nos
 * manipuladores de clique, que rodam só no navegador e depois da hidratação:
 * lá o carimbo do histórico e o DTSTAMP do convite precisam da hora REAL do
 * envio. Uma aba aberta desde as 8h registraria "às 08:00" um envio das 17h.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BookmarkPlus,
  CalendarCheck,
  CalendarPlus,
  Check,
  Clock,
  Copy,
  Handshake,
  HeartHandshake,
  Sprout,
  History,
  Mail,
  MessageCircle,
  MessageSquarePlus,
  Paperclip,
  PenLine,
  Phone,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CLINICA } from "@/lib/jp";
import { mascararTelefone } from "@/lib/rh/formatar";
import type { ChaveModelo, ContextoMensagem, ModeloMensagem } from "@/lib/rh/mensagens";
import {
  assinaturaEmail,
  dataPorExtenso,
  entrevistaMarcada,
  eventoIcs,
  linhaDeRegistro,
  linkEmail,
  linkTelefone,
  linkWhatsapp,
  modelosAplicaveis,
  montarAssunto,
  montarMensagem,
  nomeArquivoIcs,
} from "@/lib/rh/mensagens";
import type { Candidatura } from "@/lib/rh/tipos";
import "@/components/rh/triagem.css";

/* -------------------------------------------------------------------------- */
/* Constantes de estilo                                                       */
/* -------------------------------------------------------------------------- */

/** Alvo de 44px em tudo que se clica — a recepção usa isto no celular. */
const BOTAO_PRIMARIO = "cc-btn cc-btn--forte";
const BOTAO_SECUNDARIO = "cc-btn cc-btn--vidro";
/** Indisponível: continua legível, mas sem convite ao clique. */
const BOTAO_MORTO = "cc-btn cc-btn--vidro";

const AJUDA = "cc-ajuda";

/** Duração do "copiado!" — tempo de ler sem virar poluição na tela. */
const MS_AVISO = 2000;

/** O nome do ícone vem do modelo (`ModeloMensagem.icone`); o mapa mora aqui. */
const ICONES: Record<string, LucideIcon> = {
  MessageSquarePlus,
  CalendarPlus,
  CalendarCheck,
  History,
  Paperclip,
  Handshake,
  HeartHandshake,
  Sprout,
  BookmarkPlus,
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `navigator.clipboard` some fora de contexto seguro (o painel roda em rede
 * local da clínica com frequência) e o Safari antigo ainda depende do
 * `execCommand`. Sem o segundo caminho, o botão simplesmente não faria nada em
 * metade dos computadores da recepção. Mesma função de `LeituraIa.tsx` e
 * `FichaEntrevista.tsx`.
 */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // Sem contexto seguro ou sem permissão: cai no caminho antigo abaixo.
  }

  try {
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    // Fora da tela, mas ainda focável: `display:none` impediria a seleção.
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** Baixa um texto como arquivo. O `revoke` depois evita segurar o blob na memória da aba. */
function baixarArquivo(conteudo: string, nome: string, tipo: string): void {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* -------------------------------------------------------------------------- */
/* Peças                                                                      */
/* -------------------------------------------------------------------------- */

type PropsAcao = {
  icone: LucideIcon;
  rotulo: string;
  /** Destino. "" quando a ação não é um link (copiar) ou está indisponível. */
  href: string;
  /** Ação de clique. `null` quando o botão só navega. */
  aoClicar: (() => void) | null;
  destaque: boolean;
  novaAba: boolean;
  /**
   * Id do parágrafo que explica por que a ação está fora do ar. "" quando ela
   * está disponível. Um botão desabilitado sem motivo visível é o pior estado
   * possível: o RH clica, nada acontece, e ele culpa o sistema.
   */
  motivoId: string;
};

function Acao(props: PropsAcao) {
  const { icone: Icone, rotulo, href, aoClicar, destaque, novaAba, motivoId } = props;
  const indisponivel = motivoId !== "";
  const classe = indisponivel ? BOTAO_MORTO : destaque ? BOTAO_PRIMARIO : BOTAO_SECUNDARIO;

  if (indisponivel) {
    return (
      <button type="button" disabled aria-describedby={motivoId} className={classe}>
        <Icone aria-hidden="true" />
        {rotulo}
      </button>
    );
  }

  if (href !== "") {
    return (
      <a
        href={href}
        {...(novaAba ? { target: "_blank", rel: "noreferrer" } : {})}
        onClick={aoClicar ?? undefined}
        className={classe}
      >
        <Icone aria-hidden="true" />
        {rotulo}
      </a>
    );
  }

  return (
    <button type="button" onClick={aoClicar ?? undefined} className={classe}>
      <Icone aria-hidden="true" />
      {rotulo}
    </button>
  );
}

/**
 * Um dado de contato com o "copiar" preso NELE.
 *
 * Antes existiam duas pílulas escritas "Copiar telefone" e "Copiar e-mail", do
 * mesmo tamanho e no mesmo fileirão de "WhatsApp", "E-mail" e "Ligar" — cinco
 * botões idênticos, dois deles copiando um dado que a tela não mostrava. Quem
 * precisava LER o número em voz alta tinha de rolar a ficha inteira até "Dados
 * pessoais", e quem só queria copiar não sabia o que ia no clipboard.
 *
 * Aqui a mesma linha faz as duas coisas: mostra o dado e copia. É por isso que
 * o telefone e o e-mail saíram da lista de "Dados pessoais" lá embaixo — dado
 * de contato tem um dono só, e é este.
 *
 * O alvo é de 36px no mouse e 44px no dedo (`.rh-alvo-toque`): a regra dos 44px
 * nasceu do celular da recepção, e no monitor ela só engordava o cabeçalho.
 */
function DadoContato(props: {
  icone: LucideIcon;
  /** "telefone" ou "e-mail", em minúscula: entra no meio da frase do aria-label. */
  rotulo: string;
  valor: string;
  vazio: string;
  copiado: boolean;
  aoCopiar: () => void;
}) {
  const { icone: Icone } = props;

  if (props.valor === "") {
    return (
      <span className="cc-dado cc-dado--vazio">
        <Icone className="h-4 w-4" aria-hidden="true" />
        {props.vazio}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={props.aoCopiar}
      aria-label={`Copiar ${props.rotulo} ${props.valor}`}
      className="cc-dado"
    >
      <Icone className="h-4 w-4" aria-hidden="true" />
      {/* `select-text` porque copiar com o botão é o caminho rápido, não o
          único: quem prefere marcar com o mouse e dar Ctrl+C continua podendo. */}
      <span className="cc-dado__valor">{props.valor}</span>
      {props.copiado ? (
        <Check className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Central                                                                    */
/* -------------------------------------------------------------------------- */

export function CentralContato(props: {
  item: Candidatura;
  agora: Date;
  remetente: string;
  /**
   * Uma linha para o histórico da candidata. Quem grava é a gaveta (é ela que
   * conhece a rota de anotação) — aqui a gente só diz o que aconteceu.
   */
  aoRegistrar: (texto: string) => void;
  /**
   * Um botão a mais no fim da fileira de canais. Hoje é o "Baixar currículo",
   * que a gaveta passa: baixar não é contato, mas é o mesmo gesto de "o que eu
   * faço com esta pessoa agora" e vivia sozinho numa terceira fileira, embaixo,
   * com a faixa inteira vazia à direita dele.
   */
  acaoExtra?: ReactNode;
}) {
  const { item, agora, remetente, aoRegistrar } = props;
  const uid = useId();

  const [aberto, setAberto] = useState(false);
  const [escolhido, setEscolhido] = useState<ChaveModelo | null>(null);
  const [texto, setTexto] = useState("");
  /** Só o que DEU ERRADO, ou o que não tem onde aparecer (o convite baixado). */
  const [aviso, setAviso] = useState("");
  /** Qual dado acabou de ir para a área de transferência — vira o "check" nele. */
  const [copiado, setCopiado] = useState<"" | "telefone" | "email" | "mensagem">("");

  const refAbrir = useRef<HTMLButtonElement>(null);
  const refPrimeiroModelo = useRef<HTMLButtonElement>(null);
  const refArea = useRef<HTMLTextAreaElement>(null);

  /* --- Contexto de montagem dos textos ---------------------------------- */

  const clinica = {
    nome: CLINICA.nome,
    telefone: CLINICA.telefone,
    endereco: CLINICA.endereco,
    horario: CLINICA.horario,
  };
  /** `agora` da prop de propósito: este contexto alimenta o que é RENDERIZADO. */
  const ctx: ContextoMensagem = { item, clinica, remetente, agora };

  const aplicaveis = modelosAplicaveis(item);
  const modelo: ModeloMensagem | null =
    escolhido === null ? null : (aplicaveis.find((m) => m.chave === escolhido) ?? null);

  const marcada = entrevistaMarcada(item);

  /* --- Dados de contato -------------------------------------------------- */

  const telefone = item.telefone.trim();
  const email = item.email.trim();
  const hrefWhatsDireto = linkWhatsapp(telefone, "");
  const hrefLigar = linkTelefone(telefone);
  const hrefEmailDireto = linkEmail(email, montarAssunto("primeiro-contato", ctx), "");

  const semTelefone = hrefLigar === "";
  const semEmail = hrefEmailDireto === "";
  const idSemTelefone = `${uid}-sem-telefone`;
  const idSemEmail = `${uid}-sem-email`;

  /* --- Aviso de "copiado!" ----------------------------------------------- */

  useEffect(() => {
    if (aviso === "" && copiado === "") return undefined;
    const t = window.setTimeout(() => {
      setAviso("");
      setCopiado("");
    }, MS_AVISO);
    return () => window.clearTimeout(t);
  }, [aviso, copiado]);

  /* --- Foco do painel ----------------------------------------------------- */

  useEffect(() => {
    if (!aberto) return;
    if (escolhido === null) refPrimeiroModelo.current?.focus();
    else refArea.current?.focus();
  }, [aberto, escolhido]);

  function fecharPainel(): void {
    setAberto(false);
    setEscolhido(null);
    setTexto("");
    // Devolve o foco a quem abriu: sem isso, o Tab seguinte recomeçaria do topo
    // da gaveta e quem usa teclado perderia o lugar na página.
    refAbrir.current?.focus();
  }

  function escolherModelo(chave: ChaveModelo): void {
    setEscolhido(chave);
    // O texto nasce na medida do WhatsApp (sem assinatura). Quando o RH clicar
    // em "Abrir e-mail", a assinatura da clínica é acrescentada AO QUE ELE
    // EDITOU — remontar do zero ali jogaria fora as correções dele.
    setTexto(montarMensagem(chave, ctx));
  }

  /**
   * O carimbo do histórico usa a hora REAL do clique, não o `agora` da página.
   * Ver o cabeçalho: manipulador de clique não é render, e uma aba aberta desde
   * a manhã registraria o horário errado para o resto do dia.
   */
  function registrar(acao: string, canal: string): void {
    aoRegistrar(linhaDeRegistro({ acao, canal, remetente, quando: new Date() }));
  }

  /**
   * O sucesso NÃO vira frase na tela: vira um "check" no próprio botão que foi
   * clicado, que é onde o olho já está. A frase escrita fica só para a falha,
   * que é o caso em que a pessoa precisa saber o que fazer em vez disso. Para
   * quem usa leitor de tela, o anúncio sai da região viva mais abaixo.
   */
  async function copiar(valor: string, marca: "telefone" | "email" | "mensagem"): Promise<void> {
    const ok = await copiarTexto(valor);
    setCopiado(ok ? marca : "");
    setAviso(ok ? "" : "Não consegui copiar. Selecione o texto e use Ctrl+C.");
  }

  function abrirWhatsappDoModelo(): void {
    if (modelo === null) return;
    const href = linkWhatsapp(telefone, texto);
    if (href === "") return;
    window.open(href, "_blank", "noopener,noreferrer");
    registrar(`${modelo.rotulo} enviado`, "WhatsApp");
    fecharPainel();
  }

  function abrirEmailDoModelo(): void {
    if (modelo === null) return;
    const corpo = `${texto.trimEnd()}\n\n${assinaturaEmail({ ...ctx, canal: "email" })}`;
    const href = linkEmail(email, montarAssunto(modelo.chave, ctx), corpo);
    if (href === "") return;
    window.location.href = href;
    registrar(`${modelo.rotulo} enviado`, "e-mail");
    fecharPainel();
  }

  async function copiarModelo(): Promise<void> {
    if (modelo === null) return;
    await copiar(texto, "mensagem");
    // Copiar TAMBÉM é envio: existe justamente porque nem todo mundo usa
    // WhatsApp Web e no computador da recepção o link às vezes não abre — a
    // pessoa cola no celular e manda de lá. Registrar aqui é o que impede o
    // histórico de dizer que ninguém falou com a candidata.
    registrar(`${modelo.rotulo} copiado para envio manual`, "");
  }

  function baixarConvite(): void {
    if (marcada === null || marcada.hora === "") return;
    const quem = item.nome.trim() === "" ? "candidata" : item.nome.trim();
    const vaga = item.vagaTitulo.trim() === "" ? item.cargoDesejado.trim() : item.vagaTitulo.trim();
    const ics = eventoIcs({
      titulo: `Entrevista: ${quem}${vaga === "" ? "" : ` — ${vaga}`}`,
      descricao: [
        `Entrevista com ${quem}.`,
        vaga === "" ? "" : `Vaga: ${vaga}.`,
        item.telefone.trim() === "" ? "" : `Telefone: ${mascararTelefone(item.telefone)}`,
        `Protocolo: ${item.protocolo || "sem protocolo"}`,
      ]
        .filter((l) => l !== "")
        .join("\n"),
      local: CLINICA.endereco,
      inicioIso: marcada.iso,
      duracaoMinutos: 40,
      // Hora real do clique: o DTSTAMP diz quando o convite foi EMITIDO.
      agora: new Date(),
      id: item.id,
    });
    if (ics === "") return;
    baixarArquivo(ics, nomeArquivoIcs(item), "text/calendar;charset=utf-8");
    setAviso("Convite baixado — abra o arquivo para adicionar à agenda.");
  }

  /* --------------------------------------------------------------------- */

  return (
    /* SEM MOLDURA E SEM TEXTO — no PC também, não só no celular.
       Ela mora ao lado do nome, no cabeçalho da gaveta. Enquanto teve cartão,
       título e um parágrafo de duas linhas, gastava 77px antes do primeiro
       botão e empurrava a ficha para fora da dobra: abria-se a candidata e
       via-se um bloco de instruções, não os dados dela.

       O título e a explicação continuam no HTML para quem usa leitor de tela.
       Para quem enxerga, "WhatsApp", "E-mail" e "Ligar" já dizem o que fazem —
       e o texto só se lia uma vez na vida. */
    <section aria-labelledby={`${uid}-titulo`} className="cc">
      <h3 id={`${uid}-titulo`} className="sr-only">
        Central de contato
      </h3>
      <p className="sr-only">
        Fale com {item.nome.trim() === "" ? "a candidata" : item.nome.trim()} sem sair daqui. O que
        você enviar entra sozinho no histórico dela.
      </p>

      {/* ---------- OS DADOS ----------
          Primeira linha: o número e o e-mail por extenso, cada um com o
          "copiar" preso nele. Ver o comentário de `DadoContato` — é aqui que
          moram o telefone e o e-mail da candidata, e não mais lá embaixo em
          "Dados pessoais". */}
      <div className="cc-dados">
        <DadoContato
          icone={Phone}
          rotulo="telefone"
          valor={semTelefone ? "" : mascararTelefone(telefone)}
          vazio="Sem telefone no currículo"
          copiado={copiado === "telefone"}
          aoCopiar={() => void copiar(mascararTelefone(telefone), "telefone")}
        />
        <DadoContato
          icone={Mail}
          rotulo="e-mail"
          valor={semEmail ? "" : email}
          vazio="Sem e-mail no currículo"
          copiado={copiado === "email"}
          aoCopiar={() => void copiar(email, "email")}
        />
      </div>

      {/* ---------- OS CANAIS ----------
          Segunda linha: só o que ABRE uma conversa, na ordem em que a clínica
          usa — o WhatsApp resolve quase tudo, ligar é o plano B do mesmo
          número, o e-mail serve para documento, e "escrever mensagem" é o
          caminho longo, o que monta o texto e registra o envio no histórico.

          Eram cinco botões iguais numa fileira só, dois deles ("Copiar
          telefone", "Copiar e-mail") sem nada a ver com abrir conversa. Separar
          o que É o dado do que FAZ alguma coisa é a organização inteira desta
          faixa. */}
      <div className="cc-canais">
        <Acao
          icone={MessageCircle}
          rotulo="WhatsApp"
          href={hrefWhatsDireto}
          aoClicar={() => registrar("Conversa aberta", "WhatsApp")}
          destaque
          novaAba
          motivoId={semTelefone ? idSemTelefone : ""}
        />
        <Acao
          icone={Phone}
          rotulo="Ligar"
          href={hrefLigar}
          aoClicar={() => registrar("Ligação iniciada", "telefone")}
          destaque={false}
          novaAba={false}
          motivoId={semTelefone ? idSemTelefone : ""}
        />
        <Acao
          icone={Mail}
          rotulo="E-mail"
          href={hrefEmailDireto}
          aoClicar={() => registrar("E-mail aberto", "")}
          destaque={false}
          novaAba={false}
          motivoId={semEmail ? idSemEmail : ""}
        />

        {/* ---------- Escrever mensagem ----------
            Estava numa terceira fileira sozinho, e por isso parecia sobra: é o
            botão que escreve o texto pronto e grava o envio, o mais valioso da
            faixa depois do WhatsApp. Aqui ele fecha a fileira dos canais, que é
            o que ele é. */}
        <button
          ref={refAbrir}
          type="button"
          onClick={() => (aberto ? fecharPainel() : setAberto(true))}
          aria-expanded={aberto}
          aria-controls={`${uid}-painel`}
          className={BOTAO_SECUNDARIO}
        >
          <PenLine aria-hidden="true" />
          Escrever mensagem
        </button>

        {props.acaoExtra}
      </div>

      {/* Motivos visíveis, e ligados por aria-describedby a cada botão morto. */}
      {semTelefone ? (
        <p id={idSemTelefone} className={AJUDA}>
          Sem telefone no currículo — WhatsApp e Ligar ficam indisponíveis.
        </p>
      ) : null}
      {semEmail ? (
        <p id={idSemEmail} className={AJUDA}>
          Sem e-mail no currículo — o botão de e-mail fica indisponível.
        </p>
      ) : null}

      {/* Falha de cópia e download do convite: os dois casos que NÃO têm como
          aparecer no próprio botão. O sucesso da cópia vira "check" lá, e por
          isso não repete aqui. */}
      {aviso === "" ? null : (
        <p role="alert" className="cc-aviso">
          {aviso}
        </p>
      )}

      {/* Região viva só para leitor de tela: quem enxerga já viu o "check". */}
      <p role="status" aria-live="polite" className="sr-only">
        {copiado === "telefone"
          ? "Telefone copiado."
          : copiado === "email"
            ? "E-mail copiado."
            : copiado === "mensagem"
              ? "Mensagem copiada."
              : ""}
      </p>

      {aberto ? (
        <div
          id={`${uid}-painel`}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            // Para aqui: mais acima, Escape é o atalho que fecha a gaveta
            // inteira — e fechar a gaveta jogaria fora a mensagem em edição.
            e.stopPropagation();
            fecharPainel();
          }}
          className="cc-painel"
        >
          {modelo === null ? (
            <>
              <div className="cc-painel__topo">
                <p className="cc-painel__titulo">Escolha um modelo</p>
                <button
                  type="button"
                  onClick={fecharPainel}
                  aria-label="Fechar modelos de mensagem"
                  className="cc-fechar"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <p className={AJUDA}>
                Só aparecem os modelos que fazem sentido para o momento desta candidatura, do mais
                provável para o menos.
              </p>

              {aplicaveis.length === 0 ? (
                <p className={AJUDA}>
                  Nenhum modelo se aplica a este estado. Use o WhatsApp ou o e-mail direto acima.
                </p>
              ) : (
                <ul className="cc-modelos">
                  {aplicaveis.map((m, i) => {
                    const Icone = ICONES[m.icone] ?? MessageCircle;
                    return (
                      <li key={m.chave}>
                        <button
                          ref={i === 0 ? refPrimeiroModelo : undefined}
                          type="button"
                          onClick={() => escolherModelo(m.chave)}
                          className="cc-modelo"
                        >
                          <Icone className="h-5 w-5" aria-hidden="true" />
                          <span className="min-w-0">
                            <strong>{m.rotulo}</strong>
                            <span>{m.quandoUsar}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <>
              <div className="cc-painel__topo">
                <button
                  type="button"
                  onClick={() => {
                    setEscolhido(null);
                    setTexto("");
                  }}
                  className={BOTAO_SECUNDARIO}
                >
                  <ArrowLeft aria-hidden="true" />
                  Outros modelos
                </button>
                <button
                  type="button"
                  onClick={fecharPainel}
                  aria-label="Fechar escrita de mensagem"
                  className="cc-fechar"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <label htmlFor={`${uid}-texto`} className="cc-rotulo">
                {modelo.rotulo}
              </label>
              <p className={AJUDA}>{modelo.descricao}</p>

              {/* Editável sempre: o texto é um bom começo, não um decreto. Quem
                  conhece a candidata ajusta uma frase antes de mandar. */}
              <textarea
                ref={refArea}
                id={`${uid}-texto`}
                rows={10}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className="cc-texto"
              />

              <p className={AJUDA}>
                {texto.length} caracteres
                {texto.length > 900 ? " — longo para WhatsApp; considere encurtar." : ""}
                {modelo.canais[0] === "email"
                  ? " · Recomendado por e-mail. A assinatura da clínica entra ao abrir o e-mail."
                  : " · Recomendado por WhatsApp."}
              </p>

              <div className="cc-envio">
                <Acao
                  icone={MessageCircle}
                  rotulo="Abrir no WhatsApp"
                  href=""
                  aoClicar={abrirWhatsappDoModelo}
                  destaque
                  novaAba={false}
                  motivoId={semTelefone ? idSemTelefone : ""}
                />
                {/* "Copiar texto" não é plano B decorativo: no computador da
                    recepção o link do WhatsApp às vezes não abre, e tem gente
                    que só usa o app no celular. Copiar é o caminho que sempre
                    funciona. */}
                <Acao
                  icone={copiado === "mensagem" ? Check : Copy}
                  rotulo={copiado === "mensagem" ? "Texto copiado" : "Copiar texto"}
                  href=""
                  aoClicar={() => void copiarModelo()}
                  destaque={false}
                  novaAba={false}
                  motivoId=""
                />
                <Acao
                  icone={Mail}
                  rotulo="Abrir e-mail"
                  href=""
                  aoClicar={abrirEmailDoModelo}
                  destaque={false}
                  novaAba={false}
                  motivoId={semEmail ? idSemEmail : ""}
                />
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* ---------- Agenda ---------- */}
      {marcada !== null ? (
        <div className="cc-agenda">
          <div className="cc-agenda__quando">
            <Clock className="h-5 w-5" aria-hidden="true" />
            <p>
              <small>Agenda</small>
              <strong>
                Entrevista em {dataPorExtenso(marcada.data)}
                {marcada.hora === "" ? "" : `, às ${marcada.hora}`}
              </strong>
            </p>
          </div>
          {marcada.hora === "" ? (
            <p className={AJUDA}>
              Sem horário definido — combine a hora na gestão do processo para gerar o convite.
            </p>
          ) : (
            <button type="button" onClick={baixarConvite} className={BOTAO_SECUNDARIO}>
              <CalendarPlus aria-hidden="true" />
              Adicionar à agenda
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
