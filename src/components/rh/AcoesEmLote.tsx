/**
 * Barra de ações em lote da aba Candidaturas — o "e tudo mais" do pedido.
 *
 * O que existia era uma tela para tratar UMA candidata por vez. Na prática a
 * recepção trabalha em bloco: chegaram doze currículos de recepcionista, seis
 * prestam, e as seis precisam receber o mesmo convite hoje. Sem isto, o RH abre
 * gaveta por gaveta e reescreve a mesma frase seis vezes — e é aí que uma fica
 * sem resposta.
 *
 * A decisão mais importante deste arquivo é o que ele NÃO faz: convidar em lote
 * não abre uma aba por candidata. Ver o comentário do painel de convites.
 *
 * SUPERFÍCIE: barra escura sobre o verde da marca. Vale a regra do cliente sem
 * exceção — fundo verde, letra branca; nada de `text-lime` em letra, nada de
 * branco abaixo de 85%. Lime só em ícone, anel e borda.
 *
 * RELÓGIO: `agora` desce por prop e monta tudo que é RENDERIZADO. `new Date()`
 * aparece só dentro de manipuladores de clique — o carimbo do histórico precisa
 * da hora real do envio, e não da hora em que a aba foi aberta.
 */
import { useEffect, useId, useState } from "react";
import {
  CalendarPlus,
  Check,
  Copy,
  Download,
  MessageCircle,
  MoveRight,
  Send,
  X,
} from "lucide-react";

import { CLINICA } from "@/lib/jp";
import { mascararTelefone, primeiroNome } from "@/lib/rh/formatar";
import type { ContextoMensagem } from "@/lib/rh/mensagens";
import { linhaDeRegistro, linkWhatsapp, montarMensagem } from "@/lib/rh/mensagens";
import { STATUS } from "@/lib/rh/opcoes";
import type { Candidatura, StatusCandidatura } from "@/lib/rh/tipos";

/* -------------------------------------------------------------------------- */
/* Estilo                                                                     */
/* -------------------------------------------------------------------------- */

const BOTAO =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-3.5 text-sm font-bold " +
  "ring-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-45";

/** Ação principal em `bg-forest`, e não `bg-lime`: com letra branca o lime dá
 *  3,0:1 e o forest passa de 8:1 — a regra do cliente e a leitura fecham juntas. */
const BOTAO_PRIMARIO = `${BOTAO} bg-forest text-white ring-lime hover:bg-forest/80`;
const BOTAO_SECUNDARIO = `${BOTAO} bg-white/10 text-white ring-white/25 hover:bg-white/20`;

const AJUDA = "text-xs leading-relaxed text-white/85";

