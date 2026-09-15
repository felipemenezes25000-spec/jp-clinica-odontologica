/**
 * A assinatura do webhook da Meta — §11.
 *
 * ============================================================================
 *  SEM ISTO, QUALQUER PESSOA QUE DESCUBRA A URL É A META.
 *
 *  E o efeito não é abstrato. O webhook alimenta a Inbox, a IA e a automação.
 *  Um POST forjado dizendo "a paciente Ana escreveu: cancele minha consulta de
 *  amanhã" faria o sistema:
 *
 *    · criar a mensagem no histórico dela;
 *    · classificar a intenção;
 *    · e — se a autonomia estiver em 4 — RESPONDER, cancelando.
 *
 *  A URL do webhook não é segredo: ela está na configuração do app da Meta, em
 *  log de proxy, em print de tela de onboarding. A assinatura é o que separa
 *  "chegou na URL" de "veio da Meta".
 * ============================================================================
 *
 * ============================================================================
 *  OS BYTES CRUS, E NÃO O OBJETO — a mesma lição de `meta-cloud.ts`.
 *
 *  A Meta calcula HMAC-SHA256 sobre o corpo EXATO. `JSON.parse` seguido de
 *  `JSON.stringify` muda ordem de chave, espaçamento e escape de unicode — e a
 *  conferência falharia SEMPRE, em 100% dos webhooks legítimos.
 *
 *  O sintoma desse erro é traiçoeiro: parece "a Meta não está mandando nada".
 * ============================================================================
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type PedidoDeWebhook = {
  /** Os bytes exatos, sem parse. */
  corpoCru: string;
  cabecalhos: Headers;
};

/**
 * O cabeçalho que a Meta usa.
 *
 * `x-hub-signature-256` (SHA-256) é o atual. `x-hub-signature` (SHA-1) ainda é
 * enviado por compatibilidade e NÃO é aceito aqui: SHA-1 tem colisões
 * práticas, e aceitar os dois faz a verificação valer o do mais fraco — quem
 * forja escolhe qual mandar.
 */
export const CABECALHO_ASSINATURA = "x-hub-signature-256";

export type ResultadoDaAssinatura =
  | { valida: true }
  | {
      valida: false;
      /**
       * Por que falhou, para o LOG — nunca para a resposta HTTP.
       *
       * ====================================================================
       *  A RESPOSTA AO CLIENTE É SEMPRE A MESMA FRASE.
       *
       *  "Assinatura ausente" e "assinatura não confere" contam coisas
       *  diferentes a quem está sondando: a primeira confirma que a URL é um
       *  webhook da Meta e diz qual cabeçalho mandar. Junte as duas com o
       *  tempo de resposta e você tem um mapa da configuração.
       *
       *  No log a distinção é útil — é a diferença entre "o app secret está
       *  errado" e "alguém está batendo na porta".
       * ====================================================================
       */
      motivo: "sem_cabecalho" | "formato_invalido" | "nao_confere" | "sem_segredo";
    };

/**
 * A assinatura confere?
 *
 * FALHA FECHADO em todos os caminhos, inclusive no de configuração: sem
 * `appSecret` a resposta é `sem_segredo` e o webhook é recusado. A alternativa
 * — aceitar quando não há segredo para conferir — é a porta aberta com uma
 * placa de "temporário".
 */
export function verificarAssinaturaMeta(
  pedido: PedidoDeWebhook,
  appSecret: string,
): ResultadoDaAssinatura {
  if (appSecret.trim().length === 0) return { valida: false, motivo: "sem_segredo" };

  const enviada = pedido.cabecalhos.get(CABECALHO_ASSINATURA) ?? "";
  if (enviada.length === 0) return { valida: false, motivo: "sem_cabecalho" };
  if (!enviada.startsWith("sha256=")) return { valida: false, motivo: "formato_invalido" };

  const esperada =
    "sha256=" + createHmac("sha256", appSecret).update(pedido.corpoCru, "utf8").digest("hex");

  const a = Buffer.from(enviada, "utf8");
  const b = Buffer.from(esperada, "utf8");

  /*
   * O TAMANHO É CONFERIDO ANTES, e `timingSafeEqual` exige isso — ele LANÇA
   * com buffers de tamanhos diferentes.
   *
   * Comparar tamanho não vaza nada útil: o tamanho da assinatura é fixo e
   * público (71 caracteres, sempre). O que vazaria é comparar o CONTEÚDO com
   * `===`, que sai no primeiro byte diferente e conta o comprimento do prefixo
   * correto pelo tempo de resposta.
   */
  if (a.length !== b.length) return { valida: false, motivo: "nao_confere" };
  if (!timingSafeEqual(a, b)) return { valida: false, motivo: "nao_confere" };

  return { valida: true };
}

/* -------------------------------------------------------------------------- */
/* O handshake                                                                */
/* -------------------------------------------------------------------------- */

export type DesafioDeVerificacao =
  { ok: true; resposta: string } | { ok: false; status: 403 | 503; motivo: string };

/**
 * O handshake `GET` que a Meta faz ao salvar a URL do webhook — §11.1.
 *
 * ============================================================================
 *  A COMPARAÇÃO É EM TEMPO CONSTANTE, e a razão é a mesma da assinatura: `===`
 *  sai no primeiro caractere diferente, e a diferença de tempo entre "errou no
 *  primeiro" e "errou no décimo" é medível pela rede.
 *
 *  Não é paranoia teórica neste caso específico: o handshake é o único endpoint
 *  em que um atacante pode testar o token quantas vezes quiser, sem
 *  autenticação, e com resposta imediata. É um oráculo.
 *
 *  É a mesma decisão de `iguaisEmTempoConstante` na rota do WhatsApp e na de
 *  cron do RH.
 * ============================================================================
 *
 * 503 E NÃO 403 QUANDO FALTA CONFIGURAÇÃO: a Meta reenvia em 503, e a falha
 * desaparece assim que alguém define a variável. Um 403 faria ela desistir, e
 * quem estivesse configurando veria "URL inválida" sem saber por quê.
 */
export async function responderDesafio(entrada: {
  modo: string | null;
  token: string;
  desafio: string;
  esperado: string;
}): Promise<DesafioDeVerificacao> {
  if (entrada.esperado.trim().length === 0) {
    return {
      ok: false,
      status: 503,
      motivo:
        "O token de verificação não está configurado para este canal nem no ambiente (META_WEBHOOK_VERIFY_TOKEN).",
    };
  }

  if (entrada.modo !== "subscribe") {
    return { ok: false, status: 403, motivo: "Não autorizado." };
  }

  const { iguaisEmTempoConstante } = await import("../../servidor/comparar");
  if (!(await iguaisEmTempoConstante(entrada.token, entrada.esperado.trim()))) {
    return { ok: false, status: 403, motivo: "Não autorizado." };
  }

  /*
   * O DESAFIO VOLTA COMO TEXTO PURO, sem aspas e sem JSON.
   *
   * A Meta compara byte a byte com o que ela mandou. `JSON.stringify(desafio)`
   * acrescenta aspas e a verificação falha — com a mensagem inútil "The URL
   * couldn't be validated".
   */
  return { ok: true, resposta: entrada.desafio };
}
