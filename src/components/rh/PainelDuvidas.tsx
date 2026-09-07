/**
 * O roteiro da conversa: o que perguntar, e como ler a resposta.
 *
 * O cliente foi literal — "coloque parte para eu saber o que perguntar para o
 * candidato, para entender o que faz sentido ou não faz". A metade fácil do
 * pedido (listar perguntas) o sistema já cumpria em três lugares diferentes: os
 * sinais, a ficha e a análise. A metade que faltava é a que decide de verdade:
 * uma passagem de cinco meses não é boa nem ruim, e quem está com a candidata
 * na frente precisa saber, ANTES de ouvir, qual resposta resolve e qual agrava.
 *
 * Esta tela é só a vitrine. Quem consolida, deduplica e ordena é
 * `src/lib/rh/duvidas.ts`, que é puro e testável; aqui não há regra de negócio
 * nenhuma — se uma pergunta some ou muda de lugar, o motivo está lá, não aqui.
 * A ordem devolvida por `montarDuvidas` é respeitada sem reordenar: o que pode
 * eliminar a candidata vem antes do que só esclarece, e inverter isso faria a
 * clínica gastar meia hora de conversa antes de descobrir um item de corte.
 *
 * SUPERFÍCIE E CONTRASTE
 * O bloco vive em dois lugares escuros (a gaveta do candidato e o modo
 * entrevista) e num terceiro branco (o papel). A regra do cliente vale nos
 * dois: sobre verde, letra branca — apoio nunca abaixo de `text-white/85`; e
 * sobre branco, `text-ink`. Lime, rosé e âmbar aparecem em ícone, anel, barra e
 * preenchimento de pílula, que não são letra. A folha impressa é preto no
 * branco, porque impressora sem toner colorido é a regra na recepção, não a
 * exceção.
 *
 * `agora` não é usado aqui e nenhum `new Date()` aparece no render: este
 * componente é puro em relação ao tempo, e é isso que o mantém idêntico no SSR
 * e na hidratação.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  Check,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CircleHelp,
  CircleX,
  Copy,
  Info,
  ListChecks,
  MessageCircleQuestion,
  OctagonAlert,
  Printer,
  Search,
  Sigma,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CabecalhoFolha } from "@/components/rh/CabecalhoFolha";
import {
  LEITURAS,
  duvidasEmAberto,
  importantesEmAberto,
  montarDuvidas,
  resumoDasLeituras,
} from "@/lib/rh/duvidas";
import type { DuvidaAberta, LeituraResposta, OrigemDuvida } from "@/lib/rh/duvidas";
import { severidadePor } from "@/lib/rh/ia/tipos";
import type { Candidatura } from "@/lib/rh/tipos";

/* -------------------------------------------------------------------------- */
/* Constantes de estilo                                                       */
/* -------------------------------------------------------------------------- */

/* Mesma métrica de `.rh-rotulo` sobre o vidro escuro, branca: sobre verde a
   letra é branca, e o lime fica no que não é letra. */
const ROTULO = "text-[0.68rem] font-bold uppercase tracking-[0.14em] text-white";

const BOTAO =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold ring-1 transition";
const BOTAO_SECUNDARIO = `${BOTAO} bg-white/10 text-white ring-white/20 hover:bg-white/20`;

const PILULA =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-bold leading-none";

/**
 * O botão de leitura marcado.
 *
 * Cada leitura tem preenchimento próprio, e a letra escura é o tom fundo da
 * mesma cor — é a mesma solução das pílulas de severidade sobre fundo escuro em
 * `ia/tipos.ts`: preenchimento claro pede letra escura, preenchimento escuro
 * pede letra branca. Nenhum destes tons é `text-lime`, `text-forest` ou
 * `text-brand-text`, que estão fora como letra por ordem do cliente.
 *
 * E a cor nunca é o único sinal: o rótulo está escrito por extenso e cada botão
 * carrega o seu próprio ícone, então quem não distingue verde de rosé continua
 * lendo "Convenceu" e "Não convenceu".
 */
