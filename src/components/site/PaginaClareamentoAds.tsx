import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  Clock3,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";

import consultorioImg from "@/assets/consultorio-1.webp";
import fachadaImg from "@/assets/fachada-2026.webp";
import recepcaoImg from "@/assets/recepcao.webp";
import { CinematicMotion } from "@/components/site/CinematicMotion";
import { FloatingCTA } from "@/components/site/FloatingCTA";
import { Header } from "@/components/site/Header";
import { SkipLink } from "@/components/site/SkipLink";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { CLINICA, DEPOIMENTOS, HISTORIA, RESPONSAVEL_TECNICA } from "@/lib/jp";

const ASSUNTO = "Clareamento dental";

const BENEFICIOS = [
  {
    titulo: "Avaliação antes de começar",
    texto: "A condição dos dentes e gengiva é observada antes de definir o protocolo.",
    icone: ShieldCheck,
    numero: "01",
  },
  {
    titulo: "Planejamento individual",
    texto: "Sensibilidade, histórico e expectativa entram na conversa para orientar a indicação.",
    icone: Sparkles,
    numero: "02",
  },
  {
    titulo: "Acompanhamento profissional",
    texto: "A equipe orienta os cuidados antes, durante e depois do clareamento.",
    icone: BadgeCheck,
    numero: "03",
  },
] as const;

const ETAPAS = [
  {
    numero: "01",
    titulo: "Converse com a recepção",
    texto:
      "Você chama no WhatsApp para saber valores, horários e como funciona a avaliação de clareamento.",
  },
  {
    numero: "02",
    titulo: "Faça a avaliação",
    texto: "A equipe examina sua saúde bucal e entende o que você espera do tratamento.",
  },
  {
    numero: "03",
    titulo: "Entenda o protocolo",
    texto:
      "Depois da avaliação, o profissional explica a abordagem indicada, os cuidados e o acompanhamento.",
  },
] as const;

const FAQ = [
  {
    pergunta: "Todo mundo pode fazer clareamento dental?",
    resposta:
      "Não necessariamente. A indicação depende da avaliação clínica, da saúde bucal e das características individuais de cada paciente.",
  },
  {
    pergunta: "E se eu tiver sensibilidade nos dentes?",
    resposta:
      "A sensibilidade precisa ser considerada no planejamento. Na avaliação, a equipe verifica seu caso e orienta a abordagem adequada.",
  },
  {
    pergunta: "Quantas sessões são necessárias?",
    resposta:
      "Não existe um número único para todas as pessoas. O protocolo e o acompanhamento são definidos de acordo com o caso e com a resposta ao tratamento.",
  },
  {
    pergunta: "O resultado fica igual para todo mundo?",
    resposta:
      "Não. A resposta ao clareamento varia. O objetivo é trabalhar dentro do que é possível e indicado para cada sorriso, sem prometer um tom específico.",
  },
  {
    pergunta: "Quanto custa o clareamento?",
    resposta:
      "O valor depende do protocolo indicado para o seu caso. Pelo WhatsApp, a recepção explica como funciona a avaliação e pode orientar as condições atuais antes do agendamento.",
  },
] as const;

function BotaoWhatsApp({
  href,
  rotulo = "Ver valores e horários no WhatsApp",
  amplo = false,
}: {
  href: string;
  rotulo?: string;
  amplo?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-lime px-6 text-center text-[15px] font-black text-brand-deep shadow-[0_18px_42px_rgba(86,168,5,.24)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_54px_rgba(86,168,5,.34)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime sm:min-h-16 sm:px-8 sm:text-base ${
        amplo ? "w-full" : ""
      }`}
    >
      <MessageCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span>{rotulo}</span>
      <ArrowRight
        className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1"
        aria-hidden="true"
      />
    </a>
  );
}

function Estrelas() {
  return (
    <div className="flex items-center gap-1 text-lime" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} className="h-4 w-4 fill-current" />
      ))}
    </div>
  );
}

function ProvaSocial({ compacta = false }: { compacta?: boolean }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 font-bold text-white/90 ${
        compacta ? "text-xs sm:text-sm" : "text-sm"
      }`}
    >
      <Estrelas />
      <span>{CLINICA.provaSocial}</span>
      <span className="hidden text-white/25 sm:inline" aria-hidden="true">
        •
      </span>
      <span>{HISTORIA.anos} anos de clínica</span>
    </div>
  );
}