/** Duração do aviso de cópia: tempo de ler, sem virar poluição. */
const MS_AVISO = 2000;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Mesmo caminho duplo de `CentralContato`: sem contexto seguro, `execCommand`. */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // Segue para o caminho antigo.
  }
  try {
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
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

function vagaDe(item: Candidatura): string {
  return item.vagaTitulo.trim() || item.cargoDesejado.trim() || "candidatura espontânea";
}

function nomeDe(item: Candidatura): string {
  return item.nome.trim() === "" ? "Candidatura sem nome" : item.nome.trim();
}

/* -------------------------------------------------------------------------- */
/* Painel de convites                                                         */
/* -------------------------------------------------------------------------- */

function PainelConvites(props: {
  id: string;
  itens: Candidatura[];
  agora: Date;
  remetente: string;
  aoRegistrar: (id: string, texto: string) => void;
  aoFechar: () => void;
}) {
  const { id, itens, agora, remetente, aoRegistrar, aoFechar } = props;
  const [abertas, setAbertas] = useState<string[]>([]);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    if (aviso === "") return undefined;
    const t = window.setTimeout(() => setAviso(""), MS_AVISO);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const clinica = {
    nome: CLINICA.nome,
    telefone: CLINICA.telefone,
    endereco: CLINICA.endereco,
    horario: CLINICA.horario,
  };

  /** Uma mensagem POR candidata: o nome dela, a vaga dela, a data dela. */
  const linhas = itens.map((item) => {
    const ctx: ContextoMensagem = { item, clinica, remetente, agora };
    const texto = montarMensagem("convite-entrevista", ctx);
    return { item, texto, href: linkWhatsapp(item.telefone, texto) };
  });

  function registrar(item: Candidatura, acao: string, canal: string): void {
    // Hora REAL do clique, não o `agora` da página: uma aba aberta desde as 8h
    // carimbaria "às 08:00" num envio das 17h.
    aoRegistrar(item.id, linhaDeRegistro({ acao, canal, remetente, quando: new Date() }));
  }

  function marcar(idItem: string): void {
    setAbertas((atual) => (atual.includes(idItem) ? atual : [...atual, idItem]));
  }

  const faltam = linhas.filter((l) => !abertas.includes(l.item.id)).length;

  return (
    <div
      id={id}
      className="rh-scroll mb-3 max-h-[55dvh] overflow-y-auto rounded-2xl border border-white/15 bg-brand-deep/95 p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-extrabold text-white">
            Convite para entrevista · {linhas.length}{" "}
            {linhas.length === 1 ? "candidata" : "candidatas"}
          </h3>
          {/*
            UMA aba por vez, de propósito, e este é o ponto do arquivo:
            `window.open` em laço é bloqueado pelo navegador a partir da segunda
            aba (só a primeira nasce de um gesto do usuário), então metade das
            candidatas simplesmente não receberia nada — em silêncio, sem erro
            na tela. E mesmo que abrisse, vinte abas de WhatsApp fazem o RH
            perder a conta de quem já falou com quem, que é o erro caro: a
            candidata que recebe duas vezes fica confusa, e a que não recebe
            some do processo. Aqui cada linha é um clique, e o que já foi aberto
            fica marcado — inclusive no histórico dela.
          */}
          <p className={`mt-1 ${AJUDA}`}>
            Uma linha por candidata, cada uma com o nome e a vaga dela. Abra uma de cada vez: o
            navegador bloqueia abas em série, e assim ninguém recebe duas vezes nem fica de fora.
          </p>
        </div>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar os convites"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/25 transition hover:bg-white/20"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

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

      <ul className="mt-2 space-y-2">
        {linhas.map(({ item, texto, href }) => {
          const feita = abertas.includes(item.id);
          const nome = nomeDe(item);
          return (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.06] p-2.5 ring-1 ring-white/15"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-white">{nome}</span>
                <span className={`block truncate ${AJUDA}`}>
                  {vagaDe(item)}
                  {item.telefone.trim() === "" ? " · sem telefone no cadastro" : ""}
                </span>
              </span>

              {feita ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-lime/45">
                  <Check className="h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
                  Enviado
                </span>
              ) : null}

              {href === "" ? (
                /* Sem telefone válido não há WhatsApp — e um botão morto seria
                   pior que o caminho que sempre funciona: copiar e colar. */
                <button
                  type="button"
                  className={BOTAO_SECUNDARIO}
                  onClick={() => {
                    void copiarTexto(texto).then((ok) => {
                      if (!ok) {
                        setAviso("Não consegui copiar. Selecione o texto e use Ctrl+C.");
                        return;
                      }
                      setAviso(`Mensagem de ${primeiroNome(nome) || "candidata"} copiada!`);
                      marcar(item.id);
                      registrar(item, "Convite para entrevista copiado para envio manual", "");
                    });
                  }}
                >
                  <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Copiar texto
                  <span className="sr-only"> do convite de {nome}</span>
                </button>
              ) : (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    marcar(item.id);
                    registrar(item, "Convite para entrevista enviado", "WhatsApp");
                  }}
                  className={feita ? BOTAO_SECUNDARIO : BOTAO_PRIMARIO}
                >
                  <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {feita ? "Abrir de novo" : "Abrir WhatsApp"}
                  <span className="sr-only"> de {nome}</span>
                </a>
              )}
            </li>
          );
        })}
      </ul>

      <p className={`mt-3 ${AJUDA}`} aria-live="polite">
        {faltam === 0
          ? "Todas as candidatas desta lista já receberam o convite."
          : `Faltam ${faltam} de ${linhas.length}. Cada envio já entrou no histórico da candidata.`}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Barra                                                                      */
/* -------------------------------------------------------------------------- */

