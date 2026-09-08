/**
 * O tour institucional do JP CRC — `/crc-institucional`.
 *
 * A peça inteira (28+ cenas, narração, legenda, modo explorar) vive em
 * `apresentacao/`, um sub-projeto com o próprio `package.json`, e é construída
 * para `public/crc-institucional/`. Esta rota só a coloca em tela.
 *
 * POR QUE UM `<iframe>` E NÃO O COMPONENTE DIRETO
 *
 * Três razões, em ordem de peso:
 *
 * 1. **O incidente do build.** `docs/INCIDENTE-BUILD-500.md` conta como um ciclo
 *    entre chunks derrubou TODAS as rotas do site com o build passando limpo, e
 *    por isso `vite.config.ts` ainda força `inlineDynamicImports` no ambiente
 *    SSR. Somar meio megabyte de JavaScript de animação a esse bundle é
 *    exatamente o tipo de mudança que reabre aquele problema — e o sintoma
 *    apareceria nas páginas de tratamento, não aqui.
 * 2. **O tour tem o próprio pipeline.** Ele é renderizado em vídeo pelo Remotion
 *    a partir dos MESMOS componentes. Trazê-lo para dentro de `src/` obrigaria a
 *    manter duas cópias, e a primeira alteração de texto já as separaria.
 * 3. **Isolamento de verdade.** O tour desliga a rolagem, captura o teclado e
 *    reescala um palco de 1920×1080. Dentro do documento do site isso brigaria
 *    com o `scroll-behavior` global e com o `overflow-x: hidden` do `body`.
 *
 * O que o iframe custa: um documento a mais. O que ele evita: um site fora do ar.
 *
 * PARA ATUALIZAR O TOUR
 *   npm --prefix apresentacao run build
 * O resultado cai direto em `public/crc-institucional/`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { CLINICA, SITE_URL } from "@/lib/jp";

const TITULO = `JP CRC — como a clínica transforma dados em atendimento | ${CLINICA.nome}`;
const DESCRICAO =
  "Tour de quatro minutos, com narração e legenda, sobre o sistema que recupera faltas, " +
  "reativa pacientes antigos, dispara campanhas e lembretes e cuida da cobrança pelo WhatsApp.";

/** Onde o app construído mora dentro de `public/`. */
const TOUR = "/crc-institucional/index.html";

export const Route = createFileRoute("/crc-institucional")({
  head: () => ({
    meta: [
      { title: TITULO },
      { name: "description", content: DESCRICAO },
      { property: "og:title", content: TITULO },
      { property: "og:description", content: DESCRICAO },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:image", content: `${SITE_URL}/og.png` },
      { name: "twitter:card", content: "summary_large_image" },
      // Página interna de apresentação: não deve competir com as páginas de
      // tratamento na busca, mas os links dentro dela continuam valendo.
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/crc-institucional` }],
  }),
  component: PaginaCrcInstitucional,
});

function PaginaCrcInstitucional() {
  return (
    <div className="flex h-dvh flex-col bg-[#eceee6]">
      {/*
        Barra enxuta, e não o `<Header/>` do site: ele é `sticky top-0 z-[100]` e
        comeria 90 px de altura do palco em toda tela. Aqui o caminho de volta é
        o que precisa existir — nada mais.
      */}
      <header className="flex flex-none items-center justify-between gap-4 border-b border-border-soft bg-paper px-4 py-2.5 sm:px-6">
        <a
          href="/"
          className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-sm font-medium text-ink-soft transition-colors hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar ao site
        </a>

        <Logo variante="lockup" fundo="claro" altura={26} alt={CLINICA.nome} />
      </header>

      <main className="min-h-0 flex-1">
        <h1 className="sr-only">JP CRC — tour institucional</h1>
        <iframe
          src={TOUR}
          title="Tour interativo do JP CRC"
          className="size-full border-0"
          // `fullscreen` para o botão de tela cheia funcionar de dentro;
          // `autoplay` para o navegador deixar a narração tocar depois do
          // clique em "Assistir". Sem elas os dois botões viram enfeite.
          allow="fullscreen; autoplay"
          loading="eager"
        />
      </main>
    </div>
  );
}
