/**
 * O que o shell do CRC empresta para as telas.
 *
 * ============================================================================
 *  POR QUE UM CONTEXTO, E NÃO PROPS.
 *
 *  Enquanto as trinta telas eram um `switch` dentro do shell, passar
 *  `usuario.permissoes` ou `aoAbrirPaciente` era só escrever a prop na linha.
 *  Com rotas de verdade, o shell é o LAYOUT e a tela é a rota FILHA — e uma
 *  rota filha não recebe props de quem a renderiza: ela é montada pelo router.
 *
 *  As alternativas seriam o `context` do próprio TanStack Router (que existe,
 *  mas é resolvido no carregamento da rota e não acompanha uma sessão que
 *  recarrega quando a pessoa troca a foto) ou cada tela buscar a sessão de
 *  novo — uma chamada por navegação, para um dado que o shell já tem em mãos.
 *
 *  Então: contexto de React, provido pelo layout, consumido por quem precisa.
 * ============================================================================
 */
import { createContext, useContext, type ReactNode } from "react";

import type { EstadoSessao } from "@/lib/crc/api";
import type { Permissao } from "@/lib/crc/dominio/rbac";

/** O usuário já autenticado — a variante não-nula de `EstadoSessao`. */
export type UsuarioDoCrc = NonNullable<EstadoSessao["usuario"]>;

export type ValorDoCrc = {
  usuario: UsuarioDoCrc;
  /**
   * Abre a ficha de um paciente a partir de qualquer tela.
   *
   * Continua sendo uma função, e não um `<Link>`, porque quem chama está dentro
   * de uma lista, de um card do funil ou de uma linha da agenda — e o destino
   * depende de estado que só o shell conhece. Por baixo ela navega de verdade:
   * o endereço muda, e a ficha aberta sobrevive a um F5.
   */
  abrirPaciente: (patientId: string) => void;
};

const Contexto = createContext<ValorDoCrc | null>(null);

export function ProvedorDoCrc({
  valor,
  children,
}: {
  valor: ValorDoCrc;
  children: ReactNode;
}): ReactNode {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/**
 * O que o shell emprestou.
 *
 * LANÇA SE NÃO HOUVER PROVEDOR, de propósito. Um valor padrão silencioso faria
 * uma tela montada fora do shell renderizar com usuário vazio e permissão
 * nenhuma — ou seja, ela pareceria funcionar e esconderia tudo. Falhar alto é
 * a única forma de esse engano aparecer em desenvolvimento.
 */
export function useCrc(): ValorDoCrc {
  const valor = useContext(Contexto);
  if (valor === null) {
    throw new Error("useCrc() foi chamado fora do shell do CRC (ProvedorDoCrc).");
  }
  return valor;
}

/** Açúcar para o caso mais comum: "esta pessoa pode fazer X?". */
export function usePermissao(permissao: Permissao): boolean {
  return useCrc().usuario.permissoes.includes(permissao);
}
