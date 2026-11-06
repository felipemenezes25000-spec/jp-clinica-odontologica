import { useEffect, useRef, type ReactNode } from "react";

import { BotaoWhatsApp } from "@/components/site/lp/BotaoWhatsApp";
import type { Foto } from "@/components/site/lp/Topo";
import { FormaCoroa, MarcaCoroa, MolduraCoroa } from "@/components/site/sistema/Coroa";
import { comGsap } from "@/components/site/sistema/gsap";
import { TreatmentVideo } from "@/components/site/TreatmentVideo";
import { AVALIACOES, CLINICA, HISTORIA, RESPONSAVEL_TECNICA, notaBR } from "@/lib/jp";
import "./lp.css";

/*
 * As seções das landings pagas. Cada uma tem UMA composição, e duas páginas
 * nunca repetem a mesma composição em seções vizinhas:
 *
 *   Escada ...... três pontos descendo em diagonal, a foto no vão embaixo;
 *   Linhas ...... assunto à esquerda de cada afirmação, texto na coluna 8;
 *   SecaoVideo .. campo escuro, a animação dentro da coroa;
 *   Etapas ...... foto de um lado, lista ordenada do outro;
 *   Confianca ... campo escuro, citação que acende com a rolagem, números que
 *                 rolam e o retrato da responsável técnica, com nome e registro;
 *   Endereco .... o caminho até a porta, foto;
 *   Perguntas ... título grudado, acordeão de ladrilhos;
 *   Fechamento .. o último convite, campo verde da marca, coroa gigante que
 *                 cresce com a rolagem, arcada de coroas.
 *
 * Fotos: nenhuma se repete na mesma página, e a cadeira do consultório vale uma
 * vez só (no topo). As demais cenas são o equipamento, a esterilização, a
 * fachada e a equipe.
 *
 * Regras que valem para todas: o `id` da seção é a origem do lead (nenhum
 * elemento com `id` entre a seção e o botão), o título de seção é um h2 curto
 * (no máximo duas linhas em 390px) e o texto fala de avaliação, nunca de
 * resultado, preço ou prazo.
 */

type Ponto = { titulo: string; texto: string };

function Titulo({
  id,
  children,
  className = "",
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2 id={`${id}-titulo`} className={`text-titulo ${className}`} data-linhas>
      {children}
    </h2>
  );
}

function ItemComMarca({ children }: { children: ReactNode }) {
  return (
    <li className="lp-item-marca">
      <MarcaCoroa className="text-acento" />
      <span>{children}</span>
    </li>
  );
}

/**
 * Três pontos descendo em diagonal: o olhar desce junto com a decisão. A foto
 * em coroa ocupa o vão da diagonal embaixo, e o botão fecha o vão da direita.
 */
