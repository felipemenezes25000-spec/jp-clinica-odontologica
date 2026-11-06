/**
 * Capa da página de vaga — uma foto por ÁREA, dentro da coroa.
 *
 * POR QUE POR ÁREA, E NÃO POR VAGA
 * Decisão do cliente: capa fixa por área, para o RH não ter de gerenciar imagem
 * a cada anúncio. Quem escolhe, então, é o campo `area` do editor de vaga — a
 * capa continua saindo do que o portal preenche, sem um upload a mais na rotina
 * de quem publica.
 *
 * POR QUE ESTE ARQUIVO NÃO MORA EM `lib/rh`
 * Ele importa `.webp`, e `lib/rh` é importado pelo SERVIDOR. Puxar asset para
 * aquele grafo é o tipo de coisa que engordou o pedaço de entrada e derrubou a
 * produção uma vez (ver docs/INCIDENTE-BUILD-500.md). Componente de site fica
 * no lado do site.
 */
import { capaDaArea } from "@/components/site/carreiras/capas";
import { MolduraCoroa } from "@/components/site/sistema/Coroa";

/**
 * A foto dentro da moldura em coroa.
 *
 * `proporcao` é largura / altura da peça; quem precisa de proporção diferente
 * no celular e no desktop passa `medir` e dá o `aspect-ratio` por CSS (a coroa
 * se refaz com a medida real). A foto é o maior elemento da dobra da página de
 * vaga, então é o LCP: carrega com prioridade alta e sem `lazy`.
 *
 * `data-deriva` fica na `<img>`, e não na moldura: o motor anda a foto dentro
 * da caixa, e a moldura (que corta) fica parada.
 */
export function CapaVaga({
  area,
  proporcao = 0.95,
  medir = false,
  className = "",
}: {
  area: string;
  proporcao?: number;
  medir?: boolean;
  className?: string;
}) {
  const capa = capaDaArea(area);
  if (capa === null) return null;

  return (
    <MolduraCoroa proporcao={proporcao} medir={medir} className={className}>
      <img
        src={capa.src}
        alt={capa.alt}
        width={capa.largura}
        height={capa.altura}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        data-deriva
      />
    </MolduraCoroa>
  );
}