const ATIVO_POR_LEITURA: Record<string, string> = {
  convence: "bg-lime text-brand-deep ring-lime",
  parcial: "bg-amber-200 text-amber-950 ring-amber-200",
  "nao-convence": "bg-rose-300 text-rose-950 ring-rose-300",
};

const CAMPO =
  "block w-full min-h-11 rounded-xl border border-white/15 bg-white/[0.07] px-3 py-2 " +
  "text-sm leading-relaxed text-white placeholder:text-white/85 transition-colors " +
  "hover:border-white/30 focus:border-lime";

/**
 * `SEVERIDADES` e `LEITURAS` guardam o ícone por NOME, porque os catálogos são
 * puros e não podem importar React. A tradução nome -> componente mora aqui,
 * que é quem renderiza.
 */
const ICONES: Record<string, LucideIcon> = {
  OctagonAlert,
  TriangleAlert,
  CircleAlert,
  CircleHelp,
  Info,
  CircleCheck,
  CircleDot,
  CircleX,
};

function iconeDe(nome: string): LucideIcon {
  return ICONES[nome] ?? Info;
}

/**
 * De onde a pergunta veio, em português de recepção.
 *
 * Importa para o RH saber quanto peso dar: "triagem" é item de corte escrito
 * pela clínica, "calculado" é aritmética sobre as datas do currículo (a clínica
 * pode refazer a conta na mão) e "leitura da IA" é interpretação de texto — a
 * que mais merece ser confirmada na conversa.
 */
const MARCA_ORIGEM: Record<OrigemDuvida, { rotulo: string; icone: LucideIcon }> = {
  triagem: { rotulo: "triagem", icone: ListChecks },
  sinal: { rotulo: "calculado", icone: Sigma },
  ficha: { rotulo: "leitura da IA", icone: Sparkles },
  analise: { rotulo: "leitura da IA", icone: Sparkles },
};

/* -------------------------------------------------------------------------- */
/* Helpers puros                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `navigator.clipboard` some fora de contexto seguro (o painel roda em rede
 * local da clínica com frequência) e navegador antigo ainda depende do
 * `execCommand`. Sem o segundo caminho, o botão simplesmente não faria nada em
 * metade dos computadores da recepção.
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

/** A linha única: "3 dúvidas · 2 importantes". Serve tela e texto copiado. */
function fraseCurta(duvidas: DuvidaAberta[], leituras: Record<string, LeituraResposta>): string {
  if (duvidas.length === 0) return "Nenhuma dúvida em aberto neste currículo";

  const r = resumoDasLeituras(duvidas, leituras);
  const tudoLimpo = r.aberto === 0 && r.parcial === 0 && r.naoConvence === 0;
  if (tudoLimpo) return "Todas as dúvidas foram esclarecidas";

  const total = `${duvidas.length} ${duvidas.length === 1 ? "dúvida" : "dúvidas"}`;
  const importantes = importantesEmAberto(duvidas, leituras);
  if (importantes === 0) return total;
  return `${total} · ${importantes} ${importantes === 1 ? "importante" : "importantes"}`;
}

function rotuloDaLeitura(valor: LeituraResposta): string {
  return LEITURAS.find((l) => l.valor === valor)?.rotulo ?? "";
}

/** O bloco de leitura só existe quando há os dois lados para ler. */
function temLeitura(d: DuvidaAberta): boolean {
  return d.seConvence.trim() !== "" || d.seNaoConvence.trim() !== "";
}

/**
 * Uma resposta que não convenceu numa dúvida grave é o único caso em que a tela
 * chama a atenção sozinha. Não bloqueia nada — o RH manda — mas é o ponto em
 * que a decisão precisa ser justificada por escrito.
 */
function pesaNaDecisao(d: DuvidaAberta, leitura: LeituraResposta): boolean {
  return leitura === "nao-convence" && (d.severidade === "critico" || d.severidade === "alto");
}

/* -------------------------------------------------------------------------- */
/* O roteiro como texto puro                                                  */
/* -------------------------------------------------------------------------- */

