import { FormEvent, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  Clock3,
  HeartHandshake,
  MessageCircle,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import logo from "@/assets/logo-jp-official.webp";
import { CLINICA, TRATAMENTOS, whatsappLink } from "@/lib/jp";

const PERIODOS = ["Manhã", "Tarde", "Qualquer horário"];
const CONTATOS = ["WhatsApp", "Telefone"];

export function ContactForm() {
  const [nome, setNome] = useState("");
  const [contato, setContato] = useState("WhatsApp");
  const [assunto, setAssunto] = useState("Avaliação geral");
  const [periodo, setPeriodo] = useState("Qualquer horário");
  const [obs, setObs] = useState("");

  const mensagem = useMemo(() => {
    const linhas = [
      `Olá! Meu nome é ${nome || "[nome]"}. Vim pelo site da JP Clínica Integrada Odontológica.`,
      `Gostaria de falar sobre: ${assunto}.`,
      `Melhor forma de contato: ${contato}.`,
      `Melhor período para mim: ${periodo}.`,
    ];
    if (obs.trim()) linhas.push(`Mensagem: ${obs.trim()}`);
    return linhas.join("\n");
  }, [nome, contato, assunto, periodo, obs]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nome.trim()) return;
    window.open(whatsappLink(mensagem), "_blank", "noopener,noreferrer");
  };

  const input =
    "mt-2 w-full rounded-xl border border-forest/14 bg-white px-4 py-3.5 text-sm font-semibold text-forest-2 shadow-[inset_0_1px_0_rgba(255,255,255,.65)] transition focus:border-primary-ink placeholder:text-ink-soft";

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[2rem] border border-forest/10 bg-white p-5 shadow-[0_30px_90px_-48px_rgba(5,45,11,.48)] sm:p-7 lg:p-8"
    >
      <div className="flex items-start justify-between gap-5">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-primary/30 bg-white shadow-[0_4px_14px_rgba(5,45,11,.08)]">
              <img src={logo} alt="" width={40} height={40} className="h-10 w-10 object-contain" />
            </span>
            <p className="max-w-[13rem] font-display text-lg font-extrabold leading-[1.05] text-forest-2">
              {CLINICA.nome}
            </p>
          </div>
          <h3 className="mt-7 max-w-md font-display text-3xl font-extrabold leading-[.98] tracking-[-.045em] text-forest-2 sm:text-4xl">
            Vamos organizar sua avaliação?
          </h3>
          <p className="mt-2 text-sm font-medium text-ink-soft">
            Preencha os dados e a conversa será aberta no WhatsApp.
          </p>
        </div>
        <span className="hidden h-12 w-12 shrink-0 place-items-center rounded-full bg-mint text-primary-ink sm:grid">
          <BadgeCheck className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>

      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        <label className="text-[11px] font-extrabold uppercase tracking-[.09em] text-ink-soft">
          Nome completo
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-4 top-[1.32rem] h-4 w-4 text-ink-soft" />
            <input
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Como podemos te chamar?"
              className={`${input} pl-10`}
            />
          </div>
        </label>

        <label className="text-[11px] font-extrabold uppercase tracking-[.09em] text-ink-soft">
          Melhor forma de contato
          <select value={contato} onChange={(e) => setContato(e.target.value)} className={input}>
            {CONTATOS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>

        <label className="text-[11px] font-extrabold uppercase tracking-[.09em] text-ink-soft">
          Assunto ou interesse
          <select value={assunto} onChange={(e) => setAssunto(e.target.value)} className={input}>
            <option>Avaliação geral</option>
            {TRATAMENTOS.map((t) => (
              <option key={t.titulo}>{t.titulo}</option>
            ))}
            <option>Outro assunto</option>
          </select>
        </label>

        <label className="text-[11px] font-extrabold uppercase tracking-[.09em] text-ink-soft">
          Melhor período
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={input}>
            {PERIODOS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>

        <label className="text-[11px] font-extrabold uppercase tracking-[.09em] text-ink-soft sm:col-span-2">
          Mensagem opcional
          <textarea
            rows={3}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Conte-nos brevemente sobre suas necessidades ou dúvidas."
            className={`${input} resize-y`}
          />
        </label>
      </div>

      <button type="submit" className="button-dark mt-6 w-full">
        <MessageCircle className="h-4.5 w-4.5" />
        Abrir conversa no WhatsApp
        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="mt-6 grid gap-4 border-t border-forest/9 pt-5 sm:grid-cols-3">
        {[
          [Clock3, "Resposta rápida", "Retorno durante o horário de atendimento."],
          [HeartHandshake, "Atendimento humanizado", "Cuidado e atenção em cada etapa."],
          [ShieldCheck, "Avaliação profissional", "A indicação é definida caso a caso."],
        ].map(([Icon, title, text]) => {
          const C = Icon as typeof Clock3;
          return (
            <div key={String(title)} className="flex gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-mint text-primary-ink">
                <C className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[11px] font-extrabold text-forest-2">{String(title)}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">{String(text)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </form>
  );
}
