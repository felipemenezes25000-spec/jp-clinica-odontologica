import { createFileRoute, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  CalendarCheck,
  Check,
  ChevronDown,
  MessageCircle,
  Sparkles,
  Star,
} from "lucide-react";

// Fotos da própria JP. Nenhuma imagem de banco ou gerada.
import ogImage from "@/assets/fachada.webp";
import consultorioRealImg from "@/assets/consultorio-1.webp";
import consultorioReal2Img from "@/assets/consultorio-2.webp";
import consultorioWideImg from "@/assets/consultorio-wide.webp";
import equipamentoImg from "@/assets/equipamento.webp";
import esterilizacaoImg from "@/assets/esterilizacao.webp";
import logo from "@/assets/logo-jp-official.webp";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { FloatingCTA } from "@/components/site/FloatingCTA";
import { Reveal } from "@/components/site/Reveal";
import { CinematicMotion } from "@/components/site/CinematicMotion";
import { SkipLink } from "@/components/site/SkipLink";
import { DepthCard } from "@/components/site/DepthCard";
import { TreatmentVideo } from "@/components/site/TreatmentVideo";

import videoClareamento from "@/assets/video-clareamento.mp4?url";
import posterClareamento from "@/assets/video-clareamento-poster.webp";
import videoHarmonizacao from "@/assets/video-harmonizacao.mp4?url";
import posterHarmonizacao from "@/assets/video-harmonizacao-poster.webp";
import videoRestauracao from "@/assets/video-restauracao.mp4?url";
import posterRestauracao from "@/assets/video-restauracao-poster.webp";
import videoLimpeza from "@/assets/video-limpeza.mp4?url";
import posterLimpeza from "@/assets/video-limpeza-poster.webp";
import videoOdontopediatria from "@/assets/video-odontopediatria.mp4?url";
import posterOdontopediatria from "@/assets/video-odontopediatria-poster.webp";
import videoImplante from "@/assets/video-implante.mp4?url";
import posterImplante from "@/assets/video-implante-poster.webp";
import videoOrtodontia from "@/assets/video-ortodontia.mp4?url";
import posterOrtodontia from "@/assets/video-ortodontia-poster.webp";
import videoProtese from "@/assets/video-protese.mp4?url";
import posterProtese from "@/assets/video-protese-poster.webp";
import { CLINICA, SITE_URL, TRATAMENTOS, whatsappLink } from "@/lib/jp";

