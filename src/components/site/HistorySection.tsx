import { useId, useState } from "react";
import { CalendarDays, HeartPulse, MapPin, Minus, Plus, Quote, UsersRound } from "lucide-react";

import { CLINICA, FUNDADORA, GESTOR, HISTORIA, MISSAO, RESPONSAVEL_TECNICA } from "@/lib/jp";

/**
 * As duas pessoas à frente da clínica — as duas reais, as duas com o rótulo que
 * lhes cabe. O do gestor é o cargo; o dela vem com o CRO embaixo, porque é
 * dentista e o registro é o que o paciente precisa poder conferir.
 *
 * Ela não é redigitada aqui: sai de RESPONSAVEL_TECNICA, a mesma fonte que o
 * rodapé usa para a linha obrigatória. Nome e CRO dela aparecem em 9 rotas —
 * não podem existir em duas versões.
 */
const PESSOAS = [
  {
    nome: GESTOR.nome,
    legenda: GESTOR.papel,
    formacao: GESTOR.formacao,
    foto: GESTOR.foto,
    texto: GESTOR.texto,
  },
  {
    nome: RESPONSAVEL_TECNICA.nome,
    legenda: RESPONSAVEL_TECNICA.papel ?? "",
    registro: RESPONSAVEL_TECNICA.registro,
    formacao: FUNDADORA.formacao,
    foto: RESPONSAVEL_TECNICA.foto,
    titulo: FUNDADORA.titulo,
    texto: FUNDADORA.texto,
  },
];

/**
 * Uma pessoa do bloco: retrato, identificação e a apresentação dela.
 *
 * O primeiro parágrafo fica sempre visível e o resto abre no botão. As duas
 * apresentações somam doze parágrafos — inteiras e abertas, empurravam o fim da
 * seção para longe e transformavam o bloco numa parede de texto. Nada fica
 * escondido do buscador: o texto todo está no HTML servido, só recolhido.
 */
