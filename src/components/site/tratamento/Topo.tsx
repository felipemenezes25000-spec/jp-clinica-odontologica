import { ArrowLeft, ArrowUpRight, Clock, MapPin, Phone } from "lucide-react";

import { TreatmentVideo } from "@/components/site/TreatmentVideo";
import { MolduraCoroa } from "@/components/site/sistema/Coroa";
import { AvataresEquipe } from "@/components/site/ui/AvataresEquipe";
import { AVATAR_POR_NOME, DENTISTAS } from "@/components/site/ui/avatares";
import { Estrelas } from "@/components/site/ui/Estrelas";
import { DIAS_DO_EXPEDIENTE, FAIXA_DO_EXPEDIENTE } from "@/components/site/sistema/horario";
import {
  AVALIACOES,
  CLINICA,
  HISTORIA,
  RESPONSAVEL_TECNICA,
  notaBR,
  type Tratamento,
} from "@/lib/jp";
import { fotoDoTopo, type Animacao } from "./midia";
import "./tratamento.css";

/** "R. Rio Verde, 1029" é como o cadastro escreve; na frase, a rua por extenso. */
const RUA = CLINICA.local.logradouro.replace(/^R\.\s/, "Rua ");

/**
 * O TOPO DE UMA PÁGINA DE TRATAMENTO — a mesma gramática do topo da home.
 *
 * A primeira dobra responde, nesta ordem, às perguntas de quem decide em
 * segundos: dá para confiar? (o selo da nota do Google, antes do título), é
 * isto que procuro? (o H1), como marco? (o WhatsApp, maior que tudo, e o
 * telefone ao lado), quem atende e onde? (rostos da equipe, bairro e horário).
 * À direita, a animação ilustrativa do tratamento — ou, onde não há animação,
 * o consultório de verdade — com dois cartões de vidro por cima.
 *
 * O H1 É A CORRESPONDÊNCIA COM A BUSCA, e ela muda com o modo.
 * Orgânica: o nome do tratamento. Paga: o procedimento + o bairro, as duas
 * coisas que a pessoa digitou — o Índice de Qualidade do Google cobra, no
 * custo por clique, quando o anúncio e a primeira dobra dizem coisas
 * diferentes, e quem pesquisou o bairro precisa reencontrá-lo sem rolar.
 * Na paga o procedimento é o `termo` da rota (o mesmo do `<title>`), com
 * `short` só de reserva.
 *
 * Nada aqui espera o JavaScript: H1, frase e botões saem parados no HTML do
 * servidor (o LCP de uma página de anúncio é o texto), e o selo da nota é
 * estático — nada de contador na primeira dobra.
 */
