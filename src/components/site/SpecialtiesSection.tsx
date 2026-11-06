import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

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
import { MarcaCoroa, MolduraCoroa } from "@/components/site/sistema/Coroa";
import { comGsap } from "@/components/site/sistema/gsap";
import "./home/tratamentos.css";

type Foto = { src: string; largura: number; altura: number; pos?: string };

/**
 * Foto de cada tratamento, por slug.
 *
 * Só fotos reais do consultório, sem paciente e sem procedimento (Resolução
 * CFO 196/2019). Antes seis delas eram renders de objeto em fundo branco, que
 * pareciam banco de imagem e sumiam no chão; agora a lista inteira tem a mesma
 * luz e o mesmo grade. O que muda de um item para outro é o enquadramento
 * (`pos`), escolhido para o recorte quadrado da miniatura pegar a peça certa:
 * cadeira, equipo, bancada.
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
 * Resumo curto de cada item — o `desc` de jp.ts é longo demais para esta linha.
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

const CONSULTA_PREVIA = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";
const CONSULTA_QUIETO = "(prefers-reduced-motion: reduce)";

/**
 * A prévia grande que acompanha o cursor só existe com mouse, tela larga e
 * movimento permitido. Decidido depois da hidratação: o servidor nunca a
 * desenha, então o HTML é igual nos dois lados. As duas consultas são
 * escutadas: um híbrido que troca de ponteiro (tablet com mouse, por exemplo)
 * ganha ou perde a prévia na hora, sem recarregar.
 */
function usePrevia(): boolean {
  const [ativa, setAtiva] = useState(false);
  useEffect(() => {
    const previa = window.matchMedia(CONSULTA_PREVIA);
    const quieto = window.matchMedia(CONSULTA_QUIETO);
    const atualizar = () => setAtiva(previa.matches && !quieto.matches);
    atualizar();
    previa.addEventListener("change", atualizar);
    quieto.addEventListener("change", atualizar);
    return () => {
      previa.removeEventListener("change", atualizar);
      quieto.removeEventListener("change", atualizar);
    };
  }, []);
  return ativa;
}

