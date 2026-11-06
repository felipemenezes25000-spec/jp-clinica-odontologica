import { Ear, ClipboardCheck, MessagesSquare, UsersRound, type LucideIcon } from "lucide-react";

import fotoConsultorio from "@/assets/consultorio-1.webp";
import fotoConsultorio800 from "@/assets/consultorio-1-800.webp";
import fotoConsultorio1100 from "@/assets/consultorio-1-1100.webp";

import { AVALIACOES, CLINICA, HISTORIA, notaBR } from "@/lib/jp";
import { MolduraCoroa } from "@/components/site/sistema/Coroa";
import { Contador } from "@/components/site/ui/Contador";
import { Estrelas } from "@/components/site/ui/Estrelas";
import "./clinica.css";

/**
 * A CLÍNICA — "O jeito JP de cuidar".
 *
 * Os quatro princípios do atendimento em cartões, ao lado de uma foto real do
 * consultório em tamanho médio. Dois selos de vidro por cima da foto carregam
 * a prova: os anos de clínica e a nota do Google. Nada aqui promete resultado;
 * o texto descreve como a consulta acontece.
 */

const PRINCIPIOS: { titulo: string; texto: string; Icone: LucideIcon }[] = [
  {
    titulo: "Escutar antes de indicar",
    texto:
      "A avaliação começa pela sua história, sua queixa e pelo que faz sentido para sua rotina.",
    Icone: Ear,
  },
  {
    titulo: "Explicar sem complicar",
    texto:
      "Você entende as possibilidades, as etapas e o motivo de cada recomendação antes de seguir.",
    Icone: MessagesSquare,
  },
  {
    titulo: "Planejar caso a caso",
    texto:
      "Tratamentos são definidos individualmente, mediante avaliação profissional e necessidade clínica.",
    Icone: ClipboardCheck,
  },
  {
    titulo: "Acompanhar a família",
    texto:
      "Da infância à maturidade, a proposta é oferecer um ponto de cuidado odontológico próximo e confiável.",
    Icone: UsersRound,
  },
];

export function Clinica() {
  return (
    <section id="clinica" className="clinica secao" aria-labelledby="clinica-titulo">
      <div className="quadro">
        <div className="clinica-grade">
          <div className="clinica-midia" data-entra>
            <div data-item className="clinica-midia-miolo">
              <MolduraCoroa proporcao={4 / 5} className="clinica-foto">
                <img
                  src={fotoConsultorio}
                  srcSet={`${fotoConsultorio800} 800w, ${fotoConsultorio1100} 1100w, ${fotoConsultorio} 1400w`}
                  sizes="(min-width: 1024px) 34vw, 88vw"
                  alt="Consultório da JP Clínica, com luz natural e a cadeira preparada"
                  width={1400}
                  height={1045}
                  loading="lazy"
                  decoding="async"
                />
              </MolduraCoroa>

              <div className="vidro flutua clinica-selo-anos">
                <span className="clinica-selo-numero">
                  <Contador valor={HISTORIA.anos} />
                </span>
                <span className="clinica-selo-texto">
                  <strong>anos de clínica</strong>
                  <span>desde {HISTORIA.fundacao}</span>
                </span>
              </div>

              <div className="vidro flutua-2 clinica-selo-google">
                <Estrelas tamanho="0.95rem" />
                <span>
                  <strong>{notaBR}</strong> no Google · {AVALIACOES.total} avaliações
                </span>
              </div>
            </div>
          </div>

          <div className="clinica-texto">
            <div data-entra>
              <p data-item className="sobretitulo">
                Como atendemos
              </p>
              <h2 data-item id="clinica-titulo" className="text-titulo clinica-titulo">
                O jeito JP de cuidar
              </h2>
              <p data-item className="clinica-lead">
                Na {CLINICA.local.bairro}, a consulta é uma conversa: a gente escuta, explica cada
                etapa sem pressa e planeja um cuidado só seu, da criança ao idoso.
              </p>
            </div>

            <ul className="clinica-pontos" data-entra>
              {PRINCIPIOS.map(({ titulo, texto, Icone }) => (
                <li key={titulo} data-item>
                  <div className="clinica-ponto cartao cartao-vivo">
                    <span className="pastilha" aria-hidden="true">
                      <Icone />
                    </span>
                    <h3 className="clinica-ponto-titulo">{titulo}</h3>
                    <p>{texto}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
