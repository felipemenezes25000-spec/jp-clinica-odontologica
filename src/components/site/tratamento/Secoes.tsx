import type { CSSProperties } from "react";
import { ArrowUpRight, Check, Info, MapPin, Phone, Plus } from "lucide-react";

import { MolduraCoroa } from "@/components/site/sistema/Coroa";
import { CarrosselAvaliacoes } from "@/components/site/ui/CarrosselAvaliacoes";
import { Contador } from "@/components/site/ui/Contador";
import { Estrelas } from "@/components/site/ui/Estrelas";
import {
  AVALIACOES,
  CLINICA,
  DEPOIMENTOS,
  HISTORIA,
  RESPONSAVEL_TECNICA,
  notaBR,
  type Tratamento,
} from "@/lib/jp";
import { FACHADA, RETRATO, type Foto } from "./midia";
import "./tratamento.css";

/** O `--i` que o motor de revelação multiplica por 80ms na cascata. */
const passo = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * Foto do consultório em tamanho médio, bem enquadrada e com cantos suaves.
 * As fotos da clínica são de celular: nunca ocupam a coluna inteira.
 */
function FotoMedia({
  foto,
  proporcao,
  tamanhos,
  className = "",
  children,
}: {
  foto: Foto;
  proporcao: number;
  tamanhos: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`tt-foto ${className}`}>
      <MolduraCoroa proporcao={proporcao} className="tt-foto-moldura">
        <img
          src={foto.src}
          width={foto.largura}
          height={foto.altura}
          alt={foto.alt}
          sizes={tamanhos}
          loading="lazy"
          decoding="async"
          style={foto.posicao ? { objectPosition: foto.posicao } : undefined}
        />
      </MolduraCoroa>
      {children}
    </div>
  );
}

/**
 * O QUE É — a leitura à esquerda, o consultório à direita.
 *
 * O `manifesto` é a frase-resumo do tratamento; a lista são cartões curtos
 * com o que se busca no cuidado. A nota de que a página não substitui a
 * avaliação é conformidade com o CFO e fica em todas as páginas.
 */
