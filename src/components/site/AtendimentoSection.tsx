import { Accessibility, ArrowUpRight, HeartHandshake, UsersRound, Wind } from "lucide-react";

import { ATENDIMENTO, type PilarDeCuidado } from "@/lib/jp";
import { Reveal } from "@/components/site/Reveal";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";

/**
 * O ícone de cada pilar.
 *
 * O mapa fica aqui e a chave fica em `jp.ts` porque o dado é "qual cuidado" e o
 * desenho é "qual traço" — misturar os dois obrigaria quem atualiza o texto da
 * clínica a escolher ícone de biblioteca.
 */
const ICONES = {
  acessibilidade: Accessibility,
  especiais: HeartHandshake,
  sedacao: Wind,
  idosos: UsersRound,
} as const;

function Pilar({ pilar, index }: { pilar: PilarDeCuidado; index: number }) {
  const Icone = ICONES[pilar.icone];

  return (
    <Reveal delay={index * 60}>
      <article className="h-full rounded-2xl border border-forest/10 bg-white p-6 shadow-[0_18px_50px_-38px_rgba(3,47,1,.55)] transition-all duration-500 hover:-translate-y-1.5 hover:border-brand-green/50 sm:p-7">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-mint text-primary-ink">
          <Icone className="h-5.5 w-5.5" strokeWidth={1.7} aria-hidden="true" />
        </span>
        <h3 className="mt-5 font-display text-[19px] font-extrabold leading-tight tracking-[-0.025em] text-forest-2">
          {pilar.titulo}
        </h3>
        <p className="mt-3 text-[13.5px] leading-[1.65] text-ink-soft">{pilar.texto}</p>
      </article>
    </Reveal>
  );
}

/**
 * ATENDIMENTO ADAPTADO — a seção que o site não tinha.
 *
 * Até 15/09/2026 nenhuma das 12 rotas dizia uma palavra sobre acessibilidade,
 * sedação, necessidades especiais ou odontogeriatria. A clínica faz as quatro
 * coisas há anos, e cita duas delas como diferencial próprio.
 *
 * Quem procura isso não procura "dentista": procura "dentista que atende meu
 * filho autista", "dentista para cadeirante", "dentista com sedação". Se o site
 * não diz, a pessoa não tem como descobrir — e é a pessoa que mais precisa
 * saber antes de sair de casa.
 *
 * Por isso a seção termina em contato, e não em "saiba mais": a próxima coisa
 * útil para ela é falar com alguém que possa organizar a consulta.
 */
export function AtendimentoSection() {
  const wa = useContatoWhatsApp("duvida", "atendimento adaptado");

  return (
    <section id="atendimento" className="jp-section relative overflow-hidden bg-secondary/55">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 top-10 h-[540px] w-[540px] rounded-full bg-brand-green/10 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[380px] bottom-[-260px] h-[700px] w-[700px] rounded-full border border-brand-green/20"
      />

      <div className="jp-container relative">
        <Reveal className="grid gap-9 lg:grid-cols-[1.02fr_.98fr] lg:items-end">
          <div>
            <span className="eyebrow text-primary-ink">Atendimento</span>
            <h2 className="mt-5 max-w-3xl font-display text-[clamp(2.8rem,6vw,5rem)] font-extrabold leading-[.94] tracking-[-.055em] text-forest-2">
              Cuidado que se adapta a <span className="text-brand-text">quem chega.</span>
            </h2>
          </div>
          <p className="max-w-xl text-base font-medium leading-relaxed text-ink-soft lg:justify-self-end lg:pb-2">
            Nem todo mundo chega do mesmo jeito à cadeira do dentista. Aqui estão as condições que a
            clínica já tem para receber quem precisa de algo diferente — e o convite para avisar
            antes, que é o que faz a consulta sair como deveria.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ATENDIMENTO.map((pilar, i) => (
            <Pilar key={pilar.titulo} pilar={pilar} index={i} />
          ))}
        </div>

        <Reveal delay={120}>
          <div className="mt-6 flex flex-col gap-5 rounded-2xl border border-forest/10 bg-brand-deep p-7 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <p className="font-display text-xl font-extrabold leading-tight">
                Precisa de alguma adaptação para a consulta?
              </p>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/68">
                Conte a situação no agendamento. Com o aviso antes, a equipe reserva o tempo, a sala
                e as condições necessárias — em vez de resolver na hora, com você já na recepção.
              </p>
            </div>
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-11 inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-lime px-6 py-3.5 text-xs font-extrabold text-brand-deep transition hover:-translate-y-0.5"
            >
              Falar com a recepção
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