/**
 * O roteiro do jeito que ele vai para o WhatsApp de quem vai entrevistar.
 *
 * Sem markdown, sem emoji, sem tabela: quem lê isso está em pé, no celular, na
 * sala ao lado. Cada pergunta leva junto o fato que a originou e os dois lados
 * da leitura, porque fora do painel ninguém mais tem a tela para consultar — e
 * uma pergunta sem o "faz sentido se" vira interrogatório.
 */
export function duvidasParaTexto(
  item: Candidatura,
  leituras: Record<string, LeituraResposta>,
  respostas: Record<string, string>,
): string {
  const duvidas = montarDuvidas(item);
  const nome = item.nome.trim() === "" ? "candidata" : item.nome.trim();
  const linhas: string[] = [`O QUE PERGUNTAR — ${nome}`];

  const cabecalho = [
    item.vagaTitulo.trim() === "" ? "" : `Vaga: ${item.vagaTitulo.trim()}`,
    item.protocolo === "" ? "" : `Protocolo: ${item.protocolo}`,
  ].filter((t) => t !== "");
  linhas.push(...cabecalho, fraseCurta(duvidas, leituras), "");

  if (duvidas.length === 0) {
    linhas.push(
      "O currículo está completo e datado: não sobrou nada para confirmar antes da conversa.",
    );
    return linhas.join("\n");
  }

  duvidas.forEach((d, i) => {
    linhas.push(`${i + 1}. ${d.pergunta}`);
    if (d.oQueChamouAtencao.trim() !== "") {
      linhas.push(`   o que chamou atenção: ${d.oQueChamouAtencao.trim()}`);
    }
    if (temLeitura(d)) {
      if (d.seConvence.trim() !== "") linhas.push(`   faz sentido se: ${d.seConvence.trim()}`);
      if (d.seNaoConvence.trim() !== "") {
        linhas.push(`   não faz sentido se: ${d.seNaoConvence.trim()}`);
      }
    }

    const leitura = leituras[d.id] ?? "";
    if (leitura !== "") linhas.push(`   leitura: ${rotuloDaLeitura(leitura)}`);
    const resposta = (respostas[d.id] ?? "").trim();
    if (resposta !== "") linhas.push(`   resposta: ${resposta}`);
    linhas.push("");
  });

  linhas.push("Os dois lados acima são apoio à leitura, não veredito: quem decide é a entrevista.");
  // Duas linhas em branco seguidas viram uma só — o texto vai para o WhatsApp,
  // onde respiro sobrando come tela de celular.
  return linhas.filter((l, i, todas) => !(l === "" && todas[i - 1] === "")).join("\n");
}

/* -------------------------------------------------------------------------- */
/* O resumo de uma linha                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A versão de cabeçalho: cabe no topo da gaveta e num cartão de kanban de
 * 240px. Diz quantas dúvidas restam e quantas pesam — nada mais.
 *
 * Nunca devolve `null`: mesmo sem dúvida nenhuma há o que dizer, e "currículo
 * sem pendência" é informação que o RH quer bater o olho. Quem decide esconder
 * é quem chama — como no `PainelSinais`, o cartão do kanban só monta este selo
 * depois que a análise existe, senão ele afirmaria algo que ninguém conferiu.
 *
 * `superficie` existe por causa da tabela, que é a única superfície BRANCA onde
 * este selo aparece. A regra do cliente é literal: sobre verde a letra é branca,
 * sobre branco a letra é `text-ink`. Sem a variante, a pílula sairia branca
 * sobre branco na linha da tabela — invisível, não discreta. O lime também troca
 * de tom no claro: como glifo sobre branco ele mede 2,81:1 e reprovaria, então
 * ali o ícone vai de `text-forest`, que é ícone e não letra.
 */
