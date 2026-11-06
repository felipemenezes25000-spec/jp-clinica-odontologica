import { useCallback, useState } from "react";
import { ArrowUpRight, Expand, Instagram } from "lucide-react";

import { CLINICA } from "@/lib/jp";
import { MolduraCoroa } from "@/components/site/sistema/Coroa";
import { GALLERY } from "./galeria-dados";
import { VisorFoto } from "./galeria-visor";
import "./estrutura.css";

/**
 * A ESTRUTURA — as fotos reais da clínica numa grade bento.
 *
 * Quatro colunas no desktop, duas no celular, com um ladrilho grande (2x2) e
 * um alto (1x2) para quebrar o ritmo; quem manda nas posições é o CSS, e a
 * forma de cada foto vem de `galeria-dados.ts`. Sem cena de rolagem, sem
 * trilha: a seção carrega inteira e parada.
 *
 * Cada foto é um <button> que abre o visor com a versão inteira (setas, Esc e
 * foco preso lá dentro). A legenda é o nome do espaço, em um selo de vidro por
 * cima da foto. O último ladrilho convida para o Instagram da clínica.
 */
export function Estrutura() {
  const [ampliada, setAmpliada] = useState<number | null>(null);

  const fechar = useCallback(() => setAmpliada(null), []);
  const navegar = useCallback(
    (passo: number) =>
      setAmpliada((i) => (i === null ? i : (i + passo + GALLERY.length) % GALLERY.length)),
    [],
  );

  return (
    <section
      id="estrutura"
      className="estrutura secao secao-clara"
      aria-labelledby="estrutura-titulo"
    >
      <div className="quadro">
        <header className="estrutura-cabeca" data-entra>
          <div data-item>
            <p className="sobretitulo">Estrutura</p>
            <h2 id="estrutura-titulo" className="estrutura-titulo text-titulo">
              A clínica por dentro
            </h2>
          </div>
          <p className="estrutura-lide text-corpo" data-item>
            Fotos reais dos espaços onde você é atendido, para conhecer a clínica antes de chegar.
          </p>
        </header>

        <ul className="estrutura-grade" data-entra>
          {GALLERY.map((item, i) => {
            const alto = item.forma === "alto" && item.capa;
            const imagem = alto ? item.capa! : item;
            return (
              <li key={item.title} className="estrutura-item" data-forma={item.forma} data-item>
                <button
                  type="button"
                  className="estrutura-botao"
                  aria-label={`Ampliar foto: ${item.title}`}
                  onClick={() => setAmpliada(i)}
                >
                  <MolduraCoroa as="span" medir className="estrutura-foto">
                    <img
                      src={imagem.src}
                      alt={item.title}
                      width={imagem.largura}
                      height={imagem.altura}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  </MolduraCoroa>
                  <span className="estrutura-ampliar" aria-hidden="true">
                    <Expand />
                  </span>
                  <span className="estrutura-legenda vidro">{item.title}</span>
                </button>
              </li>
            );
          })}

          <li className="estrutura-item estrutura-convite" data-item>
            <div className="estrutura-convite-miolo cartao">
              <span className="pastilha">
                <Instagram aria-hidden="true" />
              </span>
              <p className="estrutura-convite-texto">
                Mais da rotina e dos espaços da clínica, no nosso Instagram.
              </p>
              <a
                href={CLINICA.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="botao botao-chao"
              >
                Ver o Instagram
                <ArrowUpRight aria-hidden="true" />
              </a>
            </div>
          </li>
        </ul>
      </div>

      {ampliada !== null && (
        <VisorFoto fotos={GALLERY} indice={ampliada} aoFechar={fechar} aoNavegar={navegar} />
      )}
    </section>
  );
}
