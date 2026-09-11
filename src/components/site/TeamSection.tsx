import { ShieldCheck, UsersRound } from "lucide-react";

import { EQUIPE } from "@/lib/jp";

/**
 * A seção pública nunca renderiza pessoa marcada como fictícia ou placeholder.
 * A defesa fica aqui, no ponto de exibição: assim um item temporário usado para
 * acertar layout não consegue virar profissional publicado por acidente.
 */
const EQUIPE_PUBLICA = EQUIPE.filter((pessoa) => !pessoa.ficticio && !pessoa.placeholder);

/**
 * A partir de xl a equipe inteira cabe numa linha só. Antes era 20% cravado —
 * cinco por linha —, e com seis pessoas a última descia sozinha para a linha de
 * baixo, menor que as outras porque não tinha ninguém ao lado para esticá-la.
 */
const LARGURA_XL: Record<number, string> = {
  4: "xl:w-[calc(25%_-_15px)]",
  5: "xl:w-[calc(20%_-_16px)]",
  6: "xl:w-[calc(16.666%_-_17px)]",
  7: "xl:w-[calc(14.285%_-_18px)]",
  8: "xl:w-[calc(12.5%_-_18px)]",
};

const LARGURA_UMA_LINHA = LARGURA_XL[EQUIPE_PUBLICA.length] ?? "";

function CardProfissional({
  nome,
  papel,
  registro,
  foto,
}: {
  nome: string;
  papel?: string | undefined;
  registro?: string | undefined;
  foto?: string | undefined;
}) {
  return (
    <article
      className={`group flex w-full flex-col overflow-hidden rounded-[22px] border border-border-soft bg-white/55 px-4 pb-5 pt-5 shadow-[0_14px_42px_rgba(3,47,1,.055)] backdrop-blur-sm transition-all duration-500 hover:-translate-y-2 hover:border-brand-green/55 hover:shadow-[0_22px_55px_rgba(3,47,1,.10)] sm:w-[calc(50%_-_10px)] md:w-[calc(33.333%_-_14px)] ${LARGURA_UMA_LINHA}`}
    >
      <div className="relative mx-auto aspect-[0.83/1] w-full shrink-0 overflow-hidden rounded-t-[90px] bg-[#EBF5E1]">
        {foto ? (
          <img
            src={foto}
            alt={`Retrato de ${nome}`}
            loading="lazy"
            width={600}
            height={728}
            className="h-full w-full object-cover object-top transition-transform duration-700 group-hover:scale-[1.035]"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <span className="grid h-24 w-24 place-items-center rounded-full border border-forest/10 bg-white/75 text-brand-text shadow-sm">
              <UsersRound className="h-10 w-10" aria-hidden="true" />
            </span>
          </div>
        )}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white/20 to-transparent"
        />
      </div>

      <div className="flex flex-1 flex-col justify-start pt-4 text-center">
        <h3 className="min-h-[45px] font-display text-[18px] font-extrabold leading-tight tracking-[-0.025em] text-forest-2">
          {nome}
        </h3>

        <p className="mt-1.5 min-h-[30px] text-micro font-bold uppercase leading-[1.35] tracking-[0.08em] text-brand-text">
          {papel}
        </p>

        {registro ? (
          <>
            <div aria-hidden="true" className="mx-auto my-3 h-px w-[82%] bg-border-soft" />
            <p className="text-micro uppercase tracking-[0.1em] text-ink-soft">Registro</p>
            <p className="mt-2 text-[12px] font-medium text-[#2C4A2E]">{registro}</p>
          </>
        ) : null}
      </div>
    </article>
  );
}

export function TeamSection() {
  return (
    <section id="equipe" className="jp-section relative overflow-hidden bg-paper">
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 h-[330px] w-[620px] text-brand-green opacity-[0.22]"
        viewBox="0 0 620 330"
        fill="none"
      >
        <path
          d="M35 0C120 115 245 72 351 88C474 107 558 169 620 318"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path
          d="M113 0C182 87 281 73 380 91C492 112 569 176 620 272"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>

      <svg
        aria-hidden="true"
        className="pointer-events-none absolute -left-12 bottom-0 h-[360px] w-[270px] text-brand-green opacity-[0.18]"
        viewBox="0 0 270 360"
        fill="none"
      >
        <path
          d="M0 48C90 84 50 175 97 244C131 295 193 320 270 340"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path
          d="M0 118C63 139 53 205 99 263C136 309 188 334 251 360"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>

      <div className="jp-container relative">
        <div className="mb-8 lg:mb-10">
          <p className="mb-4 text-micro font-bold uppercase tracking-[0.18em] text-brand-text">
            Quem cuida de você
          </p>

          <h2 className="font-display text-[52px] font-extrabold leading-[0.93] tracking-[-0.055em] text-forest-2 sm:text-[64px] lg:text-[72px]">
            Nossa
            <br />
            <span className="text-brand-text">equipe.</span>
          </h2>

          <p className="mt-5 max-w-[520px] text-[15px] leading-6 text-ink-soft">
            Atendimento clínico realizado por cirurgiões-dentistas identificados pelo número de registro no Conselho Regional de Odontologia.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-[20px]">
          {EQUIPE_PUBLICA.map((pessoa) => (
            <CardProfissional
              key={pessoa.nome}
              nome={pessoa.nome}
              papel={pessoa.papel ?? pessoa.especialidade}
              registro={pessoa.registro}
              foto={pessoa.foto}
            />
          ))}
        </div>

        <div className="mx-auto mt-7 flex w-fit max-w-full items-center gap-4 rounded-[18px] border border-border-soft bg-white/70 px-6 py-4 shadow-[0_12px_35px_rgba(3,47,1,.06)] backdrop-blur">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brand-green/45 text-brand-text"
          >
            <ShieldCheck size={20} strokeWidth={1.7} />
          </span>
          <p className="text-[14px] text-ink-soft">
            Equipe preparada para cuidar de{" "}
            <strong className="font-semibold text-brand-text">
              todas as fases do seu sorriso.
            </strong>
          </p>
        </div>
      </div>
    </section>
  );
}
