import { Star } from "lucide-react";

import { AVALIACOES, notaBR, preenchimentoDaQuintaEstrela } from "@/lib/jp";
import "./home/avaliacoes.css";

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
 * São duas camadas na mesma célula: embaixo, as cinco estrelas vazias (a cor do
 * pai a 20%, para a silhueta inteira aparecer sobre qualquer fundo e a fração
 * da quinta ler-se como fração); em cima, as cheias, com a quinta recortada por
 * `overflow-hidden` na largura certa. Feito assim, e não com meia estrela
 * pronta, porque 4,6 não é meia: é 60% — e no dia em que a nota virar 4,7 o
 * desenho acompanha sozinho.
 *
 * A camada cheia é revelada da esquerda para a direita ao entrar na tela
 * (avaliacoes.css, só com movimento permitido); sem isso, ou sem suporte a
 * linha do tempo de rolagem, ela já nasce completa.
 *
 * Exportada porque a seção de avaliações da home as usa fora da variante
 * "destaque", e uma segunda cópia do desenho voltaria a poder discordar da nota.
 * `decorativa` esconde das tecnologias assistivas quando o texto ao lado já diz
 * a nota — senão ela seria lida duas vezes.
 */
export function EstrelasDoGoogle({
  tamanho,
  decorativa = false,
}: {
  tamanho: number;
  decorativa?: boolean;
}) {
  const cheias = Math.floor(AVALIACOES.nota);
  const resto = preenchimentoDaQuintaEstrela;
  const lugares = Array.from({ length: 5 }, (_, i) => i);

  return (
    <div
      className="estrelas-google grid"
      {...(decorativa
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": `${notaBR} de 5 estrelas no Google` })}
    >
      <div className="col-start-1 row-start-1 flex gap-1.5 opacity-20" aria-hidden="true">
        {lugares.map((i) => (
          <Star key={i} size={tamanho} strokeWidth={0} className="fill-current" />
        ))}
      </div>
      <div
        className="estrelas-google-cheias col-start-1 row-start-1 flex gap-1.5"
        aria-hidden="true"
      >
        {lugares.map((i) =>
          i < cheias ? (
            <Star key={i} size={tamanho} strokeWidth={0} className="fill-acento" />
          ) : (
            <span key={i} className="block" style={{ width: tamanho }}>
              <span
                className="block overflow-hidden"
                style={{ width: `${String(i === cheias ? resto : 0)}%` }}
              >
                <Star size={tamanho} strokeWidth={0} className="fill-acento" />
              </span>
            </span>
          ),
        )}
      </div>
    </div>
  );
}

export function GoogleRating({ variante = "selo" }: { variante?: Variante }) {
  // O número grande da seção de avaliações: a nota na maior medida do site,
  // estrelas e volume ao lado. `data-numero` faz a nota rolar até o valor ao
  // aparecer; o HTML do servidor já traz "4,6", então sem script nada muda.
  if (variante === "destaque") {
    return (
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <span
          data-numero={String(AVALIACOES.nota)}
          data-casas="1"
          aria-hidden="true"
          className="text-display leading-[0.8] tabular-nums"
        >
          {notaBR}
        </span>

        <div className="flex flex-col gap-2 pb-1">
          <EstrelasDoGoogle tamanho={28} />
          <p className="text-corpo text-tinta-suave">{AVALIACOES.total} avaliações no Google</p>
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
          <Star className="h-4 w-4 fill-acento text-acento" aria-hidden="true" /> {notaBR} no Google
        </span>
        <span>{AVALIACOES.total} avaliações</span>
      </>
    );
  }

  // Uma linha só, para rodapé de página de tratamento e afins. Herda a cor do
  // pai (essas páginas são escuras); as estrelas cheias são o único acento.
  return (
    <span className="inline-flex items-center gap-2">
      <EstrelasDoGoogle tamanho={14} decorativa />
      {notaBR} no Google · {AVALIACOES.total} avaliações
    </span>
  );
}
