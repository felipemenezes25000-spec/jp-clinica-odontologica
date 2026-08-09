import { FormEvent, useMemo, useState } from "react";
import { ArrowUpRight, Check, MessageCircle, ShieldCheck } from "lucide-react";
import { CLINICA, TRATAMENTOS, whatsappLink } from "@/lib/jp";

const PERIODOS = ["Manhã", "Tarde", "Qualquer horário"];

export function ContactForm() {
  const [nome, setNome] = useState("");
  const [assunto, setAssunto] = useState("Avaliação geral / check-up");
  const [periodo, setPeriodo] = useState("Qualquer horário");
  const [obs, setObs] = useState("");

  const mensagem = useMemo(() => {
    const linhas = [
      `Olá! Meu nome é ${nome || "[nome]"}. Vim pelo site da JP Clínica Odontológica.`,
      `Gostaria de falar sobre: ${assunto}.`,
      `Melhor período para mim: ${periodo}.`,
    ];
    if (obs.trim()) linhas.push(`Mensagem: ${obs.trim()}`);
    return linhas.join("\n");
  }, [nome, assunto, periodo, obs]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nome.trim()) return;
    window.open(whatsappLink(mensagem), "_blank", "noopener,noreferrer");
  };

  // `outline-none` anulava o contorno global de foco — e como a regra do Tailwind
  // vem depois do :focus-visible com a mesma especificidade, os campos ficavam sem
  // nenhum indicador visível. Removido: quem navega por teclado precisa saber onde está.
  const input =
    "mt-2 w-full rounded-2xl border border-forest/25 bg-white px-4 py-3.5 text-sm font-semibold text-forest-2 transition focus:border-forest-2 placeholder:text-forest/65";

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[2rem] bg-cream p-5 shadow-[0_26px_90px_-46px_rgba(0,0,0,.5)] sm:p-7 lg:p-8"
    >
      <div className="flex items-start justify-between gap-6">
        <div>
          <span className="eyebrow text-forest/70">Agendamento</span>
          <h3 className="mt-3 max-w-sm font-display text-3xl font-extrabold leading-[.98] text-forest-2 sm:text-4xl">
            Você fala. A gente organiza o próximo passo.
          </h3>
        </div>
        <span className="hidden h-12 w-12 shrink-0 place-items-center rounded-full bg-lime text-forest-2 sm:grid">
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>

      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-extrabold uppercase tracking-[.08em] text-forest/70 sm:col-span-2">
          Seu nome
          <input
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Como podemos te chamar?"
            className={input}
          />
        </label>

        <label className="text-xs font-extrabold uppercase tracking-[.08em] text-forest/70">
          Quero saber sobre
          <select value={assunto} onChange={(e) => setAssunto(e.target.value)} className={input}>
            <option>Avaliação geral / check-up</option>
            {TRATAMENTOS.map((t) => (
              <option key={t.titulo}>{t.titulo}</option>
            ))}
            <option>Outro assunto</option>
          </select>
        </label>

        <label className="text-xs font-extrabold uppercase tracking-[.08em] text-forest/70">
          Melhor período
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={input}>
            {PERIODOS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>

        <label className="text-xs font-extrabold uppercase tracking-[.08em] text-forest/70 sm:col-span-2">
          Mensagem opcional
          <textarea
            rows={3}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Escreva apenas o que achar necessário. Não precisa informar dados sensíveis."
            className={`${input} resize-y`}
          />
        </label>
      </div>

      <button type="submit" className="button-dark mt-6 w-full sm:w-auto">
        Abrir conversa no WhatsApp
        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="mt-6 grid gap-2 border-t border-forest/10 pt-5 text-xs font-semibold text-forest/70 sm:grid-cols-2">
        <span className="flex items-center gap-2">
          <Check className="h-4 w-4 text-primary" /> Sem cadastro
        </span>
        <span className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" /> Nenhum dado fica salvo no site
        </span>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-forest/70">
        Atendimento {CLINICA.horario.toLowerCase()}. A avaliação profissional é quem define a
        indicação e o planejamento de cada tratamento.
      </p>
    </form>
  );
}
