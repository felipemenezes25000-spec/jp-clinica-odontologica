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
import { SITE_URL } from "@/lib/jp";
import appCss from "../styles.css?url";

/**
 * Shared shell for the 404 and error boundaries. Both are dead ends, so they
 * carry the brand rather than a system-default page: dark forest field, the
 * oversized mark of the clinic as a watermark, and a single obvious way out.
 */
function DeadEnd({
  eyebrow,
  headline,
  body,
  children,
}: {
  eyebrow: string;
  headline: ReactNode;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="relative isolate flex min-h-dvh items-center overflow-hidden bg-brand-deep px-5 py-20 text-white">
      {/* O "JP" daqui era redigitado em Bricolage. Agora é o símbolo da marca —
          o mesmo desenho do cabeçalho, do favicon e do rodapé. Como ele é feito
          de traço, e não de massa cheia como a letra era, precisa de mais opacidade
          para render a mesma presença. */}
      <Logo
        variante="simbolo"
        fundo="escuro"
        altura={700}
        className="pointer-events-none absolute -right-[10vw] top-1/2 h-[min(88vh,42rem)] w-auto -translate-y-1/2 opacity-[.09]"
      />
      <div
        aria-hidden="true"
        className="absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-lime/15 blur-[110px]"
      />

      <div className="jp-container relative z-10">
        <div className="eyebrow text-lime">
          <span className="h-2 w-2 rounded-full bg-lime" />
          {eyebrow}
        </div>
        <h1 className="mt-6 max-w-3xl font-display text-[clamp(3rem,9vw,7rem)] font-black leading-[.82] tracking-[-.07em]">
          {headline}
        </h1>
        <p className="mt-6 max-w-lg text-base font-medium leading-relaxed text-white/60">{body}</p>
        <div className="mt-9 flex flex-wrap gap-3">{children}</div>
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <DeadEnd
      eyebrow="Erro 404"
      headline={
        <>
          ESTA PÁGINA <span className="text-lime">NÃO EXISTE.</span>
        </>
      }
      body="O endereço pode ter mudado ou sido digitado com algum caractere a mais. O caminho de volta está logo abaixo."
    >
      <Link to="/" className="button-primary">
        Voltar para o início
      </Link>
      <Link to="/" hash="tratamentos" className="button-ghost-light">
        Ver tratamentos
      </Link>
    </DeadEnd>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <DeadEnd
      eyebrow="Algo saiu do lugar"
      headline={
        <>
          ESTA PÁGINA <span className="text-lime">NÃO CARREGOU.</span>
        </>
      }
      body="Foi uma falha do nosso lado, não sua. Tentar de novo costuma resolver — e o WhatsApp da clínica continua funcionando normalmente."
    >
      <button
        type="button"
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="button-primary"
      >
        Tentar novamente
      </button>
      <a href="/" className="button-ghost-light">
        Ir para o início
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
        content: "Marca da JP Clínica Odontológica sobre o verde da clínica",
      },
      { name: "twitter:image", content: `${SITE_URL}/og.png` },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=Manrope:wght@400;500;600;700&display=swap",
      },
      // O SVG atende quem sabe lê-lo — e escala sozinho de 16px à aba retina.
      // Os PNGs ficam de reserva, na ordem que os navegadores antigos esperam.
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "96x96", href: "/favicon-96.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
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
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
