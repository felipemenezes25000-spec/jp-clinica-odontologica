/**
 * Controles compartilhados entre o editor de vaga e as configurações do portal.
 *
 * Vivem num arquivo próprio porque a lista editável e o interruptor aparecem
 * nas duas telas com exatamente o mesmo comportamento — duplicar significaria
 * corrigir teclado e leitor de tela em dois lugares a cada ajuste.
 *
 * Os dois são desenhados para superfície CLARA (`.rh-papel`, `bg-paper`), que é
 * onde todo formulário do painel vive: os tokens `.rh-rotulo` e `.rh-ajuda`
 * usam --brand-text e --ink-soft, que só têm contraste em fundo claro.
 */
import { useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, Check, Plus, Sparkles, X } from "lucide-react";

/**
 * O servidor corta qualquer lista em 20 itens ao gravar. Travar aqui no mesmo
 * número é o que evita a pior experiência possível: escrever o vigésimo
 * primeiro requisito, salvar, e vê-lo sumir sem explicação.
 */
const MAX_ITENS = 20;

const BOTAO_ICONE =
  "inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border-soft bg-white " +
  "text-ink-soft transition hover:border-forest hover:text-forest " +
  "disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-border-soft " +
  "disabled:hover:text-ink-soft";

/** Move um item de posição devolvendo um array novo; fora do intervalo, não mexe. */
function mover(itens: string[], de: number, para: number): string[] {
  if (para < 0 || para >= itens.length) return itens;
  const item = itens[de];
  if (item === undefined) return itens;
  const copia = [...itens];
  copia.splice(de, 1);
  copia.splice(para, 0, item);
  return copia;
}

function jaTem(itens: string[], texto: string): boolean {
  const alvo = texto.trim().toLowerCase();
  return itens.some((i) => i.trim().toLowerCase() === alvo);
}

/**
 * Lista ordenada de textos curtos (responsabilidades, requisitos, benefícios).
 *
 * A ordem é conteúdo, não enfeite: o candidato lê os três primeiros itens e
 * decide se continua. Por isso subir/descer são botões de verdade, e não
 * arrastar-e-soltar — arrastar não funciona no teclado nem com leitor de tela,
 * e aqui a lista tem no máximo 20 linhas.
 */
