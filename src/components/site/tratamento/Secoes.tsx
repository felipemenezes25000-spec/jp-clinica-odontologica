import type { CSSProperties } from "react";
import { ArrowUpRight, MapPin, Plus } from "lucide-react";

import { FormaCoroa, MarcaCoroa, MolduraCoroa } from "@/components/site/sistema/Coroa";
import {
  AVALIACOES,
  CLINICA,
  HISTORIA,
  RESPONSAVEL_TECNICA,
  notaBR,
  type Tratamento,
} from "@/lib/jp";
import { FACHADA, RETRATO, type Foto } from "./midia";
import "./tratamento.css";

/**
 * Foto dentro da coroa, com o enquadramento que `midia.ts` escolheu para ela.
 * `data-obturador` vai no invólucro, não na coroa: o motor anima o `clip-path`
 * do elemento e, ao terminar, deixaria um retângulo no lugar da coroa.
 */
function FotoEmCoroa({
  foto,
  proporcao,
  tamanhos,
  className = "",
}: {
  foto: Foto;
  proporcao: number;
  tamanhos: string;
  className?: string;
}) {
  return (
    <div className={`tt-foto ${className}`} data-obturador>
      <MolduraCoroa proporcao={proporcao}>
        <img
          src={foto.src}
          width={foto.largura}
          height={foto.altura}
          alt={foto.alt}
          sizes={tamanhos}
          loading="lazy"
          decoding="async"
          style={foto.posicao ? { objectPosition: foto.posicao } : undefined}
          data-deriva
        />
      </MolduraCoroa>
    </div>
  );
}

/**
 * Lista marcada pela coroa: o marcador é a forma da casa, não um ponto.
 * `role="list"` porque o reset do Tailwind zera o `list-style`, e Safari com
 * VoiceOver deixa de anunciar como lista o que não tem marcador.
 */
