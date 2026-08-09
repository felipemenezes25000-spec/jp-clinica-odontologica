import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CalendarCheck,
  Clock3,
  HeartHandshake,
  Instagram,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
  Stethoscope,
  UsersRound,
} from "lucide-react";

import logo from "@/assets/logo-jp-official.webp";
import fachadaImg from "@/assets/fachada.webp";
import consultorioRealImg from "@/assets/consultorio-1.webp";
import consultorioReal2Img from "@/assets/consultorio-2.webp";
import consultorioWideImg from "@/assets/consultorio-wide.webp";
import esterilizacaoImg from "@/assets/esterilizacao.webp";
import equipamentoImg from "@/assets/equipamento.webp";

import limpezaPoster from "@/assets/video-limpeza-poster.webp";
import clareamentoPoster from "@/assets/video-clareamento-poster.webp";
import restauracaoPoster from "@/assets/video-restauracao-poster.webp";
import implantePoster from "@/assets/video-implante-poster.webp";
import protesePoster from "@/assets/video-protese-poster.webp";
import ortodontiaPoster from "@/assets/video-ortodontia-poster.webp";
import odontopediatriaPoster from "@/assets/video-odontopediatria-poster.webp";
import harmonizacaoPoster from "@/assets/video-harmonizacao-poster.webp";

import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Reveal } from "@/components/site/Reveal";
import { ContactForm } from "@/components/site/ContactForm";
import { FloatingCTA } from "@/components/site/FloatingCTA";
import { CinematicMotion } from "@/components/site/CinematicMotion";
import { SkipLink } from "@/components/site/SkipLink";
import { TreatmentIcon } from "@/components/site/TreatmentIcons";
import { AppleMark } from "@/components/site/AppleMark";
import { SpecialtiesSection } from "@/components/site/SpecialtiesSection";
import { ReviewsSection } from "@/components/site/ReviewsSection";
import { HistorySection } from "@/components/site/HistorySection";
import { CLINICA, DEPOIMENTOS, EQUIPE, FAQ, HISTORIA, TRATAMENTOS, whatsappLink } from "@/lib/jp";

const TITLE = "JP Clínica Integrada Odontológica — Dentista na Freguesia do Ó, São Paulo";
const DESCRIPTION =
  "JP Clínica Integrada Odontológica na Vila Bruna, região da Freguesia do Ó em São Paulo. Cuidado odontológico completo para crianças, adultos e idosos.";

const TREATMENT_MEDIA = [
  limpezaPoster,
  clareamentoPoster,
  restauracaoPoster,
  implantePoster,
  protesePoster,
  ortodontiaPoster,
  odontopediatriaPoster,
  harmonizacaoPoster,
];

const GALLERY = [
  {
    src: consultorioWideImg,
    title: "Consultório principal",
    text: "Ambiente claro, organizado e preparado para um atendimento tranquilo.",
  },
  {
    src: fachadaImg,
    title: "Nossa fachada",
    text: "Rua Rio Verde, 1029 — Vila Bruna, na região da Freguesia do Ó.",
  },
  {
    src: consultorioRealImg,
    title: "Sala de atendimento",
    text: "Estrutura acolhedora e iluminação natural para receber você com conforto.",
  },
  {
    src: consultorioReal2Img,
    title: "Tecnologia no consultório",
    text: "Recursos que ajudam a explicar cada etapa com mais clareza.",
  },
  {
    src: esterilizacaoImg,
    title: "Esterilização",
    text: "Área dedicada ao cuidado com instrumentais e protocolos de biossegurança.",
  },
  {
    src: equipamentoImg,
    title: "Equipamentos",
    text: "Estrutura preparada para apoiar o planejamento e a rotina clínica.",
  },
];

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

