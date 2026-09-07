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
 * SUPERFÍCIE: este componente vive dentro da gaveta, sobre o verde profundo da
 * marca. Vale a regra do cliente sem exceção — **fundo verde, letra branca**.
 * Nenhum texto aqui é `text-lime`, `text-forest` ou branco abaixo de 85% de
 * opacidade; lime aparece só onde não é letra (ícone, anel, ponto). O botão
 * principal usa `bg-forest` com `text-white` em vez de `bg-lime`, que é o mesmo
 * desenho de `.button-primary` e o que dá contraste de verdade.
 *
 * RELÓGIO: `agora` desce por prop e é ele que monta todo texto que aparece na
 * tela — nada de `new Date()` no render, senão servidor e navegador escreveriam
 * datas diferentes e a hidratação quebraria. A ÚNICA exceção está nos
 * manipuladores de clique, que rodam só no navegador e depois da hidratação:
 * lá o carimbo do histórico e o DTSTAMP do convite precisam da hora REAL do
 * envio. Uma aba aberta desde as 8h registraria "às 08:00" um envio das 17h.
 */
import { useEffect, useId, useRef, useState } from "react";
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
  History,
  Mail,
  MessageCircle,
  MessageSquarePlus,
  Paperclip,
  PenLine,
  Phone,
  Send,
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

/* -------------------------------------------------------------------------- */
/* Constantes de estilo                                                       */
/* -------------------------------------------------------------------------- */

/** Alvo de 44px (min-h-11) em tudo que se clica — a recepção usa isto no celular. */
const BOTAO =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold " +
  "ring-1 transition focus-visible:outline-2 focus-visible:outline-offset-2";

/** Ação principal. `bg-forest` + branco, nunca `bg-lime` + branco: ver o cabeçalho. */
const BOTAO_PRIMARIO = `${BOTAO} bg-forest text-white ring-lime hover:bg-forest/80`;
const BOTAO_SECUNDARIO = `${BOTAO} bg-white/10 text-white ring-white/25 hover:bg-white/20`;
/** Indisponível: continua legível (85% é o piso da regra), mas sem convite ao clique. */
const BOTAO_MORTO = `${BOTAO} cursor-not-allowed bg-white/5 text-white/85 ring-white/15`;

const ROTULO_SECAO =
  "flex items-center gap-2 font-display text-[0.72rem] font-extrabold uppercase tracking-[0.14em] text-white";

const AJUDA = "text-xs leading-relaxed text-white/85";