export function Entenda({ tratamento, foto }: { tratamento: Tratamento; foto: Foto }) {
  return (
    <section id="entenda" className="secao" aria-labelledby="tt-entenda">
      <div className="quadro tt-grade tt-grade-entenda">
        <div className="tt-leitura" data-entra>
          <span className="sobretitulo" data-item>
            O que é
          </span>
          <h2 id="tt-entenda" className="text-titulo" data-item style={passo(1)}>
            Entenda {tratamento.short.toLowerCase()}
          </h2>
          <p className="tt-manifesto text-frase" data-item style={passo(2)}>
            {tratamento.manifesto}
          </p>

          <div data-item style={passo(3)}>
            <h3 className="tt-subtitulo">O que buscamos no cuidado</h3>
            <ul className="tt-beneficios" role="list">
              {tratamento.beneficios.map((item) => (
                <li key={item} className="cartao">
                  <span className="pastilha" aria-hidden="true">
                    <Check />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="tt-nota" data-item style={passo(4)}>
            <Info aria-hidden="true" />
            <span>
              A página explica a lógica do cuidado, mas não substitui uma avaliação. Diagnóstico,
              indicação, técnica, número de sessões e expectativas dependem das condições
              individuais de cada paciente.
            </span>
          </p>
        </div>

        <FotoMedia
          foto={foto}
          proporcao={5 / 4}
          tamanhos="(min-width: 1024px) 40vw, 92vw"
          className="tt-foto-entenda"
        >
          <p className="vidro flutua tt-foto-selo">
            <MapPin aria-hidden="true" />
            <span>Consultório da JP, na {CLINICA.local.bairro}</span>
          </p>
        </FotoMedia>
      </div>
    </section>
  );
}

/**
 * PARA QUEM — cenários em cartões, com o consultório ao lado.
 * Fundo um degrau acima do chão: separa o conceito de "isso é para mim?".
 */
export function ParaQuem({ tratamento, foto }: { tratamento: Tratamento; foto: Foto }) {
  return (
    <section className="secao secao-clara" aria-labelledby="tt-paraquem">
      <div className="quadro tt-grade tt-grade-paraquem">
        <div className="tt-leitura" data-entra>
          <span className="sobretitulo" data-item>
            Para quem
          </span>
          <h2 id="tt-paraquem" className="text-titulo" data-item style={passo(1)}>
            Quem procura {tratamento.short.toLowerCase()}
          </h2>
          <p className="text-corpo tt-intro" data-item style={passo(2)}>
            Estes são cenários que podem levar alguém a conversar com a equipe sobre{" "}
            {tratamento.titulo.toLowerCase()}. É sobre entender o ponto de partida, não sobre caber
            numa regra.
          </p>
          {/* `w-full`: a coluna é flex com `align-items: flex-start`, e sem
              largura própria o embrulho encolhia até a foto — que, preguiçosa,
              ainda não existia. A caixa nascia com 0px e crescia 238px quando
              a imagem chegava (CLS de 0,16 no celular). */}
          <div data-item style={passo(3)} className="w-full">
            <FotoMedia
              foto={foto}
              proporcao={16 / 10}
              tamanhos="(min-width: 1024px) 34vw, 92vw"
              className="tt-foto-paraquem"
            />
          </div>
        </div>

        <ul className="tt-cenarios" role="list" data-entra>
          {tratamento.paraQuem.map((item, i) => (
            <li key={item} className="cartao tt-cenario" data-item style={passo(i)}>
              <span className="pastilha" aria-hidden="true">
                <Check />
              </span>
              <span className="text-frase">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * AS ETAPAS — cartões numerados em fileira, lidos da esquerda para a direita.
 *
 * O número vem do dado (`etapa.n`) e a lista é uma `<ol>`: a ordem é
 * semântica, não só visual. Embaixo, a primeira repetição do CTA: quem leu o
 * caminho inteiro está no melhor momento para chamar.
 */
export function Etapas({ tratamento, wa }: { tratamento: Tratamento; wa: string }) {
  const titulo =
    tratamento.etapas.length === 4
      ? `${tratamento.short}, em quatro passos`
      : `${tratamento.short}, passo a passo`;

  return (
    <section id="etapas" className="secao" aria-labelledby="tt-etapas">
      <div className="quadro">
        <div className="tt-cabeca" data-entra>
          <span className="sobretitulo" data-item>
            Como funciona
          </span>
          <h2 id="tt-etapas" className="text-titulo" data-item style={passo(1)}>
            {titulo}
          </h2>
          <p className="text-corpo tt-intro" data-item style={passo(2)}>
            Tudo começa por uma avaliação: o que vem depois depende do diagnóstico de cada paciente.
          </p>
        </div>

        <ol className="tt-passos" role="list" data-entra>
          {tratamento.etapas.map((etapa, i) => (
            <li key={etapa.titulo} className="cartao tt-passo" data-item style={passo(i)}>
              <span className="tt-passo-numero" aria-hidden="true">
                {etapa.n}
              </span>
              <h3 className="text-frase">{etapa.titulo}</h3>
              <p className="text-corpo">{etapa.texto}</p>
            </li>
          ))}
        </ol>

        <div className="tt-faixa-cta" data-entra>
          <div data-item>
            <p className="text-frase">Quer conversar sobre o seu caso?</p>
            <p className="text-corpo">
              Fale com a recepção pelo WhatsApp e combine a sua avaliação.
            </p>
          </div>
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="button-primary"
            data-item
            data-ima
            style={passo(1)}
          >
            Agendar avaliação
            <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}

/**
 * QUEM ASSINA O CUIDADO — o retrato da responsável técnica ao lado do nome e
 * do registro, e dois números reais.
 *
 * Tudo sai de `jp.ts`: anos de clínica, nota e volume de avaliações, o
 * endereço e a responsável técnica com o CROSP (identificação que a Resolução
 * CFO 196/2019 pede, e por isso nome e registro ficam escritos). Nenhuma frase
 * de superioridade.
 */
export function ResponsavelTecnica() {
  return (
    <section id="responsavel-tecnica" className="secao secao-clara" aria-labelledby="tt-porque">
      <div className="quadro tt-grade tt-grade-porque">
        <figure className="tt-retrato" data-entra>
          <div className="tt-foto tt-foto-retrato" data-item>
            <MolduraCoroa proporcao={RETRATO.largura / RETRATO.altura} className="tt-foto-moldura">
              <img
                src={RETRATO.src}
                width={RETRATO.largura}
                height={RETRATO.altura}
                alt={RETRATO.alt}
                sizes="(min-width: 1024px) 26vw, 80vw"
                loading="lazy"
                decoding="async"
                style={{ objectPosition: RETRATO.posicao }}
              />
            </MolduraCoroa>
            <figcaption className="vidro tt-retrato-selo">
              <strong>{RESPONSAVEL_TECNICA.nome}</strong>
              <span>Responsável técnica, {RESPONSAVEL_TECNICA.registro}</span>
            </figcaption>
          </div>
        </figure>

        <div className="tt-leitura" data-entra>
          <span className="sobretitulo" data-item>
            Quem assina o cuidado
          </span>
          <h2 id="tt-porque" className="text-titulo" data-item style={passo(1)}>
            Por que a JP
          </h2>
          <p className="text-frase tt-manifesto" data-item style={passo(2)}>
            Uma clínica com história, avaliada por quem já passou por ela e com uma responsável
            técnica que assina o cuidado.
          </p>

          <div className="tt-numeros" data-item style={passo(3)}>
            <div className="cartao">
              <p className="tt-numero">
                <Contador valor={HISTORIA.anos} />
              </p>
              <p className="text-corpo">anos de clínica, desde {HISTORIA.fundacao}</p>
            </div>
            <div className="cartao">
              <p className="tt-numero">
                <Contador valor={AVALIACOES.total} />
              </p>
              <p className="text-corpo">avaliações no Google, nota {notaBR}</p>
            </div>
          </div>

          <p className="tt-endereco text-pequeno" data-item style={passo(4)}>
            <MapPin aria-hidden="true" />
            <span>{CLINICA.endereco}</span>
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * AVALIAÇÕES — os depoimentos reais do Google no carrossel do sistema.
 * Sem estrelas por depoimento (o site não sabe quantas cada pessoa deu); a
 * nota geral vem do selo ao lado do título.
 */
export function Avaliacoes() {
  return (
    <section id="depoimentos" className="secao" aria-labelledby="tt-avaliacoes">
      <div className="quadro">
        <div className="tt-avaliacoes-topo" data-entra>
          <div className="tt-cabeca">
            <span className="sobretitulo" data-item>
              Quem já passou por aqui
            </span>
            <h2 id="tt-avaliacoes" className="text-titulo" data-item style={passo(1)}>
              O que pacientes dizem no Google
            </h2>
          </div>
          <a
            href={CLINICA.mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="selo tt-selo-google"
            data-item
            style={passo(2)}
          >
            <span className="tt-selo-estrelas">
              <Estrelas tamanho="0.95rem" />
            </span>
            <span>
              <strong>{notaBR}</strong> · {AVALIACOES.total} avaliações
            </span>
            <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
        <CarrosselAvaliacoes itens={DEPOIMENTOS} className="tt-carrossel" />
      </div>
    </section>
  );
}

/**
 * PERGUNTAS — duas composições, conforme o volume.
 *
 * Com até três perguntas (a maioria dos tratamentos tem duas) um acordeão fica
 * raso. Então elas saem abertas, em cartões, como leitura. Com mais (implantes
 * tem oito) volta o acordeão; `<details name>` o faz sem JavaScript.
 */
export function Perguntas({ tratamento }: { tratamento: Tratamento }) {
  const curto = tratamento.faq.length <= 3;

  return (
    <section id="perguntas" className="secao secao-clara" aria-labelledby="tt-perguntas">
      <div className="quadro tt-grade tt-grade-perguntas">
        <div className="tt-cabeca" data-entra>
          <span className="sobretitulo" data-item>
            Perguntas frequentes
          </span>
          <h2 id="tt-perguntas" className="text-titulo" data-item style={passo(1)}>
            Antes de decidir, entenda.
          </h2>
        </div>
        {curto ? (
          <div className="tt-leituras" data-entra>
            {tratamento.faq.map((item, i) => (
              <article key={item.q} className="cartao" data-item style={passo(i)}>
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
                className="tt-pergunta cartao"
                data-item
                style={passo(i)}
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
 * O CROSS-SELL SÓ EXISTE NA ORGÂNICA.
 * Numa LP paga, "Outros caminhos de cuidado" e o botão "Ver todos" são duas
 * saídas grandes, no fim da página, para quem acabou de ler sobre o
 * procedimento que a clínica pagou para mostrar. Quem chegou por busca
 * orgânica pode estar comparando e ganha com a lista.
 */
export function OutrosCaminhos({ outros }: { outros: readonly Tratamento[] }) {
  return (
    <section className="secao-curta tt-outros" aria-labelledby="tt-outros">
      <div className="quadro">
        <div className="tt-outros-topo" data-entra>
          <h2 id="tt-outros" className="text-titulo" data-item>
            Outros caminhos de cuidado.
          </h2>
          <a href="/#tratamentos" className="botao botao-chao" data-item style={passo(1)}>
            Ver todos <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
        <div className="tt-caminhos" data-entra>
          {outros.map((item, i) => (
            <a
              key={item.slug}
              href={`/tratamentos/${item.slug}`}
              className="tt-caminho cartao cartao-vivo"
              data-item
              style={passo(i)}
            >
              <span className="text-frase">{item.titulo}</span>
              <span className="text-corpo">{item.kicker}</span>
              <span className="tt-caminho-seta" aria-hidden="true">
                <ArrowUpRight />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * O FECHO — o único bloco de verde profundo da página, com a fachada e o
 * endereço que a pessoa vai procurar. O botão principal repete o CTA; o
 * telefone fica ao lado para quem prefere ligar.
 */
export function ChamadaFinal({ wa }: { wa: string }) {
  return (
    <section id="fale-com-a-equipe" className="secao-curta" aria-labelledby="tt-chamada">
      <div className="quadro">
        <div className="tt-chamada campo-escuro" data-entra>
          <div className="tt-chamada-texto">
            <span className="sobretitulo" data-item>
              Próximo passo
            </span>
            <h2 id="tt-chamada" className="text-titulo" data-item style={passo(1)}>
              Fale com a equipe.
            </h2>
            <p className="text-frase" data-item style={passo(2)}>
              A melhor próxima etapa é a que começa com informação sobre o seu caso.
            </p>
            <div className="tt-chamada-acoes" data-item style={passo(3)}>
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="button-primary botao-grande"
                data-ima
              >
                Agendar avaliação
                <ArrowUpRight aria-hidden="true" />
              </a>
              <a href={CLINICA.telefoneHref} className="botao botao-claro botao-grande">
                <Phone aria-hidden="true" />
                {CLINICA.telefone}
              </a>
            </div>
            <p className="tt-chamada-local text-pequeno" data-item style={passo(4)}>
              <MapPin aria-hidden="true" />
              <span>
                {CLINICA.local.logradouro}, {CLINICA.local.bairro} · {CLINICA.horario}
              </span>
            </p>
          </div>

          <div className="tt-chamada-foto">
            <MolduraCoroa proporcao={FACHADA.largura / FACHADA.altura}>
              <img
                src={FACHADA.src}
                width={FACHADA.largura}
                height={FACHADA.altura}
                alt={FACHADA.alt}
                sizes="(min-width: 1024px) 34vw, 0px"
                loading="lazy"
                decoding="async"
                style={{ objectPosition: FACHADA.posicao }}
              />
            </MolduraCoroa>
          </div>
        </div>
      </div>
    </section>
  );
}
