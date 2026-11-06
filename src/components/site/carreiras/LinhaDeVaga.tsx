import { ArrowUpRight } from "lucide-react";

import { MarcaCoroa } from "@/components/site/sistema/Coroa";
import { formatarData, tempoRelativo } from "@/lib/rh/formatar";
import { MODELOS_TRABALHO, VINCULOS } from "@/lib/rh/opcoes";
import type { Vaga } from "@/lib/rh/tipos";
import { faixaSalarial, rotuloArea } from "@/lib/rh/vagas";
import "./carreiras.css";

/**
 * Uma vaga no cardápio de /carreiras e na lista de "outras vagas".
 *
 * A linha inteira é clicável por `.stretch-link`, um pseudo-elemento do link do
 * título que cobre o `<li>` (por isso o `relative` no CSS). Assim a área de
 * toque é grande e, para o teclado e para o leitor de tela, continua existindo
 * UM link só, com o nome da vaga — nada dentro da linha pode virar segundo
 * link ou botão, ficaria por baixo da camada de clique.
 *
 * `agora` vem de cima, congelado no loader: com `new Date()` aqui, servidor e
 * navegador escreveriam "há 2 dias" e "ontem" e a hidratação quebraria.
 */
export function LinhaDeVaga({ vaga, agora }: { vaga: Vaga; agora: Date }) {
  const area = rotuloArea(vaga);
  const vinculo = VINCULOS.find((v) => v.valor === vaga.vinculo)?.rotulo ?? "";
  const modelo = MODELOS_TRABALHO.find((m) => m.valor === vaga.modelo)?.rotulo ?? "";
  const salario = faixaSalarial(vaga);
  const jornada = vaga.jornada.trim();
  const local = vaga.local.trim();
  const publicada = tempoRelativo(vaga.publicadoEm, agora);
  const prazo = formatarData(vaga.encerraEm);

  // O que descreve o contrato vai numa linha só, na ordem em que a pessoa
  // decide: o que é, em que regime, onde, quanto. Juntar com " · " num texto
  // único (e não em spans soltos) deixa a linha legível no celular, onde os
  // spans quebravam sem separador nenhum.
  const fatos = [
    area,
    vinculo,
    modelo,
    local,
    salario,
    vaga.quantidade > 1 ? `${vaga.quantidade} posições` : "",
    jornada,
  ]
    .filter((f) => f.length > 0)
    .join(" · ");

  return (
    <li className="car-linha">
      <span className="car-linha-marca" aria-hidden="true">
        <MarcaCoroa />
      </span>

      <div className="car-linha-corpo">
        <h3 className="text-frase">
          <a href={`/carreiras/${vaga.slug}`} className="stretch-link">
            {vaga.titulo}
          </a>
        </h3>
        {vaga.resumo.trim().length > 0 ? <p className="car-linha-resumo">{vaga.resumo}</p> : null}
        <p className="car-linha-meta">
          {vaga.destaque ? (
            <strong className="car-linha-destaque">
              <MarcaCoroa />
              Em destaque
            </strong>
          ) : null}
          <span>{fatos}</span>
        </p>
      </div>

      <div className="car-linha-fim">
        <span>
          {publicada.length > 0 ? `Publicada ${publicada}` : "Vaga aberta"}
          {prazo.length > 0 ? ` · Inscrições até ${prazo}` : ""}
        </span>
        <span className="car-linha-ver" aria-hidden="true">
          Ver vaga
          <ArrowUpRight />
        </span>
      </div>
    </li>
  );
}
