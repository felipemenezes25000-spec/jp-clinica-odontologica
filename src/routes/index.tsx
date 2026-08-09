import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowUpRight,
  Baby,
  BadgeCheck,
  CalendarCheck,
  Check,
  Clock3,
  Facebook,
  HeartHandshake,
  Instagram,
  MapPin,
  MessageCircle,
  Phone,
  SmilePlus,
  Star,
  Stethoscope,
  UsersRound,
} from "lucide-react";

import logo from "@/assets/logo-jp-official.webp";
// Todas as imagens abaixo são fotos da própria JP. Nada de banco, nada gerado.
import fachadaImg from "@/assets/fachada.webp";
import consultorioRealImg from "@/assets/consultorio-1.webp";
import consultorioReal2Img from "@/assets/consultorio-2.webp";
import consultorioWideImg from "@/assets/consultorio-wide.webp";
import esterilizacaoImg from "@/assets/esterilizacao.webp";
import equipamentoImg from "@/assets/equipamento.webp";
import missaoQuadroImg from "@/assets/missao-quadro.webp";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Reveal } from "@/components/site/Reveal";
import { ContactForm } from "@/components/site/ContactForm";
import { FloatingCTA } from "@/components/site/FloatingCTA";
import { CinematicMotion } from "@/components/site/CinematicMotion";
import { SkipLink } from "@/components/site/SkipLink";
import { TreatmentIcon } from "@/components/site/TreatmentIcons";
import { AppleMark } from "@/components/site/AppleMark";
import {
  CLINICA,
  DEPOIMENTOS,
  EQUIPE,
  FAQ,
  HISTORIA,
  MISSAO,
  TRATAMENTOS,
  whatsappLink,
} from "@/lib/jp";

const TITLE = "JP Clínica Odontológica — Dentista na Freguesia do Ó, São Paulo";
const DESCRIPTION =
  "JP Clínica Odontológica na Vila Bruna, região da Freguesia do Ó em São Paulo. Prevenção, clareamento, restaurações, implantes, próteses, ortodontia e odontopediatria.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: "/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Dentist",
          name: CLINICA.nome,
          legalName: CLINICA.razaoSocial,
          slogan: CLINICA.assinatura,
          telephone: "+551139759902",
          address: {
            "@type": "PostalAddress",
            streetAddress: "R. Rio Verde, 1029",
            addressLocality: "São Paulo",
            addressRegion: "SP",
            postalCode: "02934-201",
            addressCountry: "BR",
          },
          areaServed: ["Vila Bruna", "Freguesia do Ó", "São Paulo"],
          openingHoursSpecification: [
            {
              "@type": "OpeningHoursSpecification",
              dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
              opens: "08:00",
              closes: "18:00",
            },
          ],
          sameAs: [CLINICA.instagram, CLINICA.facebook],
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }),
      },
    ],
  }),
  component: Home,
});

function WaveDivider({ fill = "var(--cream)" }: { fill?: string }) {
  return (
    <svg className="jp-wave" viewBox="0 0 1600 220" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M0 120C235 58 408 189 655 126C863 73 1014 10 1228 74C1376 119 1480 100 1600 51V220H0V120Z"
        fill={fill}
      />
      <path
        d="M0 160C230 103 386 207 636 162C876 119 1042 44 1242 101C1394 144 1491 126 1600 91"
        fill="none"
        stroke="color-mix(in oklab, var(--lime) 66%, transparent)"
        strokeWidth="5"
      />
    </svg>
  );
}

function BrandMark() {
  return (
    <span className="inline-flex items-center gap-3">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-white shadow-soft">
        <img src={logo} alt="" className="h-10 w-10 object-contain" />
      </span>
      <span className="text-xs font-black uppercase tracking-[.18em] text-forest/70">
        JP Clínica Odontológica
      </span>
    </span>
  );
}

