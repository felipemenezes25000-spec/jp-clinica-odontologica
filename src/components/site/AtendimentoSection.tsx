import { ArrowUpRight } from "lucide-react";

import fachada from "@/assets/fachada-2026.webp";
import { ATENDIMENTO, CUIDADOS_COMPLEMENTARES } from "@/lib/jp";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { MarcaCoroa, MolduraCoroa } from "@/components/site/sistema/Coroa";
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
 * COMPOSIÇÃO — "pontos marcados". Em cima, a fachada
 * cortada pela borda da tela (a placa diz "Pessoas com deficiência", o que a
 * seção afirma) e o convite; embaixo, uma grade 2×2 com os quatro pilares de
 * `ATENDIMENTO` — que têm texto e dividem as mesmas linhas, para os títulos
 * alinharem — e, na terceira coluna, as outras áreas de
 * `CUIDADOS_COMPLEMENTARES`, que só têm nome e continuam só com nome: inventar
 * descrição clínica para elas é o que o comentário de jp.ts proíbe. A foto
 * anterior mostrava o pôster de raio-X com instrumento sobre um dente, que
 * pode ser lido como imagem de procedimento (Res. CFO 196/2019, art. 3).
 */

/**
 * Áreas sem texto próprio, menos as duas que já aparecem como pilar. A
 * comparação é por nome porque os pilares têm título próprio ("Pessoas com
 * necessidades especiais" x "Pacientes com…"); se um nome mudar em jp.ts, a
 * área volta a aparecer duas vezes — vale olhar aqui ao mexer nelas.
 */
const OUTRAS_AREAS = CUIDADOS_COMPLEMENTARES.filter(
  (area) => !["Atendimento a idosos", "Pacientes com necessidades especiais"].includes(area),
);

function Ponto({ titulo, children }: { titulo: string; children: string }) {
  return (
    <li data-item>
      <h3 className="flex items-baseline gap-3 text-corpo font-semibold">
        <MarcaCoroa className="text-acento" />
        {titulo}
      </h3>
      <p className="mt-2 pl-[calc(0.74em+0.75rem)] text-tinta-suave">{children}</p>
    </li>
  );
}

export function AtendimentoSection() {
  const wa = useContatoWhatsApp("duvida", "atendimento adaptado");

  return (
    <section
      id="atendimento"
      aria-labelledby="atendimento-titulo"
      className="atendimento secao bg-chao text-tinta"
    >
      <div className="quadro">
        <div className="grid items-center gap-x-[var(--margem)] gap-y-10 lg:grid-cols-12">
          {/* A sangria vive no invólucro, e não na moldura: o obturador anima o
              `clip-path` do elemento marcado, e um recorte do tamanho da coluna
              cortaria a parte que avança para fora da tela. A moldura só
              preenche o invólucro. */}
          <div data-obturador className="atendimento-foto">
            <MolduraCoroa medir className="h-full w-full">
              <img
                src={fachada}
                alt="Fachada da clínica, verde, com a placa que indica o atendimento a pessoas com deficiência"
                width={1086}
                height={814}
                loading="lazy"
                decoding="async"
                className="object-[72%_40%]"
                data-deriva
              />
            </MolduraCoroa>
          </div>

          <div data-entra className="lg:col-span-5 lg:col-start-8">
            <h2 id="atendimento-titulo" data-linhas className="text-titulo">
              Atendimento adaptado a você
            </h2>
            <p data-item className="mt-8 max-w-[62ch] text-corpo text-tinta-suave">
              Avise antes da consulta: com o aviso, a equipe reserva o tempo, a sala e as condições
              de que você precisa, em vez de resolver na hora, com você já na recepção.
            </p>
            <div data-item className="mt-8">
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                data-ima
                className="botao botao-acento"
              >
                Falar com a recepção
                <ArrowUpRight aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>

        <div
          data-entra
          className="mt-[clamp(4rem,2rem+6vw,9rem)] grid gap-x-[var(--margem)] gap-y-12 lg:grid-cols-3"
        >
          <ul className="grid content-start gap-x-[var(--margem)] gap-y-10 sm:grid-cols-2 lg:col-span-2">
            {ATENDIMENTO.map((pilar) => (
              <Ponto key={pilar.titulo} titulo={pilar.titulo}>
                {pilar.texto}
              </Ponto>
            ))}
          </ul>

          <div data-item>
            <h3 className="text-corpo font-semibold">Também atendemos</h3>
            <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3.5 sm:grid-cols-3 lg:grid-cols-1">
              {OUTRAS_AREAS.map((area) => (
                <li key={area} className="flex items-baseline gap-3 text-corpo">
                  <MarcaCoroa className="text-tinta" />
                  {area}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* No celular o convite do topo fica duas telas atrás: repete-se no
            fim da leitura. */}
        <div data-entra className="mt-12 lg:hidden">
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            data-ima
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
