import { ArrowUpRight, Check, CreditCard, ShieldCheck } from "lucide-react";

import { CLINICA, CONVENIOS, CONVENIOS_POR_EXTENSO, PAGAMENTO, type Convenio } from "@/lib/jp";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";

/**
 * Os logos que existirem em `src/assets/convenios/`.
 *
 * `import.meta.glob` e não uma lista de `import`: a pasta está vazia hoje e vai
 * sendo preenchida conforme cada operadora mandar o kit de marca do credenciado.
 * Com imports fixos, cada arquivo novo exigiria mexer neste componente — e um
 * import apontando para arquivo inexistente quebra o build inteiro, o que
 * transformaria "ainda não recebemos o logo da Porto Seguro" numa página fora
 * do ar.
 *
 * Com o glob, a pasta vazia resolve para `{}` e a seção desenha as placas
 * tipográficas. Arquivo novo aparece sozinho. Ver `LEIA-ME.md` na pasta.
 */
const LOGOS = import.meta.glob("../../assets/convenios/*.{svg,png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** `../../assets/convenios/sulamerica.svg` → `sulamerica`. */
function logoDe(slug: string): string | undefined {
  for (const [caminho, url] of Object.entries(LOGOS)) {
    const arquivo = caminho.split("/").pop() ?? "";
    if (arquivo.replace(/\.[^.]+$/, "") === slug) return url;
  }
  return undefined;
}

/**
 * Uma placa da faixa.
 *
 * Branca sempre, com ou sem arquivo. Não é decoração: logo de operadora vem em
 * versão colorida, e cor de marca sobre o verde escuro da seção some ou briga.
 * A placa branca é o fundo neutro que faz qualquer uma delas funcionar — e, sem
 * arquivo, é a mesma placa com o nome em tipografia, então a faixa não muda de
 * desenho conforme os logos forem chegando.
 */
function Placa({ convenio, copia = false }: { convenio: Convenio; copia?: boolean }) {
  const logo = logoDe(convenio.slug);

  return (
    <li className={`flex shrink-0 items-center px-3 sm:px-4 ${copia ? "marquee-copia" : ""}`}>
      <div className="flex h-[76px] min-w-[186px] items-center justify-center rounded-2xl border border-white/10 bg-white px-7 shadow-[0_18px_45px_-28px_rgba(0,0,0,.9)] transition-transform duration-500 hover:-translate-y-1">
        {logo === undefined ? (
          <span className="whitespace-nowrap font-display text-[19px] font-extrabold tracking-[-0.035em] text-forest-2 sm:text-[21px]">
            {convenio.nome}
          </span>
        ) : (
          <img
            src={logo}
            alt={convenio.nome}
            loading="lazy"
            className="h-9 w-auto max-w-[170px] object-contain"
          />
        )}
      </div>
    </li>
  );
}

/**
 * A faixa que desliza.
 *
 * Duas cópias da mesma lista, e não uma: a animação translada -50%, então o
 * segundo conjunto é o que ocupa o espaço que o primeiro deixou e faz a volta
 * parecer contínua. Se um dia a lista mudar de tamanho, isso continua valendo —
 * o que não pode é ter três cópias, ou uma.
 *
 * As duas são `aria-hidden`: para quem usa leitor de tela, uma faixa que se
 * repete é a mesma informação duas vezes, e nenhuma delas chega em ordem útil.
 * A lista de verdade fica logo abaixo, em `sr-only`.
 */
function Faixa() {
  return (
    <div
      className="marquee relative mt-14 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_5%,#000_95%,transparent)] [-webkit-mask-image:linear-gradient(90deg,transparent,#000_5%,#000_95%,transparent)]"
      /* O hover pausa (regra em styles.css). `group` não serve: a pausa vale
         para o trilho inteiro, não para a placa sob o cursor. */
    >
      <ul className="marquee-track items-center" aria-hidden="true">
        {CONVENIOS.map((c) => (
          <Placa key={c.slug} convenio={c} />
        ))}
        {/* A segunda cópia existe só para a volta parecer contínua. Quem pediu
            menos movimento não tem volta nenhuma, e ver os mesmos seis nomes
            duas vezes seria ruído: `.marquee-copia` some nesse caso. */}
        {CONVENIOS.map((c) => (
          <Placa key={`${c.slug}-copia`} convenio={c} copia />
        ))}
      </ul>
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
      {/* O BRILHO FICA EMBAIXO, e isso é acessibilidade, não gosto.

          Ele começou no topo à esquerda, exatamente sob o rótulo "CONVÊNIOS E
          PAGAMENTO". Um brilho limão a 7% clareia o verde profundo de #032f01
          para #093701 — e o contraste do rótulo, que é limão sobre esse fundo,
          cai de 4,96:1 para 4,49:1. Reprova a WCAG AA por um centésimo, e o axe
          pega (varredura em 15/09/2026).

          Mudar de lado não resolve: num celular de 375px, um círculo de 520px
          com 130px de desfoque cobre a largura inteira, esteja ele à esquerda ou
          à direita. O que resolve é tirá-lo da ALTURA do texto. Aqui embaixo ele
          ilumina a faixa de placas, que é branca e não depende do fundo. */}
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
              A JP é credenciada em {CONVENIOS.length} convênios odontológicos. A cobertura de cada
              procedimento depende do seu plano — a recepção confere para você antes da consulta.
            </p>
          </div>

          {/* PARTICULAR — o outro caminho, do mesmo tamanho.
              Quem não tem plano chega nesta seção e precisa da resposta dela na
              mesma tela, senão a seção inteira diz "não é para você". */}
          <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-6 backdrop-blur-sm sm:p-7">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-lime/15 text-lime">
              <CreditCard className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-5 font-display text-xl font-extrabold leading-tight">
              Sem convênio? Também atendemos particular.
            </p>
            {/* Lista, e não frase corrida: os itens são nomes próprios de forma de
                pagamento e ficavam com maiúscula no meio de uma enumeração. A
                FAQ, onde eles entram mesmo dentro de uma frase, minúsculas. */}
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

      {/* A lista que o leitor de tela lê, uma vez e em ordem. A faixa acima é
          decoração de uma informação que precisa existir em texto. */}
      <ul className="sr-only">
        {CONVENIOS.map((c) => (
          <li key={c.slug}>{c.nome}</li>
        ))}
      </ul>

      <div className="jp-container relative">
        <p className="mt-12 flex max-w-3xl items-start gap-3 text-xs font-semibold leading-relaxed text-white/55">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
          <span>
            Credenciamentos e coberturas podem mudar. Confirme o seu plano com a recepção pelo
            WhatsApp {CLINICA.whatsapp} antes de agendar. Convênios atendidos hoje:{" "}
            {CONVENIOS_POR_EXTENSO}.
          </span>
        </p>
      </div>
    </section>
  );
}