function CardPessoa({
  foto,
  nome,
  legenda,
  registro,
  formacao,
  titulo,
  texto,
}: {
  /** Sem foto, o card cai num marcador neutro e o layout continua íntegro —
   *  melhor que o ícone de imagem quebrada enquanto o retrato não chega. */
  foto?: string | undefined;
  nome: string;
  legenda: string;
  /** Só para quem é do conselho. */
  registro?: string | undefined;
  formacao: string;
  /** Só a apresentação da fundadora veio com um título próprio. */
  titulo?: string;
  texto: readonly string[];
}) {
  const [aberto, setAberto] = useState(false);
  const idPainel = useId();
  const [primeiro, ...resto] = texto;

  return (
    <article className="overflow-hidden rounded-[20px] border border-white/12 bg-[#032F01]/70">
      <div className="flex gap-4 p-4">
        <div className="relative h-[112px] w-[106px] shrink-0 overflow-hidden rounded-[14px] bg-border-soft">
          {foto ? (
            <img
              src={foto}
              alt={`Retrato de ${nome}`}
              loading="lazy"
              className="h-full w-full object-cover object-top"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-[#0A3A06]">
              <UsersRound size={26} className="text-lime" aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="font-display text-[19px] font-bold leading-tight text-white">{nome}</h4>
          <p className="mt-1.5 text-[11px] font-bold uppercase leading-[1.35] tracking-[0.06em] text-white/70">
            {legenda}
          </p>
          {registro && <p className="mt-1.5 text-[12px] text-lime">{registro}</p>}
          <p className="mt-1.5 text-[12px] leading-[1.4] text-white/55">{formacao}</p>
        </div>
      </div>

      <div className="border-t border-white/12 px-4 pb-4 pt-4">
        {titulo && (
          <p className="mb-3 font-display text-[16px] font-bold leading-[1.3] tracking-[-0.02em] text-white">
            {titulo}
          </p>
        )}

        <p className="text-[14px] leading-[1.65] text-white/75">{primeiro}</p>

        <div
          id={idPainel}
          className={`grid transition-all duration-500 ${
            aberto ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="space-y-3.5 pt-3.5 text-[14px] leading-[1.65] text-white/75">
              {resto.map((paragrafo) => (
                <p key={paragrafo.slice(0, 40)}>{paragrafo}</p>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-controls={idPainel}
          className="mt-4 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.1em] text-lime transition-colors hover:text-white"
        >
          {aberto ? "Mostrar menos" : "Ler a apresentação"}
          <span
            aria-hidden="true"
            className="grid h-6 w-6 place-items-center rounded-full border border-lime/60"
          >
            {aberto ? <Minus size={13} strokeWidth={2.4} /> : <Plus size={13} strokeWidth={2.4} />}
          </span>
        </button>
      </div>
    </article>
  );
}

function Metrica({
  icon,
  title,
  text,
  border = false,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  text: string;
  border?: boolean;
}) {
  return (
    <div
      className={`relative flex min-h-[120px] items-start gap-4 px-5 py-5 ${
        border ? "sm:border-l sm:border-white/15" : ""
      }`}
    >
      <span
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-lime text-brand-deep shadow-[0_10px_25px_rgba(86,168,5,.16)]"
      >
        {icon}
      </span>
      <div>
        <p className="font-display text-[13px] font-bold leading-[1.25] text-white">{title}</p>
        <p className="mt-2 text-[11px] leading-[1.5] text-white/65">{text}</p>
      </div>
    </div>
  );
}

/** A maçã é motivo da marca da JP. Em SVG para ficar nítida em qualquer tamanho. */
function MacaContorno() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute right-[1%] top-[4%] h-[360px] w-[360px] text-lime opacity-[0.12] lg:h-[470px] lg:w-[470px]"
      viewBox="0 0 400 400"
      fill="none"
    >
      <path
        d="M235 67C257 34 292 27 318 32C307 64 279 84 243 85"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M234 104C233 78 239 57 252 39"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d="M204 107C171 83 116 87 82 123C46 162 51 221 73 273C96 327 130 355 165 344C186 337 194 330 206 330C218 330 226 337 247 344C283 355 317 326 340 272C363 218 366 160 328 123C294 89 239 84 204 107Z"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HistorySection() {
  return (
    <section id="historia" className="jp-section relative overflow-hidden bg-brand-deep text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_23%_12%,rgba(86,168,5,.18),transparent_27%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_48%,rgba(9,89,2,.22),transparent_35%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-250px] right-[-150px] h-[650px] w-[650px] rounded-full bg-lime/[0.04] blur-[100px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[260px] top-[20px] h-[600px] w-[600px] rounded-full border border-lime/25"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[370px] top-[110px] h-[750px] w-[750px] rounded-full border border-lime/15"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[470px] right-[10%] h-[700px] w-[900px] rounded-[50%] border border-lime/15"
      />

      <MacaContorno />

      <div className="jp-container relative">
        <div className="grid gap-14 lg:grid-cols-[0.96fr_1.04fr] lg:items-center lg:gap-16">
          {/* COLUNA ESQUERDA */}
          <div>
            <p className="mb-6 text-[12px] font-bold uppercase tracking-[0.18em] text-lime">
              Nossa história
            </p>

            {/* "de Pirituba à Freguesia do Ó" e não "da Freguesia do Ó": a
                clínica só está neste endereço desde 2024, e os 24 anos são dos
                dois bairros. O trajeto vira a própria chamada. */}
            <h2 className="max-w-[650px] font-display text-[40px] font-extrabold leading-[1.02] tracking-[-0.055em] sm:text-[62px] lg:text-[72px]">
              São <span className="text-lime">{HISTORIA.anos} anos</span>
              <br />
              cuidando dos sorrisos
              <br />
              de {HISTORIA.regiaoAnterior} à {HISTORIA.regiaoAtual}.
            </h2>

            <svg aria-hidden="true" className="mt-4 h-4 w-[100px]" viewBox="0 0 100 16" fill="none">
              <path
                d="M3 5C25 15 53 15 96 4"
                stroke="#56A805"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>

            <div className="mt-7 max-w-[625px] space-y-5 text-[16px] leading-[1.65] text-white/80">
              <p>
                A <strong className="font-semibold text-lime">{CLINICA.nome}</strong> acompanha
                gerações de pacientes com o mesmo compromisso: escutar com atenção, orientar com
                clareza e cuidar com responsabilidade.
              </p>
              <p>
                Ao longo de {HISTORIA.anos} anos, construímos uma história de confiança, proximidade
                e atendimento humanizado para crianças, adultos e idosos.
              </p>
              {/* O trajeto escrito por extenso: sem isso, a chamada acima levanta
                  a pergunta e a página não responde. */}
              <p>
                Boa parte dessa caminhada foi em {HISTORIA.regiaoAnterior}, na{" "}
                {HISTORIA.bairroAnterior}. Desde {HISTORIA.mudanca} atendemos na{" "}
                {CLINICA.local.bairro}, na região da {HISTORIA.regiaoAtual} — mesmo cuidado, novo
                endereço.
              </p>
            </div>

            {/* MISSÃO — texto real, transcrito do quadro na parede da clínica */}
            <figure className="mt-8 max-w-[625px] rounded-[24px] border border-white/20 bg-white/[0.025] p-6 backdrop-blur-sm sm:p-7">
              <div className="flex gap-5">
                <Quote
                  size={50}
                  strokeWidth={0}
                  fill="#56A805"
                  aria-hidden="true"
                  className="mt-1 shrink-0 text-lime"
                />
                <div>
                  <blockquote className="text-[17px] leading-[1.55] text-white/90">
                    {MISSAO}
                  </blockquote>
                  <figcaption className="mt-5 text-[11px] font-bold uppercase tracking-[0.17em] text-lime">
                    {CLINICA.nome}
                  </figcaption>
                </div>
              </div>
            </figure>

            <div className="mt-5 grid max-w-[730px] overflow-hidden rounded-[23px] border border-white/20 bg-white/[0.025] backdrop-blur-sm sm:grid-cols-3">
              <Metrica
                icon={<CalendarDays size={24} />}
                title={`Desde ${HISTORIA.fundacao}`}
                text="Uma trajetória sólida de cuidado e confiança."
              />
              <Metrica
                icon={<HeartPulse size={24} />}
                title={`${HISTORIA.anos} anos de história`}
                text="Crescendo junto com a nossa comunidade."
                border
              />
              <Metrica
                icon={<MapPin size={24} />}
                title={
                  <>
                    Vila Bruna
                    <br />
                    Freguesia do Ó
                  </>
                }
                text="Nosso lar, nossa inspiração."
                border
              />
            </div>
          </div>

          {/* COLUNA DIREITA */}
          <div>
            <div className="relative overflow-hidden rounded-[30px] border border-white/20 bg-white/[0.045] p-5 shadow-[0_35px_90px_rgba(0,0,0,.18)] backdrop-blur-md sm:p-8">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-[30%] top-0 h-[300px] w-[350px] bg-lime/[0.045] blur-[80px]"
              />

              <div className="relative">
                <div className="mb-4 flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-lime/30 text-lime"
                  >
                    <UsersRound size={22} />
                  </span>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-lime">
                    Quem faz essa história
                  </p>
                </div>

                {/* "Gestão e fundação" cobre os dois sem generalizar: fundação
                    é ela, gestão é ele. "Nossos fundadores", como era antes,
                    diria por ele algo que a apresentação dele não diz. */}
                <h3 className="font-display text-[30px] font-bold tracking-[-0.035em] text-white">
                  Gestão e fundação
                </h3>

                <div aria-hidden="true" className="mt-3 h-[3px] w-12 rounded-full bg-lime" />

                <p className="mt-5 max-w-[430px] text-[14px] leading-6 text-white/75">
                  Pessoas que acreditam no poder do cuidado e nas relações de confiança.
                </p>

                {/* Um bloco por pessoa: retrato, identificação e a apresentação
                    dela, tudo junto. Antes eram dois cards no topo e as duas
                    apresentações embaixo, e quem lia tinha de guardar de cabeça
                    qual texto era de quem. */}
                <div className="mt-6 space-y-3">
                  {PESSOAS.map((p) => (
                    <CardPessoa key={p.nome} {...p} />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-5 rounded-[23px] bg-paper px-6 py-5 text-ink shadow-[0_20px_50px_rgba(0,0,0,.12)]">
              <span
                aria-hidden="true"
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#56A805] text-white"
              >
                <HeartPulse size={28} />
              </span>
              <p className="text-[13px] leading-[1.6] text-ink-soft">
                Cada sorriso que cuidamos carrega nossa história, nossa dedicação e o propósito que
                nos move todos os dias:{" "}
                <strong className="font-semibold text-brand-text">
                  ver você sorrir com saúde, confiança e bem-estar.
                </strong>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
