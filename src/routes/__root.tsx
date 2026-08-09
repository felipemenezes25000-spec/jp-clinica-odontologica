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

import appCss from "../styles.css?url";

/**
 * Shared shell for the 404 and error boundaries. Both are dead ends, so they
 * carry the brand rather than a system-default page: dark forest field, the
 * oversized "JP" watermark from the hero, and a single obvious way out.
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
    <div className="relative isolate flex min-h-dvh items-center overflow-hidden bg-forest-2 px-5 py-20 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[6vw] top-1/2 -translate-y-1/2 font-display text-[clamp(18rem,42vw,46rem)] font-black leading-none tracking-[-.13em] text-white/[.05]"
      >
        JP
      </div>
      <div
        aria-hidden="true"
        className="absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-lime/15 blur-[110px]"
      />

      <div className="container-jp relative z-10">
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
      { name: "theme-color", content: "#0a3c24" },
      { property: "og:site_name", content: "JP Clínica Integrada Odontológica" },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { name: "twitter:card", content: "summary_large_image" },
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
      { rel: "icon", type: "image/png", href: "/favicon.png" },
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
