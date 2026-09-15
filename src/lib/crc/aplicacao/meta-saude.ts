/**
 * A saúde da integração com a Meta — §31, §39, §61, §74.
 *
 * ============================================================================
 *  O §39 TERMINA COM UMA ORDEM: "não mostrar 'Tudo certo' apenas porque env
 *  vars existem". E o §74 repete em outras palavras: proibido a UI dizer
 *  "Conectado" quando só existe variável de ambiente.
 *
 *  Os dois atacam a MESMA mentira, e ela é a mentira padrão de toda tela de
 *  integração: "configurado" lido como "funcionando". Quem abre esta tela abriu
 *  justamente porque desconfia que não está funcionando — e uma tela que
 *  responde com o que ela mesma tem cadastrado não responde nada.
 *
 *  TUDO AQUI SAI DE FATO DATADO:
 *
 *    último webhook       `crc_canais_meta.ultimo_webhook_em`
 *    última mensagem      `crc_canais_meta.ultima_mensagem_em`
 *    último lead          `crc_canais_meta.ultimo_lead_em`
 *    último erro          `crc_canais_meta.ultimo_erro_em`
 *    falhas recentes      `crc_integration_logs`
 *    fila e dead letter   `crc_webhook_inbox`, `crc_dead_letters`
 *    eventos ignorados    `crc_social_events` com status IGNORADO
 * ============================================================================
 *
 * ============================================================================
 *  E OS ESTADOS SÃO OS HONESTOS DO §74, com um a mais que o §31 pede:
 *
 *    NAO_CONFIGURADO   ninguém cadastrou conta nenhuma.
 *    ATENCAO           cadastrado, e algo está velho ou expirando.
 *    ERRO              a última tentativa falhou.
 *    CONECTADO         cadastrado, e houve fato recente.
 *
 *  `CONECTADO` exige FATO RECENTE — e é por isso que uma conta recém-conectada
 *  aparece como `ATENCAO` com a frase "conectada, e nenhum evento chegou
 *  ainda". Não é pessimismo: é a diferença entre "configurei" e "funciona", e
 *  ela existe porque a causa mais comum de silêncio é a subscrição do webhook
 *  ter ficado sem o campo certo — o que não dá erro nenhum.
 * ============================================================================
 */
import { appDoAmbiente } from "../integracoes/meta/config";
import { contar, selecionar, type Filtro } from "../servidor/banco";

import { PROVEDOR_META } from "./meta";

export type EstadoDaMeta = "CONECTADO" | "ATENCAO" | "ERRO" | "NAO_CONFIGURADO";

export type SinalDaMeta = {
  chave: string;
  rotulo: string;
  /** O valor lido, já em linguagem humana. Nunca só um número solto. */
  valor: string;
  /** `true` quando este sinal é o que está puxando o estado para baixo. */
  alerta: boolean;
};

export type SaudeDaMeta = {
  estado: EstadoDaMeta;
  /** A frase que explica o estado. Nunca só o nome dele. */
  detalhe: string;
  sinais: SinalDaMeta[];
  /** `true` quando alguma conta precisa que uma PESSOA reconecte. */
  exigeReconexao: boolean;
};

/** Sem webhook por mais tempo que isto, a integração vira ATENCAO. */
export const HORAS_SEM_WEBHOOK = 48;

/** Token vencendo em menos dias que isto já é alerta. */
export const DIAS_PARA_ALERTAR_TOKEN = 14;

function horasDesde(iso: string | null, agora: Date): number | null {
  if (iso === null) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (agora.getTime() - t) / 3_600_000;
}

function idade(iso: string | null, agora: Date): string {
  const h = horasDesde(iso, agora);
  if (h === null) return "nunca";
  if (h < 1) return `há ${String(Math.max(1, Math.round(h * 60)))} min`;
  if (h < 48) return `há ${String(Math.round(h))} h`;
  return `há ${String(Math.round(h / 24))} dias`;
}

