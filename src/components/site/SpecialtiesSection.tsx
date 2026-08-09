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
    <article className="group relative flex min-h-[430px] flex-col overflow-hidden rounded-[24px] border border-[#DCE5D6] bg-white shadow-[0_12px_40px_rgba(5,45,11,.055)] transition-all duration-500 hover:-translate-y-[7px] hover:border-[#7BD51C]/50 hover:shadow-[0_22px_55px_rgba(5,45,11,.11)]">
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
          className="absolute bottom-[8px] left-5 flex h-[48px] w-[48px] items-center justify-center rounded-full border border-[#DCE6D5] bg-white/95 text-[#052D0B] shadow-[0_5px_15px_rgba(5,45,11,.06)] backdrop-blur-md"
        >
          <TreatmentIcon index={index} className="h-[19px] w-[19px]" />
        </span>
      </div>

      <div className="flex flex-1 flex-col px-[22px] pb-[23px] pt-[15px]">
        <h3 className="font-display text-[18px] font-extrabold leading-[1.15] tracking-[-0.025em] text-[#052D0B]">
          {titulo}
        </h3>

        <p className="mt-3 text-[12.5px] leading-[1.55] text-[#667168]">{RESUMOS[slug]}</p>

        {/* o ::after estende o link ao card inteiro: alvo de clique maior sem
            aninhar <a> dentro de <a>, que seria HTML inválido */}
        <a
          href={`/tratamentos/${slug}`}
          className="group/link mt-auto flex items-center gap-3 pt-6 text-[12.5px] font-bold text-[#172018] after:absolute after:inset-0 after:content-['']"
          aria-label={`Saiba mais sobre ${titulo}`}
        >
          Saiba mais
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[#91C95B] text-[#63A923] transition-all duration-300 group-hover/link:border-[#7BD51C] group-hover/link:bg-[#7BD51C] group-hover/link:text-[#052D0B]">
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
        className="pointer-events-none absolute -bottom-10 left-1/2 h-[70px] w-[80%] -translate-x-1/2 rounded-full bg-[#7BD51C]/0 blur-[35px] transition-colors duration-500 group-hover:bg-[#7BD51C]/15"
      />
    </article>
  );
}

export function SpecialtiesSection() {
  return (
    <section id="tratamentos" className="jp-section relative overflow-hidden bg-[#F7F8F2]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[390px] -top-[355px] h-[720px] w-[720px] rounded-full border border-[#7BD51C]/20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[410px] top-[50px] h-[800px] w-[800px] rounded-full border border-[#7BD51C]/20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-170px] left-[28%] h-[350px] w-[620px] rounded-full bg-[#7BD51C]/10 blur-[110px]"
      />

      <div className="jp-container relative">
        <div className="mb-[52px] grid gap-10 lg:grid-cols-[1.08fr_.92fr] lg:items-start">
          <div>
            <span className="mb-5 block text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text">
              Tratamentos
            </span>

            <h2 className="font-display text-[48px] font-extrabold leading-[0.98] tracking-[-0.055em] text-[#052D0B] sm:text-[60px] lg:text-[68px]">
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
                    stroke="#7BD51C"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h2>

            <p className="mt-8 max-w-[520px] text-[15px] leading-6 text-[#667168]">
              Cuidado completo para o seu sorriso, em todas as fases da vida.
            </p>
          </div>

          <div className="max-w-[470px] lg:ml-auto lg:pt-5">
            <p className="text-[14px] leading-[1.65] text-[#667168]">
              Na JP Clínica Integrada Odontológica, oferecemos diversas áreas de cuidado para
              atender às suas necessidades com excelência, tecnologia e acolhimento.
            </p>

            <p className="mt-4 text-[14px] font-semibold text-[#172018]">
              A indicação ideal depende da avaliação profissional.
            </p>

            <a
              href={whatsappLink(
                "Olá! Vim pelo site da JP e gostaria de entender qual tratamento faz sentido para o meu caso.",
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="group mt-7 inline-flex min-w-[280px] items-center justify-between rounded-full border-[1.5px] border-[#7BD51C] bg-[#2F6B35] py-[7px] pl-7 pr-[7px] text-[13px] font-bold text-white shadow-[0_12px_30px_rgba(47,107,53,.26)] transition-all duration-300 hover:-translate-y-1 hover:bg-[#3A7F41] hover:shadow-[0_18px_40px_rgba(123,213,28,.32)]"
            >
              Quero entender meu caso
              <span className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-[#052D0B] text-white">
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
