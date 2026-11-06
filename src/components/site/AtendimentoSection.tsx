import { Accessibility, ArrowUpRight, HeartHandshake, Users, Wind } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import fachada from "@/assets/fachada-2026.webp";
import { ATENDIMENTO, CUIDADOS_COMPLEMENTARES } from "@/lib/jp";
import type { PilarDeCuidado } from "@/lib/jp";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { MolduraCoroa } from "@/components/site/sistema/Coroa";
import "./home/atendimento.css";

/**
 * ATENDIMENTO ADAPTADO — a seção que o site não tinha.
 *
 * Até 15/09/2026 nenhuma das 12 rotas dizia uma palavra sobre acessibilidade,
 * sedação, necessidades especiais ou odontogeriatria. A clínica faz as quatro
 * coisas há anos, e cita duas delas como diferencial próprio.
 *
 * Quem procura isso não procura "dentista": procura "dentista que atende meu
 * filho autista", "dentista para cadeirante", "dentista com sedação". Se o site
 * não diz, a pessoa não tem como descobrir — e é a pessoa que mais precisa
 * saber antes de sair de casa.
 *
 * Por isso a seção termina em contato, e não em "saiba mais": a próxima coisa
 * útil para ela é falar com alguém que possa organizar a consulta.
 *
 * COMPOSIÇÃO — em cima, o convite e a fachada (a placa diz "Pessoas com
 * deficiência", o que a seção afirma); no meio, os quatro pilares de
 * `ATENDIMENTO` em cartões; embaixo, as outras áreas de
 * `CUIDADOS_COMPLEMENTARES`, que só têm nome e continuam só com nome: inventar
 * descrição clínica para elas é o que o comentário de jp.ts proíbe. A foto
 * anterior mostrava o pôster de raio-X com instrumento sobre um dente, que
 * pode ser lido como imagem de procedimento (Res. CFO 196/2019, art. 3).
 */

const ICONES: Record<PilarDeCuidado["icone"], LucideIcon> = {
  especiais: HeartHandshake,
  acessibilidade: Accessibility,
  sedacao: Wind,
  idosos: Users,
};

/**
 * Áreas sem texto próprio, menos as duas que já aparecem como pilar. A
 * comparação é por nome porque os pilares têm título próprio ("Pessoas com
 * necessidades especiais" x "Pacientes com…"); se um nome mudar em jp.ts, a
 * área volta a aparecer duas vezes — vale olhar aqui ao mexer nelas.
 */
const OUTRAS_AREAS = CUIDADOS_COMPLEMENTARES.filter(
  (area) => !["Atendimento a idosos", "Pacientes com necessidades especiais"].includes(area),
);

function Pilar({ pilar }: { pilar: PilarDeCuidado }) {
  const Icone = ICONES[pilar.icone];
  return (
    <li className="atendimento-pilar cartao" data-item>
      <span className="pastilha">
        <Icone aria-hidden="true" />
      </span>
      <h3 className="atendimento-pilar-titulo">{pilar.titulo}</h3>
      <p className="atendimento-pilar-texto">{pilar.texto}</p>
    </li>
  );
}

export function AtendimentoSection() {
  const wa = useContatoWhatsApp("duvida", "atendimento adaptado");

  return (
    <section id="atendimento" className="atendimento secao" aria-labelledby="atendimento-titulo">
      <div className="quadro">
        <div className="atendimento-topo" data-entra>
          <div className="atendimento-texto">
            <p className="sobretitulo" data-item>
              Acessibilidade e cuidado
            </p>
            <h2 id="atendimento-titulo" className="atendimento-titulo text-titulo" data-item>
              Atendimento adaptado a você
            </h2>
            <p className="atendimento-lide text-corpo" data-item>
              Avise antes da consulta: com o aviso, a equipe reserva o tempo, a sala e as condições
              de que você precisa, em vez de resolver na hora, com você já na recepção.
            </p>
            <div className="atendimento-acao" data-item>
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                data-ima
                className="botao botao-acento botao-grande"
              >
                Falar com a recepção
                <ArrowUpRight aria-hidden="true" />
              </a>
            </div>
          </div>

          <figure className="atendimento-foto" data-item>
            <MolduraCoroa medir className="atendimento-moldura">
              <img
                src={fachada}
                alt="Fachada da clínica, verde, com a placa que indica o atendimento a pessoas com deficiência"
                width={1086}
                height={814}
                loading="lazy"
                decoding="async"
              />
            </MolduraCoroa>
            <figcaption className="vidro atendimento-selo text-pequeno">
              <span className="pastilha">
                <Accessibility aria-hidden="true" />
              </span>
              <span>Estrutura acessível, com barras de apoio</span>
            </figcaption>
          </figure>
        </div>

        <ul className="atendimento-pilares" data-entra>
          {ATENDIMENTO.map((pilar) => (
            <Pilar key={pilar.titulo} pilar={pilar} />
          ))}
        </ul>

        <div className="atendimento-outras cartao" data-entra>
          <h3 className="atendimento-outras-titulo" data-item>
            Também atendemos
          </h3>
          <ul className="atendimento-chips" data-item>
            {OUTRAS_AREAS.map((area) => (
              <li key={area}>{area}</li>
            ))}
          </ul>
        </div>

        {/* No celular o convite do topo fica telas atrás: repete-se no fim da
            leitura. */}
        <div className="atendimento-fim" data-entra>
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            data-ima
            data-item
            className="botao botao-acento"
          >
            Falar com a recepção
            <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
