import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
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
  },
  {
    titulo: "Planejamento individual",
    texto: "Sensibilidade, histórico e expectativa entram na conversa para orientar a indicação.",
    icone: Sparkles,
  },
  {
    titulo: "Acompanhamento profissional",
    texto: "A equipe orienta os cuidados antes, durante e depois do clareamento.",
    icone: BadgeCheck,
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
  rotulo = "Consultar valores e horários",
}: {
  href: string;
  rotulo?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="button-primary inline-flex min-h-14 items-center justify-center gap-2 px-6 text-center text-base sm:text-lg"
    >
      <MessageCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span>{rotulo}</span>
      <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
    </a>
  );
}

function ProvaSocial() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-bold text-white/90">
      <div className="flex items-center gap-1 text-lime" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, index) => (
          <Star key={index} className="h-4 w-4 fill-current" />
        ))}
      </div>
      <span>{CLINICA.provaSocial}</span>
      <span className="hidden text-white/30 sm:inline" aria-hidden="true">
        •
      </span>
      <span>{HISTORIA.anos} anos de clínica</span>
    </div>
  );
}

export function PaginaClareamentoAds() {
  const wa = useContatoWhatsApp("informacoes", ASSUNTO);

  return (
    <div className="min-h-dvh bg-cream text-ink">
      <CinematicMotion />
      <SkipLink />
      <Header enxuto />

      <main id="conteudo">
        <section
          id="hero-clareamento"
          className="relative isolate overflow-hidden bg-brand-deep py-10 text-white sm:py-14 lg:py-16"
        >
          <div
            aria-hidden="true"
            className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-lime/10 blur-3xl sm:h-[30rem] sm:w-[30rem]"
          />
          <div className="jp-container relative z-10 grid gap-10 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
            <div>
              <p className="eyebrow text-lime">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                {HISTORIA.regiaoAtual} • {CLINICA.local.bairro} • São Paulo
              </p>

              <h1 className="mt-5 max-w-4xl font-display text-[clamp(2.7rem,6vw,5.2rem)] font-extrabold leading-[.88] tracking-[-.055em]">
                Clareamento dental
                <span className="block text-lime">na Freguesia do Ó</span>
              </h1>

              <p className="mt-6 max-w-2xl text-lg font-medium leading-relaxed text-white/78 sm:text-xl">
                Fale com a recepção da JP para saber valores, horários e como funciona a avaliação
                antes de decidir pelo tratamento.
              </p>

              <div className="mt-7 flex flex-wrap gap-2 text-sm font-bold text-white/82">
                <span className="rounded-full border border-white/15 bg-white/6 px-3 py-2">
                  Avaliação individual
                </span>
                <span className="rounded-full border border-white/15 bg-white/6 px-3 py-2">
                  Acompanhamento profissional
                </span>
                <span className="rounded-full border border-white/15 bg-white/6 px-3 py-2">
                  Atendimento local
                </span>
              </div>

              <div className="mt-8 flex max-w-xl flex-col gap-3">
                <BotaoWhatsApp href={wa} />
                <p className="flex items-center gap-2 text-sm font-semibold text-white/62">
                  <Clock3 className="h-4 w-4 text-lime" aria-hidden="true" />
                  WhatsApp direto com a recepção • {CLINICA.horario.toLowerCase()}
                </p>
              </div>

              <div className="mt-7 border-t border-white/12 pt-5">
                <ProvaSocial />
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
              <div className="overflow-hidden rounded-[32px] border border-white/10 bg-white/5 p-2 shadow-2xl shadow-black/25">
                <img
                  src={consultorioImg}
                  alt="Consultório da JP Clínica Odontológica"
                  className="aspect-[4/3] w-full rounded-[26px] object-cover"
                  loading="eager"
                  fetchPriority="high"
                />
              </div>
              <div className="absolute -bottom-5 left-4 right-4 rounded-2xl border border-white/12 bg-brand-deep/95 p-4 shadow-xl backdrop-blur sm:left-8 sm:right-8">
                <p className="text-sm font-black uppercase tracking-[.16em] text-lime">
                  JP Clínica Integrada Odontológica
                </p>
                <p className="mt-1 text-sm font-semibold text-white/78">{CLINICA.endereco}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border-soft bg-white py-5">
          <div className="jp-container grid gap-4 text-center sm:grid-cols-3 sm:text-left">
            <div className="flex items-center justify-center gap-3 sm:justify-start">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-text" aria-hidden="true" />
              <span className="font-bold">Sem promessa de tom artificial</span>
            </div>
            <div className="flex items-center justify-center gap-3 sm:justify-start">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-text" aria-hidden="true" />
              <span className="font-bold">Conduta definida após avaliação</span>
            </div>
            <div className="flex items-center justify-center gap-3 sm:justify-start">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-text" aria-hidden="true" />
              <span className="font-bold">WhatsApp direto com a recepção</span>
            </div>
          </div>
        </section>

        <section id="beneficios" className="py-16 sm:py-20">
          <div className="jp-container">
            <div className="mx-auto max-w-3xl text-center">
              <p className="eyebrow justify-center text-brand-text">
                Por que começar pela avaliação
              </p>
              <h2 className="mt-4 font-display text-4xl font-extrabold tracking-[-.045em] text-ink sm:text-5xl">
                Você não precisa escolher a técnica sozinho.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-ink-soft">
                A primeira conversa serve para entender seu ponto de partida e explicar o que é
                indicado para o seu caso.
              </p>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {BENEFICIOS.map(({ titulo, texto, icone: Icone }) => (
                <article
                  key={titulo}
                  className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft sm:p-7"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-mint text-brand-text">
                    <Icone className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-5 font-display text-2xl font-extrabold tracking-[-.035em]">
                    {titulo}
                  </h3>
                  <p className="mt-3 leading-relaxed text-ink-soft">{texto}</p>
                </article>
              ))}
            </div>

            <div className="mx-auto mt-9 max-w-xl text-center">
              <BotaoWhatsApp href={wa} rotulo="Quero saber valores e horários" />
            </div>
          </div>
        </section>

        <section id="como-funciona" className="bg-white py-16 sm:py-20">
          <div className="jp-container grid gap-12 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div className="overflow-hidden rounded-[32px] border border-border-soft bg-cream p-2 shadow-soft">
              <img
                src={recepcaoImg}
                alt="Recepção da JP Clínica Odontológica"
                className="aspect-[4/3] w-full rounded-[26px] object-cover"
                loading="lazy"
              />
            </div>

            <div>
              <p className="eyebrow text-brand-text">Do clique ao planejamento</p>
              <h2 className="mt-4 font-display text-4xl font-extrabold tracking-[-.045em] sm:text-5xl">
                Como funciona para começar.
              </h2>
              <div className="mt-8 space-y-6">
                {ETAPAS.map((etapa) => (
                  <div key={etapa.numero} className="grid grid-cols-[3rem_1fr] gap-4">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-deep font-display text-sm font-black text-lime">
                      {etapa.numero}
                    </span>
                    <div>
                      <h3 className="font-display text-xl font-extrabold">{etapa.titulo}</h3>
                      <p className="mt-1 leading-relaxed text-ink-soft">{etapa.texto}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="prova-social" className="bg-brand-deep py-16 text-white sm:py-20">
          <div className="jp-container">
            <div className="grid gap-10 lg:grid-cols-[.85fr_1.15fr] lg:items-start">
              <div>
                <p className="eyebrow text-lime">Confiança antes do procedimento</p>
                <h2 className="mt-4 font-display text-4xl font-extrabold tracking-[-.045em] sm:text-5xl">
                  Uma clínica real, perto de você.
                </h2>
                <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/68">
                  A JP atende na região da Freguesia do Ó e reúne {HISTORIA.anos} anos de trajetória
                  clínica. Você pode conhecer a estrutura antes mesmo de decidir pelo tratamento.
                </p>
                <div className="mt-7">
                  <ProvaSocial />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {DEPOIMENTOS.slice(0, 2).map((depoimento) => (
                  <blockquote
                    key={depoimento.autor}
                    className="rounded-3xl border border-white/10 bg-white/6 p-6"
                  >
                    <div className="flex gap-1 text-lime" aria-hidden="true">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star key={index} className="h-4 w-4 fill-current" />
                      ))}
                    </div>
                    <p className="mt-4 leading-relaxed text-white/82">“{depoimento.texto}”</p>
                    <footer className="mt-4 text-sm font-black text-white">
                      {depoimento.autor}
                    </footer>
                  </blockquote>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="estrutura" className="py-16 sm:py-20">
          <div className="jp-container grid gap-8 lg:grid-cols-[1fr_.9fr] lg:items-center">
            <div>
              <p className="eyebrow text-brand-text">Localização e estrutura</p>
              <h2 className="mt-4 font-display text-4xl font-extrabold tracking-[-.045em] sm:text-5xl">
                Freguesia do Ó, com acesso fácil pela Zona Norte.
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
                {CLINICA.endereco}
              </p>
              <div className="mt-6 space-y-3 text-sm font-bold text-ink">
                <p className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-brand-text" aria-hidden="true" />
                  {CLINICA.bairro}
                </p>
                <p className="flex items-center gap-3">
                  <Clock3 className="h-5 w-5 text-brand-text" aria-hidden="true" />
                  {CLINICA.horario}
                </p>
              </div>
              <div className="mt-8 max-w-xl">
                <BotaoWhatsApp href={wa} rotulo="Consultar valores e horários" />
              </div>
            </div>

            <div className="overflow-hidden rounded-[32px] border border-border-soft bg-white p-2 shadow-soft">
              <img
                src={fachadaImg}
                alt="Fachada da JP Clínica Odontológica na Vila Bruna"
                className="aspect-[4/3] w-full rounded-[26px] object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </section>

        <section id="duvidas" className="bg-white py-16 sm:py-20">
          <div className="jp-container grid gap-10 lg:grid-cols-[.75fr_1.25fr]">
            <div>
              <p className="eyebrow text-brand-text">Dúvidas que travam a decisão</p>
              <h2 className="mt-4 font-display text-4xl font-extrabold tracking-[-.045em] sm:text-5xl">
                Antes de chamar, veja o essencial.
              </h2>
              <p className="mt-5 leading-relaxed text-ink-soft">
                A página informa o que é geral. A indicação do seu caso continua dependendo de
                avaliação profissional individual.
              </p>
            </div>

            <div className="space-y-3">
              {FAQ.map((item) => (
                <details
                  key={item.pergunta}
                  className="group rounded-2xl border border-border-soft bg-cream p-5 open:bg-white"
                >
                  <summary className="cursor-pointer list-none pr-8 font-display text-lg font-extrabold marker:content-none">
                    {item.pergunta}
                  </summary>
                  <p className="mt-3 leading-relaxed text-ink-soft">{item.resposta}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="cta-final" className="bg-brand-deep py-16 text-white sm:py-20">
          <div className="jp-container text-center">
            <p className="eyebrow justify-center text-lime">Próxima etapa</p>
            <h2 className="mx-auto mt-4 max-w-4xl font-display text-4xl font-extrabold tracking-[-.05em] sm:text-6xl">
              Quer entender se o clareamento faz sentido para você?
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-white/68">
              Chame a recepção da JP no WhatsApp para saber valores, horários e como funciona a
              avaliação. Depois, você decide o próximo passo.
            </p>
            <div className="mx-auto mt-8 max-w-xl">
              <BotaoWhatsApp href={wa} rotulo="Falar no WhatsApp sobre clareamento" />
            </div>
            <p className="mt-5 text-sm font-semibold text-white/50">WhatsApp {CLINICA.whatsapp}</p>
          </div>
        </section>
      </main>

      <footer className="bg-brand-deep py-10 text-white">
        <div className="jp-container grid gap-6 text-sm text-white/62 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="font-display text-lg font-extrabold text-white">{CLINICA.nome}</p>
            <p className="mt-2">{CLINICA.endereco}</p>
            <p className="mt-1">
              Responsável técnica: {RESPONSAVEL_TECNICA.nome} — {RESPONSAVEL_TECNICA.registro}
            </p>
            <p className="mt-1">
              {CLINICA.razaoSocial} • CNPJ {CLINICA.cnpj}
            </p>
            <p className="mt-3 max-w-3xl text-white/48">
              Conteúdo informativo. Indicações, técnica e resultados dependem de avaliação
              profissional individual.
            </p>
          </div>
          <a
            href="/politica-de-privacidade"
            className="font-bold text-white underline decoration-white/30 underline-offset-4 hover:text-lime"
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
      />
    </div>
  );
}
