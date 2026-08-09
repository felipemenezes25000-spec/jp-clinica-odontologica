import { useId, useState } from "react";
import { ChevronRight, Heart, MessageCircleQuestion, Minus, Plus, ShieldCheck } from "lucide-react";

import { FAQ, whatsappLink } from "@/lib/jp";
import { IconDente } from "@/components/site/TreatmentIcons";

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

function IconeWhatsApp() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="25"
      height="25"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 4 11.5a8.5 8.5 0 0 1 4.7-7.6A8.4 8.4 0 0 1 12.5 3H13a8.5 8.5 0 0 1 8 8v.5Z" />
      <path d="M9.2 8.6c.2-.4.4-.4.7-.4h.5c.1 0 .3.1.4.4l.8 1.8c.1.3.1.4 0 .6l-.6.8c-.2.2-.2.4-.1.6.5.9 1.4 1.8 2.3 2.3.2.1.4.1.6-.1l.8-1c.2-.2.4-.2.6-.1l1.9.9c.2.1.3.3.3.5 0 .8-.4 1.5-1 2-.6.5-1.4.7-2.2.5-1.4-.3-3-1.1-4.5-2.6-1.2-1.2-2.1-2.7-2.5-4-.2-.8 0-1.6.5-2.2.4-.4.8-.7 1.5 0Z" />
    </svg>
  );
}