export const Route = createFileRoute("/tratamentos/$slug")({
  component: TreatmentPage,

  // Slug inexistente devolvia HTTP 200 com a tela de erro (soft 404): buscador
  // indexava e o visitante não recebia o sinal certo. Agora é 404 de verdade.
  loader: ({ params }) => {
    if (!TRATAMENTOS.some((t) => t.slug === params.slug)) throw notFound();
    return null;
  },

  /**
   * As metatags precisam sair no HTML servido, não depois da hidratação: o robô
   * de preview do WhatsApp — que é o canal de conversão do site — não roda JS.
   * Antes, as 8 páginas compartilhavam o mesmo title e a mesma description.
   */
  head: ({ params }) => {
    const t = TRATAMENTOS.find((x) => x.slug === params.slug);
    if (!t) return {};
    const title = `${t.titulo} | JP Clínica Integrada Odontológica — Freguesia do Ó`;
    const description = `${t.desc} Atendimento na JP Clínica Integrada Odontológica, Vila Bruna, São Paulo.`;
    const url = `${SITE_URL}/tratamentos/${t.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "article" },
        { property: "og:locale", content: "pt_BR" },
        { property: "og:image", content: `${SITE_URL}${ogImage}` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: `${SITE_URL}${ogImage}` },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
});

/**
 * Animações explicativas, por slug.
 *
 * Só entram os tratamentos cujo mecanismo é difícil de imaginar lendo: como as
 * três peças do implante se encaixam, como o fio move o dente, como a prótese
 * se apoia nos implantes. Onde o texto já explica bem, vídeo seria peso sem ganho.
 */
const VIDEOS: Record<string, { src: string; poster: string; descricao: string }> = {
  "limpeza-profilaxia": {
    src: videoLimpeza,
    poster: posterLimpeza,
    descricao: "Água percorrendo os dentes e levando a placa acumulada na superfície.",
  },
  "clareamento-dental": {
    src: videoClareamento,
    poster: posterClareamento,
    descricao: "Seringa de gel clareador e a moldeira usada para aplicar o produto nos dentes.",
  },
  "harmonizacao-orofacial": {
    src: videoHarmonizacao,
    poster: posterHarmonizacao,
    descricao: "Regiões do rosto — maçãs, bochechas e contorno — que a harmonização trabalha.",
  },
  restauracoes: {
    src: videoRestauracao,
    poster: posterRestauracao,
    descricao: "Dente com cárie recebendo a restauração, que fecha o buraco e deixa o dente liso.",
  },
  odontopediatria: {
    src: videoOdontopediatria,
    poster: posterOdontopediatria,
    descricao: "Escova passando pelos dentes em movimento calmo, mostrando a escovação certa.",
  },
  "implantes-dentarios": {
    src: videoImplante,
    poster: posterImplante,
    descricao:
      "Implante fixado no osso recebendo o pilar e a coroa, até virar um dente igual aos vizinhos.",
  },
  ortodontia: {
    src: videoOrtodontia,
    poster: posterOrtodontia,
    descricao:
      "Bráquetes e fio sendo colocados nos dentes tortos, que se alinham até formar o arco.",
  },
  "proteses-dentarias": {
    src: videoProtese,
    poster: posterProtese,
    descricao: "Prótese fixa se encaixando sobre seis implantes na arcada inferior.",
  },
};

const VISUALS = [
  consultorioRealImg,
  esterilizacaoImg,
  equipamentoImg,
  consultorioReal2Img,
  consultorioWideImg,
  consultorioRealImg,
  equipamentoImg,
  consultorioReal2Img,
];

function TreatmentPage() {
  const { slug } = Route.useParams();
  const index = TRATAMENTOS.findIndex((item) => item.slug === slug);
  const treatment = TRATAMENTOS[index];

  if (!treatment) {
    return (
      <div className="min-h-dvh bg-forest-2 text-white">
        <SkipLink />
        <Header />
        <main
          id="conteudo"
          className="container-jp flex min-h-[80vh] flex-col justify-center pt-32"
        >
          <p className="eyebrow text-lime">Página não encontrada</p>
          <h1 className="mt-5 max-w-3xl font-display text-6xl font-black leading-[.82] tracking-[-.07em] sm:text-8xl">
            Esse caminho não existe.
          </h1>
          <a href="/#tratamentos" className="button-primary mt-8 w-fit">
            <ArrowLeft className="h-4 w-4" /> Voltar aos tratamentos
          </a>
        </main>
      </div>
    );
  }

  const image = VISUALS[Math.max(index, 0) % VISUALS.length];
  const video = treatment ? VIDEOS[treatment.slug] : undefined;
  const wa = whatsappLink(
    `Olá! Vi a página sobre ${treatment.titulo} e gostaria de agendar uma avaliação na JP Clínica Integrada Odontológica.`,
  );
  const others = TRATAMENTOS.filter((item) => item.slug !== treatment.slug).slice(0, 3);

  return (
    <div className="min-h-dvh bg-cream">
      <CinematicMotion />
      <SkipLink />
      <Header />

      <main id="conteudo">
        <section className="treatment-hero hero-noise relative isolate overflow-hidden bg-forest-2 pb-24 pt-32 text-white sm:pb-32 sm:pt-40 lg:min-h-[92vh] lg:pb-40 lg:pt-48">
          <div className="treatment-orbit" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div
            aria-hidden="true"
            className="big-outline absolute -right-[5vw] top-[12%] font-display text-[clamp(15rem,34vw,38rem)] font-black leading-none tracking-[-.15em] opacity-[.1]"
          >
            JP
          </div>
          <div className="container-jp relative z-10 grid gap-12 lg:grid-cols-[1.08fr_.92fr] lg:items-center">
            <div>
              <Reveal>
                <a
                  href="/#tratamentos"
                  className="eyebrow text-lime transition-opacity hover:opacity-70"
                >
                  <ArrowLeft className="h-4 w-4" /> Todos os tratamentos
                </a>
                <p className="mt-8 text-[10px] font-black uppercase tracking-[.2em] text-white/42">
                  0{index + 1} / 08 • JP Clínica Integrada Odontológica
                </p>
                {/* Tracking capped at -.04em: at this size -.085em pulled the second
                    glyph over narrow first letters (the "I" in IMPLANTES vanished). */}
                <h1 className="mt-4 max-w-5xl font-display text-[clamp(2.8rem,10vw,9.4rem)] font-black leading-[.82] tracking-[-.04em] [overflow-wrap:anywhere]">
                  {treatment.short.toUpperCase()}
                  <span className="block text-lime">COM PROPÓSITO.</span>
                </h1>
                <p className="mt-7 max-w-2xl font-display text-2xl font-bold leading-[1.02] text-white/82 sm:text-3xl">
                  {treatment.kicker}
                </p>
                <p className="mt-5 max-w-xl text-base font-medium leading-relaxed text-white/58 sm:text-lg">
                  {treatment.desc}
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="button-primary">
                    <MessageCircle className="h-5 w-5" /> Agendar avaliação{" "}
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                  <a href="#entenda" className="button-ghost-light">
                    Entender o tratamento <ChevronDown className="h-4 w-4" />
                  </a>
                </div>
              </Reveal>
            </div>

            <Reveal delay={100} className="relative">
              <DepthCard className="treatment-visual relative mx-auto max-w-[620px]">
                <div className="overflow-hidden rounded-[2.5rem] border border-white/12 bg-white/6 p-2.5 shadow-[0_40px_100px_-40px_rgba(0,0,0,.7)]">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] sm:aspect-[5/4] lg:aspect-[4/5]">
                    <img
                      src={image}
                      alt={`JP Clínica Integrada Odontológica — ${treatment.titulo}`}
                      className="h-full w-full object-cover"
                      fetchPriority="high"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-forest-2/85 via-transparent to-forest-2/5" />
                    <div className="absolute inset-x-5 bottom-5 flex items-end justify-between gap-4 sm:inset-x-7 sm:bottom-7">
                      <div className="max-w-[22rem] rounded-2xl border border-white/12 bg-forest-2/72 p-5 backdrop-blur-xl">
                        <p className="text-[9px] font-black uppercase tracking-[.18em] text-lime">
                          A experiência JP
                        </p>
                        <p className="mt-2 font-display text-2xl font-black leading-[.95]">
                          {treatment.destaque}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="depth-glow" aria-hidden="true" />
              </DepthCard>
            </Reveal>
          </div>

          <div
            className="absolute inset-x-0 bottom-0 h-24 bg-cream [clip-path:polygon(0_70%,28%_92%,56%_48%,78%_76%,100%_36%,100%_100%,0_100%)] sm:h-32"
            aria-hidden="true"
          />
        </section>

        <section
          id="entenda"
          className="section-transition relative overflow-hidden bg-cream py-20 sm:py-28 lg:py-36"
        >
          <div className="container-jp">
            <Reveal className="grid gap-10 lg:grid-cols-[.7fr_1.3fr] lg:items-start">
              <div className="lg:sticky lg:top-32">
                <span className="eyebrow text-primary-ink">O que está por trás</span>
                <div className="mt-7 flex items-center gap-3">
                  <img
                    src={logo}
                    alt=""
                    className="h-14 w-14 rounded-full bg-white object-contain p-1 shadow-soft"
                  />
                  <div>
                    <p className="font-display text-xl font-black text-forest-2">JP Clínica</p>
                    <p className="text-[9px] font-black uppercase tracking-[.18em] text-forest/70">
                      Planejamento individual
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <p className="font-display text-[clamp(2.9rem,6.7vw,6.5rem)] font-black leading-[.88] tracking-[-.065em] text-forest-2">
                  {treatment.manifesto}
                </p>
                <div className="mt-10 border-t border-forest/10 pt-8 text-sm font-semibold leading-relaxed text-forest/70 sm:text-base">
                  A página explica a lógica do cuidado, mas não substitui uma avaliação.
                  Diagnóstico, indicação, técnica, número de sessões e expectativas dependem das
                  condições individuais de cada paciente.
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="section-transition bg-paper py-20 sm:py-28 lg:py-36">
          <div className="container-jp grid gap-12 lg:grid-cols-2 lg:gap-20">
            <Reveal>
              <span className="eyebrow text-primary-ink">Pode fazer sentido para</span>
              <h2 className="mt-5 font-display text-[clamp(3.2rem,6vw,5.8rem)] font-black leading-[.84] tracking-[-.065em] text-forest-2">
                NÃO É SOBRE CABER NUMA CAIXA.
              </h2>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-forest/70">
                É sobre entender o ponto de partida. Estes são cenários que podem levar alguém a
                conversar com a equipe sobre {treatment.titulo.toLowerCase()}.
              </p>
              <ul className="mt-9 grid gap-3">
                {treatment.paraQuem.map((item, i) => (
                  <li
                    key={item}
                    className="group flex items-center gap-4 rounded-2xl border border-forest/10 bg-white p-5 transition-transform duration-500 hover:translate-x-2"
                  >
                    <span className="section-number font-display text-2xl font-black text-primary/35">
                      0{i + 1}
                    </span>
                    <span className="font-display text-xl font-extrabold leading-tight text-forest-2">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={100}>
              <DepthCard className="relative h-full min-h-[520px] overflow-hidden rounded-[2.5rem] bg-forest-2">
                <img
                  src={index % 2 ? consultorioReal2Img : consultorioRealImg}
                  alt="Atendimento odontológico em consultório equipado"
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-forest-2 via-forest-2/12 to-transparent" />
                <div className="absolute inset-x-7 bottom-7 sm:inset-x-10 sm:bottom-10">
                  <p className="eyebrow text-lime">O que buscamos no cuidado</p>
                  <div className="mt-5 grid gap-3">
                    {treatment.beneficios.map((item) => (
                      <p
                        key={item}
                        className="flex items-start gap-3 font-display text-xl font-extrabold leading-tight text-white"
                      >
                        <Check className="mt-0.5 h-5 w-5 shrink-0 text-lime" /> {item}
                      </p>
                    ))}
                  </div>
                </div>
              </DepthCard>
            </Reveal>
          </div>
        </section>

        {video && (
          <section className="section-transition bg-secondary py-16 sm:py-20 lg:py-24">
            <div className="container-jp grid items-center gap-10 lg:grid-cols-[.85fr_1.15fr] lg:gap-16">
              <Reveal className="order-2 lg:order-1">
                <span className="eyebrow text-primary-ink">Veja como funciona</span>
                <h2 className="mt-5 max-w-md font-display text-[clamp(2.2rem,4vw,3.4rem)] font-black leading-[.98] tracking-[-.04em] text-forest-2">
                  Mais fácil de entender <span className="text-primary">vendo.</span>
                </h2>
                <p className="mt-6 max-w-md text-base font-medium leading-relaxed text-forest/72">
                  {video.descricao}
                </p>
                <p className="mt-5 max-w-md text-sm font-semibold leading-relaxed text-forest/70">
                  Animação ilustrativa. O planejamento do seu caso depende da avaliação
                  profissional.
                </p>
              </Reveal>

              <Reveal delay={100} className="order-1 mx-auto w-full max-w-[26rem] lg:order-2">
                <TreatmentVideo src={video.src} poster={video.poster} descricao={video.descricao} />
              </Reveal>
            </div>
          </section>
        )}

        <section className="section-transition process-stage relative overflow-hidden bg-lime py-20 text-forest-2 sm:py-28 lg:py-36">
          <div className="process-orbit" aria-hidden="true" />
          <div className="container-jp relative">
            <Reveal className="max-w-5xl">
              <span className="eyebrow text-forest-2/55">
                Do primeiro contato ao acompanhamento
              </span>
              <h2 className="mt-5 font-display text-[clamp(3.8rem,8vw,8rem)] font-black leading-[.78] tracking-[-.075em]">
                UM PROCESSO. <span className="text-forest-2/70">QUATRO MOMENTOS.</span>
              </h2>
            </Reveal>
            <ol className="mt-14 grid gap-4 lg:grid-cols-4">
              {treatment.etapas.map((step, i) => (
                <Reveal as="li" key={step.n} delay={i * 75}>
                  <article className="process-card relative min-h-[310px] overflow-hidden rounded-[2rem] border border-forest-2/12 bg-white/24 p-6 backdrop-blur-sm sm:p-7">
                    <span className="section-number font-display text-6xl font-black text-forest-2/13">
                      {step.n}
                    </span>
                    <div className="mt-16">
                      <h3 className="font-display text-2xl font-black leading-[.95]">
                        {step.titulo}
                      </h3>
                      <p className="mt-4 text-sm font-semibold leading-relaxed text-forest-2/58">
                        {step.texto}
                      </p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <section className="section-transition bg-forest-2 py-20 text-white sm:py-28 lg:py-36">
          <div className="container-jp grid gap-12 lg:grid-cols-[.8fr_1.2fr]">
            <Reveal>
              <span className="eyebrow text-lime">Perguntas sobre {treatment.short}</span>
              <h2 className="mt-5 font-display text-[clamp(3.2rem,6vw,5.8rem)] font-black leading-[.83] tracking-[-.065em]">
                ANTES DE DECIDIR, <span className="text-lime">ENTENDA.</span>
              </h2>
              <div className="mt-8 flex items-center gap-2 text-sm font-bold text-white/50">
                <Star className="h-4 w-4 fill-lime text-lime" /> {CLINICA.provaSocial}
              </div>
            </Reveal>
            <div className="grid gap-3">
              {treatment.faq.map((item, i) => (
                <Reveal key={item.q} delay={i * 70}>
                  <details className="group rounded-2xl border border-white/10 bg-white/[.055] open:border-lime/55 open:bg-white/[.08]">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-5 p-6 font-display text-xl font-extrabold">
                      <span className="flex gap-4">
                        <span className="section-number text-sm text-lime/60">0{i + 1}</span>
                        {item.q}
                      </span>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lime text-forest-2 transition-transform group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="px-6 pb-6 pl-[4.3rem] text-sm leading-relaxed text-white/54">
                      {item.a}
                    </p>
                  </details>
                </Reveal>
              ))}
              <Reveal delay={140}>
                <div className="mt-4 rounded-[2rem] border border-lime/25 bg-lime p-7 text-forest-2 sm:p-8">
                  <BadgeCheck className="h-6 w-6" />
                  <h3 className="mt-7 max-w-xl font-display text-3xl font-black leading-[.92] sm:text-4xl">
                    A melhor próxima etapa é a que começa com informação sobre o seu caso.
                  </h3>
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button-dark mt-7"
                  >
                    <CalendarCheck className="h-5 w-5" /> Agendar avaliação
                  </a>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="bg-cream py-20 sm:py-28 lg:py-36">
          <div className="container-jp">
            <Reveal className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <span className="eyebrow text-primary-ink">Continue explorando</span>
                <h2 className="mt-5 font-display text-[clamp(3rem,6vw,5.4rem)] font-black leading-[.84] tracking-[-.065em] text-forest-2">
                  OUTROS CAMINHOS DE CUIDADO.
                </h2>
              </div>
              <a href="/#tratamentos" className="button-dark shrink-0">
                Ver todos <ArrowUpRight className="h-4 w-4" />
              </a>
            </Reveal>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {others.map((item, i) => (
                <Reveal key={item.slug} delay={i * 70}>
                  <a
                    href={`/tratamentos/${item.slug}`}
                    className="group block min-h-[270px] rounded-[2rem] border border-forest/10 bg-white p-6 transition-all duration-500 hover:-translate-y-2 hover:border-lime hover:shadow-lift sm:p-7"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-mint text-forest-2">
                      <Sparkles className="h-5 w-5" />
                    </span>
                    <p className="mt-14 text-[9px] font-black uppercase tracking-[.16em] text-primary">
                      {item.kicker}
                    </p>
                    <h3 className="mt-3 font-display text-3xl font-black leading-[.9] text-forest-2">
                      {item.titulo}
                    </h3>
                    <span className="mt-6 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.08em] text-primary">
                      Abrir história{" "}
                      <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                    </span>
                  </a>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
      <FloatingCTA />
    </div>
  );
}
