import { ShieldCheck, UsersRound } from "lucide-react";

import { EQUIPE } from "@/lib/jp";

function CardProfissional({
  nome,
  papel,
  registro,
  foto,
}: {
  nome: string;
  papel?: string | undefined;
  registro: string;
  foto?: string | undefined;
}) {
  return (
    <article className="group overflow-hidden rounded-[22px] border border-border-soft bg-white/55 px-5 pb-7 pt-6 shadow-[0_14px_42px_rgba(3,47,1,.055)] backdrop-blur-sm transition-all duration-500 hover:-translate-y-2 hover:border-brand-green/55 hover:shadow-[0_22px_55px_rgba(3,47,1,.10)]">
      <div className="relative mx-auto aspect-[0.83/1] w-full overflow-hidden rounded-t-[90px] bg-[#EBF5E1]">
        {foto ? (
          /* width/height são obrigatórios: a foto é lazy e, sem a proporção
             intrínseca, o card colapsaria até o download terminar. */
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

      <div className="pt-5 text-center">
        <h3 className="font-display text-[18px] font-extrabold leading-tight tracking-[-0.025em] text-forest-2">
          {nome}
        </h3>

        <p className="mt-2 min-h-[32px] text-[11px] font-bold uppercase leading-[1.35] tracking-[0.08em] text-brand-text">
          {papel}
        </p>

        <div aria-hidden="true" className="mx-auto my-5 h-px w-[82%] bg-border-soft" />

        <p className="text-[11px] uppercase tracking-[0.1em] text-ink-soft">Registro</p>
        <p className="mt-2 text-[12px] font-medium text-[#2C4A2E]">{registro}</p>
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
        <div className="mb-12 lg:mb-14">
          <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text">
            Quem cuida de você
          </p>

          <h2 className="font-display text-[52px] font-extrabold leading-[0.93] tracking-[-0.055em] text-forest-2 sm:text-[64px] lg:text-[72px]">
            Nossa
            <br />
            <span className="text-brand-text">equipe.</span>
          </h2>

          <p className="mt-6 max-w-[470px] text-[15px] leading-6 text-ink-soft">
            Atendimento feito por profissionais com registro ativo no Conselho Regional de
            Odontologia.
          </p>
        </div>

        {/* Voltou a 5 colunas: a responsável técnica saiu desta grade, a pedido
            da clínica — ela tem apresentação própria no bloco de história. Era a
            6ª coluna, e era também a única pessoa real daqui.

            Tirá-la só foi seguro porque o rodapé deixou de ler EQUIPE[0] e
            passou a ler RESPONSAVEL_TECNICA: pela regra antiga, esta mudança
            teria publicado o CRO inventado do Dr. Ricardo Almeida na linha que
            a Resolução CFO 196/2019 exige. */}
        <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {EQUIPE.map((pessoa) => (
            <CardProfissional
              key={pessoa.registro}
              nome={pessoa.nome}
              papel={pessoa.papel ?? pessoa.especialidade}
              registro={pessoa.registro}
              foto={pessoa.foto}
            />
          ))}
        </div>

        <div className="mx-auto mt-10 flex w-fit max-w-full items-center gap-4 rounded-[18px] border border-border-soft bg-white/70 px-6 py-4 shadow-[0_12px_35px_rgba(3,47,1,.06)] backdrop-blur">
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
