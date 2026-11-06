import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import { Logo } from "@/components/site/Logo";
import { CLINICA, SITE_URL } from "@/lib/jp";
import appCss from "../styles.css?url";
import fonteLatin from "@/assets/fontes/bricolage-latin.woff2?url";
import { RastreioDeContato } from "@/components/site/RastreioDeContato";
import { AvisoDeCookies } from "@/components/site/AvisoDeCookies";
import {
  SCRIPT_CONSENTIMENTO,
  iframeNoscriptDoGTM,
  scriptDoGTM,
  scriptDoPixel,
} from "@/lib/analytics/scripts";

/**
 * A moldura dos dois becos sem saída (404 e erro). Eles levam a marca em vez de
 * uma página padrão do navegador: campo escuro, uma coroa gigante chapada
 * cortada pela borda de baixo — a mesma forma do topo da home — e um caminho
 * óbvio de volta.
 *
 * Não monta o cabeçalho, então a entrada é CSS puro (`data-chega`), que roda
 * sem esperar o motor de movimento.
 */
function DeadEnd({
  headline,
  body,
  children,
}: {
  headline: ReactNode;
  body: string;
  children: ReactNode;
}) {
  return (
    <main
      id="conteudo"
      className="site campo-escuro relative isolate flex min-h-dvh items-start overflow-hidden md:items-center"
    >
      <a
        href="/"
        aria-label={`${CLINICA.nome} — início`}
        className="absolute left-[var(--margem)] top-6 z-10 inline-flex min-h-11 items-center"
      >
        <Logo variante="lockup" fundo="escuro" altura={48} alt="" className="h-12 w-auto" />
      </a>

      <div className="quadro relative z-10 py-28">
        <h1 data-chega className="text-display max-w-[11ch] text-sobre-campo">
          {headline}
        </h1>
        <p
          data-chega
          style={{ "--d": "560ms" } as React.CSSProperties}
          className="text-corpo mt-8 max-w-[44ch] text-sobre-campo-suave"
        >
          {body}
        </p>
        <div
          data-chega
          style={{ "--d": "700ms" } as React.CSSProperties}
          className="mt-10 flex flex-wrap gap-3"
        >
          {children}
        </div>
        {/* Quem cai aqui vindo de um anúncio ainda quer falar com a clínica:
            o contato não depende do resto do site estar de pé, então são
            links diretos, sem passar pelo rastreio de contato. */}
        <p
          data-chega
          style={{ "--d": "840ms" } as React.CSSProperties}
          className="text-pequeno mt-8 text-sobre-campo-suave"
        >
          Prefere falar agora?{" "}
          <a href={CLINICA.telefoneHref} className="font-semibold text-sobre-campo underline">
            {CLINICA.telefone}
          </a>
        </p>
      </div>
    </main>
  );
}

