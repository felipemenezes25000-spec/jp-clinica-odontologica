import { ContactForm } from "@/components/site/ContactForm";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { MarcaCoroa, MolduraCoroa } from "@/components/site/sistema/Coroa";
import { useSituacao } from "@/components/site/sistema/horario";
import { CLINICA, COMO_CHEGAR } from "@/lib/jp";
import "./contato.css";

/**
 * CONTATO — o "live thing" do site.
 *
 * O cupom (ContactForm) monta a mensagem e abre o WhatsApp; abaixo dele, o
 * lugar: endereço, horário com a situação ao vivo, telefone, WhatsApp, os
 * pontos de referência e o mapa dentro de uma coroa. Sem cards contornados: os
 * dados são uma lista marcada pela coroa, e o mapa é a foto da seção.
 */
export function Contato() {
  const wa = useContatoWhatsApp("agendar");
  const situacao = useSituacao();

  return (
    <section id="fale" className="contato secao" aria-labelledby="fale-titulo" data-cede-cta>
      {/* Âncora antiga (`/#contato`): mantida para os links que já circulam. */}
      <span id="contato" aria-hidden="true" className="absolute -top-24 block h-px w-px" />

      <div className="quadro relative">
        <ContactForm />

        <div className="contato-onde" data-entra>
          <div className="contato-info" data-item>
            <h3 className="text-frase">Onde estamos</h3>

            <ul className="contato-lista">
              <li>
                <MarcaCoroa />
                <div>
                  <p className="contato-rotulo text-pequeno">Endereço</p>
                  <p className="contato-valor text-corpo">{CLINICA.endereco}</p>
                  <a
                    href={CLINICA.mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link text-corpo inline-block min-h-11 py-2"
                  >
                    Abrir no Google Maps
                  </a>
                </div>
              </li>
              <li>
                <MarcaCoroa />
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
                  <p className="text-pequeno">{CLINICA.horario}</p>
                </div>
              </li>
              <li>
                <MarcaCoroa />
                <div>
                  <p className="contato-rotulo text-pequeno">Telefone</p>
                  <p className="contato-valor text-corpo">
                    <a href={CLINICA.telefoneHref} className="link">
                      {CLINICA.telefone}
                    </a>
                  </p>
                </div>
              </li>
              <li>
                <MarcaCoroa />
                <div>
                  <p className="contato-rotulo text-pequeno">WhatsApp</p>
                  <p className="contato-valor text-corpo">
                    <a href={wa} target="_blank" rel="noopener noreferrer" className="link">
                      {CLINICA.whatsapp}
                    </a>
                  </p>
                </div>
              </li>
              <li>
                {/* O mapa resolve para quem usa GPS; as referências, para quem
                    mora na região e se localiza por supermercado e hospital. A
                    mesma fonte (COMO_CHEGAR) alimenta a FAQ e o JSON-LD. */}
                <MarcaCoroa />
                <div>
                  <p className="contato-rotulo text-pequeno">Como chegar</p>
                  <ul className="contato-refs text-corpo">
                    {COMO_CHEGAR.map(({ prefixo, referencia }) => (
                      <li key={referencia}>
                        <span>
                          {prefixo} <strong className="font-semibold">{referencia}</strong>
                        </span>
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
    </section>
  );
}