function StructureCarousel() {
  const [active, setActive] = useState(0);
  const current = GALLERY[active]!;

  const move = (direction: number) => {
    setActive((value) => (value + direction + GALLERY.length) % GALLERY.length);
  };

  return (
    <div className="mt-12">
      <div className="group relative overflow-hidden rounded-[2.2rem] bg-forest-2 shadow-[0_36px_100px_-45px_rgba(5,45,11,.45)] sm:rounded-[2.7rem]">
        <img
          key={current.src}
          src={current.src}
          alt={`${current.title} da JP Clínica Integrada Odontológica`}
          loading="lazy"
          className="h-[430px] w-full object-cover sm:h-[560px] lg:h-[650px]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-forest-2/72 via-transparent to-transparent" />

        <div className="absolute inset-x-5 bottom-5 sm:inset-x-8 sm:bottom-8">
          <div className="max-w-xl rounded-[1.5rem] border border-white/15 bg-forest-2/78 p-5 text-white backdrop-blur-xl sm:p-6">
            <p className="text-[10px] font-extrabold uppercase tracking-[.17em] text-lime">
              Espaço {String(active + 1).padStart(2, "0")}
            </p>
            <h3 className="mt-2 font-display text-2xl font-extrabold tracking-[-.035em] sm:text-3xl">
              {current.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-white/68 sm:text-base">
              {current.text}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => move(-1)}
          aria-label="Foto anterior da estrutura"
          className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-white/92 text-forest-2 shadow-lg transition hover:-translate-y-[55%] hover:bg-lime sm:left-6 sm:h-13 sm:w-13"
        >
          <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>
        <button
          type="button"
          onClick={() => move(1)}
          aria-label="Próxima foto da estrutura"
          className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-lime text-forest-2 shadow-lg transition hover:-translate-y-[55%] sm:right-6 sm:h-13 sm:w-13"
        >
          <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>

        <div
          className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-white/14 bg-forest-2/55 px-3 py-2 backdrop-blur sm:flex"
          aria-label="Selecionar foto da estrutura"
        >
          {GALLERY.map((item, index) => (
            <button
              key={item.title}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`Ver ${item.title}`}
              aria-current={active === index ? "true" : undefined}
              className={`h-2 rounded-full transition-all ${
                active === index ? "w-7 bg-lime" : "w-2 bg-white/55 hover:bg-white"
              }`}
            />
          ))}
        </div>
      </div>

      <div
        className="mt-5 flex items-center justify-center gap-2 sm:hidden"
        aria-label="Selecionar foto da estrutura"
      >
        {GALLERY.map((item, index) => (
          <button
            key={item.title}
            type="button"
            onClick={() => setActive(index)}
            aria-label={`Ver ${item.title}`}
            aria-current={active === index ? "true" : undefined}
            className={`h-2.5 rounded-full transition-all ${
              active === index ? "w-9 bg-primary" : "w-2.5 bg-forest/18 hover:bg-forest/35"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function Home() {
  const waGeral = whatsappLink(
    "Olá! Vim pelo site da JP Clínica Integrada Odontológica e gostaria de agendar uma avaliação.",
  );

  return (
    <div className="min-h-dvh bg-cream">
      <CinematicMotion />
      <SkipLink />
      <Header />

      <main id="conteudo">
        {/* 01 — CAPA */}
        <section
          id="inicio"
          className="relative isolate overflow-hidden bg-paper pb-20 pt-40 text-forest-2 sm:pb-24 sm:pt-44 lg:min-h-[900px] lg:pb-28 lg:pt-48"
        >
          <div
            aria-hidden="true"
            className="absolute -left-24 top-36 h-80 w-80 rounded-full bg-lime/18 blur-[120px]"
          />
          <div
            aria-hidden="true"
            className="absolute right-[5%] top-[18%] h-96 w-96 rounded-full bg-mint/70 blur-[120px]"
          />
          <AppleMark
            strokeWidth={0.7}
            className="pointer-events-none absolute -bottom-44 -left-32 h-[34rem] w-[34rem] text-primary/[.06]"
          />

          <div className="jp-container relative grid gap-12 lg:grid-cols-[.92fr_1.08fr] lg:items-center lg:gap-14">
            <Reveal>
              <span className="eyebrow text-primary-ink">Odontologia para toda a vida</span>
              <h1 className="mt-6 max-w-3xl font-display text-[clamp(4rem,9vw,7.7rem)] font-extrabold leading-[.83] tracking-[-.065em] text-forest-2">
                Sorrir <span className="text-primary">muda</span> tudo.
              </h1>
              <p className="mt-7 max-w-xl text-base font-medium leading-relaxed text-forest/68 sm:text-lg">
                Odontologia completa para crianças, adultos e idosos, com atendimento humano,
                planejamento individual e um cuidado que você sente em cada detalhe.
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
                <a
                  href="#tratamentos"
                  className="inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-full border border-forest/14 bg-white px-5 py-3 font-extrabold text-forest-2 transition hover:-translate-y-0.5 hover:border-primary/45"
                >
                  Conhecer tratamentos
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs font-extrabold text-forest/58">
                <span className="flex items-center gap-2">
                  <Star className="h-4 w-4 fill-primary text-primary" /> 4,5 no Google
                </span>
                <span>176 avaliações</span>
                <span className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-primary" /> Seg–Sex • 08h–18h
                </span>
              </div>
            </Reveal>

            <Reveal delay={90} className="relative mx-auto w-full max-w-[690px]">
              <div className="relative overflow-hidden rounded-[2.3rem] border border-forest/8 bg-white p-2.5 shadow-[0_38px_100px_-45px_rgba(7,55,28,.42)] sm:rounded-[3rem] sm:p-3">
                <div className="relative aspect-[4/3] overflow-hidden rounded-[1.9rem] sm:rounded-[2.45rem]">
                  <img
                    src={consultorioRealImg}
                    alt="Consultório da JP Clínica Integrada Odontológica"
                    fetchPriority="high"
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-forest-2/25 via-transparent to-transparent" />
                </div>
              </div>

              <div className="absolute -left-3 top-8 rounded-[1.3rem] border border-forest/8 bg-white p-4 shadow-lift sm:-left-8 sm:top-12 sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-mint text-forest-2">
                    <UsersRound className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-display text-sm font-extrabold text-forest-2">
                      Para toda a família
                    </p>
                    <p className="mt-0.5 text-[11px] font-semibold text-forest/58">
                      Criança • adulto • idoso
                    </p>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-6 right-4 hidden max-w-[15rem] rounded-[1.3rem] bg-forest-2 p-5 text-white shadow-lift sm:block">
                <HeartHandshake className="h-5 w-5 text-lime" />
                <p className="mt-3 font-display text-lg font-extrabold leading-tight">
                  Atendimento calmo, conversa clara.
                </p>
              </div>
            </Reveal>
          </div>

          <div className="jp-container relative mt-16">
            <Reveal delay={150}>
              <div className="grid overflow-hidden rounded-[1.7rem] border border-forest/9 bg-white shadow-[0_18px_50px_-38px_rgba(7,55,28,.35)] sm:grid-cols-2 lg:grid-cols-4">
                {[
                  [
                    HeartHandshake,
                    "Atendimento humano",
                    "Escuta, empatia e respeito em cada etapa.",
                  ],
                  [BadgeCheck, "Cuidado completo", "Prevenção, estética e reabilitação."],
                  [UsersRound, "Para toda a família", "Do primeiro sorriso à melhor idade."],
                  [MapPin, "Perto de você", "Vila Bruna • Freguesia do Ó."],
                ].map(([Icon, title, text], i) => {
                  const C = Icon as typeof HeartHandshake;
                  return (
                    <div
                      key={String(title)}
                      className={`p-6 ${i > 0 ? "border-t border-forest/8 sm:border-t-0 sm:border-l" : ""} ${i === 2 ? "sm:border-l-0 lg:border-l" : ""}`}
                    >
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-mint text-primary-ink">
                        <C className="h-4.5 w-4.5" />
                      </span>
                      <p className="mt-4 font-display text-base font-extrabold">{String(title)}</p>
                      <p className="mt-1.5 text-xs leading-relaxed text-forest/58">
                        {String(text)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Reveal>
          </div>
        </section>

        {/* 02 — METODOLOGIA */}
        <section
          id="clinica"
          className="relative isolate overflow-hidden bg-forest-2 py-20 text-white sm:py-28 lg:py-36"
        >
          <img
            src={consultorioWideImg}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="absolute right-0 top-0 h-[48%] w-[64%] object-cover object-right-top opacity-80 lg:h-[55%] lg:w-[58%]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,45,11,1)_0%,rgba(5,45,11,.95)_44%,rgba(5,45,11,.68)_100%)]" />
          <div
            aria-hidden="true"
            className="absolute -right-20 top-16 h-96 w-96 rounded-full bg-lime/12 blur-[120px]"
          />

          <div className="jp-container relative">
            <Reveal className="grid gap-10 lg:grid-cols-[.95fr_1.05fr] lg:items-end">
              <div>
                <span className="eyebrow text-lime">Nossa metodologia</span>
                <h2 className="mt-6 max-w-4xl font-display text-[clamp(3.4rem,7vw,6.6rem)] font-extrabold leading-[.88] tracking-[-.055em]">
                  Dentista é técnica. <span className="text-lime">Cuidado</span> é o que faz você
                  querer voltar.
                </h2>
              </div>
              <p className="max-w-xl text-base font-medium leading-relaxed text-white/68 lg:justify-self-end lg:pb-2 sm:text-lg">
                Unimos escuta, orientação clara e planejamento personalizado para cuidar de você e
                da sua família em cada etapa da vida.
              </p>
            </Reveal>

            <div className="mt-14 grid gap-8 lg:grid-cols-[.86fr_1.14fr]">
              <Reveal>
                <div className="relative h-full min-h-[520px] overflow-hidden rounded-[2.2rem] border border-white/12">
                  <img
                    src={consultorioRealImg}
                    alt="Consultório da JP Clínica, com luz natural e cadeira preparada"
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-forest-2 via-forest-2/20 to-transparent" />
                  <div className="absolute inset-x-6 bottom-6 sm:inset-x-8 sm:bottom-8">
                    <span className="eyebrow text-lime">Compromisso JP</span>
                    <p className="mt-3 max-w-lg font-display text-2xl font-extrabold leading-tight sm:text-3xl">
                      Excelência técnica com atendimento humano, transparente e acolhedor.
                    </p>
                  </div>
                </div>
              </Reveal>

              <div className="grid gap-4 sm:grid-cols-2">
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
                  <Reveal key={item.title} delay={i * 55}>
                    <article className="h-full rounded-[1.6rem] border border-white/12 bg-white p-6 text-forest-2 shadow-[0_24px_60px_-40px_rgba(0,0,0,.65)] sm:p-7">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-mint text-primary-ink">
                        <item.icon className="h-5 w-5" />
                      </span>
                      <h3 className="mt-5 font-display text-xl font-extrabold leading-tight">
                        {item.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-forest/65">{item.text}</p>
                    </article>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 03 — HISTÓRIA */}
        <HistorySection />

        {/* 04 — ESPECIALIDADES */}
        <SpecialtiesSection />

        {/* 05 — PARA TODA A FAMÍLIA */}
        <section
          id="familia"
          className="relative isolate overflow-hidden bg-forest-2 py-20 text-white sm:py-28 lg:py-36"
        >
          <img
            src={consultorioWideImg}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover object-center opacity-45"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,45,11,.98)_0%,rgba(5,45,11,.93)_45%,rgba(5,45,11,.74)_100%)]" />
          <div
            aria-hidden="true"
            className="absolute -left-28 bottom-0 h-96 w-96 rounded-full bg-lime/12 blur-[120px]"
          />

          <div className="jp-container relative">
            <Reveal className="max-w-4xl">
              <span className="eyebrow text-lime">Para toda a família</span>
              <h2 className="mt-6 max-w-4xl font-display text-[clamp(3.5rem,7vw,6.8rem)] font-extrabold leading-[.86] tracking-[-.06em]">
                Um lugar.
                <span className="block text-lime">Muitas fases da vida.</span>
              </h2>
              <p className="mt-7 max-w-2xl text-base font-medium leading-relaxed text-white/68 sm:text-lg">
                A criança que está começando. O adolescente de aparelho. O adulto em busca de
                prevenção ou estética. A maturidade que pede conforto e reabilitação. A JP conecta
                essas fases em um mesmo cuidado.
              </p>
            </Reveal>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                [
                  Sparkles,
                  "Infância",
                  "Odontopediatria",
                  "Primeiros cuidados, prevenção e uma experiência mais tranquila.",
                ],
                [
                  HeartHandshake,
                  "Vida adulta",
                  "Prevenção • estética",
                  "Acompanhamento, estética e planejamento de acordo com sua rotina.",
                ],
                [
                  UsersRound,
                  "Maturidade",
                  "Próteses • implantes",
                  "Conforto, função e reabilitação planejados de forma individual.",
                ],
              ].map(([Icon, title, kicker, text], i) => {
                const C = Icon as typeof Sparkles;
                return (
                  <Reveal key={String(title)} delay={i * 60}>
                    <article className="jp-dark-glass h-full rounded-[1.6rem] p-6">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-lime text-forest-2">
                        <C className="h-5 w-5" />
                      </span>
                      <h3 className="mt-5 font-display text-2xl font-extrabold tracking-[-.035em]">
                        {String(title)}
                      </h3>
                      <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[.12em] text-lime">
                        {String(kicker)}
                      </p>
                      <p className="mt-4 text-sm leading-relaxed text-white/60">{String(text)}</p>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* 06 — AVALIAÇÕES */}
        <ReviewsSection />

        {/* 07 — EQUIPE */}
        <section
          id="equipe"
          className="section-light relative overflow-hidden py-20 sm:py-28 lg:py-36"
        >
          <div
            aria-hidden="true"
            className="absolute right-[-10rem] top-[-8rem] h-[34rem] w-[34rem] rounded-full border border-primary/10"
          />
          <div
            aria-hidden="true"
            className="absolute -left-48 bottom-[-10rem] h-[28rem] w-[28rem] rounded-full border border-primary/10"
          />

          <div className="jp-container relative">
            <Reveal>
              <span className="eyebrow text-primary-ink">Quem cuida de você</span>
              <h2 className="mt-5 max-w-4xl font-display text-[clamp(3.6rem,7vw,6.5rem)] font-extrabold leading-[.88] tracking-[-.06em] text-forest-2">
                Nossa <span className="text-primary">equipe.</span>
              </h2>
              <p className="mt-5 max-w-2xl text-base font-medium leading-relaxed text-forest/65">
                Atendimento feito por profissionais com registro ativo no Conselho Regional de
                Odontologia. Dados regulados só aparecem quando estão confirmados.
              </p>
            </Reveal>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {EQUIPE.map((pessoa, i) => {
                const vazio = Boolean(pessoa.placeholder);
                return (
                  <Reveal key={`${pessoa.registro}-${i}`} delay={i * 55}>
                    <article
                      className={`group h-full rounded-[1.7rem] border bg-white p-3 shadow-[0_24px_64px_-44px_rgba(5,45,11,.42)] transition duration-500 hover:-translate-y-1 ${
                        vazio ? "border-forest/7" : "border-primary/25"
                      }`}
                    >
                      <div className="relative overflow-hidden rounded-t-[7rem] rounded-b-[1.25rem] bg-[linear-gradient(180deg,#E7F5D5,#F7F8F2)] px-4 pt-5">
                        <div className="relative mx-auto aspect-[4/4.55] w-full overflow-hidden rounded-t-full bg-[linear-gradient(180deg,rgba(123,213,28,.36),rgba(47,107,53,.10))]">
                          {pessoa.foto ? (
                            <img
                              src={pessoa.foto}
                              alt={`Retrato de ${pessoa.nome}`}
                              loading="lazy"
                              className="absolute inset-x-0 bottom-0 mx-auto h-[116%] w-auto max-w-none object-contain object-bottom"
                            />
                          ) : (
                            <div className="absolute inset-0 grid place-items-center">
                              <div className="relative grid h-28 w-28 place-items-center rounded-full border border-forest/10 bg-white/75 text-primary-ink shadow-sm">
                                <UsersRound className="h-11 w-11" />
                              </div>
                            </div>
                          )}
                        </div>

                        {!vazio && pessoa.papel && (
                          <span className="absolute left-3 top-3 rounded-full bg-forest-2 px-3 py-2 text-[8px] font-extrabold uppercase tracking-[.11em] text-lime">
                            {pessoa.papel}
                          </span>
                        )}
                      </div>

                      <div className="px-2 pb-4 pt-5 text-center">
                        <h3 className="font-display text-lg font-extrabold leading-tight text-forest-2">
                          {vazio ? "Profissional da equipe" : pessoa.nome}
                        </h3>
                        <p className="mt-2 min-h-4 text-[9px] font-extrabold uppercase tracking-[.13em] text-primary-ink">
                          {vazio
                            ? "Foto e especialidade a inserir"
                            : pessoa.especialidade || pessoa.papel || "Odontologia"}
                        </p>
                        <div className="mt-5 border-t border-forest/8 pt-4">
                          <p className="text-[8px] font-extrabold uppercase tracking-[.15em] text-forest/40">
                            Registro
                          </p>
                          <p className="mt-1 text-xs font-bold text-forest/62">
                            {vazio ? "CRO a confirmar" : pessoa.registro}
                          </p>
                        </div>
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>

            <Reveal delay={130}>
              <div className="mx-auto mt-9 flex max-w-3xl items-center justify-center gap-4 rounded-full border border-forest/8 bg-white/80 px-5 py-4 text-center shadow-[0_18px_50px_-40px_rgba(5,45,11,.45)]">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-mint text-primary-ink">
                  <ShieldCheck className="h-4.5 w-4.5" />
                </span>
                <p className="text-sm font-semibold text-forest/65">
                  Equipe preparada para cuidar de você em{" "}
                  <strong className="font-extrabold text-primary-ink">
                    todas as fases do seu sorriso.
                  </strong>
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* 08 — ESTRUTURA */}
        <section
          id="estrutura"
          className="relative overflow-hidden bg-paper py-20 sm:py-28 lg:py-36"
        >
          <div
            aria-hidden="true"
            className="absolute -left-32 top-16 h-96 w-96 rounded-full bg-mint/60 blur-[130px]"
          />
          <div className="jp-container relative">
            <Reveal className="flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
              <div>
                <span className="eyebrow text-primary-ink">A clínica por dentro</span>
                <h2 className="mt-5 max-w-4xl font-display text-[clamp(3.3rem,7vw,6.5rem)] font-extrabold leading-[.89] tracking-[-.055em] text-forest-2">
                  Conheça <span className="text-primary">nossa estrutura.</span>
                </h2>
                <p className="mt-5 max-w-xl text-base font-medium leading-relaxed text-forest/64">
                  Fotos reais para você conhecer os espaços da clínica antes mesmo de chegar.
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

            <StructureCarousel />

            <Reveal delay={90}>
              <div className="mt-7 grid overflow-hidden rounded-[1.5rem] border border-forest/8 bg-secondary/65 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  [ShieldCheck, "Ambientes", "seguros e higienizados"],
                  [BadgeCheck, "Equipamentos", "modernos"],
                  [HeartHandshake, "Atendimento", "humanizado"],
                  [Star, "Cuidado", "em cada detalhe"],
                ].map(([Icon, title, text], i) => {
                  const C = Icon as typeof ShieldCheck;
                  return (
                    <div
                      key={String(title)}
                      className={`p-5 ${i > 0 ? "border-t border-forest/8 sm:border-t-0 sm:border-l" : ""} ${i === 2 ? "sm:border-l-0 lg:border-l" : ""}`}
                    >
                      <C className="h-5 w-5 text-primary" />
                      <p className="mt-3 font-display text-sm font-extrabold text-forest-2">
                        {String(title)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-primary-ink">{String(text)}</p>
                    </div>
                  );
                })}
              </div>
            </Reveal>
          </div>
        </section>

        {/* 09 — FAQ */}
        <section
          id="faq"
          className="relative isolate overflow-hidden bg-forest-2 py-20 text-white sm:py-28 lg:py-36"
        >
          <img
            src={harmonizacaoPoster}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover object-center opacity-35"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,48,27,.98)_0%,rgba(8,48,27,.92)_42%,rgba(8,48,27,.82)_100%)]" />
          <div
            aria-hidden="true"
            className="absolute -left-24 bottom-0 h-96 w-96 rounded-full bg-lime/12 blur-[120px]"
          />

          <div className="jp-container relative grid gap-12 lg:grid-cols-[.72fr_1.28fr] lg:items-start">
            <Reveal>
              <span className="eyebrow text-lime">Perguntas frequentes</span>
              <h2 className="mt-5 max-w-xl font-display text-[clamp(3.3rem,6.4vw,6rem)] font-extrabold leading-[.88] tracking-[-.06em]">
                Dúvida boa é dúvida <span className="text-lime">respondida.</span>
              </h2>
              <p className="mt-6 max-w-md text-base leading-relaxed text-white/65">
                Reunimos as perguntas mais comuns. Se ainda restar alguma dúvida, fale com a nossa
                equipe no WhatsApp.
              </p>
              <a
                href={waGeral}
                target="_blank"
                rel="noopener noreferrer"
                className="button-primary mt-7"
              >
                <MessageCircle className="h-5 w-5" />
                Falar no WhatsApp
              </a>

              <div className="mt-9 grid gap-4 border-t border-white/10 pt-7 text-xs font-bold text-white/58 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <span>Atendimento humanizado</span>
                <span>Tecnologia e segurança</span>
                <span>Cuidado que você sente</span>
              </div>
            </Reveal>

            <div className="grid gap-2.5">
              {FAQ.map((item, i) => (
                <Reveal key={item.q} delay={Math.min(i, 5) * 40}>
                  <details
                    open={i === 0}
                    className="group rounded-[1.25rem] border border-white/12 bg-forest-2/70 shadow-[0_18px_50px_-38px_rgba(0,0,0,.65)] backdrop-blur-xl open:border-lime/40 open:bg-white/[.09]"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-5 p-5 font-display text-base font-extrabold text-white sm:p-6 sm:text-lg">
                      <span className="flex items-start gap-4">
                        <span className="text-xs font-extrabold text-lime/75">0{i + 1}</span>
                        {item.q}
                      </span>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/12 bg-white/[.08] text-lime transition-transform group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="px-5 pb-5 pl-[3.75rem] text-sm leading-relaxed text-white/65 sm:px-6 sm:pb-6 sm:pl-[4.15rem]">
                      {item.a}
                    </p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* 10 — CONTATO */}
        <section
          id="fale"
          className="section-light relative overflow-hidden py-20 text-forest-2 sm:py-28 lg:py-36"
        >
          <span id="contato" aria-hidden="true" className="absolute -top-24 block h-px w-px" />
          <div
            aria-hidden="true"
            className="absolute -right-32 top-0 h-[32rem] w-[32rem] rounded-full bg-mint/70 blur-[140px]"
          />

          <div className="jp-container relative">
            <div className="grid gap-10 lg:grid-cols-[.92fr_1.08fr] lg:items-start">
              <Reveal>
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/18 bg-mint/55 px-4 py-2 text-[10px] font-extrabold uppercase tracking-[.12em] text-primary-ink">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  Fale com a JP
                </span>
                <h2 className="mt-6 max-w-3xl font-display text-[clamp(3.5rem,7vw,6.7rem)] font-extrabold leading-[.87] tracking-[-.06em]">
                  Seu próximo sorriso pode começar <span className="text-primary">aqui.</span>
                </h2>
                <p className="mt-6 max-w-xl text-base font-medium leading-relaxed text-forest/65">
                  Nossa equipe cuida de cada detalhe para que sua primeira avaliação seja simples,
                  acolhedora e eficiente. Vamos juntos planejar o melhor para o seu sorriso.
                </p>

                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <a href={CLINICA.telefoneHref} className="jp-soft-card rounded-[1.35rem] p-5">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-mint text-primary-ink">
                      <Phone className="h-4.5 w-4.5" />
                    </span>
                    <p className="mt-4 text-[9px] font-extrabold uppercase tracking-[.15em] text-forest/42">
                      Telefone
                    </p>
                    <p className="mt-1 font-display text-lg font-extrabold">{CLINICA.telefone}</p>
                  </a>
                  <a
                    href={CLINICA.whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="jp-soft-card rounded-[1.35rem] p-5"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-mint text-primary-ink">
                      <MessageCircle className="h-4.5 w-4.5" />
                    </span>
                    <p className="mt-4 text-[9px] font-extrabold uppercase tracking-[.15em] text-forest/42">
                      WhatsApp
                    </p>
                    <p className="mt-1 font-display text-lg font-extrabold">{CLINICA.whatsapp}</p>
                  </a>

                  <a
                    href={CLINICA.mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="jp-soft-card rounded-[1.35rem] p-5 sm:col-span-2"
                  >
                    <div className="flex items-start gap-4">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-mint text-primary-ink">
                        <MapPin className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[9px] font-extrabold uppercase tracking-[.15em] text-forest/42">
                          Endereço
                        </p>
                        <p className="mt-1 max-w-lg font-display text-lg font-extrabold leading-snug">
                          {CLINICA.endereco}
                        </p>
                        <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-forest/10 bg-paper px-3 py-2 text-[10px] font-extrabold text-primary-ink">
                          Ver no Google Maps <ArrowUpRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </div>
                    <p className="mt-5 flex items-center gap-2 border-t border-forest/8 pt-4 text-xs font-bold text-forest/58">
                      <Clock3 className="h-4 w-4 shrink-0 text-primary" />
                      Segunda a sexta, 08h às 18h
                    </p>
                  </a>
                </div>

                <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
                  <a
                    href={waGeral}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button-primary"
                  >
                    <MessageCircle className="h-4.5 w-4.5" />
                    Agendar pelo WhatsApp
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                  <a
                    href={CLINICA.telefoneHref}
                    className="inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-full border border-forest/12 bg-white px-5 py-3 text-sm font-extrabold text-forest-2 transition hover:-translate-y-0.5 hover:border-primary/40"
                  >
                    <Phone className="h-4 w-4" /> Ligar agora
                  </a>
                  <a
                    href={waGeral}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-full border border-forest/12 bg-white px-5 py-3 text-sm font-extrabold text-forest-2 transition hover:-translate-y-0.5 hover:border-primary/40"
                  >
                    <MessageCircle className="h-4 w-4" /> Tirar dúvidas
                  </a>
                </div>
              </Reveal>

              <Reveal delay={80}>
                <ContactForm />
              </Reveal>
            </div>

            <Reveal delay={130} className="mt-12">
              <div className="relative overflow-hidden rounded-[2rem] border border-forest/8 bg-white p-2 shadow-[0_28px_80px_-48px_rgba(5,45,11,.45)]">
                <iframe
                  src={CLINICA.mapsEmbed}
                  title="Mapa com a localização da JP Clínica Integrada Odontológica"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="h-[370px] w-full rounded-[1.55rem] border-0 sm:h-[445px]"
                />

                <div className="absolute left-5 top-5 max-w-[21rem] rounded-[1.35rem] border border-forest/8 bg-white/95 p-5 shadow-[0_24px_60px_-38px_rgba(5,45,11,.55)] backdrop-blur sm:left-7 sm:top-7">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-forest-2">
                      <MapPin className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <p className="text-[10px] font-extrabold text-primary-ink">
                        JP Clínica Integrada Odontológica
                      </p>
                      <p className="mt-2 font-display text-base font-extrabold leading-snug text-forest-2">
                        R. Rio Verde, 1029 — Vila Bruna
                        <span className="block">São Paulo - SP, 02934-201</span>
                      </p>
                    </div>
                  </div>
                  <a
                    href={CLINICA.mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-forest-2 px-5 py-3 text-xs font-extrabold text-white transition hover:-translate-y-0.5"
                  >
                    Abrir no Google Maps
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </div>
              </div>

              <div className="mx-auto -mt-5 grid max-w-4xl overflow-hidden rounded-[1.3rem] border border-forest/8 bg-white shadow-[0_20px_55px_-42px_rgba(5,45,11,.42)] sm:grid-cols-4">
                {[
                  [ShieldCheck, "Ambiente seguro"],
                  [BadgeCheck, "Higiene e esterilização rigorosas"],
                  [Sparkles, "Tecnologia avançada"],
                  [HeartHandshake, "Acolhimento que faz a diferença"],
                ].map(([Icon, text], i) => {
                  const C = Icon as typeof ShieldCheck;
                  return (
                    <div
                      key={String(text)}
                      className={`flex items-center gap-2 p-4 text-[10px] font-extrabold text-forest/62 ${i ? "border-t border-forest/8 sm:border-l sm:border-t-0" : ""}`}
                    >
                      <C className="h-4 w-4 shrink-0 text-primary-ink" />
                      {String(text)}
                    </div>
                  );
                })}
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <Footer />
      <FloatingCTA />
    </div>
  );
}
