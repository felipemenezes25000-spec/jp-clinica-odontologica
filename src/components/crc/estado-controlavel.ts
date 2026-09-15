/**
 * Estado que pode morar na URL — ou não.
 *
 * ============================================================================
 *  O PROBLEMA QUE ISTO RESOLVE.
 *
 *  A janela da agenda, o termo da busca, a aba da ficha do paciente e os
 *  filtros do funil precisam estar no endereço: sem isso, recarregar a página
 *  perde o que a pessoa escolheu, e não existe link para mandar a um colega
 *  dizendo "olha esta busca".
 *
 *  A solução óbvia — o componente chamar `useSearch()` do router direto —
 *  quebraria a vitrine (`/crc-vitrine`), que monta as mesmas telas FORA de
 *  qualquer rota do CRC para revisar aparência. Um componente que exige router
 *  é um componente que não pode ser visto isolado.
 *
 *  Então: o componente aceita o valor por prop, e cai no estado interno quando
 *  ninguém o controla. É o mesmo contrato de um `<input>` do React — e vale
 *  pelo mesmo motivo: quem sabe onde o valor deve morar é quem renderiza.
 * ============================================================================
 */
import { useCallback, useState } from "react";

/**
 * Devolve `[valor, trocar]`, controlado por fora quando há prop, interno quando
 * não há.
 *
 * `useState` é chamado SEMPRE, controlado ou não — as regras de hook não
 * admitem um `useState` condicional, e o custo de um estado que ninguém lê é
 * zero.
 */
export function useControlavel<T>(
  valorExterno: T | undefined,
  aoMudarExterno: ((valor: T) => void) | undefined,
  padrao: T,
): [T, (valor: T) => void] {
  const [interno, setInterno] = useState<T>(padrao);

  const trocar = useCallback(
    (valor: T): void => {
      if (aoMudarExterno !== undefined) aoMudarExterno(valor);
      /*
       * TROCA O INTERNO TAMBÉM, mesmo controlado.
       *
       * Parece redundante, e não é: enquanto a navegação não conclui, o valor
       * externo ainda é o antigo. Sem esta linha, clicar em "30 dias" deixaria
       * o botão marcando "14" por um quadro — o tipo de piscada que faz a
       * pessoa clicar de novo.
       */
      setInterno(valor);
    },
    [aoMudarExterno],
  );

  return [valorExterno ?? interno, trocar];
}
