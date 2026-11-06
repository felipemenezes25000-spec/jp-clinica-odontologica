import type { ReactNode } from "react";
import { Check, Clock3, MapPin, MessageCircle, Phone } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { BotaoWhatsApp } from "@/components/site/lp/BotaoWhatsApp";
import type { Foto } from "@/components/site/lp/Topo";
import { CONVENIOS_SITE, logoDoConvenio } from "@/components/site/convenios-do-site";
import { MolduraCoroa } from "@/components/site/sistema/Coroa";
import { TreatmentVideo } from "@/components/site/TreatmentVideo";
import { AVATAR_POR_NOME, DENTISTAS } from "@/components/site/ui/avatares";
import { CarrosselAvaliacoes } from "@/components/site/ui/CarrosselAvaliacoes";
import { Contador } from "@/components/site/ui/Contador";
import { Estrelas } from "@/components/site/ui/Estrelas";
import { FaixaRolante } from "@/components/site/ui/FaixaRolante";
import { AVALIACOES, CLINICA, DEPOIMENTOS, HISTORIA, RESPONSAVEL_TECNICA, notaBR } from "@/lib/jp";
import "./lp.css";

/*
 * As seções das landings pagas, na ordem em que uma pessoa que clicou num
 * anúncio decide:
 *
 *   Convenios ........ a faixa que corre logo abaixo do topo ("aceitam o meu?");
 *   PorQue ........... cartões brancos com o que a clínica faz de verdade;
 *   SecaoVideo ....... a animação ilustrativa, em cartão claro;
 *   Passos ........... foto do consultório e a lista numerada do caminho;
 *   Equipe ........... a responsável técnica e os dentistas, com CRO;
 *   Avaliacoes ....... nota, total, tempo de clínica e o carrossel do Google;
 *   Endereco ......... o caminho até a porta;
 *   Perguntas ........ acordeão que derruba as objeções;
 *   Fechamento ....... o único campo verde-profundo da página, com o último CTA.
 *
 * Regras que valem para todas: o `id` da seção é a origem do lead (nenhum
 * elemento com `id` entre a seção e o botão), há um botão de WhatsApp a cada
 * uma ou duas seções, o título de seção é um h2 curto e o texto fala de
 * avaliação, nunca de resultado, preço ou prazo. Depoimento individual não
 * ganha estrelas; só a nota geral do Google.
 */

export type Ponto = { titulo: string; texto: string; icone?: LucideIcon };

/** Sobretítulo, h2 e introdução: o cabeçalho de toda seção. */
function Cabeca({
  id,
  sobre,
  titulo,
  intro,
  className = "",
}: {
  id: string;
  sobre: string;
  titulo: string;
  intro?: string;
  className?: string;
}) {
  return (
    <div className={`lp-cabeca ${className}`}>
      <p className="sobretitulo" data-item>
        {sobre}
      </p>
      <h2 id={`${id}-titulo`} className="text-titulo" data-item>
        {titulo}
      </h2>
      {intro && (
        <p className="text-corpo text-tinta-suave lp-intro" data-item>
          {intro}
        </p>
      )}
    </div>
  );
}

