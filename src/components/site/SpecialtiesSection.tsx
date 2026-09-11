import { ArrowRight } from "lucide-react";

import { TRATAMENTOS, whatsappLink } from "@/lib/jp";
import { TreatmentIcon } from "@/components/site/TreatmentIcons";

/**
 * Foto de cada card, por slug.
 *
 * Ficam em `public/images/tratamentos/` e são servidas por caminho absoluto,
 * não importadas: vieram prontas da referência e não passam pelo pipeline de
 * assets do Vite.
 */
const IMAGENS: Record<string, string> = {
  "limpeza-profilaxia": "/images/tratamentos/limpeza.jpg",
  "clareamento-dental": "/images/tratamentos/clareamento.jpg",
  restauracoes: "/images/tratamentos/restauracoes.jpg",
  "implantes-dentarios": "/images/tratamentos/implantes.jpg",
  "proteses-dentarias": "/images/tratamentos/proteses.jpg",
  ortodontia: "/images/tratamentos/ortodontia.jpg",
  odontopediatria: "/images/tratamentos/odontopediatria.jpg",
  "harmonizacao-orofacial": "/images/tratamentos/harmonizacao.jpg",
};

/**
 * Resumo curto de cada card — o `desc` de jp.ts é longo demais para esta caixa.
 *
 * Três saem do texto de referência: clareamento, implantes e harmonização
 * prometiam resultado ("seguro e eficaz", "duráveis e seguras", "valorizam
 * sua beleza"). A Resolução CFO 196/2019 veda garantia de resultado na
 * publicidade odontológica.
 */
const RESUMOS: Record<string, string> = {
  "limpeza-profilaxia":
    "Remoção de placa bacteriana e tártaro para prevenir cáries e doenças gengivais.",
  "clareamento-dental":
    "Clareamento com protocolo definido em avaliação, respeitando a sua sensibilidade.",
  restauracoes: "Tratamentos estéticos e funcionais para recuperar a saúde do seu dente.",
  "implantes-dentarios":
    "Reposição de dentes perdidos com planejamento individual e acompanhamento.",
  "proteses-dentarias": "Devolvemos função e estética com próteses confortáveis e personalizadas.",
  ortodontia: "Alinhamento dos dentes e da mordida com opções discretas e eficientes.",
  odontopediatria: "Cuidado especializado para a saúde bucal de crianças e adolescentes.",
  "harmonizacao-orofacial": "Procedimentos estéticos faciais realizados mediante avaliação.",
};

