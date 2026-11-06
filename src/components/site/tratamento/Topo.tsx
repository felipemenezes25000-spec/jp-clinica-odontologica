import type { CSSProperties } from "react";
import { ArrowLeft, ArrowUpRight, MapPin } from "lucide-react";

import { GoogleRating } from "@/components/site/GoogleRating";
import { TreatmentVideo } from "@/components/site/TreatmentVideo";
import { FormaCoroa, MolduraCoroa } from "@/components/site/sistema/Coroa";
import { CLINICA, HISTORIA, type Tratamento } from "@/lib/jp";
import { fotoDoTopo, type Animacao } from "./midia";
import "./tratamento.css";

/** "R. Rio Verde, 1029" é como o cadastro escreve; na frase, a rua por extenso. */
const RUA = CLINICA.local.logradouro.replace(/^R\.\s/, "Rua ");

/**
 * O TOPO DE UMA PÁGINA DE TRATAMENTO.
 *
 * Texto à esquerda, janela à direita com o eco verde — a mesma
 * linguagem do topo da home, sem a cena de rolagem (a pessoa aqui veio por um
 * assunto e quer ler, não atravessar uma sala).
 *
 * O H1 É A CORRESPONDÊNCIA COM A BUSCA, e ela muda com o modo.
 * Orgânica: o nome do tratamento. Paga: o procedimento + o bairro, as duas
 * coisas que a pessoa digitou — o Índice de Qualidade do Google cobra, no
 * custo por clique, quando o anúncio e a primeira dobra dizem coisas
 * diferentes, e quem pesquisou o bairro precisa reencontrá-lo sem rolar.
 * Na paga o procedimento é o `termo` da rota — o MESMO que ela anuncia no
 * `<title>` ("Aparelho e ortodontia", "Dentista infantil") —, com `short` só de
 * reserva. Cortar para o substantivo curto fazia "aparelho" sumir da primeira
 * dobra de quem pesquisou "aparelho". Para o termo caber em duas linhas no
 * celular o H1 da paga tem tamanho próprio (`.tt-h1-anuncio`), em vez de
 * perder palavra.
 *
 * A frase de apoio é o `kicker` do tratamento: uma sentença que não repete a
 * palavra do H1.
 *
 * O CTA primário é um só no site — e o modo anúncio abre a única exceção:
 * "Agendar avaliação de implantes", derivado do dado, igual nas oito LPs.
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

  return (
    <section className="tt-topo" aria-labelledby="tt-titulo">
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

          {/* O H1 e a frase NÃO entram animados: o LCP de uma página de anúncio
              é o texto, e segurá-lo atrás de 1s de animação custa Core Web
              Vitals — e Índice de Qualidade — por um efeito que ninguém pediu
              para o título. O que se mexe é a janela e o que vem depois. */}
          <h1 id="tt-titulo" className={anuncio ? "tt-h1-anuncio" : "text-display"}>
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

          <p className="tt-frase text-frase">{tratamento.kicker}</p>
          <p className="tt-desc text-corpo">{tratamento.desc}</p>

          <div className="tt-acoes" data-chega style={{ "--d": "120ms" } as CSSProperties}>
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="button-primary"
              data-ima
            >
              {anuncio
                ? `Agendar avaliação de ${tratamento.short.toLowerCase()}`
                : "Agendar avaliação"}
              <ArrowUpRight aria-hidden="true" />
            </a>
            <a href="#entenda" className="botao botao-chao">
              Entender o tratamento
            </a>
          </div>

          {/* A prova social fica na primeira dobra, ao lado de onde a clínica
              fica: são as duas respostas que quem decide em segundos procura
              ("dá para confiar?" e "é perto de mim?"). */}
          <ul className="tt-fatos" data-chega style={{ "--d": "220ms" } as CSSProperties}>
            <li>
              <a
                href={CLINICA.mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="alvo-toque gap-2"
              >
                <GoogleRating variante="selo" />
                <ArrowUpRight aria-hidden="true" />
              </a>
            </li>
            <li>
              <MapPin aria-hidden="true" />
              <span>
                {RUA}, {CLINICA.local.bairro}, região da {HISTORIA.regiaoAtual}
              </span>
            </li>
          </ul>
        </div>

        <div className="tt-direita">
          <div className="tt-janela">
            <FormaCoroa proporcao={0.92} className="tt-eco" />
            <div className="tt-abre">
              {animacao ? (
                <TreatmentVideo
                  src={animacao.src}
                  poster={animacao.poster}
                  descricao={animacao.descricao}
                  medir
                  legenda={false}
                />
              ) : (
                <MolduraCoroa medir proporcao={0.92}>
                  <img
                    src={foto.src}
                    width={foto.largura}
                    height={foto.altura}
                    alt={foto.alt}
                    sizes="(min-width: 1024px) 45vw, 100vw"
                    fetchPriority="high"
                    decoding="sync"
                  />
                </MolduraCoroa>
              )}
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
