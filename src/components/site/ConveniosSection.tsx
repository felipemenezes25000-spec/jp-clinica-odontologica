import { ArrowUpRight, Check, CreditCard, ShieldCheck } from "lucide-react";

import { CLINICA, CONVENIOS, PAGAMENTO, type Convenio } from "@/lib/jp";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import "./convenios-ticker.css";

/**
 * O ticker publica os convênios confirmados pela clínica e os dois acrescentados
 * em 16/09/2026. Mantemos a extensão aqui porque, por enquanto, a mudança é
 * exclusivamente da faixa/site e não deve alterar dados do CRC sem a mesma
 * confirmação operacional.
 */
const CONVENIOS_TICKER: Convenio[] = [
  ...CONVENIOS,
  { nome: "Sempre Odonto", slug: "sempre-odonto" },
  { nome: "Odonto Empresas", slug: "odonto-empresas" },
];

function porExtenso(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`;
}

const CONVENIOS_POR_EXTENSO_TICKER = porExtenso(CONVENIOS_TICKER.map((c) => c.nome));

/**
 * Logos locais continuam tendo prioridade. Assim que um kit oficial for salvo
 * em `src/assets/convenios/<slug>.svg|png|webp`, ele substitui automaticamente
 * a referência remota abaixo sem exigir outra alteração no componente.
 */
const LOGOS = import.meta.glob("../../assets/convenios/*.{svg,png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/**
 * Referências visuais das marcas usadas enquanto os kits oficiais dos
 * credenciados não estão versionados no projeto.
 *
 * A Brazil Dental é uma exceção visual: a arte oficial pública disponível no
 * próprio domínio da marca é a versão branca. Em vez de usar aquele PNG de
 * terceiros com uma caixa cinza embutida, a placa dela usa o verde profundo da
 * própria JP e exibe o SVG branco oficial sem adulterar a marca.
 */
const LOGOS_REMOTOS: Partial<Record<string, string>> = {
  sulamerica:
    "https://raw.githubusercontent.com/codev-desenvolvesoftware/dentista-site/main/public/convenios/sulamerica.png",
  "porto-seguro":
    "https://raw.githubusercontent.com/codev-desenvolvesoftware/dentista-site/main/public/convenios/porto.png",
  bradesco:
    "https://raw.githubusercontent.com/codev-desenvolvesoftware/dentista-site/main/public/convenios/bradesco.png",
  odontoprev:
    "https://raw.githubusercontent.com/codev-desenvolvesoftware/dentista-site/main/public/convenios/odontoprev.png",
  "dental-par":
    "https://raw.githubusercontent.com/codev-desenvolvesoftware/dentista-site/main/public/convenios/dentalpar.png",
  "rede-brazil-dental":
    "https://irp.cdn-website.com/c19ccd43/dms3rep/multi/LOgo%2BBD%2BBranco.svg",
  "sempre-odonto":
    "https://raw.githubusercontent.com/MezonTech/radiodent-website/main/public/images/convenios/sempre-odonto.png",
  "odonto-empresas": "https://www.seu-convenio.com/images/operadoras/310981-v.png",
};

/** `../../assets/convenios/sulamerica.svg` → `sulamerica`. */
function logoLocalDe(slug: string): string | undefined {
  for (const [caminho, url] of Object.entries(LOGOS)) {
    const arquivo = caminho.split("/").pop() ?? "";
    if (arquivo.replace(/\.[^.]+$/, "") === slug) return url;
  }
  return undefined;
}

function logoDe(slug: string): string | undefined {
  return logoLocalDe(slug) ?? LOGOS_REMOTOS[slug];
}

/**
 * Cada marca fica numa placa neutra. A Brazil Dental usa a versão branca oficial
 * e, por isso, recebe uma placa verde profunda da paleta JP. As demais continuam
 * em placa branca, preservando o contraste das artes coloridas.
 */
function Placa({ convenio }: { convenio: Convenio }) {
  const logo = logoDe(convenio.slug);
  const brazilDental = convenio.slug === "rede-brazil-dental";

  return (
    <li className="shrink-0">
      <div
        className="convenios-logo-card"
        style={
          brazilDental
            ? {
                background: "linear-gradient(135deg, #095902 0%, #032F01 100%)",
                borderColor: "rgba(86, 168, 5, 0.38)",
              }
            : undefined
        }
      >
        <span
          className="convenios-logo-fallback"
          style={brazilDental ? { color: "white" } : undefined}
        >
          {convenio.nome}
        </span>
        {logo !== undefined && (
          <img
            src={logo}
            alt={convenio.nome}
            loading="lazy"
            decoding="async"
            className={`convenios-logo relative z-[1] ${brazilDental ? "" : "bg-white"}`}
            style={
              brazilDental
                ? {
                    background: "transparent",
                    boxShadow: "none",
                    maxWidth: "86%",
                    maxHeight: "3.9rem",
                  }
                : undefined
            }
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        )}
      </div>
    </li>
  );
}

/**
 * Duas cópias idênticas fazem a volta contínua. A segunda é puramente visual e
 * some para quem pediu menos movimento; a lista semântica aparece uma vez logo
 * abaixo da faixa.
 */
function Faixa() {
  return (
    <div className="convenios-ticker" aria-label="Convênios odontológicos atendidos">
      <div className="convenios-ticker-viewport">
        <div className="convenios-ticker-track" aria-hidden="true">
          <ul className="convenios-ticker-group">
            {CONVENIOS_TICKER.map((c) => (
              <Placa key={c.slug} convenio={c} />
            ))}
          </ul>
          <ul className="convenios-ticker-group" aria-hidden="true">
            {CONVENIOS_TICKER.map((c) => (
              <Placa key={`${c.slug}-copia`} convenio={c} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function ConveniosSection() {
  const wa = useContatoWhatsApp("duvida", "convênios");

  return (
    <section
      id="convenios"
      className="jp-section relative isolate overflow-hidden bg-brand-deep text-white"
    >
      {/* O brilho permanece abaixo da área textual para preservar o contraste
          do eyebrow lime sobre brand-deep, conforme a decisão de acessibilidade
          já registrada no projeto. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-36 bottom-[-150px] h-[520px] w-[520px] rounded-full bg-lime/[0.08] blur-[130px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-52 bottom-[-180px] h-[620px] w-[620px] rounded-full border border-lime/12"
      />

      <div className="jp-container relative">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_.95fr] lg:items-end">
          <div>
            <span className="eyebrow text-lime">Convênios e pagamento</span>
            <h2 className="mt-6 max-w-3xl font-display text-[clamp(2.9rem,6vw,5.4rem)] font-extrabold leading-[.92] tracking-[-.055em]">
              O seu plano <span className="text-lime">provavelmente</span> está aqui.
            </h2>
            <p className="mt-6 max-w-xl text-base font-medium leading-relaxed text-white/70">
              A JP é credenciada em {CONVENIOS_TICKER.length} convênios odontológicos. A cobertura
              de cada procedimento depende do seu plano — a recepção confere para você antes da
              consulta.
            </p>
          </div>

          <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-6 backdrop-blur-sm sm:p-7">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-lime/15 text-lime">
              <CreditCard className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-5 font-display text-xl font-extrabold leading-tight">
              Sem convênio? Também atendemos particular.
            </p>
            <ul className="mt-4 space-y-2">
              {PAGAMENTO.formas.map((forma) => (
                <li key={forma} className="flex items-start gap-2.5 text-sm text-white/72">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
                  {forma}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm leading-relaxed text-white/60">
              {PAGAMENTO.publicarCondicoes ? `${PAGAMENTO.condicoes} ` : ""}As condições são
              apresentadas junto com o plano de tratamento, depois da avaliação.
            </p>
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-11 mt-6 inline-flex items-center gap-2 rounded-full bg-lime px-5 py-3 text-xs font-extrabold text-brand-deep transition hover:-translate-y-0.5"
            >
              Conferir meu plano no WhatsApp
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>

      <Faixa />

      <ul className="sr-only">
        {CONVENIOS_TICKER.map((c) => (
          <li key={c.slug}>{c.nome}</li>
        ))}
      </ul>

      <div className="jp-container relative">
        <p className="mt-12 flex max-w-3xl items-start gap-3 text-xs font-semibold leading-relaxed text-white/55">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
          <span>
            Credenciamentos e coberturas podem mudar. Confirme o seu plano com a recepção pelo
            WhatsApp {CLINICA.whatsapp} antes de agendar. Convênios atendidos hoje:{" "}
            {CONVENIOS_POR_EXTENSO_TICKER}.
          </span>
        </p>
      </div>
    </section>
  );
}
