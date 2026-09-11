import { Star } from "lucide-react";

import { AVALIACOES, notaBR, preenchimentoDaQuintaEstrela } from "@/lib/jp";

/**
 * A avaliação do Google, em qualquer lugar do site.
 *
 * Existe para acabar com um problema que o site tinha de verdade: o total de
 * avaliações era digitado em cada tela, então a home dizia 192, a página de
 * limpeza dizia 176 e as de clareamento e implantes diziam 180. Três respostas
 * para a mesma pergunta, no mesmo site. Prova social que se contradiz trabalha
 * contra quem a mostra.
 *
 * Nenhuma variante recebe número por prop, e isso é a regra inteira: todas leem
 * `AVALIACOES` de `@/lib/jp`. Para mudar a nota ou o volume, mexe-se lá — e o
 * site inteiro muda junto, incluindo a fatia da quinta estrela, que é calculada
 * e não escrita à mão.
 */

type Variante = "destaque" | "itens" | "selo";

/**
 * As cinco estrelas, com a última preenchida na proporção da nota.
 *
 * O desenho é uma estrela vazada com uma cheia por cima, recortada por
 * `overflow-hidden` na largura certa. Feito assim, e não com meia estrela
 * pronta, porque 4,6 não é meia: é 60% — e no dia em que a nota virar 4,7 o
 * desenho acompanha sozinho.
 */
function Estrelas({ tamanho }: { tamanho: number }) {
  const cheias = Math.floor(AVALIACOES.nota);
  const resto = preenchimentoDaQuintaEstrela;

  return (
    <div className="flex gap-2" role="img" aria-label={`${notaBR} de 5 estrelas no Google`}>
      {Array.from({ length: cheias }, (_, i) => (
        <Star
          key={i}
          size={tamanho}
          strokeWidth={0}
          aria-hidden="true"
          className="fill-[#56A805]"
        />
      ))}
      {resto > 0 ? (
        <span className="relative" aria-hidden="true">
          <Star size={tamanho} strokeWidth={1} className="fill-[#E3E8DD] text-[#9FB396]" />
          <span
            className="absolute inset-y-0 left-0 overflow-hidden"
            style={{ width: `${String(resto)}%` }}
          >
            <Star size={tamanho} strokeWidth={0} className="fill-[#56A805]" />
          </span>
        </span>
      ) : null}
    </div>
  );
}

export function GoogleRating({ variante = "selo" }: { variante?: Variante }) {
  // O número grande da seção de avaliações: nota enorme, estrelas ao lado,
  // volume embaixo.
  if (variante === "destaque") {
    return (
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <span className="font-display text-[68px] font-extrabold leading-none tracking-[-0.07em] text-forest-2 sm:text-[76px]">
          {notaBR}
        </span>

        <div className="pb-2">
          <div className="mb-2">
            <Estrelas tamanho={30} />
          </div>
          <p className="text-sm text-ink-soft">{AVALIACOES.total} avaliações no Google</p>
        </div>
      </div>
    );
  }

  // Dois irmãos soltos numa faixa de dados do hero, onde o `gap` do pai é quem
  // separa — por isso um fragmento, e não um wrapper que quebraria o
  // espaçamento das outras informações da mesma linha.
  if (variante === "itens") {
    return (
      <>
        <span className="flex items-center gap-2">
          <Star className="h-4 w-4 fill-primary text-primary" aria-hidden="true" /> {notaBR} no
          Google
        </span>
        <span>{AVALIACOES.total} avaliações</span>
      </>
    );
  }

  // Uma linha só, para rodapé de página de tratamento e afins.
  return (
    <span className="inline-flex items-center gap-2">
      <Star className="h-4 w-4 fill-lime text-lime" aria-hidden="true" />
      {notaBR}★ no Google • {AVALIACOES.total} avaliações
    </span>
  );
}
