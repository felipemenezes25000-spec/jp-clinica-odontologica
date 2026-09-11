import { useId, useState } from "react";
import { ChevronRight, Heart, MessageCircleQuestion, Minus, Plus, ShieldCheck } from "lucide-react";

import { FAQ } from "@/lib/jp";
import { IconDente } from "@/components/site/TreatmentIcons";
import { contatoWhatsApp } from "@/lib/contato";

function Diferencial({ icon, title }: { icon: React.ReactNode; title: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 first:pl-0">
      <div className="shrink-0 text-white/70" aria-hidden="true">
        {icon}
      </div>
      <p className="text-[12px] leading-[1.45] text-white/80 sm:text-[13px]">{title}</p>
    </div>
  );
}

/**
 * O símbolo do WhatsApp.
 *
 * Era um traçado desenhado à mão, e o fone dentro do balão estava malformado —
 * fechava numa espiral em vez do gancho. Agora é o glifo oficial, em forma
 * preenchida, que é como a marca se desenha: o fone é recorte do balão, não
 * linha por cima dele.
 */
function IconeWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" width="25" height="25" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

export function FaqSection() {
  /** `null` e não `0`: a página abre com todas as perguntas fechadas. Com 0, a
   *  primeira já vinha aberta a cada visita, empurrando as outras oito para
   *  baixo e decidindo pela pessoa qual dúvida ela tem. */
  const [aberto, setAberto] = useState<number | null>(null);
  const idBase = useId();

  const wa = contatoWhatsApp("duvida");

  return (
    <section
      id="faq"
      className="relative isolate min-h-[900px] overflow-hidden bg-[#032F01] text-white lg:min-h-[960px]"
    >
      <img
        src="/images/faq/faq-sorriso.jpg"
        alt=""
        loading="lazy"
        width={1122}
        height={1402}
        className="absolute inset-0 -z-30 h-full w-full object-cover object-[38%_center]"
      />

      <div aria-hidden="true" className="absolute inset-0 -z-20 bg-forest-2/28" />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,#032f01_0%,rgba(3,30,9,.86)_40%,rgba(3,30,9,.72)_46%,rgba(3,47,1,.05)_56%,rgba(3,29,9,.45)_72%,#021D00_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[42%] bg-gradient-to-t from-[#021D00] via-[#032F01]/35 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-36 top-[34%] -z-10 h-[500px] w-[500px] rounded-full bg-lime/[0.035] blur-[120px]"
      />

      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 h-[120px] w-[500px] text-lime opacity-40"
        viewBox="0 0 500 120"
        fill="none"
      >
        <path d="M40 5C185 40 332 35 505 49" stroke="currentColor" strokeWidth="1" />
      </svg>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 h-[180px] w-[480px] text-lime opacity-50"
        viewBox="0 0 480 180"
        fill="none"
      >
        <path d="M-10 12C135 39 267 103 471 191" stroke="currentColor" strokeWidth="1.2" />
      </svg>

      <div className="relative mx-auto grid min-h-[900px] max-w-[1440px] gap-14 px-6 py-24 md:px-10 lg:min-h-[960px] lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-16 lg:px-12 xl:px-14">
        <div className="max-w-[620px]">
          <div className="mb-8 flex items-center gap-3 text-[#56A805]">
            <MessageCircleQuestion size={21} strokeWidth={1.6} aria-hidden="true" />
            <span className="text-[12px] font-bold uppercase tracking-[0.18em]">
              Perguntas frequentes
            </span>
          </div>

          <h2 className="font-display text-[54px] font-extrabold leading-[1.02] tracking-[-0.055em] text-white sm:text-[64px] lg:text-[70px] xl:text-[76px]">
            Dúvida boa
            <br />é dúvida
            <br />
            <span className="text-lime">respondida.</span>
          </h2>

          <svg
            aria-hidden="true"
            className="mt-6 h-[14px] w-[185px]"
            viewBox="0 0 185 14"
            fill="none"
          >
            <path
              d="M3 8C45 1 102 1 181 8"
              stroke="#56A805"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>

          <p className="mt-10 max-w-[480px] text-[17px] leading-[1.8] text-white/85">
            Reunimos as perguntas mais comuns que recebemos por aqui. Se ainda restar alguma dúvida,{" "}
            <strong className="font-semibold text-[#56A805]">
              fale com a nossa equipe no WhatsApp.
            </strong>
          </p>

          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="group mt-9 inline-flex w-full items-center gap-4 rounded-xl border border-lime/25 bg-[linear-gradient(110deg,rgba(86,168,5,.13),rgba(3,47,1,.7))] px-4 py-3 shadow-[0_12px_35px_rgba(0,0,0,.15)] backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-lime/50 hover:bg-[#032F01]/80 sm:w-auto sm:min-w-[365px]"
          >
            <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-lime text-white shadow-[0_8px_24px_rgba(86,168,5,.25)]">
              <IconeWhatsApp />
            </span>
            <span className="flex-1">
              <span className="block text-[16px] font-semibold text-white">
                Fale com a gente no WhatsApp
              </span>
              <span className="mt-1 block text-[13px] text-white/60">
                Atendimento durante o horário da clínica
              </span>
            </span>
            <ChevronRight
              size={21}
              aria-hidden="true"
              className="mr-1 text-white transition-transform group-hover:translate-x-1"
            />
          </a>

          <div className="mt-12 grid max-w-[550px] grid-cols-3 divide-x divide-white/20">
            <Diferencial
              icon={<IconDente className="h-[35px] w-[35px]" />}
              title={
                <>
                  Atendimento
                  <br />
                  humanizado
                </>
              }
            />
            <Diferencial
              icon={<ShieldCheck size={34} strokeWidth={1.5} />}
              title={
                <>
                  Tecnologia e
                  <br />
                  segurança
                </>
              }
            />
            <Diferencial
              icon={<Heart size={35} strokeWidth={1.4} />}
              title={
                <>
                  Cuidado que
                  <br />
                  você sente
                </>
              }
            />
          </div>
        </div>

        <div className="w-full">
          <div className="space-y-[12px]">
            {FAQ.map((item, index) => {
              const isOpen = aberto === index;
              const idPainel = `${idBase}-faq-${index}`;

              return (
                <article
                  key={item.q}
                  className={`overflow-hidden rounded-xl border backdrop-blur-[8px] transition-all duration-300 ${
                    isOpen
                      ? "border-[#56A805]/45 bg-[linear-gradient(110deg,rgba(16,63,23,.78),rgba(4,38,12,.86))] shadow-[0_18px_45px_rgba(0,0,0,.14)]"
                      : "border-white/15 bg-[#032F01]/65 hover:border-lime/35 hover:bg-[#032F01]/75"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setAberto((atual) => (atual === index ? null : index))}
                    aria-expanded={isOpen}
                    aria-controls={idPainel}
                    className="flex w-full items-center gap-5 px-6 py-[22px] text-left sm:px-7"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-sm bg-[#032F01] text-[12px] font-bold text-[#56A805]"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <span className="flex-1 font-display text-[17px] font-bold leading-[1.3] tracking-[-0.015em] text-white sm:text-[18px]">
                      {item.q}
                    </span>

                    <span
                      aria-hidden="true"
                      className="flex h-[39px] w-[39px] shrink-0 items-center justify-center rounded-full border border-lime/70 text-[#56A805]"
                    >
                      {isOpen ? (
                        <Minus size={19} strokeWidth={2} />
                      ) : (
                        <Plus size={19} strokeWidth={2} />
                      )}
                    </span>
                  </button>

                  <div
                    id={idPainel}
                    aria-hidden={!isOpen}
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="pb-8 pl-[85px] pr-8 text-[16px] leading-[1.75] text-white/85 max-sm:pl-6">
                        {item.a}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
