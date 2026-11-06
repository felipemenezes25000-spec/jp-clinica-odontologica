import { ArrowUpRight } from "lucide-react";

import { FAQ } from "@/lib/jp";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { FormaCoroa } from "@/components/site/sistema/Coroa";
import "./home/faq.css";

/**
 * As perguntas frequentes, num acordeão de ladrilhos.
 *
 * As perguntas vêm de `FAQ` em jp.ts, a mesma fonte do FAQPage do JSON-LD da
 * home: o que a pessoa lê aqui é o que o buscador lê.
 *
 * Todas começam fechadas. Abrir a primeira por padrão empurrava as outras para
 * baixo e decidia pela pessoa qual dúvida ela tem.
 *
 * `<details name="faq">` é quem garante que só uma fica aberta: o grupo é do
 * navegador, não de estado em React, e o conteúdo está no HTML do servidor
 * mesmo com tudo fechado — o buscador e quem usa leitor de tela encontram as
 * respostas sem esperar a hidratação.
 */
export function FaqSection() {
  const wa = useContatoWhatsApp("duvida");

  return (
    <section id="faq" aria-labelledby="faq-titulo" className="secao bg-chao pt-0 text-tinta">
      <div className="quadro grid gap-x-[var(--margem)] gap-y-12 lg:grid-cols-12">
        {/* O título acompanha a leitura no desktop: a lista é bem mais alta que
            ele, e o lado esquerdo não fica vazio ao lado das respostas. */}
        <div className="lg:sticky lg:top-[calc(var(--altura-cabecalho)+2rem)] lg:col-span-5 lg:self-start">
          <h2 id="faq-titulo" data-linhas className="text-titulo">
            Perguntas frequentes
          </h2>
          <p className="mt-8 max-w-[34ch] text-corpo text-tinta-suave">
            As dúvidas mais comuns que a recepção recebe. Não achou a sua? A equipe responde no
            WhatsApp, durante o horário da clínica.
          </p>
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            data-ima
            className="botao botao-tinta mt-8"
          >
            Perguntar no WhatsApp
            <ArrowUpRight aria-hidden="true" />
          </a>
          {/* A coroa grande ocupa o que sobraria vazio abaixo do botão, na
              coluna que acompanha a lista, e repete a forma do topo da página. */}
          <FormaCoroa
            proporcao={0.86}
            className="mt-16 hidden w-[min(100%,14rem)] text-acento lg:block"
          />
        </div>

        <div data-entra className="grid content-start gap-2 lg:col-span-7">
          {FAQ.map((item) => (
            <details key={item.q} name="faq" data-item className="faq-item">
              <summary>
                <span>{item.q}</span>
                <span className="faq-sinal" aria-hidden="true" />
              </summary>
              <p className="faq-resposta">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