function Home() {
  const waGeral = whatsappLink(
    "Olá! Vim pelo site da JP Clínica Odontológica e gostaria de agendar uma avaliação.",
  );

  return (
    <div className="min-h-dvh bg-cream">
      <CinematicMotion />
      <SkipLink />
      <Header />

      <main id="conteudo">
        {/* HERO */}
        <section
          id="inicio"
          className="hero-noise relative isolate min-h-[900px] overflow-hidden bg-forest-2 pb-36 pt-28 text-white sm:min-h-[940px] lg:min-h-[900px] lg:pb-44 lg:pt-40"
        >
          <div
            aria-hidden="true"
            className="big-outline pointer-events-none absolute -right-[3vw] top-[12%] z-0 font-display text-[clamp(15rem,38vw,42rem)] font-black leading-[.72] tracking-[-.13em] opacity-[.13]"
          >
            JP
          </div>
          <div
            aria-hidden="true"
            className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-lime/15 blur-[100px]"
          />
          <div
            aria-hidden="true"
            className="absolute right-[12%] top-[8%] h-96 w-96 rounded-full bg-primary/20 blur-[130px]"
          />

          <div className="container-jp relative z-10 grid gap-14 lg:grid-cols-[1.06fr_.94fr] lg:items-center lg:gap-8">
            <Reveal>
              <div className="eyebrow text-lime">
                <AppleMark className="h-4 w-4 shrink-0" strokeWidth={2} />
                Vila Bruna • Freguesia do Ó
              </div>
              <h1 className="mt-7 max-w-4xl font-display text-[clamp(4.2rem,10vw,8.4rem)] font-black leading-[.78] tracking-[-.075em] text-white">
                <span className="hero-word hero-word-1 block">SORRIR</span>
                <span className="hero-word hero-word-2 block text-lime">MUDA</span>
                <span className="hero-word hero-word-3 block">TUDO.</span>
              </h1>
              <p className="mt-7 max-w-xl text-base font-medium leading-relaxed text-white/66 sm:text-lg">
                Odontologia completa para crianças, adultos e idosos, com conversa clara,
                planejamento individual e um jeito de cuidar que faz você se sentir em casa.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href={waGeral}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button-primary"
                >
                  <MessageCircle className="h-5 w-5" />
                  Agendar pelo WhatsApp
                  <ArrowUpRight className="h-4 w-4" />
                </a>
                <a href="#tratamentos" className="button-ghost-light">
                  Explorar tratamentos
                  <ArrowDownRight className="h-4 w-4" />
                </a>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-bold text-white/54">
                <span className="flex items-center gap-2">
                  <Star className="h-4 w-4 fill-lime text-lime" /> {CLINICA.provaSocial}
                </span>
                <span className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-lime" /> Segunda a sexta • 08h–18h
                </span>
              </div>
            </Reveal>

            <Reveal
              delay={100}
              className="relative mx-auto w-full max-w-[620px] lg:mx-0 lg:ml-auto"
            >
              <div className="photo-frame hero-depth photo-tilt relative z-10 overflow-hidden rounded-[2.2rem] border border-white/12 bg-white/8 p-2.5 backdrop-blur-sm sm:rounded-[2.8rem] sm:p-3">
                <div className="relative aspect-[4/3] overflow-hidden rounded-[1.65rem] sm:rounded-[2.2rem]">
                  <img
                    src={consultorioRealImg}
                    alt="Consultório da JP Clínica, claro e com luz natural"
                    className="h-full w-full object-cover object-center"
                    fetchPriority="high"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-forest-2/45 via-transparent to-transparent" />
                  <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3 sm:inset-x-6 sm:bottom-6">
                    <div className="rounded-2xl border border-white/15 bg-forest-2/78 p-4 backdrop-blur-xl sm:p-5">
                      <p className="text-[10px] font-black uppercase tracking-[.16em] text-lime">
                        Consulta sem susto
                      </p>
                      <p className="mt-1 max-w-[14rem] font-display text-xl font-extrabold leading-tight text-white sm:text-2xl">
                        Ambiente calmo, conversa clara.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -left-4 -top-6 z-20 rounded-2xl bg-lime px-4 py-3 text-forest-2 shadow-lift sm:-left-10 sm:top-14 sm:px-5 sm:py-4">
                <p className="text-[9px] font-black uppercase tracking-[.14em]">
                  Para toda a família
                </p>
                <p className="mt-1 font-display text-xl font-black leading-none sm:text-2xl">
                  criança → adulto → idoso
                </p>
              </div>

              <div className="absolute -bottom-10 -right-3 z-20 hidden w-48 overflow-hidden rounded-[1.6rem] border-[6px] border-forest-2 bg-white shadow-lift sm:block">
                <span className="grid aspect-square w-full place-items-center bg-lime text-forest-2">
                  <AppleMark className="h-20 w-20" strokeWidth={1.2} />
                </span>
              </div>
            </Reveal>
          </div>

          <div className="container-jp relative z-10 mt-16 lg:mt-12">
            <Reveal delay={180}>
              <div className="grid overflow-hidden rounded-[1.65rem] border border-white/10 bg-white/[.055] backdrop-blur-sm sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["01", "Atendimento humano", "Escuta e explicação antes de decidir."],
                  ["02", "Cuidado completo", "Prevenção, estética e reabilitação."],
                  ["03", "Perto de casa", "Vila Bruna, região da Freguesia do Ó."],
                  ["04", "Contato fácil", "WhatsApp e telefone direto com a clínica."],
                ].map(([n, t, d], i) => (
                  <div
                    key={n}
                    className={`p-5 sm:p-6 ${i > 0 ? "border-t border-white/10 sm:border-t-0 sm:border-l lg:border-l" : ""} ${i === 2 ? "sm:border-l-0 lg:border-l" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="section-number font-display text-xl font-black text-lime/72">
                        {n}
                      </span>
                      <span className="text-sm font-black text-white">{t}</span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-white/48">{d}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          <WaveDivider />
        </section>

        {/* MANIFESTO */}
        <section
          id="clinica"
          className="section-transition relative overflow-hidden bg-cream py-20 sm:py-28 lg:py-36"
        >
          <div aria-hidden="true" className="grid-fade absolute inset-0 opacity-30" />
          <div className="container-jp relative">
            <Reveal className="grid gap-8 lg:grid-cols-[.82fr_1.18fr] lg:items-end">
              <BrandMark />
              <p className="font-display text-[clamp(2.9rem,6.4vw,6.4rem)] font-black leading-[.9] tracking-[-.065em] text-forest-2">
                Dentista é técnica. <span className="text-primary">Cuidado</span> é o que faz você
                querer voltar.
              </p>
            </Reveal>

            <div className="mt-14 grid gap-8 lg:mt-20 lg:grid-cols-[1.05fr_.95fr] lg:items-stretch">
              <Reveal className="relative min-h-[500px] overflow-hidden rounded-[2.3rem] bg-forest-2 sm:min-h-[620px]">
                <img
                  src={consultorioReal2Img}
                  alt="Consultório da JP com equipo, monitor e quadro na parede"
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-forest-2 via-forest-2/10 to-transparent" />
                <div className="absolute inset-x-6 bottom-6 sm:inset-x-8 sm:bottom-8">
                  <span className="eyebrow text-lime">Nossa cultura</span>
                  <p className="mt-3 max-w-xl font-display text-3xl font-extrabold leading-[.98] text-white sm:text-4xl">
                    Antes de ser uma marca, a JP é uma equipe presente no dia a dia das famílias.
                  </p>
                </div>
              </Reveal>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                {[
                  {
                    icon: HeartHandshake,
                    title: "Escutar antes de indicar",
                    text: "A avaliação começa pela sua história, sua queixa e pelo que faz sentido para sua rotina.",
                  },
                  {
                    icon: BadgeCheck,
                    title: "Explicar sem complicar",
                    text: "Você entende as possibilidades, as etapas e o motivo de cada recomendação antes de seguir.",
                  },
                  {
                    icon: Stethoscope,
                    title: "Planejar caso a caso",
                    text: "Tratamentos são definidos individualmente, mediante avaliação profissional e necessidade clínica.",
                  },
                  {
                    icon: UsersRound,
                    title: "Acompanhar a família",
                    text: "Da infância à maturidade, a proposta é oferecer um ponto de cuidado odontológico próximo e confiável.",
                  },
                ].map((item, i) => (
                  <Reveal key={item.title} delay={i * 70}>
                    <article className="card-premium group flex h-full items-start gap-5 p-6 transition-transform duration-500 hover:-translate-y-1 sm:p-7">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-mint text-forest-2 transition-colors group-hover:bg-lime">
                        <item.icon className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="font-display text-xl font-extrabold leading-tight text-forest-2">
                          {item.title}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-forest/70">{item.text}</p>
                      </div>
                    </article>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* HISTORY */}
        <section
          id="historia"
          className="hero-noise section-transition relative isolate overflow-hidden bg-forest-2 py-20 text-white sm:py-28 lg:py-36"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-lime/10 blur-[130px]"
          />
          {/* Motivo da marca em escala, no mesmo papel que o "JP" cumpre no hero. */}
          <AppleMark
            strokeWidth={0.55}
            className="pointer-events-none absolute -right-16 -top-10 h-[34rem] w-[34rem] text-lime/[.07] sm:-right-4"
          />

          <div className="container-jp relative">
            <Reveal className="max-w-5xl">
              <span className="eyebrow text-lime">Nossa história</span>

              {/* O número vive dentro da frase, não ao lado dela: é o que faz a
                  informação ser lida como afirmação, e não como estatística solta. */}
              <h2 className="mt-7 font-display font-black leading-[.92] tracking-[-.05em] text-white">
                <span className="block text-[clamp(2.2rem,4.4vw,3.6rem)]">São</span>
                <span className="block text-[clamp(4.6rem,12vw,10rem)] leading-[.82] text-lime">
                  {HISTORIA.anos} anos
                </span>
                <span className="block text-[clamp(2.2rem,4.4vw,3.6rem)]">
                  cuidando dos sorrisos da Freguesia do Ó.
                </span>
              </h2>

              <div className="mt-10 max-w-2xl space-y-5 text-base font-medium leading-relaxed text-white/66 sm:text-lg">
                <p>
                  Tempo suficiente para ver criança virar adulto e para acompanhar famílias inteiras
                  — às vezes três gerações da mesma casa sentando na mesma cadeira.
                </p>
                <p>
                  Nesse caminho, o jeito de trabalhar não mudou: escutar antes de indicar, explicar
                  sem complicar e planejar caso a caso.
                </p>
              </div>

              <figure className="mt-10 grid max-w-4xl gap-7 sm:grid-cols-[auto_1fr] sm:items-center">
                <img
                  src={missaoQuadroImg}
                  alt="Quadro com a missão da JP Clínica afixado na parede da clínica"
                  loading="lazy"
                  className="w-40 rounded-2xl border border-white/12 shadow-lift sm:w-48"
                />
                <div className="border-l-2 border-lime pl-6">
                  <blockquote className="font-display text-2xl font-extrabold leading-tight text-white sm:text-3xl">
                    “{MISSAO}”
                  </blockquote>
                  <figcaption className="mt-3 text-xs font-black uppercase tracking-[.16em] text-lime/80">
                    Missão da {CLINICA.nome} — transcrita do quadro na parede
                  </figcaption>
                </div>
              </figure>

              <div className="mt-10 flex flex-wrap gap-3">
                {[`Desde ${HISTORIA.fundacao}`, CLINICA.provaSocial, CLINICA.bairro].map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/14 bg-white/[.06] px-4 py-2 text-xs font-bold text-white/72"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* MARQUEE */}
        <section
          className="marquee overflow-hidden border-y border-forest/10 bg-lime py-4 text-forest-2"
          aria-label="Principais tratamentos"
        >
          <div className="marquee-track">
            {[
              ...TRATAMENTOS.map((t) => ({ ...t, duplicata: false })),
              ...TRATAMENTOS.map((t) => ({ ...t, duplicata: true })),
            ].map((item, i) => (
              <span
                key={`${item.titulo}-${i}`}
                // A segunda passada existe só para a ilusão de rolagem contínua.
                // Sem isto, o leitor de tela anuncia os 8 tratamentos duas vezes.
                aria-hidden={item.duplicata || undefined}
                className="flex items-center whitespace-nowrap px-5 font-display text-base font-black uppercase tracking-[-.02em] sm:px-8 sm:text-xl"
              >
                {item.titulo}
                <span className="ml-8 inline-block h-2 w-2 rounded-full bg-forest-2/45" />
              </span>
            ))}
          </div>
        </section>

        {/* TREATMENTS */}
        <section
          id="tratamentos"
          className="section-transition relative overflow-hidden bg-secondary py-20 text-forest-2 sm:py-28 lg:py-36"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-40 top-1/4 h-[34rem] w-[34rem] rounded-full bg-white/50 blur-[130px]"
          />
          <div className="container-jp relative">
            <Reveal className="grid gap-10 lg:grid-cols-[1fr_.72fr] lg:items-start">
              <div>
                <span className="eyebrow text-primary-ink">Tratamentos</span>
                {/* leading .82 was shorter than the glyph box: the Q descender in
                    "QUE VOCÊ" collided with the line below. .9 keeps it tight but clear. */}
                <h2 className="mt-5 max-w-4xl font-display text-[clamp(2.6rem,7.8vw,7.4rem)] font-black leading-[.92] tracking-[-.055em] [overflow-wrap:anywhere]">
                  NOSSAS <span className="text-primary">ESPECIALIDADES.</span>
                </h2>
              </div>
              <div className="lg:pt-6">
                <p className="max-w-lg text-base font-medium leading-relaxed text-forest/75">
                  O site mostra caminhos. Quem define a indicação é a avaliação profissional.
                  Conheça as áreas de cuidado encontradas nos materiais da JP.
                </p>
                <a
                  href={waGeral}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button-glow group/cta mt-8 inline-flex items-center gap-5 rounded-full bg-lime py-2 pl-7 pr-2 text-forest-2 transition-transform duration-300 hover:-translate-y-1"
                >
                  <span className="font-display text-base font-black tracking-[-.01em]">
                    Quero entender meu caso
                  </span>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-forest-2 text-lime">
                    <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5" />
                  </span>
                </a>
              </div>
            </Reveal>

            {/* Uniform 4-column grid. The previous asymmetric layout let each card
                push its own content down by a different amount — titles in the same
                row ended up 135px apart. Icon + title only keeps every card identical. */}
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:mt-16 lg:grid-cols-4">
              {TRATAMENTOS.map((item, i) => {
                return (
                  <Reveal key={item.titulo} delay={(i % 4) * 55}>
                    <article className="service-card group flex h-full flex-col items-center p-7 text-center sm:p-8">
                      <span className="grid h-[4.5rem] w-[4.5rem] shrink-0 place-items-center rounded-full text-forest-2 ring-1 ring-forest/12 transition-all duration-500 group-hover:bg-primary/8 group-hover:text-primary-ink group-hover:ring-primary/45">
                        <TreatmentIcon index={i} className="h-9 w-9" />
                      </span>

                      <h3 className="mt-6 font-display text-xl font-extrabold leading-[1.1] tracking-[-.02em]">
                        <a
                          href={`/tratamentos/${item.slug}`}
                          className="stretch-link outline-offset-4 transition-colors group-hover:text-primary-ink"
                        >
                          {item.titulo}
                        </a>
                      </h3>

                      <div className="card-swap mt-4 w-full">
                        <p className="swap-prompt text-xs font-bold leading-relaxed text-primary-ink">
                          Passe o mouse para saber
                          <br />
                          mais sobre o procedimento
                        </p>
                        <p className="swap-body text-sm leading-relaxed text-forest/75">
                          {item.desc}
                        </p>
                      </div>

                      <a
                        href={whatsappLink(
                          `Olá! Gostaria de saber mais sobre ${item.titulo} na JP Clínica Odontológica.`,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative z-[2] mt-auto inline-flex items-center gap-2 pt-6 text-[11px] font-black uppercase tracking-[.08em] text-forest/72 transition-colors hover:text-forest-2"
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                        Falar no WhatsApp
                      </a>

                      <span
                        aria-hidden="true"
                        className="absolute inset-x-8 bottom-0 h-[3px] rounded-full bg-forest/10 transition-all duration-500 group-hover:inset-x-0 group-hover:bg-primary"
                      />
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* CHECKUP */}
        <section className="section-transition relative overflow-hidden bg-lime py-20 text-forest-2 sm:py-28 lg:py-32">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[.08] [background-image:radial-gradient(#08391f_1px,transparent_1px)] [background-size:16px_16px]"
          />
          <div className="container-jp relative grid gap-12 lg:grid-cols-[1fr_.9fr] lg:items-center">
            <Reveal>
              <span className="eyebrow text-forest-2/58">Prevenção é presença</span>
              <h2 className="mt-5 max-w-3xl font-display text-[clamp(3.7rem,8vw,7.6rem)] font-black leading-[.79] tracking-[-.075em]">
                SEU SORRISO PEDE <span className="text-forest-2/70">CHECK-UP.</span>
              </h2>
              <p className="mt-7 max-w-xl text-base font-semibold leading-relaxed text-forest-2/68 sm:text-lg">
                Limpeza, avaliação de tártaro, restaurações, clareamento e outras necessidades podem
                ser discutidas em uma consulta de acompanhamento. O intervalo ideal depende do seu
                caso.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                {["Limpeza", "Clareamento", "Implantes", "Restaurações", "Remoção de tártaro"].map(
                  (tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-forest-2/14 bg-white/25 px-4 py-2 text-xs font-black uppercase tracking-[.06em]"
                    >
                      {tag}
                    </span>
                  ),
                )}
              </div>
              <a
                href={whatsappLink(
                  "Olá! Gostaria de agendar um check-up na JP Clínica Odontológica.",
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="button-dark mt-8"
              >
                <CalendarCheck className="h-5 w-5" />
                Agendar meu check-up
              </a>
            </Reveal>

            <Reveal delay={100} className="relative mx-auto w-full max-w-[540px]">
              <div
                className="absolute -inset-5 rotate-3 rounded-[2.8rem] border-2 border-forest-2/12"
                aria-hidden="true"
              />
              <div className="relative -rotate-2 overflow-hidden rounded-[2.2rem] border-[8px] border-white bg-cream shadow-[0_35px_90px_-35px_rgba(0,0,0,.42)] transition-transform duration-700 hover:rotate-0">
                <div className="p-7 pb-14 sm:p-9 sm:pb-12">
                  <img src={logo} alt="" aria-hidden="true" className="h-11 w-auto" />

                  <span className="eyebrow mt-6 block text-forest/70">Convite ao check-up</span>
                  <p className="mt-3 font-display text-[2.5rem] font-black leading-[.88] tracking-[-.05em] text-forest-2 sm:text-[3rem]">
                    MARQUE SUA <span className="text-primary">AVALIAÇÃO.</span>
                  </p>

                  <a
                    href={whatsappLink(
                      "Olá! Vim pelo site da JP Clínica Odontológica e gostaria de marcar minha avaliação.",
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-7 flex items-center gap-4 rounded-2xl bg-forest-2 px-5 py-4 text-white transition-transform duration-300 hover:-translate-y-1"
                  >
                    <MessageCircle className="h-6 w-6 shrink-0 text-lime" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-[9px] font-black uppercase tracking-[.16em] text-lime">
                        WhatsApp
                      </span>
                      <span className="block truncate font-display text-xl font-black">
                        {CLINICA.whatsapp}
                      </span>
                    </span>
                    <ArrowUpRight className="ml-auto h-5 w-5 shrink-0" aria-hidden="true" />
                  </a>

                  <div className="mt-5 grid gap-3 border-t border-forest/10 pt-5 text-sm font-semibold text-forest/70">
                    <a
                      href={CLINICA.telefoneHref}
                      className="flex items-center gap-3 transition-colors hover:text-forest-2"
                    >
                      <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      {CLINICA.telefone}
                    </a>
                    <span className="flex items-center gap-3">
                      <Clock3 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      {CLINICA.horario}
                    </span>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-6 -left-4 rounded-2xl bg-forest-2 px-5 py-4 text-white shadow-lift sm:-left-10">
                <p className="text-[9px] font-black uppercase tracking-[.16em] text-lime">
                  Mensagem da JP
                </p>
                <p className="mt-1 font-display text-xl font-black">
                  “Ver seu sorriso é nossa missão.”
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* CLINIC EXPERIENCE */}
        <section className="section-transition bg-paper py-20 sm:py-28 lg:py-36">
          <div className="container-jp">
            <div className="grid gap-10 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
              <Reveal className="order-2 lg:order-1">
                <div className="relative overflow-hidden rounded-[2.3rem] bg-forest-2 p-2 shadow-lift">
                  <img
                    src={equipamentoImg}
                    alt="Equipo odontológico da JP, com as pontas organizadas e prontas"
                    loading="lazy"
                    className="aspect-[4/3] w-full rounded-[1.85rem] object-cover"
                  />
                  <div className="absolute bottom-6 left-6 rounded-2xl bg-forest-2/90 p-4 text-white backdrop-blur-xl sm:bottom-8 sm:left-8 sm:p-5">
                    <p className="text-[9px] font-black uppercase tracking-[.16em] text-lime">
                      Experiência de consulta
                    </p>
                    <p className="mt-1 font-display text-xl font-extrabold">
                      Clareza em cada etapa.
                    </p>
                  </div>
                </div>
              </Reveal>
              <Reveal delay={100} className="order-1 lg:order-2">
                <span className="eyebrow text-primary-ink">Como funciona</span>
                <h2 className="mt-5 max-w-3xl font-display text-[clamp(3.2rem,6.5vw,6.2rem)] font-black leading-[.84] tracking-[-.065em] text-forest-2">
                  MENOS ANSIEDADE. MAIS <span className="text-primary">CLAREZA.</span>
                </h2>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-forest/70 sm:text-lg">
                  Da primeira mensagem ao acompanhamento, a experiência foi desenhada para tornar o
                  caminho simples de entender.
                </p>
                <ol className="mt-8 grid gap-3">
                  {[
                    [
                      "01",
                      "Fale com a equipe",
                      "Conte o que você procura e combine o melhor horário.",
                    ],
                    [
                      "02",
                      "Faça sua avaliação",
                      "A equipe examina, ouve e esclarece as possibilidades para o seu caso.",
                    ],
                    [
                      "03",
                      "Entenda o planejamento",
                      "Você recebe uma orientação individual, com prioridades e próximos passos.",
                    ],
                    [
                      "04",
                      "Siga acompanhado",
                      "O cuidado continua com retornos e prevenção conforme indicação.",
                    ],
                  ].map(([n, title, text]) => (
                    <li
                      key={n}
                      className="group grid grid-cols-[auto_1fr] gap-4 rounded-2xl border border-forest/10 bg-cream p-4 transition-all hover:border-lime hover:bg-mint/55 sm:p-5"
                    >
                      <span className="section-number font-display text-3xl font-black text-primary/42 transition-colors group-hover:text-primary">
                        {n}
                      </span>
                      <div>
                        <h3 className="font-display text-lg font-extrabold text-forest-2">
                          {title}
                        </h3>
                        <p className="mt-1 text-sm leading-relaxed text-forest/70">{text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Reveal>
            </div>
          </div>
        </section>

        {/* FAMILY */}
        <section
          id="familia"
          className="relative min-h-[760px] overflow-hidden bg-forest-2 text-white sm:min-h-[860px] lg:min-h-[900px]"
        >
          <img
            src={consultorioWideImg}
            alt="Consultório da JP Clínica Odontológica"
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-forest-2 via-forest-2/75 to-forest-2/15" />
          <div className="absolute inset-0 bg-gradient-to-t from-forest-2/80 via-transparent to-transparent" />

          <div className="container-jp relative flex min-h-[760px] items-center py-20 sm:min-h-[860px] lg:min-h-[900px]">
            <Reveal className="max-w-3xl">
              <span className="eyebrow text-lime">Para toda a família</span>
              <h2 className="mt-5 font-display text-[clamp(4rem,9vw,8.8rem)] font-black leading-[.78] tracking-[-.075em]">
                UM LUGAR. <span className="block text-lime">MUITAS FASES</span> DA VIDA.
              </h2>
              <p className="mt-7 max-w-xl text-base font-medium leading-relaxed text-white/68 sm:text-lg">
                A criança que está começando. O adolescente de aparelho. O adulto em busca de
                prevenção ou estética. A maturidade que pede conforto e reabilitação. A JP conecta
                essas fases em um mesmo cuidado.
              </p>
              <div className="mt-8 grid max-w-2xl gap-2 sm:grid-cols-3">
                {[
                  [Baby, "Infância", "Odontopediatria"],
                  [SmilePlus, "Vida adulta", "Prevenção + estética"],
                  [UsersRound, "Maturidade", "Próteses + implantes"],
                ].map(([Icon, title, text]) => {
                  const C = Icon as typeof Baby;
                  return (
                    <div
                      key={String(title)}
                      className="rounded-2xl border border-white/12 bg-forest-2/55 p-4 backdrop-blur-md"
                    >
                      <C className="h-5 w-5 text-lime" />
                      <p className="mt-4 font-display text-lg font-extrabold">{String(title)}</p>
                      <p className="mt-1 text-xs text-white/50">{String(text)}</p>
                    </div>
                  );
                })}
              </div>
            </Reveal>
          </div>
        </section>

        {/* TESTIMONIALS */}
        <section
          id="depoimentos"
          className="section-transition noise bg-cream py-20 sm:py-28 lg:py-36"
        >
          <div className="container-jp">
            <Reveal className="grid gap-8 lg:grid-cols-[.65fr_1.35fr] lg:items-start">
              <div>
                <span className="eyebrow text-primary-ink">Confiança local</span>
                <div className="mt-6 flex items-baseline gap-2 text-forest-2">
                  <span className="font-display text-[7rem] font-black leading-none tracking-[-.08em] sm:text-[9rem]">
                    4,5
                  </span>
                  <span className="text-xl font-black">/5</span>
                </div>
                <div className="mt-2 flex gap-1 text-primary" aria-label="4,5 estrelas no Google">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-primary" />
                  ))}
                </div>
                <p className="mt-3 text-sm font-bold text-forest/70">176 avaliações no Google</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {DEPOIMENTOS.map((item, i) => (
                  <figure
                    key={item.autor}
                    className={`rounded-[2rem] p-7 sm:p-8 ${
                      i === 0
                        ? "bg-forest-2 text-white sm:col-span-2"
                        : "border border-forest/10 bg-white text-forest-2"
                    }`}
                  >
                    <Star
                      className={`h-6 w-6 ${i === 0 ? "fill-lime text-lime" : "fill-primary text-primary"}`}
                    />
                    <blockquote
                      className={`mt-7 font-display font-extrabold leading-[1.06] tracking-[-.04em] ${
                        i === 0 ? "text-3xl sm:text-4xl" : "text-2xl"
                      }`}
                    >
                      “{item.texto}”
                    </blockquote>
                    <figcaption
                      className={`mt-7 text-xs font-black uppercase tracking-[.12em] ${i === 0 ? "text-white/50" : "text-forest/70"}`}
                    >
                      {item.autor} • avaliação no Google
                    </figcaption>
                  </figure>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* TEAM */}
        <section
          id="equipe"
          className="section-transition relative overflow-hidden bg-secondary py-20 sm:py-28 lg:py-32"
        >
          <div className="container-jp">
            <Reveal className="max-w-3xl">
              <span className="eyebrow text-primary-ink">Quem cuida de você</span>
              <h2 className="mt-5 font-display text-[clamp(3rem,6.4vw,5.6rem)] font-black leading-[.9] tracking-[-.05em] text-forest-2">
                NOSSA <span className="text-primary">EQUIPE.</span>
              </h2>
              <p className="mt-6 max-w-xl text-base font-medium leading-relaxed text-forest/72">
                Atendimento feito por profissionais com registro ativo no Conselho Regional de
                Odontologia.
              </p>
            </Reveal>

            {/* Com uma única profissional, o grid de 4 colunas deixaria 76% da linha
                vazia e leria como layout quebrado. Aqui o card divide a linha com um
                texto de apoio; a partir do segundo nome, a grade de 4 assume sozinha. */}
            <div
              className={`mt-12 grid gap-8 ${
                EQUIPE.length === 1
                  ? "items-center lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-14"
                  : // Colunas acompanham a quantidade: 5 pessoas em 4 colunas
                    // deixariam um card sozinho na segunda linha.
                    `gap-5 sm:grid-cols-2 lg:grid-cols-3 ${
                      EQUIPE.length % 4 === 0 ? "xl:grid-cols-4" : "xl:grid-cols-5"
                    }`
              }`}
            >
              {EQUIPE.map((pessoa, i) => (
                <Reveal key={pessoa.registro} delay={i * 70}>
                  <article
                    className={`service-card group flex h-full flex-col p-7 sm:p-8 ${pessoa.placeholder ? "opacity-60" : ""}`}
                  >
                    {/* Forma da marca + retrato recortado transbordando o topo.
                        overflow-visible é o que permite a cabeça sair da forma —
                        sem isso o efeito vira uma foto dentro de uma caixa. */}
                    <div className="relative mx-auto w-full max-w-[15rem] overflow-visible pt-10">
                      <div
                        className={`relative aspect-[4/4.4] w-full rounded-t-full ${pessoa.placeholder ? "bg-forest/12" : "bg-lime"}`}
                      >
                        {pessoa.foto ? (
                          <img
                            src={pessoa.foto}
                            alt={`Retrato de ${pessoa.nome}`}
                            loading="lazy"
                            className="absolute inset-x-0 bottom-0 mx-auto h-[118%] w-auto max-w-none object-contain object-bottom"
                          />
                        ) : (
                          <span
                            className={`absolute inset-0 grid place-items-center ${pessoa.placeholder ? "text-forest/30" : "text-forest-2/45"}`}
                          >
                            <UsersRound className="h-16 w-16" aria-hidden="true" />
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="mt-7 text-center font-display text-2xl font-extrabold leading-tight tracking-[-.02em] text-forest-2">
                      {pessoa.nome}
                    </h3>
                    {pessoa.papel && (
                      <p className="mt-2 text-center text-xs font-black uppercase tracking-[.14em] text-primary-ink">
                        {pessoa.papel}
                      </p>
                    )}
                    {pessoa.placeholder && (
                      <p className="mt-2 text-center text-xs font-black uppercase tracking-[.14em] text-forest/70">
                        Vaga a preencher
                      </p>
                    )}

                    <dl className="mt-6 grid gap-4 border-t border-forest/10 pt-5 text-sm">
                      {pessoa.formacao && (
                        <div>
                          <dt className="text-[11px] font-black uppercase tracking-[.12em] text-forest/70">
                            Formação
                          </dt>
                          <dd className="mt-1 font-semibold text-forest/80">{pessoa.formacao}</dd>
                        </div>
                      )}
                      {pessoa.especialidade && (
                        <div>
                          <dt className="text-[11px] font-black uppercase tracking-[.12em] text-forest/70">
                            Especialidade
                          </dt>
                          <dd className="mt-1 font-semibold text-forest/80">
                            {pessoa.especialidade}
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-[11px] font-black uppercase tracking-[.12em] text-forest/70">
                          Registro
                        </dt>
                        <dd className="mt-1 font-semibold text-forest/80">{pessoa.registro}</dd>
                      </div>
                    </dl>
                  </article>
                </Reveal>
              ))}

              {EQUIPE.length === 1 && (
                <Reveal delay={120} className="hidden lg:block">
                  <div className="max-w-md">
                    <p className="font-display text-2xl font-extrabold leading-tight tracking-[-.02em] text-forest-2">
                      Quem atende você tem nome, formação e registro.
                    </p>
                    <p className="mt-5 text-base font-medium leading-relaxed text-forest/72">
                      O Conselho Federal de Odontologia exige que todo profissional seja
                      identificado com o número de CRO. É por isso que cada card traz o registro — e
                      por isso ninguém entra aqui sem ele confirmado.
                    </p>
                    <a
                      href={waGeral}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-7 inline-flex items-center gap-2 border-b border-primary-ink/40 pb-1 text-xs font-black uppercase tracking-[.08em] text-primary-ink transition-colors hover:border-primary-ink"
                    >
                      Falar com a equipe
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </div>
                </Reveal>
              )}
            </div>
          </div>
        </section>

        {/* CULTURE/GALLERY */}
        <section className="section-transition bg-paper py-20 sm:py-28 lg:py-36">
          <div className="container-jp">
            <Reveal className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <span className="eyebrow text-primary-ink">A clínica por dentro</span>
                <h2 className="mt-5 max-w-4xl font-display text-[clamp(3.3rem,7vw,6.8rem)] font-black leading-[.88] tracking-[-.055em] text-forest-2">
                  CONHEÇA <span className="text-primary">NOSSA ESTRUTURA.</span>
                </h2>
                <p className="mt-6 max-w-md text-sm font-semibold leading-relaxed text-forest/70">
                  Fotos reais da JP, na Rua Rio Verde, 1029. O que você vê aqui é o que você
                  encontra ao chegar.
                </p>
              </div>
              <a
                href={CLINICA.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="button-dark shrink-0"
              >
                <Instagram className="h-5 w-5" />
                Ver Instagram
              </a>
            </Reveal>

            <div className="mt-12 grid auto-rows-[220px] grid-cols-2 gap-3 sm:auto-rows-[300px] md:grid-cols-4 lg:auto-rows-[330px]">
              {[
                {
                  src: fachadaImg,
                  alt: "Fachada da JP Clínica Odontológica na Rua Rio Verde, 1029",
                  legenda: "Nossa fachada",
                  cls: "col-span-2 row-span-2",
                },
                {
                  src: consultorioRealImg,
                  alt: "Consultório da JP com cadeira odontológica, ar-condicionado e iluminação natural",
                  legenda: "Consultório",
                  cls: "col-span-2",
                },
                {
                  src: consultorioReal2Img,
                  alt: "Segundo consultório da JP, com equipo e monitor para explicar o tratamento",
                  legenda: "Sala de atendimento",
                  cls: "col-span-1",
                },
                {
                  src: esterilizacaoImg,
                  alt: "Sala de esterilização da JP, com autoclave e bancada de instrumentais",
                  legenda: "Esterilização",
                  cls: "col-span-1",
                },
              ].map((item, i) => (
                <Reveal key={item.src} delay={i * 70} className={item.cls}>
                  <figure className="gallery-card relative h-full overflow-hidden rounded-[1.6rem] bg-forest-2">
                    <img
                      src={item.src}
                      alt={item.alt}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-forest-2/45 via-transparent to-transparent" />
                    <figcaption className="absolute bottom-4 left-4 rounded-full border border-white/15 bg-forest-2/60 px-3 py-2 text-[9px] font-black uppercase tracking-[.12em] text-white backdrop-blur-md">
                      {item.legenda}
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="section-transition bg-cream py-20 sm:py-28 lg:py-36">
          <div className="container-jp grid gap-12 lg:grid-cols-[.68fr_1.32fr]">
            <Reveal>
              <span className="eyebrow text-primary-ink">Perguntas frequentes</span>
              <h2 className="mt-5 max-w-lg font-display text-[clamp(3.2rem,6vw,5.7rem)] font-black leading-[.85] tracking-[-.065em] text-forest-2">
                DÚVIDA BOA É DÚVIDA <span className="text-primary">RESPONDIDA.</span>
              </h2>
              <p className="mt-6 max-w-md text-sm leading-relaxed text-forest/70 sm:text-base">
                Se sua pergunta não estiver aqui, chama no WhatsApp. A equipe orienta sobre
                agendamento, localização e próximos passos.
              </p>
            </Reveal>

            <div className="grid gap-2">
              {FAQ.map((item, i) => (
                <Reveal key={item.q} delay={Math.min(i, 5) * 45}>
                  <details className="group rounded-2xl border border-forest/10 bg-white open:border-lime open:bg-mint/30">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-5 p-5 font-display text-lg font-extrabold text-forest-2 sm:p-6 sm:text-xl">
                      <span className="flex items-start gap-4">
                        <span className="section-number text-sm text-primary/55">0{i + 1}</span>
                        {item.q}
                      </span>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-forest-2 text-white transition-transform group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="px-5 pb-5 pl-[4.25rem] text-sm leading-relaxed text-forest/70 sm:px-6 sm:pb-6 sm:pl-[4.6rem]">
                      {item.a}
                    </p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* CONTACT — antes eram duas seções ("Onde estamos" e "Fale com a JP") dizendo
            a mesma coisa em sequência. Fundidas: uma só, com mapa e formulário juntos. */}
        <section
          id="fale"
          className="section-transition relative overflow-hidden bg-forest py-20 text-white sm:py-28 lg:py-36"
        >
          {/* âncora antiga preservada: links de fora podiam apontar para #contato */}
          <span id="contato" aria-hidden="true" className="absolute -top-24 block h-px w-px" />
          <div
            aria-hidden="true"
            className="absolute -left-32 bottom-0 h-96 w-96 rounded-full bg-lime/12 blur-[110px]"
          />

          <div className="container-jp relative grid gap-10 lg:grid-cols-[.9fr_1.1fr] lg:items-start">
            <Reveal>
              <span className="eyebrow text-lime">Fale com a JP</span>
              <h2 className="mt-5 font-display text-[clamp(3rem,8vw,7.8rem)] font-black leading-[.82] tracking-[-.075em] [overflow-wrap:anywhere]">
                SEU PRÓXIMO SORRISO PODE <span className="text-lime">COMEÇAR AQUI.</span>
              </h2>
              <p className="mt-7 max-w-xl text-base font-medium leading-relaxed text-white/70 sm:text-lg">
                Você escolhe o canal. A equipe ajuda a organizar a avaliação e orientar o próximo
                passo.
              </p>

              <div className="mt-9 grid gap-3 sm:grid-cols-2">
                <a
                  href={CLINICA.telefoneHref}
                  className="rounded-2xl border border-white/12 bg-white/[.055] p-5 transition-colors hover:bg-white/10"
                >
                  <Phone className="h-5 w-5 text-lime" aria-hidden="true" />
                  <p className="mt-5 text-[11px] font-black uppercase tracking-[.14em] text-white/60">
                    Telefone
                  </p>
                  <p className="mt-1 font-display text-xl font-extrabold">{CLINICA.telefone}</p>
                </a>
                <a
                  href={CLINICA.whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-2xl border border-white/12 bg-white/[.055] p-5 transition-colors hover:bg-white/10"
                >
                  <MessageCircle className="h-5 w-5 text-lime" aria-hidden="true" />
                  <p className="mt-5 text-[11px] font-black uppercase tracking-[.14em] text-white/60">
                    WhatsApp
                  </p>
                  <p className="mt-1 font-display text-xl font-extrabold">{CLINICA.whatsapp}</p>
                </a>
                <a
                  href={CLINICA.mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-2xl border border-white/12 bg-white/[.055] p-5 transition-colors hover:bg-white/10 sm:col-span-2"
                >
                  <MapPin className="h-5 w-5 text-lime" aria-hidden="true" />
                  <p className="mt-5 text-[11px] font-black uppercase tracking-[.14em] text-white/60">
                    Endereço
                  </p>
                  <p className="mt-1 max-w-lg font-display text-xl font-extrabold leading-tight">
                    {CLINICA.endereco}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.08em] text-lime">
                    Abrir rota <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </a>
              </div>

              <p className="mt-5 flex items-center gap-3 text-sm font-semibold text-white/70">
                <Clock3 className="h-5 w-5 shrink-0 text-lime" aria-hidden="true" />
                {CLINICA.horario} • a entrada tem acesso para pessoas com deficiência
              </p>

              <div className="mt-8 flex items-center gap-4 border-t border-white/10 pt-6">
                <span className="text-[11px] font-black uppercase tracking-[.16em] text-white/60">
                  Redes sociais
                </span>
                <a
                  href={CLINICA.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram da JP Clínica"
                  className="text-white/75 transition-colors hover:text-lime"
                >
                  <Instagram className="h-5 w-5" aria-hidden="true" />
                </a>
                <a
                  href={CLINICA.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook da JP Clínica"
                  className="text-white/75 transition-colors hover:text-lime"
                >
                  <Facebook className="h-5 w-5" aria-hidden="true" />
                </a>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <ContactForm />
            </Reveal>
          </div>

          {/* O mapa fecha a seção em largura total — antes ficava numa seção própria,
              repetindo endereço e telefone que já aparecem acima. */}
          <Reveal delay={160} className="container-jp relative mt-12 lg:mt-16">
            <div className="overflow-hidden rounded-[2rem] border border-white/12 bg-white/[.04] p-2">
              <iframe
                src={CLINICA.mapsEmbed}
                title="Mapa com a localização da JP Clínica Odontológica na Rua Rio Verde, 1029"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-[320px] w-full rounded-[1.6rem] border-0 sm:h-[400px]"
              />
            </div>
          </Reveal>
        </section>
      </main>

      <Footer />
      <FloatingCTA />
    </div>
  );
}