export function ListaEditavel(props: {
  rotulo: string;
  ajuda: string;
  placeholder: string;
  itens: string[];
  /** Atalhos de preenchimento. Vazio esconde o bloco de sugestões inteiro. */
  sugestoes: string[];
  rotuloSugestoes: string;
  aoMudar: (itens: string[]) => void;
}) {
  const [rascunho, setRascunho] = useState("");
  const id = useId();
  const idCampo = `${id}-campo`;
  const idAjuda = `${id}-ajuda`;
  const cheia = props.itens.length >= MAX_ITENS;

  const adicionar = (texto: string) => {
    const limpo = texto.trim();
    if (limpo.length === 0 || cheia) return;
    // Repetido não agrega nada ao anúncio e ainda gasta uma das 20 linhas.
    if (jaTem(props.itens, limpo)) return;
    props.aoMudar([...props.itens, limpo.slice(0, 300)]);
  };

  const aoTeclarNoCampo = (evento: KeyboardEvent<HTMLInputElement>) => {
    if (evento.key !== "Enter") return;
    // Sem o preventDefault o Enter submeteria o formulário que envolve a lista.
    evento.preventDefault();
    adicionar(rascunho);
    setRascunho("");
  };

  const faltando = props.sugestoes.filter((s) => !jaTem(props.itens, s));

  return (
    <fieldset className="min-w-0">
      <legend className="rh-rotulo">{props.rotulo}</legend>

      {props.itens.length > 0 ? (
        <ol className="mb-3 space-y-2">
          {props.itens.map((item, indice) => (
            <li
              // A chave é o texto, e não o índice: subir ou descer um item muda
              // o índice de todos daí para baixo, e com índice na chave o React
              // desmonta e remonta os <li> em vez de movê-los — o botão que a
              // pessoa acabou de apertar deixa de existir e o foco cai no
              // <body>. Texto repetido não acontece: `jaTem` barra duplicata
              // tanto na inclusão avulsa quanto na de todas as sugestões.
              key={item}
              className="flex items-start gap-2 rounded-xl border border-border-soft bg-white p-2"
            >
              <span
                aria-hidden="true"
                className="mt-2 inline-grid h-6 w-6 shrink-0 place-items-center rounded-full bg-mint text-[0.7rem] font-extrabold text-ink"
              >
                {indice + 1}
              </span>
              <span className="min-w-0 flex-1 break-words py-1.5 text-sm font-medium text-ink">
                {item}
              </span>
              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className={BOTAO_ICONE}
                  disabled={indice === 0}
                  aria-label={`Subir "${item}"`}
                  onClick={() => props.aoMudar(mover(props.itens, indice, indice - 1))}
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={BOTAO_ICONE}
                  disabled={indice === props.itens.length - 1}
                  aria-label={`Descer "${item}"`}
                  onClick={() => props.aoMudar(mover(props.itens, indice, indice + 1))}
                >
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={BOTAO_ICONE}
                  aria-label={`Remover "${item}"`}
                  onClick={() => props.aoMudar(props.itens.filter((_, i) => i !== indice))}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="flex gap-2">
        <input
          id={idCampo}
          className="rh-campo min-w-0 flex-1"
          type="text"
          value={rascunho}
          maxLength={300}
          disabled={cheia}
          placeholder={props.placeholder}
          aria-describedby={idAjuda}
          onChange={(e) => setRascunho(e.target.value)}
          onKeyDown={aoTeclarNoCampo}
        />
        <button
          type="button"
          className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-xl bg-forest px-4 text-sm font-extrabold text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-40"
          disabled={cheia || rascunho.trim().length === 0}
          onClick={() => {
            adicionar(rascunho);
            setRascunho("");
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Adicionar
        </button>
      </div>

      <p id={idAjuda} className="rh-ajuda">
        {cheia
          ? `Limite de ${MAX_ITENS} itens atingido. Remova um para incluir outro.`
          : props.ajuda}
      </p>

      {faltando.length > 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-border-soft bg-cream/70 p-3">
          <p className="text-xs font-bold text-ink">{props.rotuloSugestoes}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {faltando.map((sugestao) => (
              <button
                key={sugestao}
                type="button"
                className="rh-chip"
                disabled={cheia}
                onClick={() => adicionar(sugestao)}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {sugestao}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-forest/30 bg-white px-4 text-xs font-extrabold text-ink transition hover:bg-mint disabled:cursor-not-allowed disabled:opacity-40"
            disabled={cheia}
            onClick={() => {
              // Uma chamada só: `adicionar` em laço leria `props.itens` antigo a
              // cada volta e o segundo item substituiria o primeiro.
              const espaco = MAX_ITENS - props.itens.length;
              props.aoMudar([...props.itens, ...faltando.slice(0, espaco)]);
            }}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Adicionar {faltando.length === 1 ? "a sugestão" : `as ${faltando.length} sugestões`}
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}

/**
 * Interruptor liga/desliga.
 *
 * `role="switch"` + `aria-checked` é o que faz o leitor de tela anunciar
 * "ligado/desligado" em vez de "botão". O estado nunca é comunicado só pela
 * cor: além do verde, a bolinha muda de lado e troca o ícone (✓ / ✕).
 */
export function Interruptor(props: {
  rotulo: string;
  descricao: string;
  ligado: boolean;
  desativado: boolean;
  aoMudar: (ligado: boolean) => void;
}) {
  const id = useId();
  const idRotulo = `${id}-rotulo`;
  const idDescricao = `${id}-descricao`;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border-soft bg-white p-3">
      <button
        type="button"
        role="switch"
        aria-checked={props.ligado}
        aria-labelledby={idRotulo}
        aria-describedby={idDescricao}
        disabled={props.desativado}
        onClick={() => props.aoMudar(!props.ligado)}
        className={`rh-alternador inline-flex h-11 w-[4.25rem] shrink-0 items-center rounded-full border p-1 transition disabled:cursor-not-allowed disabled:opacity-45 ${
          props.ligado ? "border-forest bg-forest" : "border-border-soft bg-cream"
        }`}
      >
        {/* 1,625rem = 26px, que é todo o percurso que existe: o trilho tem 68px,
            menos 2px de borda e 8px de padding sobram 58px de caixa de conteúdo,
            e a bolinha ocupa 32px deles. Com os 32px de `translate-x-8` ela
            cobria o padding da direita e vazava 1px além da borda. */}
        <span
          className={`inline-grid h-8 w-8 place-items-center rounded-full bg-white shadow-sm transition-transform ${
            props.ligado ? "translate-x-[1.625rem] text-forest" : "translate-x-0 text-ink-soft"
          }`}
        >
          {props.ligado ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <X className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
      </button>
      <span className="min-w-0 flex-1">
        <span id={idRotulo} className="block text-sm font-extrabold text-ink">
          {props.rotulo}
        </span>
        <span id={idDescricao} className="rh-ajuda block">
          {props.descricao}
        </span>
      </span>
    </div>
  );
}