/** O botão da seção, com uma linha de apoio opcional ao lado. */
function Chamada({
  href,
  rotulo,
  apoio,
  className = "",
}: {
  href: string;
  rotulo: string;
  apoio?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`lp-chamada ${className}`} data-item>
      <BotaoWhatsApp href={href}>{rotulo}</BotaoWhatsApp>
      {apoio && <p className="text-pequeno text-tinta-suave">{apoio}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Convênios
 * ------------------------------------------------------------------------- */

/**
 * A faixa de convênios: nomes em pílulas brancas (ou o logo, quando a clínica
 * mandar o arquivo para src/assets/convenios) correndo devagar. Não diz o que
 * cada plano cobre: isso a recepção confirma.
 */
export function Convenios({ id, rotulo, href }: { id: string; rotulo: string; href: string }) {
  return (
    <section id={id} className="lp-convenios" aria-labelledby={`${id}-titulo`}>
      <div className="quadro lp-convenios-grade" data-entra>
        <div data-item>
          <p className="sobretitulo">Convênios</p>
          <h2 id={`${id}-titulo`} className="lp-convenios-titulo">
            Trabalhamos com {CONVENIOS_SITE.length} convênios
          </h2>
        </div>
        <div className="lp-convenios-acao" data-item>
          <BotaoWhatsApp href={href}>{rotulo}</BotaoWhatsApp>
        </div>
      </div>

      <FaixaRolante
        rotulo="Convênios atendidos pela JP"
        duracao={36}
        className="lp-convenios-faixa"
      >
        {CONVENIOS_SITE.map((convenio) => {
          const logo = logoDoConvenio(convenio.slug);
          return (
            <span key={convenio.slug} className="lp-convenio">
              {logo ? (
                <img src={logo} alt={convenio.nome} height={28} loading="lazy" decoding="async" />
              ) : (
                convenio.nome
              )}
            </span>
          );
        })}
      </FaixaRolante>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Por que a JP
 * ------------------------------------------------------------------------- */

/**
 * Três cartões brancos com o que a clínica faz de verdade. `layout="grade"`
 * põe os cartões lado a lado; `"lista"` põe o cabeçalho de um lado e os
 * cartões empilhados do outro (a segunda seção de pontos da mesma página não
 * repete o desenho da primeira).
 */
export function PorQue({
  id,
  sobre,
  titulo,
  intro,
  itens,
  rotulo,
  href,
  apoio,
  layout = "grade",
  fundo = "",
}: {
  id: string;
  sobre: string;
  titulo: string;
  intro: string;
  itens: readonly Ponto[];
  rotulo: string;
  href: string;
  apoio?: string;
  layout?: "grade" | "lista";
  fundo?: string;
}) {
  const lista = layout === "lista";
  return (
    <section id={id} className={`secao-curta ${fundo}`} aria-labelledby={`${id}-titulo`}>
      <div className={`quadro ${lista ? "lp-duas" : ""}`}>
        <div data-entra className={lista ? "lp-duas-lado" : ""}>
          <Cabeca id={id} sobre={sobre} titulo={titulo} intro={intro} className="lp-cabeca-larga" />
          {lista && (
            <Chamada href={href} rotulo={rotulo} apoio={apoio} className="lp-chamada-lado" />
          )}
        </div>

        <ul className={lista ? "lp-lista" : "lp-grade"} data-entra>
          {itens.map((item) => {
            const Icone = item.icone;
            return (
              <li key={item.titulo} className="cartao cartao-vivo lp-cartao" data-item>
                {Icone && (
                  <span className="pastilha" aria-hidden="true">
                    <Icone />
                  </span>
                )}
                <div>
                  <h3 className="lp-cartao-titulo">{item.titulo}</h3>
                  <p className="text-corpo text-tinta-suave">{item.texto}</p>
                </div>
              </li>
            );
          })}
        </ul>

        {!lista && (
          <div data-entra className="lp-chamada-baixo">
            <Chamada href={href} rotulo={rotulo} apoio={apoio} />
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * A animação ilustrativa
 * ------------------------------------------------------------------------- */

/**
 * A animação explicativa dentro de um cartão claro.
 *
 * O texto "animação ilustrativa" e a frase sobre a avaliação ficam num único
 * parágrafo (`legenda`): o E2E procura os dois como um elemento só, e é também
 * o que o CFO pede — a ilustração não pode parecer o procedimento do paciente.
 */
export function SecaoVideo({
  id,
  sobre,
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
  sobre: string;
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
    <section id={id} className="secao-curta secao-clara" aria-labelledby={`${id}-titulo`}>
      <div className={`quadro lp-video ${invertido ? "lp-video-invertido" : ""}`}>
        <div className="lp-video-texto" data-entra>
          <Cabeca id={id} sobre={sobre} titulo={titulo} intro={texto} />
          <ul className="lp-itens" data-item>
            {itens.map((item) => (
              <li key={item}>
                <span className="lp-check" aria-hidden="true">
                  <Check />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <Chamada href={href} rotulo={rotulo} />
        </div>

        <div className="lp-video-midia" data-entra>
          <div className="lp-animacao" data-item>
            <TreatmentVideo
              src={video.src}
              poster={video.poster}
              descricao={video.descricao}
              proporcao={1}
              legenda={false}
            />
          </div>
          <p className="lp-legenda text-pequeno text-tinta-suave" data-item>
            {legenda}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Como funciona
 * ------------------------------------------------------------------------- */

/** A foto do consultório de um lado, a lista numerada do caminho do outro. */
export function Passos({
  id,
  sobre,
  titulo,
  texto,
  etapas,
  foto,
  legendaFoto,
  rotulo,
  href,
  invertido = false,
}: {
  id: string;
  sobre: string;
  titulo: string;
  texto: string;
  etapas: readonly { titulo: string; texto: string }[];
  foto: Foto;
  /** Uma linha curta e verdadeira sobre o que a foto mostra. */
  legendaFoto: string;
  rotulo: string;
  href: string;
  invertido?: boolean;
}) {
  return (
    <section id={id} className="secao-curta" aria-labelledby={`${id}-titulo`}>
      <div className={`quadro lp-passos ${invertido ? "lp-passos-invertido" : ""}`}>
        <div className="lp-passos-foto" data-entra>
          <MolduraCoroa medir className="lp-passos-moldura" data-item>
            <img
              src={foto.src}
              width={foto.largura}
              height={foto.altura}
              sizes="(min-width: 1024px) 38vw, 92vw"
              alt={foto.alt}
              style={foto.posicao ? { objectPosition: foto.posicao } : undefined}
              loading="lazy"
              decoding="async"
            />
          </MolduraCoroa>
          <p className="vidro lp-passos-legenda text-pequeno" data-item>
            {legendaFoto}
          </p>
        </div>

        <div data-entra>
          <Cabeca id={id} sobre={sobre} titulo={titulo} intro={texto} />
          <ol className="lp-etapas">
            {etapas.map((etapa) => (
              <li key={etapa.titulo} className="cartao" data-item>
                <span className="lp-numero" aria-hidden="true" />
                <div>
                  <h3 className="lp-cartao-titulo">{etapa.titulo}</h3>
                  <p className="text-corpo text-tinta-suave">{etapa.texto}</p>
                </div>
              </li>
            ))}
          </ol>
          <Chamada href={href} rotulo={rotulo} />
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * A equipe responsável
 * ------------------------------------------------------------------------- */

/**
 * Quem responde tecnicamente pela clínica, com nome e registro (Res. CFO
 * 196/2019), e os demais dentistas. Tudo vem de `jp.ts`: nada é escrito à mão.
 */
export function Equipe({
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
  const demais = DENTISTAS.filter((d) => d.nome !== RESPONSAVEL_TECNICA.nome);

  return (
    <section id={id} className="secao-curta secao-clara" aria-labelledby={`${id}-titulo`}>
      <div className="quadro">
        <div data-entra>
          <Cabeca
            id={id}
            sobre="Quem atende"
            titulo={titulo}
            intro={texto}
            className="lp-cabeca-larga"
          />
        </div>

        <div className="lp-equipe" data-entra>
          <figure className="cartao lp-rt" data-item>
            <MolduraCoroa proporcao={560 / 683} className="lp-rt-foto">
              <img
                src={RESPONSAVEL_TECNICA.foto}
                width={560}
                height={683}
                sizes="(min-width: 1024px) 22rem, 70vw"
                alt={`Retrato de ${RESPONSAVEL_TECNICA.nome}, responsável técnica da JP Clínica Odontológica`}
                loading="lazy"
                decoding="async"
              />
            </MolduraCoroa>
            <figcaption>
              <span className="lp-rt-papel">Responsável técnica</span>
              <strong>{RESPONSAVEL_TECNICA.nome}</strong>
              <span className="lp-rt-cro">{RESPONSAVEL_TECNICA.registro}</span>
              {RESPONSAVEL_TECNICA.papel && (
                <span className="text-pequeno text-tinta-suave">{RESPONSAVEL_TECNICA.papel}</span>
              )}
            </figcaption>
          </figure>

          <ul className="lp-dentistas">
            {demais.map((d) => {
              const avatar = AVATAR_POR_NOME[d.nome];
              return (
                <li key={d.nome} className="cartao" data-item>
                  {avatar ? (
                    <img
                      src={avatar}
                      alt=""
                      width={56}
                      height={56}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="lp-inicial" aria-hidden="true">
                      {d.nome.replace(/^(Dra?\.)\s/, "").charAt(0)}
                    </span>
                  )}
                  <span>
                    <strong>{d.nome}</strong>
                    <span className="lp-cro">{d.registro}</span>
                    {d.papel && <span className="text-pequeno text-tinta-suave">{d.papel}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div data-entra>
          <Chamada href={href} rotulo={rotulo} />
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Avaliações
 * ------------------------------------------------------------------------- */

/**
 * A prova social: a nota geral do Google (estrelas só aqui), o total, o tempo
 * da clínica e os depoimentos reais da ficha no carrossel. Os números são os de
 * `jp.ts`; abaixo da dobra eles sobem ao entrar na tela.
 */
export function Avaliacoes({
  id,
  titulo,
  rotulo,
  href,
}: {
  id: string;
  titulo: string;
  rotulo: string;
  href: string;
}) {
  return (
    <section id={id} className="secao-curta" aria-labelledby={`${id}-titulo`}>
      <div className="quadro">
        <div className="lp-prova-topo" data-entra>
          <Cabeca
            id={id}
            sobre="Avaliações no Google"
            titulo={titulo}
            intro="Estes são relatos reais de pacientes na ficha da JP no Google, do jeito que foram escritos."
          />

          <dl className="lp-numeros">
            <div className="cartao" data-item>
              <dt>nota no Google</dt>
              <dd>
                <Contador valor={AVALIACOES.nota} casas={1} />
                <Estrelas tamanho="1.1rem" className="lp-numeros-estrelas" />
              </dd>
            </div>
            <div className="cartao" data-item>
              <dt>avaliações</dt>
              <dd>
                <Contador valor={AVALIACOES.total} />
              </dd>
            </div>
            <div className="cartao" data-item>
              <dt>anos de clínica</dt>
              <dd>
                <Contador valor={HISTORIA.anos} />
              </dd>
            </div>
          </dl>
        </div>

        <CarrosselAvaliacoes itens={DEPOIMENTOS} className="lp-carrossel" />

        <div data-entra>
          <Chamada
            href={href}
            rotulo={rotulo}
            apoio={`Nota ${notaBR} de 5 no Google, com ${String(AVALIACOES.total)} avaliações.`}
            className="lp-chamada-baixo"
          />
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Endereço
 * ------------------------------------------------------------------------- */

/** O caminho até a porta: endereço, horário, telefone e a fachada. */
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
    <section id={id} className="secao-curta secao-clara" aria-labelledby={`${id}-titulo`}>
      <div className={`quadro lp-endereco-grade ${invertido ? "lp-endereco-invertido" : ""}`}>
        <div data-entra>
          <Cabeca id={id} sobre="Como chegar" titulo={titulo} />

          <ul className="lp-contatos">
            <li className="cartao" data-item>
              <span className="pastilha" aria-hidden="true">
                <MapPin />
              </span>
              <span>
                <strong>Endereço</strong>
                <span>{CLINICA.endereco}</span>
                <a
                  href={CLINICA.mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link lp-link-curto"
                >
                  Ver no mapa
                </a>
              </span>
            </li>
            <li className="cartao" data-item>
              <span className="pastilha" aria-hidden="true">
                <Clock3 />
              </span>
              <span>
                <strong>Horário</strong>
                <span>{CLINICA.horario}</span>
              </span>
            </li>
            <li className="cartao" data-item>
              <span className="pastilha" aria-hidden="true">
                <Phone />
              </span>
              <span>
                <strong>Telefone</strong>
                <a href={CLINICA.telefoneHref} className="link lp-link-curto">
                  {CLINICA.telefone}
                </a>
              </span>
            </li>
          </ul>

          <Chamada href={href} rotulo={rotulo} />
        </div>

        <div className="lp-fachada" data-entra>
          <MolduraCoroa
            proporcao={foto.largura / foto.altura}
            className="lp-fachada-moldura"
            data-item
          >
            <img
              src={foto.src}
              width={foto.largura}
              height={foto.altura}
              sizes="(min-width: 1024px) 34vw, 92vw"
              alt={foto.alt}
              style={foto.posicao ? { objectPosition: foto.posicao } : undefined}
              loading="lazy"
              decoding="async"
            />
          </MolduraCoroa>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Perguntas
 * ------------------------------------------------------------------------- */

/** Título grudado à esquerda, acordeão de cartões à direita (<details name>). */
export function Perguntas({
  id,
  titulo,
  texto,
  itens,
  rotulo,
  href,
}: {
  id: string;
  titulo: string;
  texto: string;
  itens: readonly { pergunta: string; resposta: string }[];
  rotulo: string;
  href: string;
}) {
  return (
    <section id={id} className="secao-curta" aria-labelledby={`${id}-titulo`}>
      <div className="quadro lp-duas">
        <div className="lp-duas-lado lp-perguntas-lado" data-entra>
          <Cabeca id={id} sobre="Dúvidas" titulo={titulo} intro={texto} />
          <Chamada
            href={href}
            rotulo={rotulo}
            apoio="Ficou com outra dúvida? A recepção responde pelo WhatsApp."
            className="lp-chamada-lado"
          />
        </div>

        <div className="lp-perguntas" data-entra>
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

/* ---------------------------------------------------------------------------
 * Fechamento e rodapé
 * ------------------------------------------------------------------------- */

/**
 * O último convite, no único campo verde-profundo da página: uma frase, o
 * botão grande, o telefone e o cartão com os dados da recepção. Sem forma
 * decorativa: o que está aqui serve a quem decide chamar.
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
  return (
    <section id={id} className="campo-escuro lp-fechamento secao" aria-labelledby={`${id}-titulo`}>
      <div className="quadro lp-fechamento-grade" data-entra>
        <div>
          <p className="sobretitulo" data-item>
            Fale com a recepção
          </p>
          <h2 id={`${id}-titulo`} className="text-titulo lp-fechamento-titulo" data-item>
            {titulo}
          </h2>
          <p className="text-corpo text-sobre-campo-suave lp-intro" data-item>
            {texto}
          </p>
          <div className="lp-fechamento-acoes" data-item>
            <BotaoWhatsApp href={href} grande ima>
              {rotulo}
            </BotaoWhatsApp>
            <a href={CLINICA.telefoneHref} className="botao botao-claro botao-grande lp-telefone">
              <Phone aria-hidden="true" />
              {CLINICA.telefone}
            </a>
          </div>
          <p className="lp-fechamento-nota text-pequeno" data-item>
            <Estrelas tamanho="0.95rem" />
            <span>
              {notaBR} no Google · {AVALIACOES.total} avaliações
            </span>
          </p>
        </div>

        <ul className="lp-recepcao" data-item>
          <li>
            <span className="pastilha" aria-hidden="true">
              <MessageCircle />
            </span>
            <span>
              <strong>WhatsApp</strong>
              <span>{CLINICA.whatsapp}</span>
            </span>
          </li>
          <li>
            <span className="pastilha" aria-hidden="true">
              <Clock3 />
            </span>
            <span>
              <strong>Horário</strong>
              <span>{CLINICA.horario}</span>
            </span>
          </li>
          <li>
            <span className="pastilha" aria-hidden="true">
              <MapPin />
            </span>
            <span>
              <strong>Endereço</strong>
              <span>{CLINICA.endereco}</span>
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}

/**
 * O pé da página, no campo escuro logo abaixo do fechamento. Guarda o que a lei
 * pede (responsável técnica com registro, razão social, CNPJ) e o aviso de que
 * o conteúdo é informativo. Fica fora do `<main>`.
 */
export function Rodape({ aviso }: { aviso: string }) {
  return (
    <footer className="campo-escuro lp-rodape">
      <div className="quadro grid gap-8 pb-10 pt-12 text-pequeno text-sobre-campo-suave md:grid-cols-[1fr_auto] md:items-end">
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
