/**
 * Integration Hub — §54.
 *
 * ============================================================================
 *  O ESTADO É MEDIDO, E NUNCA DECLARADO.
 *
 *  Uma tela de integrações que mostra "conectado" porque alguém salvou uma
 *  credencial é pior do que não ter tela: ela afirma que está funcionando
 *  justamente quando a pessoa foi conferir por desconfiar que não estava.
 *
 *  Por isso os quatro estados do §54 saem de fatos datados:
 *
 *    MISSING    não há credencial. Ninguém configurou.
 *    ERROR      há credencial e a última tentativa FALHOU.
 *    DEGRADED   há credencial, funcionou, mas faz tempo demais — ou está
 *               funcionando com erros intermitentes.
 *    CONNECTED  há credencial e houve sucesso recente.
 *
 *  DEGRADED é o estado que justifica a tela existir. MISSING e CONNECTED
 *  qualquer um adivinha; "está configurado, respondeu semana passada e não
 *  responde desde ontem" é o que ninguém percebe até o paciente reclamar.
 * ============================================================================
 */
import { contar, selecionar, type Filtro } from "../servidor/banco";

export type EstadoDaIntegracao = "CONNECTED" | "DEGRADED" | "MISSING" | "ERROR";

export type Integracao = {
  chave: string;
  rotulo: string;
  /** O que quebra na clínica quando esta integração não funciona. */
  seFaltar: string;
  estado: EstadoDaIntegracao;
  /** A frase que explica o estado. Nunca só o nome do estado. */
  detalhe: string;
  /** `true` quando não há provedor no mercado ligado ainda (item 131). */
  bloqueadoExterno: boolean;
};

/** Sucesso mais velho que isto vira DEGRADED, mesmo sem erro nenhum. */
export const HORAS_ATE_DEGRADAR = 48;

function horasDesde(iso: string | null, agora: Date): number | null {
  if (iso === null) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (agora.getTime() - t) / 3_600_000;
}

/**
 * Decide o estado a partir dos fatos, e monta a frase junto.
 *
 * O estado e o detalhe saem da MESMA função de propósito: eles precisam
 * concordar sempre. Calculados em lugares diferentes, um diria CONNECTED
 * enquanto o outro explicaria um erro.
 */
function avaliar(p: {
  temCredencial: boolean;
  ultimoSucessoEm: string | null;
  ultimoErroEm: string | null;
  errosRecentes: number;
  agora: Date;
}): { estado: EstadoDaIntegracao; detalhe: string } {
  if (!p.temCredencial) {
    return { estado: "MISSING", detalhe: "Nunca foi configurada." };
  }

  const desdeSucesso = horasDesde(p.ultimoSucessoEm, p.agora);
  const desdeErro = horasDesde(p.ultimoErroEm, p.agora);

  /*
   * O ERRO SÓ MANDA SE FOR MAIS RECENTE QUE O SUCESSO.
   *
   * Um erro de terça com um sucesso de quarta significa que voltou. Tratar
   * qualquer erro no histórico como ERROR deixaria a tela permanentemente
   * vermelha para toda integração que já falhou uma vez — e uma tela sempre
   * vermelha é uma tela que ninguém olha.
   */
  if (desdeErro !== null && (desdeSucesso === null || desdeErro < desdeSucesso)) {
    return {
      estado: "ERROR",
      detalhe:
        desdeSucesso === null
          ? "Configurada, mas nunca funcionou. A última tentativa falhou."
          : `A última tentativa falhou, há ${String(Math.round(desdeErro))}h.`,
    };
  }

  if (desdeSucesso === null) {
    return { estado: "MISSING", detalhe: "Configurada, mas ainda não foi usada nenhuma vez." };
  }

  if (desdeSucesso > HORAS_ATE_DEGRADAR) {
    return {
      estado: "DEGRADED",
      detalhe: `Funcionou pela última vez há ${String(Math.round(desdeSucesso / 24))} dia(s). Pode ter parado sem ninguém perceber.`,
    };
  }

  /*
   * FUNCIONANDO COM ERROS INTERMITENTES TAMBÉM É DEGRADED.
   *
   * Uma integração que erra metade das vezes e acerta a outra metade aparece
   * como CONNECTED se só o último resultado contar — e ela está perdendo
   * metade das mensagens.
   */
  if (p.errosRecentes >= 3) {
    return {
      estado: "DEGRADED",
      detalhe: `Está respondendo, mas houve ${String(p.errosRecentes)} falhas nas últimas 24h.`,
    };
  }

  return {
    estado: "CONNECTED",
    detalhe: `Última resposta há ${String(Math.round(desdeSucesso))}h.`,
  };
}

/* -------------------------------------------------------------------------- */