export function Escada({
  id,
  titulo,
  intro,
  pontos,
  foto,
  rotulo,
  href,
}: {
  id: string;
  titulo: string;
  intro: string;
  pontos: readonly Ponto[];
  foto: Foto;
  rotulo: string;
  href: string;
}) {
  return (
    <section id={id} className="secao-curta" aria-labelledby={`${id}-titulo`}>
      <div className="quadro">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <Titulo id={id} className="lg:col-span-7">
            {titulo}
          </Titulo>
          <p className="text-corpo text-tinta-suave lg:col-span-5 lg:col-start-8">{intro}</p>
        </div>

        <div className="lp-escada">
          <ol className="lp-degraus" data-entra>
            {pontos.map((ponto) => (
              <li key={ponto.titulo} data-item>
                <h3 className="text-frase">
                  <MarcaCoroa className="mr-3 text-acento" />
                  {ponto.titulo}
                </h3>
                <p className="mt-4 text-corpo text-tinta-suave">{ponto.texto}</p>
              </li>
            ))}
          </ol>

          <div className="lp-escada-foto lp-foto" data-obturador>
            <MolduraCoroa medir proporcao={2} className="lp-escada-moldura">
              <img
                src={foto.src}
                width={foto.largura}
                height={foto.altura}
                alt={foto.alt}
                style={foto.posicao ? { objectPosition: foto.posicao } : undefined}
                loading="lazy"
              />
            </MolduraCoroa>
          </div>

          <div className="lp-escada-acao">
            <BotaoWhatsApp href={href}>{rotulo}</BotaoWhatsApp>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Afirmações em linhas: o assunto à esquerda, a explicação à direita. */
export function Linhas({
  id,
  titulo,
  intro,
  itens,
  fundo = "",
}: {
  id: string;
  titulo: string;
  intro: string;
  itens: readonly Ponto[];
  fundo?: string;
}) {
  return (
    <section id={id} className={`secao-curta ${fundo}`} aria-labelledby={`${id}-titulo`}>
      <div className="quadro">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <Titulo id={id} className="lg:col-span-7">
            {titulo}
          </Titulo>
          <p className="text-corpo text-tinta-suave lg:col-span-5 lg:col-start-8">{intro}</p>
        </div>

        <ul className="lp-linhas" data-entra>
          {itens.map((item) => (
            <li key={item.titulo} data-item>
              <h3 className="text-frase">
                <MarcaCoroa className="mr-3 text-acento" />
                {item.titulo}
              </h3>
              <p className="text-corpo text-tinta-suave">{item.texto}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * A animação explicativa dentro da coroa, em campo escuro.
 *
 * O texto "animação ilustrativa" e a frase sobre a avaliação ficam num único
 * parágrafo (`legenda`): o E2E procura os dois como um elemento só, e é também
 * o que o CFO pede — a ilustração não pode parecer o procedimento do paciente.
 */
export function SecaoVideo({
  id,
  titulo,
  texto,
  itens,
  video,
  legenda,
  rotulo,
  href,
  invertido = false,
}: {
  id: string;
  titulo: string;
  texto: string;
  itens: readonly string[];
  video: { src: string; poster: string; descricao: string };
  legenda: string;
  rotulo: string;
  href: string;
  invertido?: boolean;
}) {
  return (
    <section id={id} className="campo-escuro secao-curta" aria-labelledby={`${id}-titulo`}>
      <div
        className={`quadro grid items-center gap-12 lg:grid-cols-2 lg:gap-[clamp(3rem,7vw,8rem)] ${
          invertido ? "lg:[&>*:first-child]:order-2" : ""
        }`}
      >
        {/* O obturador anima o `clip-path` do elemento que o carrega: ele fica num
            invólucro, e a coroa (que também é `clip-path`) não é sobrescrita. */}
        <div className="lp-animacao" data-obturador>
          <TreatmentVideo
            src={video.src}
            poster={video.poster}
            descricao={video.descricao}
            proporcao={1}
            legenda={false}
          />
        </div>

        <div data-entra>
          <Titulo id={id}>{titulo}</Titulo>
          <p className="mt-6 max-w-[48ch] text-corpo text-sobre-campo-suave" data-item>
            {texto}
          </p>
          <ul className="lp-itens mt-8" data-item>
            {itens.map((item) => (
              <ItemComMarca key={item}>{item}</ItemComMarca>
            ))}
          </ul>
          <div className="mt-10" data-item>
            <BotaoWhatsApp href={href}>{rotulo}</BotaoWhatsApp>
          </div>
          <p className="mt-6 max-w-[48ch] text-pequeno text-sobre-campo-suave" data-item>
            {legenda}
          </p>
        </div>
      </div>
    </section>
  );
}

/** Foto de um lado, lista ordenada do outro. */
export function Etapas({
  id,
  titulo,
  texto,
  etapas,
  foto,
  invertido = false,
}: {
  id: string;
  titulo: string;
  texto: string;
  etapas: readonly Ponto[];
  foto: Foto;
  invertido?: boolean;
}) {
  return (
    <section id={id} className="secao-curta bg-chao-2" aria-labelledby={`${id}-titulo`}>
      <div className="quadro grid items-start gap-12 lg:grid-cols-12 lg:gap-[clamp(3rem,6vw,7rem)]">
        <div
          className={`lg:sticky lg:top-[calc(var(--altura-cabecalho)+2rem)] lg:col-span-5 ${
            invertido ? "lg:col-start-8" : "lg:col-start-1"
          }`}
        >
          <div className="lp-foto" data-obturador>
            <MolduraCoroa proporcao={0.82}>
              <img
                src={foto.src}
                width={foto.largura}
                height={foto.altura}
                alt={foto.alt}
                style={foto.posicao ? { objectPosition: foto.posicao } : undefined}
                loading="lazy"
              />
            </MolduraCoroa>
          </div>
        </div>

        <div
          className={`lg:col-span-6 lg:row-start-1 ${invertido ? "lg:col-start-1" : "lg:col-start-7"}`}
        >
          <Titulo id={id}>{titulo}</Titulo>
          <p className="mt-6 max-w-[48ch] text-corpo text-tinta-suave">{texto}</p>

          <ol className="lp-etapas" data-entra>
            {etapas.map((etapa) => (
              <li key={etapa.titulo} data-item>
                <MarcaCoroa className="text-acento" />
                <div>
                  <h3 className="text-frase">{etapa.titulo}</h3>
                  <p className="mt-2 max-w-[52ch] text-corpo text-tinta-suave">{etapa.texto}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

type Depoimento = { autor: string; texto: string };

/**
 * A prova social: o que a pessoa leu no Google, o tempo da clínica e quem
 * responde tecnicamente por ela, com nome e registro (Res. CFO 196/2019). Os
 * números e a responsável são os de `jp.ts` — nada é escrito à mão aqui — e o
 * depoimento é um dos reais da ficha.
 *
 * A citação é a frase de assinatura da página (`data-tinta`, uma por página):
 * acende palavra por palavra com a rolagem. Por isso é o texto inteiro dentro
 * de um único `<p>`, sem marcação interna que o SplitText quebraria.
 */
export function Confianca({
  id,
  titulo,
  texto,
  principal,
  invertido = false,
}: {
  id: string;
  titulo: string;
  texto: string;
  principal: Depoimento;
  invertido?: boolean;
}) {
  return (
    <section id={id} className="campo-escuro secao-curta" aria-labelledby={`${id}-titulo`}>
      <div className="quadro grid gap-12 lg:grid-cols-12 lg:items-stretch lg:gap-[clamp(3rem,6vw,7rem)]">
        <div
          className={`flex flex-col justify-between gap-12 lg:col-span-7 lg:row-start-1 ${
            invertido ? "lg:col-start-6" : "lg:col-start-1"
          }`}
        >
          <div>
            <Titulo id={id}>{titulo}</Titulo>
            <p className="mt-6 max-w-[52ch] text-corpo text-sobre-campo-suave">{texto}</p>

            <figure className="mt-12">
              <blockquote>
                <p className="text-frase" data-tinta>
                  “{principal.texto}”
                </p>
              </blockquote>
              <figcaption className="mt-4 text-pequeno text-sobre-campo-suave">
                {principal.autor}, avaliação no Google
              </figcaption>
            </figure>
          </div>

          <dl className="lp-numeros" data-entra>
            <div data-item>
              <dt>anos de clínica</dt>
              <dd data-numero={String(HISTORIA.anos)}>{HISTORIA.anos}</dd>
            </div>
            <div data-item>
              <dt>avaliações no Google, nota {notaBR}</dt>
              <dd data-numero={String(AVALIACOES.total)}>{AVALIACOES.total}</dd>
            </div>
          </dl>
        </div>

        <figure
          className={`lp-foto lg:col-span-5 lg:row-start-1 ${
            invertido ? "lg:col-start-1" : "lg:col-start-8"
          }`}
        >
          <MolduraCoroa proporcao={0.82}>
            <img
              src={RESPONSAVEL_TECNICA.foto}
              width={560}
              height={683}
              alt={`Retrato de ${RESPONSAVEL_TECNICA.nome}, responsável técnica da JP Clínica Odontológica`}
              loading="lazy"
            />
          </MolduraCoroa>
          <figcaption className="lp-retrato">
            <span className="text-corpo font-semibold">{RESPONSAVEL_TECNICA.nome}</span>
            <span className="text-pequeno text-sobre-campo-suave">
              {RESPONSAVEL_TECNICA.registro} · {RESPONSAVEL_TECNICA.papel}
            </span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

/** O caminho até a porta: endereço, horário e a fachada. */
export function Endereco({
  id,
  titulo,
  foto,
  rotulo,
  href,
  invertido = false,
}: {
  id: string;
  titulo: string;
  foto: Foto;
  rotulo: string;
  href: string;
  invertido?: boolean;
}) {
  return (
    <section id={id} className="secao-curta" aria-labelledby={`${id}-titulo`}>
      <div className="quadro grid items-center gap-12 lg:grid-cols-12 lg:gap-[clamp(3rem,6vw,7rem)]">
        <div
          className={`lg:col-span-6 lg:row-start-1 ${invertido ? "lg:col-start-7" : "lg:col-start-1"}`}
          data-entra
        >
          <Titulo id={id}>{titulo}</Titulo>
          <p className="mt-6 max-w-[40ch] text-frase" data-item>
            {CLINICA.endereco}
          </p>
          <ul className="lp-itens mt-8" data-item>
            <ItemComMarca>{CLINICA.bairro}</ItemComMarca>
            <ItemComMarca>{CLINICA.horario}</ItemComMarca>
          </ul>
          <div className="mt-10" data-item>
            <BotaoWhatsApp href={href}>{rotulo}</BotaoWhatsApp>
          </div>
        </div>

        <div
          className={`lg:col-span-5 lg:row-start-1 ${invertido ? "lg:col-start-1" : "lg:col-start-8"}`}
        >
          <div className="lp-foto" data-obturador>
            <MolduraCoroa proporcao={0.78}>
              <img
                src={foto.src}
                width={foto.largura}
                height={foto.altura}
                alt={foto.alt}
                style={foto.posicao ? { objectPosition: foto.posicao } : undefined}
                loading="lazy"
              />
            </MolduraCoroa>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Título grudado à esquerda, acordeão de ladrilhos à direita (<details name>). */
export function Perguntas({
  id,
  titulo,
  texto,
  itens,
}: {
  id: string;
  titulo: string;
  texto: string;
  itens: readonly { pergunta: string; resposta: string }[];
}) {
  return (
    <section id={id} className="secao-curta" aria-labelledby={`${id}-titulo`}>
      <div className="quadro grid gap-10 lg:grid-cols-12 lg:gap-[clamp(3rem,6vw,7rem)]">
        <div className="lg:sticky lg:top-[calc(var(--altura-cabecalho)+2rem)] lg:col-span-5 lg:self-start">
          <Titulo id={id}>{titulo}</Titulo>
          <p className="mt-6 max-w-[40ch] text-corpo text-tinta-suave">{texto}</p>
        </div>

        <div className="grid content-start gap-3 lg:col-span-7" data-entra>
          {itens.map((item) => (
            <details key={item.pergunta} name={`${id}-perguntas`} className="lp-pergunta" data-item>
              <summary>
                <span className="text-corpo">{item.pergunta}</span>
                <span className="lp-mais" aria-hidden="true" />
              </summary>
              <p className="text-corpo text-tinta-suave">{item.resposta}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * O último convite: campo verde da marca, uma frase e o botão, com a coroa
 * gigante saindo pela borda direita.
 *
 * É a cena da página (só no desktop e com movimento permitido): a coroa chega
 * de baixo e cresce até o tamanho final conforme a seção entra na tela. Só
 * `transform`, ligado à rolagem. No celular e com "reduzir movimento" a coroa
 * já está parada na composição final.
 */
export function Fechamento({
  id,
  titulo,
  texto,
  rotulo,
  href,
}: {
  id: string;
  titulo: string;
  texto: string;
  rotulo: string;
  href: string;
}) {
  const secaoRef = useRef<HTMLElement>(null);
  const coroaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const secao = secaoRef.current;
    const coroa = coroaRef.current;
    if (!secao || !coroa) return;

    let desfazer: (() => void) | undefined;
    let cancelado = false;

    comGsap(({ gsap }) => {
      if (cancelado) return;
      const mm = gsap.matchMedia();
      mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          coroa,
          { scale: 0.68, xPercent: 14, yPercent: 8 },
          {
            scale: 1,
            xPercent: 0,
            yPercent: 0,
            ease: "none",
            scrollTrigger: {
              trigger: secao,
              start: "top 92%",
              end: "center 55%",
              scrub: true,
            },
          },
        );
      });
      desfazer = () => mm.revert();
    });

    return () => {
      cancelado = true;
      desfazer?.();
    };
  }, []);

  return (
    <section
      ref={secaoRef}
      id={id}
      className="campo-marca lp-fechamento secao"
      aria-labelledby={`${id}-titulo`}
    >
      <div ref={coroaRef} className="lp-coroa-gigante" aria-hidden="true">
        <FormaCoroa proporcao={0.86} />
      </div>

      <div className="quadro" data-entra>
        <Titulo id={id} className="max-w-[16ch] lg:max-w-[14ch]">
          {titulo}
        </Titulo>
        <p className="mt-6 max-w-[40ch] text-corpo" data-item>
          {texto}
        </p>
        <div className="mt-10" data-item>
          <BotaoWhatsApp href={href} ima>
            {rotulo}
          </BotaoWhatsApp>
        </div>
        <p className="mt-6 text-pequeno" data-item>
          WhatsApp {CLINICA.whatsapp} · {CLINICA.horario}
        </p>
      </div>
    </section>
  );
}

/**
 * O pé da página, no campo escuro logo abaixo do fechamento verde. Guarda o
 * que a lei pede (responsável técnica com registro, razão social, CNPJ) e o
 * aviso de que o conteúdo é informativo. Fica fora do `<main>`.
 */
export function Rodape({ aviso }: { aviso: string }) {
  return (
    <footer className="campo-escuro lp-rodape">
      <div className="quadro grid gap-8 pb-10 pt-14 text-pequeno text-sobre-campo-suave md:grid-cols-[1fr_auto] md:items-end">
        <div className="grid gap-1">
          <p className="text-corpo font-semibold text-sobre-campo">{CLINICA.nome}</p>
          <p>{CLINICA.endereco}</p>
          <p>
            Responsável técnica: {RESPONSAVEL_TECNICA.nome} — {RESPONSAVEL_TECNICA.registro}
          </p>
          <p>
            {CLINICA.razaoSocial} · CNPJ {CLINICA.cnpj}
          </p>
          <p className="mt-3 max-w-[70ch]">{aviso}</p>
        </div>
        <a href="/politica-de-privacidade" className="link text-sobre-campo">
          Política de Privacidade
        </a>
      </div>
    </footer>
  );
}