function ListaDeTratamentos() {
  const listaRef = useRef<HTMLDivElement>(null);
  const previaRef = useRef<HTMLDivElement>(null);
  const comPrevia = usePrevia();
  const [slugAtivo, setSlugAtivo] = useState(TRATAMENTOS[0]?.slug ?? "");
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const lista = listaRef.current;
    const previa = previaRef.current;
    if (!comPrevia || !lista || !previa) return;

    let cancelado = false;
    let limpar = () => {};

    comGsap(({ gsap }) => {
      if (cancelado) return;
      // Atraso suave: a prévia chega ao cursor um instante depois dele.
      const irX = gsap.quickTo(previa, "x", { duration: 0.7, ease: "power3.out" });
      const irY = gsap.quickTo(previa, "y", { duration: 0.7, ease: "power3.out" });
      // A inclinação segue a velocidade horizontal e volta ao eixo com mola.
      const girar = gsap.quickTo(previa, "rotation", {
        duration: 0.8,
        ease: "elastic.out(1, 0.55)",
      });
      let ultimoX = 0;
      let primeiro = true;
      let parar = 0;
      // O último item sob o cursor. Só o que muda vira estado: pointermove
      // dispara dezenas de vezes por segundo e o React não precisa saber de
      // cada uma. O vão entre as colunas não tem [data-slug]; ali a prévia
      // fica no item anterior em vez de piscar.
      let atual = "";

      const aoMover = (e: PointerEvent) => {
        const alvo = (e.target as HTMLElement).closest<HTMLElement>("[data-slug]");
        const slug = alvo?.dataset["slug"];
        if (slug && slug !== atual) {
          atual = slug;
          setSlugAtivo(slug);
        }

        const caixa = lista.getBoundingClientRect();
        const l = previa.offsetWidth;
        const a = previa.offsetHeight;
        const cx = e.clientX - caixa.left;
        const cy = e.clientY - caixa.top;
        // À direita do cursor; se não couber, vai para a esquerda. Nunca sai
        // da lista, para não criar rolagem horizontal.
        const x = cx + 40 + l > caixa.width ? cx - 40 - l : cx + 40;
        const y = Math.min(Math.max(cy - a / 2, 0), Math.max(caixa.height - a, 0));

        if (primeiro) {
          gsap.set(previa, { x, y, rotation: 0 });
          primeiro = false;
          setVisivel(true);
        } else {
          irX(x);
          irY(y);
          girar(Math.max(-7, Math.min(7, (e.clientX - ultimoX) * 0.5)));
          window.clearTimeout(parar);
          parar = window.setTimeout(() => girar(0), 90);
        }
        ultimoX = e.clientX;
      };
      const aoSair = () => {
        setVisivel(false);
        primeiro = true;
        window.clearTimeout(parar);
      };

      lista.addEventListener("pointermove", aoMover);
      lista.addEventListener("pointerleave", aoSair);
      limpar = () => {
        lista.removeEventListener("pointermove", aoMover);
        lista.removeEventListener("pointerleave", aoSair);
        window.clearTimeout(parar);
        gsap.killTweensOf(previa);
        setVisivel(false);
      };
    });

    return () => {
      cancelado = true;
      limpar();
    };
  }, [comPrevia]);

  return (
    <div ref={listaRef} className="tratamentos-lista">
      <ul className="tratamentos-itens" data-entra>
        {TRATAMENTOS.map((t) => {
          const foto = FOTOS[t.slug];
          return (
            <li key={t.slug} data-item data-slug={t.slug}>
              <a href={`/tratamentos/${t.slug}`} className="tratamento-link">
                <MolduraCoroa proporcao={1} className="tratamento-miniatura">
                  {foto && (
                    <img
                      src={foto.src}
                      alt=""
                      width={foto.largura}
                      height={foto.altura}
                      loading="lazy"
                      decoding="async"
                      style={{ objectPosition: foto.pos }}
                    />
                  )}
                </MolduraCoroa>
                <span>
                  <span className="tratamento-nome">
                    {t.titulo}
                    <ArrowRight aria-hidden="true" />
                  </span>
                  <span className="tratamento-desc">{RESUMOS[t.slug]}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>

      {comPrevia && (
        <div
          ref={previaRef}
          className="tratamentos-previa"
          aria-hidden="true"
          data-visivel={visivel ? "" : undefined}
        >
          <div className="tratamentos-previa-miolo">
            <MolduraCoroa proporcao={4 / 5}>
              {TRATAMENTOS.map((t) => {
                const foto = FOTOS[t.slug];
                return foto ? (
                  <img
                    key={t.slug}
                    src={foto.src}
                    alt=""
                    width={foto.largura}
                    height={foto.altura}
                    loading="lazy"
                    decoding="async"
                    style={{ objectPosition: foto.pos }}
                    data-ativa={t.slug === slugAtivo ? "" : undefined}
                  />
                ) : null;
              })}
            </MolduraCoroa>
          </div>
        </div>
      )}
    </div>
  );
}

export function SpecialtiesSection() {
  const waOrientacao = useContatoWhatsApp("orientacao");

  return (
    <section id="tratamentos" className="secao pb-0">
      <div className="quadro">
        <div data-entra>
          {/* A contagem fica colada ao título, na mesma linha de base: no canto
              direito ela ficava a mil pixels do que conta. */}
          <div data-item className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <h2 data-linhas className="text-titulo">
              Tratamentos
            </h2>
            <p className="text-frase text-tinta-suave">
              <span data-numero={TRATAMENTOS.length} data-casas="0">
                {TRATAMENTOS.length}
              </span>{" "}
              especialidades
            </p>
          </div>
          <p data-item className="mt-5 max-w-xl text-corpo text-tinta-suave">
            Cuidado completo para o seu sorriso, em todas as fases da vida.
          </p>
        </div>

        <div className="mt-10 lg:mt-14">
          <ListaDeTratamentos />
        </div>

        {/* AS ÁREAS SEM PÁGINA.

            A lista acima tem oito itens com página; a clínica atende outras
            áreas, que não existiam em lugar nenhum do site. Entram como lista e
            não como item de menu porque item de menu promete página, e página
            de tratamento neste site tem manifesto, etapas e FAQ escritos com a
            clínica. O que se sabe hoje é que a clínica faz — e é isso que a
            lista diz, nada além. */}
        <div className="mt-16 lg:mt-24" data-entra>
          <h3 data-item className="text-frase">
            Também atendemos
          </h3>
          <ul data-item className="tratamentos-outras mt-6">
            {CUIDADOS_COMPLEMENTARES.map((area) => (
              <li key={area}>
                <MarcaCoroa />
                {area}
              </li>
            ))}
          </ul>

          <div data-item className="tratamentos-convite ladrilho mt-12">
            <p className="text-frase">A indicação ideal depende da avaliação profissional.</p>
            <a
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
      </div>
    </section>
  );
}