/* -------------------------------------------------------------------------- */

export async function lerSaudeDaMeta(
  organizationId: string,
  clinicIds: readonly string[] | null,
  agora: Date = new Date(),
): Promise<SaudeDaMeta> {
  const escopo: Filtro[] = [{ coluna: "organization_id", op: "eq", valor: organizationId }];
  const doCanal: Filtro[] = [...escopo];
  if (clinicIds !== null) {
    if (clinicIds.length === 0) {
      return {
        estado: "NAO_CONFIGURADO",
        detalhe: "Seu acesso não inclui nenhuma unidade.",
        sinais: [],
        exigeReconexao: false,
      };
    }
    doCanal.push({ coluna: "clinic_id", op: "in", valor: [...clinicIds] });
  }

  const desde24h = new Date(agora.getTime() - 24 * 3_600_000).toISOString();

  const [canais, pendentes, falhados, deadLetters, ignorados, erros24h] = await Promise.all([
    selecionar<{
      ativo: boolean | null;
      produtos: unknown;
      token_expira_em: string | null;
      ultimo_webhook_em: string | null;
      ultima_mensagem_em: string | null;
      ultimo_lead_em: string | null;
      ultimo_erro: string | null;
      ultimo_erro_em: string | null;
    }>("crc_canais_meta", {
      colunas:
        "ativo,produtos,token_expira_em,ultimo_webhook_em,ultima_mensagem_em,ultimo_lead_em,ultimo_erro,ultimo_erro_em",
      filtros: [...doCanal, { coluna: "ativo", op: "eq", valor: true }],
      limite: 50,
    }),
    contar("crc_webhook_inbox", [
      ...escopo,
      { coluna: "provedor", op: "eq", valor: PROVEDOR_META },
      { coluna: "status", op: "eq", valor: "PENDENTE" },
    ]),
    contar("crc_webhook_inbox", [
      ...escopo,
      { coluna: "provedor", op: "eq", valor: PROVEDOR_META },
      { coluna: "status", op: "eq", valor: "FALHOU" },
    ]),
    contar("crc_dead_letters", [
      ...escopo,
      { coluna: "origem", op: "eq", valor: "webhook" },
      { coluna: "status", op: "eq", valor: "PENDENTE" },
    ]),
    /*
     * OS EVENTOS IGNORADOS SÃO SINAL, E NÃO ESTATÍSTICA — §61.
     *
     * Um comentário que nenhuma regra casa é `IGNORADO`, e é o comportamento
     * certo. Mas um NÚMERO ALTO de ignorados num dia em que a clínica publicou
     * campanha significa que a regra não está casando — e sem este sinal
     * ninguém descobre: não há erro, não há falha, só silêncio.
     */
    contar("crc_social_events", [
      ...escopo,
      { coluna: "processing_status", op: "eq", valor: "IGNORADO" },
      { coluna: "recebido_em", op: "gte", valor: desde24h },
    ]),
    selecionar<{ integracao: string }>("crc_integration_logs", {
      colunas: "integracao",
      filtros: [
        ...escopo,
        { coluna: "sucesso", op: "eq", valor: false },
        { coluna: "criado_em", op: "gte", valor: desde24h },
      ],
      limite: 500,
    }),
  ]);

  /*
   * O APLICATIVO DO AMBIENTE, e o que falta dele.
   *
   * Lido aqui e não dentro do ladder: o valor entra num sinal medido, e um
   * sinal que só existe quando está errado não aparece na tela quando está
   * certo — e aí ninguém sabe que ele é conferido.
   */
  const app = appDoAmbiente();

  if (canais.length === 0) {
    return {
      estado: "NAO_CONFIGURADO",
      detalhe:
        "Nenhuma conta da Meta está cadastrada. Instagram, Messenger, comentários e Lead Ads não entram no CRC.",
      sinais: [],
      exigeReconexao: false,
    };
  }

  /*
   * O PIOR CANAL DECIDE O ESTADO DO CARTÃO, e não a média.
   *
   * Duas contas em que uma funciona e a outra tem token morto não é "metade
   * funcionando": é uma clínica sem Instagram. A média esconderia exatamente o
   * caso em que alguém precisa agir.
   */
  const maisRecente = (ler: (c: (typeof canais)[number]) => string | null): string | null => {
    let melhor: string | null = null;
    for (const c of canais) {
      const v = ler(c);
      if (v !== null && (melhor === null || v > melhor)) melhor = v;
    }
    return melhor;
  };

  const ultimoWebhook = maisRecente((c) => c.ultimo_webhook_em);
  const ultimaMensagem = maisRecente((c) => c.ultima_mensagem_em);
  const ultimoLead = maisRecente((c) => c.ultimo_lead_em);
  const ultimoErroEm = maisRecente((c) => c.ultimo_erro_em);
  const ultimoErro = canais.find((c) => c.ultimo_erro_em === ultimoErroEm)?.ultimo_erro ?? null;

  const errosDaMeta = erros24h.filter((e) => e.integracao.startsWith("meta_")).length;

  /*
   * O TOKEN QUE VENCE É O ALERTA QUE MAIS SALVA — §31, §39.
   *
   * Um Page Access Token de usuário vence em 60 dias, e quando vence a
   * integração para INTEIRA e em silêncio: a Meta responde (#190) a cada
   * chamada, o webhook continua chegando e nada mais é enviado.
   *
   * `null` significa "não sabemos", e a tela diz isso — não "válido".
   */
  const expiracoes = canais
    .map((c) => c.token_expira_em)
    .filter((v): v is string => v !== null)
    .sort();
  const primeiraExpiracao = expiracoes[0] ?? null;
  const diasParaVencer =
    primeiraExpiracao === null
      ? null
      : Math.floor((Date.parse(primeiraExpiracao) - agora.getTime()) / 86_400_000);

  const semWebhook = horasDesde(ultimoWebhook, agora);
  const nuncaRecebeu = ultimoWebhook === null;
  const webhookVelho = semWebhook !== null && semWebhook > HORAS_SEM_WEBHOOK;
  const tokenExpirando = diasParaVencer !== null && diasParaVencer <= DIAS_PARA_ALERTAR_TOKEN;
  const tokenVencido = diasParaVencer !== null && diasParaVencer < 0;

  const erroMaisNovoQueOSucesso =
    ultimoErroEm !== null && (ultimoWebhook === null || ultimoErroEm > ultimoWebhook);

  const sinais: SinalDaMeta[] = [
    {
      chave: "ultimo_webhook",
      rotulo: "Último webhook",
      valor: idade(ultimoWebhook, agora),
      alerta: nuncaRecebeu || webhookVelho,
    },
    {
      chave: "ultima_mensagem",
      rotulo: "Última mensagem recebida",
      valor: idade(ultimaMensagem, agora),
      alerta: false,
    },
    {
      chave: "ultimo_lead",
      rotulo: "Último lead de anúncio",
      valor: idade(ultimoLead, agora),
      alerta: false,
    },
    {
      chave: "token",
      rotulo: "Validade do token",
      valor:
        diasParaVencer === null
          ? "a Meta não informou (é o caso de token de System User, que não vence)"
          : diasParaVencer < 0
            ? "VENCIDO"
            : `${String(diasParaVencer)} dias`,
      alerta: tokenExpirando,
    },
    {
      chave: "fila",
      rotulo: "Webhooks na fila",
      valor: `${String(pendentes)} pendente(s), ${String(falhados)} com falha`,
      alerta: falhados > 0,
    },
    {
      chave: "dlq",
      rotulo: "Dead letter",
      valor: `${String(deadLetters)} evento(s) que esgotaram as tentativas`,
      alerta: deadLetters > 0,
    },
    {
      chave: "erros",
      rotulo: "Falhas de chamada nas últimas 24h",
      valor: String(errosDaMeta),
      alerta: errosDaMeta >= 3,
    },
    {
      chave: "ignorados",
      rotulo: "Eventos sociais sem regra nas últimas 24h",
      valor: String(ignorados),
      // NÃO É ALERTA POR SI: comentário sem regra é o caso comum. Ver o
      // comentário na consulta.
      alerta: false,
    },
    {
      chave: "configuracao",
      rotulo: "Variáveis do aplicativo",
      valor: app.ok ? "as três estão definidas" : `faltando: ${app.faltando.join(", ")}`,
      alerta: !app.ok,
    },
  ];

  /*
   * ==========================================================================
   *  A VARIÁVEL AUSENTE VEM ANTES DE TODO O RESTO, e a ordem é o ponto.
   *
   *  Sem `META_APP_SECRET`, a assinatura não pode ser conferida e o webhook é
   *  recusado com 503 — a Meta reentrega, o CRC recusa de novo, e NADA disso
   *  aparece como erro de token, de fila ou de chamada. Os outros sinais ficam
   *  todos verdes enquanto nenhuma mensagem entra.
   *
   *  Colocar esta checagem depois faria o cartão apontar para "nenhum webhook
   *  chegou ainda" — que é verdade, e é a conclusão errada: manda conferir a
   *  subscrição do app em vez da variável que falta.
   * ==========================================================================
   */
  if (!app.ok) {
    return {
      estado: "ERRO",
      detalhe: `O aplicativo da Meta está sem ${app.faltando.join(" e ")} no servidor. Enquanto faltar, TODO webhook é recusado — a Meta reentrega e o CRC recusa de novo, sem nada entrar.`,
      sinais,
      // Não é reconectar: é definir variável de ambiente e reimplantar.
      exigeReconexao: false,
    };
  }

  if (tokenVencido || erroMaisNovoQueOSucesso) {
    return {
      estado: "ERRO",
      detalhe: tokenVencido
        ? "O token de uma das contas venceu. Nada é enviado até alguém reconectar."
        : `A última tentativa falhou: ${ultimoErro ?? "sem detalhe registrado"}.`,
      sinais,
      exigeReconexao: tokenVencido,
    };
  }

  if (nuncaRecebeu) {
    return {
      estado: "ATENCAO",
      detalhe:
        "A conta está cadastrada e NENHUM webhook chegou ainda. Confira as subscrições do app: o campo certo por produto está em `CAMPOS_DE_WEBHOOK`, e uma subscrição sem o campo não dá erro — ela só nunca entrega.",
      sinais,
      exigeReconexao: false,
    };
  }

  if (webhookVelho) {
    return {
      estado: "ATENCAO",
      detalhe: `Nenhum webhook nas últimas ${String(Math.round(semWebhook ?? 0))} horas. Pode ter parado sem ninguém perceber.`,
      sinais,
      exigeReconexao: false,
    };
  }

  if (tokenExpirando) {
    return {
      estado: "ATENCAO",
      detalhe: `Está funcionando, e o token vence em ${String(diasParaVencer)} dias. Reconecte antes de vencer — depois de vencido, nada é enviado.`,
      sinais,
      exigeReconexao: false,
    };
  }

  if (deadLetters > 0 || falhados > 0) {
    return {
      estado: "ATENCAO",
      detalhe: `Está recebendo, e há ${String(falhados + deadLetters)} evento(s) que não foram aplicados. Veja a fila em Saúde.`,
      sinais,
      exigeReconexao: false,
    };
  }

  if (errosDaMeta >= 3) {
    return {
      estado: "ATENCAO",
      detalhe: `Está respondendo, mas houve ${String(errosDaMeta)} falhas de chamada nas últimas 24h.`,
      sinais,
      exigeReconexao: false,
    };
  }

  return {
    estado: "CONECTADO",
    detalhe: `Último webhook ${idade(ultimoWebhook, agora)}, sem falhas pendentes.`,
    sinais,
    exigeReconexao: false,
  };
}
