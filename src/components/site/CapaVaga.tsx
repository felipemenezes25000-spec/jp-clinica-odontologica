/**
 * Capa do hero da página de vaga — uma foto por ÁREA.
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
import capaRecepcao1100 from "@/assets/capa-recepcao-1100.webp";
import capaRecepcao1536 from "@/assets/capa-recepcao-1536.webp";
import consultorioImg from "@/assets/consultorio-1.webp";
import consultorioJovemImg from "@/assets/consultorio-2.webp";
import consultorioWideImg from "@/assets/consultorio-wide.webp";
import escritorioImg from "@/assets/escritorio-completa.webp";
import esterilizacaoImg from "@/assets/esterilizacao.webp";

/**
 * `largura`/`altura` são as dimensões REAIS do arquivo maior. Não decidem o
 * tamanho na tela (quem manda é o `object-cover`), mas entregam a proporção
 * antes do download — sem elas o navegador reserva altura zero e o hero pula
 * quando a foto entra.
 *
 * `menor` existe para o `srcset`: a mesma foto em 1100px pesa 149 KB contra
 * 308 KB da de 1536px, e num monitor de 1366 a diferença não aparece. Quem
 * escolhe é o navegador, que sabe a densidade da tela — nós não.
 */
type Capa = { src: string; menor?: string; largura: number; altura: number };

const CAPAS: Record<string, Capa> = {
  dentista: { src: consultorioImg, largura: 1400, altura: 1045 },
  // Esterilização é literalmente a rotina de ASB/TSB — não é foto de clínica
  // escolhida por ser bonita.
  "asb-tsb": { src: esterilizacaoImg, largura: 1200, altura: 967 },
  recepcao: {
    src: capaRecepcao1536,
    menor: capaRecepcao1100,
    largura: 1536,
    altura: 1024,
  },
  administrativo: { src: escritorioImg, largura: 1080, altura: 1080 },
  estagio: { src: consultorioJovemImg, largura: 1200, altura: 896 },
  outra: { src: consultorioWideImg, largura: 1500, altura: 800 },
};

/**
 * Área sem capa cadastrada devolve `null`, e o hero volta a ser exatamente o
 * que era: verde com ruído. O layout não pode depender de uma imagem que pode
 * não existir.
 */
export function capaDaArea(area: string): Capa | null {
  return CAPAS[area] ?? null;
}

/** 1x1 transparente. Ver o comentário do `<picture>`. */
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * A foto e o véu que a transforma em fundo de texto.
 *
 * O VÉU NÃO É ENFEITE. O título do hero é branco, e esta foto tem o lado
 * esquerdo claro (parede creme, planta, luminária). Branco sobre aquilo não
 * atende contraste nenhum. O gradiente sai OPACO da borda esquerda até 38% da
 * largura — que é onde o texto vive — e só então abre para a fotografia. É a
 * mesma regra da clínica: onde há letra branca, o fundo é verde.
 *
 * SÓ NO DESKTOP, E SEM BAIXAR NO CELULAR. O contêiner é `hidden lg:block`, mas
 * contêiner escondido não impede o download: o navegador busca a imagem do
 * mesmo jeito. Por isso o `<picture>` — o `<source media>` só vale de 1024px
 * para cima, e abaixo disso o `<img>` cai no pixel transparente e nenhuma
 * requisição de 149 KB sai num celular em 4G, onde a foto nem apareceria.
 */
export function CapaVaga({ area }: { area: string }) {
  const capa = capaDaArea(area);
  if (capa === null) return null;

  const conjunto =
    capa.menor === undefined
      ? capa.src
      : `${capa.menor} 1100w, ${capa.src} ${String(capa.largura)}w`;

  return (
    /* TETO DE LARGURA, e nao de altura.
       A altura do hero vem do texto e fica quase fixa (~900px), enquanto a
       largura cresce sem limite: a faixa ia de 1,70:1 em 1440px para 4,25:1 em
       3840px, e o `object-cover` descartava dois tercos da foto — a pessoa
       saia do enquadramento.
       Prender a PROPORCAO em 2,1:1 pela altura exigiria um hero de 1829px em
       4K, o que ninguem quer. Prender a LARGURA resolve sem esticar nada: acima
       de 1900px a foto para de crescer e fica centrada, e as laterais ficam com
       o verde da propria secao — que le como faixa proposital, nao como falha.
       Em 2560 e em 3840 a foto passa a ter a mesma proporcao de 2,11:1. */
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-1/2 z-0 hidden w-full max-w-[1900px] -translate-x-1/2 lg:block"
    >
      <picture>
        <source media="(min-width: 1024px)" srcSet={conjunto} sizes="100vw" />
        <img
          src={PIXEL}
          alt=""
          width={capa.largura}
          height={capa.altura}
          /* Decorativa, mas é o maior elemento pintado da dobra: é ela que o
             navegador mede como LCP. `eager` e prioridade alta tiram a foto da
             fila de recursos secundários. */
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="h-full w-full object-cover object-[center_35%]"
        />
      </picture>

      {/* Duas camadas, e cada uma resolve um problema: a horizontal garante o
          contraste do texto à esquerda; a vertical costura a foto ao verde da
          seção em cima e embaixo, senão a borda da imagem aparece como um corte
          reto no meio do degradê da página. */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--brand-deep)_0%,var(--brand-deep)_46%,color-mix(in_oklab,var(--brand-deep)_28%,transparent)_60%,color-mix(in_oklab,var(--brand-deep)_8%,transparent)_76%,transparent_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--brand-deep)_38%,transparent)_0%,transparent_16%,transparent_82%,color-mix(in_oklab,var(--brand-deep)_45%,transparent)_100%)]" />
    </div>
  );
}
