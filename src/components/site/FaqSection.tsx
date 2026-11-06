import { ArrowUpRight, MessageCircle, Plus } from "lucide-react";

import { CLINICA, FAQ_SITE } from "@/lib/jp";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { AvataresEquipe } from "@/components/site/ui/AvataresEquipe";
import "./home/faq.css";

/**
 * As perguntas frequentes, num acordeão de cartões brancos.
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
    <section id="faq" aria-labelledby="faq-titulo" className="secao secao-clara text-tinta">
      <div className="quadro grid gap-x-[var(--margem)] gap-y-[var(--ritmo-3)] lg:grid-cols-12">
        {/* O título acompanha a leitura no desktop: a lista é bem mais alta que
            ele, e o lado esquerdo não fica vazio ao lado das respostas. */}
        <div className="lg:sticky lg:top-[calc(var(--altura-cabecalho)+2rem)] lg:col-span-5 lg:self-start">
          <p className="sobretitulo">Dúvidas</p>
          <h2 id="faq-titulo" className="text-titulo mt-[var(--ritmo-1)]">
            Perguntas frequentes
          </h2>
          <p className="mt-[var(--ritmo-2)] max-w-[38ch] text-corpo text-tinta-suave">
            As dúvidas mais comuns que a recepção recebe, respondidas em poucas linhas.
          </p>

          <div className="cartao faq-ajuda">
            <div className="faq-ajuda-topo">
              <AvataresEquipe max={3} tamanho={44} />
              <div>
                <p className="faq-ajuda-titulo">Ainda tem dúvida?</p>
                <p className="text-pequeno text-tinta-suave">
                  A recepção responde no horário da clínica.
                </p>
              </div>
            </div>
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              data-ima
              className="button-primary w-full"
            >
              <MessageCircle aria-hidden="true" />
              Fale com a recepção
              <ArrowUpRight aria-hidden="true" />
            </a>
            <p className="text-pequeno text-tinta-suave">
              Ou ligue:{" "}
              <a href={CLINICA.telefoneHref} className="link font-semibold text-tinta">
                {CLINICA.telefone}
              </a>
            </p>
          </div>
        </div>

        <div data-entra className="grid content-start gap-[var(--vao-grade)] lg:col-span-7">
          {FAQ_SITE.map((item) => (
            <details key={item.q} name="faq" data-item className="faq-item">
              <summary>
                <span>{item.q}</span>
                <span className="faq-sinal" aria-hidden="true">
                  <Plus />
                </span>
              </summary>
              <p className="faq-resposta">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