function Marcados({ itens, className = "" }: { itens: readonly string[]; className?: string }) {
  return (
    <ul className={`tt-lista ${className}`} role="list">
      {itens.map((item) => (
        <li key={item}>
          <MarcaCoroa />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * O QUE É — a foto à esquerda, a leitura à direita.
 *
 * O `manifesto` é a frase que se acende palavra por palavra com a rolagem (a
 * única `data-tinta` da página), e a nota de que a página não substitui a
 * avaliação é conformidade com o CFO: fica em todas as páginas.
 */
export function Entenda({ tratamento, foto }: { tratamento: Tratamento; foto: Foto }) {
  return (
    <section id="entenda" className="secao" aria-labelledby="tt-entenda">
      <div className="quadro tt-grade tt-grade-entenda">
        <div className="tt-leitura">
          <h2 id="tt-entenda" className="text-titulo" data-linhas>
            Entenda {tratamento.short.toLowerCase()}
          </h2>
          <p className="text-frase tt-manifesto" data-tinta>
            {tratamento.manifesto}
          </p>
          <div className="tt-leitura" data-entra>
            <div data-item>
              <h3 className="tt-subtitulo text-corpo">O que buscamos no cuidado</h3>
              <Marcados itens={tratamento.beneficios} className="text-corpo" />
            </div>
            <p className="tt-nota text-pequeno" data-item style={{ "--i": 1 } as CSSProperties}>
              A página explica a lógica do cuidado, mas não substitui uma avaliação. Diagnóstico,
              indicação, técnica, número de sessões e expectativas dependem das condições
              individuais de cada paciente.
            </p>
          </div>
        </div>
        <FotoEmCoroa
          foto={foto}
          proporcao={0.86}
          tamanhos="(min-width: 1024px) 38vw, 90vw"
          className="tt-foto-entenda"
        />
      </div>
    </section>
  );
}

/**
 * PARA QUEM — os cenários em frase grande à esquerda, a foto à direita.
 *
 * É a seção com o fundo um degrau acima do chão: separa a leitura do conceito
 * da leitura de "isso é para mim?". O título é "Quem procura <tratamento>"
 * porque o antigo ("Não é sobre caber numa caixa") servia a qualquer clínica.
 */
export function ParaQuem({ tratamento, foto }: { tratamento: Tratamento; foto: Foto }) {
  return (
    <section className="secao tt-paraquem" aria-labelledby="tt-paraquem">
      <div className="quadro tt-grade tt-grade-paraquem">
        <div className="tt-leitura" data-entra>
          <h2 id="tt-paraquem" className="text-titulo" data-item>
            Quem procura {tratamento.short.toLowerCase()}
          </h2>
          <p className="text-corpo" data-item style={{ "--i": 1 } as CSSProperties}>
            Estes são cenários que podem levar alguém a conversar com a equipe sobre{" "}
            {tratamento.titulo.toLowerCase()}. É sobre entender o ponto de partida, não sobre caber
            numa regra.
          </p>
          <div data-item style={{ "--i": 2 } as CSSProperties}>
            <Marcados itens={tratamento.paraQuem} className="tt-lista-grande text-frase" />
          </div>
        </div>
        <FotoEmCoroa
          foto={foto}
          proporcao={0.82}
          tamanhos="(min-width: 1024px) 42vw, 90vw"
          className="tt-foto-paraquem"
        />
      </div>
    </section>
  );
}

/**
 * AS ETAPAS — campo escuro, quatro colunas que sobem em degraus.
 *
 * Sem numeração: a ordem se lê pela posição e pelo `<ol>`, e a coroa em
 * verde-maçã faz o papel do número — ela se enche de baixo para cima, uma
 * etapa depois da outra (CSS em `tratamento.css`, ligado ao `data-entra`).
 * O `--i` já vai multiplicado por 1,75 para a cascata durar 140ms por passo:
 * a regra do motor multiplica por 80ms e vive fora de camada, não dá para
 * sobrescrevê-la daqui. A forma grande no canto fecha o topo do campo.
 */
export function Etapas({ tratamento }: { tratamento: Tratamento }) {
  const titulo =
    tratamento.etapas.length === 4
      ? `${tratamento.short}, em quatro passos`
      : `${tratamento.short}, passo a passo`;

  return (
    <section className="secao campo-escuro tt-etapas" aria-labelledby="tt-etapas">
      <FormaCoroa proporcao={0.86} className="tt-etapas-forma" />
      <div className="quadro tt-etapas-corpo">
        <h2 id="tt-etapas" className="text-titulo" data-linhas>
          {titulo}
        </h2>
        <ol className="tt-passos" role="list" data-entra>
          {tratamento.etapas.map((etapa, i) => (
            <li
              key={etapa.titulo}
              className="tt-passo"
              data-item
              style={{ "--i": i * 1.75, "--degrau": i } as CSSProperties}
            >
              <FormaCoroa proporcao={0.86} className="tt-passo-forma" />
              <div>
                <h3 className="text-frase">{etapa.titulo}</h3>
                <p className="text-corpo">{etapa.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/**
 * PERGUNTAS — duas composições, conforme o volume.
 *
 * Com até três perguntas (a maioria dos tratamentos tem duas) um acordeão fica
 * raso: dois ladrilhos de 80px e meia tela vazia. Então elas saem abertas, em
 * colunas, como leitura. Com mais (implantes tem oito) volta o acordeão, em
 * duas colunas; `<details name>` o faz sem JavaScript.
 */
export function Perguntas({ tratamento }: { tratamento: Tratamento }) {
  const curto = tratamento.faq.length <= 3;

  return (
    <section className="secao-curta" aria-labelledby="tt-perguntas">
      <div className="quadro">
        <h2 id="tt-perguntas" className="text-titulo" data-linhas>
          Antes de decidir, entenda.
        </h2>
        {curto ? (
          <div
            className="tt-leituras"
            data-entra
            style={{ "--colunas": tratamento.faq.length } as CSSProperties}
          >
            {tratamento.faq.map((item, i) => (
              <article key={item.q} data-item style={{ "--i": i } as CSSProperties}>
                <h3 className="text-frase">{item.q}</h3>
                <p className="text-corpo">{item.a}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="tt-acordeao" data-entra>
            {tratamento.faq.map((item, i) => (
              <details
                key={item.q}
                name="perguntas-do-tratamento"
                className="tt-pergunta"
                data-item
                style={{ "--i": i } as CSSProperties}
              >
                <summary className="text-corpo">
                  <span>{item.q}</span>
                  <span className="tt-mais" aria-hidden="true">
                    <Plus />
                  </span>
                </summary>
                <p className="text-corpo">{item.a}</p>
              </details>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * POR QUE A JP — campo verde-marca, os dois números em tamanho de manchete e o
 * retrato da responsável técnica em coroa.
 *
 * Tudo sai de `jp.ts`: anos de clínica, nota e volume de avaliações, o
 * endereço e a responsável técnica com o registro (identificação que a
 * Resolução CFO 196/2019 pede, e por isso o nome e o CROSP ficam escritos ao
 * lado do retrato). Nenhuma frase de superioridade.
 */
export function PorQueJP() {
  return (
    <section className="secao campo-marca tt-porque" aria-labelledby="tt-porque">
      <div className="quadro tt-grade tt-grade-porque">
        <div className="tt-leitura" data-entra>
          <h2 id="tt-porque" className="text-titulo" data-item>
            Por que a JP
          </h2>
          <p className="text-frase" data-item style={{ "--i": 1 } as CSSProperties}>
            Uma clínica com história, avaliada por quem já passou por ela e com uma responsável
            técnica que assina o cuidado.
          </p>

          <div className="tt-numeros" data-item style={{ "--i": 2 } as CSSProperties}>
            <div>
              <p className="tt-numero">
                <span data-numero={HISTORIA.anos} data-casas="0">
                  {HISTORIA.anos}
                </span>
              </p>
              <p className="tt-numero-legenda text-corpo">
                anos de clínica, desde {HISTORIA.fundacao}
              </p>
            </div>
            <div>
              <p className="tt-numero">
                <span data-numero={AVALIACOES.total} data-casas="0">
                  {AVALIACOES.total}
                </span>
              </p>
              <p className="tt-numero-legenda text-corpo">avaliações no Google, nota {notaBR}</p>
            </div>
          </div>
        </div>

        <figure className="tt-retrato">
          <div className="tt-foto" data-obturador>
            <MolduraCoroa proporcao={0.82}>
              <img
                src={RETRATO.src}
                width={RETRATO.largura}
                height={RETRATO.altura}
                alt={RETRATO.alt}
                sizes="(min-width: 1024px) 30vw, 80vw"
                loading="lazy"
                decoding="async"
                style={{ objectPosition: RETRATO.posicao }}
              />
            </MolduraCoroa>
          </div>
          <figcaption>
            <p className="tt-responsavel text-corpo">
              <strong>{RESPONSAVEL_TECNICA.nome}</strong>
              <span>Responsável técnica, {RESPONSAVEL_TECNICA.registro}</span>
            </p>
            <p className="tt-endereco text-pequeno">
              <MapPin aria-hidden="true" />
              <span>{CLINICA.endereco}</span>
            </p>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

/**
 * O fecho: o painel em verde-maçã com a frase de próxima etapa e o botão, e a
 * fachada cortada pela borda do painel. No celular a foto sai (o
 * painel já é todo texto e botão) e fica uma coroa pequena no canto, atrás do
 * botão, longe do título.
 */
export function ChamadaFinal({ wa }: { wa: string }) {
  return (
    <section className="secao-curta" aria-labelledby="tt-chamada">
      <div className="quadro">
        <div className="tt-chamada" data-entra>
          <FormaCoroa proporcao={0.8} className="tt-chamada-forma" />
          <div className="tt-chamada-foto">
            <MolduraCoroa proporcao={0.9}>
              <img
                src={FACHADA.src}
                width={FACHADA.largura}
                height={FACHADA.altura}
                alt={FACHADA.alt}
                sizes="(min-width: 1024px) 30vw, 0px"
                loading="lazy"
                decoding="async"
                style={{ objectPosition: FACHADA.posicao }}
              />
            </MolduraCoroa>
          </div>
          <div className="tt-chamada-texto">
            <h2 id="tt-chamada" className="text-titulo" data-item>
              Fale com a equipe.
            </h2>
            <p className="text-frase" data-item style={{ "--i": 1 } as CSSProperties}>
              A melhor próxima etapa é a que começa com informação sobre o seu caso.
            </p>
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="botao botao-tinta"
              data-item
              style={{ "--i": 2 } as CSSProperties}
            >
              Agendar avaliação
              <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * O CROSS-SELL SÓ EXISTE NA ORGÂNICA.
 * Numa LP paga, "Outros caminhos de cuidado" e o botão "Ver todos" são duas
 * saídas grandes, no fim da página, para quem acabou de ler sobre o
 * procedimento que a clínica pagou para mostrar. Quem chegou por busca
 * orgânica pode estar comparando e ganha com a lista.
 *
 * Os ladrilhos ficam lado a lado, o primeiro mais largo e em verde-maçã: é o
 * próximo passo mais provável (ver `RELACIONADOS`), e a diferença de peso evita
 * a fileira de três peças iguais.
 */
export function OutrosCaminhos({ outros }: { outros: readonly Tratamento[] }) {
  return (
    <section className="secao-curta tt-outros" aria-labelledby="tt-outros">
      <div className="quadro">
        <div className="tt-outros-topo">
          <h2 id="tt-outros" className="text-titulo" data-linhas>
            Outros caminhos de cuidado.
          </h2>
          <a href="/#tratamentos" className="botao botao-tinta">
            Ver todos <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
        <div className="tt-caminhos" data-entra>
          {outros.map((item, i) => (
            <a
              key={item.slug}
              href={`/tratamentos/${item.slug}`}
              className="tt-caminho ladrilho"
              data-item
              style={{ "--i": i } as CSSProperties}
            >
              <span className="text-frase">{item.titulo}</span>
              <span className="text-corpo">{item.kicker}</span>
              <ArrowUpRight aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