const CAMPO_TEXTO =
  "block w-full rounded-xl border border-white/15 bg-white/[0.07] px-3.5 py-3 text-sm " +
  "leading-relaxed text-white placeholder:text-white/85 transition-colors " +
  "hover:border-white/30 focus:border-lime";

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
        <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
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
        <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
        {rotulo}
      </a>
    );
  }

  return (
    <button type="button" onClick={aoClicar ?? undefined} className={classe}>
      <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
      {rotulo}
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
}) {
  const { item, agora, remetente, aoRegistrar } = props;
  const uid = useId();

  const [aberto, setAberto] = useState(false);
  const [escolhido, setEscolhido] = useState<ChaveModelo | null>(null);
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState("");

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
    if (aviso === "") return undefined;
    const t = window.setTimeout(() => setAviso(""), MS_AVISO);
    return () => window.clearTimeout(t);
  }, [aviso]);

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

  async function copiar(valor: string, mensagem: string): Promise<void> {
    const ok = await copiarTexto(valor);
    setAviso(ok ? mensagem : "Não consegui copiar. Selecione o texto e use Ctrl+C.");
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
    await copiar(texto, "Mensagem copiada!");
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
    /* COMPACTA POR PADRÃO. Ela fica logo abaixo do nome, e antes ocupava um
       cartão inteiro — título, um parágrafo de duas linhas e só então os
       botões. Numa tela pequena isso empurrava a ficha inteira para fora da
       dobra: a pessoa abria a candidata e via um bloco de instruções, não os
       dados dela.
       O título e a explicação continuam existindo para leitor de tela e voltam
       à vista a partir de sm; o que some no celular é a moldura e o texto que
       quem usa o painel já leu na primeira vez. */
    <section aria-labelledby={`${uid}-titulo`} className="rounded-2xl sm:rh-vidro sm:p-5">
      <h3 id={`${uid}-titulo`} className={`sr-only sm:not-sr-only sm:flex ${ROTULO_SECAO}`}>
        <Send className="hidden h-4 w-4 shrink-0 text-lime sm:block" aria-hidden="true" />
        Central de contato
      </h3>
      <p className={`hidden sm:block sm:mt-2 ${AJUDA}`}>
        Fale com {item.nome.trim() === "" ? "a candidata" : item.nome.trim()} sem sair daqui. O que
        você enviar entra sozinho no histórico dela.
      </p>

      {/* ---------- Ações diretas ---------- */}
      <div className="flex flex-wrap gap-2 sm:mt-3">
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
          icone={Mail}
          rotulo="E-mail"
          href={hrefEmailDireto}
          aoClicar={() => registrar("E-mail aberto", "")}
          destaque={false}
          novaAba={false}
          motivoId={semEmail ? idSemEmail : ""}
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
          icone={Copy}
          rotulo="Copiar telefone"
          href=""
          aoClicar={() => void copiar(mascararTelefone(telefone), "Telefone copiado!")}
          destaque={false}
          novaAba={false}
          motivoId={semTelefone ? idSemTelefone : ""}
        />
        <Acao
          icone={Copy}
          rotulo="Copiar e-mail"
          href=""
          aoClicar={() => void copiar(email, "E-mail copiado!")}
          destaque={false}
          novaAba={false}
          motivoId={semEmail ? idSemEmail : ""}
        />
      </div>

      {/* Motivos visíveis, e ligados por aria-describedby a cada botão morto. */}
      {semTelefone ? (
        <p id={idSemTelefone} className={`mt-2 ${AJUDA}`}>
          Sem telefone no currículo — WhatsApp, Ligar e Copiar telefone ficam indisponíveis.
        </p>
      ) : null}
      {semEmail ? (
        <p id={idSemEmail} className={`mt-2 ${AJUDA}`}>
          Sem e-mail no currículo — E-mail e Copiar e-mail ficam indisponíveis.
        </p>
      ) : null}

      {/* Região viva única para toda confirmação de cópia e download. */}
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-xs font-bold text-white">
        {aviso === "" ? (
          ""
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
            {aviso}
          </span>
        )}
      </p>

      {/* ---------- Escrever mensagem ---------- */}
      <div className="mt-3">
        <button
          ref={refAbrir}
          type="button"
          onClick={() => (aberto ? fecharPainel() : setAberto(true))}
          aria-expanded={aberto}
          aria-controls={`${uid}-painel`}
          className={BOTAO_SECUNDARIO}
        >
          <PenLine className="h-4 w-4 shrink-0" aria-hidden="true" />
          Escrever mensagem
        </button>
      </div>

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
          className="mt-3 rounded-2xl border border-white/15 bg-black/20 p-3 sm:p-4"
        >
          {modelo === null ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-white">Escolha um modelo</p>
                <button
                  type="button"
                  onClick={fecharPainel}
                  aria-label="Fechar modelos de mensagem"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/25 transition hover:bg-white/20"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <p className={`mt-1 ${AJUDA}`}>
                Só aparecem os modelos que fazem sentido para o momento desta candidatura, do mais
                provável para o menos.
              </p>

              {aplicaveis.length === 0 ? (
                <p className={`mt-3 ${AJUDA}`}>
                  Nenhum modelo se aplica a este estado. Use o WhatsApp ou o e-mail direto acima.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {aplicaveis.map((m, i) => {
                    const Icone = ICONES[m.icone] ?? MessageCircle;
                    return (
                      <li key={m.chave}>
                        <button
                          ref={i === 0 ? refPrimeiroModelo : undefined}
                          type="button"
                          onClick={() => escolherModelo(m.chave)}
                          className="flex w-full min-h-11 items-start gap-3 rounded-xl bg-white/[0.07] p-3 text-left ring-1 ring-white/15 transition hover:bg-white/15"
                        >
                          <Icone className="mt-0.5 h-5 w-5 shrink-0 text-lime" aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-white">{m.rotulo}</span>
                            <span className={`mt-0.5 block ${AJUDA}`}>{m.quandoUsar}</span>
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
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEscolhido(null);
                    setTexto("");
                  }}
                  className={BOTAO_SECUNDARIO}
                >
                  <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Outros modelos
                </button>
                <button
                  type="button"
                  onClick={fecharPainel}
                  aria-label="Fechar escrita de mensagem"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/25 transition hover:bg-white/20"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <label htmlFor={`${uid}-texto`} className="mt-3 block text-sm font-bold text-white">
                {modelo.rotulo}
              </label>
              <p className={`mb-2 mt-0.5 ${AJUDA}`}>{modelo.descricao}</p>

              {/* Editável sempre: o texto é um bom começo, não um decreto. Quem
                  conhece a candidata ajusta uma frase antes de mandar. */}
              <textarea
                ref={refArea}
                id={`${uid}-texto`}
                rows={10}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className={CAMPO_TEXTO}
              />

              <p className={`mt-1.5 ${AJUDA}`}>
                {texto.length} caracteres
                {texto.length > 900 ? " — longo para WhatsApp; considere encurtar." : ""}
                {modelo.canais[0] === "email"
                  ? " · Recomendado por e-mail. A assinatura da clínica entra ao abrir o e-mail."
                  : " · Recomendado por WhatsApp."}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
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
                  icone={Copy}
                  rotulo="Copiar texto"
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
        <div className="mt-4 rounded-2xl border border-white/15 bg-white/[0.05] p-3 sm:p-4">
          <p className="flex items-center gap-2 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-white">
            <Clock className="h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
            Agenda
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white">
              Entrevista em {dataPorExtenso(marcada.data)}
              {marcada.hora === "" ? "" : `, às ${marcada.hora}`}
            </p>
            {marcada.hora === "" ? (
              <p className={AJUDA}>
                Sem horário definido — combine a hora na gestão do processo para gerar o convite.
              </p>
            ) : (
              <button type="button" onClick={baixarConvite} className={BOTAO_SECUNDARIO}>
                <CalendarPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                Adicionar à agenda
              </button>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
