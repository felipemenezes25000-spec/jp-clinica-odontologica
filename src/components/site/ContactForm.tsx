import { FormEvent, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  Clock3,
  HeartHandshake,
  MessageCircle,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { CLINICA, TRATAMENTOS, whatsappLink } from "@/lib/jp";

const PERIODOS = ["Manhã", "Tarde", "Qualquer horário"];
const CONTATOS = ["WhatsApp", "Telefone"];

/**
 * Registra o lead no CRC antes de abrir o WhatsApp.
 *
 * POR QUE ANTES, E POR QUE SEM ESPERAR RESPOSTA
 * Antes, porque depois de `window.open` a aba perde o foco e uma requisição
 * pendente pode ser cancelada pelo navegador. Sem esperar, porque o lead é
 * nosso problema e a conversa é do visitante: se o servidor estiver fora, ele
 * ainda assim precisa conseguir falar com a clínica.
 *
 * `keepalive` é o que faz a requisição sobreviver à troca de contexto. Toda
 * falha é engolida de propósito: um erro nosso não pode virar mensagem de erro
 * para quem só queria marcar uma avaliação.
 */
function registrarLead(dados: {
  nome: string;
  telefone: string;
  assunto: string;
  contato: string;
  periodo: string;
  obs: string;
}): void {
  try {
    void fetch("/api/crc/lead", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        nome: dados.nome,
        // O TELEFONE É O QUE LIGA ESTE LEAD À CONVERSA que começa no WhatsApp
        // um segundo depois. Sem ele o registro é recusado (não há como
        // responder) e a campanha que trouxe a pessoa fica sem atribuição
        // nenhuma: a mensagem do WhatsApp chega sem utm e sem gclid.
        telefone: dados.telefone,
        mensagem: [
          `Assunto: ${dados.assunto}`,
          `Prefere contato por: ${dados.contato}`,
          `Melhor período: ${dados.periodo}`,
          dados.obs.trim().length > 0 ? `Mensagem: ${dados.obs.trim()}` : "",
        ]
          .filter((l) => l.length > 0)
          .join(" · "),
        // A URL COMPLETA, porque é ela que carrega utm_source, gclid e afins.
        // O `referer` diria de onde a pessoa veio, e não com qual campanha.
        url: typeof window === "undefined" ? "" : window.location.href,
        // O campo-armadilha vai vazio: humano não preenche o que não vê.
        empresa: "",
      }),
    }).catch(() => undefined);
  } catch {
    // Ver o cabeçalho: falha nossa não interrompe a conversa dele.
  }
}

export function ContactForm() {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
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
    if (!nome.trim() || !telefone.trim()) return;
    registrarLead({ nome: nome.trim(), telefone: telefone.trim(), assunto, contato, periodo, obs });
    window.open(whatsappLink(mensagem), "_blank", "noopener,noreferrer");
  };

  const input =
    "mt-2 w-full rounded-xl border border-forest/14 bg-white px-4 py-3.5 text-sm font-semibold text-forest-2 shadow-[inset_0_1px_0_rgba(255,255,255,.65)] transition focus:border-primary-ink placeholder:text-ink-soft";

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[2rem] border border-forest/10 bg-white p-5 shadow-[0_30px_90px_-48px_rgba(3,47,1,.48)] sm:p-7 lg:p-8"
    >
      <div className="flex items-start justify-between gap-5">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-primary/30 bg-white shadow-[0_4px_14px_rgba(3,47,1,.08)]">
              <Logo variante="simbolo" fundo="claro" altura={30} className="h-[30px] w-auto" />
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
        <label className="text-micro font-extrabold uppercase tracking-[.09em] text-ink-soft">
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

        <label className="text-micro font-extrabold uppercase tracking-[.09em] text-ink-soft">
          Telefone com DDD
          <div className="relative">
            <Phone className="pointer-events-none absolute left-4 top-[1.32rem] h-4 w-4 text-ink-soft" />
            <input
              required
              type="tel"
              inputMode="tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(11) 90000-0000"
              className={`${input} pl-10`}
            />
          </div>
        </label>

        <label className="text-micro font-extrabold uppercase tracking-[.09em] text-ink-soft">
          Melhor forma de contato
          <select value={contato} onChange={(e) => setContato(e.target.value)} className={input}>
            {CONTATOS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>

        <label className="text-micro font-extrabold uppercase tracking-[.09em] text-ink-soft">
          Assunto ou interesse
          <select value={assunto} onChange={(e) => setAssunto(e.target.value)} className={input}>
            <option>Avaliação geral</option>
            {TRATAMENTOS.map((t) => (
              <option key={t.titulo}>{t.titulo}</option>
            ))}
            <option>Outro assunto</option>
          </select>
        </label>

        <label className="text-micro font-extrabold uppercase tracking-[.09em] text-ink-soft">
          Melhor período
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={input}>
            {PERIODOS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>

        <label className="text-micro font-extrabold uppercase tracking-[.09em] text-ink-soft sm:col-span-2">
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

      <div className="mt-5 flex gap-3 rounded-2xl border border-forest/10 bg-[#F6F9F2] px-4 py-3.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-text" aria-hidden="true" />
        <p className="text-micro leading-5 text-ink-soft">
          Ao enviar, seus dados serão usados para responder ao contato, organizar sua avaliação e,
          quando houver parâmetros de campanha no endereço acessado, registrar a origem da
          solicitação. Evite inserir informações de saúde desnecessárias no campo de mensagem. Veja
          os detalhes na{" "}
          {/* Sem alvo de 44px aqui, e é o certo: a WCAG 2.5.8 abre exceção
              para link embutido numa frase, e esticar a caixa deste quebraria
              o parágrafo em que ele vive. O mesmo destino tem link próprio no
              rodapé, com área cheia, para quem precisa de alvo grande. */}
          <a
            href="/politica-de-privacidade"
            className="font-bold text-brand-text underline decoration-brand-text/35 underline-offset-2 transition hover:text-forest-2"
          >
            Política de Privacidade
          </a>
          .
        </p>
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
                <p className="text-micro font-extrabold text-forest-2">{String(title)}</p>
                <p className="mt-1 text-micro leading-relaxed text-ink-soft">{String(text)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </form>
  );
}
