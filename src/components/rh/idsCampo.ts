/**
 * Ids e descritores dos campos do Portal de RH.
 *
 * Moram fora de `CampoTexto.tsx` porque não são componentes: um módulo que
 * exporta componentes E funções soltas quebra o Fast Refresh do Vite — a cada
 * salvamento o React remonta a árvore inteira em vez de trocar só o componente
 * editado, e o formulário de cinco passos volta ao passo 1 com os campos em
 * branco. Separar é o conserto; silenciar o aviso só empurra o problema.
 *
 * O contrato em si é o de sempre: o `id` do elemento é derivado do NOME do
 * campo (`cpf` -> `rh-campo-cpf`). É ele que deixa o formulário mover o foco
 * para o primeiro campo inválido com um `getElementById`, sem guardar uma ref
 * por campo nem repassar refs por cinco níveis de props.
 */

export function idCampo(campo: string): string {
  return `rh-campo-${campo}`;
}

export function idAjuda(campo: string): string {
  return `rh-ajuda-${campo}`;
}

export function idErro(campo: string): string {
  return `rh-erro-${campo}`;
}

export function idRotulo(campo: string): string {
  return `rh-rotulo-${campo}`;
}

/**
 * Monta o `aria-describedby` só com o que existe de fato na tela. Apontar para
 * um id inexistente não é inofensivo: parte dos leitores de tela simplesmente
 * ignora o atributo inteiro, e aí nem a ajuda nem o erro são anunciados.
 */
export function descritores(campo: string, ajuda: string, erro: string): string | undefined {
  const ids: string[] = [];
  if (ajuda.length > 0) ids.push(idAjuda(campo));
  if (erro.length > 0) ids.push(idErro(campo));
  return ids.length > 0 ? ids.join(" ") : undefined;
}
