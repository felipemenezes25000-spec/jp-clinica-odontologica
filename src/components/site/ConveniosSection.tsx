import { ArrowUpRight, Wallet } from "lucide-react";

import { CLINICA, PAGAMENTO } from "@/lib/jp";
import {
  CONVENIOS_POR_EXTENSO_SITE,
  CONVENIOS_SITE,
  logoDoConvenio,
} from "@/components/site/convenios-do-site";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { Contador } from "@/components/site/ui/Contador";
import { FaixaRolante } from "@/components/site/ui/FaixaRolante";
import "./home/convenios.css";

/**
 * Cartão de um convênio: altura fixa, branco, com a logo quando houver arquivo
 * local em `src/assets/convenios/<slug>.svg` e, sem ele, o nome em tipo forte.
 * Os dois casos ocupam a mesma caixa, então a fileira não pula quando as logos
 * oficiais forem entrando.
 */
/**
 * Logos quase quadradas ou empilhadas (ícone com o nome embaixo) ficam
 * pequenas na mesma altura das logos horizontais; estas ganham mais altura
 * para pesarem igual na fileira (ajuste óptico, não regra de marca).
 */
const LOGO_ALTA = new Set(["odonto-empresas", "rede-brazil-dental"]);

function CartaoConvenio({ nome, slug }: { nome: string; slug: string }) {
  const logo = logoDoConvenio(slug);

  return (
    <li className="convenio-cartao">
      {logo !== undefined ? (
        <img
          src={logo}
          alt={nome}
          height={36}
          loading="lazy"
          decoding="async"
          className="convenio-logo"
          data-alta={LOGO_ALTA.has(slug) ? "" : undefined}
        />
      ) : (
        <span className="convenio-nome">{nome}</span>
      )}
    </li>
  );
}

/**
 * CONVÊNIOS — a faixa de confiança logo abaixo do topo.
 *
 * Compacta de propósito: quem tem plano quer saber se o dele entra, não ler
 * uma seção. A fileira corre sozinha e para no hover; a lista completa também
 * está escrita no rodapé da seção, para quem lê sem a animação.
 */
export function ConveniosSection() {
  const wa = useContatoWhatsApp("duvida", "convênios");

  return (
    <section id="convenios" className="convenios-secao" aria-labelledby="convenios-titulo">
      <div className="quadro">
        <div className="convenios-cabeca" data-entra>
          <div data-item>
            <p className="sobretitulo">Convênios</p>
            <h2 id="convenios-titulo" className="convenios-titulo">
              Seu plano odontológico, atendido aqui
            </h2>
          </div>
          <p data-item className="convenios-contagem">
            <Contador valor={CONVENIOS_SITE.length} className="convenios-numero" />
            <span>convênios odontológicos</span>
          </p>
        </div>
      </div>

      <FaixaRolante rotulo="Convênios atendidos" duracao={46} className="convenios-faixa">
        <ul className="convenios-fila">
          {CONVENIOS_SITE.map((c) => (
            <CartaoConvenio key={c.slug} nome={c.nome} slug={c.slug} />
          ))}
        </ul>
      </FaixaRolante>

      <div className="quadro">
        <div className="convenios-particular cartao" data-entra>
          <span className="pastilha" aria-hidden="true" data-item>
            <Wallet />
          </span>
          <div className="convenios-particular-texto" data-item>
            <h3 className="convenios-particular-titulo">Sem convênio? Atendimento particular</h3>
            <p>
              {PAGAMENTO.formas.join(" · ")}.{" "}
              {PAGAMENTO.publicarCondicoes ? `${PAGAMENTO.condicoes} ` : ""}As condições são
              apresentadas junto com o plano de tratamento, depois da avaliação.
            </p>
          </div>
          <a
            data-item
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="botao botao-acento convenios-cta"
            data-ima
          >
            Conferir meu plano no WhatsApp
            <ArrowUpRight aria-hidden="true" />
          </a>
        </div>

        <p className="convenios-ressalva">
          A cobertura de cada procedimento depende do seu plano, e credenciamentos podem mudar:
          confirme com a recepção pelo WhatsApp {CLINICA.whatsapp} antes de agendar. Convênios
          atendidos hoje: {CONVENIOS_POR_EXTENSO_SITE}.
        </p>
      </div>
    </section>
  );
}
