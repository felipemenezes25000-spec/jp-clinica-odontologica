/**
 * Cartão de uma vaga no portal público.
 *
 * É o mesmo cartão usado na vitrine (/carreiras) e na lista de vagas
 * relacionadas da página da vaga: quem procura emprego reconhece o formato de
 * uma tela para a outra, em vez de reaprender a leitura a cada página.
 *
 * O cartão inteiro é clicável por `.stretch-link` — um pseudo-elemento do link
 * do título que cobre o cartão. Isso dá a área grande de toque sem transformar
 * a `<article>` em `div` clicável: para o teclado e para o leitor de tela
 * continua existindo um único link, o do título. Por isso nada aqui dentro
 * pode virar botão ou segundo link: ficaria por baixo da camada de clique.
 */
import { CalendarClock, Check, Clock3, MapPin, Star, UsersRound, Wallet } from "lucide-react";

import { formatarData, tempoRelativo } from "@/lib/rh/formatar";
import { AREAS, MODELOS_TRABALHO, VINCULOS } from "@/lib/rh/opcoes";
import type { Vaga } from "@/lib/rh/tipos";
import { faixaSalarial, resumoJornada } from "@/lib/rh/vagas";

export function CartaoVaga({
  vaga,
  agora,
  destaque = false,
}: {
  vaga: Vaga;
  agora: Date;
  /**
   * Força o tratamento de destaque mesmo em vaga comum (a página da vaga usa
   * para realçar a primeira relacionada). O destaque marcado pelo RH na própria
   * vaga vale sempre — os dois entram por um `||` logo abaixo.
   */
  destaque?: boolean;
}) {
  const realce = destaque || vaga.destaque;

  // `find` pode não achar nada se um JSON antigo trouxer uma área que saiu do
  // catálogo; nesse caso a pílula simplesmente não é desenhada.
  const area = AREAS.find((a) => a.valor === vaga.area);
  const vinculo = VINCULOS.find((v) => v.valor === vaga.vinculo);
  const modelo = MODELOS_TRABALHO.find((m) => m.valor === vaga.modelo);

  const salario = faixaSalarial(vaga);
  const jornada = resumoJornada(vaga);
  const local = vaga.local.trim();
  const requisitos = vaga.requisitos.filter((r) => r.trim().length > 0).slice(0, 3);
  const publicada = tempoRelativo(vaga.publicadoEm, agora);
  const prazo = formatarData(vaga.encerraEm);

  return (
    <article
      className={`jp-soft-card group relative flex h-full flex-col rounded-[1.5rem] p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_32px_80px_-45px_rgba(3,47,1,.55)] focus-within:-translate-y-1 sm:p-7 ${
        realce ? "ring-1 ring-forest/25" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {area ? (
          <span className="inline-flex items-center rounded-full bg-mint px-3 py-1 text-xs font-extrabold text-ink ring-1 ring-forest/15">
            {area.rotulo}
          </span>
        ) : null}
        {realce ? (
          // Selo com ícone e texto, não só cor: o destaque precisa se ler em
          // monocromático e para quem não distingue o verde do cinza.
          <span className="inline-flex items-center gap-1.5 rounded-full bg-forest px-3 py-1 text-xs font-extrabold text-white">
            <Star className="h-3.5 w-3.5 fill-lime text-lime" aria-hidden="true" />
            Em destaque
          </span>
        ) : null}
      </div>

      <h3 className="mt-4 font-display text-xl font-extrabold leading-tight tracking-[-.02em] text-forest-2 sm:text-2xl">
        <a
          href={`/carreiras/${vaga.slug}`}
          className="stretch-link rounded-sm outline-offset-4 transition group-hover:text-ink"
        >
          {vaga.titulo}
        </a>
      </h3>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {vinculo ? (
          <span className="inline-flex items-center rounded-full bg-cream px-2.5 py-1 text-xs font-bold text-ink ring-1 ring-border-soft">
            {vinculo.rotulo}
          </span>
        ) : null}
        {modelo ? (
          <span className="inline-flex items-center rounded-full bg-cream px-2.5 py-1 text-xs font-bold text-ink ring-1 ring-border-soft">
            {modelo.rotulo}
          </span>
        ) : null}
        {vaga.quantidade > 1 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-cream px-2.5 py-1 text-xs font-bold text-ink ring-1 ring-border-soft">
            <UsersRound className="h-3.5 w-3.5" aria-hidden="true" />
            {vaga.quantidade} vagas
          </span>
        ) : null}
      </div>

      {vaga.resumo.trim().length > 0 ? (
        <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-ink">{vaga.resumo}</p>
      ) : null}

      {salario.length > 0 || jornada.length > 0 || local.length > 0 ? (
        <dl className="mt-5 grid gap-2 text-sm font-semibold text-ink">
          {salario.length > 0 ? (
            <div className="flex items-center gap-2">
              <dt className="sr-only">Faixa salarial</dt>
              <Wallet className="h-4 w-4 shrink-0 text-forest" aria-hidden="true" />
              <dd>{salario}</dd>
            </div>
          ) : null}
          {jornada.length > 0 ? (
            <div className="flex items-center gap-2">
              <dt className="sr-only">Jornada</dt>
              <Clock3 className="h-4 w-4 shrink-0 text-forest" aria-hidden="true" />
              <dd>{jornada}</dd>
            </div>
          ) : null}
          {local.length > 0 ? (
            <div className="flex items-center gap-2">
              <dt className="sr-only">Local</dt>
              <MapPin className="h-4 w-4 shrink-0 text-forest" aria-hidden="true" />
              <dd>{local}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {requisitos.length > 0 ? (
        <ul className="mt-5 grid gap-2 border-t border-border-soft pt-5 text-sm leading-snug text-ink">
          {requisitos.map((r) => (
            <li key={r} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden="true" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* `mt-auto` gruda o rodapé embaixo: numa grade de cartões com resumos de
          tamanhos diferentes, sem isso a linha "publicada há X" flutuaria em
          alturas distintas em cada cartão. */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6">
        <span className="text-xs font-bold text-ink">
          {publicada.length > 0 ? `Publicada ${publicada}` : "Vaga aberta"}
        </span>
        {prazo.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-800 ring-1 ring-amber-200">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            Encerra em {prazo}
          </span>
        ) : null}
      </div>
    </article>
  );
}
