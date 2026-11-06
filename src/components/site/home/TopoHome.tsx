import { ArrowUpRight, Phone, Quote, ShieldCheck } from "lucide-react";

import fotoCadeira from "@/assets/consultorio-implantes-1.webp";

import { AVALIACOES, CLINICA, DEPOIMENTOS, HISTORIA, RESPONSAVEL_TECNICA, notaBR } from "@/lib/jp";
import { CONVENIOS_SITE } from "@/components/site/convenios-do-site";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { MolduraCoroa } from "@/components/site/sistema/Coroa";
import {
  DIAS_DO_EXPEDIENTE_CURTO,
  FAIXA_DO_EXPEDIENTE,
  useSituacao,
} from "@/components/site/sistema/horario";
import { AvataresEquipe } from "@/components/site/ui/AvataresEquipe";
import { AVATAR_POR_NOME, DENTISTAS } from "@/components/site/ui/avatares";
import { Estrelas } from "@/components/site/ui/Estrelas";
import "./topo-home.css";

/**
 * O TOPO DA HOME — "clínica de bairro com cara de gente".
 *
 * A primeira dobra responde, nesta ordem, às quatro perguntas de quem procura
 * dentista: dá para confiar? (a nota do Google, antes do título), é perto?
 * (o bairro no H1, a rua na frase), quem atende? (rostos reais da equipe e a
 * responsável técnica com CRO) e como marco? (o WhatsApp, maior que tudo, e o
 * telefone ao lado). A foto é o consultório de verdade, com dois cartões de
 * vidro por cima: um depoimento real do Google e a responsável técnica.
 *
 * Sem cena de rolagem: o topo carrega parado e inteiro. O que se mexe é pouco
 * e lento — os cartões respiram — e some com "reduzir movimento".
 */

const RUA = CLINICA.local.logradouro.replace(/^R\.\s/, "Rua ");
/** O depoimento curto da Valéria cabe no cartão sem cortar frase. */
const DEPOIMENTO = DEPOIMENTOS.find((d) => d.autor === "Valéria C.") ?? DEPOIMENTOS[0];

export function TopoHome() {
  const wa = useContatoWhatsApp("agendar");
  const situacao = useSituacao();

  return (
    <section id="inicio" className="topo-home fundo-brilho" aria-labelledby="topo-titulo">
      <div className="quadro topo-home-grade">
        <div className="topo-home-texto">
          <a href="#depoimentos" className="selo topo-home-selo">
            <span className="topo-home-selo-estrelas">
              <Estrelas tamanho="0.95rem" />
            </span>
            <span>
              <strong>{notaBR}</strong> no Google · {AVALIACOES.total} avaliações
            </span>
          </a>

          <h1 id="topo-titulo" className="topo-home-titulo">
            Dentista na <span className="whitespace-nowrap">Freguesia do Ó</span>
          </h1>

          <p className="topo-home-frase">
            Desde {HISTORIA.fundacao} cuidando de crianças, adultos e idosos, com dentistas
            identificados pelo CRO. Hoje na {RUA}, {CLINICA.local.bairro}.
          </p>

          <div className="topo-home-acoes">
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
            <a href={CLINICA.telefoneHref} className="botao botao-chao botao-grande">
              <Phone aria-hidden="true" />
              {CLINICA.telefone}
            </a>
          </div>

          <ul className="topo-home-confianca">
            <li>
              <AvataresEquipe max={4} tamanho={40} />
              <span>
                <strong>{DENTISTAS.length} dentistas</strong>
                <span>com registro no CRO</span>
              </span>
            </li>
            <li>
              <span className="pastilha" aria-hidden="true">
                <ShieldCheck />
              </span>
              <span>
                <strong>{CONVENIOS_SITE.length} convênios</strong>
                <a href="#convenios" className="link">
                  ver quais
                </a>
              </span>
            </li>
            <li>
              <span
                className="topo-home-ponto"
                data-aberto={situacao?.aberto ? "" : undefined}
                aria-hidden="true"
              />
              <span>
                <strong>{situacao?.aberto ? "Aberto agora" : DIAS_DO_EXPEDIENTE_CURTO}</strong>
                <span>
                  {situacao === null
                    ? FAIXA_DO_EXPEDIENTE
                    : situacao.aberto
                      ? situacao.texto.replace(/^Aberto agora · /, "")
                      : situacao.texto.replace(/^Fechado · /, "")}
                </span>
              </span>
            </li>
          </ul>
        </div>

        <div className="topo-home-midia">
          <MolduraCoroa proporcao={4 / 5} className="topo-home-foto">
            <img
              src={fotoCadeira}
              width={1200}
              height={1500}
              sizes="(min-width: 1024px) 40vw, 92vw"
              alt="Consultório da JP Clínica Odontológica, com a cadeira pronta para o atendimento"
              fetchPriority="high"
              decoding="sync"
            />
          </MolduraCoroa>

          {DEPOIMENTO && (
            <figure className="vidro flutua topo-home-depoimento">
              <Quote aria-hidden="true" className="topo-home-aspas" />
              <blockquote>“{DEPOIMENTO.texto}”</blockquote>
              <figcaption>
                {DEPOIMENTO.autor} · <span>avaliação no Google</span>
              </figcaption>
            </figure>
          )}

          <div className="vidro flutua-2 topo-home-rt">
            {AVATAR_POR_NOME[RESPONSAVEL_TECNICA.nome] && (
              <img
                src={AVATAR_POR_NOME[RESPONSAVEL_TECNICA.nome]}
                alt=""
                width={48}
                height={48}
                loading="lazy"
                decoding="async"
              />
            )}
            <span>
              <span className="topo-home-rt-papel">Responsável técnica</span>
              <strong>{RESPONSAVEL_TECNICA.nome}</strong>
              <span className="topo-home-rt-cro">{RESPONSAVEL_TECNICA.registro}</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
