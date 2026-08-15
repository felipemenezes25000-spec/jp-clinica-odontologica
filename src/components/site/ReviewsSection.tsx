import { ArrowRight, Heart, ShieldCheck, Sparkles, Star, UsersRound } from "lucide-react";

import { CLINICA, DEPOIMENTOS } from "@/lib/jp";

function Estrelas({ dark = false, size = 17 }: { dark?: boolean; size?: number }) {
  return (
    <div className="flex items-center gap-1" role="img" aria-label="5 de 5 estrelas">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          strokeWidth={0}
          aria-hidden="true"
          className={dark ? "fill-lime" : "fill-[#56A805]"}
        />
      ))}
    </div>
  );
}

function ItemNota({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 text-brand-text" aria-hidden="true">
        {icon}
      </div>
      <div>
        <p className="text-xs font-bold text-ink">{title}</p>
        <p className="mt-1 text-[11px] leading-[1.45] text-ink-soft">{description}</p>
      </div>
    </div>
  );
}

function CardAvaliacao({ autor, texto }: { autor: string; texto: string }) {
  return (
    <article className="flex min-h-[220px] flex-col rounded-[26px] border border-border-soft bg-white p-6 shadow-[0_18px_50px_rgba(3,47,1,0.055)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_60px_rgba(3,47,1,0.09)]">
      <span aria-hidden="true" className="font-serif text-[48px] leading-[0.6] text-brand-text">
        &ldquo;
      </span>

      <p className="mt-4 flex-1 font-display text-[16px] font-semibold leading-[1.35] tracking-[-0.015em] text-ink">
        {texto}
      </p>

      <div className="my-4 h-px bg-border-soft" />

      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{autor}</p>
            <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-brand-text">
              Avaliação no Google
            </p>
          </div>
        </div>
        <div className="hidden gap-[2px] lg:flex">
          <Estrelas size={12} />
        </div>
      </div>
    </article>
  );
}

/**
 * Prova social. O primeiro depoimento vai em destaque; os quatro seguintes
 * formam a grade. Nota e volume vêm de `CLINICA.provaSocial`, conferidos na
 * ficha do Google — não escrever número solto aqui.
 */