export function PaginaClareamentoAds() {
  const wa = useContatoWhatsApp("informacoes", ASSUNTO);

  return (
    <div className="min-h-dvh overflow-x-clip bg-cream text-ink">
      <CinematicMotion />
      <SkipLink />
      <Header enxuto />

      <main id="conteudo">
        <section
          id="hero-clareamento"
          className="relative isolate overflow-hidden bg-brand-deep text-white"
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[.16] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:72px_72px]"
          />
          <div
            aria-hidden="true"
            className="absolute -left-40 top-24 h-[34rem] w-[34rem] rounded-full bg-lime/10 blur-[110px]"
          />
          <div
            aria-hidden="true"
            className="absolute -right-44 -top-24 h-[42rem] w-[42rem] rounded-full bg-[#1b8c11]/20 blur-[130px]"
          />

          <div className="jp-container relative z-10 grid min-h-[calc(100svh-102px)] gap-10 py-9 sm:py-12 lg:grid-cols-[1.02fr_.98fr] lg:items-center lg:gap-14 lg:py-14 xl:min-h-[720px]">
            <div className="relative z-20 max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-lime/20 bg-lime/8 px-3.5 py-2 text-[11px] font-black uppercase tracking-[.17em] text-lime backdrop-blur sm:text-xs">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {HISTORIA.regiaoAtual} • São Paulo
              </div>

              <h1 className="mt-6 max-w-4xl font-display text-[clamp(3rem,7.2vw,6.4rem)] font-extrabold leading-[.84] tracking-[-.068em]">
                Clareamento
                <span className="block bg-gradient-to-r from-lime via-[#9ae34d] to-[#d3ff9f] bg-clip-text text-transparent">
                  dental.
                </span>
                <span className="mt-3 block max-w-2xl text-[.43em] font-bold leading-[1.02] tracking-[-.045em] text-white/92">
                  Na Freguesia do Ó, com avaliação individual.
                </span>
              </h1>

              <p className="mt-6 max-w-2xl text-base font-medium leading-[1.75] text-white/70 sm:text-lg lg:text-xl">
                Descubra valores, horários e como funciona a avaliação antes de decidir pelo
                tratamento. A conversa começa direto com a recepção da JP.
              </p>

              <div className="mt-7 flex flex-wrap gap-2 text-xs font-extrabold text-white/82 sm:text-sm">
                <span className="rounded-full border border-white/12 bg-white/[.055] px-3.5 py-2.5 backdrop-blur">
                  Avaliação individual
                </span>
                <span className="rounded-full border border-white/12 bg-white/[.055] px-3.5 py-2.5 backdrop-blur">
                  Acompanhamento profissional
                </span>
                <span className="rounded-full border border-white/12 bg-white/[.055] px-3.5 py-2.5 backdrop-blur">
                  Atendimento local
                </span>
              </div>

              <div className="mt-8 max-w-xl">
                <BotaoWhatsApp href={wa} amplo />
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-center gap-2 text-xs font-bold text-white/55 sm:text-sm">
                    <Clock3 className="h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
                    {CLINICA.horario}
                  </p>
                  <ProvaSocial compacta />
                </div>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[620px] lg:mx-0 lg:ml-auto">
              <div
                aria-hidden="true"
                className="absolute -inset-7 rounded-[54px] bg-gradient-to-br from-lime/14 via-transparent to-white/5 blur-2xl"
              />
              <div className="relative overflow-hidden rounded-[34px] border border-white/14 bg-white/[.055] p-2 shadow-[0_42px_100px_rgba(0,0,0,.36)] backdrop-blur-sm sm:rounded-[42px]">
                <div className="relative overflow-hidden rounded-[27px] sm:rounded-[34px]">
                  <img
                    src={consultorioImg}
                    alt="Consultório da JP Clínica Odontológica"
                    className="aspect-[5/4] w-full object-cover sm:aspect-[4/3] lg:aspect-[4/5] xl:aspect-[5/6]"
                    loading="eager"
                    fetchPriority="high"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-brand-deep/72 via-transparent to-transparent"
                  />
                  <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
                    <p className="text-[10px] font-black uppercase tracking-[.2em] text-lime sm:text-xs">
                      JP Clínica Integrada Odontológica
                    </p>
                    <p className="mt-2 max-w-md text-sm font-semibold leading-relaxed text-white/82 sm:text-base">
                      {CLINICA.endereco}
                    </p>
                  </div>
                </div>
              </div>

              <div className="absolute -left-3 top-5 rounded-2xl border border-white/14 bg-brand-deep/88 px-4 py-3 shadow-2xl backdrop-blur-xl sm:-left-8 sm:top-9 sm:px-5 sm:py-4">
                <p className="font-display text-2xl font-black tracking-[-.05em] text-lime sm:text-3xl">
                  {HISTORIA.anos}
                </p>
                <p className="mt-0.5 text-[10px] font-black uppercase tracking-[.14em] text-white/60 sm:text-xs">
                  anos de clínica
                </p>
              </div>

              <div className="absolute -right-2 top-1/3 rounded-2xl border border-white/14 bg-white/94 px-4 py-3 text-brand-deep shadow-2xl backdrop-blur-xl sm:-right-7 sm:px-5 sm:py-4">
                <Estrelas />
                <p className="mt-2 max-w-[150px] text-xs font-extrabold leading-snug sm:text-sm">
                  {CLINICA.provaSocial}
                </p>
              </div>
            </div>
          </div>

          <div className="relative z-10 border-t border-white/10 bg-black/10">
            <div className="jp-container grid gap-px sm:grid-cols-3">
              {[
                "Conduta definida após avaliação",
                "Planejamento individual",
                "WhatsApp direto com a recepção",
              ].map((item) => (
                <div
                  key={item}
                  className="flex min-h-14 items-center justify-center gap-2 border-white/8 px-4 py-3 text-center text-xs font-extrabold text-white/72 sm:min-h-16 sm:border-l sm:first:border-l-0 sm:text-sm"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="beneficios" className="relative overflow-hidden py-20 sm:py-24 lg:py-28">
          <div
            aria-hidden="true"
            className="absolute right-[-14rem] top-[-10rem] h-[32rem] w-[32rem] rounded-full bg-mint blur-[100px]"
          />
          <div className="jp-container relative">
            <div className="grid gap-10 lg:grid-cols-[.82fr_1.18fr] lg:items-end">
              <div>
                <p className="eyebrow text-brand-text">Clareamento com critério</p>
                <h2 className="mt-4 max-w-xl font-display text-[clamp(2.5rem,5vw,4.8rem)] font-extrabold leading-[.94] tracking-[-.058em] text-ink">
                  Bonito é quando o plano começa pelo seu sorriso.
                </h2>
              </div>
              <p className="max-w-2xl text-lg leading-[1.8] text-ink-soft lg:justify-self-end lg:pb-1 lg:text-xl">
                Antes de falar em técnica, a equipe considera sua saúde bucal, sensibilidade,
                histórico e expectativa. É isso que transforma uma escolha estética em um
                planejamento individual.
              </p>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {BENEFICIOS.map(({ titulo, texto, icone: Icone, numero }) => (
                <article
                  key={titulo}
                  className="group relative overflow-hidden rounded-[30px] border border-border-soft bg-white p-6 shadow-soft transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_24px_70px_rgba(3,47,1,.11)] sm:p-8"
                >
                  <div
                    aria-hidden="true"
                    className="absolute -right-16 -top-16 h-36 w-36 rounded-full bg-mint opacity-0 blur-2xl transition duration-500 group-hover:opacity-100"
                  />
                  <div className="relative flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-deep text-lime shadow-[0_12px_28px_rgba(3,47,1,.16)]">
                      <Icone className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <span className="font-display text-sm font-black tracking-[.12em] text-brand-text/32">
                      {numero}
                    </span>
                  </div>
                  <h3 className="relative mt-8 font-display text-2xl font-extrabold tracking-[-.04em] sm:text-[1.7rem]">
                    {titulo}
                  </h3>
                  <p className="relative mt-3 leading-[1.75] text-ink-soft">{texto}</p>
                </article>
              ))}
            </div>

            <div className="mx-auto mt-10 max-w-xl text-center">
              <BotaoWhatsApp href={wa} rotulo="Quero saber valores e horários" amplo />
            </div>
          </div>
        </section>

        <section id="como-funciona" className="relative overflow-hidden bg-white py-20 sm:py-24 lg:py-28">
          <div className="jp-container grid gap-12 lg:grid-cols-[1.02fr_.98fr] lg:items-center lg:gap-16">
            <div className="relative mx-auto w-full max-w-2xl lg:mx-0">
              <div className="grid grid-cols-[1.15fr_.85fr] gap-3 sm:gap-4">
                <div className="overflow-hidden rounded-[30px] sm:rounded-[38px]">
                  <img
                    src={recepcaoImg}
                    alt="Recepção da JP Clínica Odontológica"
                    className="h-full min-h-[390px] w-full object-cover sm:min-h-[520px]"
                    loading="lazy"
                  />
                </div>
                <div className="grid gap-3 sm:gap-4">
                  <div className="overflow-hidden rounded-[26px] bg-brand-deep sm:rounded-[32px]">
                    <img
                      src={fachadaImg}
                      alt="Fachada da JP Clínica Odontológica"
                      className="h-full min-h-[188px] w-full object-cover opacity-90 sm:min-h-[252px]"
                      loading="lazy"
                    />
                  </div>
                  <div className="flex min-h-[188px] flex-col justify-between rounded-[26px] bg-brand-deep p-5 text-white sm:min-h-[252px] sm:rounded-[32px] sm:p-7">
                    <MapPin className="h-6 w-6 text-lime" aria-hidden="true" />
                    <div>
                      <p className="font-display text-2xl font-extrabold tracking-[-.045em] sm:text-3xl">
                        Freguesia do Ó
                      </p>
                      <p className="mt-2 text-xs font-bold leading-relaxed text-white/58 sm:text-sm">
                        {CLINICA.local.bairro} • São Paulo/SP
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p className="eyebrow text-brand-text">Do clique ao planejamento</p>
              <h2 className="mt-4 max-w-xl font-display text-[clamp(2.5rem,5vw,4.6rem)] font-extrabold leading-[.94] tracking-[-.058em]">
                Simples para começar. Cuidadoso para decidir.
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-[1.75] text-ink-soft">
                Você não precisa chegar sabendo qual técnica quer. A jornada começa com informação
                e avança para a avaliação individual.
              </p>

              <div className="mt-9 space-y-3">
                {ETAPAS.map((etapa, index) => (
                  <div
                    key={etapa.numero}
                    className="group grid grid-cols-[3.4rem_1fr] gap-4 rounded-[24px] border border-transparent p-3 transition hover:border-border-soft hover:bg-cream sm:p-4"
                  >
                    <span className="flex h-[3.4rem] w-[3.4rem] items-center justify-center rounded-2xl bg-brand-deep font-display text-sm font-black text-lime shadow-[0_10px_28px_rgba(3,47,1,.12)]">
                      {etapa.numero}
                    </span>
                    <div className={index < ETAPAS.length - 1 ? "pb-2" : ""}>
                      <h3 className="font-display text-xl font-extrabold tracking-[-.025em]">
                        {etapa.titulo}
                      </h3>
                      <p className="mt-1.5 max-w-xl leading-[1.7] text-ink-soft">{etapa.texto}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="prova-social" className="relative isolate overflow-hidden bg-brand-deep py-20 text-white sm:py-24 lg:py-28">
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-0 h-[36rem] w-[55rem] -translate-x-1/2 rounded-full bg-lime/8 blur-[120px]"
          />
          <div className="jp-container relative">
            <div className="grid gap-12 lg:grid-cols-[.78fr_1.22fr] lg:items-start lg:gap-16">
              <div className="lg:sticky lg:top-36">
                <p className="eyebrow text-lime">Confiança antes do procedimento</p>
                <h2 className="mt-4 font-display text-[clamp(2.6rem,5vw,4.8rem)] font-extrabold leading-[.93] tracking-[-.06em]">
                  Uma clínica real. Uma história real.
                </h2>
                <p className="mt-6 max-w-xl text-lg leading-[1.75] text-white/64">
                  A JP atende na região da Freguesia do Ó e reúne {HISTORIA.anos} anos de trajetória
                  clínica. Você pode conhecer a estrutura e conversar com a equipe antes de decidir.
                </p>
                <div className="mt-7">
                  <ProvaSocial />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {DEPOIMENTOS.slice(0, 2).map((depoimento, index) => (
                  <blockquote
                    key={depoimento.autor}
                    className={`rounded-[30px] border border-white/10 bg-white/[.065] p-6 shadow-[0_30px_80px_rgba(0,0,0,.14)] backdrop-blur sm:p-8 ${
                      index === 1 ? "sm:mt-10" : ""
                    }`}
                  >
                    <Estrelas />
                    <p className="mt-6 font-display text-xl font-semibold leading-[1.5] tracking-[-.02em] text-white/88 sm:text-2xl">
                      “{depoimento.texto}”
                    </p>
                    <footer className="mt-6 flex items-center gap-3 border-t border-white/10 pt-5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lime font-display text-xs font-black text-brand-deep">
                        {depoimento.autor.slice(0, 1)}
                      </span>
                      <span className="text-sm font-black text-white">{depoimento.autor}</span>
                    </footer>
                  </blockquote>
                ))}

                <div className="sm:col-span-2 sm:mx-10">
                  <div className="grid gap-3 rounded-[28px] border border-white/10 bg-black/10 p-5 sm:grid-cols-3 sm:p-6">
                    <div>
                      <p className="font-display text-3xl font-black tracking-[-.05em] text-lime">
                        {HISTORIA.anos}
                      </p>
                      <p className="mt-1 text-xs font-bold uppercase tracking-[.12em] text-white/48">
                        anos de clínica
                      </p>
                    </div>
                    <div className="border-white/10 sm:border-l sm:pl-6">
                      <p className="font-display text-2xl font-black tracking-[-.04em] text-white">
                        {CLINICA.local.bairro}
                      </p>
                      <p className="mt-1 text-xs font-bold uppercase tracking-[.12em] text-white/48">
                        Zona Norte
                      </p>
                    </div>
                    <div className="border-white/10 sm:border-l sm:pl-6">
                      <Estrelas />
                      <p className="mt-2 text-xs font-bold leading-relaxed text-white/62">
                        {CLINICA.provaSocial}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="estrutura" className="py-20 sm:py-24 lg:py-28">
          <div className="jp-container">
            <div className="overflow-hidden rounded-[34px] border border-border-soft bg-white shadow-[0_30px_90px_rgba(3,47,1,.09)] sm:rounded-[44px]">
              <div className="grid lg:grid-cols-[.9fr_1.1fr]">
                <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12 xl:p-16">
                  <p className="eyebrow text-brand-text">Localização e estrutura</p>
                  <h2 className="mt-4 max-w-xl font-display text-[clamp(2.5rem,5vw,4.4rem)] font-extrabold leading-[.94] tracking-[-.058em]">
                    Perto de você, com endereço para conhecer.
                  </h2>
                  <p className="mt-6 max-w-xl text-lg leading-[1.75] text-ink-soft">
                    {CLINICA.endereco}
                  </p>

                  <div className="mt-7 grid gap-3 text-sm font-extrabold sm:grid-cols-2">
                    <div className="flex items-center gap-3 rounded-2xl bg-cream px-4 py-3.5">
                      <MapPin className="h-5 w-5 shrink-0 text-brand-text" aria-hidden="true" />
                      {CLINICA.bairro}
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl bg-cream px-4 py-3.5">
                      <Clock3 className="h-5 w-5 shrink-0 text-brand-text" aria-hidden="true" />
                      {CLINICA.horario}
                    </div>
                  </div>

                  <div className="mt-8 max-w-xl">
                    <BotaoWhatsApp href={wa} rotulo="Consultar valores e horários" amplo />
                  </div>
                </div>

                <div className="relative min-h-[340px] lg:min-h-[620px]">
                  <img
                    src={fachadaImg}
                    alt="Fachada da JP Clínica Odontológica na Vila Bruna"
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-brand-deep/36 via-transparent to-transparent lg:bg-gradient-to-r lg:from-white/16 lg:via-transparent lg:to-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="duvidas" className="bg-white py-20 sm:py-24 lg:py-28">
          <div className="jp-container grid gap-12 lg:grid-cols-[.72fr_1.28fr] lg:gap-16">
            <div>
              <p className="eyebrow text-brand-text">Antes de chamar</p>
              <h2 className="mt-4 font-display text-[clamp(2.5rem,5vw,4.4rem)] font-extrabold leading-[.94] tracking-[-.058em]">
                Tire as dúvidas que costumam travar a decisão.
              </h2>
              <p className="mt-6 max-w-lg text-lg leading-[1.75] text-ink-soft">
                Aqui você encontra o que é geral. A indicação do seu caso continua dependendo de
                avaliação profissional individual.
              </p>
            </div>

            <div className="space-y-3">
              {FAQ.map((item) => (
                <details
                  key={item.pergunta}
                  className="group overflow-hidden rounded-[22px] border border-border-soft bg-cream transition open:bg-white open:shadow-[0_16px_44px_rgba(3,47,1,.07)]"
                >
                  <summary className="flex min-h-[74px] cursor-pointer list-none items-center justify-between gap-5 px-5 py-4 font-display text-lg font-extrabold tracking-[-.02em] marker:content-none sm:px-6 sm:text-xl">
                    <span>{item.pergunta}</span>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-text shadow-sm transition duration-300 group-open:rotate-180 group-open:bg-brand-deep group-open:text-lime">
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </summary>
                  <p className="px-5 pb-6 pr-14 leading-[1.75] text-ink-soft sm:px-6 sm:pr-20">
                    {item.resposta}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="cta-final" className="relative isolate overflow-hidden bg-brand-deep py-20 text-white sm:py-24 lg:py-28">
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 h-[38rem] w-[70rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime/10 blur-[130px]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[.12] [background-image:radial-gradient(rgba(255,255,255,.22)_1px,transparent_1px)] [background-size:28px_28px]"
          />

          <div className="jp-container relative text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-lime/20 bg-lime/10 text-lime shadow-[0_18px_50px_rgba(86,168,5,.12)]">
              <Sparkles className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="eyebrow mt-7 justify-center text-lime">Seu próximo passo pode ser simples</p>
            <h2 className="mx-auto mt-4 max-w-5xl font-display text-[clamp(2.8rem,6.5vw,6.2rem)] font-extrabold leading-[.88] tracking-[-.068em]">
              Primeiro, entenda.
              <span className="block text-lime">Depois, você decide.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-[1.75] text-white/64 sm:text-lg">
              Chame a recepção da JP no WhatsApp para saber valores, horários e como funciona a
              avaliação de clareamento.
            </p>
            <div className="mx-auto mt-9 max-w-xl">
              <BotaoWhatsApp href={wa} rotulo="Falar no WhatsApp sobre clareamento" amplo />
            </div>
            <div className="mx-auto mt-6 flex max-w-xl flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-bold text-white/46 sm:text-sm">
              <span>WhatsApp {CLINICA.whatsapp}</span>
              <span aria-hidden="true">•</span>
              <span>{CLINICA.horario}</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/8 bg-brand-deep py-9 text-white">
        <div className="jp-container grid gap-6 text-sm text-white/54 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="font-display text-lg font-extrabold text-white">{CLINICA.nome}</p>
            <p className="mt-2">{CLINICA.endereco}</p>
            <p className="mt-1">
              Responsável técnica: {RESPONSAVEL_TECNICA.nome} — {RESPONSAVEL_TECNICA.registro}
            </p>
            <p className="mt-1">
              {CLINICA.razaoSocial} • CNPJ {CLINICA.cnpj}
            </p>
            <p className="mt-3 max-w-3xl text-white/38">
              Conteúdo informativo. Indicações, técnica e resultados dependem de avaliação
              profissional individual.
            </p>
          </div>
          <a
            href="/politica-de-privacidade"
            className="font-bold text-white underline decoration-white/25 underline-offset-4 transition hover:text-lime"
          >
            Política de Privacidade
          </a>
        </div>
      </footer>

      <FloatingCTA
        assunto={ASSUNTO}
        intencao="informacoes"
        titulo="Pensando em clareamento?"
        subtitulo="Veja valores, horários e como funciona a avaliação antes de decidir."
        rotulo="Falar no WhatsApp"
        mostrarNoMobileDesdeInicio
      />
    </div>
  );
}
