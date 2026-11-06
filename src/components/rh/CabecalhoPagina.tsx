/**
 * Cabeçalho único das telas do portal: o h1 sobre o chão (sem cartão em volta),
 * uma frase de apoio em tinta-suave e, à direita, a ação principal da tela.
 *
 * Antes cada aba tinha o seu: Resumo direto no chão, Vagas e Entrevistas dentro
 * de um cartão, Configurações com um subtítulo verde. Quem troca de aba o dia
 * inteiro lê isso como "três lugares diferentes"; um padrão só diz "o mesmo
 * lugar, outro assunto".
 */
import type { ReactNode } from "react";

import "./painel.css";

export function CabecalhoPagina({
  id,
  titulo,
  texto,
  acao,
}: {
  /** Id do h1, para a seção da aba apontar `aria-labelledby` para ele. */
  id?: string;
  titulo: string;
  texto?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <header className="rh-titulo">
      <div className="min-w-0">
        <h1 id={id}>{titulo}</h1>
        {texto ? <p>{texto}</p> : null}
      </div>
      {acao}
    </header>
  );
}