export function AcoesEmLote(props: {
  /** As candidaturas realmente selecionadas, já resolvidas pelo pai. */
  itens: Candidatura[];
  agora: Date;
  remetente: string;
  aoLimpar: () => void;
  aoMoverStatus: (id: string, status: StatusCandidatura) => void;
  aoRegistrar: (id: string, texto: string) => void;
  aoExportar: (itens: Candidatura[]) => void;
}) {
  const { itens, agora, remetente, aoLimpar, aoMoverStatus, aoRegistrar, aoExportar } = props;
  const uid = useId();
  const idConvites = `${uid}-convites`;

  const [convidando, setConvidando] = useState(false);
  const [destino, setDestino] = useState<StatusCandidatura | "">("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    if (aviso === "") return undefined;
    const t = window.setTimeout(() => setAviso(""), MS_AVISO);
    return () => window.clearTimeout(t);
  }, [aviso]);

  // A seleção esvaziou embaixo do painel (o RH desmarcou tudo, ou um filtro
  // tirou as pessoas da tela): manter aberta uma lista que já não corresponde
  // ao que está selecionado é convite a erro.
  useEffect(() => {
    if (itens.length === 0) setConvidando(false);
  }, [itens.length]);

  if (itens.length === 0) return null;

  const comTelefone = itens.filter((c) => c.telefone.trim() !== "");

  function copiarTelefones(): void {
    // Nome junto do número: uma lista de onze dígitos soltos não serve para
    // nada depois de colada — ninguém sabe de quem é qual.
    const linhas = comTelefone.map((c) => `${nomeDe(c)}: ${mascararTelefone(c.telefone)}`);
    void copiarTexto(linhas.join("\n")).then((ok) => {
      setAviso(
        ok
          ? `${linhas.length} ${linhas.length === 1 ? "telefone copiado" : "telefones copiados"}.`
          : "Não consegui copiar. Selecione o texto e use Ctrl+C.",
      );
    });
  }

  function moverTodas(): void {
    if (destino === "") return;
    // Uma chamada por candidata, de propósito: é a MESMA função que a gaveta e
    // o kanban usam, com a mesma reversão otimista por item. Uma rota de lote
    // nova daria dois caminhos para o mesmo efeito — e um deles ficaria para
    // trás na primeira mudança de regra.
    for (const item of itens) {
      if (item.status === destino) continue;
      aoMoverStatus(item.id, destino);
    }
    setDestino("");
  }

  return (
    <div
      role="region"
      aria-label="Ações para as candidaturas selecionadas"
      className="sticky bottom-0 z-40 border-t border-lime/25 bg-brand-deep/95 backdrop-blur-xl"
    >
      <div className="jp-container py-3">
        {convidando ? (
          <PainelConvites
            id={idConvites}
            itens={itens}
            agora={agora}
            remetente={remetente}
            aoRegistrar={aoRegistrar}
            aoFechar={() => setConvidando(false)}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm font-semibold text-white">
            <strong className="font-display text-lg font-extrabold tabular-nums">
              {itens.length}
            </strong>{" "}
            {itens.length === 1 ? "selecionada" : "selecionadas"}
          </p>

          <button
            type="button"
            className={BOTAO_PRIMARIO}
            aria-expanded={convidando}
            aria-controls={idConvites}
            onClick={() => setConvidando((v) => !v)}
          >
            <CalendarPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
            Convidar para entrevista
          </button>

          {/* Mover é select + botão, e não um menu que aplica no clique: é a
              ação irreversível deste grupo (muda o status de todo mundo de uma
              vez) e merece o segundo gesto. */}
          <span className="flex items-center gap-2">
            <label htmlFor={`${uid}-destino`} className="sr-only">
              Mover as selecionadas para
            </label>
            <select
              id={`${uid}-destino`}
              value={destino}
              onChange={(e) => setDestino(e.target.value as StatusCandidatura | "")}
              className="h-11 min-w-[10rem] rounded-full border border-white/20 bg-white/[0.07] px-3 text-sm font-semibold text-white transition-colors hover:border-white/35"
            >
              <option value="" className="bg-brand-deep text-white">
                Mover para…
              </option>
              {STATUS.map((s) => (
                <option key={s.valor} value={s.valor} className="bg-brand-deep text-white">
                  {s.rotulo}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={BOTAO_SECUNDARIO}
              disabled={destino === ""}
              onClick={moverTodas}
            >
              <MoveRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              Mover
            </button>
          </span>

          <button
            type="button"
            className={BOTAO_SECUNDARIO}
            disabled={comTelefone.length === 0}
            onClick={copiarTelefones}
          >
            <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
            Copiar telefones
            <span className="tabular-nums"> ({comTelefone.length})</span>
          </button>

          <button type="button" className={BOTAO_SECUNDARIO} onClick={() => aoExportar(itens)}>
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            Exportar selecionadas
            <span className="sr-only"> em CSV</span>
          </button>

          <button type="button" className={BOTAO_SECUNDARIO} onClick={aoLimpar}>
            <X className="h-4 w-4 shrink-0" aria-hidden="true" />
            Limpar seleção
          </button>
        </div>

        <p role="status" aria-live="polite" className="mt-1.5 min-h-5 text-xs font-bold text-white">
          {aviso === "" ? (
            ""
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Send className="h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
              {aviso}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