function CardEspecialidade({
  slug,
  titulo,
  index,
}: {
  slug: string;
  titulo: string;
  index: number;
}) {
  return (
    <article className="group relative flex min-h-[430px] flex-col overflow-hidden rounded-[24px] border border-border-soft bg-white shadow-[0_12px_40px_rgba(3,47,1,.055)] transition-all duration-500 hover:-translate-y-[7px] hover:border-brand-green/60 hover:shadow-[0_22px_55px_rgba(3,47,1,.11)]">
      <div className="relative h-[185px] overflow-hidden bg-[#FAFBF8]">
        <img
          src={IMAGENS[slug]}
          alt=""
          loading="lazy"
          width={900}
          height={507}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
        />

        {/* dissolve a base da foto no branco do card */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[55px] bg-gradient-to-t from-white to-transparent"
        />

        <span
          aria-hidden="true"
          className="absolute bottom-[8px] left-5 flex h-[48px] w-[48px] items-center justify-center rounded-full border border-border-soft bg-white/95 text-forest-2 shadow-[0_5px_15px_rgba(3,47,1,.06)] backdrop-blur-md"
        >
          <TreatmentIcon index={index} className="h-[19px] w-[19px]" />
        </span>
      </div>

      <div className="flex flex-1 flex-col px-[22px] pb-[23px] pt-[15px]">
        <h3 className="font-display text-[18px] font-extrabold leading-[1.15] tracking-[-0.025em] text-forest-2">
          {titulo}
        </h3>

        <p className="mt-3 text-[12.5px] leading-[1.55] text-ink-soft">{RESUMOS[slug]}</p>

        {/* o ::after estende o link ao card inteiro: alvo de clique maior sem
            aninhar <a> dentro de <a>, que seria HTML inválido */}
        <a
          href={`/tratamentos/${slug}`}
          className="group/link mt-auto flex items-center gap-3 pt-6 text-[12.5px] font-bold text-ink after:absolute after:inset-0 after:content-['']"
          aria-label={`Saiba mais sobre ${titulo}`}
        >
          Saiba mais
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[#56A805] text-brand-text transition-all duration-300 group-hover/link:border-lime group-hover/link:bg-lime group-hover/link:text-forest-2">
            <ArrowRight
              size={13}
              aria-hidden="true"
              className="transition-transform duration-300 group-hover/link:translate-x-[2px]"
            />
          </span>
        </a>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-10 left-1/2 h-[70px] w-[80%] -translate-x-1/2 rounded-full bg-brand-green/0 blur-[35px] transition-colors duration-500 group-hover:bg-brand-green/15"
      />
    </article>
  );
}

export function SpecialtiesSection() {
  return (
    <section id="tratamentos" className="jp-section relative overflow-hidden bg-paper">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[390px] -top-[355px] h-[720px] w-[720px] rounded-full border border-brand-green/25"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[410px] top-[50px] h-[800px] w-[800px] rounded-full border border-brand-green/25"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-170px] left-[28%] h-[350px] w-[620px] rounded-full bg-brand-green/12 blur-[110px]"
      />

      <div className="jp-container relative">
        <div className="mb-[52px] grid gap-10 lg:grid-cols-[1.08fr_.92fr] lg:items-start">
          <div>
            <span className="mb-5 block text-micro font-bold uppercase tracking-[0.18em] text-brand-text">
              Tratamentos
            </span>

            <h2 className="font-display text-[48px] font-extrabold leading-[0.98] tracking-[-0.055em] text-forest-2 sm:text-[60px] lg:text-[68px]">
              Nossas
              <br />
              <span className="relative inline-block text-brand-text">
                especialidades.
                <svg
                  aria-hidden="true"
                  className="absolute -bottom-[14px] left-0 h-[16px] w-[96px]"
                  viewBox="0 0 100 16"
                  fill="none"
                >
                  <path
                    d="M2 4.5C25 15 55 14 98 3"
                    stroke="#56A805"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h2>

            <p className="mt-8 max-w-[520px] text-[15px] leading-6 text-ink-soft">
              Cuidado completo para o seu sorriso, em todas as fases da vida.
            </p>
          </div>

          <div className="max-w-[470px] lg:ml-auto lg:pt-5">
            <p className="text-[14px] leading-[1.65] text-ink-soft">
              Na JP Clínica Integrada Odontológica, oferecemos diversas áreas de cuidado para
              atender às suas necessidades com excelência, tecnologia e acolhimento.
            </p>

            <p className="mt-4 text-[14px] font-semibold text-ink">
              A indicação ideal depende da avaliação profissional.
            </p>

            <a
              href={whatsappLink(
                "Olá! Vim pelo site da JP e gostaria de entender qual tratamento faz sentido para o meu caso.",
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="group mt-7 inline-flex min-w-[280px] items-center justify-between rounded-full border-[1.5px] border-lime bg-forest py-[7px] pl-7 pr-[7px] text-[13px] font-bold text-white shadow-[0_12px_30px_rgba(9,89,2,.26)] transition-all duration-300 hover:-translate-y-1 hover:bg-[#0C7503] hover:shadow-[0_18px_40px_rgba(86,168,5,.32)]"
            >
              Quero entender meu caso
              <span className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-brand-deep text-white">
                <ArrowRight
                  size={17}
                  aria-hidden="true"
                  className="-rotate-45 transition-transform duration-300 group-hover:rotate-0"
                />
              </span>
            </a>
          </div>
        </div>

        <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
          {TRATAMENTOS.map((t, i) => (
            <CardEspecialidade key={t.slug} slug={t.slug} titulo={t.titulo} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
