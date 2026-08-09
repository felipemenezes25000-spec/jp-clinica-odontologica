import { ArrowRight } from "lucide-react";

import { TRATAMENTOS, whatsappLink } from "@/lib/jp";
import { TreatmentIcon } from "@/components/site/TreatmentIcons";

import posterLimpeza from "@/assets/video-limpeza-poster.webp";
import posterClareamento from "@/assets/video-clareamento-poster.webp";
import posterRestauracao from "@/assets/video-restauracao-poster.webp";
import posterImplante from "@/assets/video-implante-poster.webp";
import posterProtese from "@/assets/video-protese-poster.webp";
import posterOrtodontia from "@/assets/video-ortodontia-poster.webp";
import posterOdontopediatria from "@/assets/video-odontopediatria-poster.webp";
import posterHarmonizacao from "@/assets/video-harmonizacao-poster.webp";

/**
 * Imagem de cada card, por slug.
 *
 * São os pôsteres das animações de cada tratamento — quadros escolhidos a dedo
 * para mostrar o resultado, não o problema. Sete vêm do acervo da própria
 * clínica; o de clareamento vem do Pexels. Reaproveitar aqui evita buscar oito
 * fotos de banco que ilustrariam o procedimento errado.
 */
const IMAGENS: Record<string, string> = {
  "limpeza-profilaxia": posterLimpeza,
  "clareamento-dental": posterClareamento,
  restauracoes: posterRestauracao,
  "implantes-dentarios": posterImplante,
  "proteses-dentarias": posterProtese,
  ortodontia: posterOrtodontia,
  odontopediatria: posterOdontopediatria,
  "harmonizacao-orofacial": posterHarmonizacao,
};

/** Resumo curto de cada card — o `desc` de jp.ts é longo demais para esta caixa. */
const RESUMOS: Record<string, string> = {
  "limpeza-profilaxia":
    "Remoção de placa bacteriana e tártaro para prevenir cáries e doenças gengivais.",
  "clareamento-dental": "Clareamento indicado após avaliação, respeitando a sua sensibilidade.",
  restauracoes: "Tratamentos estéticos e funcionais para recuperar a saúde do seu dente.",
  "implantes-dentarios": "Solução para repor dentes perdidos com planejamento individual.",
  "proteses-dentarias": "Devolvemos função e estética com próteses confortáveis e personalizadas.",
  ortodontia: "Alinhamento dos dentes e da mordida com opções discretas e eficientes.",
  odontopediatria: "Cuidado especializado para a saúde bucal de crianças e adolescentes.",
  "harmonizacao-orofacial": "Procedimentos estéticos faciais mediante avaliação profissional.",
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
  const imagem = IMAGENS[slug];

  return (
    <article className="group relative flex min-h-[420px] flex-col overflow-hidden rounded-[26px] border border-[#DDE5D7] bg-white shadow-[0_16px_45px_rgba(5,45,11,0.055)] transition-all duration-500 hover:-translate-y-2 hover:border-[#7BD51C]/40 hover:shadow-[0_24px_65px_rgba(5,45,11,0.11)]">
      <div className="relative h-[185px] overflow-hidden bg-[#EEF3E8]">
        {imagem && (
          <img
            src={imagem}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
          />
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/30"
        />
        <span
          aria-hidden="true"
          className="absolute bottom-4 left-5 flex h-[52px] w-[52px] items-center justify-center rounded-full border border-[#DAE5D3] bg-white/95 text-[#052D0B] shadow-sm backdrop-blur-md"
        >
          <TreatmentIcon index={index} className="h-[22px] w-[22px]" />
        </span>
      </div>

      <div className="flex flex-1 flex-col px-6 pb-6 pt-5">
        <h3 className="font-display text-[20px] font-extrabold leading-tight tracking-[-0.025em] text-[#052D0B]">
          {titulo}
        </h3>

        <p className="mt-3 text-[13px] leading-[1.65] text-[#5B6659]">{RESUMOS[slug]}</p>

        <a
          href={`/tratamentos/${slug}`}
          className="group/link mt-auto flex items-center gap-3 pt-6 text-[13px] font-bold text-[#172018] after:absolute after:inset-0 after:content-['']"
          aria-label={`Saiba mais sobre ${titulo}`}
        >
          Saiba mais
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#8BC64E] text-[#4E8C25] transition-all group-hover/link:bg-[#7BD51C] group-hover/link:text-[#052D0B]">
            <ArrowRight
              size={14}
              aria-hidden="true"
              className="transition-transform group-hover/link:translate-x-[2px]"
            />
          </span>
        </a>
      </div>
    </article>
  );
}

export function SpecialtiesSection() {
  return (
    <section id="tratamentos" className="relative overflow-hidden bg-[#F7F8F2] py-24 lg:py-32">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[280px] -top-[230px] h-[560px] w-[560px] rounded-full border border-[#7BD51C]/20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[350px] top-[60px] h-[650px] w-[650px] rounded-full border border-[#7BD51C]/20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-150px] left-[30%] h-[330px] w-[550px] rounded-full bg-[#7BD51C]/10 blur-[100px]"
      />

      <div className="jp-container relative">
        <div className="mb-14 grid gap-10 lg:grid-cols-[1.15fr_.85fr] lg:items-start">
          <div>
            <span className="mb-5 block text-[12px] font-bold uppercase tracking-[0.17em] text-[#4E8C25]">
              Tratamentos
            </span>

            <h2 className="font-display text-[42px] font-extrabold leading-[0.98] tracking-[-0.055em] text-[#052D0B] sm:text-[62px] lg:text-[72px]">
              Nossas{" "}
              <span className="relative inline-block text-[#4E8C25]">
                especialidades.
                <svg
                  aria-hidden="true"
                  className="absolute -bottom-3 left-0 w-[92px]"
                  viewBox="0 0 100 15"
                  fill="none"
                >
                  <path
                    d="M2 5C26 14 55 14 98 3"
                    stroke="#7BD51C"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h2>

            <p className="mt-7 text-[16px] text-[#5B6659]">
              Cuidado completo para o seu sorriso, em todas as fases da vida.
            </p>
          </div>

          <div className="max-w-[490px] lg:ml-auto lg:pt-7">
            <p className="text-[15px] leading-7 text-[#5B6659]">
              Na JP Clínica Integrada Odontológica, oferecemos diversas áreas de cuidado para
              atender às suas necessidades com excelência, tecnologia e acolhimento.
            </p>

            <p className="mt-3 text-[15px] font-semibold text-[#172018]">
              A indicação ideal depende da avaliação profissional.
            </p>

            <a
              href={whatsappLink(
                "Olá! Vim pelo site da JP e gostaria de entender qual tratamento faz sentido para o meu caso.",
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="group mt-8 inline-flex min-w-[280px] items-center justify-between rounded-full bg-[#7BD51C] py-2 pl-7 pr-2 text-sm font-semibold text-[#052D0B] shadow-[0_14px_30px_rgba(123,213,28,.25)] transition duration-300 hover:-translate-y-1 hover:bg-[#8BE72A]"
            >
              Quero entender meu caso
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#052D0B] text-white">
                <ArrowRight
                  size={18}
                  aria-hidden="true"
                  className="-rotate-45 transition-transform duration-300 group-hover:rotate-0"
                />
              </span>
            </a>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TRATAMENTOS.map((t, i) => (
            <CardEspecialidade key={t.slug} slug={t.slug} titulo={t.titulo} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