function NotFoundComponent() {
  return (
    <DeadEnd
      headline="Esta página não existe."
      body="O endereço pode ter mudado ou sido digitado com algum caractere a mais. O caminho de volta está logo abaixo."
    >
      <Link to="/" className="botao botao-acento">
        Voltar para o início
      </Link>
      <Link to="/" hash="tratamentos" className="botao botao-claro">
        Ver tratamentos
      </Link>
      <a
        href={CLINICA.whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="botao botao-claro"
      >
        Falar no WhatsApp
      </a>
    </DeadEnd>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <DeadEnd
      headline="Esta página não carregou."
      body="Foi uma falha do nosso lado, não sua. Tentar de novo costuma resolver — e o WhatsApp da clínica continua funcionando normalmente."
    >
      <button
        type="button"
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="botao botao-acento"
      >
        Tentar novamente
      </button>
      <a href="/" className="botao botao-claro">
        Ir para o início
      </a>
      <a
        href={CLINICA.whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="botao botao-claro"
      >
        Falar no WhatsApp
      </a>
    </DeadEnd>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "JP Clínica Integrada Odontológica — Dentista na Freguesia do Ó, SP" },
      {
        name: "description",
        content:
          "Clínica odontológica na região da Freguesia do Ó (Vila Bruna, SP) para crianças, adultos e idosos. Agende sua avaliação pelo WhatsApp.",
      },
      { name: "author", content: "JP Clínica Integrada Odontológica" },
      { name: "theme-color", content: "#032F01" },
      { property: "og:site_name", content: "JP Clínica Integrada Odontológica" },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { name: "twitter:card", content: "summary_large_image" },
      // O cartão de compartilhamento é a marca sobre o verde da clínica: quem
      // recebe o link no WhatsApp vê o logo, não um recorte aleatório da página.
      // Absoluto porque é assim que o robô do WhatsApp e o do Facebook resolvem
      // og:image — com caminho relativo eles simplesmente não buscam a imagem.
      { property: "og:url", content: SITE_URL },
      { property: "og:image", content: `${SITE_URL}/og.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "Marca da JP Clínica Odontológica",
      },
      { name: "twitter:image", content: `${SITE_URL}/og.png` },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // A Bricolage é a única família do site desde 11/2026, e o H1 do topo
      // anima linha por linha: sem o preload, as linhas subiriam na fonte de
      // reserva e trocariam no meio do movimento. Só o subconjunto latin — é
      // o que uma página em português pede.
      {
        rel: "preload",
        href: fonteLatin,
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      // Sem preconnect nem <link> para o Google: as fontes são servidas da nossa
      // própria origem, de src/assets/fontes. Ver o comentário em _faces.css —
      // eram 835ms de render bloqueado e o IP de cada visitante indo a um
      // terceiro.
      // O SVG atende quem sabe lê-lo — e escala sozinho de 16px à aba retina.
      // Os PNGs ficam de reserva, na ordem que os navegadores antigos esperam.
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "96x96", href: "/favicon-96.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],

    /*
     * A MEDIÇÃO, E A ORDEM DELA — ver `lib/analytics/scripts.ts`.
     *
     * Primeiro o Consent Mode com tudo NEGADO, depois os containers. O Google
     * só respeita o padrão que já estava no `dataLayer` quando o container
     * subiu; inverter estes dois itens é medir primeiro e perguntar depois.
     *
     * Os dois containers saem da lista quando não há ID configurado — e é assim
     * que este site roda hoje. `.filter(Boolean)` não é economia de linha: é o
     * que garante que, sem GTM e sem Pixel, NADA é pedido à rede e nada muda no
     * tempo de carregamento.
     */
    scripts: [
      { children: SCRIPT_CONSENTIMENTO },
      ...(scriptDoGTM() !== null ? [{ children: scriptDoGTM() as string }] : []),
      ...(scriptDoPixel() !== null ? [{ children: scriptDoPixel() as string }] : []),
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const noscriptGTM = iframeNoscriptDoGTM();

  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {/* O `<noscript>` do GTM existe por completude do container e registra
            só a visita: nenhum CTA deste site funciona sem JavaScript, então
            não há evento a medir por aqui. Sai inteiro quando não há ID. */}
        {noscriptGTM !== null && (
          <noscript>
            <iframe
              src={noscriptGTM}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
              title="Google Tag Manager"
            />
          </noscript>
        )}
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Um ouvinte só, na raiz, para os cliques de conversão de TODAS as rotas
          — WhatsApp, telefone, mapa e avaliações. Fica aqui e não em cada botão
          porque link novo nasceria sem rastreio até alguém lembrar. Não desenha
          nada e não bloqueia clique nenhum: se o analytics falhar, falha calado. */}
      <RastreioDeContato />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      {/* Depois do <Outlet />: a faixa é a última coisa da árvore, e a última na
          ordem de leitura de quem usa leitor de tela. Ela não bloqueia nada —
          o WhatsApp funciona com ela na tela, aceita ou recusada. */}
      <AvisoDeCookies />
    </QueryClientProvider>
  );
}
