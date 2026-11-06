import { ArrowUpRight } from "lucide-react";

import { CLINICA, CONVENIOS, PAGAMENTO, type Convenio } from "@/lib/jp";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { MarcaCoroa } from "@/components/site/sistema/Coroa";
import "./home/convenios.css";

/**
 * Os convênios publicados são os confirmados pela clínica e os dois
 * acrescentados em 16/09/2026. A extensão fica aqui porque, por enquanto, a
 * mudança é exclusivamente do site e não deve alterar dados do CRC sem a mesma
 * confirmação operacional.
 */
const CONVENIOS_SITE: Convenio[] = [
  ...CONVENIOS,
  { nome: "Sempre Odonto", slug: "sempre-odonto" },
  { nome: "Odonto Empresas", slug: "odonto-empresas" },
];

function porExtenso(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`;
}

const CONVENIOS_POR_EXTENSO_SITE = porExtenso(CONVENIOS_SITE.map((c) => c.nome));

/**
 * Logos locais, só. Quando um kit oficial for salvo em
 * `src/assets/convenios/<slug>.svg|png|webp` (ver o LEIA-ME da pasta), ele
 * entra no ladrilho sem outra alteração aqui.
 *
 * Antes havia links para logos hospedadas em terceiros: um deles (seu-convenio
 * .com) demorava até o limite de tempo e todos entregavam o IP do paciente a
 * servidores que a clínica não controla. Sem arquivo local, o ladrilho escreve
 * o nome em tipo grande — diz a mesma coisa e não usa marca de ninguém.
 */
const LOGOS = import.meta.glob("../../assets/convenios/*.{svg,png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** `../../assets/convenios/sulamerica.svg` → `sulamerica`. */
function logoLocalDe(slug: string): string | undefined {
  for (const [caminho, url] of Object.entries(LOGOS)) {
    const arquivo = caminho.split("/").pop() ?? "";
    if (arquivo.replace(/\.[^.]+$/, "") === slug) return url;
  }
  return undefined;
}

function Ladrilho({ convenio }: { convenio: Convenio }) {
  const logo = logoLocalDe(convenio.slug);

  return (
    <li className="convenio-ladrilho" data-item>
      {logo !== undefined ? (
        <img
          src={logo}
          alt={convenio.nome}
          loading="lazy"
          decoding="async"
          className="convenio-logo"
        />
      ) : (
        <span className="convenio-nome">{convenio.nome}</span>
      )}
    </li>
  );
}

export function ConveniosSection() {
  const wa = useContatoWhatsApp("duvida", "convênios");

  return (
    <section id="convenios" className="secao-curta convenios-secao">
      <div className="quadro">
        {/* A lista é o próprio quadro: título, convênios e particular são itens
            dela, então leitor de tela ouve "lista com 10 itens" e não três
            blocos soltos. */}
        <ul className="convenios-quadro" data-entra>
          {/* O ladrilho de acento carrega o título: é a porta da seção. */}
          <li className="convenios-titulo" data-item>
            <h2 data-linhas className="text-titulo">
              Convênios aceitos
            </h2>
            <p className="text-corpo">
              A cobertura de cada procedimento depende do seu plano — a recepção confere para você
              antes da consulta.
            </p>
            <p className="convenios-contagem">
              <span className="text-display" data-numero={CONVENIOS_SITE.length} data-casas="0">
                {CONVENIOS_SITE.length}
              </span>
              <span className="text-corpo">convênios odontológicos credenciados</span>
            </p>
          </li>

          {CONVENIOS_SITE.map((c) => (
            <Ladrilho key={c.slug} convenio={c} />
          ))}

          <li className="convenios-particular campo-escuro" data-item>
            <div>
              <h3 className="text-frase">Particular</h3>
              <p className="mt-3 text-corpo text-sobre-campo-suave">
                Sem convênio? Também atendemos particular.
              </p>
            </div>

            <div>
              <ul className="convenios-formas">
                {PAGAMENTO.formas.map((forma) => (
                  <li key={forma}>
                    <MarcaCoroa />
                    {forma}
                  </li>
                ))}
              </ul>
              <p className="mt-4 max-w-md text-pequeno text-sobre-campo-suave">
                {PAGAMENTO.publicarCondicoes ? `${PAGAMENTO.condicoes} ` : ""}As condições são
                apresentadas junto com o plano de tratamento, depois da avaliação.
              </p>
            </div>

            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="botao botao-acento convenios-cta"
              data-ima
            >
              Conferir meu plano no WhatsApp
              <ArrowUpRight aria-hidden="true" />
            </a>
          </li>
        </ul>

        <p className="mt-8 max-w-3xl text-pequeno text-tinta-suave">
          Credenciamentos e coberturas podem mudar. Confirme o seu plano com a recepção pelo
          WhatsApp {CLINICA.whatsapp} antes de agendar. Convênios atendidos hoje:{" "}
          {CONVENIOS_POR_EXTENSO_SITE}.
        </p>
      </div>
    </section>
  );
}
