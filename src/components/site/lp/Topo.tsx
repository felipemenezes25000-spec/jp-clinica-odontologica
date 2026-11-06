import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Clock3, MapPin, Phone } from "lucide-react";

import { BotaoWhatsApp } from "@/components/site/lp/BotaoWhatsApp";
import { GoogleRating } from "@/components/site/GoogleRating";
import { FormaCoroa, MolduraCoroa } from "@/components/site/sistema/Coroa";
import { useSituacao, type Situacao } from "@/components/site/sistema/horario";
import { CLINICA, HISTORIA } from "@/lib/jp";
import "./lp.css";

export type Foto = {
  src: string;
  largura: number;
  altura: number;
  alt: string;
  /** `object-position` quando o recorte da coroa pede outro enquadramento. */
  posicao?: string;
};

/**
 * "Fechado" na primeira tela de um anúncio lê como porta fechada antes de ler
 * "WhatsApp". O recado é o mesmo, dito como convite: a recepção abre em tal
 * hora. Antes da hidratação (sem relógio) vale o horário fixo da clínica.
 */
function textoDoHorario(situacao: Situacao | null): string {
  if (!situacao) return CLINICA.horario;
  return situacao.aberto
    ? situacao.texto
    : situacao.texto.replace(/^Fechado · abre/, "Recepção abre");
}

/**
 * O TOPO DAS LANDINGS PAGAS — a janela em forma de coroa, sem a cena.
 *
 * Quem chega por anúncio decidiu a busca antes de abrir a página, então a
 * primeira tela responde só ao que ela precisa: é disso? é perto? dá para
 * confiar? como falo com eles? — H1 com procedimento e bairro, uma frase, o
 * botão de WhatsApp, a nota no Google e o endereço. A foto real do consultório
 * entra pela mesma janela em coroa da home, com o eco verde deslocado atrás.
 * Cena de rolagem aqui só atrapalharia o clique, por isso a janela não cresce.
 *
 * Tudo que decide o clique (H1, frase, botão, nota) está desenhado desde o
 * primeiro quadro: num anúncio pago, esperar uma animação para ler a oferta é
 * perder visita. O movimento fica só na foto, que assenta, e no eco, que chega.
 *
 * No celular a janela sobe para entre o título e a frase, para a coroa, o H1 e
 * o botão caberem na primeira tela de 390x844. A ordem no HTML continua sendo a
 * de leitura (título, frase, botão); só o desenho a reorganiza.
 *
 * O CTA é o primeiro `a.button-primary` do `main` e fica dentro da seção com o
 * `id` do topo: é esse `id` que o rastreio grava como origem do lead.
 */
export function Topo({
  id,
  linhas,
  frase,
  rotulo,
  href,
  foto,
}: {
  id: string;
  /** As duas linhas do H1: procedimento, depois o bairro. */
  linhas: readonly [string, string];
  frase: string;
  rotulo: string;
  href: string;
  foto: Foto;
}) {
  const situacao = useSituacao();
  const caixaRef = useRef<HTMLDivElement>(null);
  const [proporcao, setProporcao] = useState(0.95);

  // O eco verde é a mesma coroa da janela. A janela muda de proporção entre
  // celular e desktop, e os lobos não podem esticar: mede a caixa e refaz.
  useEffect(() => {
    const el = caixaRef.current;
    if (!el || !("ResizeObserver" in window)) return;
    const ro = new ResizeObserver(([entrada]) => {
      const c = entrada?.contentRect;
      if (c && c.height > 0) setProporcao(c.width / c.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <section id={id} className="lp-topo" aria-labelledby={`${id}-titulo`}>
      <div className="quadro lp-topo-grade">
        <div className="lp-topo-texto">
          <h1 id={`${id}-titulo`} className="linhas-topo lp-h1">
            <span className="linha">
              <span style={{ "--i": 0 } as CSSProperties}>{linhas[0]}</span>
            </span>{" "}
            <span className="linha">
              <span style={{ "--i": 1 } as CSSProperties}>{linhas[1]}</span>
            </span>
          </h1>

          <p className="lp-frase">{frase}</p>

          <div className="lp-acoes">
            <BotaoWhatsApp href={href} principal ima>
              {rotulo}
            </BotaoWhatsApp>
          </div>

          {/* Dois grupos que quebram sempre do mesmo jeito: a prova (nota e
              bairro) e o contato (horário e telefone). */}
          <ul className="lp-fatos lp-prova">
            <li className="lp-fato-nota">
              <GoogleRating variante="selo" />
            </li>
            <li>
              <MapPin aria-hidden="true" />
              <span>
                {CLINICA.local.bairro}, {HISTORIA.regiaoAtual}
              </span>
            </li>
          </ul>
          <ul className="lp-fatos lp-contato">
            <li>
              <Clock3 aria-hidden="true" />
              <span>{textoDoHorario(situacao)}</span>
            </li>
            <li>
              <Phone aria-hidden="true" />
              <a href={CLINICA.telefoneHref} className="link">
                {CLINICA.telefone}
              </a>
            </li>
          </ul>
        </div>

        <div ref={caixaRef} className="lp-janela">
          <FormaCoroa proporcao={proporcao} className="lp-eco" />
          <MolduraCoroa medir proporcao={0.95} className="lp-moldura">
            <img
              src={foto.src}
              width={foto.largura}
              height={foto.altura}
              alt={foto.alt}
              style={foto.posicao ? { objectPosition: foto.posicao } : undefined}
              loading="eager"
              fetchPriority="high"
            />
          </MolduraCoroa>
        </div>
      </div>
    </section>
  );
}
