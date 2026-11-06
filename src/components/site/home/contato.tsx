import { ArrowUpRight, Clock, MapPin, MessageCircle, Navigation, Phone } from "lucide-react";

import { ContactForm } from "@/components/site/ContactForm";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { MolduraCoroa } from "@/components/site/sistema/Coroa";
import { useSituacao } from "@/components/site/sistema/horario";
import { Estrelas } from "@/components/site/ui/Estrelas";
import { AVALIACOES, CLINICA, COMO_CHEGAR, notaBR } from "@/lib/jp";
import "./contato.css";

/**
 * CONTATO — onde a conversa vira agendamento.
 *
 * Três camadas, de cima para baixo: o formulário num cartão branco (monta a
 * mensagem e abre o WhatsApp), ao lado dele o lugar — endereço, horário com a
 * situação ao vivo, telefone, pontos de referência e o mapa —, e uma faixa de
 * fechamento em verde profundo com o convite final. O formulário e a faixa
 * ficam dentro de `#fale`: o clique em wa.me/tel conta com esse id como origem.
 */
export function Contato() {
  const wa = useContatoWhatsApp("agendar");
  const situacao = useSituacao();

  return (
    <section id="fale" className="contato secao" aria-labelledby="fale-titulo" data-cede-cta>
      {/* Âncora antiga (`/#contato`): mantida para os links que já circulam. */}
      <span id="contato" aria-hidden="true" className="absolute -top-24 block h-px w-px" />

      <div className="quadro relative">
        <div className="contato-grade">
          <ContactForm />

          <div className="contato-onde" data-entra>
            <div className="cartao contato-info" data-item>
              <h3 className="text-frase">Onde estamos</h3>

              <ul className="contato-lista">
                <li>
                  <span className="pastilha" aria-hidden="true">
                    <MapPin />
                  </span>
                  <div>
                    <p className="contato-rotulo text-pequeno">Endereço</p>
                    <p className="contato-valor text-corpo">{CLINICA.endereco}</p>
                    <a
                      href={CLINICA.mapsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link contato-acao text-corpo"
                    >
                      Abrir no Google Maps
                    </a>
                  </div>
                </li>
                <li>
                  <span className="pastilha" aria-hidden="true">
                    <Clock />
                  </span>
                  <div>
                    <p className="contato-rotulo text-pequeno">Horário</p>
                    <p className="contato-valor text-corpo">
                      <span
                        className="contato-ponto"
                        data-aberto={situacao?.aberto ? "" : undefined}
                        aria-hidden="true"
                      />
                      {situacao?.texto ?? CLINICA.horario}
                    </p>
                    <p className="text-pequeno text-tinta-suave">{CLINICA.horario}</p>
                  </div>
                </li>
                <li>
                  <span className="pastilha" aria-hidden="true">
                    <Phone />
                  </span>
                  <div>
                    <p className="contato-rotulo text-pequeno">Telefone</p>
                    <p className="contato-valor text-corpo">
                      <a href={CLINICA.telefoneHref} className="link contato-acao">
                        {CLINICA.telefone}
                      </a>
                    </p>
                  </div>
                </li>
                <li>
                  <span className="pastilha" aria-hidden="true">
                    <MessageCircle />
                  </span>
                  <div>
                    <p className="contato-rotulo text-pequeno">WhatsApp</p>
                    <p className="contato-valor text-corpo">
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link contato-acao"
                      >
                        {CLINICA.whatsapp}
                      </a>
                    </p>
                  </div>
                </li>
                <li>
                  {/* O mapa resolve para quem usa GPS; as referências, para quem
                      mora na região e se localiza por supermercado e hospital. A
                      mesma fonte (COMO_CHEGAR) alimenta a FAQ e o JSON-LD. */}
                  <span className="pastilha" aria-hidden="true">
                    <Navigation />
                  </span>
                  <div>
                    <p className="contato-rotulo text-pequeno">Como chegar</p>
                    <ul className="contato-refs text-corpo">
                      {COMO_CHEGAR.map(({ prefixo, referencia }) => (
                        <li key={referencia}>
                          {prefixo} <strong className="font-semibold">{referencia}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              </ul>
            </div>

            <MolduraCoroa medir proporcao={1.1} className="contato-mapa" data-item>
              <iframe
                src={CLINICA.mapsEmbed}
                title="Mapa com a localização da JP Clínica Integrada Odontológica"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <span aria-hidden="true" className="contato-pino">
                <svg width="34" height="46" viewBox="0 0 34 46" fill="none">
                  <path
                    d="M17 45C17 45 32 27.5 32 17C32 8.716 25.284 2 17 2C8.716 2 2 8.716 2 17C2 27.5 17 45 17 45Z"
                    style={{ fill: "var(--campo-marca)", stroke: "var(--chao)" }}
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />
                  <circle cx="17" cy="17" r="5.5" style={{ fill: "var(--acento)" }} />
                </svg>
              </span>
            </MolduraCoroa>
          </div>
        </div>

        {/* O fecho da página: a última chamada, em verde profundo. */}
        <div className="campo-escuro contato-fecho" data-entra>
          <div className="contato-fecho-texto" data-item>
            <p className="sobretitulo">Vamos conversar?</p>
            <h2 className="contato-fecho-titulo">Marque sua avaliação pelo WhatsApp.</h2>
            <p className="contato-fecho-frase">
              A recepção responde no horário de atendimento ({CLINICA.horario.toLowerCase()}) e
              organiza a consulta com você.
            </p>
            <p className="contato-fecho-nota">
              <Estrelas tamanho="0.95rem" />
              <span>
                <strong>{notaBR}</strong> no Google · {AVALIACOES.total} avaliações
              </span>
            </p>
          </div>
          <div className="contato-fecho-acoes" data-item>
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              data-ima
              className="botao botao-acento botao-grande"
            >
              <MessageCircle aria-hidden="true" />
              Agendar avaliação
              <ArrowUpRight aria-hidden="true" />
            </a>
            <a href={CLINICA.telefoneHref} className="botao botao-claro botao-grande">
              <Phone aria-hidden="true" />
              {CLINICA.telefone}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
