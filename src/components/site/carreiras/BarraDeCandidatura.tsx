import { ArrowLeft, Check } from "lucide-react";

import { Logo } from "@/components/site/Logo";
import "./candidatura.css";

export type EtapaDaCandidatura = { rotulo: string; feita: boolean };

/**
 * A barra de cima do formulário: marca, progresso e o caminho de volta.
 *
 * Esta página não usa o `<Header>` do site: ele esconde e reaparece conforme a
 * rolagem e disputaria o topo com esta barra, que precisa ficar sempre à vista.
 * Também são treze elementos focáveis antes do primeiro campo — num fluxo de
 * tarefa isso é obstáculo, não navegação.
 *
 * O PROGRESSO É CONTADO PELO QUE ESTÁ PREENCHIDO, não pelo passo em que a
 * pessoa está: o formulário é uma tela só, em três partes, e cada etapa acende
 * quando a sua parte está completa. Quem usa leitor de tela ouve a mesma coisa
 * pelo `aria-valuetext`; a fileira de etapas é só visual (`aria-hidden`).
 */
export function BarraDeCandidatura({
  etapas,
  enviado,
}: {
  etapas: EtapaDaCandidatura[];
  enviado: boolean;
}) {
  const feitas = etapas.filter((e) => e.feita).length;
  const atual = etapas.findIndex((e) => !e.feita);

  return (
    <div className="cand-barra">
      <div className="quadro cand-barra-linha">
        <a href="/" className="cand-marca" aria-label="Ir para a página inicial">
          <Logo variante="lockup" fundo="claro" altura={28} className="h-7 w-auto" />
        </a>

        {enviado ? null : (
          <div
            className="cand-etapas"
            role="progressbar"
            aria-label="Progresso da candidatura"
            aria-valuemin={0}
            aria-valuemax={etapas.length}
            aria-valuenow={feitas}
            aria-valuetext={`${feitas} de ${etapas.length} partes preenchidas`}
          >
            <ol aria-hidden="true">
              {etapas.map((e, i) => (
                <li
                  key={e.rotulo}
                  data-estado={e.feita ? "feito" : i === atual ? "atual" : "futuro"}
                >
                  <span className="cand-etapa-no">{e.feita ? <Check /> : i + 1}</span>
                  <span className="cand-etapa-rotulo">{e.rotulo}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <a href="/carreiras" className="botao botao-chao cand-voltar">
          <ArrowLeft aria-hidden="true" />
          <span className="cand-voltar-texto">Ver vagas</span>
        </a>
      </div>
    </div>
  );
}
