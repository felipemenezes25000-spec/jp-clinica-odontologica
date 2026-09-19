/**
 * CONSENTIMENTO — o estado, e o Google Consent Mode.
 *
 * ============================================================================
 *  O QUE ESTA CAMADA NÃO FAZ, E É DELIBERADO.
 *
 *  Ela não bloqueia nada do site. O WhatsApp, o telefone, o mapa e o formulário
 *  funcionam igual antes, durante e depois da escolha. O que o consentimento
 *  liga e desliga é MEDIÇÃO — e medição não pode ser condição para um paciente
 *  conseguir falar com a clínica.
 *
 *  É também o que mantém o banner pequeno: ele não precisa travar a tela, nem
 *  ter "gerenciar preferências" com sete categorias, porque não há nada aqui
 *  além de analytics e publicidade. Um modal gigante numa clínica de saúde é
 *  atrito na hora errada.
 * ============================================================================
 *
 * O CONSENT MODE v2 É O MECANISMO, e ele tem uma ordem que não pode inverter:
 * os padrões (`default`) precisam estar no `dataLayer` ANTES de o GTM carregar.
 * Por isso eles saem num script inline no `<head>` — ver `scripts.ts` — e não
 * daqui. Este arquivo cuida do que vem depois: ler a escolha guardada e
 * publicar a atualização quando ela muda.
 */

export type EstadoConsentimento = "aceito" | "recusado" | "pendente";

const CHAVE = "jp:consentimento";

/**
 * LOCALSTORAGE, e aqui a escolha é o oposto da atribuição.
 *
 * Atribuição é desta visita e mora em `sessionStorage`. Consentimento é uma
 * decisão da pessoa: perguntar de novo a cada aba seria transformar uma escolha
 * em insistência, que é exatamente o que a LGPD não quer.
 */
export function lerConsentimento(): EstadoConsentimento {
  if (typeof window === "undefined") return "pendente";
  try {
    const valor = localStorage.getItem(CHAVE);
    return valor === "aceito" || valor === "recusado" ? valor : "pendente";
  } catch {
    // Modo privado pode bloquear. Sem poder guardar a escolha, o padrão negado
    // continua valendo — que é o lado seguro do erro.
    return "pendente";
  }
}

/** Os quatro sinais do Consent Mode v2, nos dois estados possíveis. */
function sinais(concedido: boolean): Record<string, "granted" | "denied"> {
  const v = concedido ? "granted" : "denied";
  return {
    analytics_storage: v,
    ad_storage: v,
    ad_user_data: v,
    ad_personalization: v,
  };
}

/**
 * O MESMO SHIM DO `<head>` — e o formato é o que importa nele.
 *
 * O Google só lê como comando o que chega ao `dataLayer` como o objeto
 * `arguments` de uma função, que é o que `function gtag(){dataLayer.push(arguments);}`
 * produz. Um Array com o mesmo conteúdo entra no `dataLayer` sem erro nenhum e
 * é IGNORADO. Era o que acontecia aqui: medido em 18/09/2026 com o gtag.js
 * oficial, depois do "Aceitar" empurrado como Array o `generate_lead` seguia
 * saindo negado (gcs=G100); pelo `gtag()`, concedido (G111). Como o lead
 * costuma acontecer na mesma página do aceite, o defeito atingia justamente a
 * conversão. `consentimento.test.ts` fixa o formato.
 */
function gtag(..._comando: unknown[]): void {
  // eslint-disable-next-line prefer-rest-params -- o Google exige o objeto `arguments`; um Array é ignorado (ver acima)
  (window.dataLayer ??= []).push(arguments);
}

/**
 * Publica a escolha para o Google e para a Meta.
 *
 * Não há `gtag.js` carregado diretamente — quem carrega é o GTM —, e o `gtag`
 * acima só empurra o comando para o `dataLayer`. É isso que mantém a promessa
 * de não espalhar `gtag()` pelos componentes.
 */
function publicar(estado: Exclude<EstadoConsentimento, "pendente">): void {
  try {
    if (typeof window === "undefined") return;
    const concedido = estado === "aceito";

    window.dataLayer ??= [];
    gtag("consent", "update", sinais(concedido));
    // E um evento nomeado, porque é por ele que se aciona tag no GTM. Vem
    // DEPOIS do comando: a tag que ele aciona já encontra o consentimento novo.
    window.dataLayer.push({ event: "jp_consentimento", jp_consentimento: estado });

    // A Meta tem o próprio interruptor. `revoke` para de enviar sem precisar
    // remover o Pixel da página — e `grant` religa.
    if (typeof window.fbq === "function") {
      window.fbq("consent", concedido ? "grant" : "revoke");
    }
  } catch {
    /* medição nunca derruba a página */
  }
}

/** Grava a escolha e publica. É o que os dois botões do banner chamam. */
export function definirConsentimento(estado: Exclude<EstadoConsentimento, "pendente">): void {
  try {
    localStorage.setItem(CHAVE, estado);
  } catch {
    /* sem poder guardar, a escolha vale só para esta página */
  }
  publicar(estado);
}

/**
 * Reaplica no carregamento a escolha já feita.
 *
 * Necessário porque o `default` do `<head>` é sempre negado — ele não pode ler
 * `localStorage`, já que roda antes de tudo e precisa ser idêntico no HTML
 * servido para não quebrar a hidratação. Quem já aceitou receberia medição
 * desligada até clicar de novo; esta função religa assim que o React monta.
 */
export function reaplicarConsentimento(): EstadoConsentimento {
  const estado = lerConsentimento();
  if (estado !== "pendente") publicar(estado);
  return estado;
}

/** Apaga a escolha, para a pessoa poder decidir de novo. Ligado ao link do
 *  rodapé e à política de privacidade. */
export function limparConsentimento(): void {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* idem */
  }
}