export function Topo({
  tratamento,
  modo,
  animacao,
  wa,
  termo,
}: {
  tratamento: Tratamento;
  modo: "organico" | "anuncio";
  animacao: Animacao | undefined;
  wa: string;
  /** O procedimento como a rota de anúncio o chama; vale só no modo anúncio. */
  termo?: string | undefined;
}) {
  const anuncio = modo === "anuncio";
  const foto = fotoDoTopo();
  const procedimento = termo ?? tratamento.short;
  const retrato = AVATAR_POR_NOME[RESPONSAVEL_TECNICA.nome];

  return (
    <section id="inicio" className="tt-topo fundo-brilho" aria-labelledby="tt-titulo">
      <div className="quadro tt-topo-grade">
        <div className="tt-texto">
          {/* Na orgânica a primeira coisa é a volta para a lista — quem chegou
              pela busca pode estar comparando procedimentos. Na paga ela não
              existe: seria a primeira saída de uma página que a clínica pagou
              para a pessoa abrir. */}
          {!anuncio && (
            <a href="/#tratamentos" className="tt-voltar link">
              <ArrowLeft aria-hidden="true" /> Todos os tratamentos
            </a>
          )}

          <a href="#depoimentos" className="selo tt-selo">
            <span className="tt-selo-estrelas">
              <Estrelas tamanho="0.95rem" />
            </span>
            <span>
              <strong>{notaBR}</strong> no Google · {AVALIACOES.total} avaliações
            </span>
          </a>

          <h1 id="tt-titulo" className={anuncio ? "tt-h1 tt-h1-anuncio" : "tt-h1"}>
            {anuncio ? (
              <>
                {procedimento}
                {/* O espaço não é enfeite: sem ele o leitor de tela anuncia
                    "Limpezana Freguesia do Ó" numa palavra só quando o bairro
                    cai numa linha própria. */}{" "}
                <span className="tt-h1-bairro">na {HISTORIA.regiaoAtual}</span>
              </>
            ) : (
              tratamento.titulo
            )}
          </h1>

          <p className="tt-frase">{tratamento.kicker}</p>
          <p className="tt-desc">{tratamento.desc}</p>

          <div className="tt-acoes">
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="button-primary botao-grande"
              data-ima
            >
              {anuncio
                ? `Agendar avaliação de ${tratamento.short.toLowerCase()}`
                : "Agendar avaliação"}
              <ArrowUpRight aria-hidden="true" />
            </a>
            <a href={CLINICA.telefoneHref} className="botao botao-chao botao-grande">
              <Phone aria-hidden="true" />
              {CLINICA.telefone}
            </a>
          </div>

          {/* Três provas curtas: quem atende, onde fica, quando abre. O bairro
              e a região ficam aqui, na primeira dobra, fora do rodapé. */}
          <ul className="tt-confianca">
            <li>
              <AvataresEquipe max={4} tamanho={40} />
              <span>
                <strong>{DENTISTAS.length} dentistas</strong>
                <span>com registro no CRO</span>
              </span>
            </li>
            <li>
              <span className="pastilha" aria-hidden="true">
                <MapPin />
              </span>
              <span>
                <strong>{CLINICA.local.bairro}</strong>
                <span>
                  {RUA}, região da {HISTORIA.regiaoAtual}
                </span>
              </span>
            </li>
          </ul>
        </div>

        <div className="tt-midia">
          <div className="tt-pecas">
            {animacao ? (
              <div className="tt-janela">
                <TreatmentVideo
                  src={animacao.src}
                  poster={animacao.poster}
                  descricao={animacao.descricao}
                  medir
                  legenda={false}
                  className="tt-video"
                />
              </div>
            ) : (
              <MolduraCoroa proporcao={4 / 5} className="tt-foto-topo">
                <img
                  src={foto.src}
                  width={foto.largura}
                  height={foto.altura}
                  alt={foto.alt}
                  sizes="(min-width: 1024px) 40vw, 92vw"
                  fetchPriority="high"
                  decoding="sync"
                  style={foto.posicao ? { objectPosition: foto.posicao } : undefined}
                />
              </MolduraCoroa>
            )}

            <div className="vidro flutua-2 tt-cartao-horario">
              <span className="pastilha" aria-hidden="true">
                <Clock />
              </span>
              <span>
                <strong>{DIAS_DO_EXPEDIENTE}</strong>
                <span>{FAIXA_DO_EXPEDIENTE}</span>
              </span>
            </div>

            <div className="vidro flutua tt-cartao-rt">
              {retrato && (
                <img src={retrato} alt="" width={48} height={48} loading="lazy" decoding="async" />
              )}
              <span>
                <span className="tt-cartao-papel">Responsável técnica</span>
                <strong>{RESPONSAVEL_TECNICA.nome}</strong>
                <span className="tt-cartao-cro">{RESPONSAVEL_TECNICA.registro}</span>
              </span>
            </div>
          </div>

          {animacao && (
            <p className="tt-rotulo text-pequeno">
              <strong>Animação ilustrativa.</strong> {animacao.descricao} O planejamento do seu caso
              depende da avaliação profissional.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