export function ResumoDuvidas(props: {
  item: Candidatura;
  leituras: Record<string, LeituraResposta>;
  superficie?: "escura" | "clara" | undefined;
}) {
  const duvidas = useMemo(() => montarDuvidas(props.item), [props.item]);
  const frase = fraseCurta(duvidas, props.leituras);
  // "Limpo" é o estado sem pendência: nenhuma dúvida, ou todas já esclarecidas.
  const limpo = duvidas.length === 0 || frase.startsWith("Todas");
  const clara = props.superficie === "clara";

  const pintura = clara
    ? limpo
      ? "bg-mint text-ink ring-1 ring-forest/25"
      : "bg-white text-ink ring-1 ring-border-soft"
    : limpo
      ? "bg-lime/15 text-white ring-1 ring-lime/45"
      : "bg-white/10 text-white ring-1 ring-white/25";
  const corDoIcone = clara ? "text-forest" : "text-lime";

  return (
    <span className={`${PILULA} ${pintura}`}>
      {limpo ? (
        <CircleCheck className={`h-3 w-3 shrink-0 ${corDoIcone}`} aria-hidden="true" />
      ) : (
        <MessageCircleQuestion className={`h-3 w-3 shrink-0 ${corDoIcone}`} aria-hidden="true" />
      )}
      {frase}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Peças do cartão                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Convenceu · Em parte · Não convenceu.
 *
 * É um `radiogroup` de verdade, e não três `aria-pressed`: as três leituras são
 * excludentes ("como você leu ESTA resposta"), e prometer alternância ao leitor
 * de tela seria descrever um controle que a tela não tem. Vem com o roving
 * tabindex da WAI-ARIA — o Tab entra e sai do grupo inteiro, as setas escolhem
 * — e a seta já marca ao mover, senão quem usa teclado ficaria sem jeito de
 * selecionar. Desmarcar tem botão próprio, fora do grupo, porque um rádio não
 * volta ao estado "ainda não perguntei" por clique.
 */
function GrupoLeitura(props: {
  legenda: string;
  valor: LeituraResposta;
  aoEscolher: (valor: LeituraResposta) => void;
}) {
  const { legenda, valor, aoEscolher } = props;
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);

  const marcado = LEITURAS.findIndex((l) => l.valor === valor);
  const tabulavel = marcado >= 0 ? marcado : 0;

  const aoTeclar = (evento: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const total = LEITURAS.length;
    let destino = -1;
    if (evento.key === "ArrowRight" || evento.key === "ArrowDown") destino = (indice + 1) % total;
    if (evento.key === "ArrowLeft" || evento.key === "ArrowUp") {
      destino = (indice - 1 + total) % total;
    }
    if (evento.key === "Home") destino = 0;
    if (evento.key === "End") destino = total - 1;
    if (destino < 0) return;

    evento.preventDefault();
    const opcao = LEITURAS[destino];
    if (opcao === undefined) return;
    aoEscolher(opcao.valor);
    botoes.current[destino]?.focus();
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div role="radiogroup" aria-label={legenda} className="flex flex-wrap gap-1.5">
        {LEITURAS.map((l, i) => {
          const ativo = valor === l.valor;
          const Icone = iconeDe(l.icone);
          return (
            <button
              key={l.valor}
              ref={(el) => {
                botoes.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={ativo}
              tabIndex={i === tabulavel ? undefined : -1}
              onKeyDown={(e) => aoTeclar(e, i)}
              onClick={() => aoEscolher(l.valor)}
              className={[
                // 44px de alvo mínimo: a marcação acontece com a candidata na
                // frente, no celular, sem tempo de mirar.
                "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-bold ring-1 transition",
                ativo
                  ? (ATIVO_POR_LEITURA[l.valor] ?? "bg-white text-ink ring-white")
                  : "bg-white/10 text-white ring-white/20 hover:bg-white/20",
              ].join(" ")}
            >
              <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
              {l.rotulo}
            </button>
          );
        })}
      </div>

      {valor === "" ? null : (
        <button
          type="button"
          onClick={() => aoEscolher("")}
          className="inline-flex min-h-11 items-center rounded-full px-3 text-xs font-bold text-white/85 underline underline-offset-4 hover:text-white"
        >
          limpar
        </button>
      )}
    </div>
  );
}

/** O campo de anotação. Cresce com o texto para não esconder o que já foi escrito. */
function CampoResposta(props: { id: string; valor: string; aoMudar: (texto: string) => void }) {
  const { id, valor, aoMudar } = props;
  const ref = useRef<HTMLTextAreaElement>(null);

  // A altura acompanha o conteúdo: quem anota durante a conversa escreve três
  // linhas sem perceber, e uma caixa de duas linhas esconderia a primeira.
  // Roda só no cliente, por `useEffect` — no SSR não há layout para medir.
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [valor]);

  return (
    <div className="mt-2.5">
      <label htmlFor={id} className={ROTULO}>
        O que ela respondeu
      </label>
      <textarea
        id={id}
        ref={ref}
        rows={2}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder="Anote com as palavras dela — é o que sustenta a decisão depois."
        className={`${CAMPO} mt-1 resize-y`}
      />
    </div>
  );
}

/** Um dos dois lados da leitura. */
function LadoDaLeitura(props: { tipo: "convence" | "nao-convence"; texto: string }) {
  const { tipo, texto } = props;
  const positivo = tipo === "convence";

  /* Ícone próprio e rótulo escrito em cada lado, de propósito: quem não
     distingue o lime do rosé precisa continuar sabendo qual metade é qual, e
     cor sozinha nunca pode ser a única portadora do significado (WCAG 1.4.1).
     A cor aqui é reforço, não informação. */
  const Icone = positivo ? CircleCheck : CircleX;

  return (
    <div
      className={`rounded-xl px-3 py-2.5 ring-1 ${
        positivo ? "bg-lime/10 ring-lime/30" : "bg-rose-300/10 ring-rose-200/40"
      }`}
    >
      <p className="flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-white">
        <Icone
          className={`h-3.5 w-3.5 shrink-0 ${positivo ? "text-lime" : "text-rose-200"}`}
          aria-hidden="true"
        />
        {positivo ? "Faz sentido se…" : "Não faz sentido se…"}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-white/85">{texto}</p>
    </div>
  );
}

function CartaoDuvida(props: {
  duvida: DuvidaAberta;
  numero: number;
  leitura: LeituraResposta;
  resposta: string;
  somenteLeitura: boolean;
  aoMudarLeitura: (leitura: LeituraResposta) => void;
  aoMudarResposta: (texto: string) => void;
}) {
  const { duvida, numero, leitura, resposta, somenteLeitura } = props;
  const idCampo = useId();
  const sev = severidadePor(duvida.severidade);
  const IconeSev = iconeDe(sev.icone);
  const origem = MARCA_ORIGEM[duvida.origem];
  const IconeOrigem = origem.icone;
  const alerta = pesaNaDecisao(duvida, leitura);

  return (
    /* O cartão inteiro NÃO é clicável: dentro dele há rádios, um textarea e
       texto que o RH quer selecionar para colar no WhatsApp. Um `onClick` no
       contêiner roubaria a seleção e criaria um alvo que leitor de tela não
       sabe anunciar. */
    <li className="rounded-2xl bg-white/[0.05] p-3.5 ring-1 ring-white/10 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lime/15 text-xs font-extrabold tabular-nums text-white ring-1 ring-lime/30">
          {numero}
        </span>
        <span className={`${PILULA} ${sev.pilulaEscura}`}>
          <IconeSev className="h-3 w-3 shrink-0" aria-hidden="true" />
          {sev.rotulo}
        </span>
        <span className={`${PILULA} bg-white/10 text-white/85 ring-1 ring-white/20`}>
          <IconeOrigem className="h-3 w-3 shrink-0 text-lime" aria-hidden="true" />
          {origem.rotulo}
        </span>
      </div>

      {/* A pergunta é o que o RH lê em voz alta: tamanho de leitura, não de
          legenda. É o maior texto do cartão de propósito. */}
      <p className="mt-2.5 text-base font-bold leading-relaxed text-white sm:text-[1.05rem]">
        {duvida.pergunta}
      </p>

      {duvida.oQueChamouAtencao.trim() === "" ? null : (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-white/85">
          <Search className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lime" aria-hidden="true" />
          <span>
            <strong className="font-bold text-white">O que chamou atenção: </strong>
            {duvida.oQueChamouAtencao}
          </span>
        </p>
      )}

      {/* Lado a lado no desktop, empilhados no celular — e o positivo sempre em
          primeiro, para que a conversa comece pela hipótese boa. Some inteiro
          quando o catálogo não tem leitura (é o caso do sinal de dado sensível,
          que a clínica precisa VER e não pode usar contra ninguém). */}
      {temLeitura(duvida) ? (
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          {duvida.seConvence.trim() === "" ? null : (
            <LadoDaLeitura tipo="convence" texto={duvida.seConvence} />
          )}
          {duvida.seNaoConvence.trim() === "" ? null : (
            <LadoDaLeitura tipo="nao-convence" texto={duvida.seNaoConvence} />
          )}
        </div>
      ) : null}

      {somenteLeitura ? null : (
        <div className="mt-3 border-t border-white/10 pt-3">
          <p className={ROTULO}>Como você leu a resposta</p>
          <div className="mt-1.5">
            <GrupoLeitura
              legenda={`Como você leu a resposta da pergunta ${numero}`}
              valor={leitura}
              aoEscolher={props.aoMudarLeitura}
            />
          </div>
          <CampoResposta id={idCampo} valor={resposta} aoMudar={props.aoMudarResposta} />
        </div>
      )}

      {/* Aviso, não bloqueio: a tela não decide nada, só se recusa a deixar
          passar em silêncio uma dúvida grave que a conversa não resolveu. */}
      {alerta ? (
        <p className="mt-2.5 flex items-start gap-2 rounded-xl bg-rose-300/15 px-3 py-2 text-xs font-semibold leading-relaxed text-white ring-1 ring-rose-200/45">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-200" aria-hidden="true" />
          <span>
            Isso pesa na decisão: a dúvida é de gravidade {sev.rotulo.toLowerCase()} e continuou em
            aberto depois da conversa. Nada aqui trava o processo — se for avançar mesmo assim,
            escreva o motivo na ficha.
          </span>
        </p>
      ) : null}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* A folha de impressão                                                       */
/* -------------------------------------------------------------------------- */

/**
 * O roteiro em A4, preto no branco.
 *
 * Ao contrário da folha da ficha — que fica sempre montada para o Ctrl+P do
 * navegador pegar —, esta só existe enquanto o botão "Imprimir roteiro" está
 * imprimindo. O motivo é convivência: o CSS de impressão mostra TODA `.rh-folha`
 * do documento, e as duas moram na mesma gaveta; montada o tempo todo, ela sairia
 * grampeada em qualquer impressão da ficha. Quem quer a ficha aperta o botão da
 * ficha; quem quer o roteiro aperta este.
 */
function FolhaDuvidas(props: {
  item: Candidatura;
  duvidas: DuvidaAberta[];
  leituras: Record<string, LeituraResposta>;
  respostas: Record<string, string>;
}) {
  const { item, duvidas, leituras, respostas } = props;
  const nome = item.nome.trim() === "" ? "candidata" : item.nome.trim();
  const dados = [
    `Vaga: ${item.vagaTitulo.trim() === "" ? "____________________" : item.vagaTitulo.trim()}`,
    `Protocolo: ${item.protocolo === "" ? "__________" : item.protocolo}`,
    fraseCurta(duvidas, leituras),
  ].join(" · ");

  return (
    /* `rh-folha-exclusiva`: enquanto esta folha existe no DOM, a folha da ficha
       — que mora na mesma gaveta e fica sempre montada — sai do papel. Ver a
       regra de mesmo nome em `styles.css`. */
    <section className="rh-folha rh-folha-exclusiva" aria-hidden="true">
      <CabecalhoFolha
        titulo={`O que perguntar — ${nome}`}
        subtitulo="Cada pergunta nasceu de um fato do currículo. Os dois lados ajudam a ler a resposta."
        linhaDados={dados}
        confidencial
      />

      {duvidas.length === 0 ? (
        <p>
          Nenhuma dúvida em aberto neste currículo: os períodos, o contato e a formação estão
          completos e datados.
        </p>
      ) : (
        <div className="rh-folha-bloco">
          <ol>
            {duvidas.map((d) => {
              const leitura = leituras[d.id] ?? "";
              const resposta = (respostas[d.id] ?? "").trim();
              return (
                <li key={d.id}>
                  <p className="rh-folha-pergunta">{d.pergunta}</p>
                  {d.oQueChamouAtencao.trim() === "" ? null : (
                    <p className="rh-folha-ajuda">o que chamou atenção: {d.oQueChamouAtencao}</p>
                  )}
                  {d.seConvence.trim() === "" ? null : (
                    <p className="rh-folha-ajuda">faz sentido se: {d.seConvence}</p>
                  )}
                  {d.seNaoConvence.trim() === "" ? null : (
                    <p className="rh-folha-ajuda">não faz sentido se: {d.seNaoConvence}</p>
                  )}
                  {leitura === "" ? null : <p>Leitura: {rotuloDaLeitura(leitura)}</p>}
                  {resposta === "" ? <span className="rh-folha-linha" /> : <p>{resposta}</p>}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <p className="rh-folha-rodape">
        Os dois lados são apoio à leitura, não veredito: quem decide é a entrevista.
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* O painel                                                                   */
/* -------------------------------------------------------------------------- */

export function PainelDuvidas(props: {
  item: Candidatura;
  leituras: Record<string, LeituraResposta>;
  respostas: Record<string, string>;
  /** Na gaveta, antes de haver entrevista: mostra o roteiro sem os campos. */
  somenteLeitura?: boolean | undefined;
  /**
   * Quem já anuncia "O que perguntar" por fora — a sanfona da gaveta — pede
   * para o painel não repetir o próprio título. Dois títulos iguais colados um
   * no outro é a poluição que a sanfona veio resolver, e no leitor de tela
   * seriam duas regiões com o mesmo nome.
   *
   * O modo entrevista continua com o cabeçalho: lá o painel é a tela inteira e
   * precisa se apresentar.
   */
  semCabecalho?: boolean | undefined;
  aoMudarLeitura: (idDuvida: string, leitura: LeituraResposta) => void;
  aoMudarResposta: (idDuvida: string, texto: string) => void;
}) {
  const { item, leituras, respostas } = props;
  const somenteLeitura = props.somenteLeitura === true;
  /* Id gerado, e não fixo: o modo entrevista abre POR CIMA da gaveta sem
     desmontá-la, então as duas cópias do painel convivem no mesmo documento —
     com um id escrito à mão, o `aria-labelledby` de uma apontaria para o título
     da outra. */
  const uid = useId();
  const idTitulo = `${uid}-duvidas-titulo`;

  const [copiado, setCopiado] = useState<"" | "sim" | "nao">("");
  const [imprimindo, setImprimindo] = useState(false);

  const duvidas = useMemo(() => montarDuvidas(item), [item]);
  const resumo = resumoDasLeituras(duvidas, leituras);
  const aberto = duvidasEmAberto(duvidas, leituras);

  /**
   * A impressão acontece em três tempos: o estado monta a folha, o navegador
   * pinta, e só então o diálogo abre. Chamar `print()` no mesmo quadro do clique
   * imprimiria a página sem a folha — ela ainda não existe no DOM.
   */
  useEffect(() => {
    if (!imprimindo) return;
    const fim = () => setImprimindo(false);
    window.addEventListener("afterprint", fim);
    const id = window.setTimeout(() => window.print(), 90);
    return () => {
      window.removeEventListener("afterprint", fim);
      window.clearTimeout(id);
    };
  }, [imprimindo]);

  const copiar = async (texto: string) => {
    const ok = await copiarTexto(texto);
    setCopiado(ok ? "sim" : "nao");
    window.setTimeout(() => setCopiado(""), 2500);
  };

  const semCabecalho = props.semCabecalho === true;

  return (
    <section {...(semCabecalho ? {} : { "aria-labelledby": idTitulo })}>
      {semCabecalho ? null : (
        <header>
          <h3
            id={idTitulo}
            className="flex items-center gap-2 font-display text-lg font-extrabold leading-tight text-white"
          >
            <MessageCircleQuestion className="h-5 w-5 shrink-0 text-lime" aria-hidden="true" />O que
            perguntar
          </h3>
          {/* Sem jargão: o RH desta clínica é a coordenação, não um time de
              recrutamento. A frase explica de onde vem a pergunta e para que
              servem os dois lados, que é tudo o que ele precisa saber para usar. */}
          <p className="mt-1 text-sm leading-relaxed text-white/85">
            Cada pergunta abaixo nasceu de um fato do currículo desta candidata — não é lista
            pronta. Embaixo de cada uma estão os dois lados da resposta: o que faz sentido ouvir e o
            que não faz. Marque como você leu, e a conversa vira registro.
          </p>
        </header>
      )}

      <div className={`flex flex-wrap items-center gap-2 ${semCabecalho ? "" : "mt-3"}`}>
        <ResumoDuvidas item={item} leituras={leituras} />
        <span className="text-xs font-semibold leading-relaxed text-white/85">{resumo.frase}</span>
      </div>

      {duvidas.length === 0 ? (
        /* Vazio nunca é silêncio: "não sobrou nada para perguntar" é uma
           informação que o RH quer ler, e um bloco em branco só faz a pessoa se
           perguntar se a tela carregou. */
        <div className="mt-3 rounded-xl bg-lime/10 px-3 py-3 ring-1 ring-lime/30">
          <p className="flex items-center gap-2 text-sm font-bold text-white">
            <CircleCheck className="h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
            Nenhuma dúvida em aberto neste currículo
          </p>
          <p className="mt-1 text-xs leading-relaxed text-white/85">
            Isso acontece quando o currículo está completo e datado: períodos com mês e ano, contato
            no lugar, sem lacuna nem sobreposição para conferir. É um bom sinal sobre a candidata —
            e não uma falha da análise. Vá direto para as perguntas gerais do guia.
          </p>
        </div>
      ) : (
        <ol className="mt-3 space-y-2.5">
          {/* A ordem é a que `montarDuvidas` devolveu, sem reordenar: o que pode
              eliminar vem antes do que só esclarece. */}
          {duvidas.map((d, i) => (
            <CartaoDuvida
              key={d.id}
              duvida={d}
              numero={i + 1}
              leitura={leituras[d.id] ?? ""}
              resposta={respostas[d.id] ?? ""}
              somenteLeitura={somenteLeitura}
              aoMudarLeitura={(l) => props.aoMudarLeitura(d.id, l)}
              aoMudarResposta={(t) => props.aoMudarResposta(d.id, t)}
            />
          ))}
        </ol>
      )}

      {/* ---------- Ações ---------- */}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-3">
        <button
          type="button"
          onClick={() => void copiar(duvidasParaTexto(item, leituras, respostas))}
          className={`${BOTAO_SECUNDARIO} min-h-11 px-3 text-xs`}
        >
          {copiado === "sim" ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Copiar roteiro
        </button>
        <button
          type="button"
          onClick={() => setImprimindo(true)}
          className={`${BOTAO_SECUNDARIO} min-h-11 px-3 text-xs`}
        >
          <Printer className="h-3.5 w-3.5" aria-hidden="true" />
          Imprimir roteiro
        </button>
      </div>

      <p role="status" aria-live="polite" className="mt-1.5 text-xs font-semibold text-white">
        {copiado === "sim" ? "Roteiro copiado para a área de transferência." : ""}
        {copiado === "nao" ? (
          <span className="text-amber-200">
            Não consegui copiar neste navegador — imprima ou selecione o texto à mão.
          </span>
        ) : null}
        {copiado === "" && !somenteLeitura && aberto > 0 ? (
          <span className="text-white/85">
            {aberto === 1
              ? "1 pergunta ainda sem leitura."
              : `${aberto} perguntas ainda sem leitura.`}
          </span>
        ) : null}
      </p>

      {imprimindo ? (
        <FolhaDuvidas item={item} duvidas={duvidas} leituras={leituras} respostas={respostas} />
      ) : null}
    </section>
  );
}
