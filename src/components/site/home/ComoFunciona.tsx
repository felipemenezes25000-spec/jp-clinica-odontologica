import { ArrowUpRight, ClipboardList, MessageCircle, Phone, Stethoscope } from "lucide-react";
import type { ReactNode } from "react";

import { CLINICA } from "@/lib/jp";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import "./como-funciona.css";

/**
 * COMO FUNCIONA — três passos até a consulta. Texto honesto: não promete prazo
 * nem preço, só diz o que acontece em cada etapa e que valores e prazos são
 * combinados com o paciente antes de começar.
 */
const PASSOS: { titulo: string; texto: string; icone: ReactNode }[] = [
  {
    titulo: "Chame no WhatsApp",
    texto:
      "Conte o que você precisa. A recepção responde, tira as primeiras dúvidas e marca a avaliação.",
    icone: <MessageCircle />,
  },
  {
    titulo: "Avaliação com o dentista",
    texto: "O dentista examina, conversa com você e explica o que encontrou em linguagem simples.",
    icone: <Stethoscope />,
  },
  {
    titulo: "Plano explicado antes de começar",
    texto:
      "Etapas, valores e prazos são combinados com você antes de qualquer procedimento começar.",
    icone: <ClipboardList />,
  },
];

export function ComoFunciona() {
  const wa = useContatoWhatsApp("agendar");

  return (
    <section
      id="como-funciona"
      aria-labelledby="como-funciona-titulo"
      className="como-funciona secao secao-clara text-tinta"
    >
      <div className="quadro">
        <div className="como-funciona-cabeca" data-entra>
          <p className="sobretitulo" data-item>
            Como funciona
          </p>
          <h2 id="como-funciona-titulo" className="text-titulo" data-item>
            Da primeira mensagem à consulta
          </h2>
        </div>

        <ol className="passos" data-entra>
          {PASSOS.map((passo, i) => (
            <li key={passo.titulo} className="passo" data-item>
              <span className="passo-numero" aria-hidden="true">
                {i + 1}
              </span>
              <div className="passo-cartao cartao">
                <span className="pastilha" aria-hidden="true">
                  {passo.icone}
                </span>
                <h3 className="passo-titulo">
                  <span className="sr-only">Passo {i + 1}: </span>
                  {passo.titulo}
                </h3>
                <p className="passo-texto">{passo.texto}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="como-funciona-acoes" data-entra>
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="button-primary botao-grande"
            data-ima
            data-item
          >
            Agendar avaliação
            <ArrowUpRight aria-hidden="true" />
          </a>
          <a href={CLINICA.telefoneHref} className="botao botao-chao botao-grande" data-item>
            <Phone aria-hidden="true" />
            {CLINICA.telefone}
          </a>
        </div>
      </div>
    </section>
  );
}