export function ReviewsSection() {
  const [destaque, ...grade] = DEPOIMENTOS;

  return (
    <section id="depoimentos" className="jp-section relative overflow-hidden bg-paper">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-36 top-[42%] h-[520px] w-[520px] rounded-full border border-brand-green/20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 top-[47%] h-[430px] w-[430px] rounded-full border border-brand-green/15"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-52 -top-44 h-[500px] w-[500px] rounded-full border border-brand-green/20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 -top-32 h-[400px] w-[400px] rounded-full border border-brand-green/15"
      />

      <div className="jp-container relative">
        <div className="grid gap-14 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16">
          {/* COLUNA ESQUERDA */}
          <div>
            <div className="mb-7 flex items-center gap-2 text-brand-text">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-brand-green/70">
                <Star size={14} aria-hidden="true" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.14em]">Avaliações</span>
            </div>

            <h2 className="max-w-[610px] font-display text-[40px] font-extrabold leading-[1.04] tracking-[-0.045em] text-forest-2 sm:text-[56px] lg:text-[64px]">
              A confiança dos pacientes aparece{" "}
              <span className="text-brand-text">em cada sorriso.</span>
            </h2>

            <p className="mt-7 max-w-[590px] text-[16px] leading-7 text-ink-soft">
              Cada avaliação reflete o cuidado, a atenção e o compromisso da nossa equipe em
              oferecer uma experiência humana, clara e acolhedora em todas as fases do tratamento.
            </p>

            {/* CARD DA NOTA */}
            <div className="mt-10 overflow-hidden rounded-[28px] border border-border-soft bg-white/75 shadow-[0_18px_60px_rgba(3,47,1,0.06)] backdrop-blur">
              <div className="p-7 sm:p-9">
                <div className="flex flex-col gap-7 sm:flex-row sm:items-center">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#EBF5E1]">
                    <Star
                      size={32}
                      strokeWidth={1.8}
                      className="text-forest-2"
                      aria-hidden="true"
                    />
                  </span>

                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-text">
                      Avaliação média dos pacientes
                    </p>

                    <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
                      <span className="font-display text-[68px] font-extrabold leading-none tracking-[-0.07em] text-forest-2 sm:text-[76px]">
                        4,5
                      </span>

                      <div className="pb-2">
                        {/* 4 estrelas cheias + 1 pela metade: representa 4,5 sem arredondar */}
                        <div
                          className="mb-2 flex gap-2"
                          role="img"
                          aria-label="4,5 de 5 estrelas no Google"
                        >
                          {[0, 1, 2, 3].map((i) => (
                            <Star
                              key={i}
                              size={30}
                              strokeWidth={0}
                              aria-hidden="true"
                              className="fill-[#56A805]"
                            />
                          ))}
                          <span className="relative" aria-hidden="true">
                            <Star
                              size={30}
                              strokeWidth={1}
                              className="fill-[#E3E8DD] text-[#9FB396]"
                            />
                            <span className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
                              <Star size={30} strokeWidth={0} className="fill-[#56A805]" />
                            </span>
                          </span>
                        </div>
                        <p className="text-sm text-ink-soft">
                          {CLINICA.provaSocial.split("•")[1]?.trim() ?? "avaliações"} no Google
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="my-7 h-px bg-border-soft" />

                <div className="grid gap-6 sm:grid-cols-3">
                  <ItemNota
                    icon={<ShieldCheck size={23} />}
                    title="Confiança local"
                    description="Referência em atendimento odontológico na Freguesia do Ó."
                  />
                  <ItemNota
                    icon={<UsersRound size={23} />}
                    title="Experiência que acolhe"
                    description="Ambiente confortável e atendimento humanizado."
                  />
                  <ItemNota
                    icon={<Sparkles size={23} />}
                    title="Resultados que duram"
                    description="Planejamento e cuidado em cada detalhe."
                  />
                </div>
              </div>
            </div>

            <div className="mt-9 flex items-center gap-4">
              <span
                aria-hidden="true"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-[#56A805] font-display text-2xl font-extrabold text-white"
              >
                G
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">Avaliações reais no Google</p>
                <p className="text-xs leading-5 text-ink-soft">
                  Transparência que fortalece nossa relação com você.
                </p>
              </div>
            </div>
          </div>

          {/* COLUNA DIREITA */}
          <div>
            {destaque && (
              <article className="relative overflow-hidden rounded-[32px] bg-brand-deep px-7 py-8 shadow-[0_28px_70px_rgba(3,47,1,0.17)] sm:px-10 sm:py-10">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-16 top-0 select-none font-serif text-[180px] leading-none text-white/[0.03]"
                >
                  &ldquo;
                </span>
                <span
                  aria-hidden="true"
                  className="absolute right-7 top-7 flex h-9 w-9 items-center justify-center rounded-full bg-lime"
                >
                  <Star size={18} strokeWidth={0} className="fill-white text-white" />
                </span>

                <span
                  aria-hidden="true"
                  className="block font-serif text-[60px] leading-[0.6] text-lime"
                >
                  &ldquo;
                </span>

                <p className="relative mt-5 max-w-[680px] font-display text-[24px] font-bold leading-[1.32] tracking-[-0.025em] text-white sm:text-[30px]">
                  {destaque.texto}
                </p>

                <div className="my-7 h-px bg-white/15" />

                <div className="flex flex-wrap items-center justify-between gap-5">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-display text-lg font-bold text-white">{destaque.autor}</p>
                      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-lime">
                        Avaliação no Google
                      </span>
                    </div>
                  </div>
                  <Estrelas dark />
                </div>
              </article>
            )}

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              {grade.map((item) => (
                <CardAvaliacao key={item.autor} {...item} />
              ))}
            </div>
          </div>
        </div>

        {/* BARRA FINAL */}
        <div className="mt-12 flex flex-col gap-5 rounded-[24px] border border-border-soft bg-white/65 px-6 py-5 shadow-[0_15px_50px_rgba(3,47,1,0.05)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#56A805] text-white"
            >
              <Heart size={21} />
            </span>
            <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-5">
              <p className="font-display text-sm font-bold text-ink">
                Veja por que tantas famílias escolhem a JP.
              </p>
              <p className="text-sm text-ink-soft">
                Aqui, confiança se transforma em sorrisos todos os dias.
              </p>
            </div>
          </div>

          <a
            href="#clinica"
            className="group inline-flex shrink-0 items-center justify-center gap-3 rounded-full border border-[#56A805] px-6 py-3 text-xs font-bold uppercase tracking-[0.08em] text-forest-2 transition hover:bg-brand-deep hover:text-white"
          >
            Conheça a clínica
            <ArrowRight
              size={16}
              aria-hidden="true"
              className="transition-transform group-hover:translate-x-1"
            />
          </a>
        </div>
      </div>
    </section>
  );
}
