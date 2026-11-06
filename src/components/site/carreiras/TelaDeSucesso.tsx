import { useEffect, useRef } from "react";
import { ArrowLeft, Check, Copy, MessageCircle } from "lucide-react";

import { whatsappLink } from "@/lib/jp";
import { MESES_RETENCAO_LGPD } from "@/lib/rh/tipos";
import "./candidatura.css";

const DEPOIS = [
  {
    titulo: "A equipe lê a sua candidatura",
    texto: "Tudo o que chega é lido por gente da clínica — nada de filtro automático.",
  },
  {
    titulo: "Se o perfil combinar, a gente chama",
    texto: "O contato vem pelo WhatsApp ou telefone que você deixou, no horário comercial.",
  },
  {
    titulo: "Conversa e visita à clínica",
    texto: "A entrevista é aqui na Vila Bruna, para você conhecer a estrutura e a equipe.",
  },
];

/**
 * A confirmação: protocolo grande para copiar, o que acontece agora e os dois
 * caminhos de saída. O protocolo é o único dado que a pessoa precisa levar
 * embora, então é o maior elemento do topo. Fundo claro, um selo verde com o
 * ✓ e o protocolo num cartão branco: sem enfeite disputando a leitura.
 */
export function TelaDeSucesso(props: {
  protocolo: string;
  copiado: boolean;
  aoCopiar: () => void;
  emailRh: string;
}) {
  const email = props.emailRh.trim();
  const tituloRef = useRef<HTMLHeadingElement>(null);

  // O botão "Enviar" que tinha o foco sai da tela junto com o formulário, e o
  // foco cairia no <body>: quem usa leitor de tela não ouviria confirmação
  // nenhuma. Levar o foco ao título anuncia o resultado e o protocolo logo abaixo.
  useEffect(() => {
    tituloRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <>
      <section className="fundo-brilho cand-ok-topo" aria-labelledby="cand-ok-titulo">
        <div className="quadro cand-ok-grade">
          <div>
            <span className="cand-ok-selo" aria-hidden="true">
              <Check />
            </span>
            <h1
              ref={tituloRef}
              id="cand-ok-titulo"
              tabIndex={-1}
              className="text-titulo outline-none"
            >
              Recebemos o seu currículo.
            </h1>
            <p className="mt-[var(--ritmo-2)] max-w-[40ch] text-corpo text-tinta-suave">
              Guarde o número do protocolo. É por ele que a equipe encontra a sua candidatura se
              você quiser falar com a gente.
            </p>
          </div>

          <div className="cand-protocolo cartao">
            <small>Protocolo</small>
            <strong>{props.protocolo}</strong>
            <button type="button" onClick={props.aoCopiar} className="botao botao-acento">
              {props.copiado ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {props.copiado ? "Copiado" : "Copiar protocolo"}
            </button>
            {/* role="status" anuncia a confirmação da cópia sem roubar o foco. */}
            <p className="sr-only" role="status">
              {props.copiado ? "Protocolo copiado para a área de transferência." : ""}
            </p>
          </div>
        </div>
      </section>

      <section className="secao-curta" aria-labelledby="cand-depois">
        <div className="quadro">
          <h2 id="cand-depois" className="text-titulo">
            O que acontece agora.
          </h2>

          <ol className="cand-depois">
            {DEPOIS.map((p) => (
              <li key={p.titulo} className="cartao">
                <div>
                  <strong>{p.titulo}</strong>
                  <span className="t">{p.texto}</span>
                </div>
              </li>
            ))}
          </ol>

          {/* Sem prazo em número: o painel é operado por uma pessoa só e não
              mede nada parecido com um SLA — prometer "15 dias úteis" era um
              compromisso por escrito que ninguém no sistema garante. */}
          <p className="mt-[var(--ritmo-3)] max-w-[56ch]">
            <strong className="font-semibold">Retorno:</strong> a equipe entra em contato assim que
            concluir a triagem. Se o seu perfil servir para uma vaga futura, seu currículo fica no
            banco de talentos por {MESES_RETENCAO_LGPD} meses.
          </p>

          <div className="mt-[var(--ritmo-2)] flex flex-wrap gap-3">
            <a
              href={whatsappLink(
                `Olá! Enviei minha candidatura pelo site. Meu protocolo é ${props.protocolo}.`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="botao botao-acento"
            >
              <MessageCircle aria-hidden="true" />
              Falar no WhatsApp
            </a>
            <a href="/carreiras" className="botao botao-chao">
              <ArrowLeft aria-hidden="true" />
              Ver outras vagas
            </a>
          </div>

          {email.length > 0 ? (
            <p className="mt-[var(--ritmo-2)] text-pequeno text-tinta-suave">
              Dúvidas sobre o processo? Escreva para{" "}
              <a href={`mailto:${email}`} className="link font-semibold text-tinta">
                {email}
              </a>
              .
            </p>
          ) : null}
        </div>
      </section>
    </>
  );
}
