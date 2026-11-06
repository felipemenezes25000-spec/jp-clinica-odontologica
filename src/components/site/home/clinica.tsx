import fotoConsultorio from "@/assets/consultorio-1.webp";
import fotoConsultorio800 from "@/assets/consultorio-1-800.webp";
import fotoConsultorio1100 from "@/assets/consultorio-1-1100.webp";
import recepcaoImg from "@/assets/recepcao.webp";
import bancadaImg from "@/assets/consultorio-bancada.webp";
import janelaImg from "@/assets/consultorio-janela.webp";

import { MarcaCoroa, MolduraCoroa } from "@/components/site/sistema/Coroa";
import "./clinica.css";

/**
 * A CLÍNICA — "Statement with inline thumbnails".
 *
 * Uma frase grande sobre o jeito JP de atender, com três miniaturas de fotos
 * reais dentro da linha, cada uma na sua coroa (0,85em de altura, então acompanham
 * o tamanho da letra em qualquer largura). É a frase que acende palavra por
 * palavra com a rolagem (`data-tinta`, a única da página).
 *
 * Abaixo, os quatro princípios do método como pontos marcados pela coroa — sem
 * cards — ao lado de uma foto grande do consultório.
 */

const PRINCIPIOS = [
  {
    titulo: "Escutar antes de indicar",
    texto:
      "A avaliação começa pela sua história, sua queixa e pelo que faz sentido para sua rotina.",
  },
  {
    titulo: "Explicar sem complicar",
    texto:
      "Você entende as possibilidades, as etapas e o motivo de cada recomendação antes de seguir.",
  },
  {
    titulo: "Planejar caso a caso",
    texto:
      "Tratamentos são definidos individualmente, mediante avaliação profissional e necessidade clínica.",
  },
  {
    titulo: "Acompanhar a família",
    texto:
      "Da infância à maturidade, a proposta é oferecer um ponto de cuidado odontológico próximo e confiável.",
  },
];

/** A miniatura é decorativa: a frase já diz tudo, e um alt aqui interromperia a leitura. */
function Miniatura({ src }: { src: string }) {
  return (
    <MolduraCoroa as="span" proporcao={1.35} aria-hidden="true" className="clinica-mini">
      <img src={src} alt="" width={665} height={480} loading="lazy" decoding="async" />
    </MolduraCoroa>
  );
}

export function Clinica() {
  return (
    <section id="clinica" className="clinica secao" aria-labelledby="clinica-titulo">
      <div className="quadro">
        <h2 id="clinica-titulo" className="text-titulo" data-linhas>
          O jeito JP de cuidar
        </h2>

        <p className="clinica-frase text-frase" data-tinta>
          Aqui a gente escuta <Miniatura src={recepcaoImg} /> antes de indicar, explica cada etapa{" "}
          <Miniatura src={bancadaImg} /> sem pressa e planeja um cuidado só seu, da criança ao idoso{" "}
          <Miniatura src={janelaImg} />.
        </p>

        <div className="clinica-corpo">
          {/* O obturador anima o `clip-path` do elemento em que está, e na
              própria moldura ele apagaria a máscara da coroa; por isso mora
              num invólucro, e a coroa continua sendo a moldura. */}
          <div className="clinica-foto" data-obturador>
            <MolduraCoroa medir proporcao={1.1} className="clinica-moldura">
              <img
                src={fotoConsultorio}
                srcSet={`${fotoConsultorio800} 800w, ${fotoConsultorio1100} 1100w, ${fotoConsultorio} 1400w`}
                sizes="(min-width: 1024px) 40vw, calc(100vw - 2rem)"
                alt="Consultório da JP Clínica, com luz natural e a cadeira preparada"
                width={1400}
                height={1045}
                loading="lazy"
                decoding="async"
              />
            </MolduraCoroa>
          </div>

          <ul className="clinica-pontos" data-entra>
            {PRINCIPIOS.map((p) => (
              <li key={p.titulo} data-item>
                <h3 className="text-corpo clinica-ponto-titulo">
                  <MarcaCoroa className="clinica-marca" />
                  {p.titulo}
                </h3>
                <p className="text-corpo">{p.texto}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
