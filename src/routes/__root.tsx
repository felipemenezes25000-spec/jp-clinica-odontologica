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
  SCRIPT_CLIQUES_ANTES,
} from "@/lib/analytics/scripts";

/**
 * A moldura dos dois becos sem saída (404 e erro): fundo claro com o brilho da
 * marca, a logo no alto e um cartão branco com o recado e o caminho de volta.
 * Simples de propósito — quem cai aqui quer sair, não admirar a página.
 *
 * Não monta o cabeçalho, então a entrada é CSS puro (`data-chega`), que roda
 * sem esperar o motor de movimento.
 */
function DeadEnd({
  rotulo,
  headline,
  body,
  children,
}: {
  rotulo: string;
  headline: ReactNode;
  body: string;
  children: ReactNode;
}) {
  return (
    <main
      id="conteudo"
      className="site fundo-brilho relative isolate flex min-h-dvh flex-col overflow-hidden"
    >
      <div className="quadro pt-6">
        <a
          href="/"
          aria-label={`${CLINICA.nome} — início`}
          className="inline-flex min-h-11 items-center"
        >
          <Logo variante="lockup" fundo="claro" altura={44} alt="" className="h-11 w-auto" />
        </a>
      </div>

      <div className="quadro flex flex-1 items-center justify-start py-[clamp(2rem,1rem+3vw,4rem)]">
        <div
          data-chega
          className="cartao w-full max-w-[48rem] p-[clamp(1.25rem,1rem+1.5vw,2rem)]"
          style={{ boxShadow: "var(--sombra-2)" }}
        >
          <p className="selo">{rotulo}</p>
          <h1 className="text-titulo mt-[var(--ritmo-1)]">{headline}</h1>
          <p className="text-corpo mt-[var(--ritmo-2)] max-w-[46ch] text-tinta-suave">{body}</p>
          <div className="mt-[var(--ritmo-3)] flex flex-wrap gap-3 max-sm:[&>*]:w-full">
            {children}
          </div>
          {/* Quem cai aqui vindo de um anúncio ainda quer falar com a clínica:
              o contato não depende do resto do site estar de pé, então são
              links diretos, sem passar pelo rastreio de contato. */}
          <p
            className="text-pequeno mt-[var(--ritmo-3)] pt-[var(--ritmo-2)] text-tinta-suave"
            style={{ borderTop: "1px solid var(--borda)" }}
          >
            Prefere falar agora?{" "}
            <a href={CLINICA.telefoneHref} className="link font-semibold text-tinta">
              {CLINICA.telefone}
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}

function NotFoundComponent() {
  return (
    <DeadEnd
      rotulo="Erro 404"
      headline="Esta página não existe."
      body="O endereço pode ter mudado ou sido digitado com algum caractere a mais. O caminho de volta está logo abaixo."
    >
      <Link to="/" className="botao botao-acento">
        Voltar para o início
      </Link>
      <Link to="/" hash="tratamentos" className="botao botao-chao">
        Ver tratamentos
      </Link>
      <a
        href={CLINICA.whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="botao botao-chao"
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
      rotulo="Falha temporária"
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
      <a href="/" className="botao botao-chao">
        Ir para o início
      </a>
      <a
        href={CLINICA.whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="botao botao-chao"
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
      { children: SCRIPT_CLIQUES_ANTES },
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
