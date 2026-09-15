/**
 * A raiz da API do Dental Office, numa forma só.
 *
 * ============================================================================
 *  POR QUE ISTO É UM ARQUIVO, E NÃO DUAS LINHAS REPETIDAS.
 *
 *  O Dental Office entrega, junto do `client_id` e do `secret`, uma URL
 *  exclusiva do cliente — e ela vem COM o `/v1` no fim:
 *
 *      https://SEU.api.app.dentaloffice.com.br/v1
 *
 *  `cliente.ts` sabia disso e removia o sufixo antes de montar o caminho.
 *  `auth.ts` não sabia, e concatenava `/v1/auth/tokens` direto na base — o que
 *  produz `/v1/v1/auth/tokens` e 404.
 *
 *  A autenticação é a PRIMEIRA chamada de qualquer fluxo. Com a base na grafia
 *  em que ela é entregue, a integração inteira morria no primeiro passo, no
 *  primeiro dia, sem chegar a tentar nenhuma outra coisa.
 *
 *  E nenhum teste via: o bloco que conferia `/v1/v1` olhava a "última chamada
 *  de negócio", que EXCLUI `/auth/tokens` por construção, e o teste que olhava
 *  a autenticação conferia método e corpo — nunca a URL.
 *
 *  Duas cópias da mesma regra em dois arquivos é exatamente como uma delas fica
 *  para trás. Agora é uma função, e quem esquecer de chamá-la não monta URL.
 * ============================================================================
 *
 * Aceitar as duas grafias é deliberado: quem cadastrar a variável sem o `/v1`
 * também funciona. Uma integração que só aceita uma forma da URL vira chamado
 * de suporte no dia da ativação.
 */
export function raizDaApi(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/u, "").replace(/\/v1$/u, "");
}