export function FaqSection() {
  const [aberto, setAberto] = useState<number | null>(0);
  const idBase = useId();

  const wa = whatsappLink(
    "Olá! Vim pelo site da JP Clínica Integrada Odontológica e fiquei com uma dúvida.",
  );

  return (
    <section
      id="faq"
      className="relative isolate min-h-[900px] overflow-hidden bg-[#031F09] text-white lg:min-h-[960px]"
    >
      {/* FOTO DE FUNDO
          object-[38%_center] é o que alinha o rosto como na referência: com
          object-cover o recorte é centralizado, e 38% puxa o enquadramento
          para a esquerda o suficiente para o rosto cair no vão entre as duas
          colunas. Se trocar a foto, este é o número a ajustar. */}
      <img
        src="/images/faq/faq-sorriso.jpg"
        alt=""
        loading="lazy"
        width={1122}
        height={1402}
        className="absolute inset-0 -z-30 h-full w-full object-cover object-[38%_center]"
      />

      <div aria-hidden="true" className="absolute inset-0 -z-20 bg-[#052D0B]/28" />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,#031E09_0%,rgba(3,30,9,.86)_40%,rgba(3,30,9,.72)_46%,rgba(5,45,11,.05)_56%,rgba(3,29,9,.45)_72%,#021B08_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[42%] bg-gradient-to-t from-[#021B08] via-[#031F09]/35 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-36 top-[34%] -z-10 h-[500px] w-[500px] rounded-full bg-[#7BD51C]/[0.035] blur-[120px]"
      />

      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 h-[120px] w-[500px] text-[#7BD51C] opacity-40"
        viewBox="0 0 500 120"
        fill="none"
      >
        <path d="M40 5C185 40 332 35 505 49" stroke="currentColor" strokeWidth="1" />
      </svg>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 h-[180px] w-[480px] text-[#7BD51C] opacity-50"
        viewBox="0 0 480 180"
        fill="none"
      >
        <path d="M-10 12C135 39 267 103 471 191" stroke="currentColor" strokeWidth="1.2" />
      </svg>

      <div className="relative mx-auto grid min-h-[900px] max-w-[1440px] gap-14 px-6 py-24 md:px-10 lg:min-h-[960px] lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-16 lg:px-12 xl:px-14">
        {/* COLUNA ESQUERDA */}
        <div className="max-w-[620px]">
          <div className="mb-8 flex items-center gap-3 text-[#8CD433]">
            <MessageCircleQuestion size={21} strokeWidth={1.6} aria-hidden="true" />
            <span className="text-[12px] font-bold uppercase tracking-[0.18em]">
              Perguntas frequentes
            </span>
          </div>

          <h2 className="font-display text-[54px] font-extrabold leading-[1.02] tracking-[-0.055em] text-white sm:text-[64px] lg:text-[70px] xl:text-[76px]">
            Dúvida boa
            <br />é dúvida
            <br />
            <span className="text-[#7BD51C]">respondida.</span>
          </h2>

          <svg
            aria-hidden="true"
            className="mt-6 h-[14px] w-[185px]"
            viewBox="0 0 185 14"
            fill="none"
          >
            <path
              d="M3 8C45 1 102 1 181 8"
              stroke="#7BD51C"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>

          <p className="mt-10 max-w-[480px] text-[17px] leading-[1.8] text-white/85">
            Reunimos as perguntas mais comuns que recebemos por aqui. Se ainda restar alguma dúvida,{" "}
            <strong className="font-semibold text-[#8CD433]">
              fale com a nossa equipe no WhatsApp.
            </strong>
          </p>

          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            /* min-w só a partir de sm. O `max-sm:min-w-0` do original dependia
               da ordem das variantes no CSS gerado e perdia: o botão media
               365px numa faixa de 327px e era cortado no celular. */
            className="group mt-9 inline-flex w-full items-center gap-4 rounded-[21px] border border-[#7BD51C]/25 bg-[linear-gradient(110deg,rgba(123,213,28,.13),rgba(5,45,11,.7))] px-4 py-3 shadow-[0_12px_35px_rgba(0,0,0,.15)] backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-[#7BD51C]/50 hover:bg-[#123C13]/80 sm:w-auto sm:min-w-[365px]"
          >
            <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-[#7BD51C] text-white shadow-[0_8px_24px_rgba(123,213,28,.25)]">
              <IconeWhatsApp />
            </span>
            <span className="flex-1">
              <span className="block text-[16px] font-semibold text-white">
                Fale com a gente no WhatsApp
              </span>
              <span className="mt-1 block text-[13px] text-white/60">
                Resposta rápida e humanizada
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

        {/* COLUNA DIREITA — as perguntas vêm de jp.ts, as mesmas que alimentam
            o JSON-LD de FAQPage. Duplicar aqui faria a página e o resultado do
            Google divergirem no dia em que uma resposta mudasse. */}
        <div className="w-full">
          <div className="space-y-[12px]">
            {FAQ.map((item, index) => {
              const isOpen = aberto === index;
              const idPainel = `${idBase}-faq-${index}`;

              return (
                <article
                  key={item.q}
                  className={`overflow-hidden rounded-[22px] border backdrop-blur-[8px] transition-all duration-300 ${
                    isOpen
                      ? "border-[#A4D85A]/45 bg-[linear-gradient(110deg,rgba(16,63,23,.78),rgba(4,38,12,.86))] shadow-[0_18px_45px_rgba(0,0,0,.14)]"
                      : "border-white/15 bg-[#062A0D]/65 hover:border-[#7BD51C]/35 hover:bg-[#0A3211]/75"
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
                      className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px] bg-[#123A15] text-[12px] font-bold text-[#8CD433]"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <span className="flex-1 font-display text-[17px] font-bold leading-[1.3] tracking-[-0.015em] text-white sm:text-[18px]">
                      {item.q}
                    </span>

                    <span
                      aria-hidden="true"
                      className="flex h-[39px] w-[39px] shrink-0 items-center justify-center rounded-full border border-[#7BD51C]/70 text-[#8CD433]"
                    >
                      {isOpen ? (
                        <Minus size={19} strokeWidth={2} />
                      ) : (
                        <Plus size={19} strokeWidth={2} />
                      )}
                    </span>
                  </button>

                  {/* grid-rows 0fr→1fr anima a altura sem precisar medi-la em JS.
                      Altura zero esconde da tela, mas o leitor de tela ainda
                      leria as 8 respostas de uma vez — daí o aria-hidden.
                      Usar `invisible` aqui seria pior: visibility interpola de
                      forma discreta e troca no meio da transição, deixando a
                      resposta invisível durante metade da abertura. Como o
                      painel só tem texto, sem nada focável, aria-hidden basta. */}
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
