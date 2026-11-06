import { ArrowRight, ArrowUpRight } from "lucide-react";

import fotoJanela from "@/assets/consultorio-janela.webp";
import fotoBancada from "@/assets/consultorio-bancada.webp";
import fotoEsterilizacao from "@/assets/esterilizacao.webp";
import fotoEquipamento from "@/assets/equipamento.webp";
import fotoImplantes from "@/assets/consultorio-implantes-1.webp";
import fotoConsultorio from "@/assets/consultorio-2.webp";
import fotoOrtodontia from "@/assets/consultorio-1.webp";
import fotoLilas from "@/assets/consultorio-cadeira-lilas.webp";

import { CUIDADOS_COMPLEMENTARES, TRATAMENTOS } from "@/lib/jp";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { MolduraCoroa } from "@/components/site/sistema/Coroa";
import "./home/tratamentos.css";

type Foto = { src: string; largura: number; altura: number; pos?: string };

/**
 * Foto de cada tratamento, por slug.
 *
 * Só fotos reais do consultório, sem paciente e sem procedimento (Resolução
 * CFO 196/2019). O que muda de um item para outro é o enquadramento (`pos`),
 * escolhido para o recorte do cartão pegar a peça certa: cadeira, equipo,
 * bancada.
 */
const FOTOS: Record<string, Foto> = {
  "limpeza-profilaxia": { src: fotoEsterilizacao, largura: 1200, altura: 967, pos: "50% 40%" },
  "clareamento-dental": { src: fotoJanela, largura: 665, altura: 480, pos: "60% 50%" },
  restauracoes: { src: fotoEquipamento, largura: 1200, altura: 967, pos: "50% 50%" },
  "implantes-dentarios": { src: fotoImplantes, largura: 1200, altura: 1500, pos: "50% 45%" },
  "proteses-dentarias": { src: fotoConsultorio, largura: 1200, altura: 896, pos: "70% 55%" },
  ortodontia: { src: fotoOrtodontia, largura: 1400, altura: 1045, pos: "75% 50%" },
  odontopediatria: { src: fotoLilas, largura: 665, altura: 480, pos: "50% 60%" },
  "harmonizacao-orofacial": { src: fotoBancada, largura: 665, altura: 480, pos: "45% 50%" },
};

/**
 * Resumo curto de cada item — o `desc` de jp.ts é longo demais para o cartão.
 *
 * Três saem do texto de referência: clareamento, implantes e harmonização
 * prometiam resultado ("seguro e eficaz", "duráveis e seguras", "valorizam
 * sua beleza"). A Resolução CFO 196/2019 veda garantia de resultado na
 * publicidade odontológica.
 */
const RESUMOS: Record<string, string> = {
  "limpeza-profilaxia":
    "Remoção de placa bacteriana e tártaro para prevenir cáries e doenças gengivais.",
  "clareamento-dental":
    "Clareamento com protocolo definido em avaliação, respeitando a sua sensibilidade.",
  restauracoes: "Tratamentos estéticos e funcionais para recuperar a saúde do seu dente.",
  "implantes-dentarios":
    "Reposição de dentes perdidos com planejamento individual e acompanhamento.",
  "proteses-dentarias": "Devolvemos função e estética com próteses confortáveis e personalizadas.",
  ortodontia: "Alinhamento dos dentes e da mordida com opções discretas e eficientes.",
  odontopediatria: "Cuidado especializado para a saúde bucal de crianças e adolescentes.",
  "harmonizacao-orofacial": "Procedimentos estéticos faciais realizados mediante avaliação.",
};

/** Os cartões largos da grade de quatro colunas; os demais ocupam uma. */
const LARGOS = new Set([
  "limpeza-profilaxia",
  "ortodontia",
  "odontopediatria",
  "harmonizacao-orofacial",
]);

function CartaoTratamento({ slug, titulo }: { slug: string; titulo: string }) {
  const foto = FOTOS[slug];

  return (
    <li data-item className="trat-item" data-largo={LARGOS.has(slug) ? "" : undefined}>
      <a href={`/tratamentos/${slug}`} className="trat-cartao cartao">
        <MolduraCoroa medir className="trat-foto">
          {foto && (
            <img
              src={foto.src}
              alt=""
              width={foto.largura}
              height={foto.altura}
              sizes="(min-width: 1024px) 28vw, (min-width: 640px) 46vw, 92vw"
              loading="lazy"
              decoding="async"
              style={{ objectPosition: foto.pos }}
            />
          )}
        </MolduraCoroa>
        <span className="trat-texto">
          <span className="trat-nome">{titulo}</span>
          <span className="trat-desc">{RESUMOS[slug]}</span>
        </span>
        <span className="trat-seta" aria-hidden="true">
          <ArrowUpRight />
        </span>
      </a>
    </li>
  );
}

export function SpecialtiesSection() {
  const waOrientacao = useContatoWhatsApp("orientacao");

  return (
    <section id="tratamentos" className="trat-secao secao secao-clara">
      <div className="quadro">
        <div data-entra className="trat-cabeca">
          <div data-item>
            <p className="sobretitulo">Tratamentos</p>
            <h2 data-linhas className="text-titulo trat-titulo">
              Cuidado completo, em todas as fases da vida
            </h2>
          </div>
          <p data-item className="trat-contagem selo">
            <strong>{TRATAMENTOS.length}</strong> especialidades com página própria
          </p>
        </div>

        <ul className="trat-grade" data-entra>
          {TRATAMENTOS.map((t) => (
            <CartaoTratamento key={t.slug} slug={t.slug} titulo={t.titulo} />
          ))}
        </ul>

        {/* AS ÁREAS SEM PÁGINA.

            A grade tem oito itens com página; a clínica atende outras áreas.
            Entram como lista e não como cartão porque cartão promete página, e
            página de tratamento neste site tem manifesto, etapas e FAQ escritos
            com a clínica. O que se sabe hoje é que a clínica faz. */}
        <div className="trat-outras" data-entra>
          <h3 data-item className="trat-outras-titulo">
            Também atendemos
          </h3>
          <ul data-item className="trat-outras-lista">
            {CUIDADOS_COMPLEMENTARES.map((area) => (
              <li key={area}>{area}</li>
            ))}
          </ul>
        </div>

        <div className="trat-convite cartao" data-entra>
          <div data-item>
            <h3 className="trat-convite-titulo">Não sabe qual tratamento? A avaliação indica.</h3>
            <p>A indicação ideal depende da avaliação profissional, caso a caso.</p>
          </div>
          <a
            data-item
            href={waOrientacao}
            target="_blank"
            rel="noopener noreferrer"
            className="botao botao-acento"
            data-ima
          >
            Quero entender meu caso
            <ArrowRight aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