export async function lerHub(
  organizationId: string,
  clinicIds: readonly string[] | null,
  agora: Date = new Date(),
): Promise<Integracao[]> {
  const escopo: Filtro[] = [{ coluna: "organization_id", op: "eq", valor: organizationId }];

  const desde24h = new Date(agora.getTime() - 24 * 3_600_000).toISOString();

  const [integracoes, canais, logs, errosRecentes] = await Promise.all([
    selecionar<{ sistema: string; ativo: boolean | null }>("crc_integracoes_clinica", {
      colunas: "sistema,ativo",
      filtros: [...escopo, { coluna: "ativo", op: "eq", valor: true }],
      limite: 50,
    }),
    contar("crc_canais_whatsapp", [...escopo, { coluna: "ativo", op: "eq", valor: true }]),
    /*
     * O HISTÓRICO VEM DE `crc_integration_logs`, que já registra cada chamada.
     *
     * É o que permite medir em vez de declarar: a tela não pergunta "está
     * configurado?" — ela pergunta "quando foi a última vez que funcionou?".
     */
    selecionar<{ integracao: string; sucesso: boolean | null; criado_em: string }>(
      "crc_integration_logs",
      {
        colunas: "integracao,sucesso,criado_em",
        filtros: escopo,
        ordenar: [{ coluna: "criado_em", ascendente: false }],
        limite: 500,
      },
    ),
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

  const sistemas = new Set(integracoes.map((i) => i.sistema));

  const ultimoSucesso = new Map<string, string>();
  const ultimoErro = new Map<string, string>();
  for (const l of logs) {
    const alvo = l.sucesso === true ? ultimoSucesso : ultimoErro;
    if (!alvo.has(l.integracao)) alvo.set(l.integracao, l.criado_em);
  }

  const errosPor = new Map<string, number>();
  for (const e of errosRecentes) {
    errosPor.set(e.integracao, (errosPor.get(e.integracao) ?? 0) + 1);
  }

  const montar = (p: {
    chave: string;
    rotulo: string;
    seFaltar: string;
    temCredencial: boolean;
    bloqueadoExterno?: boolean;
  }): Integracao => {
    /*
     * BLOCKED_EXTERNAL É MISSING COM OUTRA FRASE, e não um quinto estado.
     *
     * O §54 define quatro estados; inventar um quinto quebraria o contrato da
     * tela. O que muda é o texto: "ninguém configurou" convida a configurar;
     * "não há provedor ligado" avisa que não adianta procurar o botão.
     */
    if (p.bloqueadoExterno === true) {
      return {
        chave: p.chave,
        rotulo: p.rotulo,
        seFaltar: p.seFaltar,
        estado: "MISSING",
        detalhe:
          "Sem provedor integrado. A arquitetura está pronta e nenhuma credencial foi contratada.",
        bloqueadoExterno: true,
      };
    }

    const r = avaliar({
      temCredencial: p.temCredencial,
      ultimoSucessoEm: ultimoSucesso.get(p.chave) ?? null,
      ultimoErroEm: ultimoErro.get(p.chave) ?? null,
      errosRecentes: errosPor.get(p.chave) ?? 0,
      agora,
    });

    return {
      chave: p.chave,
      rotulo: p.rotulo,
      seFaltar: p.seFaltar,
      estado: r.estado,
      detalhe: r.detalhe,
      bloqueadoExterno: false,
    };
  };

  void clinicIds;

  return [
    montar({
      chave: "dental_office",
      rotulo: "Dental Office",
      seFaltar:
        "Paciente e agenda param de entrar. Cada um passa a ser digitado à mão, e a agenda do CRC diverge da real no mesmo dia.",
      temCredencial: sistemas.has("dental_office"),
    }),
    montar({
      chave: "whatsapp",
      rotulo: "WhatsApp",
      seFaltar:
        "O CRC vira painel: mostra quem precisa de contato, e alguém copia o telefone na mão.",
      temCredencial: canais > 0,
    }),
    montar({
      chave: "ia",
      rotulo: "IA",
      seFaltar: "Sem redação de mensagem, sem leitura de conversa, sem resumo de ligação.",
      temCredencial: sistemas.has("ia") || sistemas.has("openai"),
    }),
    montar({
      chave: "voz",
      rotulo: "Voz e chamadas",
      seFaltar:
        "A ligação só existe na linha do tempo se alguém anotar depois de desligar. Nada é atendido nem transcrito.",
      temCredencial: false,
      bloqueadoExterno: true,
    }),
    montar({
      chave: "pagamentos",
      rotulo: "Pagamentos",
      seFaltar:
        "Link de pagamento, PIX e cobrança não saem do CRC. A política de parcelamento continua valendo — ela é só texto e regra.",
      temCredencial: false,
      bloqueadoExterno: true,
    }),
    montar({
      chave: "ads",
      rotulo: "Anúncios",
      seFaltar:
        "O custo por lead fica sem origem: o CRC sabe quantos leads entraram, e não quanto custaram.",
      temCredencial: false,
      bloqueadoExterno: true,
    }),
    montar({
      chave: "email",
      rotulo: "E-mail",
      seFaltar: "Some um canal de contato. Quem não usa WhatsApp fica sem alternativa.",
      temCredencial: sistemas.has("email"),
      bloqueadoExterno: !sistemas.has("email"),
    }),
    montar({
      chave: "analytics",
      rotulo: "Analytics",
      seFaltar:
        "Nada quebra na operação. O que se perde é cruzar o funil do CRC com o comportamento no site.",
      temCredencial: sistemas.has("analytics"),
      bloqueadoExterno: !sistemas.has("analytics"),
    }),
  ];
}
