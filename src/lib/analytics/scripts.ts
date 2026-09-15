/**
 * OS SCRIPTS DE MEDIÇÃO QUE VÃO AO `<head>` — montados, nunca digitados.
 *
 * ============================================================================
 *  A ORDEM AQUI É O PRODUTO. Se ela inverter, o consentimento não vale nada.
 *
 *    1. `dataLayer` existe
 *    2. `consent default` = tudo negado
 *    3. a escolha já guardada, se houver, sobe como `consent update`
 *    4. só então o GTM carrega
 *
 *  O Consent Mode só respeita o padrão que já estava no `dataLayer` quando o
 *  container subiu. Carregar o GTM antes do passo 2 significa medir primeiro e
 *  perguntar depois — que é exatamente o que a LGPD não permite e o que um
 *  banner bonito costuma esconder.
 * ============================================================================
 *
 * POR QUE O PASSO 3 LÊ `localStorage` DENTRO DE UM SCRIPT INLINE, e isso não
 * quebra a hidratação: o React compara o *texto* do script, que é idêntico no
 * servidor e no navegador. O que ele faz em tempo de execução é problema do
 * navegador, não da árvore do React. Sem esse passo, quem já aceitou receberia
 * "negado" por alguns segundos a cada carregamento, e o Google trataria a visita
 * como sem consentimento.
 */

/**
 * OS IDs SÃO VALIDADOS ANTES DE ENTRAR NO SCRIPT, e não por preciosismo.
 *
 * O valor vem de variável de ambiente e é INTERPOLADO DENTRO DE UM `<script>`.
 * Um valor com aspas e parêntese fecharia a chamada e executaria o resto — a
 * definição de XSS, com a agravante de o vetor ser o painel da Vercel. Com o
 * formato fixado, o pior que uma variável errada causa é não carregar nada.
 */
const FORMATO_GTM = /^GTM-[A-Z0-9]{4,12}$/u;
const FORMATO_PIXEL = /^[0-9]{10,20}$/u;

/**
 * O nome tem de aparecer por extenso — `import.meta.env.VITE_GTM_ID` —, e não
 * atrás de uma variável: o Vite faz substituição TEXTUAL em tempo de build.
 * `import.meta.env[chave]` não é substituído por nada, e em produção o valor
 * chegaria vazio sem erro nenhum. É o tipo de defeito que só aparece no ar.
 */
function limpo(bruto: string | undefined): string {
  return typeof bruto === "string" ? bruto.trim() : "";
}

export function idDoGTM(): string | null {
  const id = limpo(import.meta.env.VITE_GTM_ID);
  return FORMATO_GTM.test(id) ? id : null;
}

export function idDoPixel(): string | null {
  const id = limpo(import.meta.env.VITE_META_PIXEL_ID);
  return FORMATO_PIXEL.test(id) ? id : null;
}

/**
 * Passos 1 a 3. Vai ao `<head>` SEMPRE, mesmo sem GTM configurado.
 *
 * Sem container, ele só cria um array e guarda a escolha — três linhas inertes.
 * Mas é o que faz o site já estar correto no dia em que alguém colar o ID: não
 * existe uma segunda tarefa de "ligar o consentimento depois".
 */
export const SCRIPT_CONSENTIMENTO = [
  "window.dataLayer=window.dataLayer||[];",
  "function gtag(){dataLayer.push(arguments);}",
  // `wait_for_update` dá 500ms para o passo 3 (ou para o banner) chegar antes
  // de o GTM decidir o que fazer. Sem isso, uma tag rápida dispara negada e a
  // atualização chega tarde demais para ela.
  "gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});",
  "try{var c=localStorage.getItem('jp:consentimento');",
  "if(c==='aceito'){gtag('consent','update',{ad_storage:'granted',analytics_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'});}",
  "}catch(e){}",
].join("");

/** Passo 4. Devolve `null` quando não há ID — e aí nada é pedido à rede. */
export function scriptDoGTM(): string | null {
  const id = idDoGTM();
  if (id === null) return null;

  // O snippet oficial, com `async`: ele não bloqueia a renderização, e é por
  // isso que o LCP do site não muda por existir medição.
  return [
    "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});",
    "var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;",
    "j.src='https://www.googletagmanager.com/gtm.js?id='+i;",
    `f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');`,
  ].join("");
}

/**
 * O Pixel da Meta.
 *
 * `fbq('consent','revoke')` sai ANTES do `init` quando a escolha não é "aceito":
 * o Pixel guarda os eventos e só envia se o consentimento for concedido depois.
 * Sem essa linha, o `PageView` do próprio `init` viajaria antes de qualquer
 * pergunta.
 */
export function scriptDoPixel(): string | null {
  const id = idDoPixel();
  if (id === null) return null;

  return [
    "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?",
    "n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;",
    "n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;",
    "t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}",
    "(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');",
    "try{if(localStorage.getItem('jp:consentimento')!=='aceito'){fbq('consent','revoke');}}catch(e){fbq('consent','revoke');}",
    `fbq('init','${id}');fbq('track','PageView');`,
  ].join("");
}

/**
 * O `<noscript>` do GTM, em `<body>`.
 *
 * Existe por completude do container: sem JavaScript não há evento nosso para
 * medir — nenhum CTA deste site funciona por formulário puro —, então ele
 * registra a visita e nada mais. Como o `iframe` é um recurso do Google, ele
 * fica fora quando não há ID, e some junto com o resto quando o visitante recusa
 * (aí o GTM não dispara tag nenhuma).
 */
export function iframeNoscriptDoGTM(): string | null {
  const id = idDoGTM();
  if (id === null) return null;
  return `https://www.googletagmanager.com/ns.html?id=${id}`;
}
